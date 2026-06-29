/**
 * Property test for Scene_Spec strict parsing error messages.
 *
 * Feature: ai-design-3d-blockout, Property 2: Невалидная схема называет
 * первое нарушенное поле.
 *
 * **Validates: Requirements 4.4**
 *
 * Module under test:
 *   - `parseSceneSpec` and `SceneSpecValidationError` from
 *     `artifacts/api-server/src/lib/blockout/sceneSpec.ts`
 *
 * Property verified here:
 *   For ANY valid SceneSpec with EXACTLY ONE field corrupted (wrong type or
 *   value out of range), `parseSceneSpec` throws a `SceneSpecValidationError`
 *   whose `field` (dotted path) equals — and whose `message` mentions — the
 *   name of that one violated field (Requirement 4.4: «ошибка, называющая
 *   первое нарушенное поле»).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  parseSceneSpec,
  SceneSpecValidationError,
  type SceneSpec,
} from "../../src/lib/blockout/sceneSpec.js";

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
 *   - furniture: 1..4 items with index-derived unique ids;
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
    furnitureCount: fc.integer({ min: 1, max: 4 }),
    furnitureParts: fc.array(
      fc.record({
        kind: nonEmptyStringArb,
        position: vec3Arb,
        dimensions: dimsWDHArb,
        rotationDeg: rotationArb,
      }),
      { minLength: 4, maxLength: 4 },
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

// ─── Single-field corruptors ──────────────────────────────────────────────────
//
// Each corruptor breaks EXACTLY ONE leaf of a valid spec (wrong type or value
// out of range) and declares the dotted path the error must name. Indices used
// (furniture.0, cameraRig.0) always exist: the generator yields ≥1 furniture
// item and a fixed 6-camera rig.

type Corruptor = { path: string; corrupt: (s: SceneSpec) => void };

const corruptors: ReadonlyArray<Corruptor> = [
  { path: "schemaVersion", corrupt: (s) => ((s as { schemaVersion: number }).schemaVersion = 2) },
  { path: "room.roomType", corrupt: (s) => ((s.room as { roomType: string }).roomType = "castle") },
  { path: "room.areaM2", corrupt: (s) => ((s.room as { areaM2: number }).areaM2 = -5) },
  { path: "room.dimensions.W", corrupt: (s) => ((s.room.dimensions as { W: number }).W = -1) },
  { path: "room.dimensions.H", corrupt: (s) => ((s.room.dimensions as { H: number }).H = 0) },
  { path: "shell.door.wall", corrupt: (s) => ((s.shell.door as { wall: string }).wall = "up") },
  { path: "shell.door.widthM", corrupt: (s) => ((s.shell.door as { widthM: number }).widthM = 0) },
  { path: "shell.window.sillM", corrupt: (s) => ((s.shell.window as { sillM: number }).sillM = -1) },
  {
    path: "shell.window.widthM",
    corrupt: (s) => ((s.shell.window as unknown as { widthM: unknown }).widthM = "wide"),
  },
  { path: "layoutPresetId", corrupt: (s) => ((s as { layoutPresetId: string }).layoutPresetId = "") },
  { path: "furniture.0.id", corrupt: (s) => ((s.furniture[0] as { id: string }).id = "") },
  {
    path: "furniture.0.kind",
    corrupt: (s) => ((s.furniture[0] as unknown as { kind: unknown }).kind = 42),
  },
  {
    path: "furniture.0.rotationDeg",
    corrupt: (s) => ((s.furniture[0] as { rotationDeg: number }).rotationDeg = 45),
  },
  {
    path: "furniture.0.dimensions.w",
    corrupt: (s) => ((s.furniture[0].dimensions as { w: number }).w = -2),
  },
  {
    path: "furniture.0.position.x",
    corrupt: (s) => ((s.furniture[0].position as unknown as { x: unknown }).x = "left"),
  },
  {
    path: "render.engine",
    corrupt: (s) => ((s.render as unknown as { engine: unknown }).engine = "CYCLES"),
  },
  {
    path: "render.resolution.width",
    corrupt: (s) => ((s.render.resolution as { width: number }).width = 1.5),
  },
  {
    path: "render.renderNormals",
    corrupt: (s) => ((s.render as unknown as { renderNormals: unknown }).renderNormals = "yes"),
  },
  {
    path: "style.sharedStylePrompt",
    corrupt: (s) => ((s.style as { sharedStylePrompt: string }).sharedStylePrompt = ""),
  },
  { path: "cameraRig.0.id", corrupt: (s) => ((s.cameraRig[0] as { id: string }).id = "") },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Scene_Spec Property 2: невалидная схема называет первое нарушенное поле", () => {
  // -----------------------------------------------------------------------
  // Feature: ai-design-3d-blockout, Property 2
  // Validates: Requirements 4.4
  // -----------------------------------------------------------------------
  it("parseSceneSpec throws SceneSpecValidationError naming the single corrupted field", () => {
    fc.assert(
      fc.property(sceneSpecArb, fc.constantFrom(...corruptors), (spec, c) => {
        // Sanity: the pristine spec must parse cleanly, so any failure below
        // is attributable solely to the one corruption we introduce.
        assert.doesNotThrow(
          () => parseSceneSpec(structuredClone(spec)),
          "baseline generated Scene_Spec must be valid",
        );

        const broken = structuredClone(spec);
        c.corrupt(broken);

        assert.throws(
          () => parseSceneSpec(broken),
          (err: unknown) => {
            assert.ok(
              err instanceof SceneSpecValidationError,
              `expected SceneSpecValidationError, got ${String(err)}`,
            );
            assert.equal(
              err.field,
              c.path,
              `error.field "${err.field}" must equal corrupted path "${c.path}"`,
            );
            assert.ok(
              err.message.includes(c.path),
              `error.message "${err.message}" must mention "${c.path}"`,
            );
            return true;
          },
        );
      }),
      { numRuns: 200 },
    );
  });
});
