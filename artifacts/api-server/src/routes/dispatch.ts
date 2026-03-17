import { Router } from "express";
import { db, ordersTable, mastersTable, orderDispatchesTable, leadsTable, masterMessagesTable, voronkaColumnsTable } from "@workspace/db";
import { eq, and, ne, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { sendPushToMaster } from "../lib/push.js";

const router = Router();
const TELEGRAM_API = `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}`;
const _DOMAIN = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
const BANNER_NEW_ORDER = _DOMAIN ? `https://${_DOMAIN}/api/banners/new_order.png` : null;
const BANNER_ASSIGNED  = _DOMAIN ? `https://${_DOMAIN}/api/banners/order_assigned.png` : null;

const ops = requireRole("admin", "master_operator");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendTg(chatId: string, text: string, replyMarkup?: object): Promise<string | null> {
  try {
    const body: any = { chat_id: chatId, text, parse_mode: "HTML" };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const r = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await r.json() as any;
    return json?.result?.message_id?.toString() ?? null;
  } catch {
    return null;
  }
}

async function sendTgPhoto(chatId: string, photoUrl: string, caption: string, replyMarkup?: object): Promise<string | null> {
  try {
    const body: any = { chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const r = await fetch(`${TELEGRAM_API}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await r.json() as any;
    return json?.result?.message_id?.toString() ?? null;
  } catch {
    return sendTg(chatId, caption, replyMarkup); // fallback to text
  }
}

async function editTg(chatId: string, messageId: string, text: string, replyMarkup?: object) {
  try {
    const body: any = { chat_id: chatId, message_id: parseInt(messageId), text, parse_mode: "HTML" };
    if (replyMarkup !== undefined) body.reply_markup = replyMarkup;
    await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {}
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
    `📍 Район: <b>${order.city}${order.district ? ", " + order.district : ""}</b>\n` +
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

  // Only return orders that are still in dispatching state (not yet assigned)
  const pendingOrders = orders.filter(o => o.dispatchStatus === "dispatching");
  if (pendingOrders.length === 0) return res.json([]);

  const masterIds = [...new Set(responded.map(d => d.masterId))];
  const masters = masterIds.length > 0
    ? await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds))
    : [];
  const masterMap = new Map(masters.map(m => [m.id, m]));

  res.json(pendingOrders.map(o => {
    const orderRespondents = responded.filter(d => d.orderId === o.id);
    return {
      orderId: o.id,
      serviceType: o.serviceType,
      city: o.city,
      district: o.district,
      respondentCount: orderRespondents.length,
      respondents: orderRespondents.map(d => ({
        masterId: d.masterId,
        masterName: masterMap.get(d.masterId)?.alias ?? "?",
        respondedAt: d.respondedAt,
      })),
    };
  }));
});

// ─── GET /api/dispatch/:orderId — dispatch status ──────────────────────────────

router.get("/:orderId", ops, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  const dispatches = await db.select().from(orderDispatchesTable).where(eq(orderDispatchesTable.orderId, orderId));
  const masterIds = dispatches.map(d => d.masterId);
  const masters = masterIds.length > 0
    ? await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds))
    : [];
  const masterMap = new Map(masters.map(m => [m.id, m]));

  res.json({
    dispatchStatus: order.dispatchStatus,
    dispatches: dispatches.map(d => ({
      id: d.id,
      masterId: d.masterId,
      masterName: masterMap.get(d.masterId)?.alias ?? "?",
      status: d.status,
      respondedAt: d.respondedAt ?? null,
    })),
  });
});

// ─── POST /api/dispatch/:orderId/broadcast ─────────────────────────────────────

router.post("/:orderId/broadcast", ops, async (req, res) => {
  const orderId = parseInt(req.params.orderId);

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (order.dispatchStatus !== "none") {
    return res.status(400).json({ error: "Already dispatched" });
  }

  // Find eligible masters: active, with telegramId OR pwaLogin, in the same city as the order
  const allMasters = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), eq(mastersTable.city, order.city)));
  const reachable = allMasters.filter(m => m.telegramId || m.pwaLogin);

  if (reachable.length === 0) {
    return res.status(400).json({ error: `Нет активных мастеров в городе «${order.city}» (ни в Telegram, ни в приложении)` });
  }

  // Load all active orders to check per-master limits
  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));

  // Filter out masters who have reached their order limit
  const eligible = reachable.filter(master => {
    const myActiveCount = activeOrders.filter(o => o.masterId === master.id).length;
    const limit = master.isTestMaster ? 1 : 2;
    return myActiveCount < limit;
  });

  if (eligible.length === 0) {
    return res.status(400).json({ error: "Все мастера заняты или превысили лимит заказов" });
  }

  const cardText = buildOrderCard(order, orderId);
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "Откликнуться 🙋", callback_data: `respond_order_${orderId}` }],
      [{ text: "💬 Задать вопрос оператору", callback_data: `ask_question_${orderId}` }],
    ],
  };

  let sent = 0;
  let skipped = 0;
  for (const master of reachable) {
    const myActiveCount = activeOrders.filter(o => o.masterId === master.id).length;
    const limit = master.isTestMaster ? 1 : 2;
    if (myActiveCount >= limit) {
      skipped++;
      continue;
    }

    let msgId: string | null = null;
    if (master.telegramId) {
      // Send Telegram notification for masters with Telegram
      msgId = BANNER_NEW_ORDER
        ? await sendTgPhoto(master.telegramId, BANNER_NEW_ORDER, cardText, replyMarkup)
        : await sendTg(master.telegramId, cardText, replyMarkup);
    }

    if (master.pwaLogin) {
      // Send Web Push notification for PWA masters
      await sendPushToMaster(master.id, {
        type: "new_order",
        title: "Новый заказ",
        body: `${order.city}${order.district ? ", " + order.district : ""} · ${order.serviceType} · ${order.area} м²`,
        orderId,
      }).catch(() => {});
    }

    await db.insert(orderDispatchesTable).values({
      orderId,
      masterId: master.id,
      telegramChatId: master.telegramId || `pwa_${master.id}`,
      telegramMessageId: msgId || null,
      status: "sent",
    });
    sent++;
  }

  await db.update(ordersTable).set({ dispatchStatus: "dispatching", updatedAt: new Date() }).where(eq(ordersTable.id, orderId));

  res.json({ ok: true, sent, skipped });
});

// ─── POST /api/dispatch/:orderId/assign/:masterId ──────────────────────────────

router.post("/:orderId/assign/:masterId", ops, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const masterId = parseInt(req.params.masterId);

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });

  // Get lead for client phone
  const leadRows = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId));
  const lead = leadRows[0];

  // Update order
  await db.update(ordersTable).set({
    masterId,
    status: "master_assigned",
    dispatchStatus: "assigned",
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, orderId));

  // Update dispatch records
  await db.update(orderDispatchesTable)
    .set({ status: "assigned" })
    .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.masterId, masterId)));

  await db.update(orderDispatchesTable)
    .set({ status: "rejected" })
    .where(and(eq(orderDispatchesTable.orderId, orderId), ne(orderDispatchesTable.masterId, masterId)));

  // Move master to "На объекте" column and update stats
  const allCols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  const nonReceiving = allCols.filter(c => !c.receivesOrders);
  const onSiteCol = nonReceiving.find(c => c.position > 1) ?? nonReceiving[0] ?? null;
  await db.update(mastersTable).set({
    voronkaColumnId: onSiteCol?.id ?? master.voronkaColumnId,
    totalOrders: master.totalOrders + 1,
    acceptedOrders: master.acceptedOrders + 1,
  }).where(eq(mastersTable.id, masterId));

  // Notify assigned master with full info including phone
  const assignedMsg =
    `✅ <b>Заявка #${orderId} назначена вам!</b>\n\n` +
    `🔧 Услуга: <b>${order.serviceType}</b>\n` +
    `📍 Район: <b>${order.city}${order.district ? ", " + order.district : ""}</b>\n` +
    `📐 Объём: <b>${order.area} м²</b>\n` +
    `📅 Дата: <b>${formatDate(order.scheduledAt)}</b>` +
    (order.comment ? `\n💬 Комментарий: ${order.comment}` : "") +
    (lead ? `\n\n📞 Клиент: <b>${lead.clientName}</b>\nТелефон: <b>${lead.clientPhone}</b>` : "");

  if (master.telegramId) {
    BANNER_ASSIGNED
      ? await sendTgPhoto(master.telegramId, BANNER_ASSIGNED, assignedMsg)
      : await sendTg(master.telegramId, assignedMsg);
  }

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

  // Always log to CRM chat (visible in PWA chat tab as well)
  await db.insert(masterMessagesTable).values({
    masterId: master.id,
    telegramChatId: master.telegramId ?? `pwa_${master.id}`,
    text: `✅ Назначен на заявку #${orderId}`,
    fromMaster: false,
    senderName: "system",
    isRead: false,
  }).catch(() => {});

  // Update all other dispatched messages → "Заказ взят"
  const others = await db.select().from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.orderId, orderId), ne(orderDispatchesTable.masterId, masterId)));

  const takenText =
    `📋 <b>Заявка #${orderId}</b>\n\n` +
    `🔧 Услуга: ${order.serviceType}\n` +
    `📍 Район: ${order.city}${order.district ? ", " + order.district : ""}\n\n` +
    `⛔ <b>Заявка уже назначена другому мастеру.</b>`;

  for (const d of others) {
    if (d.telegramMessageId) {
      await editTg(d.telegramChatId, d.telegramMessageId, takenText, { inline_keyboard: [] });
    }
  }

  res.json({ ok: true });
});

export default router;
