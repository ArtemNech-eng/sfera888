// Feature: ai-design-flagship, Property 15: Route parsing classifies every slug deterministically
/**
 * Property test for `parseRoute` (Route classification for `/dizajn/[slug]`).
 *
 * Property 15: Route parsing classifies every slug deterministically.
 *
 * **Validates: Requirements 9.6, 10.4**
 *
 * Module under test (pure, no Next.js runtime needed):
 *   - `parseRoute(segment)`  — classifies a URL segment as a full-design route,
 *     an aggregate route, or `null` (→ 404 + noindex)
 *   - `normalizeRoom(room)`  — `living-room` → `living_room`
 *   from `artifacts/marketplace/app/dizajn/[slug]/parseRoute.ts` (task 9.1).
 *
 * Requirement 9.6 / 10.4: the public `/dizajn/{slug}` route must classify every
 * slug deterministically into exactly one of three buckets — a full design page,
 * an aggregate landing page, or "nothing" (which drives a 404 + `noindex`).
 *
 * ── IMPLEMENTED CONTRACT (asserted here, NOT an idealized one) ───────────────
 * The disambiguation rule is: a segment is a **full design slug** iff it has
 * `>= 3` dash-separated tokens AND its LAST token matches `/^[a-z0-9]{6,8}$/`
 * (the nanoid shape). This branch is checked FIRST and short-circuits, so it
 * "wins" even over otherwise-valid aggregate combinations.
 *
 * A documented consequence: a 3-token aggregate combo whose final token happens
 * to have the nanoid shape — e.g. `living-room-modern` (`modern` is 6 lowercase
 * alphanumerics) — is classified as a DESIGN slug, not an aggregate. The test
 * below asserts this ACTUAL behavior rather than the idealized "room+style"
 * reading. See the "known 3-segment behavior" block.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import * as parseRouteNs from "../../../marketplace/app/dizajn/[slug]/parseRoute.ts";

// `parseRoute.ts` lives in the marketplace package, which has no
// `"type": "module"` (Next.js app, CJS by default). Under the api-server ESM
// test loader its named exports may collapse onto the module's `default`
// (module.exports). Normalise both shapes so the pure helpers are accessed the
// same way regardless of how the loader resolves them.
type ParseRouteModule = typeof import("../../../marketplace/app/dizajn/[slug]/parseRoute.ts");
const mod = ((parseRouteNs as { default?: ParseRouteModule }).default ??
  (parseRouteNs as unknown as ParseRouteModule));
const { parseRoute, normalizeRoom, VALID_ROOMS, VALID_STYLES } = mod;

// ─── Mirror of the implemented disambiguation rule (the "oracle") ────────────
// NOTE: this mirrors ONLY the design-vs-not predicate, which is the crisp,
// short-circuiting part of the contract. It is intentionally NOT a full
// re-implementation of the aggregate matcher (that would be circular).
const NANOID_RE = /^[a-z0-9]{6,8}$/;
function isDesignSegment(segment: string): boolean {
  const tokens = segment.split("-");
  const last = tokens[tokens.length - 1] ?? "";
  return tokens.length >= 3 && NANOID_RE.test(last);
}

// ─── Token pools / arbitraries ───────────────────────────────────────────────

// Single-token valid rooms (the `living-room` / `living_room` two-word forms
// are handled separately because they contain a dash / underscore).
const SINGLE_ROOMS = [
  "bathroom",
  "kitchen",
  "bedroom",
  "hallway",
  "nursery",
  "apartment",
] as const;

const STYLES = [
  "modern",
  "scandinavian",
  "loft",
  "minimalism",
  "neoclassic",
  "japandi",
  "classic",
] as const;

const singleRoomArb = fc.constantFrom(...SINGLE_ROOMS);
const styleArb = fc.constantFrom(...STYLES);

// A nanoid: 6–8 lowercase alphanumerics.
const nanoidArb = fc
  .array(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
    { minLength: 6, maxLength: 8 },
  )
  .map((xs) => xs.join(""));

// "Junk" tokens: lowercase-alphanumeric but deliberately the WRONG length to be
// a nanoid (1–5 or 9–14 chars) so a 3+ token segment ending in one is NOT a
// design slug. Kept dash-free so it survives `split("-")` as a single token.
const nonNanoidTokenArb = fc.oneof(
  fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
      minLength: 1,
      maxLength: 5,
    })
    .map((xs) => xs.join("")),
  fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
      minLength: 9,
      maxLength: 14,
    })
    .map((xs) => xs.join("")),
);

// A broad token pool mixing every interesting shape: valid rooms/styles, the
// `living`/`room` parts, nanoid-shaped tokens, and junk. Used to drive the
// determinism + design-predicate properties across the whole input space.
const richTokenArb = fc.oneof(
  singleRoomArb,
  styleArb,
  fc.constant("living"),
  fc.constant("room"),
  nanoidArb,
  nonNanoidTokenArb,
);

const richSegmentArb = fc
  .array(richTokenArb, { minLength: 1, maxLength: 6 })
  .map((tokens) => tokens.join("-"));

// =========================================================================
// Property 15.1 — determinism & total classification over the whole space
// =========================================================================
describe("parseRoute — Property 15.1: deterministic, total classification", () => {
  // Validates: Requirements 9.6, 10.4

  it("is a pure function: identical input → deep-equal output (any string)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (segment) => {
        assert.deepEqual(parseRoute(segment), parseRoute(segment));
      }),
      { numRuns: 200 },
    );
  });

  it("is deterministic over structured slug-like inputs too", () => {
    fc.assert(
      fc.property(richSegmentArb, (segment) => {
        assert.deepEqual(parseRoute(segment), parseRoute(segment));
      }),
      { numRuns: 200 },
    );
  });

  it("always returns null or a {design|aggregate} result — never anything else", () => {
    fc.assert(
      fc.property(richSegmentArb, (segment) => {
        const r = parseRoute(segment);
        if (r === null) return;
        assert.ok(
          r.kind === "design" || r.kind === "aggregate",
          `unexpected kind: ${JSON.stringify(r)}`,
        );
        if (r.kind === "design") {
          assert.equal(typeof r.slug, "string");
          assert.equal(r.slug, segment, "design slug must equal the input segment");
        } else {
          // aggregate: at least one of room/style is set
          assert.ok(
            r.room !== undefined || r.style !== undefined,
            `aggregate must carry a room or style: ${JSON.stringify(r)}`,
          );
        }
      }),
      { numRuns: 300 },
    );
  });
});

// =========================================================================
// Property 15.2 — the design-slug predicate is exactly the documented rule
// =========================================================================
describe("parseRoute — Property 15.2: design ⟺ (>=3 tokens AND last is a nanoid)", () => {
  // Validates: Requirements 9.6, 10.4
  //
  // This is the crisp, short-circuiting half of the contract: the result is a
  // "design" route IFF the segment has >=3 dash tokens and its last token has
  // the nanoid shape — regardless of whether the earlier tokens form a valid
  // room/style. Asserting both directions pins the disambiguation precisely.

  it("classifies as design exactly when the implemented predicate holds (broad inputs)", () => {
    fc.assert(
      fc.property(richSegmentArb, (segment) => {
        const isDesign = parseRoute(segment)?.kind === "design";
        assert.equal(
          isDesign,
          isDesignSegment(segment),
          `design-classification mismatch for ${JSON.stringify(segment)}`,
        );
      }),
      { numRuns: 400 },
    );
  });

  it("holds for arbitrary raw strings as well", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (segment) => {
        const isDesign = parseRoute(segment)?.kind === "design";
        assert.equal(isDesign, isDesignSegment(segment));
      }),
      { numRuns: 300 },
    );
  });
});

// =========================================================================
// Property 15.3 — valid full design slugs → { kind: "design", slug }
// =========================================================================
describe("parseRoute — Property 15.3: well-formed design slugs classify as design", () => {
  // Validates: Requirements 9.6

  // `{room}-{style}-{nanoid}`. With a single-word room this is exactly 3 tokens;
  // with the `living-room` two-word room it is 4 — both >= 3 with a nanoid tail.
  const roomPartArb = fc.oneof(singleRoomArb, fc.constant("living-room"));

  const designSlugArb = fc
    .tuple(roomPartArb, styleArb, nanoidArb)
    .map(([room, style, id]) => `${room}-${style}-${id}`);

  it("returns { kind: 'design', slug: <segment> } and round-trips the slug", () => {
    fc.assert(
      fc.property(designSlugArb, (segment) => {
        const r = parseRoute(segment);
        assert.ok(r, `expected a route for ${JSON.stringify(segment)}`);
        assert.equal(r.kind, "design");
        assert.equal(r.slug, segment);
        assert.equal(r.room, undefined, "design route carries no room");
        assert.equal(r.style, undefined, "design route carries no style");
      }),
      { numRuns: 200 },
    );
  });
});

// =========================================================================
// Property 15.4 — valid aggregate combos (that do NOT trip the design rule)
// =========================================================================
describe("parseRoute — Property 15.4: aggregate combos classify as aggregate", () => {
  // Validates: Requirements 10.4

  it("single valid room → aggregate { room: normalized, style: undefined }", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SINGLE_ROOMS, "living-room"), (room) => {
        const r = parseRoute(room);
        assert.ok(r, `expected aggregate for ${room}`);
        assert.equal(r.kind, "aggregate");
        assert.equal(r.room, normalizeRoom(room));
        assert.equal(r.style, undefined);
      }),
      { numRuns: 100 },
    );
  });

  it("single valid style → aggregate { style, room: undefined }", () => {
    fc.assert(
      fc.property(styleArb, (style) => {
        // A lone style is always 1 token, so it can never trip the design rule.
        const r = parseRoute(style);
        assert.ok(r, `expected aggregate for ${style}`);
        assert.equal(r.kind, "aggregate");
        assert.equal(r.style, style);
        assert.equal(r.room, undefined);
      }),
      { numRuns: 100 },
    );
  });

  it("`{singleRoom}-{style}` (2 tokens) → aggregate { room, style }", () => {
    fc.assert(
      fc.property(singleRoomArb, styleArb, (room, style) => {
        const r = parseRoute(`${room}-${style}`);
        assert.ok(r, `expected aggregate for ${room}-${style}`);
        assert.equal(r.kind, "aggregate");
        assert.equal(r.room, normalizeRoom(room));
        assert.equal(r.style, style);
      }),
      { numRuns: 100 },
    );
  });

  it("`{style}-{singleRoom}` (reversed, 2 tokens) → aggregate { room, style }", () => {
    fc.assert(
      fc.property(singleRoomArb, styleArb, (room, style) => {
        const r = parseRoute(`${style}-${room}`);
        assert.ok(r, `expected aggregate for ${style}-${room}`);
        assert.equal(r.kind, "aggregate");
        assert.equal(r.room, normalizeRoom(room));
        assert.equal(r.style, style);
      }),
      { numRuns: 100 },
    );
  });

  // `living-room` is two tokens, so `living-room-{style}` is 3 tokens. It only
  // resolves to an aggregate when the style is NOT nanoid-shaped (length ∉
  // [6,8]); otherwise the design rule wins (covered in 15.5). Constrain the
  // style generator to the non-nanoid-length styles here.
  const nonNanoidStyleArb = fc.constantFrom(
    ...STYLES.filter((s) => s.length < 6 || s.length > 8),
  );

  it("`living-room-{nonNanoidStyle}` → aggregate { room: living_room, style }", () => {
    fc.assert(
      fc.property(nonNanoidStyleArb, (style) => {
        const segment = `living-room-${style}`;
        const r = parseRoute(segment);
        assert.ok(r, `expected aggregate for ${segment}`);
        assert.equal(r.kind, "aggregate");
        assert.equal(r.room, "living_room");
        assert.equal(r.style, style);
      }),
      { numRuns: 100 },
    );
  });
});

// =========================================================================
// Property 15.5 — KNOWN 3-segment behavior (documented quirk)
// =========================================================================
describe("parseRoute — Property 15.5: known 3-token nanoid-shaped tail wins as design", () => {
  // Validates: Requirements 9.6 (disambiguation contract)
  //
  // A 3-token aggregate-looking combo whose final token has the nanoid shape is
  // classified as DESIGN, not aggregate — because the design rule is checked
  // first and short-circuits. This asserts the ACTUAL implemented contract.

  const nanoidLengthStyleArb = fc.constantFrom(
    ...STYLES.filter((s) => s.length >= 6 && s.length <= 8),
  );

  it("e.g. `living-room-modern` classifies as design (NOT aggregate)", () => {
    const r = parseRoute("living-room-modern");
    assert.ok(r);
    assert.equal(r.kind, "design", "`living-room-modern` must be a design slug per the implemented rule");
    assert.equal(r.slug, "living-room-modern");
  });

  it("`living-room-{style}` is design whenever the style is nanoid-shaped (len 6–8)", () => {
    fc.assert(
      fc.property(nanoidLengthStyleArb, (style) => {
        const segment = `living-room-${style}`;
        const r = parseRoute(segment);
        assert.ok(r);
        assert.equal(
          r.kind,
          "design",
          `${segment}: nanoid-shaped tail must win as design`,
        );
        assert.equal(r.slug, segment);
      }),
      { numRuns: 100 },
    );
  });
});

// =========================================================================
// Property 15.6 — junk segments → null (→ 404 + noindex)
// =========================================================================
describe("parseRoute — Property 15.6: unrecognised segments classify as null", () => {
  // Validates: Requirements 10.4
  //
  // Build segments from tokens that are neither valid rooms/styles nor able to
  // trip the design rule. We keep them to 1–2 tokens of junk (so length < 3,
  // never design) and ensure no token is a valid room/style and the pair is not
  // a recognised room/style combo.

  const junkTokenArb = nonNanoidTokenArb.filter(
    (t) =>
      !VALID_ROOMS.has(t) &&
      !VALID_STYLES.has(t) &&
      t !== "living" &&
      t !== "room",
  );

  it("a single junk token → null", () => {
    fc.assert(
      fc.property(junkTokenArb, (t) => {
        // length 1, not a known room/style → unrecognised
        assert.equal(parseRoute(t), null, `expected null for ${JSON.stringify(t)}`);
      }),
      { numRuns: 200 },
    );
  });

  it("two junk tokens that form no known combo → null", () => {
    fc.assert(
      fc.property(junkTokenArb, junkTokenArb, (a, b) => {
        // 2 tokens, neither valid, and `a-b` is not a two-word room
        // (`living-room`); also exclude the literal living/room parts already
        // filtered out. So this is always unrecognised.
        fc.pre(!VALID_ROOMS.has(`${a}-${b}`));
        assert.equal(
          parseRoute(`${a}-${b}`),
          null,
          `expected null for ${JSON.stringify(`${a}-${b}`)}`,
        );
      }),
      { numRuns: 200 },
    );
  });
});
