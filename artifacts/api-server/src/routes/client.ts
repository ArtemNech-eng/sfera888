import { Router } from "express";
import { db, receiptsTable, clientSupportMessagesTable, generalSupportMessagesTable, leadsTable, ordersTable, mastersTable, clientPushSubscriptionsTable } from "@workspace/db";
import { eq, desc, and, isNull, isNotNull, inArray, like, gte, sql } from "drizzle-orm";
import multer from "multer";
import { objectStorageClient } from "../lib/objectStorage.js";
import { performBroadcast } from "../lib/broadcastOrder.js";
import { Readable } from "stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../lib/objectStorage.js";
import { sendPushToClient } from "../lib/clientPush.js";
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

// ─── Rate limiter: max 3 AI estimates per phone per 24 hours ──────────────────
const ESTIMATE_LIMIT = 3;
const ESTIMATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const estimateRateMap = new Map<string, { count: number; resetAt: number }>();

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function checkEstimateLimit(phone: string): { allowed: boolean; remaining: number; resetAt: Date } {
  const key = normalizePhone(phone);
  const now = Date.now();
  let entry = estimateRateMap.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + ESTIMATE_WINDOW_MS };
    estimateRateMap.set(key, entry);
  }

  const remaining = Math.max(0, ESTIMATE_LIMIT - entry.count);
  if (entry.count >= ESTIMATE_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) };
  }

  entry.count++;
  return { allowed: true, remaining: ESTIMATE_LIMIT - entry.count, resetAt: new Date(entry.resetAt) };
}

async function uploadImageToStorage(buffer: Buffer, mimetype: string): Promise<string | null> {
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    const publicUrl = process.env.R2_PUBLIC_URL;
    if (!bucketId || !publicUrl) return null;
    const ext = mimetype === "image/png" ? "png" : "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const key = `public/estimate-photos/${filename}`;
    const bucket = objectStorageClient.bucket(bucketId);
    await bucket.file(key).save(buffer, { contentType: mimetype, resumable: false });
    return `${publicUrl}/${key}`;
  } catch {
    return null;
  }
}

// ─── GET /api/client/chat/:token — Get messages ──────────────────────────────

router.get("/chat/:token", async (req, res) => {
  const { token } = req.params;
  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, String(token)));
  if (!receipt) return res.status(404).json({ error: "Смета не найдена" });

  const messages = await db.select()
    .from(clientSupportMessagesTable)
    .where(eq(clientSupportMessagesTable.receiptToken, String(token)))
    .orderBy(clientSupportMessagesTable.createdAt);

  res.json({ messages });
});

// ─── POST /api/client/chat/:token — Client sends message ─────────────────────

router.post("/chat/:token", async (req, res) => {
  const { token } = req.params;
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Сообщение не может быть пустым" });

  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, String(token)));
  if (!receipt) return res.status(404).json({ error: "Смета не найдена" });

  const [msg] = await db.insert(clientSupportMessagesTable).values({
    receiptToken: String(token),
    message: message.trim(),
    fromClient: true,
  }).returning();

  res.json({ ok: true, message: msg });
});

// ─── GET /api/client/history/:token — Orders for same phone ──────────────────

router.get("/history/:token", async (req, res) => {
  const { token } = req.params;
  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, String(token)));
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

// ─── GET /api/client/my-orders?phone=... — All orders by phone ───────────────

router.get("/my-orders", async (req, res) => {
  const { phone } = req.query;
  if (!phone || typeof phone !== "string" || !phone.trim()) {
    return res.status(400).json({ error: "Укажите номер телефона" });
  }
  const normalized = normalizePhone(phone.trim());
  if (normalized.length < 7) return res.status(400).json({ error: "Некорректный номер" });

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
    .where(sql`right(regexp_replace(${receiptsTable.clientPhone}, '[^0-9]', '', 'g'), 10) = ${normalized}`)
    .orderBy(desc(receiptsTable.createdAt));

  const masterIds = [...new Set(allReceipts.map(r => r.masterId))];
  const masters = masterIds.length
    ? await db.select({ id: mastersTable.id, alias: mastersTable.alias })
        .from(mastersTable).where(inArray(mastersTable.id, masterIds))
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

  res.json({ items });
});

// ─── POST /api/client/estimate — AI photo analysis ───────────────────────────

router.post("/estimate", upload.single("photo"), async (req, res) => {
  const { description, city, district, serviceType, clientName, clientPhone } = req.body;
  const file = req.file;

  if (!clientPhone?.trim()) return res.status(400).json({ error: "Укажите номер телефона" });
  if (!city?.trim()) return res.status(400).json({ error: "Укажите город" });
  if (!serviceType?.trim()) return res.status(400).json({ error: "Укажите тип работ" });

  const rateCheck = checkEstimateLimit(clientPhone.trim());
  if (!rateCheck.allowed) {
    const resetHour = rateCheck.resetAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return res.status(429).json({
      error: `Вы использовали все ${ESTIMATE_LIMIT} бесплатные оценки на сегодня. Новые оценки будут доступны после ${resetHour}.`,
      limitExceeded: true,
      resetAt: rateCheck.resetAt.toISOString(),
    });
  }

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

    // ── Gather live market data from the platform ──────────────────────────────
    const cityNorm = city.trim();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // 1. Active masters in this city with service prices
    const mastersWithPrices = await db
      .select({ servicePrices: mastersTable.servicePrices })
      .from(mastersTable)
      .where(and(
        eq(mastersTable.status, "active"),
        isNull(mastersTable.deletedAt),
        isNotNull(mastersTable.servicePrices),
        sql`lower(${mastersTable.city}) = lower(${cityNorm})`,
      ));

    const masterPriceMap = new Map<string, number[]>();
    for (const m of mastersWithPrices) {
      for (const p of (m.servicePrices ?? [])) {
        if (p.service && p.priceFrom > 0) {
          if (!masterPriceMap.has(p.service)) masterPriceMap.set(p.service, []);
          masterPriceMap.get(p.service)!.push(p.priceFrom);
        }
      }
    }

    // 2. Recent receipts from this city
    const recentReceipts = await db
      .select({ lineItems: receiptsTable.lineItems })
      .from(receiptsTable)
      .where(and(
        sql`lower(${receiptsTable.city}) = lower(${cityNorm})`,
        gte(receiptsTable.createdAt, sixMonthsAgo),
      ))
      .orderBy(desc(receiptsTable.createdAt))
      .limit(40);

    const receiptPriceMap = new Map<string, number[]>();
    for (const r of recentReceipts) {
      for (const item of (r.lineItems as any[] ?? [])) {
        const key = String(item.description ?? "").trim();
        const price = Number(item.price ?? 0);
        const qty = Number(item.quantity ?? 1);
        if (key && price > 0 && qty > 0) {
          const unitPrice = qty > 1 ? price : price; // price is already per-unit in receipts
          if (!receiptPriceMap.has(key)) receiptPriceMap.set(key, []);
          receiptPriceMap.get(key)!.push(unitPrice);
        }
      }
    }

    // Build market data context block
    let marketDataSection = "";

    if (masterPriceMap.size > 0) {
      const lines: string[] = [];
      for (const [service, prices] of masterPriceMap.entries()) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = prices.length > 1 && max !== min ? `${min.toLocaleString("ru")}–${max.toLocaleString("ru")}` : `${min.toLocaleString("ru")}`;
        lines.push(`   - ${service}: от ${range} ₽ (${prices.length} мастер${prices.length === 1 ? "" : prices.length < 5 ? "а" : "ов"})`);
      }
      marketDataSection += `\nРЕАЛЬНЫЕ ЦЕНЫ МАСТЕРОВ ПЛАТФОРМЫ В ${cityNorm.toUpperCase()} (используй как приоритетный источник):\n${lines.join("\n")}`;
    }

    if (receiptPriceMap.size > 0) {
      const lines: string[] = [];
      for (const [desc, prices] of receiptPriceMap.entries()) {
        const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        const cnt = prices.length;
        lines.push(`   - ${desc}: ~${avg.toLocaleString("ru")} ₽ (${cnt} ${cnt === 1 ? "смета" : cnt < 5 ? "сметы" : "смет"})`);
      }
      marketDataSection += `\nФАКТИЧЕСКИЕ ЦЕНЫ ИЗ ЗАКРЫТЫХ СМЕТ ПЛАТФОРМЫ (${cityNorm}):\n${lines.join("\n")}`;
    }

    const hasPlatformData = marketDataSection.length > 0;

    const textPrompt = `Ты — сервис сравнения цен на ремонтные работы в России. Твоя задача — дать клиенту ориентировочные рыночные цены ТОЛЬКО на те работы, которые он описал. Не придумывай лишних позиций.

Город: ${cityNorm}${district ? `, ${district}` : ""}
Запрос клиента: ${serviceType}${description ? `. ${description}` : ""}
${file ? "Клиент прислал фотографию — используй её только для уточнения объёма или площади, если это видно." : ""}
${marketDataSection}

ПРАВИЛА:
1. Включай в смету ТОЛЬКО те работы, о которых написал клиент. Не добавляй позиции которые клиент не просил.
2. Если из описания следует очевидная подготовительная работа (например: нельзя клеить обои без грунтовки) — добавь её, но пометь "(обязательная подготовка)".
3. ${hasPlatformData ? "Используй РЕАЛЬНЫЕ ЦЕНЫ ПЛАТФОРМЫ выше как основу. Они приоритетнее общерыночных. Если данных по конкретной позиции нет — опирайся на рыночные цены:" : "Цены — средние рыночные по России для региона клиента. Примеры актуальных рыночных цен:"}
   - Поклейка обоев без подбора: от 250–350 ₽/м²
   - Грунтовка стен: от 50–80 ₽/м²
   - Укладка плитки (стандартная): от 800–1200 ₽/м²
   - Штукатурка стен: от 350–500 ₽/м²
   - Покраска стен (2 слоя): от 200–300 ₽/м²
   - Монтаж ламината: от 300–450 ₽/м²
   - Демонтаж старых обоев: от 80–120 ₽/м²
   - Монтаж розетки/выключателя: от 400–700 ₽/шт
   - Замена смесителя: от 800–1500 ₽/шт
4. Если площадь/количество неизвестны — давай цену за единицу измерения (м², шт, п.м.) и в поле "price" ставь минимальную рыночную цену за ЕД. Укажи единицу в описании.
5. totalMin и totalMax — итог с учётом реальных диапазонов рыночных цен. Не занижай.
6. В notes — напиши 1 фразу: что влияет на итоговую цену (состояние поверхностей, сложность и т.д.). Обязательно добавь: "Точная стоимость зависит от объёма работ и состояния помещения."

Ответь ТОЛЬКО в формате JSON (без markdown, без пояснений):
{
  "lineItems": [
    {"description": "Поклейка обоев (без подбора)", "price": 250, "unit": "м²"},
    {"description": "Грунтовка стен (обязательная подготовка)", "price": 50, "unit": "м²"},
    {"description": "Демонтаж старых обоев (25 м² × 100 ₽)", "price": 2500, "unit": "итого"}
  ],
  "totalMin": 15000,
  "totalMax": 25000,
  "notes": "Цена зависит от состояния стен и площади. Точная стоимость зависит от объёма работ и состояния помещения."
}

Поле "unit": используй "м²", "п.м.", "шт", "итого". Если количество известно — посчитай итог и поставь unit: "итого", в description напиши расчёт (25 м² × 250 ₽). Если неизвестно — поставь единицу измерения и price за 1 единицу.`;

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
    // Token model removed: always commission.
    paymentModel: "commission",
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
    paymentModel: lead.paymentModel ?? "commission",
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
  // Efficient: single SQL query with GROUP BY — no full table download
  const result = await db.execute(sql`
    SELECT
      csm.receipt_token AS token,
      csm.message AS "lastMessage",
      csm.from_client AS "lastFromClient",
      csm.created_at AS "lastAt",
      COALESCE(unread.cnt, 0) AS unread
    FROM client_support_messages csm
    JOIN (
      SELECT receipt_token, MAX(created_at) AS max_at
      FROM client_support_messages
      GROUP BY receipt_token
    ) latest ON csm.receipt_token = latest.receipt_token AND csm.created_at = latest.max_at
    LEFT JOIN (
      SELECT receipt_token, COUNT(*)::int AS cnt
      FROM client_support_messages
      WHERE from_client = true AND seen_at IS NULL
      GROUP BY receipt_token
    ) unread ON csm.receipt_token = unread.receipt_token
    ORDER BY csm.created_at DESC
  `);

  const rows = result.rows as any[];
  const tokens: string[] = [...new Set(rows.map(r => r.token as string))];

  const receipts = tokens.length
    ? await db.select({
        token: receiptsTable.token,
        clientName: receiptsTable.clientName,
        clientPhone: receiptsTable.clientPhone,
        serviceType: receiptsTable.serviceType,
      }).from(receiptsTable).where(inArray(receiptsTable.token, tokens))
    : [];

  const receiptMap = new Map(receipts.map(r => [r.token, r]));

  const threads = rows.map(r => {
    const receipt = receiptMap.get(r.token);
    return {
      token: r.token,
      clientName: receipt?.clientName ?? "Клиент",
      clientPhone: receipt?.clientPhone ?? "",
      serviceType: receipt?.serviceType ?? "",
      lastMessage: r.lastMessage,
      lastAt: r.lastAt,
      lastFromClient: r.lastFromClient,
      unread: Number(r.unread),
    };
  });

  res.json({ threads });
});

// ─── CRM: GET /api/client/chat/:token/messages ───────────────────────────────

router.get("/chat/:token/messages", requireRole("admin", "master_operator"), async (req, res) => {
  const { token } = req.params;
  const messages = await db.select()
    .from(clientSupportMessagesTable)
    .where(eq(clientSupportMessagesTable.receiptToken, String(token)))
    .orderBy(clientSupportMessagesTable.createdAt);

  // Mark client messages as seen
  const unread = messages.filter(m => m.fromClient && !m.seenAt).map(m => m.id);
  if (unread.length) {
    await db.update(clientSupportMessagesTable)
      .set({ seenAt: new Date() })
      .where(eq(clientSupportMessagesTable.receiptToken, String(token)));
  }

  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, String(token)));

  res.json({ messages, receipt: receipt ?? null });
});

// ─── CRM: POST /api/client/chat/:token/reply — Operator replies ──────────────

router.post("/chat/:token/reply", requireRole("admin", "master_operator"), async (req: any, res) => {
  const { token } = req.params;
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Пустое сообщение" });

  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, String(token)));
  if (!receipt) return res.status(404).json({ error: "Смета не найдена" });

  const operatorName = req.session?.user?.username ?? "Оператор";

  const [msg] = await db.insert(clientSupportMessagesTable).values({
    receiptToken: String(token),
    message: message.trim(),
    fromClient: false,
    operatorName,
  }).returning();

  res.json({ ok: true, message: msg });
});

// ─── CRM: GET /api/client/chat-unread ────────────────────────────────────────

router.get("/chat-unread", requireRole("admin", "master_operator"), async (_req, res) => {
  // Efficient: COUNT in DB instead of downloading all rows
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM client_support_messages
    WHERE from_client = true AND seen_at IS NULL
  `);
  const count = (result.rows[0] as any)?.count ?? 0;
  res.json({ count: Number(count) });
});

// ─── General support chat (phone-based, no smeta token required) ─────────────

// GET /api/client/support/:phone — get messages for a phone number
router.get("/support/:phone", async (req, res) => {
  const phone = String(req.params.phone).replace(/\D/g, "").slice(-10);
  if (phone.length < 10) return res.status(400).json({ error: "Неверный номер" });

  const messages = await db.select()
    .from(generalSupportMessagesTable)
    .where(sql`right(regexp_replace(${generalSupportMessagesTable.clientPhone}, '[^0-9]', '', 'g'), 10) = ${phone}`)
    .orderBy(generalSupportMessagesTable.createdAt);

  // mark operator messages as seen
  await db.update(generalSupportMessagesTable)
    .set({ seenAt: new Date() })
    .where(
      and(
        sql`right(regexp_replace(${generalSupportMessagesTable.clientPhone}, '[^0-9]', '', 'g'), 10) = ${phone}`,
        eq(generalSupportMessagesTable.fromClient, false),
        isNull(generalSupportMessagesTable.seenAt),
      )
    );

  res.json({ messages });
});

// POST /api/client/support/:phone — client sends message
router.post("/support/:phone", async (req, res) => {
  const phone = String(req.params.phone).replace(/\D/g, "").slice(-10);
  if (phone.length < 10) return res.status(400).json({ error: "Неверный номер" });
  const { message, clientName } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Сообщение пустое" });

  const [msg] = await db.insert(generalSupportMessagesTable).values({
    clientPhone: phone,
    clientName: clientName?.trim() || null,
    message: message.trim(),
    fromClient: true,
  }).returning();

  res.json({ ok: true, message: msg });
});

// ─── CRM: GET /api/client/support-threads — all general support chats ─────────

router.get("/support-threads", requireRole("admin", "master_operator"), async (_req, res) => {
  // Efficient: single SQL query with GROUP BY — no full table download
  const result = await db.execute(sql`
    SELECT
      gsm.client_phone AS phone,
      gsm.message AS "lastMessage",
      gsm.from_client AS "lastFromClient",
      gsm.created_at AS "lastAt",
      COALESCE(unread.cnt, 0) AS unread,
      cn.client_name AS "clientName"
    FROM general_support_messages gsm
    JOIN (
      SELECT client_phone, MAX(created_at) AS max_at
      FROM general_support_messages
      GROUP BY client_phone
    ) latest ON gsm.client_phone = latest.client_phone AND gsm.created_at = latest.max_at
    LEFT JOIN (
      SELECT client_phone, COUNT(*)::int AS cnt
      FROM general_support_messages
      WHERE from_client = true AND seen_at IS NULL
      GROUP BY client_phone
    ) unread ON gsm.client_phone = unread.client_phone
    LEFT JOIN (
      SELECT client_phone, MAX(client_name) AS client_name
      FROM general_support_messages
      WHERE client_name IS NOT NULL
      GROUP BY client_phone
    ) cn ON gsm.client_phone = cn.client_phone
    ORDER BY gsm.created_at DESC
  `);

  const threads = (result.rows as any[]).map(r => ({
    phone: r.phone,
    clientName: r.clientName ?? null,
    lastMessage: r.lastMessage,
    lastAt: r.lastAt,
    lastFromClient: r.lastFromClient,
    unread: Number(r.unread),
  }));

  res.json({ threads });
});

// ─── CRM: GET /api/client/support-messages/:phone — messages for a phone ──────

router.get("/support-messages/:phone", requireRole("admin", "master_operator"), async (req, res) => {
  const phone = String(req.params.phone).replace(/\D/g, "").slice(-10);
  const messages = await db.select()
    .from(generalSupportMessagesTable)
    .where(sql`right(regexp_replace(${generalSupportMessagesTable.clientPhone}, '[^0-9]', '', 'g'), 10) = ${phone}`)
    .orderBy(generalSupportMessagesTable.createdAt);

  await db.update(generalSupportMessagesTable)
    .set({ seenAt: new Date() })
    .where(
      and(
        sql`right(regexp_replace(${generalSupportMessagesTable.clientPhone}, '[^0-9]', '', 'g'), 10) = ${phone}`,
        eq(generalSupportMessagesTable.fromClient, true),
        isNull(generalSupportMessagesTable.seenAt),
      )
    );

  res.json({ messages });
});

// ─── CRM: POST /api/client/support-reply/:phone — operator replies ────────────

router.post("/support-reply/:phone", requireRole("admin", "master_operator"), async (req: any, res) => {
  const phone = String(req.params.phone).replace(/\D/g, "").slice(-10);
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Пустое сообщение" });
  const operatorName = req.user?.username ?? "Оператор";

  const [msg] = await db.insert(generalSupportMessagesTable).values({
    clientPhone: phone,
    message: message.trim(),
    fromClient: false,
    operatorName,
  }).returning();

  res.json({ ok: true, message: msg });
});

// ─── Client Push Subscriptions ─────────────────────────────────────────────────

function normalizePhoneForPush(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return "7" + digits;
  if (digits.length === 11 && digits[0] === "8") return "7" + digits.slice(1);
  if (digits.length === 11 && digits[0] === "7") return digits;
  return digits;
}

// POST /api/client/push-subscribe
router.post("/push-subscribe", async (req, res) => {
  const { phone, endpoint, p256dh, auth } = req.body;
  if (!phone || !endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: "phone, endpoint, p256dh, auth обязательны" });
  }
  const normalizedPhone = normalizePhoneForPush(phone);
  if (normalizedPhone.length < 10) {
    return res.status(400).json({ error: "Некорректный номер телефона" });
  }

  // Upsert: delete existing subscription for same endpoint, then insert
  await db.delete(clientPushSubscriptionsTable)
    .where(eq(clientPushSubscriptionsTable.endpoint, endpoint))
    .catch(() => {});

  await db.insert(clientPushSubscriptionsTable).values({
    phone: normalizedPhone,
    endpoint,
    p256dh,
    auth,
  });

  res.json({ ok: true });
});

// POST /api/client/push-unsubscribe
router.post("/push-unsubscribe", async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: "endpoint обязателен" });

  await db.delete(clientPushSubscriptionsTable)
    .where(eq(clientPushSubscriptionsTable.endpoint, endpoint))
    .catch(() => {});

  res.json({ ok: true });
});

// ─── Auto-create order from client site ────────────────────────────────────────

// Rate limiter for client orders: max 3 per phone per 24 hours
const CLIENT_ORDER_LIMIT = 3;
const CLIENT_ORDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const clientOrderRateMap = new Map<string, { count: number; resetAt: number }>();

function checkClientOrderLimit(phone: string): { allowed: boolean; remaining: number; resetAt: Date } {
  const key = phone.replace(/\D/g, "").slice(-10);
  const now = Date.now();
  let entry = clientOrderRateMap.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + CLIENT_ORDER_WINDOW_MS };
    clientOrderRateMap.set(key, entry);
  }
  const remaining = Math.max(0, CLIENT_ORDER_LIMIT - entry.count);
  if (entry.count >= CLIENT_ORDER_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) };
  }
  entry.count++;
  return { allowed: true, remaining: CLIENT_ORDER_LIMIT - entry.count, resetAt: new Date(entry.resetAt) };
}

// POST /api/client/orders
router.post("/orders", async (req, res) => {
  const { clientName, clientPhone, city, district, serviceType, area, scheduledAt, comment } = req.body;

  if (!clientName?.trim() || !clientPhone?.trim() || !city?.trim() || !district?.trim() || !serviceType?.trim() || !area) {
    return res.status(400).json({ error: "Заполните все обязательные поля" });
  }

  const normalizedPhone = normalizePhoneForPush(clientPhone);
  if (normalizedPhone.length < 10) {
    return res.status(400).json({ error: "Некорректный номер телефона" });
  }

  const rateCheck = checkClientOrderLimit(normalizedPhone);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: `Превышен лимит заказов. Попробуйте позже.`,
      limitExceeded: true,
      resetAt: rateCheck.resetAt.toISOString(),
    });
  }

  const areaNum = Number(area);
  if (isNaN(areaNum) || areaNum <= 0) {
    return res.status(400).json({ error: "Некорректная площадь" });
  }

  try {
    // 1. Create lead
    const [lead] = await db.insert(leadsTable).values({
      clientName: clientName.trim(),
      clientPhone: normalizedPhone,
      city: city.trim(),
      district: district.trim(),
      serviceType: serviceType.trim(),
      area: String(areaNum),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      comment: comment?.trim() || null,
      source: "client_site",
      status: "new",
    }).returning();

    // 2. Create order
    const [order] = await db.insert(ordersTable).values({
      leadId: lead.id,
      city: city.trim(),
      district: district.trim(),
      serviceType: serviceType.trim(),
      area: String(areaNum),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      comment: comment?.trim() || null,
      status: "waiting_master",
      dispatchStatus: "none",
      clientName: clientName.trim(),
      clientPhone: normalizedPhone,
      source: "client_site",
      // Token model removed: always commission.
      paymentModel: "commission",
    }).returning();

    // 3. Broadcast to masters
    const broadcastResult = await performBroadcast(order.id);

    // 4. Generate access token for client
    const orderToken = `${order.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    res.json({
      ok: true,
      orderId: order.id,
      token: orderToken,
      broadcast: broadcastResult,
    });
  } catch (err: any) {
    console.error("Client order creation error:", err);
    res.status(500).json({ error: "Ошибка при создании заказа" });
  }
});

// GET /api/client/orders/:token — get order status for client
router.get("/orders/:token", async (req, res) => {
  const { token } = req.params;
  // Parse orderId from token (format: orderId-timestamp-random)
  const orderIdStr = token.split("-")[0];
  const orderId = parseInt(orderIdStr);
  if (isNaN(orderId)) return res.status(400).json({ error: "Некорректный токен" });

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order || order.source !== "client_site") {
    return res.status(404).json({ error: "Заказ не найден" });
  }

  let masterName: string | null = null;
  let masterRating: number | null = null;
  let masterAvatar: string | null = null;
  if (order.masterId) {
    const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, order.masterId));
    if (master) {
      masterName = master.alias;
      masterRating = Number(master.rating);
      masterAvatar = master.customAvatarUrl || null;
    }
  }

  res.json({
    id: order.id,
    status: order.status,
    dispatchStatus: order.dispatchStatus,
    serviceType: order.serviceType,
    city: order.city,
    district: order.district,
    area: Number(order.area),
    scheduledAt: order.scheduledAt,
    comment: order.comment,
    clientName: order.clientName,
    clientPhone: order.clientPhone,
    masterName,
    masterRating,
    masterAvatar,
    createdAt: order.createdAt,
  });
});

export default router;
