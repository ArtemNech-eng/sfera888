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
} from "@workspace/db";
import { and, asc, desc, eq, gte, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { notifyManagerNewLead } from "../managerBot.js";

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

export default router;
