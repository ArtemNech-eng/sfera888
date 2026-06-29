/**
 * Property test for Geometric_Consistency across the Camera_Rig.
 *
 * Feature: ai-design-3d-blockout, Property 11: Геометрическая
 * согласованность по всем камерам.
 *
 * **Validates: Requirements 7.1, 7.2, 7.4**
 *
 * Modules under test:
 *   - `buildSceneSpec` from
 *     `artifacts/api-server/src/lib/blockout/sceneSpec.ts`
 *   - `buildPositionsExport` from
 *     `artifacts/api-server/src/lib/blockout/positions.ts`
 *
 * Property verified here:
 *   For any `Scene_Spec`, the set of world positions / dimensions /
 *   orientations of the furniture exported from the single `Room_Blockout`
 *   is camera-independent. The furniture lives in one scene; the
 *   `Camera_Rig` only provides viewpoints. Therefore, for ANY pair of
 *   `Camera_Rig` cameras, the exported furniture-placement set is identical
 *   (Requirements 7.1, 7.2, 7.4).
 *
 * This is verified via `Scene_Spec` / positions export DATA, never pixels:
 *   `buildPositionsExport` is a pure function of the scene and takes no
 *   camera, so "viewing" the same scene from any of the 6 cameras must
 *   yield byte-identical placement data.
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
  type RoomType,
  type SceneSpec,
} from "../../src/lib/blockout/sceneSpec.js";
import {
  buildPositionsExport,
  type PositionRecord,
} from "../../src/lib/blockout/positions.js";

// ─── Generators (constrained to the valid input space) ────────────────────────

/**
 * Valid `(roomType, areaM2)` pair: area is always ≥ the per-type minimum so
 * `buildSceneSpec` never rejects it (the min-area gate is exercised by
 * Property 4, not here). Upper bound keeps rooms plausibly sized.
 */
const sceneInputArb = fc
  .constantFrom<RoomType>(...ROOM_TYPES)
  .chain((roomType) => {
    const min = ROOM_MIN_AREA_M2[roomType];
    return fc.record({
      roomType: fc.constant(roomType),
      // min .. min+120 m², strictly above the minimum, finite, no NaN.
      areaM2: fc.double({ min: min + 0.5, max: min + 120, noNaN: true }),
      sharedStylePrompt: fc.string({ minLength: 1, maxLength: 40 }),
      negativePrompt: fc.string({ maxLength: 40 }),
    });
  });

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * "Views" the single scene from one camera and returns the furniture
 * placement set. Because world placements come from the one `Room_Blockout`
 * and not from the camera, the export ignores the camera entirely — that
 * camera-independence is exactly what Property 11 asserts. The `camera`
 * argument is threaded through to make the per-camera modelling explicit.
 */
function exportFromCamera(
  spec: SceneSpec,
  _camera: SceneSpec["cameraRig"][number],
): PositionRecord[] {
  return buildPositionsExport(spec).furniture;
}

/**
 * Normalizes a placement list into a canonical "set" keyed by furniture id
 * (ids are unique within a `Scene_Spec`). Sorting by id removes any
 * incidental ordering so the comparison is genuinely set-vs-set.
 */
function asPlacementSet(records: PositionRecord[]): PositionRecord[] {
  return [...records].sort((a, b) => a.id.localeCompare(b.id));
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Geometric_Consistency Property 11: согласованность по всем камерам", () => {
  // -----------------------------------------------------------------------
  // Feature: ai-design-3d-blockout, Property 11
  // Validates: Requirements 7.1, 7.2, 7.4
  //
  // The exported placement set is identical for every pair of Camera_Rig
  // cameras: the furniture world transforms are a pure function of the
  // single scene, not of any viewpoint.
  // -----------------------------------------------------------------------
  it("furniture placement set is identical across all pairs of Camera_Rig cameras", () => {
    fc.assert(
      fc.property(sceneInputArb, (input) => {
        const spec = buildSceneSpec({
          roomType: input.roomType,
          areaM2: input.areaM2,
          style: {
            sharedStylePrompt: input.sharedStylePrompt,
            negativePrompt: input.negativePrompt,
          },
        });

        // The rig is a fixed 6-camera set (4 perspective + top + iso).
        assert.equal(
          spec.cameraRig.length,
          6,
          `expected a 6-camera rig, got ${spec.cameraRig.length}`,
        );

        // Export the placement set as "seen" from each camera.
        const perCamera = spec.cameraRig.map((cam) =>
          asPlacementSet(exportFromCamera(spec, cam)),
        );

        // Every pair of cameras must yield a byte-identical placement set.
        const reference = perCamera[0];
        for (let i = 1; i < perCamera.length; i++) {
          assert.deepStrictEqual(
            perCamera[i],
            reference,
            `placement set from camera "${spec.cameraRig[i].id}" differs ` +
              `from camera "${spec.cameraRig[0].id}"`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // The camera-independent placement set also matches the scene's own
  // furniture (position / dimensions / orientation), confirming the export
  // reflects the single Room_Blockout rather than any per-camera transform
  // (Requirements 7.1, 7.2).
  // -----------------------------------------------------------------------
  it("placement set equals the scene's furniture transforms (no per-camera drift)", () => {
    fc.assert(
      fc.property(sceneInputArb, (input) => {
        const spec = buildSceneSpec({
          roomType: input.roomType,
          areaM2: input.areaM2,
          style: {
            sharedStylePrompt: input.sharedStylePrompt,
            negativePrompt: input.negativePrompt,
          },
        });

        const expected = asPlacementSet(
          spec.furniture.map((item) => ({
            id: item.id,
            position: {
              x: item.position.x,
              y: item.position.y,
              z: item.position.z,
            },
            dimensions: {
              w: item.dimensions.w,
              d: item.dimensions.d,
              h: item.dimensions.h,
            },
            rotationDeg: item.rotationDeg,
          })),
        );

        for (const cam of spec.cameraRig) {
          const placement = asPlacementSet(exportFromCamera(spec, cam));
          assert.deepStrictEqual(
            placement,
            expected,
            `camera "${cam.id}" placement set diverges from the scene's ` +
              `furniture transforms`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});
