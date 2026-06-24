import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "../../../../lib/env";

/**
 * GET /api/dizajn/mine — proxy на api-server для списка AI-дизайнов
 * текущего анонимного посетителя (Requirements 4.3, 4.7).
 *
 * Owner-id берётся api-server'ом из cookie `kiro_anon_id` через
 * `anonIdMiddleware`. Чтобы middleware увидел cookie, мы пробрасываем
 * входящий заголовок `Cookie` на upstream без изменений.
 *
 * Кэш: no-store (per-visitor data).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") ?? "";

  let upstream: Response;
  try {
    upstream = await fetch(
      `${internalApiBase().replace(/\/+$/, "")}/marketplace/dizajn/mine`,
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
