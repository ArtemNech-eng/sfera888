import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "../../../../lib/env";

/**
 * GET /api/dizajn/[slug] — proxy on api-server для polling статуса генерации.
 * Используется client-side `useDesignPolling` хуком в /dizajn/[slug] page.
 *
 * Кэш: no-store (данные могут меняться status='generating' → 'completed').
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

  // Пробрасываем anon-id (если есть) как query — api-server вернёт
  // `isSavedByCurrentUser` для текущего гостя. Нужно, чтобы SaveButton
  // мог догидрировать saved-state на ISR-кэшированной странице.
  const anonId = req.cookies.get("kiro_anon_id")?.value;
  const qs = anonId ? `?anonId=${encodeURIComponent(anonId)}` : "";

  let upstream: Response;
  try {
    upstream = await fetch(
      `${internalApiBase().replace(/\/+$/, "")}/marketplace/dizajn/${encodeURIComponent(slug)}${qs}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${internalApiToken()}`,
          Accept: "application/json",
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
