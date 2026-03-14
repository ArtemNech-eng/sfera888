import { Router } from "express";
import { db, mastersTable, masterTasksTable, ordersTable, leadsTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const allMasterRoles = requireRole("admin", "master_operator");

function formatMaster(m: any) {
  return {
    id: m.id,
    alias: m.alias,
    city: m.city,
    specialization: m.specialization,
    specializations: m.specializations ?? [],
    tags: m.tags ?? [],
    telegramId: m.telegramId ?? null,
    phone: m.phone ?? null,
    status: m.status,
    rating: Number(m.rating),
    totalOrders: m.totalOrders,
    acceptedOrders: m.acceptedOrders,
    avgResponseTime: m.avgResponseTime ? Number(m.avgResponseTime) : null,
    debt: Number(m.debt),
    voronkaColumnId: m.voronkaColumnId ?? null,
    isTestMaster: m.isTestMaster,
    createdAt: m.createdAt,
  };
}

// GET /api/masters
router.get("/", allMasterRoles, async (_req, res) => {
  const masters = await db.select().from(mastersTable).orderBy(mastersTable.createdAt);
  res.json(masters.map(formatMaster));
});

// POST /api/masters
router.post("/", requireRole("admin"), async (req, res) => {
  const { alias, city, specialization, telegramId, phone } = req.body;
  if (!alias || !city || !specialization) {
    return res.status(400).json({ error: "alias, city, specialization required" });
  }
  const result = await db.insert(mastersTable).values({
    alias, city, specialization,
    telegramId: telegramId ?? null,
    phone: phone ?? null,
  }).returning();
  return res.status(201).json(formatMaster(result[0]));
});

// GET /api/masters/:id
router.get("/:id", allMasterRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  if (!rows[0]) return res.status(404).json({ error: "Master not found" });
  res.json(formatMaster(rows[0]));
});

// PATCH /api/masters/:id
router.patch("/:id", requireRole("admin", "master_operator"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { alias, city, specialization, specializations, telegramId, phone, status, isTestMaster, tags } = req.body;
  const updates: any = {};
  if (alias !== undefined) updates.alias = alias;
  if (city !== undefined) updates.city = city;
  if (specialization !== undefined) updates.specialization = specialization;
  if (specializations !== undefined) updates.specializations = specializations;
  if (telegramId !== undefined) updates.telegramId = telegramId;
  if (phone !== undefined) updates.phone = phone;
  if (status !== undefined) updates.status = status;
  if (isTestMaster !== undefined) updates.isTestMaster = isTestMaster;
  if (tags !== undefined) updates.tags = tags;

  const result = await db.update(mastersTable).set(updates).where(eq(mastersTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Master not found" });
  res.json(formatMaster(result[0]));
});

// DELETE /api/masters/:id
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(mastersTable).where(eq(mastersTable.id, id));
  res.json({ success: true });
});

// ─── Tags ─────────────────────────────────────────────────────────────────────

// PATCH /api/masters/:id/tags — update full tags array
router.patch("/:id/tags", allMasterRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { tags } = req.body;
  if (!Array.isArray(tags)) return res.status(400).json({ error: "tags must be array" });
  const result = await db.update(mastersTable).set({ tags }).where(eq(mastersTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Master not found" });
  res.json({ tags: result[0].tags });
});

// ─── Orders history ───────────────────────────────────────────────────────────

// GET /api/masters/:id/orders
router.get("/:id/orders", allMasterRoles, async (req, res) => {
  const masterId = parseInt(req.params.id);
  const orders = await db.select().from(ordersTable)
    .where(eq(ordersTable.masterId, masterId))
    .orderBy(desc(ordersTable.createdAt));

  const leadIds = [...new Set(orders.map(o => o.leadId).filter(Boolean))];
  const leads = leadIds.length
    ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds))
    : [];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  res.json(orders.map(o => {
    const lead = leadMap.get(o.leadId ?? 0);
    return {
      id: o.id,
      status: o.status,
      serviceType: o.serviceType,
      district: o.district,
      city: o.city,
      clientName: lead?.clientName ?? null,
      clientPhone: lead?.clientPhone ?? null,
      scheduledAt: o.scheduledAt,
      completedAt: o.completedAt,
      createdAt: o.createdAt,
    };
  }));
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

// GET /api/masters/:id/tasks
router.get("/:id/tasks", allMasterRoles, async (req, res) => {
  const masterId = parseInt(req.params.id);
  const tasks = await db.select().from(masterTasksTable)
    .where(eq(masterTasksTable.masterId, masterId))
    .orderBy(masterTasksTable.createdAt);
  res.json(tasks);
});

// POST /api/masters/:id/tasks
router.post("/:id/tasks", allMasterRoles, async (req: any, res) => {
  const masterId = parseInt(req.params.id);
  const { text, dueAt } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  const createdBy = (req.session as any)?.user?.name ?? "Оператор";

  const [task] = await db.insert(masterTasksTable).values({
    masterId,
    text,
    dueAt: dueAt ? new Date(dueAt) : null,
    createdBy,
  }).returning();
  res.status(201).json(task);
});

// PATCH /api/masters/:id/tasks/:taskId
router.patch("/:id/tasks/:taskId", allMasterRoles, async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const { isCompleted, text, dueAt } = req.body;
  const updates: any = {};
  if (isCompleted !== undefined) updates.isCompleted = isCompleted;
  if (text !== undefined) updates.text = text;
  if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : null;

  const [task] = await db.update(masterTasksTable).set(updates)
    .where(eq(masterTasksTable.id, taskId)).returning();
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

// DELETE /api/masters/:id/tasks/:taskId
router.delete("/:id/tasks/:taskId", allMasterRoles, async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  await db.delete(masterTasksTable).where(eq(masterTasksTable.id, taskId));
  res.json({ success: true });
});

export default router;
