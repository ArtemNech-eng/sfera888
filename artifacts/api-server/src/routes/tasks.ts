import { Router } from "express";
import { db, systemTasksTable, mastersTable, ordersTable } from "@workspace/db";
import { eq, desc, and, ne, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const opsAndAdmin = requireRole("admin", "master_operator", "lead_operator");

router.get("/", opsAndAdmin, async (req, res) => {
  const { status, category, priority, assignedTo } = req.query;

  let tasks = await db.select().from(systemTasksTable).orderBy(desc(systemTasksTable.createdAt));

  if (status) tasks = tasks.filter(t => t.status === status);
  if (category) tasks = tasks.filter(t => t.category === category);
  if (priority) tasks = tasks.filter(t => t.priority === priority);
  if (assignedTo) tasks = tasks.filter(t => t.assignedTo === assignedTo);

  const masters = await db.select({ id: mastersTable.id, alias: mastersTable.alias }).from(mastersTable).where(isNull(mastersTable.deletedAt));
  const orders = await db.select({ id: ordersTable.id, serviceType: ordersTable.serviceType, city: ordersTable.city }).from(ordersTable).where(isNull(ordersTable.deletedAt));

  const masterMap = new Map(masters.map(m => [m.id, m.alias]));
  const orderMap = new Map(orders.map(o => [o.id, `#${o.id} ${o.serviceType} (${o.city})`]));

  res.json(tasks.map(t => ({
    ...t,
    masterAlias: t.relatedMasterId ? (masterMap.get(t.relatedMasterId) ?? null) : null,
    orderLabel: t.relatedOrderId ? (orderMap.get(t.relatedOrderId) ?? null) : null,
  })));
});

router.get("/stats", opsAndAdmin, async (req, res) => {
  const tasks = await db.select().from(systemTasksTable);
  const open = tasks.filter(t => t.status === "open" || t.status === "in_progress").length;
  const urgent = tasks.filter(t => (t.status === "open" || t.status === "in_progress") && t.priority === "urgent").length;
  const done = tasks.filter(t => t.status === "done").length;
  res.json({ open, urgent, done, total: tasks.length });
});

router.post("/", opsAndAdmin, async (req: any, res) => {
  const {
    title, description, priority, category,
    assignedTo, relatedMasterId, relatedOrderId,
    dueAt, aiReason, type,
  } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: "Название обязательно" });

  const [task] = await db.insert(systemTasksTable).values({
    title: title.trim(),
    description: description?.trim() || null,
    type: type ?? "manual",
    status: "open",
    priority: priority ?? "medium",
    category: category ?? "general",
    assignedTo: assignedTo ?? null,
    relatedMasterId: relatedMasterId ? parseInt(relatedMasterId) : null,
    relatedOrderId: relatedOrderId ? parseInt(relatedOrderId) : null,
    dueAt: dueAt ? new Date(dueAt) : null,
    aiReason: aiReason ?? null,
    createdBy: req.user?.login ?? "system",
    updatedAt: new Date(),
  }).returning();

  res.status(201).json(task);
});

router.patch("/:id", opsAndAdmin, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const { status, title, description, priority, category, assignedTo, dueAt } = req.body;

  const updates: any = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description || null;
  if (priority !== undefined) updates.priority = priority;
  if (category !== undefined) updates.category = category;
  if (assignedTo !== undefined) updates.assignedTo = assignedTo || null;
  if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : null;
  if (status !== undefined) {
    updates.status = status;
    if (status === "done") {
      updates.completedAt = new Date();
      updates.completedBy = req.user?.login ?? "system";
    } else {
      updates.completedAt = null;
      updates.completedBy = null;
    }
  }

  const [updated] = await db.update(systemTasksTable).set(updates).where(eq(systemTasksTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Задача не найдена" });
  res.json(updated);
});

router.delete("/:id", opsAndAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [deleted] = await db.delete(systemTasksTable).where(eq(systemTasksTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ error: "Задача не найдена" });
  res.json({ ok: true });
});

export default router;
