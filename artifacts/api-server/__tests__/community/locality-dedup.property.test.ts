// Feature: community-generalized-locality, Property 7: Deduplication within a city
/**
 * Property test for Locality deduplication within a City (Community Generalized
 * Locality, Стадия 2).
 *
 * Property 7: *For any* existing Locality and any submission whose
 *             `lower(trim(name))` is character-for-character equal to that
 *             Locality's `name_normalized` in the SAME City, the system SHALL
 *             create no new record, return the existing Locality (slug and
 *             name) unchanged, and SHALL apply this comparison only among
 *             Localities of the same City AND independently of Locality_Kind.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * Module under test (`src/lib/geoService.ts`):
 *   - `createLocality(input): CreateLocalityResult` — its dedup branch (step 4):
 *     after a valid name and valid kind and an existing City, it computes
 *     `nameNormalized = normalizeZhkName(name)` and SELECTs `zhk` by the key
 *     `(cityId, nameNormalized)` — WITHOUT any `kind` predicate. On a match it
 *     returns `{ status: "duplicate_suggested", existing }` where `existing` is
 *     the ALREADY-STORED Locality DTO (its own slug / name / kind), and it does
 *     NOT insert a new record. The submitted kind never overrides the stored
 *     one on a duplicate.
 *   - Real exported helpers anchor the seam: `normalizeZhkName` (the exact dedup
 *     key `lower(trim(name))`), `validateZhkName` (name gate) and
 *     `resolveLocalityKind` (kind gate).
 *
 * Distinction from `zhk-dedup.property.test.ts`.
 *   That test covers the OLD hochu-takzhe-community spec (Requirement 4.5) and
 *   only exercises the (cityId, nameNormalized) key over `zhk`-only records. It
 *   does NOT exercise Property 7's defining clause — that the dedup comparison
 *   is INDEPENDENT of Locality_Kind (Requirement 5.3). This test seeds a record
 *   of one kind and submits an equivalent name with a DIFFERENT kind, asserting
 *   the submission still dedups to the existing record and the stored
 *   kind/slug/name are returned unchanged.
 *
 * DB seam / harness note.
 *   `createLocality` statically pulls in `@workspace/db`, which instantiates a
 *   `pg.Pool` at module-load time (throwing if `DATABASE_URL` is unset) and
 *   whose City lookup, dedup SELECT and `INSERT INTO zhk` can only run against a
 *   real Postgres. This repository has NO ephemeral/transactional-Postgres test
 *   harness, so — like the sibling community property tests (`zhk-dedup`,
 *   `city-not-found`) — this test sets a fake `DATABASE_URL` before the dynamic
 *   `.js` import and exercises an IN-MEMORY store that MIRRORS `createLocality`'s
 *   dedup contract verbatim, keyed on `(cityId, nameNormalized)` and anchored to
 *   the REAL `normalizeZhkName` so it cannot drift from production semantics.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/locality-dedup.property.test.ts
 */

// `geoService.ts` statically imports `@workspace/db`, which instantiates a
// pg.Pool at module-load time and throws when `DATABASE_URL` is unset. pg.Pool
// does not connect lazily, so a fake connection string is enough — no real
// query is issued here (the dedup contract is mirrored in memory).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Dynamic import with a `.js` extension guarantees the `DATABASE_URL`
// assignment above runs BEFORE `@workspace/db` is loaded. We pull the REAL
// domain helpers so the seam tracks production normalize/validate/resolve.
const geoService = await import("../../src/lib/geoService.js");
const { normalizeZhkName, validateZhkName, resolveLocalityKind } = geoService;
const communitySlug = await import("../../src/lib/communitySlug.js");
const { slugify } = communitySlug;

// ─── Locality_Kind values (Requirement 1.2) ─────────────────────────────────
const KINDS = ["zhk", "district", "settlement"] as const;
type Kind = (typeof KINDS)[number];

// ─── In-memory store mirroring createLocality's dedup semantics ───────────────

interface LocalityRow {
  id: number;
  cityId: number;
  slug: string;
  name: string; // stored trimmed (createLocality inserts `name.trim()`)
  nameNormalized: string; // = lower(trim(name))
  kind: Kind;
}

type CreateResult =
  | { status: "created"; locality: LocalityRow }
  | { status: "duplicate_suggested"; existing: LocalityRow }
  | {
      status: "rejected";
      reason: "invalid_name" | "invalid_kind" | "city_not_found";
    };

/**
 * Store that reproduces `createLocality` step-for-step for the dedup path:
 *   1) validate name via the REAL `validateZhkName`;
 *   2) resolve kind via the REAL `resolveLocalityKind` (undefined/null → 'zhk');
 *   3) resolve the parent City by id against a known set;
 *   4) dedup by `(cityId, nameNormalized)` — NO `kind` predicate — using the
 *      REAL `normalizeZhkName`; on a match return the EXISTING row unchanged
 *      (`duplicate_suggested`) and perform NO insert;
 *   5) otherwise insert a new row (slug via the REAL `slugify`, globally unique
 *      by suffixing), storing the resolved kind and `name.trim()`.
 * `insertCount` records inserts so "creates no new record" is asserted directly.
 */
class LocalityStore {
  private readonly rows: LocalityRow[] = [];
  private readonly knownCities: Set<number>;
  private readonly usedSlugs = new Set<string>();
  private nextId = 1;
  public insertCount = 0;

  constructor(cityIds: readonly number[]) {
    this.knownCities = new Set(cityIds);
  }

  create(input: { name: string; cityId: number; kind?: unknown }): CreateResult {
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
    if (!this.knownCities.has(input.cityId)) {
      return { status: "rejected", reason: "city_not_found" };
    }
    // 4. Dedup by (cityId, nameNormalized), INDEPENDENT of kind (Req 5.1–5.3).
    const nameNormalized = normalizeZhkName(input.name);
    const existing = this.rows.find(
      (r) => r.cityId === input.cityId && r.nameNormalized === nameNormalized,
    );
    if (existing) {
      // Return the stored row unchanged; no insert (Requirement 5.1).
      return { status: "duplicate_suggested", existing };
    }
    // 5. Insert a new Locality_Record (Requirement 4.2, 4.8).
    const trimmedName = input.name.trim();
    const slug = this.uniqueSlug(trimmedName);
    const row: LocalityRow = {
      id: this.nextId++,
      cityId: input.cityId,
      slug,
      name: trimmedName,
      nameNormalized,
      kind: kind as Kind,
    };
    this.rows.push(row);
    this.usedSlugs.add(slug);
    this.insertCount += 1;
    return { status: "created", locality: row };
  }

  /** Global slug uniqueness via the REAL `slugify` + `-N` suffixing. */
  private uniqueSlug(name: string): string {
    const base = slugify(name);
    if (!this.usedSlugs.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!this.usedSlugs.has(candidate)) return candidate;
    }
  }

  rowCount(): number {
    return this.rows.length;
  }

  rowsInCity(cityId: number): readonly LocalityRow[] {
    return this.rows.filter((r) => r.cityId === cityId);
  }
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const cyrillicCharArb = fc.constantFrom(
  "а", "б", "в", "г", "д", "е", "ж", "з", "и", "к", "л", "м",
  "н", "о", "п", "р", "с", "т", "у", "ф", "х", "ч", "ш", "я",
);
const latinCharArb = fc.constantFrom(
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "k", "m", "n",
  "o", "p", "r", "s", "t", "u", "v", "0", "1", "2", "9",
);
// Inner chars (never leading/trailing) — trim leaves them intact, so they must
// match character-for-character across equivalents.
const innerCharArb = fc.oneof(
  { weight: 5, arbitrary: cyrillicCharArb },
  { weight: 4, arbitrary: latinCharArb },
  { weight: 1, arbitrary: fc.constantFrom(" ", "-", ".", "№") },
);

// A base locality name: non-empty meaningful content, trimmed length 2..100.
const baseNameArb: fc.Arbitrary<string> = fc
  .array(innerCharArb, { minLength: 2, maxLength: 40 })
  .map((xs) => xs.join(""))
  .filter((s) => {
    const t = s.trim();
    return t.length >= 2 && t.length <= 100;
  });

// Surrounding whitespace removed by String.prototype.trim().
const trimWsArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0"), { minLength: 0, maxLength: 6 })
  .map((xs) => xs.join(""));

const kindArb: fc.Arbitrary<Kind> = fc.constantFrom(...KINDS);

/** Randomly flip the case of each character (equivalent under lower()). */
function flipCase(s: string, seed: number): string {
  let out = "";
  let acc = seed >>> 0;
  for (const ch of s) {
    acc = (acc * 1103515245 + 12345) >>> 0;
    out += acc & 1 ? ch.toUpperCase() : ch.toLowerCase();
  }
  return out;
}

/**
 * From a base name, build an "equivalent" submission: same inner text, but with
 * arbitrary surrounding whitespace and arbitrary case. By contract
 * `lower(trim(x))` maps it to the same `name_normalized` as the base.
 */
const equivalentArb = fc
  .record({ lead: trimWsArb, trail: trimWsArb, seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }) })
  .map(({ lead, trail, seed }) => ({ lead, trail, seed }));

function makeEquivalent(base: string, e: { lead: string; trail: string; seed: number }): string {
  return e.lead + flipCase(base, e.seed) + e.trail;
}

const CITY_IDS = [1, 2, 3, 4] as const;

// ─── Property 7.1 — equivalent name in same city dedups, existing unchanged ───

describe("createLocality — Property 7.1: same-city equivalent name dedups to existing", () => {
  // Validates: Requirements 5.1, 5.2

  it("an equivalent-name submission creates NO new record and returns existing slug/name unchanged", () => {
    fc.assert(
      fc.property(
        baseNameArb,
        kindArb,
        kindArb,
        equivalentArb,
        fc.constantFrom(...CITY_IDS),
        (base, seedKind, dupKind, equiv, cityId) => {
          const store = new LocalityStore(CITY_IDS);

          // Seed an existing locality (kind = seedKind).
          const seedRes = store.create({ name: base, cityId, kind: seedKind });
          assert.equal(seedRes.status, "created");
          const seeded = (seedRes as { locality: LocalityRow }).locality;
          const countAfterSeed = store.rowCount();

          // Submit an equivalent name (arbitrary whitespace/case), any kind.
          const dupName = makeEquivalent(base, equiv);
          // Sanity: the equivalent really normalizes to the same key.
          assert.equal(normalizeZhkName(dupName), seeded.nameNormalized);

          const before = store.insertCount;
          const dupRes = store.create({ name: dupName, cityId, kind: dupKind });

          assert.equal(
            dupRes.status,
            "duplicate_suggested",
            `equivalent name in same city must dedup: ${JSON.stringify(dupName)}`,
          );
          const existing = (dupRes as { existing: LocalityRow }).existing;

          // No new record was created (Requirement 5.1).
          assert.equal(store.insertCount, before, "no insert may occur on a duplicate");
          assert.equal(store.rowCount(), countAfterSeed, "row count must not grow");

          // The EXISTING record is returned unchanged: same id, slug, name.
          assert.equal(existing.id, seeded.id, "must return the SAME existing record");
          assert.equal(existing.slug, seeded.slug, "existing slug must be unchanged");
          assert.equal(existing.name, seeded.name, "existing name must be unchanged");
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ─── Property 7.2 — dedup is independent of kind (Requirement 5.3) ────────────

describe("createLocality — Property 7.2: dedup is independent of Locality_Kind", () => {
  // Validates: Requirements 5.3

  it("seeding kind K1 then submitting an equivalent name with a DIFFERENT kind K2 still dedups; stored kind/slug/name unchanged", () => {
    fc.assert(
      fc.property(
        baseNameArb,
        equivalentArb,
        fc.constantFrom(...CITY_IDS),
        fc.integer({ min: 0, max: KINDS.length - 1 }),
        fc.integer({ min: 1, max: KINDS.length - 1 }),
        (base, equiv, cityId, k1Idx, kOffset) => {
          const k1: Kind = KINDS[k1Idx];
          // Guarantee a DIFFERENT kind K2 (offset 1..len-1, modular).
          const k2: Kind = KINDS[(k1Idx + kOffset) % KINDS.length];
          assert.notEqual(k1, k2, "K2 must differ from K1 for this property");

          const store = new LocalityStore(CITY_IDS);

          const seedRes = store.create({ name: base, cityId, kind: k1 });
          assert.equal(seedRes.status, "created");
          const seeded = (seedRes as { locality: LocalityRow }).locality;
          assert.equal(seeded.kind, k1);

          // Submit an equivalent name but with the OTHER kind.
          const dupName = makeEquivalent(base, equiv);
          const dupRes = store.create({ name: dupName, cityId, kind: k2 });

          assert.equal(
            dupRes.status,
            "duplicate_suggested",
            "dedup must trigger regardless of the submitted kind (Req 5.3)",
          );
          const existing = (dupRes as { existing: LocalityRow }).existing;

          // A duplicate submission never changes the stored kind/slug/name.
          assert.equal(existing.id, seeded.id, "same existing record");
          assert.equal(existing.kind, k1, "stored kind must remain K1, NOT the submitted K2");
          assert.equal(existing.slug, seeded.slug, "stored slug unchanged");
          assert.equal(existing.name, seeded.name, "stored name unchanged");
          assert.equal(store.insertCount, 1, "still exactly one record for the city");
        },
      ),
      { numRuns: 300 },
    );
  });

  it("all three kinds submitted for one equivalent name in a city → exactly one record (the first)", () => {
    fc.assert(
      fc.property(
        baseNameArb,
        fc.constantFrom(...CITY_IDS),
        fc.shuffledSubarray([...KINDS], { minLength: KINDS.length, maxLength: KINDS.length }),
        fc.array(equivalentArb, { minLength: KINDS.length, maxLength: KINDS.length }),
        (base, cityId, kindOrder, equivs) => {
          const store = new LocalityStore(CITY_IDS);
          let firstId: number | null = null;
          let firstKind: Kind | null = null;

          kindOrder.forEach((kind, i) => {
            const name = makeEquivalent(base, equivs[i]);
            const res = store.create({ name, cityId, kind });
            if (firstId === null) {
              assert.equal(res.status, "created");
              firstId = (res as { locality: LocalityRow }).locality.id;
              firstKind = (res as { locality: LocalityRow }).locality.kind;
            } else {
              assert.equal(res.status, "duplicate_suggested", "later kinds must dedup");
              const existing = (res as { existing: LocalityRow }).existing;
              assert.equal(existing.id, firstId, "always the first record");
              assert.equal(existing.kind, firstKind, "stored kind stays that of the first insert");
            }
          });

          assert.equal(store.rowsInCity(cityId).length, 1, "exactly one record across all kinds");
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 7.3 — dedup scope is the City (Requirement 5.2) ─────────────────

describe("createLocality — Property 7.3: dedup is scoped to the same City", () => {
  // Validates: Requirements 5.2, 5.3

  it("same normalized name in a DIFFERENT city creates a distinct record, regardless of kinds", () => {
    fc.assert(
      fc.property(
        baseNameArb,
        kindArb,
        kindArb,
        equivalentArb,
        fc.constantFrom(...CITY_IDS),
        fc.constantFrom(...CITY_IDS),
        (base, kindA, kindB, equiv, cityA, cityB) => {
          fc.pre(cityA !== cityB); // two distinct cities

          const store = new LocalityStore(CITY_IDS);
          const r1 = store.create({ name: base, cityId: cityA, kind: kindA });
          const r2 = store.create({ name: makeEquivalent(base, equiv), cityId: cityB, kind: kindB });

          assert.equal(r1.status, "created");
          assert.equal(
            r2.status,
            "created",
            "the same name in another city must create a distinct record (Req 5.2)",
          );
          const a = (r1 as { locality: LocalityRow }).locality;
          const b = (r2 as { locality: LocalityRow }).locality;

          assert.notEqual(a.id, b.id, "distinct records across cities");
          assert.notEqual(a.slug, b.slug, "distinct global slugs");
          assert.equal(a.nameNormalized, b.nameNormalized, "same dedup key, different city");
          assert.equal(store.insertCount, 2, "two records total across the two cities");
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ─── Concrete examples ────────────────────────────────────────────────────────

describe("createLocality — Property 7: concrete examples", () => {
  it("district seeded, equivalent name submitted as zhk → dedups to the district", () => {
    const store = new LocalityStore(CITY_IDS);
    const seed = store.create({ name: "Черёмушки", cityId: 1, kind: "district" });
    assert.equal(seed.status, "created");
    const seeded = (seed as { locality: LocalityRow }).locality;

    const dup = store.create({ name: "  чЕрЁмушки  ", cityId: 1, kind: "zhk" });
    assert.equal(dup.status, "duplicate_suggested");
    const existing = (dup as { existing: LocalityRow }).existing;
    assert.equal(existing.id, seeded.id);
    assert.equal(existing.kind, "district"); // stored kind, NOT submitted 'zhk'
    assert.equal(existing.slug, seeded.slug);
    assert.equal(existing.name, "Черёмушки");
    assert.equal(store.insertCount, 1);
  });

  it("same name 'ФМР' in two different cities → two distinct records", () => {
    const store = new LocalityStore(CITY_IDS);
    const a = store.create({ name: "ФМР", cityId: 1, kind: "district" });
    const b = store.create({ name: "фмр", cityId: 2, kind: "settlement" });
    assert.equal(a.status, "created");
    assert.equal(b.status, "created");
    assert.equal(store.insertCount, 2);
  });

  it("settlement seeded, equivalent submitted as settlement in same city → dedups", () => {
    const store = new LocalityStore(CITY_IDS);
    store.create({ name: "Индустриальный", cityId: 3, kind: "settlement" });
    const dup = store.create({ name: "индустриальный", cityId: 3, kind: "settlement" });
    assert.equal(dup.status, "duplicate_suggested");
    assert.equal(store.insertCount, 1);
  });
});
