import { Router } from "express";
import { db, ordersTable, mastersTable, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { calculateCommission } from "../lib/auth.js";

const router = Router();
const allOrderRoles = requireRole("admin", "master_operator");

router.get("/", allOrderRoles, async (req, res) => {
  const { status } = req.query;
  let orders;
  if (status) {
    orders = await db.select().from(ordersTable).where(eq(ordersTable.status, status as any));
  } else {
    orders = await db.select().from(ordersTable).orderBy(ordersTable.createdAt);
  }

  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

  res.json(orders.map(o => ({
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
    masterName: o.masterId ? (masterMap.get(o.masterId)?.alias ?? null) : null,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    clientRating: o.clientRating ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  })));
});

router.get("/:id", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!rows[0]) return res.status(404).json({ error: "Order not found" });
  const o = rows[0];
  let masterName: string | null = null;
  if (o.masterId) {
    const m = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    masterName = m[0]?.alias ?? null;
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
    masterName,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    clientRating: o.clientRating ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  });
});

router.patch("/:id", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, orderAmount, commission, clientRating } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (orderAmount !== undefined) updates.orderAmount = orderAmount !== null ? String(orderAmount) : null;
  if (commission !== undefined) updates.commission = commission !== null ? String(commission) : null;
  if (clientRating !== undefined) updates.clientRating = clientRating;

  const result = await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Order not found" });
  const o = result[0];
  let masterName: string | null = null;
  if (o.masterId) {
    const m = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    masterName = m[0]?.alias ?? null;
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
    masterName,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    clientRating: o.clientRating ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  });
});

router.post("/:id/assign-master", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { masterId } = req.body;
  if (!masterId) return res.status(400).json({ error: "masterId required" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!masterRows[0]) return res.status(404).json({ error: "Master not found" });
  const master = masterRows[0];

  const result = await db.update(ordersTable).set({
    masterId,
    status: "master_assigned",
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, id)).returning();

  if (!result[0]) return res.status(404).json({ error: "Order not found" });
  const o = result[0];

  // Update master stats
  await db.update(mastersTable).set({
    totalOrders: master.totalOrders + 1,
    acceptedOrders: master.acceptedOrders + 1,
  }).where(eq(mastersTable.id, masterId));

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

export default router;
