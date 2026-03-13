import { Router } from "express";
import { db, mastersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const allMasterRoles = requireRole("admin", "master_operator");

router.get("/", allMasterRoles, async (req, res) => {
  const masters = await db.select().from(mastersTable).orderBy(mastersTable.createdAt);
  res.json(masters.map(m => ({
    id: m.id,
    alias: m.alias,
    city: m.city,
    specialization: m.specialization,
    telegramId: m.telegramId ?? null,
    status: m.status,
    rating: Number(m.rating),
    totalOrders: m.totalOrders,
    acceptedOrders: m.acceptedOrders,
    avgResponseTime: m.avgResponseTime ? Number(m.avgResponseTime) : null,
    debt: Number(m.debt),
    createdAt: m.createdAt,
  })));
});

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
  const m = result[0];
  return res.status(201).json({
    id: m.id,
    alias: m.alias,
    city: m.city,
    specialization: m.specialization,
    telegramId: m.telegramId ?? null,
    status: m.status,
    rating: Number(m.rating),
    totalOrders: m.totalOrders,
    acceptedOrders: m.acceptedOrders,
    avgResponseTime: m.avgResponseTime ? Number(m.avgResponseTime) : null,
    debt: Number(m.debt),
    createdAt: m.createdAt,
  });
});

router.get("/:id", allMasterRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  if (!rows[0]) return res.status(404).json({ error: "Master not found" });
  const m = rows[0];
  res.json({
    id: m.id,
    alias: m.alias,
    city: m.city,
    specialization: m.specialization,
    telegramId: m.telegramId ?? null,
    status: m.status,
    rating: Number(m.rating),
    totalOrders: m.totalOrders,
    acceptedOrders: m.acceptedOrders,
    avgResponseTime: m.avgResponseTime ? Number(m.avgResponseTime) : null,
    debt: Number(m.debt),
    createdAt: m.createdAt,
  });
});

router.patch("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { alias, city, specialization, telegramId, phone, status } = req.body;
  const updates: any = {};
  if (alias !== undefined) updates.alias = alias;
  if (city !== undefined) updates.city = city;
  if (specialization !== undefined) updates.specialization = specialization;
  if (telegramId !== undefined) updates.telegramId = telegramId;
  if (phone !== undefined) updates.phone = phone;
  if (status !== undefined) updates.status = status;

  const result = await db.update(mastersTable).set(updates).where(eq(mastersTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Master not found" });
  const m = result[0];
  res.json({
    id: m.id,
    alias: m.alias,
    city: m.city,
    specialization: m.specialization,
    telegramId: m.telegramId ?? null,
    status: m.status,
    rating: Number(m.rating),
    totalOrders: m.totalOrders,
    acceptedOrders: m.acceptedOrders,
    avgResponseTime: m.avgResponseTime ? Number(m.avgResponseTime) : null,
    debt: Number(m.debt),
    createdAt: m.createdAt,
  });
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(mastersTable).where(eq(mastersTable.id, id));
  res.json({ success: true, message: "Master deleted" });
});

export default router;
