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
} from "@workspace/db";
import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";

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
  // service_prices, voronka_column_id, working_hours, preferred_districts,
  // min_area, last_seen_at, last_cancel_at, etc.
  return {
    id: m.id,
    slug: m.slug,
    alias: m.alias,
    publicTitle: m.publicTitle,
    publicBio: m.publicBio,
    city: m.city,
    specialization: m.specialization,
    specializations: m.specializations,
    rating: m.rating,
    publicRating: m.publicRating,
    publicReviewsCount: m.publicReviewsCount,
    yearsExperience: m.yearsExperience,
    avatarUrl: m.customAvatarUrl,
    hasContract: m.contractSignedAt != null,
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

    // Phase 1 skeleton: no masters published yet — empty list.
    // When portfolio/publication flow lands, this is where we'll filter
    // mastersTable by city.name AND service.name in `specializations`.
    const masters: ReturnType<typeof toMasterDto>[] = [];

    const serviceDto = toServiceDto(service);
    const cityDto = toCityDto(city);

    const stats = {
      mastersCount: masters.length,
      minPrice: service.priceFrom ?? null,
      avgRating: null as number | null,
      reviewsCount: 0,
    };

    const cityForUrl = city.nameIn ?? city.name;
    const seo = {
      title: service.seoTitle ?? `${service.h1 ?? service.name} в ${cityForUrl}`,
      description: service.seoDescription
        ?? `Услуги «${service.name}» в городе ${cityForUrl}. Опытные мастера с проверенными отзывами.`,
      h1: service.h1 ?? `${service.name} в ${cityForUrl}`,
    };

    setOkCache(res);
    res.json({ service: serviceDto, city: cityDto, masters, stats, seo });
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
// portfolio/reviews are empty for now (no entries yet, will be filled when
// CRM publication UI is built).
// ─────────────────────────────────────────────────────────────────────────────
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
    setOkCache(res);
    res.json({
      master: toMasterDto(master),
      portfolio: [],
      reviews: [],
    });
  } catch (e: unknown) {
    console.error("[marketplace/master]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
