import { db, ordersTable, mastersTable, orderDispatchesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
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

  const availableEligible = specialtyEligible;
  const skipped = reachable.length - availableEligible.length;

  // ── ATOMIC: update order to dispatching BEFORE sending pushes ──
  const windowCloseAt = availableEligible.length > 0
    ? new Date(Date.now() + 30 * 60 * 1000)
    : null;
  await db.update(ordersTable)
    .set({
      dispatchStatus: "dispatching",
      updatedAt: new Date(),
      ...(windowCloseAt ? { responseWindowCloseAt: windowCloseAt, dispatchWave: 1 } : {}),
    })
    .where(eq(ordersTable.id, orderId));

  // ── BULK INSERT dispatch records ──
  const masterIds = availableEligible.map(m => m.id);
  if (masterIds.length > 0) {
    const values = masterIds.map(mid =>
      `(${orderId}, ${mid}, 'pwa_${mid}', null, 'sent')`
    ).join(", ");
    await db.execute(sql`INSERT INTO order_dispatches (order_id, master_id, telegram_chat_id, telegram_message_id, status) VALUES ${sql.raw(values)}`);
  }

  // ── BULK UPDATE master stats ──
  if (masterIds.length > 0) {
    const idList = masterIds.join(",");
    await db.execute(sql`UPDATE masters SET total_leads_received = total_leads_received + 1, updated_at = NOW() WHERE id IN (${sql.raw(idList)})`);
  }

  // ── PARALLEL PUSH / MAX (batched, 10 at a time) ──
  const date = formatDate(order.scheduledAt);
  const maxMsg = `📋 Новая заявка #${orderId}\n\n🔧 ${order.serviceType}\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n📐 ${order.area} м²\n📅 ${date}${order.comment ? "\n💬 " + order.comment : ""}\n\n👉 Откликнитесь в приложении:\nhttps://sfera-master.ru/master-pwa/orders`;

  await batchAsync(availableEligible, 10, async (master) => {
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
  console.log(`[broadcast] order=${orderId} finished sent=${availableEligible.length} skipped=${skipped} duration=${duration}ms`);

  return { ok: true, sent: availableEligible.length, skipped, skipStats };
}
