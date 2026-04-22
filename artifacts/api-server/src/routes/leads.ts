import { Router } from "express";
import { db, leadsTable, ordersTable, serviceTypesTable, citiesTable } from "@workspace/db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { notifyManagerNewLead } from "../managerBot.js";
import OpenAI from "openai";

const router = Router();

const allLeadRoles = requireRole("admin", "lead_operator");

// Parse services JSON safely
function parseServices(raw: string | null | undefined): Array<{type: string; area: number; pricePerM2: number}> | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Build serviceType summary and total area from services array
function buildServiceSummary(services: Array<{type: string; area: number; pricePerM2: number}>) {
  const types = [...new Set(services.map(s => s.type))];
  const totalArea = services.reduce((sum, s) => sum + s.area, 0);
  return { serviceType: types.join(", "), area: totalArea };
}

async function logLeadEvent(leadId: number, eventType: string, description: string, userAlias?: string) {
  try {
    await db.execute(sql`
      INSERT INTO lead_events (lead_id, event_type, description, user_alias)
      VALUES (${leadId}, ${eventType}, ${description}, ${userAlias ?? null})
    `);
  } catch {}
}

router.get("/", allLeadRoles, async (req, res) => {
  const { status, source } = req.query;
  const conditions: any[] = [isNull(leadsTable.deletedAt)];
  if (status) conditions.push(eq(leadsTable.status, status as any));
  if (source) conditions.push(eq(leadsTable.source, source as string));
  const rows = await db.select().from(leadsTable)
    .where(and(...conditions))
    .orderBy(desc(leadsTable.createdAt));

  // Fetch linked orders to include orderId in response
  const leadIds = rows.map(l => l.id);
  let ordersByLeadId: Record<number, number> = {};
  if (leadIds.length > 0) {
    const linkedOrders = await db.select({ id: ordersTable.id, leadId: ordersTable.leadId })
      .from(ordersTable)
      .where(isNull(ordersTable.deletedAt));
    for (const o of linkedOrders) {
      if (o.leadId !== null && o.leadId !== undefined) {
        ordersByLeadId[o.leadId] = o.id;
      }
    }
  }

  res.json(rows.map(l => ({
    ...l,
    area: Number(l.area),
    scheduledAt: l.scheduledAt ?? null,
    comment: l.comment ?? null,
    photos: l.photos ? JSON.parse(l.photos) : null,
    source: l.source ?? null,
    services: parseServices(l.services),
    cancellationReason: (l as any).cancellation_reason ?? null,
    orderId: ordersByLeadId[l.id] ?? null,
  })));
});

// Duplicate phone check — must be BEFORE /:id route
router.get("/check-phone", allLeadRoles, async (req, res) => {
  const phone = req.query.phone as string;
  if (!phone) return res.json({ duplicate: false });
  const rows = await db.select({ id: leadsTable.id, clientName: leadsTable.clientName, status: leadsTable.status, createdAt: leadsTable.createdAt })
    .from(leadsTable)
    .where(and(eq(leadsTable.clientPhone, phone.trim()), isNull(leadsTable.deletedAt)));
  if (rows.length === 0) return res.json({ duplicate: false });
  return res.json({ duplicate: true, existing: rows });
});

router.post("/", allLeadRoles, async (req, res) => {
  const { clientName, clientPhone, city, district, services, serviceType: rawServiceType, area: rawArea, scheduledAt, comment, source, photos } = req.body;
  if (!clientName || !clientPhone || !city || !district) {
    return res.status(400).json({ error: "Required fields missing" });
  }

  let serviceType: string;
  let area: number;
  let servicesJson: string | null = null;

  if (Array.isArray(services) && services.length > 0) {
    const summary = buildServiceSummary(services);
    serviceType = summary.serviceType;
    area = summary.area;
    servicesJson = JSON.stringify(services);
  } else {
    if (!rawServiceType || !rawArea) return res.status(400).json({ error: "Required fields missing" });
    serviceType = rawServiceType;
    area = Number(rawArea);
  }

  const result = await db.insert(leadsTable).values({
    clientName,
    clientPhone,
    city,
    district,
    serviceType,
    area: String(area),
    services: servicesJson,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    comment: comment ?? null,
    photos: Array.isArray(photos) && photos.length > 0 ? JSON.stringify(photos) : null,
    source: source ?? null,
    status: "new",
  }).returning();
  const lead = result[0];

  const userAlias = (req.session as any)?.user?.name ?? (req.session as any)?.user?.login ?? "оператор";
  await logLeadEvent(lead.id, "created", `Заявка создана. Клиент: ${clientName}, источник: ${source ?? "не указан"}`, userAlias);

  // Notify manager bot about new lead (non-blocking)
  notifyManagerNewLead({
    id: lead.id,
    clientName: lead.clientName,
    clientPhone: lead.clientPhone,
    city: lead.city,
    serviceType: lead.serviceType,
    source: lead.source,
  }).catch(() => {});

  return res.status(201).json({
    ...lead,
    area: Number(lead.area),
    scheduledAt: lead.scheduledAt ?? null,
    comment: lead.comment ?? null,
    source: lead.source ?? null,
    services: parseServices(lead.services),
    cancellationReason: null,
    orderId: null,
  });
});

router.get("/:id", allLeadRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  if (!rows[0]) return res.status(404).json({ error: "Lead not found" });
  const l = rows[0];
  const orders = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.leadId, id));
  res.json({
    ...l,
    area: Number(l.area),
    scheduledAt: l.scheduledAt ?? null,
    comment: l.comment ?? null,
    source: l.source ?? null,
    services: parseServices(l.services),
    cancellationReason: (l as any).cancellation_reason ?? null,
    orderId: orders[0]?.id ?? null,
  });
});

// Lead events timeline
router.get("/:id/events", allLeadRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.execute(sql`
    SELECT id, lead_id, event_type, description, user_alias, created_at
    FROM lead_events
    WHERE lead_id = ${id}
    ORDER BY created_at ASC
  `);
  res.json((rows as any).rows ?? rows);
});

router.patch("/:id", allLeadRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { clientName, clientPhone, city, district, serviceType, area, scheduledAt, comment, source, status, services, photos, cancellationReason } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (clientName !== undefined) updates.clientName = clientName;
  if (clientPhone !== undefined) updates.clientPhone = clientPhone;
  if (city !== undefined) updates.city = city;
  if (district !== undefined) updates.district = district;
  if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (comment !== undefined) updates.comment = comment;
  if (source !== undefined) updates.source = source;
  if (status !== undefined) updates.status = status;
  if (photos !== undefined) {
    updates.photos = Array.isArray(photos) && photos.length > 0 ? JSON.stringify(photos) : null;
  }
  if (services !== undefined && Array.isArray(services) && services.length > 0) {
    const summary = buildServiceSummary(services);
    updates.services = JSON.stringify(services);
    updates.serviceType = summary.serviceType;
    updates.area = String(summary.area);
  } else {
    if (serviceType !== undefined) updates.serviceType = serviceType;
    if (area !== undefined) updates.area = String(area);
  }

  const result = await db.update(leadsTable).set(updates).where(eq(leadsTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Lead not found" });
  const l = result[0];

  const userAlias = (req.session as any)?.user?.name ?? (req.session as any)?.user?.login ?? "оператор";

  // Save cancellation_reason if provided
  if (cancellationReason !== undefined) {
    await db.execute(sql`UPDATE leads SET cancellation_reason = ${cancellationReason} WHERE id = ${id}`);
  }

  // Log status change event
  if (status !== undefined) {
    const STATUS_LABELS: Record<string, string> = {
      new: "Новая",
      processing: "В обработке",
      sent_to_work: "Отправлена в работу",
      non_target: "Нецелевая",
      client_refusal: "Отказ клиента",
    };
    const label = STATUS_LABELS[status] ?? status;
    const reasonSuffix = cancellationReason ? `. Причина: ${cancellationReason}` : "";
    await logLeadEvent(id, "status_changed", `Статус изменён на «${label}»${reasonSuffix}`, userAlias);
    await db.execute(sql`UPDATE leads SET status_updated_at = NOW() WHERE id = ${id}`);
  }

  // When marking a lead as non_target, auto-cancel any associated active order
  if (status === "non_target") {
    const ACTIVE_STATUSES = ["waiting_master", "master_assigned", "in_progress", "cancellation_requested", "proposed_amount"];
    const linkedOrders = await db.select().from(ordersTable).where(eq(ordersTable.leadId, id));
    for (const order of linkedOrders) {
      if (ACTIVE_STATUSES.includes(order.status)) {
        await db.update(ordersTable).set({
          status: "cancelled",
          cancelReason: "Лид помечен как не целевой",
          updatedAt: new Date(),
        }).where(eq(ordersTable.id, order.id));
      }
    }
  }

  const orders = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.leadId, id));
  res.json({
    ...l,
    area: Number(l.area),
    scheduledAt: l.scheduledAt ?? null,
    comment: l.comment ?? null,
    source: l.source ?? null,
    services: parseServices(l.services),
    photos: l.photos ? JSON.parse(l.photos) : null,
    cancellationReason: cancellationReason ?? (l as any).cancellation_reason ?? null,
    orderId: orders[0]?.id ?? null,
  });
});

router.post("/:id/send-to-buffer", allLeadRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  const lead = rows[0];
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  await db.update(leadsTable).set({ status: "sent_to_work", updatedAt: new Date() }).where(eq(leadsTable.id, id));
  await db.execute(sql`UPDATE leads SET status_updated_at = NOW() WHERE id = ${id}`);

  const orderResult = await db.insert(ordersTable).values({
    leadId: lead.id,
    city: lead.city,
    district: lead.district,
    serviceType: lead.serviceType,
    area: lead.area,
    services: lead.services ?? null,
    scheduledAt: lead.scheduledAt,
    comment: lead.comment,
    status: "waiting_master",
  }).returning();
  const order = orderResult[0];

  const userAlias = (req.session as any)?.user?.name ?? (req.session as any)?.user?.login ?? "оператор";
  await logLeadEvent(id, "sent_to_work", `Заявка отправлена в работу. Создан заказ #${order.leadId ?? order.id}`, userAlias);

  res.json({
    id: order.id,
    leadId: order.leadId,
    city: order.city,
    district: order.district,
    serviceType: order.serviceType,
    area: Number(order.area),
    services: parseServices(order.services ?? null),
    scheduledAt: order.scheduledAt ?? null,
    comment: order.comment ?? null,
    status: order.status,
    masterId: order.masterId ?? null,
    masterName: null,
    orderAmount: order.orderAmount ? Number(order.orderAmount) : null,
    commission: order.commission ? Number(order.commission) : null,
    clientRating: order.clientRating ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  });
});

// DELETE /api/leads/:id — soft delete (move to trash)
router.delete("/:id", allLeadRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(leadsTable).set({ deletedAt: new Date() }).where(eq(leadsTable.id, id));
  res.json({ success: true });
});

// POST /api/leads/ai-parse — parse unstructured text into order fields
router.post("/ai-parse", allLeadRoles, async (req, res) => {
  const { text } = req.body ?? {};
  if (!text || typeof text !== "string" || text.trim().length < 5) {
    return res.status(400).json({ error: "Текст слишком короткий" });
  }

  const [serviceRows, cityRows] = await Promise.all([
    db.select().from(serviceTypesTable),
    db.select().from(citiesTable),
  ]);
  const serviceList = serviceRows.map(s => s.name).join(", ");
  const cityList = cityRows.map(c => c.name).join(", ");

  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  const today = new Date().toISOString().slice(0, 10);

  const systemPrompt = `Ты помощник оператора строительной компании. Твоя задача — извлечь структурированные данные из произвольного текста (сообщение от клиента, переписка, голосовое расшифровано и т.д.) и вернуть JSON.

Доступные города: ${cityList || "Краснодар, Москва, Санкт-Петербург"}
Доступные типы услуг: ${serviceList || "Шпаклёвка стен и потолков, Укладка плитки, Поклейка обоев, Покраска стен"}
Источники: call, website, ads, avito, whatsapp, referral, telegram, other
Сегодня: ${today}

Верни ТОЛЬКО валидный JSON без markdown без пояснений:
{
  "clientName": "имя или null",
  "clientPhone": "телефон в формате +7XXXXXXXXXX или null",
  "city": "название города из списка или null",
  "district": "район/адрес или null",
  "scheduledAt": "дата и время в формате YYYY-MM-DDTHH:MM или null",
  "source": "один из допустимых source или null",
  "comment": "дополнительный комментарий который не вошёл в другие поля или null",
  "services": [
    { "type": "название услуги из списка", "area": число_м2_или_0, "pricePerM2": цена_за_м2_или_0 }
  ]
}

Правила:
- services всегда массив (минимум один элемент если работа упомянута, иначе пустой массив)
- Если площадь не указана — area: 0
- Если цена не указана — pricePerM2: 0
- Телефон очищай от пробелов, дефисов; если начинается с 8 — меняй на +7
- Город из текста сопоставляй с доступными городами (нечёткое сопоставление)
- Дату/время переводи в ISO формат; если год не указан — текущий год`;

  try {
    const TIMEOUT_MS = 18000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS)
    );

    // NOTE: gpt-5 is a reasoning model — reasoning tokens count toward max_completion_tokens.
    // Use a high limit so there's room for both thinking and JSON output.
    const callPromise = openai.chat.completions.create({
      model: "gpt-5",
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text.trim().slice(0, 2000) },
      ],
    } as any);

    const completion = await Promise.race([callPromise, timeoutPromise]);
    const choice = completion.choices[0];
    const raw = choice?.message?.content ?? "";

    if (!raw) return res.status(500).json({ error: "ИИ вернул пустой ответ — попробуйте снова" });

    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (e: any) {
    console.error("[ai-parse] error:", e?.message ?? e);
    if (e?.message === "TIMEOUT") {
      return res.status(504).json({ error: "ИИ не ответил вовремя — попробуйте ещё раз" });
    }
    res.status(500).json({ error: "Ошибка: " + (e?.message ?? "unknown") });
  }
});

export default router;
