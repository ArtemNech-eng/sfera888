/**
 * Property test for Isometric_Callout_Renderer.
 *
 * Property 17: Isometric callouts are derived from Layout_JSON, not
 * hardcoded.
 *
 * **Validates: Requirements 9.2, 9.3**
 *
 * Module under test:
 *   - `__test__.{projectPoint, calibrateProjection, anchorPointOf,
 *      buildCallouts, functionalItemsFromLayout}` from
 *     `artifacts/api-server/src/lib/isometricCallouts.ts`.
 *
 * Sub-properties verified:
 *   1. **17.1 Anchor moves with furniture** — for two layouts that differ
 *      only by a (dx, dy) cm shift of a functional item, `anchorPointOf`
 *      under the same calibration produces a different `Point` (the
 *      callout follows the furniture, it isn't pinned to a fixed pixel).
 *   2. **17.2 Non-functional items get no callouts** — for `roomType =
 *      "bedroom"`, if every furniture item has a type ∉ {bed, wardrobe,
 *      nightstand, desk}, then `functionalItemsFromLayout` returns `[]`
 *      and `buildCallouts(items=[], …)` returns `[]`.
 *   3. **17.3 Callout count matches functional item count** —
 *      `buildCallouts(items, …).length === items.length`.
 *   4. **17.4 Anchor is on screen** — for valid bedroom layouts, every
 *      `anchorPointOf` result has `0 ≤ x ≤ imgWidth` and
 *      `0 ≤ y ≤ imgHeight`.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { FurnitureItem, LayoutJson } from "@workspace/db";

import { __test__ } from "../../src/lib/isometricCallouts.js";

const {
  calibrateProjection,
  anchorPointOf,
  buildCallouts,
  functionalItemsFromLayout,
} = __test__;

// ─── Constants ───────────────────────────────────────────────────────────────

const IMG_W = 1024;
const IMG_H = 1024;

/**
 * Functional bedroom furniture types per Requirement 9.2 — kept in sync with
 * `FUNCTIONAL_TYPES_BY_ROOM.bedroom` in `isometricCallouts.ts`.
 */
const FUNCTIONAL_BEDROOM_TYPES = ["bed", "wardrobe", "nightstand", "desk"] as const;

/** Furniture types in the Layout_JSON enum that are NOT functional for bedroom. */
const NON_FUNCTIONAL_TYPES = [
  "chair",
  "rug",
  "dresser",
  "shelf",
  "sofa",
  "armchair",
  "tv_unit",
  "coffee_table",
  "dining_table",
  "kitchen_island",
  "sink",
  "toilet",
  "bathtub",
  "shower",
  "mirror",
  "cabinet",
] as const;

// ─── Generators ──────────────────────────────────────────────────────────────

const wallArb = fc.constantFrom(
  "north" as const,
  "east" as const,
  "south" as const,
  "west" as const,
);

const idCharArb = fc.constantFrom(
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "_", "-",
);
const idArb = fc
  .array(idCharArb, { minLength: 1, maxLength: 32 })
  .map((chars) => chars.join(""));

/**
 * Functional bedroom item arbitrary — sized and positioned so it fits inside
 * a 400 × 400 × 270 cm bedroom (matching the room arb below). That keeps the
 * anchor inside the projected room bbox, which is what Property 17.4
 * actually claims.
 */
const bedroomFunctionalItemArb: fc.Arbitrary<FurnitureItem> = fc.record({
  id: idArb,
  type: fc.constantFrom(...FUNCTIONAL_BEDROOM_TYPES) as fc.Arbitrary<string>,
  widthCm: fc.integer({ min: 60, max: 200 }),
  depthCm: fc.integer({ min: 60, max: 200 }),
  heightCm: fc.integer({ min: 30, max: 220 }),
  xCm: fc.integer({ min: 20, max: 180 }),
  yCm: fc.integer({ min: 20, max: 180 }),
  rotationDeg: fc.constantFrom(0 as const, 90 as const, 180 as const, 270 as const),
});

/**
 * Non-functional item arbitrary for Property 17.2. Same dimensional ranges
 * as the functional one but the type is restricted to types ∉ functional
 * set.
 */
const bedroomNonFunctionalItemArb: fc.Arbitrary<FurnitureItem> = fc.record({
  id: idArb,
  type: fc.constantFrom(...NON_FUNCTIONAL_TYPES) as fc.Arbitrary<string>,
  widthCm: fc.integer({ min: 20, max: 200 }),
  depthCm: fc.integer({ min: 20, max: 200 }),
  heightCm: fc.integer({ min: 10, max: 220 }),
  xCm: fc.integer({ min: 0, max: 200 }),
  yCm: fc.integer({ min: 0, max: 200 }),
  rotationDeg: fc.constantFrom(0 as const, 90 as const, 180 as const, 270 as const),
});

/**
 * 400 × 400 × 270 cm bedroom (per task brief — door wall does not affect
 * anchor projection). All furniture is functional and bounded so the AABB
 * fits inside the room.
 */
const bedroomLayoutArb: fc.Arbitrary<LayoutJson> = fc.record({
  room: fc.record({
    roomType: fc.constant("bedroom"),
    widthCm: fc.constant(400),
    lengthCm: fc.constant(400),
    heightCm: fc.constant(270),
  }),
  door: fc.record({
    wall: wallArb,
    offsetCm: fc.integer({ min: 0, max: 300 }),
    widthCm: fc.integer({ min: 70, max: 110 }),
  }),
  window: fc.option(
    fc.record({
      wall: wallArb,
      offsetCm: fc.integer({ min: 0, max: 300 }),
      widthCm: fc.integer({ min: 60, max: 200 }),
    }),
    { nil: null },
  ),
  furniture: fc.array(bedroomFunctionalItemArb, { minLength: 1, maxLength: 6 }),
}) as fc.Arbitrary<LayoutJson>;

/** Layout where every furniture item is non-functional for bedroom. */
const bedroomNonFunctionalLayoutArb: fc.Arbitrary<LayoutJson> = fc.record({
  room: fc.record({
    roomType: fc.constant("bedroom"),
    widthCm: fc.constant(400),
    lengthCm: fc.constant(400),
    heightCm: fc.constant(270),
  }),
  door: fc.record({
    wall: wallArb,
    offsetCm: fc.integer({ min: 0, max: 300 }),
    widthCm: fc.integer({ min: 70, max: 110 }),
  }),
  window: fc.constant(null),
  furniture: fc.array(bedroomNonFunctionalItemArb, {
    minLength: 1,
    maxLength: 6,
  }),
}) as fc.Arbitrary<LayoutJson>;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Isometric_Callout_Renderer Property 17: callouts derived from Layout_JSON", () => {
  // -----------------------------------------------------------------------
  // Property 17.1 — Anchor moves with furniture.
  // Validates: Requirement 9.3
  // -----------------------------------------------------------------------
  it("anchor of a shifted item differs from anchor of the original (same calibration)", () => {
    fc.assert(
      fc.property(
        bedroomLayoutArb,
        // Non-zero (dx, dy) shift; bound so the shifted point still fits
        // inside the 400 × 400 cm room. We always exercise a non-zero
        // shift to keep the property tight.
        fc.tuple(
          fc.integer({ min: -50, max: 50 }),
          fc.integer({ min: -50, max: 50 }),
        ).filter(([dx, dy]) => !(dx === 0 && dy === 0)),
        (layout, [dx, dy]) => {
          const original = layout.furniture[0]!;
          const shifted: FurnitureItem = {
            ...original,
            xCm: original.xCm + dx,
            yCm: original.yCm + dy,
          };

          // Same calibration both sides: layout dimensions did not change,
          // so `calibrateProjection` would produce the identical result.
          // Reuse a single calibration explicitly to make the property
          // about anchor projection itself.
          const cal = calibrateProjection(layout, IMG_W, IMG_H);
          const a1 = anchorPointOf(original, cal);
          const a2 = anchorPointOf(shifted, cal);

          // Threshold of 0.5 px is well below any pixel-resolution
          // rounding the SVG could possibly do (`r1` rounds to 0.1).
          assert.ok(
            Math.abs(a1.x - a2.x) > 0.5 || Math.abs(a1.y - a2.y) > 0.5,
            `anchor did not move for shift (${dx}, ${dy}): `
              + `a1=(${a1.x.toFixed(3)}, ${a1.y.toFixed(3)}), `
              + `a2=(${a2.x.toFixed(3)}, ${a2.y.toFixed(3)})`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 17.2 — Non-functional items get no callouts.
  // Validates: Requirement 9.2
  // -----------------------------------------------------------------------
  it("functionalItemsFromLayout returns [] when every item is non-functional for bedroom", () => {
    fc.assert(
      fc.property(bedroomNonFunctionalLayoutArb, (layout) => {
        const fnItems = functionalItemsFromLayout(layout, "bedroom");
        assert.deepStrictEqual(
          fnItems,
          [],
          `expected no functional items, got types: `
            + `${fnItems.map((i) => i.type).join(", ")}`,
        );
        // And buildCallouts on an empty list must return an empty list,
        // regardless of image size / calibration.
        const cal = calibrateProjection(layout, IMG_W, IMG_H);
        const callouts = buildCallouts([], IMG_W, IMG_H, cal);
        assert.deepStrictEqual(callouts, []);
      }),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 17.3 — Callout count matches functional item count.
  // Validates: Requirement 9.2
  // -----------------------------------------------------------------------
  it("buildCallouts(items, …).length === items.length", () => {
    fc.assert(
      fc.property(bedroomLayoutArb, (layout) => {
        const cal = calibrateProjection(layout, IMG_W, IMG_H);
        const items = functionalItemsFromLayout(layout, "bedroom");
        const callouts = buildCallouts(items, IMG_W, IMG_H, cal);
        assert.equal(
          callouts.length,
          items.length,
          `expected ${items.length} callouts, got ${callouts.length}`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 17.4 — Anchor is on screen.
  // Validates: Requirement 9.3
  // -----------------------------------------------------------------------
  it("anchorPointOf result lies inside [0..imgWidth] × [0..imgHeight] for valid bedroom layouts", () => {
    fc.assert(
      fc.property(bedroomLayoutArb, (layout) => {
        const cal = calibrateProjection(layout, IMG_W, IMG_H);
        for (const item of layout.furniture) {
          const a = anchorPointOf(item, cal);
          assert.ok(
            a.x >= 0 && a.x <= IMG_W,
            `anchor.x out of [0..${IMG_W}] for item ${item.id}: x=${a.x}`,
          );
          assert.ok(
            a.y >= 0 && a.y <= IMG_H,
            `anchor.y out of [0..${IMG_H}] for item ${item.id}: y=${a.y}`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});
