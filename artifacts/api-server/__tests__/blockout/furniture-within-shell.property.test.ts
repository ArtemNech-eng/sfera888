/**
 * Property test: furniture fits inside the Room_Shell bounds.
 *
 * Feature: ai-design-3d-blockout, Property 8
 *
 * **Property 8: Мебель помещается в границы Room_Shell**
 *
 * **Validates: Requirements 3.4**
 *
 * Module under test:
 *   - `buildSceneSpec` from `artifacts/api-server/src/lib/blockout/sceneSpec.ts`
 *     (fits the preset furniture into the shell via `fitFurnitureToShell`).
 *   - `__test__.rotatedHalfExtents` (same module) — derives the in-plane
 *     half-extents of an item taking its orthogonal rotation into account
 *     (90/270 swap width/depth).
 *
 * For any valid `Scene_Spec` (built from `roomType ∈ ROOM_TYPES` and
 * `areaM2 ≥ ROOM_MIN_AREA_M2[roomType]`), the rotation-aware axis-aligned
 * bounding box (AABB) of every furniture item is fully contained within the
 * room bounds `[0..W] × [0..L] × [0..H]` (Requirement 3.4 / Property 8):
 *
 *   minX ≥ -ε, maxX ≤ W + ε,
 *   minY ≥ -ε, maxY ≤ L + ε,
 *   minZ ≥ -ε, maxZ ≤ H + ε.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  buildSceneSpec,
  ROOM_MIN_AREA_M2,
  ROOM_TYPES,
  __test__,
  type RoomType,
} from "../../src/lib/blockout/sceneSpec.js";

const { rotatedHalfExtents } = __test__;

// Tolerance for floating-point arithmetic in dimension/fit derivation.
const EPSILON = 1e-9;

// ─── Generators (constrained to the valid input space) ────────────────────────

const roomTypeArb: fc.Arbitrary<RoomType> = fc.constantFrom(...ROOM_TYPES);

/**
 * A valid build input: a room type paired with an area at or above its
 * minimum. The extra area (0..400 m²) keeps the value finite and realistic
 * while always satisfying the min-area gate, so `buildSceneSpec` never throws
 * `SceneAreaTooSmallError`.
 */
const validInputArb = roomTypeArb.chain((roomType) =>
  fc
    .double({ min: 0, max: 400, noNaN: true, noDefaultInfinity: true })
    .map((extra) => ({
      roomType,
      areaM2: ROOM_MIN_AREA_M2[roomType] + extra,
    })),
);

const STYLE = { sharedStylePrompt: "scandi minimal", negativePrompt: "" };

describe("buildSceneSpec — Property 8: furniture fits inside Room_Shell", () => {
  it("every item's rotation-aware AABB lies within [0..W]×[0..L]×[0..H]", () => {
    fc.assert(
      fc.property(validInputArb, ({ roomType, areaM2 }) => {
        const spec = buildSceneSpec({ roomType, areaM2, style: STYLE });
        const { W, L, H } = spec.room.dimensions;

        assert.ok(
          spec.furniture.length >= 1,
          `expected at least one furniture item (${roomType}, ${areaM2} m²)`,
        );

        for (const item of spec.furniture) {
          const { hx, hy, hz } = rotatedHalfExtents(item);

          const minX = item.position.x - hx;
          const maxX = item.position.x + hx;
          const minY = item.position.y - hy;
          const maxY = item.position.y + hy;
          const minZ = item.position.z - hz;
          const maxZ = item.position.z + hz;

          const ctx = `item "${item.id}" (${roomType}, ${areaM2} m², ` +
            `room ${W}×${L}×${H}, rot ${item.rotationDeg})`;

          // X axis: [0 .. W]
          assert.ok(minX >= -EPSILON, `minX ${minX} < 0 for ${ctx}`);
          assert.ok(maxX <= W + EPSILON, `maxX ${maxX} > W ${W} for ${ctx}`);

          // Y axis: [0 .. L]
          assert.ok(minY >= -EPSILON, `minY ${minY} < 0 for ${ctx}`);
          assert.ok(maxY <= L + EPSILON, `maxY ${maxY} > L ${L} for ${ctx}`);

          // Z axis: [0 .. H]
          assert.ok(minZ >= -EPSILON, `minZ ${minZ} < 0 for ${ctx}`);
          assert.ok(maxZ <= H + EPSILON, `maxZ ${maxZ} > H ${H} for ${ctx}`);
        }
      }),
      { numRuns: 300 },
    );
  });
});
