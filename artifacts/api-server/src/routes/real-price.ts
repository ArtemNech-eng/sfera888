import { Router } from "express";
import { db, workTypesTable, citiesTable, priceAggregatesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { recomputePriceAggregates } from "../lib/priceAggregation.js";

/**
 * Real Price — витрина агрегатов цен (spec: `.kiro/specs/real-price`, Фаза 1).
 *
 * - POST /recompute — админ: полный пересчёт `price_aggregates` из `price_points`.
 *   Нужен после backfill и до появления авто-пересчёта на завершении заказа.
 * - GET /:workSlug/:citySlug — публичное чтение агрегата (для будущих /ceny страниц):
 *   агрегат по (вид работ × город) + разбивка по ЖК.
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

router.get("/:workSlug/:citySlug", async (req, res) => {
  const workSlug = String(req.params["workSlug"] ?? "").trim();
  const citySlug = String(req.params["citySlug"] ?? "").trim();
  if (!workSlug || !citySlug) {
    res.status(400).json({ error: "missing_params" });
    return;
  }
  try {
    const [workType] = await db
      .select({ id: workTypesTable.id, slug: workTypesTable.slug, name: workTypesTable.name, defaultUnit: workTypesTable.defaultUnit })
      .from(workTypesTable)
      .where(and(eq(workTypesTable.slug, workSlug), eq(workTypesTable.isActive, true)))
      .limit(1);
    if (!workType) {
      res.status(404).json({ error: "work_type_not_found" });
      return;
    }
    const [city] = await db
      .select({ slug: citiesTable.slug, name: citiesTable.name })
      .from(citiesTable)
      .where(and(eq(citiesTable.slug, citySlug), eq(citiesTable.isActive, true)))
      .limit(1);
    if (!city) {
      res.status(404).json({ error: "city_not_found" });
      return;
    }

    const rows = await db
      .select()
      .from(priceAggregatesTable)
      .where(and(eq(priceAggregatesTable.workTypeId, workType.id), eq(priceAggregatesTable.city, city.name)));

    const cityAgg = rows.find((r) => r.keyType === "work_city") ?? null;
    const zhk = rows.filter((r) => r.keyType === "work_zhk");

    res.json({
      workType: { slug: workType.slug, name: workType.name, unit: workType.defaultUnit },
      city: { slug: city.slug, name: city.name },
      cityAggregate: cityAgg,
      zhk,
    });
  } catch (e) {
    console.error("[real-price/get]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "read_failed" });
  }
});

export default router;
