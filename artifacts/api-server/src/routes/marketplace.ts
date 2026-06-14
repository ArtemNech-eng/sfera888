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
