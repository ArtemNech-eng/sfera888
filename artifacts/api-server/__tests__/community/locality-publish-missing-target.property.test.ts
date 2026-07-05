// Feature: community-generalized-locality, Property 17: Publish to nonexistent target is rejected
//
// Property test for publish-to-missing-target (Community Generalized Locality, Стадия 2).
//
// **Property 17: Publish to nonexistent target is rejected**
//   *For any* publish request targeting a nonexistent Locality or nonexistent
//   City, the system SHALL reject the publication, create neither a thread nor a
//   Locality nor a City, and return a missing-target error.
//
// **Validates: Requirements 8.5**
//
// ── What is under test ────────────────────────────────────────────────────────
// The REAL production publish path `FeedService.createPublicQuestion`
// (`src/lib/feedService.ts`). Before inserting, that method resolves the target:
// a `zhkId` is looked up in `zhk`, a `cityId` in `cities`; if the target row does
// not exist it returns `{ status: "rejected", reason: "no_target" }` WITHOUT
// inserting a thread and WITHOUT creating the missing Locality/City (task 6.4).
// Property 17 quantifies exactly this over generated nonexistent ids: for any id
// matching no seeded row, publish must reject with a missing-target error and
// leave `community_threads`, `zhk`, and `cities` row counts unchanged.
//
// A contrast case (publishing to a SEEDED locality / city succeeds) is included
// so the rejection is proven to be due to the target's ABSENCE, not a blanket
// failure of the publish path.
//
// This test does NOT re-implement the resolution in memory; it drives the actual
// `createPublicQuestion` against a real Postgres and inspects the stored state.
//
// ── DB harness (matches the repo's DB-backed convention) ──────────────────────
// Mirrors the sibling `locality-thread-scoping.property.test.ts` (task 6.5):
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS.
//     It NEVER fakes a pass and NEVER weakens assertions to dodge the DB.
//
// `FeedService` is explicitly injectable (`constructor(database = db)`). Each
// iteration runs inside a single `db.transaction(...)` that is ALWAYS rolled
// back:
//   1. Create an ephemeral schema `publish_target_prop_test` on the SET LOCAL
//      search_path, with throwaway `cities` + `zhk` + `community_threads` tables
//      (no FKs) so the run is self-contained and needs only a reachable
//      Postgres, not a migrated one.
//   2. Seed one City and one Locality of a GENERATED kind (the ONLY existing
//      rows), so any other id is guaranteed nonexistent.
//   3. Run the REAL `new FeedService(tx).createPublicQuestion(...)` against
//      generated NONEXISTENT locality / city ids and assert rejection +
//      unchanged row counts (0 threads created, 0 localities, 0 cities added).
//      Then a contrast publish to the seeded target asserts success.
//   4. Throw a rollback sentinel → the transaction (schema, tables, data) is
//      discarded; nothing leaks between iterations.
//
// Iterations: `{ numRuns: 100 }` when a Postgres is reachable.
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/locality-publish-missing-target.property.test.ts

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

// ─── Constants ────────────────────────────────────────────────────────────────

/** Locality_Kind values — target validation must reject regardless of kind. */
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

/** Valid Local_Feed categories (category is OPTIONAL for public questions). */
const LOCAL_FEED_CATEGORIES = [
  "utility_incident",
  "developer_defect",
  "tool_sharing",
  "local_recommendation",
] as const;

// ─── Generators ────────────────────────────────────────────────────────────────

/** Non-empty title after trim, within varchar(200) bound. */
const titleArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 60 })
  .map((s) => `t ${s}`.slice(0, 200))
  .filter((s) => s.trim().length >= 1);

/** Body: any string (may be empty) within the 5000-char service bound. */
const bodyArb: fc.Arbitrary<string> = fc.string({ maxLength: 200 });

/** Category: absent (null) OR one of the valid categories. */
const categoryArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant<string | null>(null),
  fc.constantFrom<string>(...LOCAL_FEED_CATEGORIES),
);

/**
 * A missing-target scenario: the kind of the ONE seeded locality (contrast) plus
 * positive offsets used to derive ids that match no seeded row, plus the payload.
 */
const scenarioArb = fc.record({
  kind: fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
  // Offsets added to the seeded ids to build guaranteed-nonexistent ids.
  localityOffset: fc.integer({ min: 1, max: 1_000_000 }),
  cityOffset: fc.integer({ min: 1, max: 1_000_000 }),
  title: titleArb,
  body: bodyArb,
  category: categoryArb,
});

// ─── Ephemeral-schema DDL (no FKs — self-contained) ───────────────────────────

const CREATE_CITIES = `
  CREATE TABLE cities (
    id serial PRIMARY KEY,
    name text NOT NULL,
    slug varchar(100)
  )
`;

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
  "Publish to nonexistent target — Property 17: rejected with missing-target error, nothing created (real createPublicQuestion, DB-backed)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 8.5

    const db = () => (dbmod as DbModule).db;
    const zhkTable = () => (dbmod as DbModule).zhkTable;
    const citiesTable = () => (dbmod as DbModule).citiesTable;
    const communityThreadsTable = () => (dbmod as DbModule).communityThreadsTable;
    const FeedService = () => (feedmod as FeedServiceModule).FeedService;
    const sql = () => sqlTag as NonNullable<typeof sqlTag>;

    /**
     * Run `fn(tx)` inside a transaction that is ALWAYS rolled back. The
     * ephemeral schema + tables created inside are discarded on rollback.
     */
    async function inRolledBackTx(fn: (tx: any) => Promise<void>): Promise<void> {
      try {
        await db().transaction(async (tx: any) => {
          await tx.execute(sql().raw("CREATE SCHEMA publish_target_prop_test"));
          await tx.execute(
            sql().raw("SET LOCAL search_path TO publish_target_prop_test"),
          );
          await tx.execute(sql().raw(CREATE_CITIES));
          await tx.execute(sql().raw(CREATE_ZHK));
          await tx.execute(sql().raw(CREATE_THREADS));
          await fn(tx);
          throw new RollbackSentinel();
        });
      } catch (err) {
        if (!(err instanceof RollbackSentinel)) throw err;
      }
    }

    /** Seed a City; return its real serial id. */
    async function seedCity(tx: any): Promise<number> {
      const [row] = await tx
        .insert(citiesTable())
        .values({ name: "Test City", slug: "test-city" })
        .returning({ id: citiesTable().id });
      return row.id as number;
    }

    /** Seed a Locality of the given kind bound to `cityId`; return its id. */
    async function seedLocality(
      tx: any,
      cityId: number,
      kind: LocalityKind,
    ): Promise<number> {
      const [row] = await tx
        .insert(zhkTable())
        .values({
          slug: `loc-${kind}`,
          name: `Locality ${kind}`,
          nameNormalized: `locality ${kind}`,
          cityId,
          kind,
        })
        .returning({ id: zhkTable().id });
      return row.id as number;
    }

    /** Count rows currently in a table on the ephemeral search_path. */
    async function countRows(tx: any, table: any): Promise<number> {
      const rows = await tx.select().from(table);
      return rows.length as number;
    }

    let ready = false;
    before(() => {
      ready = dbAvailable && dbmod != null && feedmod != null && sqlTag != null;
    });
    after(async () => {
      if (dbmod) await (dbmod as DbModule).pool.end().catch(() => {});
    });

    it("publish to nonexistent locality/city → rejected 'no_target' and creates NOTHING; contrast seeded target succeeds", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          await inRolledBackTx(async (tx) => {
            const cityId = await seedCity(tx);
            const localityId = await seedLocality(tx, cityId, scenario.kind);

            // Ids that match NO seeded row (only city=cityId and locality=localityId exist).
            const missingLocalityId = localityId + scenario.localityOffset;
            const missingCityId = cityId + scenario.cityOffset;

            const svc = new (FeedService())(tx);

            // ── Baseline counts BEFORE any missing-target publish ─────────────
            const threadsBefore = await countRows(tx, communityThreadsTable());
            const localitiesBefore = await countRows(tx, zhkTable());
            const citiesBefore = await countRows(tx, citiesTable());
            assert.equal(threadsBefore, 0, "no threads should exist yet");
            assert.equal(localitiesBefore, 1, "exactly one seeded locality");
            assert.equal(citiesBefore, 1, "exactly one seeded city");

            // ── Publish to a NONEXISTENT locality → missing-target rejection ──
            const missingLocalityResult = await svc.createPublicQuestion({
              zhkId: missingLocalityId,
              category: scenario.category,
              title: scenario.title,
              body: scenario.body,
            });
            assert.equal(
              missingLocalityResult.status,
              "rejected",
              `publish to nonexistent locality (id=${missingLocalityId}) must be rejected, got ${JSON.stringify(missingLocalityResult)}`,
            );
            if (missingLocalityResult.status === "rejected") {
              assert.equal(
                missingLocalityResult.reason,
                "no_target",
                "rejection must indicate a missing target (no_target)",
              );
            }

            // ── Publish to a NONEXISTENT city → missing-target rejection ──────
            const missingCityResult = await svc.createPublicQuestion({
              cityId: missingCityId,
              category: scenario.category,
              title: scenario.title,
              body: scenario.body,
            });
            assert.equal(
              missingCityResult.status,
              "rejected",
              `publish to nonexistent city (id=${missingCityId}) must be rejected, got ${JSON.stringify(missingCityResult)}`,
            );
            if (missingCityResult.status === "rejected") {
              assert.equal(
                missingCityResult.reason,
                "no_target",
                "rejection must indicate a missing target (no_target)",
              );
            }

            // ── Nothing created: threads / localities / cities all unchanged ──
            const threadsAfter = await countRows(tx, communityThreadsTable());
            const localitiesAfter = await countRows(tx, zhkTable());
            const citiesAfter = await countRows(tx, citiesTable());
            assert.equal(
              threadsAfter,
              threadsBefore,
              "missing-target publishes must create NO thread (0 created)",
            );
            assert.equal(
              localitiesAfter,
              localitiesBefore,
              "missing-target publishes must create NO Locality (0 added)",
            );
            assert.equal(
              citiesAfter,
              citiesBefore,
              "missing-target publishes must create NO City (0 added)",
            );

            // ── Contrast: publishing to the SEEDED target SUCCEEDS ────────────
            // Proves the rejection above is due to the target's ABSENCE, not a
            // blanket failure of the publish path.
            const okLocality = await svc.createPublicQuestion({
              zhkId: localityId,
              category: scenario.category,
              title: scenario.title,
              body: scenario.body,
            });
            assert.equal(
              okLocality.status,
              "created",
              `publish to the seeded locality must succeed, got ${JSON.stringify(okLocality)}`,
            );

            const okCity = await svc.createPublicQuestion({
              cityId,
              category: scenario.category,
              title: scenario.title,
              body: scenario.body,
            });
            assert.equal(
              okCity.status,
              "created",
              `publish to the seeded city must succeed, got ${JSON.stringify(okCity)}`,
            );
          });
        }),
        { numRuns: 100 },
      );
    });
  },
);
