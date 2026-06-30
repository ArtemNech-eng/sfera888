// Feature: ai-design-flagship, Property 17: Completed projects persist in the sitemap despite transient unavailability
/**
 * Property test for sitemap robustness of completed designs.
 *
 * Property 17: Completed projects persist in the sitemap despite transient
 * unavailability.
 *
 * **Validates: Requirements 10.5**
 *
 * Module under test (pure predicates, no Next.js / server runtime needed):
 *   - `isSitemapEligibleDesign(candidate)`
 *   - `selectSitemapDesignSlugs(candidates)`
 *   from `artifacts/marketplace/lib/dizajnIndexing.ts` (task 9.7).
 *
 * Requirement 10.5: a `completed` Design_Project remains in the published-design
 * set used to build the `Sitemap` regardless of whether its result assets are
 * momentarily unreachable. Sitemap membership depends on **status (+ a usable
 * slug), not on asset reachability** — the candidate's `resultImageUrl` must be
 * completely ignored by the inclusion predicate.
 *
 * The properties:
 *   1. For any `completed` candidate with a non-empty slug, it is eligible and
 *      its slug is selected — across every shape of `resultImageUrl`
 *      (null / undefined / empty / garbage / valid).
 *   2. Inclusion is invariant under changes to `resultImageUrl` alone: mutating
 *      only the asset URL never changes eligibility.
 *   3. Only status (+ slug presence) drives inclusion: non-`completed` statuses
 *      are never eligible even with a perfectly valid asset URL.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import * as indexingNs from "../../../marketplace/lib/dizajnIndexing.ts";

// `dizajnIndexing.ts` is authored as ESM but lives in the marketplace package,
// which has no `"type": "module"` (it's a Next.js app, CJS by default). Under
// the api-server ESM test loader its named exports may collapse onto the
// module's `default` (module.exports). Normalise both shapes so the pure
// helpers are accessed the same way regardless of how the loader resolves them.
type IndexingModule = typeof import("../../../marketplace/lib/dizajnIndexing.ts");
const indexing = ((indexingNs as { default?: IndexingModule }).default ??
  (indexingNs as unknown as IndexingModule));
const {
  isSitemapEligibleDesign,
  selectSitemapDesignSlugs,
  INDEXABLE_DESIGN_STATUS,
} = indexing;

type SitemapDesignCandidate = Parameters<IndexingModule["isSitemapEligibleDesign"]>[0];

// ─── Generators ──────────────────────────────────────────────────────────────

// The one indexable status.
const COMPLETED = INDEXABLE_DESIGN_STATUS; // "completed"

// Non-empty slug: any non-empty string (the predicate requires length > 0).
const nonEmptySlugArb = fc.string({ minLength: 1 });

// The full `resultImageUrl` space the predicate must ignore: missing fields,
// null, empty string, arbitrary garbage, and a plausibly valid URL.
const resultImageUrlArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(""),
  fc.string(), // arbitrary garbage
  fc.webUrl(), // valid-looking URL
);

// A variety of non-completed statuses (declared + junk + nullish).
const nonCompletedStatusArb = fc
  .oneof(
    fc.constantFrom("draft", "generating", "failed", "private"),
    fc.string(),
    fc.constant(null),
    fc.constant(undefined),
  )
  .filter((s) => s !== COMPLETED);

// A completed candidate with a non-empty slug and an arbitrary asset URL.
const completedCandidateArb: fc.Arbitrary<SitemapDesignCandidate> = fc.record({
  slug: nonEmptySlugArb,
  status: fc.constant(COMPLETED),
  resultImageUrl: resultImageUrlArb,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Sitemap Property 17: completed projects persist despite transient asset unavailability", () => {
  // -----------------------------------------------------------------------
  // Property 17 (core) — a completed project with a slug is always eligible,
  // regardless of result asset reachability.
  // Validates: Requirements 10.5
  // -----------------------------------------------------------------------
  it("keeps every completed+slugged candidate eligible across all resultImageUrl shapes", () => {
    fc.assert(
      fc.property(completedCandidateArb, (candidate) => {
        assert.equal(
          isSitemapEligibleDesign(candidate),
          true,
          `completed candidate ${JSON.stringify(candidate)} must remain eligible ` +
            `regardless of resultImageUrl`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 17 (selection) — the slug of every completed candidate appears in
  // the selected sitemap slug set, regardless of asset reachability.
  // Validates: Requirements 10.5
  // -----------------------------------------------------------------------
  it("includes every completed candidate's slug in selectSitemapDesignSlugs", () => {
    fc.assert(
      fc.property(fc.array(completedCandidateArb, { maxLength: 25 }), (candidates) => {
        const selected = selectSitemapDesignSlugs(candidates);
        // Every completed candidate's slug must survive selection, in order.
        const expected = candidates.map((c) => c.slug as string);
        assert.deepEqual(
          selected,
          expected,
          `all completed slugs must persist in the sitemap set`,
        );
      }),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 17 (invariance) — mutating ONLY resultImageUrl never changes the
  // inclusion decision: membership is independent of asset reachability.
  // Validates: Requirements 10.5
  // -----------------------------------------------------------------------
  it("is invariant under changes to resultImageUrl alone", () => {
    fc.assert(
      fc.property(
        nonEmptySlugArb,
        fc.oneof(fc.constant(COMPLETED), nonCompletedStatusArb),
        resultImageUrlArb,
        resultImageUrlArb,
        (slug, status, urlA, urlB) => {
          const a: SitemapDesignCandidate = {
            slug,
            status: status as SitemapDesignCandidate["status"],
            resultImageUrl: urlA as SitemapDesignCandidate["resultImageUrl"],
          };
          const b: SitemapDesignCandidate = {
            slug,
            status: status as SitemapDesignCandidate["status"],
            resultImageUrl: urlB as SitemapDesignCandidate["resultImageUrl"],
          };
          assert.equal(
            isSitemapEligibleDesign(a),
            isSitemapEligibleDesign(b),
            `eligibility must not depend on resultImageUrl ` +
              `(${JSON.stringify(urlA)} vs ${JSON.stringify(urlB)})`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 17 (status-driven) — only status (+ slug) drives inclusion: a
  // non-completed candidate is never eligible even with a perfectly valid asset.
  // Validates: Requirements 10.5
  // -----------------------------------------------------------------------
  it("excludes non-completed candidates even with a valid resultImageUrl", () => {
    fc.assert(
      fc.property(
        nonEmptySlugArb,
        nonCompletedStatusArb,
        fc.webUrl(),
        (slug, status, validUrl) => {
          const candidate: SitemapDesignCandidate = {
            slug,
            status: status as SitemapDesignCandidate["status"],
            resultImageUrl: validUrl,
          };
          assert.equal(
            isSitemapEligibleDesign(candidate),
            false,
            `non-completed status ${JSON.stringify(status)} must be excluded ` +
              `even with a valid asset URL`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
