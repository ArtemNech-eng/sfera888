import "server-only";

/**
 * Centralised env access. All reads go through these helpers so that:
 *   • a missing env var produces a clear error message at the call site,
 *   • secret values are never logged (the helpers don't print themselves),
 *   • `import "server-only"` keeps these symbols out of the client bundle.
 *
 * NEVER reference these from a client component. Use a route handler or a
 * server component to fetch and pass safe data down.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `[marketplace/env] ${name} is not set. ` +
      `Define it in the deployment environment before running marketplace.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

/** Public site URL, used for canonical metadata and sitemap absolute URLs. */
export function publicUrl(): string {
  return optional("MARKETPLACE_PUBLIC_URL", "https://chestnye-mastera.ru");
}

/**
 * ISR revalidation interval (in seconds) for the completed `/dizajn/{slug}`
 * `Public_Page`. Configurable via `DIZAJN_ISR_REVALIDATE_SECONDS`; defaults to
 * 3600 (one hour).
 *
 * A configured value of `0` means "fully static after the first generation":
 * the page is cached indefinitely and only refreshed via the on-demand
 * `revalidatePath` the worker fires on completion (see Requirement 9.5).
 *
 * Invalid, negative or non-numeric values fall back to the 3600 default.
 */
export function dizajnRevalidateSeconds(): number {
  const raw = process.env.DIZAJN_ISR_REVALIDATE_SECONDS;
  if (raw === undefined || raw.length === 0) return 3600;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 3600;
  return Math.floor(n);
}

/** Canonical host (no scheme), used for canonicalising redirects. */
export function canonicalHost(): string {
  return optional("MARKETPLACE_CANONICAL_HOST", "chestnye-mastera.ru");
}

/** Internal API base, e.g. "https://sfera-master.ru/api". REQUIRED. */
export function internalApiBase(): string {
  return required("INTERNAL_API_BASE_URL");
}

/** Internal API shared bearer token. REQUIRED, server-side only. */
export function internalApiToken(): string {
  return required("INTERNAL_API_SHARED_TOKEN");
}
