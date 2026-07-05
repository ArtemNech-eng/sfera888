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
import { db, citiesTable, zhkTable, specialtiesTable, communityThreadsTable } from "@workspace/db";
import { and, eq, isNotNull, asc, desc } from "drizzle-orm";

declare const console: { error: (...args: unknown[]) => void };

/** Максимум тем в sitemap — ограничиваем свежими, чтобы не раздувать XML. */
const MAX_SITEMAP_THREADS = 5000;

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
  /** Id публичных тем/вопросов для страниц `/t/[id]` (SEO-основа UGC). */
  threads: number[];
}

/**
 * ЧИСТЫЙ маппер: из строк БД собрать ответ sitemap, отбросив пустые слаги.
 * Детерминирован и не обращается к БД — точка для unit-теста.
 *
 * Список локаций (`zhk`) — это Community_Sitemap_Source (Requirement 7.1–7.4):
 * входные строки уже отфильтрованы по `is_indexable = true` в запросе, а маппер
 * гарантирует единый плоский список без дубликатов, детерминированно
 * отсортированный по `slug` в порядке возрастания; пустой вход → пустой список
 * без ошибки. Списки `cities`/`specialties` сохраняют исходный порядок запроса.
 */
export function toCommunitySitemap(
  cities: SlugRow[],
  zhk: SlugRow[],
  specialties: SlugRow[],
  threads: { id: number }[] = [],
): CommunitySitemapResponse {
  const pick = (rows: SlugRow[]): string[] =>
    rows
      .map((r) => (typeof r.slug === "string" ? r.slug.trim() : ""))
      .filter((s) => s.length > 0);
  /**
   * Слаги Locality_Record для sitemap: ровно индексируемые (уже отфильтрованы),
   * каждый ровно один раз (дедуп), единым плоским списком по `slug ASC`
   * (Requirement 7.1, 7.3). Пустой вход → пустой список (Requirement 7.4).
   */
  const pickLocalitySlugs = (rows: SlugRow[]): string[] =>
    Array.from(new Set(pick(rows))).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    cities: pick(cities),
    zhk: pickLocalitySlugs(zhk),
    specialties: pick(specialties),
    threads: threads
      .map((t) => t.id)
      .filter((id) => Number.isInteger(id) && id > 0),
  };
}

const router = Router();

/**
 * GET / — индексируемые слаги сообщества для фасадного sitemap.
 * Пустые списки — не ошибка (деградация к статическому sitemap на фасаде).
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [cities, zhk, specialties, threads] = await Promise.all([
      // Города целевого SEO-набора (≥400k, ~40) и активные (Requirement 16.1).
      db
        .select({ slug: citiesTable.slug })
        .from(citiesTable)
        .where(and(eq(citiesTable.isGeoCovered, true), eq(citiesTable.isActive, true), isNotNull(citiesTable.slug))),
      // ЖК выше порога контента — «тонкие» исключены (Requirement 16.3).
      // Индексируемые Locality_Record единым плоским списком по slug ASC
      // (Requirement 7.1, 7.3); пустой набор → пустой список (Requirement 7.4).
      db
        .select({ slug: zhkTable.slug })
        .from(zhkTable)
        .where(eq(zhkTable.isIndexable, true))
        .orderBy(asc(zhkTable.slug)),
      // Специальности PRO_Public_Layer (Requirement 6.5).
      db
        .select({ slug: specialtiesTable.slug })
        .from(specialtiesTable)
        .where(isNotNull(specialtiesTable.slug)),
      // Публичные темы/вопросы для страниц /t/[id] — свежие, ограниченный объём.
      db
        .select({ id: communityThreadsTable.id })
        .from(communityThreadsTable)
        .where(eq(communityThreadsTable.visibility, "public"))
        .orderBy(desc(communityThreadsTable.createdAt))
        .limit(MAX_SITEMAP_THREADS),
    ]);

    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.json(toCommunitySitemap(cities, zhk, specialties, threads));
  } catch (e: unknown) {
    console.error("[community/sitemap]", e instanceof Error ? e.message : e);
    // Деградация: пустые списки, чтобы фасадный sitemap не падал (Req 16.3-safe).
    res.status(200).json({ cities: [], zhk: [], specialties: [], threads: [] });
  }
});

export default router;
