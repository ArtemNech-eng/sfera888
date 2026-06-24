/**
 * Property test for AI_Design_Product Color_Palette extraction
 * (`lib/colorExtraction.ts`).
 *
 * Property 20: Color_Palette extraction returns 5 valid HEX colors.
 *
 * **Validates: Requirements 12.1**
 *
 * Module under test:
 *   - `extractPalette(buffer, count)` from
 *     `artifacts/api-server/src/lib/colorExtraction.ts`
 *
 * The implementation pre-existed in the repo and is reused by the
 * AI_Design_Product worker (step 9, Color_Palette). This test pins down its
 * public contract so future refactors of the k-means clusterer cannot
 * silently break the dizajn pipeline.
 *
 * Properties verified here:
 *   20.1 — Palette length: `extractPalette(buf, 5)` returns at most 5
 *          swatches for any valid image buffer (Requirement 12.1).
 *   20.2 — Valid HEX format: every returned `hex` matches
 *          `/^#[0-9a-fA-F]{6}$/` (Requirement 12.1).
 *   20.3 — Determinism: two calls on the same buffer produce identical
 *          palettes — k-means uses fixed initial centroids, so the
 *          algorithm is reproducible (Requirement 12.1).
 *   20.4 — Discrimination: visibly distinct images (solid red vs solid
 *          blue) yield distinct palettes (Requirement 12.1).
 *
 * Image generation via sharp is slow (~10–30 ms per image), so property
 * runs are capped at numRuns: 5–8 and most cases use hand-crafted
 * fixtures.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import sharp from "sharp";

// `colorExtraction.ts` only imports `sharp` and a type from `@workspace/db`;
// the type-only import is erased at runtime and never opens a pg.Pool. No
// DATABASE_URL plumbing needed.
import { extractPalette } from "../../src/lib/colorExtraction.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const PALETTE_SIZE = 5;

// ─── Image-generation helpers ───────────────────────────────────────────────

/**
 * A solid w×h JPEG of a single RGB colour.
 * JPEG is the format actually consumed by `extractPalette` (Hero_Render is a
 * JPEG), so we exercise the same decode path.
 */
async function makeSolidJpeg(
  r: number,
  g: number,
  b: number,
  w = 64,
  h = 64,
): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r, g, b },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * A horizontal-stripes JPEG with `colors.length` evenly-spaced bands. Used
 * for the hand-crafted multi-colour fixture in Property 20.1.
 */
async function makeStripesJpeg(
  colors: Array<{ r: number; g: number; b: number }>,
  w = 80,
  h = 80,
): Promise<Buffer> {
  const stripeH = Math.floor(h / colors.length);
  // Build raw RGB buffer row-by-row.
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const idx = Math.min(Math.floor(y / stripeH), colors.length - 1);
    const c = colors[idx]!;
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) * 3;
      buf[off] = c.r;
      buf[off + 1] = c.g;
      buf[off + 2] = c.b;
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Color_Palette — Property 20: extraction returns 5 valid HEX colors", () => {
  // ────────────────────────────────────────────────────────────────────────
  // Property 20.1 — Palette length.
  // Validates: Requirement 12.1
  // ────────────────────────────────────────────────────────────────────────
  it("solid-colour image yields ≥ 1 and ≤ 5 swatches", async () => {
    const buf = await makeSolidJpeg(220, 180, 140); // beige
    const palette = await extractPalette(buf, PALETTE_SIZE);
    assert.ok(palette.length >= 1, "palette must not be empty");
    assert.ok(
      palette.length <= PALETTE_SIZE,
      `palette length ${palette.length} exceeds ${PALETTE_SIZE}`,
    );
  });

  it("multi-stripe image (5 bands) yields exactly 5 swatches", async () => {
    const buf = await makeStripesJpeg([
      { r: 220, g: 30, b: 30 }, // red
      { r: 30, g: 200, b: 30 }, // green
      { r: 30, g: 30, b: 220 }, // blue
      { r: 230, g: 230, b: 30 }, // yellow
      { r: 220, g: 30, b: 220 }, // magenta
    ]);
    const palette = await extractPalette(buf, PALETTE_SIZE);
    assert.equal(
      palette.length,
      PALETTE_SIZE,
      "5-band image should fill all 5 slots",
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // Property 20.2 — Valid HEX format.
  // Validates: Requirement 12.1
  // ────────────────────────────────────────────────────────────────────────
  it("every returned swatch hex matches /^#[0-9a-fA-F]{6}$/", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary RGB triples drive the solid-image fixture; the regex
        // contract must hold no matter what colour goes in.
        fc.record({
          r: fc.integer({ min: 0, max: 255 }),
          g: fc.integer({ min: 0, max: 255 }),
          b: fc.integer({ min: 0, max: 255 }),
        }),
        async ({ r, g, b }) => {
          const buf = await makeSolidJpeg(r, g, b);
          const palette = await extractPalette(buf, PALETTE_SIZE);
          for (const swatch of palette) {
            assert.ok(
              HEX_RE.test(swatch.hex),
              `hex "${swatch.hex}" (input rgb=${r},${g},${b}) does not match ${HEX_RE}`,
            );
          }
        },
      ),
      { numRuns: 8 },
    );
  });

  it("hand-crafted fixtures all return well-formed HEX strings", async () => {
    const fixtures = await Promise.all([
      makeSolidJpeg(255, 0, 0), // red
      makeSolidJpeg(0, 255, 0), // green
      makeSolidJpeg(0, 0, 255), // blue
      makeSolidJpeg(0, 0, 0), // black
      makeSolidJpeg(255, 255, 255), // white
    ]);
    for (const buf of fixtures) {
      const palette = await extractPalette(buf, PALETTE_SIZE);
      for (const swatch of palette) {
        assert.ok(
          HEX_RE.test(swatch.hex),
          `fixture produced invalid hex: ${swatch.hex}`,
        );
      }
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Property 20.3 — Determinism.
  // Validates: Requirement 12.1
  // ────────────────────────────────────────────────────────────────────────
  it("two extractPalette calls on the same buffer produce identical results", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          r: fc.integer({ min: 0, max: 255 }),
          g: fc.integer({ min: 0, max: 255 }),
          b: fc.integer({ min: 0, max: 255 }),
        }),
        async ({ r, g, b }) => {
          const buf = await makeSolidJpeg(r, g, b);
          const a = await extractPalette(buf, PALETTE_SIZE);
          const c = await extractPalette(buf, PALETTE_SIZE);
          assert.deepStrictEqual(
            a,
            c,
            `non-deterministic palette for rgb=${r},${g},${b}: ${JSON.stringify(a)} vs ${JSON.stringify(c)}`,
          );
        },
      ),
      { numRuns: 5 },
    );
  });

  it("multi-colour image is also deterministic across two calls", async () => {
    const buf = await makeStripesJpeg([
      { r: 220, g: 30, b: 30 },
      { r: 30, g: 200, b: 30 },
      { r: 30, g: 30, b: 220 },
      { r: 230, g: 230, b: 30 },
      { r: 220, g: 30, b: 220 },
    ]);
    const a = await extractPalette(buf, PALETTE_SIZE);
    const c = await extractPalette(buf, PALETTE_SIZE);
    assert.deepStrictEqual(a, c);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Property 20.4 — Visibly distinct images yield distinct palettes.
  // Validates: Requirement 12.1
  // ────────────────────────────────────────────────────────────────────────
  it("solid red and solid blue produce different palettes", async () => {
    const red = await extractPalette(await makeSolidJpeg(255, 0, 0), PALETTE_SIZE);
    const blue = await extractPalette(await makeSolidJpeg(0, 0, 255), PALETTE_SIZE);
    assert.notDeepStrictEqual(
      red.map((s) => s.hex),
      blue.map((s) => s.hex),
      "red and blue palettes must differ",
    );

    // Strengthening: the most-popular swatch of `red` must be a
    // red-dominant hex (R > G && R > B), and likewise for blue. JPEG
    // compression can shift channels by a few units, so we don't
    // require exact #FF0000 / #0000FF, just dominance of the right
    // channel.
    const redTop = red[0]!.hex;
    const blueTop = blue[0]!.hex;
    const [rR, rG, rB] = parseHex(redTop);
    const [bR, bG, bB] = parseHex(blueTop);
    assert.ok(
      rR > rG && rR > rB,
      `red palette dominant should be red-heavy, got ${redTop}`,
    );
    assert.ok(
      bB > bR && bB > bG,
      `blue palette dominant should be blue-heavy, got ${blueTop}`,
    );
  });

  it("solid green and solid blue also yield distinct palettes", async () => {
    const green = await extractPalette(
      await makeSolidJpeg(0, 255, 0),
      PALETTE_SIZE,
    );
    const blue = await extractPalette(
      await makeSolidJpeg(0, 0, 255),
      PALETTE_SIZE,
    );
    assert.notDeepStrictEqual(
      green.map((s) => s.hex),
      blue.map((s) => s.hex),
      "green and blue palettes must differ",
    );
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) throw new Error(`unparseable hex ${hex}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}
