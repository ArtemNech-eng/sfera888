import "server-only";
import { internalApiBase, internalApiToken } from "./env";
import type {
  CalcCategory,
  CalculatorEstimate,
  City,
  Service,
  ServiceCityResponse,
  MasterDetailResponse,
  MasterListResponse,
  MarketplaceStats,
  MarketStatsResponse,
  RabotyListResponse,
  RabotyDetailResponse,
} from "./types";

/**
 * Server-only marketplace API client.
 *
 * `import "server-only"` makes Next.js bail the build if anyone imports this
 * from a client component, so the bearer token can never leak into the
 * browser bundle.
 *
 * All endpoints are protected by Bearer auth (INTERNAL_API_SHARED_TOKEN).
 */

interface FetchOpts {
  /** Cache TTL in seconds for SSR data fetches. Default 5 min. */
  revalidate?: number;
  /** When true, do not cache (used for forms / non-idempotent calls). */
  noStore?: boolean;
}

async function call<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const base = internalApiBase();
  const token = internalApiToken();
  const url = `${base.replace(/\/+$/, "")}/marketplace${path}`;
  const init: RequestInit & { next?: { revalidate?: number } } = {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: opts.noStore ? "no-store" : "force-cache",
  };
  if (!opts.noStore) {
    init.next = { revalidate: opts.revalidate ?? 300 };
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    // Don't echo the URL back into the page — it may carry query params.
    // Log the path only.
    throw new MarketplaceApiError(path, res.status);
  }
  return (await res.json()) as T;
}

/**
 * Convert an api-server-relative path (e.g. "/api/masters/avatar/foo.jpg")
 * into an absolute URL pointing to the api-server origin. Required because
 * marketplace pages run on `chestnye-mastera.ru` while the avatar/storage
 * proxy lives on `sfera-master.ru/api/...`. A relative `<img src="/api/…">`
 * would resolve against the marketplace host and 404.
 *
 * Already-absolute URLs (R2 direct, full https://) pass through unchanged.
 */
function absolutizeApiUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (!url.startsWith("/")) return url;
  try {
    const origin = new URL(internalApiBase()).origin;
    return `${origin}${url}`;
  } catch {
    return url;
  }
}

export class MarketplaceApiError extends Error {
  constructor(public readonly path: string, public readonly status: number) {
    super(`marketplace api ${path} -> ${status}`);
    this.name = "MarketplaceApiError";
  }
}

/** Returns active cities, sorted by name. Cached for 5 min by default. */
export async function fetchCities(): Promise<City[]> {
  const r = await call<{ items: City[] }>(`/cities`);
  return r.items;
}

/** Returns active service types, sorted by sortOrder + name. Cached for 5 min. */
export async function fetchServices(): Promise<Service[]> {
  const r = await call<{ items: Service[] }>(`/services`);
  return r.items;
}

/**
 * Returns slugs of every published master in the catalog. Paginates through
 * `/marketplace/masters` (which caps `limit=50`) until exhausted.
 *
 * Used by `app/sitemap.ts` to emit `/master/[slug]` URLs. Heavy enough to
 * be cached aggressively — 1 hour TTL on the sitemap covers it. Stops at a
 * safety ceiling of 50 pages × 50 masters = 2500 to avoid runaway loops if
 * the upstream returns an inconsistent `total`.
 */
export async function fetchPublishedMasterSlugs(): Promise<string[]> {
  const out: string[] = [];
  const limit = 50;
  const SAFETY_PAGE_CAP = 50;
  for (let page = 1; page <= SAFETY_PAGE_CAP; page++) {
    const r = await call<{
      items: Array<{ slug: string | null }>;
      page: number;
      limit: number;
      total: number;
    }>(`/masters?page=${page}&limit=${limit}`);
    for (const m of r.items) {
      if (typeof m.slug === "string" && m.slug.length > 0) out.push(m.slug);
    }
    const pagesNeeded = Math.ceil((r.total ?? 0) / limit);
    if (page >= pagesNeeded) break;
    if (r.items.length === 0) break;
  }
  return out;
}

/**
 * Returns the aggregate for a single (service, city) pair.
 * Returns null on 404 so the caller can call `notFound()`.
 */
export async function fetchServiceCity(
  serviceSlug: string,
  citySlug: string,
): Promise<ServiceCityResponse | null> {
  try {
    const data = await call<ServiceCityResponse>(
      `/service-city/${encodeURIComponent(serviceSlug)}/${encodeURIComponent(citySlug)}`,
    );
    // Absolutize avatar URLs for each master card so <img src> works
    // from the marketplace domain (api-server proxy lives on sfera-master.ru).
    for (const m of data.masters ?? []) {
      m.avatarUrl = absolutizeApiUrl(m.avatarUrl);
    }
    return data;
  } catch (e) {
    if (e instanceof MarketplaceApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Paginated list of published masters with optional filters by city / service.
 * Used by the public catalog `/mastera` and by SEO pages that want to surface
 * a "Top masters in X" section.
 */
export async function fetchMasters(opts: {
  citySlug?: string;
  serviceSlug?: string;
  page?: number;
  limit?: number;
} = {}): Promise<MasterListResponse> {
  const params = new URLSearchParams();
  if (opts.citySlug) params.set("citySlug", opts.citySlug);
  if (opts.serviceSlug) params.set("serviceSlug", opts.serviceSlug);
  if (opts.page && opts.page > 0) params.set("page", String(opts.page));
  if (opts.limit && opts.limit > 0) params.set("limit", String(Math.min(opts.limit, 50)));
  const qs = params.toString();
  const data = await call<MasterListResponse>(`/masters${qs ? `?${qs}` : ""}`);
  for (const m of data.items ?? []) {
    m.avatarUrl = absolutizeApiUrl(m.avatarUrl);
  }
  return data;
}

/**
 * Returns a single published master profile with portfolio + approved reviews.
 * Returns null on 404 so the caller can call `notFound()`.
 *
 * Cached for 5 min by default. Revalidation will be triggered by the
 * `/api/revalidate` webhook from CRM when this is wired up.
 *
 * Photo URLs in the response (avatar, portfolio before/after, review photos)
 * may come back as api-server-relative paths (e.g. "/api/masters/avatar/X").
 * We absolutize them here so `<img src>` works from the marketplace domain.
 */
export async function fetchMaster(slug: string): Promise<MasterDetailResponse | null> {
  try {
    const data = await call<MasterDetailResponse>(`/master/${encodeURIComponent(slug)}`);
    // Absolutize avatar
    data.master.avatarUrl = absolutizeApiUrl(data.master.avatarUrl);
    // Absolutize portfolio photos
    for (const p of data.portfolio ?? []) {
      if (Array.isArray(p.beforePhotos)) {
        p.beforePhotos = p.beforePhotos
          .map((u) => absolutizeApiUrl(u))
          .filter((u): u is string => !!u);
      }
      if (Array.isArray(p.afterPhotos)) {
        p.afterPhotos = p.afterPhotos
          .map((u) => absolutizeApiUrl(u))
          .filter((u): u is string => !!u);
      }
    }
    // Absolutize review photos
    for (const r of data.reviews ?? []) {
      if (Array.isArray(r.photos)) {
        r.photos = r.photos
          .map((u) => absolutizeApiUrl(u))
          .filter((u): u is string => !!u);
      }
    }
    return data;
  } catch (e) {
    if (e instanceof MarketplaceApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Paginated list of published portfolio cases (Houzz-model, /raboty fid).
 * Both filters are optional; when both are absent returns the global feed.
 *
 * Cached for 5 min by default. Revalidation triggered by the
 * `/api/revalidate` webhook from CRM when a case is published/unpublished.
 */
export async function fetchRabotyList(opts: {
  serviceSlug?: string;
  citySlug?: string;
  page?: number;
  limit?: number;
} = {}): Promise<RabotyListResponse> {
  const params = new URLSearchParams();
  if (opts.serviceSlug) params.set("serviceSlug", opts.serviceSlug);
  if (opts.citySlug) params.set("citySlug", opts.citySlug);
  if (opts.page && opts.page > 0) params.set("page", String(opts.page));
  if (opts.limit && opts.limit > 0) params.set("limit", String(Math.min(opts.limit, 50)));
  const qs = params.toString();
  const data = await call<RabotyListResponse>(`/raboty${qs ? `?${qs}` : ""}`);
  for (const item of data.items ?? []) {
    item.beforePhotos = (item.beforePhotos ?? []).map((u) => absolutizeApiUrl(u)).filter((u): u is string => !!u);
    item.afterPhotos = (item.afterPhotos ?? []).map((u) => absolutizeApiUrl(u)).filter((u): u is string => !!u);
    if (item.master) {
      item.master.avatarUrl = absolutizeApiUrl(item.master.avatarUrl);
    }
  }
  return data;
}

/**
 * Returns slugs of every published portfolio case. Used by /sitemap-raboty.xml
 * to enumerate /raboty/[slug] URLs. Paginates through /raboty (which caps
 * limit=50). Same safety ceiling as fetchPublishedMasterSlugs.
 */
export async function fetchPublishedCaseSlugs(): Promise<string[]> {
  const out: string[] = [];
  const limit = 50;
  const SAFETY_PAGE_CAP = 100;
  for (let page = 1; page <= SAFETY_PAGE_CAP; page++) {
    const r = await call<RabotyListResponse>(`/raboty?page=${page}&limit=${limit}`);
    for (const item of r.items) {
      if (typeof item.slug === "string" && item.slug.length > 0) out.push(item.slug);
    }
    const pagesNeeded = Math.ceil((r.total ?? 0) / limit);
    if (page >= pagesNeeded) break;
    if (r.items.length === 0) break;
  }
  return out;
}

/**
 * Returns a single published portfolio case by slug, with master profile
 * and similar cases. Returns null on 404.
 *
 * Used by `/raboty/[slug]` page. Photo URLs are absolutized so <img> works
 * from the marketplace domain.
 */
export async function fetchRabotyCase(slug: string): Promise<RabotyDetailResponse | null> {
  try {
    const data = await call<RabotyDetailResponse>(`/raboty/${encodeURIComponent(slug)}`);
    data.portfolio.beforePhotos = (data.portfolio.beforePhotos ?? [])
      .map((u) => absolutizeApiUrl(u)).filter((u): u is string => !!u);
    data.portfolio.afterPhotos = (data.portfolio.afterPhotos ?? [])
      .map((u) => absolutizeApiUrl(u)).filter((u): u is string => !!u);
    data.master.avatarUrl = absolutizeApiUrl(data.master.avatarUrl);
    for (const s of data.similar ?? []) {
      s.beforePhotos = (s.beforePhotos ?? []).map((u) => absolutizeApiUrl(u)).filter((u): u is string => !!u);
      s.afterPhotos = (s.afterPhotos ?? []).map((u) => absolutizeApiUrl(u)).filter((u): u is string => !!u);
    }
    return data;
  } catch (e) {
    if (e instanceof MarketplaceApiError && e.status === 404) return null;
    throw e;
  }
}


/**
 * Platform-wide aggregate stats for the homepage trust block. Cached for
 * 5 min — counts move slowly enough that this is plenty fresh, and the
 * homepage is the highest-traffic page on the site.
 */
export async function fetchMarketplaceStats(): Promise<MarketplaceStats> {
  return call<MarketplaceStats>(`/stats`);
}


/**
 * Renovation cost estimate (plan §19.3, §20.2 [6]). Server-side calibrated
 * coefficients live on api-server (see `lib/calculatorEngine.ts`); the
 * marketplace only renders. We use `noStore` because every input combination
 * has a unique answer and we don't want stale Edge entries.
 */
export async function fetchCalculatorEstimate(input: {
  citySlug: string | null;
  serviceSlug?: string | null;
  category: CalcCategory;
  areaSqm: number;
}): Promise<CalculatorEstimate> {
  const params = new URLSearchParams();
  if (input.citySlug) params.set("citySlug", input.citySlug);
  if (input.serviceSlug) params.set("serviceSlug", input.serviceSlug);
  params.set("category", input.category);
  params.set("areaSqm", String(input.areaSqm));
  return call<CalculatorEstimate>(`/calculator/estimate?${params.toString()}`, { noStore: true });
}

/**
 * Aggregate market stats for "similar" cases (plan §22 Iter 3). Cached at the
 * api-server side for 1 hour per (service, area-bucket, city) — Next-side
 * cache adds another 5 min, totalling ~1h freshness.
 */
export async function fetchMarketStats(input: {
  serviceSlug: string;
  areaTarget: number;
  citySlug: string | null;
}): Promise<MarketStatsResponse | null> {
  const params = new URLSearchParams();
  params.set("serviceSlug", input.serviceSlug);
  params.set("areaTarget", String(input.areaTarget));
  if (input.citySlug) params.set("citySlug", input.citySlug);
  try {
    return await call<MarketStatsResponse>(`/raboty/market-stats?${params.toString()}`);
  } catch (e) {
    if (e instanceof MarketplaceApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}
