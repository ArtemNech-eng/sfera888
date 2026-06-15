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
