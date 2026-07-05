// Feature: community-generalized-locality, Property 11: Empty feed for empty locality
//
// Property test for the empty Local_Feed of an empty Locality (Community
// Generalized Locality, Стадия 2).
//
// **Property 11: Empty feed for empty locality**
//   *For any* existing Locality of any Locality_Kind that has ZERO bound
//   Community_Threads, the Local_Feed SHALL be an empty feed (zero items) and
//   SHALL NOT raise an error.
//
// **Validates: Requirements 2.6**
//
// ── What is under test ────────────────────────────────────────────────────────
// The REAL production selection, i.e. `FeedService.getLocalFeed`
// (`src/lib/feedService.ts`). For a locality whose id is bound by NO matching
// thread, the base predicate
//     zone = 'sosedi' ∧ scope = 'zhk' ∧ zhk_id = <Locality.id> ∧
//     visibility = 'public'
// selects nothing, and `readFeed` returns `{ items: [], emptyState: true,
// nextCursor: null }` WITHOUT throwing. This test drives the actual
// `getLocalFeed` against a real Postgres and asserts that empty-but-error-free
// contract. It does NOT re-implement the SQL in memory.
//
// ── DB harness (mirrors task 6.2, locality-feed.property.test.ts) ─────────────
// Identical gating + transactional seam as the sibling Property 8 test:
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS.
//     It NEVER fakes a pass and NEVER weakens assertions to dodge the DB.
//   - Each iteration runs inside a single `db.transaction(...)` that is ALWAYS
//     rolled back: an ephemeral `feed_prop_test` schema with throwaway `zhk` +
//     `community_threads` tables (no FKs) is created on the local search_path,
//     the real `new FeedService(tx)` is exercised, then a rollback sentinel is
//     thrown so nothing leaks between iterations.
//
// Iterations: `{ numRuns: 100 }` when a Postgres is reachable (same policy as
// 6.2's main property).
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/locality-empty-feed.property.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import pg from "pg";

const { Pool } = pg;

// ─── Resolve a usable Postgres connection string ───────────────────────────────

const FAKE_URL = "postgres://test:test@localhost:5432/test";

function resolveDbUrl(): string | null {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (testUrl) return testUrl;
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl && dbUrl !== FAKE_URL) return dbUrl;
  return null;
}

const dbUrl = resolveDbUrl();
let dbAvailable = false;
let skipReason = "";

// Loaded lazily ONLY when a real Postgres is reachable (importing `@workspace/db`
// eagerly opens a pool against `DATABASE_URL`).
type DbModule = typeof import("@workspace/db");
type FeedServiceModule = typeof import("../../src/lib/feedService.js");
let dbmod: DbModule | null = null;
let feedmod: FeedServiceModule | null = null;
let sqlTag: typeof import("drizzle-orm").sql | null = null;

if (!dbUrl) {
  skipReason =
    "No real Postgres configured (set TEST_DATABASE_URL to a reachable Postgres).";
} else {
  // Probe connectivity with a throwaway pool before importing `@workspace/db`.
  let probePool: pg.Pool | null = null;
  try {
    probePool = new Pool({
      connectionString: dbUrl,
      max: 1,
      connectionTimeoutMillis: 3000,
    });
    const probe = await probePool.connect();
    await probe.query("SELECT 1");
    probe.release();
    dbAvailable = true;
  } catch (err) {
    skipReason = `Postgres not reachable at configured URL: ${(err as Error).message}`;
  } finally {
    if (probePool) await probePool.end().catch(() => {});
  }

  if (dbAvailable) {
    // Point `@workspace/db` at the resolved URL, THEN import it (and the real
    // FeedService + the `sql` tag) so the singleton pool binds to the real DB.
    process.env.DATABASE_URL = dbUrl;
    dbmod = await import("@workspace/db");
    feedmod = await import("../../src/lib/feedService.js");
    sqlTag = (await import("drizzle-orm")).sql;
  }
}

// ─── Local_Feed base-condition constants (reference, kept local) ──────────────
const SOSEDI_ZONE = "sosedi";
const SCOPE_ZHK = "zhk";
const SCOPE_CITY = "city";
const PUBLIC_VISIBILITY = "public";

/** Locality_Kind values — the feed logic must be identical for every one. */
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

// ─── Generators ────────────────────────────────────────────────────────────────

const createdAtArb: fc.Arbitrary<Date> = fc
  .constantFrom(
    Date.UTC(2026, 0, 1, 8, 0, 0),
    Date.UTC(2026, 0, 2, 12, 0, 0),
    Date.UTC(2026, 5, 10, 18, 45, 0),
  )
  .map((ms) => new Date(ms));

/**
 * A NOISE thread — deliberately constructed so it can NEVER match the target
 * locality's Local_Feed predicate. Every noise row is guaranteed to be excluded
 * by at least one of:
 *   • bound to another locality (`bindTo = "other"`)
 *   • bound to no locality at all (`bindTo = "null"`, city/pro-style)
 *   • a non-matching zone / scope / visibility
 * The target therefore always has ZERO bound threads.
 */
const noiseThreadArb = fc.record({
  // Bias toward "other"/"null" bindings; when it IS bound to the target it must
  // carry a non-matching zone/scope/visibility (enforced at seed time below).
  bindTo: fc.constantFrom("other", "null", "targetButNonMatching"),
  // The non-matching axis used when bindTo === "targetButNonMatching".
  nonMatch: fc.constantFrom("zone", "scope", "visibility"),
  createdAt: createdAtArb,
});

// The target locality kind (empty feed must hold for every kind), an optional
// second "other" locality kind to bind noise to, and 0..12 noise threads.
const scenarioArb = fc.record({
  targetKind: fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
  otherKind: fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
  hasOtherLocality: fc.boolean(),
  noise: fc.array(noiseThreadArb, { minLength: 0, maxLength: 12 }),
});

// ─── Ephemeral-schema DDL (no FKs — self-contained) ───────────────────────────

const CREATE_ZHK = `
  CREATE TABLE zhk (
    id serial PRIMARY KEY,
    slug varchar(100) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    name_normalized varchar(100) NOT NULL,
    city_id integer NOT NULL,
    kind varchar(16) NOT NULL DEFAULT 'zhk',
    developer varchar(200),
    completion_date varchar(40),
    buildings jsonb,
    status varchar(20) NOT NULL DEFAULT 'NON_LIVING',
    is_seeded boolean NOT NULL DEFAULT false,
    content_score integer NOT NULL DEFAULT 0,
    is_indexable boolean NOT NULL DEFAULT false,
    created_by_account_id integer,
    seo_title varchar(70),
    seo_description varchar(180),
    h1 varchar(100),
    body_md text,
    created_at timestamp NOT NULL DEFAULT now()
  )
`;

const CREATE_THREADS = `
  CREATE TABLE community_threads (
    id serial PRIMARY KEY,
    zone varchar(20) NOT NULL,
    scope varchar(10) NOT NULL,
    city_id integer,
    zhk_id integer,
    specialty_id integer,
    is_local boolean NOT NULL DEFAULT false,
    category varchar(40),
    title varchar(200) NOT NULL,
    body text NOT NULL,
    author_account_id integer,
    is_seeded boolean NOT NULL DEFAULT false,
    visibility varchar(12) NOT NULL DEFAULT 'public',
    moderation_status varchar(16) NOT NULL DEFAULT 'not_screened',
    last_activity_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now()
  )
`;

/** Rollback sentinel — thrown at the end of every iteration's transaction. */
class RollbackSentinel extends Error {}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "Local_Feed — Property 11: empty feed for empty locality (real getLocalFeed, DB-backed)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 2.6

    const db = () => (dbmod as DbModule).db;
    const zhkTable = () => (dbmod as DbModule).zhkTable;
    const communityThreadsTable = () => (dbmod as DbModule).communityThreadsTable;
    const FeedService = () => (feedmod as FeedServiceModule).FeedService;
    const MAX_FEED_LIMIT = () => (feedmod as FeedServiceModule).MAX_FEED_LIMIT;
    const sql = () => sqlTag as NonNullable<typeof sqlTag>;

    /**
     * Run `fn(tx)` inside a transaction that is ALWAYS rolled back. The
     * ephemeral schema + tables created inside are discarded on rollback.
     */
    async function inRolledBackTx(
      fn: (tx: any) => Promise<void>,
    ): Promise<void> {
      try {
        await db().transaction(async (tx: any) => {
          await tx.execute(sql().raw("CREATE SCHEMA feed_prop_test"));
          await tx.execute(sql().raw("SET LOCAL search_path TO feed_prop_test"));
          await tx.execute(sql().raw(CREATE_ZHK));
          await tx.execute(sql().raw(CREATE_THREADS));
          await fn(tx);
          throw new RollbackSentinel();
        });
      } catch (err) {
        if (!(err instanceof RollbackSentinel)) throw err;
      }
    }

    /** Seed one locality of the given kind; return its real serial id. */
    async function seedLocality(
      tx: any,
      index: number,
      kind: LocalityKind,
    ): Promise<number> {
      const [row] = await tx
        .insert(zhkTable())
        .values({
          slug: `loc-${index}`,
          name: `Locality ${index}`,
          nameNormalized: `locality ${index}`,
          cityId: 1,
          kind,
        })
        .returning({ id: zhkTable().id });
      return row.id as number;
    }

    let ready = false;
    before(() => {
      ready = dbAvailable && dbmod != null && feedmod != null && sqlTag != null;
    });
    after(async () => {
      if (dbmod) await (dbmod as DbModule).pool.end().catch(() => {});
    });

    it("getLocalFeed on a locality with ZERO bound threads returns an empty feed and does not throw", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          await inRolledBackTx(async (tx) => {
            // Target locality of arbitrary kind — its feed must be empty.
            const targetId = await seedLocality(tx, 0, scenario.targetKind);

            // Optional second locality that noise can be bound to; when absent,
            // "other" noise is bound to a foreign id that cannot equal target.
            const otherId = scenario.hasOtherLocality
              ? await seedLocality(tx, 1, scenario.otherKind)
              : targetId + 100000;

            // Seed noise that can NEVER match the target's Local_Feed predicate.
            for (const n of scenario.noise) {
              let zone = SOSEDI_ZONE;
              let scope = SCOPE_ZHK;
              let visibility = PUBLIC_VISIBILITY;
              let zhkId: number | null;

              if (n.bindTo === "other") {
                zhkId = otherId; // bound elsewhere → excluded
              } else if (n.bindTo === "null") {
                zhkId = null; // city/pro-style, no zhk binding → excluded
              } else {
                // Bound to the TARGET id but with a single non-matching axis so
                // it is still excluded by the predicate (proves filtering, not
                // just absence of rows).
                zhkId = targetId;
                if (n.nonMatch === "zone") zone = "pro_public";
                else if (n.nonMatch === "scope") scope = SCOPE_CITY;
                else visibility = "hidden";
              }

              await tx.insert(communityThreadsTable()).values({
                zone,
                scope,
                zhkId: zhkId ?? undefined,
                cityId: zhkId == null ? 1 : undefined,
                visibility,
                title: "noise",
                body: "noise body",
                createdAt: n.createdAt,
                lastActivityAt: n.createdAt,
              });
            }

            // Drive the REAL production selection.
            const svc = new (FeedService())(tx);
            const result = await svc.getLocalFeed(targetId, {
              limit: MAX_FEED_LIMIT(),
            });

            // Empty feed contract (Requirement 2.6): zero items, emptyState true,
            // no next page — and no error was thrown reaching this point.
            assert.deepEqual(
              result.items,
              [],
              "an empty locality must yield zero feed items",
            );
            assert.equal(
              result.emptyState,
              true,
              "empty feed must report emptyState = true",
            );
            assert.equal(
              result.nextCursor,
              null,
              "empty feed must have no next cursor",
            );
          });
        }),
        { numRuns: 100 },
      );
    });
  },
);
