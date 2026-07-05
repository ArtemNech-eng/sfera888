// Feature: community-generalized-locality, Property 9: City listing order across kinds
//
// Property test for the City_Page locality listing (Community Generalized
// Locality, Стадия 2).
//
// **Property 9: City listing order across kinds**
//   *For any* City, the City_Page locality list SHALL contain all Localities
//   belonging to that City regardless of kind, ordered by `name_normalized`
//   ascending, without grouping by kind.
//
// **Validates: Requirements 2.4**
//
// ── What is under test ────────────────────────────────────────────────────────
// The REAL production listing path:
//   - `listLocalitiesByCity(cityId)` (`src/lib/geoService.ts`) — issues
//     `select().from(zhkTable).where(cityId = ?).orderBy(asc(name_normalized))`
//     and maps every row through `shapeLocalityView` (attaching `kind`). It
//     returns ALL localities of the city regardless of kind, in a single flat
//     list ordered by `name_normalized` ascending, WITHOUT grouping by kind.
// The test drives the ACTUAL function end-to-end against a real Postgres and
// checks the ordering/completeness/exclusion invariants against an independent
// in-memory oracle; it does NOT re-implement the SQL.
//
// ── DB harness (matches the repo's DB-backed convention) ──────────────────────
// `listLocalitiesByCity` closes over the module-level `db` singleton from
// `@workspace/db` (not injectable), so — exactly like the sibling
// `locality-create-resolve.property.test.ts` — this suite pins EVERY pool
// connection to a throwaway schema via the `options=-c search_path=...`
// connection parameter, builds self-contained tables there, and TRUNCATEs per
// iteration. Production `public` tables are never touched. It SKIPS cleanly when
// no Postgres is reachable and NEVER fakes a pass.
//
// ── Deterministic ordering oracle (collation pinning) ─────────────────────────
// "Ordered by name_normalized ascending" is defined by the database's ORDER BY.
// To make the in-memory oracle deterministic and independent of the host DB's
// default collation, the ephemeral `zhk.name_normalized` column is declared
// `COLLATE "C"` (byte/codepoint order). For BMP text (all Cyrillic + Latin used
// here) "C" ordering equals JavaScript's codepoint (UTF-16 code unit) ordering,
// so the JS oracle comparator matches Postgres exactly. Ties are avoided by
// construction: within any single city each stored `name_normalized` is unique
// (mirrors real per-city dedup), so the ascending order is total & unambiguous.
//
// Iterations: `{ numRuns: 100 }` when a Postgres is reachable.
//
// Run:
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/locality-city-listing.property.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import pg from "pg";

const { Pool } = pg;

// ─── Resolve a usable Postgres connection string ───────────────────────────────

const FAKE_URL = "postgres://test:test@localhost:5432/test";
const EPHEMERAL_SCHEMA = "city_listing_prop_test";

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
    process.env.DATABASE_URL = pinSearchPath(dbUrl, EPHEMERAL_SCHEMA);
    dbmod = await import("@workspace/db");
    geomod = await import("../../src/lib/geoService.js");
    sqlTag = (await import("drizzle-orm")).sql;
  }
}

/** Locality_Kind values — listing must include EVERY kind, ungrouped. */
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

// ─── Ephemeral-schema DDL (self-contained; no FKs to production) ──────────────

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
// name_normalized is pinned to COLLATE "C" so ORDER BY matches the JS oracle
// (codepoint order) deterministically regardless of the host DB collation.
const CREATE_ZHK = `
  CREATE TABLE zhk (
    id serial PRIMARY KEY,
    slug varchar(100) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    name_normalized varchar(100) COLLATE "C" NOT NULL,
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

// Also throw in UPPERCASE Latin/Cyrillic so lower(trim(name)) normalization and
// case-insensitive ordering are exercised.
const upperCharArb = fc.constantFrom(
  "A", "B", "C", "Z", "А", "Б", "В", "Я",
);

const visibleCharArb = fc.oneof(
  { weight: 6, arbitrary: cyrillicCharArb },
  { weight: 3, arbitrary: latinDigitCharArb },
  { weight: 2, arbitrary: upperCharArb },
);

// Core name: trimmed length guaranteed in [2, 100].
const coreNameArb: fc.Arbitrary<string> = fc
  .array(visibleCharArb, { minLength: 2, maxLength: 24 })
  .map((xs) => xs.join(""));

const surroundingWsArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0"), {
    minLength: 0,
    maxLength: 3,
  })
  .map((xs) => xs.join(""));

const nameArb: fc.Arbitrary<string> = fc
  .record({ lead: surroundingWsArb, core: coreNameArb, trail: surroundingWsArb })
  .map(({ lead, core, trail }) => lead + core + trail);

const kindArb: fc.Arbitrary<LocalityKind> = fc.constantFrom(...LOCALITY_KINDS);

// A single locality spec: a raw name, a kind, and which city it belongs to.
// cityIdx 0 is the TARGET city under test; indices >= 1 are OTHER cities whose
// localities MUST be excluded from the target city's listing.
interface LocalitySpec {
  rawName: string;
  kind: LocalityKind;
  cityIdx: number;
}

const NUM_CITIES = 3; // 1 target + 2 others (exclusion coverage).

const specsArb: fc.Arbitrary<LocalitySpec[]> = fc.array(
  fc.record({
    rawName: nameArb,
    kind: kindArb,
    cityIdx: fc.integer({ min: 0, max: NUM_CITIES - 1 }),
  }),
  { minLength: 0, maxLength: 30 },
);

// Codepoint-order comparator (equals Postgres COLLATE "C" for BMP text).
function byNameNormalizedAsc(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "Locality city listing — Property 9: order across kinds (real listLocalitiesByCity, DB-backed)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 2.4

    const db = () => (dbmod as DbModule).db;
    const listLocalitiesByCity = () =>
      (geomod as GeoServiceModule).listLocalitiesByCity;
    const sql = () => sqlTag as NonNullable<typeof sqlTag>;

    let ready = false;

    before(async () => {
      ready = dbAvailable && dbmod != null && geomod != null && sqlTag != null;
      if (!ready) return;

      await db().execute(
        sql().raw(`DROP SCHEMA IF EXISTS ${EPHEMERAL_SCHEMA} CASCADE`),
      );
      await db().execute(sql().raw(`CREATE SCHEMA ${EPHEMERAL_SCHEMA}`));
      await db().execute(sql().raw(CREATE_CITIES));
      await db().execute(sql().raw(CREATE_ZHK));
    });

    after(async () => {
      if (dbmod && sqlTag) {
        await db()
          .execute(sql().raw(`DROP SCHEMA IF EXISTS ${EPHEMERAL_SCHEMA} CASCADE`))
          .catch(() => {});
        await (dbmod as DbModule).pool.end().catch(() => {});
      }
    });

    it("returns all city localities of every kind, ordered by name_normalized asc, ungrouped, excluding other cities", async () => {
      assert.ok(ready, "DB modules should be loaded when the suite is not skipped");

      await fc.assert(
        fc.asyncProperty(specsArb, async (specs) => {
          // Per-iteration isolation: empty, deterministic starting state.
          await db().execute(
            sql().raw("TRUNCATE zhk, cities RESTART IDENTITY CASCADE"),
          );

          // Seed NUM_CITIES cities; cities[0] is the target under test.
          const cityIds: number[] = [];
          for (let c = 0; c < NUM_CITIES; c++) {
            const cityRes = await (dbmod as DbModule).pool.query(
              `INSERT INTO ${EPHEMERAL_SCHEMA}.cities (name, slug)
               VALUES ($1, $2) RETURNING id`,
              [`City ${c}`, `city-${c}`],
            );
            cityIds.push(cityRes.rows[0]!.id as number);
          }
          const targetCityId = cityIds[0]!;

          // Insert localities, deduping name_normalized WITHIN each city (mirrors
          // real per-city dedup) so ordering ties never arise. Build the oracle
          // for the target city from exactly what was inserted there.
          const seenPerCity = new Map<number, Set<string>>();
          for (const id of cityIds) seenPerCity.set(id, new Set());

          // Oracle rows for the target city: { id, nameNormalized, kind }.
          const oracle: Array<{
            id: number;
            nameNormalized: string;
            kind: LocalityKind;
          }> = [];

          let slugSeq = 0;
          for (const spec of specs) {
            const cityId = cityIds[spec.cityIdx]!;
            const nameNormalized = spec.rawName.trim().toLowerCase();
            const seen = seenPerCity.get(cityId)!;
            if (seen.has(nameNormalized)) continue; // per-city dedup
            seen.add(nameNormalized);

            const slug = `loc-${slugSeq++}`;
            const trimmedName = spec.rawName.trim();

            // Parameterized insert via the singleton pool (safe for arbitrary
            // Unicode text; `sql().raw` does not bind parameters). Fully-qualify
            // the schema so the row lands in the ephemeral schema.
            const res = await (dbmod as DbModule).pool.query(
              `INSERT INTO ${EPHEMERAL_SCHEMA}.zhk (slug, name, name_normalized, city_id, kind)
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [slug, trimmedName, nameNormalized, cityId, spec.kind],
            );
            const newId = res.rows[0]!.id as number;

            if (cityId === targetCityId) {
              oracle.push({ id: newId, nameNormalized, kind: spec.kind });
            }
          }

          // Oracle: sort target-city rows by name_normalized ascending
          // (codepoint order == Postgres COLLATE "C"). Ties impossible (deduped).
          oracle.sort((a, b) =>
            byNameNormalizedAsc(a.nameNormalized, b.nameNormalized),
          );

          // ── Exercise the REAL production function.
          const listed = await listLocalitiesByCity()(targetCityId);

          // Completeness + exclusion: same count as target-city rows only.
          assert.equal(
            listed.length,
            oracle.length,
            `listing must contain exactly the target city's localities; ` +
              `expected ${oracle.length}, got ${listed.length}`,
          );

          // Every returned row belongs to the target city (others excluded).
          for (const loc of listed) {
            assert.equal(
              loc.cityId,
              targetCityId,
              "listing must not include localities from other cities",
            );
          }

          // Ordering + completeness: id sequence equals the name_normalized-asc
          // oracle exactly. This subsumes "all kinds present, ungrouped": the
          // order is dictated purely by name_normalized, so kinds fall wherever
          // the names place them (no grouping by kind).
          assert.deepEqual(
            listed.map((l) => l.id),
            oracle.map((o) => o.id),
            "listing order must equal name_normalized ascending (ids in order)",
          );

          // The returned sequence is monotonically non-decreasing by
          // name_normalized (independent restatement of the ordering contract).
          const returnedNames = listed.map((l) => l.name.trim().toLowerCase());
          for (let i = 1; i < returnedNames.length; i++) {
            assert.ok(
              byNameNormalizedAsc(returnedNames[i - 1]!, returnedNames[i]!) <= 0,
              `listing must be sorted by name_normalized asc: ` +
                `${JSON.stringify(returnedNames[i - 1])} !<= ${JSON.stringify(returnedNames[i])}`,
            );
          }

          // Kinds are ordered by name, NOT grouped by kind: verify the returned
          // kind at each position matches the oracle's kind at that position
          // (the name-order interleaving), proving no kind-based reordering.
          assert.deepEqual(
            listed.map((l) => l.kind),
            oracle.map((o) => o.kind),
            "kinds must follow name_normalized order (interleaved, not grouped by kind)",
          );
        }),
        { numRuns: 100 },
      );
    });
  },
);
