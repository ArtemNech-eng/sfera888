import { db, ordersTable, mastersTable, orderDispatchesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { getMasterEligibility, getOverdueMasterIds } from "./orderEligibility.js";
import { sendPushToMaster } from "./push.js";
import { sendMaxMessage } from "../maxBot.js";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}`;
const _DOMAIN = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
const BANNER_NEW_ORDER = _DOMAIN ? `https://${_DOMAIN}/api/banners/new_order.png` : null;

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
    return sendTg(chatId, caption, replyMarkup);
  }
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

export function buildOrderCard(order: any, orderId: number): string {
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

export interface BroadcastResult {
  ok: boolean;
  sent: number;
  skipped: number;
  error?: string;
}

export async function performBroadcast(orderId: number): Promise<BroadcastResult> {
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return { ok: false, sent: 0, skipped: 0, error: "Order not found" };

  if (order.dispatchStatus !== "none") {
    return { ok: false, sent: 0, skipped: 0, error: "Already dispatched" };
  }

  const allMasters = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), eq(mastersTable.city, order.city)));
  const reachable = allMasters.filter(m => m.telegramId || m.pwaLogin);

  if (reachable.length === 0) {
    return { ok: false, sent: 0, skipped: 0, error: `Нет активных мастеров в городе «${order.city}»` };
  }

  // Load existing "rejected" dispatch records for this order — exclude those masters (previously unassigned or expired)
  const existingRejected = await db.select({ masterId: orderDispatchesTable.masterId })
    .from(orderDispatchesTable)
    .where(and(
      eq(orderDispatchesTable.orderId, orderId),
      eq(orderDispatchesTable.status, "rejected"),
    ));
  const excludedMasterIds = new Set(existingRejected.map(r => r.masterId));

  const reachableFiltered = reachable.filter(m => !excludedMasterIds.has(m.id));

  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));

  const overdueMasterIds = await getOverdueMasterIds();

  const eligible = reachableFiltered.filter(master => {
    const myActiveCount = activeOrders.filter(o => o.masterId === master.id).length;
    return getMasterEligibility(master, myActiveCount, overdueMasterIds).canAccept;
  });

  if (eligible.length === 0) {
    return { ok: false, sent: 0, skipped: reachable.length, error: "Нет доступных мастеров для рассылки" };
  }

  const orderType = order.serviceType.toLowerCase().trim();
  const specialtyEligible = eligible.filter(master => {
    const specs = master.specializations ?? [];
    if (specs.length === 0) return true;
    return specs.some(s => {
      const sp = s.toLowerCase().trim();
      return sp === orderType || orderType.includes(sp) || sp.includes(orderType);
    });
  });

  if (specialtyEligible.length === 0) {
    return {
      ok: false, sent: 0, skipped: reachable.length,
      error: `Нет мастеров с нужной специализацией «${order.serviceType}»`,
    };
  }

  const cardText = buildOrderCard(order, orderId);
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "Откликнуться 🙋", callback_data: `respond_order_${orderId}` }],
      [{ text: "💬 Задать вопрос оператору", callback_data: `ask_question_${orderId}` }],
    ],
  };

  let sent = 0;
  const skipped = reachable.length - specialtyEligible.length;

  for (const master of specialtyEligible) {
    let msgId: string | null = null;
    if (master.telegramId) {
      msgId = BANNER_NEW_ORDER
        ? await sendTgPhoto(master.telegramId, BANNER_NEW_ORDER, cardText, replyMarkup)
        : await sendTg(master.telegramId, cardText, replyMarkup);
    }
    if (master.pwaLogin) {
      await sendPushToMaster(master.id, {
        type: "new_order",
        title: "Новый заказ",
        body: `${order.city}${order.district ? ", " + order.district : ""} · ${order.serviceType} · ${order.area} м²`,
        orderId,
      }).catch(() => {});
    }
    if (master.maxChatId) {
      const date = order.scheduledAt
        ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduledAt))
        : "не указана";
      sendMaxMessage(
        master.maxChatId,
        `📋 Новая заявка #${orderId}\n\n🔧 ${order.serviceType}\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n📐 ${order.area} м²\n📅 ${date}${order.comment ? "\n💬 " + order.comment : ""}\n\nОткройте приложение мастера, чтобы откликнуться.`
      ).catch(() => {});
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

  await db.update(ordersTable)
    .set({ dispatchStatus: "dispatching", updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  return { ok: true, sent, skipped };
}
