// Feature: community-generalized-locality, Task 5.2: concurrent same-name creation
//
// Integration test for concurrent same-name Locality creation in one City
// (Community Generalized Locality, Стадия 2).
//
// **Requirement 5.4 contract**
//   IF two or more Add_Place_Form submissions with a MATCHING Name_Normalized
//   (`lower(trim(name))`) arrive concurrently within the SAME City, THEN the
//   Geo_Service SHALL create at most ONE Locality_Record with that
//   Name_Normalized, and SHALL handle every subsequent request as a match
//   against the already-created Locality_Record, returning that existing
//   Locality_Record.
//
// **Validates: Requirements 5.4**
//
// ── What is under test ────────────────────────────────────────────────────────
// The REAL production create path `createLocality(input)` (`src/lib/geoService.ts`)
// fired N-ways CONCURRENTLY (`Promise.allSettled`) with equivalent names bound to
// one seeded City, against a real Postgres. `createLocality` dedups with a
// service-level SELECT-then-INSERT keyed on `(cityId, nameNormalized)` — there is
// NO unique constraint on `(city_id, name_normalized)` (see `lib/db/src/schema/
// zhk.ts`: the `zhk_city_name_normalized_idx` index is explicitly NOT UNIQUE).
// The ONLY database-level uniqueness guard on the write path is the `zhk_slug_key`
// UNIQUE constraint on `zhk.slug`, and equivalent names deterministically produce
// the SAME slug (`slugify` lower-cases + trims + transliterates), so at most one
// concurrent insert can commit.
//
// This test therefore checks the two halves of Requirement 5.4 SEPARATELY and
// HONESTLY:
//   (a) at-most-one-record — exactly one `zhk` row exists for the shared
//       `(cityId, nameNormalized)` after N concurrent submissions; AND
//   (b) later-requests-return-existing — every non-winning concurrent request
//       resolves to `duplicate_suggested` (or `created`) pointing at the SAME
//       slug, WITHOUT throwing.
// If the implementation's SELECT-then-INSERT loses the race, part (b) can only
// hold if the losing inserts are caught and re-resolved to the existing record.
// The test does NOT weaken these assertions to dodge a real defect — a raced
// insert that surfaces as a thrown unique-violation instead of the existing
// record is a genuine violation of Requirement 5.4 and this test will report it.
//
// ── DB harness (matches the repo's DB-backed convention) ──────────────────────
// Identical connectivity + isolation seam to `locality-create-resolve.property
// .test.ts`:
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS.
//     It NEVER fakes a pass and NEVER weakens assertions to dodge the DB.
//   - Pins EVERY pool connection to a throwaway schema
//     (`concurrent_create_test`) via the `options=-c search_path=...` connection
//     parameter, so production `public` tables are never in scope. A real
//     connection pool (default max) backs genuine concurrency across requests.
//   - Self-contained `cities` + `zhk` + `community_threads` tables mirror the
//     production schema, INCLUDING the `zhk.slug ... UNIQUE` constraint (the
//     real incidental race guard) and the NON-UNIQUE `(city_id, name_normalized)`
//     dedup index (so the harness does not add a guard production lacks).
//   - TRUNCATE ... RESTART IDENTITY between cases; DROP SCHEMA in `after`.
//
// This is an INTEGRATION test: a small number of representative concurrent
// scenarios (identical names, case/whitespace variants, mixed kinds), NOT 100
// generated iterations.
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/locality-concurrent-create.integration.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import pg from "pg";

const { Pool } = pg;

// ─── Resolve a usable Postgres connection string ───────────────────────────────

const FAKE_URL = "postgres://test:test@localhost:5432/test";
const EPHEMERAL_SCHEMA = "concurrent_create_test";

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

/** Locality_Kind values — dedup must hold regardless of kind (Requirement 5.3). */
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

// ─── Ephemeral-schema DDL (self-contained; mirrors production constraints) ────

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

// `zhk` mirrors `lib/db/src/schema/zhk.ts` (every column `select()` reads),
// INCLUDING the real `zhk_slug_key` UNIQUE constraint on `slug` (the only
// database-level uniqueness guard on the concurrent write path) and the
// deliberately NON-UNIQUE `(city_id, name_normalized)` dedup index — so this
// harness never adds a guard that production does not have.
const CREATE_ZHK = `
  CREATE TABLE zhk (
    id serial PRIMARY KEY,
    slug varchar(100) NOT NULL CONSTRAINT zhk_slug_key UNIQUE,
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

const CREATE_ZHK_DEDUP_IDX = `
  CREATE INDEX zhk_city_name_normalized_idx ON zhk (city_id, name_normalized)
`;

// `community_threads` — referenced by feed reads elsewhere; created for schema
// parity so the ephemeral schema is self-contained.
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

// ─── Representative concurrent scenarios (1–3 cases, not 100 iterations) ──────

interface Submission {
  /** Raw name as typed by each concurrent submitter. */
  name: string;
  /** Optional kind; omitted ⇒ resolves to 'zhk'. */
  kind?: LocalityKind;
}

interface Scenario {
  title: string;
  citySlug: string;
  /** All submissions MUST share the same lower(trim(name)). */
  submissions: Submission[];
}

/** Normalization mirrors production `normalizeZhkName` = lower(trim(name)). */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}

const SCENARIOS: Scenario[] = [
  {
    title:
      "5 concurrent identical-name submissions in one City → exactly one record",
    citySlug: "testograd",
    submissions: [
      { name: "ЖК Солнечный" },
      { name: "ЖК Солнечный" },
      { name: "ЖК Солнечный" },
      { name: "ЖК Солнечный" },
      { name: "ЖК Солнечный" },
    ],
  },
  {
    title:
      "4 concurrent case/whitespace variants of one name → exactly one record",
    citySlug: "testograd",
    submissions: [
      { name: "Черёмушки" },
      { name: "  черёмушки  " },
      { name: "ЧЕРЁМУШКИ" },
      { name: "\tЧерёмушки\n" },
    ],
  },
  {
    title:
      "3 concurrent equivalent-name submissions with DIFFERENT kinds → exactly one record (dedup independent of kind)",
    citySlug: "testograd",
    submissions: [
      { name: "ФМР", kind: "district" },
      { name: "фмр", kind: "zhk" },
      { name: " ФМР ", kind: "settlement" },
    ],
  },
];

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "Locality concurrent create — Requirement 5.4: concurrent same-name creation yields at most one record (real createLocality, DB-backed)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 5.4

    const db = () => (dbmod as DbModule).db;
    const citiesTable = () => (dbmod as DbModule).citiesTable;
    const zhkTable = () => (dbmod as DbModule).zhkTable;
    const createLocality = () => (geomod as GeoServiceModule).createLocality;
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
      await db().execute(sql().raw(CREATE_ZHK_DEDUP_IDX));
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

    for (const scenario of SCENARIOS) {
      it(scenario.title, async () => {
        assert.ok(ready, "DB modules should be loaded when the suite is not skipped");

        // Fresh, deterministic starting state for this scenario.
        await db().execute(
          sql().raw(
            "TRUNCATE community_threads, zhk, cities RESTART IDENTITY CASCADE",
          ),
        );

        // Seed exactly one existing City.
        const [city] = await db()
          .insert(citiesTable())
          .values({ name: "Тестоград", slug: scenario.citySlug })
          .returning({ id: citiesTable().id });
        const cityId = city!.id as number;

        const sharedNormalized = normalize(scenario.submissions[0]!.name);
        // Sanity: the scenario is well-formed — every submission shares the key.
        for (const s of scenario.submissions) {
          assert.equal(
            normalize(s.name),
            sharedNormalized,
            `scenario submissions must share one name_normalized; ${JSON.stringify(s.name)} differs`,
          );
        }

        // ── Fire ALL submissions CONCURRENTLY against the real create path.
        // `allSettled` captures any thrown rejection (e.g. a raced unique
        // violation) instead of aborting the whole test, so failures are
        // reported precisely.
        const settled = await Promise.allSettled(
          scenario.submissions.map((s) =>
            createLocality()({
              name: s.name,
              citySlug: scenario.citySlug,
              kind: s.kind,
            }),
          ),
        );

        // ── (a) AT MOST ONE RECORD (Requirement 5.4, core invariant).
        // Count the persisted rows for the shared (cityId, nameNormalized) via
        // the real drizzle query builder (no hand-rolled SQL string).
        const persisted = await db()
          .select({
            id: zhkTable().id,
            slug: zhkTable().slug,
            kind: zhkTable().kind,
            name: zhkTable().name,
            nameNormalized: zhkTable().nameNormalized,
          })
          .from(zhkTable())
          .where(
            and(
              eq(zhkTable().cityId, cityId),
              eq(zhkTable().nameNormalized, sharedNormalized),
            ),
          );
        assert.equal(
          persisted.length,
          1,
          `Requirement 5.4: at most one Locality_Record may exist for a shared ` +
            `name_normalized after concurrent submissions; found ${persisted.length}. ` +
            `This indicates concurrent SELECT-then-INSERT created duplicates ` +
            `(no DB-level uniqueness guard on (city_id, name_normalized)).`,
        );

        const survivingSlug = String(persisted[0]!.slug);

        // ── Classify the concurrent outcomes.
        const rejected = settled.filter((r) => r.status === "rejected");
        const fulfilled = settled.filter(
          (
            r,
          ): r is PromiseFulfilledResult<
            Awaited<ReturnType<ReturnType<typeof createLocality>>>
          > => r.status === "fulfilled",
        );

        // ── (b) LATER REQUESTS RETURN THE EXISTING RECORD (Requirement 5.4).
        // No concurrent submission may fail: the spec requires each subsequent
        // request to be handled as a match and RETURN the existing record — not
        // surface an error. A raced unique-violation on `zhk.slug` that bubbles
        // up as a thrown rejection is a genuine Requirement 5.4 violation.
        assert.equal(
          rejected.length,
          0,
          `Requirement 5.4: every concurrent submission must return the existing ` +
            `record (created/duplicate_suggested), not throw. ${rejected.length} of ` +
            `${settled.length} rejected: ` +
            rejected
              .map((r) => String((r as PromiseRejectedResult).reason))
              .join(" | "),
        );

        // Exactly one submission is the winner (`created`); the rest are
        // `duplicate_suggested`. Every result must point at the SAME surviving
        // record (same slug).
        const createdResults = fulfilled.filter(
          (r) => r.value.status === "created",
        );
        const duplicateResults = fulfilled.filter(
          (r) => r.value.status === "duplicate_suggested",
        );
        const rejectedResults = fulfilled.filter(
          (r) => r.value.status === "rejected",
        );

        assert.equal(
          rejectedResults.length,
          0,
          `no submission should be rejected on the merits (all names valid, ` +
            `kinds valid, City exists); got ${rejectedResults
              .map((r) => JSON.stringify(r.value))
              .join(", ")}`,
        );

        assert.equal(
          createdResults.length,
          1,
          `exactly one concurrent submission must be the creator; got ${createdResults.length}`,
        );
        assert.equal(
          duplicateResults.length,
          scenario.submissions.length - 1,
          `every non-creating submission must dedup to the existing record; ` +
            `expected ${scenario.submissions.length - 1} duplicate_suggested, got ${duplicateResults.length}`,
        );

        // All results resolve to the SAME surviving slug (the existing record).
        for (const r of createdResults) {
          if (r.value.status === "created") {
            assert.equal(
              r.value.locality.slug,
              survivingSlug,
              "the created record's slug must be the surviving persisted slug",
            );
          }
        }
        for (const r of duplicateResults) {
          if (r.value.status === "duplicate_suggested") {
            assert.equal(
              r.value.existing.slug,
              survivingSlug,
              "each duplicate_suggested must return the surviving existing record's slug",
            );
            assert.equal(
              r.value.existing.cityId,
              cityId,
              "the returned existing record must belong to the seeded City",
            );
          }
        }
      });
    }
  },
);
