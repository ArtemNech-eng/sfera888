import { Router } from "express";
import { db, chatCasesTable, mastersTable, ordersTable } from "@workspace/db";
import { eq, and, desc, inArray, or, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { sendMaxMessage } from "../maxBot.js";

const router = Router();
const auth = requireRole("admin", "master_operator");

// GET /api/chat-cases — list cases with optional filters
router.get("/", auth, async (req, res) => {
  try {
    const { tab = "active", page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    let conditions: any[] = [];

    if (tab === "active") {
      conditions.push(eq(chatCasesTable.isArchived, false));
    } else if (tab === "critical") {
      conditions.push(eq(chatCasesTable.isArchived, false));
      conditions.push(eq(chatCasesTable.riskLevel, "red"));
    } else if (tab === "watch") {
      conditions.push(eq(chatCasesTable.isArchived, false));
      conditions.push(eq(chatCasesTable.riskLevel, "yellow"));
    } else if (tab === "bypass") {
      conditions.push(eq(chatCasesTable.isArchived, false));
      conditions.push(sql`${chatCasesTable.tags} @> ARRAY['possible_bypass']::text[]`);
    } else if (tab === "ambiguous") {
      conditions.push(eq(chatCasesTable.isArchived, false));
      conditions.push(sql`${chatCasesTable.tags} @> ARRAY['ambiguous_order_link']::text[]`);
    } else if (tab === "archive") {
      conditions.push(eq(chatCasesTable.isArchived, true));
    }

    const cases = await db
      .select()
      .from(chatCasesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(
        sql`CASE ${chatCasesTable.riskLevel} WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END`,
        chatCasesTable.nextActionDeadline,
        desc(chatCasesTable.hoursWithoutContact),
      )
      .limit(limitNum)
      .offset(offset);

    // Enrich with master info
    const masterIds = [...new Set(cases.map(c => c.masterId))];
    const masters = masterIds.length
      ? await db.select({ id: mastersTable.id, alias: mastersTable.alias, phone: mastersTable.phone, maxChatId: mastersTable.maxChatId, telegramId: mastersTable.telegramId })
          .from(mastersTable).where(inArray(mastersTable.id, masterIds))
      : [];
    const masterMap = new Map(masters.map(m => [m.id, m]));

    const enriched = cases.map(c => ({
      ...c,
      master: masterMap.get(c.masterId) ?? null,
    }));

    // Count totals for stats
    const allActive = await db.select({ riskLevel: chatCasesTable.riskLevel, tags: chatCasesTable.tags, expectedCommission: chatCasesTable.expectedCommission })
      .from(chatCasesTable).where(eq(chatCasesTable.isArchived, false));

    const stats = {
      total: allActive.length,
      green: allActive.filter(c => c.riskLevel === "green").length,
      yellow: allActive.filter(c => c.riskLevel === "yellow").length,
      red: allActive.filter(c => c.riskLevel === "red").length,
      bypass: allActive.filter(c => (c.tags as string[]).includes("possible_bypass")).length,
      ambiguous: allActive.filter(c => (c.tags as string[]).includes("ambiguous_order_link")).length,
      frozenMoney: allActive
        .filter(c => c.riskLevel === "yellow" || c.riskLevel === "red")
        .reduce((s, c) => s + (c.expectedCommission ? Number(c.expectedCommission) : 0), 0),
    };

    res.json({ cases: enriched, stats, page: pageNum, limit: limitNum });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/chat-cases/:id — single case
router.get("/:id", auth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const rows = await db.select().from(chatCasesTable).where(eq(chatCasesTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  const master = await db.select({ id: mastersTable.id, alias: mastersTable.alias, phone: mastersTable.phone, maxChatId: mastersTable.maxChatId, telegramId: mastersTable.telegramId })
    .from(mastersTable).where(eq(mastersTable.id, rows[0].masterId)).limit(1);

  res.json({ ...rows[0], master: master[0] ?? null });
});

// PATCH /api/chat-cases/:id — update case (resolve, set reviewed, etc.)
router.patch("/:id", auth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { action } = req.body;
  let update: Record<string, any> = { updatedAt: new Date() };

  if (action === "resolve") {
    // Suppress from red/yellow for 12 hours
    update.isResolved = true;
    update.resolvedUntil = new Date(Date.now() + 12 * 3600000);
  } else if (action === "unresolve") {
    update.isResolved = false;
    update.resolvedUntil = null;
  } else if (action === "review_required") {
    update.riskReason = "Требует пересмотра (отмечено вручную)";
    update.riskLevel = "yellow";
  }

  await db.update(chatCasesTable).set(update).where(eq(chatCasesTable.id, id));
  res.json({ ok: true });
});

// POST /api/chat-cases/:id/message — send message from template to master
router.post("/:id/message", auth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { text } = req.body as { text: string };
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const rows = await db.select().from(chatCasesTable).where(eq(chatCasesTable.id, id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  const master = await db.select({ id: mastersTable.id, alias: mastersTable.alias, maxChatId: mastersTable.maxChatId, telegramId: mastersTable.telegramId })
    .from(mastersTable).where(eq(mastersTable.id, rows[0].masterId)).limit(1);

  const m = master[0];
  if (!m) return res.status(404).json({ error: "Master not found" });

  const chatId = m.maxChatId ?? m.telegramId;
  if (!chatId) return res.status(422).json({ error: "Master has no Max/Telegram chat ID" });

  try {
    await sendMaxMessage(chatId, text);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chat-cases/trigger — manually trigger case recalculation
router.post("/trigger", requireRole("admin"), async (_req, res) => {
  const { processCases } = await import("../lib/casesEngine.js");
  processCases().catch(console.error);
  res.json({ ok: true, message: "Processing started in background" });
});

export default router;
