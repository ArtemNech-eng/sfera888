import { Router } from "express";
import { requireRole } from "../middlewares/requireAuth.js";
import { recomputePriceAggregates } from "../lib/priceAggregation.js";

/**
 * Real Price — админ-эндпойнт пересчёта агрегатов (spec: `.kiro/specs/real-price`).
 *
 * Публичное чтение агрегатов живёт в marketplace-роутере
 * (`GET /api/marketplace/real-price/:workSlug/:citySlug`, bearer-auth) — так его
 * потребляет SSR маркетплейса через общий `call()`.
 *
 * POST /api/real-price/recompute — полный пересчёт `price_aggregates` из
 * `price_points`. Нужен после backfill и до появления авто-пересчёта на
 * завершении заказа.
 */
const router = Router();

router.post("/recompute", requireRole("admin"), async (_req, res) => {
  try {
    const summary = await recomputePriceAggregates();
    res.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[real-price/recompute]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "recompute_failed" });
  }
});

export default router;
