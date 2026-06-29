/**
 * Property test for Layout_Preset selection on an unsupported room type.
 *
 * Feature: ai-design-3d-blockout, Property 9: Отсутствие пресета называет
 * тип помещения.
 *
 * **Validates: Requirements 3.5**
 *
 * Module under test:
 *   - `selectLayoutPreset` and `LAYOUT_PRESETS` from
 *     `artifacts/api-server/src/lib/blockout/layoutPresets.ts`
 *
 * Property verified here:
 *   For any room type for which no preset is defined (i.e. any string that is
 *   NOT a key present in `LAYOUT_PRESETS`), `selectLayoutPreset` throws an
 *   `Error` whose message contains the name of the requested type
 *   (Requirement 3.5 — если для типа помещения нет пресета,
 *   `selectLayoutPreset` завершается ошибкой, называющей запрошенный тип).
 *
 * Note: all 7 `RoomType`s currently have presets registered, so to exercise
 * the "missing preset" branch we generate arbitrary strings that are NOT
 * registered keys and call `selectLayoutPreset` through a cast.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  LAYOUT_PRESETS,
  selectLayoutPreset,
  type RoomType,
} from "../../src/lib/blockout/layoutPresets.js";

// ─── Generators ──────────────────────────────────────────────────────────────

// The set of room types that DO have a preset — we must avoid generating any
// of these so that we always exercise the "missing preset" branch. Derived
// from the registry keys to stay in sync as presets are added/removed.
const registeredRoomTypes = new Set(Object.keys(LAYOUT_PRESETS));

// A smart generator over "unsupported" room-type names:
//   - a pool of plausible-but-unregistered named room types, plus
//   - arbitrary strings,
// all filtered to exclude anything actually registered in LAYOUT_PRESETS.
const unsupportedRoomTypeArb = fc
  .oneof(
    fc.constantFrom(
      "garage",
      "office",
      "balcony",
      "studio",
      "attic",
      "basement",
      "closet",
      "pantry",
      "laundry",
      "BEDROOM", // case-sensitivity: differs from the registered "bedroom"
      "",
    ),
    fc.string(),
  )
  .filter((s) => !registeredRoomTypes.has(s));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Layout_Preset Property 9: missing preset names the room type", () => {
  // -----------------------------------------------------------------------
  // Property 9 — selectLayoutPreset throws an Error whose message contains
  // the requested (unsupported) room type.
  // Validates: Requirements 3.5
  // -----------------------------------------------------------------------
  it("throws an Error whose message contains the requested unsupported type", () => {
    fc.assert(
      fc.property(unsupportedRoomTypeArb, (roomType) => {
        // Sanity: the generated type must genuinely lack a preset.
        assert.equal(
          Object.prototype.hasOwnProperty.call(LAYOUT_PRESETS, roomType),
          false,
          `generated room type "${roomType}" unexpectedly has a preset`,
        );

        let thrown: unknown;
        try {
          // Cast through `RoomType`: at runtime these are unsupported names,
          // which is exactly the missing-preset scenario we're exercising.
          selectLayoutPreset(roomType as RoomType);
        } catch (err) {
          thrown = err;
        }

        assert.ok(
          thrown instanceof Error,
          `expected selectLayoutPreset("${roomType}") to throw an Error, got ${String(
            thrown,
          )}`,
        );

        assert.ok(
          (thrown as Error).message.includes(roomType),
          `error message "${(thrown as Error).message}" does not contain the requested type "${roomType}"`,
        );
      }),
      { numRuns: 200 },
    );
  });
});
