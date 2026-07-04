/**
 * Community sitemap source — индексируемые слаги гео-сообщества «ХочуТакже»
 * для sitemap фасада (Task 11.2, Requirements 16.1, 16.3; 5.2, 6.5/6.7).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "SEO_Service").
 *
 * Роутер монтируется под `/api/community/sitemap` (регистрация — routes/index.ts).
 * Публичный GET (уровень 1): отдаёт ТОЛЬКО слаги индексируемых публичных
 * страниц, чтобы фасадный `app/sitemap.ts` включил их без «тонких» страниц:
 *
 *   • cities       — города целевого SEO-набора (`is_geo_covered = true`,
 *     ~40 городов РФ с населением ≥ 400 000, Requirement 16.1) и активные;
 *     страницы Sosedi_Zone `/goroda/[slug]` индексируемы (Requirement 5.2).
 *   • zhk          — ЖК, прошедшие порог контента (`is_indexable = true`,
 *     Requirement 16.3) — «тонкие» страницы исключены (гейт из
 *     `seoContentThreshold.ts`, Task 11.1).
 *   • specialties  — специальности PRO_Public_Layer; страницы `/pro/[slug]`
 *     индексируемы (Requirement 6.5/6.7).
 *
 * Чистый маппер `toCommunitySitemap` отделён от запроса и покрыт unit-тестом
 * без БД. Ответ кэшируется фасадом (ISR sitemap revalidate=3600).
 */

import { Router, type Request, type Response } from "express";
import { db, citiesTable, zhkTable, specialtiesTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";

declare const console: { error: (...args: unknown[]) => void };

/** Минимальная строка со слагом. */
export interface SlugRow {
  slug: string | null;
}

/** Ответ источника sitemap сообщества — только индексируемые слаги. */
export interface CommunitySitemapResponse {
  /** Слаги городов целевого SEO-набора (Requirement 16.1). */
  cities: string[];
  /** Слаги ЖК, прошедших порог контента (Requirement 16.3). */
  zhk: string[];
  /** Слаги специальностей PRO_Public_Layer (Requirement 6.5). */
  specialties: string[];
}

/**
 * ЧИСТЫЙ маппер: из строк БД собрать ответ sitemap, отбросив пустые слаги.
 * Детерминирован и не обращается к БД — точка для unit-теста.
 */
export function toCommunitySitemap(
  cities: SlugRow[],
  zhk: SlugRow[],
  specialties: SlugRow[],
): CommunitySitemapResponse {
  const pick = (rows: SlugRow[]): string[] =>
    rows
      .map((r) => (typeof r.slug === "string" ? r.slug.trim() : ""))
      .filter((s) => s.length > 0);
  return {
    cities: pick(cities),
    zhk: pick(zhk),
    specialties: pick(specialties),
  };
}

const router = Router();

/**
 * GET / — индексируемые слаги сообщества для фасадного sitemap.
 * Пустые списки — не ошибка (деградация к статическому sitemap на фасаде).
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [cities, zhk, specialties] = await Promise.all([
      // Города целевого SEO-набора (≥400k, ~40) и активные (Requirement 16.1).
      db
        .select({ slug: citiesTable.slug })
        .from(citiesTable)
        .where(and(eq(citiesTable.isGeoCovered, true), eq(citiesTable.isActive, true), isNotNull(citiesTable.slug))),
      // ЖК выше порога контента — «тонкие» исключены (Requirement 16.3).
      db
        .select({ slug: zhkTable.slug })
        .from(zhkTable)
        .where(eq(zhkTable.isIndexable, true)),
      // Специальности PRO_Public_Layer (Requirement 6.5).
      db
        .select({ slug: specialtiesTable.slug })
        .from(specialtiesTable)
        .where(isNotNull(specialtiesTable.slug)),
    ]);

    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.json(toCommunitySitemap(cities, zhk, specialties));
  } catch (e: unknown) {
    console.error("[community/sitemap]", e instanceof Error ? e.message : e);
    // Деградация: пустые списки, чтобы фасадный sitemap не падал (Req 16.3-safe).
    res.status(200).json({ cities: [], zhk: [], specialties: [] });
  }
});

export default router;
