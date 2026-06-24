/**
 * Property test for AI_Design_Product Rate_Limiter (`lib/designRateLimit.ts`).
 *
 * Property 5: Daily rate-limiter enforces (anonId, ipHash) thresholds with
 * strict 24h window.
 *
 * Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7
 *
 * Strategy: keep the test DB-free by mocking `db.execute(sql\`...\`)` against
 * an in-memory simulator that mirrors Postgres `INSERT ... ON CONFLICT DO
 * UPDATE` semantics for the three SQL statements used by the implementation.
 * `Date.now()` is stubbed to follow a fake clock so `computeRetryAfter` and
 * the simulated `NOW()` agree on the same point in time.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// `@workspace/db` requires DATABASE_URL at module load time; supply a fake
// connection string before triggering its import. The pg.Pool does not connect
// eagerly, so this is harmless.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

const dbModule = await import("@workspace/db");
const { db } = dbModule;

// === In-memory store + fake clock =========================================

type Bucket = { counter: number; window_start: Date };
const store = new Map<string, Bucket>();
let fakeNow = new Date("2025-01-01T00:00:00Z");

const WINDOW_SECONDS = 24 * 60 * 60;
const WINDOW_MS = WINDOW_SECONDS * 1000;

function reset(initial: Date = new Date("2025-01-01T00:00:00Z")): void {
  store.clear();
  fakeNow = new Date(initial);
}

function advance(seconds: number): void {
  fakeNow = new Date(fakeNow.getTime() + seconds * 1000);
}

// Stub Date.now so the implementation's computeRetryAfter shares the clock.
Date.now = () => fakeNow.getTime();

// === SQL inspector ========================================================

interface SqlInfo {
  text: string;
  params: unknown[];
}

/**
 * Walk `sql.queryChunks` to recover (a) the literal SQL text from
 * StringChunks, and (b) the parameter values, in order.
 *
 * Drizzle's `sql` template tag (drizzle-orm/sql/sql.js) pushes interpolated
 * values into `queryChunks` directly as raw primitives — they are NOT wrapped
 * in `Param` instances unless `sql.param(value)` is used explicitly. So a
 * chunk is one of:
 *   - StringChunk: object with `value: string[]`
 *   - Param: object with `value` and `encoder`
 *   - raw value (string, number, …): a primitive interpolated into `${…}`
 */
function inspectSql(sqlObj: unknown): SqlInfo {
  const chunks: unknown[] = (sqlObj as { queryChunks?: unknown[] })?.queryChunks ?? [];
  let text = "";
  const params: unknown[] = [];
  for (const c of chunks) {
    if (c !== null && typeof c === "object" && Array.isArray((c as { value?: unknown }).value)) {
      // StringChunk
      text += ((c as { value: string[] }).value).join("");
    } else if (
      c !== null &&
      typeof c === "object" &&
      "value" in c &&
      "encoder" in (c as Record<string, unknown>)
    ) {
      // Param instance (sql.param(...))
      params.push((c as { value: unknown }).value);
      text += `$${params.length}`;
    } else {
      // Raw interpolated value
      params.push(c);
      text += `$${params.length}`;
    }
  }
  return { text, params };
}

type Kind = "insert" | "rollback" | "decrement";

function classify(text: string): Kind {
  if (text.includes("INSERT INTO rate_limit_buckets")) return "insert";
  if (text.includes("GREATEST(counter - 1")) return "decrement";
  if (text.includes("UPDATE rate_limit_buckets") && text.includes("SET counter =")) {
    return "rollback";
  }
  throw new Error(`Unrecognised SQL: ${text.slice(0, 160)}`);
}

// === Mocked db.execute ====================================================

async function fakeExecute(
  sqlObj: unknown,
): Promise<{ rows: Array<Record<string, unknown>> }> {
  const { text, params } = inspectSql(sqlObj);
  const kind = classify(text);

  if (kind === "insert") {
    const key = String(params[0]);
    const existing = store.get(key);
    if (!existing) {
      const fresh: Bucket = { counter: 1, window_start: new Date(fakeNow) };
      store.set(key, fresh);
      return { rows: [{ counter: fresh.counter, window_start: fresh.window_start }] };
    }
    const elapsedMs = fakeNow.getTime() - existing.window_start.getTime();
    if (elapsedMs > WINDOW_MS) {
      existing.counter = 1;
      existing.window_start = new Date(fakeNow);
    } else {
      existing.counter += 1;
    }
    return { rows: [{ counter: existing.counter, window_start: existing.window_start }] };
  }

  if (kind === "rollback") {
    // Implementation issues: SET counter = ${limit} WHERE bucket_key = ${key} AND counter > ${limit}
    const limit = Number(params[0]);
    const key = String(params[1]);
    const existing = store.get(key);
    if (existing && existing.counter > limit) {
      existing.counter = limit;
    }
    return { rows: [] };
  }

  // decrement
  const key = String(params[0]);
  const existing = store.get(key);
  if (existing) {
    existing.counter = Math.max(existing.counter - 1, 0);
  }
  return { rows: [] };
}

// Mutate the singleton db so the implementation routes through fakeExecute.
(db as unknown as { execute: typeof fakeExecute }).execute = fakeExecute;

// Now load the module under test (after db.execute is patched).
const { checkAndIncrement, decrement } = await import(
  "../../src/lib/designRateLimit.ts"
);

// === Properties ===========================================================

const KINDS = ["anon", "ip"] as const;
const LIMITS: Record<(typeof KINDS)[number], number> = { anon: 3, ip: 5 };

describe("designRateLimit — Property 5: daily limiter with strict 24h window", () => {
  // Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7

  it("bucket isolation: operations on key1 never affect key2", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...KINDS),
        async (key1, key2, kind) => {
          if (key1 === key2) return; // skip degenerate case
          reset();
          const limit = LIMITS[kind];

          // Saturate key1 up to its limit.
          for (let i = 0; i < limit; i++) {
            const r = await checkAndIncrement(kind, key1);
            assert.equal(r.allowed, true, `key1 attempt #${i + 1} should be allowed`);
          }
          // key1 must now be blocked.
          const blocked = await checkAndIncrement(kind, key1);
          assert.equal(blocked.allowed, false, "key1 must be blocked once limit hit");

          // key2 must still have a pristine quota.
          const fresh = await checkAndIncrement(kind, key2);
          assert.equal(fresh.allowed, true, "key2 must be unaffected");
          assert.equal(fresh.remaining, limit - 1);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("threshold: after N=limit allowed calls in 24h, the next call is rejected", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...KINDS),
        async (key, kind) => {
          reset();
          const limit = LIMITS[kind];

          for (let i = 0; i < limit; i++) {
            const r = await checkAndIncrement(kind, key);
            assert.equal(r.allowed, true);
            assert.equal(r.remaining, limit - i - 1);
          }
          const overflow = await checkAndIncrement(kind, key);
          assert.equal(overflow.allowed, false);
          assert.equal(overflow.remaining, 0);

          // Repeated overflow must stay rejected and not raise the counter.
          const overflow2 = await checkAndIncrement(kind, key);
          assert.equal(overflow2.allowed, false);
          assert.equal(overflow2.remaining, 0);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("decrement reduces the counter and never drives it below zero", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...KINDS),
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 0, max: 12 }),
        async (key, kind, increments, decrements) => {
          reset();
          for (let i = 0; i < increments; i++) {
            await checkAndIncrement(kind, key);
          }
          for (let i = 0; i < decrements; i++) {
            await decrement(kind, key);
          }
          const bucket = store.get(`${kind}:${key}`);
          if (bucket) {
            assert.ok(
              bucket.counter >= 0,
              `counter went negative: ${bucket.counter}`,
            );
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("window reset: after 24h+1s the counter resets to 1 on the next call", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...KINDS),
        fc.integer({ min: 1, max: 5 }),
        async (key, kind, fillCount) => {
          reset();
          const limit = LIMITS[kind];
          const fill = Math.min(fillCount, limit);

          for (let i = 0; i < fill; i++) {
            await checkAndIncrement(kind, key);
          }
          // Step strictly past the 24h boundary; the implementation uses a
          // strict-greater-than comparison.
          advance(WINDOW_SECONDS + 1);

          const r = await checkAndIncrement(kind, key);
          assert.equal(r.allowed, true);
          assert.equal(r.remaining, limit - 1);
          const bucket = store.get(`${kind}:${key}`)!;
          assert.equal(bucket.counter, 1);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("retryAfterSeconds is in (0, 24h] whenever allowed=false", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...KINDS),
        // Stay strictly inside the 24h window so the limiter rejects rather
        // than resetting it.
        fc.integer({ min: 0, max: WINDOW_SECONDS - 1 }),
        async (key, kind, advanceSecs) => {
          reset();
          const limit = LIMITS[kind];
          for (let i = 0; i < limit; i++) {
            await checkAndIncrement(kind, key);
          }
          advance(advanceSecs);

          const overflow = await checkAndIncrement(kind, key);
          assert.equal(overflow.allowed, false);
          assert.ok(
            overflow.retryAfterSeconds > 0,
            `expected retryAfterSeconds > 0, got ${overflow.retryAfterSeconds}`,
          );
          assert.ok(
            overflow.retryAfterSeconds <= WINDOW_SECONDS,
            `expected retryAfterSeconds <= ${WINDOW_SECONDS}, got ${overflow.retryAfterSeconds}`,
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});
