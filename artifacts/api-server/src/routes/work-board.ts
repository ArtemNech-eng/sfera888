// /api/work-board — 8-column Kanban-conveyor aggregator + SSE.
//
// Columns (in order):
//   new                — only just created, no broadcast yet
//   waiting_master     — broadcast sent, waiting for master response
//   no_estimate        — master assigned, no receipt yet
//   estimate_unpaid    — receipt exists, prepayment not confirmed
//   estimate_paid      — prepayment confirmed, work in progress
//   commission_left    — order amount confirmed, commission not fully paid
//   closed_24h         — completed within last 24h
//   problem            — needs operator (cancellation_requested, operatorNote, long without estimate/payment, etc.)
//
// Commission tariff (Sfera Master): фикс 5 000 ₽ если чек ≤ 50 000 ₽, иначе 15% от чека.
//
// Возврат в пул выполняется ТОЛЬКО оператором — здесь нет автозадач/cron, которые бы это делали.
import { Router } from "express";
import { EventEmitter } from "node:events";
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, transactionsTable, transactionPaymentsTable, masterMessagesTable, orderDispatchesTable } from "@workspace/db";
import { inArray, isNull, eq, and, gte, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { recordOrderCancelled } from "../lib/masterReputation.js";
import { recordOrderMasterHistory } from "../lib/orderMasterHistory.js";
import { sendMaxMessage } from "../maxBot.js";
import { sendPushToMaster } from "../lib/push.js";

// Только эти роли могут менять статус заявок (эскалировать/возвращать в пул).
const operatorRoles = requireRole("admin", "lead_operator", "master_operator");

const router = Router();

// ── Event bus (in-process) ───────────────────────────────────────────────────
export const workBoardBus = new EventEmitter();
workBoardBus.setMaxListeners(100);
/** Notify SSE subscribers — call after any mutation that changes order state. */
export function notifyWorkBoardChanged(reason: string = "mutation") {
  workBoardBus.emit("changed", { reason, at: new Date().toISOString() });
}

// ── Tariff helpers ───────────────────────────────────────────────────────────
const COMMISSION_THRESHOLD = 50_000;
const COMMISSION_FIXED = 5_000;
const COMMISSION_PERCENT = 0.15;

function safeNumber(val: unknown, defaultValue = 0): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  const num = Number(val);
  return isNaN(num) ? defaultValue : num;
}

function sanitizeNote(text: string): string {
  // Remove HTML tags and limit length to prevent XSS and excessive storage
  return text.replace(/[<>]/g, '').slice(0, 5000);
}

function calcCommission(total: number): number {
  if (typeof total !== 'number' || isNaN(total) || total <= 0) return 0;
  return total <= COMMISSION_THRESHOLD ? COMMISSION_FIXED : Math.round(total * COMMISSION_PERCENT);
}
function commissionTier(total: number): "fixed" | "percent" {
  return total <= COMMISSION_THRESHOLD ? "fixed" : "percent";
}

// ── Time helpers ─────────────────────────────────────────────────────────────
function timeAgoLabel(ms: number): string {
  if (ms < 60_000) return "<1 мин";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч ${m % 60}м`;
  const d = Math.floor(h / 24);
  return `${d}д ${h % 24}ч`;
}

// ── Card / Column types ──────────────────────────────────────────────────────
type ColumnKey =
  | "new"
  | "waiting_master"
  | "no_estimate"
  | "estimate_unpaid"
  | "estimate_paid"
  | "commission_left"
  | "closed_24h"
  | "problem";

type BotTone = "ok" | "warn" | "bad";
type BadgeTone = "ok" | "warn" | "bad" | "info";

interface Card {
  id: string;
  orderId: number;
  leadId: number | null;
  title: string;
  address: string;
  master: string | null;
  masterId: number | null;
  timeInStage: string;
  ageMs: number;
  money?: { kind: "estimate" | "paid" | "commission"; amount: number; tier?: "fixed" | "percent" };
  // Detailed commission progress for "estimate_paid" and "commission_left" cards.
  // Lets the operator see at a glance how much commission has already been collected
  // (typically the 5к prepayment) and how much is still owed.
  commission?: {
    orderTotal: number;   // full estimate / order amount (the "Сумма")
    total: number;        // total commission expected (5к fixed or 15% percent)
    paid: number;         // commission already received (prepaymentDeducted + totalPartialPaid)
    left: number;         // remaining commission (netPayable)
    tier: "fixed" | "percent";
    prepaymentDeducted?: number;  // бронь по смете, зачтённая в комиссию
    totalPartialPaid?: number;    // сумма частичных оплат мастера
    partialPayments?: { id: number; amount: number; note: string | null; paidAt: string }[];
  };
  bot?: { action: string; eta: string; tone: BotTone };
  badge?: { text: string; tone: BadgeTone };
  status: string;
  problemReason?: string;
  responseCount?: number;
}

interface Column {
  key: ColumnKey;
  emoji: string;
  title: string;
  hint: string;
  count: number;
  sumPaid?: number;
  sumPending?: number;
  expectedCommission?: number;
  breakdown?: string;
  cards: Card[];
}

// ── Aggregator ───────────────────────────────────────────────────────────────
async function buildBoard() {
  const now = Date.now();
  const last24h = new Date(now - 24 * 3_600_000);

  // Active orders + recently closed (last 24h)
  const activeOrders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        inArray(ordersTable.status, ["waiting_master", "master_assigned", "in_progress", "cancellation_requested"]),
        isNull(ordersTable.deletedAt),
      ),
    );

  const closedRecent = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "completed"),
        isNull(ordersTable.deletedAt),
        gte(ordersTable.completedAt, last24h),
      ),
    );

  const orders = [...activeOrders, ...closedRecent];

  if (orders.length === 0) {
    return emptyBoard();
  }

  const masterIds = [...new Set(orders.map((o) => o.masterId).filter((x): x is number => !!x))];
  const leadIds = [...new Set(orders.map((o) => o.leadId))];
  const orderIds = orders.map((o) => o.id);

  const [masters, leads, receipts, transactions] = await Promise.all([
    masterIds.length
      ? db
          .select({
            id: mastersTable.id,
            alias: mastersTable.alias,
          })
          .from(mastersTable)
          .where(inArray(mastersTable.id, masterIds))
      : Promise.resolve([] as { id: number; alias: string | null }[]),
    leadIds.length
      ? db
          .select({
            id: leadsTable.id,
            clientName: leadsTable.clientName,
          })
          .from(leadsTable)
          .where(inArray(leadsTable.id, leadIds))
      : Promise.resolve([] as { id: number; clientName: string | null }[]),
    db.select().from(receiptsTable).where(inArray(receiptsTable.orderId, orderIds)),
    db
      .select({
        id: transactionsTable.id,
        orderId: transactionsTable.orderId,
        orderAmount: transactionsTable.orderAmount,
        commission: transactionsTable.commission,
        paymentStatus: transactionsTable.paymentStatus,
        prepaymentDeducted: transactionsTable.prepaymentDeducted,
      })
      .from(transactionsTable)
      .where(inArray(transactionsTable.orderId, orderIds)),
  ]);

  // Count responded dispatches per order (for "waiting_master" column — real response count)
  const dispatchCounts = orderIds.length > 0
    ? await db
        .select({
          orderId: orderDispatchesTable.orderId,
          responded: sql<number>`count(*) filter (where ${orderDispatchesTable.status} = 'responded')`.as("responded"),
          sent: sql<number>`count(*) filter (where ${orderDispatchesTable.status} = 'sent')`.as("sent"),
        })
        .from(orderDispatchesTable)
        .where(inArray(orderDispatchesTable.orderId, orderIds))
        .groupBy(orderDispatchesTable.orderId)
    : [];
  const responseCountMap = new Map<number, { responded: number; sent: number }>();
  for (const row of dispatchCounts) {
    responseCountMap.set(row.orderId, { responded: safeNumber(row.responded), sent: safeNumber(row.sent) });
  }

  // Load partial payments for all transaction IDs
  const txIds = transactions.map((t) => t.id);
  const partialPayments = txIds.length > 0
    ? await db.select().from(transactionPaymentsTable).where(inArray(transactionPaymentsTable.transactionId, txIds))
    : [];
  const partialsByTx = new Map<number, typeof partialPayments>();
  for (const p of partialPayments) {
    const arr = partialsByTx.get(p.transactionId) ?? [];
    arr.push(p);
    partialsByTx.set(p.transactionId, arr);
  }

  const masterMap = new Map(masters.map((m) => [m.id, m]));
  const leadMap = new Map(leads.map((l) => [l.id, l]));

  // Latest receipt per order
  const receiptMap = new Map<number, (typeof receipts)[0]>();
  for (const r of receipts) {
    const existing = receiptMap.get(r.orderId);
    if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
      receiptMap.set(r.orderId, r);
    }
  }

  const txByOrder = new Map<number, typeof transactions>();
  for (const tx of transactions) {
    const arr = txByOrder.get(tx.orderId) ?? [];
    arr.push(tx);
    txByOrder.set(tx.orderId, arr);
  }

  // Build columns
  const columns: Record<ColumnKey, Column> = {
    new: { key: "new", emoji: "🆕", title: "Новые", hint: "автоматически уходят в рассылку", count: 0, cards: [] },
    waiting_master: { key: "waiting_master", emoji: "📡", title: "Ждут мастера", hint: "рассылка ушла, ждём отклик", count: 0, cards: [] },
    no_estimate: { key: "no_estimate", emoji: "📋", title: "Без сметы", hint: "мастер взял, но сметы нет", count: 0, cards: [] },
    estimate_unpaid: { key: "estimate_unpaid", emoji: "💰", title: "Смета + ждём оплату", hint: "клиент должен оплатить аванс", count: 0, sumPending: 0, cards: [] },
    estimate_paid: { key: "estimate_paid", emoji: "✅", title: "Смета оплачена", hint: "работа в процессе", count: 0, sumPaid: 0, expectedCommission: 0, cards: [] },
    commission_left: { key: "commission_left", emoji: "🪙", title: "С остатком комиссии", hint: "доплата по итоговой сумме", count: 0, sumPending: 0, cards: [] },
    closed_24h: { key: "closed_24h", emoji: "🏁", title: "Закрыто 24ч", hint: "успешно завершено", count: 0, sumPaid: 0, cards: [] },
    problem: { key: "problem", emoji: "🚨", title: "Проблема", hint: "нужен оператор", count: 0, cards: [] },
  };

  // Tier counters for breakdown lines
  let estPaidFixed = 0, estPaidPercent = 0;
  let commLeftFixed = 0, commLeftPercent = 0;

  for (const o of orders) {
    const master = o.masterId ? masterMap.get(o.masterId) ?? null : null;
    const lead = leadMap.get(o.leadId);
    const receipt = receiptMap.get(o.id) ?? null;
    const txs = txByOrder.get(o.id) ?? [];

    const refTime = o.assignedAt ?? o.lastBroadcastAt ?? o.updatedAt ?? o.createdAt;
    const ageMs = Math.max(0, now - new Date(refTime || new Date()).getTime());
    const stageLabel = timeAgoLabel(ageMs);

    const total = receipt ? safeNumber(receipt.totalAmount) : 0;
    const prepayment = receipt ? safeNumber(receipt.prepaymentAmount) : 0;
    const orderAmount = safeNumber((o as any).orderAmount);
    const expectedCommission = orderAmount > 0 ? calcCommission(orderAmount) : total > 0 ? calcCommission(total) : 0;
    const realTxs = txs.filter((t) => safeNumber(t.commission) > 0);
    const commissionPaid = realTxs.length > 0 && realTxs.every((t) => isPaidStatus(t.paymentStatus));
    // Calculate net payable per order: commission - prepaymentDeducted - totalPartialPaid
    const orderPrepDeduct = realTxs.reduce((s, t) => s + safeNumber(t.prepaymentDeducted, 0), 0);
    const orderPartials = realTxs.flatMap((t) => partialsByTx.get(t.id) ?? []);
    const orderTotalPartialPaid = orderPartials.reduce((s, p) => s + safeNumber(p.amount, 0), 0);
    const commissionUnpaidFromTxs = realTxs.filter((t) => !isPaidStatus(t.paymentStatus))
      .reduce((s, t) => {
        const pd = safeNumber(t.prepaymentDeducted, 0);
        const tp = (partialsByTx.get(t.id) ?? []).reduce((ss, p) => ss + safeNumber(p.amount, 0), 0);
        return s + Math.max(0, safeNumber(t.commission) - pd - tp);
      }, 0);

    // For completed orders with no transactions, compute implicit commission debt from order/receipt amount
    const implicitCommissionDebt = (o.status === "completed" && realTxs.length === 0)
      ? Math.max(0, (orderAmount > 0 ? calcCommission(orderAmount) : total > 0 ? calcCommission(total) : 0) - orderPrepDeduct - orderTotalPartialPaid)
      : 0;

    const commissionUnpaidAmount = commissionUnpaidFromTxs + implicitCommissionDebt;

    // Pre-calculate commission totals for problem detection
    const commTotalForProblem = total > 0 ? calcCommission(total) : orderAmount > 0 ? calcCommission(orderAmount) : 0;
    const commPaidForProblem = orderPrepDeduct + orderTotalPartialPaid;
    const commLeftForProblem = Math.max(0, commTotalForProblem - commPaidForProblem);

    const address = [o.city, o.district].filter(Boolean).join(", ");
    const title = (o as any).serviceType ?? "Заявка";
    const masterAlias = master?.alias ?? null;
    const baseCard: Omit<Card, "money" | "bot" | "badge"> = {
      id: `o${o.id}`,
      orderId: o.id,
      leadId: o.leadId ?? null,
      title,
      address,
      master: masterAlias,
      masterId: o.masterId ?? null,
      timeInStage: stageLabel,
      ageMs,
      status: o.status,
    };

    // Determine column
    // Problem detection (highest priority)
    // Note: operatorNote starting with "[ИИ]:" is AI-bot communication (scheduling calls,
    // meetings, etc.) — NOT a real problem. These notes are shown as a badge instead.
    const opNote = (o as any).operatorNote as string | undefined;
    const isAiNote = opNote?.startsWith("[ИИ]:") ?? false;
    let problem: string | null = null;
    if (o.status === "cancellation_requested") problem = "Запрос на отмену от мастера";
    else if (opNote && !isAiNote && commLeftForProblem > 0) problem = "Помечена оператором: " + opNote.slice(0, 60);
    else if (!receipt && o.assignedAt && now - new Date(o.assignedAt).getTime() > 48 * 3_600_000) problem = "Без сметы более 48 часов";
    else if (receipt && !(receipt as any).prepaymentSeenAt && now - new Date(receipt.createdAt).getTime() > 48 * 3_600_000) problem = "Оплата не подтверждена > 48ч";
    else if (commissionUnpaidAmount > 0 && o.status === "completed" && o.completedAt && now - new Date(o.completedAt).getTime() > 7 * 86_400_000) problem = "Комиссия не оплачена > 7 дней";

    if (problem) {
      // For problem cards with receipt + prepaymentSeenAt, show commission block
      // instead of misleading "оплачено {total}" badge
      const manualCommission = safeNumber((o as any).commission);
      const commTotal = receipt && total > 0 ? calcCommission(total) : manualCommission > 0 ? manualCommission : 0;
      const commPaid = commTotal > 0 ? orderPrepDeduct + orderTotalPartialPaid : 0;
      const commLeft = commTotal > 0 ? Math.max(0, commTotal - commPaid) : 0;
      const tier = commTotal > 0 ? commissionTier(total) : null;
      const partialPaymentsList = orderPartials.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        note: p.note ?? null,
        paidAt: p.paidAt.toISOString(),
      }));
      const card: Card = {
        ...baseCard,
        badge: { text: "нужен оператор", tone: "bad" },
        bot: { action: "ждёт твоего решения", eta: "связаться?", tone: "bad" },
        problemReason: problem,
        ...(tier && commTotal > 0
          ? { commission: {
              orderTotal: total,
              total: commTotal,
              paid: commPaid,
              left: commLeft,
              tier,
              ...(orderPrepDeduct > 0 ? { prepaymentDeducted: orderPrepDeduct } : {}),
              ...(orderTotalPartialPaid > 0 ? { totalPartialPaid: orderTotalPartialPaid } : {}),
              ...(partialPaymentsList.length > 0 ? { partialPayments: partialPaymentsList } : {}),
            } }
          : receipt && total > 0
            ? { money: { kind: (receipt as any).prepaymentSeenAt ? "paid" : "estimate", amount: total } }
            : {}),
      };
      columns.problem.cards.push(card);
      columns.problem.count++;
      continue;
    }

    // AI-bot note badge (shown on non-problem cards so operator sees context)
    const aiNoteBadge = isAiNote && opNote
      ? { badge: { text: opNote.slice(5).trim().slice(0, 40), tone: "info" as BadgeTone } }
      : {};

    if (o.status === "completed") {
      const card: Card = {
        ...baseCard,
        money: { kind: "paid", amount: total > 0 ? total : orderAmount, tier: commissionTier(total || orderAmount) },
        badge: { text: `комиссия ${formatMoney(expectedCommission)}`, tone: "ok" },
        ...aiNoteBadge,
      };
      columns.closed_24h.cards.push(card);
      columns.closed_24h.count++;
      columns.closed_24h.sumPaid! += total > 0 ? total : orderAmount;
      continue;
    }

    // commission_left: order amount confirmed but commission not fully paid (still active)
    const manualCommission = safeNumber((o as any).commission);
    const effectiveOrderAmount = orderAmount > 0 ? orderAmount : 0;
    const txCommission = realTxs.length > 0 ? Math.max(...realTxs.map(t => safeNumber(t.commission))) : 0;
    const txOrderAmount = realTxs.length > 0 ? Math.max(...realTxs.map(t => safeNumber(t.orderAmount))) : 0;
    if ((effectiveOrderAmount > 0 || manualCommission > 0 || txCommission > 0) && commissionUnpaidAmount > 0 && (o.status === "in_progress" || o.status === "master_assigned")) {
      const tierBase = effectiveOrderAmount > 0 ? effectiveOrderAmount : txOrderAmount > 0 ? txOrderAmount : manualCommission > COMMISSION_FIXED ? manualCommission / COMMISSION_PERCENT : COMMISSION_THRESHOLD;
      const tier = commissionTier(tierBase);
      if (tier === "fixed") commLeftFixed++; else commLeftPercent++;
      const commTotal = effectiveOrderAmount > 0 ? calcCommission(effectiveOrderAmount) : txCommission > 0 ? txCommission : manualCommission;
      const commPaid = orderPrepDeduct + orderTotalPartialPaid;
      const partialPaymentsList = orderPartials.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        note: p.note ?? null,
        paidAt: p.paidAt.toISOString(),
      }));
      const card: Card = {
        ...baseCard,
        commission: {
          orderTotal: orderAmount,
          total: commTotal,
          paid: commPaid,
          left: commissionUnpaidAmount,
          tier,
          ...(orderPrepDeduct > 0 ? { prepaymentDeducted: orderPrepDeduct } : {}),
          ...(orderTotalPartialPaid > 0 ? { totalPartialPaid: orderTotalPartialPaid } : {}),
          ...(partialPaymentsList.length > 0 ? { partialPayments: partialPaymentsList } : {}),
        },
        bot: { action: "напомню мастеру", eta: "через 2ч", tone: "warn" },
      };
      columns.commission_left.cards.push(card);
      columns.commission_left.count++;
      columns.commission_left.sumPending! += commissionUnpaidAmount;
      continue;
    }

    // Receipt with prepayment confirmed — route based on commission status:
    // If commission is still owed → commission_left (needs follow-up).
    // If commission is fully covered → estimate_paid (work in progress, all good).
    if (receipt && (receipt as any).prepaymentSeenAt) {
      const tier = commissionTier(total);
      const realPaid = prepayment > 0 ? prepayment : total;
      const manualCommission = safeNumber((o as any).commission);
      const commTotal = total > 0 ? calcCommission(total) : manualCommission > 0 ? manualCommission : 0;
      // Use transaction data for accurate commission tracking:
      // prepaymentDeducted = бронь зачтённая в комиссию, totalPartialPaid = частичные оплаты мастера
      const commPaid = orderPrepDeduct + orderTotalPartialPaid;
      const commLeft = Math.max(0, commTotal - commPaid);
      const partialPaymentsList = orderPartials.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        note: p.note ?? null,
        paidAt: p.paidAt.toISOString(),
      }));

      if (commLeft > 0) {
        // Commission still owed → commission_left
        if (tier === "fixed") commLeftFixed++; else commLeftPercent++;
        const card: Card = {
          ...baseCard,
          commission: {
            orderTotal: total,
            total: commTotal,
            paid: commPaid,
            left: commLeft,
            tier,
            ...(orderPrepDeduct > 0 ? { prepaymentDeducted: orderPrepDeduct } : {}),
            ...(orderTotalPartialPaid > 0 ? { totalPartialPaid: orderTotalPartialPaid } : {}),
            ...(partialPaymentsList.length > 0 ? { partialPayments: partialPaymentsList } : {}),
          },
          bot: { action: "напомню мастеру", eta: "через 2ч", tone: "warn" },
          ...aiNoteBadge,
        };
        columns.commission_left.cards.push(card);
        columns.commission_left.count++;
        columns.commission_left.sumPending! += commLeft;
      } else {
        // Commission fully covered → estimate_paid (work in progress)
        if (tier === "fixed") estPaidFixed++; else estPaidPercent++;
        const card: Card = {
          ...baseCard,
          commission: {
            orderTotal: total,
            total: commTotal,
            paid: commPaid,
            left: 0,
            tier,
            ...(orderPrepDeduct > 0 ? { prepaymentDeducted: orderPrepDeduct } : {}),
            ...(orderTotalPartialPaid > 0 ? { totalPartialPaid: orderTotalPartialPaid } : {}),
            ...(partialPaymentsList.length > 0 ? { partialPayments: partialPaymentsList } : {}),
          },
          bot: { action: "ждём отчёт мастера", eta: "норма", tone: "ok" },
        };
        columns.estimate_paid.cards.push(card);
        columns.estimate_paid.count++;
        columns.estimate_paid.sumPaid! += realPaid;
        columns.estimate_paid.expectedCommission! += commTotal;
      }
      continue;
    }

    // estimate_unpaid: receipt exists, prepayment not confirmed
    if (receipt) {
      const hoursSinceReceipt = Math.max(0, (now - new Date(receipt.createdAt).getTime()) / 3_600_000);
      const tone: BotTone = hoursSinceReceipt > 24 ? "warn" : "ok";
      const eta = hoursSinceReceipt > 24 ? "сейчас" : "через 1ч";
      const card: Card = {
        ...baseCard,
        money: { kind: "estimate", amount: total },
        bot: { action: hoursSinceReceipt > 24 ? "повторное напоминание" : "напомню клиенту", eta, tone },
        ...(hoursSinceReceipt > 24 ? { badge: { text: `${Math.floor(hoursSinceReceipt)}ч ждём оплату`, tone: "warn" as BadgeTone } } : {}),
      };
      columns.estimate_unpaid.cards.push(card);
      columns.estimate_unpaid.count++;
      columns.estimate_unpaid.sumPending! += prepayment > 0 ? prepayment : total;
      continue;
    }

    // no_estimate: master assigned but no receipt
    if (o.status === "master_assigned" || o.status === "in_progress") {
      const hoursAssigned = o.assignedAt ? Math.max(0, (now - new Date(o.assignedAt).getTime()) / 3_600_000) : 0;
      const tone: BotTone = hoursAssigned > 24 ? "bad" : hoursAssigned > 6 ? "warn" : "ok";
      const action = hoursAssigned > 24 ? "эскалация в Проблему через" : hoursAssigned > 6 ? "напомню мастеру" : "ждём смету";
      const eta = hoursAssigned > 24 ? "2ч" : hoursAssigned > 6 ? "через 18 мин" : "норма";
      const card: Card = {
        ...baseCard,
        bot: { action, eta, tone },
        ...(hoursAssigned > 24 ? { badge: { text: "просрочка", tone: "bad" as BadgeTone } } : {}),
      };
      columns.no_estimate.cards.push(card);
      columns.no_estimate.count++;
      continue;
    }

    // waiting_master vs new
    const isFreshlyCreated = !o.lastBroadcastAt && o.broadcastCount === 0;
    if (isFreshlyCreated) {
      // New order — not yet broadcast. ETA = time until next 15-min cycle
      const minutesSinceCreation = o.createdAt ? Math.max(0, (now - new Date(o.createdAt).getTime()) / 60_000) : 0;
      const nextCycleMin = Math.max(1, 15 - (Math.floor(minutesSinceCreation) % 15));
      const etaStr = nextCycleMin <= 1 ? "1 мин" : `${nextCycleMin} мин`;
      const tone: BotTone = minutesSinceCreation > 15 ? "warn" : "ok";
      const card: Card = {
        ...baseCard,
        bot: { action: "разошлю мастерам через", eta: etaStr, tone },
        badge: { text: minutesSinceCreation > 15 ? "задержка" : "автопул", tone: minutesSinceCreation > 15 ? "warn" as BadgeTone : "info" as BadgeTone },
      };
      columns.new.cards.push(card);
      columns.new.count++;
    } else {
      const minutesSinceBroadcast = o.lastBroadcastAt ? Math.max(0, (now - new Date(o.lastBroadcastAt).getTime()) / 60_000) : 0;
      const broadcastCount = safeNumber(o.broadcastCount, 1);
      // Wave info: broadcastCount corresponds to wave number
      const waveNum = Math.min(broadcastCount, 3);
      const waveLabel = waveNum === 1 ? "рассылка 1" : waveNum === 2 ? "рассылка 2" : "рассылка 3";
      const nextWaveMin = Math.max(1, 120 - Math.floor(minutesSinceBroadcast)); // 2h interval
      const etaStr = nextWaveMin <= 1 ? "1 мин" : nextWaveMin < 60 ? `${nextWaveMin} мин` : `${Math.floor(nextWaveMin / 60)}ч ${nextWaveMin % 60}мин`;

      // Real response count from order_dispatches table
      const dispatchInfo = responseCountMap.get(o.id);
      const respondedCount = dispatchInfo?.responded ?? 0;
      const responseWord = respondedCount === 1 ? "отклик" : respondedCount < 5 ? "отклика" : "откликов";

      let action: string;
      let eta: string;
      let tone: BotTone;
      let badge: { text: string; tone: BadgeTone } | undefined;

      if (respondedCount > 0) {
        // Masters have responded — show positive status
        action = `${respondedCount} ${responseWord}, ждём назначение`;
        eta = "выбери мастера";
        tone = "ok";
        badge = { text: `${respondedCount} ${responseWord}`, tone: "ok" };
      } else if (waveNum >= 3 && minutesSinceBroadcast > 120) {
        // After 3 waves + 2h — admin alerted, stuck
        action = "нет мастера, алерт админу";
        eta = "ручное решение";
        tone = "bad";
        badge = { text: "3 рассылки без отклика", tone: "bad" };
      } else if (minutesSinceBroadcast > 60) {
        // Waiting for next wave
        action = `повторная рассылка через`;
        eta = etaStr;
        tone = "warn";
        badge = { text: `${waveLabel} · 0 откликов`, tone: "warn" };
      } else {
        // Recently broadcast — waiting for response
        action = `разослано мастерам (${waveLabel})`;
        eta = "ждём отклик";
        tone = "ok";
      }

      const card: Card = {
        ...baseCard,
        bot: { action, eta, tone },
        ...(badge ? { badge } : {}),
        responseCount: respondedCount,
      };
      columns.waiting_master.cards.push(card);
      columns.waiting_master.count++;
    }
  }

  // Sort cards inside each column by ageMs ASC (newest first → oldest at the bottom).
  // Exception: "problem" column keeps oldest-first ordering, since stale problems are
  // the most urgent and operators expect them at the top.
  for (const col of Object.values(columns)) {
    if (col.key === "problem") {
      col.cards.sort((a, b) => b.ageMs - a.ageMs);
    } else {
      col.cards.sort((a, b) => a.ageMs - b.ageMs);
    }
  }

  // Breakdown strings for money columns
  if (columns.estimate_paid.count > 0) {
    columns.estimate_paid.breakdown = `${estPaidFixed}× до 50к · ${estPaidPercent}× выше · ожид. ${formatMoney(columns.estimate_paid.expectedCommission ?? 0)}`;
  }
  if (columns.commission_left.count > 0) {
    columns.commission_left.breakdown = `${commLeftFixed}× фикс 5к · ${commLeftPercent}× процент от чека`;
  }

  // Funnel
  const activeCount =
    columns.new.count + columns.waiting_master.count + columns.no_estimate.count +
    columns.estimate_unpaid.count + columns.estimate_paid.count + columns.commission_left.count + columns.problem.count;

  // sumInWork = всё, что ждёт денежного движения (предоплата по выставленным сметам + остатки комиссии).
  // Заявки в "Без сметы" не имеют подтверждённой суммы и в денежный funnel не идут.
  const sumInWork = (columns.estimate_unpaid.sumPending ?? 0) + (columns.commission_left.sumPending ?? 0);
  const sumPaid = columns.estimate_paid.sumPaid!;
  const expectedCommission = columns.estimate_paid.expectedCommission!;
  const totalAttempts = activeCount + columns.closed_24h.count;
  const conversionPct = totalAttempts > 0 ? Math.round((columns.closed_24h.count / totalAttempts) * 100) : 0;

  const funnel = {
    activeCount,
    sumInWork,
    sumPaid,
    expectedCommission,
    conversionPct,
    problemCount: columns.problem.count,
  };

  return {
    funnel,
    columns: [
      columns.new,
      columns.waiting_master,
      columns.no_estimate,
      columns.estimate_unpaid,
      columns.estimate_paid,
      columns.commission_left,
      columns.closed_24h,
      columns.problem,
    ],
    generatedAt: new Date().toISOString(),
  };
}

function emptyBoard() {
  const empty: Column[] = (
    [
      ["new", "🆕", "Новые", "автоматически уходят в рассылку"],
      ["waiting_master", "📡", "Ждут мастера", "рассылка ушла, ждём отклик"],
      ["no_estimate", "📋", "Без сметы", "мастер взял, но сметы нет"],
      ["estimate_unpaid", "💰", "Смета + ждём оплату", "клиент должен оплатить аванс"],
      ["estimate_paid", "✅", "Смета оплачена", "работа в процессе"],
      ["commission_left", "🪙", "С остатком комиссии", "доплата по итоговой сумме"],
      ["closed_24h", "🏁", "Закрыто 24ч", "успешно завершено"],
      ["problem", "🚨", "Проблема", "нужен оператор"],
    ] as [ColumnKey, string, string, string][]
  ).map(([key, emoji, title, hint]) => ({ key, emoji, title, hint, count: 0, cards: [] }));
  return {
    funnel: { activeCount: 0, sumInWork: 0, sumPaid: 0, expectedCommission: 0, conversionPct: 0, problemCount: 0 },
    columns: empty,
    generatedAt: new Date().toISOString(),
  };
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}

function isPaidStatus(status: string | null | undefined): boolean {
  return status === "paid" || status === "overdue";
}

// ── Routes ───────────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (_req, res) => {
  try {
    const board = await buildBoard();
    res.json(board);
  } catch (e) {
    console.error("[work-board] build error:", e);
    res.status(500).json({ error: String(e) });
  }
});

// SSE — heartbeat every 5s + immediate event when something changes.
router.get("/stream", requireAuth, (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(`event: ready\ndata: {"ok":true}\n\n`);

  const tick = () => {
    if (res.writableEnded) return;
    try {
      res.write(`event: tick\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    } catch {}
  };
  const onChange = (info: { reason: string; at: string }) => {
    if (res.writableEnded) return;
    try {
      res.write(`event: changed\ndata: ${JSON.stringify(info)}\n\n`);
    } catch {}
  };

  const interval = setInterval(tick, 5000);
  workBoardBus.on("changed", onChange);

  req.on("close", () => {
    clearInterval(interval);
    workBoardBus.off("changed", onChange);
    res.end();
  });
});

// POST /api/work-board/escalate/:orderId — operator marks the order as «Проблема».
router.post("/escalate/:orderId", operatorRoles, async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) return res.status(400).json({ error: "bad orderId" });
  const note = sanitizeNote((req.body?.note as string | undefined) || "Эскалация оператором");
  try {
    // Check order exists
    const [order] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order) return res.status(404).json({ error: "order not found" });
    
    await db
      .update(ordersTable)
      .set({ operatorNote: note, updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));
    notifyWorkBoardChanged("escalate");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/work-board/clear-problem/:orderId — operator clears the problem flag.
router.post("/clear-problem/:orderId", operatorRoles, async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) return res.status(400).json({ error: "bad orderId" });
  try {
    // Check order exists
    const [order] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order) return res.status(404).json({ error: "order not found" });
    
    await db
      .update(ordersTable)
      .set({ operatorNote: null, updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));
    notifyWorkBoardChanged("clear-problem");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/work-board/return-to-pool/:orderId — operator-confirmed return to pool.
// Requires { confirmed: true } in the body to prevent accidental triggers.
router.post("/return-to-pool/:orderId", operatorRoles, async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) return res.status(400).json({ error: "bad orderId" });
  if (!req.body?.confirmed) return res.status(400).json({ error: "confirmation_required" });
  try {
    // Get current masterId before resetting — needed for reputation tracking
    const [order] = await db.select({ masterId: ordersTable.masterId })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    if (!order) return res.status(404).json({ error: "order not found" });

    await db.transaction(async (tx) => {
      // Delete all dispatch records so the order can be re-broadcast from scratch
      await tx.delete(orderDispatchesTable)
        .where(eq(orderDispatchesTable.orderId, orderId));

      await tx.update(ordersTable)
        .set({
          status: "waiting_master",
          masterId: null,
          assignedAt: null,
          lastBroadcastAt: null,
          broadcastCount: 0,
          dispatchStatus: "none",
          dispatchWave: 1,
          operatorNote: null,
          updatedAt: new Date(),
        } as any)
        .where(eq(ordersTable.id, orderId));

      // Decrement master order counters
      if (order.masterId) {
        await tx.update(mastersTable)
          .set({
            totalOrders: sql`${mastersTable.totalOrders} - 1`,
            acceptedOrders: sql`${mastersTable.acceptedOrders} - 1`,
          })
          .where(eq(mastersTable.id, order.masterId));
      }
    });

    // Record cancellation for reputation + history + notify master
    if (order?.masterId) {
      const masterId = order.masterId;
      await recordOrderCancelled(masterId, orderId)
        .catch((e: any) => console.error("[return-to-pool] reputation update failed:", e));
      await recordOrderMasterHistory(masterId, orderId, "returned_to_pool", "Возвращён в пул оператором")
        .catch((e: any) => console.error("[return-to-pool] history record failed:", e));

      // Notify master that order was returned to pool
      const [master] = await db.select({ id: mastersTable.id, maxChatId: mastersTable.maxChatId, alias: mastersTable.alias })
        .from(mastersTable)
        .where(eq(mastersTable.id, masterId))
        .limit(1);

      if (master) {
        const notifyText = `🔄 Заказ #${orderId} возвращён в пул и переназначен другому мастеру. Частые возвраты снижают ваш рейтинг и могут привести к блокировке.`;
        if (master.maxChatId) {
          await sendMaxMessage(master.maxChatId, notifyText).catch((e: any) => console.error("[return-to-pool] max send failed:", e));
        }
        sendPushToMaster(masterId, { type: "new_message", title: "Заказ возвращён в пул", body: `Заказ #${orderId} переназначен другому мастеру.` }).catch((e: any) => console.error("[return-to-pool] push failed:", e));
        const chatId = master.maxChatId ? `max_${master.maxChatId}` : `pwa_${masterId}`;
        await db.insert(masterMessagesTable).values({
          masterId,
          telegramChatId: chatId,
          text: notifyText,
          fromMaster: false,
          senderName: "Оператор",
          isRead: true,
        }).catch((e: any) => console.error("[return-to-pool] message save failed:", e));
      }
    }

    notifyWorkBoardChanged("return-to-pool");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/work-board/orders/:orderId/partial-payment — add partial commission payment by orderId
router.post("/orders/:orderId/partial-payment", operatorRoles, async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) return res.status(400).json({ error: "bad orderId" });
  const { amount, note } = req.body;
  const paymentAmount = safeNumber(amount);
  if (paymentAmount <= 0) {
    return res.status(400).json({ error: "Сумма должна быть положительным числом" });
  }

  try {
    // Find any transaction for this order (paid or pending)
    let txRows = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.orderId, orderId));
    let tx = txRows.find(t => safeNumber(t.commission) > 0 && t.paymentStatus !== "paid");

    // If no active commission transaction exists, try to find any transaction or create one
    if (!tx) {
      const anyTx = txRows[0];
      if (anyTx) {
        // Transaction exists but is already paid or has 0 commission — create a new one for additional payment tracking
        const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
        if (!order || !order.masterId) {
          return res.status(404).json({ error: "Заказ или мастер не найдены" });
        }
        const orderAmount = safeNumber(order.orderAmount);
        const commission = safeNumber(order.commission) || (orderAmount > 0 ? calcCommission(orderAmount) : 0);
        if (commission <= 0) {
          return res.status(400).json({ error: "Комиссия по заказу равна 0, нечего оплачивать" });
        }
        const [newTx] = await db.insert(transactionsTable).values({
          orderId,
          masterId: order.masterId,
          orderAmount: orderAmount > 0 ? String(orderAmount) : "0",
          commission: String(commission),
          prepaymentDeducted: "0",
          paymentStatus: "pending",
        }).returning();
        tx = newTx;
      } else {
        // No transaction at all — fetch order and create one
        const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
        if (!order) return res.status(404).json({ error: "Заказ не найден" });
        if (!order.masterId) return res.status(400).json({ error: "Нет назначенного мастера" });
        const orderAmount = safeNumber(order.orderAmount);
        const commission = safeNumber(order.commission) || (orderAmount > 0 ? calcCommission(orderAmount) : 0);
        if (commission <= 0) {
          return res.status(400).json({ error: "Комиссия по заказу равна 0, нечего оплачивать" });
        }
        const [newTx] = await db.insert(transactionsTable).values({
          orderId,
          masterId: order.masterId,
          orderAmount: orderAmount > 0 ? String(orderAmount) : "0",
          commission: String(commission),
          prepaymentDeducted: "0",
          paymentStatus: "pending",
        }).returning();
        tx = newTx;
      }
    }

    // Get existing partial payments to validate amount
    const existingPartials = await db.select().from(transactionPaymentsTable)
      .where(eq(transactionPaymentsTable.transactionId, tx.id));
    const totalPartialPaidBefore = existingPartials.reduce((s, p) => s + safeNumber(p.amount), 0);
    const commission = safeNumber(tx.commission);
    const prepaymentDeducted = safeNumber(tx.prepaymentDeducted, 0);
    const remainingBefore = Math.max(0, commission - prepaymentDeducted - totalPartialPaidBefore);
    if (paymentAmount > remainingBefore) {
      return res.status(400).json({ error: `Сумма превышает оставшийся долг комиссии (${remainingBefore.toLocaleString("ru-RU")} ₽)` });
    }

    const { payment, remaining, totalPartialPaid } = await db.transaction(async (txDb) => {
      // Insert the partial payment
      const [insertedPayment] = await txDb.insert(transactionPaymentsTable).values({
        transactionId: tx.id,
        amount: String(paymentAmount),
        note: note ?? null,
        paidAt: new Date(),
      }).returning();

      // Recalculate after insertion
      const allPartials = await txDb.select().from(transactionPaymentsTable)
        .where(eq(transactionPaymentsTable.transactionId, tx.id));
      const totalPartialPaid = allPartials.reduce((s, p) => s + safeNumber(p.amount), 0);
      const remaining = Math.max(0, commission - prepaymentDeducted - totalPartialPaid);

      // If fully paid, mark as paid
      if (remaining === 0) {
        await txDb.update(transactionsTable)
          .set({ paymentStatus: "paid", paidAt: new Date() })
          .where(eq(transactionsTable.id, tx.id));
      }

      // Always update master debt (was previously only on full payment, causing stale debt)
      const masterRows = await txDb.select({ debt: mastersTable.debt, maxChatId: mastersTable.maxChatId })
        .from(mastersTable).where(eq(mastersTable.id, tx.masterId));
      const master = masterRows[0];
      if (master) {
        const newDebt = Math.max(0, safeNumber(master.debt) - paymentAmount);
        await txDb.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, tx.masterId));
      }

      return { payment: insertedPayment, remaining, totalPartialPaid };
    });

    // Notify master about payment
    const masterRows = await db.select({ debt: mastersTable.debt, maxChatId: mastersTable.maxChatId })
      .from(mastersTable).where(eq(mastersTable.id, tx.masterId));
    const master = masterRows[0];
    if (master) {
      const notifyText = remaining === 0
        ? `✅ Оплата по заказу #${orderId} принята.\nКомиссия полностью закрыта! 🟢`
        : `💰 Частичная оплата по заказу #${orderId} принята: ${paymentAmount.toLocaleString("ru-RU")} ₽\nОстаток: ${remaining.toLocaleString("ru-RU")} ₽`;

      // Max notification
      if (master.maxChatId) {
        await sendMaxMessage(master.maxChatId, notifyText)
          .catch((e: any) => console.error("[partial-payment] max send failed:", e));
      }
      // PWA push notification
      const pushBody = remaining === 0
        ? `Оплата по заказу #${orderId} принята. Комиссия полностью закрыта!`
        : `Оплата ${paymentAmount.toLocaleString("ru-RU")} ₽ по заказу #${orderId} принята. Остаток: ${remaining.toLocaleString("ru-RU")} ₽`;
      sendPushToMaster(tx.masterId, { type: "new_message", title: remaining === 0 ? "Комиссия закрыта" : "Частичная оплата", body: pushBody })
        .catch((e: any) => console.error("[partial-payment] push failed:", e));
      // Save to master dialog (visible in CRM chat)
      const chatId = master.maxChatId ? `max_${master.maxChatId}` : `pwa_${tx.masterId}`;
      await db.insert(masterMessagesTable).values({
        masterId: tx.masterId,
        telegramChatId: chatId,
        text: notifyText,
        fromMaster: false,
        senderName: "Система",
        isRead: true,
      }).catch((e: any) => console.error("[partial-payment] save message failed:", e));
    }

    notifyWorkBoardChanged("partial-payment");
    res.json({
      ok: true,
      payment: { id: payment.id, amount: safeNumber(payment.amount), note: payment.note, paidAt: payment.paidAt.toISOString() },
      remaining,
      totalPartialPaid,
      commission,
      prepaymentDeducted,
    });
  } catch (e) {
    console.error("[partial-payment] error:", e);
    res.status(500).json({ error: String(e) });
  }
});

export default router;
