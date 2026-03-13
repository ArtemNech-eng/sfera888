import { Router } from "express";
import { db, citiesTable, serviceTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();
const adminOnly = requireRole("admin");

// Cities
router.get("/cities", requireAuth, async (req, res) => {
  const cities = await db.select().from(citiesTable).orderBy(citiesTable.name);
  res.json(cities);
});

router.post("/cities", adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const result = await db.insert(citiesTable).values({ name }).returning();
  res.status(201).json(result[0]);
});

router.delete("/cities/:id", adminOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(citiesTable).where(eq(citiesTable.id, id));
  res.json({ success: true, message: "City deleted" });
});

// Services
router.get("/services", requireAuth, async (req, res) => {
  const services = await db.select().from(serviceTypesTable).orderBy(serviceTypesTable.name);
  res.json(services);
});

router.post("/services", adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const result = await db.insert(serviceTypesTable).values({ name }).returning();
  res.status(201).json(result[0]);
});

router.delete("/services/:id", adminOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(serviceTypesTable).where(eq(serviceTypesTable.id, id));
  res.json({ success: true, message: "Service deleted" });
});

export default router;
