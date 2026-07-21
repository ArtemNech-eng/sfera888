import { Router } from "express";
import { requireRole } from "../middlewares/requireAuth.js";
import { recomputePriceAggregates } from "../lib/priceAggregation.js";
import { runRealPriceBackfill } from "../lib/realPriceBackfill.js";
import { buildObjectConsolidationReport } from "../lib/objectService.js";

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

// POST /api/real-price/backfill — импорт исторических смет в цены. Body { apply }.
// apply=false (по умолчанию) — сухой прогон (отчёт). apply=true — запись + пересчёт.
router.post("/backfill", requireRole("admin"), async (req, res) => {
  const apply = req.body?.apply === true;
  try {
    const report = await runRealPriceBackfill({ apply });
    res.json({ ok: true, report });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[real-price/backfill]", message, e instanceof Error ? e.stack : "");
    res.status(500).json({ error: "backfill_failed", message });
  }
});

// POST /api/real-price/consolidate — dry-run отчёт «1 заказ = 1 Объект» (0.4).
// Только чтение: показывает заказы с несколькими расписками-объектами. Физическое
// слияние строк receipts (25+ зависимостей) выполняется вручную по этому отчёту.
router.post("/consolidate", requireRole("admin"), async (_req, res) => {
  try {
    const report = await buildObjectConsolidationReport();
    res.json({
      ok: true,
      report,
      note: "read-only dry-run; чтение уже соблюдает 1 заказ = 1 Объект. Физический merge receipts делается вручную на стейджинге.",
    });
  } catch (e) {
    console.error("[real-price/consolidate]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "consolidate_failed" });
  }
});

export default router;
