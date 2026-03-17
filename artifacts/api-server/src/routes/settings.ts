import { Router } from "express";
import { db, citiesTable, serviceTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getCommissionSettings, saveCommissionSettings } from "../lib/commission.js";

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
  try {
    const result = await db.insert(citiesTable).values({ name }).returning();
    res.status(201).json(result[0]);
  } catch (e: any) {
    if (e.code === "23505") return res.status(409).json({ error: "Такой город уже существует" });
    throw e;
  }
});

router.delete("/cities/:id", adminOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(citiesTable).where(eq(citiesTable.id, id));
  res.json({ success: true, message: "City deleted" });
});

// Services — public read (used by master PWA for specialization picker)
router.get("/services", async (req, res) => {
  const services = await db.select().from(serviceTypesTable).orderBy(serviceTypesTable.name);
  res.json(services);
});

router.post("/services", adminOnly, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const result = await db.insert(serviceTypesTable).values({ name }).returning();
    res.status(201).json(result[0]);
  } catch (e: any) {
    if (e.code === "23505") return res.status(409).json({ error: "Такая услуга уже существует" });
    throw e;
  }
});

router.delete("/services/:id", adminOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(serviceTypesTable).where(eq(serviceTypesTable.id, id));
  res.json({ success: true, message: "Service deleted" });
});

// Commission settings
router.get("/commission", requireAuth, async (_req, res) => {
  const settings = await getCommissionSettings();
  res.json(settings);
});

router.patch("/commission", adminOnly, async (req, res) => {
  const { tier1Threshold, tier1Fixed, tier2Threshold, tier2Pct, tier3Pct } = req.body;
  const current = await getCommissionSettings();
  const updated = {
    tier1Threshold: tier1Threshold !== undefined ? Number(tier1Threshold) : current.tier1Threshold,
    tier1Fixed: tier1Fixed !== undefined ? Number(tier1Fixed) : current.tier1Fixed,
    tier2Threshold: tier2Threshold !== undefined ? Number(tier2Threshold) : current.tier2Threshold,
    tier2Pct: tier2Pct !== undefined ? Number(tier2Pct) : current.tier2Pct,
    tier3Pct: tier3Pct !== undefined ? Number(tier3Pct) : current.tier3Pct,
  };
  if (
    updated.tier1Threshold <= 0 || updated.tier1Fixed <= 0 ||
    updated.tier2Threshold <= updated.tier1Threshold ||
    updated.tier2Pct <= 0 || updated.tier3Pct <= 0
  ) {
    return res.status(400).json({ error: "Некорректные значения" });
  }
  await saveCommissionSettings(updated);
  res.json(updated);
});

export default router;
