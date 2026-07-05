// Feature: community-generalized-locality, Task 1.5: mid-migration rollback
//
// Integration test for the Стадия-2 locality-kind migration
// (`migrations/2026-06-10-locality-kind.sql`).
//
// **Requirement 9.4 contract**
//   IF applying the Migration fails at ANY step, THEN the Migration rolls back
//   all partial changes, leaves the database in a state IDENTICAL to its
//   pre-run state (0 deleted, 0 added, 0 modified Locality_Records), and
//   returns an indication that the migration did not apply successfully.
//
// **Validates: Requirements 9.4**
//
// ── Approach ──────────────────────────────────────────────────────────────────
// This is an INTEGRATION test (not a property test): it runs a small number of
// representative pre-migration datasets, not 100 generated iterations. The
// migration is real SQL DDL, so the only faithful test applies the real
// migration against a real Postgres and observes rollback behaviour.
//
// To exercise a MID-migration failure we take the ACTUAL migration body from
// disk and splice a guaranteed-failing statement (`SELECT 1 / 0`) at an
// intermediate point — after the real `ADD COLUMN kind` + backfill steps have
// applied their partial change, but before the CHECK-constraint and index
// steps. The real migration wraps everything in one transaction; when an
// intermediate step raises, the transaction aborts and every partial change
// (the freshly added `kind` column) must be discarded, returning the table to
// byte-for-byte its pre-run state.
//
// We model the migration's transactional wrapper with a SAVEPOINT inside the
// test's controlling (always-rolled-back) transaction — the SAME isolation seam
// as the Property 18 / 19 sibling tests. `ROLLBACK TO SAVEPOINT` reproduces the
// exact "roll back all partial changes" semantics of the migration's
// `BEGIN`/`COMMIT`: everything applied after the savepoint is undone, so the
// pre-migration table (without a `kind` column) is fully restored.
//
// ── Harness (identical seam to Property 18 / 19, tasks 1.3 / 1.4) ─────────────
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS
//     (it never fakes a pass and never weakens assertions to avoid the DB).
//
// Isolation: each case runs inside its own transaction that is ALWAYS rolled
// back. The pre-migration `zhk` table lives in an ephemeral schema (`mig_test`)
// created inside that transaction, so the final ROLLBACK discards the schema,
// table, data, and every side effect — nothing leaks between cases.
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/migration-rollback.integration.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

// ─── Resolve migration SQL, then splice a mid-migration failure ────────────────

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  here,
  "../../migrations/2026-06-10-locality-kind.sql",
);
const rawMigration = readFileSync(migrationPath, "utf8");

// Strip ONLY the outer transaction control so the DDL runs inside the test's
// controlling (always-rolled-back) transaction and its SAVEPOINT. The body is
// otherwise unchanged from disk.
const migrationBody = rawMigration
  .replace(/^\s*BEGIN\s*;\s*$/im, "")
  .replace(/^\s*COMMIT\s*;\s*$/im, "");

// The forced intermediate failure. `SELECT 1 / 0` raises `division_by_zero`
// at runtime — a faithful stand-in for "a migration step failed".
const FORCED_FAILURE_SQL = "SELECT 1 / 0;";

// Splice the failure BEFORE the CHECK-constraint step (`DO $$`). At that point
// steps 1–2 (ADD COLUMN kind + backfill) have applied their partial change, and
// steps 3–4 (CHECK constraint + index) have not yet run — a genuine mid-migration
// failure. Guard that the anchor exists so the test fails loudly if the migration
// is ever restructured.
const doBlockIdx = migrationBody.indexOf("DO $$");
if (doBlockIdx === -1) {
  throw new Error(
    "Could not locate the 'DO $$' step in the migration; update the failure-injection anchor.",
  );
}
const faultyMigration =
  migrationBody.slice(0, doBlockIdx) +
  `${FORCED_FAILURE_SQL}\n` +
  migrationBody.slice(doBlockIdx);

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
let pool: pg.Pool | null = null;
let dbAvailable = false;
let skipReason = "";

if (!dbUrl) {
  skipReason =
    "No real Postgres configured (set TEST_DATABASE_URL to a reachable Postgres).";
} else {
  try {
    pool = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 3000 });
    const probe = await pool.connect();
    await probe.query("SELECT 1");
    probe.release();
    dbAvailable = true;
  } catch (err) {
    skipReason = `Postgres not reachable at configured URL: ${(err as Error).message}`;
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }
  }
}

// ─── Representative pre-migration datasets (1–3 cases, not 100 iterations) ─────

interface RowSpec {
  slug: string;
  name: string;
  cityId: number;
  developer: string | null;
  completionDate: string | null;
  buildings: Array<{ name: string; floors: number }> | null;
}

/** Normalization key mirrors production `lower(trim(name))`. */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}

// Case 1: empty table (edge case — nothing to preserve, still must not error out
// into a half-applied state).
const EMPTY_DATASET: RowSpec[] = [];

// Case 2: a single ЖК row with fully populated attributes.
const SINGLE_ROW_DATASET: RowSpec[] = [
  {
    slug: "zhk-solnechnyy",
    name: "ЖК Солнечный",
    cityId: 1,
    developer: "СтройИнвест",
    completionDate: "2024-Q4",
    buildings: [
      { name: "Литер 1", floors: 16 },
      { name: "Литер 2", floors: 24 },
    ],
  },
];

// Case 3: several rows across multiple cities, mixed null / non-null attributes.
const MULTI_ROW_DATASET: RowSpec[] = [
  {
    slug: "cheryomushki",
    name: "Черёмушки",
    cityId: 1,
    developer: null,
    completionDate: null,
    buildings: null,
  },
  {
    slug: "fmr",
    name: "ФМР",
    cityId: 1,
    developer: null,
    completionDate: "2010",
    buildings: null,
  },
  {
    slug: "zhk-yuzhnyy",
    name: "ЖК Южный",
    cityId: 2,
    developer: "ЮгСтрой",
    completionDate: null,
    buildings: [{ name: "Корпус А", floors: 10 }],
  },
];

// ─── Snapshot: full pre-migration table state (columns that must be invariant) ─

interface StateRow {
  slug: string;
  name: string;
  name_normalized: string;
  city_id: number;
  developer: string | null;
  completion_date: string | null;
  buildings: unknown;
}

async function snapshotState(client: pg.PoolClient): Promise<StateRow[]> {
  const res = await client.query(
    `SELECT slug, name, name_normalized, city_id, developer, completion_date, buildings
       FROM zhk
      ORDER BY slug`,
  );
  return res.rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    name_normalized: r.name_normalized,
    city_id: Number(r.city_id),
    developer: r.developer,
    completion_date: r.completion_date,
    buildings: r.buildings ?? null,
  }));
}

/** Whether the `zhk.kind` column currently exists in the ephemeral schema. */
async function kindColumnExists(client: pg.PoolClient): Promise<boolean> {
  const res = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'mig_test'
        AND table_name = 'zhk'
        AND column_name = 'kind'`,
  );
  return res.rowCount === 1;
}

/**
 * Runs the mid-migration rollback scenario for one representative dataset inside
 * a single controlling transaction that is ALWAYS rolled back.
 *
 * Steps:
 *   1. Seed a pre-Stage-2 `zhk` table (WITHOUT a `kind` column) + snapshot state.
 *   2. SAVEPOINT to model the migration's transactional boundary.
 *   3. Apply the migration whose intermediate step is forced to fail; assert it
 *      raises an error (the "migration did not apply successfully" indication).
 *   4. ROLLBACK TO SAVEPOINT to reproduce the migration's full rollback.
 *   5. Assert the table is byte-for-byte identical to the pre-run snapshot:
 *      the `kind` column is gone (0 modified), and 0 rows were added/removed.
 */
async function runRollbackCase(client: pg.PoolClient, dataset: RowSpec[]): Promise<void> {
  await client.query("BEGIN");
  try {
    // Ephemeral schema so the migration's unqualified `zhk` resolves to a
    // throwaway table; ROLLBACK discards everything created here.
    await client.query("CREATE SCHEMA mig_test");
    await client.query("SET LOCAL search_path TO mig_test");

    // Pre-Stage-2 `zhk` shape — deliberately WITHOUT the `kind` column.
    await client.query(`
      CREATE TABLE zhk (
        id serial PRIMARY KEY,
        slug varchar(100) NOT NULL UNIQUE,
        name varchar(100) NOT NULL,
        name_normalized varchar(100) NOT NULL,
        city_id integer NOT NULL,
        developer varchar(200),
        completion_date varchar(40),
        buildings jsonb,
        is_indexable boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    // Seed the representative dataset.
    for (const spec of dataset) {
      await client.query(
        `INSERT INTO zhk (slug, name, name_normalized, city_id, developer, completion_date, buildings)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          spec.slug,
          spec.name,
          normalize(spec.name),
          spec.cityId,
          spec.developer,
          spec.completionDate,
          spec.buildings === null ? null : JSON.stringify(spec.buildings),
        ],
      );
    }

    // Baseline: full pre-run state and confirmation the migration has NOT run.
    const preState = await snapshotState(client);
    assert.equal(
      await kindColumnExists(client),
      false,
      "pre-migration table unexpectedly already has a `kind` column",
    );

    // Model the migration's transactional boundary.
    await client.query("SAVEPOINT before_migration");

    // ── Apply the migration whose intermediate step fails ──
    // The real ADD COLUMN + backfill apply first (partial change), then the
    // forced `SELECT 1 / 0` raises before the CHECK/index steps. The whole
    // statement batch must error — this is the "migration did not apply
    // successfully" indication (Requirement 9.4).
    let migrationError: unknown = null;
    try {
      await client.query(faultyMigration);
    } catch (err) {
      migrationError = err;
    }
    assert.notEqual(
      migrationError,
      null,
      "the mid-migration failure did not surface an error indication",
    );

    // ── Roll back all partial changes (the migration's transaction aborting) ──
    await client.query("ROLLBACK TO SAVEPOINT before_migration");

    // ── Assert the database is IDENTICAL to its pre-run state ──

    // (a) 0 modified: the partial `ADD COLUMN kind` change was fully discarded.
    assert.equal(
      await kindColumnExists(client),
      false,
      "the `kind` column survived rollback — partial migration change was not undone",
    );

    // (b) 0 added, 0 removed, 0 modified: every row's slug/name/name_normalized/
    //     city/attributes is byte-for-byte unchanged. Both snapshots are ordered
    //     by slug, so deep-equal of the full arrays proves complete invariance.
    const postState = await snapshotState(client);
    assert.equal(
      postState.length,
      preState.length,
      `row count changed after rollback (pre=${preState.length}, post=${postState.length})`,
    );
    assert.deepEqual(
      postState,
      preState,
      "table state differs from pre-run state after rollback (records/slugs/names/attributes not invariant)",
    );
  } finally {
    // Always discard — never persist test data or migration side effects.
    await client.query("ROLLBACK");
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "Migration rollback (Requirement 9.4): mid-migration failure leaves DB identical to pre-run state",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 9.4

    let client: pg.PoolClient;

    before(async () => {
      client = await (pool as pg.Pool).connect();
    });

    after(async () => {
      client?.release();
      if (pool) await pool.end().catch(() => {});
    });

    it("rolls back fully on an empty table (0 deleted, 0 added, 0 modified) and surfaces an error", async () => {
      await runRollbackCase(client, EMPTY_DATASET);
    });

    it("rolls back fully with a single fully-populated locality and surfaces an error", async () => {
      await runRollbackCase(client, SINGLE_ROW_DATASET);
    });

    it("rolls back fully across multiple cities with mixed attributes and surfaces an error", async () => {
      await runRollbackCase(client, MULTI_ROW_DATASET);
    });
  },
);
