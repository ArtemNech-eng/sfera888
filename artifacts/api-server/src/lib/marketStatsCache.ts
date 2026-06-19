/**
 * In-process LRU cache for `/api/marketplace/raboty/market-stats` responses
 * (plan §22 Iteration 3).
 *
 * Why in-process rather than Redis: market-stats is read-heavy, idempotent,
 * and tolerant of stale data (an hour-old percentile is still useful — the
 * underlying caseload moves slowly). A 500-entry Map with TTL is enough for
 * the top thousand (service × area-bucket × city) combinations and avoids a
 * Redis dependency for v1.
 *
 * Key shape: `{serviceSlug}|{areaBucket(target)}|{citySlug ?? ''}`. The area
 * bucket consolidates close target values (e.g. 5 m² and 6 m² hit the same
 * key) so cache reuse is high without sacrificing accuracy.
 *
 * Eviction: once `MAX_ENTRIES` is reached, the oldest insertion-order entry
 * is dropped. JavaScript Map preserves insertion order, and re-setting on
 * read bumps the entry to the most-recently-used position.
 */

export interface CityBucket {
  p25: number;
  p75: number;
  count: number;
  cityName: string;
}

export interface MarketStatsResponse {
  /** Russia-wide bucket. `count < 5` is a signal to the UI to hide the section. */
  russia: { p25: number; p75: number; count: number };
  /** City bucket — only present when `citySlug` was passed AND `count >= 3`. */
  city: CityBucket | null;
  /** Echoed back for the headline («Ремонты ванной 4-6 м²»). */
  areaTarget: number;
  /** Same. */
  serviceName: string;
}

interface CacheEntry {
  value: MarketStatsResponse;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 500;

const cache = new Map<string, CacheEntry>();

/**
 * Round area target to a meaningful bucket. Smaller bucket size for small
 * areas (where a 1 m² difference matters), wider for large ones.
 */
function bucketArea(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  if (target <= 50) return Math.round(target);
  return Math.round(target / 5) * 5;
}

function buildKey(
  serviceSlug: string,
  areaTarget: number,
  citySlug: string | null,
): string {
  return `${serviceSlug}|${bucketArea(areaTarget)}|${citySlug ?? ""}`;
}

export function getCachedMarketStats(
  serviceSlug: string,
  areaTarget: number,
  citySlug: string | null,
): MarketStatsResponse | null {
  const key = buildKey(serviceSlug, areaTarget, citySlug);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  // LRU: re-insert to bump to most-recently-used position.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

export function setCachedMarketStats(
  serviceSlug: string,
  areaTarget: number,
  citySlug: string | null,
  value: MarketStatsResponse,
): void {
  const key = buildKey(serviceSlug, areaTarget, citySlug);
  // Bound the cache. Map iteration order is insertion order, so the first
  // key is the oldest non-recently-touched entry.
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey != null) cache.delete(firstKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}
