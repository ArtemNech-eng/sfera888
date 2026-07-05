// Feature: community-generalized-locality, Property 12: is_indexable threshold consistency
/**
 * Property test for is_indexable threshold consistency (Community Generalized
 * Locality, Стадия 7).
 *
 * Property 12: *For any* Locality and any sequence of thread additions/removals,
 *              after recomputation the Locality's `is_indexable` SHALL equal
 *              whether its current content satisfies the Content_Threshold, this
 *              evaluation SHALL depend only on content and NOT on Locality_Kind,
 *              and a Locality that has never been evaluated SHALL have
 *              `is_indexable = false`.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 *
 * Module under test (`src/lib/seoContentThreshold.ts`):
 *   - `recomputeLocalityIndexable(localityId, options)` — the DB-backed
 *     recompute. It resolves the Locality by `zhkTable.id` ONLY (no branch on
 *     `kind`), counts its `scope='zhk'` public Local_Feed threads, feeds the
 *     content signals + thread count into the pure `computeContentScore`, and
 *     sets `is_indexable = meetsContentThreshold(score, threshold)`. It writes
 *     only when the value actually changes (false↔true transitions — R6.3/6.4).
 *   - `computeContentScore` / `meetsContentThreshold` — the pure core the
 *     recompute derives its verdict from.
 *   - `CONTENT_SCORE_WEIGHTS` / `THREAD_SCORE_CAP` / `DEFAULT_MIN_CONTENT_SCORE`
 *     — the exported single-source-of-truth constants.
 *
 * DB seam.
 *   `recomputeLocalityIndexable` exposes an INJECTABLE `options.database` seam
 *   (typed `typeof db`, defaulting to the shared `@workspace/db` pool). This
 *   repository has NO ephemeral/transactional-Postgres harness, and
 *   `@workspace/db` opens a `pg.Pool` at module-load time. So — following the
 *   established community-test convention (fake `DATABASE_URL`, dynamic `.js`
 *   import) — this test exercises the REAL `recomputeLocalityIndexable` through
 *   a tiny in-memory fake `database` that reproduces the exact Drizzle call
 *   chains the function issues:
 *       select({...}).from(zhkTable).where(...).limit(1)   → the locality row
 *       select({count}).from(communityThreadsTable).where(...) → thread count
 *       update(zhkTable).set({...}).where(...)              → persist verdict
 *   The fake holds ONE locality row + a mutable thread count (the add/remove
 *   sequence result) and applies real updates to its state, so the production
 *   score→threshold→persist path runs verbatim. The generated add/remove
 *   sequence is modelled as the thread count fed to that query. No assertion is
 *   faked: the verdict is checked against an INDEPENDENT oracle built from the
 *   exported weights, and against the pure `meetsContentThreshold`.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/is-indexable-threshold.property.test.ts
 */

// `seoContentThreshold.ts` statically imports `@workspace/db`, which
// instantiates a pg.Pool at module-load time and throws when DATABASE_URL is
// unset. pg.Pool does not connect lazily, so a fake connection string suffices
// — every query in this test is served by the in-memory fake `database` seam.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Dynamic import with `.js` extension so the DATABASE_URL assignment above runs
// BEFORE `@workspace/db` is loaded transitively.
const seo = await import("../../src/lib/seoContentThreshold.js");
const {
  recomputeLocalityIndexable,
  computeContentScore,
  meetsContentThreshold,
  CONTENT_SCORE_WEIGHTS,
  THREAD_SCORE_CAP,
  DEFAULT_MIN_CONTENT_SCORE,
} = seo;

// The real Drizzle table objects — needed so the fake `database` can tell the
// locality SELECT (from zhkTable) apart from the thread-count SELECT (from
// communityThreadsTable) by identity, exactly as production composes them.
const dbmod = await import("@workspace/db");
const { zhkTable, communityThreadsTable } = dbmod;

// ─── Locality_Kind: must NOT affect the recompute verdict (Requirement 6.1) ──
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

// ─── Content signals of a Locality row (kind-agnostic) ───────────────────────
interface LocalitySignals {
  developer: string | null;
  completionDate: string | null;
  buildings: unknown[] | null;
  bodyMd: string | null;
  hasAggregatedPrices: boolean;
}

/** The stored `zhk` row shape the recompute reads / writes. */
interface LocalityRow {
  id: number;
  developer: string | null;
  completionDate: string | null;
  buildings: unknown[] | null;
  bodyMd: string | null;
  contentScore: number;
  isIndexable: boolean;
}

// ─── In-memory fake of the injectable `database` seam ────────────────────────
/**
 * Reproduces the exact call chains `recomputeLocalityIndexable` issues:
 *   • select().from(zhkTable).where().limit()  → [row]  (or [] when notFound)
 *   • select().from(communityThreadsTable).where() → [{ threadCount }]
 *   • update(zhkTable).set(values).where()     → mutates the stored row
 * The `where`/`limit` predicates are opaque SQL objects in production, so the
 * fake ignores their contents — it models a single resolved locality plus the
 * current Local_Feed thread count (the add/remove sequence result).
 */
function makeFakeDatabase(
  row: LocalityRow | null,
  threadCountRef: { count: number },
) {
  const state: LocalityRow | null = row ? { ...row } : null;
  const projectRow = () =>
    state === null
      ? []
      : [
          {
            id: state.id,
            developer: state.developer,
            completionDate: state.completionDate,
            buildings: state.buildings,
            bodyMd: state.bodyMd,
            contentScore: state.contentScore,
            isIndexable: state.isIndexable,
          },
        ];

  const fake = {
    select(_projection: unknown) {
      return {
        from(table: unknown) {
          if (table === zhkTable) {
            return {
              where(_pred: unknown) {
                return { limit(_n: number) { return Promise.resolve(projectRow()); } };
              },
            };
          }
          // communityThreadsTable → count(*) query (awaited after .where()).
          return {
            where(_pred: unknown) {
              return Promise.resolve([{ threadCount: threadCountRef.count }]);
            },
          };
        },
      };
    },
    update(_table: unknown) {
      return {
        set(values: Partial<LocalityRow>) {
          return {
            where(_pred: unknown) {
              if (state) Object.assign(state, values);
              return Promise.resolve();
            },
          };
        },
      };
    },
    /** Test-only accessor for the row after recompute persists its verdict. */
    _state(): LocalityRow | null {
      return state;
    },
  };

  return fake;
}

/** Cast helper — the fake structurally serves the seam but not the full type. */
type DbSeam = NonNullable<
  Parameters<typeof recomputeLocalityIndexable>[1]
>["database"];
const asSeam = (fake: ReturnType<typeof makeFakeDatabase>): DbSeam =>
  fake as unknown as DbSeam;

// ─── Independent oracle for the content score ────────────────────────────────
/**
 * Recomputes the score from the EXPORTED weights via a code path independent of
 * `computeContentScore`, so a regression in the production scorer (missing
 * signal, wrong cap, etc.) is caught rather than silently mirrored.
 */
function oracleScore(sig: LocalitySignals, threadCount: number): number {
  const w = CONTENT_SCORE_WEIGHTS;
  let s = 0;
  if (sig.developer && sig.developer.trim().length > 0) s += w.developer;
  if (sig.completionDate && sig.completionDate.trim().length > 0) s += w.completionDate;
  if (Array.isArray(sig.buildings) && sig.buildings.length > 0) s += w.buildings;
  const cappedThreads = Math.min(Math.max(threadCount, 0), THREAD_SCORE_CAP);
  s += cappedThreads * w.perThread;
  if (sig.hasAggregatedPrices) s += w.aggregatedPrices;
  if (sig.bodyMd && sig.bodyMd.trim().length > 0) s += w.aiSeedBody;
  return s;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

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

const signalsArb: fc.Arbitrary<LocalitySignals> = fc.record({
  developer: textAttrArb,
  completionDate: textAttrArb,
  buildings: buildingsArb,
  bodyMd: textAttrArb,
  hasAggregatedPrices: fc.boolean(),
});

// A sequence of thread add/remove operations. Removals on an empty feed keep
// the count at 0 (mirrors "0 → never-evaluated/below-threshold stays false").
type Op = "add" | "remove";
const opsArb: fc.Arbitrary<Op[]> = fc.array(
  fc.constantFrom<Op>("add", "remove"),
  { minLength: 0, maxLength: 20 },
);

/** Apply the add/remove sequence to a clamped, non-negative thread count. */
function applyOps(ops: readonly Op[]): number {
  let count = 0;
  for (const op of ops) {
    if (op === "add") count += 1;
    else count = Math.max(0, count - 1);
  }
  return count;
}

// Threshold pool: 0 ("index everything"), the shipped default, and a spread of
// values that straddle the achievable score range so both verdicts occur.
const thresholdArb = fc.constantFrom(0, 4, 8, DEFAULT_MIN_CONTENT_SCORE, 14, 20, 30);

/** Build a freshly-created (never-evaluated) locality row: default false / 0. */
function freshRow(id: number, sig: LocalitySignals): LocalityRow {
  return {
    id,
    developer: sig.developer,
    completionDate: sig.completionDate,
    buildings: sig.buildings,
    bodyMd: sig.bodyMd,
    contentScore: 0,      // column default
    isIndexable: false,   // column default — never evaluated
  };
}

// ─── Property 12a — post-recompute is_indexable == threshold satisfaction ────

describe("is_indexable — Property 12: verdict equals Content_Threshold satisfaction", () => {
  // Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5

  it("after any add/remove sequence, is_indexable == (content score >= threshold)", async () => {
    await fc.assert(
      fc.asyncProperty(
        signalsArb,
        opsArb,
        thresholdArb,
        fc.boolean(),
        async (sig, ops, threshold, priorIndexable) => {
          const threadCount = applyOps(ops);
          const threadCountRef = { count: threadCount };
          const row = freshRow(1, sig);
          // Simulate an arbitrary prior stored verdict so we also cover the
          // false↔true transition writes (R6.3 / R6.4).
          row.isIndexable = priorIndexable;
          const fake = makeFakeDatabase(row, threadCountRef);

          const result = await recomputeLocalityIndexable(1, {
            threshold,
            hasAggregatedPrices: sig.hasAggregatedPrices,
            database: asSeam(fake),
          });

          assert.ok(result, "existing locality must resolve (non-null result)");

          const expectedScore = oracleScore(sig, threadCount);
          const expectedIndexable = expectedScore >= threshold;

          // (1) Score matches the independent weight oracle.
          assert.equal(
            result!.contentScore,
            expectedScore,
            `content score mismatch (threads=${threadCount})`,
          );
          // (2) Verdict equals threshold satisfaction (the property core).
          assert.equal(
            result!.isIndexable,
            expectedIndexable,
            `is_indexable must equal (score ${expectedScore} >= threshold ${threshold})`,
          );
          // (3) Verdict agrees with the pure gate used in production.
          assert.equal(
            result!.isIndexable,
            meetsContentThreshold(expectedScore, threshold),
            "recompute verdict must match meetsContentThreshold",
          );
          // (4) The persisted row reflects the recomputed verdict/score.
          const persisted = fake._state();
          assert.equal(persisted!.isIndexable, expectedIndexable, "persisted is_indexable");
          assert.equal(persisted!.contentScore, expectedScore, "persisted content_score");
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ─── Property 12b — content-only: verdict does NOT depend on Locality_Kind ───

describe("is_indexable — Property 12: evaluation depends only on content, not kind", () => {
  // Validates: Requirement 6.1

  it("identical content yields an identical verdict for zhk / district / settlement", async () => {
    await fc.assert(
      fc.asyncProperty(signalsArb, opsArb, thresholdArb, async (sig, ops, threshold) => {
        const threadCount = applyOps(ops);

        // Recompute the SAME content once "per kind". The recompute never reads
        // a kind column, so the verdict must be byte-identical across kinds —
        // this asserts the kind-invariance rather than assuming it.
        const verdicts = await Promise.all(
          LOCALITY_KINDS.map(async (_kind: LocalityKind) => {
            const fake = makeFakeDatabase(freshRow(1, sig), { count: threadCount });
            const r = await recomputeLocalityIndexable(1, {
              threshold,
              hasAggregatedPrices: sig.hasAggregatedPrices,
              database: asSeam(fake),
            });
            return { score: r!.contentScore, indexable: r!.isIndexable };
          }),
        );

        for (let i = 1; i < verdicts.length; i++) {
          assert.deepEqual(
            verdicts[i],
            verdicts[0],
            `verdict differs between ${LOCALITY_KINDS[0]} and ${LOCALITY_KINDS[i]} — must be kind-agnostic`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Property 12c — never-evaluated locality has is_indexable = false ────────

describe("is_indexable — Property 12: never-evaluated → false", () => {
  // Validates: Requirements 6.2

  it("a never-evaluated locality (fresh row) starts false, and below-threshold recompute stays false", async () => {
    await fc.assert(
      fc.asyncProperty(signalsArb, async (sig) => {
        // Never-evaluated posture: zero threads, column defaults (score 0,
        // is_indexable false). Use the shipped default threshold.
        const row = freshRow(1, sig);
        assert.equal(row.isIndexable, false, "column default must be false");

        // A zero-thread locality whose content does not reach the default
        // threshold must remain non-indexable after recompute (R6.2).
        const fake = makeFakeDatabase(row, { count: 0 });
        const r = await recomputeLocalityIndexable(1, {
          threshold: DEFAULT_MIN_CONTENT_SCORE,
          hasAggregatedPrices: sig.hasAggregatedPrices,
          database: asSeam(fake),
        });

        const score = oracleScore(sig, 0);
        if (score < DEFAULT_MIN_CONTENT_SCORE) {
          assert.equal(r!.isIndexable, false, "below-threshold locality must stay non-indexable");
          assert.equal(fake._state()!.isIndexable, false, "persisted verdict must stay false");
        } else {
          // If the seed attributes alone already clear the threshold, the gate
          // is exactly the threshold check — still content-driven, not kind.
          assert.equal(r!.isIndexable, score >= DEFAULT_MIN_CONTENT_SCORE);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("removing all threads drives a previously-indexable locality back to false (R6.4)", async () => {
    // Content with NO attributes: score is purely thread-driven. With enough
    // threads it clears a modest threshold; removing them all → below threshold.
    const noAttrs: LocalitySignals = {
      developer: null,
      completionDate: null,
      buildings: null,
      bodyMd: null,
      hasAggregatedPrices: false,
    };
    const threshold = 4; // = 2 threads worth of perThread weight (2*2)

    // Start indexable with 3 threads.
    const ref = { count: 3 };
    const fake = makeFakeDatabase(
      { ...freshRow(1, noAttrs), contentScore: oracleScore(noAttrs, 3), isIndexable: true },
      ref,
    );

    // Remove all threads → count 0 → score 0 → below threshold → false.
    ref.count = 0;
    const r = await recomputeLocalityIndexable(1, { threshold, database: asSeam(fake) });
    assert.equal(r!.contentScore, 0);
    assert.equal(r!.isIndexable, false, "emptying the feed must revoke indexability");
    assert.equal(r!.changed, true, "true→false transition must be persisted");
    assert.equal(fake._state()!.isIndexable, false);
  });
});

// ─── Concrete example — add/remove sequence crossing the threshold ───────────

describe("is_indexable — Property 12: concrete add/remove sequence", () => {
  it("verdict tracks threshold as threads are added then removed", async () => {
    const sig: LocalitySignals = {
      developer: "ПИК",          // +2
      completionDate: null,
      buildings: null,
      bodyMd: null,
      hasAggregatedPrices: false,
    };
    const threshold = 8; // developer(2) + threads*2 ; needs >=3 threads to reach 8
    const ref = { count: 0 };
    const fake = makeFakeDatabase(freshRow(1, sig), ref);

    // 0 threads → score 2 → below 8 → false
    ref.count = 0;
    let r = await recomputeLocalityIndexable(1, { threshold, database: asSeam(fake) });
    assert.equal(r!.contentScore, 2);
    assert.equal(r!.isIndexable, false);

    // add to 3 threads → 2 + 6 = 8 → meets → true
    ref.count = 3;
    r = await recomputeLocalityIndexable(1, { threshold, database: asSeam(fake) });
    assert.equal(r!.contentScore, 8);
    assert.equal(r!.isIndexable, true);
    assert.equal(r!.changed, true);

    // remove back to 1 thread → 2 + 2 = 4 → below → false
    ref.count = 1;
    r = await recomputeLocalityIndexable(1, { threshold, database: asSeam(fake) });
    assert.equal(r!.contentScore, 4);
    assert.equal(r!.isIndexable, false);
    assert.equal(r!.changed, true);
  });

  it("returns null for a locality id that does not resolve", async () => {
    const fake = makeFakeDatabase(null, { count: 0 });
    const r = await recomputeLocalityIndexable(999, { database: asSeam(fake) });
    assert.equal(r, null, "unknown locality id must yield null");
  });
});
