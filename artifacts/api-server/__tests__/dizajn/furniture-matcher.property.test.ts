/**
 * Property test for AI_Design_Product Furniture_Matcher
 * (`lib/furnitureMatcher.ts`).
 *
 * Property 18: Furniture_Matcher honors dim/style constraints and budget guard.
 *
 * **Validates: Requirements 10.3, 10.4, 10.5**
 *
 * Strategy: the public `pickFurniture` issues SQL through Drizzle's fluent
 * `db.select(...).from(...).where(...).orderBy(...)` chain, which is awkward
 * to mock cleanly. Instead, we test the pure post-SQL business logic via the
 * `__test__` export:
 *
 *   • `getCompatibleStyles`             — Property 18.1
 *   • `computeFurnitureBudgetCapKopeks` — Property 18.2
 *   • `enforceBudgetCap`                — Properties 18.3, 18.4, 18.5
 *   • `projectPicks`                    — Property 18.6 (id consistency)
 *
 * The SQL fetching layer is trivial and covered by integration tests against
 * the seeded `furniture_products` catalog.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { FurnitureItem } from "@workspace/db";

// `@workspace/db` requires DATABASE_URL at module load time; supply a fake
// connection string before triggering its import. The pg.Pool does not connect
// eagerly, so this is harmless. Mirrors the pattern used by the rate-limiter
// property test.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

const matcher = await import("../../src/lib/furnitureMatcher.ts");
const { getCompatibleStyles } = matcher;
const {
  STYLE_COMPATIBILITY,
  FURNITURE_BUDGET_FRACTION,
  computeFurnitureBudgetCapKopeks,
  enforceBudgetCap,
  totalKopeks,
  projectPicks,
} = matcher.__test__;

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * A single SKU candidate: matches the internal `FurnitureCandidate` shape
 * (`id`, `sku`, `name`, `priceKopeks`, `partnerUrl`, `imageUrl`). We don't
 * import the type alias because TS export-as-type from `__test__` would
 * require additional plumbing; the structural shape is what matters here.
 */
interface CandidateLike {
  id: number;
  sku: string;
  name: string;
  priceKopeks: number;
  partnerUrl: string | null;
  imageUrl: string | null;
}

const candidateArb = (idBase: number): fc.Arbitrary<CandidateLike> =>
  fc.record({
    id: fc.integer({ min: idBase, max: idBase + 999 }),
    sku: fc.string({ minLength: 1, maxLength: 16 }).map((s) => `sku-${s}`),
    name: fc.string({ minLength: 1, maxLength: 32 }),
    priceKopeks: fc.integer({ min: 0, max: 1_000_000 }),
    partnerUrl: fc.option(
      fc.string({ minLength: 1, maxLength: 64 }).map((s) => `https://x/${s}`),
      { nil: null },
    ),
    imageUrl: fc.option(
      fc.string({ minLength: 1, maxLength: 64 }).map((s) => `https://x/${s}`),
      { nil: null },
    ),
  });

/** Sorted-by-priceKopeks asc array of 1..5 candidates per item. The matcher
 *  always feeds `enforceBudgetCap` arrays in this order (`ORDER BY
 *  price_kopeks ASC, id ASC`), so the test must respect the same invariant. */
const sortedCandidatesArb = fc
  .array(candidateArb(1), { minLength: 1, maxLength: 5 })
  .map((arr) =>
    [...arr].sort(
      (a, b) => a.priceKopeks - b.priceKopeks || a.id - b.id,
    ),
  );

const furnitureItemArb: fc.Arbitrary<FurnitureItem> = fc.record({
  id: fc
    .array(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyz0123456789_-".split(""),
      ),
      { minLength: 1, maxLength: 16 },
    )
    .map((c) => c.join("")),
  type: fc.constantFrom(
    "bed",
    "wardrobe",
    "desk",
    "chair",
    "nightstand",
    "rug",
  ),
  widthCm: fc.integer({ min: 20, max: 400 }),
  depthCm: fc.integer({ min: 20, max: 400 }),
  heightCm: fc.integer({ min: 10, max: 280 }),
  xCm: fc.integer({ min: 0, max: 800 }),
  yCm: fc.integer({ min: 0, max: 800 }),
  rotationDeg: fc.constantFrom<0 | 90 | 180 | 270>(0, 90, 180, 270),
});

/**
 * Build a parallel pair: an array of `FurnitureItem`s and an array of
 * sorted candidate lists, of the same length. We constrain length to
 * 1..5 so the `enforceBudgetCap` MAX_ITERATIONS=N*4+8 always converges
 * within a fast-check run.
 */
const itemsAndCandidatesArb = fc
  .integer({ min: 1, max: 5 })
  .chain((n) =>
    fc.tuple(
      fc.array(furnitureItemArb, { minLength: n, maxLength: n }),
      fc.array(sortedCandidatesArb, { minLength: n, maxLength: n }),
    ),
  );

// ─── Property 18.1 — getCompatibleStyles invariants ──────────────────────────
// Validates: Requirements 10.3 (style filtering)

describe("Furniture_Matcher Property 18.1: getCompatibleStyles invariants", () => {
  it("for every known style, the result includes the input style itself", () => {
    for (const style of Object.keys(STYLE_COMPATIBILITY)) {
      const compatible = getCompatibleStyles(style);
      assert.ok(
        compatible.includes(style),
        `compatible styles for ${style} must include itself, got ${JSON.stringify(compatible)}`,
      );
      // Non-empty and all entries are strings.
      assert.ok(compatible.length >= 1);
      for (const c of compatible) {
        assert.equal(typeof c, "string");
      }
    }
  });

  it("for any unknown style, the result is exactly [style]", () => {
    const known = new Set(Object.keys(STYLE_COMPATIBILITY));
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 24 }), (s) => {
        fc.pre(!known.has(s));
        const out = getCompatibleStyles(s);
        assert.deepStrictEqual(out, [s]);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 18.2 — computeFurnitureBudgetCapKopeks invariants ──────────────
// Validates: Requirements 10.4 (45 % budget cap)

describe("Furniture_Matcher Property 18.2: computeFurnitureBudgetCapKopeks invariants", () => {
  it("for budgetRub > 0, result == floor(budgetRub * 100 * 0.45)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5_000_000 }), (rub) => {
        const expected = Math.floor(rub * 100 * FURNITURE_BUDGET_FRACTION);
        assert.equal(computeFurnitureBudgetCapKopeks(rub), expected);
      }),
      { numRuns: 200 },
    );
  });

  it("for budgetRub <= 0 or NaN, result == 0", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: -1_000_000, max: 0 }),
          fc.constant(Number.NaN),
          fc.constant(Number.POSITIVE_INFINITY),
          fc.constant(Number.NEGATIVE_INFINITY),
        ),
        (rub) => {
          assert.equal(computeFurnitureBudgetCapKopeks(rub), 0);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("FURNITURE_BUDGET_FRACTION is exactly 0.45 (Requirement 11.3)", () => {
    assert.equal(FURNITURE_BUDGET_FRACTION, 0.45);
  });
});

// ─── Property 18.3 — enforceBudgetCap budget invariant ───────────────────────
// Validates: Requirements 10.4

describe("Furniture_Matcher Property 18.3: enforceBudgetCap budget invariant", () => {
  it(
    "after enforceBudgetCap: total ≤ cap OR all picks are null",
    () => {
      fc.assert(
        fc.property(
          itemsAndCandidatesArb,
          fc.integer({ min: 0, max: 5_000_000 }),
          ([items, candidates], cap) => {
            // Initial pick = cheapest candidate, mirroring `pickFurniture`
            // step 2.
            const picks: Array<CandidateLike | null> = candidates.map(
              (cs) => cs[0] ?? null,
            );
            enforceBudgetCap(picks, candidates, cap);

            const total = totalKopeks(picks);
            const allNull = picks.every((p) => p === null);
            assert.ok(
              total <= cap || allNull,
              `invariant violated: total=${total}, cap=${cap}, allNull=${allNull}, picks=${JSON.stringify(picks)}`,
            );
            // length sanity (also covered by 18.5).
            assert.equal(picks.length, items.length);
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});

// ─── Property 18.4 — enforceBudgetCap monotonic descent ──────────────────────
// Validates: Requirements 10.4

describe("Furniture_Matcher Property 18.4: enforceBudgetCap monotonic descent", () => {
  it("post-process never increases the total", () => {
    fc.assert(
      fc.property(
        itemsAndCandidatesArb,
        fc.integer({ min: 0, max: 5_000_000 }),
        ([_items, candidates], cap) => {
          const picks: Array<CandidateLike | null> = candidates.map(
            (cs) => cs[0] ?? null,
          );
          const totalBefore = totalKopeks(picks);
          enforceBudgetCap(picks, candidates, cap);
          const totalAfter = totalKopeks(picks);
          assert.ok(
            totalAfter <= totalBefore,
            `total grew: before=${totalBefore}, after=${totalAfter}`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it(
    "every non-null replacement is sourced from candidatesPerItem[i] " +
      "and weakly cheaper than the original initial pick",
    () => {
      fc.assert(
        fc.property(
          itemsAndCandidatesArb,
          fc.integer({ min: 0, max: 5_000_000 }),
          ([_items, candidates], cap) => {
            const initial: Array<CandidateLike | null> = candidates.map(
              (cs) => cs[0] ?? null,
            );
            const picks: Array<CandidateLike | null> = [...initial];
            enforceBudgetCap(picks, candidates, cap);

            for (let i = 0; i < picks.length; i++) {
              const final = picks[i];
              if (final === null) continue; // dropped — fine
              const initialPick = initial[i];
              // Every non-null final pick must come from the i-th candidate
              // list (sourcing constraint).
              const sourced = candidates[i]!.some((c) => c.id === final.id);
              assert.ok(
                sourced,
                `pick for slot ${i} not sourced from its candidate list`,
              );
              // Initial pick is the cheapest, so any swap is weakly cheaper —
              // strict `<` if the algorithm replaced, equality if it left
              // the slot untouched.
              if (initialPick !== null) {
                assert.ok(
                  final.priceKopeks <= initialPick.priceKopeks,
                  `replacement made slot ${i} more expensive: ` +
                    `${initialPick.priceKopeks} → ${final.priceKopeks}`,
                );
              }
            }
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});

// ─── Property 18.5 — enforceBudgetCap preserves length ───────────────────────
// Validates: Requirements 10.4, 10.5, 10.6

describe("Furniture_Matcher Property 18.5: enforceBudgetCap preserves length", () => {
  it("picks.length is unchanged after enforceBudgetCap", () => {
    fc.assert(
      fc.property(
        itemsAndCandidatesArb,
        fc.integer({ min: 0, max: 5_000_000 }),
        ([items, candidates], cap) => {
          const picks: Array<CandidateLike | null> = candidates.map(
            (cs) => cs[0] ?? null,
          );
          const lenBefore = picks.length;
          enforceBudgetCap(picks, candidates, cap);
          assert.equal(picks.length, lenBefore);
          assert.equal(picks.length, items.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 18.6 — projectPicks id consistency ─────────────────────────────
// Validates: Requirements 10.5, 10.6

describe("Furniture_Matcher Property 18.6: projectPicks id consistency", () => {
  it(
    "for each i: picks[i].layoutId === items[i].id and picks[i].type === items[i].type",
    () => {
      fc.assert(
        fc.property(itemsAndCandidatesArb, ([items, candidates]) => {
          // Build a freely-shuffled pick set: each slot is either null
          // (no SKU found / dropped by budget) or a candidate from its
          // own candidate list.
          const picks: Array<CandidateLike | null> = candidates.map(
            (cs) => cs[Math.floor(Math.random() * (cs.length + 1))] ?? null,
          );
          const projected = projectPicks(items, picks);

          assert.equal(projected.length, items.length);
          for (let i = 0; i < items.length; i++) {
            assert.equal(projected[i]!.layoutId, items[i]!.id);
            assert.equal(projected[i]!.type, items[i]!.type);

            const pick = picks[i];
            if (pick === null) {
              // null pick → all SKU fields null, price = 0.
              assert.equal(projected[i]!.sku, null);
              assert.equal(projected[i]!.name, null);
              assert.equal(projected[i]!.pricePaidKopeks, 0);
              assert.equal(projected[i]!.partnerUrl, null);
              assert.equal(projected[i]!.imageUrl, null);
            } else {
              // populated pick → fields copied verbatim.
              assert.equal(projected[i]!.sku, pick.sku);
              assert.equal(projected[i]!.name, pick.name);
              assert.equal(projected[i]!.pricePaidKopeks, pick.priceKopeks);
              assert.equal(projected[i]!.partnerUrl, pick.partnerUrl);
              assert.equal(projected[i]!.imageUrl, pick.imageUrl);
            }
          }
        }),
        { numRuns: 200 },
      );
    },
  );

  it("null picks across all slots produce all-null projection rows", () => {
    fc.assert(
      fc.property(
        fc.array(furnitureItemArb, { minLength: 1, maxLength: 10 }),
        (items) => {
          const picks: Array<CandidateLike | null> = items.map(() => null);
          const projected = projectPicks(items, picks);
          assert.equal(projected.length, items.length);
          for (let i = 0; i < items.length; i++) {
            assert.equal(projected[i]!.sku, null);
            assert.equal(projected[i]!.pricePaidKopeks, 0);
            assert.equal(projected[i]!.layoutId, items[i]!.id);
            assert.equal(projected[i]!.type, items[i]!.type);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
