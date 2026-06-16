import "server-only";
import { internalApiBase, internalApiToken } from "./env";
import type {
  City,
  Service,
  ServiceCityResponse,
  MasterDetailResponse,
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
    return await call<ServiceCityResponse>(
      `/service-city/${encodeURIComponent(serviceSlug)}/${encodeURIComponent(citySlug)}`,
    );
  } catch (e) {
    if (e instanceof MarketplaceApiError && e.status === 404) return null;
    throw e;
  }
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
