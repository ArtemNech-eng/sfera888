import { Router } from "express";
import { db, ordersTable, mastersTable, transactionsTable, voronkaColumnsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { calculateCommission } from "../lib/auth.js";

const router = Router();
const allOrderRoles = requireRole("admin", "master_operator");

// ─── Column helpers ───────────────────────────────────────────────────────────

async function getOnSiteColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  const nonReceiving = cols.filter(c => !c.receivesOrders);
  return nonReceiving.find(c => c.position > 1) ?? nonReceiving[0] ?? null;
}

async function getFreeColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.receivesOrders) ?? null;
}

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

  // Fetch current order to get masterId before update
  const currentRows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!currentRows[0]) return res.status(404).json({ error: "Order not found" });
  const current = currentRows[0];

  const updates: any = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (orderAmount !== undefined) updates.orderAmount = orderAmount !== null ? String(orderAmount) : null;
  if (commission !== undefined) updates.commission = commission !== null ? String(commission) : null;
  if (clientRating !== undefined) updates.clientRating = clientRating;

  const result = await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Order not found" });
  const o = result[0];

  // Auto-move master between voronka columns based on status change
  if (status !== undefined && current.masterId) {
    const masterId = current.masterId;
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
    const master = masterRows[0];
    if (master) {
      if (status === "master_assigned" || status === "in_progress") {
        // Move to "На объекте"
        const onSiteCol = await getOnSiteColumn();
        if (onSiteCol) {
          await db.update(mastersTable).set({ voronkaColumnId: onSiteCol.id }).where(eq(mastersTable.id, masterId));
        }
      } else if (status === "completed" || status === "cancelled") {
        // Move back to "Свободен"
        const freeCol = await getFreeColumn();
        if (freeCol) {
          await db.update(mastersTable).set({ voronkaColumnId: freeCol.id }).where(eq(mastersTable.id, masterId));
        }
      }
    }
  }

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

  // Check if master's column allows receiving orders
  if (master.voronkaColumnId) {
    const colRows = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId));
    if (colRows[0] && !colRows[0].receivesOrders) {
      return res.status(400).json({ error: "Мастер не может принимать заказы в текущем статусе" });
    }
  }

  // Check active order count limits (debt-aware)
  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
  const masterActiveCount = activeOrders.filter(o => o.masterId === masterId).length;
  const masterDebt = Number(master.debt);
  const hasDebt = masterDebt > 0;

  const limit = master.isTestMaster ? 1 : 2;
  if (masterActiveCount >= limit) {
    if (hasDebt) {
      return res.status(400).json({
        error: master.isTestMaster
          ? `Мастер является должником (${masterDebt.toLocaleString("ru")} ₽). В тестовый период лимит — 1 заказ. Сначала необходимо погасить долг.`
          : `Мастер является должником (${masterDebt.toLocaleString("ru")} ₽). Лимит — 2 заказа при наличии долга. Необходимо погасить задолженность для снятия ограничений.`
      });
    }
    return res.status(400).json({
      error: master.isTestMaster
        ? "Тестовый период: мастер может иметь только 1 активный заказ."
        : "Максимум 2 активных заказа на мастера."
    });
  }

  const result = await db.update(ordersTable).set({
    masterId,
    status: "master_assigned",
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, id)).returning();

  if (!result[0]) return res.status(404).json({ error: "Order not found" });
  const o = result[0];

  // Update master stats + move to "На объекте" column automatically
  const onSiteCol = await getOnSiteColumn();
  await db.update(mastersTable).set({
    totalOrders: master.totalOrders + 1,
    acceptedOrders: master.acceptedOrders + 1,
    voronkaColumnId: onSiteCol?.id ?? master.voronkaColumnId,
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
