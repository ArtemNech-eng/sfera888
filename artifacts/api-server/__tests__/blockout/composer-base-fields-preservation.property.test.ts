/**
 * Property test for the Composer adapter base-field passthrough.
 *
 * Feature: ai-design-3d-blockout, Property 19: Прочие поля InfographicInput
 * сохраняются без изменений.
 *
 * **Validates: Requirements 8.5**
 *
 * Module under test:
 *   - `buildInfographicInput` from
 *     `artifacts/api-server/src/lib/blockout/composerAdapter.ts`
 *   - Type `InfographicBaseFields = Omit<InfographicInput,
 *     "views" | "isometric" | "topDownPlanPng">`
 *
 * Property verified here (design §«Correctness Properties» → Property 19):
 *   Для любых базовых полей (`design`, `viewLabels`, `cropLabels`,
 *   `detailCrops`) и любого валидного набора перекрасок (4 фото-ракурса +
 *   изометрия/вид сверху, каждый может деградировать в `null`) адаптер
 *   `buildInfographicInput` передаёт все базовые поля в `InfographicInput`
 *   без изменений, заменяя ТОЛЬКО три слота `views`, `isometric` и
 *   `topDownPlanPng`.
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

/** A tiny PNG/JPEG-like buffer stand-in: contents are irrelevant to slotting. */
const bufferArb = fc
  .uint8Array({ minLength: 0, maxLength: 16 })
  .map((bytes) => Buffer.from(bytes));

const roomTypeArb = fc.constantFrom(
  "bedroom",
  "kitchen",
  "bathroom",
  "living_room",
  "hallway",
  "nursery",
  "apartment",
);

const materialArb = fc.record({
  category: fc.string({ maxLength: 24 }),
  description: fc.string({ maxLength: 48 }),
});

const estimateArb = fc.record({
  category: fc.string({ maxLength: 24 }),
  amountKopeks: fc.integer({ min: 0, max: 100_000_000 }),
});

const colorArb = fc.record({
  hex: fc.constantFrom("#000000", "#ffffff", "#a1b2c3", "#ff8800"),
  name: fc.option(fc.string({ maxLength: 16 }), { nil: null }),
});

const solutionArb = fc.record({ text: fc.string({ maxLength: 64 }) });

/** Generates the `design` block exactly as the existing 2D path forms it. */
const designArb = fc.record({
  roomType: roomTypeArb,
  area: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
  style: fc.string({ maxLength: 32 }),
  budget: fc.option(fc.integer({ min: 0, max: 100_000_000 }), { nil: null }),
  durationWeeks: fc.option(fc.integer({ min: 0, max: 520 }), { nil: null }),
  materials: fc.array(materialArb, { maxLength: 8 }),
  estimate: fc.array(estimateArb, { maxLength: 8 }),
  colorPalette: fc.array(colorArb, { maxLength: 8 }),
  solutions: fc.array(solutionArb, { maxLength: 8 }),
});

/**
 * Base (non-slot) fields generator. These are everything the 3D path leaves
 * untouched: `design`, `viewLabels`, `cropLabels`, `detailCrops`.
 */
const baseFieldsArb: fc.Arbitrary<InfographicBaseFields> = fc.record({
  detailCrops: fc.array(bufferArb, { maxLength: 6 }),
  viewLabels: fc.array(fc.string({ maxLength: 24 }), { maxLength: 4 }),
  cropLabels: fc.array(fc.string({ maxLength: 24 }), { maxLength: 6 }),
  design: designArb,
});

/**
 * Valid repaints: exactly 4 photo views, isometric/topDown each present or
 * degraded to null (Requirement 13.3).
 */
const repaintsArb: fc.Arbitrary<BlockoutRepaints> = fc.record({
  photoViews: fc.array(bufferArb, {
    minLength: EXPECTED_PHOTO_VIEW_COUNT,
    maxLength: EXPECTED_PHOTO_VIEW_COUNT,
  }),
  isometric: fc.option(bufferArb, { nil: null }),
  topDown: fc.option(bufferArb, { nil: null }),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Composer adapter Property 19: base fields pass through unchanged", () => {
  // -----------------------------------------------------------------------
  // Property 19 — every base field is referentially identical in the result,
  // and only views / isometric / topDownPlanPng come from the repaints.
  // Validates: Requirement 8.5
  // -----------------------------------------------------------------------
  it("passes design, viewLabels, cropLabels, detailCrops through by reference; replaces only the three slots", () => {
    fc.assert(
      fc.property(repaintsArb, baseFieldsArb, (repaints, baseFields) => {
        const result = buildInfographicInput(repaints, baseFields);

        // Base fields are referentially unchanged (passthrough, no copy/mutation).
        assert.strictEqual(
          result.design,
          baseFields.design,
          "design must be passed through by reference, unchanged",
        );
        assert.strictEqual(
          result.viewLabels,
          baseFields.viewLabels,
          "viewLabels must be passed through by reference, unchanged",
        );
        assert.strictEqual(
          result.cropLabels,
          baseFields.cropLabels,
          "cropLabels must be passed through by reference, unchanged",
        );
        assert.strictEqual(
          result.detailCrops,
          baseFields.detailCrops,
          "detailCrops must be passed through by reference, unchanged",
        );

        // Deep-equality as a second guarantee that values were not altered.
        assert.deepStrictEqual(result.design, baseFields.design);
        assert.deepStrictEqual(result.viewLabels, baseFields.viewLabels);
        assert.deepStrictEqual(result.cropLabels, baseFields.cropLabels);
        assert.deepStrictEqual(result.detailCrops, baseFields.detailCrops);

        // Only the three slots are sourced from the repaints.
        assert.strictEqual(result.views, repaints.photoViews);
        assert.strictEqual(result.isometric, repaints.isometric);
        assert.strictEqual(result.topDownPlanPng, repaints.topDown);
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // The adapter must not mutate the caller's baseFields object: the only
  // keys present in the result beyond the three slots are the base keys, and
  // baseFields itself is left intact.
  // Validates: Requirement 8.5
  // -----------------------------------------------------------------------
  it("does not mutate the input baseFields and introduces no extra keys", () => {
    fc.assert(
      fc.property(repaintsArb, baseFieldsArb, (repaints, baseFields) => {
        const baseKeysBefore = Object.keys(baseFields).sort();
        const result = buildInfographicInput(repaints, baseFields);

        // baseFields object keys are untouched.
        assert.deepStrictEqual(Object.keys(baseFields).sort(), baseKeysBefore);

        // Result keys = base keys ∪ {views, isometric, topDownPlanPng}, nothing else.
        const expectedKeys = new Set([
          ...baseKeysBefore,
          "views",
          "isometric",
          "topDownPlanPng",
        ]);
        for (const key of Object.keys(result)) {
          assert.ok(
            expectedKeys.has(key),
            `unexpected key "${key}" added to InfographicInput`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});
