/**
 * Property test for buildSceneSpec area-below-minimum rejection.
 *
 * Feature: ai-design-3d-blockout, Property 4: Отклонение площади ниже минимума
 *
 * **Validates: Requirements 2.5**
 *
 * Module under test:
 *   - `buildSceneSpec`, `SceneAreaTooSmallError`, `ROOM_MIN_AREA_M2`,
 *     `ROOM_TYPES`, `type StyleInput` from
 *     `artifacts/api-server/src/lib/blockout/sceneSpec.ts`.
 *
 * Property 4 (Отклонение площади ниже минимума):
 *   For any room type and any area strictly between 0 and the minimum allowed
 *   for that room type (exclusive on both ends), `buildSceneSpec` fails with an
 *   error whose message contains BOTH the room type and the numeric minimum
 *   area value (Requirement 2.5). The thrown error is a `SceneAreaTooSmallError`
 *   carrying the room type and the minimum programmatically.
 *
 * Generators (smart, constrained to the failing input space):
 *   - `roomType` ∈ ROOM_TYPES;
 *   - `areaM2` ∈ (0, ROOM_MIN_AREA_M2[roomType]) — strictly below the minimum
 *     so the build must reject it. fast-check's `double` draws a finite,
 *     non-NaN fraction of the minimum strictly inside the open interval;
 *   - `style` is an arbitrary valid StyleInput (non-empty sharedStylePrompt,
 *     optional negativePrompt) so only the area drives the rejection.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  buildSceneSpec,
  SceneAreaTooSmallError,
  ROOM_MIN_AREA_M2,
  ROOM_TYPES,
  type RoomType,
  type StyleInput,
} from "../../src/lib/blockout/sceneSpec.js";

// ─── Generators ──────────────────────────────────────────────────────────────

const roomTypeArb: fc.Arbitrary<RoomType> = fc.constantFrom(...ROOM_TYPES);

/** Non-empty shared style prompt (Req 6.3) + optional negative prompt. */
const styleArb: fc.Arbitrary<StyleInput> = fc.record(
  {
    sharedStylePrompt: fc
      .string({ minLength: 1, maxLength: 40 })
      .filter((s) => s.trim().length > 0),
    negativePrompt: fc.option(fc.string({ maxLength: 40 }), {
      nil: undefined,
    }),
  },
  { requiredKeys: ["sharedStylePrompt"] },
);

/**
 * For a given room type, draw an area strictly in the open interval
 * `(0, min)`. We draw a fraction `f ∈ (0, 1)` and scale by the minimum, then
 * clamp it strictly below `min` to defend against floating-point reaching the
 * boundary.
 */
function areaBelowMinArb(roomType: RoomType): fc.Arbitrary<number> {
  const min = ROOM_MIN_AREA_M2[roomType];
  return fc
    .double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
    // exclude exact 0 and 1 so the product stays strictly inside (0, min)
    .filter((f) => f > 0 && f < 1)
    .map((f) => {
      const area = f * min;
      // guard: keep strictly inside the open interval (0, min)
      if (area <= 0) return min / 2;
      if (area >= min) return min * 0.999;
      return area;
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildSceneSpec Property 4: area below minimum is rejected", () => {
  // ---------------------------------------------------------------------------
  // Property 4 — any area strictly below the per-room-type minimum makes
  // buildSceneSpec throw an error naming the room type AND the numeric minimum.
  // Validates: Requirements 2.5
  // ---------------------------------------------------------------------------
  it("throws an error mentioning the room type and minimum area for any area below the minimum", () => {
    fc.assert(
      fc.property(
        roomTypeArb.chain((roomType) =>
          fc.record({
            roomType: fc.constant(roomType),
            areaM2: areaBelowMinArb(roomType),
            style: styleArb,
          }),
        ),
        ({ roomType, areaM2, style }) => {
          const min = ROOM_MIN_AREA_M2[roomType];

          // sanity: the generator must stay strictly below the minimum
          assert.ok(
            areaM2 > 0 && areaM2 < min,
            `generator produced area ${areaM2} not in (0, ${min}) for ${roomType}`,
          );

          assert.throws(
            () => buildSceneSpec({ roomType, areaM2, style }),
            (err: unknown) => {
              assert.ok(
                err instanceof SceneAreaTooSmallError,
                `expected SceneAreaTooSmallError, got ${String(err)}`,
              );
              const message = err.message;
              // message names the room type
              assert.ok(
                message.includes(roomType),
                `error message must contain room type "${roomType}": ${message}`,
              );
              // message names the numeric minimum area value
              assert.ok(
                message.includes(String(min)),
                `error message must contain minimum area "${min}": ${message}`,
              );
              // programmatic fields are consistent
              assert.equal(err.roomType, roomType);
              assert.equal(err.minAreaM2, min);
              return true;
            },
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
