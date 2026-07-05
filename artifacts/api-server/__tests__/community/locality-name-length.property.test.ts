// Feature: community-generalized-locality, Property 5: Name length validation boundary
/**
 * Property test for Locality name-length validation boundary (Community
 * Generalized Locality, Стадия 2).
 *
 * Property 5: *For any* name string, creation SHALL be accepted with respect to
 *             length if and only if the trimmed length is between 2 and 100
 *             inclusive; otherwise it SHALL be rejected without persisting any
 *             record.
 *
 * **Validates: Requirements 4.6**
 *
 * Module under test (`src/lib/geoService.ts`):
 *   - `validateZhkName(name): boolean`
 *       — pure length gate: `true` iff `name` is a string whose trimmed length
 *         ∈ [2, 100]. This is the exact predicate `createLocality` consults
 *         before any persistence; when it returns `false`, creation is rejected
 *         with `rejected/invalid_name` and no record is inserted (Requirement
 *         4.6). Asserting the gate therefore asserts the persistence decision
 *         it drives — no faked assertions, no database required.
 *
 * The function is pure and deterministic; no database is touched. As with the
 * sibling pure tests, `geoService.ts` statically imports `@workspace/db`, which
 * instantiates a pg.Pool at module-load time and throws when `DATABASE_URL` is
 * unset. pg.Pool does not connect lazily, so a fake connection string set
 * BEFORE the dynamic `.js` import is enough.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/locality-name-length.property.test.ts
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Dynamic import with a `.js` extension guarantees the `DATABASE_URL`
// assignment above runs BEFORE `@workspace/db` is loaded.
const geoService = await import("../../src/lib/geoService.js");
const { validateZhkName } = geoService;

// Boundary constants kept local to the test so a regression in the production
// constants cannot silently satisfy the test (Requirement 4.6).
const MIN_LEN = 2;
const MAX_LEN = 100;

/** The oracle: accept iff `name` is a string whose trimmed length ∈ [2, 100]. */
function shouldAccept(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const len = name.trim().length;
  return len >= MIN_LEN && len <= MAX_LEN;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * A string whose *trimmed* length is exactly `len`, built from a mix of
 * non-whitespace characters (Latin, Cyrillic, digits, punctuation). For len 0
 * this yields the empty core.
 */
function coreOfLength(len: number): fc.Arbitrary<string> {
  const nonWs = fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzАБВГДЕабвгде0123456789-_!.".split(""),
  );
  if (len === 0) return fc.constant("");
  return fc.array(nonWs, { minLength: len, maxLength: len }).map((a) => a.join(""));
}

/** Whitespace padding drawn from several real whitespace characters. */
const paddingArb = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\u00a0"), {
    minLength: 0,
    maxLength: 6,
  })
  .map((a) => a.join(""));

/** A name whose trimmed length is exactly `len`, wrapped in random padding. */
function paddedNameOfTrimmedLength(len: number): fc.Arbitrary<string> {
  return fc
    .tuple(paddingArb, coreOfLength(len), paddingArb)
    .map(([pre, core, post]) => pre + core + post);
}

/** The critical boundary trimmed lengths: 0, 1, 2, 99, 100, 101. */
const boundaryLenArb = fc.constantFrom(0, 1, MIN_LEN - 1, MIN_LEN, MAX_LEN - 1, MAX_LEN, MAX_LEN + 1);

/** Whitespace-only strings (trimmed length 0 → must be rejected). */
const whitespaceOnlyArb = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\u00a0"), {
    minLength: 0,
    maxLength: 10,
  })
  .map((a) => a.join(""));

/** Arbitrary trimmed length across and beyond the whole accepted range. */
const anyTrimmedLenArb = fc.integer({ min: 0, max: 130 });

// ─── Property 5.a — boundary trimmed lengths ─────────────────────────────────

describe("Name length — Property 5: boundary trimmed lengths", () => {
  // Validates: Requirement 4.6

  it("accepts iff trimmed length ∈ [2,100] at the 0/1/2/99/100/101 boundaries", () => {
    fc.assert(
      fc.property(boundaryLenArb, (len) => {
        return fc.assert(
          fc.property(paddedNameOfTrimmedLength(len), (name) => {
            const expected = len >= MIN_LEN && len <= MAX_LEN;
            assert.equal(
              validateZhkName(name),
              expected,
              `trimmed length ${len} (name=${JSON.stringify(name)}) must ${
                expected ? "accept" : "reject"
              }`,
            );
          }),
          { numRuns: 25 },
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5.b — whitespace-only strings are rejected ─────────────────────

describe("Name length — Property 5: whitespace-only strings", () => {
  // Validates: Requirement 4.6

  it("rejects whitespace-only names (trimmed length 0 < 2)", () => {
    fc.assert(
      fc.property(whitespaceOnlyArb, (name) => {
        assert.equal(
          validateZhkName(name),
          false,
          `whitespace-only name ${JSON.stringify(name)} must be rejected`,
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 5.c — the general biconditional over arbitrary padded names ────

describe("Name length — Property 5: accept iff trimmed length ∈ [2,100]", () => {
  // Validates: Requirement 4.6

  it("agrees with the trimmed-length oracle for arbitrary padded names", () => {
    fc.assert(
      fc.property(
        anyTrimmedLenArb.chain((len) => paddedNameOfTrimmedLength(len)),
        (name) => {
          assert.equal(
            validateZhkName(name),
            shouldAccept(name),
            `validateZhkName(${JSON.stringify(name)}) must match the oracle`,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("agrees with the oracle for fully arbitrary strings incl. Cyrillic and whitespace", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 130 }), (name) => {
        assert.equal(validateZhkName(name), shouldAccept(name));
      }),
      { numRuns: 300 },
    );
  });
});
