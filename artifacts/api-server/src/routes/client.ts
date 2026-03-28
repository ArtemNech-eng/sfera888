import { Router } from "express";
import { db, receiptsTable, clientSupportMessagesTable, leadsTable, ordersTable, mastersTable } from "@workspace/db";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import multer from "multer";
import { objectStorageClient } from "../lib/objectStorage.js";
import { performBroadcast } from "../lib/broadcastOrder.js";
import { requireRole } from "../middlewares/requireAuth.js";
import OpenAI from "openai";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Только изображения"));
  },
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function uploadImageToStorage(buffer: Buffer, mimetype: string): Promise<string | null> {
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) return null;
    const ext = mimetype === "image/png" ? "png" : "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucket = objectStorageClient.bucket(bucketId);
    await bucket.file(`public/estimate-photos/${filename}`).save(buffer, { contentType: mimetype, resumable: false });
    return `/api/storage/public-objects/estimate-photos/${filename}`;
  } catch {
    return null;
  }
}

// ─── GET /api/client/chat/:token — Get messages ──────────────────────────────

router.get("/chat/:token", async (req, res) => {
  const { token } = req.params;
  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, token));
  if (!receipt) return res.status(404).json({ error: "Смета не найдена" });

  const messages = await db.select()
    .from(clientSupportMessagesTable)
    .where(eq(clientSupportMessagesTable.receiptToken, token))
    .orderBy(clientSupportMessagesTable.createdAt);

  res.json({ messages });
});

// ─── POST /api/client/chat/:token — Client sends message ─────────────────────

router.post("/chat/:token", async (req, res) => {
  const { token } = req.params;
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Сообщение не может быть пустым" });

  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, token));
  if (!receipt) return res.status(404).json({ error: "Смета не найдена" });

  const [msg] = await db.insert(clientSupportMessagesTable).values({
    receiptToken: token,
    message: message.trim(),
    fromClient: true,
  }).returning();

  res.json({ ok: true, message: msg });
});

// ─── GET /api/client/history/:token — Orders for same phone ──────────────────

router.get("/history/:token", async (req, res) => {
  const { token } = req.params;
  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, token));
  if (!receipt) return res.status(404).json({ error: "Смета не найдена" });

  const phone = receipt.clientPhone;
  const allReceipts = await db.select({
    id: receiptsTable.id,
    token: receiptsTable.token,
    serviceType: receiptsTable.serviceType,
    city: receiptsTable.city,
    district: receiptsTable.district,
    totalAmount: receiptsTable.totalAmount,
    prepaymentAmount: receiptsTable.prepaymentAmount,
    createdAt: receiptsTable.createdAt,
    prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
    masterId: receiptsTable.masterId,
    orderId: receiptsTable.orderId,
  })
    .from(receiptsTable)
    .where(eq(receiptsTable.clientPhone, phone))
    .orderBy(desc(receiptsTable.createdAt));

  const masterIds = [...new Set(allReceipts.map(r => r.masterId))];
  const masters = masterIds.length
    ? await db.select({ id: mastersTable.id, alias: mastersTable.alias, contractFullName: mastersTable.contractFullName })
        .from(mastersTable)
        .where(inArray(mastersTable.id, masterIds))
    : [];

  const orderIds = [...new Set(allReceipts.map(r => r.orderId))];
  let statusMap = new Map<number, string>();
  if (orderIds.length) {
    const orders = await db.select({ id: ordersTable.id, status: ordersTable.status })
      .from(ordersTable)
      .where(and(isNull(ordersTable.deletedAt), inArray(ordersTable.id, orderIds)));
    for (const o of orders) statusMap.set(o.id, o.status);
  }

  const masterMap = new Map(masters.map(m => [m.id, m]));

  const items = allReceipts.map(r => ({
    id: r.id,
    token: r.token,
    serviceType: r.serviceType,
    city: r.city,
    district: r.district,
    totalAmount: Number(r.totalAmount),
    prepaymentAmount: Number(r.prepaymentAmount),
    createdAt: r.createdAt,
    isPaid: !!r.prepaymentSubmittedAt,
    orderStatus: statusMap.get(r.orderId) ?? "waiting_master",
    masterAlias: masterMap.get(r.masterId)?.alias ?? null,
  }));

  res.json({ items, clientPhone: phone });
});

// ─── POST /api/client/estimate — AI photo analysis ───────────────────────────

router.post("/estimate", upload.single("photo"), async (req, res) => {
  const { description, city, district, serviceType, clientName, clientPhone } = req.body;
  const file = req.file;

  if (!clientPhone?.trim()) return res.status(400).json({ error: "Укажите номер телефона" });
  if (!city?.trim()) return res.status(400).json({ error: "Укажите город" });
  if (!serviceType?.trim()) return res.status(400).json({ error: "Укажите тип работ" });

  try {
    let imageContent: any[] = [];

    if (file) {
      const base64 = file.buffer.toString("base64");
      const mimeType = file.mimetype;
      imageContent = [{
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      }];
    }

    const textPrompt = `Ты эксперт по ремонту квартир в России. Тебе нужно оценить стоимость ремонтных работ.

Тип работ: ${serviceType}
Город: ${city}${district ? `, ${district}` : ""}
${description ? `Описание клиента: ${description}` : ""}

${file ? "Клиент прислал фотографию помещения/проблемы." : "Фотография не приложена."}

Составь смету с несколькими позициями работ (3-6 позиций). Цены должны быть реалистичными для России.

Ответь ТОЛЬКО в формате JSON (без markdown, без пояснений):
{
  "lineItems": [
    {"description": "Название работы", "price": 5000},
    ...
  ],
  "totalMin": 15000,
  "totalMax": 25000,
  "notes": "Короткий комментарий по работам (1-2 предложения)"
}`;

    const messages: any[] = [{
      role: "user",
      content: file
        ? [{ type: "text", text: textPrompt }, ...imageContent]
        : textPrompt,
    }];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 800,
    });

    const rawText = completion.choices[0]?.message?.content ?? "";
    let estimate: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      estimate = JSON.parse(jsonMatch?.[0] ?? rawText);
    } catch {
      return res.status(500).json({ error: "AI не смог обработать запрос. Попробуйте ещё раз." });
    }

    let photoUrl: string | null = null;
    if (file) {
      photoUrl = await uploadImageToStorage(file.buffer, file.mimetype);
    }

    res.json({
      ok: true,
      lineItems: estimate.lineItems ?? [],
      totalMin: estimate.totalMin ?? 0,
      totalMax: estimate.totalMax ?? 0,
      notes: estimate.notes ?? "",
      photoUrl,
      clientName: clientName?.trim() || "Клиент",
      clientPhone: clientPhone.trim(),
      city: city.trim(),
      district: district?.trim() || "",
      serviceType: serviceType.trim(),
      description: description?.trim() || "",
    });
  } catch (err: any) {
    console.error("AI estimate error:", err);
    res.status(500).json({ error: "Ошибка при анализе. Попробуйте ещё раз." });
  }
});

// ─── POST /api/client/estimate/submit — Create lead + broadcast ──────────────

router.post("/estimate/submit", async (req, res) => {
  const { clientName, clientPhone, city, district, serviceType, description, photoUrl } = req.body;

  if (!clientPhone?.trim() || !city?.trim() || !serviceType?.trim()) {
    return res.status(400).json({ error: "Заполните обязательные поля" });
  }

  const [lead] = await db.insert(leadsTable).values({
    clientName: clientName?.trim() || "Клиент",
    clientPhone: clientPhone.trim(),
    city: city.trim(),
    district: district?.trim() || city.trim(),
    serviceType: serviceType.trim(),
    area: "0",
    comment: description?.trim() || null,
    photos: photoUrl ? JSON.stringify([photoUrl]) : null,
    source: "ai_estimate",
  }).returning();

  const [order] = await db.insert(ordersTable).values({
    leadId: lead.id,
    city: lead.city,
    district: lead.district,
    serviceType: lead.serviceType,
    area: "0",
    comment: lead.comment,
    status: "waiting_master",
    dispatchStatus: "none",
  }).returning();

  await db.update(leadsTable).set({ status: "sent_to_work", updatedAt: new Date() }).where(eq(leadsTable.id, lead.id));

  // Broadcast to available masters
  try {
    await performBroadcast(order.id);
  } catch (e) {
    console.error("Broadcast error:", e);
  }

  res.json({ ok: true, orderId: order.id, leadId: lead.id });
});

// ─── CRM: GET /api/client/chat-threads — all support chats ──────────────────

router.get("/chat-threads", requireRole("admin", "master_operator"), async (_req, res) => {
  const messages = await db.select()
    .from(clientSupportMessagesTable)
    .orderBy(desc(clientSupportMessagesTable.createdAt));

  const tokenSet = new Set(messages.map(m => m.receiptToken));
  const tokens = [...tokenSet];

  const receipts = tokens.length
    ? await db.select({
        token: receiptsTable.token,
        clientName: receiptsTable.clientName,
        clientPhone: receiptsTable.clientPhone,
        serviceType: receiptsTable.serviceType,
      }).from(receiptsTable).where(inArray(receiptsTable.token, tokens))
    : [];

  const receiptMap = new Map(receipts.map(r => [r.token, r]));

  const threads = tokens.map(token => {
    const threadMsgs = messages.filter(m => m.receiptToken === token);
    const last = threadMsgs[0];
    const unread = threadMsgs.filter(m => m.fromClient && !m.seenAt).length;
    const receipt = receiptMap.get(token);
    return {
      token,
      clientName: receipt?.clientName ?? "Клиент",
      clientPhone: receipt?.clientPhone ?? "",
      serviceType: receipt?.serviceType ?? "",
      lastMessage: last.message,
      lastAt: last.createdAt,
      lastFromClient: last.fromClient,
      unread,
    };
  });

  res.json({ threads });
});

// ─── CRM: GET /api/client/chat/:token/messages ───────────────────────────────

router.get("/chat/:token/messages", requireRole("admin", "master_operator"), async (req, res) => {
  const { token } = req.params;
  const messages = await db.select()
    .from(clientSupportMessagesTable)
    .where(eq(clientSupportMessagesTable.receiptToken, token))
    .orderBy(clientSupportMessagesTable.createdAt);

  // Mark client messages as seen
  const unread = messages.filter(m => m.fromClient && !m.seenAt).map(m => m.id);
  if (unread.length) {
    await db.update(clientSupportMessagesTable)
      .set({ seenAt: new Date() })
      .where(eq(clientSupportMessagesTable.receiptToken, token));
  }

  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, token));

  res.json({ messages, receipt: receipt ?? null });
});

// ─── CRM: POST /api/client/chat/:token/reply — Operator replies ──────────────

router.post("/chat/:token/reply", requireRole("admin", "master_operator"), async (req: any, res) => {
  const { token } = req.params;
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Пустое сообщение" });

  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, token));
  if (!receipt) return res.status(404).json({ error: "Смета не найдена" });

  const operatorName = req.session?.user?.username ?? "Оператор";

  const [msg] = await db.insert(clientSupportMessagesTable).values({
    receiptToken: token,
    message: message.trim(),
    fromClient: false,
    operatorName,
  }).returning();

  res.json({ ok: true, message: msg });
});

// ─── CRM: GET /api/client/chat-unread ────────────────────────────────────────

router.get("/chat-unread", requireRole("admin", "master_operator"), async (_req, res) => {
  const unread = await db.select()
    .from(clientSupportMessagesTable)
    .where(and(eq(clientSupportMessagesTable.fromClient, true)));

  const count = unread.filter(m => !m.seenAt).length;
  res.json({ count });
});

export default router;
