/**
 * Marketplace API — read-only public endpoints (Phase 1 backend skeleton).
 *
 * Mounted at /api/marketplace by ./index.ts.
 *
 * All endpoints are protected by a Bearer token that must equal the
 * MARKETPLACE_INGEST_TOKEN env var. The token is never logged or echoed.
 *
 * Sources:
 *   - cities         — existing settings.ts table, extended in 0005_marketplace_baseline
 *   - service_types  — same migration
 *   - masters        — extended with publication fields in the same migration
 *
 * Strict whitelist DTOs only — phone, passport, contract, wallet, debt,
 * telegram_id and any other internal fields never leave the server.
 *
 * No POST /leads here yet (intake comes in a follow-up task).
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db,
  citiesTable,
  serviceTypesTable,
  mastersTable,
  leadsTable,
  masterPortfolioTable,
  masterReviewsPublicTable,
  ordersTable,
  userSavesTable,
  designsTable,
  workTypesTable,
  priceAggregatesTable,
  pricePointsTable,
  receiptsTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { notifyManagerNewLead } from "../managerBot.js";
import { computeEstimate, isCalcCategory } from "../lib/calculatorEngine.js";
import { getCachedMarketStats, setCachedMarketStats, type MarketStatsResponse } from "../lib/marketStatsCache.js";
import { matchWorkType, derivePricePoint, verdictForPrice, type WorkTypeLite } from "../lib/realPrice.js";
import { buildPriceIndex } from "../lib/priceIndex.js";
import multer from "multer";
import {
  parseEstimateFile,
  EstimateParserDisabledError,
  ACCEPTED_ESTIMATE_MIME,
} from "../lib/estimateParser.js";

declare const console: { error: (...args: unknown[]) => void };

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Auth: every /api/marketplace/* request requires `Authorization: Bearer <token>`
// matching MARKETPLACE_INGEST_TOKEN. If the env var is unset we refuse all
// requests (503) so the surface is never accidentally open. Comparison is
// constant-time to avoid timing oracles.
// ─────────────────────────────────────────────────────────────────────────────
function requireMarketplaceAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env["MARKETPLACE_INGEST_TOKEN"];
  if (!expected) {
    res.status(503).json({ error: "marketplace_unconfigured" });
    return;
  }
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const provided = header.slice("Bearer ".length).trim();
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(provided, "utf-8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

router.use(requireMarketplaceAuth);

// ─────────────────────────────────────────────────────────────────────────────
// Cache headers — public read-only data, OK to cache at the edge.
// ─────────────────────────────────────────────────────────────────────────────
function setOkCache(res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  // Bearer token is part of the cache key — without Vary, an edge cache could
  // serve the same body to clients presenting different Authorization headers.
  res.setHeader("Vary", "Authorization");
}
function set404Cache(res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=60");
  res.setHeader("Vary", "Authorization");
}

// ─────────────────────────────────────────────────────────────────────────────
// DTO mappers — explicit allow-list. Never `return ...row` directly.
// ─────────────────────────────────────────────────────────────────────────────
type CityRow = typeof citiesTable.$inferSelect;
function toCityDto(c: CityRow) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    nameIn: c.nameIn,
    region: c.region,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    h1: c.h1,
    bodyMd: c.bodyMd,
    isActive: c.isActive,
    // city-launch-model: запущен ли город операционно. Пре-лонч города
    // (isGeoCovered=true, isLaunched=false) копят SEO-вес, но каталог/заявки
    // не открыты. Фронт использует флаг, чтобы разграничить режимы страниц.
    isLaunched: c.isLaunched,
  };
}

type ServiceRow = typeof serviceTypesTable.$inferSelect;
function toServiceDto(s: ServiceRow) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    nameGenitive: s.nameGenitive,
    parentId: s.parentId,
    icon: s.icon,
    description: s.description,
    bodyMd: s.bodyMd,
    seoTitle: s.seoTitle,
    seoDescription: s.seoDescription,
    h1: s.h1,
    priceFrom: s.priceFrom,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
  };
}

type MasterRow = typeof mastersTable.$inferSelect;
function toMasterDto(m: MasterRow) {
  // Strict allow-list: NO phone, telegram_id, max_chat_id, pwa_login,
  // pwa_password_hash, passport_*, contract_*, debt, wallet fields,
  // suspension fields, blocked_* fields, manualUnblocksCount, tags,
  // voronka_column_id, working_hours, preferred_districts,
  // min_area, last_seen_at, last_cancel_at, etc.
  //
  // Public fields per MARKETPLACE_PRODUCTION_PLAN.md §11.5 / §13:
  return {
    id: m.id,
    slug: m.slug,
    alias: m.alias,
    publicTitle: m.publicTitle,
    publicBio: m.publicBio,
    city: m.city,
    specialization: m.specialization,
    specializations: m.specializations,
    // servicePrices ARE public — they're meant to help clients estimate cost.
    // Filtered to entries with valid `service` and `priceFrom > 0` so the UI
    // can trust the data without re-validating.
    servicePrices: Array.isArray(m.servicePrices)
      ? m.servicePrices.filter(p => p?.service && typeof p?.priceFrom === "number" && p.priceFrom > 0)
      : [],
    rating: m.rating,
    publicRating: m.publicRating,
    publicReviewsCount: m.publicReviewsCount,
    yearsExperience: m.yearsExperience,
    avatarUrl: m.customAvatarUrl,
    hasContract: m.contractSignedAt != null,
    // createdAt is the master's first sign-up date — used by the public page
    // to compute «на платформе X лет/месяцев». Time-only, no PII.
    createdAt: m.createdAt,
  };
}

// ── Portfolio DTO mapper ────────────────────────────────────────────────────
// Public portfolio items shown on /master/[slug]. Joined with the service and
// city to give the frontend ready-to-render labels + slugs (so it can build
// a `/[serviceSlug]/[citySlug]` link from each portfolio card).
//
// Strict allow-list. NEVER returns: master_id (already in path), service_type_id
// or city_id raw integers, view_count (internal analytics), is_published
// (filtered already), created_at / updated_at (operational).
type PortfolioRow = typeof masterPortfolioTable.$inferSelect;
type PortfolioJoin = {
  portfolio: PortfolioRow;
  service: { name: string; slug: string | null } | null;
  city: { name: string; slug: string | null } | null;
};
function toMasterPortfolioDto(row: PortfolioJoin) {
  const p = row.portfolio;
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    beforePhotos: p.beforePhotos,
    afterPhotos: p.afterPhotos,
    priceFrom: p.priceFrom,
    priceTo: p.priceTo,
    area: p.area,
    durationDays: p.durationDays,
    housingType: p.housingType,
    estimate: p.estimate,
    completedAt: p.completedAt,
    clientReviewText: p.clientReviewText,
    clientRating: p.clientRating,
    isFeatured: p.isFeatured,
    sortOrder: p.sortOrder,
    service: row.service ? { name: row.service.name, slug: row.service.slug } : null,
    city: row.city ? { name: row.city.name, slug: row.city.slug } : null,
  };
}

// ── Public review DTO mapper ────────────────────────────────────────────────
// Reviews published on /master/[slug] after operator-side moderation.
//
// Strict allow-list. NEVER returns: client_phone_hash (PII), moderation_*
// (operator-internal), moderated_by (user id), order_id (internal link),
// master_id (already known), updated_at.
type ReviewRow = typeof masterReviewsPublicTable.$inferSelect;
function toMasterPublicReviewDto(r: ReviewRow) {
  return {
    id: r.id,
    clientName: r.clientName,
    clientCity: r.clientCity,
    rating: r.rating,
    text: r.text,
    photos: r.photos,
    isFeatured: r.isFeatured,
    createdAt: r.createdAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/cities — active, slug-ready cities, sorted by name.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/cities", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(citiesTable)
      .where(and(
        eq(citiesTable.isActive, true),
        isNotNull(citiesTable.slug),
        ne(citiesTable.slug, ""),
      ))
      .orderBy(asc(citiesTable.name));
    setOkCache(res);
    res.json({ items: rows.map(toCityDto) });
  } catch (e: unknown) {
    console.error("[marketplace/cities]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/services — active, slug-ready services.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/services", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(serviceTypesTable)
      .where(and(
        eq(serviceTypesTable.isActive, true),
        isNotNull(serviceTypesTable.slug),
        ne(serviceTypesTable.slug, ""),
      ))
      .orderBy(asc(serviceTypesTable.sortOrder), asc(serviceTypesTable.name));
    setOkCache(res);
    res.json({ items: rows.map(toServiceDto) });
  } catch (e: unknown) {
    console.error("[marketplace/services]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/stats — platform-wide counts for the homepage trust
// block (plan §20.2 [10]). Always returns numbers; if the marketplace is just
// bootstrapping and a count is 0, the UI hides that card. Cached for 5 min on
// the api-server side and another 5 min in marketplace ISR — counts move
// slowly enough that 10-min freshness is fine.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/stats", async (_req, res) => {
  try {
    const [completedOrdersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(and(eq(ordersTable.status, "completed"), isNull(ordersTable.deletedAt)));

    const [publishedMastersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mastersTable)
      .where(and(
        eq(mastersTable.isPublished, true),
        isNull(mastersTable.deletedAt),
        isNotNull(mastersTable.slug),
      ));

    const [publishedCasesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(masterPortfolioTable)
      .where(and(
        eq(masterPortfolioTable.isPublished, true),
        isNotNull(masterPortfolioTable.slug),
      ));

    // Average rating across published masters with at least one rating point.
    // Returns null if there are none yet (avoids `0` displaying as a falsely
    // confident metric).
    const [avgRatingResult] = await db
      .select({
        avg: sql<number | null>`avg(${mastersTable.rating})::float`,
      })
      .from(mastersTable)
      .where(and(
        eq(mastersTable.isPublished, true),
        isNull(mastersTable.deletedAt),
        sql`${mastersTable.rating} > 0`,
      ));

    const [citiesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(citiesTable)
      .where(eq(citiesTable.isActive, true));

    setOkCache(res);
    res.json({
      completedOrders: completedOrdersResult?.count ?? 0,
      publishedMasters: publishedMastersResult?.count ?? 0,
      publishedCases: publishedCasesResult?.count ?? 0,
      avgRating: avgRatingResult?.avg ?? null,
      citiesCount: citiesResult?.count ?? 0,
    });
  } catch (e: unknown) {
    console.error("[marketplace/stats]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/calculator/estimate
//
// Renovation cost estimator (plan §19.3, §20.2 [6]). Wraps `calculatorEngine`
// (server-side, calibrated regional coefficients) and additionally counts
// real `master_portfolio` cases that match the (city, area) bucket — the UI
// uses that count to switch from "Ориентир" to "По N реальным проектам" once
// we cross 5 matching cases.
//
// Query params:
//   citySlug   — optional, falls back to baseline if missing or unknown
//   serviceSlug — optional, used purely to refine the matching-cases count
//   category   — required: "kosmetic" | "evro" | "premium"
//   areaSqm    — required, [8, 500]
// ─────────────────────────────────────────────────────────────────────────────
router.get("/calculator/estimate", async (req, res) => {
  try {
    const citySlug = typeof req.query["citySlug"] === "string" && req.query["citySlug"].trim().length > 0
      ? req.query["citySlug"].trim()
      : null;
    const serviceSlug = typeof req.query["serviceSlug"] === "string" && req.query["serviceSlug"].trim().length > 0
      ? req.query["serviceSlug"].trim()
      : null;
    const categoryRaw = String(req.query["category"] ?? "").trim();
    const areaRaw = parseFloat(String(req.query["areaSqm"] ?? ""));

    if (!isCalcCategory(categoryRaw)) {
      res.status(400).json({ error: "invalid_category", message: "Категория должна быть одной из: kosmetic, evro, premium" });
      return;
    }
    if (!Number.isFinite(areaRaw) || areaRaw < 8 || areaRaw > 500) {
      res.status(400).json({ error: "invalid_area", message: "Площадь должна быть от 8 до 500 м²" });
      return;
    }

    // Resolve city + service for the response shape and for the matching
    // count query. Both are optional — engine falls back if absent.
    let cityRow: CityRow | null = null;
    if (citySlug) {
      const rows = await db
        .select()
        .from(citiesTable)
        .where(and(
          eq(citiesTable.slug, citySlug),
          eq(citiesTable.isActive, true),
        ))
        .limit(1);
      cityRow = rows[0] ?? null;
    }
    let serviceRow: typeof serviceTypesTable.$inferSelect | null = null;
    if (serviceSlug) {
      const rows = await db
        .select()
        .from(serviceTypesTable)
        .where(and(
          eq(serviceTypesTable.slug, serviceSlug),
          eq(serviceTypesTable.isActive, true),
        ))
        .limit(1);
      serviceRow = rows[0] ?? null;
    }

    // Compute estimate using the calibrated regional coefficients.
    const result = computeEstimate({
      citySlug: cityRow?.slug ?? citySlug,
      category: categoryRaw,
      areaSqm: areaRaw,
    });

    // Count real published cases that fall in the (city, area±30%) bucket.
    // Useful both for "you're not the first" social proof and for the UI to
    // promote the response from "regional estimate" to "based on N real
    // projects" once we cross a threshold (planned: 5). Count failure is
    // non-fatal; we just report 0.
    let matchingRealCasesCount = 0;
    try {
      const areaMinStr = (areaRaw * 0.7).toFixed(2);
      const areaMaxStr = (areaRaw * 1.3).toFixed(2);
      const conds = [
        eq(masterPortfolioTable.isPublished, true),
        isNotNull(masterPortfolioTable.area),
        sql`${masterPortfolioTable.area}::numeric BETWEEN ${areaMinStr}::numeric AND ${areaMaxStr}::numeric`,
        isNotNull(masterPortfolioTable.priceFrom),
      ];
      if (cityRow) conds.push(eq(masterPortfolioTable.cityId, cityRow.id));
      if (serviceRow) conds.push(eq(masterPortfolioTable.serviceTypeId, serviceRow.id));
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(masterPortfolioTable)
        .where(and(...conds));
      matchingRealCasesCount = count ?? 0;
    } catch (e) {
      console.error("[marketplace/calculator] matching count failed", e instanceof Error ? e.message : e);
    }

    setOkCache(res);
    res.json({
      city: cityRow ? toCityDto(cityRow) : null,
      service: serviceRow ? toServiceDto(serviceRow) : null,
      category: categoryRaw,
      areaSqm: Math.round(areaRaw),
      pricePerSqm: result.pricePerSqm,
      totalPrice: result.totalPrice,
      duration: result.duration,
      source: result.source,
      isRegionalEstimate: result.isRegionalEstimate,
      cityNameIn: result.cityNameIn,
      matchingRealCasesCount,
    });
  } catch (e: unknown) {
    console.error("[marketplace/calculator/estimate]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/service-city/:serviceSlug/:citySlug
// SEO URL maps to /[serviceSlug]/[citySlug] (e.g. /santehnika/krasnodar).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/service-city/:serviceSlug/:citySlug", async (req, res) => {
  const { serviceSlug, citySlug } = req.params as { serviceSlug?: string; citySlug?: string };
  if (!serviceSlug || !citySlug) {
    set404Cache(res);
    res.status(404).json({ error: "not_found" });
    return;
  }
  try {
    const [service] = await db
      .select()
      .from(serviceTypesTable)
      .where(and(
        eq(serviceTypesTable.slug, serviceSlug),
        eq(serviceTypesTable.isActive, true),
      ))
      .limit(1);
    const [city] = await db
      .select()
      .from(citiesTable)
      .where(and(
        eq(citiesTable.slug, citySlug),
        eq(citiesTable.isActive, true),
      ))
      .limit(1);

    if (!service || !city) {
      set404Cache(res);
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Filter masters: published, in this city, has this specialization in their list.
    // masters.specializations is text[] of service NAMES (free-form), so we match by
    // the service.name exact string, same algorithm as `/marketplace/masters`.
    const masterRows = await db
      .select()
      .from(mastersTable)
      .where(and(
        eq(mastersTable.isPublished, true),
        isNotNull(mastersTable.slug),
        eq(mastersTable.city, city.name),
        sql`${service.name} = ANY(${mastersTable.specializations})`,
      ))
      .orderBy(
        desc(mastersTable.publicRating),
        desc(mastersTable.publicReviewsCount),
        asc(mastersTable.id),
      )
      .limit(30);

    const masters = masterRows.map(toMasterDto);

    // Aggregate stats — computed from the same master set so the numbers
    // match the visible cards.
    const ratings = masterRows
      .map((m) => (m.publicRating != null ? Number(m.publicRating) : null))
      .filter((n): n is number => n != null && Number.isFinite(n) && n > 0);
    const avgRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null;
    const reviewsCount = masterRows.reduce(
      (s, m) => s + (m.publicReviewsCount ?? 0),
      0,
    );

    // minPrice — lowest `priceFrom` among master service-prices that match THIS service.
    // Falls back to service.priceFrom (catalog default) if no master priced it yet.
    const minPrices: number[] = [];
    for (const m of masterRows) {
      const sp = m.servicePrices;
      if (Array.isArray(sp)) {
        for (const p of sp) {
          if (p?.service === service.name && typeof p?.priceFrom === "number" && p.priceFrom > 0) {
            minPrices.push(p.priceFrom);
          }
        }
      }
    }
    const minPrice = minPrices.length > 0
      ? Math.min(...minPrices)
      : (service.priceFrom ?? null);

    const stats = {
      mastersCount: masters.length,
      minPrice,
      avgRating,
      reviewsCount,
    };

    const cityForUrl = city.nameIn ?? city.name;
    const seo = {
      title: service.seoTitle ?? `${service.h1 ?? service.name} в ${cityForUrl}`,
      description: service.seoDescription
        ?? `Услуги «${service.name}» в городе ${cityForUrl}. Опытные мастера с проверенными отзывами.`,
      h1: service.h1 ?? `${service.name} в ${cityForUrl}`,
    };

    setOkCache(res);
    res.json({ service: toServiceDto(service), city: toCityDto(city), masters, stats, seo });
  } catch (e: unknown) {
    console.error("[marketplace/service-city]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/masters — paginated list of published masters.
// Query: citySlug?, serviceSlug?, page (default 1), limit (default 20, max 50).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/masters", async (req, res) => {
  const pageRaw = Number(req.query["page"] ?? 1);
  const limitRaw = Number(req.query["limit"] ?? 20);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
  const offset = (page - 1) * limit;

  const citySlugParam = req.query["citySlug"];
  const serviceSlugParam = req.query["serviceSlug"];
  const citySlug = typeof citySlugParam === "string" && citySlugParam.length > 0 ? citySlugParam : undefined;
  const serviceSlug = typeof serviceSlugParam === "string" && serviceSlugParam.length > 0 ? serviceSlugParam : undefined;

  try {
    // Resolve slugs to current internal names (masters.city is text, not FK).
    let cityName: string | undefined;
    if (citySlug) {
      const [c] = await db
        .select({ name: citiesTable.name })
        .from(citiesTable)
        .where(eq(citiesTable.slug, citySlug))
        .limit(1);
      if (!c) {
        setOkCache(res);
        res.json({ items: [], page, limit, total: 0 });
        return;
      }
      cityName = c.name;
    }
    let serviceName: string | undefined;
    if (serviceSlug) {
      const [s] = await db
        .select({ name: serviceTypesTable.name })
        .from(serviceTypesTable)
        .where(eq(serviceTypesTable.slug, serviceSlug))
        .limit(1);
      if (!s) {
        setOkCache(res);
        res.json({ items: [], page, limit, total: 0 });
        return;
      }
      serviceName = s.name;
    }

    const conds = [
      eq(mastersTable.isPublished, true),
      isNotNull(mastersTable.slug),
    ];
    if (cityName) conds.push(eq(mastersTable.city, cityName));
    if (serviceName) {
      // masters.specializations is text[] of service names; check membership.
      conds.push(sql`${serviceName} = ANY(${mastersTable.specializations})`);
    }

    const rows = await db
      .select()
      .from(mastersTable)
      .where(and(...conds))
      .orderBy(
        desc(mastersTable.publicRating),
        desc(mastersTable.publicReviewsCount),
        asc(mastersTable.id),
      )
      .limit(limit)
      .offset(offset);

    const totalRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(mastersTable)
      .where(and(...conds));
    const total = Number(totalRows[0]?.n ?? 0);

    setOkCache(res);
    res.json({ items: rows.map(toMasterDto), page, limit, total });
  } catch (e: unknown) {
    console.error("[marketplace/masters]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/master/:slug — single published master profile.
// Returns the master DTO + published portfolio items (with service+city labels)
// + approved public reviews. Hard caps prevent very large payloads on masters
// with hundreds of items: 30 portfolio items, 20 reviews per request. The UI
// can paginate later via dedicated endpoints once we have masters with that
// much published content.
// ─────────────────────────────────────────────────────────────────────────────

const PORTFOLIO_LIMIT = 30;
const REVIEWS_LIMIT = 20;

router.get("/master/:slug", async (req, res) => {
  const { slug } = req.params as { slug?: string };
  if (!slug) {
    set404Cache(res);
    res.status(404).json({ error: "not_found" });
    return;
  }
  try {
    const [master] = await db
      .select()
      .from(mastersTable)
      .where(and(
        eq(mastersTable.slug, slug),
        eq(mastersTable.isPublished, true),
      ))
      .limit(1);
    if (!master) {
      set404Cache(res);
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Portfolio: published cases only, JOIN service + city for ready-to-render
    // chips. Featured first, then by sortOrder, then most recent completed,
    // then by id desc as a deterministic tiebreaker.
    const portfolioRows = await db
      .select({
        portfolio: masterPortfolioTable,
        service: {
          name: serviceTypesTable.name,
          slug: serviceTypesTable.slug,
        },
        city: {
          name: citiesTable.name,
          slug: citiesTable.slug,
        },
      })
      .from(masterPortfolioTable)
      .leftJoin(serviceTypesTable, eq(masterPortfolioTable.serviceTypeId, serviceTypesTable.id))
      .leftJoin(citiesTable, eq(masterPortfolioTable.cityId, citiesTable.id))
      .where(and(
        eq(masterPortfolioTable.masterId, master.id),
        eq(masterPortfolioTable.isPublished, true),
      ))
      .orderBy(
        desc(masterPortfolioTable.isFeatured),
        asc(masterPortfolioTable.sortOrder),
        sql`${masterPortfolioTable.completedAt} DESC NULLS LAST`,
        desc(masterPortfolioTable.id),
      )
      .limit(PORTFOLIO_LIMIT);

    // Reviews: only `approved`. Featured first, then most recent. PII stays
    // on the server — toMasterPublicReviewDto() does not expose phone hash
    // or moderation metadata.
    const reviewRows = await db
      .select()
      .from(masterReviewsPublicTable)
      .where(and(
        eq(masterReviewsPublicTable.masterId, master.id),
        eq(masterReviewsPublicTable.moderationStatus, "approved"),
      ))
      .orderBy(
        desc(masterReviewsPublicTable.isFeatured),
        desc(masterReviewsPublicTable.createdAt),
        desc(masterReviewsPublicTable.id),
      )
      .limit(REVIEWS_LIMIT);

    // Public stats: aggregate counts from `orders`. Cancelled is intentionally
    // omitted from the public payload — it's a negative signal we don't expose
    // in V1 (see MARKETPLACE_PRODUCTION_PLAN.md §11.5 / privacy review).
    const statsRows = await db
      .select({
        status: ordersTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.masterId, master.id),
        isNull(ordersTable.deletedAt),
      ))
      .groupBy(ordersTable.status);
    let totalOrders = 0;
    let completedOrders = 0;
    for (const r of statsRows) {
      totalOrders += Number(r.count) || 0;
      if (r.status === "completed") completedOrders = Number(r.count) || 0;
    }

    setOkCache(res);
    res.json({
      master: toMasterDto(master),
      stats: {
        totalOrders,
        completedOrders,
      },
      portfolio: portfolioRows.map(toMasterPortfolioDto),
      reviews: reviewRows.map(toMasterPublicReviewDto),
    });
  } catch (e: unknown) {
    console.error("[marketplace/master]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/marketplace/leads — Lead intake from marketplace frontend.
//
// Mirrors the patterns of /api/landing/leads:
//   • zod-validated input
//   • duplicate-by-phone check over the last 30 days
//   • sets `is_possible_duplicate` flag (lead is still created, as in landing)
//   • notifies the manager bot non-blocking
//
// Differences from landing:
//   • source = 'marketplace' (already a free-form text in `leads.source`)
//   • additional marketplace fields (utm, marketplace_context, attached_master_id, …)
//     all of which were added in 0005_marketplace_baseline migration
//   • requires explicit consent (consentGiven = true) and writes consent_given_at
//
// Strict no-side-effects beyond the lead row:
//   • does NOT create an order
//   • does NOT call performBroadcast / dispatch
//   • does NOT charge anything to a master / partner
//
// Auth: inherited from `requireMarketplaceAuth` (Bearer token) at router level.
// ─────────────────────────────────────────────────────────────────────────────

const marketplaceLeadSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(5).max(30),
  citySlug: z.string().trim().min(1).max(100),
  serviceSlug: z.string().trim().min(1).max(100),
  comment: z.string().max(2000).optional(),
  // Area is free-form on marketplace forms (sometimes "до 50", sometimes "10").
  // We coerce to numeric only when it looks like a number; otherwise store "0".
  area: z.union([z.string().max(50), z.number()]).optional(),
  sourcePageUrl: z.string().max(1000).optional(),
  sourcePageType: z.string().max(40).optional(),
  attachedMasterId: z.number().int().positive().optional(),
  marketplaceContext: z.record(z.string(), z.unknown()).optional(),
  utm: z.object({
    source: z.string().max(200).optional(),
    medium: z.string().max(200).optional(),
    campaign: z.string().max(200).optional(),
    term: z.string().max(200).optional(),
    content: z.string().max(200).optional(),
  }).optional(),
  referrer: z.string().max(1000).optional(),
  clientIp: z.string().max(45).optional(),
  clientUserAgent: z.string().max(500).optional(),
  // Marketplace forms must include an explicit consent checkbox; we only
  // accept literal `true`. Any other value triggers a standard zod literal
  // error which the client can surface as "Требуется согласие".
  consentGiven: z.literal(true),
  captchaScore: z.number().min(0).max(1).optional(),
});

function normalizeArea(area: unknown): string {
  // leads.area is numeric NOT NULL — never insert null.
  if (typeof area === "number" && Number.isFinite(area)) return String(area);
  if (typeof area === "string") {
    const n = parseFloat(area.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return String(n);
  }
  return "0";
}

/**
 * Normalize a free-form Russian phone string to canonical "7XXXXXXXXXX" form.
 *   "+7 (999) 123-45-67"  → "79991234567"
 *   "8 999 123 45 67"     → "79991234567"
 *   "9991234567"          → "79991234567"
 *   "+7 999 123-45-67abc" → "79991234567"
 * Falls back to digits-only if the input doesn't match a known length —
 * we don't want to accidentally drop foreign numbers.
 *
 * Same algorithm as `normalizePhoneForPush` in routes/client.ts and
 * `normalizePhoneForLogin` in routes/masters.ts. Existing CRM phone-search
 * and master-mapping flows already do `.replace(/\D/g, "").slice(-10)`
 * on-the-fly, so storing the normalized form here does NOT break them
 * (it actually makes duplicate-detection by phone more reliable).
 *
 * Note: /api/landing/leads currently stores the raw phone. Marketplace
 * deliberately diverges because anonymous public form input is much more
 * variable than the partner-landing form, and we want consistent dedup.
 */
function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return "7" + digits;
  if (digits.length === 11 && digits[0] === "8") return "7" + digits.slice(1);
  return digits;
}

router.post("/leads", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");

  const parsed = marketplaceLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      details: parsed.error.flatten(),
    });
    return;
  }
  const body = parsed.data;
  const normalizedPhone = normalizePhone(body.phone);

  try {
    // 1. Resolve citySlug → city.name (must be active).
    const [city] = await db
      .select({ name: citiesTable.name, isActive: citiesTable.isActive })
      .from(citiesTable)
      .where(eq(citiesTable.slug, body.citySlug))
      .limit(1);
    if (!city || city.isActive !== true) {
      res.status(404).json({ error: "city_not_found" });
      return;
    }

    // 2. Resolve serviceSlug → service_types.name (must be active).
    const [service] = await db
      .select({ name: serviceTypesTable.name, isActive: serviceTypesTable.isActive })
      .from(serviceTypesTable)
      .where(eq(serviceTypesTable.slug, body.serviceSlug))
      .limit(1);
    if (!service || service.isActive !== true) {
      res.status(404).json({ error: "service_not_found" });
      return;
    }

    // 3. Validate attachedMasterId (if provided). The public form may only
    //    arrive from a published master's card, so we require is_published=true
    //    and slug IS NOT NULL. This also prevents FK violations from the
    //    leads.attached_master_id → masters.id constraint added in 0005.
    if (body.attachedMasterId != null) {
      const [master] = await db
        .select({ id: mastersTable.id })
        .from(mastersTable)
        .where(and(
          eq(mastersTable.id, body.attachedMasterId),
          eq(mastersTable.isPublished, true),
          isNotNull(mastersTable.slug),
        ))
        .limit(1);
      if (!master) {
        res.status(404).json({ error: "attached_master_not_found" });
        return;
      }
    }

    // 4. Duplicate check — same client phone within last 30 days, not deleted.
    //    Mirrors /api/landing/leads. The lead is still created (as in landing),
    //    but flagged for the operator's attention. Uses the normalized phone
    //    so "+7 999 123-45-67" and "89991234567" are recognized as duplicates.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [duplicate] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(
        eq(leadsTable.clientPhone, normalizedPhone),
        isNull(leadsTable.deletedAt),
        gte(leadsTable.createdAt, thirtyDaysAgo),
      ))
      .limit(1);
    const isPossibleDuplicate = duplicate != null;

    // 5. Insert the lead. We never create an order or trigger dispatch here.
    const [newLead] = await db
      .insert(leadsTable)
      .values({
        clientName: body.name ?? "Клиент marketplace",
        clientPhone: normalizedPhone,
        city: city.name,
        // leads.district is NOT NULL — marketplace forms don't ask for it.
        // Use empty string so existing CRM filters keep working.
        district: "",
        serviceType: service.name,
        area: normalizeArea(body.area),
        services: JSON.stringify([service.name]),
        comment: body.comment ?? null,
        source: "marketplace",
        status: "new",
        paymentModel: "commission",
        isPossibleDuplicate,
        // ── 0005_marketplace_baseline columns ─────────────────────────────
        sourcePageUrl: body.sourcePageUrl ?? null,
        sourcePageType: body.sourcePageType ?? null,
        serviceSlug: body.serviceSlug,
        citySlug: body.citySlug,
        marketplaceContext: body.marketplaceContext ?? null,
        referrer: body.referrer ?? null,
        utmSource: body.utm?.source ?? null,
        utmMedium: body.utm?.medium ?? null,
        utmCampaign: body.utm?.campaign ?? null,
        utmTerm: body.utm?.term ?? null,
        utmContent: body.utm?.content ?? null,
        attachedMasterId: body.attachedMasterId ?? null,
        clientIp: body.clientIp ?? (req.ip ?? null),
        clientUserAgent: body.clientUserAgent ?? null,
        consentGivenAt: new Date(),
        captchaScore: body.captchaScore != null ? String(body.captchaScore) : null,
      })
      .returning();

    if (!newLead) {
      console.error("[marketplace/leads] insert returned no row");
      res.status(500).json({ error: "internal_error" });
      return;
    }

    // 6. Notify manager bot (non-blocking — never fails the request).
    notifyManagerNewLead({
      id: newLead.id,
      clientName: newLead.clientName,
      clientPhone: newLead.clientPhone,
      city: newLead.city,
      serviceType: newLead.serviceType,
      source: newLead.source,
    }).catch((err: unknown) =>
      console.error("[marketplace/leads] notifyManagerNewLead failed:",
        err instanceof Error ? err.message : err));

    res.status(201).json({
      ok: true,
      leadId: newLead.id,
      duplicate: isPossibleDuplicate,
    });
  } catch (e: unknown) {
    console.error("[marketplace/leads]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/raboty — paginated public list of portfolio cases.
// (Houzz-model, see plan §11.7) Each published case = an indexed page on
// /raboty/[slug]. This list endpoint powers `/raboty` (full feed) and
// `/raboty/[serviceSlug]` / `/raboty/[serviceSlug]/[citySlug]` filtered feeds.
//
// Query: serviceSlug?, citySlug?, page (default 1), limit (default 20, max 50).
// ─────────────────────────────────────────────────────────────────────────────

const RABOTY_DEFAULT_LIMIT = 20;
const RABOTY_MAX_LIMIT = 50;

router.get("/raboty", async (req, res) => {
  const pageRaw = Number(req.query["page"] ?? 1);
  const limitRaw = Number(req.query["limit"] ?? RABOTY_DEFAULT_LIMIT);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Number.isInteger(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, RABOTY_MAX_LIMIT)
    : RABOTY_DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  const serviceSlugParam = req.query["serviceSlug"];
  const citySlugParam = req.query["citySlug"];
  const serviceSlug = typeof serviceSlugParam === "string" && serviceSlugParam.length > 0 ? serviceSlugParam : undefined;
  const citySlug = typeof citySlugParam === "string" && citySlugParam.length > 0 ? citySlugParam : undefined;

  try {
    // Resolve filter slugs to FK ids.
    let serviceId: number | undefined;
    let serviceName: string | undefined;
    let serviceSlugResolved: string | undefined;
    if (serviceSlug) {
      const [s] = await db
        .select({ id: serviceTypesTable.id, name: serviceTypesTable.name, slug: serviceTypesTable.slug })
        .from(serviceTypesTable)
        .where(and(eq(serviceTypesTable.slug, serviceSlug), eq(serviceTypesTable.isActive, true)))
        .limit(1);
      if (!s) {
        setOkCache(res);
        res.json({ items: [], page, limit, total: 0 });
        return;
      }
      serviceId = s.id;
      serviceName = s.name;
      serviceSlugResolved = s.slug ?? undefined;
    }
    let cityId: number | undefined;
    let cityName: string | undefined;
    let citySlugResolved: string | undefined;
    if (citySlug) {
      const [c] = await db
        .select({ id: citiesTable.id, name: citiesTable.name, slug: citiesTable.slug })
        .from(citiesTable)
        .where(and(eq(citiesTable.slug, citySlug), eq(citiesTable.isActive, true)))
        .limit(1);
      if (!c) {
        setOkCache(res);
        res.json({ items: [], page, limit, total: 0 });
        return;
      }
      cityId = c.id;
      cityName = c.name;
      citySlugResolved = c.slug ?? undefined;
    }

    const conds = [
      eq(masterPortfolioTable.isPublished, true),
      isNotNull(masterPortfolioTable.slug),
      ne(masterPortfolioTable.slug, ""),
      // Master must be published too; otherwise the case page would link
      // to a 404 master profile.
      eq(mastersTable.isPublished, true),
      isNotNull(mastersTable.slug),
    ];
    if (serviceId != null) conds.push(eq(masterPortfolioTable.serviceTypeId, serviceId));
    if (cityId != null) conds.push(eq(masterPortfolioTable.cityId, cityId));

    const rows = await db
      .select({
        portfolio: masterPortfolioTable,
        service: { name: serviceTypesTable.name, slug: serviceTypesTable.slug },
        city: { name: citiesTable.name, slug: citiesTable.slug },
        master: {
          id: mastersTable.id,
          slug: mastersTable.slug,
          alias: mastersTable.alias,
          publicTitle: mastersTable.publicTitle,
          avatarUrl: mastersTable.customAvatarUrl,
          publicRating: mastersTable.publicRating,
          publicReviewsCount: mastersTable.publicReviewsCount,
          city: mastersTable.city,
        },
      })
      .from(masterPortfolioTable)
      .innerJoin(mastersTable, eq(masterPortfolioTable.masterId, mastersTable.id))
      .leftJoin(serviceTypesTable, eq(masterPortfolioTable.serviceTypeId, serviceTypesTable.id))
      .leftJoin(citiesTable, eq(masterPortfolioTable.cityId, citiesTable.id))
      .where(and(...conds))
      .orderBy(
        desc(masterPortfolioTable.isFeatured),
        sql`${masterPortfolioTable.completedAt} DESC NULLS LAST`,
        desc(masterPortfolioTable.createdAt),
        desc(masterPortfolioTable.id),
      )
      .limit(limit)
      .offset(offset);

    const totalRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(masterPortfolioTable)
      .innerJoin(mastersTable, eq(masterPortfolioTable.masterId, mastersTable.id))
      .where(and(...conds));
    const total = Number(totalRows[0]?.n ?? 0);

    setOkCache(res);
    res.json({
      items: rows.map((r) => ({
        id: r.portfolio.id,
        slug: r.portfolio.slug,
        title: r.portfolio.title,
        description: r.portfolio.description,
        beforePhotos: r.portfolio.beforePhotos,
        afterPhotos: r.portfolio.afterPhotos,
        priceFrom: r.portfolio.priceFrom,
        priceTo: r.portfolio.priceTo,
        area: r.portfolio.area,
        completedAt: r.portfolio.completedAt,
        clientReviewText: r.portfolio.clientReviewText,
        clientRating: r.portfolio.clientRating,
        isFeatured: r.portfolio.isFeatured,
        saveCount: r.portfolio.saveCount,
        service: r.service ? { name: r.service.name, slug: r.service.slug } : null,
        city: r.city ? { name: r.city.name, slug: r.city.slug } : null,
        master: {
          id: r.master.id,
          slug: r.master.slug,
          alias: r.master.alias,
          publicTitle: r.master.publicTitle,
          avatarUrl: r.master.avatarUrl,
          publicRating: r.master.publicRating,
          publicReviewsCount: r.master.publicReviewsCount ?? 0,
          city: r.master.city,
        },
      })),
      page,
      limit,
      total,
      // Filter context — handy for the UI breadcrumbs and SEO meta.
      filter: {
        service: serviceName && serviceSlugResolved
          ? { name: serviceName, slug: serviceSlugResolved }
          : null,
        city: cityName && citySlugResolved
          ? { name: cityName, slug: citySlugResolved }
          : null,
      },
    });
  } catch (e: unknown) {
    console.error("[marketplace/raboty]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/raboty/:slug — single portfolio case.
//
// Returns: case fields + service+city labels + master mini-DTO + up to 6
// "similar works" picked by same service+city (then loosened to same service
// only if not enough). Used by the public page /raboty/[slug].
// ─────────────────────────────────────────────────────────────────────────────

const RABOTY_SIMILAR_LIMIT = 6;

router.get("/raboty/:slug", async (req, res) => {
  const { slug } = req.params as { slug?: string };
  if (!slug) {
    set404Cache(res);
    res.status(404).json({ error: "not_found" });
    return;
  }
  // Optional: client passes its anonymous cookie ID so we can return
  // `isSavedByCurrentUser`. Validation is loose — anything not matching
  // the UUID v4 shape is silently treated as missing (no error).
  const anonIdParam = typeof req.query["anonId"] === "string" ? req.query["anonId"] : "";
  const anonId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(anonIdParam)
    ? anonIdParam.toLowerCase()
    : null;
  try {
    const [row] = await db
      .select({
        portfolio: masterPortfolioTable,
        service: { name: serviceTypesTable.name, slug: serviceTypesTable.slug },
        city: { name: citiesTable.name, slug: citiesTable.slug },
        master: mastersTable,
      })
      .from(masterPortfolioTable)
      .innerJoin(mastersTable, eq(masterPortfolioTable.masterId, mastersTable.id))
      .leftJoin(serviceTypesTable, eq(masterPortfolioTable.serviceTypeId, serviceTypesTable.id))
      .leftJoin(citiesTable, eq(masterPortfolioTable.cityId, citiesTable.id))
      .where(and(
        eq(masterPortfolioTable.slug, slug),
        eq(masterPortfolioTable.isPublished, true),
        eq(mastersTable.isPublished, true),
        isNotNull(mastersTable.slug),
      ))
      .limit(1);

    if (!row) {
      set404Cache(res);
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Similar cases: same service+city → fall back to same service only.
    let similar: Array<{
      id: number;
      slug: string | null;
      title: string;
      beforePhotos: string[];
      afterPhotos: string[];
      priceFrom: string | null;
      area: string | null;
      service: { name: string; slug: string | null } | null;
      city: { name: string; slug: string | null } | null;
    }> = [];

    if (row.portfolio.serviceTypeId != null) {
      const sameSvcCity = await db
        .select({
          portfolio: masterPortfolioTable,
          service: { name: serviceTypesTable.name, slug: serviceTypesTable.slug },
          city: { name: citiesTable.name, slug: citiesTable.slug },
        })
        .from(masterPortfolioTable)
        .innerJoin(mastersTable, eq(masterPortfolioTable.masterId, mastersTable.id))
        .leftJoin(serviceTypesTable, eq(masterPortfolioTable.serviceTypeId, serviceTypesTable.id))
        .leftJoin(citiesTable, eq(masterPortfolioTable.cityId, citiesTable.id))
        .where(and(
          eq(masterPortfolioTable.isPublished, true),
          isNotNull(masterPortfolioTable.slug),
          ne(masterPortfolioTable.id, row.portfolio.id),
          eq(masterPortfolioTable.serviceTypeId, row.portfolio.serviceTypeId),
          row.portfolio.cityId != null
            ? eq(masterPortfolioTable.cityId, row.portfolio.cityId)
            : sql`TRUE`,
          eq(mastersTable.isPublished, true),
          isNotNull(mastersTable.slug),
        ))
        .orderBy(
          desc(masterPortfolioTable.isFeatured),
          sql`${masterPortfolioTable.completedAt} DESC NULLS LAST`,
          desc(masterPortfolioTable.id),
        )
        .limit(RABOTY_SIMILAR_LIMIT);

      similar = sameSvcCity.map((s) => ({
        id: s.portfolio.id,
        slug: s.portfolio.slug,
        title: s.portfolio.title,
        beforePhotos: s.portfolio.beforePhotos,
        afterPhotos: s.portfolio.afterPhotos,
        priceFrom: s.portfolio.priceFrom,
        area: s.portfolio.area,
        service: s.service ? { name: s.service.name, slug: s.service.slug } : null,
        city: s.city ? { name: s.city.name, slug: s.city.slug } : null,
      }));

      // If not enough with city match, top up with same-service-only.
      if (similar.length < RABOTY_SIMILAR_LIMIT) {
        const need = RABOTY_SIMILAR_LIMIT - similar.length;
        const seen = new Set<number>(similar.map((s) => s.id));
        seen.add(row.portfolio.id);
        const sameSvc = await db
          .select({
            portfolio: masterPortfolioTable,
            service: { name: serviceTypesTable.name, slug: serviceTypesTable.slug },
            city: { name: citiesTable.name, slug: citiesTable.slug },
          })
          .from(masterPortfolioTable)
          .innerJoin(mastersTable, eq(masterPortfolioTable.masterId, mastersTable.id))
          .leftJoin(serviceTypesTable, eq(masterPortfolioTable.serviceTypeId, serviceTypesTable.id))
          .leftJoin(citiesTable, eq(masterPortfolioTable.cityId, citiesTable.id))
          .where(and(
            eq(masterPortfolioTable.isPublished, true),
            isNotNull(masterPortfolioTable.slug),
            eq(masterPortfolioTable.serviceTypeId, row.portfolio.serviceTypeId),
            eq(mastersTable.isPublished, true),
            isNotNull(mastersTable.slug),
          ))
          .orderBy(
            desc(masterPortfolioTable.isFeatured),
            sql`${masterPortfolioTable.completedAt} DESC NULLS LAST`,
            desc(masterPortfolioTable.id),
          )
          .limit(need + similar.length + 1);

        for (const s of sameSvc) {
          if (similar.length >= RABOTY_SIMILAR_LIMIT) break;
          if (seen.has(s.portfolio.id)) continue;
          seen.add(s.portfolio.id);
          similar.push({
            id: s.portfolio.id,
            slug: s.portfolio.slug,
            title: s.portfolio.title,
            beforePhotos: s.portfolio.beforePhotos,
            afterPhotos: s.portfolio.afterPhotos,
            priceFrom: s.portfolio.priceFrom,
            area: s.portfolio.area,
            service: s.service ? { name: s.service.name, slug: s.service.slug } : null,
            city: s.city ? { name: s.city.name, slug: s.city.slug } : null,
          });
        }
      }
    }

    setOkCache(res);

    // Aggregate stats for the master byline (Req 5 of the redesign):
    // portfolio count and completed orders. Two cheap aggregate queries
    // run in parallel — keeps the response under one round-trip overhead.
    // Iter 4: also resolve `isSavedByCurrentUser` from anonId in same wave.
    const [portfolioCountRow, completedOrdersRow, savedRow] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(masterPortfolioTable)
        .where(and(
          eq(masterPortfolioTable.masterId, row.master.id),
          eq(masterPortfolioTable.isPublished, true),
        )),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(ordersTable)
        .where(and(
          eq(ordersTable.masterId, row.master.id),
          eq(ordersTable.status, "completed"),
          isNull(ordersTable.deletedAt),
        )),
      anonId
        ? db
          .select({ id: userSavesTable.id })
          .from(userSavesTable)
          .where(and(
            eq(userSavesTable.anonId, anonId),
            eq(userSavesTable.portfolioId, row.portfolio.id),
          ))
          .limit(1)
        : Promise.resolve([] as Array<{ id: number }>),
    ]);

    res.json({
      portfolio: {
        id: row.portfolio.id,
        slug: row.portfolio.slug,
        title: row.portfolio.title,
        description: row.portfolio.description,
        beforePhotos: row.portfolio.beforePhotos,
        afterPhotos: row.portfolio.afterPhotos,
        priceFrom: row.portfolio.priceFrom,
        priceTo: row.portfolio.priceTo,
        area: row.portfolio.area,
        durationDays: row.portfolio.durationDays,
        housingType: row.portfolio.housingType,
        estimate: row.portfolio.estimate,
        completedAt: row.portfolio.completedAt,
        clientReviewText: row.portfolio.clientReviewText,
        clientRating: row.portfolio.clientRating,
        isFeatured: row.portfolio.isFeatured,
        saveCount: row.portfolio.saveCount,
        service: row.service ? { name: row.service.name, slug: row.service.slug } : null,
        city: row.city ? { name: row.city.name, slug: row.city.slug } : null,
      },
      master: toMasterDto(row.master),
      masterStats: {
        portfolioCount: Number(portfolioCountRow[0]?.n ?? 0),
        completedOrders: Number(completedOrdersRow[0]?.n ?? 0),
      },
      similar,
      isSavedByCurrentUser: savedRow.length > 0,
    });
  } catch (e: unknown) {
    console.error("[marketplace/raboty/:slug]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/raboty/market-stats — average price across similar
// published cases (plan §22 Iteration 3, Requirement 7).
//
// "Similar" = same service AND area within ±30% of the target. Aggregation
// returns 25th and 75th percentiles (P25–P75 reads more honest than
// avg±stdev). One round-trip with optional FILTER clause for the city
// bucket.
//
// Visibility rules (the UI also enforces these defensively):
//   • russia.count < 5 → response shape still returned, frontend hides block
//   • city.count < 3 → response.city = null
//
// Caching: per-(service, area-bucket, city) for 1 hour via in-process LRU.
// ─────────────────────────────────────────────────────────────────────────────

const MARKET_STATS_AREA_TOLERANCE = 0.3;

router.get("/raboty/market-stats", async (req, res) => {
  const serviceSlug = typeof req.query["serviceSlug"] === "string" ? req.query["serviceSlug"].trim() : "";
  const citySlugParam = typeof req.query["citySlug"] === "string" ? req.query["citySlug"].trim() : "";
  const citySlug = citySlugParam.length > 0 ? citySlugParam : null;
  const areaTargetRaw = parseFloat(String(req.query["areaTarget"] ?? ""));

  if (!serviceSlug) {
    res.status(400).json({ error: "missing_service_slug" });
    return;
  }
  if (!Number.isFinite(areaTargetRaw) || areaTargetRaw <= 0 || areaTargetRaw > 1000) {
    res.status(400).json({ error: "invalid_area_target" });
    return;
  }

  // Cache hit — return as-is. Cache TTL is 1h so a freshly-published case
  // appears in stats with at most an hour of lag. Acceptable for v1.
  const cached = getCachedMarketStats(serviceSlug, areaTargetRaw, citySlug);
  if (cached) {
    setOkCache(res);
    res.json(cached);
    return;
  }

  try {
    // 1. Resolve service slug → id + name.
    const [service] = await db
      .select({ id: serviceTypesTable.id, name: serviceTypesTable.name })
      .from(serviceTypesTable)
      .where(and(eq(serviceTypesTable.slug, serviceSlug), eq(serviceTypesTable.isActive, true)))
      .limit(1);
    if (!service) {
      res.status(404).json({ error: "service_not_found" });
      return;
    }

    // 2. Resolve city slug → id + name (optional).
    let cityId: number | null = null;
    let cityName: string | null = null;
    if (citySlug) {
      const [city] = await db
        .select({ id: citiesTable.id, name: citiesTable.name })
        .from(citiesTable)
        .where(and(eq(citiesTable.slug, citySlug), eq(citiesTable.isActive, true)))
        .limit(1);
      if (city) {
        cityId = city.id;
        cityName = city.name;
      }
    }

    // 3. Aggregate. PERCENTILE_CONT is the canonical SQL way to compute
    // continuous percentiles; the FILTER clause restricts the city bucket
    // without a second query.
    const areaMin = (areaTargetRaw * (1 - MARKET_STATS_AREA_TOLERANCE)).toFixed(2);
    const areaMax = (areaTargetRaw * (1 + MARKET_STATS_AREA_TOLERANCE)).toFixed(2);

    const aggRows = await db.execute(sql`
      WITH similar AS (
        SELECT
          ${masterPortfolioTable.priceFrom}::numeric AS price,
          ${masterPortfolioTable.cityId} AS city_id
        FROM ${masterPortfolioTable}
        WHERE ${masterPortfolioTable.isPublished} = true
          AND ${masterPortfolioTable.serviceTypeId} = ${service.id}
          AND ${masterPortfolioTable.area} IS NOT NULL
          AND ${masterPortfolioTable.area}::numeric BETWEEN ${areaMin}::numeric AND ${areaMax}::numeric
          AND ${masterPortfolioTable.priceFrom} IS NOT NULL
          AND ${masterPortfolioTable.priceFrom}::numeric > 0
      )
      SELECT
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price) AS russia_p25,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price) AS russia_p75,
        COUNT(*)::int AS russia_count,
        ${cityId != null ? sql`
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price)
            FILTER (WHERE city_id = ${cityId}) AS city_p25,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price)
            FILTER (WHERE city_id = ${cityId}) AS city_p75,
          COUNT(*) FILTER (WHERE city_id = ${cityId})::int AS city_count
        ` : sql`
          NULL::numeric AS city_p25,
          NULL::numeric AS city_p75,
          0::int AS city_count
        `}
      FROM similar
    `);

    // drizzle's `db.execute(sql\`...\`)` returns a node-postgres-like result
    // with `.rows`. Cast loosely — we have a single row by construction.
    const row = (aggRows as unknown as { rows: Array<Record<string, unknown>> }).rows[0]
      ?? (aggRows as unknown as Array<Record<string, unknown>>)[0]
      ?? {};

    const russiaCount = Number(row["russia_count"] ?? 0);
    const cityCount = Number(row["city_count"] ?? 0);

    const response: MarketStatsResponse = {
      russia: {
        p25: Math.round(Number(row["russia_p25"] ?? 0)),
        p75: Math.round(Number(row["russia_p75"] ?? 0)),
        count: russiaCount,
      },
      city: cityId != null && cityName != null && cityCount >= 3
        ? {
          p25: Math.round(Number(row["city_p25"] ?? 0)),
          p75: Math.round(Number(row["city_p75"] ?? 0)),
          count: cityCount,
          cityName,
        }
        : null,
      areaTarget: areaTargetRaw,
      serviceName: service.name,
    };

    setCachedMarketStats(serviceSlug, areaTargetRaw, citySlug, response);

    setOkCache(res);
    res.json(response);
  } catch (e: unknown) {
    console.error("[marketplace/raboty/market-stats]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/marketplace/raboty/:slug/save — toggle save (plan §22 Iteration 4).
//
// Body: { anonId: UUID v4 }
// Cookie management lives on the marketplace Next.js side; here we just
// receive the validated UUID and toggle.
//
// Logic:
//   1. Validate UUID, resolve slug → portfolio_id (must be published)
//   2. Try INSERT user_saves(anon_id, portfolio_id) in a transaction
//      • On success → save_count + 1, return { saved: true }
//      • On unique-violation → DELETE existing row, save_count - 1, return { saved: false }
//
// Race-safe via the partial unique index `(anon_id, portfolio_id) WHERE anon_id IS NOT NULL`.
// ─────────────────────────────────────────────────────────────────────────────

const saveToggleSchema = z.object({
  anonId: z.string().uuid(),
});

// node-postgres unique-violation code
const PG_UNIQUE_VIOLATION = "23505";

router.post("/raboty/:slug/save", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const { slug } = req.params as { slug?: string };
  if (!slug) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const parsed = saveToggleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }
  const { anonId } = parsed.data;

  try {
    // 1. Resolve slug → portfolio_id (must be published).
    const [portfolio] = await db
      .select({ id: masterPortfolioTable.id })
      .from(masterPortfolioTable)
      .where(and(
        eq(masterPortfolioTable.slug, slug),
        eq(masterPortfolioTable.isPublished, true),
      ))
      .limit(1);
    if (!portfolio) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // 2. Toggle in a transaction. Try INSERT first; on unique conflict → DELETE.
    const result = await db.transaction(async (tx): Promise<{ saved: boolean; count: number }> => {
      try {
        await tx.insert(userSavesTable).values({ anonId, portfolioId: portfolio.id });
        const [updated] = await tx
          .update(masterPortfolioTable)
          .set({ saveCount: sql`${masterPortfolioTable.saveCount} + 1` })
          .where(eq(masterPortfolioTable.id, portfolio.id))
          .returning({ count: masterPortfolioTable.saveCount });
        return { saved: true, count: Number(updated?.count ?? 0) };
      } catch (err: unknown) {
        // PostgreSQL unique violation → row already existed → toggle to unsave.
        const code = (err as { code?: string } | null)?.code;
        if (code !== PG_UNIQUE_VIOLATION) throw err;
        await tx
          .delete(userSavesTable)
          .where(and(
            eq(userSavesTable.anonId, anonId),
            eq(userSavesTable.portfolioId, portfolio.id),
          ));
        const [updated] = await tx
          .update(masterPortfolioTable)
          .set({ saveCount: sql`GREATEST(${masterPortfolioTable.saveCount} - 1, 0)` })
          .where(eq(masterPortfolioTable.id, portfolio.id))
          .returning({ count: masterPortfolioTable.saveCount });
        return { saved: false, count: Number(updated?.count ?? 0) };
      }
    });

    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[marketplace/raboty/:slug/save]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/marketplace/saves — list cases saved by current anon_id.
//
// Query: ?anonId=<uuid> (required)
// Returns: same shape as /raboty list items (RabotyListItem-compatible).
// Powers `/izbrannoe` page on marketplace side.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/saves", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const anonIdParam = typeof req.query["anonId"] === "string" ? req.query["anonId"] : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(anonIdParam)) {
    res.status(400).json({ error: "invalid_anon_id" });
    return;
  }
  const anonId = anonIdParam.toLowerCase();

  try {
    const [portfolioRows, designRows] = await Promise.all([
      db
        .select({
          portfolio: masterPortfolioTable,
          service: { name: serviceTypesTable.name, slug: serviceTypesTable.slug },
          city: { name: citiesTable.name, slug: citiesTable.slug },
          master: {
            id: mastersTable.id,
            slug: mastersTable.slug,
            alias: mastersTable.alias,
            publicTitle: mastersTable.publicTitle,
            avatarUrl: mastersTable.customAvatarUrl,
            publicRating: mastersTable.publicRating,
            publicReviewsCount: mastersTable.publicReviewsCount,
            city: mastersTable.city,
          },
          savedAt: userSavesTable.createdAt,
        })
        .from(userSavesTable)
        .innerJoin(masterPortfolioTable, eq(userSavesTable.portfolioId, masterPortfolioTable.id))
        .innerJoin(mastersTable, eq(masterPortfolioTable.masterId, mastersTable.id))
        .leftJoin(serviceTypesTable, eq(masterPortfolioTable.serviceTypeId, serviceTypesTable.id))
        .leftJoin(citiesTable, eq(masterPortfolioTable.cityId, citiesTable.id))
        .where(and(
          eq(userSavesTable.anonId, anonId),
          // Hide unpublished cases — master could have unpublished after the user saved.
          eq(masterPortfolioTable.isPublished, true),
          eq(mastersTable.isPublished, true),
          isNotNull(mastersTable.slug),
        ))
        .orderBy(desc(userSavesTable.createdAt))
        .limit(100),

      // AI-designs saves (added in AI-designer Iter 3).
      db
        .select({
          id: designsTable.id,
          slug: designsTable.slug,
          roomType: designsTable.roomType,
          style: designsTable.style,
          h1: designsTable.h1,
          resultImageUrl: designsTable.resultImageUrl,
          viewCount: designsTable.viewCount,
          saveCount: designsTable.saveCount,
          savedAt: userSavesTable.createdAt,
        })
        .from(userSavesTable)
        .innerJoin(designsTable, eq(userSavesTable.aiDesignId, designsTable.id))
        .where(and(
          eq(userSavesTable.anonId, anonId),
          eq(designsTable.isPublic, true),
          eq(designsTable.status, "completed"),
        ))
        .orderBy(desc(userSavesTable.createdAt))
        .limit(100),
    ]);

    res.json({
      items: portfolioRows.map((r) => ({
        id: r.portfolio.id,
        slug: r.portfolio.slug,
        title: r.portfolio.title,
        description: r.portfolio.description,
        beforePhotos: r.portfolio.beforePhotos,
        afterPhotos: r.portfolio.afterPhotos,
        priceFrom: r.portfolio.priceFrom,
        priceTo: r.portfolio.priceTo,
        area: r.portfolio.area,
        completedAt: r.portfolio.completedAt,
        clientReviewText: r.portfolio.clientReviewText,
        clientRating: r.portfolio.clientRating,
        isFeatured: r.portfolio.isFeatured,
        saveCount: r.portfolio.saveCount,
        service: r.service ? { name: r.service.name, slug: r.service.slug } : null,
        city: r.city ? { name: r.city.name, slug: r.city.slug } : null,
        master: {
          id: r.master.id,
          slug: r.master.slug,
          alias: r.master.alias,
          publicTitle: r.master.publicTitle,
          avatarUrl: r.master.avatarUrl,
          publicRating: r.master.publicRating,
          publicReviewsCount: r.master.publicReviewsCount ?? 0,
          city: r.master.city,
        },
        savedAt: r.savedAt,
      })),
      designs: designRows,
      total: portfolioRows.length + designRows.length,
    });
  } catch (e: unknown) {
    console.error("[marketplace/saves]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /real-price/:workSlug/:citySlug ─────────────────────────────────────
// Real Price (spec: .kiro/specs/real-price). Публичный агрегат цен для страниц
// /ceny: (вид работ × город) + разбивка по ЖК. Данные из price_aggregates
// (percentile-медиана, порог индексации). Auth — bearer (router-level).
router.get("/real-price/:workSlug/:citySlug", async (req, res) => {
  const workSlug = String(req.params["workSlug"] ?? "").trim();
  const citySlug = String(req.params["citySlug"] ?? "").trim();
  if (!workSlug || !citySlug) {
    res.status(400).json({ error: "missing_params" });
    return;
  }
  try {
    const [workType] = await db
      .select({ id: workTypesTable.id, slug: workTypesTable.slug, name: workTypesTable.name, category: workTypesTable.category, defaultUnit: workTypesTable.defaultUnit })
      .from(workTypesTable)
      .where(and(eq(workTypesTable.slug, workSlug), eq(workTypesTable.isActive, true)))
      .limit(1);
    if (!workType) {
      res.status(404).json({ error: "work_type_not_found" });
      return;
    }
    const [city] = await db
      .select({ slug: citiesTable.slug, name: citiesTable.name, nameIn: citiesTable.nameIn })
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

    const cityAggregate = rows.find((r) => r.keyType === "work_city") ?? null;
    const zhk = rows
      .filter((r) => r.keyType === "work_zhk")
      .sort((a, b) => b.n - a.n);

    setOkCache(res);
    res.json({
      workType: { slug: workType.slug, name: workType.name, category: workType.category, unit: workType.defaultUnit },
      city: { slug: city.slug, name: city.name, nameIn: city.nameIn ?? null },
      cityAggregate,
      zhk,
    });
  } catch (e) {
    console.error("[marketplace/real-price]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /real-price/check — проверятор чужой сметы (spec: real-price, Req 7) ─
// Тело: { citySlug, items:[{description, unit?, quantity?, price}] }. Для каждой
// позиции: нормализация к словарю → сравнение цены за единицу с медианой рынка
// → вердикт «светофора» (green/yellow/red/unknown). Данных нет/мало → unknown.
router.post("/real-price/check", async (req, res) => {
  const body = (req.body ?? {}) as { citySlug?: unknown; items?: unknown };
  const citySlug = String(body.citySlug ?? "").trim();
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!citySlug || rawItems.length === 0) {
    res.status(400).json({ error: "missing_params" });
    return;
  }
  if (rawItems.length > 60) {
    res.status(400).json({ error: "too_many_items" });
    return;
  }
  try {
    const [city] = await db
      .select({ slug: citiesTable.slug, name: citiesTable.name })
      .from(citiesTable)
      .where(and(eq(citiesTable.slug, citySlug), eq(citiesTable.isActive, true)))
      .limit(1);
    if (!city) {
      res.status(404).json({ error: "city_not_found" });
      return;
    }

    const workTypes: (WorkTypeLite & { serviceTypeId: number | null })[] = (
      await db
        .select({
          id: workTypesTable.id,
          slug: workTypesTable.slug,
          name: workTypesTable.name,
          category: workTypesTable.category,
          defaultUnit: workTypesTable.defaultUnit,
          synonyms: workTypesTable.synonyms,
          serviceTypeId: workTypesTable.serviceTypeId,
        })
        .from(workTypesTable)
        .where(eq(workTypesTable.isActive, true))
    ).map((w) => ({ ...w, synonyms: w.synonyms ?? [] }));
    const wtById = new Map(workTypes.map((w) => [w.id, w]));

    const aggRows = await db
      .select()
      .from(priceAggregatesTable)
      .where(and(eq(priceAggregatesTable.city, city.name), eq(priceAggregatesTable.keyType, "work_city")));
    const aggByWork = new Map(aggRows.map((a) => [a.workTypeId, a]));

    // Копим «интерес» к услуге по совпавшим видам работ — для подсказки услуги
    // при конверсии в лид (Req 7.3). Вес — сумма позиции (кол-во×цена), иначе 1.
    const serviceWeights = new Map<number, number>();

    const items = (rawItems as Array<Record<string, unknown>>).slice(0, 60).map((li) => {
      const description = String(li?.["description"] ?? "").trim().slice(0, 200);
      const price = Number(li?.["price"]);
      const unit = li?.["unit"] != null ? String(li["unit"]).trim().slice(0, 24) : null;
      const quantity = li?.["quantity"] != null && Number.isFinite(Number(li["quantity"])) ? Number(li["quantity"]) : null;
      const dp = derivePricePoint({ description, unit, quantity, price }, workTypes);
      if (!dp) {
        return { description, price: Number.isFinite(price) ? price : null, matched: null, yourUnitPrice: null, verdict: "unknown" as const, note: "не распознан вид работ" };
      }
      const wt = wtById.get(dp.workTypeId);
      if (wt?.serviceTypeId != null) {
        const w = (dp.quantity != null ? dp.unitPrice * dp.quantity : dp.unitPrice) || 1;
        serviceWeights.set(wt.serviceTypeId, (serviceWeights.get(wt.serviceTypeId) ?? 0) + w);
      }
      const matched = { name: wt?.name ?? "", unit: dp.unit };
      const agg = aggByWork.get(dp.workTypeId) ?? null;
      if (!agg || agg.n < 3) {
        return { description, price, matched, yourUnitPrice: dp.unitPrice, verdict: "unknown" as const, note: "мало подтверждённых сделок по этому виду работ" };
      }
      if (dp.quantity == null) {
        return { description, price, matched, yourUnitPrice: dp.unitPrice, verdict: "unknown" as const, note: "укажите количество и единицу — иначе не сравнить с ценой за единицу" };
      }
      const p50 = agg.p50 != null ? Number(agg.p50) : null;
      const p25 = agg.p25 != null ? Number(agg.p25) : null;
      const p75 = agg.p75 != null ? Number(agg.p75) : null;
      return {
        description,
        matched,
        yourUnitPrice: dp.unitPrice,
        quantity: dp.quantity,
        median: p50,
        p25,
        p75,
        n: agg.n,
        verdict: verdictForPrice(dp.unitPrice, p50, p75),
      };
    });

    const summary = { green: 0, yellow: 0, red: 0, unknown: 0 };
    for (const it of items) summary[it.verdict] += 1;

    // Подсказка услуги для лида: доминирующая по «интересу» услуга совпавших
    // видов работ; иначе — первая активная услуга со slug (общий ремонт).
    let suggestedService: { slug: string; name: string } | null = null;
    let dominantServiceId: number | null = null;
    let best = -1;
    for (const [sid, w] of serviceWeights) {
      if (w > best) {
        best = w;
        dominantServiceId = sid;
      }
    }
    if (dominantServiceId != null) {
      const [s] = await db
        .select({ slug: serviceTypesTable.slug, name: serviceTypesTable.name })
        .from(serviceTypesTable)
        .where(and(eq(serviceTypesTable.id, dominantServiceId), eq(serviceTypesTable.isActive, true), isNotNull(serviceTypesTable.slug)))
        .limit(1);
      if (s?.slug) suggestedService = { slug: s.slug, name: s.name };
    }
    if (!suggestedService) {
      const [fallback] = await db
        .select({ slug: serviceTypesTable.slug, name: serviceTypesTable.name })
        .from(serviceTypesTable)
        .where(and(eq(serviceTypesTable.isActive, true), isNotNull(serviceTypesTable.slug)))
        .orderBy(asc(serviceTypesTable.sortOrder), asc(serviceTypesTable.id))
        .limit(1);
      if (fallback?.slug) suggestedService = { slug: fallback.slug, name: fallback.name };
    }

    res.json({ city: { slug: city.slug, name: city.name }, items, summary, suggestedService });
  } catch (e) {
    console.error("[marketplace/real-price/check]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /real-price/parse-estimate — LLM-разбор фото/PDF сметы (Req 7.4) ────
// multipart field `file` (image/* | application/pdf, ≤12MB). Возвращает
// { items:[{description,unit,quantity,price}] } для предзаполнения проверятора.
// Фича изолирована: без ключа OpenAI → 503, существующий флоу не затрагивается.
const estimateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
});

router.post("/real-price/parse-estimate", estimateUpload.single("file"), async (req, res) => {
  const file = (req as unknown as { file?: { buffer: Buffer; mimetype: string } }).file;
  if (!file) {
    res.status(400).json({ error: "no_file" });
    return;
  }
  if (!ACCEPTED_ESTIMATE_MIME.has(file.mimetype)) {
    res.status(415).json({ error: "unsupported_type" });
    return;
  }
  try {
    const items = await parseEstimateFile({ buffer: file.buffer, mimeType: file.mimetype });
    res.json({ items });
  } catch (e) {
    if (e instanceof EstimateParserDisabledError) {
      res.status(503).json({ error: "parser_unconfigured" });
      return;
    }
    console.error("[marketplace/real-price/parse-estimate]", e instanceof Error ? e.message : e);
    res.status(502).json({ error: "parse_failed" });
  }
});

// ─── GET /price-index — индекс цен на ремонт по месяцам (Real Price, Req 8) ──
// scope: ?city=<slug> (город) либо без параметра (страна). Считаем на лету из
// price_points — данных немного, материализация избыточна.
router.get("/price-index", async (req, res) => {
  try {
    const citySlug = typeof req.query["city"] === "string" ? req.query["city"].trim() : "";
    let cityName: string | null = null;
    let scope: { type: "national" } | { type: "city"; slug: string; name: string } = { type: "national" };
    if (citySlug && citySlug !== "all") {
      const [city] = await db
        .select({ slug: citiesTable.slug, name: citiesTable.name })
        .from(citiesTable)
        .where(and(eq(citiesTable.slug, citySlug), eq(citiesTable.isActive, true)))
        .limit(1);
      if (!city) {
        res.status(404).json({ error: "city_not_found" });
        return;
      }
      cityName = city.name;
      scope = { type: "city", slug: city.slug!, name: city.name };
    }

    const rows = await db
      .select({
        workTypeId: pricePointsTable.workTypeId,
        unitPrice: pricePointsTable.unitPrice,
        closedAt: pricePointsTable.closedAt,
      })
      .from(pricePointsTable)
      .where(cityName ? eq(pricePointsTable.city, cityName) : isNotNull(pricePointsTable.workTypeId));

    const index = buildPriceIndex(
      rows.map((r) => ({ workTypeId: r.workTypeId, unitPrice: Number(r.unitPrice), closedAt: r.closedAt })),
    );

    setOkCache(res);
    res.json({ scope, ...index });
  } catch (e) {
    console.error("[marketplace/price-index]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /object/:slug — публичная кейс-страница Объекта (Real Price) ─────────
// Опубликованный Объект (receipt is_published) со сметой по этапам, фото до/после
// (с заказа) и мастером (без данных клиента/точного адреса — приватность Req 9).
router.get("/object/:slug", async (req, res) => {
  const slug = String(req.params["slug"] ?? "").trim();
  if (!slug) {
    res.status(400).json({ error: "missing_slug" });
    return;
  }
  try {
    const [obj] = await db
      .select()
      .from(receiptsTable)
      .where(and(eq(receiptsTable.slug, slug), eq(receiptsTable.isPublished, true)))
      .limit(1);
    if (!obj) {
      res.status(404).json({ error: "object_not_found" });
      return;
    }
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, obj.orderId)).limit(1);
    const [master] = obj.masterId
      ? await db.select().from(mastersTable).where(eq(mastersTable.id, obj.masterId)).limit(1)
      : [];

    setOkCache(res);
    res.json({
      object: {
        slug: obj.slug,
        objectType: obj.objectType,
        serviceType: obj.serviceType,
        city: obj.city,
        district: obj.district,
        zhk: obj.zhk,
        area: obj.area,
        totalAmount: obj.totalAmount,
        stages: obj.stages ?? [],
        publishedAt: obj.publishedAt,
        photosBefore: order?.photosBefore ?? [],
        photosAfter: order?.photosAfter ?? [],
        durationDays: null,
      },
      master:
        master && master.isPublished
          ? {
              slug: master.slug,
              name: master.publicTitle?.trim() || master.alias?.trim() || `Мастер #${master.id}`,
              specialization: master.specialization,
              city: master.city,
              rating: master.publicRating ?? master.rating,
              reviewsCount: master.publicReviewsCount ?? 0,
              yearsExperience: master.yearsExperience,
            }
          : null,
    });
  } catch (e) {
    console.error("[marketplace/object]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
