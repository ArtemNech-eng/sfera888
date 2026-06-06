import { Router } from "express";
import { db, ordersTable, mastersTable, orderDispatchesTable, leadsTable, masterMessagesTable, voronkaColumnsTable, orderStatusLogsTable, mlPricingDecisionsTable } from "@workspace/db";
import { eq, and, ne, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { sendPushToMaster } from "../lib/push.js";
import { getOverdueMasterIds, getMasterEligibility } from "../lib/orderEligibility.js";
import { performBroadcast, performResend } from "../lib/broadcastOrder.js";
import { sendMaxMessage, sendOnboardingMemo } from "../maxBot.js";
import { getOrderTokenCost, deductTokensTx, TokenWalletError, ERR_INSUFFICIENT_TOKENS } from "../lib/tokenWallet.js";

const router = Router();
// Telegram-бот удалён — рассылка только через PWA push и Max.

const ops = requireRole("admin", "master_operator");

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Build a personalised rejection reason for a master who was not assigned (plain text for Max)
async function buildRejectionReason(
  master: { id: number; debt: string | null; contractSignedAt: Date | null; contractLink: string | null },
  responseNote: string | null
): Promise<string> {
  // Parse constraint tags stored at response time
  const tags: string[] = [];
  if (responseNote) {
    const m = responseNote.match(/⚠️\s*([^|]+)/);
    if (m) m[1].split(",").forEach(t => { const s = t.trim(); if (s) tags.push(s); });
  }

  // Count cancellations in DB
  const [row] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(and(eq(ordersTable.masterId, master.id), eq(ordersTable.status, "cancelled")));
  const cancellations = row?.cnt ?? 0;

  const bullets: string[] = [];

  const debt = parseFloat(String(master.debt ?? "0"));
  if (debt > 0) {
    bullets.push(`💸 Погасите задолженность (${debt.toLocaleString("ru-RU")} ₽) — мастера без долгов получают приоритет`);
  }

  if (!master.contractSignedAt && !master.contractLink) {
    bullets.push(`📄 Оформите договор с компанией — мастера с договором назначаются чаще`);
  }

  if (cancellations >= 3) {
    bullets.push(`❌ Снизьте отмены — у вас ${cancellations} отменённых заказов, это снижает приоритет`);
  }

  if (tags.includes("ФОМО")) {
    bullets.push(`⚡ Отвечайте быстрее — скорость отклика влияет на приоритет назначения`);
  }

  if (tags.includes("С лимитом")) {
    bullets.push(`📋 Расширьте лимит заявок — обратитесь к оператору`);
  }

  if (bullets.length === 0) {
    return `👍 Вы всё сделали правильно — на этот раз просто выбрали другого мастера. Продолжайте откликаться!`;
  }

  return `Что поможет получить следующий заказ:\n${bullets.map(b => `• ${b}`).join("\n")}`;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "не указана";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

function buildOrderCard(order: any, orderId: number): string {
  let servicesBlock = "";
  try {
    const srvs = order.services ? JSON.parse(order.services) : null;
    if (Array.isArray(srvs) && srvs.length > 0) {
      servicesBlock = srvs.map((s: any, i: number) =>
        `   ${i + 1}. <b>${s.type}</b> — ${s.area} м²${s.pricePerM2 ? ` × ${s.pricePerM2.toLocaleString("ru-RU")} ₽/м²` : ""}`
      ).join("\n");
      servicesBlock = `\n🔧 Услуги:\n${servicesBlock}\n`;
    }
  } catch {}

  if (!servicesBlock) {
    servicesBlock = `\n🔧 Услуга: <b>${order.serviceType}</b>\n📐 Объём: <b>${order.area} м²</b>\n`;
  }

  return (
    `📋 <b>Новая заявка #${orderId}</b>\n` +
    servicesBlock +
    `📍 Адрес: <b>${order.city}${order.district ? ", " + order.district : ""}</b>\n` +
    `📅 Дата: <b>${formatDate(order.scheduledAt)}</b>` +
    (order.comment ? `\n💬 Комментарий: ${order.comment}` : "") +
    `\n\n<i>Нажмите кнопку, чтобы откликнуться. Телефон клиента будет передан после подтверждения оператором.</i>`
  );
}

// ─── GET /api/dispatch/pending — orders with unprocessed responses ────────────

router.get("/pending", ops, async (req, res) => {
  // Find all dispatch records with status "responded"
  const responded = await db.select().from(orderDispatchesTable)
    .where(eq(orderDispatchesTable.status, "responded"));

  if (responded.length === 0) return res.json([]);

  const orderIds = [...new Set(responded.map(d => d.orderId))];
  const orders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.id, orderIds));

  // Only return orders that are still in dispatching state (not cancelled/completed)
  const pendingOrders = orders.filter(o =>
    o.dispatchStatus === "dispatching" &&
    o.status !== "cancelled" &&
    o.status !== "completed"
  );
  if (pendingOrders.length === 0) return res.json([]);

  const masterIds = [...new Set(responded.map(d => d.masterId))];
  const masters = masterIds.length > 0
    ? await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds))
    : [];
  const masterMap = new Map(masters.map(m => [m.id, m]));

  // Скоринг: считаем для всех откликнувшихся мастеров одним батчем,
  // адрес/район — для каждой заявки свой, поэтому считаем отдельно по orderId.
  const { scoreMasters } = await import("../lib/masterScoring.js");
  const scoresByOrder = new Map<number, Map<number, { total: number; segment: string; isCold: boolean }>>();
  for (const o of pendingOrders) {
    const orderMasterIds = responded.filter(d => d.orderId === o.id).map(d => d.masterId);
    if (orderMasterIds.length === 0) continue;
    const scoreMap = await scoreMasters(orderMasterIds, { district: o.district });
    scoresByOrder.set(o.id, new Map([...scoreMap].map(([id, s]) => [id, {
      total: s.total, segment: s.segment, isCold: s.isCold,
    }])));
  }

  res.json(pendingOrders.map(o => {
    const orderRespondents = responded.filter(d => d.orderId === o.id);
    const scoreMap = scoresByOrder.get(o.id);
    return {
      orderId: o.id,
      leadId: o.leadId ?? null,
      serviceType: o.serviceType,
      city: o.city,
      district: o.district,
      respondentCount: orderRespondents.length,
      respondents: orderRespondents.map(d => {
        const s = scoreMap?.get(d.masterId);
        return {
          masterId: d.masterId,
          masterName: masterMap.get(d.masterId)?.alias ?? `Мастер #${d.masterId}`,
          respondedAt: d.respondedAt,
          responseNote: (d as any).responseNote ?? null,
          score: s?.total ?? null,
          segment: s?.segment ?? null,
          isCold: s?.isCold ?? false,
        };
      }),
    };
  }));
});

// ─── GET /api/dispatch/:orderId — dispatch status ──────────────────────────────

router.get("/:orderId", ops, async (req, res) => {
  const orderId = parseInt(String(req.params.orderId));
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  const dispatches = await db.select().from(orderDispatchesTable).where(eq(orderDispatchesTable.orderId, orderId));
  const masterIds = dispatches.map(d => d.masterId);
  const masters = masterIds.length > 0
    ? await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds))
    : [];
  const masterMap = new Map(masters.map(m => [m.id, m]));

  // Recover names for masters missing from mastersTable (e.g. hard-deleted records)
  const missingIds = masterIds.filter(id => !masterMap.has(id));
  const nameRecoveryMap = new Map<number, string>();
  if (missingIds.length > 0) {
    const logs = await db.select({ note: orderStatusLogsTable.note })
      .from(orderStatusLogsTable)
      .where(and(
        eq(orderStatusLogsTable.orderId, orderId),
        eq(orderStatusLogsTable.newStatus, "master_assigned"),
      ));
    for (const log of logs) {
      if (log.note) {
        const m = log.note.match(/Назначен(?:\s+вручную)?:\s*(.+)/);
        if (m?.[1] && order.masterId && missingIds.includes(order.masterId)) {
          nameRecoveryMap.set(order.masterId, m[1].trim());
        }
      }
    }
  }

  res.json({
    dispatchStatus: order.dispatchStatus,
    dispatches: dispatches.map(d => ({
      id: d.id,
      masterId: d.masterId,
      masterName: masterMap.get(d.masterId)?.alias ?? nameRecoveryMap.get(d.masterId) ?? `Мастер #${d.masterId}`,
      masterCity: masterMap.get(d.masterId)?.city ?? null,
      status: d.status,
      respondedAt: d.respondedAt ?? null,
      rejectionReason: (d as any).rejectionReason ?? null,
      responseNote: (d as any).responseNote ?? null,
    })),
  });
});

// ─── POST /api/dispatch/test-order ────────────────────────────────────────────
// Creates a real order and sends it ONLY to a specific (test) master

router.post("/test-order", ops, async (req, res) => {
  const { masterId, serviceType, area, city, district, scheduledAt, comment } = req.body;

  if (!masterId || !serviceType || !area || !city) {
    return res.status(400).json({ error: "masterId, serviceType, area и city обязательны" });
  }

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, parseInt(masterId)));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Мастер не найден" });
  if (!master.pwaLogin && !master.maxChatId) {
    return res.status(400).json({ error: "У мастера нет ни PWA, ни Max — невозможно отправить заказ" });
  }

  // Create a placeholder lead for the test order
  const [lead] = await db.insert(leadsTable).values({
    clientName: "Тестовый клиент",
    clientPhone: "+70000000000",
    city: city.trim(),
    district: district?.trim() || "Тест",
    serviceType: serviceType.trim(),
    area: String(area),
    comment: comment?.trim() || null,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    source: "test",
    status: "sent_to_work",
    paymentModel: "token",
  }).returning();

  // Create the order linked to that lead
  const [order] = await db.insert(ordersTable).values({
    leadId: lead.id,
    city: lead.city,
    district: lead.district,
    serviceType: lead.serviceType,
    area: lead.area,
    comment: lead.comment,
    scheduledAt: lead.scheduledAt,
    status: "waiting_master",
    dispatchStatus: "dispatching",
    paymentModel: "token",
  }).returning();

  // Send only to the specific master (PWA push + Max)
  if (master.pwaLogin) {
    await sendPushToMaster(master.id, {
      type: "new_order",
      title: "Новый заказ (тест)",
      body: `${order.city}${order.district ? ", " + order.district : ""} · ${order.serviceType} · ${order.area} м²`,
      orderId: order.id,
    }).catch(() => {});
  }
  if (master.maxChatId) {
    const tDate = order.scheduledAt
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduledAt))
      : "не указана";
    sendMaxMessage(
      master.maxChatId,
      `📋 Тестовая заявка #${order.id}\n\n🔧 ${order.serviceType}\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n📐 ${order.area} м²\n📅 ${tDate}${order.comment ? "\n💬 " + order.comment : ""}\n\n👉 Откликнитесь в приложении:\nhttps://sfera-master.ru/master-pwa/orders`
    ).catch(() => {});
  }

  await db.insert(orderDispatchesTable).values({
    orderId: order.id,
    masterId: master.id,
    telegramChatId: `pwa_${master.id}`,
    telegramMessageId: null,
    status: "sent",
  });

  res.json({ ok: true, orderId: order.id });
});

// ─── POST /api/dispatch/:orderId/broadcast ─────────────────────────────────────

router.post("/:orderId/broadcast", ops, async (req, res) => {
  const orderId = parseInt(String(req.params.orderId));
  try {
    const result = await performBroadcast(orderId);
    if (result.ok && result.sent > 0) {
      await db.execute(sql`UPDATE orders SET broadcast_count = COALESCE(broadcast_count, 0) + 1, last_broadcast_at = NOW() WHERE id = ${orderId}`);
    }
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error ?? "Рассылка не удалась" });
    }
    return res.json({ ok: true, sent: result.sent, skipped: result.skipped, message: `Рассылка запущена (${result.sent} мастеров)` });
  } catch (err: any) {
    console.error("[broadcast] error for order", orderId, err);
    return res.status(500).json({ ok: false, error: err.message ?? "Внутренняя ошибка при рассылке" });
  }
});

// ─── POST /api/dispatch/:orderId/resend ────────────────────────────────────────

router.post("/:orderId/resend", ops, async (req, res) => {
  const orderId = parseInt(String(req.params.orderId));
  const userId = (req as any).user?.id ?? null;

  setImmediate(async () => {
    try {
      const result = await performResend(orderId, userId);
      if (!result.ok) {
        console.error(`[resend] order=${orderId} failed: ${result.error}`);
      } else {
        console.log(`[resend] order=${orderId} sent=${result.sent}`);
      }
    } catch (err: any) {
      console.error("[resend] background error for order", orderId, err);
    }
  });

  res.json({ ok: true, message: "Повторная рассылка запущена" });
});

// ─── POST /api/dispatch/:orderId/add-master/:masterId — add a single master to dispatch ──
router.post("/:orderId/add-master/:masterId", ops, async (req, res) => {
  const orderId = parseInt(String(req.params.orderId));
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(orderId) || isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return res.status(404).json({ error: "Order not found" });

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!master) return res.status(404).json({ error: "Master not found" });

  // Check if already dispatched
  const existing = await db.select().from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.masterId, masterId)));
  if (existing.length > 0) return res.status(409).json({ error: "Already dispatched to this master", status: existing[0].status });

  // Send notification (PWA push + Max only — Telegram удалён)
  if (master.maxChatId) {
    await sendMaxMessage(master.maxChatId,
      `📋 Рассылка заказов\n🔔 Новый заказ!\n\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n🔧 ${order.serviceType}\n📐 ${order.area} м²\n\n👉 Откликнитесь в приложении:\nhttps://sfera-master.ru/master-pwa/orders`
    ).catch(() => {});
  }
  if (master.pwaLogin) {
    await sendPushToMaster(master.id, { type: "new_order", title: "Новый заказ", body: `${order.city} · ${order.serviceType}`, orderId }).catch(() => {});
  }

  await db.insert(orderDispatchesTable).values({
    orderId, masterId,
    telegramChatId: `pwa_${master.id}`,
    telegramMessageId: null,
    status: "sent",
  });
  await db.update(mastersTable).set({ totalLeadsReceived: sql`${mastersTable.totalLeadsReceived} + 1` }).where(eq(mastersTable.id, masterId));

  res.json({ ok: true, orderId, masterId, masterAlias: master.alias });
});

// ─── POST /api/dispatch/:orderId/assign/:masterId ──────────────────────────────

router.post("/:orderId/assign/:masterId", ops, async (req, res) => {
  const orderId = parseInt(String(req.params.orderId));
  const masterId = parseInt(String(req.params.masterId));

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });

  // Get lead for client phone
  const leadRows = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId));
  const lead = leadRows[0];

  const isTokenModel = (order as any).paymentModel === "token";
  let tokensCost = 0;
  if (isTokenModel) {
    const { cost } = await getOrderTokenCost({
      serviceType: order.serviceType,
      area: order.area ? Number(order.area) : null,
      manualTokenCost: (order as any).manualTokenCost ?? null,
      city: order.city ?? null,
    });
    tokensCost = cost;
  }

  let respondedDispatches: any[] = [];

  try {
    await db.transaction(async (tx) => {
      if (isTokenModel) {
        const deduction = await deductTokensTx(tx, {
          masterId,
          orderId,
          tokensCost,
          serviceType: order.serviceType,
        });
        if (!deduction.success) {
          throw deduction.error;
        }
      }

      // Update order
      await tx.update(ordersTable).set({
        masterId,
        status: "master_assigned",
        dispatchStatus: "assigned",
        updatedAt: new Date(),
        ...(isTokenModel ? { tokensCharged: String(tokensCost) } : {}),
      }).where(eq(ordersTable.id, orderId));

      // Update dispatch records
      await tx.update(orderDispatchesTable)
        .set({ status: "assigned" })
        .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.masterId, masterId)));

      // Fetch respondents BEFORE status changes (for personalised rejection notifications)
      respondedDispatches = await tx.select()
        .from(orderDispatchesTable)
        .where(and(
          eq(orderDispatchesTable.orderId, orderId),
          ne(orderDispatchesTable.masterId, masterId),
          eq(orderDispatchesTable.status, "responded"),
        ));

      await tx.update(orderDispatchesTable)
        .set({ status: "rejected" })
        .where(and(eq(orderDispatchesTable.orderId, orderId), ne(orderDispatchesTable.masterId, masterId)));

      // Move master to "На объекте" column and update stats
      const allCols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
      const nonReceiving = allCols.filter(c => !c.receivesOrders);
      const onSiteCol = nonReceiving.find(c => c.position > 1) ?? nonReceiving[0] ?? null;
      await tx.update(mastersTable).set({
        voronkaColumnId: onSiteCol?.id ?? master.voronkaColumnId,
        totalOrders: master.totalOrders + 1,
        acceptedOrders: master.acceptedOrders + 1,
      }).where(eq(mastersTable.id, masterId));

      // Log assignment to CRM chat
      await tx.insert(masterMessagesTable).values({
        masterId: master.id,
        telegramChatId: `pwa_${master.id}`,
        text: `✅ Назначен на заявку #${orderId}${isTokenModel ? ` (токеновая модель). Списано ${tokensCost} т.` : ""}`,
        fromMaster: false,
        senderName: "system",
        isRead: false,
      }).catch(() => {});
    });
  } catch (e) {
    if (e instanceof TokenWalletError && e.code === ERR_INSUFFICIENT_TOKENS) {
      return res.status(402).json({ error: e.message, insufficientTokens: true });
    }
    throw e;
  }

  // Notify assigned master with full info including phone
  const assignedMsg =
    `✅ <b>Заявка #${orderId} назначена вам!</b>\n\n` +
    `🔧 Услуга: <b>${order.serviceType}</b>\n` +
    `📍 Адрес: <b>${order.city}${order.district ? ", " + order.district : ""}</b>\n` +
    `📐 Объём: <b>${order.area} м²</b>\n` +
    `📅 Дата: <b>${formatDate(order.scheduledAt)}</b>` +
    (order.comment ? `\n💬 Комментарий: ${order.comment}` : "") +
    (lead ? `\n\n📞 Клиент: <b>${lead.clientName}</b>\nТелефон: <b>${lead.clientPhone}</b>` : "");

  // Telegram удалён — уведомления только PWA push + Max.
  void assignedMsg;

  // Push notification to assigned master
  if (master.pwaLogin) {
    await sendPushToMaster(master.id, {
      type: "order_assigned",
      title: "✅ Заявка назначена вам!",
      body: `${order.serviceType} · ${order.city}${order.district ? ", " + order.district : ""}` +
        (lead ? ` · ${lead.clientPhone}` : ""),
      orderId,
    }).catch(() => {});
  }
  if (master.maxChatId) {
    // First order ever → send onboarding memo after a short delay
    if (master.acceptedOrders === 0) {
      setTimeout(() => sendOnboardingMemo(master.maxChatId!).catch(() => {}), 10_000);
    }
  }

  // Telegram удалён — других мастеров уведомляем через PWA push ниже.

  // ── Personalised rejection notifications for respondents ─────────────────
  if (respondedDispatches.length > 0) {
    const rejectedIds = respondedDispatches.map(d => d.masterId);
    const rejectedMasters = rejectedIds.length > 0
      ? await db.select().from(mastersTable).where(inArray(mastersTable.id, rejectedIds))
      : [];

    for (const rm of rejectedMasters) {
      const disp = respondedDispatches.find(d => d.masterId === rm.id);
      const responseNote = (disp as any)?.responseNote ?? null;

      const reason = await buildRejectionReason(rm, responseNote);

      const rejMsg =
        `📋 Заявка #${orderId} — ${order.serviceType} · ${order.city}${order.district ? ", " + order.district : ""}\n\n` +
        `К сожалению, эту заявку назначили другому мастеру.\n\n` +
        reason;

      // Max bot
      if (rm.maxChatId) sendMaxMessage(rm.maxChatId, rejMsg).catch(() => {});

      // PWA push
      if (rm.pwaLogin) {
        sendPushToMaster(rm.id, {
          type: "order_rejected",
          title: "📋 Заявка занята",
          body: reason.replace(/<[^>]+>/g, "").slice(0, 120),
          orderId,
        } as any).catch(() => {});
      }

      // CRM chat log (visible to operators)
      const logText = `⛔ Не назначен на заявку #${orderId}. ${reason.replace(/<[^>]+>/g, "").slice(0, 200)}`;
      await db.insert(masterMessagesTable).values({
        masterId: rm.id,
        telegramChatId: `pwa_${rm.id}`,
        text: logText,
        fromMaster: false,
        senderName: "system",
        isRead: false,
      }).catch(() => {});
    }
  }

  // Record ML training data
  try {
    const now = new Date();
    await db.insert(mlPricingDecisionsTable).values({
      orderId,
      masterId,
      tokensCharged: String(tokensCost),
      maxMasters: order.maxMasters ?? 3,
      assignedCount: (order.assignedMasterCount ?? 0) + 1,
      serviceType: order.serviceType,
      city: order.city,
      district: order.district,
      area: order.area ? String(order.area) : null,
      scheduledAt: order.scheduledAt,
      hourOfDay: now.getHours(),
      isWeekend: now.getDay() === 0 || now.getDay() === 6,
      masterRating: master.rating ? String(master.rating) : null,
      masterExperience: master.acceptedOrders ?? 0,
    });
  } catch (e) {
    console.error("[ml-pricing-decisions] insert failed:", e);
  }

  res.json({ ok: true });
});

export default router;
