// Feature: community-generalized-locality, Property 10: Unknown slug is not found
//
// Property test for unknown-slug resolution of a Locality (Community Generalized
// Locality, Стадия 2).
//
// **Property 10: Unknown slug is not found**
//   *For any* slug that matches no Locality_Record, resolution SHALL return a
//   not-found result and SHALL provide no Local_Feed.
//
// **Validates: Requirements 2.5, 3.5**
//
// ── What is under test ────────────────────────────────────────────────────────
// The REAL production resolver:
//   - `getLocalityBySlug(slug)` (`src/lib/geoService.ts`) — normalizes the input
//     slug (trim + lower-case; empty-after-trim or > 100 chars are impossible in
//     the DB and short-circuit to `null`), looks the row up in `zhk` by slug and
//     returns a `LocalityView` when found or `null` when no row matches.
// `null` is the not-found signal the route layer translates into HTTP 404 /
// `{ notFound: true }` (Requirement 2.5, 3.5). Because the resolver returns
// `null`, there is NO Locality id to feed — i.e. "no Local_Feed is provided" is
// represented by the absence of any locality to build a feed for. The test
// asserts that null resolution directly and, as a contrast anchor, that a
// genuinely seeded slug resolves to a NON-null record (proving the null result
// is caused by absence, not by a broken resolver).
//
// ── DB harness (mirrors `locality-create-resolve.property.test.ts`) ───────────
// Verifies the genuinely DB-dependent resolver against a REAL Postgres, gated on
// env. Uses the identical connectivity seam:
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS.
//     It NEVER fakes a pass and NEVER weakens assertions to dodge the DB.
//
// ── Isolation (same approach as the create→resolve sibling) ───────────────────
// `getLocalityBySlug` is not injectable — it closes over the module-level `db`
// singleton from `@workspace/db`. Per-iteration isolation WITHOUT touching
// production data is achieved by:
//   1. Pinning EVERY pool connection to a throwaway schema
//      (`unknown_slug_prop_test`) via the `options=-c search_path=...`
//      connection parameter — production `public` tables are never in scope.
//   2. Creating self-contained `cities` + `zhk` + `community_threads` tables in
//      that schema (no FKs to production).
//   3. TRUNCATE ... RESTART IDENTITY at the start of every iteration.
//   4. Dropping the schema entirely in `after`.
//
// Iterations: `{ numRuns: 100 }` when a Postgres is reachable.
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/locality-unknown-slug.property.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import pg from "pg";

const { Pool } = pg;

// ─── Resolve a usable Postgres connection string ───────────────────────────────

const FAKE_URL = "postgres://test:test@localhost:5432/test";
const EPHEMERAL_SCHEMA = "unknown_slug_prop_test";

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
let dbmod: DbModule | null = null;
let geomod: GeoServiceModule | null = null;
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
    // THEN import it (+ the real geo service and the `sql` tag) so the singleton
    // pool binds every connection to the throwaway schema.
    process.env.DATABASE_URL = pinSearchPath(dbUrl, EPHEMERAL_SCHEMA);
    dbmod = await import("@workspace/db");
    geomod = await import("../../src/lib/geoService.js");
    sqlTag = (await import("drizzle-orm")).sql;
  }
}

/** Locality_Kind values — seeded records span every valid kind. */
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

// ─── Ephemeral-schema DDL (self-contained; no FKs to production) ──────────────

// `cities` mirrors `lib/db/src/schema/settings.ts` (every column select() reads).
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

// `zhk` mirrors `lib/db/src/schema/zhk.ts` (every column select() reads).
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

// `community_threads` — present for schema parity with the sibling harness.
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

// Slug-shaped tokens (the resolver's stored/queried shape: `^[a-z0-9-]{1,100}$`).
const slugTokenArb: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z0-9-]{1,40}$/)
  .map((s) => s.replace(/^-+|-+$/g, ""))
  .filter((s) => s.length >= 1 && s.length <= 40);

// A set of DISTINCT slugs to seed as existing Locality_Records this iteration.
const seededSlugsArb: fc.Arbitrary<string[]> = fc.uniqueArray(slugTokenArb, {
  minLength: 1,
  maxLength: 6,
  selector: (s) => s.toLowerCase(),
});

// Kinds assigned round-robin to seeded records — resolution is kind-agnostic.
const kindsArb: fc.Arbitrary<LocalityKind[]> = fc.array(
  fc.constantFrom(...LOCALITY_KINDS),
  { minLength: 6, maxLength: 6 },
);

// A query slug that matches NO record. Combines:
//   - arbitrary slug-shaped tokens (constrained below to exclude the seeded set),
//   - empty / whitespace-only strings (normalizeSlug → null → guaranteed miss),
//   - over-length strings (> 100 → null → guaranteed miss),
//   - upper-case shapes (still won't equal a stored lower-cased slug).
const unknownSlugCandidateArb: fc.Arbitrary<string> = fc.oneof(
  slugTokenArb,
  fc.constantFrom("", "   ", "\t", "\n", "\u00a0 "),
  fc.string({ minLength: 101, maxLength: 160 }),
  slugTokenArb.map((s) => `zzz-${s}-zzz`),
);

// The resolver normalizes input as `slug.trim().toLowerCase()`; a candidate is a
// guaranteed miss iff its normalized form is not among the seeded slugs.
function normalizeForCompare(slug: string): string | null {
  const n = slug.trim().toLowerCase();
  if (n.length === 0 || n.length > 100) return null; // impossible in DB → miss
  return n;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "Locality unknown slug — Property 10: not found (real getLocalityBySlug, DB-backed)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 2.5, 3.5

    const db = () => (dbmod as DbModule).db;
    const citiesTable = () => (dbmod as DbModule).citiesTable;
    const zhkTable = () => (dbmod as DbModule).zhkTable;
    const getLocalityBySlug = () => (geomod as GeoServiceModule).getLocalityBySlug;
    const sql = () => sqlTag as NonNullable<typeof sqlTag>;

    let ready = false;

    before(async () => {
      ready = dbAvailable && dbmod != null && geomod != null && sqlTag != null;
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

    it("getLocalityBySlug returns null (not-found, no Local_Feed) for any slug matching no record", async () => {
      assert.ok(ready, "DB modules should be loaded when the suite is not skipped");

      await fc.assert(
        fc.asyncProperty(
          seededSlugsArb,
          kindsArb,
          unknownSlugCandidateArb,
          async (seededSlugs, kinds, unknownCandidate) => {
            // Only exercise candidates that are genuine misses. A candidate whose
            // normalized form equals a seeded slug (or normalizes to null) is
            // excluded from the "unknown" universe; null-normalizing candidates
            // (empty/whitespace/over-length) are always misses and kept.
            const normUnknown = normalizeForCompare(unknownCandidate);
            const seededNorm = new Set(seededSlugs.map((s) => s.toLowerCase()));
            fc.pre(normUnknown === null || !seededNorm.has(normUnknown));

            // Per-iteration isolation: empty, deterministic starting state.
            await db().execute(
              sql().raw(
                "TRUNCATE community_threads, zhk, cities RESTART IDENTITY CASCADE",
              ),
            );

            // Seed exactly one City for this iteration.
            const [city] = await db()
              .insert(citiesTable())
              .values({ name: "Тестоград", slug: "testograd" })
              .returning({ id: citiesTable().id });
            const cityId = city!.id as number;

            // Seed the known Locality_Records (spanning kinds), controlling slugs
            // directly so the "unknown" universe is well-defined.
            await db()
              .insert(zhkTable())
              .values(
                seededSlugs.map((slug, i) => ({
                  slug: slug.toLowerCase(),
                  name: `Место ${i}`,
                  nameNormalized: `место ${i}`,
                  cityId,
                  kind: kinds[i % kinds.length]!,
                })),
              );

            // ── Core assertion (Requirement 2.5, 3.5): unknown slug → null.
            // A null result is the not-found signal; with no resolved locality
            // there is no id to build a Local_Feed for → "no Local_Feed provided".
            const resolved = await getLocalityBySlug()(unknownCandidate);
            assert.equal(
              resolved,
              null,
              `unknown slug ${JSON.stringify(unknownCandidate)} must resolve to null (not-found), got ${JSON.stringify(resolved)}`,
            );

            // ── Contrast anchor: a genuinely seeded slug DOES resolve non-null,
            // proving the null above is due to absence, not a broken resolver.
            const knownSlug = seededSlugs[0]!.toLowerCase();
            const knownResolved = await getLocalityBySlug()(knownSlug);
            assert.ok(
              knownResolved !== null,
              `seeded slug ${JSON.stringify(knownSlug)} must resolve to a record`,
            );
            assert.equal(
              knownResolved!.slug,
              knownSlug,
              "resolved record slug must match the seeded slug",
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  },
);
