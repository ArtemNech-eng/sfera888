// Публичные эндпоинты лендингов. Авторизация не требуется.
//
//   POST /api/landing/leads       — форма реферального лендинга (лид, без заказа)
//   GET  /api/landing/cities      — города, где есть активные мастера
//   POST /api/landing/quick-leads — одноэкранная страница для трафика с Авито:
//                                   лид + заказ + мгновенная рассылка мастерам

import { Router, Request, Response } from "express";
import { db, leadsTable, ordersTable, mastersTable, trafficPartnersTable } from "@workspace/db";
import { eq, and, isNull, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { notifyManagerNewLead } from "../managerBot.js";
import { performBroadcast } from "../lib/broadcastOrder.js";

const router = Router();

// Simple IP rate limiter (1 req / 5 sec per IP)
const rateLimitStore = new Map<string, number>();
const RATE_LIMIT_MS = 5_000;

function checkLandingRateLimit(ip: string): boolean {
  const now = Date.now();
  const last = rateLimitStore.get(ip);
  if (last && now - last < RATE_LIMIT_MS) return false;
  rateLimitStore.set(ip, now);
  return true;
}

const landingLeadSchema = z.object({
  name: z.string().min(1, "Введите имя"),
  phone: z.string().min(5, "Введите номер телефона"),
  city: z.string().min(1, "Введите город"),
  district: z.string().min(1, "Введите адрес объекта"),
  area: z.coerce.number().min(1, "Укажите площадь работ"),
  services: z.array(z.string()).min(1, "Выберите хотя бы один вид работ"),
  comment: z.string().min(1, "Опишите задачу").max(2000),
  ref_slug: z.string().optional(),
});

router.post("/leads", async (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkLandingRateLimit(ip)) {
      return res.status(429).json({ error: "too_many_requests", message: "Слишком быстро. Подождите 5 секунд." });
    }

    const parsed = landingLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        details: parsed.error.flatten(),
      });
    }

    const body = parsed.data;

    // 1. Find partner by ref_slug (if provided)
    let partnerId: number | null = null;
    if (body.ref_slug) {
      const [partner] = await db
        .select()
        .from(trafficPartnersTable)
        .where(eq(trafficPartnersTable.refSlug, body.ref_slug))
        .limit(1);
      if (partner) {
        partnerId = partner.id;
      }
    }

    // 2. Duplicate check by phone (30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [duplicate] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.clientPhone, body.phone),
          isNull(leadsTable.deletedAt),
          gte(leadsTable.createdAt, thirtyDaysAgo)
        )
      )
      .limit(1);

    const isPossibleDuplicate = !!duplicate;

    // 3. Build service summary
    const serviceType = body.services.join(", ");
    const servicesJson = JSON.stringify(body.services);

    // 5. Create lead
    const [newLead] = await db
      .insert(leadsTable)
      .values({
        clientName: body.name,
        clientPhone: body.phone,
        city: body.city,
        district: body.district,
        serviceType,
        area: String(body.area),
        services: servicesJson,
        comment: body.comment ?? null,
        source: "landing",
        status: "new",
        trafficPartnerId: partnerId,
        partnerLeadStatus: partnerId ? "waiting_master" : null,
        isPossibleDuplicate,
        // Token model removed: always commission.
        paymentModel: "commission",
      })
      .returning();

    // 6. Update first_lead_at if this is partner's first lead
    if (partnerId) {
      const [partner] = await db
        .select()
        .from(trafficPartnersTable)
        .where(eq(trafficPartnersTable.id, partnerId))
        .limit(1);
      if (partner && !partner.firstLeadAt) {
        await db
          .update(trafficPartnersTable)
          .set({ firstLeadAt: new Date(), updatedAt: new Date() })
          .where(eq(trafficPartnersTable.id, partnerId));
      }
    }

    // 7. Notify manager (non-blocking)
    notifyManagerNewLead({
      id: newLead.id,
      clientName: newLead.clientName,
      clientPhone: newLead.clientPhone,
      city: newLead.city,
      serviceType: newLead.serviceType,
      source: newLead.source,
    }).catch((err) => console.error("[landing/leads] notifyManagerNewLead failed:", err));

    return res.status(201).json({
      ok: true,
      lead: {
        id: newLead.id,
        source: newLead.source,
        is_possible_duplicate: newLead.isPossibleDuplicate,
        created_at: newLead.createdAt,
      },
    });
  } catch (err) {
    console.error("[landing/leads] error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// ─── GET /api/landing/cities ──────────────────────────────────────────────────
// Города, в которых есть активные мастера.
//
// Важно: список берётся из mastersTable ровно тем же условием, по которому
// performBroadcast ищет получателей (status = 'active' + совпадение city).
// Если бы город на странице был свободным текстом, клиент мог бы написать
// «г. Ставрополь» или «ставрополь» — рассылка не нашла бы ни одного мастера,
// и заявка молча зависла бы в CRM. Выпадающий список из этого эндпоинта
// исключает такое расхождение по построению.

router.get("/cities", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .selectDistinct({ city: mastersTable.city })
      .from(mastersTable)
      .where(eq(mastersTable.status, "active"));

    const cities = rows
      .map((r) => (r.city ?? "").trim())
      .filter((c) => c.length > 0)
      .sort((a, b) => a.localeCompare(b, "ru"));

    return res.json({ cities });
  } catch (err) {
    console.error("[landing/cities] error:", err);
    return res.status(500).json({ error: "server_error", cities: [] });
  }
});

// ─── POST /api/landing/quick-leads ────────────────────────────────────────────
// Одноэкранная страница для трафика с Авито.
//
// Отличие от /leads: заявка не ждёт оператора. Сразу создаётся заказ и
// запускается та же рассылка, что и по кнопке «в работу» в CRM
// (leads/send-to-buffer), поэтому у мастеров она выглядит как обычная заявка.

const quickLeadSchema = z.object({
  name: z.string().trim().min(2, "Введите имя").max(100),
  phone: z.string().trim().min(6, "Введите номер телефона").max(30),
  city: z.string().trim().min(1, "Выберите город").max(100),
  address: z.string().trim().min(3, "Укажите адрес объекта").max(300),
  description: z.string().trim().min(5, "Опишите, что нужно сделать").max(2000),
  // Площадь — обязательное поле (клиент присылает число, не ноль)
  area: z.coerce.number().min(1, "Укажите примерную площадь").max(100000),
  // Вид работ — обязателен, минимум 1 чип
  services: z.array(z.string().trim().min(1).max(100)).min(1, "Выберите хотя бы один вид работ").max(12),
  // Фото объекта — по желанию, до 5 data-URL JPEG (сжимаются на клиенте до ~1024px)
  photos: z.array(z.string().startsWith("data:image/")).max(5).optional(),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  utm_term: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  referrer: z.string().max(500).optional(),
});

// Телефон приводим к +7XXXXXXXXXX: клиенты пишут его как угодно, а поиск
// дублей в CRM идёт по точному совпадению строки.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return raw.trim();
}

async function logQuickLeadEvent(leadId: number, description: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO lead_events (lead_id, event_type, description, user_alias)
      VALUES (${leadId}, ${"created"}, ${description}, ${"страница Авито"})
    `);
  } catch (err) {
    console.error("[landing/quick-leads] logLeadEvent failed:", err);
  }
}

router.post("/quick-leads", async (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkLandingRateLimit(ip)) {
      return res.status(429).json({ error: "too_many_requests", message: "Слишком быстро. Подождите 5 секунд." });
    }

    const parsed = quickLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const phone = normalizePhone(body.phone);
    const city = body.city.trim();
    const selectedServices = (body.services ?? []).map((s) => s.trim()).filter(Boolean);

    // Вид работ определяет фильтр специализаций в рассылке. Если клиент ничего
    // не выбрал, ставим общий заголовок и отключаем фильтр — иначе мастера со
    // заполненными специализациями не получили бы заявку вовсе.
    // (Клиентская валидация теперь не даёт отправить с пустым services, но
    // оставляем запас на случай старых клиентов/скриптов.)
    const serviceType = selectedServices.length > 0 ? selectedServices.join(", ") : "Ремонтные работы";
    const skipSpecialtyFilter = selectedServices.length === 0;
    const area = !Number.isNaN(body.area) && body.area > 0 ? body.area : 0;

    // Фото: сохраняем как JSON-массив data-URL в текстовое поле leads.photos
    // (оно уже существует в схеме). Ограничиваем суммарный размер, чтобы не
    // раздувать БД одним лидом.
    const photos: string[] = [];
    let photosSize = 0;
    const MAX_PHOTO_SIZE = 500 * 1024; // ~500 КБ на фото
    const MAX_TOTAL_PHOTOS_SIZE = 2 * 1024 * 1024; // ~2 МБ суммарно
    for (const p of body.photos ?? []) {
      if (photos.length >= 5) break;
      if (photosSize + p.length > MAX_TOTAL_PHOTOS_SIZE) break;
      if (p.length > MAX_PHOTO_SIZE) continue;
      photos.push(p);
      photosSize += p.length;
    }
    const photosJson = photos.length > 0 ? JSON.stringify(photos) : null;

    // Повторный клиент — мягкий сигнал для оператора, не блокировка.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [duplicate] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.clientPhone, phone), isNull(leadsTable.deletedAt), gte(leadsTable.createdAt, thirtyDaysAgo)))
      .limit(1);

    const [lead] = await db
      .insert(leadsTable)
      .values({
        clientName: body.name.trim(),
        clientPhone: phone,
        city,
        district: body.address.trim(),
        serviceType,
        area: String(area),
        services: selectedServices.length > 0 ? JSON.stringify(selectedServices) : null,
        comment: body.description.trim(),
        photos: photosJson,
        source: "avito_landing",
        status: "new",
        isPossibleDuplicate: !!duplicate,
        paymentModel: "commission",
        sourcePageType: "avito_landing",
        referrer: body.referrer ?? null,
        utmSource: body.utm_source ?? "avito",
        utmMedium: body.utm_medium ?? null,
        utmCampaign: body.utm_campaign ?? null,
        utmTerm: body.utm_term ?? null,
        utmContent: body.utm_content ?? null,
        clientIp: ip.slice(0, 45),
        clientUserAgent: req.get("user-agent") ?? null,
        consentGivenAt: new Date(),
      })
      .returning();

    notifyManagerNewLead({
      id: lead.id,
      clientName: lead.clientName,
      clientPhone: lead.clientPhone,
      city: lead.city,
      serviceType: lead.serviceType,
      source: lead.source,
    }).catch((err) => console.error("[landing/quick-leads] notifyManagerNewLead failed:", err));

    // Есть ли кому рассылать? Если активных мастеров в городе нет, заказ не
    // создаём: пусть лид останется «новым» и попадёт оператору, а не повиснет
    // заказом без единого получателя.
    const [{ count: activeMasters }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mastersTable)
      .where(and(eq(mastersTable.status, "active"), eq(mastersTable.city, city)));

    if (!activeMasters || activeMasters === 0) {
      await logQuickLeadEvent(
        lead.id,
        `Заявка со страницы Авито. В городе «${city}» нет активных мастеров — требуется ручная обработка.`
      );
      return res.status(201).json({
        ok: true,
        lead: { id: lead.id },
        order: null,
        broadcast: { started: false, reason: "no_active_masters" },
      });
    }

    // Дальше — ровно та же последовательность, что в leads/send-to-buffer.
    let order: typeof ordersTable.$inferSelect;
    try {
      order = await db.transaction(async (tx) => {
        await tx
          .update(leadsTable)
          .set({ status: "sent_to_work", updatedAt: new Date() })
          .where(eq(leadsTable.id, lead.id));
        await tx.execute(sql`UPDATE leads SET status_updated_at = NOW() WHERE id = ${lead.id}`);

        const orderResult = await tx
          .insert(ordersTable)
          .values({
            leadId: lead.id,
            city: lead.city,
            district: lead.district,
            serviceType: lead.serviceType,
            area: lead.area,
            scheduledAt: null,
            comment: lead.comment,
            status: "waiting_master",
            paymentModel: "commission",
            clientName: lead.clientName,
            clientPhone: lead.clientPhone,
            maxMasters: 3,
          })
          .returning();
        return orderResult[0];
      });
    } catch (err) {
      console.error(`[landing/quick-leads] order creation failed for lead ${lead.id}:`, err);
      // Лид уже сохранён — клиента не теряем, оператор доведёт вручную.
      await logQuickLeadEvent(lead.id, "Заявка со страницы Авито. Не удалось создать заказ — требуется ручная обработка.");
      return res.status(201).json({
        ok: true,
        lead: { id: lead.id },
        order: null,
        broadcast: { started: false, reason: "order_failed" },
      });
    }

    await logQuickLeadEvent(
      lead.id,
      `Заявка со страницы Авито. Создан заказ #${order.leadId ?? order.id}, запущена автоматическая рассылка мастерам.`
    );

    performBroadcast(order.id, false, skipSpecialtyFilter).catch((err) => {
      console.error(`[landing/quick-leads] broadcast failed for order ${order.id}:`, err);
    });

    return res.status(201).json({
      ok: true,
      lead: { id: lead.id },
      order: { id: order.id },
      broadcast: { started: true },
    });
  } catch (err) {
    console.error("[landing/quick-leads] error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
