import { Router } from "express";
import { db, voronkaColumnsTable, mastersTable, ordersTable, leadsTable, telegramChatsTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();

// GET all columns (all authenticated users)
router.get("/columns", requireAuth, async (_req, res) => {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  res.json(cols);
});

// POST create column
router.post("/columns", requireRole("admin"), async (req, res) => {
  const { name, receivesOrders = false, color = "blue" } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const existing = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  const maxPos = existing.length > 0 ? Math.max(...existing.map(c => c.position)) : 0;

  const result = await db.insert(voronkaColumnsTable).values({
    name, receivesOrders, color, position: maxPos + 1,
  }).returning();
  res.status(201).json(result[0]);
});

// PATCH update column
router.patch("/columns/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, receivesOrders, color, position } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (receivesOrders !== undefined) updates.receivesOrders = receivesOrders;
  if (color !== undefined) updates.color = color;
  if (position !== undefined) updates.position = position;

  const result = await db.update(voronkaColumnsTable).set(updates).where(eq(voronkaColumnsTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Column not found" });
  res.json(result[0]);
});

// POST reorder columns
router.post("/columns/reorder", requireRole("admin"), async (req, res) => {
  const { order } = req.body as { order: number[] };
  if (!Array.isArray(order)) return res.status(400).json({ error: "order array required" });

  for (let i = 0; i < order.length; i++) {
    await db.update(voronkaColumnsTable).set({ position: i + 1 }).where(eq(voronkaColumnsTable.id, order[i]));
  }

  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  res.json(cols);
});

// DELETE column
router.delete("/columns/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  // Move masters in this column to null
  await db.update(mastersTable).set({ voronkaColumnId: null }).where(eq(mastersTable.voronkaColumnId, id));
  await db.delete(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, id));
  res.json({ success: true });
});

// GET all masters for voronka with active orders info
router.get("/masters", requireAuth, async (_req, res) => {
  const masters = await db.select().from(mastersTable).orderBy(mastersTable.createdAt);

  // Get avatar URLs from telegram_chats for masters with telegramId
  const telegramIds = masters.filter(m => m.telegramId).map(m => m.telegramId!);
  const tgChats = telegramIds.length > 0
    ? await db.select({ telegramChatId: telegramChatsTable.telegramChatId, avatarUrl: telegramChatsTable.avatarUrl })
        .from(telegramChatsTable)
        .where(inArray(telegramChatsTable.telegramChatId, telegramIds))
    : [];
  const avatarMap = new Map(tgChats.map(c => [c.telegramChatId, c.avatarUrl ?? null]));

  // Get active orders per master
  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));

  // Get leads for those orders
  const leadIds = [...new Set(activeOrders.map(o => o.leadId))];
  const leads = leadIds.length > 0
    ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds))
    : [];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  const masterActiveOrders = new Map<number, any[]>();
  for (const o of activeOrders) {
    if (!o.masterId) continue;
    const lead = leadMap.get(o.leadId);
    if (!masterActiveOrders.has(o.masterId)) masterActiveOrders.set(o.masterId, []);
    masterActiveOrders.get(o.masterId)!.push({
      orderId: o.id,
      district: o.district,
      city: o.city,
      serviceType: o.serviceType,
      status: o.status,
      clientPhone: lead?.clientPhone ?? null,
      clientName: lead?.clientName ?? null,
      scheduledAt: o.scheduledAt ?? null,
    });
  }

  res.json(masters.map(m => ({
    id: m.id,
    alias: m.alias,
    city: m.city,
    specialization: m.specialization,
    telegramId: m.telegramId ?? null,
    phone: m.phone ?? null,
    status: m.status,
    rating: Number(m.rating),
    totalOrders: m.totalOrders,
    acceptedOrders: m.acceptedOrders,
    debt: Number(m.debt),
    voronkaColumnId: m.voronkaColumnId ?? null,
    isTestMaster: m.isTestMaster,
    specializations: m.specializations ?? [],
    avatarUrl: m.telegramId ? (avatarMap.get(m.telegramId) ?? null) : null,
    activeOrders: masterActiveOrders.get(m.id) ?? [],
    createdAt: m.createdAt,
  })));
});

// PATCH move master to column
router.patch("/masters/:id/column", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { voronkaColumnId } = req.body;

  const result = await db.update(mastersTable)
    .set({ voronkaColumnId: voronkaColumnId ?? null })
    .where(eq(mastersTable.id, id))
    .returning();

  if (!result[0]) return res.status(404).json({ error: "Master not found" });
  res.json({ success: true, master: result[0] });
});

export default router;
