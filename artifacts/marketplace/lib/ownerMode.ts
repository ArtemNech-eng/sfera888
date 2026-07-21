/**
 * Feature: real-price, Task 5.4 — Owner_Mode на публичных страницах владельца.
 *
 * Pure, DOM-free logic for deciding whether the current visitor owns the public
 * page they're looking at (`/master/{slug}`, `/raboty/{slug}`) and, if so, what
 * inline controls to surface. Same client-side rationale as task 5.5
 * (`lib/headerSession.ts`): ownership is resolved AFTER hydration so the public
 * pages keep their cacheable/SSR output and SEO is untouched.
 *
 * Two ownership signals, by page:
 *   • `/master/{slug}` and legacy `/raboty/{slug}` portfolio — the public DTO
 *     exposes the owner's numeric master id, so we match it against the session
 *     master id (`matchesMaster`).
 *   • `/raboty/{slug}` object case — the public DTO deliberately OMITS masterId
 *     (privacy, Req 9). Instead we check membership: the object's `slug` appears
 *     in the master's own `/api/cabinet/objects` list (`findOwnedObjectBySlug`),
 *     which also yields the `orderId` for the edit deep-link.
 *
 * Validates: Requirement 10.2 (Owner_Mode inline-контролы на публичных
 * страницах владельца).
 */

/** Minimal shape of a master's own object needed to render the owner bar. */
export interface OwnedObjectLite {
  slug: string | null;
  orderId: number;
  isPublished: boolean;
}

/**
 * True only when both ids are finite numbers and equal. Guards against
 * `null`/`undefined`/string ids from malformed payloads so the owner bar never
 * shows to the wrong (or anonymous) visitor.
 */
export function matchesMaster(sessionMasterId: unknown, ownerMasterId: unknown): boolean {
  return (
    typeof sessionMasterId === "number" &&
    Number.isFinite(sessionMasterId) &&
    typeof ownerMasterId === "number" &&
    Number.isFinite(ownerMasterId) &&
    sessionMasterId === ownerMasterId
  );
}

/**
 * Find the master's own object whose slug matches the current case page.
 * Returns `null` for empty input, a blank target, or no match. Objects with a
 * null slug (drafts not yet published) never match a public page slug.
 */
export function findOwnedObjectBySlug<T extends { slug: string | null }>(
  items: readonly T[] | null | undefined,
  slug: string,
): T | null {
  const target = slug.trim();
  if (!items || target.length === 0) return null;
  for (const item of items) {
    if (typeof item.slug === "string" && item.slug.trim() === target) return item;
  }
  return null;
}

/** Deep-link to the object editor for a given order (edit lives on the order,
 *  per `/cabinet/objects` → `/cabinet/orders/{orderId}/object`). */
export function caseEditHref(orderId: number): string {
  return `/cabinet/orders/${orderId}/object`;
}
