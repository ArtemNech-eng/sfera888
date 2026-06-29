/**
 * Property test for computeRoomDimensions determinism and positivity.
 *
 * Feature: ai-design-3d-blockout, Property 3: Габариты комнаты детерминированы
 * и положительны.
 *
 * **Validates: Requirements 2.1, 2.4**
 *
 * Module under test:
 *   - `computeRoomDimensions`, `ROOM_TYPES` from
 *     `artifacts/api-server/src/lib/blockout/sceneSpec.ts`
 *
 * Property verified here (one property, two facets that are inseparable for
 * the same input):
 *   1. Determinism (Requirement 2.1): for any valid `(roomType, areaM2)`,
 *      two successive calls to `computeRoomDimensions` return deeply-equal
 *      results.
 *   2. Strict positivity (Requirement 2.4): every returned dimension
 *      `W`, `L`, `H` is a finite, strictly-positive number.
 *
 * Run via Node's built-in test runner (≥100 iterations):
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  computeRoomDimensions,
  ROOM_TYPES,
} from "../../src/lib/blockout/sceneSpec.js";

// ─── Generators ──────────────────────────────────────────────────────────────

// roomType drawn from the canonical ROOM_TYPES tuple — the same set the
// implementation has aspect ratios for.
const roomTypeArb = fc.constantFrom(...ROOM_TYPES);

// areaM2 is strictly positive and finite. We constrain to a plausible room
// area range and avoid denormals / zero so the input is always valid for the
// function's contract. `noNaN`/`noDefaultInfinity` keep the value finite.
const areaM2Arb = fc.double({
  min: Number.MIN_VALUE,
  max: 10_000,
  noNaN: true,
  noDefaultInfinity: true,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Feature: ai-design-3d-blockout, Property 3: room dimensions are deterministic and positive", () => {
  it("computeRoomDimensions is deterministic and returns strictly-positive W, L, H", () => {
    fc.assert(
      fc.property(roomTypeArb, areaM2Arb, (roomType, areaM2) => {
        const first = computeRoomDimensions(roomType, areaM2);
        const second = computeRoomDimensions(roomType, areaM2);

        // Determinism (Requirement 2.1): repeated calls agree exactly.
        assert.deepStrictEqual(
          first,
          second,
          `non-deterministic result for (${roomType}, ${areaM2}): ` +
            `${JSON.stringify(first)} vs ${JSON.stringify(second)}`,
        );

        // Strict positivity + finiteness (Requirement 2.4).
        for (const key of ["W", "L", "H"] as const) {
          const value = first[key];
          assert.ok(
            Number.isFinite(value),
            `${key} must be finite, got ${value} for (${roomType}, ${areaM2})`,
          );
          assert.ok(
            value > 0,
            `${key} must be strictly positive, got ${value} for (${roomType}, ${areaM2})`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});
