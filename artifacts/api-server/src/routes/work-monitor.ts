import { Router } from "express";
import { db, ordersTable, mastersTable, leadsTable, receiptsTable } from "@workspace/db";
import { inArray, isNull, eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();

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
};

// GET /api/work-monitor
router.get("/", requireAuth, async (_req, res) => {
  const now = Date.now();

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

  const masterIds = [...new Set(orders.filter(o => o.masterId).map(o => o.masterId!))];
  const leadIds = [...new Set(orders.map(o => o.leadId))];
  const orderIds = orders.map(o => o.id);

  const [masters, leads, receipts] = await Promise.all([
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
  ]);

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

    // Use assignedAt, falling back to updatedAt then createdAt for orders
    // that have a master but were assigned via an old code path
    const assignedMs = o.masterId
      ? (o.assignedAt
          ? new Date(o.assignedAt).getTime()
          : o.updatedAt
            ? new Date(o.updatedAt).getTime()
            : new Date(o.createdAt).getTime())
      : null;

    const hoursWithoutEstimate = !receipt && assignedMs !== null
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
    if (daysSinceUpdate !== null && daysSinceUpdate >= 7) {
      problemReasons.push(`🔴 Нет обновлений ${Math.floor(daysSinceUpdate)} дн.`);
    }

    return {
      id: o.id,
      leadId: o.leadId,
      status: o.status,
      city: o.city,
      district: o.district,
      serviceType: o.serviceType,
      area: Number(o.area),
      commission: o.commission ? Number(o.commission) : null,
      proposedAmount: (o as any).proposedAmount ? Number((o as any).proposedAmount) : null,
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
      receiptTotalAmount: receipt ? Number(receipt.totalAmount) : null,
      receiptPrepaymentAmount: receipt ? Number(receipt.prepaymentAmount) : null,
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
    };
  });

  res.json(result);
});

// POST /api/work-monitor/notify-master — send reminder via Max
router.post("/notify-master", requireAuth, async (req, res) => {
  const { masterId, text } = req.body;
  if (!masterId || !text) return res.status(400).json({ error: "masterId and text required" });

  const [master] = await db
    .select({ maxChatId: mastersTable.maxChatId })
    .from(mastersTable)
    .where(eq(mastersTable.id, masterId));

  if (!master?.maxChatId) return res.status(404).json({ error: "Master has no Max chat" });

  const { sendMaxMessage } = await import("../maxBot.js");
  await sendMaxMessage(master.maxChatId, text);

  res.json({ ok: true });
});

export default router;
