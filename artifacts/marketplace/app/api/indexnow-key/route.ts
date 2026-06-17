import { NextResponse } from "next/server";

/**
 * IndexNow key verification endpoint.
 *
 * IndexNow protocol (used by Yandex, Bing, Naver) requires that we host a
 * file at a stable URL containing our key. Search engines hit this URL to
 * verify ownership before accepting URL submissions.
 *
 * We expose the key at a non-conflicting path (`/api/indexnow-key`) and
 * pass that URL as the `keyLocation` field when submitting URLs to the
 * IndexNow API. This avoids routing collisions with our dynamic
 * `[serviceSlug]` pages that would otherwise eat `/{key}.txt` requests.
 *
 * Plan: see MARKETPLACE_PRODUCTION_PLAN.md §11.8.7.
 *
 * The same INDEXNOW_KEY env must also be set on api-server (which actually
 * pings the IndexNow endpoints). When the env is missing we return 404 so
 * the feature is "off by default" in environments that haven't configured
 * it yet — matches the rest of our marketplace defaults.
 */

export const dynamic = "force-dynamic";
export const revalidate = false;

export function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key || key.length === 0) {
    return new NextResponse("indexnow not configured", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  // Plain text body equal to the key — exactly what the IndexNow spec
  // expects from the verification file.
  return new NextResponse(key, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
