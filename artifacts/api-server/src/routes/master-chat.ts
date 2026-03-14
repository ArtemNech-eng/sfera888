import { Router } from "express";
import { db, masterMessagesTable, mastersTable, telegramChatsTable, transactionsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import multer from "multer";

const router = Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function sendTgMessage(chatId: string, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function sendTgPhoto(chatId: string, photoBuffer: Buffer, filename: string, caption?: string): Promise<string | null> {
  const form = new FormData();
  form.set("chat_id", chatId);
  const blob = new Blob([photoBuffer], { type: "image/jpeg" });
  form.set("photo", blob, filename);
  if (caption) form.set("caption", caption);

  const resp = await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) return null;

  const data = await resp.json() as any;
  const photos = data?.result?.photo;
  if (!photos?.length) return null;

  // Get the largest photo file_id
  const fileId = photos[photos.length - 1].file_id;
  // Resolve to public URL
  const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const fileData = await fileResp.json() as any;
  const filePath = fileData?.result?.file_path;
  if (!filePath) return null;

  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
}

// GET /api/master-chat — list threads with unread count
router.get("/", requireRole("admin", "master_operator"), async (_req, res) => {
  const messages = await db.select().from(masterMessagesTable).orderBy(desc(masterMessagesTable.createdAt));
  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

  // Lookup avatarUrl from telegram_chats by telegramId
  const telegramIds = masters.filter(m => m.telegramId).map(m => m.telegramId!);
  const tgChats = telegramIds.length > 0
    ? await db.select({ telegramChatId: telegramChatsTable.telegramChatId, avatarUrl: telegramChatsTable.avatarUrl })
        .from(telegramChatsTable)
        .where(inArray(telegramChatsTable.telegramChatId, telegramIds))
    : [];
  const tgAvatarMap = new Map(tgChats.map(c => [c.telegramChatId, c.avatarUrl ?? null]));

  const threadMap = new Map<number, { lastMessage: string; lastAt: Date; unread: number; telegramChatId: string }>();
  for (const msg of messages) {
    if (!threadMap.has(msg.masterId)) {
      threadMap.set(msg.masterId, {
        lastMessage: msg.photoUrl ? "📷 Фото" : msg.text,
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
    const tgAvatar = master?.telegramId ? (tgAvatarMap.get(master.telegramId) ?? null) : null;
    const avatarUrl = tgAvatar ?? master?.customAvatarUrl ?? null;
    return {
      masterId,
      alias: master?.alias ?? "Неизвестный мастер",
      city: master?.city ?? "",
      telegramId: master?.telegramId ?? null,
      avatarUrl,
      lastMessage: info.lastMessage,
      lastAt: info.lastAt,
      unread: info.unread,
    };
  });

  res.json(threads);
});

// GET /api/master-chat/stats/unread — badge count
router.get("/stats/unread", requireRole("admin", "master_operator"), async (_req, res) => {
  const messages = await db.select().from(masterMessagesTable)
    .where(and(eq(masterMessagesTable.fromMaster, true), eq(masterMessagesTable.isRead, false)));
  res.json({ count: messages.length });
});

// GET /api/master-chat/:masterId — full conversation
router.get("/:masterId", requireRole("admin", "master_operator", "lead_operator"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid masterId" });

  const messages = await db.select().from(masterMessagesTable)
    .where(eq(masterMessagesTable.masterId, masterId))
    .orderBy(masterMessagesTable.createdAt);

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });

  // Lookup avatarUrl from telegram_chats, then fall back to custom avatar
  let avatarUrl: string | null = master.customAvatarUrl ?? null;
  if (master.telegramId) {
    const tgRows = await db.select({ avatarUrl: telegramChatsTable.avatarUrl })
      .from(telegramChatsTable)
      .where(eq(telegramChatsTable.telegramChatId, master.telegramId));
    avatarUrl = tgRows[0]?.avatarUrl ?? master.customAvatarUrl ?? null;
  }

  // Include pending transactions so the chat can show the commission payment card
  const pendingTx = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.masterId, masterId), eq(transactionsTable.paymentStatus, "pending")));

  res.json({
    master: { id: master.id, alias: master.alias, city: master.city, telegramId: master.telegramId, avatarUrl },
    messages,
    pendingTransactions: pendingTx.map(t => ({
      id: t.id,
      orderId: t.orderId,
      orderAmount: Number(t.orderAmount),
      commission: Number(t.commission),
      paymentStatus: t.paymentStatus,
      createdAt: t.createdAt,
    })),
  });
});

// POST /api/master-chat/:masterId/reply — send text or photo reply
router.post("/:masterId/reply", requireRole("admin", "master_operator"), upload.single("photo"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  const { text, operatorName } = req.body;
  const photoFile = req.file;

  if (!text && !photoFile) return res.status(400).json({ error: "text or photo required" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });
  if (!master.telegramId) return res.status(400).json({ error: "Master has no Telegram account" });

  const senderLabel = operatorName ?? "Оператор";
  let savedPhotoUrl: string | null = null;

  if (photoFile) {
    const caption = text ? `💬 <b>${senderLabel}:</b> ${text}` : `💬 <b>${senderLabel}</b>`;
    savedPhotoUrl = await sendTgPhoto(master.telegramId, photoFile.buffer, photoFile.originalname, caption);
    if (!savedPhotoUrl) {
      // fallback — send as text at least
      if (text) await sendTgMessage(master.telegramId, `💬 <b>${senderLabel}:</b>\n\n${text}`);
    }
  } else if (text) {
    await sendTgMessage(master.telegramId, `💬 <b>Ответ оператора</b>\n\n${text}`);
  }

  const [saved] = await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: master.telegramId,
    text: text ?? "",
    fromMaster: false,
    senderName: senderLabel,
    isRead: true,
    photoUrl: savedPhotoUrl,
  }).returning();

  res.json(saved);
});

// PATCH /api/master-chat/:masterId/read
router.patch("/:masterId/read", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  await db.update(masterMessagesTable)
    .set({ isRead: true })
    .where(and(eq(masterMessagesTable.masterId, masterId), eq(masterMessagesTable.fromMaster, true)));
  res.json({ success: true });
});

export default router;
