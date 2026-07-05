// Feature: community-generalized-locality, Property 16: Thread scoping reuses existing scope mechanism
//
// Property test for thread scoping (Community Generalized Locality, Стадия 2).
//
// **Property 16: Thread scoping reuses existing scope mechanism**
//   *For any* Locality of any kind, a published thread SHALL be stored with
//   `scope = 'zhk'` bound to that Locality's id; and *for any* City, a published
//   city thread SHALL be stored with `scope = 'city'` bound to that City's id.
//
// **Validates: Requirements 8.1, 8.3**
//
// ── What is under test ────────────────────────────────────────────────────────
// The REAL production publish path that determines the stored (scope, zhk_id /
// city_id) tuple, i.e. `FeedService.createPublicQuestion`
// (`src/lib/feedService.ts`). That method is the seam wired by task 6.4: given a
// locality target it INSERTs `scope = 'zhk'`, `zhk_id = <locality.id>`,
// `city_id = NULL`; given a city target it INSERTs `scope = 'city'`,
// `city_id = <city.id>`, `zhk_id = NULL`. It also validates target existence
// against `zhk` / `cities` before inserting. The scope decision + the stored
// binding are the exact behavior Property 16 quantifies over EVERY Locality_Kind
// (`zhk` | `district` | `settlement`) — proving the district/settlement threads
// reuse the identical `scope = 'zhk'` mechanism as ЖК.
//
// This test does NOT re-implement the insert in memory; it drives the actual
// `createPublicQuestion` against a real Postgres and inspects the row it stored
// (the `.returning()` row is the stored record).
//
// ── DB harness (matches the repo's DB-backed convention) ──────────────────────
// Mirrors `locality-feed.property.test.ts` / `migration-locality-kind...`:
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS.
//     It NEVER fakes a pass and NEVER weakens assertions to dodge the DB.
//
// `FeedService` is explicitly injectable (`constructor(database = db)`). Each
// iteration runs inside a single `db.transaction(...)` that is ALWAYS rolled
// back:
//   1. Create an ephemeral schema `thread_scope_prop_test` on the SET LOCAL
//      search_path, with throwaway `cities` + `zhk` + `community_threads` tables
//      (no FKs) so the run is self-contained and needs only a reachable
//      Postgres, not a migrated one.
//   2. Seed a City and a Locality of a GENERATED kind (zhk / district /
//      settlement).
//   3. Run the REAL `new FeedService(tx).createPublicQuestion(...)` for the
//      locality target and for the city target, and assert the stored scope +
//      binding.
//   4. Throw a rollback sentinel → the transaction (schema, tables, data) is
//      discarded; nothing leaks between iterations.
//
// Iterations: `{ numRuns: 100 }` when a Postgres is reachable.
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/locality-thread-scoping.property.test.ts

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

// ─── Scope / zone constants (reference, kept local) ───────────────────────────
const SCOPE_ZHK = "zhk";
const SCOPE_CITY = "city";

/** Locality_Kind values — thread scoping must be identical for every one. */
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

/** A publish scenario over a locality of a generated kind + a city. */
const scenarioArb = fc.record({
  kind: fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
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
  "Thread scoping — Property 16: scope='zhk' for any locality kind, scope='city' for city (real createPublicQuestion, DB-backed)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 8.1, 8.3

    const db = () => (dbmod as DbModule).db;
    const zhkTable = () => (dbmod as DbModule).zhkTable;
    const citiesTable = () => (dbmod as DbModule).citiesTable;
    const FeedService = () => (feedmod as FeedServiceModule).FeedService;
    const sql = () => sqlTag as NonNullable<typeof sqlTag>;

    /**
     * Run `fn(tx)` inside a transaction that is ALWAYS rolled back. The
     * ephemeral schema + tables created inside are discarded on rollback.
     */
    async function inRolledBackTx(fn: (tx: any) => Promise<void>): Promise<void> {
      try {
        await db().transaction(async (tx: any) => {
          await tx.execute(sql().raw("CREATE SCHEMA thread_scope_prop_test"));
          await tx.execute(
            sql().raw("SET LOCAL search_path TO thread_scope_prop_test"),
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

    let ready = false;
    before(() => {
      ready = dbAvailable && dbmod != null && feedmod != null && sqlTag != null;
    });
    after(async () => {
      if (dbmod) await (dbmod as DbModule).pool.end().catch(() => {});
    });

    it("locality thread → scope='zhk' bound to locality id (any kind); city thread → scope='city' bound to city id", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          await inRolledBackTx(async (tx) => {
            const cityId = await seedCity(tx);
            const localityId = await seedLocality(tx, cityId, scenario.kind);

            const svc = new (FeedService())(tx);

            // ── Locality thread (any kind) → scope='zhk', zhk_id=locality.id ──
            const localResult = await svc.createPublicQuestion({
              zhkId: localityId,
              category: scenario.category,
              title: scenario.title,
              body: scenario.body,
            });

            assert.equal(
              localResult.status,
              "created",
              `locality publish (kind=${scenario.kind}) should succeed, got ${JSON.stringify(localResult)}`,
            );
            if (localResult.status !== "created") return;
            const localThread = localResult.thread;
            assert.equal(
              localThread.scope,
              SCOPE_ZHK,
              `locality thread (kind=${scenario.kind}) must be stored with scope='zhk'`,
            );
            assert.equal(
              localThread.zhkId,
              localityId,
              `locality thread must be bound to the locality id (kind=${scenario.kind})`,
            );
            assert.equal(
              localThread.cityId,
              null,
              `locality thread must not be bound to a city (kind=${scenario.kind})`,
            );

            // ── City thread → scope='city', city_id=city.id, zhk_id NULL ──────
            const cityResult = await svc.createPublicQuestion({
              cityId,
              category: scenario.category,
              title: scenario.title,
              body: scenario.body,
            });

            assert.equal(
              cityResult.status,
              "created",
              `city publish should succeed, got ${JSON.stringify(cityResult)}`,
            );
            if (cityResult.status !== "created") return;
            const cityThread = cityResult.thread;
            assert.equal(
              cityThread.scope,
              SCOPE_CITY,
              "city thread must be stored with scope='city'",
            );
            assert.equal(
              cityThread.cityId,
              cityId,
              "city thread must be bound to the city id",
            );
            assert.equal(
              cityThread.zhkId,
              null,
              "city thread must not be bound to a locality",
            );
          });
        }),
        { numRuns: 100 },
      );
    });
  },
);
