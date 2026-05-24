// /api/work-board/table — табличный интерфейс для контроля комиссий и оперативного управления заказами
//
// Параметры запроса (query params):
//   page?: number          — пагинация, 1-based (по умолчанию: 1)
//   limit?: number         — строк на страницу (по умолчанию: 50, макс: 200)
//   sortBy?: string        — поле для сортировки: "orderId", "master", "orderTotal", "commissionLeft", "ageMs", "status"
//   sortDir?: "asc"|"desc" — направление сортировки (по умолчанию: "desc")
//   status?: string        — фильтр по статусу (через запятую: "estimate_paid,commission_left")
//   masterId?: number      — фильтр по мастеру
//   hasCommissionLeft?: boolean — true = только с остатком комиссии
//   problemOnly?: boolean  — true = только проблемные заказы
//   search?: string        — поиск по №, адресу, мастеру, клиенту
//
// Ответ:
//   {
//     rows: TableRow[];
//     total: number;
//     page: number;
//     limit: number;
//     funnel: { activeCount, sumInWork, sumPaid, expectedCommission, conversionPct, problemCount };
//     generatedAt: string;
//   }
import { Router } from "express";
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, transactionsTable, transactionPaymentsTable, orderDispatchesTable, orderStatusLogsTable } from "@workspace/db";
import { inArray, isNull, eq, and, gte, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { workBoardBus, notifyWorkBoardChanged } from "./work-board.js";
import { z } from "zod";
import { ZodError } from "zod";

// ── Reuse types and helpers from work-board.ts ─────────────────────────────────

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
  commission?: {
    orderTotal: number;
    total: number;
    paid: number;
    left: number;
    tier: "fixed" | "percent";
    prepaymentDeducted?: number;
    totalPartialPaid?: number;
    partialPayments?: { id: number; amount: number; note: string | null; paidAt: string }[];
  };
  bot?: { action: string; eta: string; tone: BotTone };
  badge?: { text: string; tone: BadgeTone };
  status: string;
  problemReason?: string;
  responseCount?: number;
}

// Extended TableRow with additional fields for table view
export interface TableRow extends Card {
  masterDebt: number;           // общий долг мастера (из mastersTable.debt)
  commissionLeft: number;       // остаток комиссии (commission?.left || 0)
  isProblem: boolean;          // флаг проблемного заказа
  columnKey: ColumnKey;        // ключ колонки для цветового кодирования
  clientName?: string;         // имя клиента (из leadsTable)
}

// ── Query parameter schema ─────────────────────────────────────────────────────

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sortBy: z.enum(["orderId", "master", "orderTotal", "commissionLeft", "ageMs", "status"]).default("commissionLeft"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  status: z.string().optional().transform(s => s?.split(",").filter(Boolean)),
  masterId: z.coerce.number().int().positive().optional(),
  hasCommissionLeft: z.coerce.boolean().optional(),
  problemOnly: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

type QueryParams = z.infer<typeof querySchema>;

// ── Tariff helpers (same as work-board.ts) ────────────────────────────────────

const COMMISSION_THRESHOLD = 50_000;
const COMMISSION_FIXED = 5_000;
const COMMISSION_PERCENT = 0.15;

function safeNumber(val: unknown, defaultValue = 0): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  const num = Number(val);
  return isNaN(num) ? defaultValue : num;
}

function calcCommission(total: number): number {
  if (typeof total !== 'number' || isNaN(total) || total <= 0) return 0;
  return total <= COMMISSION_THRESHOLD ? COMMISSION_FIXED : Math.round(total * COMMISSION_PERCENT);
}

function commissionTier(total: number): "fixed" | "percent" {
  return total <= COMMISSION_THRESHOLD ? "fixed" : "percent";
}

function timeAgoLabel(ms: number): string {
  if (ms < 60_000) return "<1 мин";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч ${m % 60}м`;
  const d = Math.floor(h / 24);
  return `${d}д ${h % 24}ч`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}

// ── Determine column key for an order (same logic as work-board.ts) ─────────────

function determineColumnKey(
  order: any,
  receipt: any,
  total: number,
  orderAmount: number,
  commissionUnpaidAmount: number,
  problem: string | null,
  now: number
): ColumnKey {
  // Problem detection (highest priority)
  if (problem) return "problem";

  // commission_left: confirmed order amount with unpaid commission (any active or completed status)
  if (commissionUnpaidAmount > 0 && (order.status === "in_progress" || order.status === "master_assigned" || order.status === "completed")) {
    return "commission_left";
  }

  if (order.status === "completed") return "closed_24h";

  // Receipt with prepayment confirmed
  if (receipt && receipt.prepaymentSeenAt) {
    return commissionUnpaidAmount > 0 ? "commission_left" : "estimate_paid";
  }

  // estimate_unpaid: receipt exists, prepayment not confirmed
  if (receipt) return "estimate_unpaid";

  // no_estimate: master assigned but no receipt
  if (order.status === "master_assigned" || order.status === "in_progress") return "no_estimate";

  // waiting_master vs new
  const isFreshlyCreated = !order.lastBroadcastAt && order.broadcastCount === 0;
  return isFreshlyCreated ? "new" : "waiting_master";
}

// ── Build table data with pagination, sorting, filtering ─────────────────────

async function buildTableData(params: QueryParams): Promise<{
  rows: TableRow[];
  total: number;
  page: number;
  limit: number;
  funnel: {
    activeCount: number;
    sumInWork: number;
    sumPaid: number;
    expectedCommission: number;
    conversionPct: number;
    problemCount: number;
  };
  generatedAt: string;
}> {
  const now = Date.now();
  const last24h = new Date(now - 24 * 3_600_000);

  // Base query for active orders + recently closed
  const baseWhere = and(
    isNull(ordersTable.deletedAt),
    inArray(ordersTable.status, ["waiting_master", "master_assigned", "in_progress", "cancellation_requested", "completed"])
  );

  // Apply status filter if provided
  let statusFilter = params.status;
  if (statusFilter && statusFilter.length > 0) {
    // Map column keys to order statuses if needed
    // For now, we'll use the status column directly
    // We'll filter after building cards
  }

  // Apply masterId filter
  let masterFilter = params.masterId ? eq(ordersTable.masterId, params.masterId) : undefined;

  // Apply search filter (will filter after building cards)
  const searchTerm = params.search?.toLowerCase();

  // Fetch ALL orders first (pagination applied after in-memory filtering for accurate totals)
  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(baseWhere, masterFilter))
    .orderBy(desc(ordersTable.createdAt));

  if (orders.length === 0) {
    return {
      rows: [],
      total: 0,
      page: params.page,
      limit: params.limit,
      funnel: { activeCount: 0, sumInWork: 0, sumPaid: 0, expectedCommission: 0, conversionPct: 0, problemCount: 0 },
      generatedAt: new Date().toISOString(),
    };
  }

  // Fetch related data (same as work-board.ts)
  const orderIds = orders.map(o => o.id);
  const masterIds = [...new Set(orders.map(o => o.masterId).filter((x): x is number => !!x))];
  const leadIds = [...new Set(orders.map(o => o.leadId).filter((x): x is number => !!x))];

  const [masters, leads, receipts, transactions] = await Promise.all([
    masterIds.length
      ? db
          .select({
            id: mastersTable.id,
            alias: mastersTable.alias,
            debt: mastersTable.debt,
          })
          .from(mastersTable)
          .where(inArray(mastersTable.id, masterIds))
      : Promise.resolve([]),
    leadIds.length
      ? db
          .select({
            id: leadsTable.id,
            clientName: leadsTable.clientName,
          })
          .from(leadsTable)
          .where(inArray(leadsTable.id, leadIds))
      : Promise.resolve([]),
    db.select().from(receiptsTable).where(inArray(receiptsTable.orderId, orderIds)),
    db
      .select({
        id: transactionsTable.id,
        orderId: transactionsTable.orderId,
        masterId: transactionsTable.masterId,
        commission: transactionsTable.commission,
        paymentStatus: transactionsTable.paymentStatus,
        prepaymentDeducted: transactionsTable.prepaymentDeducted,
      })
      .from(transactionsTable)
      .where(inArray(transactionsTable.orderId, orderIds)),
  ]);

  // Get partial payments after transactions are available
  const transactionIds = transactions.map(t => t.id).filter(id => id !== undefined);
  const partialPayments = transactionIds.length > 0
    ? await db.select().from(transactionPaymentsTable).where(inArray(transactionPaymentsTable.transactionId, transactionIds))
    : [];

  // Build maps for quick lookups
  const masterMap = new Map(masters.map(m => [m.id, m]));
  const leadMap = new Map(leads.map(l => [l.id, l]));

  // Recover names for hard-deleted masters via assignment logs
  const missingMasterIds = [...new Set(orders.map(o => o.masterId).filter((id): id is number => !!id && !masterMap.has(id)))];
  const recoveredMasterNames = new Map<number, string>(); // masterId → alias
  if (missingMasterIds.length > 0) {
    const missingOrderIds = orders.filter(o => o.masterId && missingMasterIds.includes(o.masterId)).map(o => o.id);
    const assignLogs = await db
      .select({ orderId: orderStatusLogsTable.orderId, note: orderStatusLogsTable.note, newStatus: orderStatusLogsTable.newStatus })
      .from(orderStatusLogsTable)
      .where(and(inArray(orderStatusLogsTable.orderId, missingOrderIds), eq(orderStatusLogsTable.newStatus, "master_assigned")));
    const orderToMaster = new Map(orders.filter(o => o.masterId).map(o => [o.id, o.masterId!]));
    for (const log of assignLogs) {
      if (!log.note) continue;
      const m = log.note.match(/Назначен(?:\s+вручную)?:\s*(.+)/);
      if (m?.[1]) {
        const masterId = orderToMaster.get(log.orderId);
        if (masterId && !recoveredMasterNames.has(masterId)) {
          recoveredMasterNames.set(masterId, m[1].trim());
        }
      }
    }
  }
  const receiptMap = new Map<number, typeof receipts[0]>();
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

  const partialsByTx = new Map<number, typeof partialPayments>();
  for (const p of partialPayments) {
    const arr = partialsByTx.get(p.transactionId) ?? [];
    arr.push(p);
    partialsByTx.set(p.transactionId, arr);
  }

  // Build table rows
  const rows: TableRow[] = [];
  let activeCount = 0;
  let sumInWork = 0;
  let sumPaid = 0;
  let expectedCommission = 0;
  let problemCount = 0;

  for (const o of orders) {
    const master = o.masterId ? masterMap.get(o.masterId) ?? null : null;
    const lead = o.leadId ? leadMap.get(o.leadId) : null;
    const receipt = receiptMap.get(o.id) ?? null;

    const refTime = o.assignedAt ?? o.lastBroadcastAt ?? o.updatedAt ?? o.createdAt;
    const ageMs = Math.max(0, now - new Date(refTime || new Date()).getTime());
    const stageLabel = timeAgoLabel(ageMs);

    const total = receipt ? safeNumber(receipt.totalAmount) : 0;
    const prepayment = receipt ? safeNumber(receipt.prepaymentAmount) : 0;
    const orderAmount = safeNumber((o as any).orderAmount);
    const expectedCommissionForOrder = orderAmount > 0 ? calcCommission(orderAmount) : total > 0 ? calcCommission(total) : 0;

    const txs = txByOrder.get(o.id) ?? [];
    const realTxs = txs.filter((t) => safeNumber(t.commission) > 0);
    const commissionPaid = realTxs.length > 0 && realTxs.every((t) => t.paymentStatus === "paid");
    
    const orderPrepDeduct = realTxs.reduce((s, t) => s + safeNumber(t.prepaymentDeducted, 0), 0);
    const orderPartials = realTxs.flatMap((t) => partialsByTx.get(t.id) ?? []);
    const orderTotalPartialPaid = orderPartials.reduce((s, p) => s + safeNumber(p.amount, 0), 0);
    
    const commissionUnpaidFromTxs = realTxs.filter((t) => t.paymentStatus !== "paid")
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

    const address = [o.city, o.district].filter(Boolean).join(", ");
    const title = (o as any).serviceType ?? "Заявка";
    const masterAlias = master?.alias ?? (o.masterId ? recoveredMasterNames.get(o.masterId) ?? null : null);

    // Pre-calculate commission totals (needed for problem detection)
    const manualCommission = safeNumber((o as any).commission);
    const commTotal = total > 0 ? calcCommission(total) : orderAmount > 0 ? calcCommission(orderAmount) : manualCommission > 0 ? manualCommission : 0;
    const commPaid = orderPrepDeduct + orderTotalPartialPaid;
    const commLeft = Math.max(0, commTotal - commPaid);

    // Problem detection (same logic as work-board.ts)
    const opNote = (o as any).operatorNote as string | undefined;
    const isAiNote = opNote?.startsWith("[ИИ]:") ?? false;
    let problem: string | null = null;
    if (o.status === "cancellation_requested") problem = "Запрос на отмену от мастера";
    else if (opNote && !isAiNote && commLeft > 0) problem = "Помечена оператором: " + opNote.slice(0, 60);
    else if (!receipt && o.assignedAt && now - new Date(o.assignedAt).getTime() > 48 * 3_600_000) problem = "Без сметы более 48 часов";
    else if (receipt && !(receipt as any).prepaymentSeenAt && now - new Date(receipt.createdAt).getTime() > 48 * 3_600_000) problem = "Оплата не подтверждена > 48ч";
    else if (commissionUnpaidAmount > 0 && o.status === "completed" && o.completedAt && now - new Date(o.completedAt).getTime() > 7 * 86_400_000) problem = "Комиссия не оплачена > 7 дней";

    const isProblem = !!problem;
    if (isProblem) problemCount++;

    const columnKey = determineColumnKey(o, receipt, total, orderAmount, commissionUnpaidAmount, problem, now);

    // Skip if filtered by problemOnly and not a problem
    if (params.problemOnly && !isProblem) continue;

    // Skip if filtered by hasCommissionLeft and no commission left
    if (params.hasCommissionLeft && commissionUnpaidAmount <= 0) continue;

    // Skip if filtered by status and columnKey not in status filter
    if (statusFilter && statusFilter.length > 0 && !statusFilter.includes(columnKey)) continue;

    // Apply search filter
    if (searchTerm) {
      const matches = 
        String(o.id).includes(searchTerm) ||
        address.toLowerCase().includes(searchTerm) ||
        (masterAlias ?? "").toLowerCase().includes(searchTerm) ||
        (lead?.clientName ?? "").toLowerCase().includes(searchTerm) ||
        title.toLowerCase().includes(searchTerm);
      if (!matches) continue;
    }

    // Build commission object if applicable
    let commissionObj = undefined;
    
    if (commTotal > 0 || receipt) {
      const partialPaymentsList = orderPartials.map((p) => ({
        id: p.id,
        amount: safeNumber(p.amount),
        note: p.note ?? null,
        paidAt: p.paidAt.toISOString(),
      }));

      commissionObj = {
        orderTotal: total > 0 ? total : orderAmount,
        total: commTotal,
        paid: commPaid,
        left: commLeft,
        tier: commissionTier(total > 0 ? total : orderAmount),
        ...(orderPrepDeduct > 0 ? { prepaymentDeducted: orderPrepDeduct } : {}),
        ...(orderTotalPartialPaid > 0 ? { totalPartialPaid: orderTotalPartialPaid } : {}),
        ...(partialPaymentsList.length > 0 ? { partialPayments: partialPaymentsList } : {}),
      };
    }

    // Build base card
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

    // Add money, bot, badge based on columnKey (simplified)
    let money = undefined;
    let bot = undefined;
    let badge = undefined;

    if (isProblem) {
      badge = { text: "нужен оператор", tone: "bad" as BadgeTone };
      bot = { action: "ждёт твоего решения", eta: "связаться?", tone: "bad" as BotTone };
    } else if (columnKey === "estimate_unpaid") {
      money = { kind: "estimate" as const, amount: total };
      const hoursSinceReceipt = Math.max(0, (now - new Date(receipt!.createdAt).getTime()) / 3_600_000);
      const tone: BotTone = hoursSinceReceipt > 24 ? "warn" : "ok";
      const eta = hoursSinceReceipt > 24 ? "сейчас" : "через 1ч";
      bot = { action: hoursSinceReceipt > 24 ? "повторное напоминание" : "напомню клиенту", eta, tone };
      if (hoursSinceReceipt > 24) {
        badge = { text: `${Math.floor(hoursSinceReceipt)}ч ждём оплату`, tone: "warn" as BadgeTone };
      }
    } else if (columnKey === "estimate_paid") {
      bot = { action: "ждём отчёт мастера", eta: "норма", tone: "ok" as BotTone };
    } else if (columnKey === "commission_left") {
      bot = { action: "напомню мастеру", eta: "через 2ч", tone: "warn" as BotTone };
    } else if (columnKey === "no_estimate") {
      const hoursAssigned = o.assignedAt ? Math.max(0, (now - new Date(o.assignedAt).getTime()) / 3_600_000) : 0;
      const tone: BotTone = hoursAssigned > 24 ? "bad" : hoursAssigned > 6 ? "warn" : "ok";
      const action = hoursAssigned > 24 ? "эскалация в Проблему через" : hoursAssigned > 6 ? "напомню мастеру" : "ждём смету";
      const eta = hoursAssigned > 24 ? "2ч" : hoursAssigned > 6 ? "через 18 мин" : "норма";
      bot = { action, eta, tone };
      if (hoursAssigned > 24) {
        badge = { text: "просрочка", tone: "bad" as BadgeTone };
      }
    } else if (columnKey === "new") {
      const minutesSinceCreation = o.createdAt ? Math.max(0, (now - new Date(o.createdAt).getTime()) / 60_000) : 0;
      const nextCycleMin = Math.max(1, 15 - (Math.floor(minutesSinceCreation) % 15));
      const etaStr = nextCycleMin <= 1 ? "1 мин" : `${nextCycleMin} мин`;
      const tone: BotTone = minutesSinceCreation > 15 ? "warn" : "ok";
      bot = { action: "разошлю мастерам через", eta: etaStr, tone };
      badge = { text: minutesSinceCreation > 15 ? "задержка" : "автопул", tone: minutesSinceCreation > 15 ? "warn" as BadgeTone : "info" as BadgeTone };
    } else if (columnKey === "waiting_master") {
      const minutesSinceBroadcast = o.lastBroadcastAt ? Math.max(0, (now - new Date(o.lastBroadcastAt).getTime()) / 60_000) : 0;
      const broadcastCount = safeNumber(o.broadcastCount, 1);
      const waveNum = Math.min(broadcastCount, 3);
      const waveLabel = waveNum === 1 ? "рассылка 1" : waveNum === 2 ? "рассылка 2" : "рассылка 3";
      const nextWaveMin = Math.max(1, 120 - Math.floor(minutesSinceBroadcast));
      const etaStr = nextWaveMin <= 1 ? "1 мин" : nextWaveMin < 60 ? `${nextWaveMin} мин` : `${Math.floor(nextWaveMin / 60)}ч ${nextWaveMin % 60}мин`;
      
      // Simplified bot logic for table view
      bot = { action: `разослано (${waveLabel})`, eta: "ждём отклик", tone: "ok" as BotTone };
    }

    // Count active orders (excluding closed_24h)
    if (columnKey !== "closed_24h") {
      activeCount++;
      if (columnKey === "estimate_unpaid") {
        sumInWork += prepayment > 0 ? prepayment : total;
      } else if (columnKey === "commission_left") {
        sumInWork += commissionUnpaidAmount;
      } else if (columnKey === "estimate_paid") {
        sumPaid += prepayment > 0 ? prepayment : total;
        expectedCommission += commTotal;
      }
    }

    const row: TableRow = {
      ...baseCard,
      ...(money && { money }),
      ...(commissionObj && { commission: commissionObj }),
      ...(bot && { bot }),
      ...(badge && { badge }),
      ...(problem && { problemReason: problem }),
      masterDebt: master ? safeNumber(master.debt) : 0,
      commissionLeft: commLeft,
      isProblem,
      columnKey,
      clientName: lead?.clientName ?? undefined,
    };

    // Skip completed orders with 0 commission that are older than 14 days (archive them)
    if (columnKey === "closed_24h" && ageMs > 14 * 86_400_000) continue;

    rows.push(row);
  }

  // Apply sorting
  rows.sort((a, b) => {
    const dir = params.sortDir === "asc" ? 1 : -1;
    
    switch (params.sortBy) {
      case "orderId":
        return dir * (a.orderId - b.orderId);
      case "master":
        return dir * ((a.master || "").localeCompare(b.master || ""));
      case "orderTotal":
        const totalA = a.commission?.orderTotal || 0;
        const totalB = b.commission?.orderTotal || 0;
        return dir * (totalA - totalB);
      case "commissionLeft":
        return dir * (a.commissionLeft - b.commissionLeft);
      case "ageMs":
        return dir * (a.ageMs - b.ageMs);
      case "status":
        return dir * a.status.localeCompare(b.status);
      default:
        return dir * (a.commissionLeft - b.commissionLeft);
    }
  });

  // Calculate funnel metrics
  const totalAttempts = activeCount + (rows.filter(r => r.columnKey === "closed_24h").length);
  const conversionPct = totalAttempts > 0 ? Math.round((rows.filter(r => r.columnKey === "closed_24h").length / totalAttempts) * 100) : 0;

  // Paginate after in-memory filtering (ensures total and pagination are accurate)
  const filteredTotal = rows.length;
  const offset = (params.page - 1) * params.limit;
  const paginatedRows = rows.slice(offset, offset + params.limit);

  return {
    rows: paginatedRows,
    total: filteredTotal,
    page: params.page,
    limit: params.limit,
    funnel: {
      activeCount,
      sumInWork,
      sumPaid,
      expectedCommission,
      conversionPct,
      problemCount,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── Router ─────────────────────────────────────────────────────────────────────

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const params = querySchema.parse(req.query);
    const result = await buildTableData(params);
    res.json(result);
  } catch (e) {
    console.error("[work-board-table] error:", e);
    if (e instanceof ZodError) {
      res.status(400).json({ error: "Invalid query parameters", details: e.errors });
    } else {
      res.status(500).json({ error: String(e) });
    }
  }
});

// SSE stream for real-time updates (same as work-board.ts)
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

export default router;