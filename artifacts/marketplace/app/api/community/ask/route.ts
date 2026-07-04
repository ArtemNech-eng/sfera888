import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "../../../../lib/env";

/**
 * POST /api/community/ask — анонимный «народный вопрос» (Ask_Anything).
 *
 * SEO/UGC-поток низкого трения: НЕ требует cookie/сессии и подтверждения
 * телефона (в отличие от `/api/community/topic`). Браузер POST'ит
 * `{ zhkSlug | citySlug, category?, title, body? }`; форвардим на
 * `${INTERNAL_API_BASE_URL}/community/feeds/ask` с Bearer-токеном (остаётся на
 * сервере — Requirement 20.6). Анти-спам — rate limit по IP на стороне api-server.
 *
 * Стабильный JSON-контракт (всегда `Cache-Control: no-store`):
 *   • 201 { ok: true, status: "created", thread }
 *   • 4xx { ok: false, error: <label>, reason? }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

interface ClientPayload {
  zhkSlug?: unknown;
  citySlug?: unknown;
  category?: unknown;
  title?: unknown;
  body?: unknown;
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  let payload: ClientPayload;
  try {
    payload = (await req.json()) as ClientPayload;
  } catch {
    return jsonError(400, "invalid_json");
  }

  const zhkSlug = typeof payload.zhkSlug === "string" ? payload.zhkSlug.trim() : "";
  const citySlug = typeof payload.citySlug === "string" ? payload.citySlug.trim() : "";
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const bodyText = typeof payload.body === "string" ? payload.body : "";
  const category = typeof payload.category === "string" ? payload.category : undefined;

  if (!zhkSlug && !citySlug) {
    return jsonError(400, "validation_error", { reason: "no_target" });
  }
  if (title.length < 1 || title.length > 200) {
    return jsonError(400, "validation_error", { reason: "invalid_title" });
  }

  let res: Response;
  try {
    res = await fetch(`${internalApiBase().replace(/\/+$/, "")}/community/feeds/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalApiToken()}`,
      },
      body: JSON.stringify({ zhkSlug, citySlug, category, title, body: bodyText }),
      cache: "no-store",
    });
  } catch {
    return jsonError(502, "upstream_unreachable");
  }

  const ct = res.headers.get("content-type") ?? "";
  const parsed = ct.includes("application/json") ? await res.json().catch(() => null) : null;

  if (res.status === 201) {
    return NextResponse.json({ ok: true, ...(parsed ?? {}) }, { status: 201, headers: NO_STORE });
  }

  const label =
    parsed && typeof parsed.error === "string"
      ? parsed.error
      : res.status === 429
        ? "rate_limited"
        : "upstream_error";
  const extra: Record<string, unknown> = {};
  if (parsed && typeof parsed.reason === "string") extra.reason = parsed.reason;
  return jsonError(res.status, label, extra);
}
