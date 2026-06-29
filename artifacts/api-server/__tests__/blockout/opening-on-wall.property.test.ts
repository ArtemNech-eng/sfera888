/**
 * Property test: openings lie on their declared wall within its extent.
 *
 * Feature: ai-design-3d-blockout, Property 5
 *
 * **Property 5: Проёмы лежат на указанной стене**
 *
 * **Validates: Requirements 2.3**
 *
 * Module under test:
 *   - `buildSceneSpec` from `artifacts/api-server/src/lib/blockout/sceneSpec.ts`
 *   - `__test__.wallLength` / `__test__.placeOpening` (same module).
 *
 * For any valid shell description (`roomType` ∈ ROOM_TYPES, `areaM2 ≥`
 * `ROOM_MIN_AREA_M2[roomType]`), the door and window placed by
 * `buildSceneSpec` lie entirely on their declared wall: `offsetM ≥ 0` and
 * `offsetM + widthM ≤ wallLength(wall, W, L)` (within a small epsilon), where
 * north/south walls span W and east/west walls span L (Requirement 2.3 /
 * Property 5).
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

const { wallLength } = __test__;

// Tolerance for floating-point arithmetic in dimension/opening derivation.
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

describe("buildSceneSpec — Property 5: openings lie on the declared wall", () => {
  it("door and window stay within their wall extent (offsetM ≥ 0, offsetM + widthM ≤ wall length)", () => {
    fc.assert(
      fc.property(validInputArb, ({ roomType, areaM2 }) => {
        const spec = buildSceneSpec({ roomType, areaM2, style: STYLE });
        const { W, L } = spec.room.dimensions;

        for (const opening of [spec.shell.door, spec.shell.window]) {
          const len = wallLength(opening.wall, W, L);

          // Lower bound: opening starts on the wall, not before it.
          assert.ok(
            opening.offsetM >= -EPSILON,
            `offsetM must be ≥ 0, got ${opening.offsetM} (${roomType}, ${areaM2} m²)`,
          );

          // Width is a real positive opening.
          assert.ok(
            opening.widthM > 0,
            `widthM must be > 0, got ${opening.widthM} (${roomType}, ${areaM2} m²)`,
          );

          // Upper bound: opening's far edge does not exceed the wall length.
          assert.ok(
            opening.offsetM + opening.widthM <= len + EPSILON,
            `offsetM + widthM (${opening.offsetM + opening.widthM}) must be ≤ ` +
              `wall length ${len} for wall ${opening.wall} ` +
              `(${roomType}, ${areaM2} m²)`,
          );
        }
      }),
      { numRuns: 300 },
    );
  });

  it("wallLength maps north/south → W and east/west → L", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 50, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.5, max: 50, noNaN: true, noDefaultInfinity: true }),
        (W, L) => {
          assert.equal(wallLength("north", W, L), W);
          assert.equal(wallLength("south", W, L), W);
          assert.equal(wallLength("east", W, L), L);
          assert.equal(wallLength("west", W, L), L);
        },
      ),
    );
  });
});
