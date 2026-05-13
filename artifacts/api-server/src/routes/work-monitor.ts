import { Router } from "express";
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, transactionsTable, masterMessagesTable } from "@workspace/db";
import { inArray, isNull, eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();

function safeNumber(val: unknown, defaultValue = 0): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  const num = Number(val);
  return isNaN(num) ? defaultValue : num;
}

const operatorRoles = requireRole("admin", "lead_operator", "master_operator");

export type WorkOrder = {
  id: number;
  leadId: number | null;
  status: string;
  city: string;
  district: string;
  serviceType: string;
  area: number;
  commission: number | null;
  proposedAmount: number | null;
  assignedAt: string | null;
  updatedAt: string | null;
  masterId: number | null;
  masterAlias: string | null;
  masterPhone: string | null;
  masterMaxChatId: string | null;
  masterFomoDisabled: boolean;
  clientName: string | null;
  clientPhone: string | null;
  receiptId: number | null;
  receiptTotalAmount: number | null;
  receiptPrepaymentAmount: number | null;
  receiptCreatedAt: string | null;
  receiptPrepaymentSubmittedAt: string | null; // client sent screenshot
  receiptPrepaymentPaidAt: string | null;      // operator confirmed
  receiptToken: string | null;
  hoursWithoutEstimate: number | null;
  hoursWithoutPayment: number | null;
  problemReasons: string[];
  commissionPaid: boolean;
  transactionInfo: {
    orderAmount: number;
    commission: number;
    prepaymentDeducted: number;
    paymentStatus: string;
    paidAt: string | null;
  } | null;
};

// GET /api/work-monitor
router.get("/", requireAuth, async (_req, res) => {
  const now = Date.now();

  try {
    // Fetch active orders
    const orders = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          inArray(ordersTable.status, ["master_assigned", "in_progress", "cancellation_requested"]),
          isNull(ordersTable.deletedAt)
        )
      );

    if (orders.length === 0) return res.json([]);

    const masterIds = [...new Set(orders.map(o => o.masterId).filter(id => id != null))];
    const leadIds = [...new Set(orders.map(o => o.leadId).filter(id => id != null))];
    const orderIds = orders.map(o => o.id);

    const [masters, leads, receipts, transactions] = await Promise.all([
      masterIds.length > 0
        ? db.select({
            id: mastersTable.id,
            alias: mastersTable.alias,
            phone: mastersTable.phone,
            maxChatId: mastersTable.maxChatId,
            fomoDisabled: mastersTable.fomoDisabled,
          }).from(mastersTable).where(inArray(mastersTable.id, masterIds))
        : Promise.resolve([]),
      leadIds.length > 0
        ? db.select({
            id: leadsTable.id,
            clientName: leadsTable.clientName,
            clientPhone: leadsTable.clientPhone,
          }).from(leadsTable).where(inArray(leadsTable.id, leadIds))
        : Promise.resolve([]),
      db.select().from(receiptsTable).where(inArray(receiptsTable.orderId, orderIds)),
      db.select({
        orderId: transactionsTable.orderId,
        paymentStatus: transactionsTable.paymentStatus,
        commission: transactionsTable.commission,
        prepaymentDeducted: transactionsTable.prepaymentDeducted,
        orderAmount: transactionsTable.orderAmount,
        paidAt: transactionsTable.paidAt,
      }).from(transactionsTable).where(inArray(transactionsTable.orderId, orderIds)),
    ]);

    // Map orderIds to commission payment status
    const txByOrder = new Map<number, typeof transactions>();
    for (const tx of transactions) {
      const arr = txByOrder.get(tx.orderId) ?? [];
      arr.push(tx);
      txByOrder.set(tx.orderId, arr);
    }

    const masterMap = new Map(masters.map(m => [m.id, m]));
    const leadMap = new Map(leads.map(l => [l.id, l]));
    // Latest receipt per order
    const receiptMap = new Map<number, typeof receipts[0]>();
    for (const r of receipts) {
      const existing = receiptMap.get(r.orderId);
      if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
        receiptMap.set(r.orderId, r);
      }
    }

    const result: WorkOrder[] = orders.map(o => {
      const master = o.masterId ? masterMap.get(o.masterId) : null;
      const lead = leadMap.get(o.leadId);
      const receipt = receiptMap.get(o.id) ?? null;

      // Time since master was assigned (or order created as fallback)
      // Do NOT gate on masterId — orders with null masterId still need monitoring
      const assignedMs = o.assignedAt
        ? new Date(o.assignedAt).getTime()
        : o.updatedAt
          ? new Date(o.updatedAt).getTime()
          : new Date(o.createdAt).getTime();

      const hoursWithoutEstimate = !receipt
        ? Math.floor((now - assignedMs) / 3_600_000)
        : null;

      // hoursWithoutPayment: time since receipt created (if operator hasn't confirmed yet)
      const receiptCreatedMs = receipt && !receipt.prepaymentSeenAt
        ? new Date(receipt.createdAt).getTime()
        : null;
      const hoursWithoutPayment = receiptCreatedMs
        ? Math.floor((now - receiptCreatedMs) / 3_600_000)
        : null;

      const updatedMs = o.updatedAt ? new Date(o.updatedAt).getTime() : null;
      const daysSinceUpdate = updatedMs ? (now - updatedMs) / 86_400_000 : null;

      // Determine commissionPaid early so we can use it for problemReasons
      const commissionPaid = (() => {
        const txs = txByOrder.get(o.id) ?? [];
        if (txs.length === 0) return false;
        const real = txs.filter(t => safeNumber(t.commission) > 0);
        if (real.length === 0) return false;
        return real.every(t => t.paymentStatus === "paid");
      })();

      const problemReasons: string[] = [];
      if (hoursWithoutEstimate !== null && hoursWithoutEstimate >= 48) {
        problemReasons.push(`🔴 Без сметы ${Math.floor(hoursWithoutEstimate / 24)}д ${hoursWithoutEstimate % 24}ч`);
      }
      if (hoursWithoutPayment !== null && hoursWithoutPayment >= 48) {
        const payLabel = receipt?.prepaymentSubmittedAt
          ? `🔴 Не подтверждено ${Math.floor(hoursWithoutPayment / 24)}д ${hoursWithoutPayment % 24}ч`
          : `🔴 Без оплаты ${Math.floor(hoursWithoutPayment / 24)}д ${hoursWithoutPayment % 24}ч`;
        problemReasons.push(payLabel);
      }
      // Don't flag "no updates" as a problem if commission is already paid — order is financially settled
      if (daysSinceUpdate !== null && daysSinceUpdate >= 7 && !commissionPaid) {
        problemReasons.push(`🔴 Нет обновлений ${Math.floor(daysSinceUpdate)} дн.`);
      }

      // Transaction info for this order (from finance)
      const transactionInfo = (() => {
        const txs = txByOrder.get(o.id) ?? [];
        const real = txs.find(t => safeNumber(t.commission) > 0);
        if (!real) return null;
        return {
          orderAmount: safeNumber(real.orderAmount),
          commission: safeNumber(real.commission),
          prepaymentDeducted: safeNumber(real.prepaymentDeducted, 0),
          paymentStatus: real.paymentStatus,
          paidAt: real.paidAt ? real.paidAt.toISOString() : null,
        };
      })();

      return {
        id: o.id,
        leadId: o.leadId,
        status: o.status,
        city: o.city,
        district: o.district,
        serviceType: o.serviceType,
        area: safeNumber(o.area),
        commission: o.commission ? safeNumber(o.commission) : null,
        proposedAmount: (o as any).proposedAmount ? safeNumber((o as any).proposedAmount) : null,
        assignedAt: o.assignedAt ? o.assignedAt.toISOString() : null,
        updatedAt: o.updatedAt ? o.updatedAt.toISOString() : null,
        masterId: o.masterId ?? null,
        masterAlias: master?.alias ?? null,
        masterPhone: master?.phone ?? null,
        masterMaxChatId: master?.maxChatId ?? null,
        masterFomoDisabled: master?.fomoDisabled ?? false,
        clientName: lead?.clientName ?? null,
        clientPhone: lead?.clientPhone ?? null,
        receiptId: receipt?.id ?? null,
        receiptTotalAmount: receipt ? safeNumber(receipt.totalAmount) : null,
        receiptPrepaymentAmount: receipt ? safeNumber(receipt.prepaymentAmount) : null,
        receiptCreatedAt: receipt ? receipt.createdAt.toISOString() : null,
        receiptPrepaymentSubmittedAt: receipt?.prepaymentSubmittedAt
          ? receipt.prepaymentSubmittedAt.toISOString()
          : null,
        receiptPrepaymentPaidAt: receipt?.prepaymentSeenAt
          ? receipt.prepaymentSeenAt.toISOString()
          : null,
        receiptToken: receipt?.token ?? null,
        hoursWithoutEstimate,
        hoursWithoutPayment,
        problemReasons,
        commissionPaid,
        transactionInfo,
      };
    });

    res.json(result);
  } catch (e) {
    console.error("[work-monitor] GET error:", e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/work-monitor/complete-order/:id — operator completes order on behalf of master
router.post("/complete-order/:id", requireAuth, operatorRoles, async (req, res) => {
  const orderId = parseInt(req.params.id);
  if (isNaN(orderId) || orderId <= 0) return res.status(400).json({ error: "Неверный ID заказа" });

  try {
    // Check order exists and is active
    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.deletedAt)));
    if (!order) return res.status(404).json({ error: "Заказ не найден" });

    const activeStatuses = ["master_assigned", "in_progress", "cancellation_requested"];
    if (!activeStatuses.includes(order.status)) {
      return res.status(400).json({ error: `Заказ уже ${order.status === "completed" ? "завершён" : "отменён"}` });
    }

    // Check commission is fully paid
    const txs = await db.select({
      id: transactionsTable.id,
      commission: transactionsTable.commission,
      paymentStatus: transactionsTable.paymentStatus,
    }).from(transactionsTable).where(eq(transactionsTable.orderId, orderId));

    const realTxs = txs.filter(t => safeNumber(t.commission) > 0);
    if (realTxs.length === 0) {
      return res.status(400).json({ error: "По заказу нет транзакций с комиссией. Сначала подтвердите сумму заказа." });
    }
    const unpaid = realTxs.filter(t => t.paymentStatus !== "paid");
    if (unpaid.length > 0) {
      return res.status(400).json({ error: "Комиссия ещё не оплачена. Завершить заказ можно только после полной оплаты комиссии." });
    }

    // Complete the order
    await db.update(ordersTable).set({
      status: "completed",
      masterWorkStatus: "completed",
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, orderId));

    // Репутация: сбрасываем счётчик подряд отменённых при ручном завершении
    if (order.masterId) {
      const { recordOrderCompleted } = await import("../lib/masterReputation.js");
      await recordOrderCompleted(order.masterId).catch(e =>
        console.error("[work-monitor] recordOrderCompleted error:", e),
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("[work-monitor] complete-order error:", e);
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/work-monitor/notify-master — send reminder via Max + save to dialog
router.post("/notify-master", requireAuth, operatorRoles, async (req, res) => {
  const { masterId, text } = req.body as { masterId: unknown; text: unknown };
  if (typeof masterId !== 'number' || isNaN(masterId) || masterId <= 0) {
    return res.status(400).json({ error: "masterId must be a positive integer" });
  }
  if (typeof text !== 'string' || text.length === 0) {
    return res.status(400).json({ error: "text must be a non-empty string" });
  }
  if (text.length > 4096) {
    return res.status(400).json({ error: "Text too long (max 4096 characters)" });
  }

  try {
    const [master] = await db
      .select({ maxChatId: mastersTable.maxChatId, telegramId: mastersTable.telegramId })
      .from(mastersTable)
      .where(eq(mastersTable.id, masterId));

    if (!master) return res.status(404).json({ error: "Master not found" });
    if (!master.maxChatId) return res.status(404).json({ error: "Master has no Max chat" });

    const { sendMaxMessage } = await import("../maxBot.js");
    await sendMaxMessage(master.maxChatId, text);

    // Save to master dialog so it appears in CRM chat
    const chatId = master.maxChatId ?? master.telegramId ?? String(masterId);
    const senderName = (req as any).user?.username ?? "Оператор";
    await db.insert(masterMessagesTable).values({
      masterId,
      telegramChatId: chatId,
      text,
      fromMaster: false,
      senderName,
      isRead: true,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("[work-monitor] notify-master error:", e);
    res.status(500).json({ error: String(e) });
  }
});

export default router;
