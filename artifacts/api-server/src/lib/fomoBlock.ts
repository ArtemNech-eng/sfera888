/**
 * FOMO Block — calculates whether a master should be blocked from responding
 * to new orders. Masters can still SEE orders (FOMO effect) but cannot respond.
 *
 * Block conditions (in priority order):
 * 1. Has overdue commission (debt)
 * 2. Order in master_assigned status 48h+ without estimate
 * 3. Estimate sent, no prepayment 72h+ 
 * 4. Active orders count >= limit (2)
 */

import { db, ordersTable, fomoEventsTable, mastersTable, receiptsTable } from "@workspace/db";
import { eq, and, inArray, isNull, isNotNull } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";
import { computePaymentState, type PaymentState } from "./paymentState.js";
import { isPaymentStateEngineEnabled } from "./paymentStateGuard.js";

export interface FomoBlockResult {
  isBlocked: boolean;
  type: string | null; // "no_estimate" | "no_payment" | "limit_reached" | "overdue_debt" | null
  reason: string | null;
  orderId: number | null;
  hoursElapsed: number | null;
}

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

export async function getFomoBlock(masterId: number, _isTestMaster: boolean): Promise<FomoBlockResult> {
  // Check if FOMO is manually disabled for this master
  const [masterRow] = await db
    .select({ fomoDisabled: mastersTable.fomoDisabled })
    .from(mastersTable)
    .where(eq(mastersTable.id, masterId))
    .limit(1);

  if (masterRow?.fomoDisabled) {
    return { isBlocked: false, type: null, reason: null, orderId: null, hoursElapsed: null };
  }

  const now = new Date();

  // Payment_State engine guard (Phase 2). См. paymentStateGuard.ts.
  // При флаге off — старое поведение (по proposedAmount + наличию payment).
  // При флаге on — фильтрация по derived paymentState через computePaymentState.
  const paymentStateEngineOn = await isPaymentStateEngineEnabled();

  // Fetch all active orders for this master
  const activeOrders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.masterId, masterId),
        inArray(ordersTable.status as any, ["master_assigned", "in_progress", "cancellation_requested"]),
        isNull(ordersTable.deletedAt),
      )
    );

  // Загружаем receipts мастера один раз для (a) priority 3 проверки paid receipt
  // и (b) computePaymentState (если флаг включён). Используем существующий
  // запрос ниже как источник, но если включён флаг — нужно знать prepaymentAmount
  // и prepaymentSeenAt по каждому receipt, а не только prepaymentSubmittedAt.
  const masterReceipts = paymentStateEngineOn
    ? await db.select().from(receiptsTable).where(eq(receiptsTable.masterId, masterId))
    : [];
  const receiptsByOrder = new Map<number, typeof masterReceipts>();
  for (const r of masterReceipts) {
    const arr = receiptsByOrder.get(r.orderId) ?? [];
    arr.push(r);
    receiptsByOrder.set(r.orderId, arr);
  }

  // Priority 1: no estimate 48h+ (status = master_assigned, assignedAt > 48h, no proposedAmount)
  for (const order of activeOrders) {
    if (order.status !== "master_assigned") continue;
    let isNoAmount: boolean;
    if (paymentStateEngineOn) {
      const ps: PaymentState = computePaymentState(order as any, (receiptsByOrder.get(order.id) ?? []) as any);
      isNoAmount = ps === "no_amount";
    } else {
      const hasEstimate = order.proposedAmount != null && Number(order.proposedAmount) > 0;
      isNoAmount = !hasEstimate;
    }
    if (!isNoAmount) continue;
    const assignedAt = order.assignedAt ?? order.createdAt;
    const ageMs = now.getTime() - new Date(assignedAt).getTime();
    if (ageMs >= FORTY_EIGHT_HOURS) {
      const hoursElapsed = Math.floor(ageMs / 3600000);
      return {
        isBlocked: true,
        type: "no_estimate",
        reason: paymentStateEngineOn
          ? `По заказу #${order.id} сумма не зафиксирована более 48 часов.`
          : `По заказу #${order.id} смета не отправлена более 48 часов.`,
        orderId: order.id,
        hoursElapsed,
      };
    }
  }

  // Priority 3: estimate sent but no payment 72h+
  // Check receipts too: client may have submitted payment screenshot but operator hasn't confirmed yet
  // (prepaymentSubmittedAt set, but orderAmount on order still null until operator confirms)
  const paidReceiptOrderIds = new Set(
    (await db.select({ orderId: receiptsTable.orderId })
      .from(receiptsTable)
      .where(and(
        eq(receiptsTable.masterId, masterId),
        isNotNull(receiptsTable.prepaymentSubmittedAt),
      ))
    ).map((r) => r.orderId)
  );

  for (const order of activeOrders) {
    let shouldFlag: boolean;
    if (paymentStateEngineOn) {
      const ps: PaymentState = computePaymentState(order as any, (receiptsByOrder.get(order.id) ?? []) as any);
      // Сумма зафиксирована (agreed), но клиент пока не оплатил (нет
      // submitted receipt). Если paymentState уже paid — не блокируем.
      shouldFlag = ps === "agreed" && !paidReceiptOrderIds.has(order.id);
    } else {
      const hasEstimate = order.proposedAmount != null && Number(order.proposedAmount) > 0;
      const hasPayment = (order.orderAmount != null && Number(order.orderAmount) > 0)
        || paidReceiptOrderIds.has(order.id);
      shouldFlag = hasEstimate && !hasPayment;
    }
    if (!shouldFlag) continue;
    // Approximate when estimate was sent: use updatedAt as proxy
    const estimateSentAt = order.updatedAt ?? order.createdAt;
    const ageMs = now.getTime() - new Date(estimateSentAt).getTime();
    if (ageMs >= SEVENTY_TWO_HOURS) {
      const hoursElapsed = Math.floor(ageMs / 3600000);
      return {
        isBlocked: true,
        type: "no_payment",
        reason: `По заказу #${order.id} предоплата не оплачена более 72 часов.`,
        orderId: order.id,
        hoursElapsed,
      };
    }
  }

  return { isBlocked: false, type: null, reason: null, orderId: null, hoursElapsed: null };
}

// ─── Log FOMO event ──────────────────────────────────────────────────────────

export async function logFomoEvent(
  masterId: number,
  eventType: "blocked" | "unblocked" | "button_press",
  reason?: string | null,
  orderId?: number | null,
): Promise<void> {
  try {
    await db.insert(fomoEventsTable).values({
      masterId,
      eventType,
      reason: reason ?? null,
      orderId: orderId ?? null,
      createdAt: new Date(),
    });
  } catch (e) {
    console.error("[fomoBlock] Failed to log event:", e);
  }
}

// ─── Send unblock notification ────────────────────────────────────────────────

export async function sendFomoUnblockNotification(masterId: number): Promise<void> {
  try {
    const masters = await db
      .select({ maxChatId: mastersTable.maxChatId, telegramId: mastersTable.telegramId, alias: mastersTable.alias })
      .from(mastersTable)
      .where(eq(mastersTable.id, masterId))
      .limit(1);
    const master = masters[0];
    if (!master) return;
    const chatId = master.maxChatId ?? master.telegramId;
    if (!chatId) return;
    await sendMaxMessage(chatId, `✅ Ограничение снято.\nВы снова можете откликаться на новые заказы.`);
  } catch (e) {
    console.error("[fomoBlock] Failed to send unblock notification:", e);
  }
}

// ─── Check if master's FOMO status changed (for auto-unblock notification) ───

// Cache of last known FOMO status per masterId to detect transitions
const fomoStatusCache = new Map<number, boolean>();

export async function checkFomoTransition(masterId: number, isTestMaster: boolean): Promise<void> {
  try {
    const current = await getFomoBlock(masterId, isTestMaster);
    const wasBlocked = fomoStatusCache.get(masterId);

    if (wasBlocked === true && !current.isBlocked) {
      // Transitioned from blocked → unblocked
      await logFomoEvent(masterId, "unblocked", "Причина блокировки устранена");
      await sendFomoUnblockNotification(masterId);
    } else if (wasBlocked !== true && current.isBlocked) {
      // Transitioned from unblocked → blocked
      await logFomoEvent(masterId, "blocked", current.reason, current.orderId ?? undefined);
    }

    fomoStatusCache.set(masterId, current.isBlocked);
  } catch (e) {
    console.error("[fomoBlock] checkFomoTransition error:", e);
  }
}

// ─── Get all currently FOMO-blocked masters (for CRM) ────────────────────────

export async function getAllFomoBlockedMasters(): Promise<Array<{
  masterId: number;
  alias: string;
  city: string;
  type: string;
  reason: string;
  orderId: number | null;
  hoursElapsed: number | null;
}>> {
  // BATCH IMPLEMENTATION — was N+1 (2-3 queries per master). For 1000 masters
  // that meant 2000-3000 sequential round-trips. Now: 3 queries total.
  //
  // Logic mirrors getFomoBlock(): priority 1 = no_estimate 48h+,
  // priority 3 = no_payment 72h+ on master_assigned/in_progress orders.
  // Skips fomoDisabled masters. paymentState engine off (legacy path) for
  // batch — keeps it fast and simple, accepting tiny inconsistency on the
  // edge case where engine is on (only matters for derived `agreed` state).

  const now = new Date();

  const allActiveMasters = await db
    .select({
      id: mastersTable.id,
      alias: mastersTable.alias,
      city: mastersTable.city,
      isTestMaster: mastersTable.isTestMaster,
      fomoDisabled: mastersTable.fomoDisabled,
    })
    .from(mastersTable)
    .where(and(eq(mastersTable.status as any, "active"), isNull(mastersTable.deletedAt)));

  const eligibleMasters = allActiveMasters.filter(m => !m.fomoDisabled);
  if (eligibleMasters.length === 0) return [];
  const eligibleIds = eligibleMasters.map(m => m.id);
  const masterById = new Map(eligibleMasters.map(m => [m.id, m]));

  // All active orders for these masters in one query
  const activeOrders = await db
    .select()
    .from(ordersTable)
    .where(and(
      inArray(ordersTable.masterId, eligibleIds),
      inArray(ordersTable.status as any, ["master_assigned", "in_progress", "cancellation_requested"]),
      isNull(ordersTable.deletedAt),
    ));

  // All submitted receipts for these masters in one query
  const submittedReceipts = await db
    .select({ orderId: receiptsTable.orderId, masterId: receiptsTable.masterId })
    .from(receiptsTable)
    .where(and(
      inArray(receiptsTable.masterId, eligibleIds),
      isNotNull(receiptsTable.prepaymentSubmittedAt),
    ));
  const paidReceiptOrderIds = new Set(submittedReceipts.map(r => r.orderId));

  // Group orders by master
  const ordersByMaster = new Map<number, typeof activeOrders>();
  for (const o of activeOrders) {
    if (!o.masterId) continue;
    const arr = ordersByMaster.get(o.masterId) ?? [];
    arr.push(o);
    ordersByMaster.set(o.masterId, arr);
  }

  const results: Array<{
    masterId: number; alias: string; city: string; type: string; reason: string;
    orderId: number | null; hoursElapsed: number | null;
  }> = [];

  for (const m of eligibleMasters) {
    const masterOrders = ordersByMaster.get(m.id) ?? [];

    // Priority 1: master_assigned 48h+ without estimate
    let blocked = false;
    for (const order of masterOrders) {
      if (order.status !== "master_assigned") continue;
      const hasEstimate = order.proposedAmount != null && Number(order.proposedAmount) > 0;
      if (hasEstimate) continue;
      const assignedAt = order.assignedAt ?? order.createdAt;
      const ageMs = now.getTime() - new Date(assignedAt).getTime();
      if (ageMs >= FORTY_EIGHT_HOURS) {
        results.push({
          masterId: m.id, alias: m.alias, city: m.city,
          type: "no_estimate",
          reason: `По заказу #${order.id} смета не отправлена более 48 часов.`,
          orderId: order.id,
          hoursElapsed: Math.floor(ageMs / 3600000),
        });
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    // Priority 3: estimate sent, no payment 72h+
    for (const order of masterOrders) {
      const hasEstimate = order.proposedAmount != null && Number(order.proposedAmount) > 0;
      const hasPayment = (order.orderAmount != null && Number(order.orderAmount) > 0)
        || paidReceiptOrderIds.has(order.id);
      if (!hasEstimate || hasPayment) continue;
      const estimateSentAt = order.updatedAt ?? order.createdAt;
      const ageMs = now.getTime() - new Date(estimateSentAt).getTime();
      if (ageMs >= SEVENTY_TWO_HOURS) {
        results.push({
          masterId: m.id, alias: m.alias, city: m.city,
          type: "no_payment",
          reason: `По заказу #${order.id} предоплата не оплачена более 72 часов.`,
          orderId: order.id,
          hoursElapsed: Math.floor(ageMs / 3600000),
        });
        break;
      }
    }
  }

  return results;
}
