// Feature: community-generalized-locality, Property 12: is_indexable threshold consistency
//
// Property test for is_indexable threshold consistency (Community Generalized
// Locality, Стадия 7) — DB-backed variant.
//
// **Property 12: is_indexable threshold consistency**
//   *For any* Locality and any sequence of thread additions/removals, after
//   recomputation the Locality's `is_indexable` SHALL equal whether its current
//   content satisfies the Content_Threshold, this evaluation SHALL depend only
//   on content and NOT on Locality_Kind, and a Locality that has never been
//   evaluated SHALL have `is_indexable = false`.
//
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
//
// ── What is under test ────────────────────────────────────────────────────────
// The REAL production recompute `recomputeLocalityIndexable(localityId, options)`
// (`src/lib/seoContentThreshold.ts`). It:
//   • resolves the Locality by `zhkTable.id` ONLY — no branch on `kind` (R6.1);
//   • counts its Local_Feed threads (scope='zhk', zhk_id=<id>, visibility='public');
//   • feeds the content signals (developer / completion_date / buildings /
//     body_md / aggregated-prices flag) + that thread count into the pure
//     `computeContentScore`, and sets
//         is_indexable = meetsContentThreshold(score, threshold)   (R6.2–6.4);
//   • persists `content_score` + `is_indexable` only when they actually change.
// The WHERE predicates + the count aggregation are OPAQUE SQL — the faithful way
// to verify content+threshold consistency is to run them against a real Postgres.
// This test does NOT re-implement the query in memory; it drives the actual
// `recomputeLocalityIndexable` (with the transaction injected via
// `options.database`) and compares the verdict to an INDEPENDENT score oracle
// built from the exported weights.
//
// ── DB harness (matches the repo's DB-backed convention — see task 6.2) ───────
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS.
//     It NEVER fakes a pass and NEVER weakens assertions to dodge the DB.
//   - Each iteration runs inside a single `db.transaction(...)` that is ALWAYS
//     rolled back: it creates an ephemeral schema `indexable_prop_test` with
//     throwaway `zhk` + `community_threads` tables (no FKs), seeds a Locality of
//     a generated kind + a generated set of threads, runs the REAL recompute
//     with `options.database = tx`, asserts, then throws a rollback sentinel so
//     the schema/tables/data are discarded (nothing leaks between iterations).
//
// Iterations: `{ numRuns: 100 }` for the main property; kind-invariance uses
// `{ numRuns: 60 }` to bound per-iteration DB cost while staying well above the
// 30-run floor.
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/locality-indexable.property.test.ts

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
type SeoModule = typeof import("../../src/lib/seoContentThreshold.js");
let dbmod: DbModule | null = null;
let seomod: SeoModule | null = null;
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
    // recompute + the `sql` tag) so the singleton pool binds to the real DB.
    process.env.DATABASE_URL = dbUrl;
    dbmod = await import("@workspace/db");
    seomod = await import("../../src/lib/seoContentThreshold.js");
    sqlTag = (await import("drizzle-orm")).sql;
  }
}

// ─── Local_Feed thread-count base condition (reference, kept local) ──────────
const SCOPE_ZHK = "zhk";
const SCOPE_CITY = "city";
const PUBLIC_VISIBILITY = "public";

/** Locality_Kind values — the recompute verdict must be identical for every one. */
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

// ─── Generators ────────────────────────────────────────────────────────────────

// Attribute signals — mix of null / empty / whitespace / filled so trimming is
// exercised (empty & whitespace-only must NOT contribute to the score).
const textAttrArb: fc.Arbitrary<string | null> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom<string | null>(null, "", "   ", "\t\n") },
  { weight: 4, arbitrary: fc.constantFrom("ПИК", "Setl Group", "2026 Q4", "corp-A") },
);

const buildingsArb: fc.Arbitrary<unknown[] | null> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom<unknown[] | null>(null, []) },
  {
    weight: 4,
    arbitrary: fc
      .integer({ min: 1, max: 4 })
      .map((n) => Array.from({ length: n }, (_v, i) => ({ name: `k${i + 1}` }))),
  },
);

interface LocalitySignals {
  developer: string | null;
  completionDate: string | null;
  buildings: unknown[] | null;
  bodyMd: string | null;
  hasAggregatedPrices: boolean;
}

const signalsArb: fc.Arbitrary<LocalitySignals> = fc.record({
  developer: textAttrArb,
  completionDate: textAttrArb,
  buildings: buildingsArb,
  bodyMd: textAttrArb,
  hasAggregatedPrices: fc.boolean(),
});

/**
 * A raw thread spec seeded into the ephemeral feed. `bindTo`:
 *   • "target" → bound to the locality under test (scope='zhk', zhk_id=target)
 *   • "other"  → bound to another id — must be EXCLUDED from the count
 *   • "null"   → zhk_id NULL (city-style) — must be EXCLUDED
 * Only rows with scope='zhk' ∧ zhk_id=target ∧ visibility='public' count toward
 * the content score (mirrors the recompute's count query).
 */
const threadSpecArb = fc.record({
  scope: fc.constantFrom(SCOPE_ZHK, SCOPE_CITY),
  visibility: fc.constantFrom(PUBLIC_VISIBILITY, "protected", "hidden"),
  bindTo: fc.constantFrom("target", "other", "null"),
});

// Threshold pool: 0 ("index everything"), the shipped default, and a spread of
// values that straddle the achievable score range so both verdicts occur.
const thresholdArb: fc.Arbitrary<number> = seomod
  ? fc.constantFrom(0, 4, 8, seomod.DEFAULT_MIN_CONTENT_SCORE, 14, 20, 30)
  : fc.constantFrom(0, 4, 8, 10, 14, 20, 30);

// A scenario: the locality's content + kind + the threads to seed + threshold.
const scenarioArb = fc.record({
  signals: signalsArb,
  kind: fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
  threads: fc.array(threadSpecArb, { minLength: 0, maxLength: 12 }),
  threshold: thresholdArb,
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

// ─── Independent oracle for the content score ────────────────────────────────
/**
 * Recomputes the score from the EXPORTED weights via a code path independent of
 * `computeContentScore`, so a regression in the production scorer (missing
 * signal, wrong cap, etc.) is caught rather than silently mirrored.
 */
function oracleScore(sig: LocalitySignals, threadCount: number): number {
  const w = seomod!.CONTENT_SCORE_WEIGHTS;
  const cap = seomod!.THREAD_SCORE_CAP;
  let s = 0;
  if (sig.developer && sig.developer.trim().length > 0) s += w.developer;
  if (sig.completionDate && sig.completionDate.trim().length > 0) s += w.completionDate;
  if (Array.isArray(sig.buildings) && sig.buildings.length > 0) s += w.buildings;
  const cappedThreads = Math.min(Math.max(threadCount, 0), cap);
  s += cappedThreads * w.perThread;
  if (sig.hasAggregatedPrices) s += w.aggregatedPrices;
  if (sig.bodyMd && sig.bodyMd.trim().length > 0) s += w.aiSeedBody;
  return s;
}

/** Reference: how many seeded threads actually count toward the score. */
function referenceThreadCount(
  specs: ReadonlyArray<{ scope: string; visibility: string; bindTo: string }>,
): number {
  return specs.filter(
    (t) => t.scope === SCOPE_ZHK && t.bindTo === "target" && t.visibility === PUBLIC_VISIBILITY,
  ).length;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "is_indexable — Property 12: threshold consistency (real recompute, DB-backed)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5

    const db = () => (dbmod as DbModule).db;
    const zhkTable = () => (dbmod as DbModule).zhkTable;
    const communityThreadsTable = () => (dbmod as DbModule).communityThreadsTable;
    const recompute = () => (seomod as SeoModule).recomputeLocalityIndexable;
    const meetsContentThreshold = () => (seomod as SeoModule).meetsContentThreshold;
    const sql = () => sqlTag as NonNullable<typeof sqlTag>;

    /**
     * Run `fn(tx)` inside a transaction that is ALWAYS rolled back. The
     * ephemeral schema + tables created inside are discarded on rollback.
     */
    async function inRolledBackTx(fn: (tx: any) => Promise<void>): Promise<void> {
      try {
        await db().transaction(async (tx: any) => {
          await tx.execute(sql().raw("CREATE SCHEMA indexable_prop_test"));
          await tx.execute(sql().raw("SET LOCAL search_path TO indexable_prop_test"));
          await tx.execute(sql().raw(CREATE_ZHK));
          await tx.execute(sql().raw(CREATE_THREADS));
          await fn(tx);
          throw new RollbackSentinel();
        });
      } catch (err) {
        if (!(err instanceof RollbackSentinel)) throw err;
      }
    }

    /** Seed one Locality of the given kind + content; return its real serial id. */
    async function seedLocality(
      tx: any,
      kind: LocalityKind,
      sig: LocalitySignals,
      slug: string,
    ): Promise<number> {
      const [row] = await tx
        .insert(zhkTable())
        .values({
          slug,
          name: `Locality ${slug}`,
          nameNormalized: `locality ${slug}`,
          cityId: 1,
          kind,
          developer: sig.developer ?? undefined,
          completionDate: sig.completionDate ?? undefined,
          buildings: (sig.buildings as any) ?? undefined,
        })
        .returning({ id: zhkTable().id });
      return row.id as number;
    }

    /** Seed the generated threads bound around the target/other localities. */
    async function seedThreads(
      tx: any,
      specs: Array<{ scope: string; visibility: string; bindTo: string }>,
      targetId: number,
      otherId: number,
    ): Promise<void> {
      for (const s of specs) {
        const zhkId =
          s.bindTo === "target" ? targetId : s.bindTo === "other" ? otherId : null;
        await tx.insert(communityThreadsTable()).values({
          zone: "sosedi",
          scope: s.scope,
          zhkId: zhkId ?? undefined,
          cityId: zhkId == null ? 1 : undefined,
          visibility: s.visibility,
          title: "t",
          body: "b",
        });
      }
    }

    /** Read the stored is_indexable / content_score straight from the row. */
    async function readStored(
      tx: any,
      id: number,
    ): Promise<{ isIndexable: boolean; contentScore: number } | null> {
      const rows = await tx.execute(
        sql().raw(`SELECT is_indexable, content_score FROM zhk WHERE id = ${id}`),
      );
      const r = (rows.rows ?? rows)[0];
      if (!r) return null;
      return {
        isIndexable: r.is_indexable === true || r.is_indexable === "t",
        contentScore: Number(r.content_score),
      };
    }

    let ready = false;
    before(() => {
      ready = dbAvailable && dbmod != null && seomod != null && sqlTag != null;
    });
    after(async () => {
      if (dbmod) await (dbmod as DbModule).pool.end().catch(() => {});
    });

    // ── 12a — post-recompute is_indexable == threshold satisfaction ──────────
    it("after any thread set, is_indexable == (content score >= threshold)", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          await inRolledBackTx(async (tx) => {
            const targetId = await seedLocality(tx, scenario.kind, scenario.signals, "target");
            // A second locality so "other"-bound threads have a real foreign id.
            const otherId = await seedLocality(
              tx,
              "zhk",
              {
                developer: null,
                completionDate: null,
                buildings: null,
                bodyMd: null,
                hasAggregatedPrices: false,
              },
              "other",
            );

            await seedThreads(tx, scenario.threads, targetId, otherId);

            const result = await recompute()(targetId, {
              threshold: scenario.threshold,
              hasAggregatedPrices: scenario.signals.hasAggregatedPrices,
              database: tx,
            });

            assert.ok(result, "existing locality must resolve (non-null result)");

            const expectedThreads = referenceThreadCount(scenario.threads);
            const expectedScore = oracleScore(scenario.signals, expectedThreads);
            const expectedIndexable = expectedScore >= scenario.threshold;

            // (1) Score matches the independent weight oracle.
            assert.equal(
              result!.contentScore,
              expectedScore,
              `content score mismatch (counted threads=${expectedThreads})`,
            );
            // (2) Verdict equals threshold satisfaction (the property core).
            assert.equal(
              result!.isIndexable,
              expectedIndexable,
              `is_indexable must equal (score ${expectedScore} >= threshold ${scenario.threshold})`,
            );
            // (3) Verdict agrees with the pure gate used in production.
            assert.equal(
              result!.isIndexable,
              meetsContentThreshold()(expectedScore, scenario.threshold),
              "recompute verdict must match meetsContentThreshold",
            );
            // (4) The persisted row reflects the recomputed verdict/score.
            const stored = await readStored(tx, targetId);
            assert.equal(stored!.isIndexable, expectedIndexable, "persisted is_indexable");
            assert.equal(stored!.contentScore, expectedScore, "persisted content_score");
          });
        }),
        { numRuns: 100 },
      );
    });

    // ── 12b — content-only: verdict does NOT depend on Locality_Kind ─────────
    it("identical content yields an identical verdict across different kinds", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      const twoKindsArb = fc
        .tuple(
          fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
          fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
        )
        .filter(([a, b]) => a !== b);

      await fc.assert(
        fc.asyncProperty(
          twoKindsArb,
          signalsArb,
          fc.array(threadSpecArb, { minLength: 0, maxLength: 10 }),
          thresholdArb,
          async ([kindA, kindB], sig, threads, threshold) => {
            await inRolledBackTx(async (tx) => {
              // Two localities of DIFFERENT kinds with IDENTICAL content, each
              // given the SAME set of target-bound threads.
              const idA = await seedLocality(tx, kindA, sig, "a");
              const idB = await seedLocality(tx, kindB, sig, "b");
              await seedThreads(tx, threads, idA, idB); // target-bound → A
              await seedThreads(tx, threads, idB, idA); // target-bound → B

              const rA = await recompute()(idA, {
                threshold,
                hasAggregatedPrices: sig.hasAggregatedPrices,
                database: tx,
              });
              const rB = await recompute()(idB, {
                threshold,
                hasAggregatedPrices: sig.hasAggregatedPrices,
                database: tx,
              });

              assert.ok(rA && rB, "both localities must resolve");
              assert.equal(
                rA!.contentScore,
                rB!.contentScore,
                `content score differs between kinds ${kindA} and ${kindB} — must be kind-agnostic`,
              );
              assert.equal(
                rA!.isIndexable,
                rB!.isIndexable,
                `is_indexable differs between kinds ${kindA} and ${kindB} — must be kind-agnostic`,
              );
            });
          },
        ),
        { numRuns: 60 },
      );
    });

    // ── 12c — never-evaluated locality has is_indexable = false ──────────────
    it("a freshly created, never-recomputed locality has is_indexable = false", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
          signalsArb,
          async (kind, sig) => {
            await inRolledBackTx(async (tx) => {
              const id = await seedLocality(tx, kind, sig, "fresh");
              // No recompute has run → the schema default must hold.
              const stored = await readStored(tx, id);
              assert.equal(
                stored!.isIndexable,
                false,
                "never-evaluated locality must have is_indexable = false (column default)",
              );
              assert.equal(
                stored!.contentScore,
                0,
                "never-evaluated locality must have content_score = 0 (column default)",
              );
            });
          },
        ),
        { numRuns: 60 },
      );
    });

    // ── 12d — add/remove sequence crosses the threshold both ways (R6.3/R6.4) ─
    it("verdict tracks the threshold as threads are added then removed", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      await inRolledBackTx(async (tx) => {
        // Content with only a developer (+2). Threshold 8 ⇒ needs >=3 threads.
        const sig: LocalitySignals = {
          developer: "ПИК",
          completionDate: null,
          buildings: null,
          bodyMd: null,
          hasAggregatedPrices: false,
        };
        const threshold = 8;
        const id = await seedLocality(tx, "district", sig, "seq");

        const addThread = async () => {
          await tx.insert(communityThreadsTable()).values({
            zone: "sosedi",
            scope: SCOPE_ZHK,
            zhkId: id,
            visibility: PUBLIC_VISIBILITY,
            title: "t",
            body: "b",
          });
        };
        const removeOneThread = async () => {
          await tx.execute(
            sql().raw(
              `DELETE FROM community_threads WHERE id = (SELECT id FROM community_threads WHERE zhk_id = ${id} AND scope = 'zhk' AND visibility = 'public' ORDER BY id DESC LIMIT 1)`,
            ),
          );
        };

        // 0 threads → score 2 → below 8 → false.
        let r = await recompute()(id, { threshold, database: tx });
        assert.equal(r!.contentScore, 2);
        assert.equal(r!.isIndexable, false);

        // Add up to 3 threads → 2 + 6 = 8 → meets → true (false→true transition).
        await addThread();
        await addThread();
        await addThread();
        r = await recompute()(id, { threshold, database: tx });
        assert.equal(r!.contentScore, 8);
        assert.equal(r!.isIndexable, true);
        assert.equal(r!.changed, true, "false→true transition must be persisted");

        // Remove two → 1 thread → 2 + 2 = 4 → below → false (true→false).
        await removeOneThread();
        await removeOneThread();
        r = await recompute()(id, { threshold, database: tx });
        assert.equal(r!.contentScore, 4);
        assert.equal(r!.isIndexable, false);
        assert.equal(r!.changed, true, "true→false transition must be persisted");
      });
    });

    // ── unknown id → null (no locality resolves) ─────────────────────────────
    it("returns null for a locality id that does not resolve", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      await inRolledBackTx(async (tx) => {
        const r = await recompute()(987654, { database: tx });
        assert.equal(r, null, "unknown locality id must yield null");
      });
    });
  },
);
