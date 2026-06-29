/**
 * Property test for Scene_Spec JSON serialization round-trip.
 *
 * Feature: ai-design-3d-blockout, Property 1: Scene_Spec round-trip
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 *
 * Module under test:
 *   - `serializeSceneSpec`, `parseSceneSpec`, `sceneSpecSchema`,
 *     `__test__` from `artifacts/api-server/src/lib/blockout/sceneSpec.ts`.
 *
 * Property 1 (Scene_Spec round-trip):
 *   For any valid SceneSpec `x`,
 *   `parseSceneSpec(JSON.parse(serializeSceneSpec(x)))` yields a SceneSpec
 *   equivalent to the canonical form of `x`. Equivalence is checked two ways:
 *     1. byte-level: re-serializing the parsed spec reproduces the exact
 *        canonical JSON (Requirements 4.1, 4.3);
 *     2. structural: the parsed spec deep-equals the canonical parsed JSON
 *        that `Blockout_Builder` would read (Requirement 4.2).
 *
 * The arbitrary `sceneSpecArb` generates only schema-valid specs (built on the
 * same patterns as `layoutJsonArb` in
 * `__tests__/dizajn/layout-json-roundtrip.property.test.ts`):
 *   - `schemaVersion === 1`;
 *   - exactly 6 cameras in `cameraRig`: 4 perspective + 1 top_ortho + 1 isometric;
 *   - at least one furniture item, all with unique ids;
 *   - every numeric leaf is finite (no NaN / ±Infinity); positive fields > 0,
 *     non-negative fields ≥ 0, resolution width/height are positive integers.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  serializeSceneSpec,
  parseSceneSpec,
  ROOM_TYPES,
  WALLS,
  ROTATIONS,
  type SceneSpec,
} from "../../src/lib/blockout/sceneSpec.js";

// ─── Primitive arbitraries ─────────────────────────────────────────────────

/** Finite number (no NaN / ±Infinity) — matches `z.number().finite()`. */
const finiteArb = fc.double({
  min: -1_000,
  max: 1_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Strictly positive finite number — matches `z.number().finite().positive()`. */
const positiveArb = fc.double({
  min: 0.001,
  max: 1_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Non-negative finite number — matches `z.number().finite().nonnegative()`. */
const nonNegativeArb = fc.double({
  min: 0,
  max: 1_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Non-empty string — matches `z.string().min(1)`. */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 24 });

/** Possibly empty string — matches `z.string()` (e.g. negativePrompt). */
const anyStringArb = fc.string({ maxLength: 24 });

const roomTypeArb = fc.constantFrom(...ROOM_TYPES);
const wallArb = fc.constantFrom(...WALLS);
const rotationArb = fc.constantFrom(...ROTATIONS);

const vec3Arb = fc.record({ x: finiteArb, y: finiteArb, z: finiteArb });

// ─── Composite arbitraries ─────────────────────────────────────────────────

const roomArb = fc.record({
  roomType: roomTypeArb,
  areaM2: positiveArb,
  dimensions: fc.record({ W: positiveArb, L: positiveArb, H: positiveArb }),
});

const doorArb = fc.record({
  wall: wallArb,
  offsetM: nonNegativeArb,
  widthM: positiveArb,
  heightM: positiveArb,
});

const windowArb = fc.record({
  wall: wallArb,
  offsetM: nonNegativeArb,
  widthM: positiveArb,
  heightM: positiveArb,
  sillM: nonNegativeArb,
});

const shellArb = fc.record({ door: doorArb, window: windowArb });

/** Furniture item WITHOUT id; ids are assigned after generation to be unique. */
const furnitureBodyArb = fc.record({
  kind: nonEmptyStringArb,
  position: vec3Arb,
  dimensions: fc.record({ w: positiveArb, d: positiveArb, h: positiveArb }),
  rotationDeg: rotationArb,
});

/** ≥1 furniture item; ids made unique via index suffix. */
const furnitureArb = fc
  .array(furnitureBodyArb, { minLength: 1, maxLength: 8 })
  .map((items) => items.map((body, i) => ({ id: `furn-${i}`, ...body })));

const perspectiveCameraArb = fc.record({
  role: fc.constant("perspective" as const),
  position: vec3Arb,
  target: vec3Arb,
  fovDeg: positiveArb,
});

const topOrthoCameraArb = fc.record({
  role: fc.constant("top_ortho" as const),
  position: vec3Arb,
  target: vec3Arb,
  orthoScale: positiveArb,
});

const isometricCameraArb = fc.record({
  role: fc.constant("isometric" as const),
  position: vec3Arb,
  target: vec3Arb,
  orthoScale: positiveArb,
});

/**
 * Exactly 6 cameras: 4 perspective + 1 top_ortho + 1 isometric, in that fixed
 * composition (Camera_Rig, Req 5.1). ids assigned by index to stay unique and
 * non-empty.
 */
const cameraRigArb = fc
  .tuple(
    fc.array(perspectiveCameraArb, { minLength: 4, maxLength: 4 }),
    topOrthoCameraArb,
    isometricCameraArb,
  )
  .map(([perspectives, top, iso]) =>
    [...perspectives, top, iso].map((cam, i) => ({ id: `cam-${i}`, ...cam })),
  );

const renderArb = fc.record({
  engine: fc.constant("EEVEE_NEXT" as const),
  renderNormals: fc.boolean(),
  resolution: fc.record({
    width: fc.integer({ min: 1, max: 8192 }),
    height: fc.integer({ min: 1, max: 8192 }),
  }),
});

const styleArb = fc.record({
  sharedStylePrompt: nonEmptyStringArb,
  negativePrompt: anyStringArb,
});

/** Valid Scene_Spec conforming to `sceneSpecSchema`. */
const sceneSpecArb: fc.Arbitrary<SceneSpec> = fc.record({
  schemaVersion: fc.constant(1 as const),
  room: roomArb,
  shell: shellArb,
  layoutPresetId: nonEmptyStringArb,
  furniture: furnitureArb,
  cameraRig: cameraRigArb,
  render: renderArb,
  style: styleArb,
}) as fc.Arbitrary<SceneSpec>;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Scene_Spec Property 1: round-trip", () => {
  // -----------------------------------------------------------------------
  // Feature: ai-design-3d-blockout, Property 1: Scene_Spec round-trip
  // For any valid SceneSpec x, parseSceneSpec(JSON.parse(serializeSceneSpec(x)))
  // yields an equivalent SceneSpec.
  // Validates: Requirements 4.1, 4.2, 4.3
  // -----------------------------------------------------------------------
  it("parseSceneSpec(JSON.parse(serializeSceneSpec(x))) is equivalent to x", () => {
    fc.assert(
      fc.property(sceneSpecArb, (spec) => {
        // Requirement 4.1: serialize Scene_Spec to JSON.
        const json = serializeSceneSpec(spec);

        // Requirement 4.2: parse the JSON back into a Scene_Spec structure.
        const parsed = parseSceneSpec(JSON.parse(json));

        // Requirement 4.3 (round-trip), byte-level: re-serializing the parsed
        // spec reproduces the exact canonical JSON, so no information is lost.
        assert.equal(
          serializeSceneSpec(parsed),
          json,
          `round-trip re-serialization differs from canonical JSON: ${json}`,
        );

        // Requirement 4.3 (round-trip), structural: the parsed spec deep-equals
        // the canonical parsed JSON that Blockout_Builder would consume.
        assert.deepStrictEqual(parsed, JSON.parse(json));
      }),
      { numRuns: 200 },
    );
  });

  it("the generated arbitrary always produces schema-valid specs (sanity)", () => {
    fc.assert(
      fc.property(sceneSpecArb, (spec) => {
        // serializeSceneSpec validates against the schema and throws on any
        // violation; reaching here means the generator stays inside the valid
        // input space (4 perspective + 1 top_ortho + 1 isometric, unique ids,
        // finite numbers, etc.).
        assert.doesNotThrow(() => serializeSceneSpec(spec));
        const cameras = spec.cameraRig;
        assert.equal(cameras.length, 6);
        assert.equal(
          cameras.filter((c) => c.role === "perspective").length,
          4,
        );
        assert.equal(cameras.filter((c) => c.role === "top_ortho").length, 1);
        assert.equal(cameras.filter((c) => c.role === "isometric").length, 1);
        const ids = new Set(spec.furniture.map((f) => f.id));
        assert.equal(ids.size, spec.furniture.length);
      }),
      { numRuns: 100 },
    );
  });
});
