import { db, ordersTable, mastersTable, orderDispatchesTable, dispatchResendLogsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { sendPushToMaster } from "./push.js";
import { sendMaxMessage } from "../maxBot.js";

// Telegram-бот удалён — мастера получают заявки только через PWA push и Max.
function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "не указана";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return "не указана";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    }).format(date);
  } catch {
    return "не указана";
  }
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
    `📋 <b>Новая заявка #${order.leadId ?? orderId}</b>\n` +
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

// ─── Batch helpers ────────────────────────────────────────────────────────────

async function batchAsync<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function performBroadcast(
  orderId: number,
  force = false,
  skipSpecialtyFilter = false,
): Promise<BroadcastResult & { skipStats?: BroadcastSkipStats }> {
  const startedAt = Date.now();
  console.log(`[broadcast] order=${orderId} started`);

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) {
    console.error(`[broadcast] order=${orderId} not found`);
    return { ok: false, sent: 0, skipped: 0, error: "Order not found" };
  }

  if (order.dispatchStatus !== "none" && !force) {
    console.warn(`[broadcast] order=${orderId} already dispatched (status=${order.dispatchStatus})`);
    return { ok: false, sent: 0, skipped: 0, error: "Already dispatched" };
  }

  // Force re-broadcast: delete old "sent" dispatches, keep "rejected"
  if (force && order.dispatchStatus !== "none") {
    await db.delete(orderDispatchesTable)
      .where(and(
        eq(orderDispatchesTable.orderId, orderId),
        eq(orderDispatchesTable.status, "sent"),
      ));
    await db.update(ordersTable)
      .set({ dispatchStatus: "none", updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));
    console.log(`[broadcast] order=${orderId} cleared old sent dispatches for re-broadcast`);
  }

  // Load all active masters in the city
  const allMasters = await db.select().from(mastersTable)
    .where(and(
      eq(mastersTable.status, "active"),
      eq(mastersTable.city, order.city),
    ));

  const skipStats: BroadcastSkipStats = {
    notReachable: 0, rejected: 0, notEligible: 0, wrongSpecialty: 0, notReady: 0,
  };

  // Reachable = has PWA login or Max chat
  const reachable = allMasters.filter(m => {
    if (m.pwaLogin || m.maxChatId) return true;
    skipStats.notReachable++;
    console.log(`[broadcast] order=${orderId} skip master=${m.alias}(${m.id}) reason=notReachable (no pwaLogin/maxChatId)`);
    return false;
  });

  if (reachable.length === 0) {
    console.warn(`[broadcast] order=${orderId} no reachable masters in city=${order.city}`);
    return { ok: false, sent: 0, skipped: 0, error: `Нет активных мастеров в городе «${order.city}»` };
  }

  // Exclude previously rejected
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
    console.log(`[broadcast] order=${orderId} skip master=${m.alias}(${m.id}) reason=previouslyRejected`);
    return false;
  });

  // No eligibility filter on broadcast — all reachable active masters receive the order.
  const eligible = reachableFiltered;

  if (eligible.length === 0) {
    return { ok: false, sent: 0, skipped: reachable.length, error: "Нет доступных мастеров для рассылки", skipStats };
  }

  // Specialty filter
  let specialtyEligible = eligible;
  if (!skipSpecialtyFilter) {
    const normalizeRu = (s: string) => s.toLowerCase().replace(/ё/g, "е");
    const orderTerms = (order.serviceType ?? "")
      .split(/[,;]+/)
      .map(t => normalizeRu(t.trim()))
      .filter(Boolean);
    const WILDCARD_SPECS = ["комплексный ремонт", "комплексная отделка"];

    specialtyEligible = eligible.filter(master => {
      const specs = master.specializations ?? [];
      if (specs.length === 0) return true;
      const specsNorm = specs.map(s => normalizeRu(s.trim()));
      if (specsNorm.some(sp => WILDCARD_SPECS.includes(sp))) return true;
      const matches = orderTerms.some(term =>
        specsNorm.some(sp => sp === term || term.includes(sp) || sp.includes(term))
      );
      if (!matches) {
        skipStats.wrongSpecialty++;
        console.log(`[broadcast] order=${orderId} skip master=${master.alias}(${master.id}) reason=wrongSpecialty (specs=${JSON.stringify(specs)}, orderTerms=${JSON.stringify(orderTerms)})`);
      }
      return matches;
    });
  }

  // Include previous sent recipients even if they don't match specialty filter
  const previousSent = await db.select({ masterId: orderDispatchesTable.masterId })
    .from(orderDispatchesTable)
    .where(and(
      eq(orderDispatchesTable.orderId, orderId),
      eq(orderDispatchesTable.status, "sent"),
    ));
  const previousSentIds = new Set(previousSent.map(r => r.masterId));

  const finalEligible = reachableFiltered.filter(m => {
    if (specialtyEligible.some(se => se.id === m.id)) return true;
    if (previousSentIds.has(m.id)) return true;
    return false;
  });

  if (finalEligible.length === 0) {
    return {
      ok: false, sent: 0, skipped: reachable.length,
      error: `Нет мастеров с нужной специализацией «${order.serviceType}». Используйте «разошли всем без фильтра специализации».`,
      skipStats,
    };
  }

  const skipped = reachable.length - finalEligible.length;

  // ── ATOMIC: update order to dispatching BEFORE sending pushes ──
  const windowCloseAt = finalEligible.length > 0
    ? new Date(Date.now() + 30 * 60 * 1000)
    : null;
  await db.update(ordersTable)
    .set({
      dispatchStatus: "dispatching",
      updatedAt: new Date(),
      ...(windowCloseAt ? { responseWindowCloseAt: windowCloseAt, dispatchWave: 1 } : {}),
    })
    .where(eq(ordersTable.id, orderId));

  // ── BULK INSERT dispatch records (only for NEW recipients) ──
  const newMasterIds = finalEligible.map(m => m.id).filter(mid => !previousSentIds.has(mid));
  if (newMasterIds.length > 0) {
    await db.insert(orderDispatchesTable).values(
      newMasterIds.map(mid => ({
        orderId,
        masterId: mid,
        telegramChatId: `pwa_${mid}`,
        telegramMessageId: null,
        status: "sent" as const,
      }))
    );
  }

  // ── BULK UPDATE master stats (only for NEW recipients) ──
  if (newMasterIds.length > 0) {
    await db.update(mastersTable)
      .set({ totalLeadsReceived: sql`${mastersTable.totalLeadsReceived} + 1` })
      .where(inArray(mastersTable.id, newMasterIds));
  }

  // ── PARALLEL PUSH / MAX (batched, 10 at a time) ──
  const date = formatDate(order.scheduledAt);
  const maxMsg = `📋 Новая заявка #${order.leadId ?? orderId}\n\n🔧 ${order.serviceType}\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n📐 ${order.area} м²\n📅 ${date}${order.comment ? "\n💬 " + order.comment : ""}\n\n👉 Откликнитесь в приложении:\nhttps://sfera-master.ru/master-pwa/orders`;

  await batchAsync(finalEligible, 10, async (master) => {
    await Promise.all([
      master.pwaLogin
        ? sendPushToMaster(master.id, {
            type: "new_order",
            title: "Новый заказ",
            body: `${order.city}${order.district ? ", " + order.district : ""} · ${order.serviceType} · ${order.area} м²`,
            orderId,
          }).catch(() => {})
        : Promise.resolve(),
      master.maxChatId
        ? sendMaxMessage(master.maxChatId, maxMsg).catch(() => {})
        : Promise.resolve(),
    ]);
  });

  const duration = Date.now() - startedAt;
  console.log(`[broadcast] order=${orderId} finished sent=${finalEligible.length} skipped=${skipped} skipStats=${JSON.stringify(skipStats)} duration=${duration}ms`);

  return { ok: true, sent: finalEligible.length, skipped, skipStats };
}

// ─── Resend dispatch to non-responders ──────────────────────────────────────────

export interface ResendResult {
  ok: boolean;
  sent: number;
  error?: string;
  cooldownMinutes?: number;
}

const RESEND_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const MAX_RESENDS = 3;

export async function performResend(
  orderId: number,
  createdByUserId?: number | null,
): Promise<ResendResult> {
  const startedAt = Date.now();
  console.log(`[resend] order=${orderId} started`);

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) {
    console.error(`[resend] order=${orderId} not found`);
    return { ok: false, sent: 0, error: "Order not found" };
  }

  if (order.status !== "waiting_master") {
    return { ok: false, sent: 0, error: "Рассылка доступна только для заказов «Ожидает мастера»" };
  }

  // Check cooldown
  if (order.lastDispatchResendAt) {
    const elapsed = Date.now() - new Date(order.lastDispatchResendAt).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      const minutesLeft = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 60000);
      return { ok: false, sent: 0, error: `Подождите ${minutesLeft} мин до повторной рассылки`, cooldownMinutes: minutesLeft };
    }
  }

  // Check max resends
  const currentResendCount = order.dispatchResendCount ?? 0;
  if (currentResendCount >= MAX_RESENDS) {
    return { ok: false, sent: 0, error: `Достигнут лимит повторных рассылок (${MAX_RESENDS})` };
  }

  // Find non-responders: dispatches with status "sent"
  const nonResponders = await db.select().from(orderDispatchesTable)
    .where(and(
      eq(orderDispatchesTable.orderId, orderId),
      eq(orderDispatchesTable.status, "sent"),
    ));

  if (nonResponders.length === 0) {
    return { ok: false, sent: 0, error: "Нет мастеров для повторной рассылки (все уже откликнулись или отказались)" };
  }

  const masterIds = nonResponders.map(d => d.masterId);
  const masters = masterIds.length > 0
    ? await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds))
    : [];

  const masterMap = new Map(masters.map(m => [m.id, m]));
  const eligible = nonResponders
    .map(d => masterMap.get(d.masterId))
    .filter(Boolean) as typeof masters;

  if (eligible.length === 0) {
    return { ok: false, sent: 0, error: "Нет доступных мастеров для повторной рассылки" };
  }

  // Send reminder pushes / Max messages
  const date = formatDate(order.scheduledAt);
  const maxMsg = `🔔 Напоминание: заявка #${order.leadId ?? orderId} ждёт вашего отклика\n\n🔧 ${order.serviceType}\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n📐 ${order.area} м²\n📅 ${date}${order.comment ? "\n💬 " + order.comment : ""}\n\n👉 Откликнитесь в приложении:\nhttps://sfera-master.ru/master-pwa/orders`;

  await batchAsync(eligible, 10, async (master) => {
    await Promise.all([
      master.pwaLogin
        ? sendPushToMaster(master.id, {
            type: "new_order",
            title: "🔔 Напоминание: новый заказ",
            body: `${order.city}${order.district ? ", " + order.district : ""} · ${order.serviceType} · ${order.area} м²`,
            orderId,
          }).catch(() => {})
        : Promise.resolve(),
      master.maxChatId
        ? sendMaxMessage(master.maxChatId, maxMsg).catch(() => {})
        : Promise.resolve(),
    ]);
  });

  // Update order counters
  await db.update(ordersTable)
    .set({
      dispatchResendCount: currentResendCount + 1,
      lastDispatchResendAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId));

  // Insert audit log
  await db.insert(dispatchResendLogsTable).values({
    orderId,
    resendNumber: currentResendCount + 1,
    scope: "non_responders",
    recipientCount: eligible.length,
    createdBy: createdByUserId ?? null,
  });

  const duration = Date.now() - startedAt;
  console.log(`[resend] order=${orderId} finished sent=${eligible.length} duration=${duration}ms`);

  return { ok: true, sent: eligible.length };
}

// ─── Force resend to the SAME masters, unconditionally (admin action) ───────────
// Unlike performResend, this ignores cooldown, resend limit, order status and
// specialty filters. It simply re-notifies every master who already received
// this order (any dispatch status). Requested by admin for manual re-pings.
export async function performForceResend(
  orderId: number,
  createdByUserId?: number | null,
): Promise<ResendResult> {
  const startedAt = Date.now();
  console.log(`[force-resend] order=${orderId} started`);

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) {
    console.error(`[force-resend] order=${orderId} not found`);
    return { ok: false, sent: 0, error: "Order not found" };
  }

  // Every master who already received this order, regardless of dispatch status.
  const dispatches = await db.select().from(orderDispatchesTable)
    .where(eq(orderDispatchesTable.orderId, orderId));
  const uniqueMasterIds = [...new Set(dispatches.map(d => d.masterId))];

  if (uniqueMasterIds.length === 0) {
    return { ok: false, sent: 0, error: "Заказ ещё не рассылался ни одному мастеру" };
  }

  const masters = await db.select().from(mastersTable)
    .where(inArray(mastersTable.id, uniqueMasterIds));

  if (masters.length === 0) {
    return { ok: false, sent: 0, error: "Мастера-получатели не найдены" };
  }

  const date = formatDate(order.scheduledAt);
  const maxMsg = `📋 Заявка #${order.leadId ?? orderId} ещё актуальна\n\n🔧 ${order.serviceType}\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n📐 ${order.area} м²\n📅 ${date}${order.comment ? "\n💬 " + order.comment : ""}\n\n👉 Откликнитесь в приложении:\nhttps://sfera-master.ru/master-pwa/orders`;

  await batchAsync(masters, 10, async (master) => {
    await Promise.all([
      master.pwaLogin
        ? sendPushToMaster(master.id, {
            type: "new_order",
            title: "Новый заказ",
            body: `${order.city}${order.district ? ", " + order.district : ""} · ${order.serviceType} · ${order.area} м²`,
            orderId,
          }).catch(() => {})
        : Promise.resolve(),
      master.maxChatId
        ? sendMaxMessage(master.maxChatId, maxMsg).catch(() => {})
        : Promise.resolve(),
    ]);
  });

  // Audit only — force mode intentionally does NOT touch cooldown/limit counters,
  // so it never blocks (or is blocked by) the regular resend flow.
  await db.insert(dispatchResendLogsTable).values({
    orderId,
    resendNumber: (order.dispatchResendCount ?? 0) + 1,
    scope: "all",
    recipientCount: masters.length,
    createdBy: createdByUserId ?? null,
  });

  const duration = Date.now() - startedAt;
  console.log(`[force-resend] order=${orderId} finished sent=${masters.length} duration=${duration}ms`);

  return { ok: true, sent: masters.length };
}
