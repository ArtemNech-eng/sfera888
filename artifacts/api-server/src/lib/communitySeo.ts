/**
 * communitySeo — SEO_Service helpers for the «ХочуТакже» community layer.
 *
 * Single source of truth for the PRO_Protected_Layer noindex policy.
 *
 * Requirement 7.2 / 7.3: every PRO_Protected_Layer response (verified-only
 * sensitive content — client black-lists, PII, object disputes) must ALWAYS
 * emit `X-Robots-Tag: noindex` and be excluded from the sitemap. Public
 * Sosedi_Zone and PRO_Public_Layer paths must stay crawlable.
 *
 * This module is intentionally PURE (no `@workspace/db`, no Express imports)
 * so it is trivially unit- and property-testable and can be shared between the
 * Express `X-Robots-Tag` middleware (`src/app.ts`) and any future community
 * route or sitemap generator without divergence.
 *
 * Zone → index policy summary (design.md, SEO_Service.zoneIndexPolicy):
 *   - `sosedi`        → index + sitemap
 *   - `pro_public`    → index + sitemap
 *   - `pro_protected` → noindex, excluded from sitemap  ← enforced here
 */

/**
 * Path patterns for PRO_Protected_Layer URLs that must always be noindex and
 * excluded from the sitemap.
 *
 * Only the `/protected` segment is matched, so sibling public paths
 * (`/pro/:specialty`, `/marketplace/pro/:specialty`, `/goroda/:city`,
 * `/zhk/:slug`) remain indexable.
 *
 * Covered shapes:
 *   - api-server route:  `/api/community/pro/protected` (and any sub-path)
 *   - facade routes:     `/marketplace/pro/:specialty/protected`
 *                        `/pro/:specialty/protected`
 *
 * The `(\/|$)` tail matches both the exact path and any nested sub-path while
 * refusing partial-segment matches (e.g. `/pro/foo/protectedX` must NOT match).
 */
export const PROTECTED_NOINDEX_PATTERNS: readonly RegExp[] = [
  /^\/api\/community\/pro\/protected(\/|$)/,
  /^\/marketplace\/pro\/[^/]+\/protected(\/|$)/,
  /^\/pro\/[^/]+\/protected(\/|$)/,
];

/**
 * Pure predicate: does the given URL path belong to the PRO_Protected_Layer
 * and therefore require `X-Robots-Tag: noindex` + sitemap exclusion?
 *
 * @param path  URL path (as provided by Express `req.path`), e.g.
 *              `/pro/plitochnik/protected` or `/marketplace/pro/x/protected/42`.
 * @returns `true` when the path is a protected (noindex) path, `false` for any
 *          public/indexable path.
 */
export function isProtectedNoindexPath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  return PROTECTED_NOINDEX_PATTERNS.some((rx) => rx.test(path));
}
