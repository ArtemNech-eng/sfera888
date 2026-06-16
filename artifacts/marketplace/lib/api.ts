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
 */
export async function fetchMaster(slug: string): Promise<MasterDetailResponse | null> {
  try {
    return await call<MasterDetailResponse>(`/master/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof MarketplaceApiError && e.status === 404) return null;
    throw e;
  }
}
