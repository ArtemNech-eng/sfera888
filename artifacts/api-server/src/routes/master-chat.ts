import { Router } from "express";
import { db, masterMessagesTable, mastersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendTgMessage(chatId: string, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// GET /api/master-chat — list masters who have sent messages, with unread count
router.get("/", requireRole("admin", "master_operator"), async (_req, res) => {
  const messages = await db.select().from(masterMessagesTable).orderBy(desc(masterMessagesTable.createdAt));
  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

  const threadMap = new Map<number, { lastMessage: string; lastAt: Date; unread: number; telegramChatId: string }>();
  for (const msg of messages) {
    if (!threadMap.has(msg.masterId)) {
      threadMap.set(msg.masterId, {
        lastMessage: msg.text,
        lastAt: msg.createdAt,
        unread: 0,
        telegramChatId: msg.telegramChatId,
      });
    }
    if (msg.fromMaster && !msg.isRead) {
      threadMap.get(msg.masterId)!.unread += 1;
    }
  }

  const threads = Array.from(threadMap.entries()).map(([masterId, info]) => {
    const master = masterMap.get(masterId);
    return {
      masterId,
      alias: master?.alias ?? "Неизвестный мастер",
      city: master?.city ?? "",
      telegramId: master?.telegramId ?? null,
      avatarUrl: null,
      lastMessage: info.lastMessage,
      lastAt: info.lastAt,
      unread: info.unread,
    };
  });

  res.json(threads);
});

// GET /api/master-chat/:masterId — conversation messages
router.get("/:masterId", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid masterId" });

  const messages = await db.select().from(masterMessagesTable)
    .where(eq(masterMessagesTable.masterId, masterId))
    .orderBy(masterMessagesTable.createdAt);

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });

  res.json({ master: { id: master.id, alias: master.alias, city: master.city, telegramId: master.telegramId }, messages });
});

// POST /api/master-chat/:masterId/reply — send reply via bot
router.post("/:masterId/reply", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  const { text, operatorName } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });
  if (!master.telegramId) return res.status(400).json({ error: "Master has no Telegram account" });

  const msgText = `💬 <b>Ответ оператора</b>\n\n${text}`;

  await sendTgMessage(master.telegramId, msgText);

  const [saved] = await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: master.telegramId,
    text,
    fromMaster: false,
    senderName: operatorName ?? "Оператор",
    isRead: true,
  }).returning();

  res.json(saved);
});

// PATCH /api/master-chat/:masterId/read — mark all messages as read
router.patch("/:masterId/read", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  await db.update(masterMessagesTable)
    .set({ isRead: true })
    .where(and(eq(masterMessagesTable.masterId, masterId), eq(masterMessagesTable.fromMaster, true)));
  res.json({ success: true });
});

// GET /api/master-chat/unread-count — total unread count (for badge)
router.get("/stats/unread", requireRole("admin", "master_operator"), async (_req, res) => {
  const messages = await db.select().from(masterMessagesTable)
    .where(and(eq(masterMessagesTable.fromMaster, true), eq(masterMessagesTable.isRead, false)));
  res.json({ count: messages.length });
});

export default router;
