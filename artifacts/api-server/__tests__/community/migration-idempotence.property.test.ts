// Feature: community-generalized-locality, Property 19: Migration idempotence
//
// Property test for the Стадия-2 locality-kind migration
// (`migrations/2026-06-10-locality-kind.sql`).
//
// **Property 19: Migration idempotence**
//   *For any* pre-migration dataset, applying the Migration a second time
//   succeeds without error and leaves every Locality_Record's slug, name,
//   name_normalized, city, attributes, AND kind exactly as they were after the
//   first application; no record is added, removed, or modified by the re-run.
//
// **Validates: Requirements 9.3**
//
// ── Harness (identical seam to Property 18 / task 1.3) ────────────────────────
// This is a DB-backed property: the migration is *SQL DDL against Postgres*, so
// the only faithful test applies the real migration file to a real Postgres and
// observes the transform. There is intentionally NO in-memory substitute here —
// pg-mem / pglite cannot faithfully execute this migration's mix of
// `ADD COLUMN IF NOT EXISTS ... DEFAULT`, a guarded `DO $$ ... $$` CHECK block
// querying `information_schema`, and `CREATE INDEX IF NOT EXISTS`.
//
// The test targets a real Postgres seam gated on env:
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS
//     (it never fakes a pass and never weakens assertions to avoid the DB).
//
// Isolation: each iteration runs inside its own transaction that is ALWAYS
// rolled back. The pre-migration `zhk` table lives in an ephemeral schema
// (`mig_test`) created inside that transaction, so ROLLBACK discards the schema,
// table, data, and every migration side effect — nothing leaks between runs.
//
// The migration's own outer `BEGIN;`/`COMMIT;` are stripped so the DDL executes
// inside the test's controlling transaction (Postgres has transactional DDL);
// the migration *body* under test is otherwise applied verbatim from disk. The
// SAME stripped body is applied twice to exercise idempotence.
//
// Iterations: `{ numRuns: 100 }` when executed against a reachable Postgres.
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/migration-idempotence.property.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fc from "fast-check";
import pg from "pg";

const { Pool } = pg;

// ─── Resolve migration SQL (applied verbatim, sans outer BEGIN/COMMIT) ─────────

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  here,
  "../../migrations/2026-06-10-locality-kind.sql",
);
const rawMigration = readFileSync(migrationPath, "utf8");

// Strip ONLY the outer transaction control so the DDL runs inside the test's
// controlling (always-rolled-back) transaction. The body is unchanged.
const migrationBody = rawMigration
  .replace(/^\s*BEGIN\s*;\s*$/im, "")
  .replace(/^\s*COMMIT\s*;\s*$/im, "");

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

// ─── Generators (mirror Property 18 / task 1.3 pre-migration datasets) ─────────

const cyrillicCharArb = fc.constantFrom(
  "а", "б", "в", "г", "д", "е", "ж", "з", "и", "к", "л", "м",
  "н", "о", "п", "р", "с", "т", "у", "ф", "х", "ц", "ч", "ш",
);
const latinCharArb = fc.constantFrom(
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "0", "1", "2", "3", " ", "-",
);
const nameCharArb = fc.oneof(
  { weight: 5, arbitrary: cyrillicCharArb },
  { weight: 4, arbitrary: latinCharArb },
);

// Locality name (pre-migration `zhk.name`); varchar(100) so keep it modest.
const nameArb: fc.Arbitrary<string> = fc
  .array(nameCharArb, { minLength: 1, maxLength: 40 })
  .map((xs) => xs.join(""));

// Nullable/empty-capable attribute strings (developer, completion_date). The
// migration MUST preserve these byte-for-byte regardless of content.
const attrStringArb = fc.option(fc.string({ maxLength: 50 }), { nil: null });

// buildings jsonb attribute — null or an array of building objects.
const buildingsArb = fc.option(
  fc.array(
    fc.record({
      name: fc.string({ maxLength: 12 }),
      floors: fc.integer({ min: 1, max: 40 }),
    }),
    { maxLength: 4 },
  ),
  { nil: null },
);

interface RowSpec {
  cityId: number;
  name: string;
  developer: string | null;
  completionDate: string | null;
  buildings: Array<{ name: string; floors: number }> | null;
}

const rowSpecArb: fc.Arbitrary<RowSpec> = fc.record({
  cityId: fc.integer({ min: 1, max: 5 }),
  name: nameArb,
  developer: attrStringArb,
  completionDate: attrStringArb,
  buildings: buildingsArb,
});

// A pre-migration dataset: 0..30 locality records (includes the empty case).
const datasetArb: fc.Arbitrary<RowSpec[]> = fc.array(rowSpecArb, {
  minLength: 0,
  maxLength: 30,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalization key mirrors production `lower(trim(name))`. */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Full, order-independent snapshot of the `zhk` table state that Property 19
 * must hold invariant across a repeat migration: every column that carries
 * record identity, name, attributes, and the `kind` discriminator.
 */
interface StateRow {
  slug: string;
  name: string;
  name_normalized: string;
  city_id: number;
  developer: string | null;
  completion_date: string | null;
  buildings: unknown;
  kind: string;
}

async function snapshotState(client: pg.PoolClient): Promise<StateRow[]> {
  const res = await client.query(
    `SELECT slug, name, name_normalized, city_id, developer, completion_date, buildings, kind
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
    kind: r.kind,
  }));
}

/**
 * Applies Property 19 for one generated dataset inside a single transaction
 * that is ALWAYS rolled back. Seeds pre-migration data, applies the migration
 * once, snapshots full state, applies the migration a SECOND time (must not
 * error), then asserts full-state equality. Throws (assert) on violation.
 */
async function runOnce(client: pg.PoolClient, dataset: RowSpec[]): Promise<void> {
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

    // Seed the generated dataset. Slugs are made unique per-row via index.
    for (let i = 0; i < dataset.length; i++) {
      const spec = dataset[i];
      await client.query(
        `INSERT INTO zhk (slug, name, name_normalized, city_id, developer, completion_date, buildings)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          `loc-${i}`,
          spec.name,
          normalize(spec.name),
          spec.cityId,
          spec.developer,
          spec.completionDate,
          spec.buildings === null ? null : JSON.stringify(spec.buildings),
        ],
      );
    }

    // ── First application of the ACTUAL migration body (verbatim) ──
    await client.query(migrationBody);

    // Snapshot the full post-first-run state — this is the invariant baseline.
    const firstRunState = await snapshotState(client);

    // ── Second application — the defining act of Property 19 ──
    // Must succeed WITHOUT error thanks to the migration's idempotent guards
    // (ADD COLUMN IF NOT EXISTS / guarded DO $$ CHECK / CREATE INDEX IF NOT
    // EXISTS). Any thrown error here fails the property.
    await assert.doesNotReject(
      async () => {
        await client.query(migrationBody);
      },
      "second application of the migration threw an error (not idempotent)",
    );

    // Snapshot again after the repeat run.
    const secondRunState = await snapshotState(client);

    // (a) No record added or removed by the re-run.
    assert.equal(
      secondRunState.length,
      firstRunState.length,
      `re-running the migration changed the row count (first=${firstRunState.length}, second=${secondRunState.length})`,
    );

    // (b) Every record's slug/name/name_normalized/city/attributes/kind is
    //     byte-for-byte unchanged. Both snapshots are ordered by slug, so a
    //     deep-equal of the full arrays proves complete state invariance.
    assert.deepEqual(
      secondRunState,
      firstRunState,
      "re-running the migration modified at least one record (records/kinds/slugs/names/attributes not invariant)",
    );
  } finally {
    // Always discard — never persist test data or migration side effects.
    await client.query("ROLLBACK");
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "Migration Property 19: idempotence (second run is a no-op)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 9.3

    let client: pg.PoolClient;

    before(async () => {
      client = await (pool as pg.Pool).connect();
    });

    after(async () => {
      client?.release();
      if (pool) await pool.end().catch(() => {});
    });

    it("applying the migration twice succeeds and leaves records, kinds, slugs, names, and attributes unchanged", async () => {
      await fc.assert(
        fc.asyncProperty(datasetArb, async (dataset) => {
          await runOnce(client, dataset);
        }),
        { numRuns: 100 },
      );
    });
  },
);
