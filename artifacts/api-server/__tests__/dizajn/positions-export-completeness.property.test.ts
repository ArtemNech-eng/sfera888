/**
 * Property test for the canonical furniture positions export.
 *
 * Feature: ai-design-3d-blockout, Property 12: Полнота экспорта позиций
 * мебели.
 *
 * **Validates: Requirements 7.3**
 *
 * Module under test:
 *   - `buildPositionsExport` from
 *     `artifacts/api-server/src/lib/blockout/positions.ts`
 *
 * Property verified here:
 *   For ANY valid `Scene_Spec`, the `positions.json` export contains EXACTLY
 *   one record per furniture item (keyed by `id`) with the same
 *   position / dimensions / orientation values as in the `Scene_Spec`:
 *     - same record count as `spec.furniture`;
 *     - the set of exported `id`s equals the set of `spec.furniture` ids,
 *       with no duplicates;
 *     - each record's `position`, `dimensions` and `rotationDeg`
 *       deep-equals the corresponding `Scene_Spec` item.
 *   This makes `positions.json` a faithful, camera-independent artifact for
 *   the `Geometric_Consistency` check (Requirement 7.3).
 *
 * The valid `Scene_Spec` generator mirrors the one used by
 * `scenespec-invalid-field.property.test.ts`: it always yields a
 * schema-valid spec (1..6 furniture items with unique ids; the fixed
 * 4×perspective + 1×top_ortho + 1×isometric camera rig). We additionally
 * cover the deterministic `buildSceneSpec` output so the property holds for
 * the real production builder too.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  buildSceneSpec,
  parseSceneSpec,
  ROOM_MIN_AREA_M2,
  type RoomType,
  type SceneSpec,
} from "../../src/lib/blockout/sceneSpec.js";
import { buildPositionsExport } from "../../src/lib/blockout/positions.js";

// ─── Leaf generators (constrained to the valid input space) ───────────────────

/** Finite double in a bounded range (bounded ⇒ never NaN/±Infinity). */
const finiteArb = fc.double({ min: -100, max: 100, noNaN: true });
/** Strictly positive finite double (metres, fov, ortho scale, …). */
const positiveArb = fc.double({ min: 0.1, max: 1000, noNaN: true });
/** Non-negative finite double (offset / sill — may be 0). */
const nonNegativeArb = fc.double({ min: 0, max: 1000, noNaN: true });
/** Positive integer (pixel resolution). */
const positiveIntArb = fc.integer({ min: 1, max: 4096 });
/** Non-empty string. */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 24 });

const vec3Arb = fc.record({ x: finiteArb, y: finiteArb, z: finiteArb });

const dimsWLHArb = fc.record({ W: positiveArb, L: positiveArb, H: positiveArb });
const dimsWDHArb = fc.record({ w: positiveArb, d: positiveArb, h: positiveArb });

const roomTypeArb = fc.constantFrom(
  "bedroom",
  "kitchen",
  "bathroom",
  "living_room",
  "hallway",
  "nursery",
  "apartment",
);
const wallArb = fc.constantFrom("north", "east", "south", "west");
const rotationArb = fc.constantFrom(0, 90, 180, 270);

// ─── Valid Scene_Spec arbitrary ───────────────────────────────────────────────

/**
 * Smart generator that always produces a schema-valid `SceneSpec`:
 *   - furniture: 1..6 items with index-derived unique ids;
 *   - cameraRig: exactly 4 perspective + 1 top_ortho + 1 isometric (the only
 *     composition the schema accepts), with unique ids.
 */
const sceneSpecArb: fc.Arbitrary<SceneSpec> = fc
  .record({
    room: fc.record({
      roomType: roomTypeArb,
      areaM2: positiveArb,
      dimensions: dimsWLHArb,
    }),
    shell: fc.record({
      door: fc.record({
        wall: wallArb,
        offsetM: nonNegativeArb,
        widthM: positiveArb,
        heightM: positiveArb,
      }),
      window: fc.record({
        wall: wallArb,
        offsetM: nonNegativeArb,
        widthM: positiveArb,
        heightM: positiveArb,
        sillM: nonNegativeArb,
      }),
    }),
    layoutPresetId: nonEmptyStringArb,
    furnitureCount: fc.integer({ min: 1, max: 6 }),
    furnitureParts: fc.array(
      fc.record({
        kind: nonEmptyStringArb,
        position: vec3Arb,
        dimensions: dimsWDHArb,
        rotationDeg: rotationArb,
      }),
      { minLength: 6, maxLength: 6 },
    ),
    perspectivePositions: fc.array(vec3Arb, { minLength: 4, maxLength: 4 }),
    perspectiveTargets: fc.array(vec3Arb, { minLength: 4, maxLength: 4 }),
    perspectiveFovs: fc.array(positiveArb, { minLength: 4, maxLength: 4 }),
    topOrthoPosition: vec3Arb,
    topOrthoTarget: vec3Arb,
    topOrthoScale: positiveArb,
    isoPosition: vec3Arb,
    isoTarget: vec3Arb,
    isoFov: positiveArb,
    render: fc.record({
      engine: fc.constant("EEVEE_NEXT" as const),
      renderNormals: fc.boolean(),
      resolution: fc.record({ width: positiveIntArb, height: positiveIntArb }),
    }),
    style: fc.record({
      sharedStylePrompt: nonEmptyStringArb,
      negativePrompt: fc.string({ maxLength: 24 }),
    }),
  })
  .map((g): SceneSpec => {
    const furniture = g.furnitureParts
      .slice(0, g.furnitureCount)
      .map((part, i) => ({ id: `f${i}`, ...part }));

    const cameraRig = [
      ...g.perspectivePositions.map((position, i) => ({
        id: `cam-persp-${i}`,
        role: "perspective" as const,
        position,
        target: g.perspectiveTargets[i],
        fovDeg: g.perspectiveFovs[i],
      })),
      {
        id: "cam-top",
        role: "top_ortho" as const,
        position: g.topOrthoPosition,
        target: g.topOrthoTarget,
        orthoScale: g.topOrthoScale,
      },
      {
        id: "cam-iso",
        role: "isometric" as const,
        position: g.isoPosition,
        target: g.isoTarget,
        fovDeg: g.isoFov,
      },
    ];

    return {
      schemaVersion: 1,
      room: g.room,
      shell: g.shell,
      layoutPresetId: g.layoutPresetId,
      furniture,
      cameraRig,
      render: g.render,
      style: g.style,
    } as SceneSpec;
  });

// ─── Shared assertion ─────────────────────────────────────────────────────────

/**
 * Asserts the Property 12 invariant: the positions export holds exactly one
 * record per furniture item, keyed by `id`, with matching geometry.
 */
function assertExportComplete(spec: SceneSpec): void {
  const exported = buildPositionsExport(spec);

  // (1) Same number of records as furniture items.
  assert.equal(
    exported.furniture.length,
    spec.furniture.length,
    `export must have one record per furniture item: got ${exported.furniture.length}, expected ${spec.furniture.length}`,
  );

  // (2) Set of exported ids equals the set of spec ids, with no duplicates.
  const exportedIds = exported.furniture.map((r) => r.id);
  const uniqueExportedIds = new Set(exportedIds);
  assert.equal(
    uniqueExportedIds.size,
    exportedIds.length,
    `exported ids must be unique (no duplicate records per id): ${exportedIds.join(", ")}`,
  );
  const specIds = new Set(spec.furniture.map((f) => f.id));
  assert.deepEqual(
    [...uniqueExportedIds].sort(),
    [...specIds].sort(),
    "set of exported ids must equal the set of Scene_Spec furniture ids",
  );

  // (3) Each record's geometry deep-equals the matching Scene_Spec item.
  for (const item of spec.furniture) {
    const matches = exported.furniture.filter((r) => r.id === item.id);
    assert.equal(
      matches.length,
      1,
      `exactly one export record per id "${item.id}", got ${matches.length}`,
    );
    const record = matches[0];
    assert.deepStrictEqual(
      record.position,
      item.position,
      `position mismatch for furniture id "${item.id}"`,
    );
    assert.deepStrictEqual(
      record.dimensions,
      item.dimensions,
      `dimensions mismatch for furniture id "${item.id}"`,
    );
    assert.equal(
      record.rotationDeg,
      item.rotationDeg,
      `rotationDeg mismatch for furniture id "${item.id}"`,
    );
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("positions.json Property 12: полнота экспорта позиций мебели", () => {
  // -----------------------------------------------------------------------
  // Feature: ai-design-3d-blockout, Property 12
  // Validates: Requirements 7.3
  // -----------------------------------------------------------------------
  it("buildPositionsExport yields one record per furniture item with matching geometry (arbitrary Scene_Spec)", () => {
    fc.assert(
      fc.property(sceneSpecArb, (spec) => {
        // Sanity: the generated spec is schema-valid so the export is built
        // from a faithful Scene_Spec.
        const valid = parseSceneSpec(structuredClone(spec));
        assertExportComplete(valid);
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Same property must hold for the real, deterministic production builder.
  // -----------------------------------------------------------------------
  it("buildPositionsExport is complete for specs from the deterministic buildSceneSpec", () => {
    fc.assert(
      fc.property(
        roomTypeArb,
        fc.double({ min: 0, max: 200, noNaN: true }),
        nonEmptyStringArb,
        (roomType, extraArea, sharedStylePrompt) => {
          // Stay at or above the per-room minimum so buildSceneSpec succeeds.
          const minArea = ROOM_MIN_AREA_M2[roomType as RoomType];
          const areaM2 = minArea + extraArea;
          const spec = buildSceneSpec({
            roomType: roomType as RoomType,
            areaM2,
            style: { sharedStylePrompt },
          });
          assertExportComplete(spec);
        },
      ),
      { numRuns: 200 },
    );
  });
});
