// Stuck-orders classifier — single source of truth for the "что зависло"
// flow used by both CRM dashboard and master PWA banner.
//
// Spec: .kiro/specs/stuck-orders-and-master-banner/{requirements,design}.md
//
// Categories (priority order, highest wins):
//   1. zombie                    — 14+ days, no activity at all
//   2. needs_commission_payment  — transaction pending/overdue 7+ days
//   3. needs_result              — active 7+ days without photos+amount
//   4. needs_amount_confirmation — completed but operator hasn't confirmed amount
//   5. needs_call_report         — assigned 24h+ without call-report

import { db, ordersTable, mastersTable, transactionsTable, transactionPaymentsTable, leadsTable, masterMessagesTable } from "@workspace/db";
import { and, eq, inArray, isNull, isNotNull, gte, sql } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────

export const CALL_REPORT_THRESHOLD_HOURS = 24;
export const RESULT_THRESHOLD_DAYS       = 7;
export const COMMISSION_THRESHOLD_DAYS   = 7;
export const ZOMBIE_THRESHOLD_DAYS       = 14;

const ACTIVE_STATUSES = ["master_assigned", "in_progress"] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type StuckCategory =
  | "needs_call_report"
  | "needs_result"
  | "needs_amount_confirmation"
  | "needs_commission_payment"
  | "zombie";

export interface StuckOrderItem {
  id: number;
  category: StuckCategory;
  masterId: number | null;
  masterAlias: string | null;
  clientName: string | null;
  clientPhone: string | null;
  city: string;
  serviceType: string;
  status: string;
  daysStuck: number;
  assignedAt: Date | null;
  callReportedAt: Date | null;
  scheduledAt: Date | null;
  proposedAmount: number | null;
  orderAmount: number | null;
  commission: number | null;
  netPayable: number | null;
  bannerSnoozedUntil: Date | null;
}

interface ClassifyContext {
  now: Date;
  txByOrderId: Map<number, typeof transactionsTable.$inferSelect>;
  partialsByTx: Map<number, number>;
  /** Last master-message createdAt per master. Used as fallback "is master alive" signal. */
  lastMessageByMaster: Map<number, Date>;
}

type OrderRow = typeof ordersTable.$inferSelect;

// ─── Pure classifier ──────────────────────────────────────────────────────────

/**
 * Returns the highest-priority category for an order, or null if not stuck.
 * Pure function: no DB access, all inputs precomputed in `ctx`.
 */
export function classifyOrder(order: OrderRow, ctx: ClassifyContext): StuckCategory | null {
  const isActive = (ACTIVE_STATUSES as readonly string[]).includes(order.status);
  const assignedAt = order.assignedAt ?? order.createdAt;
  const daysSinceAssign = (ctx.now.getTime() - assignedAt.getTime()) / 86_400_000;

  // 1. ZOMBIE — 14+ days active, total silence
  if (isActive && daysSinceAssign >= ZOMBIE_THRESHOLD_DAYS) {
    const lastMsg = order.masterId ? ctx.lastMessageByMaster.get(order.masterId) : null;
    const daysSinceMsg = lastMsg ? (ctx.now.getTime() - lastMsg.getTime()) / 86_400_000 : Infinity;
    const noActivity = !order.proposedAmount
      && (!order.photosAfter || (order.photosAfter as string[]).length === 0)
      && daysSinceMsg >= ZOMBIE_THRESHOLD_DAYS;
    if (noActivity) return "zombie";
  }

  // 2. NEEDS_COMMISSION_PAYMENT — transaction pending/overdue 7+ days
  const tx = ctx.txByOrderId.get(order.id);
  if (tx && (tx.paymentStatus === "pending" || tx.paymentStatus === "overdue")) {
    const txAgeDays = (ctx.now.getTime() - tx.createdAt.getTime()) / 86_400_000;
    const partials = ctx.partialsByTx.get(tx.id) ?? 0;
    const netPayable = Math.max(0,
      Number(tx.commission) - Number(tx.prepaymentDeducted ?? 0) - partials
    );
    if (txAgeDays >= COMMISSION_THRESHOLD_DAYS && netPayable > 0) {
      return "needs_commission_payment";
    }
  }

  // 3. NEEDS_RESULT — active 7+ days, missing photos OR amount
  if (isActive && daysSinceAssign >= RESULT_THRESHOLD_DAYS) {
    const noPhotos = !order.photosAfter || (order.photosAfter as string[]).length === 0;
    const noAmount = !order.proposedAmount;
    if (noPhotos || noAmount) return "needs_result";
  }

  // 4. NEEDS_AMOUNT_CONFIRMATION — master pressed Done, operator hasn't confirmed
  if (
    order.status === "completed"
    && order.proposedAmount
    && (!order.orderAmount || Number(order.orderAmount) === 0)
  ) {
    return "needs_amount_confirmation";
  }

  // 5. NEEDS_CALL_REPORT — assigned 24h+, no report yet (lowest priority)
  if (isActive && daysSinceAssign >= CALL_REPORT_THRESHOLD_HOURS / 24 && !order.clientCallReportedAt) {
    return "needs_call_report";
  }

  return null;
}

// ─── Context loaders ──────────────────────────────────────────────────────────

/**
 * Loads everything classifier needs for a set of orders.
 * Single round-trip per source table — keep it cheap.
 */
async function loadClassifyContext(orderIds: number[], masterIds: number[]): Promise<ClassifyContext> {
  const now = new Date();
  if (orderIds.length === 0) {
    return { now, txByOrderId: new Map(), partialsByTx: new Map(), lastMessageByMaster: new Map() };
  }

  const [txRows, msgRows] = await Promise.all([
    db.select().from(transactionsTable).where(inArray(transactionsTable.orderId, orderIds)),
    masterIds.length > 0
      ? db.select({
          masterId: masterMessagesTable.masterId,
          maxAt: sql<Date>`MAX(${masterMessagesTable.createdAt})`,
        })
        .from(masterMessagesTable)
        .where(and(
          inArray(masterMessagesTable.masterId, masterIds),
          eq(masterMessagesTable.fromMaster, true),
        ))
        .groupBy(masterMessagesTable.masterId)
      : Promise.resolve([]),
  ]);

  const txByOrderId = new Map<number, typeof transactionsTable.$inferSelect>();
  for (const t of txRows) {
    const existing = txByOrderId.get(t.orderId);
    // Pick the "richest" tx if multiple — highest commission wins (avoids placeholder rows)
    if (!existing || Number(t.commission) > Number(existing.commission)) {
      txByOrderId.set(t.orderId, t);
    }
  }

  const txIds = txRows.map(t => t.id);
  const partialsRows = txIds.length > 0
    ? await db.select().from(transactionPaymentsTable).where(inArray(transactionPaymentsTable.transactionId, txIds))
    : [];
  const partialsByTx = new Map<number, number>();
  for (const p of partialsRows) {
    partialsByTx.set(p.transactionId, (partialsByTx.get(p.transactionId) ?? 0) + Number(p.amount));
  }

  const lastMessageByMaster = new Map<number, Date>();
  for (const r of msgRows) {
    if (r.maxAt) lastMessageByMaster.set(r.masterId, new Date(r.maxAt));
  }

  return { now, txByOrderId, partialsByTx, lastMessageByMaster };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/** Builds the candidate-order pool: active orders + completed-without-amount. */
async function loadCandidateOrders(masterId?: number): Promise<OrderRow[]> {
  const conditions: any[] = [
    isNull(ordersTable.deletedAt),
    sql`(
      ${ordersTable.status} IN ('master_assigned', 'in_progress')
      OR (${ordersTable.status} = 'completed' AND ${ordersTable.commissionPaid} = false)
    )`,
  ];
  if (masterId !== undefined) conditions.push(eq(ordersTable.masterId, masterId));
  return db.select().from(ordersTable).where(and(...conditions));
}

function toStuckItem(
  order: OrderRow,
  category: StuckCategory,
  ctx: ClassifyContext,
  masterMap: Map<number, typeof mastersTable.$inferSelect>,
  leadMap: Map<number, typeof leadsTable.$inferSelect>,
): StuckOrderItem {
  const tx = ctx.txByOrderId.get(order.id);
  const partials = tx ? (ctx.partialsByTx.get(tx.id) ?? 0) : 0;
  const netPayable = tx
    ? Math.max(0, Number(tx.commission) - Number(tx.prepaymentDeducted ?? 0) - partials)
    : null;

  const master = order.masterId ? masterMap.get(order.masterId) ?? null : null;
  const lead = order.leadId ? leadMap.get(order.leadId) ?? null : null;
  const assignedAt = order.assignedAt ?? order.createdAt;
  const daysStuck = Math.floor((ctx.now.getTime() - assignedAt.getTime()) / 86_400_000);

  return {
    id: order.id,
    category,
    masterId: order.masterId ?? null,
    masterAlias: master?.alias ?? null,
    clientName: lead?.clientName ?? null,
    clientPhone: lead?.clientPhone ?? null,
    city: order.city,
    serviceType: order.serviceType,
    status: order.status,
    daysStuck,
    assignedAt: order.assignedAt ?? null,
    callReportedAt: order.clientCallReportedAt ?? null,
    scheduledAt: order.scheduledAt ?? null,
    proposedAmount: order.proposedAmount ? Number(order.proposedAmount) : null,
    orderAmount: order.orderAmount ? Number(order.orderAmount) : null,
    commission: tx ? Number(tx.commission) : null,
    netPayable,
    bannerSnoozedUntil: order.bannerSnoozedUntil ?? null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Operator-side: all stuck orders, grouped by category. */
export async function getAllStuckOrders(): Promise<Record<StuckCategory, StuckOrderItem[]>> {
  const orders = await loadCandidateOrders();
  const orderIds = orders.map(o => o.id);
  const masterIds = [...new Set(orders.map(o => o.masterId).filter((x): x is number => x != null))];
  const ctx = await loadClassifyContext(orderIds, masterIds);

  const masters = masterIds.length > 0
    ? await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds))
    : [];
  const masterMap = new Map(masters.map(m => [m.id, m]));

  const leadIds = [...new Set(orders.map(o => o.leadId).filter((x): x is number => x != null))];
  const leads = leadIds.length > 0
    ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds))
    : [];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  const result: Record<StuckCategory, StuckOrderItem[]> = {
    needs_call_report: [],
    needs_result: [],
    needs_amount_confirmation: [],
    needs_commission_payment: [],
    zombie: [],
  };
  for (const order of orders) {
    const category = classifyOrder(order, ctx);
    if (!category) continue;
    result[category].push(toStuckItem(order, category, ctx, masterMap, leadMap));
  }
  // Sort each bucket: longest stuck first
  for (const bucket of Object.values(result)) {
    bucket.sort((a, b) => b.daysStuck - a.daysStuck);
  }
  return result;
}

/** Master-PWA: stuck orders that REQUIRE the master to act (R0, R1, R3 only). */
export async function getPendingActionsForMaster(masterId: number): Promise<StuckOrderItem[]> {
  const orders = await loadCandidateOrders(masterId);
  if (orders.length === 0) return [];

  const orderIds = orders.map(o => o.id);
  const ctx = await loadClassifyContext(orderIds, [masterId]);

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const masterMap = master ? new Map([[master.id, master]]) : new Map();

  const leadIds = [...new Set(orders.map(o => o.leadId).filter((x): x is number => x != null))];
  const leads = leadIds.length > 0
    ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds))
    : [];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  const masterFacing: StuckCategory[] = ["needs_call_report", "needs_result", "needs_commission_payment"];
  const items: StuckOrderItem[] = [];
  for (const order of orders) {
    const category = classifyOrder(order, ctx);
    if (!category || !masterFacing.includes(category)) continue;
    items.push(toStuckItem(order, category, ctx, masterMap, leadMap));
  }
  return items.sort((a, b) => b.daysStuck - a.daysStuck);
}

/** Same as classifyOrder but loads context for a single order — used by /remind-master. */
export async function classifySingleOrder(orderId: number): Promise<StuckCategory | null> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order || order.deletedAt) return null;
  const masterIds = order.masterId ? [order.masterId] : [];
  const ctx = await loadClassifyContext([orderId], masterIds);
  return classifyOrder(order, ctx);
}
