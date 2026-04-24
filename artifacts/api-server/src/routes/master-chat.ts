import { Router } from "express";
import { db, masterMessagesTable, mastersTable, telegramChatsTable, transactionsTable, transactionPaymentsTable, usersTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { sendPushToMaster } from "../lib/push.js";
import { sendMaxMessage } from "../maxBot.js";
import { objectStorageClient } from "../lib/objectStorage.js";
import multer from "multer";

const router = Router();
// Telegram-бот удалён — CRM-чат пишет только в БД и шлёт PWA push + Max.

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

  const threadMap = new Map<number, { lastMessage: string; lastAt: Date; unread: number; telegramChatId: string; lastFromMaster: boolean }>();
  for (const msg of messages) {
    if (!threadMap.has(msg.masterId)) {
      threadMap.set(msg.masterId, {
        lastMessage: msg.photoUrl ? "📷 Фото" : (msg.senderName === "system" ? `⚙ ${msg.text}` : msg.text),
        lastAt: msg.createdAt,
        unread: 0,
        telegramChatId: msg.telegramChatId,
        lastFromMaster: msg.fromMaster,
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
      phone: master?.phone ?? null,
      telegramId: master?.telegramId ?? null,
      pwaLogin: master?.pwaLogin ?? null,
      lastSeenAt: master?.lastSeenAt ?? null,
      avatarUrl,
      lastMessage: info.lastMessage,
      lastAt: info.lastAt,
      unread: info.unread,
      lastFromMaster: info.lastFromMaster,
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
router.post("/:masterId/reply", requireRole("admin", "master_operator"), upload.single("photo"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  const { text, operatorName } = req.body;
  const photoFile = req.file;

  if (!text && !photoFile) return res.status(400).json({ error: "text or photo required" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });

  const senderLabel = operatorName ?? "Оператор";
  let savedPhotoUrl: string | null = null;
  const chatId = `pwa_${master.id}`;

  if (photoFile) {
    try {
      const { randomUUID } = await import("crypto");
      const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
      if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not configured");
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
      // Path served by GET /storage/objects/:entityId (see routes/storage.ts).
      // entityId = path under PRIVATE_OBJECT_DIR.
      const privateParts = privateDir.replace(/^\//, "").split("/");
      const entityId = parts.slice(privateParts.length).join("/");
      savedPhotoUrl = `/objects/${entityId}`;
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
  }).catch(() => {});

  if (master.maxChatId && (text || savedPhotoUrl)) {
    const maxText = text
      ? `💬 **${senderLabel}:** ${text}`
      : `💬 Фото от **${senderLabel}**`;
    sendMaxMessage(master.maxChatId, maxText).catch(() => {});
  }

  res.json(saved);
});

// PATCH /api/master-chat/messages/:messageId — edit operator message text
router.patch("/messages/:messageId", requireRole("admin", "master_operator"), async (req, res) => {
  const messageId = parseInt(req.params.messageId);
  if (isNaN(messageId)) return res.status(400).json({ error: "Invalid messageId" });

  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const rows = await db.select().from(masterMessagesTable).where(eq(masterMessagesTable.id, messageId));
  const msg = rows[0];
  if (!msg) return res.status(404).json({ error: "Message not found" });
  if (msg.fromMaster) return res.status(403).json({ error: "Cannot edit master messages" });

  // Telegram удалён — синхронизация правок в TG больше не выполняется.

  const [updated] = await db.update(masterMessagesTable)
    .set({ text: text.trim(), editedAt: new Date() })
    .where(eq(masterMessagesTable.id, messageId))
    .returning();

  res.json(updated);
});

// PATCH /api/master-chat/:masterId/read
router.patch("/:masterId/read", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  await db.update(masterMessagesTable)
    .set({ isRead: true })
    .where(and(eq(masterMessagesTable.masterId, masterId), eq(masterMessagesTable.fromMaster, true)));
  res.json({ success: true });
});

// POST /api/master-chat/broadcast — send a message to multiple masters
router.post("/broadcast", requireRole("admin", "master_operator"), async (req, res) => {
  const { text, filter } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "text required" });

  const sessionUserId = (req as any).session?.userId ?? null;
  let senderLabel = "Оператор";
  if (sessionUserId) {
    const userRows = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    senderLabel = userRows[0]?.name ?? userRows[0]?.login ?? "Оператор";
  }

  const allMasters = await db.select().from(mastersTable).where(eq(mastersTable.status, "active"));

  let targets = allMasters;
  if (filter?.type === "city" && filter.city) {
    targets = allMasters.filter(m => m.city === filter.city);
  } else if (filter?.type === "custom" && Array.isArray(filter.masterIds) && filter.masterIds.length > 0) {
    targets = allMasters.filter(m => filter.masterIds.includes(m.id));
  }

  if (targets.length === 0) return res.json({ sent: 0 });

  await Promise.all(targets.map(async (master) => {
    const chatId = master.telegramId ?? `pwa_${master.id}`;
    await db.insert(masterMessagesTable).values({
      masterId: master.id,
      telegramChatId: chatId,
      text: text.trim(),
      fromMaster: false,
      senderName: `📢 ${senderLabel}`,
      isRead: true,
    });
    sendPushToMaster(master.id, {
      title: `📢 Объявление`,
      body: text.trim().length > 80 ? text.trim().slice(0, 77) + "…" : text.trim(),
      url: "/chat",
    }).catch(() => {});
  }));

  res.json({ sent: targets.length });
});

// DELETE /api/master-chat/:masterId — clear all messages in this conversation
router.delete("/:masterId", requireRole("admin"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid masterId" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!masterRows[0]) return res.status(404).json({ error: "Master not found" });

  await db.delete(masterMessagesTable).where(eq(masterMessagesTable.masterId, masterId));
  res.json({ success: true });
});

export default router;
