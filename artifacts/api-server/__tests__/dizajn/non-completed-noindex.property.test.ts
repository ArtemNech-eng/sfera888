// Feature: ai-design-flagship, Property 14: Non-completed projects are excluded from indexing everywhere
/**
 * Property test for the AI-designer SEO indexing/inclusion predicates.
 *
 * Property 14: Non-completed projects are excluded from indexing everywhere.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 *
 * Module under test (pure predicates, no Next.js / React runtime needed):
 *   - `isIndexableDesignStatus(status)`
 *   - `designRobotsMetadata(status)`
 *   - `isSitemapEligibleDesign(candidate)`
 *   - `selectSitemapDesignSlugs(candidates)`
 *   - `NOINDEX_ROBOTS`, `INDEXABLE_DESIGN_STATUS`
 *   from `artifacts/marketplace/lib/dizajnIndexing.ts` (task 9.7).
 *
 * The single rule encoded in the module: only `completed` projects are
 * indexable. For any `Design_Project` whose `Generation_Status !== completed`:
 *   - its `Public_Page` emits `noindex` (Req 10.1):
 *       `designRobotsMetadata(status)` returns `NOINDEX_ROBOTS`, and
 *       `isIndexableDesignStatus(status)` is `false`.
 *   - it is absent from the `Sitemap` (Req 10.2) and from every
 *       `Aggregate_Page` listing (Req 10.3): it never appears in
 *       `selectSitemapDesignSlugs(candidates)`.
 * Conversely, a `completed` project with a non-empty slug is indexable
 * (`designRobotsMetadata` returns `undefined`) and is included in the
 * sitemap/aggregate selection.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import * as indexingNs from "../../../marketplace/lib/dizajnIndexing.js";

// `dizajnIndexing.ts` is authored as ESM but lives in the marketplace package,
// which has no `"type": "module"` (it's a Next.js app, CJS by default). Under
// the api-server ESM test loader its named exports may collapse onto the
// module's `default` (module.exports). Normalise both shapes so the pure
// predicates are accessed the same way regardless of loader.
type IndexingModule = typeof import("../../../marketplace/lib/dizajnIndexing.js");
const indexing = ((indexingNs as { default?: IndexingModule }).default ??
  (indexingNs as unknown as IndexingModule));
const {
  isIndexableDesignStatus,
  designRobotsMetadata,
  isSitemapEligibleDesign,
  selectSitemapDesignSlugs,
  NOINDEX_ROBOTS,
  INDEXABLE_DESIGN_STATUS,
} = indexing;

// ─── Generators ──────────────────────────────────────────────────────────────

// The full `DesignStatus` space (mirror of the union in marketplace/lib/types).
const ALL_DESIGN_STATUSES = [
  "draft",
  "generating",
  "completed",
  "failed",
  "private",
] as const;

// The single indexable status: only `completed` projects are public/indexable.
const INDEXABLE: string = INDEXABLE_DESIGN_STATUS; // "completed"

// Every other declared status is non-indexable.
const NON_INDEXABLE_STATUSES = ALL_DESIGN_STATUSES.filter(
  (s) => s !== INDEXABLE,
);

const designStatusArb = fc.constantFrom<string>(...ALL_DESIGN_STATUSES);

// Arbitrary junk strings — anything that is *not* the indexable status,
// including near-misses (casing, whitespace) and unrelated free text.
const junkStringArb = fc.string().filter((s) => s !== INDEXABLE);

// Full input space: known statuses ∪ arbitrary strings ∪ null/undefined.
const anyStatusArb = fc.oneof(
  designStatusArb,
  junkStringArb,
  fc.constant(null),
  fc.constant(undefined),
);

// Non-empty slug for completed candidates (sitemap inclusion requires it).
const nonEmptySlugArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.length > 0);

// A candidate whose status is guaranteed non-indexable.
const nonIndexableCandidateArb = fc.record({
  slug: fc.oneof(
    nonEmptySlugArb,
    fc.constant(""),
    fc.constant(null),
    fc.constant(undefined),
  ),
  status: fc.oneof(
    fc.constantFrom<string>(...NON_INDEXABLE_STATUSES),
    junkStringArb,
    fc.constant(null),
    fc.constant(undefined),
  ),
  resultImageUrl: fc.oneof(fc.webUrl(), fc.constant(null), fc.constant(undefined)),
});

// A completed candidate with a guaranteed non-empty slug → must be included.
const completedCandidateArb = fc.record({
  slug: nonEmptySlugArb,
  status: fc.constant(INDEXABLE),
  resultImageUrl: fc.oneof(fc.webUrl(), fc.constant(null), fc.constant(undefined)),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Indexing Property 14: non-completed projects are excluded everywhere", () => {
  // -----------------------------------------------------------------------
  // Property 14 (Req 10.1) — Public_Page noindex contract.
  // A non-completed project is never indexable, and its robots metadata is
  // exactly the NOINDEX directive.
  // -----------------------------------------------------------------------
  it("non-completed status → not indexable AND designRobotsMetadata returns NOINDEX_ROBOTS", () => {
    fc.assert(
      fc.property(anyStatusArb, (status) => {
        const indexable = isIndexableDesignStatus(status);
        const robots = designRobotsMetadata(status);
        if (status === INDEXABLE) {
          // completed → indexable, no robots key (indexable by default).
          assert.equal(indexable, true);
          assert.equal(robots, undefined);
        } else {
          // anything else → noindex.
          assert.equal(
            indexable,
            false,
            `status ${JSON.stringify(status)} must not be indexable`,
          );
          assert.deepStrictEqual(
            robots,
            NOINDEX_ROBOTS,
            `status ${JSON.stringify(status)} must emit NOINDEX_ROBOTS`,
          );
          // NOINDEX directive is concretely { index: false, follow: false }.
          assert.equal(robots!.index, false);
          assert.equal(robots!.follow, false);
        }
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 14 (Req 10.2 / 10.3) — a single non-completed candidate is
  // never sitemap/aggregate eligible regardless of slug presence.
  // -----------------------------------------------------------------------
  it("non-completed candidate is never sitemap/aggregate eligible", () => {
    fc.assert(
      fc.property(nonIndexableCandidateArb, (candidate) => {
        assert.equal(
          isSitemapEligibleDesign(candidate),
          false,
          `non-completed candidate must be excluded: ${JSON.stringify(candidate)}`,
        );
        assert.deepStrictEqual(
          selectSitemapDesignSlugs([candidate]),
          [],
          `non-completed candidate must not appear in selection: ${JSON.stringify(candidate)}`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 14 (positive) — a completed candidate with a non-empty slug is
  // eligible and present in the selection.
  // -----------------------------------------------------------------------
  it("completed candidate with non-empty slug → eligible AND included in selection", () => {
    fc.assert(
      fc.property(completedCandidateArb, (candidate) => {
        assert.equal(
          isSitemapEligibleDesign(candidate),
          true,
          `completed candidate must be eligible: ${JSON.stringify(candidate)}`,
        );
        assert.deepStrictEqual(
          selectSitemapDesignSlugs([candidate]),
          [candidate.slug],
          `completed candidate slug must be selected: ${JSON.stringify(candidate)}`,
        );
      }),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 14 (mixed lists) — across an arbitrary mix of completed and
  // non-completed candidates, the selection contains exactly the slugs of
  // the completed-with-non-empty-slug entries (order-preserving), and never
  // any non-completed slug.
  // -----------------------------------------------------------------------
  it("mixed list: selection contains exactly completed non-empty-slug entries, in order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(completedCandidateArb, nonIndexableCandidateArb), {
          maxLength: 40,
        }),
        (candidates) => {
          const selected = selectSitemapDesignSlugs(candidates);

          // Expected: completed candidates with a non-empty string slug,
          // preserving input order.
          const expected = candidates
            .filter(
              (c) =>
                c.status === INDEXABLE &&
                typeof c.slug === "string" &&
                c.slug.length > 0,
            )
            .map((c) => c.slug as string);

          assert.deepStrictEqual(selected, expected);

          // Defensive: no slug from a non-completed candidate ever appears.
          const nonCompletedSlugs = new Set(
            candidates
              .filter((c) => c.status !== INDEXABLE)
              .map((c) => c.slug)
              .filter((s): s is string => typeof s === "string" && s.length > 0),
          );
          for (const slug of selected) {
            // A completed entry could legitimately share a slug value with a
            // non-completed one; only assert that every selected slug came
            // from a completed entry. The deepStrictEqual above already pins
            // exact membership, so this is a redundant sanity guard.
            assert.ok(
              candidates.some(
                (c) => c.status === INDEXABLE && c.slug === slug,
              ),
              `selected slug ${JSON.stringify(slug)} must originate from a completed candidate`,
            );
          }
          void nonCompletedSlugs;
        },
      ),
      { numRuns: 200 },
    );
  });
});
