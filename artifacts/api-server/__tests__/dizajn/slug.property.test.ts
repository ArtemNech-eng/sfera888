/**
 * Property test for `slug.ts` (Slug_Generation).
 *
 * Property 23: Slug generation is well-formed and unique.
 *
 * **Validates: Requirements 1.8, 1.9**
 *
 * Module under test:
 *   - `slugify(input: string): string`
 *   - `buildDesignSlugBase(input: DesignSlugInput): string`
 *   - `pickUniqueSlug(base, isTaken, maxLen?, maxAttempts?)` (callback overload)
 *
 * The object overload of `pickUniqueSlug({ roomType, style, … })` hits the DB
 * (via `db.select(...).from(designsTable)…`); the well-formedness invariants
 * it relies on are already covered by exercising the pure
 * `buildDesignSlugBase` here, so we deliberately skip the DB-mocked variant
 * (Property 23.5) — its only additional contract is "does the SELECT loop
 * terminate", which is exactly what the callback overload verifies in
 * Property 23.4 below.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

// `@workspace/db` (imported transitively by `slug.ts` for the object-overload
// DB lookup) requires DATABASE_URL at module load time. The pg.Pool does not
// connect eagerly, so a fake connection string is enough — none of the
// properties in this file actually run a query.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

const slugModule = await import("../../src/lib/slug.ts");
const { slugify, buildDesignSlugBase, pickUniqueSlug } = slugModule;
type DesignSlugInput = import("../../src/lib/slug.ts").DesignSlugInput;

// ─── Constants ────────────────────────────────────────────────────────────

/** Must match `DESIGN_SLUG_MAX_LEN` in `slug.ts`. */
const DESIGN_SLUG_MAX_LEN = 160;

const ROOM_TYPES = [
  "bedroom",
  "kitchen",
  "bathroom",
  "living_room",
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

const SLUG_VALID_RE = /^[a-z0-9-]+$/;
const SLUG_VALID_OR_EMPTY_RE = /^[a-z0-9-]*$/;

// ─── Arbitraries ──────────────────────────────────────────────────────────

const cyrillicCharArb = fc.constantFrom(
  "а", "б", "в", "г", "д", "е", "ё", "ж", "з", "и", "й", "к", "л", "м",
  "н", "о", "п", "р", "с", "т", "у", "ф", "х", "ц", "ч", "ш", "щ", "ъ",
  "ы", "ь", "э", "ю", "я",
);

const cyrillicWordArb = fc
  .array(cyrillicCharArb, { minLength: 1, maxLength: 20 })
  .map((xs) => xs.join(""));

const mixedStringArb = fc.string({ maxLength: 50 });

const roomTypeArb = fc.constantFrom(...ROOM_TYPES);
const styleArb = fc.constantFrom(...STYLES);

const extraSegmentArb = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.constant(null),
  fc.constant(undefined),
  fc.integer({ min: 1, max: 999 }),
);

const designSlugInputArb: fc.Arbitrary<DesignSlugInput> = fc.record({
  roomType: roomTypeArb,
  style: styleArb,
  extraSegments: fc.array(extraSegmentArb, { maxLength: 5 }),
});

// =========================================================================
// Property 23.1 — `slugify` invariants (pure)
// =========================================================================

describe("slugify — Property 23.1: pure-function invariants", () => {
  // Validates: Requirements 1.8

  it("output matches /^[a-z0-9-]*$/ for any input", () => {
    fc.assert(
      fc.property(mixedStringArb, (input) => {
        const out = slugify(input);
        assert.ok(
          SLUG_VALID_OR_EMPTY_RE.test(out),
          `slugify(${JSON.stringify(input)}) = ${JSON.stringify(out)} must match ^[a-z0-9-]*$`,
        );
      }),
    );
  });

  it("for all-Cyrillic input output is pure latin alphanumeric (no dashes)", () => {
    fc.assert(
      fc.property(cyrillicWordArb, (input) => {
        const out = slugify(input);
        // After transliteration, every Cyrillic letter maps to latin letters
        // or empty (`ъ`, `ь`); none introduce a dash. The slugify trim then
        // removes any incidental leading/trailing dashes that did not exist.
        assert.ok(
          /^[a-z0-9]*$/.test(out),
          `slugify(${JSON.stringify(input)}) = ${JSON.stringify(out)} must be pure latin alphanumeric`,
        );
      }),
    );
  });

  it("lowercases ASCII input: slugify('ABC') === 'abc'", () => {
    assert.equal(slugify("ABC"), "abc");
    assert.equal(slugify("Hello World"), "hello-world");
  });

  it("returns empty string for empty input", () => {
    assert.equal(slugify(""), "");
  });

  it("is idempotent: slugify(slugify(x)) === slugify(x)", () => {
    fc.assert(
      fc.property(mixedStringArb, (input) => {
        const once = slugify(input);
        const twice = slugify(once);
        assert.equal(twice, once);
      }),
    );
  });
});

// =========================================================================
// Property 23.2 — `buildDesignSlugBase` invariants (pure)
// =========================================================================

describe("buildDesignSlugBase — Property 23.2: well-formedness invariants", () => {
  // Validates: Requirements 1.8

  it("output is non-empty for any valid (roomType, style) pair", () => {
    fc.assert(
      fc.property(designSlugInputArb, (input) => {
        const out = buildDesignSlugBase(input);
        assert.ok(out.length > 0, `expected non-empty slug for ${JSON.stringify(input)}`);
      }),
    );
  });

  it("output matches /^[a-z0-9-]+$/", () => {
    fc.assert(
      fc.property(designSlugInputArb, (input) => {
        const out = buildDesignSlugBase(input);
        assert.ok(
          SLUG_VALID_RE.test(out),
          `buildDesignSlugBase(${JSON.stringify(input)}) = ${JSON.stringify(out)} must match ^[a-z0-9-]+$`,
        );
      }),
    );
  });

  it("output length ≤ DESIGN_SLUG_MAX_LEN (160)", () => {
    fc.assert(
      fc.property(designSlugInputArb, (input) => {
        const out = buildDesignSlugBase(input);
        assert.ok(
          out.length <= DESIGN_SLUG_MAX_LEN,
          `length ${out.length} exceeds ${DESIGN_SLUG_MAX_LEN}`,
        );
      }),
    );
  });

  it("output starts with slugified roomType (with '_' → '-')", () => {
    fc.assert(
      fc.property(designSlugInputArb, (input) => {
        const out = buildDesignSlugBase(input);
        const expectedPrefix = slugify(input.roomType.replace(/_/g, "-"));
        assert.ok(
          out.startsWith(expectedPrefix),
          `expected ${JSON.stringify(out)} to start with ${JSON.stringify(expectedPrefix)}`,
        );
      }),
    );
  });

  it("output contains the slugified style", () => {
    fc.assert(
      fc.property(designSlugInputArb, (input) => {
        const out = buildDesignSlugBase(input);
        const styleSlug = slugify(input.style);
        assert.ok(
          out.includes(styleSlug),
          `expected ${JSON.stringify(out)} to contain style ${JSON.stringify(styleSlug)}`,
        );
      }),
    );
  });

  it("output never has leading or trailing '-'", () => {
    fc.assert(
      fc.property(designSlugInputArb, (input) => {
        const out = buildDesignSlugBase(input);
        assert.ok(!out.startsWith("-"), `slug ${JSON.stringify(out)} has leading '-'`);
        assert.ok(!out.endsWith("-"), `slug ${JSON.stringify(out)} has trailing '-'`);
      }),
    );
  });

  it("output never contains '--'", () => {
    fc.assert(
      fc.property(designSlugInputArb, (input) => {
        const out = buildDesignSlugBase(input);
        assert.ok(!out.includes("--"), `slug ${JSON.stringify(out)} contains '--'`);
      }),
    );
  });

  it("null/undefined/empty extraSegments are filtered (no spurious '--')", () => {
    // Direct examples — also covered statistically by the property above,
    // but worth pinning explicitly because this is the most likely
    // regression: forgetting to filter empty segments before joining.
    const out = buildDesignSlugBase({
      roomType: "bedroom",
      style: "modern",
      extraSegments: [null, undefined, "", "  ", "moscow", null, ""],
    });
    assert.ok(SLUG_VALID_RE.test(out), `expected valid slug, got ${JSON.stringify(out)}`);
    assert.ok(!out.includes("--"));
    assert.ok(out.startsWith("bedroom"));
    assert.ok(out.includes("modern"));
    assert.ok(out.includes("moscow"));
  });
});

// =========================================================================
// Property 23.3 — `pickUniqueSlug` callback overload (pure with provided isTaken)
// =========================================================================

describe("pickUniqueSlug callback — Property 23.3: collision-resolution contract", () => {
  // Validates: Requirements 1.9

  it("when isTaken = () => false (no collisions) → result === base", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/),
        async (base) => {
          const result = await pickUniqueSlug(base, async () => false);
          assert.equal(result, base);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("when only `base` is taken → result === `${base}-2`", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/),
        async (base) => {
          const result = await pickUniqueSlug(
            base,
            async (s) => s === base,
          );
          assert.equal(result, `${base}-2`);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("when `base` and `${base}-2` are taken → result === `${base}-3`", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/),
        async (base) => {
          const result = await pickUniqueSlug(
            base,
            async (s) => s === base || s === `${base}-2`,
          );
          assert.equal(result, `${base}-3`);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("when isTaken = () => true → throws after maxAttempts", async () => {
    await assert.rejects(
      () => pickUniqueSlug("foo", async () => true, 100, 5),
      /could not find unique slug/i,
    );
  });
});

// =========================================================================
// Property 23.4 — Uniqueness with stateful collision tracking
// =========================================================================

describe("pickUniqueSlug callback — Property 23.4: stateful uniqueness", () => {
  // Validates: Requirements 1.9
  //
  // Simulate calling `pickUniqueSlug` N times against an in-memory "taken"
  // set; each returned slug is added back to the set. After N calls, all
  // returned slugs must be distinct — which is what `designs.slug UNIQUE`
  // is meant to guarantee in production.

  it("after N calls against a growing taken-set, all results are distinct", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/),
        fc.integer({ min: 1, max: 25 }),
        async (base, n) => {
          const taken = new Set<string>();
          const issued: string[] = [];

          for (let i = 0; i < n; i++) {
            const slug = await pickUniqueSlug(
              base,
              async (candidate) => taken.has(candidate),
            );
            assert.ok(!taken.has(slug), `pickUniqueSlug returned an already-taken slug: ${slug}`);
            taken.add(slug);
            issued.push(slug);
          }

          assert.equal(issued.length, n, "should have issued exactly n slugs");
          assert.equal(
            new Set(issued).size,
            n,
            `expected ${n} distinct slugs, got ${new Set(issued).size}`,
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  it("the i-th call (0-indexed) returns base for i=0 and `${base}-${i+1}` for i≥1", async () => {
    // Extra invariant on the suffix sequence: with no external collisions,
    // the function uses a deterministic ascending suffix scheme.
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/),
        fc.integer({ min: 1, max: 10 }),
        async (base, n) => {
          const taken = new Set<string>();
          for (let i = 0; i < n; i++) {
            const slug = await pickUniqueSlug(
              base,
              async (candidate) => taken.has(candidate),
            );
            const expected = i === 0 ? base : `${base}-${i + 1}`;
            assert.equal(slug, expected, `iteration ${i}`);
            taken.add(slug);
          }
        },
      ),
      { numRuns: 15 },
    );
  });
});
