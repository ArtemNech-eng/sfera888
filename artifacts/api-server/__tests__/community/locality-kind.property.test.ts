// Feature: community-generalized-locality, Property 1: Locality kind resolution
/**
 * Property test for Locality kind resolution (Community Generalized Locality,
 * Стадия 2).
 *
 * Property 1: *For any* create request, the resolved kind SHALL equal the
 *             explicitly supplied kind when it is one of
 *             `zhk`/`district`/`settlement`, SHALL equal `zhk` when kind is
 *             absent or null, and the request SHALL be rejected without
 *             persisting any record when kind is any value outside that set.
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 9.6**
 *
 * Module under test (`src/lib/geoService.ts`):
 *   - `validateLocalityKind(kind: unknown): kind is LocalityKind`
 *       — pure type guard, `true` iff `kind` ∈ {zhk, district, settlement}.
 *   - `resolveLocalityKind(kind: unknown): LocalityKind | null`
 *       — pure resolver: valid kind → itself; `undefined`/`null` → `"zhk"`
 *         (`DEFAULT_LOCALITY_KIND`); any other value → `null` (the caller
 *         rejects creation without persisting a record, Requirement 1.5).
 *
 * Both functions are pure and deterministic; no database is touched. The
 * "reject without persistence" clause of Requirement 1.5 is modelled at the
 * resolver level: a `null` resolution is the exact signal the route/service
 * layer uses to abort creation before any INSERT. This property asserts that
 * `resolveLocalityKind` returns `null` for every invalid value, so no persist
 * path is ever reached for an invalid kind.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/locality-kind.property.test.ts
 */

// `geoService.ts` statically imports `@workspace/db`, which instantiates a
// pg.Pool at module-load time and throws when `DATABASE_URL` is unset. pg.Pool
// does not connect lazily, so a fake connection string is enough — no property
// here performs a real query (both functions under test are pure).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Dynamic import with a `.js` extension guarantees the `DATABASE_URL`
// assignment above runs BEFORE `@workspace/db` is loaded.
const geoService = await import("../../src/lib/geoService.js");
const { validateLocalityKind, resolveLocalityKind } = geoService;

// The valid Locality_Kind set (Requirement 1.2). Kept local to the test so a
// regression in the production constant cannot silently satisfy the test.
const VALID_KINDS = ["zhk", "district", "settlement"] as const;
const DEFAULT_KIND = "zhk";

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Any one of the valid kinds. */
const validKindArb = fc.constantFrom(...VALID_KINDS);

/** Absent/null inputs → must resolve to the default `"zhk"` (Requirement 1.4). */
const nullishArb = fc.constantFrom(undefined, null);

/**
 * Arbitrary strings that are NOT one of the valid kinds. Includes near-misses
 * (case variants, surrounding whitespace, plural/partial forms) which are the
 * likeliest real-world invalid inputs, plus fully arbitrary strings.
 */
const invalidStringArb = fc
  .oneof(
    fc.string(),
    fc.constantFrom(
      "",
      " ",
      "ZHK",
      "Zhk",
      "DISTRICT",
      "Settlement",
      " zhk",
      "zhk ",
      "zhk\n",
      "districts",
      "settlements",
      "zh k",
      "village",
      "city",
      "жк",
      "район",
    ),
  )
  .filter((s) => !(VALID_KINDS as readonly string[]).includes(s));

/**
 * Non-string values that exercise the `unknown` input contract: numbers,
 * booleans, objects, arrays, symbols. All must be treated as invalid — the
 * type guard is `false` and the resolver returns `null`.
 */
const nonStringArb = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.object(),
  fc.array(fc.string()),
  fc.constantFrom(NaN, Infinity, -Infinity, 0, {}, [], () => {}),
);

// ─── Property 1.a — valid kinds resolve to themselves ────────────────────────

describe("Locality kind — Property 1: resolution of valid kinds", () => {
  // Validates: Requirements 1.2, 1.3

  it("resolveLocalityKind(kind) === kind and validateLocalityKind(kind) is true for every valid kind", () => {
    fc.assert(
      fc.property(validKindArb, (kind) => {
        assert.equal(
          resolveLocalityKind(kind),
          kind,
          `valid kind ${JSON.stringify(kind)} must resolve to itself`,
        );
        assert.equal(
          validateLocalityKind(kind),
          true,
          `validateLocalityKind(${JSON.stringify(kind)}) must be true`,
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 1.b — nullish resolves to the default zhk ──────────────────────

describe("Locality kind — Property 1: null/undefined default to zhk", () => {
  // Validates: Requirements 1.4, 9.6

  it("resolveLocalityKind(undefined|null) === 'zhk' and it is not a valid explicit kind", () => {
    fc.assert(
      fc.property(nullishArb, (kind) => {
        assert.equal(
          resolveLocalityKind(kind),
          DEFAULT_KIND,
          `absent/null kind must resolve to default ${JSON.stringify(DEFAULT_KIND)}`,
        );
        // A nullish value is not itself a member of the valid set.
        assert.equal(
          validateLocalityKind(kind),
          false,
          `validateLocalityKind(${JSON.stringify(kind)}) must be false`,
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 1.c — invalid values reject (null) without persistence ─────────

describe("Locality kind — Property 1: invalid values are rejected", () => {
  // Validates: Requirement 1.5

  it("resolveLocalityKind returns null and validateLocalityKind is false for invalid strings", () => {
    fc.assert(
      fc.property(invalidStringArb, (kind) => {
        // null resolution is the signal the caller uses to reject creation
        // BEFORE any persistence (Requirement 1.5).
        assert.equal(
          resolveLocalityKind(kind),
          null,
          `invalid kind ${JSON.stringify(kind)} must resolve to null`,
        );
        assert.equal(
          validateLocalityKind(kind),
          false,
          `validateLocalityKind(${JSON.stringify(kind)}) must be false`,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("resolveLocalityKind returns null and validateLocalityKind is false for non-string values", () => {
    fc.assert(
      fc.property(nonStringArb, (kind) => {
        assert.equal(
          resolveLocalityKind(kind),
          null,
          `non-string kind ${JSON.stringify(kind)} must resolve to null`,
        );
        assert.equal(
          validateLocalityKind(kind),
          false,
          `validateLocalityKind(${JSON.stringify(kind)}) must be false`,
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 1.d — total resolution contract across the whole input space ───

describe("Locality kind — Property 1: total resolution contract", () => {
  // Validates: Requirements 1.2, 1.3, 1.4, 1.5, 9.6
  //
  // Over a mixed stream covering every input category, resolveLocalityKind is
  // total and consistent with validateLocalityKind: it returns exactly one of
  // {the valid kind itself, "zhk" for nullish, null for invalid}, and its
  // result is non-null iff (kind is valid OR kind is nullish).

  const anyInputArb = fc.oneof(
    validKindArb,
    nullishArb,
    invalidStringArb,
    nonStringArb,
  );

  it("result is always one of the valid kinds or null, consistent with the guard", () => {
    fc.assert(
      fc.property(anyInputArb, (kind) => {
        const resolved = resolveLocalityKind(kind);
        const isNullish = kind === undefined || kind === null;
        const isValid = validateLocalityKind(kind);

        if (resolved === null) {
          // null resolution ⇒ neither a valid kind nor nullish ⇒ no persist.
          assert.equal(isValid, false);
          assert.equal(isNullish, false);
        } else {
          // Non-null resolution is always a member of the valid set.
          assert.ok(
            (VALID_KINDS as readonly string[]).includes(resolved),
            `resolved value ${JSON.stringify(resolved)} must be a valid kind`,
          );
          if (isNullish) {
            assert.equal(resolved, DEFAULT_KIND);
          } else {
            assert.equal(resolved, kind);
            assert.equal(isValid, true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
