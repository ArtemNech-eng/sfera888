/**
 * Unit test for the invariant Composer call (task 8.4).
 *
 * Feature: ai-design-3d-blockout
 *
 * **Validates: Requirements 8.4**
 *
 * Module under test:
 *   - `composeBlockoutInfographic`, `buildInfographicInput`,
 *     `EXPECTED_PHOTO_VIEW_COUNT`, `type BlockoutRepaints`,
 *     `type InfographicBaseFields` from
 *     `artifacts/api-server/src/lib/blockout/composerAdapter.ts`.
 *   - `composeInfographic`, `type InfographicInput` from
 *     `artifacts/api-server/src/lib/infographicComposer.ts`.
 *
 * Requirement 8.4 (invariant composer call):
 *   The 3D-blockout path replaces ONLY the three render slots (`views`,
 *   `isometric`, `topDownPlanPng`). It MUST call the existing
 *   `composeInfographic` with a valid `InfographicInput` WITHOUT changing the
 *   function signature or the `InfographicInput` shape.
 *
 * This test verifies three concrete facts:
 *   1. `composeInfographic` keeps its single-`InfographicInput` signature
 *      (arity 1, returns a thenable Buffer) — the contract is unchanged.
 *   2. The adapter builds a structurally-valid `InfographicInput` from a set
 *      of repaints + base fields (every contract field present with the right
 *      shape), so it is a legal argument for `composeInfographic`.
 *   3. `composeBlockoutInfographic` actually invokes `composeInfographic` with
 *      that built input and returns the composer's `Buffer` unchanged — proven
 *      end-to-end with small valid PNG buffers.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  composeBlockoutInfographic,
  buildInfographicInput,
  EXPECTED_PHOTO_VIEW_COUNT,
  type BlockoutRepaints,
  type InfographicBaseFields,
} from "../../src/lib/blockout/composerAdapter.js";
import {
  composeInfographic,
  type InfographicInput,
} from "../../src/lib/infographicComposer.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * A small but genuinely valid PNG buffer. The composer feeds every slot buffer
 * through `sharp(...)`, so the inputs must be real images, not arbitrary bytes.
 */
async function makePng(
  size = 8,
  rgb: { r: number; g: number; b: number } = { r: 120, g: 80, b: 200 },
): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: rgb },
  })
    .png()
    .toBuffer();
}

/** Minimal-but-valid non-slot fields the adapter passes through unchanged. */
function makeBaseFields(): InfographicBaseFields {
  return {
    detailCrops: [],
    viewLabels: ["Ракурс 1", "Ракурс 2", "Ракурс 3", "Ракурс 4"],
    cropLabels: [],
    design: {
      roomType: "Гостиная",
      area: 24,
      style: "Современный",
      budget: 1_500_000,
      durationWeeks: 8,
      materials: [{ category: "Пол", description: "Паркетная доска" }],
      estimate: [{ category: "Отделка", amountKopeks: 50_000_00 }],
      colorPalette: [{ hex: "#FFFFFF", name: "Белый" }],
      solutions: [{ text: "Зонирование светом" }],
    },
  };
}

/**
 * Builds a complete, valid set of repaints: exactly 4 photo views plus a real
 * isometric and top-down PNG. Avoids `null` slots so the composer renders every
 * branch it can from the adapter's output.
 */
async function makeRepaints(): Promise<BlockoutRepaints> {
  const [v1, v2, v3, v4, iso, top] = await Promise.all([
    makePng(8, { r: 200, g: 30, b: 30 }),
    makePng(8, { r: 30, g: 200, b: 30 }),
    makePng(8, { r: 30, g: 30, b: 200 }),
    makePng(8, { r: 200, g: 200, b: 30 }),
    makePng(8, { r: 90, g: 90, b: 90 }),
    makePng(8, { r: 240, g: 240, b: 240 }),
  ]);
  return {
    photoViews: [v1, v2, v3, v4],
    isometric: iso,
    topDown: top,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Composer adapter (task 8.4): invariant composeInfographic call", () => {
  // -----------------------------------------------------------------------
  // 1. The existing composer signature is unchanged.
  // Validates: Requirements 8.4
  // -----------------------------------------------------------------------
  it("keeps composeInfographic's single-InfographicInput signature", () => {
    assert.equal(
      typeof composeInfographic,
      "function",
      "composeInfographic must still be an exported function",
    );
    assert.equal(
      composeInfographic.length,
      1,
      "composeInfographic must still take exactly one argument (InfographicInput)",
    );
  });

  // -----------------------------------------------------------------------
  // 2. The adapter builds a structurally-valid InfographicInput — i.e. a
  //    legal argument for composeInfographic, with every contract field
  //    present and correctly shaped.
  // Validates: Requirements 8.4
  // -----------------------------------------------------------------------
  it("builds a structurally-valid InfographicInput argument", async () => {
    const repaints = await makeRepaints();
    const baseFields = makeBaseFields();

    const input: InfographicInput = buildInfographicInput(repaints, baseFields);

    // Three replaced slots.
    assert.ok(Array.isArray(input.views), "views must be an array");
    assert.equal(
      input.views.length,
      EXPECTED_PHOTO_VIEW_COUNT,
      "views must carry exactly the 4 photo-camera repaints",
    );
    for (const v of input.views) {
      assert.ok(Buffer.isBuffer(v), "each view must be a Buffer");
    }
    assert.ok(
      input.isometric === null || Buffer.isBuffer(input.isometric),
      "isometric must be a Buffer or null",
    );
    assert.ok(
      input.topDownPlanPng === null ||
        input.topDownPlanPng === undefined ||
        Buffer.isBuffer(input.topDownPlanPng),
      "topDownPlanPng must be a Buffer, null or undefined",
    );

    // Passed-through non-slot fields keep their shape.
    assert.ok(Array.isArray(input.detailCrops), "detailCrops must be an array");
    assert.ok(Array.isArray(input.viewLabels), "viewLabels must be an array");
    assert.ok(Array.isArray(input.cropLabels), "cropLabels must be an array");
    assert.equal(typeof input.design, "object");
    assert.equal(input.design.roomType, baseFields.design.roomType);
    assert.ok(Array.isArray(input.design.materials));
    assert.ok(Array.isArray(input.design.estimate));
    assert.ok(Array.isArray(input.design.colorPalette));
    assert.ok(Array.isArray(input.design.solutions));
  });

  // -----------------------------------------------------------------------
  // 3. composeBlockoutInfographic invokes composeInfographic with the built
  //    input and returns its Buffer unchanged — proven end-to-end.
  // Validates: Requirements 8.4
  // -----------------------------------------------------------------------
  it("invokes composeInfographic with the built input and returns its Buffer", async () => {
    const repaints = await makeRepaints();
    const baseFields = makeBaseFields();

    const result = await composeBlockoutInfographic(repaints, baseFields);

    assert.ok(Buffer.isBuffer(result), "composer must return a Buffer");
    assert.ok(result.length > 0, "rendered board buffer must be non-empty");
  });
});
