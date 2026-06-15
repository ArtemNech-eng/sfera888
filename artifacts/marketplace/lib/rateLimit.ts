import "server-only";

/**
 * Tiny in-memory rate limiter for the marketplace lead intake.
 *
 * Process-local Map. Suitable for the current single-instance Railway
 * deployment of `dynamic-illumination`. When we move to >1 replicas, swap
 * this for Redis / Upstash (the public surface — `checkLeadRateLimit` /
 * `recordLeadAttempt` — should stay the same).
 *
 * Limits (mirrors the spec):
 *   • per IP: ≤ 5 attempts within 60 s
 *   • per IP: ≥ 30 s between consecutive attempts
 *   • per phone: ≥ 5 min between consecutive attempts
 *
 * No phone or IP value is ever logged. Phones are normalised to the last
 * 10 digits before being used as a Map key, never echoed back.
 */

const IP_WINDOW_MS = 60_000;
const IP_BURST_MAX = 5;
const IP_COOLDOWN_MS = 30_000;
const PHONE_COOLDOWN_MS = 5 * 60_000;

// Hard caps so a hostile client cannot force the Map to grow unboundedly.
const IP_MAP_MAX = 5_000;
const PHONE_MAP_MAX = 20_000;

const ipAttempts = new Map<string, number[]>();
const phoneLastAt = new Map<string, number>();

export type RateLimitReason =
  | "ip_burst"
  | "ip_cooldown"
  | "phone_cooldown";

export interface RateLimitResult {
  allowed: boolean;
  reason?: RateLimitReason;
  /** Suggested wait in seconds before next attempt (best-effort, for Retry-After). */
  retryAfterSec?: number;
}

export interface RateLimitInput {
  ip: string | undefined;
  /** Optional — when absent, only the IP rules apply. */
  phone?: string;
}

/** Strips formatting; keeps last 10 digits so "+7 (999) 123-45-67" and "89991234567" hash to the same key. */
function normalisePhone(raw: string | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function ipKey(ip: string | undefined): string {
  if (!ip) return "anon";
  // Cap length so a very long X-Forwarded-For chain segment cannot bloat keys.
  return ip.length > 64 ? ip.slice(0, 64) : ip;
}

/**
 * Read-only check: does NOT record the attempt. Call `recordLeadAttempt`
 * after the upstream request succeeds (or whenever you want this attempt
 * to count toward the next decision).
 */
export function checkLeadRateLimit(input: RateLimitInput): RateLimitResult {
  const now = Date.now();
  const ipK = ipKey(input.ip);
  const phK = normalisePhone(input.phone);

  // IP burst window: drop expired entries inline.
  const fresh = (ipAttempts.get(ipK) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (fresh.length >= IP_BURST_MAX) {
    const oldest = fresh[0]!;
    return {
      allowed: false,
      reason: "ip_burst",
      retryAfterSec: Math.max(1, Math.ceil((IP_WINDOW_MS - (now - oldest)) / 1000)),
    };
  }
  if (fresh.length > 0) {
    const last = fresh[fresh.length - 1]!;
    const sinceLast = now - last;
    if (sinceLast < IP_COOLDOWN_MS) {
      return {
        allowed: false,
        reason: "ip_cooldown",
        retryAfterSec: Math.max(1, Math.ceil((IP_COOLDOWN_MS - sinceLast) / 1000)),
      };
    }
  }

  if (phK.length > 0) {
    const last = phoneLastAt.get(phK);
    if (last !== undefined) {
      const sinceLast = now - last;
      if (sinceLast < PHONE_COOLDOWN_MS) {
        return {
          allowed: false,
          reason: "phone_cooldown",
          retryAfterSec: Math.max(1, Math.ceil((PHONE_COOLDOWN_MS - sinceLast) / 1000)),
        };
      }
    }
  }

  return { allowed: true };
}

/** Record this attempt. Call after `checkLeadRateLimit` returns allowed. */
export function recordLeadAttempt(input: RateLimitInput): void {
  const now = Date.now();
  const ipK = ipKey(input.ip);
  const phK = normalisePhone(input.phone);

  const fresh = (ipAttempts.get(ipK) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  fresh.push(now);
  ipAttempts.set(ipK, fresh);

  if (phK.length > 0) {
    phoneLastAt.set(phK, now);
  }

  // Light GC pass when the maps grow: drop entries outside their relevant
  // window so we don't hold memory for IPs / phones we'll never block again.
  if (ipAttempts.size > IP_MAP_MAX) {
    for (const [k, arr] of ipAttempts) {
      const live = arr.filter((t) => now - t < IP_WINDOW_MS);
      if (live.length === 0) ipAttempts.delete(k);
      else ipAttempts.set(k, live);
    }
  }
  if (phoneLastAt.size > PHONE_MAP_MAX) {
    for (const [k, t] of phoneLastAt) {
      if (now - t > PHONE_COOLDOWN_MS * 2) phoneLastAt.delete(k);
    }
  }
}

/** Test/debug only — not exported via barrel. */
export function __resetRateLimitForTest(): void {
  ipAttempts.clear();
  phoneLastAt.clear();
}
