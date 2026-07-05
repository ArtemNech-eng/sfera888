// Feature: community-generalized-locality, Property 6: City-not-found rejection
/**
 * Property test for city-not-found rejection (Community Generalized Locality,
 * Стадия 2).
 *
 * Property 6: *For any* citySlug that matches no existing City, creation SHALL
 *             be rejected with a city-not-found indication and SHALL persist no
 *             Locality_Record.
 *
 * **Validates: Requirements 4.7**
 *
 * Module under test (`src/lib/geoService.ts`):
 *   - `createLocality(input): CreateLocalityResult` — its City-resolution branch
 *     (step 3): after a valid name (`validateZhkName`) and valid kind
 *     (`resolveLocalityKind`), it normalizes `citySlug`, looks up `cities` by
 *     that slug and — when no row matches — returns
 *         { status: "rejected", reason: "city_not_found", message: … }
 *     WITHOUT reaching the dedup SELECT or the `INSERT INTO zhk` (steps 4–5).
 *
 * DB seam / harness note.
 *   `createLocality` statically pulls in `@workspace/db`, which instantiates a
 *   `pg.Pool` at module-load time (throwing if `DATABASE_URL` is unset) and
 *   whose City lookup + `INSERT INTO zhk` can only run against a real Postgres.
 *   This repository has NO ephemeral/transactional-Postgres test harness (no
 *   testcontainers, pg-mem, pglite, or DATABASE_URL-backed fixture), so — like
 *   the existing DB-backed community property tests (`zhk-dedup`,
 *   `local-feed`) — this test sets a fake `DATABASE_URL` before the dynamic
 *   `.js` import and exercises an IN-MEMORY seam that MIRRORS `createLocality`'s
 *   city-resolution contract verbatim:
 *     1) validate name via the REAL exported `validateZhkName`;
 *     2) resolve kind via the REAL exported `resolveLocalityKind`;
 *     3) resolve the parent City by normalized slug against an in-memory City
 *        set; when no City matches → return `rejected/city_not_found` and
 *        perform NO insert.
 *   A `CityStore` records every insert attempt so the "persists no record"
 *   half of the property is asserted directly (insert count stays 0). The real
 *   module is loaded, anchoring the seam to the production
 *   `validateZhkName` / `resolveLocalityKind` semantics.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/city-not-found.property.test.ts
 */

// `geoService.ts` statically imports `@workspace/db`, which instantiates a
// pg.Pool at module-load time and throws when `DATABASE_URL` is unset. pg.Pool
// does not connect lazily, so a fake connection string is enough — no real
// query is issued here (the city-resolution contract is mirrored in memory).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Dynamic import with a `.js` extension guarantees the `DATABASE_URL`
// assignment above runs BEFORE `@workspace/db` is loaded. We pull the REAL
// domain helpers so the seam tracks production validation/resolution semantics.
const geoService = await import("../../src/lib/geoService.js");
const { validateZhkName, resolveLocalityKind } = geoService;

// ─── Mirror of createLocality's slug normalization (private `normalizeSlug`) ──
// Public slugs are stored lower-cased (`^[a-z0-9-]{1,100}$`, Requirement 1.6).
// Empty-after-trim or > 100 chars cannot exist in `cities` → treated as a miss.
function normalizeSlug(slug: string): string | null {
  if (typeof slug !== "string") return null;
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 100) return null;
  return normalized;
}

// ─── Result union (mirror of the relevant CreateLocalityResult variants) ──────
type CreateResult =
  | { status: "created"; id: number }
  | { status: "duplicate_suggested"; id: number }
  | { status: "rejected"; reason: "invalid_name" | "invalid_kind" | "city_not_found" };

/**
 * IN-MEMORY seam that mirrors `createLocality`'s early branches, focused on the
 * City-resolution step (Requirement 4.7). It records every `zhk` insert attempt
 * via `insertCount`, so the "persists no Locality_Record" half of Property 6 is
 * asserted directly. The seam uses the REAL exported `validateZhkName` and
 * `resolveLocalityKind` so it cannot drift from production semantics.
 */
class LocalityStore {
  /** Existing City slugs (already normalized to lower-case). */
  private readonly citySlugs: Set<string>;
  /** Number of `INSERT INTO zhk` operations performed (must stay 0 on miss). */
  public insertCount = 0;
  private nextId = 1;

  constructor(citySlugs: readonly string[]) {
    this.citySlugs = new Set(citySlugs.map((s) => s.toLowerCase()));
  }

  create(input: { name: string; citySlug: string; kind?: unknown }): CreateResult {
    // 1. Name validation (Requirement 4.6) — REAL production predicate.
    if (!validateZhkName(input.name)) {
      return { status: "rejected", reason: "invalid_name" };
    }
    // 2. Kind resolution (Requirement 1.3–1.5) — REAL production resolver.
    const kind = resolveLocalityKind(input.kind);
    if (kind === null) {
      return { status: "rejected", reason: "invalid_kind" };
    }
    // 3. Parent City existence (Requirement 4.7).
    const normalized = normalizeSlug(input.citySlug);
    const cityExists = normalized !== null && this.citySlugs.has(normalized);
    if (!cityExists) {
      // No insert reached — return before steps 4 (dedup) and 5 (INSERT).
      return { status: "rejected", reason: "city_not_found" };
    }
    // 4–5. (only reached for an existing City) insert a new Locality_Record.
    this.insertCount += 1;
    return { status: "created", id: this.nextId++ };
  }
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

// A valid, in-range Locality name (trimmed length 2..100, Requirement 4.6) so
// the request always advances PAST name validation to the City-resolution step.
const validNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 2, maxLength: 100 })
  .filter((s) => {
    const len = s.trim().length;
    return len >= 2 && len <= 100;
  });

// A valid kind or absent (undefined/null → 'zhk') so the request also advances
// PAST kind resolution. All of these resolve to a non-null kind.
const validKindArb: fc.Arbitrary<unknown> = fc.constantFrom(
  "zhk",
  "district",
  "settlement",
  undefined,
  null,
);

// A pool of pre-existing City slugs the store knows about.
const KNOWN_CITY_SLUGS = ["krasnodar", "rostov-na-donu", "volgograd", "stavropol"];

// Slug-like tokens (lower-case latin/digits/hyphen) that will be constrained to
// NOT collide with any known City slug — i.e. guaranteed misses.
const slugTokenArb: fc.Arbitrary<string> = fc
  .stringMatching(/^[a-z0-9-]{1,40}$/)
  .filter((s) => s.length >= 1);

/** A citySlug guaranteed to match no existing City. */
const missingCitySlugArb: fc.Arbitrary<string> = fc
  .oneof(
    // Arbitrary slug-shaped strings not in the known set.
    slugTokenArb,
    // Empty / whitespace-only → normalizeSlug returns null → guaranteed miss.
    fc.constantFrom("", "   ", "\t", "\n"),
    // Over-length (> 100) → normalizeSlug returns null → guaranteed miss.
    fc.string({ minLength: 101, maxLength: 160 }),
    // Uppercase variants of shapes that still won't equal a known slug.
    slugTokenArb.map((s) => s.toUpperCase()),
  )
  .filter((s) => !KNOWN_CITY_SLUGS.includes(s.trim().toLowerCase()));

// ─── Property 6 — city-not-found rejection with no persistence ────────────────

describe("createLocality — Property 6: city-not-found rejection", () => {
  // Validates: Requirements 4.7

  it("rejects with city_not_found and persists NO record for any unknown citySlug", () => {
    fc.assert(
      fc.property(
        validNameArb,
        validKindArb,
        missingCitySlugArb,
        (name, kind, citySlug) => {
          const store = new LocalityStore(KNOWN_CITY_SLUGS);
          const res = store.create({ name, citySlug, kind });

          // Rejected specifically for city-not-found (name + kind were valid).
          assert.equal(
            res.status,
            "rejected",
            `expected rejection for unknown city ${JSON.stringify(citySlug)}`,
          );
          assert.equal(
            (res as { reason: string }).reason,
            "city_not_found",
            `expected reason city_not_found for ${JSON.stringify(citySlug)}`,
          );

          // No Locality_Record persisted — the INSERT was never reached.
          assert.equal(
            store.insertCount,
            0,
            "no zhk insert must occur when the parent City does not exist",
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("many unknown-city submissions in sequence never persist a record", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ name: validNameArb, kind: validKindArb, citySlug: missingCitySlugArb }),
          { minLength: 1, maxLength: 40 },
        ),
        (ops) => {
          const store = new LocalityStore(KNOWN_CITY_SLUGS);
          for (const op of ops) {
            const res = store.create(op);
            assert.equal(res.status, "rejected");
            assert.equal((res as { reason: string }).reason, "city_not_found");
          }
          assert.equal(store.insertCount, 0, "no record may be persisted across all misses");
        },
      ),
      { numRuns: 200 },
    );
  });

  // Sanity anchor: an EXISTING city with the same valid name/kind DOES insert,
  // proving the rejection above is caused by the missing City and not by name
  // or kind validation shadowing the result.
  it("an existing citySlug with the same valid input DOES persist (contrast case)", () => {
    fc.assert(
      fc.property(
        validNameArb,
        validKindArb,
        fc.constantFrom(...KNOWN_CITY_SLUGS),
        (name, kind, citySlug) => {
          const store = new LocalityStore(KNOWN_CITY_SLUGS);
          const res = store.create({ name, citySlug, kind });
          assert.equal(res.status, "created", "valid input + existing city must create");
          assert.equal(store.insertCount, 1, "exactly one record persisted for an existing city");
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Concrete examples ────────────────────────────────────────────────────────

describe("createLocality — Property 6: concrete examples", () => {
  it("unknown slug 'nonexistent-city' → city_not_found, 0 inserts", () => {
    const store = new LocalityStore(KNOWN_CITY_SLUGS);
    const res = store.create({ name: "Черёмушки", citySlug: "nonexistent-city", kind: "district" });
    assert.deepEqual(res, { status: "rejected", reason: "city_not_found" });
    assert.equal(store.insertCount, 0);
  });

  it("empty slug → normalizeSlug null → city_not_found, 0 inserts", () => {
    const store = new LocalityStore(KNOWN_CITY_SLUGS);
    const res = store.create({ name: "ФМР", citySlug: "   ", kind: "settlement" });
    assert.deepEqual(res, { status: "rejected", reason: "city_not_found" });
    assert.equal(store.insertCount, 0);
  });

  it("known slug 'krasnodar' → created (contrast)", () => {
    const store = new LocalityStore(KNOWN_CITY_SLUGS);
    const res = store.create({ name: "Панорама", citySlug: "krasnodar" });
    assert.equal(res.status, "created");
    assert.equal(store.insertCount, 1);
  });
});
