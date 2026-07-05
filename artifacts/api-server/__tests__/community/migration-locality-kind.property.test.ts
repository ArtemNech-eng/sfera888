// Feature: community-generalized-locality, Property 18: Migration preserves data and defaults to zhk
//
// Property test for the Стадия-2 locality-kind migration
// (`migrations/2026-06-10-locality-kind.sql`).
//
// **Property 18: Migration preserves data and defaults to zhk**
//   *For any* pre-migration dataset, after applying the Migration every
//   previously existing Locality_Record retains its slug, name, and attribute
//   values unchanged; the per-City count of Locality_Records is unchanged
//   (0 added, 0 removed); and every previously existing Locality_Record has
//   kind = 'zhk'.
//
// **Validates: Requirements 3.3, 3.4, 9.1, 9.2**
//
// ── Harness ──────────────────────────────────────────────────────────────────
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
// the migration *body* under test is otherwise applied verbatim from disk.
//
// Iterations: `{ numRuns: 100 }` when executed against a reachable Postgres.
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/migration-locality-kind.property.test.ts

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

// ─── Generators ────────────────────────────────────────────────────────────────

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

interface SeededRow {
  slug: string;
  name: string;
  nameNormalized: string;
  cityId: number;
  developer: string | null;
  completionDate: string | null;
  buildings: RowSpec["buildings"];
}

/**
 * Applies Property 18 for one generated dataset inside a single transaction
 * that is ALWAYS rolled back. Returns nothing; throws (assert) on violation.
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

    // Seed the generated dataset. Slugs are made unique per-row via index; the
    // exact slug text is what the migration must preserve.
    const seeded: SeededRow[] = [];
    for (let i = 0; i < dataset.length; i++) {
      const spec = dataset[i];
      const slug = `loc-${i}`;
      const nameNormalized = normalize(spec.name);
      await client.query(
        `INSERT INTO zhk (slug, name, name_normalized, city_id, developer, completion_date, buildings)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          slug,
          spec.name,
          nameNormalized,
          spec.cityId,
          spec.developer,
          spec.completionDate,
          spec.buildings === null ? null : JSON.stringify(spec.buildings),
        ],
      );
      seeded.push({
        slug,
        name: spec.name,
        nameNormalized,
        cityId: spec.cityId,
        developer: spec.developer,
        completionDate: spec.completionDate,
        buildings: spec.buildings,
      });
    }

    // Pre-migration per-City counts snapshot.
    const beforeCounts = new Map<number, number>();
    for (const r of seeded) {
      beforeCounts.set(r.cityId, (beforeCounts.get(r.cityId) ?? 0) + 1);
    }

    // ── Apply the ACTUAL migration body verbatim ──
    await client.query(migrationBody);

    // ── Observe post-migration state ──
    const after = await client.query(
      `SELECT slug, name, name_normalized, city_id, developer, completion_date, buildings, kind
       FROM zhk`,
    );

    // (a) 0 added, 0 removed — total row count unchanged.
    assert.equal(
      after.rowCount,
      seeded.length,
      `row count changed by migration (before=${seeded.length}, after=${after.rowCount})`,
    );

    // (b) per-City counts unchanged.
    const afterCounts = new Map<number, number>();
    for (const row of after.rows) {
      const c = Number(row.city_id);
      afterCounts.set(c, (afterCounts.get(c) ?? 0) + 1);
    }
    assert.equal(afterCounts.size, beforeCounts.size, "distinct City set changed");
    for (const [cityId, cnt] of beforeCounts) {
      assert.equal(
        afterCounts.get(cityId),
        cnt,
        `per-City count changed for city ${cityId}`,
      );
    }

    // (c) every pre-existing record preserved unchanged + kind === 'zhk'.
    const afterBySlug = new Map<string, (typeof after.rows)[number]>();
    for (const row of after.rows) afterBySlug.set(row.slug, row);

    for (const expected of seeded) {
      const got = afterBySlug.get(expected.slug);
      assert.ok(got, `record with slug ${expected.slug} disappeared after migration`);

      // slug (implicitly matched), name, name_normalized, city, attributes.
      assert.equal(got.name, expected.name, `name changed for ${expected.slug}`);
      assert.equal(
        got.name_normalized,
        expected.nameNormalized,
        `name_normalized changed for ${expected.slug}`,
      );
      assert.equal(
        Number(got.city_id),
        expected.cityId,
        `city_id changed for ${expected.slug}`,
      );
      assert.equal(
        got.developer,
        expected.developer,
        `developer attribute changed for ${expected.slug}`,
      );
      assert.equal(
        got.completion_date,
        expected.completionDate,
        `completion_date attribute changed for ${expected.slug}`,
      );
      assert.deepEqual(
        got.buildings ?? null,
        expected.buildings,
        `buildings attribute changed for ${expected.slug}`,
      );

      // The defining behavior of Property 18: default kind 'zhk'.
      assert.equal(
        got.kind,
        "zhk",
        `pre-existing record ${expected.slug} did not default to kind 'zhk'`,
      );
    }
  } finally {
    // Always discard — never persist test data or migration side effects.
    await client.query("ROLLBACK");
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "Migration Property 18: preserves data and defaults to zhk",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 3.3, 3.4, 9.1, 9.2

    let client: pg.PoolClient;

    before(async () => {
      client = await (pool as pg.Pool).connect();
    });

    after(async () => {
      client?.release();
      if (pool) await pool.end().catch(() => {});
    });

    it("applying the migration keeps slug/name/attributes, per-City counts, and sets kind='zhk'", async () => {
      await fc.assert(
        fc.asyncProperty(datasetArb, async (dataset) => {
          await runOnce(client, dataset);
        }),
        { numRuns: 100 },
      );
    });
  },
);
