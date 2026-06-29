/**
 * Property test for Layout_Preset furniture primitives.
 *
 * Feature: ai-design-3d-blockout, Property 7
 *
 * Property 7: Предметы пресета — примитивы с полными валидными трансформами.
 *
 * **Validates: Requirements 3.2, 3.3**
 *
 * Module under test:
 *   - `LAYOUT_PRESETS` from
 *     `artifacts/api-server/src/lib/blockout/layoutPresets.ts`
 *   - `FurnitureItem` type (intentionally has NO material/texture fields).
 *
 * Property verified here:
 *   For all items of all `Layout_Preset`s, each item is described by primitive
 *   geometry with no materials/textures (Requirement 3.2) and has a position,
 *   dimensions (all > 0) and orientation `rotationDeg ∈ {0,90,180,270}`
 *   (Requirement 3.3).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  LAYOUT_PRESETS,
  type LayoutPreset,
  type RoomType,
} from "../../src/lib/blockout/layoutPresets.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_ROTATIONS = [0, 90, 180, 270];

// Any key that would imply a material/texture/shading description — these MUST
// NOT appear on preset furniture items, which are grey primitives (Req 3.2).
const FORBIDDEN_KEYS = [
  "material",
  "materials",
  "texture",
  "textures",
  "color",
  "colour",
  "map",
  "albedo",
  "roughness",
  "metalness",
  "normalMap",
  "shader",
  "image",
  "uv",
];

// The only keys a primitive furniture item is allowed to carry.
const ALLOWED_KEYS = new Set([
  "id",
  "kind",
  "position",
  "dimensions",
  "rotationDeg",
]);

// ─── Generators ──────────────────────────────────────────────────────────────

// Smart generator constrained to the actual preset registry: only room types
// that have a defined preset are eligible (the registry is `Partial`).
const presetEntries = Object.entries(LAYOUT_PRESETS).filter(
  (entry): entry is [RoomType, LayoutPreset] => entry[1] != null,
);

const presetArb = fc.constantFrom(...presetEntries.map(([, preset]) => preset));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assertItemIsValidPrimitive(
  preset: LayoutPreset,
  item: LayoutPreset["furniture"][number],
): void {
  const ctx = `preset "${preset.id}" item "${item.id}"`;

  // ── Requirement 3.2: primitive only, no materials/textures ──
  const keys = Object.keys(item);
  for (const key of keys) {
    assert.ok(
      ALLOWED_KEYS.has(key),
      `${ctx}: unexpected key "${key}" (only primitive geometry keys allowed)`,
    );
  }
  for (const forbidden of FORBIDDEN_KEYS) {
    assert.ok(
      !(forbidden in (item as Record<string, unknown>)),
      `${ctx}: forbidden material/texture key "${forbidden}" present`,
    );
  }

  // ── Requirement 3.3: position (finite x/y/z) ──
  assert.ok(item.position != null, `${ctx}: missing position`);
  for (const axis of ["x", "y", "z"] as const) {
    const v = item.position[axis];
    assert.equal(typeof v, "number", `${ctx}: position.${axis} not a number`);
    assert.ok(Number.isFinite(v), `${ctx}: position.${axis}=${v} not finite`);
  }

  // ── Requirement 3.3: dimensions all > 0 ──
  assert.ok(item.dimensions != null, `${ctx}: missing dimensions`);
  for (const dim of ["w", "d", "h"] as const) {
    const v = item.dimensions[dim];
    assert.equal(typeof v, "number", `${ctx}: dimensions.${dim} not a number`);
    assert.ok(Number.isFinite(v), `${ctx}: dimensions.${dim}=${v} not finite`);
    assert.ok(v > 0, `${ctx}: dimensions.${dim}=${v} must be > 0`);
  }

  // ── Requirement 3.3: orientation rotationDeg ∈ {0,90,180,270} ──
  assert.ok(
    VALID_ROTATIONS.includes(item.rotationDeg),
    `${ctx}: rotationDeg=${item.rotationDeg} not in {0,90,180,270}`,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Layout_Preset Property 7: primitive furniture with valid transforms", () => {
  // -----------------------------------------------------------------------
  // Property 7 (property-based) — random preset from the registry.
  // Validates: Requirements 3.2, 3.3
  // -----------------------------------------------------------------------
  it("every item of a randomly selected preset is a valid primitive with full valid transforms", () => {
    fc.assert(
      fc.property(presetArb, (preset) => {
        // Requirement 3.1/3.3: presets are non-empty.
        assert.ok(
          preset.furniture.length >= 1,
          `preset "${preset.id}" has no furniture`,
        );
        for (const item of preset.furniture) {
          assertItemIsValidPrimitive(preset, item);
        }
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 7 (exhaustive) — every item of every preset in the registry.
  // Validates: Requirements 3.2, 3.3
  // -----------------------------------------------------------------------
  it("exhaustively: all items of all presets are valid primitives with full valid transforms", () => {
    assert.ok(presetEntries.length > 0, "no presets defined in LAYOUT_PRESETS");
    for (const [roomType, preset] of presetEntries) {
      assert.equal(
        preset.roomType,
        roomType,
        `registry key "${roomType}" does not match preset.roomType "${preset.roomType}"`,
      );
      assert.ok(
        preset.furniture.length >= 1,
        `preset "${preset.id}" (${roomType}) has no furniture`,
      );
      for (const item of preset.furniture) {
        assertItemIsValidPrimitive(preset, item);
      }
    }
  });
});
