import { Router } from "express";
import { db, telegramChatsTable, telegramMessagesTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function telegramRequest(method: string, body: object) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getUserAvatar(telegramUserId: number): Promise<string | null> {
  try {
    const photos = await telegramRequest("getUserProfilePhotos", { user_id: telegramUserId, limit: 1 });
    if (photos.result?.photos?.length > 0) {
      const fileId = photos.result.photos[0][0].file_id;
      const fileInfo = await telegramRequest("getFile", { file_id: fileId });
      if (fileInfo.result?.file_path) {
        return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
      }
    }
  } catch {}
  return null;
}

// Webhook - receives messages from Telegram
router.post("/webhook", async (req, res) => {
  const update = req.body;
  res.sendStatus(200); // always respond immediately

  try {
    const message = update.message || update.edited_message;
    if (!message || !message.text) return;

    const from = message.from;
    const chatId = String(message.chat.id);
    const text = message.text;

    // Find or create chat
    const existing = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, chatId));

    let chat = existing[0];
    if (!chat) {
      const avatarUrl = await getUserAvatar(from.id);
      const inserted = await db.insert(telegramChatsTable).values({
        telegramChatId: chatId,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        avatarUrl,
        stage: "new",
        lastMessage: text,
        lastMessageAt: new Date(),
        unreadCount: 1,
      }).returning();
      chat = inserted[0];
    } else {
      await db.update(telegramChatsTable).set({
        lastMessage: text,
        lastMessageAt: new Date(),
        unreadCount: (chat.unreadCount || 0) + 1,
        updatedAt: new Date(),
        firstName: from.first_name ?? chat.firstName,
        lastName: from.last_name ?? chat.lastName,
        username: from.username ?? chat.username,
      }).where(eq(telegramChatsTable.telegramChatId, chatId));
    }

    await db.insert(telegramMessagesTable).values({
      chatId,
      telegramMessageId: message.message_id,
      text,
      fromBot: false,
      senderName: [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Клиент",
    });
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// Set up webhook
router.post("/setup-webhook", requireRole("admin"), async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) return res.status(500).json({ error: "REPLIT_DOMAINS not set" });

  const webhookUrl = `https://${domain}/api/telegram/webhook`;
  const result = await telegramRequest("setWebhook", { url: webhookUrl });
  res.json({ ...result, webhookUrl });
});

// Get webhook info
router.get("/webhook-info", requireRole("admin"), async (req, res) => {
  const result = await fetch(`${TELEGRAM_API}/getWebhookInfo`).then(r => r.json());
  res.json(result);
});

// Get all chats
router.get("/chats", requireAuth, async (req, res) => {
  const chats = await db.select().from(telegramChatsTable).orderBy(desc(telegramChatsTable.lastMessageAt));
  
  // Get operator names
  const operators = await db.select().from(usersTable);
  const operatorMap = new Map(operators.map(u => [u.id, u.name]));

  res.json(chats.map(c => ({
    id: c.id,
    telegramChatId: c.telegramChatId,
    username: c.username ?? null,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    avatarUrl: c.avatarUrl ?? null,
    stage: c.stage,
    assignedOperatorId: c.assignedOperatorId ?? null,
    assignedOperatorName: c.assignedOperatorId ? (operatorMap.get(c.assignedOperatorId) ?? null) : null,
    lastMessage: c.lastMessage ?? null,
    lastMessageAt: c.lastMessageAt ?? null,
    unreadCount: c.unreadCount,
    createdAt: c.createdAt,
  })));
});

// Update chat stage or assignment
router.patch("/chats/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { stage, assignedOperatorId } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (stage !== undefined) updates.stage = stage;
  if (assignedOperatorId !== undefined) updates.assignedOperatorId = assignedOperatorId;

  const result = await db.update(telegramChatsTable).set(updates).where(eq(telegramChatsTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Chat not found" });
  res.json(result[0]);
});

// Get messages for a chat
router.get("/chats/:chatId/messages", requireAuth, async (req, res) => {
  const chatId = req.params.chatId;
  const messages = await db.select().from(telegramMessagesTable)
    .where(eq(telegramMessagesTable.chatId, chatId))
    .orderBy(telegramMessagesTable.createdAt);

  // Mark as read
  const chat = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, chatId));
  if (chat[0]) {
    await db.update(telegramChatsTable).set({ unreadCount: 0 }).where(eq(telegramChatsTable.telegramChatId, chatId));
  }

  res.json(messages.map(m => ({
    id: m.id,
    chatId: m.chatId,
    text: m.text,
    fromBot: m.fromBot,
    senderName: m.senderName ?? null,
    createdAt: m.createdAt,
  })));
});

// Send message to chat
router.post("/chats/:chatId/send", requireAuth, async (req, res) => {
  const chatId = req.params.chatId;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  const tgResult = await telegramRequest("sendMessage", { chat_id: chatId, text });
  if (!tgResult.ok) {
    return res.status(500).json({ error: "Failed to send message", details: tgResult });
  }

  const message = await db.insert(telegramMessagesTable).values({
    chatId,
    telegramMessageId: tgResult.result?.message_id ?? null,
    text,
    fromBot: true,
    senderName: "Оператор",
  }).returning();

  await db.update(telegramChatsTable).set({
    lastMessage: text,
    lastMessageAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(telegramChatsTable.telegramChatId, chatId));

  res.json(message[0]);
});

export default router;
