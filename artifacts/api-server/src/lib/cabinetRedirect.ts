/**
 * Дорожка M — слияние кабинетов (spec: `.kiro/specs/real-price`, Req 11 / 10.3).
 *
 * Pure path mapping from the legacy master-PWA SPA (`sfera-master.ru/master-pwa/*`,
 * static Vite app) to the unified Zen cabinet (marketplace `/cabinet/*`). Used by
 * an OPT-IN redirect in `app.ts` (env `UNIFY_CABINET_REDIRECT`, default off) so
 * old bookmarks and push deep-links (`/master-pwa/orders`) land on the matching
 * cabinet screen once the team flips the switch — without touching the fragile
 * static-serving path when the flag is off.
 *
 * Dependency-free → unit-tested under `node:test`.
 */

/** Cabinet route segments that have a 1:1 legacy counterpart. */
const KNOWN_CABINET_SEGMENTS: ReadonlySet<string> = new Set([
  "orders",
  "chat",
  "balance",
  "wallet",
  "profile",
  "dashboard",
  "objects",
  "checkin",
  "portfolio",
  "schedule",
  "analytics",
]);

/**
 * Map a path relative to the `/master-pwa` mount to a unified-cabinet path.
 *
 * Examples:
 *   "/orders"      → "/cabinet/orders"
 *   "" | "/"       → "/cabinet"          (home feed)
 *   "/login"       → "/login"            (cabinet auth lives at site root)
 *   "/work-rules"  → "/cabinet"          (no direct counterpart)
 *   "/assets/x.js" → "/cabinet"          (assets never redirected in practice)
 */
export function mapMasterPwaPathToCabinet(rest: string): string {
  const clean = (rest || "/").split("?")[0]!.split("#")[0]!.replace(/\/+$/, "");
  const seg = clean.replace(/^\/+/, "").split("/")[0] ?? "";
  if (seg === "") return "/cabinet";
  if (seg === "login") return "/login";
  if (KNOWN_CABINET_SEGMENTS.has(seg)) return `/cabinet/${seg}`;
  return "/cabinet";
}
