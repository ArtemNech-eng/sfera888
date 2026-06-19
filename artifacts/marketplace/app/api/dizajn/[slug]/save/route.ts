import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { internalApiBase, internalApiToken } from "../../../../../lib/env";

/**
 * POST /api/dizajn/[slug]/save — toggle save для AI-дизайна (anon-id).
 *
 * Mirror /api/raboty/[slug]/save: cookie management для kiro_anon_id +
 * forward-call в api-server.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "kiro_anon_id";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400, headers: NO_STORE });
  }

  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  const anonId = existing && UUID_RE.test(existing) ? existing : crypto.randomUUID();

  let upstream: Response;
  try {
    upstream = await fetch(
      `${internalApiBase().replace(/\/+$/, "")}/marketplace/dizajn/${encodeURIComponent(slug)}/save`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalApiToken()}`,
        },
        body: JSON.stringify({ anonId }),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "upstream_unreachable" }, { status: 502, headers: NO_STORE });
  }

  const response = upstream.ok
    ? NextResponse.json(await upstream.json(), { status: 200, headers: NO_STORE })
    : NextResponse.json(
        await upstream.json().catch(() => ({ ok: false, error: "upstream_error" })),
        { status: upstream.status, headers: NO_STORE },
      );

  if (!existing || !UUID_RE.test(existing)) {
    response.cookies.set({
      name: COOKIE_NAME,
      value: anonId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }

  return response;
}
