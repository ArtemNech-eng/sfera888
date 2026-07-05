// Feature: community-generalized-locality, Property 3: Attribute shaping shows only filled attributes
/**
 * Property test for Locality attribute shaping (Community Generalized Locality,
 * Стадия 2).
 *
 * Property 3: *For any* Locality_Record, the Locality_Page DTO SHALL include
 *             exactly those attributes (developer, completionDate, buildings)
 *             whose value is non-null and non-empty after trimming, and SHALL
 *             omit every attribute whose value is null or empty after trimming.
 *             (For `buildings`, "filled" means a non-empty array.)
 *
 * **Validates: Requirements 1.7**
 *
 * Module under test (`src/lib/geoService.ts`):
 *   - `shapeLocalityAttributes(row: Zhk): ZhkView`
 *       — pure, deterministic DTO shaper. Base fields (id/slug/name/cityId/
 *         status) are always present. The optional attributes developer,
 *         completionDate, buildings are included iff filled: a string attribute
 *         is filled iff it is non-empty after `trim()`; `buildings` is filled
 *         iff it is a non-empty array. `shapeZhkAttributes` delegates to it.
 *
 * The function is pure and touches no database. This property drives it with a
 * mix of null / undefined / empty / whitespace-only / non-empty attribute
 * values and asserts the include-iff-filled contract exactly.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/locality-attributes.property.test.ts
 */

// `geoService.ts` statically imports `@workspace/db`, which instantiates a
// pg.Pool at module-load time and throws when `DATABASE_URL` is unset. pg.Pool
// does not connect lazily, so a fake connection string is enough — the function
// under test is pure and performs no query.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { Zhk, ZhkBuilding } from "@workspace/db";

// Dynamic import with a `.js` extension guarantees the `DATABASE_URL`
// assignment above runs BEFORE `@workspace/db` is loaded.
const geoService = await import("../../src/lib/geoService.js");
const { shapeLocalityAttributes } = geoService;

// ─── Oracle ──────────────────────────────────────────────────────────────────

/**
 * A string attribute is "filled" iff it is non-null and non-empty after trim.
 * Kept local so a regression in production `hasText` cannot silently satisfy
 * the test.
 */
function isFilledString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** `buildings` is "filled" iff it is a non-empty array. */
function isFilledBuildings(
  value: ZhkBuilding[] | null | undefined,
): value is ZhkBuilding[] {
  return Array.isArray(value) && value.length > 0;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/**
 * Whitespace-only strings — every one must be treated as EMPTY after trim
 * (spaces, tabs, newlines, mixtures). These are the tricky "looks filled but
 * isn't" cases the property must reject.
 */
const whitespaceOnlyArb = fc.constantFrom(
  " ",
  "  ",
  "   ",
  "\t",
  "\n",
  "\r\n",
  " \t ",
  "\t\n ",
  "\u00a0", // non-breaking space (trimmed by String.prototype.trim)
);

/**
 * Non-empty strings that remain non-empty after trim, INCLUDING variants with
 * surrounding whitespace (which must be stripped in the shaped output).
 */
const nonEmptyStringArb = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim().length > 0)
  .chain((core) =>
    // Optionally wrap the guaranteed-non-empty core in surrounding whitespace.
    fc
      .tuple(
        fc.constantFrom("", " ", "  ", "\t", "\n", " \t"),
        fc.constantFrom("", " ", "  ", "\t", "\n", "\t "),
      )
      .map(([lead, trail]) => `${lead}${core}${trail}`),
  );

/**
 * Full input space for a string attribute (developer / completionDate):
 * null, undefined, "", whitespace-only, and non-empty (incl. padded).
 */
const stringAttrArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(""),
  whitespaceOnlyArb,
  nonEmptyStringArb,
);

/** A single building record (arbitrary shape; only array-ness/length matter). */
const buildingArb: fc.Arbitrary<ZhkBuilding> = fc.record({
  name: fc.string(),
  completionDate: fc.option(fc.string(), { nil: null }),
});

/**
 * Full input space for `buildings`: null, undefined, [] (empty), and non-empty
 * arrays.
 */
const buildingsAttrArb: fc.Arbitrary<ZhkBuilding[] | null | undefined> =
  fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.constant<ZhkBuilding[]>([]),
    fc.array(buildingArb, { minLength: 1, maxLength: 5 }),
  );

/**
 * Build a plausible `Zhk` row. Only the fields read by
 * `shapeLocalityAttributes` (id/slug/name/cityId/status + the three attributes)
 * affect the output; the remaining columns are filled with valid defaults so
 * the object is a faithful row shape.
 */
function makeRow(overrides: {
  developer: string | null | undefined;
  completionDate: string | null | undefined;
  buildings: ZhkBuilding[] | null | undefined;
}): Zhk {
  const row = {
    id: 1,
    slug: "example-locality",
    name: "Example Locality",
    nameNormalized: "example locality",
    cityId: 7,
    kind: "zhk",
    developer: overrides.developer ?? null,
    completionDate: overrides.completionDate ?? null,
    buildings: overrides.buildings ?? null,
    status: "NON_LIVING",
    isSeeded: false,
    contentScore: 0,
    isIndexable: false,
    createdByAccountId: null,
    seoTitle: null,
    seoDescription: null,
    h1: null,
    bodyMd: null,
    createdAt: new Date(),
  };
  return row as unknown as Zhk;
}

// ─── Property 3.a — developer / completionDate include-iff-filled ────────────

describe("Attribute shaping — Property 3: string attributes shown only when filled", () => {
  // Validates: Requirement 1.7

  it("includes developer/completionDate iff non-empty after trim, in trimmed form", () => {
    fc.assert(
      fc.property(
        stringAttrArb,
        stringAttrArb,
        buildingsAttrArb,
        (developer, completionDate, buildings) => {
          const view = shapeLocalityAttributes(
            makeRow({ developer, completionDate, buildings }),
          );

          // developer
          if (isFilledString(developer)) {
            assert.equal(
              "developer" in view,
              true,
              `developer ${JSON.stringify(developer)} is filled → must appear`,
            );
            assert.equal(
              view.developer,
              developer.trim(),
              "developer must be stored trimmed",
            );
          } else {
            assert.equal(
              "developer" in view,
              false,
              `developer ${JSON.stringify(developer)} is empty → must be omitted`,
            );
          }

          // completionDate
          if (isFilledString(completionDate)) {
            assert.equal(
              "completionDate" in view,
              true,
              `completionDate ${JSON.stringify(completionDate)} is filled → must appear`,
            );
            assert.equal(
              view.completionDate,
              completionDate.trim(),
              "completionDate must be stored trimmed",
            );
          } else {
            assert.equal(
              "completionDate" in view,
              false,
              `completionDate ${JSON.stringify(completionDate)} is empty → must be omitted`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3.b — buildings include-iff-non-empty-array ────────────────────

describe("Attribute shaping — Property 3: buildings shown only when non-empty array", () => {
  // Validates: Requirement 1.7

  it("includes buildings iff it is a non-empty array, preserving its contents", () => {
    fc.assert(
      fc.property(
        stringAttrArb,
        stringAttrArb,
        buildingsAttrArb,
        (developer, completionDate, buildings) => {
          const view = shapeLocalityAttributes(
            makeRow({ developer, completionDate, buildings }),
          );

          if (isFilledBuildings(buildings)) {
            assert.equal(
              "buildings" in view,
              true,
              "non-empty buildings array must appear",
            );
            assert.deepEqual(
              view.buildings,
              buildings,
              "buildings must be preserved unchanged",
            );
          } else {
            assert.equal(
              "buildings" in view,
              false,
              `buildings ${JSON.stringify(buildings)} is empty/null → must be omitted`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3.c — base fields always present; no extra attribute keys ──────

describe("Attribute shaping — Property 3: exact key set", () => {
  // Validates: Requirement 1.7
  //
  // The shaped DTO always carries the base fields and carries an optional
  // attribute key IFF that attribute is filled — never more, never fewer.

  const BASE_KEYS = ["id", "slug", "name", "cityId", "status"] as const;

  it("keys(view) == base fields ∪ exactly the filled attributes", () => {
    fc.assert(
      fc.property(
        stringAttrArb,
        stringAttrArb,
        buildingsAttrArb,
        (developer, completionDate, buildings) => {
          const view = shapeLocalityAttributes(
            makeRow({ developer, completionDate, buildings }),
          );

          const expected = new Set<string>(BASE_KEYS);
          if (isFilledString(developer)) expected.add("developer");
          if (isFilledString(completionDate)) expected.add("completionDate");
          if (isFilledBuildings(buildings)) expected.add("buildings");

          const actual = new Set(Object.keys(view));
          assert.deepEqual(
            [...actual].sort(),
            [...expected].sort(),
            "shaped DTO key set must equal base ∪ filled attributes",
          );

          // Base fields must carry through unchanged.
          assert.equal(view.id, 1);
          assert.equal(view.slug, "example-locality");
          assert.equal(view.name, "Example Locality");
          assert.equal(view.cityId, 7);
          assert.equal(view.status, "NON_LIVING");
        },
      ),
      { numRuns: 100 },
    );
  });
});
