// Feature: community-generalized-locality, Property 4: Create then resolve round-trip
//
// Property test for the create → resolve round-trip of a Locality (Community
// Generalized Locality, Стадия 2).
//
// **Property 4: Create then resolve round-trip**
//   *For any* valid create input (trimmed name length 2..100, valid kind,
//   existing City), creation SHALL succeed synchronously, return the created
//   slug, store `name_normalized = lower(trim(name))`, associate the record with
//   exactly one City, and the created Locality SHALL be immediately resolvable by
//   that slug with its Local_Feed available.
//
// **Validates: Requirements 1.1, 4.2, 4.3, 4.4, 4.8**
//
// ── What is under test ────────────────────────────────────────────────────────
// The REAL production create + resolve path:
//   - `createLocality(input)`     (`src/lib/geoService.ts`) — validates name,
//     resolves kind, resolves the parent City, dedups by
//     `(cityId, nameNormalized)`, generates a globally-unique slug, and inserts
//     the row computing `name_normalized = lower(trim(name))`.
//   - `getLocalityBySlug(slug)`   (`src/lib/geoService.ts`) — resolves the freshly
//     created Locality back by its slug into a `LocalityView`.
//   - `FeedService.getLocalFeed(localityId)` (`src/lib/feedService.ts`) — proves
//     the new Locality's Local_Feed is available (empty, no error).
// The test drives the ACTUAL functions end-to-end against a real Postgres and
// checks the round-trip invariants; it does NOT re-implement the SQL in memory.
//
// ── DB harness (matches the repo's DB-backed convention) ──────────────────────
// This repository verifies genuinely DB-dependent properties against a REAL
// Postgres gated on env (see `locality-feed.property.test.ts`,
// `migration-*.property.test.ts`). This test uses the identical connectivity
// seam:
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS.
//     It NEVER fakes a pass and NEVER weakens assertions to dodge the DB.
//
// ── Isolation note (deviation from tx-rollback, deliberate & documented) ──────
// The sibling `locality-feed` test injects a transaction into `FeedService`
// (`new FeedService(tx)`) and rolls back per iteration. `createLocality` /
// `getLocalityBySlug` / `generateSlug` are NOT injectable — they close over the
// module-level `db` singleton from `@workspace/db`, so a rolled-back outer
// transaction on a different pool connection would NOT contain their writes.
// Instead this harness achieves per-iteration isolation WITHOUT ever touching
// production data by:
//   1. Pinning EVERY pool connection to a throwaway schema
//      (`create_resolve_prop_test`) via the `options=-c search_path=...`
//      connection parameter — production tables in `public` are never in scope.
//   2. Creating self-contained `cities` + `zhk` + `community_threads` tables in
//      that schema (no FKs to production).
//   3. TRUNCATE ... RESTART IDENTITY at the start of every iteration, so each
//      run starts from an empty, deterministic state (functionally equivalent to
//      a rollback for isolation purposes).
//   4. Dropping the schema entirely in `after`.
//
// Iterations: `{ numRuns: 100 }` when a Postgres is reachable.
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/locality-create-resolve.property.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import pg from "pg";

const { Pool } = pg;

// ─── Resolve a usable Postgres connection string ───────────────────────────────

const FAKE_URL = "postgres://test:test@localhost:5432/test";
const EPHEMERAL_SCHEMA = "create_resolve_prop_test";

function resolveDbUrl(): string | null {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (testUrl) return testUrl;
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl && dbUrl !== FAKE_URL) return dbUrl;
  return null;
}

/**
 * Append an `options=-c search_path=<schema>` parameter so that EVERY connection
 * the singleton pool opens is pinned to the throwaway schema — never `public`.
 */
function pinSearchPath(url: string, schema: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
}

const dbUrl = resolveDbUrl();
let dbAvailable = false;
let skipReason = "";

// Loaded lazily ONLY when a real Postgres is reachable (importing `@workspace/db`
// eagerly opens a pool against `DATABASE_URL`).
type DbModule = typeof import("@workspace/db");
type GeoServiceModule = typeof import("../../src/lib/geoService.js");
type FeedServiceModule = typeof import("../../src/lib/feedService.js");
type SlugModule = typeof import("../../src/lib/communitySlug.js");
let dbmod: DbModule | null = null;
let geomod: GeoServiceModule | null = null;
let feedmod: FeedServiceModule | null = null;
let slugmod: SlugModule | null = null;
let sqlTag: typeof import("drizzle-orm").sql | null = null;

if (!dbUrl) {
  skipReason =
    "No real Postgres configured (set TEST_DATABASE_URL to a reachable Postgres).";
} else {
  // Probe connectivity with a throwaway pool BEFORE importing `@workspace/db`.
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
    // Point `@workspace/db` at the resolved URL PINNED to the ephemeral schema,
    // THEN import it (+ the real geo/feed/slug services and the `sql` tag) so the
    // singleton pool binds every connection to the throwaway schema.
    process.env.DATABASE_URL = pinSearchPath(dbUrl, EPHEMERAL_SCHEMA);
    dbmod = await import("@workspace/db");
    geomod = await import("../../src/lib/geoService.js");
    feedmod = await import("../../src/lib/feedService.js");
    slugmod = await import("../../src/lib/communitySlug.js");
    sqlTag = (await import("drizzle-orm")).sql;
  }
}

/** Locality_Kind values — creation must succeed for every valid kind. */
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

// ─── Ephemeral-schema DDL (self-contained; no FKs to production) ──────────────

// `cities` must carry EVERY column the drizzle `citiesTable` schema projects,
// because `getCityBySlug` / `createLocality` issue `select().from(citiesTable)`
// (all columns). Mirrors `lib/db/src/schema/settings.ts`.
const CREATE_CITIES = `
  CREATE TABLE cities (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    slug varchar(100) UNIQUE,
    name_in varchar(100),
    region varchar(100),
    timezone varchar(50) DEFAULT 'Europe/Moscow',
    lat numeric(9,6),
    lng numeric(9,6),
    population integer,
    seo_title varchar(70),
    seo_description varchar(180),
    h1 varchar(100),
    body_md text,
    is_active boolean NOT NULL DEFAULT true,
    work_coefficient_kopeks_per_sqm integer,
    is_starter boolean NOT NULL DEFAULT false,
    is_geo_covered boolean NOT NULL DEFAULT false
  )
`;

// `zhk` mirrors `lib/db/src/schema/zhk.ts` (every column `select()` reads).
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

// `community_threads` — read by `FeedService.getLocalFeed` (select all columns).
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

// ─── Generators ────────────────────────────────────────────────────────────────

const cyrillicCharArb = fc.constantFrom(
  "а", "б", "в", "г", "д", "е", "ё", "ж", "з", "и", "й", "к", "л", "м",
  "н", "о", "п", "р", "с", "т", "у", "ф", "х", "ц", "ч", "ш", "щ",
  "ы", "э", "ю", "я",
);

const latinDigitCharArb = fc.constantFrom(
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "0", "1", "2", "3", "9",
);

// Visible (non-whitespace) chars only, so that `trim()` never changes the core
// and the trimmed length is exactly the core length. Weighted toward Cyrillic to
// exercise transliteration in slug generation.
const visibleCharArb = fc.oneof(
  { weight: 6, arbitrary: cyrillicCharArb },
  { weight: 3, arbitrary: latinDigitCharArb },
);

// Core name: trimmed length is guaranteed in [2, 100] ⇒ a VALID create input.
const coreNameArb: fc.Arbitrary<string> = fc
  .array(visibleCharArb, { minLength: 2, maxLength: 100 })
  .map((xs) => xs.join(""));

// Surrounding whitespace stripped by String.prototype.trim() (incl. \u00a0).
const surroundingWsArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0"), {
    minLength: 0,
    maxLength: 4,
  })
  .map((xs) => xs.join(""));

// A name with arbitrary surrounding whitespace around a valid visible core.
const nameArb: fc.Arbitrary<string> = fc
  .record({ lead: surroundingWsArb, core: coreNameArb, trail: surroundingWsArb })
  .map(({ lead, core, trail }) => lead + core + trail);

const kindArb: fc.Arbitrary<LocalityKind> = fc.constantFrom(...LOCALITY_KINDS);

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "Locality create→resolve — Property 4: round-trip (real createLocality + getLocalityBySlug, DB-backed)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 1.1, 4.2, 4.3, 4.4, 4.8

    const db = () => (dbmod as DbModule).db;
    const citiesTable = () => (dbmod as DbModule).citiesTable;
    const zhkTable = () => (dbmod as DbModule).zhkTable;
    const createLocality = () => (geomod as GeoServiceModule).createLocality;
    const getLocalityBySlug = () => (geomod as GeoServiceModule).getLocalityBySlug;
    const FeedService = () => (feedmod as FeedServiceModule).FeedService;
    const MAX_FEED_LIMIT = () => (feedmod as FeedServiceModule).MAX_FEED_LIMIT;
    const SLUG_RE = () => (slugmod as SlugModule).SLUG_RE;
    const sql = () => sqlTag as NonNullable<typeof sqlTag>;

    let ready = false;

    before(async () => {
      ready =
        dbAvailable &&
        dbmod != null &&
        geomod != null &&
        feedmod != null &&
        slugmod != null &&
        sqlTag != null;
      if (!ready) return;

      // Rebuild the throwaway schema + tables. All statements run through the
      // pinned singleton pool, so unqualified names resolve to the ephemeral
      // schema — production `public` tables are never touched.
      await db().execute(
        sql().raw(`DROP SCHEMA IF EXISTS ${EPHEMERAL_SCHEMA} CASCADE`),
      );
      await db().execute(sql().raw(`CREATE SCHEMA ${EPHEMERAL_SCHEMA}`));
      await db().execute(sql().raw(CREATE_CITIES));
      await db().execute(sql().raw(CREATE_ZHK));
      await db().execute(sql().raw(CREATE_THREADS));
    });

    after(async () => {
      if (dbmod && sqlTag) {
        await db()
          .execute(sql().raw(`DROP SCHEMA IF EXISTS ${EPHEMERAL_SCHEMA} CASCADE`))
          .catch(() => {});
        await (dbmod as DbModule).pool.end().catch(() => {});
      }
    });

    it("createLocality succeeds, and the record is immediately resolvable with an available empty Local_Feed", async () => {
      assert.ok(ready, "DB modules should be loaded when the suite is not skipped");

      await fc.assert(
        fc.asyncProperty(nameArb, kindArb, async (rawName, kind) => {
          // Per-iteration isolation: empty, deterministic starting state.
          await db().execute(
            sql().raw(
              "TRUNCATE community_threads, zhk, cities RESTART IDENTITY CASCADE",
            ),
          );

          // Seed exactly one existing City for this iteration.
          const [city] = await db()
            .insert(citiesTable())
            .values({ name: "Тестоград", slug: "testograd" })
            .returning({ id: citiesTable().id });
          const cityId = city!.id as number;

          // ── Create (Requirement 4.2, 4.3): synchronous success + returned slug.
          const result = await createLocality()({
            name: rawName,
            citySlug: "testograd",
            kind,
          });

          assert.equal(
            result.status,
            "created",
            `valid input must create synchronously; got ${JSON.stringify(result)} for name=${JSON.stringify(rawName)} kind=${kind}`,
          );
          if (result.status !== "created") return; // type-narrow

          const loc = result.locality;
          const slug = loc.slug;
          const trimmed = rawName.trim();

          // Returned slug is non-empty and well-formed (Requirement 1.6, 4.3).
          assert.ok(slug.length > 0, "returned slug must be non-empty");
          assert.ok(
            SLUG_RE().test(slug),
            `returned slug must match ${SLUG_RE()}: got ${JSON.stringify(slug)}`,
          );

          // Returned DTO reflects the requested kind and the seeded City.
          assert.equal(loc.kind, kind, "created kind must equal requested kind");
          assert.equal(
            loc.cityId,
            cityId,
            "created Locality must be associated with the seeded City",
          );

          // ── Stored state (Requirement 4.8, 1.1): name_normalized + single City.
          const rows = await db().select().from(zhkTable());
          assert.equal(
            rows.length,
            1,
            "exactly one Locality_Record must exist after a single create",
          );
          const row = rows[0]!;
          assert.equal(
            row.nameNormalized,
            trimmed.toLowerCase(),
            "stored name_normalized must equal lower(trim(name))",
          );
          assert.equal(row.name, trimmed, "stored name must be the trimmed name");
          assert.equal(
            row.cityId,
            cityId,
            "the record must reference exactly the one seeded City",
          );
          assert.equal(row.id, loc.id, "returned id must match the stored row");

          // Exactly one City exists — the record is bound to a single City (1.1).
          const cityRows = await db().select().from(citiesTable());
          assert.equal(cityRows.length, 1, "exactly one City must exist");

          // ── Immediately resolvable by slug (Requirement 4.4).
          const resolved = await getLocalityBySlug()(slug);
          assert.ok(
            resolved !== null,
            "created Locality must be immediately resolvable by its slug",
          );
          assert.equal(resolved!.id, loc.id, "resolved id must match created id");
          assert.equal(resolved!.slug, slug, "resolved slug must match");
          assert.equal(resolved!.kind, kind, "resolved kind must match");
          assert.equal(resolved!.name, trimmed, "resolved name must be trimmed name");
          assert.equal(resolved!.cityId, cityId, "resolved cityId must match");

          // ── Local_Feed available immediately: empty, no error (Requirement 4.4).
          const feed = await new (FeedService())(db()).getLocalFeed(loc.id, {
            limit: MAX_FEED_LIMIT(),
          });
          assert.equal(
            feed.items.length,
            0,
            "a brand-new Locality's Local_Feed must be empty",
          );
          assert.equal(
            feed.emptyState,
            true,
            "empty Local_Feed must report emptyState without error",
          );
        }),
        { numRuns: 100 },
      );
    });
  },
);
