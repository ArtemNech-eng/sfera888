import { Router, Request, Response, NextFunction } from "express";
import { db, masterMessagesTable, mastersTable, telegramChatsTable, transactionsTable, transactionPaymentsTable, usersTable } from "@workspace/db";
import { eq, desc, and, inArray, sql, count, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { sendPushToMaster } from "../lib/push.js";
import { sendMaxMessage } from "../maxBot.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import multer from "multer";

const router = Router();
// Telegram-бот удалён — CRM-чат пишет только в БД и шлёт PWA push + Max.

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Simple in-memory rate limiting for message sending
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // max requests per window per IP

const checkRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (!ip) return next();
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  if (record && record.resetTime > now) {
    if (record.count >= RATE_LIMIT_MAX) {
      return res.status(429).json({ error: "Too many requests, please try again later." });
    }
    record.count += 1;
  } else {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
  }
  next();
};

// GET /api/master-chat — list threads with unread count
router.get("/", requireRole("admin", "master_operator"), async (_req, res) => {
  // Получаем только активных мастеров (не удалённых)
  const masters = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt));
  const masterMap = new Map(masters.map(m => [m.id, m]));

  // Lookup avatarUrl from telegram_chats by telegramId
  const telegramIds = masters.filter(m => m.telegramId).map(m => m.telegramId!);
  const tgChats = telegramIds.length > 0
    ? await db.select({ telegramChatId: telegramChatsTable.telegramChatId, avatarUrl: telegramChatsTable.avatarUrl })
        .from(telegramChatsTable)
        .where(inArray(telegramChatsTable.telegramChatId, telegramIds))
    : [];
  const tgAvatarMap = new Map(tgChats.map(c => [c.telegramChatId, c.avatarUrl ?? null]));

  // 1. Последние сообщения для каждого мастера (оконная функция)
  const lastMessagesQuery = await db.execute(sql`
    SELECT DISTINCT ON (master_id) 
      master_id, 
      telegram_chat_id, 
      text, 
      photo_url, 
      sender_name, 
      from_master,
      created_at
    FROM master_messages 
    ORDER BY master_id, created_at DESC
  `);
  const lastMessages = lastMessagesQuery.rows;

  // 2. Количество непрочитанных сообщений от мастеров (только from_master = true)
  const unreadCountsQuery = await db.execute(sql`
    SELECT master_id, COUNT(*) as unread_count
    FROM master_messages 
    WHERE from_master = true AND is_read = false
    GROUP BY master_id
  `);
  const unreadCounts = unreadCountsQuery.rows;

  const unreadMap = new Map(unreadCounts.map((row: any) => [row.master_id, parseInt(row.unread_count)]));

  const threads = lastMessages
    .filter((row: any) => masterMap.has(row.master_id)) // Skip deleted masters
    .map((row: any) => {
    const masterId = row.master_id;
    const master = masterMap.get(masterId)!;
    const tgAvatar = master.telegramId ? (tgAvatarMap.get(master.telegramId) ?? null) : null;
    const avatarUrl = tgAvatar ?? master.customAvatarUrl ?? null;
    const lastMessage = row.photo_url ? "📷 Фото" : (row.sender_name === "system" ? `⚙ ${row.text}` : row.text);
    
    return {
      masterId,
      alias: master.alias ?? "Неизвестный мастер",
      city: master.city ?? "",
      phone: master.phone ?? null,
      telegramId: master.telegramId ?? null,
      pwaLogin: master.pwaLogin ?? null,
      lastSeenAt: master.lastSeenAt ?? null,
      avatarUrl,
      lastMessage,
      lastAt: row.created_at,
      unread: unreadMap.get(masterId) ?? 0,
      lastFromMaster: row.from_master,
    };
  });

  // Сортируем по дате последнего сообщения (новые сверху)
  threads.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

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
  const masterId = parseInt(req.params.masterId as string);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid masterId" });

  const messages = await db.select().from(masterMessagesTable)
    .where(eq(masterMessagesTable.masterId, masterId))
    .orderBy(masterMessagesTable.createdAt);

  const masterRows = await db.select().from(mastersTable).where(and(eq(mastersTable.id, masterId), isNull(mastersTable.deletedAt)));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found or deleted" });

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

  // Fetch partial payments for pending transactions
  const pendingTxIds = pendingTx.map(t => t.id);
  const partials = pendingTxIds.length > 0
    ? await db.select().from(transactionPaymentsTable)
        .where(inArray(transactionPaymentsTable.transactionId, pendingTxIds))
    : [];
  const partialsMap = new Map<number, typeof partials>();
  for (const p of partials) {
    const arr = partialsMap.get(p.transactionId) ?? [];
    arr.push(p);
    partialsMap.set(p.transactionId, arr);
  }

  // Detect payment proof screenshot: a message from master that has a photo
  // and text matching the payment proof pattern sent by the bot.
  // We look for the LATEST such proof so the operator sees the most recent one.
  const paymentProofMsg = [...messages]
    .reverse()
    .find(m => m.fromMaster && m.photoUrl && m.text?.includes("Скриншот оплаты"));

  const hasPaymentProof = !!paymentProofMsg;
  const paymentProofUrl = paymentProofMsg?.photoUrl ?? null;

  console.log(`[master-chat] masterId=${masterId} pendingTx count=${pendingTx.length} hasPaymentProof=${hasPaymentProof}`);

  res.json({
    master: { id: master.id, alias: master.alias, city: master.city, phone: master.phone ?? null, telegramId: master.telegramId, pwaLogin: master.pwaLogin ?? null, avatarUrl },
    messages,
    hasPaymentProof,
    paymentProofUrl,
    pendingTransactions: pendingTx.map(t => {
      const prepaymentDeducted = Number(t.prepaymentDeducted ?? 0);
      const txPartials = partialsMap.get(t.id) ?? [];
      const totalPartialPaid = txPartials.reduce((s, p) => s + Number(p.amount), 0);
      const commission = Number(t.commission);
      return {
        id: t.id,
        orderId: t.orderId,
        orderAmount: Number(t.orderAmount),
        commission,
        prepaymentDeducted,
        totalPartialPaid,
        netPayable: Math.max(0, commission - prepaymentDeducted - totalPartialPaid),
        partialPayments: txPartials.map(p => ({
          id: p.id,
          amount: Number(p.amount),
          note: p.note ?? null,
          paidAt: p.paidAt,
        })),
        paymentStatus: t.paymentStatus,
        createdAt: t.createdAt,
      };
    }),
  });
});

// POST /api/master-chat/:masterId/reply — send text or photo reply
router.post("/:masterId/reply", requireRole("admin", "master_operator"), checkRateLimit, upload.single("photo"), async (req, res) => {
  try {
    const masterId = parseInt(req.params.masterId as string);
    const { text, operatorName } = req.body;
    const photoFile = req.file;

    if (!text && !photoFile) return res.status(400).json({ error: "text or photo required" });
    if (text && text.length > 5000) return res.status(400).json({ error: "Текст сообщения слишком длинный (макс. 5000 символов)" });

    const masterRows = await db.select().from(mastersTable).where(and(eq(mastersTable.id, masterId), isNull(mastersTable.deletedAt)));
    const master = masterRows[0];
    if (!master) return res.status(404).json({ error: "Master not found or deleted" });

    const senderLabel = operatorName ?? "Оператор";
    let savedPhotoUrl: string | null = null;
    const chatId = `pwa_${master.id}`;

    if (photoFile) {
      try {
        const { randomUUID } = await import("crypto");
        const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
        const publicUrl = process.env.R2_PUBLIC_URL;
        if (!privateDir || !publicUrl) throw new Error("Object storage not configured");
        const objectId = randomUUID();
        const ext = (photoFile.originalname?.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
        const fullPath = `${privateDir}/master-chat/${masterId}/${objectId}.${ext}`;
        const parts = fullPath.replace(/^\//, "").split("/");
        const bucketName = parts[0];
        const objectName = parts.slice(1).join("/");
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        await file.save(photoFile.buffer, {
          contentType: photoFile.mimetype || "image/jpeg",
          resumable: false,
        });
        savedPhotoUrl = `${publicUrl}/${bucketName}/${objectName}`;
      } catch (e) {
        console.error("[master-chat] photo upload failed:", e);
        return res.status(500).json({ error: "Не удалось сохранить фото" });
      }
    }

    const [saved] = await db.insert(masterMessagesTable).values({
      masterId,
      telegramChatId: chatId,
      text: text ?? "",
      fromMaster: false,
      senderName: senderLabel,
      isRead: true,
      photoUrl: savedPhotoUrl,
      telegramMessageId: null,
    }).returning();

    // Push notification to master's PWA
    const pushBody = text
      ? (text.length > 80 ? text.slice(0, 77) + "…" : text)
      : "Новое фото от оператора";
    sendPushToMaster(masterId, {
      title: `💬 ${senderLabel}`,
      body: pushBody,
      url: "/chat",
    }).catch((err) => console.error("[master-chat] push notification failed:", err));

    if (master.maxChatId && (text || savedPhotoUrl)) {
      const maxText = text
        ? `💬 **${senderLabel}:** ${text}`
        : `💬 Фото от **${senderLabel}**`;
      sendMaxMessage(master.maxChatId, maxText).catch((err) => console.error("[master-chat] max message failed:", err));
    }

    res.json(saved);
  } catch (err: any) {
    console.error("[master-chat] reply handler error:", err);
    res.status(500).json({ error: err?.message ?? "Internal server error" });
  }
});

// PATCH /api/master-chat/messages/:messageId — edit operator message text
router.patch("/messages/:messageId", requireRole("admin", "master_operator"), async (req, res) => {
  const messageId = parseInt(req.params.messageId as string);
  if (isNaN(messageId)) return res.status(400).json({ error: "Invalid messageId" });

  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const rows = await db.select().from(masterMessagesTable).where(eq(masterMessagesTable.id, messageId));
  const msg = rows[0];
  if (!msg) return res.status(404).json({ error: "Message not found" });
  if (msg.fromMaster) return res.status(403).json({ error: "Cannot edit master messages" });

  // Telegram удалён — синхронизация правок в TG больше не выполняется.

  const user = (req as any).user;
  const [updated] = await db.update(masterMessagesTable)
    .set({ text: text.trim(), editedAt: new Date(), updatedByUserId: user.id })
    .where(eq(masterMessagesTable.id, messageId))
    .returning();

  res.json(updated);
});

// PATCH /api/master-chat/:masterId/read
router.patch("/:masterId/read", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.masterId as string);
  await db.update(masterMessagesTable)
    .set({ isRead: true })
    .where(and(eq(masterMessagesTable.masterId, masterId), eq(masterMessagesTable.fromMaster, true)));
  res.json({ success: true });
});

// POST /api/master-chat/broadcast — send a message to multiple masters
router.post("/broadcast", requireRole("admin", "master_operator"), checkRateLimit, async (req, res) => {
const { text, filter } = req.body;
if (!text?.trim()) return res.status(400).json({ error: "text required" });
if (text.length > 5000) return res.status(400).json({ error: "Текст сообщения слишком длинный (макс. 5000 символов)" });

  const sessionUserId = (req as any).session?.userId ?? null;
  let senderLabel = "Оператор";
  if (sessionUserId) {
    const userRows = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    senderLabel = userRows[0]?.name ?? userRows[0]?.login ?? "Оператор";
  }

  const allMasters = await db.select().from(mastersTable).where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

  let targets = allMasters;
  if (filter?.type === "city") {
    if (!filter.city || typeof filter.city !== "string") {
      return res.status(400).json({ error: "При фильтре по городу необходимо указать город" });
    }
    targets = allMasters.filter(m => m.city === filter.city);
  } else if (filter?.type === "custom") {
    if (!Array.isArray(filter.masterIds) || filter.masterIds.length === 0) {
      return res.status(400).json({ error: "При выборе мастеров необходимо указать хотя бы одного мастера" });
    }
    targets = allMasters.filter(m => filter.masterIds.includes(m.id));
  }

  if (targets.length === 0) return res.json({ sent: 0 });

  // Batch insert всех сообщений
const messageValues = targets.map(master => ({
  masterId: master.id,
  telegramChatId: master.telegramId ?? `pwa_${master.id}`,
  text: text.trim(),
  fromMaster: false,
  senderName: `📢 ${senderLabel}`,
  isRead: true,
  photoUrl: null,
  telegramMessageId: null,
  maxMid: null,
  editedAt: null,
  createdAt: new Date(),
}));
await db.insert(masterMessagesTable).values(messageValues);

// Отправляем push-уведомления асинхронно
for (const master of targets) {
  sendPushToMaster(master.id, {
    title: `📢 Объявление`,
    body: text.trim().length > 80 ? text.trim().slice(0, 77) + "…" : text.trim(),
    url: "/chat",
  }).catch((err) => console.error("[master-chat] broadcast push failed for master", master.id, err));
}

  res.json({ sent: targets.length });
});

// DELETE /api/master-chat/:masterId — clear all messages in this conversation
router.delete("/:masterId", requireRole("admin"), async (req, res) => {
  const masterId = parseInt(req.params.masterId as string);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid masterId" });

  const masterRows = await db.select().from(mastersTable).where(and(eq(mastersTable.id, masterId), isNull(mastersTable.deletedAt)));
  if (!masterRows[0]) return res.status(404).json({ error: "Master not found or deleted" });

  await db.delete(masterMessagesTable).where(eq(masterMessagesTable.masterId, masterId));
  res.json({ success: true });
});

export default router;
