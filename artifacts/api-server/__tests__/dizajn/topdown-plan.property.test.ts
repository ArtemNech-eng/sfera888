/**
 * Property test for Top_Down_Plan_Renderer.
 *
 * Property 16: Top_Down_Plan is deterministic and structurally complete.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 *
 * Module under test:
 *   - `renderTopDownPlanPng` (binary PNG output)
 *   - `__test__.buildBedroomSvg` (pure SVG-string builder for bedroom template)
 *   - `__test__.buildPlaceholderSvg` (placeholder SVG for non-bedroom rooms)
 *   from `artifacts/api-server/src/lib/topDownPlan.ts`.
 *
 * Sub-properties verified:
 *   1. **Determinism** — `buildBedroomSvg(layout)` returns byte-identical
 *      strings on repeat calls (Requirement 8.1).
 *   2. **SVG well-formedness** — output starts with `<svg ` and ends with
 *      `</svg>`, contains exactly one `<svg ...>` opening tag
 *      (Requirements 8.1, 8.2).
 *   3. **Wall length labels in cm** — output contains `${widthCm} см` AND
 *      `${lengthCm} см` (Requirement 8.4).
 *   4. **Furniture rectangle count** — exactly one rotated `<g>` group per
 *      furniture item, matching `layout.furniture.length`
 *      (Requirement 8.3).
 *   5. **Major-furniture dimension labels** — for `bed`/`wardrobe` items
 *      (bedroom MVP) the SVG contains `Кровать W×L` / `Шкаф W×L`
 *      with W = min(widthCm,depthCm), L = max(widthCm,depthCm)
 *      (Requirement 8.4).
 *   6. **Placeholder constancy** — `buildPlaceholderSvg()` is constant
 *      across calls (Requirement 8.5).
 *   7. **Placeholder content** — placeholder contains «Вид сверху»
 *      (Requirement 8.5).
 *   8. **PNG idempotence** — two `renderTopDownPlanPng` calls on identical
 *      input produce byte-identical buffers (Requirement 8.1).
 *   9. **Non-trivial PNG size** — output is > 1 KB
 *      (Requirements 8.2, 8.3, 8.4).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { LayoutJson } from "@workspace/db";

// `topDownPlan.ts` re-exports from `./objectStorage.js`, which initialises an
// S3 client at module load and throws if R2 env vars are missing. The
// rendering API exercised by this test (`renderTopDownPlanPng`,
// `buildBedroomSvg`, `buildPlaceholderSvg`) does not touch R2 — only the
// `uploadTopDownPlan` helper does, and that helper is not called here.
// Setting dummy values is enough to satisfy the eager init check.
process.env["R2_ENDPOINT"] ??= "http://test.invalid";
process.env["R2_ACCESS_KEY_ID"] ??= "test-key";
process.env["R2_SECRET_ACCESS_KEY"] ??= "test-secret";

// Top-level dynamic import so the env setting above runs first. ESM static
// imports are evaluated before the module body, so a plain `import` would
// trigger objectStorage init before our env vars are in place.
const { renderTopDownPlanPng, __test__ } = await import(
  "../../src/lib/topDownPlan.js"
);

const { buildBedroomSvg, buildPlaceholderSvg, computeRoomGeometry, PADDING } =
  __test__;

// ─── Generators ──────────────────────────────────────────────────────────────

const wallArb = fc.constantFrom(
  "north" as const,
  "east" as const,
  "south" as const,
  "west" as const,
);

/**
 * Furniture types covering bedroom MVP. Includes `bed` and `wardrobe` so the
 * major-furniture-label property exercises the labelled branch, plus other
 * types from the Layout_JSON enum to cover the un-labelled branch.
 */
const furnitureTypeArb = fc.constantFrom(
  "bed",
  "wardrobe",
  "desk",
  "chair",
  "nightstand",
  "rug",
  "dresser",
  "shelf",
  "mirror",
  "cabinet",
);

const idCharArb = fc.constantFrom(
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "_", "-",
);
const idArb = fc
  .array(idCharArb, { minLength: 1, maxLength: 32 })
  .map((chars) => chars.join(""));

/**
 * Furniture item generator constrained so the rendered AABB is large enough
 * for the SVG label to appear. The renderer skips the in-rect text when
 * `min(widthPx, depthPx) < 40px` — see `buildFurnitureItem` in
 * `topDownPlan.ts`. Setting `min(widthCm, depthCm) >= 60` guarantees the
 * label is emitted at any room size in [200..800] cm × [200..800] cm
 * (worst-case scale ≈ 0.85 px/cm → 60 × 0.85 ≈ 51 px, comfortably ≥ 40).
 */
const furnitureItemArb = fc.record({
  id: idArb,
  type: furnitureTypeArb,
  widthCm: fc.integer({ min: 60, max: 250 }),
  depthCm: fc.integer({ min: 60, max: 250 }),
  heightCm: fc.integer({ min: 10, max: 280 }),
  xCm: fc.integer({ min: 0, max: 600 }),
  yCm: fc.integer({ min: 0, max: 600 }),
  rotationDeg: fc.constantFrom(0 as const, 90 as const, 180 as const, 270 as const),
});

/** Bedroom-only Layout_JSON arbitrary (Property 16 only exercises the
 *  bedroom template — non-bedroom rooms use the placeholder branch and
 *  are tested separately via `buildPlaceholderSvg`). */
const bedroomLayoutArb: fc.Arbitrary<LayoutJson> = fc.record({
  room: fc.record({
    roomType: fc.constant("bedroom"),
    widthCm: fc.integer({ min: 200, max: 800 }),
    lengthCm: fc.integer({ min: 200, max: 800 }),
    heightCm: fc.integer({ min: 220, max: 350 }),
  }),
  door: fc.record({
    wall: wallArb,
    offsetCm: fc.integer({ min: 0, max: 600 }),
    widthCm: fc.integer({ min: 70, max: 110 }),
  }),
  window: fc.option(
    fc.record({
      wall: wallArb,
      offsetCm: fc.integer({ min: 0, max: 600 }),
      widthCm: fc.integer({ min: 60, max: 300 }),
    }),
    { nil: null },
  ),
  furniture: fc.array(furnitureItemArb, { minLength: 1, maxLength: 8 }),
}) as fc.Arbitrary<LayoutJson>;

// ─── Hand-crafted layouts for PNG-level tests ────────────────────────────────

/**
 * A small, valid bedroom layout used for the (slow) PNG-level tests.
 * sharp PNG rendering is on the order of 50–200 ms per call, so we don't
 * want fc to drive thousands of conversions — a couple of hand-crafted
 * cases are enough to validate determinism.
 */
const fixedBedroomLayoutA: LayoutJson = {
  room: { roomType: "bedroom", widthCm: 320, lengthCm: 400, heightCm: 250 },
  door: { wall: "north", offsetCm: 60, widthCm: 90 },
  window: { wall: "south", offsetCm: 100, widthCm: 150 },
  furniture: [
    {
      id: "bed-1",
      type: "bed",
      widthCm: 160,
      depthCm: 200,
      heightCm: 50,
      xCm: 80,
      yCm: 60,
      rotationDeg: 0,
    },
    {
      id: "wardrobe-1",
      type: "wardrobe",
      widthCm: 200,
      depthCm: 60,
      heightCm: 220,
      xCm: 60,
      yCm: 320,
      rotationDeg: 0,
    },
  ],
};

const fixedBedroomLayoutB: LayoutJson = {
  room: { roomType: "bedroom", widthCm: 280, lengthCm: 360, heightCm: 240 },
  door: { wall: "west", offsetCm: 40, widthCm: 80 },
  window: null,
  furniture: [
    {
      id: "bed",
      type: "bed",
      widthCm: 140,
      depthCm: 200,
      heightCm: 45,
      xCm: 90,
      yCm: 80,
      rotationDeg: 90,
    },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Top_Down_Plan Property 16: deterministic and structurally complete", () => {
  // -----------------------------------------------------------------------
  // Property 16.1 — Determinism of the SVG builder.
  // Validates: Requirement 8.1
  // -----------------------------------------------------------------------
  it("buildBedroomSvg is deterministic — two calls on the same layout produce byte-identical strings", () => {
    fc.assert(
      fc.property(bedroomLayoutArb, (layout) => {
        const a = buildBedroomSvg(layout);
        const b = buildBedroomSvg(layout);
        assert.equal(
          a,
          b,
          "buildBedroomSvg returned different strings for identical input",
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 16.2 — SVG well-formedness.
  // Validates: Requirements 8.1, 8.2
  // -----------------------------------------------------------------------
  it("output starts with <svg and ends with </svg>, contains exactly one <svg ...> tag", () => {
    fc.assert(
      fc.property(bedroomLayoutArb, (layout) => {
        const svg = buildBedroomSvg(layout);
        assert.ok(
          svg.startsWith("<svg "),
          `SVG must start with "<svg "; got: ${svg.slice(0, 20)}`,
        );
        assert.ok(
          svg.trimEnd().endsWith("</svg>"),
          `SVG must end with "</svg>"; got: ${svg.slice(-20)}`,
        );
        const openTags = svg.match(/<svg\s/g) ?? [];
        assert.equal(
          openTags.length,
          1,
          `expected exactly one <svg ...> opening tag, got ${openTags.length}`,
        );
        const closeTags = svg.match(/<\/svg>/g) ?? [];
        assert.equal(
          closeTags.length,
          1,
          `expected exactly one </svg> closing tag, got ${closeTags.length}`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 16.3 — Wall length labels in cm.
  // Validates: Requirement 8.4
  // -----------------------------------------------------------------------
  it("output contains `${widthCm} см` and `${lengthCm} см` wall labels", () => {
    fc.assert(
      fc.property(bedroomLayoutArb, (layout) => {
        const svg = buildBedroomSvg(layout);
        const widthLabel = `${layout.room.widthCm} см`;
        const lengthLabel = `${layout.room.lengthCm} см`;
        assert.ok(
          svg.includes(widthLabel),
          `SVG must contain wall width label "${widthLabel}"`,
        );
        assert.ok(
          svg.includes(lengthLabel),
          `SVG must contain wall length label "${lengthLabel}"`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 16.4 — Furniture rectangle count.
  // Validates: Requirement 8.3
  // -----------------------------------------------------------------------
  it("number of rotated furniture <g> groups equals layout.furniture.length", () => {
    fc.assert(
      fc.property(bedroomLayoutArb, (layout) => {
        const svg = buildBedroomSvg(layout);
        // Every furniture item is rendered as
        //   <g transform="translate(cx cy) rotate(deg)">…</g>
        // (see `buildFurnitureItem` in topDownPlan.ts). The wall/door/window
        // SVG fragments do not use the `translate(... ...) rotate(` pattern,
        // so this regex isolates furniture groups specifically.
        const matches = svg.match(
          /<g transform="translate\([^"]*\) rotate\(/g,
        );
        const count = matches?.length ?? 0;
        assert.equal(
          count,
          layout.furniture.length,
          `expected ${layout.furniture.length} furniture groups, got ${count}`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 16.5 — Major-furniture dimension labels.
  // Validates: Requirement 8.4
  // -----------------------------------------------------------------------
  it("contains `Кровать W×L` / `Шкаф W×L` for each major bedroom item", () => {
    fc.assert(
      fc.property(bedroomLayoutArb, (layout) => {
        const svg = buildBedroomSvg(layout);
        // The renderer skips in-rect text when `min(wPx, dPx) < 40`. The
        // arbitrary constrains furniture so this never happens, but compute
        // the same threshold defensively to keep the test honest if the
        // arbitrary is ever loosened.
        const geom = computeRoomGeometry(
          layout.room.widthCm,
          layout.room.lengthCm,
        );
        for (const item of layout.furniture) {
          if (item.type !== "bed" && item.type !== "wardrobe") continue;
          const wPx = item.widthCm * geom.scale;
          const dPx = item.depthCm * geom.scale;
          if (Math.min(wPx, dPx) < 40) continue; // label legitimately skipped

          const ru = item.type === "bed" ? "Кровать" : "Шкаф";
          const dim1 = Math.min(item.widthCm, item.depthCm);
          const dim2 = Math.max(item.widthCm, item.depthCm);
          const expected = `${ru} ${dim1}×${dim2}`;
          assert.ok(
            svg.includes(expected),
            `SVG must contain major-furniture label "${expected}" for item ${item.id} (${item.type})`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 16.6 — Placeholder is constant.
  // Validates: Requirement 8.5
  // -----------------------------------------------------------------------
  it("buildPlaceholderSvg returns the same string on repeat calls", () => {
    const a = buildPlaceholderSvg();
    const b = buildPlaceholderSvg();
    const c = buildPlaceholderSvg();
    assert.equal(a, b);
    assert.equal(b, c);
    assert.ok(a.startsWith("<svg "));
    assert.ok(a.trimEnd().endsWith("</svg>"));
  });

  // -----------------------------------------------------------------------
  // Property 16.7 — Placeholder contains «Вид сверху».
  // Validates: Requirement 8.5
  // -----------------------------------------------------------------------
  it("placeholder SVG contains «Вид сверху»", () => {
    const svg = buildPlaceholderSvg();
    assert.ok(
      svg.includes("Вид сверху"),
      "placeholder SVG must contain «Вид сверху»",
    );
  });

  // -----------------------------------------------------------------------
  // Property 16.8 — PNG idempotence.
  // Validates: Requirement 8.1
  //
  // Hand-crafted layouts only — sharp PNG rendering is slow (50-200 ms
  // per call) and we just need to confirm two calls on the same input
  // produce identical bytes, not exhaustive coverage.
  // -----------------------------------------------------------------------
  it("renderTopDownPlanPng is byte-identical across calls (layout A)", async () => {
    const a = await renderTopDownPlanPng(fixedBedroomLayoutA);
    const b = await renderTopDownPlanPng(fixedBedroomLayoutA);
    assert.equal(
      a.length,
      b.length,
      `PNG buffer lengths differ: ${a.length} vs ${b.length}`,
    );
    assert.ok(
      a.equals(b),
      "PNG buffers differ byte-by-byte for identical input",
    );
  });

  it("renderTopDownPlanPng is byte-identical across calls (layout B)", async () => {
    const a = await renderTopDownPlanPng(fixedBedroomLayoutB);
    const b = await renderTopDownPlanPng(fixedBedroomLayoutB);
    assert.equal(a.length, b.length);
    assert.ok(a.equals(b));
  });

  // -----------------------------------------------------------------------
  // Property 16.9 — Non-trivial PNG size.
  // Validates: Requirements 8.2, 8.3, 8.4
  //
  // A 1200×900 canvas with walls, furniture, and labels compresses to
  // well over 1 KB. A buffer below that threshold would indicate the
  // renderer silently produced an empty/blank image.
  // -----------------------------------------------------------------------
  it("renderTopDownPlanPng output is > 1 KB", async () => {
    const png = await renderTopDownPlanPng(fixedBedroomLayoutA);
    assert.ok(
      png.length > 1024,
      `PNG buffer suspiciously small: ${png.length} bytes`,
    );
    // Sanity check the PNG magic number (89 50 4E 47).
    assert.equal(png[0], 0x89);
    assert.equal(png[1], 0x50);
    assert.equal(png[2], 0x4e);
    assert.equal(png[3], 0x47);
  });

  // -----------------------------------------------------------------------
  // Bonus — non-bedroom roomType uses the placeholder branch
  // (Requirement 8.5: no AI fallback, simple placeholder).
  // -----------------------------------------------------------------------
  it("renderTopDownPlanPng uses placeholder for non-bedroom rooms", async () => {
    const kitchenLayout: LayoutJson = {
      room: {
        roomType: "kitchen",
        widthCm: 300,
        lengthCm: 400,
        heightCm: 250,
      },
      door: { wall: "north", offsetCm: 50, widthCm: 90 },
      window: null,
      furniture: [
        {
          id: "k1",
          type: "kitchen_island",
          widthCm: 200,
          depthCm: 100,
          heightCm: 90,
          xCm: 50,
          yCm: 100,
          rotationDeg: 0,
        },
      ],
    };
    const png = await renderTopDownPlanPng(kitchenLayout);
    // Magic number sanity — confirms a real PNG was produced.
    assert.equal(png[0], 0x89);
    assert.ok(png.length > 1024);
  });
});

// Sanity check: PADDING export is non-zero so the canvas leaves room for
// wall labels (otherwise Property 16.3 would silently fail because labels
// would clip out of view). This is a structural invariant of the renderer
// that property 16.3 assumes.
describe("Top_Down_Plan structural invariants", () => {
  it("canvas padding leaves room for wall labels", () => {
    assert.ok(PADDING > 0, "PADDING must be > 0 to fit wall length labels");
  });
});
