/**
 * Server → marketplace-frontend revalidation webhook.
 *
 * Lets the api-server tell the marketplace Next.js artifact to re-render
 * specific paths immediately, instead of waiting for the ISR window
 * (default 60s). Used after:
 *
 *   - master self-publishes / unpublishes their profile;
 *   - operator overrides publication state in CRM;
 *   - portfolio item is published or removed (Iteration 2);
 *   - operator updates `service_city_overrides` (Iteration 11.6).
 *
 * Also pings IndexNow (Yandex/Bing/Naver) for the same paths so search
 * engines pick up the change in hours instead of weeks. See
 * `MARKETPLACE_PRODUCTION_PLAN.md §11.8.7`.
 *
 * The marketplace endpoint `/api/revalidate` calls Next.js `revalidatePath()`
 * for each path in the request body. Auth is the same shared token that
 * protects `/api/marketplace/*` (`MARKETPLACE_INGEST_TOKEN` on this side ≡
 * `INTERNAL_API_SHARED_TOKEN` on marketplace side, by config).
 *
 * Fire-and-forget: revalidation failures NEVER bubble up to the caller.
 * If the marketplace is down or misconfigured, master profile updates still
 * succeed — sitemap/page just lags by the ISR window. The function logs
 * warnings so operators can react.
 */

import { pingIndexNow } from "./indexNow.js";

declare const console: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

/**
 * Send a revalidation request to the marketplace frontend.
 *
 * @param paths Absolute paths to revalidate, e.g. `["/sitemap.xml", "/master/ivan-petrov", "/mastera"]`.
 *              Always pass `/sitemap.xml` (or relevant sub-sitemap) so search engines see the change.
 * @returns A promise that resolves regardless of success/failure. Errors are logged but not thrown.
 */
export async function revalidateMarketplacePaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  const baseUrl = process.env["MARKETPLACE_PUBLIC_URL"];
  const token = process.env["MARKETPLACE_INGEST_TOKEN"];

  if (!baseUrl || !token) {
    // Not an error — running locally / in staging without marketplace deploy.
    console.warn(
      "[marketplace-revalidate] skipping: MARKETPLACE_PUBLIC_URL or MARKETPLACE_INGEST_TOKEN not set",
    );
    return;
  }

  // 5-second timeout — revalidation is best-effort, we don't want to block
  // the master's PWA request just because marketplace is slow.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ paths }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(
        `[marketplace-revalidate] status=${res.status} for paths=${JSON.stringify(paths)}`,
      );
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[marketplace-revalidate] error for paths=${JSON.stringify(paths)}: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }

  // Ping IndexNow for content paths (sitemap.xml is filtered out inside
  // pingIndexNow). This runs after revalidation so the search engine
  // doesn't fetch a stale ISR cache when it crawls.
  pingIndexNow(paths).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[marketplace-revalidate] indexnow error: ${msg}`);
  });
}

/**
 * Default paths to revalidate when a master's publication state changes.
 *
 * Includes:
 *   - `/sitemap.xml` — so the master URL is added/removed promptly;
 *   - `/master/<slug>` — the profile page itself;
 *   - `/mastera` — the catalog listing where the master appears/disappears.
 */
export function masterPublicationPaths(slug: string | null | undefined): string[] {
  const paths = ["/sitemap.xml", "/mastera"];
  if (slug) paths.push(`/master/${slug}`);
  return paths;
}

/**
 * Default paths to revalidate when a portfolio case is added / edited /
 * unpublished / deleted.
 *
 * Includes:
 *   - `/sitemap.xml` — the case URL appears or disappears;
 *   - `/raboty` — the global feed where the case appears;
 *   - `/raboty/<caseSlug>` — the case page itself (only if slug is set);
 *   - `/master/<masterSlug>` — the master profile that aggregates cases.
 */
export function casePublicationPaths(
  masterSlug: string | null | undefined,
  caseSlug: string | null | undefined,
): string[] {
  const paths = ["/sitemap.xml", "/raboty"];
  if (caseSlug) paths.push(`/raboty/${caseSlug}`);
  if (masterSlug) paths.push(`/master/${masterSlug}`);
  return paths;
}
