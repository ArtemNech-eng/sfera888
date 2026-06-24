/**
 * Property test for `checkMinArea` (Geometric_Validator pre-flight).
 *
 * Property 6: Min-area pre-flight matches fixed thresholds.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.9
 *
 * The fixed threshold table comes from Requirement 2.2 in
 * `.kiro/specs/ai-design-product/requirements.md`:
 *   bedroom ≥ 6 m², kitchen ≥ 4 m², bathroom ≥ 2 m²,
 *   living_room ≥ 8 m², hallway ≥ 1.5 m², nursery ≥ 6 m²,
 *   apartment ≥ 18 m².
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  checkMinArea,
  MIN_AREA_SQM_BY_ROOM_TYPE,
} from "../../src/lib/geometricValidator.js";

// ---------------------------------------------------------------------------
// Fixed expected thresholds — duplicated literally from Requirement 2.2
// so the test catches accidental edits to MIN_AREA_SQM_BY_ROOM_TYPE.
// ---------------------------------------------------------------------------

const EXPECTED_THRESHOLDS_SQM = {
  bedroom: 6,
  kitchen: 4,
  bathroom: 2,
  living_room: 8,
  hallway: 1.5,
  nursery: 6,
  apartment: 18,
} as const;

type RoomType = keyof typeof EXPECTED_THRESHOLDS_SQM;
const ROOM_TYPES = Object.keys(EXPECTED_THRESHOLDS_SQM) as RoomType[];

const dimCm = () => fc.integer({ min: 200, max: 800 });
const roomTypeArb = () => fc.constantFrom(...ROOM_TYPES);

describe("checkMinArea — Property 6: pre-flight matches fixed thresholds", () => {
  // -------------------------------------------------------------------------
  // Threshold table sanity (Requirement 2.2 + 2.9): the runtime constant
  // must contain at least the listed minima and never go below them.
  // -------------------------------------------------------------------------
  it("MIN_AREA_SQM_BY_ROOM_TYPE matches Requirement 2.2 verbatim", () => {
    for (const room of ROOM_TYPES) {
      assert.equal(
        MIN_AREA_SQM_BY_ROOM_TYPE[room],
        EXPECTED_THRESHOLDS_SQM[room],
        `MIN_AREA_SQM_BY_ROOM_TYPE.${room} must equal ${EXPECTED_THRESHOLDS_SQM[room]} m² (Requirement 2.2)`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // 1. Pure function: same inputs → same outputs.
  // -------------------------------------------------------------------------
  it("is a pure function (idempotent across repeated calls)", () => {
    fc.assert(
      fc.property(roomTypeArb(), dimCm(), dimCm(), (room, w, l) => {
        const a = checkMinArea(room, w, l);
        const b = checkMinArea(room, w, l);
        assert.deepEqual(a, b);
      }),
    );
  });

  // -------------------------------------------------------------------------
  // 2. Threshold correctness: ok ⇔ areaSqm ≥ MIN_AREA_SQM_BY_ROOM_TYPE[room]
  //    for every known roomType (Requirements 2.1, 2.2, 2.3).
  // -------------------------------------------------------------------------
  it("ok ⇔ (widthCm × lengthCm / 10000) ≥ minSqm for every room type", () => {
    fc.assert(
      fc.property(roomTypeArb(), dimCm(), dimCm(), (room, w, l) => {
        const result = checkMinArea(room, w, l);
        const expectedArea = (w * l) / 10_000;
        const expectedMin = EXPECTED_THRESHOLDS_SQM[room];
        assert.equal(
          result.minSqm,
          expectedMin,
          `minSqm for ${room} should be ${expectedMin}`,
        );
        assert.equal(result.ok, expectedArea >= expectedMin);
      }),
    );
  });

  // -------------------------------------------------------------------------
  // 3. areaSqm is the exact arithmetic value, no rounding.
  // -------------------------------------------------------------------------
  it("areaSqm equals (widthCm × lengthCm) / 10000 exactly", () => {
    fc.assert(
      fc.property(roomTypeArb(), dimCm(), dimCm(), (room, w, l) => {
        const result = checkMinArea(room, w, l);
        assert.equal(result.areaSqm, (w * l) / 10_000);
      }),
    );
  });

  // -------------------------------------------------------------------------
  // 4. Unknown roomType → { ok: true, minSqm: 0 } (form-level enum gate
  //    handles the closed list per Requirement 1.2; the validator only
  //    enforces the floor).
  // -------------------------------------------------------------------------
  it("unknown roomType returns ok=true and minSqm=0", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => !(s in EXPECTED_THRESHOLDS_SQM)),
        dimCm(),
        dimCm(),
        (room, w, l) => {
          const result = checkMinArea(room, w, l);
          assert.equal(result.minSqm, 0);
          assert.equal(result.ok, true);
          assert.equal(result.areaSqm, (w * l) / 10_000);
        },
      ),
    );
  });

  // -------------------------------------------------------------------------
  // 5. Boundary case: at exactly the threshold, ok must be true (≥, not >).
  //    For each room type, pick integer cm dimensions whose product equals
  //    minSqm × 10000 cm² (e.g. bedroom: 400×150 = 60000 cm² = 6 m²).
  // -------------------------------------------------------------------------
  it("at exactly the threshold ok is true (non-strict ≥)", () => {
    const exactCases: Array<{ room: RoomType; w: number; l: number }> = [
      { room: "bedroom", w: 400, l: 150 }, // 6.0 m²
      { room: "kitchen", w: 400, l: 100 }, // 4.0 m²
      { room: "bathroom", w: 200, l: 100 }, // 2.0 m²
      { room: "living_room", w: 400, l: 200 }, // 8.0 m²
      { room: "hallway", w: 300, l: 50 }, // 1.5 m²
      { room: "nursery", w: 300, l: 200 }, // 6.0 m²
      { room: "apartment", w: 600, l: 300 }, // 18.0 m²
    ];
    for (const { room, w, l } of exactCases) {
      const result = checkMinArea(room, w, l);
      assert.equal(
        result.ok,
        true,
        `${room} at exactly ${EXPECTED_THRESHOLDS_SQM[room]} m² (${w}×${l} cm) should be ok`,
      );
      assert.equal(result.areaSqm, EXPECTED_THRESHOLDS_SQM[room]);
      assert.equal(result.minSqm, EXPECTED_THRESHOLDS_SQM[room]);
    }
  });

  // -------------------------------------------------------------------------
  // 5b. One-cm² below the threshold → ok=false (strict floor, Requirement 2.3).
  // -------------------------------------------------------------------------
  it("just below the threshold ok is false", () => {
    // Use bedroom: 400 × 149 cm = 5.96 m² < 6 m².
    const result = checkMinArea("bedroom", 400, 149);
    assert.equal(result.ok, false);
    assert.equal(result.minSqm, 6);
    assert.equal(result.areaSqm, 5.96);
  });
});
