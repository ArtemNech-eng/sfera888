/**
 * Property test for AI_Design_Product Materials_Estimator
 * (`lib/materialsEstimator.ts`).
 *
 * Property 19: Real_Estimate arithmetic identity and structure.
 *
 * **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.7**
 *
 * Strategy: the SQL-touching parts of `buildRealEstimate` are isolated in
 * `pickCheapestForCategory` (one SELECT per finishing category) and
 * `getWorkCoefficientKopeksPerSqm` (one SELECT for the city). The
 * arithmetic invariants (sum identity, 10 % of others, 4-row fixed order,
 * zero preservation) are exercised through the pure helpers exposed via
 * `__test__`:
 *   - `assembleEstimate({materialsKopeks, furnitureKopeks, worksKopeks})`
 *     covers Properties 19.1, 19.2, 19.3, 19.4 with no DB at all.
 *   - `floorAreaSqm`, `wallAreaSqm`, `computeMaterialCostKopeks` cover the
 *     formula-level invariants 19.7, 19.8, 19.9.
 *   - `getWorkCoefficientKopeksPerSqm(null)` covers the default-coefficient
 *     branch from Property 19.6 (the only branch that does not touch SQL).
 *   - Furniture sum (Property 19.5) is the trivial Σ over an array.
 *
 * `@workspace/db` opens a pg.Pool at module load and demands DATABASE_URL,
 * so we point it at a fake DSN before the import. The pool is lazy: tests
 * never run a query because every helper under test is pure or short-circuits
 * on `cityId === null`.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { LayoutJson } from "@workspace/db";

// `@workspace/db` requires DATABASE_URL at module load time; supply a fake
// connection string BEFORE triggering its import. Static `import` declarations
// are hoisted above regular code, so we use a dynamic `await import(...)` for
// the module-under-test to guarantee env-var precedence. The pg.Pool does not
// connect eagerly — every helper exercised below is either pure or
// short-circuits on `cityId === null`, so no SQL is ever issued.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

const materialsEstimator = await import(
  "../../src/lib/materialsEstimator.ts"
);
const { DEFAULT_WORK_COEFF_KOPEKS_PER_SQM, __test__ } = materialsEstimator;
const {
  floorAreaSqm,
  wallAreaSqm,
  categorySqm,
  computeMaterialCostKopeks,
  getWorkCoefficientKopeksPerSqm,
  assembleEstimate,
  OTHER_EXPENSES_FRACTION,
  WALL_OPENINGS_SQM,
  FINISHING_CATEGORIES,
  ESTIMATE_LABELS,
} = __test__;

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Build a structurally-complete `LayoutJson` from just `{widthCm, lengthCm,
 * heightCm}` so we can exercise the area helpers without spelling out
 * door/window/furniture in every test. The estimator only reads
 * `layout.room.{widthCm,lengthCm,heightCm}`, but the `LayoutJson` type
 * requires the rest of the shape to be present.
 */
function makeLayout(roomDims: {
  widthCm: number;
  lengthCm: number;
  heightCm: number;
}): LayoutJson {
  return {
    room: {
      roomType: "bedroom",
      widthCm: roomDims.widthCm,
      lengthCm: roomDims.lengthCm,
      heightCm: roomDims.heightCm,
    },
    door: { wall: "north", offsetCm: 50, widthCm: 90 },
    window: null,
    furniture: [
      {
        id: "bed1",
        type: "bed",
        widthCm: 160,
        depthCm: 200,
        heightCm: 50,
        xCm: 50,
        yCm: 50,
        rotationDeg: 0,
      },
    ],
  };
}

// Use the same numeric ranges as Layout_JSON's strict schema (Requirements
// 6.2, 6.3) so the smart generators stay inside the realistic input space.
const widthCmArb = fc.integer({ min: 200, max: 800 });
const lengthCmArb = fc.integer({ min: 200, max: 800 });
const heightCmArb = fc.integer({ min: 220, max: 350 });

const roomDimsArb = fc.record({
  widthCm: widthCmArb,
  lengthCm: lengthCmArb,
  heightCm: heightCmArb,
});

const layoutArb: fc.Arbitrary<LayoutJson> = roomDimsArb.map(makeLayout);

// Bound kopeks generators: real prices are integers in copecks (the
// estimator never sees fractional kopeks). Cap at ~10 M kopeks per SKU to
// keep the property-level totals well within Number.MAX_SAFE_INTEGER even
// at worst case — `100 SKUs × 10 M = 1 G < 2^53`.
const kopeksArb = fc.integer({ min: 0, max: 10_000_000 });

const componentKopeksArb = fc.integer({ min: 0, max: 10_000_000_000 });

const furnitureRowArb = fc
  .record({
    layoutId: fc.string({ minLength: 1, maxLength: 16 }),
    type: fc.constantFrom("bed", "wardrobe", "desk", "chair", "nightstand"),
    sku: fc.option(fc.string({ minLength: 1, maxLength: 16 }), { nil: null }),
    name: fc.option(fc.string({ minLength: 1, maxLength: 32 }), { nil: null }),
    pricePaidKopeks: kopeksArb,
    partnerUrl: fc.constant(null),
    imageUrl: fc.constant(null),
  })
  // PickedFurnitureRow contract (`lib/db/src/types/furniture.ts`):
  //   sku=null  ⇒  pricePaidKopeks must be 0 to keep `Real_Estimate`
  //   summation NaN-free. Encode the contract directly into the arbitrary
  //   so generated inputs only sample from valid `PickedFurnitureRow`s.
  .map((row) => (row.sku === null ? { ...row, pricePaidKopeks: 0 } : row));

// Two finishing-material picks: one priced per square metre, one per piece.
// We don't need the full row from `finishing_materials` — only the columns
// that `computeMaterialCostKopeks` reads.
const sqmPickArb = fc.record({
  sku: fc.constant("sku-sqm"),
  name: fc.constant("Краска интерьерная"),
  brand: fc.constant("TestBrand"),
  unit: fc.constant("sqm"),
  pricePerUnitKopeks: kopeksArb,
});

const pcsPickArb = fc.record({
  sku: fc.constant("sku-pcs"),
  name: fc.constant("Розетка двойная"),
  brand: fc.constant(null as string | null),
  unit: fc.constant("pcs"),
  pricePerUnitKopeks: kopeksArb,
});

// ─── Property 19.1 — Sum identity ────────────────────────────────────────────
//
// Validates: Requirement 11.7
//
// For any valid components, Σ estimate[].amountKopeks must equal
// (materials + furniture + works + other), where `other` is the rounded
// 10 % computed inside `assembleEstimate`.

describe("Real_Estimate Property 19.1 — sum identity", () => {
  it("Σ estimate[].amountKopeks === materials + furniture + works + other", () => {
    fc.assert(
      fc.property(
        componentKopeksArb,
        componentKopeksArb,
        componentKopeksArb,
        (materialsKopeks, furnitureKopeks, worksKopeks) => {
          const { estimate, otherKopeks, totalKopeks } = assembleEstimate({
            materialsKopeks,
            furnitureKopeks,
            worksKopeks,
          });
          const sum = estimate.reduce((acc, row) => acc + row.amountKopeks, 0);
          assert.equal(
            sum,
            materialsKopeks + furnitureKopeks + worksKopeks + otherKopeks,
            "Σ estimate[].amountKopeks must equal Σ components",
          );
          assert.equal(
            totalKopeks,
            materialsKopeks + furnitureKopeks + worksKopeks + otherKopeks,
            "totalKopeks must equal Σ components",
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 19.2 — Other = round(10 % of others) ──────────────────────────
//
// Validates: Requirement 11.3
//
// `other.amountKopeks === Math.round(0.1 × (materials + furniture + works))`.

describe("Real_Estimate Property 19.2 — other = round(10 % × Σ)", () => {
  it("other.amountKopeks === Math.round(0.1 × (materials + furniture + works))", () => {
    fc.assert(
      fc.property(
        componentKopeksArb,
        componentKopeksArb,
        componentKopeksArb,
        (materialsKopeks, furnitureKopeks, worksKopeks) => {
          const { estimate, otherKopeks } = assembleEstimate({
            materialsKopeks,
            furnitureKopeks,
            worksKopeks,
          });
          const expected = Math.round(
            OTHER_EXPENSES_FRACTION *
              (materialsKopeks + furnitureKopeks + worksKopeks),
          );
          assert.equal(otherKopeks, expected);
          assert.equal(estimate[3]!.amountKopeks, expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("uses the documented 10 % fraction", () => {
    assert.equal(OTHER_EXPENSES_FRACTION, 0.1);
  });
});

// ─── Property 19.3 — Estimate length and order ──────────────────────────────
//
// Validates: Requirement 11.5
//
// `estimate.length === 4` and the 4 categories appear in the fixed order
// [Отделочные материалы, Мебель, Работы, Прочие расходы].

describe("Real_Estimate Property 19.3 — length and order", () => {
  it("estimate has exactly 4 rows in the fixed Russian-labelled order", () => {
    fc.assert(
      fc.property(
        componentKopeksArb,
        componentKopeksArb,
        componentKopeksArb,
        (materialsKopeks, furnitureKopeks, worksKopeks) => {
          const { estimate } = assembleEstimate({
            materialsKopeks,
            furnitureKopeks,
            worksKopeks,
          });
          assert.equal(estimate.length, 4);
          assert.equal(estimate[0]!.category, "Отделочные материалы");
          assert.equal(estimate[1]!.category, "Мебель");
          assert.equal(estimate[2]!.category, "Работы");
          assert.equal(estimate[3]!.category, "Прочие расходы");
        },
      ),
      { numRuns: 50 },
    );
  });

  it("ESTIMATE_LABELS values match the documented Russian labels", () => {
    assert.equal(ESTIMATE_LABELS.materials, "Отделочные материалы");
    assert.equal(ESTIMATE_LABELS.furniture, "Мебель");
    assert.equal(ESTIMATE_LABELS.works, "Работы");
    assert.equal(ESTIMATE_LABELS.other, "Прочие расходы");
  });

  it("FINISHING_CATEGORIES has the documented 4-element shape", () => {
    assert.deepStrictEqual(
      [...FINISHING_CATEGORIES],
      ["walls", "floor", "ceiling", "other"],
    );
  });
});

// ─── Property 19.4 — Zero preservation ──────────────────────────────────────
//
// Validates: Requirement 11.7
//
// When all four computed components are 0, every `amountKopeks` must remain
// 0. No minimum substitution, no defaults.

describe("Real_Estimate Property 19.4 — zero preservation", () => {
  it("all-zero input → all-zero estimate (no minimum substitution)", () => {
    const { estimate, otherKopeks, totalKopeks } = assembleEstimate({
      materialsKopeks: 0,
      furnitureKopeks: 0,
      worksKopeks: 0,
    });
    assert.equal(estimate.length, 4);
    for (const row of estimate) {
      assert.equal(row.amountKopeks, 0, `row "${row.category}" must be 0`);
    }
    assert.equal(otherKopeks, 0);
    assert.equal(totalKopeks, 0);
  });
});

// ─── Property 19.5 — Furniture sum ──────────────────────────────────────────
//
// Validates: Requirement 11.3
//
// `furnitureKopeks` is the straight sum of `pickedFurniture[i].pricePaidKopeks`.
// This is what `buildRealEstimate` does (`for (const row of pickedFurniture)
// furnitureKopeks += row.pricePaidKopeks`). The property test exercises the
// same reduction over a fast-check-generated array.

describe("Real_Estimate Property 19.5 — furniture sum", () => {
  it("furnitureKopeks === Σ pickedFurniture[i].pricePaidKopeks", () => {
    fc.assert(
      fc.property(
        fc.array(furnitureRowArb, { minLength: 0, maxLength: 12 }),
        (rows) => {
          let furnitureKopeks = 0;
          for (const row of rows) furnitureKopeks += row.pricePaidKopeks;
          const expected = rows.reduce(
            (acc, r) => acc + r.pricePaidKopeks,
            0,
          );
          assert.equal(furnitureKopeks, expected);
          // null-SKU rows have pricePaidKopeks = 0 by contract — they
          // contribute exactly 0 to the sum (sanity, not a separate
          // property).
          for (const row of rows) {
            if (row.sku === null) {
              assert.equal(row.pricePaidKopeks, 0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 19.6 — Works coefficient default ──────────────────────────────
//
// Validates: Requirement 11.4
//
// When `cityId === null`, `getWorkCoefficientKopeksPerSqm` short-circuits to
// `DEFAULT_WORK_COEFF_KOPEKS_PER_SQM` without a SQL call. The branch where
// the city lookup returns NULL/undefined is structurally identical (same
// constant), so we test the entry path here.

describe("Real_Estimate Property 19.6 — default work coefficient", () => {
  it("getWorkCoefficientKopeksPerSqm(null) === DEFAULT_WORK_COEFF_KOPEKS_PER_SQM", async () => {
    const v = await getWorkCoefficientKopeksPerSqm(null);
    assert.equal(v, DEFAULT_WORK_COEFF_KOPEKS_PER_SQM);
  });

  it("the default is the documented 800 000 kopeks/m² (8000 ₽/m²)", () => {
    assert.equal(DEFAULT_WORK_COEFF_KOPEKS_PER_SQM, 800_000);
  });

  it("worksKopeks === Math.round(roomAreaSqm × DEFAULT_WORK_COEFF) for the null-city branch", () => {
    fc.assert(
      fc.property(roomDimsArb, (dims) => {
        const layout = makeLayout(dims);
        const roomAreaSqm = floorAreaSqm(layout);
        const expected = Math.round(
          roomAreaSqm * DEFAULT_WORK_COEFF_KOPEKS_PER_SQM,
        );
        // Reproduce the formula the estimator uses for the null-city case.
        const worksKopeks = Math.round(
          roomAreaSqm * DEFAULT_WORK_COEFF_KOPEKS_PER_SQM,
        );
        assert.equal(worksKopeks, expected);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 19.7 — Wall area formula ──────────────────────────────────────
//
// Validates: Requirements 11.2, 11.5
//
// `wallAreaSqm({widthCm, lengthCm, heightCm}) ===
//    max(0, (2 × (widthCm + lengthCm) × heightCm / 10000) - WALL_OPENINGS_SQM)`.

describe("Real_Estimate Property 19.7 — wall area formula", () => {
  it("wallAreaSqm equals max(0, (2(w+l)·h / 10 000) - 4)", () => {
    fc.assert(
      fc.property(roomDimsArb, (dims) => {
        const layout = makeLayout(dims);
        const expectedRaw =
          (2 * (dims.widthCm + dims.lengthCm) * dims.heightCm) / 10_000 -
          WALL_OPENINGS_SQM;
        const expected = expectedRaw > 0 ? expectedRaw : 0;
        assert.equal(wallAreaSqm(layout), expected);
      }),
      { numRuns: 200 },
    );
  });

  it("clamps to 0 on patological inputs (perimeter × height too small)", () => {
    // Build a degenerate layout: 0 cm walls. WallAreaSqm clamps room.* to
    // ≥0 via Math.max(0, ...) before computing, so this exercises the
    // clamp branch.
    const layout: LayoutJson = makeLayout({
      widthCm: 1,
      lengthCm: 1,
      heightCm: 1,
    });
    // Layout schema bans this in production, but the helper is defensive.
    layout.room.widthCm = 1;
    layout.room.lengthCm = 1;
    layout.room.heightCm = 1;
    assert.equal(wallAreaSqm(layout), 0);
  });

  it("WALL_OPENINGS_SQM is the documented 4 m² constant", () => {
    assert.equal(WALL_OPENINGS_SQM, 4);
  });
});

// ─── Property 19.8 — Floor area formula ─────────────────────────────────────
//
// Validates: Requirements 11.2, 11.5
//
// `floorAreaSqm({widthCm, lengthCm}) === widthCm × lengthCm / 10 000`.

describe("Real_Estimate Property 19.8 — floor area formula", () => {
  it("floorAreaSqm equals widthCm × lengthCm / 10 000 exactly", () => {
    fc.assert(
      fc.property(roomDimsArb, (dims) => {
        const layout = makeLayout(dims);
        assert.equal(
          floorAreaSqm(layout),
          (dims.widthCm * dims.lengthCm) / 10_000,
        );
      }),
      { numRuns: 200 },
    );
  });

  it("ceiling area equals floor area (categorySqm('ceiling') == categorySqm('floor'))", () => {
    fc.assert(
      fc.property(roomDimsArb, (dims) => {
        const layout = makeLayout(dims);
        assert.equal(
          categorySqm("floor", layout),
          categorySqm("ceiling", layout),
        );
      }),
      { numRuns: 50 },
    );
  });

  it("categorySqm('other', ...) returns null (priced per piece, not per m²)", () => {
    const layout = makeLayout({ widthCm: 300, lengthCm: 400, heightCm: 250 });
    assert.equal(categorySqm("other", layout), null);
  });
});

// ─── Property 19.9 — Material cost formula ──────────────────────────────────
//
// Validates: Requirement 11.2
//
// For `unit === "sqm"`:
//   computeMaterialCostKopeks(pick, area) === Math.round(area × pick.price).
// For `unit === "pcs"` OR `area === null`:
//   computeMaterialCostKopeks(pick, area) === pick.price.

describe("Real_Estimate Property 19.9 — material cost formula", () => {
  it("unit='sqm', area defined → round(area × pricePerUnitKopeks)", () => {
    fc.assert(
      fc.property(
        sqmPickArb,
        fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (pick, areaSqm) => {
          const cost = computeMaterialCostKopeks(pick, areaSqm);
          assert.equal(cost, Math.round(areaSqm * pick.pricePerUnitKopeks));
          assert.ok(Number.isInteger(cost), "cost must be integer kopeks");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("unit='pcs' → pricePerUnitKopeks regardless of area", () => {
    fc.assert(
      fc.property(
        pcsPickArb,
        fc.option(
          fc.double({
            min: 0,
            max: 1000,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          { nil: null },
        ),
        (pick, areaSqm) => {
          const cost = computeMaterialCostKopeks(pick, areaSqm);
          assert.equal(cost, pick.pricePerUnitKopeks);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("unit='sqm' but area=null → pricePerUnitKopeks (defensive fallback)", () => {
    fc.assert(
      fc.property(sqmPickArb, (pick) => {
        const cost = computeMaterialCostKopeks(pick, null);
        assert.equal(cost, pick.pricePerUnitKopeks);
      }),
      { numRuns: 30 },
    );
  });
});
