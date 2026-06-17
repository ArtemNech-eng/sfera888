/**
 * Cabinet photo URL resolver.
 *
 * The api-server stores photo URLs as one of:
 *   • absolute https URL (legacy or external) — return as-is
 *   • `/api/storage/...` (already proxy-prefixed)
 *   • `/objects/...` (raw GCS path used by the older master-pwa upload helper)
 *
 * For cabinet pages we always render images through `/api/storage/[...path]`
 * (defined under app/api/storage), which proxies to api-server's GCS bucket
 * with the user's session for ACL checks.
 *
 * Mirrors `resolvePhotoUrl` from master-pwa/src/lib/api.ts so the port
 * preserves call sites.
 */
export function resolvePhotoUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}
