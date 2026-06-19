import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "../../../../../lib/env";

/**
 * POST /api/dizajn/[slug]/lead — создать лид «Хочу такой же» с pre-fill из
 * дизайна (city, room, style metadata передаются api-server'ом из designs row).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${internalApiBase().replace(/\/+$/, "")}/marketplace/dizajn/${encodeURIComponent(slug)}/lead`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalApiToken()}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "upstream_unreachable" }, { status: 502, headers: NO_STORE });
  }

  const responseBody = await upstream.json().catch(() => ({ ok: false, error: "upstream_error" }));
  return NextResponse.json(responseBody, { status: upstream.status, headers: NO_STORE });
}
