/**
 * Property test for the Composer adapter slot mapping.
 *
 * Feature: ai-design-3d-blockout, Property 18: Маппинг слотов композитора
 *
 * **Validates: Requirements 8.1, 8.2, 8.3**
 *
 * Module under test:
 *   - `buildInfographicInput`, `EXPECTED_PHOTO_VIEW_COUNT`,
 *     `type BlockoutRepaints`, `type InfographicBaseFields` from
 *     `artifacts/api-server/src/lib/blockout/composerAdapter.ts`.
 *
 * Property 18 (Composer slot mapping):
 *   For any set of `Photoreal_Repaint`, `buildInfographicInput` places
 *   exactly the 4 photo-camera repaints into `views` (in order), the
 *   isometric-camera repaint into `isometric`, and the top-down ortho repaint
 *   into `topDownPlanPng`. The isometric / top-down slots faithfully carry
 *   either the provided buffer or `null` (degradation, Requirement 13.3).
 *
 * The arbitraries generate:
 *   - exactly 4 distinct photo-view buffers (Requirement 8.1);
 *   - `isometric` as a buffer or `null` (Requirements 8.2, 13.3);
 *   - `topDown` as a buffer or `null` (Requirements 8.3, 13.3);
 *   - minimal but valid `InfographicBaseFields` (the non-slot fields, passed
 *     through unchanged).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  buildInfographicInput,
  EXPECTED_PHOTO_VIEW_COUNT,
  type BlockoutRepaints,
  type InfographicBaseFields,
} from "../../src/lib/blockout/composerAdapter.js";

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * A non-empty buffer carrying a unique tag so that distinct buffers compare
 * unequal by value and reference. `fc.uint8Array` gives us arbitrary bytes;
 * we prefix a per-role/per-index tag to guarantee distinctness across slots.
 */
function taggedBufferArb(tag: string): fc.Arbitrary<Buffer> {
  return fc
    .uint8Array({ minLength: 0, maxLength: 32 })
    .map((bytes) => Buffer.concat([Buffer.from(`${tag}:`), Buffer.from(bytes)]));
}

/** Exactly 4 distinct photo-view buffers (one per perspective camera). */
const photoViewsArb: fc.Arbitrary<Buffer[]> = fc.tuple(
  taggedBufferArb("persp_1"),
  taggedBufferArb("persp_2"),
  taggedBufferArb("persp_3"),
  taggedBufferArb("persp_4"),
);

/** Isometric repaint buffer or `null` (degradation). */
const isometricArb: fc.Arbitrary<Buffer | null> = fc.option(
  taggedBufferArb("iso"),
  { nil: null },
);

/** Top-down ortho repaint buffer or `null` (degradation). */
const topDownArb: fc.Arbitrary<Buffer | null> = fc.option(
  taggedBufferArb("top"),
  { nil: null },
);

const repaintsArb: fc.Arbitrary<BlockoutRepaints> = fc.record({
  photoViews: photoViewsArb,
  isometric: isometricArb,
  topDown: topDownArb,
});

/**
 * Minimal-but-valid `InfographicBaseFields` — the non-slot fields that the
 * adapter must pass through unchanged. Values are intentionally simple; this
 * property only cares that the slot mapping is correct, so the base fields are
 * generated just richly enough to be a realistic, JSON-shaped payload.
 */
const baseFieldsArb: fc.Arbitrary<InfographicBaseFields> = fc.record({
  detailCrops: fc.array(taggedBufferArb("crop"), { minLength: 0, maxLength: 6 }),
  viewLabels: fc.array(fc.string(), {
    minLength: EXPECTED_PHOTO_VIEW_COUNT,
    maxLength: EXPECTED_PHOTO_VIEW_COUNT,
  }),
  cropLabels: fc.array(fc.string(), { minLength: 0, maxLength: 6 }),
  design: fc.record({
    roomType: fc.string(),
    area: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
    style: fc.string(),
    budget: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    durationWeeks: fc.option(fc.integer({ min: 1, max: 52 }), { nil: null }),
    materials: fc.array(
      fc.record({ category: fc.string(), description: fc.string() }),
      { maxLength: 4 },
    ),
    estimate: fc.array(
      fc.record({ category: fc.string(), amountKopeks: fc.integer({ min: 0 }) }),
      { maxLength: 4 },
    ),
    colorPalette: fc.array(
      fc.record({ hex: fc.string(), name: fc.option(fc.string(), { nil: null }) }),
      { maxLength: 6 },
    ),
    solutions: fc.array(fc.record({ text: fc.string() }), { maxLength: 6 }),
  }),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Composer adapter Property 18: slot mapping", () => {
  // -----------------------------------------------------------------------
  // Property 18 — the 3 replaced slots receive exactly the 3D repaints.
  // Validates: Requirements 8.1, 8.2, 8.3
  // -----------------------------------------------------------------------
  it("maps 4 photo repaints → views (in order), iso → isometric, top → topDownPlanPng", () => {
    fc.assert(
      fc.property(repaintsArb, baseFieldsArb, (repaints, baseFields) => {
        const result = buildInfographicInput(repaints, baseFields);

        // Requirement 8.1: exactly 4 photo views, same buffers, same order.
        assert.equal(result.views.length, EXPECTED_PHOTO_VIEW_COUNT);
        for (let i = 0; i < EXPECTED_PHOTO_VIEW_COUNT; i++) {
          assert.equal(
            result.views[i],
            repaints.photoViews[i],
            `views[${i}] must be the same buffer reference as photoViews[${i}]`,
          );
        }

        // Requirement 8.2: isometric repaint (or null) lands in `isometric`.
        assert.equal(result.isometric, repaints.isometric);

        // Requirement 8.3: top-down ortho repaint (or null) lands in
        // `topDownPlanPng`.
        assert.equal(result.topDownPlanPng, repaints.topDown);
      }),
      { numRuns: 200 },
    );
  });
});
