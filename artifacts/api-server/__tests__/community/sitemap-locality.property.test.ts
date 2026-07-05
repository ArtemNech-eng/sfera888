// Feature: community-generalized-locality, Property 15: Sitemap includes exactly indexable slugs
/**
 * Property test for the community sitemap locality source (Community Generalized
 * Locality, Стадия 7).
 *
 * Property 15: *For any* set of Locality_Record with mixed `is_indexable`, the
 *              Community_Sitemap_Source SHALL emit EXACTLY the slugs whose
 *              `is_indexable = true`, each exactly once (no duplicates), in a
 *              single flat list ordered by `slug` ascending; and SHALL emit an
 *              empty list (without error) when no record is indexable.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
 *
 * Module under test (`src/routes/community/sitemap.ts`):
 *   - `toCommunitySitemap(cities, zhk, specialties, threads?)` — the PURE,
 *     DB-free mapper. Its `zhk` argument is the Community_Sitemap_Source: it
 *     trims slugs, drops empty ones, deduplicates, and sorts ascending.
 *   - `SlugRow = { slug: string | null }` — the row shape.
 *
 * Testing seam. In production the `is_indexable = true` filter lives in the
 * Drizzle query (`.where(eq(zhkTable.isIndexable, true))`), and the pure mapper
 * receives only already-indexable rows. To exercise the FULL Property 15
 * (filter by `is_indexable` + dedup + sort ASC + empty), this test models that
 * query filter in-memory: it generates Locality_Record with a `slug` and an
 * `is_indexable` flag, applies the same predicate the SQL `WHERE` applies
 * (`is_indexable === true`), and feeds the surviving rows into the mapper's
 * `zhk` argument. The mapper then owns trim + dedup + ASC-sort + empty-input.
 * This mirrors the real request pipeline without a live Postgres.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/sitemap-locality.property.test.ts
 */

// `src/routes/community/sitemap.ts` statically imports `@workspace/db`, which
// throws at load time when DATABASE_URL is unset. No property here runs a real
// query (the pure mapper is DB-free), so a fake connection string suffices.
process.env.DATABASE_URL ??= "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Dynamic import with `.js` extension so the DATABASE_URL assignment above runs
// BEFORE `@workspace/db` is loaded transitively.
const sitemap = await import("../../src/routes/community/sitemap.js");
const { toCommunitySitemap } = sitemap;

// ─── Types mirroring the module's inputs ─────────────────────────────────────

/** A Locality_Record as seen by the sitemap source, before the DB filter. */
interface LocalityRecord {
  slug: string | null;
  isIndexable: boolean;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

// A small pool of realistic base slugs so that DUPLICATES are forced often
// (both across records and, combined with whitespace padding, as trim-variants).
const baseSlugArb = fc.constantFrom(
  "moskva",
  "fmr",
  "cheryomushki",
  "zhk-solnechnyy",
  "sankt-peterburg",
  "poselok-lesnoy",
  "rayon-severnyy",
  "a",
  "z-9",
);

// Whitespace padding removed by String.prototype.trim() — the mapper trims, so
// "  fmr  " and "fmr" must collapse to a single slug.
const padArb = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0"), { minLength: 0, maxLength: 4 })
  .map((xs) => xs.join(""));

// A slug value for a record: usually a padded base slug (to provoke trim-dedup),
// sometimes an empty/whitespace-only string or null (which the mapper drops),
// occasionally a fresh arbitrary string.
const slugValueArb: fc.Arbitrary<string | null> = fc.oneof(
  { weight: 6, arbitrary: fc.tuple(padArb, baseSlugArb, padArb).map(([l, s, r]) => l + s + r) },
  { weight: 1, arbitrary: fc.constantFrom("", "   ", "\t\n") },
  { weight: 1, arbitrary: fc.constant<null>(null) },
  { weight: 2, arbitrary: fc.string({ maxLength: 12 }) },
);

const localityRecordArb: fc.Arbitrary<LocalityRecord> = fc.record({
  slug: slugValueArb,
  isIndexable: fc.boolean(),
});

const localitySetArb = fc.array(localityRecordArb, { minLength: 0, maxLength: 60 });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mirror the SQL `WHERE is_indexable = true` filter → mapper input rows. */
function toSitemapInput(records: readonly LocalityRecord[]): { slug: string | null }[] {
  return records.filter((r) => r.isIndexable === true).map((r) => ({ slug: r.slug }));
}

/**
 * Independent oracle for the expected `zhk` output: exactly the indexable
 * slugs, trimmed, non-empty, deduplicated, sorted ascending (mapper contract).
 */
function expectedZhk(records: readonly LocalityRecord[]): string[] {
  const indexableSlugs = records
    .filter((r) => r.isIndexable === true)
    .map((r) => (typeof r.slug === "string" ? r.slug.trim() : ""))
    .filter((s) => s.length > 0);
  return Array.from(new Set(indexableSlugs)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// ─── Property 15 — sitemap includes exactly the indexable slugs ───────────────

describe("Sitemap Property 15: Community_Sitemap_Source emits exactly indexable slugs", () => {
  // Validates: Requirements 7.1, 7.2, 7.3, 7.4

  it("output equals the deduped, ASC-sorted set of is_indexable=true slugs", () => {
    fc.assert(
      fc.property(localitySetArb, (records) => {
        const out = toCommunitySitemap([], toSitemapInput(records), []);
        assert.deepEqual(out.zhk, expectedZhk(records));
      }),
      { numRuns: 300 },
    );
  });

  it("no duplicates: each slug appears exactly once (Requirement 7.1)", () => {
    fc.assert(
      fc.property(localitySetArb, (records) => {
        const { zhk } = toCommunitySitemap([], toSitemapInput(records), []);
        assert.equal(new Set(zhk).size, zhk.length, `duplicate slug in ${JSON.stringify(zhk)}`);
      }),
      { numRuns: 300 },
    );
  });

  it("ordered by slug ascending, single flat list (Requirement 7.3)", () => {
    fc.assert(
      fc.property(localitySetArb, (records) => {
        const { zhk } = toCommunitySitemap([], toSitemapInput(records), []);
        for (let i = 1; i < zhk.length; i++) {
          assert.ok(
            zhk[i - 1] < zhk[i],
            `not strictly ascending at ${i}: ${JSON.stringify(zhk[i - 1])} !< ${JSON.stringify(zhk[i])}`,
          );
        }
      }),
      { numRuns: 300 },
    );
  });

  it("excludes every is_indexable=false slug that is not also indexable (Requirement 7.2)", () => {
    fc.assert(
      fc.property(localitySetArb, (records) => {
        const { zhk } = toCommunitySitemap([], toSitemapInput(records), []);
        const emitted = new Set(zhk);

        // Trimmed, non-empty slugs that belong to an indexable record.
        const indexableTrimmed = new Set(expectedZhk(records));

        for (const r of records) {
          if (r.isIndexable) continue;
          const s = typeof r.slug === "string" ? r.slug.trim() : "";
          if (s.length === 0) continue;
          // A non-indexable slug may only appear if some OTHER record with the
          // same trimmed slug is indexable.
          if (!indexableTrimmed.has(s)) {
            assert.ok(!emitted.has(s), `non-indexable slug leaked into sitemap: ${JSON.stringify(s)}`);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("no indexable slug is ever missing (⊇ direction of Requirement 7.1)", () => {
    fc.assert(
      fc.property(localitySetArb, (records) => {
        const { zhk } = toCommunitySitemap([], toSitemapInput(records), []);
        const emitted = new Set(zhk);
        for (const s of expectedZhk(records)) {
          assert.ok(emitted.has(s), `indexable slug missing from sitemap: ${JSON.stringify(s)}`);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("no indexable record → empty list, no error (Requirement 7.4)", () => {
    fc.assert(
      fc.property(
        // Records that are either non-indexable, or indexable with an
        // empty/whitespace/null slug — both yield NO sitemap entries.
        fc.array(
          fc.oneof(
            fc.record({ slug: slugValueArb, isIndexable: fc.constant(false) }),
            fc.record({
              slug: fc.constantFrom<string | null>("", "   ", "\t", null),
              isIndexable: fc.constant(true),
            }),
          ),
          { minLength: 0, maxLength: 40 },
        ),
        (records) => {
          const { zhk } = toCommunitySitemap([], toSitemapInput(records as LocalityRecord[]), []);
          assert.deepEqual(zhk, []);
        },
      ),
      { numRuns: 200 },
    );
  });
});
