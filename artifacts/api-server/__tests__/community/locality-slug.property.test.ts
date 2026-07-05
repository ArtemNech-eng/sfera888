// Feature: community-generalized-locality, Property 2: Slug format and global uniqueness
/**
 * Property test for slug format and global uniqueness (Community Generalized
 * Locality, Стадия 2).
 *
 * Property 2: *For any* name string, `slugify(name)` SHALL match
 *             `^[a-z0-9-]{1,100}$`; and *for any* sequence of created Cities
 *             and Localities, all assigned slugs SHALL be pairwise distinct
 *             across the combined `cities` + `zhk` namespace.
 *
 * **Validates: Requirements 1.6**
 *
 * Module under test (`src/lib/communitySlug.ts`):
 *   - `slugify(input: string): string`            — pure, deterministic
 *                                                    normalization (no DB).
 *   - `SLUG_RE = /^[a-z0-9-]{1,100}$/`             — result invariant.
 *   - `SLUG_MAX_LEN = 100`
 *   - `resolveUniqueSlug(base, isTaken)`           — collision resolution via
 *                                                    a `-N` suffix, driven by
 *                                                    an injectable existence
 *                                                    checker (`isTaken`).
 *
 * Testing seam. `generateSlug(name, scope)` is DB-backed: it delegates
 * uniqueness to `slugTakenGlobally`, which queries the `cities` AND `zhk`
 * tables for an existing slug. Its collision-resolution core, however, is the
 * pure `resolveUniqueSlug(base, isTaken)` with an *injectable* `isTaken`
 * predicate. This test drives that seam with a single shared in-memory `Set`
 * that models the COMBINED `cities` + `zhk` slug namespace, exactly mirroring
 * what `slugTakenGlobally` checks against a real database — without requiring
 * a live Postgres. This is the module's designed test seam.
 *
 * Properties verified here:
 *   2.1 (format)     — for ANY name string (arbitrary Unicode incl. Cyrillic,
 *                      punctuation-only, whitespace-only, boundary lengths
 *                      1/2/100/101), `slugify` returns a value matching
 *                      `^[a-z0-9-]{1,100}$` with length in [1, 100].
 *   2.2 (uniqueness) — for ANY sequence of Cities AND Localities (mixed
 *                      scopes) fed through `slugify` → `resolveUniqueSlug`
 *                      against one shared taken-set, every issued slug is
 *                      pairwise distinct across the COMBINED namespace and
 *                      still matches `SLUG_RE` with length ≤ 100.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/locality-slug.property.test.ts
 */

// `communitySlug.ts` statically imports `@workspace/db`, which throws at module
// load time when `DATABASE_URL` is unset. pg.Pool does not connect lazily, so a
// fake connection string is enough — no property here performs a real query
// (`resolveUniqueSlug` takes an injectable `isTaken`).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Dynamic import with a `.js` extension: guarantees the `DATABASE_URL`
// assignment above runs BEFORE `@workspace/db` is loaded.
const communitySlug = await import("../../src/lib/communitySlug.js");
const { slugify, resolveUniqueSlug, SLUG_RE, SLUG_MAX_LEN } = communitySlug;

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const cyrillicCharArb = fc.constantFrom(
  "а", "б", "в", "г", "д", "е", "ё", "ж", "з", "и", "й", "к", "л", "м",
  "н", "о", "п", "р", "с", "т", "у", "ф", "х", "ц", "ч", "ш", "щ", "ъ",
  "ы", "ь", "э", "ю", "я",
  "А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К", "Л", "М", "Н", "О",
  "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Щ", "Э", "Ю", "Я",
);

const latinCharArb = fc.constantFrom(
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "A", "B", "C", "Z", "0", "1", "2", "3", "9",
);

const punctCharArb = fc.constantFrom(
  "!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "«", "»", "—", "–",
  "-", "_", "/", "\\", ".", ",", ";", ":", "'", '"', "?", "№", "+", "=",
);

const whitespaceCharArb = fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0");

const emojiCharArb = fc.constantFrom(
  "😀", "🎉", "🏠", "✨", "🚀", "💡", "🔥", "🌟", "🇷🇺", "👨‍👩‍👧",
);

// Rich mixed character stream covering every code path of the normalizer,
// weighted toward Cyrillic (the primary real-world input for RU localities).
const richCharArb = fc.oneof(
  { weight: 4, arbitrary: cyrillicCharArb },
  { weight: 3, arbitrary: latinCharArb },
  { weight: 3, arbitrary: punctCharArb },
  { weight: 2, arbitrary: whitespaceCharArb },
  { weight: 1, arbitrary: emojiCharArb },
);

const richStringArb = fc
  .array(richCharArb, { minLength: 0, maxLength: 80 })
  .map((xs) => xs.join(""));

// A "very long" input (> SLUG_MAX_LEN after transliteration) to exercise the
// truncation branch and the 100/101 boundary.
const veryLongArb = fc
  .array(fc.oneof(cyrillicCharArb, latinCharArb), {
    minLength: 120,
    maxLength: 300,
  })
  .map((xs) => xs.join(""));

/** Build a Cyrillic string of exactly `len` characters (boundary generator). */
function cyrillicOfLength(len: number): fc.Arbitrary<string> {
  return fc
    .array(cyrillicCharArb, { minLength: len, maxLength: len })
    .map((xs) => xs.join(""));
}

// Boundary-length names (1 / 2 / 100 / 101 chars). Slug length depends on
// transliteration expansion, but slugify must ALWAYS clamp to [1, 100].
const boundaryLengthArb = fc.oneof(
  cyrillicOfLength(1),
  cyrillicOfLength(2),
  cyrillicOfLength(100),
  cyrillicOfLength(101),
);

// The full name space: rich mixed strings, arbitrary Unicode strings, very-long
// strings, boundary lengths, plus hand-picked degenerate / real-world cases.
const nameArb = fc.oneof(
  { weight: 6, arbitrary: richStringArb },
  { weight: 2, arbitrary: fc.string({ maxLength: 60 }) },
  { weight: 2, arbitrary: veryLongArb },
  { weight: 2, arbitrary: boundaryLengthArb },
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      "",              // empty → fallback
      "   ",           // whitespace-only → fallback
      "!!!",           // punctuation-only → fallback
      "«»—",           // typographic-only → fallback
      "😀😀😀",         // emoji-only → fallback
      "---",           // dashes-only → fallback
      "ЖК «Заря»",
      "ФМР",           // district (old fund) name
      "Черёмушки",     // district name with ё
      "Посёлок Северный",
      "Ростов-на-Дону",
      "Санкт-Петербург",
    ),
  },
);

/** A named create request tagged with its geo scope (City or Locality). */
const scopedNameArb = fc.record({
  scope: fc.constantFrom("city" as const, "zhk" as const),
  name: nameArb,
});

// ─── Property 2.1 — slugify format invariant ──────────────────────────────────

describe("Locality slug — Property 2.1: slugify format invariant", () => {
  // Validates: Requirements 1.6

  it("slugify(name) matches ^[a-z0-9-]{1,100}$ for ANY input", () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const slug = slugify(name);
        assert.ok(
          SLUG_RE.test(slug),
          `slugify(${JSON.stringify(name)}) = ${JSON.stringify(slug)} must match ${SLUG_RE}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("slug length is within [1, SLUG_MAX_LEN] for ANY input (incl. 1/2/100/101 boundaries)", () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const slug = slugify(name);
        assert.ok(
          slug.length >= 1,
          `slug must be non-empty for ${JSON.stringify(name)}`,
        );
        assert.ok(
          slug.length <= SLUG_MAX_LEN,
          `slug length ${slug.length} exceeds SLUG_MAX_LEN=${SLUG_MAX_LEN} for ${JSON.stringify(name)}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("slug never has a leading/trailing dash and never contains '--'", () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const slug = slugify(name);
        assert.ok(!slug.startsWith("-"), `slug ${JSON.stringify(slug)} has leading '-'`);
        assert.ok(!slug.endsWith("-"), `slug ${JSON.stringify(slug)} has trailing '-'`);
        assert.ok(!slug.includes("--"), `slug ${JSON.stringify(slug)} contains '--'`);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 2.2 — global uniqueness across combined cities + zhk namespace ──

describe("Locality slug — Property 2.2: pairwise-distinct slugs across cities + zhk", () => {
  // Validates: Requirements 1.6
  //
  // The production invariant: `cities.slug` and `zhk.slug` are globally unique
  // across BOTH tables (`slugTakenGlobally` checks both). Feed a mixed sequence
  // of City AND Locality names through slugify → resolveUniqueSlug against a
  // SINGLE shared taken-set that models the combined namespace. Every issued
  // slug must be pairwise distinct across the whole sequence AND still match
  // SLUG_RE with length ≤ SLUG_MAX_LEN.

  it("mixed City + Locality names yield all-distinct, well-formed slugs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(scopedNameArb, { minLength: 1, maxLength: 60 }),
        async (requests) => {
          // One combined namespace for both `cities` and `zhk` slugs.
          const takenGlobally = new Set<string>();
          const issued: string[] = [];

          for (const { name } of requests) {
            const base = slugify(name);
            const slug = await resolveUniqueSlug(
              base,
              async (candidate) => takenGlobally.has(candidate),
            );

            // Global uniqueness: never hand out an already-taken slug.
            assert.ok(
              !takenGlobally.has(slug),
              `resolveUniqueSlug returned an already-taken slug: ${JSON.stringify(slug)}`,
            );
            // Uniqueness resolution must not break the format invariant.
            assert.ok(
              SLUG_RE.test(slug),
              `resolved slug ${JSON.stringify(slug)} must match ${SLUG_RE}`,
            );
            assert.ok(
              slug.length <= SLUG_MAX_LEN,
              `resolved slug length ${slug.length} exceeds SLUG_MAX_LEN=${SLUG_MAX_LEN}`,
            );

            takenGlobally.add(slug);
            issued.push(slug);
          }

          // One slug issued per request, and all pairwise distinct.
          assert.equal(
            issued.length,
            requests.length,
            "should issue exactly one slug per request",
          );
          assert.equal(
            new Set(issued).size,
            issued.length,
            `expected ${issued.length} distinct slugs, got ${new Set(issued).size}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("a City and a Locality with the SAME name still get distinct slugs (cross-scope collision)", async () => {
    // The hardest cross-namespace case: identical names submitted under both
    // scopes. Because uniqueness is global, the second must be disambiguated.
    await fc.assert(
      fc.asyncProperty(nameArb, fc.integer({ min: 1, max: 8 }), async (name, extra) => {
        const takenGlobally = new Set<string>();
        const issued: string[] = [];
        // 1 city + N localities all sharing one name → all must be distinct.
        const total = 1 + extra;

        for (let i = 0; i < total; i++) {
          const slug = await resolveUniqueSlug(
            slugify(name),
            async (candidate) => takenGlobally.has(candidate),
          );
          assert.ok(SLUG_RE.test(slug), `slug ${JSON.stringify(slug)} must match ${SLUG_RE}`);
          assert.ok(slug.length <= SLUG_MAX_LEN);
          assert.ok(
            !takenGlobally.has(slug),
            `duplicate slug issued across scopes: ${JSON.stringify(slug)}`,
          );
          takenGlobally.add(slug);
          issued.push(slug);
        }

        assert.equal(
          new Set(issued).size,
          total,
          "same name across city + localities must yield all-distinct slugs",
        );
      }),
      { numRuns: 100 },
    );
  });

  it("many names that collapse to the SAME base (fallback) get distinct, valid slugs", async () => {
    // Punctuation-only / emoji-only names all normalize to the fallback base;
    // resolveUniqueSlug must still disambiguate them within the shared
    // namespace with `-N` suffixes.
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 50 }), async (count) => {
        const takenGlobally = new Set<string>();
        const issued: string[] = [];

        for (let i = 0; i < count; i++) {
          const slug = await resolveUniqueSlug(
            slugify("!!!"),
            async (candidate) => takenGlobally.has(candidate),
          );
          assert.ok(SLUG_RE.test(slug), `slug ${JSON.stringify(slug)} must match ${SLUG_RE}`);
          assert.ok(slug.length <= SLUG_MAX_LEN);
          assert.ok(!takenGlobally.has(slug), `duplicate slug issued: ${JSON.stringify(slug)}`);
          takenGlobally.add(slug);
          issued.push(slug);
        }

        assert.equal(new Set(issued).size, count, "all colliding names must get distinct slugs");
      }),
      { numRuns: 30 },
    );
  });
});
