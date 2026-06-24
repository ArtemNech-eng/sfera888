import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "../../../../../lib/env";

/**
 * GET /api/dizajn/[slug]/pdf — proxy скачивания PDF-сводки дизайна
 * (Requirements 13.1, 13.2, 13.5, 13.6).
 *
 * Стримит бинарь upstream'а с `Content-Type: application/pdf` и
 * `Content-Disposition: attachment`. На 503 от api-server (рендер
 * временно недоступен / soft-lock / ошибка зависимостей) возвращаем
 * JSON `{ok:false, error:"pdf_temporarily_unavailable"}` — фронт
 * (`DesignBoard.tsx`) распознаёт этот код и заменяет кнопку на пометку
 * «PDF временно недоступен» (Requirement 13.6).
 *
 * Кэш: no-store (lazy-render может занять 5–10 секунд, и кэшировать
 * 503 по дороге не нужно).
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
      `${internalApiBase().replace(/\/+$/, "")}/marketplace/dizajn/${encodeURIComponent(slug)}/pdf`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${internalApiToken()}`,
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

  // 503 — pdf_temporarily_unavailable (Requirement 13.6). Тело — JSON.
  if (upstream.status === 503) {
    const body = await upstream
      .json()
      .catch(() => ({ ok: false, error: "pdf_temporarily_unavailable" }));
    return NextResponse.json(body, { status: 503, headers: NO_STORE });
  }

  // Любая другая не-OK — пробрасываем JSON ошибки (404 not_found, 500 etc.).
  if (!upstream.ok) {
    const body = await upstream
      .json()
      .catch(() => ({ ok: false, error: "upstream_error" }));
    return NextResponse.json(body, { status: upstream.status, headers: NO_STORE });
  }

  // OK — стримим бинарь. `upstream.body` — ReadableStream<Uint8Array>;
  // отдаём его напрямую, чтобы не буферизовать весь PDF в памяти.
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="design-${slug}.pdf"`,
    "Cache-Control": "no-store",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(upstream.body, { status: 200, headers });
}
