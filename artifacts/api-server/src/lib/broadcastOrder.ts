import { db, ordersTable, mastersTable, orderDispatchesTable, masterCheckinsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getMasterEligibility, getOverdueMasterIds } from "./orderEligibility.js";
import { sendPushToMaster } from "./push.js";
import { sendMaxMessage } from "../maxBot.js";

// Telegram-бот удалён — мастера получают заявки только через PWA push и Max.
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
    `📍 Адрес: <b>${order.city}${order.district ? ", " + order.district : ""}</b>\n` +
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

export interface BroadcastSkipStats {
  notReachable: number;
  rejected: number;
  notEligible: number;
  wrongSpecialty: number;
  notReady: number;
}

export async function performBroadcast(
  orderId: number,
  force = false,
  skipSpecialtyFilter = false,
): Promise<BroadcastResult & { skipStats?: BroadcastSkipStats }> {
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return { ok: false, sent: 0, skipped: 0, error: "Order not found" };

  if (order.dispatchStatus !== "none" && !force) {
    return { ok: false, sent: 0, skipped: 0, error: "Already dispatched" };
  }

  // Force re-broadcast: delete old "sent" (unanswered) dispatches so masters get a fresh notification.
  // Keep "rejected" records so explicitly refused masters are still excluded.
  if (force && order.dispatchStatus !== "none") {
    await db.delete(orderDispatchesTable)
      .where(and(
        eq(orderDispatchesTable.orderId, orderId),
        eq(orderDispatchesTable.status, "sent"),
      ));
    await db.update(ordersTable)
      .set({ dispatchStatus: "none", updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));
  }

  // Рассылаем заявку ВСЕМ активным мастерам в городе, включая заблокированных.
  // Это создаёт ажиотаж/FOMO: все видят, что в городе есть работа.
  // Фильтр репутации применяется на этапе отклика (см. master-pwa.ts /respond
  // и telegram.ts respond_order_*) — заблокированный мастер получает понятное
  // уведомление с причиной отказа, оператор видит активность как сигнал к разблоку.
  const allMasters = await db.select().from(mastersTable)
    .where(and(
      eq(mastersTable.status, "active"),
      eq(mastersTable.city, order.city),
    ));

  const skipStats: BroadcastSkipStats = {
    notReachable: 0, rejected: 0, notEligible: 0, wrongSpecialty: 0, notReady: 0,
  };

  // Telegram-бот удалён: считаем мастера достижимым только при наличии PWA-логина или Max-чата.
  const reachable = allMasters.filter(m => {
    if (m.pwaLogin || m.maxChatId) return true;
    skipStats.notReachable++;
    return false;
  });

  if (reachable.length === 0) {
    return { ok: false, sent: 0, skipped: 0, error: `Нет активных мастеров в городе «${order.city}»` };
  }

  // Load existing "rejected" dispatch records for this order — exclude those masters
  const existingRejected = await db.select({ masterId: orderDispatchesTable.masterId })
    .from(orderDispatchesTable)
    .where(and(
      eq(orderDispatchesTable.orderId, orderId),
      eq(orderDispatchesTable.status, "rejected"),
    ));
  const excludedMasterIds = new Set(existingRejected.map(r => r.masterId));

  const reachableFiltered = reachable.filter(m => {
    if (!excludedMasterIds.has(m.id)) return true;
    skipStats.rejected++;
    return false;
  });

  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));

  const overdueMasterIds = await getOverdueMasterIds();

  // No eligibility filter on broadcast — all reachable active masters in the city
  // receive the order. Constraints (limit, debt, FOMO, no contract) are tagged in CRM
  // when the master responds, so the operator sees the full picture.
  const eligible = reachableFiltered;

  if (eligible.length === 0) {
    return { ok: false, sent: 0, skipped: reachable.length, error: "Нет доступных мастеров для рассылки", skipStats };
  }

  // Specialty filter — can be bypassed with skipSpecialtyFilter
  let specialtyEligible = eligible;
  if (!skipSpecialtyFilter) {
    // Normalize: replace ё→е for fuzzy matching (prevents "шпаклевка" vs "шпаклёвка" misses)
    const normalizeRu = (s: string) => s.toLowerCase().replace(/ё/g, "е");

    const orderTerms = order.serviceType
      .split(/[,;]+/)
      .map(t => normalizeRu(t.trim()))
      .filter(Boolean);

    // "Комплексный ремонт" is a wildcard — master can accept any type of order
    const WILDCARD_SPECS = ["комплексный ремонт", "комплексная отделка"];

    specialtyEligible = eligible.filter(master => {
      const specs = master.specializations ?? [];
      // Masters with no specializations listed → accept any order
      if (specs.length === 0) return true;
      const specsNorm = specs.map(s => normalizeRu(s.trim()));
      // Wildcard specialization → always match
      if (specsNorm.some(sp => WILDCARD_SPECS.includes(sp))) return true;
      const matches = orderTerms.some(term =>
        specsNorm.some(sp => sp === term || term.includes(sp) || sp.includes(term))
      );
      if (!matches) skipStats.wrongSpecialty++;
      return matches;
    });

    if (specialtyEligible.length === 0) {
      return {
        ok: false, sent: 0, skipped: reachable.length,
        error: `Нет мастеров с нужной специализацией «${order.serviceType}». Используйте «разошли всем без фильтра специализации».`,
        skipStats,
      };
    }
  }

  // Filter out masters who said "not ready" in today's morning checkin
  const todayStr = new Date().toISOString().split("T")[0];
  const notReadyRows = await db
    .select({ masterId: masterCheckinsTable.masterId })
    .from(masterCheckinsTable)
    .where(and(
      eq(masterCheckinsTable.date, todayStr),
      eq(masterCheckinsTable.isAvailable, false),
    ));
  const notReadyIds = new Set(notReadyRows.map(r => r.masterId));
  const availableEligible = specialtyEligible.filter(m => {
    if (!notReadyIds.has(m.id)) return true;
    skipStats.notReady++;
    return false;
  });

  if (availableEligible.length === 0) {
    return {
      ok: false, sent: 0, skipped: reachable.length,
      error: "Все подходящие мастера отметились как «не готов» сегодня",
      skipStats,
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
  const skipped = reachable.length - availableEligible.length;

  for (const master of availableEligible) {
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
        `📋 Новая заявка #${orderId}\n\n🔧 ${order.serviceType}\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n📐 ${order.area} м²\n📅 ${date}${order.comment ? "\n💬 " + order.comment : ""}\n\n👉 Откликнитесь в приложении:\nhttps://sfera-master.ru/master-pwa/orders`
      ).catch(() => {});
    }
    await db.insert(orderDispatchesTable).values({
      orderId,
      masterId: master.id,
      telegramChatId: `pwa_${master.id}`,
      telegramMessageId: null,
      status: "sent",
    });
    // Track total leads received per master for conversion analytics
    await db.update(mastersTable)
      .set({ totalLeadsReceived: sql`${mastersTable.totalLeadsReceived} + 1` })
      .where(eq(mastersTable.id, master.id));
    sent++;
  }

  // Set 30-minute response window for priority assignment (only if at least one master was notified)
  const windowCloseAt = sent > 0 ? new Date(Date.now() + 30 * 60 * 1000) : null;
  await db.update(ordersTable)
    .set({
      dispatchStatus: "dispatching",
      updatedAt: new Date(),
      ...(windowCloseAt ? { responseWindowCloseAt: windowCloseAt, dispatchWave: 1 } : {}),
    })
    .where(eq(ordersTable.id, orderId));

  return { ok: true, sent, skipped };
}
