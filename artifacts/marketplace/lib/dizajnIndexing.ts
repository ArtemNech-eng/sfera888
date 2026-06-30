/**
 * Pure indexing/inclusion predicates for the AI-designer SEO surface
 * (`/dizajn/[slug]` metadata, `app/sitemap.ts`, and the `Aggregate_Page`
 * listings).
 *
 * This module is intentionally **pure** and free of server-only imports
 * (no `next/*`, no `lib/api`, no React) so the indexing/sitemap property tests
 * (ai-design-flagship, Property 14 & Property 17) can import and exercise it
 * deterministically without dragging in the Next.js request machinery or the
 * marketplace API.
 *
 * The single rule encoded here: **only `completed` projects are indexable.**
 *
 *   • Property 14 — *Non-completed projects are excluded from indexing
 *     everywhere*: a project whose `Generation_Status ≠ completed` emits
 *     `noindex` on its `Public_Page`, is absent from the `Sitemap`, and is
 *     absent from every `Aggregate_Page` listing (Req 9.6, 9.7, 10.1, 10.2,
 *     10.3).
 *
 *   • Property 17 — *Completed projects persist in the sitemap despite
 *     transient unavailability*: a `completed` project stays in the
 *     published-design set used to build the `Sitemap` regardless of whether
 *     its result assets are momentarily unreachable. Sitemap membership depends
 *     on **status, not on asset reachability** (Req 10.5).
 */

/** The one and only `Generation_Status` that is eligible for indexing. */
export const INDEXABLE_DESIGN_STATUS = "completed" as const;

/**
 * `robots` directive emitted for non-indexable design pages. Kept as a shared
 * constant so the `noindex` contract is identical across the metadata, the 404
 * path, and the unresolved-design path in `app/dizajn/[slug]/page.tsx`.
 */
export const NOINDEX_ROBOTS: { index: false; follow: false } = {
  index: false,
  follow: false,
};

/**
 * Indexing decision for a single design: a project is indexable **iff** its
 * generation status is exactly `completed`. Accepts any string (including
 * unknown/garbage statuses) and `null`/`undefined` so callers and the
 * property test can probe the full status space (Property 14).
 */
export function isIndexableDesignStatus(status: string | null | undefined): boolean {
  return status === INDEXABLE_DESIGN_STATUS;
}

/**
 * `robots` metadata to attach to a `Public_Page` given its generation status.
 *
 * Returns the `noindex` directive for every non-`completed` status, and
 * `undefined` for `completed` — meaning the page omits the `robots` key
 * entirely and is therefore indexable by default. Returning `undefined` (rather
 * than `{ index: true, follow: true }`) preserves the exact completed-project
 * metadata value contract established by task 9.5.
 */
export function designRobotsMetadata(
  status: string | null | undefined,
): typeof NOINDEX_ROBOTS | undefined {
  return isIndexableDesignStatus(status) ? undefined : NOINDEX_ROBOTS;
}

/**
 * A minimal projection of a design used to decide sitemap/aggregate membership.
 * `resultImageUrl` (and any other asset field) is intentionally part of the
 * shape but **never consulted** by the predicate — that independence is exactly
 * what Property 17 pins down.
 */
export interface SitemapDesignCandidate {
  slug?: string | null;
  status?: string | null;
  /** Asset reachability — intentionally ignored by the inclusion predicate. */
  resultImageUrl?: string | null;
}

/**
 * Sitemap / aggregate inclusion predicate.
 *
 * A design is included **iff** it has a non-empty slug *and* its status is
 * `completed`. The decision depends solely on `slug` + `status`; transient
 * unavailability of `resultImageUrl` (or any other asset) does not remove a
 * `completed` project from the set (Property 17, Req 10.5).
 */
export function isSitemapEligibleDesign(candidate: SitemapDesignCandidate): boolean {
  return (
    typeof candidate.slug === "string" &&
    candidate.slug.length > 0 &&
    isIndexableDesignStatus(candidate.status)
  );
}

/**
 * Select the slugs of all sitemap/aggregate-eligible designs, preserving input
 * order. Non-completed projects and entries with empty slugs are dropped
 * (Property 14); completed projects survive regardless of asset reachability
 * (Property 17).
 */
export function selectSitemapDesignSlugs(candidates: SitemapDesignCandidate[]): string[] {
  return candidates.filter(isSitemapEligibleDesign).map((c) => c.slug as string);
}
