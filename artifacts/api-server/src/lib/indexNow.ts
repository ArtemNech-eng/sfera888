/**
 * IndexNow integration — instant URL submission to Yandex / Bing / Naver.
 *
 * Plan: MARKETPLACE_PRODUCTION_PLAN.md §11.8.7.
 *
 * Without IndexNow, search engines discover new URLs through sitemap crawls
 * (1-4 weeks for new pages on a low-authority domain). With IndexNow we
 * submit the URL the moment it changes and get indexed in hours.
 *
 * Architecture:
 *   - INDEXNOW_KEY env (32-char hex) is shared between this server and the
 *     marketplace. The marketplace serves it at `/api/indexnow-key` so
 *     Yandex/Bing can verify ownership before accepting submissions.
 *   - This module ONLY pings the API. We never block the calling request:
 *     fire-and-forget, errors logged but not thrown.
 *   - We submit to Yandex (yandex.com/indexnow). Yandex shares submissions
 *     with Bing and Naver automatically through the IndexNow consortium,
 *     so one POST covers all participating engines.
 *
 * Limits:
 *   - Yandex accepts max 10 000 URLs per submission. We chunk if needed.
 *   - Rate limit: roughly 10 000 URLs / day / domain (Yandex), enough for
 *     incremental updates but NOT for full-domain re-submission. Don't use
 *     this for sitemap-style bulk pings — only for per-change events.
 *   - Repeated submissions of the same URL are deduplicated by Yandex.
 */

declare const console: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void; log: (...args: unknown[]) => void };

const INDEXNOW_ENDPOINT = "https://yandex.com/indexnow";

/** Max URLs per single POST per IndexNow spec. */
const MAX_URLS_PER_BATCH = 10_000;

/** Per-call timeout — IndexNow is for fast paths, no point waiting longer. */
const TIMEOUT_MS = 5_000;

/**
 * Convert a marketplace path (e.g. `/master/ivan-petrov`) to an absolute URL
 * pointing at MARKETPLACE_PUBLIC_URL. Filters out paths IndexNow doesn't care
 * about (sitemap.xml, robots.txt, /api/*).
 */
function pathToIndexableUrl(path: string, base: string): string | null {
  if (!path) return null;
  // IndexNow expects content URLs only, not service / API endpoints.
  if (path.startsWith("/api/") || path.startsWith("/sitemap") || path === "/robots.txt") return null;
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/+$/, "")}${trimmed}`;
}

/**
 * Submit a list of full URLs (or relative paths) to IndexNow.
 *
 * Fire-and-forget: never throws. Returns the number of URLs actually sent
 * (after filtering and chunking). 0 means nothing was sent (config missing
 * or all paths filtered out).
 */
export async function pingIndexNow(input: string[]): Promise<number> {
  const key = process.env["INDEXNOW_KEY"];
  const base = process.env["MARKETPLACE_PUBLIC_URL"];
  if (!key || !base) {
    // Disabled by config — silent. Logged at INFO not WARN to avoid noise
    // during local dev where IndexNow isn't expected to work.
    return 0;
  }

  // Build absolute URL list, dedupe, drop disallowed paths.
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of input) {
    if (!raw) continue;
    let url: string | null;
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      url = raw;
    } else {
      url = pathToIndexableUrl(raw, base);
    }
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  if (urls.length === 0) return 0;

  // Sanity-check the host matches our base — IndexNow rejects cross-host
  // submissions outright. If we ever pass a mismatched URL it's a bug.
  const baseHost = new URL(base).host;
  const filtered = urls.filter((u) => {
    try { return new URL(u).host === baseHost; } catch { return false; }
  });
  if (filtered.length === 0) return 0;

  // keyLocation tells search engines where to fetch the key file. Our
  // marketplace serves it at /api/indexnow-key (see app/api/indexnow-key/route.ts).
  const keyLocation = `${base.replace(/\/+$/, "")}/api/indexnow-key`;

  let totalSent = 0;
  for (let i = 0; i < filtered.length; i += MAX_URLS_PER_BATCH) {
    const batch = filtered.slice(i, i + MAX_URLS_PER_BATCH);
    const ok = await postBatch(baseHost, key, keyLocation, batch);
    if (ok) totalSent += batch.length;
  }
  return totalSent;
}

async function postBatch(
  host: string,
  key: string,
  keyLocation: string,
  urlList: string[],
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation, urlList }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[indexnow] status=${res.status} batch=${urlList.length}`);
      return false;
    }
    console.log(`[indexnow] submitted ${urlList.length} URL(s)`);
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[indexnow] error: ${msg}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
