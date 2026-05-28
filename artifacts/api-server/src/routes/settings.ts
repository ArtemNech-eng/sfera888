import { Router } from "express";
import { db, citiesTable, serviceTypesTable, tokenPackagesTable, serviceTokenPricesTable, serviceTokenRulesTable, tokenPriceHistoryTable, systemSettingsTable } from "@workspace/db";
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

// ─── Token packages ────────────────────────────────────────────────────────────

router.get("/token-packages", requireAuth, async (req: any, res: any) => {
  const activeOnly = req.query.active === "true";
  const rows = await db
    .select()
    .from(tokenPackagesTable)
    .orderBy(tokenPackagesTable.sortOrder);
  const result = activeOnly ? rows.filter(r => r.isActive) : rows;
  res.json(result);
});

router.post("/token-packages", adminOnly, async (req: any, res: any) => {
  const { name, tokens_count, price_rub, sort_order } = req.body;
  if (!name || !tokens_count || !price_rub) {
    return res.status(400).json({ error: "name, tokens_count, price_rub обязательны" });
  }
  const tokensNum = Number(tokens_count);
  const priceNum = Number(price_rub);
  if (isNaN(tokensNum) || tokensNum <= 0 || isNaN(priceNum) || priceNum <= 0) {
    return res.status(400).json({ error: "Некорректные числовые значения" });
  }
  const pricePerToken = (priceNum / tokensNum).toFixed(2);
  const [pkg] = await db
    .insert(tokenPackagesTable)
    .values({
      name,
      tokensCount: String(tokensNum),
      priceRub: priceNum,
      pricePerToken,
      sortOrder: sort_order ?? 0,
    })
    .returning();
  res.status(201).json(pkg);
});

router.patch("/token-packages/:id", adminOnly, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный id" });

  const existing = await db.select().from(tokenPackagesTable).where(eq(tokenPackagesTable.id, id)).limit(1);
  if (!existing.length) return res.status(404).json({ error: "Пакет не найден" });

  const old = existing[0];
  const fields: any = { updatedAt: new Date() };
  const historyRows: any[] = [];
  const changedBy = (req as any).user?.name ?? "admin";

  if (req.body.name !== undefined && req.body.name !== old.name) {
    historyRows.push({ entityType: "package", entityId: id, fieldName: "name", oldValue: old.name, newValue: req.body.name, changedBy });
    fields.name = req.body.name;
  }
  if (req.body.tokens_count !== undefined) {
    const v = String(Number(req.body.tokens_count));
    if (v !== old.tokensCount) {
      historyRows.push({ entityType: "package", entityId: id, fieldName: "tokens_count", oldValue: old.tokensCount, newValue: v, changedBy });
      fields.tokensCount = v;
    }
  }
  if (req.body.price_rub !== undefined) {
    const v = Number(req.body.price_rub);
    if (v !== old.priceRub) {
      historyRows.push({ entityType: "package", entityId: id, fieldName: "price_rub", oldValue: String(old.priceRub), newValue: String(v), changedBy });
      fields.priceRub = v;
    }
  }
  if (req.body.is_active !== undefined && req.body.is_active !== old.isActive) {
    historyRows.push({ entityType: "package", entityId: id, fieldName: "is_active", oldValue: String(old.isActive), newValue: String(req.body.is_active), changedBy });
    fields.isActive = req.body.is_active;
  }

  // Recalculate pricePerToken if relevant fields changed
  const newTokens = Number(fields.tokensCount ?? old.tokensCount);
  const newPrice = Number(fields.priceRub ?? old.priceRub);
  fields.pricePerToken = (newPrice / newTokens).toFixed(2);

  const [updated] = await db.update(tokenPackagesTable).set(fields).where(eq(tokenPackagesTable.id, id)).returning();

  if (historyRows.length > 0) {
    await db.insert(tokenPriceHistoryTable).values(historyRows);
  }

  res.json(updated);
});

router.delete("/token-packages/:id", adminOnly, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный id" });
  await db.update(tokenPackagesTable).set({ isActive: false, updatedAt: new Date() }).where(eq(tokenPackagesTable.id, id));
  res.json({ success: true });
});

// ─── Service token prices ──────────────────────────────────────────────────────

router.get("/service-token-prices", requireAuth, async (_req: any, res: any) => {
  const rows = await db.select().from(serviceTokenPricesTable).orderBy(serviceTokenPricesTable.sortOrder);
  res.json(rows);
});

router.post("/service-token-prices", adminOnly, async (req: any, res: any) => {
  const { service_name, service_key, tokens_cost, sort_order } = req.body;
  if (!service_name || !service_key || tokens_cost === undefined) {
    return res.status(400).json({ error: "service_name, service_key, tokens_cost обязательны" });
  }
  try {
    const [row] = await db
      .insert(serviceTokenPricesTable)
      .values({
        serviceName: service_name,
        serviceKey: service_key,
        tokensCost: String(Number(tokens_cost)),
        sortOrder: sort_order ?? 0,
      })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e.code === "23505") return res.status(409).json({ error: "Ключ service_key уже существует" });
    throw e;
  }
});

router.patch("/service-token-prices/:id", adminOnly, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный id" });

  const existing = await db.select().from(serviceTokenPricesTable).where(eq(serviceTokenPricesTable.id, id)).limit(1);
  if (!existing.length) return res.status(404).json({ error: "Услуга не найдена" });

  const old = existing[0];
  const fields: any = { updatedAt: new Date() };
  const historyRows: any[] = [];
  const changedBy = (req as any).user?.name ?? "admin";

  if (req.body.service_name !== undefined && req.body.service_name !== old.serviceName) {
    historyRows.push({ entityType: "service_price", entityId: id, fieldName: "service_name", oldValue: old.serviceName, newValue: req.body.service_name, changedBy });
    fields.serviceName = req.body.service_name;
  }
  if (req.body.tokens_cost !== undefined) {
    const v = String(Number(req.body.tokens_cost));
    if (v !== old.tokensCost) {
      historyRows.push({ entityType: "service_price", entityId: id, fieldName: "tokens_cost", oldValue: old.tokensCost, newValue: v, changedBy });
      fields.tokensCost = v;
    }
  }
  if (req.body.is_active !== undefined && req.body.is_active !== old.isActive) {
    historyRows.push({ entityType: "service_price", entityId: id, fieldName: "is_active", oldValue: String(old.isActive), newValue: String(req.body.is_active), changedBy });
    fields.isActive = req.body.is_active;
  }

  const [updated] = await db.update(serviceTokenPricesTable).set(fields).where(eq(serviceTokenPricesTable.id, id)).returning();

  if (historyRows.length > 0) {
    await db.insert(tokenPriceHistoryTable).values(historyRows);
  }

  res.json(updated);
});

router.delete("/service-token-prices/:id", adminOnly, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный id" });
  await db.update(serviceTokenPricesTable).set({ isActive: false, updatedAt: new Date() }).where(eq(serviceTokenPricesTable.id, id));
  res.json({ success: true });
});

// ─── Service token rules (area-based pricing) ────────────────────────────────

router.get("/service-token-rules", adminOnly, async (_req: any, res: any) => {
  const rows = await db
    .select()
    .from(serviceTokenRulesTable)
    .orderBy(serviceTokenRulesTable.serviceKey, serviceTokenRulesTable.sortOrder);
  res.json(rows);
});

router.post("/service-token-rules", adminOnly, async (req: any, res: any) => {
  const { service_key, title, calc_type, min_area, max_area, tokens_cost, sort_order } = req.body;
  if (!service_key || !title || calc_type === undefined || tokens_cost === undefined) {
    return res.status(400).json({ error: "service_key, title, calc_type, tokens_cost обязательны" });
  }
  const [inserted] = await db.insert(serviceTokenRulesTable).values({
    serviceKey: service_key,
    title,
    calcType: calc_type,
    minArea: min_area != null ? String(min_area) : null,
    maxArea: max_area != null ? String(max_area) : null,
    tokensCost: String(tokens_cost),
    sortOrder: sort_order ?? 0,
  }).returning();
  res.status(201).json(inserted);
});

router.put("/service-token-rules/:id", adminOnly, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный id" });

  const old = await db.select().from(serviceTokenRulesTable).where(eq(serviceTokenRulesTable.id, id)).limit(1);
  if (!old.length) return res.status(404).json({ error: "Правило не найдено" });

  const fields: any = {};
  if (req.body.service_key !== undefined) fields.serviceKey = req.body.service_key;
  if (req.body.title !== undefined) fields.title = req.body.title;
  if (req.body.calc_type !== undefined) fields.calcType = req.body.calc_type;
  if (req.body.min_area !== undefined) fields.minArea = req.body.min_area != null ? String(req.body.min_area) : null;
  if (req.body.max_area !== undefined) fields.maxArea = req.body.max_area != null ? String(req.body.max_area) : null;
  if (req.body.tokens_cost !== undefined) fields.tokensCost = String(req.body.tokens_cost);
  if (req.body.is_active !== undefined) fields.isActive = req.body.is_active;
  if (req.body.sort_order !== undefined) fields.sortOrder = req.body.sort_order;

  const [updated] = await db.update(serviceTokenRulesTable).set(fields).where(eq(serviceTokenRulesTable.id, id)).returning();
  res.json(updated);
});

router.delete("/service-token-rules/:id", adminOnly, async (req: any, res: any) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный id" });
  await db.update(serviceTokenRulesTable).set({ isActive: false }).where(eq(serviceTokenRulesTable.id, id));
  res.json({ success: true });
});

// ─── Token price history ───────────────────────────────────────────────────────

router.get("/token-price-history", adminOnly, async (_req: any, res: any) => {
  const rows = await db
    .select()
    .from(tokenPriceHistoryTable)
    .orderBy(desc(tokenPriceHistoryTable.createdAt))
    .limit(200);
  res.json(rows);
});

// GET /api/settings/token-packages/public — активные пакеты (без авторизации, для PWA)
router.get("/token-packages/public", async (_req, res) => {
  const rows = await db
    .select()
    .from(tokenPackagesTable)
    .where(eq(tokenPackagesTable.isActive, true))
    .orderBy(tokenPackagesTable.sortOrder);
  res.json(rows.map(r => ({
    id: r.id,
    name: r.name,
    tokens_count: Number(r.tokensCount),
    price_rub: r.priceRub,
    price_per_token: Number(r.pricePerToken),
  })));
});

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

export default router;
