import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "../../../../../lib/env";

/**
 * GET /api/dizajn/[slug]/status — лёгкий polling-proxy для UI прогресс-бара
 * (Requirements 5.3, 5.4, 5.5, 5.6).
 *
 * Используется client-side в `DesignBoard.tsx` каждые 3 секунды, пока
 * `status='generating'`. Возвращает только {status, progress, currentStep,
 * errorMessage} — без heavy joins и инкремента счётчиков.
 *
 * Кэш: no-store (статус меняется generating → completed/failed).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "missing_slug" },
      { status: 400, headers: NO_STORE },
    );
  }

  const cookieHeader = req.headers.get("cookie") ?? "";

  let upstream: Response;
  try {
    upstream = await fetch(
      `${internalApiBase().replace(/\/+$/, "")}/marketplace/dizajn/${encodeURIComponent(slug)}/status`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${internalApiToken()}`,
          Accept: "application/json",
          Cookie: cookieHeader,
        },
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "upstream_unreachable" },
      { status: 502, headers: NO_STORE },
    );
  }

  const body = await upstream.json().catch(() => ({ ok: false, error: "upstream_error" }));
  return NextResponse.json(body, { status: upstream.status, headers: NO_STORE });
}
