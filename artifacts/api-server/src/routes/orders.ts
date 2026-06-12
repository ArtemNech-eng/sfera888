import { Router, Request, Response, NextFunction } from "express";
import { db, ordersTable, mastersTable, transactionsTable, voronkaColumnsTable, orderDispatchesTable, leadsTable, masterMessagesTable, orderStatusLogsTable, orderAmountAuditTable, usersTable, receiptsTable, fomoEventsTable, orderMastersTable, mlPricingDecisionsTable, orderStagesTable } from "@workspace/db";
import { eq, inArray, and, ne, isNull, isNotNull, desc, count, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { calculateCommission, getCommissionSettings } from "../lib/commission.js";
import { getMasterEligibility, getOverdueMasterIds, countActiveMasterOrders, getColumnIdForActiveCount } from "../lib/orderEligibility.js";
import { deductServiceFee } from "../lib/accountBalance.js";
import { recalcMasterColumn } from "../lib/masterColumn.js";
import { performBroadcast } from "../lib/broadcastOrder.js";
import { sendPushToMaster } from "../lib/push.js";
import { sendPushToClient } from "../lib/clientPush.js";
import { sendMaxMessage } from "../maxBot.js";
import { analyseOrderCancellation } from "../lib/dispatcherAI.js";
import { recordOrderCancelled, recordOrderCompleted, revertOrderCancellation } from "../lib/masterReputation.js";
import { computePaymentState, computePaymentStateBatch, groupReceiptsByOrder } from "../lib/paymentState.js";
import { recordAmountAudit, resolveAuditActor, closeOpenEstimateTasksForOrder } from "../lib/orderAudit.js";
import { notifyWorkBoardChanged } from "./work-board.js";

// Telegram-бот удалён.

/** Internal: structured 4xx error from inside a `db.transaction` callback,
 * caught by the route handler and translated to an HTTP response. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

function buildOrderCard(order: any, orderId: number): string {
  const formatDate = (d: Date | null | undefined) => {
    if (!d) return "не указана";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
  };
  return (
    `📋 <b>Новая заявка #${orderId}</b>\n\n` +
    `🔧 Услуга: <b>${order.serviceType}</b>\n` +
    `📍 Адрес: <b>${order.city}${order.district ? ", " + order.district : ""}</b>\n` +
    `📐 Объём: <b>${order.area} м²</b>\n` +
    `📅 Дата: <b>${formatDate(order.scheduledAt)}</b>` +
    (order.comment ? `\n💬 Комментарий: ${order.comment}` : "") +
    `\n\n<i>Нажмите кнопку, чтобы откликнуться.</i>`
  );
}

const router = Router();

// Rate limiting for order operations
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // max requests per window per IP

const checkRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (!ip) return next();
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  if (record && record.resetTime > now) {
    if (record.count >= RATE_LIMIT_MAX) {
      return res.status(429).json({ error: "Too many requests, please try again later." });
    }
    record.count += 1;
  } else {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
  }
  next();
};

const allOrderRoles = requireRole("admin", "master_operator");

// ─── Column helpers ───────────────────────────────────────────────────────────

async function getOnSiteColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.name === "На объекте")
    ?? cols.find(c => c.receivesOrders && c.name !== "Свободен")
    ?? cols.find(c => c.receivesOrders)
    ?? null;
}

async function getFreeColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.receivesOrders) ?? null;
}

async function getAwaitingPaymentColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.name === "Ожидает оплаты") ?? null;
}

router.get("/", allOrderRoles, async (req, res) => {
  try {
    const { status, masterId, page, limit, folder } = req.query;
    const pageNum = Math.max(1, parseInt((page as string) || "1", 10));
    const limitNum = Math.min(100, Math.max(1, parseInt((limit as string) || "50", 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [];
    
    // Folder-based filtering (has priority over status)
    const folderStr = typeof folder === "string" ? folder : undefined;
    const statusStr = typeof status === "string" ? status : undefined;
    
    if (folderStr) {
      if (folderStr === "in_progress") {
        conditions.push(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
      } else if (folderStr === "pending_payment") {
        conditions.push(and(eq(ordersTable.status, "completed"), eq(ordersTable.commissionPaid, false)));
      } else if (folderStr === "completed") {
        conditions.push(and(eq(ordersTable.status, "completed"), eq(ordersTable.commissionPaid, true)));
      } else if (folderStr === "cancelled") {
        conditions.push(eq(ordersTable.status, "cancelled"));
      }
    } else if (statusStr) {
      // Fallback to status filter if no folder specified
      conditions.push(eq(ordersTable.status, statusStr as any));
    }
    
    if (masterId) {
      const masterIdNum = parseInt(String(masterId));
      if (!isNaN(masterIdNum)) conditions.push(eq(ordersTable.masterId, masterIdNum));
    }
    conditions.push(isNull(ordersTable.deletedAt));

    const [{ total }] = await db.select({ total: count() }).from(ordersTable).where(and(...conditions));
  const orders = await db.select().from(ordersTable).where(and(...conditions)).orderBy(desc(ordersTable.createdAt)).limit(limitNum).offset(offset);

  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

  // Recover names for masters missing from mastersTable (hard-deleted) via assignment logs
  const ordersWithMissingMaster = orders.filter(o => o.masterId && !masterMap.has(o.masterId));
  const recoveredNameMap = new Map<number, string>(); // orderId → recovered alias
  if (ordersWithMissingMaster.length > 0) {
    const missingOrderIds = ordersWithMissingMaster.map(o => o.id);
    const assignLogs = await db.select({ orderId: orderStatusLogsTable.orderId, note: orderStatusLogsTable.note })
      .from(orderStatusLogsTable)
      .where(and(
        inArray(orderStatusLogsTable.orderId, missingOrderIds),
        eq(orderStatusLogsTable.newStatus, "master_assigned"),
      ));
    for (const log of assignLogs) {
      if (log.note && !recoveredNameMap.has(log.orderId)) {
        const m = log.note.match(/Назначен(?:\s+вручную)?:\s*(.+)/);
        if (m?.[1]) recoveredNameMap.set(log.orderId, m[1].trim());
      }
    }
  }

  const leads = await db.select().from(leadsTable);
  const leadMap = new Map(leads.map(l => [l.id, l]));

  // Fetch transaction info for all orders (orderAmount, commission, paymentStatus from finance)
  const orderIds = orders.map(o => o.id);
  let txMap = new Map<number, any>();
  if (orderIds.length > 0) {
    const txRows = await db.select().from(transactionsTable).where(inArray(transactionsTable.orderId, orderIds));
    for (const t of txRows) {
      if (!txMap.has(t.orderId)) txMap.set(t.orderId, t);
    }
  }

  // ── Payment_State derivation (Phase 1, read-only) ────────────────────────
  // Грузим receipts для batch-вычисления paymentState. Cтоимость одного запроса
  // в пределах загруженной страницы заказов — пренебрежимо.
  const receiptsForState = orderIds.length > 0
    ? await db.select({
        orderId: receiptsTable.orderId,
        prepaymentAmount: receiptsTable.prepaymentAmount,
        prepaymentSeenAt: receiptsTable.prepaymentSeenAt,
        prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
      }).from(receiptsTable).where(inArray(receiptsTable.orderId, orderIds))
    : [];
  const receiptsByOrder = groupReceiptsByOrder(receiptsForState);
  const paymentStateMap = computePaymentStateBatch(orders as any, receiptsByOrder);

  res.json({
    rows: orders.map((o) => {
      const tx = txMap.get(o.id);
      return {
        id: o.id,
        leadId: o.leadId,
        city: o.city,
        district: o.district,
        serviceType: o.serviceType,
        area: Number(o.area),
        scheduledAt: o.scheduledAt ?? null,
        comment: o.comment ?? null,
        status: o.status,
        dispatchStatus: o.dispatchStatus,
        masterId: o.masterId ?? null,
        masterName: o.masterId ? (masterMap.get(o.masterId)?.alias ?? recoveredNameMap.get(o.id) ?? null) : null,
        clientPhone: leadMap.get(o.leadId)?.clientPhone ?? null,
        clientName: leadMap.get(o.leadId)?.clientName ?? null,
        proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
        orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
        commission: o.commission ? Number(o.commission) : null,
        commissionPaid: o.commissionPaid ?? false,
        clientRating: o.clientRating ?? null,
        cancelReason: o.cancelReason ?? null,
        cancelType: (o as any).cancelType ?? null,
        operatorNote: (o as any).operatorNote ?? null,
        assignedAt: (o as any).assignedAt ?? null,
        completedAt: (o as any).completedAt ?? null,
        photosBefore: (o as any).photosBefore ?? [],
        photosAfter: (o as any).photosAfter ?? [],
        photoAct: (o as any).photoAct ?? null,
        paymentModel: o.paymentModel ?? "token",
        maxMasters: (o as any).maxMasters ?? 3,
        assignedMasterCount: (o as any).assignedMasterCount ?? 0,
        // Payment_State engine — Phase 1 read-only fields
        paymentState: paymentStateMap.get(o.id) ?? "no_amount",
        agreementAmountSource: (o as any).agreementAmountSource ?? null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        transactionInfo: tx ? {
          orderAmount: Number(tx.orderAmount),
          commission: Number(tx.commission),
          prepaymentDeducted: Number(tx.prepaymentDeducted ?? 0),
          paymentStatus: tx.paymentStatus,
          paidAt: tx.paidAt ?? null,
        } : null,
      };
    }),
    total,
    page: pageNum,
    limit: limitNum,
  });
  } catch (err) {
    console.error("[orders GET /] Error:", err);
    return res.status(500).json({ error: "Internal server error", details: String(err) });
  }
});

router.get("/:id", allOrderRoles, async (req, res) => {
  const id = parseInt(String(req.params.id as string));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!rows[0]) return res.status(404).json({ error: "Order not found" });
  const o = rows[0];
  let masterName: string | null = null;
  if (o.masterId) {
    const m = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    masterName = m[0]?.alias ?? null;
  }
  // Fetch lead info for clientName/clientPhone
  let clientName: string | null = null;
  let clientPhone: string | null = null;
  if (o.leadId) {
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, o.leadId));
    clientName = lead?.clientName ?? null;
    clientPhone = lead?.clientPhone ?? null;
  }
  // Fetch transaction info for this order (aggregate if multiple)
  const txRows = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
  const realTxRows = txRows.filter(t => Number(t.commission) > 0);
  const tx = realTxRows.length > 0 ? realTxRows[0] : (txRows[0] ?? null);

  // Payment_State engine — Phase 1 read-only derivation
  const allReceiptsForOrder = await db
    .select({
      prepaymentAmount: receiptsTable.prepaymentAmount,
      prepaymentSeenAt: receiptsTable.prepaymentSeenAt,
      prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
    })
    .from(receiptsTable)
    .where(eq(receiptsTable.orderId, id));
  const paymentState = computePaymentState(o, allReceiptsForOrder);

  res.json({
    id: o.id,
    leadId: o.leadId,
    city: o.city,
    district: o.district,
    serviceType: o.serviceType,
    area: Number(o.area),
    scheduledAt: o.scheduledAt ?? null,
    comment: o.comment ?? null,
    status: o.status,
    dispatchStatus: o.dispatchStatus,
    masterId: o.masterId ?? null,
    masterName,
    clientName,
    clientPhone,
    proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    commissionPaid: o.commissionPaid ?? false,
    // Payment_State engine — Phase 1 read-only fields
    paymentState,
    agreementAmountSource: (o as any).agreementAmountSource ?? null,
    clientRating: o.clientRating ?? null,
    cancelReason: o.cancelReason ?? null,
    cancelType: (o as any).cancelType ?? null,
    operatorNote: (o as any).operatorNote ?? null,
    assignedAt: (o as any).assignedAt ?? null,
    completedAt: (o as any).completedAt ?? null,
    photosBefore: (o as any).photosBefore ?? [],
    photosAfter: (o as any).photosAfter ?? [],
    photoAct: (o as any).photoAct ?? null,
    paymentModel: o.paymentModel ?? "token",
    tokensCharged: o.tokensCharged ? Number(o.tokensCharged) : 0,
    manualTokenCost: o.manualTokenCost ? Number(o.manualTokenCost) : null,
    maxMasters: (o as any).maxMasters ?? 3,
    assignedMasterCount: (o as any).assignedMasterCount ?? 0,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    // Transaction info from finance (may exist even if order fields are empty)
    transactionInfo: tx ? {
      orderAmount: Number(tx.orderAmount),
      commission: Number(tx.commission),
      prepaymentDeducted: Number(tx.prepaymentDeducted ?? 0),
      paymentStatus: tx.paymentStatus,
      paidAt: tx.paidAt ?? null,
    } : null,
  });
  
});

router.patch("/:id", allOrderRoles, async (req, res) => {
  const id = parseInt(String(req.params.id as string));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

  const body = req.body ?? {};
  const {
    status, orderAmount, commission, commissionPaid, clientRating, proposedAmount,
    acceptProposed, approveCancellation, rejectCancellation, restoreOrder,
    operatorNote, clientCancelReason, manualTokenCost, paymentModel, maxMasters,
    // T14 — Phase 2 reconcile / force-paid actions
    acceptReceiptAmount, keepAgreementAmount, force, reason,
  } = body;

  // ── Pre-fetch ─────────────────────────────────────────────────────────────
  const currentRows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!currentRows[0]) return res.status(404).json({ error: "Order not found" });
  const current = currentRows[0];

  const sessionUser = (req as any).session?.userId ?? null;
  const actor = await resolveAuditActor(sessionUser, "operator");

  // ── Validate manager-only / new actions before opening a transaction ──────
  if (force === true && actor.role !== "admin") {
    return res.status(403).json({ error: "Force-paid доступен только администратору" });
  }
  if (force === true && (typeof reason !== "string" || !reason.trim())) {
    return res.status(400).json({ error: "Укажите причину для force-paid" });
  }
  if (keepAgreementAmount === true && (typeof reason !== "string" || !reason.trim())) {
    return res.status(400).json({ error: "Укажите причину отклонения суммы из сметы" });
  }

  // Pre-load commission settings (sync, cacheable read).
  const commSettings = await getCommissionSettings();

  // Resolve paymentModel update before transaction (requires lead lookup)
  let paymentModelUpdate: string | undefined;
  if (paymentModel !== undefined) {
    const [leadCheck] = await db.select({ source: leadsTable.source, trafficPartnerId: leadsTable.trafficPartnerId })
      .from(leadsTable).where(eq(leadsTable.id, current.leadId ?? 0)).limit(1);
    const isPartnerOrder = leadCheck?.source === "avito_partner" || leadCheck?.trafficPartnerId != null;
    paymentModelUpdate = isPartnerOrder ? "token" : (paymentModel === "commission" ? "commission" : "token");
  }

  // ── Transaction-scoped result state (set inside, used after commit) ───────
  let updatedOrder: typeof ordersTable.$inferSelect | null = null;
  let newStatus: string | null = null;
  let autoCompleteHappened = false;
  let pushBodyForMaster: string | null = null;
  let placeholderDeleted = false;

  // ── Atomic DB write block ─────────────────────────────────────────────────
  // Everything that mutates DB state for THIS request goes inside the transaction.
  // Side effects (push, max-bot, performBroadcast, async analysis, voronka and
  // reputation library calls) live below — they're best-effort and external.
  try {
    await db.transaction(async (tx) => {
      // ── Build updates from body ──────────────────────────────────────────
      const updates: any = { updatedAt: new Date() };
      if (status !== undefined) updates.status = status;
      if (commissionPaid !== undefined) updates.commissionPaid = !!commissionPaid;
      if (proposedAmount !== undefined) updates.proposedAmount = proposedAmount !== null ? String(proposedAmount) : null;
      if (operatorNote !== undefined) updates.operatorNote = operatorNote !== null ? operatorNote : null;
      if (clientCancelReason !== undefined) updates.operatorNote = clientCancelReason || null;
      if (manualTokenCost !== undefined) updates.manualTokenCost = manualTokenCost !== null ? String(manualTokenCost) : null;
      if (maxMasters !== undefined && !isNaN(Number(maxMasters)) && Number(maxMasters) >= 1) {
        updates.maxMasters = Number(maxMasters);
      }
      if (paymentModelUpdate !== undefined) updates.paymentModel = paymentModelUpdate;

      if (status === "cancelled" && current.status !== "cancelled") {
        updates.dispatchStatus = "none";
      }

      // Approve / reject / restore branches
      if (approveCancellation) {
        updates.status = "cancelled"; newStatus = "cancelled";
      }
      if (rejectCancellation) {
        updates.status = "waiting_master"; newStatus = "waiting_master";
        updates.masterId = null;
        updates.cancelReason = null;
        updates.dispatchStatus = "none";
      }
      if (restoreOrder && current.status === "cancelled") {
        updates.cancelReason = null;
        updates.cancelType = null;
        if (current.masterId) {
          updates.status = "master_assigned"; newStatus = "master_assigned";
          updates.dispatchStatus = "assigned";
          updates.assignedAt = (current as any).assignedAt ?? new Date();
        } else {
          updates.status = "waiting_master"; newStatus = "waiting_master";
          updates.dispatchStatus = "none";
        }
      }

      // Status timestamps
      if (status === "master_assigned" && current.status !== "master_assigned") {
        updates.assignedAt = new Date(); newStatus = "master_assigned";
      }
      if (status === "completed" && current.status !== "completed") {
        updates.completedAt = new Date(); newStatus = "completed";
      }
      if (status && !newStatus) newStatus = status;

      // ── Money fields handling — Agreement_Path-aware ─────────────────────
      // Sources of orderAmount changes (in priority order):
      //   1. acceptReceiptAmount → take latest receipt.prepaymentAmount (Phase 3 reconcile)
      //   2. acceptProposed      → copy proposedAmount (legacy "accept master proposal")
      //   3. orderAmount provided → manual entry (operator types in)
      //   4. commission provided alone → manual override of computed commission
      let agreementSourceUpdate: string | undefined;

      if (acceptReceiptAmount === true) {
        const [latestReceipt] = await tx
          .select()
          .from(receiptsTable)
          .where(eq(receiptsTable.orderId, id))
          .orderBy(desc(receiptsTable.createdAt))
          .limit(1);
        if (!latestReceipt) {
          throw new HttpError(400, "Нет смет по этому заказу для принятия");
        }
        const amt = Number(latestReceipt.prepaymentAmount);
        updates.orderAmount = String(amt);
        updates.proposedAmount = String(amt);
        agreementSourceUpdate = "reconcile_use_receipt";
        if (current.paymentModel !== "token") {
          updates.commission = String(calculateCommission(amt, commSettings));
        }
      } else if (acceptProposed && current.proposedAmount) {
        const amt = Number(current.proposedAmount);
        updates.orderAmount = String(amt);
        agreementSourceUpdate = "master_proposal";
        if (current.paymentModel !== "token") {
          updates.commission = String(calculateCommission(amt, commSettings));
        }
      } else if (orderAmount !== undefined) {
        updates.orderAmount = orderAmount !== null ? String(orderAmount) : null;
        if (orderAmount !== null) {
          // Manager force-edit (after Payment_State = paid) → manager_correction
          // Otherwise — operator_edit
          agreementSourceUpdate = force === true ? "manager_correction" : "operator_edit";
        }
        if (commission !== undefined) {
          updates.commission = commission !== null ? String(commission) : null;
        } else if (orderAmount !== null && current.paymentModel !== "token") {
          updates.commission = String(calculateCommission(Number(orderAmount), commSettings));
        }
      } else if (commission !== undefined && current.paymentModel !== "token") {
        updates.commission = commission !== null ? String(commission) : null;
      }
      if (clientRating !== undefined) updates.clientRating = clientRating;

      if (agreementSourceUpdate !== undefined) {
        updates.agreementAmountSource = agreementSourceUpdate;
        updates.paymentStateChangedAt = new Date();
      }

      // ── Apply order update ──────────────────────────────────────────────
      const [u] = await tx.update(ordersTable).set(updates).where(eq(ordersTable.id, id)).returning();
      if (!u) throw new HttpError(404, "Order not found");
      updatedOrder = u;

      // ── Audit money-field changes ────────────────────────────────────────
      const reasonText = typeof reason === "string" && reason.trim() ? reason.trim() : null;

      if (updates.orderAmount !== undefined && String(current.orderAmount ?? "") !== String(updates.orderAmount ?? "")) {
        await recordAmountAudit(tx as any, {
          orderId: id, actorUserId: actor.id, actorRole: actor.role, actorAlias: actor.alias,
          field: "orderAmount",
          previousValue: current.orderAmount,
          newValue: String(updates.orderAmount ?? ""),
          source: (agreementSourceUpdate as any) ?? "operator_edit",
          reason: reasonText,
        });
      }
      if (updates.commission !== undefined && String(current.commission ?? "") !== String(updates.commission ?? "")) {
        await recordAmountAudit(tx as any, {
          orderId: id, actorUserId: actor.id, actorRole: actor.role, actorAlias: actor.alias,
          field: "commission",
          previousValue: current.commission,
          newValue: String(updates.commission ?? ""),
          source: "system_recalc",
        });
      }
      if (updates.commissionPaid !== undefined && current.commissionPaid !== !!updates.commissionPaid) {
        await recordAmountAudit(tx as any, {
          orderId: id, actorUserId: actor.id, actorRole: actor.role, actorAlias: actor.alias,
          field: "commissionPaid",
          previousValue: String(current.commissionPaid),
          newValue: String(!!updates.commissionPaid),
          source: force === true ? "manager_force_paid" : "operator_edit",
          reason: reasonText,
        });
      }

      // keepAgreementAmount: explicit "operator rejects receipt amount, keeps agreement"
      // — write an audit-only row even though no field changed (for reconcile task closure).
      if (keepAgreementAmount === true) {
        await tx.insert(orderAmountAuditTable).values({
          orderId: id,
          actorUserId: actor.id,
          actorRole: actor.role,
          actorAlias: actor.alias,
          field: "orderAmount",
          previousValue: current.orderAmount,
          newValue: current.orderAmount ?? "",
          source: "reconcile_keep_agreement",
          reason: reasonText,
        });
      }

      // ── Status log ──────────────────────────────────────────────────────
      if (newStatus && newStatus !== current.status) {
        await tx.insert(orderStatusLogsTable).values({
          orderId: id,
          oldStatus: current.status,
          newStatus,
          userId: sessionUser,
          userAlias: actor.alias ?? "система",
        });
      }

      // ── Transaction sync (commission orders only) ───────────────────────
      // Mirror of legacy behavior: when operator confirms commission via
      // acceptProposed / orderAmount / acceptReceiptAmount — reconcile the
      // `transactions` row, update master.debt, optionally auto-complete.
      const commissionConfirmed =
        (acceptProposed && current.proposedAmount) ||
        (orderAmount !== undefined && orderAmount !== null) ||
        (acceptReceiptAmount === true);

      if (current.paymentModel !== "token" && commissionConfirmed && u.masterId && u.orderAmount && u.commission) {
        const existingTxRows = await tx.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
        const existingTx = existingTxRows[0];
        const commissionValue = Number(u.commission);

        const paidReceiptRows = await tx.select().from(receiptsTable).where(
          and(eq(receiptsTable.orderId, id), isNotNull(receiptsTable.prepaymentSubmittedAt))
        );
        const totalPrepaid = paidReceiptRows.reduce((sum, r) => sum + Number(r.prepaymentAmount), 0);
        const prepaymentDeducted = Math.min(totalPrepaid, commissionValue);
        const netPayable = Math.max(0, commissionValue - prepaymentDeducted);
        const fullyPaidByPrepayment = netPayable === 0;
        const triggersAutoComplete = (acceptProposed || acceptReceiptAmount) && fullyPaidByPrepayment;

        const fmtPushBody = () =>
          fullyPaidByPrepayment
            ? `Сумма ${Number(u.orderAmount).toLocaleString("ru-RU")} ₽. Комиссия ${commissionValue.toLocaleString("ru-RU")} ₽ покрыта предоплатой клиента.`
            : prepaymentDeducted > 0
              ? `Сумма ${Number(u.orderAmount).toLocaleString("ru-RU")} ₽. К оплате: ${netPayable.toLocaleString("ru-RU")} ₽ (предоплата ${prepaymentDeducted.toLocaleString("ru-RU")} ₽ зачтена).`
              : `Сумма ${Number(u.orderAmount).toLocaleString("ru-RU")} ₽. Комиссия к оплате: ${commissionValue.toLocaleString("ru-RU")} ₽.`;

        if (existingTx) {
          const wasPlaceholder = Number(existingTx.commission) === 0;
          const prevCommission = Number(existingTx.commission);
          const prevPrepaymentDeducted = Number(existingTx.prepaymentDeducted ?? 0);
          const prevNetPayable = Math.max(0, prevCommission - prevPrepaymentDeducted);

          await tx.update(transactionsTable).set({
            orderAmount: u.orderAmount,
            commission: u.commission,
            serviceFee: "500",
            prepaymentDeducted: String(prepaymentDeducted),
            paymentStatus: fullyPaidByPrepayment ? "paid" : "pending",
            paidAt: fullyPaidByPrepayment ? new Date() : existingTx.paidAt,
          }).where(eq(transactionsTable.id, existingTx.id));

          const [m] = await tx.select().from(mastersTable).where(eq(mastersTable.id, u.masterId));
          if (m) {
            if (wasPlaceholder) {
              if (netPayable > 0) {
                const newDebt = Number(m.debt) + netPayable;
                await tx.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, u.masterId));
              }
              pushBodyForMaster = fmtPushBody();
            } else if (commissionValue !== prevCommission || prepaymentDeducted !== prevPrepaymentDeducted) {
              const delta = netPayable - prevNetPayable;
              const newDebt = Math.max(0, Number(m.debt) + delta);
              await tx.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, u.masterId));
            }
          }
        } else {
          await tx.insert(transactionsTable).values({
            orderId: id,
            masterId: u.masterId,
            orderAmount: u.orderAmount,
            commission: u.commission,
            serviceFee: "500",
            prepaymentDeducted: String(prepaymentDeducted),
            paymentStatus: fullyPaidByPrepayment ? "paid" : "pending",
            paidAt: fullyPaidByPrepayment ? new Date() : undefined,
          });
          const [m] = await tx.select().from(mastersTable).where(eq(mastersTable.id, u.masterId));
          if (m && netPayable > 0) {
            const newDebt = Number(m.debt) + netPayable;
            await tx.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, u.masterId));
          }
          pushBodyForMaster = fmtPushBody();
        }

        // Auto-complete if commission fully covered by client prepayment.
        if (triggersAutoComplete && u.status !== "completed") {
          await tx.update(ordersTable)
            .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
            .where(eq(ordersTable.id, id));
          await tx.insert(orderStatusLogsTable).values({
            orderId: id,
            oldStatus: u.status,
            newStatus: "completed",
            userId: sessionUser,
            userAlias: actor.alias ?? "система",
            note: "auto-complete after commission confirmation",
          });
          await tx.update(transactionsTable)
            .set({ paymentStatus: "paid", paidAt: new Date() })
            .where(and(eq(transactionsTable.orderId, id), eq(transactionsTable.paymentStatus as any, "pending")));
          autoCompleteHappened = true;
        }
      }

      // ── Delete placeholder transaction on cancellation ─────────────────
      const isBeingCancelled = approveCancellation || rejectCancellation || updates.status === "cancelled";
      if (current.paymentModel !== "token" && isBeingCancelled && current.masterId) {
        const txRows = await tx.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
        const placeholder = txRows[0];
        if (placeholder && Number(placeholder.commission) === 0) {
          await tx.delete(transactionsTable).where(eq(transactionsTable.id, placeholder.id));
          placeholderDeleted = true;
        }
      }

      // ── Decrement master counters on actual cancellation ──────────────
      if ((approveCancellation || updates.status === "cancelled") && current.masterId && !rejectCancellation) {
        await tx.update(mastersTable)
          .set({
            totalOrders: sql`${mastersTable.totalOrders} - 1`,
            acceptedOrders: sql`${mastersTable.acceptedOrders} - 1`,
          })
          .where(eq(mastersTable.id, current.masterId));
      }

      // ── Close dispatch records when operator directly cancels ─────────
      if (status === "cancelled" && current.status !== "cancelled") {
        await tx.update(orderDispatchesTable)
          .set({ status: "cancelled" } as any)
          .where(eq(orderDispatchesTable.orderId, id));
      }
    });
  } catch (err: any) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("[orders PATCH /:id] transaction failed:", err);
    return res.status(500).json({ error: "Не удалось сохранить изменения, попробуйте снова" });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Post-commit side effects: notifications, async analysis, library calls
  // with their own DB logic. Best-effort; failures here log but don't roll back.
  // ─────────────────────────────────────────────────────────────────────────
  const o = updatedOrder!;
  void placeholderDeleted; // reserved for future analytics

  // ── Master reputation ──────────────────────────────────────────────────
  if (current.masterId && newStatus === "completed" && current.status !== "completed") {
    await recordOrderCompleted(current.masterId).catch(e =>
      console.error("[orders] recordOrderCompleted error:", e),
    );
  }
  if (
    current.masterId &&
    !rejectCancellation &&
    newStatus === "cancelled" &&
    current.status !== "cancelled"
  ) {
    await recordOrderCancelled(current.masterId, id).catch(e =>
      console.error("[orders] recordOrderCancelled error:", e),
    );
  }
  if (restoreOrder && current.status === "cancelled" && current.masterId) {
    await revertOrderCancellation(current.masterId).catch(e =>
      console.error("[orders] revertOrderCancellation error:", e),
    );
  }
  if (autoCompleteHappened && current.masterId) {
    await recordOrderCompleted(current.masterId).catch(e =>
      console.error("[orders] recordOrderCompleted (auto) error:", e),
    );
  }

  // ── PWA push when commission was confirmed ─────────────────────────────
  if (pushBodyForMaster && o.masterId) {
    sendPushToMaster(o.masterId, {
      title: "✅ Сумма по заказу подтверждена",
      body: pushBodyForMaster,
      url: "/balance",
    }).catch((err) => console.error("[orders] push send failed:", err));
  }

  // ── Auto-move master between voronka columns based on status change ───
  if ((status !== undefined || approveCancellation) && current.masterId) {
    const masterId = current.masterId;
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
    const master = masterRows[0];
    if (master) {
      if (status === "master_assigned" || status === "in_progress") {
        const activeCount = await countActiveMasterOrders(masterId);
        const colId = await getColumnIdForActiveCount(activeCount);
        if (colId) {
          await db.update(mastersTable).set({ voronkaColumnId: colId }).where(eq(mastersTable.id, masterId));
        }
      } else if (status === "completed") {
        const remainingCount = await countActiveMasterOrders(masterId, id);
        if (remainingCount > 0) {
          const colId = await getColumnIdForActiveCount(remainingCount);
          if (colId) {
            await db.update(mastersTable).set({ voronkaColumnId: colId }).where(eq(mastersTable.id, masterId));
          }
        } else {
          const awaitingCol = await getAwaitingPaymentColumn();
          if (awaitingCol) {
            await db.update(mastersTable).set({ voronkaColumnId: awaitingCol.id }).where(eq(mastersTable.id, masterId));
          }
        }
      } else if (status === "cancelled" || approveCancellation) {
        const remainingCount = await countActiveMasterOrders(masterId, id);
        const colId = await getColumnIdForActiveCount(remainingCount);
        if (colId) {
          await db.update(mastersTable).set({ voronkaColumnId: colId }).where(eq(mastersTable.id, masterId));
        }
      }
      // rejectCancellation: master stays in current voronka column (operator frees manually)
    }
  }

  // ── Re-broadcast after rejection ──────────────────────────────────────
  if (rejectCancellation && current.masterId) {
    const rejectedMasterId = current.masterId;
    const rejectedMasterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, rejectedMasterId));
    const rejectedMaster = rejectedMasterRows[0];
    const rejectionMsg =
      `⚠️ Запрос на отмену заказа #${id} отклонён оператором.\n\n` +
      `Заказ передан другим мастерам. Ваш статус в воронке остаётся прежним — оператор переведёт вас в «Свободен» вручную.`;
    if (rejectedMaster?.maxChatId) {
      await sendMaxMessage(rejectedMaster.maxChatId, rejectionMsg).catch(() => {});
    }
    if (rejectedMaster?.pwaLogin) {
      await sendPushToMaster(rejectedMasterId, {
        title: "Отмена заказа отклонена",
        body: `Заказ #${id} передан другим мастерам.`,
        orderId: id,
      } as any).catch(() => {});
    }

    await db.delete(orderDispatchesTable).where(eq(orderDispatchesTable.orderId, id));
    await db.insert(orderDispatchesTable).values({
      orderId: id,
      masterId: rejectedMasterId,
      telegramChatId: rejectedMaster?.maxChatId ?? `pwa_${rejectedMasterId}`,
      status: "rejected",
      rejectionReason: "Мастер запросил отмену — оператор отклонил и переназначил заказ",
    });
    void buildOrderCard;

    await performBroadcast(id).catch(e => console.error("[orders] re-broadcast error:", e));
  }

  // ── Async analysis of suspicious cancellations — fire and forget ──────
  if ((approveCancellation || (status === "cancelled" && current.status !== "cancelled")) && current.masterId) {
    const cancelledMasterId = current.masterId;
    db.select({ alias: mastersTable.alias }).from(mastersTable)
      .where(eq(mastersTable.id, cancelledMasterId))
      .then(rows => {
        if (rows[0]) {
          analyseOrderCancellation(id, cancelledMasterId, rows[0].alias, (current as any).cancelType ?? null)
            .catch(e => console.error("[orders] analyseOrderCancellation error:", e));
        }
      }).catch(() => {});
  }

  // ── Notify master when admin approves a cancellation request ──────────
  if (approveCancellation && current.masterId) {
    const cancelNotifyText =
      `❌ Заказ #${id} отменён\n\n` +
      `Отмена подтверждена. Обратите внимание: частые отмены снижают ваш рейтинг и количество поступающих вам заявок. Берите только те заказы, в которых уверены.`;
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, current.masterId));
    const cancelledMaster = masterRows[0];
    if (cancelledMaster) {
      await db.insert(masterMessagesTable).values({
        masterId: cancelledMaster.id,
        telegramChatId: `pwa_${cancelledMaster.id}`,
        text: cancelNotifyText,
        fromMaster: false,
        senderName: "system",
        isRead: false,
      }).catch(e => console.error("[orders] Failed to insert cancellation message:", e));
      if (cancelledMaster.maxChatId) {
        sendMaxMessage(cancelledMaster.maxChatId, cancelNotifyText)
          .catch(e => console.error("[orders] Failed to send Max cancellation message:", e));
      }
    }
  }

  // ── Notify work-board listeners (CRM SSE) ─────────────────────────────
  notifyWorkBoardChanged("order_patch");

  // ── Cache invalidation when order moves out of "no_amount" ────────────
  if (updatedOrder!.orderAmount && !current.orderAmount) {
    closeOpenEstimateTasksForOrder(id, "сумма зафиксирована").catch(() => {});
  }

  // ── Build response ────────────────────────────────────────────────────
  let masterName: string | null = null;
  if (o.masterId) {
    const m = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    masterName = m[0]?.alias ?? null;
  }
  const patchTxRows = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
  const patchTx = patchTxRows[0] ?? null;
  res.json({
    id: o.id,
    leadId: o.leadId,
    city: o.city,
    district: o.district,
    serviceType: o.serviceType,
    area: Number(o.area),
    scheduledAt: o.scheduledAt ?? null,
    comment: o.comment ?? null,
    status: o.status,
    masterId: o.masterId ?? null,
    masterName,
    proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    commissionPaid: o.commissionPaid ?? false,
    agreementAmountSource: (o as any).agreementAmountSource ?? null,
    clientRating: o.clientRating ?? null,
    cancelReason: o.cancelReason ?? null,
    cancelType: (o as any).cancelType ?? null,
    operatorNote: (o as any).operatorNote ?? null,
    assignedAt: (o as any).assignedAt ?? null,
    completedAt: (o as any).completedAt ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    transactionInfo: patchTx ? {
      orderAmount: Number(patchTx.orderAmount),
      commission: Number(patchTx.commission),
      prepaymentDeducted: Number(patchTx.prepaymentDeducted ?? 0),
      paymentStatus: patchTx.paymentStatus,
      paidAt: patchTx.paidAt ?? null,
    } : null,
  });
});

// ─── POST /:id/agreement — Agreement_Path (Phase 2 of estimate-optional-flow) ──
//
// Operator fixes the agreed amount on an order ("master called and we agreed
// on N rubles with the client"). This is the alternative to creating a Receipt
// in the master-PWA. After this call the order has Payment_State = "agreed".
//
// Mirror of the legacy `PATCH /:id { acceptProposed }` flow but:
//   • does NOT require a pre-existing proposedAmount (operator types it in)
//   • records audit event with explicit source ("agreement" | "master_proposal")
//   • atomically updates orderAmount + commission (commission orders) + audit
//   • mirrors the same transaction-sync + master.debt update + push notify
//   • skips token charging for token-model orders (those are charged at the
//     master-pwa response stage; see remove-token-payment-model spec for the
//     full removal of the dual-model architecture)
//
// Reads of paymentState (Phase 1) and notification suppression (Phase 2 T15-T20)
// will treat this Order as `agreed` immediately. The notification engine is
// already prepared to suppress no_estimate signals once the engine flag is on.
router.post("/:id/agreement", allOrderRoles, async (req, res) => {
  const id = parseInt(String(req.params.id as string));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

  const { amount, source, note, noteSource } = req.body ?? {};

  // ── Validate ────────────────────────────────────────────────────────────────
  const amountNum = Number(amount);
  if (!isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: "Сумма должна быть больше 0" });
  }
  // Soft warning above 1М ₽ — UI shows it, server still accepts (Q2 decision).
  // Source whitelist — "agreement" is operator-typed, "master_proposal" is one-click.
  const allowedSources = ["agreement", "master_proposal"] as const;
  const sourceVal: "agreement" | "master_proposal" =
    typeof source === "string" && (allowedSources as readonly string[]).includes(source)
      ? (source as "agreement" | "master_proposal")
      : "agreement";

  // Compose human-readable note from selector + free text. Stored in
  // orders.agreementNote AND used as audit reason. Optional in v1 (Q12).
  const noteText = (() => {
    const parts: string[] = [];
    if (noteSource && typeof noteSource === "string") {
      const labels: Record<string, string> = {
        from_master: "со слов мастера",
        from_chat: "по чату с клиентом",
        other: "другое",
      };
      parts.push(labels[noteSource] ?? noteSource);
    }
    if (note && typeof note === "string" && note.trim()) {
      parts.push(note.trim());
    }
    return parts.length > 0 ? parts.join(": ").slice(0, 1000) : null;
  })();

  // ── Resolve actor (audit denormalization) ───────────────────────────────────
  const sessionUserId = (req as any).session?.userId ?? null;
  const actor = await resolveAuditActor(sessionUserId, "operator");

  // ── Fetch and validate current state ────────────────────────────────────────
  const currentRows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  const current = currentRows[0];
  if (!current) return res.status(404).json({ error: "Order not found" });
  if (current.deletedAt) return res.status(404).json({ error: "Order deleted" });
  if (current.status === "cancelled" || current.status === "completed") {
    return res.status(400).json({
      error: "Нельзя зафиксировать сумму на закрытом заказе",
      orderStatus: current.status,
    });
  }

  const isTokenModel = current.paymentModel === "token";

  // Commission settings — read once outside transaction (cached, deterministic)
  const commSettings = await getCommissionSettings();
  const newCommission = isTokenModel
    ? null
    : String(calculateCommission(amountNum, commSettings));

  // ── Atomic update: order fields + audit, single transaction ─────────────────
  const updated = await db.transaction(async (tx) => {
    const [u] = await tx
      .update(ordersTable)
      .set({
        orderAmount: String(amountNum),
        agreementAmountSource: sourceVal,
        agreementNote: noteText,
        paymentStateChangedAt: new Date(),
        ...(isTokenModel ? {} : { commission: newCommission! }),
        // Mirror legacy: keep proposedAmount in sync so existing PATCH paths
        // and FOMO-block logic see a non-null proposedAmount.
        proposedAmount: String(amountNum),
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, id))
      .returning();

    await recordAmountAudit(tx as any, {
      orderId: id,
      actorUserId: actor.id,
      actorRole: actor.role,
      actorAlias: actor.alias,
      field: "orderAmount",
      previousValue: current.orderAmount,
      newValue: String(amountNum),
      source: sourceVal,
      reason: noteText,
    });
    if (!isTokenModel) {
      await recordAmountAudit(tx as any, {
        orderId: id,
        actorUserId: actor.id,
        actorRole: actor.role,
        actorAlias: actor.alias,
        field: "commission",
        previousValue: current.commission,
        newValue: newCommission!,
        source: "system_recalc",
      });
    }
    return u;
  });

  // ── Sync transaction record (commission orders only) ────────────────────────
  // Mirror of the existing acceptProposed branch in PATCH /:id.
  // Side effects: master.debt updated, transaction row created/updated, optional
  // auto-complete if commission fully covered by receipt prepayment.
  let autoCompleted = false;
  if (!isTokenModel && updated.masterId) {
    autoCompleted = await syncTransactionForAgreement(
      updated,
      amountNum,
      Number(newCommission ?? 0),
    );
  }

  // ── Notify (best-effort, post-commit) ───────────────────────────────────────
  notifyWorkBoardChanged("agreement_set");

  if (updated.masterId) {
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, updated.masterId));
    const master = masterRows[0];
    const amountStr = amountNum.toLocaleString("ru-RU");

    sendPushToMaster(updated.masterId, {
      title: "✅ Оператор зафиксировал согласованную сумму",
      body: `Заказ #${id}: ${amountStr} ₽. Дополнительно создавать смету не нужно.`,
      url: "/orders",
    }).catch((err) => console.error("[orders/agreement] push error:", err));

    if (master?.maxChatId) {
      const text = `✅ Оператор зафиксировал согласованную сумму ${amountStr} ₽ по заказу #${id}.\n\nДополнительно создавать смету не нужно.`;
      sendMaxMessage(master.maxChatId, text).catch((err) =>
        console.error("[orders/agreement] max error:", err),
      );
    }
  }

  // Cache invalidation — Phase 2 helper drops dashboard-action-items cache so
  // the no_estimate task disappears from the operator UI immediately. The
  // SQL-level filtering for the engine flag is added in T16.
  closeOpenEstimateTasksForOrder(id, "сумма зафиксирована").catch(() => {});

  // ── Response ────────────────────────────────────────────────────────────────
  // If transaction sync triggered auto-complete, reload to reflect status change.
  const finalRows = autoCompleted
    ? await db.select().from(ordersTable).where(eq(ordersTable.id, id))
    : [updated];
  const final = finalRows[0];

  // Include paymentState — same shape as Phase 1 read endpoints.
  const allReceiptsForOrder = await db
    .select({
      prepaymentAmount: receiptsTable.prepaymentAmount,
      prepaymentSeenAt: receiptsTable.prepaymentSeenAt,
      prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
    })
    .from(receiptsTable)
    .where(eq(receiptsTable.orderId, id));

  res.json({
    ok: true,
    autoCompleted,
    order: {
      id: final.id,
      status: final.status,
      orderAmount: final.orderAmount ? Number(final.orderAmount) : null,
      proposedAmount: final.proposedAmount ? Number(final.proposedAmount) : null,
      commission: final.commission ? Number(final.commission) : null,
      commissionPaid: final.commissionPaid ?? false,
      agreementAmountSource: (final as any).agreementAmountSource ?? null,
      agreementNote: (final as any).agreementNote ?? null,
      paymentState: computePaymentState(final, allReceiptsForOrder),
      paymentModel: final.paymentModel,
    },
  });
});

// Helper for POST /:id/agreement above. Mirrors the existing acceptProposed
// transaction-sync branch in PATCH /:id (lines ~458-553) but extracted into
// a function so the new endpoint can call it without duplicating the entire
// PATCH handler. Returns true if commission was fully covered by receipt
// prepayment and the order auto-completed.
async function syncTransactionForAgreement(
  o: typeof ordersTable.$inferSelect,
  _amountNum: number,
  commissionValue: number,
): Promise<boolean> {
  if (!o.masterId || !o.orderAmount || !o.commission) return false;

  const id = o.id;
  const existingTxRows = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.orderId, id));
  const existingTx = existingTxRows[0];

  const paidReceiptRows = await db
    .select()
    .from(receiptsTable)
    .where(and(eq(receiptsTable.orderId, id), isNotNull(receiptsTable.prepaymentSubmittedAt)));
  const totalPrepaid = paidReceiptRows.reduce((sum, r) => sum + Number(r.prepaymentAmount), 0);
  const prepaymentDeducted = Math.min(totalPrepaid, commissionValue);
  const netPayable = Math.max(0, commissionValue - prepaymentDeducted);
  const fullyPaidByPrepayment = netPayable === 0;

  if (existingTx) {
    const wasPlaceholder = Number(existingTx.commission) === 0;
    const prevCommission = Number(existingTx.commission);
    const prevPrepaymentDeducted = Number(existingTx.prepaymentDeducted ?? 0);
    const prevNetPayable = Math.max(0, prevCommission - prevPrepaymentDeducted);

    await db
      .update(transactionsTable)
      .set({
        orderAmount: o.orderAmount,
        commission: o.commission,
        serviceFee: "500",
        prepaymentDeducted: String(prepaymentDeducted),
        paymentStatus: fullyPaidByPrepayment ? "paid" : "pending",
        paidAt: fullyPaidByPrepayment ? new Date() : existingTx.paidAt,
      })
      .where(eq(transactionsTable.id, existingTx.id));

    const [m] = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    if (m) {
      if (wasPlaceholder) {
        if (netPayable > 0) {
          const newDebt = Number(m.debt) + netPayable;
          await db
            .update(mastersTable)
            .set({ debt: String(newDebt) })
            .where(eq(mastersTable.id, o.masterId));
        }
      } else if (commissionValue !== prevCommission || prepaymentDeducted !== prevPrepaymentDeducted) {
        const delta = netPayable - prevNetPayable;
        const newDebt = Math.max(0, Number(m.debt) + delta);
        await db
          .update(mastersTable)
          .set({ debt: String(newDebt) })
          .where(eq(mastersTable.id, o.masterId));
      }
    }
  } else {
    await db.insert(transactionsTable).values({
      orderId: id,
      masterId: o.masterId,
      orderAmount: o.orderAmount,
      commission: o.commission,
      serviceFee: "500",
      prepaymentDeducted: String(prepaymentDeducted),
      paymentStatus: fullyPaidByPrepayment ? "paid" : "pending",
      paidAt: fullyPaidByPrepayment ? new Date() : undefined,
    });
    const [m] = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    if (m && netPayable > 0) {
      const newDebt = Number(m.debt) + netPayable;
      await db
        .update(mastersTable)
        .set({ debt: String(newDebt) })
        .where(eq(mastersTable.id, o.masterId));
    }
  }

  if (fullyPaidByPrepayment && o.status !== "completed") {
    await db
      .update(ordersTable)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(ordersTable.id, id));
    await db
      .insert(orderStatusLogsTable)
      .values({
        orderId: id,
        oldStatus: o.status,
        newStatus: "completed",
        userId: null,
        userAlias: "система (auto-complete after agreement)",
      })
      .catch(() => {});
    return true;
  }
  return false;
}

router.post("/:id/manual-assign/:masterId", allOrderRoles, async (req, res) => {
  const id = parseInt(String(req.params.id as string));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });
  const masterIdNum = parseInt(String(req.params.masterId as string));
  if (isNaN(masterIdNum)) return res.status(400).json({ error: "Invalid master ID" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterIdNum));
  if (!masterRows[0]) return res.status(404).json({ error: "Master not found" });
  const master = masterRows[0];

  // Check order eligibility (limit + debt + overdue)
  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
  const masterActiveCount = activeOrders.filter(o => o.masterId === masterIdNum).length;
  const overdueMasterIds = await getOverdueMasterIds();
  const eligibility = getMasterEligibility(master, masterActiveCount, overdueMasterIds);
  if (!eligibility.canAccept) {
    return res.status(400).json({ error: eligibility.reason });
  }

  // Load order
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!orderRows[0]) return res.status(404).json({ error: "Order not found" });
  const order = orderRows[0];

  // Deduct service fee (waived for test orders) — outside transaction for safety
  const { countTestOrders } = await import("../lib/accountBalance.js");
  const isTestEligible = await countTestOrders(masterIdNum) < 2;
  await deductServiceFee(masterIdNum, id, {
    isTest: master.isTestMaster && isTestEligible,
    reason: master.isTestMaster && isTestEligible ? "Тестовый заказ — сервисный сбор не списан" : undefined,
  });

  try {
    await db.transaction(async (tx) => {
      // Add master to order_masters
      await tx.insert(orderMastersTable).values({
        orderId: id,
        masterId: masterIdNum,
        status: "active",
      });

      const currentAssignedCount = (order as any).assignedMasterCount ?? 0;
      const maxMasters = (order as any).maxMasters ?? 3;
      const newCount = currentAssignedCount + 1;
      const isFull = newCount >= maxMasters;

      const orderUpdates: any = {
        assignedMasterCount: newCount,
        updatedAt: new Date(),
        ...( !order.masterId ? { masterId: masterIdNum } : {} ),
      };

      if (isFull) {
        orderUpdates.status = "master_assigned";
        orderUpdates.dispatchStatus = "assigned";
        await tx.update(orderDispatchesTable)
          .set({ status: "rejected" })
          .where(and(
            eq(orderDispatchesTable.orderId, id),
            eq(orderDispatchesTable.status, "sent"),
          ));
      }

      const result = await tx.update(ordersTable).set(orderUpdates).where(eq(ordersTable.id, id)).returning();
      if (!result[0]) throw new Error("Order not found");

      // Update dispatch record to assigned
      const existingDispatch = await tx.select().from(orderDispatchesTable)
        .where(and(eq(orderDispatchesTable.orderId, id), eq(orderDispatchesTable.masterId, masterIdNum)));
      if (existingDispatch.length > 0) {
        await tx.update(orderDispatchesTable)
          .set({ status: "assigned" })
          .where(eq(orderDispatchesTable.id, existingDispatch[0].id));
      } else {
        await tx.insert(orderDispatchesTable).values({
          orderId: id,
          masterId: masterIdNum,
          telegramChatId: `pwa_${masterIdNum}`,
          status: "assigned",
        });
      }

      // Update master stats + move to "На объекте" column automatically
      const onSiteCol = await getOnSiteColumn();
      await tx.update(mastersTable).set({
        totalOrders: master.totalOrders + 1,
        acceptedOrders: master.acceptedOrders + 1,
        voronkaColumnId: onSiteCol?.id ?? master.voronkaColumnId,
      }).where(eq(mastersTable.id, masterIdNum));

      // Create placeholder transaction — commission amount unknown yet, will be updated when order completes
      const existingTxRows = await tx.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
      if (existingTxRows.length === 0) {
        await tx.insert(transactionsTable).values({
          orderId: id,
          masterId: masterIdNum,
          orderAmount: "0",
          commission: "0",
          serviceFee: "500",
          paymentStatus: "pending",
        });
      }
    });
  } catch (e) {
    console.error("[manual-assign] error:", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Internal server error" });
  }

  // Fetch updated order for response
  const o = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).then(r => r[0]);

  if (master.maxChatId) {
    const amLead = o.leadId ? await db.select().from(leadsTable).where(eq(leadsTable.id, o.leadId)) : [];
    const amLeadRow = amLead[0];
    const amDate = o.scheduledAt
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(o.scheduledAt))
      : "не указана";
    sendMaxMessage(
      master.maxChatId,
      `✅ Вам назначена заявка #${id}\n\n🔧 ${o.serviceType}\n📍 ${o.city}${o.district ? ", " + o.district : ""}\n📐 ${o.area} м²\n📅 ${amDate}${o.comment ? "\n💬 " + o.comment : ""}${amLeadRow ? `\n\n📞 ${amLeadRow.clientName}\n${amLeadRow.clientPhone}` : ""}\n\n👉 Подробности в приложении:\nhttps://sfera-master.ru/master-pwa/orders`
    ).catch(() => {});
  }

  // Push notification to client if this is a client_site order
  if (o.source === "client_site" && o.clientPhone) {
    const ratingStr = Number(master.rating).toFixed(1);
    sendPushToClient(o.clientPhone, {
      type: "master_assigned",
      title: "Мастер найден",
      body: `Вам позвонит мастер ${master.alias}, рейтинг ${ratingStr}★`,
      orderId: id,
      masterName: master.alias,
      rating: ratingStr,
    }).catch(() => {});
  }

  // Record ML training data
  try {
    const now = new Date();
    await db.insert(mlPricingDecisionsTable).values({
      orderId: id,
      masterId: masterIdNum,
      maxMasters: (order as any).maxMasters ?? 3,
      assignedCount: ((order as any).assignedMasterCount ?? 0) + 1,
      serviceType: order.serviceType,
      city: order.city,
      district: order.district,
      area: order.area ? String(order.area) : null,
      scheduledAt: order.scheduledAt,
      hourOfDay: now.getHours(),
      isWeekend: now.getDay() === 0 || now.getDay() === 6,
      masterRating: master.rating ? String(master.rating) : null,
      masterExperience: master.acceptedOrders ?? 0,
    });
  } catch (e) {
    console.error("[ml-pricing-decisions] insert failed:", e);
  }

  res.json({
    id: o.id,
    leadId: o.leadId,
    city: o.city,
    district: o.district,
    serviceType: o.serviceType,
    area: Number(o.area),
    scheduledAt: o.scheduledAt ?? null,
    comment: o.comment ?? null,
    status: o.status,
    masterId: o.masterId ?? null,
    masterName: master.alias,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    clientRating: o.clientRating ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  });
});

// ─── POST /api/orders/:id/unassign-master — admin removes master from order ───
router.post("/:id/unassign-master", requireRole("admin", "master_operator"), async (req, res) => {
  const id = parseInt(String(req.params.id as string));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order id" });

  const { reason, rebroadcast, masterId: bodyMasterId } = req.body as { reason?: string; rebroadcast?: boolean; masterId?: number };
  if (!reason?.trim()) return res.status(400).json({ error: "Укажите причину снятия мастера" });

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  const prevMasterId = bodyMasterId ?? order.masterId;
  if (!prevMasterId) return res.status(400).json({ error: "Укажите мастера для снятия" });

  // Remove from order_masters
  const omRow = await db.select().from(orderMastersTable)
    .where(and(eq(orderMastersTable.orderId, id), eq(orderMastersTable.masterId, prevMasterId)))
    .limit(1);
  if (omRow.length > 0) {
    await db.update(orderMastersTable)
      .set({ status: "cancelled" })
      .where(eq(orderMastersTable.id, omRow[0].id));
  }

  const currentCount = (order as any).assignedMasterCount ?? 0;
  const newCount = Math.max(0, currentCount - 1);

  // Check remaining assigned masters
  const remainingMasters = await db.select().from(orderMastersTable)
    .where(and(eq(orderMastersTable.orderId, id), eq(orderMastersTable.status, "active")));

  const updates: any = {
    assignedMasterCount: newCount,
    updatedAt: new Date(),
    cancelReason: reason.trim(),
  };

  if (remainingMasters.length === 0) {
    updates.masterId = null;
    updates.status = "waiting_master";
    updates.dispatchStatus = "none";
  } else if (order.masterId === prevMasterId) {
    updates.masterId = remainingMasters[0].masterId;
  }

  await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id));

  // Mark unassigned master's dispatch record as "rejected"
  await db.update(orderDispatchesTable)
    .set({ status: "rejected" })
    .where(and(eq(orderDispatchesTable.orderId, id), eq(orderDispatchesTable.masterId, prevMasterId)));

  // Log the status change
  const sessionUser = (req as any).session?.userId ?? null;
  let unassignUserAlias = "система";
  if (sessionUser) {
    const userRows = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser));
    unassignUserAlias = userRows[0]?.name ?? userRows[0]?.login ?? "система";
  }
  await db.insert(orderStatusLogsTable).values({
    orderId: id,
    oldStatus: order.status,
    newStatus: remainingMasters.length === 0 ? "waiting_master" : order.status,
    userId: sessionUser,
    userAlias: unassignUserAlias,
    note: `Мастер снят. Причина: ${reason.trim()}`,
  }).catch(() => {});

  // Update master voronka column based on remaining active orders
  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, prevMasterId));
  const master = masterRows[0];
  if (master) {
    const remainingCount = await countActiveMasterOrders(prevMasterId, id);
    const colId = await getColumnIdForActiveCount(remainingCount);
    if (colId) {
      await db.update(mastersTable).set({ voronkaColumnId: colId }).where(eq(mastersTable.id, prevMasterId));
    }

    // Decrement stats to reflect actual active orders
    await db.update(mastersTable).set({
      totalOrders: Math.max(0, master.totalOrders - 1),
      acceptedOrders: Math.max(0, master.acceptedOrders - 1),
    }).where(eq(mastersTable.id, prevMasterId));

    // Log to CRM chat (visible in PWA chat tab)
    await db.insert(masterMessagesTable).values({
      masterId: prevMasterId,
      telegramChatId: `pwa_${prevMasterId}`,
      text: `⚠️ Снят с заявки #${id} (${order.serviceType}, ${order.city}) администратором. Причина: ${reason.trim()}`,
      fromMaster: false,
      senderName: "system",
      isRead: false,
    }).catch(() => {});
  }

  // If rebroadcast requested and no remaining masters — trigger broadcast
  let broadcastResult = null;
  if (rebroadcast && remainingMasters.length === 0) {
    broadcastResult = await performBroadcast(id).catch(() => null);
  }

  res.json({ ok: true, rebroadcast: broadcastResult });
});

// ─── POST /api/orders/:id/manual-assign/:masterId — admin force-assigns master ─
router.post("/:id/manual-assign/:masterId", requireRole("admin", "master_operator"), async (req, res) => {
  const orderId = parseInt(String(req.params.id as string));
  const masterId = parseInt(String(req.params.masterId as string));
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid master ID" });
  if (isNaN(orderId) || isNaN(masterId)) return res.status(400).json({ error: "Invalid ids" });

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  // Check if already assigned via order_masters
  const existingOm = await db.select().from(orderMastersTable)
    .where(and(eq(orderMastersTable.orderId, orderId), eq(orderMastersTable.masterId, masterId)));
  if (existingOm.length > 0) return res.status(400).json({ error: "Этот мастер уже назначен на заказ" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });
  if (master.status !== "active") return res.status(400).json({ error: "Мастер неактивен" });

  // Check room
  const currentAssignedCount = (order as any).assignedMasterCount ?? 0;
  const maxMasters = (order as any).maxMasters ?? 3;
  if (currentAssignedCount >= maxMasters) {
    return res.status(400).json({ error: "Заказ уже занят максимальным числом мастеров" });
  }

  try {
    await db.transaction(async (tx) => {
      // Add to order_masters
      await tx.insert(orderMastersTable).values({
        orderId,
        masterId,
        status: "active",
      });

      const newCount = currentAssignedCount + 1;
      const isFull = newCount >= maxMasters;

      const orderUpdates: any = {
        assignedMasterCount: newCount,
        updatedAt: new Date(),
        ...( !order.masterId ? { masterId } : {} ),
      };

      if (isFull) {
        orderUpdates.status = "master_assigned";
        orderUpdates.dispatchStatus = "assigned";
        await tx.update(orderDispatchesTable)
          .set({ status: "rejected" })
          .where(and(
            eq(orderDispatchesTable.orderId, orderId),
            eq(orderDispatchesTable.status, "sent"),
          ));
      }

      await tx.update(ordersTable).set(orderUpdates).where(eq(ordersTable.id, orderId));

      // Update or create dispatch record for this master
      const existingDispatch = await tx.select().from(orderDispatchesTable)
        .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.masterId, masterId)));

      if (existingDispatch.length > 0) {
        await tx.update(orderDispatchesTable)
          .set({ status: "assigned" })
          .where(eq(orderDispatchesTable.id, existingDispatch[0].id));
      } else {
        await tx.insert(orderDispatchesTable).values({
          orderId,
          masterId,
          telegramChatId: `pwa_${masterId}`,
          status: "assigned",
        });
      }

      // Move new master to "На объекте" column and update stats
      const onSiteCol = await getOnSiteColumn();
      await tx.update(mastersTable).set({
        voronkaColumnId: onSiteCol?.id ?? master.voronkaColumnId,
        totalOrders: master.totalOrders + 1,
        acceptedOrders: master.acceptedOrders + 1,
      }).where(eq(mastersTable.id, masterId));

      // Set assignedAt timestamp on manual assign
      await tx.update(ordersTable)
        .set({ assignedAt: new Date() })
        .where(eq(ordersTable.id, orderId));

      // Log the status change
      const maSessionUser = (req as any).session?.userId ?? null;
      let maUserAlias = "система";
      if (maSessionUser) {
        const userRows = await tx.select().from(usersTable).where(eq(usersTable.id, maSessionUser));
        maUserAlias = userRows[0]?.name ?? userRows[0]?.login ?? "система";
      }
      await tx.insert(orderStatusLogsTable).values({
        orderId,
        oldStatus: order.status,
        newStatus: isFull ? "master_assigned" : order.status,
        userId: maSessionUser,
        userAlias: maUserAlias,
        note: `Назначен вручную: ${master.alias}`,
      });

      // Log to CRM chat (visible in PWA chat tab)
      await tx.insert(masterMessagesTable).values({
        masterId: master.id,
        telegramChatId: `pwa_${master.id}`,
        text: `✅ Назначен на заявку #${orderId} (вручную администратором)`,
        fromMaster: false,
        senderName: "system",
        isRead: false,
      });

    });
  } catch (e) {
    throw e;
  }

  // Push notification to master's PWA
  const leadRows = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId));
  const lead = leadRows[0];
  sendPushToMaster(master.id, {
    title: "Вас назначили на заказ",
    body: `Заявка #${orderId}${order.serviceType ? ` · ${order.serviceType}` : ""}${lead?.clientName ? ` · ${lead.clientName}` : ""}`,
    url: `/master-pwa/orders`,
  }).catch(() => {});

  // Push notification to client if this is a client_site order
  if (order.source === "client_site" && order.clientPhone) {
    const ratingStr = Number(master.rating).toFixed(1);
    sendPushToClient(order.clientPhone, {
      type: "master_assigned",
      title: "Мастер найден",
      body: `Вам позвонит мастер ${master.alias}, рейтинг ${ratingStr}★`,
      orderId: orderId,
      masterName: master.alias,
      rating: ratingStr,
    }).catch(() => {});
  }

  if (master.maxChatId) {
    const maDate = order.scheduledAt
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduledAt))
      : "не указана";
    sendMaxMessage(
      master.maxChatId,
      `✅ Вам назначена заявка #${orderId}\n\n🔧 ${order.serviceType}\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n📐 ${order.area} м²\n📅 ${maDate}${order.comment ? "\n💬 " + order.comment : ""}${lead ? `\n\n📞 ${lead.clientName}\n${lead.clientPhone}` : ""}\n\n👉 Подробности в приложении:\nhttps://sfera-master.ru/master-pwa/orders`
    ).catch(() => {});
  }

  // Record ML training data
  try {
    const now = new Date();
    await db.insert(mlPricingDecisionsTable).values({
      orderId,
      masterId,
      maxMasters: (order as any).maxMasters ?? 3,
      assignedCount: currentAssignedCount + 1,
      serviceType: order.serviceType,
      city: order.city,
      district: order.district,
      area: order.area ? String(order.area) : null,
      scheduledAt: order.scheduledAt,
      hourOfDay: now.getHours(),
      isWeekend: now.getDay() === 0 || now.getDay() === 6,
      masterRating: master.rating ? String(master.rating) : null,
      masterExperience: master.acceptedOrders ?? 0,
    });
  } catch (e) {
    console.error("[ml-pricing-decisions] insert failed:", e);
  }

  res.json({ ok: true });
});

// ─── POST /api/orders/:id/close-enrollment — admin manually closes master enrollment ───
router.post("/:id/close-enrollment", requireRole("admin", "master_operator"), async (req, res) => {
  const orderId = parseInt(String(req.params.id as string));
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (order.status === "master_assigned") {
    return res.status(400).json({ error: "Набор уже завершён" });
  }

  await db.transaction(async (tx) => {
    await tx.update(ordersTable).set({
      status: "master_assigned",
      dispatchStatus: "assigned",
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, orderId));

    await tx.update(orderDispatchesTable)
      .set({ status: "rejected" })
      .where(and(
        eq(orderDispatchesTable.orderId, orderId),
        eq(orderDispatchesTable.status, "sent"),
      ));

    const sessionUser = (req as any).session?.userId ?? null;
    let userAlias = "система";
    if (sessionUser) {
      const userRows = await tx.select().from(usersTable).where(eq(usersTable.id, sessionUser));
      userAlias = userRows[0]?.name ?? userRows[0]?.login ?? "система";
    }
    await tx.insert(orderStatusLogsTable).values({
      orderId,
      oldStatus: order.status,
      newStatus: "master_assigned",
      userId: sessionUser,
      userAlias,
      note: `Набор мастеров завершён вручную. Назначено: ${(order as any).assignedMasterCount ?? 0} мастеров`,
    });
  });

  res.json({ ok: true });
});

// ─── GET /api/orders/:id/status-log ───────────────────────────────────────────
router.get("/:id/status-log", allOrderRoles, async (req, res) => {
  const id = parseInt(String(req.params.id as string));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order id" });

  const logs = await db.select().from(orderStatusLogsTable)
    .where(eq(orderStatusLogsTable.orderId, id))
    .orderBy(desc(orderStatusLogsTable.createdAt));

  res.json(logs);
});

// GET /api/orders/:id/fomo-presses — FOMO button press events for an order
router.get("/:id/fomo-presses", allOrderRoles, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order id" });

  const events = await db
    .select({
      id: fomoEventsTable.id,
      masterId: fomoEventsTable.masterId,
      masterAlias: mastersTable.alias,
      reason: fomoEventsTable.reason,
      createdAt: fomoEventsTable.createdAt,
    })
    .from(fomoEventsTable)
    .leftJoin(mastersTable, eq(fomoEventsTable.masterId, mastersTable.id))
    .where(and(eq(fomoEventsTable.orderId, id), eq(fomoEventsTable.eventType, "button_press")))
    .orderBy(desc(fomoEventsTable.createdAt));

  res.json(events);
});

// DELETE /api/orders/:id — soft delete (move to trash)
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(String(req.params.id as string));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order id" });

  // Read masterId before soft-delete so we can recalc the column after
  const [orderRow] = await db.select({ masterId: ordersTable.masterId })
    .from(ordersTable).where(eq(ordersTable.id, id));

  await db.update(ordersTable).set({ deletedAt: new Date() }).where(eq(ordersTable.id, id));

  // If order had a master, recalculate their voronka column
  if (orderRow?.masterId) {
    await recalcMasterColumn(orderRow.masterId).catch(() => {});
  }

  res.json({ success: true });
});

// ─── Order stages ───────────────────────────────────────────────────────────

// GET /api/orders/:id/stages
router.get("/:id/stages", allOrderRoles, async (req, res) => {
  const id = parseInt(String(req.params.id as string));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

  const stages = await db.select()
    .from(orderStagesTable)
    .where(eq(orderStagesTable.orderId, id))
    .orderBy(sql`${orderStagesTable.sortOrder} ASC`);

  res.json(stages.map(s => ({
    id: s.id,
    orderId: s.orderId,
    stageName: s.stageName,
    stageAmount: Number(s.stageAmount),
    commissionAmount: Number(s.commissionAmount),
    paymentStatus: s.paymentStatus,
    paidAt: s.paidAt ?? null,
    sortOrder: s.sortOrder,
    createdAt: s.createdAt,
  })));
});

// POST /api/orders/:id/stages — create or replace stages (admin)
router.post("/:id/stages", requireRole("admin", "master_operator"), async (req, res) => {
  const id = parseInt(String(req.params.id as string));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order ID" });

  const { stages } = req.body as { stages?: Array<{ stageName: string; stageAmount: number; sortOrder?: number }> };
  if (!Array.isArray(stages) || stages.length === 0) {
    return res.status(400).json({ error: "Укажите этапы" });
  }

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!orderRows[0]) return res.status(404).json({ error: "Order not found" });
  const order = orderRows[0];

  const commSettings = await getCommissionSettings();

  await db.transaction(async (tx) => {
    // Remove existing stages
    await tx.delete(orderStagesTable).where(eq(orderStagesTable.orderId, id));

    // Insert new stages
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const stageAmount = Number(s.stageAmount);
      const commissionAmount = calculateCommission(stageAmount, commSettings);
      await tx.insert(orderStagesTable).values({
        orderId: id,
        stageName: s.stageName,
        stageAmount: String(stageAmount),
        commissionAmount: String(commissionAmount),
        sortOrder: s.sortOrder ?? i,
      });
    }
  });

  res.json({ ok: true, count: stages.length });
});

// POST /api/orders/:id/stages/:stageId/pay — mark stage as paid (admin)
router.post("/:id/stages/:stageId/pay", requireRole("admin", "master_operator"), async (req, res) => {
  const orderId = parseInt(String(req.params.id as string));
  const stageId = parseInt(String(req.params.stageId as string));
  if (isNaN(orderId) || isNaN(stageId)) return res.status(400).json({ error: "Invalid IDs" });

  const [stage] = await db.select().from(orderStagesTable)
    .where(and(eq(orderStagesTable.id, stageId), eq(orderStagesTable.orderId, orderId)));
  if (!stage) return res.status(404).json({ error: "Stage not found" });

  await db.update(orderStagesTable)
    .set({ paymentStatus: "paid", paidAt: new Date() })
    .where(eq(orderStagesTable.id, stageId));

  res.json({ ok: true, stageId, paymentStatus: "paid" });
});

export default router;
