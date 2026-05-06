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
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, transactionsTable, transactionPaymentsTable, masterMessagesTable } from "@workspace/db";
import { inArray, isNull, eq, and, gte } from "drizzle-orm";
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

function calcCommission(total: number): number {
  if (!total || total <= 0) return 0;
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
        commission: transactionsTable.commission,
        paymentStatus: transactionsTable.paymentStatus,
        prepaymentDeducted: transactionsTable.prepaymentDeducted,
      })
      .from(transactionsTable)
      .where(inArray(transactionsTable.orderId, orderIds)),
  ]);

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
    const ageMs = now - new Date(refTime).getTime();
    const stageLabel = timeAgoLabel(ageMs);

    const total = receipt ? Number(receipt.totalAmount) : 0;
    const prepayment = receipt ? Number(receipt.prepaymentAmount) : 0;
    const orderAmount = (o as any).orderAmount ? Number((o as any).orderAmount) : 0;
    const expectedCommission = orderAmount > 0 ? calcCommission(orderAmount) : total > 0 ? calcCommission(total) : 0;
    const realTxs = txs.filter((t) => Number(t.commission) > 0);
    const commissionPaid = realTxs.length > 0 && realTxs.every((t) => t.paymentStatus === "paid");
    // Calculate net payable per order: commission - prepaymentDeducted - totalPartialPaid
    const orderPrepDeduct = realTxs.reduce((s, t) => s + Number(t.prepaymentDeducted ?? 0), 0);
    const orderPartials = realTxs.flatMap((t) => partialsByTx.get(t.id) ?? []);
    const orderTotalPartialPaid = orderPartials.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const commissionUnpaidAmount = realTxs.filter((t) => t.paymentStatus !== "paid")
      .reduce((s, t) => {
        const pd = Number(t.prepaymentDeducted ?? 0);
        const tp = (partialsByTx.get(t.id) ?? []).reduce((ss, p) => ss + Number(p.amount ?? 0), 0);
        return s + Math.max(0, Number(t.commission) - pd - tp);
      }, 0);

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
    let problem: string | null = null;
    if (o.status === "cancellation_requested") problem = "Запрос на отмену от мастера";
    else if ((o as any).operatorNote) problem = "Помечена оператором: " + String((o as any).operatorNote).slice(0, 60);
    else if (!receipt && o.assignedAt && now - new Date(o.assignedAt).getTime() > 48 * 3_600_000) problem = "Без сметы более 48 часов";
    else if (receipt && !(receipt as any).prepaymentSeenAt && now - new Date(receipt.createdAt).getTime() > 48 * 3_600_000) problem = "Оплата не подтверждена > 48ч";
    else if (commissionUnpaidAmount > 0 && o.status === "completed" && o.completedAt && now - new Date(o.completedAt).getTime() > 7 * 86_400_000) problem = "Комиссия не оплачена > 7 дней";

    if (problem) {
      const card: Card = {
        ...baseCard,
        badge: { text: "нужен оператор", tone: "bad" },
        bot: { action: "ждёт твоего решения", eta: "связаться?", tone: "bad" },
        problemReason: problem,
        ...(receipt && total > 0
          ? { money: { kind: (receipt as any).prepaymentSeenAt ? "paid" : "estimate", amount: total } }
          : {}),
      };
      columns.problem.cards.push(card);
      columns.problem.count++;
      continue;
    }

    if (o.status === "completed") {
      const card: Card = {
        ...baseCard,
        money: { kind: "paid", amount: total > 0 ? total : orderAmount, tier: commissionTier(total || orderAmount) },
        badge: { text: `комиссия ${formatMoney(expectedCommission)}`, tone: "ok" },
      };
      columns.closed_24h.cards.push(card);
      columns.closed_24h.count++;
      columns.closed_24h.sumPaid! += total > 0 ? total : orderAmount;
      continue;
    }

    // commission_left: order amount confirmed but commission not fully paid (still active)
    if (orderAmount > 0 && commissionUnpaidAmount > 0 && (o.status === "in_progress" || o.status === "master_assigned")) {
      const tier = commissionTier(orderAmount);
      if (tier === "fixed") commLeftFixed++; else commLeftPercent++;
      const commTotal = calcCommission(orderAmount);
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
      const commTotal = calcCommission(total);
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
      const hoursSinceReceipt = (now - new Date(receipt.createdAt).getTime()) / 3_600_000;
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
      const hoursAssigned = o.assignedAt ? (now - new Date(o.assignedAt).getTime()) / 3_600_000 : 0;
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
      const card: Card = {
        ...baseCard,
        bot: { action: "разошлю мастерам через", eta: "1 мин", tone: "ok" },
        badge: { text: "автопул", tone: "info" },
      };
      columns.new.cards.push(card);
      columns.new.count++;
    } else {
      const minutesSinceBroadcast = o.lastBroadcastAt ? (now - new Date(o.lastBroadcastAt).getTime()) / 60_000 : 0;
      const tone: BotTone = minutesSinceBroadcast > 60 ? "warn" : "ok";
      const card: Card = {
        ...baseCard,
        bot: {
          action: minutesSinceBroadcast > 60 ? "повторная рассылка через" : "разослано мастерам",
          eta: minutesSinceBroadcast > 60 ? "13 мин" : "ждём отклик",
          tone,
        },
        ...(minutesSinceBroadcast > 60 ? { badge: { text: "0 откликов", tone: "warn" as BadgeTone } } : {}),
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
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(`event: ready\ndata: {"ok":true}\n\n`);

  const tick = () => {
    res.write(`event: tick\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  };
  const onChange = (info: { reason: string; at: string }) => {
    res.write(`event: changed\ndata: ${JSON.stringify(info)}\n\n`);
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
  const note = (req.body?.note as string | undefined) || "Эскалация оператором";
  try {
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

    await db
      .update(ordersTable)
      .set({
        status: "waiting_master",
        masterId: null,
        assignedAt: null,
        operatorNote: null,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, orderId));

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

export default router;
