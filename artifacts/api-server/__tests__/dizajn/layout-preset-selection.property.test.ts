/**
 * Property test for Layout_Preset selection by room type.
 *
 * Feature: ai-design-3d-blockout, Property 6: Выбор Layout_Preset
 * соответствует типу помещения.
 *
 * **Validates: Requirements 3.1**
 *
 * Module under test:
 *   - `selectLayoutPreset` and `LAYOUT_PRESETS` from
 *     `artifacts/api-server/src/lib/blockout/layoutPresets.ts`
 *
 * Property verified here:
 *   For any supported room type (a key present in `LAYOUT_PRESETS`),
 *   `selectLayoutPreset(roomType)` returns a preset tagged with that exact
 *   room type and containing a non-empty furniture list (Requirement 3.1 —
 *   `Blockout_Builder` размещает мебель из `Layout_Preset`, выбранного по
 *   типу помещения).
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

// Only the room types that actually have a preset registered. Deriving the
// arbitrary from the registry keys (rather than hardcoding) keeps this test in
// sync with `LAYOUT_PRESETS` as presets are added or removed.
const supportedRoomTypes = Object.keys(LAYOUT_PRESETS) as RoomType[];

const supportedRoomTypeArb = fc.constantFrom(...supportedRoomTypes);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Layout_Preset Property 6: selection matches room type", () => {
  // -----------------------------------------------------------------------
  // Property 6 — selectLayoutPreset returns a preset tagged with the
  // requested room type and a non-empty furniture list.
  // Validates: Requirements 3.1
  // -----------------------------------------------------------------------
  it("returns a preset whose roomType equals the requested type with non-empty furniture", () => {
    // Guard: there must be at least one supported room type to exercise.
    assert.ok(
      supportedRoomTypes.length >= 1,
      "LAYOUT_PRESETS must register at least one preset",
    );

    fc.assert(
      fc.property(supportedRoomTypeArb, (roomType) => {
        const preset = selectLayoutPreset(roomType);

        assert.equal(
          preset.roomType,
          roomType,
          `preset.roomType "${preset.roomType}" !== requested "${roomType}"`,
        );

        assert.ok(
          Array.isArray(preset.furniture) && preset.furniture.length >= 1,
          `preset for "${roomType}" must contain a non-empty furniture list, got length ${preset.furniture.length}`,
        );
      }),
      { numRuns: 100 },
    );
  });
});
