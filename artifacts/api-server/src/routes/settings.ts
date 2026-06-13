import { Router } from "express";
import { db, citiesTable, serviceTypesTable, systemSettingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getCommissionSettings, saveCommissionSettings } from "../lib/commission.js";

const router = Router();
const adminOnly = requireRole("admin");

// Cities — public read (used by master PWA for city picker on registration)
router.get("/cities", async (_req, res) => {
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
  const id = parseInt(String(req.params.id));
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
  const id = parseInt(String(req.params.id));
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

// ─── Token packages, service prices, rules, price history, multipliers ─────────
// All token-related settings endpoints removed (Phase C cleanup).
// The CRM token-settings page was deleted; these endpoints were only used by it.

// In-memory payment details (no DB table — stored as JSON file or env override)
let paymentDetailsCache: { bankName: string; cardNumber: string; holder: string; comment: string } | null = null;

// Load from environment variables on startup, fallback to hardcoded defaults
(function loadPaymentDetailsFromEnv() {
  paymentDetailsCache = {
    bankName:    process.env.PAYMENT_BANK_NAME    ?? "Альфа Банк",
    cardNumber:  process.env.PAYMENT_CARD_NUMBER  ?? "89892860863",
    holder:      process.env.PAYMENT_CARD_HOLDER  ?? "Игорь К.",
    comment:     process.env.PAYMENT_COMMENT      ?? "Оплата за токены Сфера",
  };
  console.log("[settings] Payment details loaded");
})();

// GET /api/settings/payment-details — реквизиты оплаты (доступно мастерам и админам)
router.get("/payment-details", async (req: any, res) => {
  const userId   = (req.session as any)?.userId;
  const masterId = (req.session as any)?.masterId;
  if (!userId && !masterId) return res.status(401).json({ error: "Не авторизован" });
  if (!paymentDetailsCache?.cardNumber) return res.json(null);
  res.json(paymentDetailsCache);
});

// PUT /api/settings/payment-details — сохранить реквизиты (admin)
router.put("/payment-details", adminOnly, async (req: any, res: any) => {
  const { bankName, cardNumber, holder, comment } = req.body;
  if (!bankName || !cardNumber || !holder) {
    return res.status(400).json({ error: "bankName, cardNumber, holder обязательны" });
  }
  paymentDetailsCache = { bankName, cardNumber, holder, comment: comment ?? "" };
  res.json({ success: true });
});

// ─── AI Dispatcher toggle ────────────────────────────────────────────────────

// GET /api/settings/ai-dispatcher — read current state (default true)
router.get("/ai-dispatcher", requireAuth, async (_req, res) => {
  const rows = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "ai_dispatcher_enabled"));
  const enabled = rows[0] ? rows[0].value === "true" : true;
  res.json({ enabled });
});

// PUT /api/settings/ai-dispatcher — toggle (admin only)
router.put("/ai-dispatcher", adminOnly, async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be boolean" });
  }
  await db.insert(systemSettingsTable)
    .values({ key: "ai_dispatcher_enabled", value: String(enabled), updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(enabled), updatedAt: new Date() } });
  res.json({ enabled });
});

// ─── City token multipliers — removed (Phase C cleanup) ─────────────────────

export default router;
