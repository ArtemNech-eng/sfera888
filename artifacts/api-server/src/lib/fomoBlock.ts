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

import { db, ordersTable, fomoEventsTable, mastersTable } from "@workspace/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";

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
  const now = new Date();

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

  // Priority 1: no estimate 48h+ (status = master_assigned, assignedAt > 48h, no proposedAmount)
  for (const order of activeOrders) {
    if (order.status !== "master_assigned") continue;
    const hasEstimate = order.proposedAmount != null && Number(order.proposedAmount) > 0;
    if (hasEstimate) continue;
    const assignedAt = order.assignedAt ?? order.createdAt;
    const ageMs = now.getTime() - new Date(assignedAt).getTime();
    if (ageMs >= FORTY_EIGHT_HOURS) {
      const hoursElapsed = Math.floor(ageMs / 3600000);
      return {
        isBlocked: true,
        type: "no_estimate",
        reason: `По заказу #${order.id} смета не отправлена более 48 часов.`,
        orderId: order.id,
        hoursElapsed,
      };
    }
  }

  // Priority 3: estimate sent but no payment 72h+
  for (const order of activeOrders) {
    const hasEstimate = order.proposedAmount != null && Number(order.proposedAmount) > 0;
    const hasPayment = order.orderAmount != null && Number(order.orderAmount) > 0;
    if (!hasEstimate || hasPayment) continue;
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
  const masters = await db
    .select({ id: mastersTable.id, alias: mastersTable.alias, city: mastersTable.city, isTestMaster: mastersTable.isTestMaster })
    .from(mastersTable)
    .where(
      and(
        eq(mastersTable.status as any, "active"),
        isNull(mastersTable.deletedAt),
      )
    );

  const results = [];
  for (const m of masters) {
    const fomo = await getFomoBlock(m.id, m.isTestMaster);
    if (fomo.isBlocked) {
      results.push({
        masterId: m.id,
        alias: m.alias,
        city: m.city,
        type: fomo.type!,
        reason: fomo.reason!,
        orderId: fomo.orderId,
        hoursElapsed: fomo.hoursElapsed,
      });
    }
  }
  return results;
}
