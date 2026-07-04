import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { internalApiBase, internalApiToken } from "../../../../../../lib/env";

/**
 * POST /api/community/threads/[id]/comments — публикация комментария к теме.
 *
 * Браузер POST'ит `{ body, parentCommentId? }`; форвардим на
 * `${INTERNAL_API_BASE_URL}/community/threads/:id/comments` с Bearer-токеном
 * (остаётся на сервере — Requirement 20.6). Cookie `kiro_community_account_id`
 * НЕОБЯЗАТЕЛЬНА: если есть — прокидываем `X-Community-Account-Id` (авторство
 * привяжется к аккаунту), если нет — комментарий публикуется анонимно.
 * Верификация телефона больше не требуется (SEO/UGC-поток низкого трения).
 *
 * Стабильный JSON-контракт (всегда `Cache-Control: no-store`):
 *   • 201 { ok: true, status: "created", comment }
 *   • 4xx { ok: false, error: <label>, reason? }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const ACCOUNT_COOKIE = "kiro_community_account_id";

interface ClientPayload {
  body?: unknown;
  parentCommentId?: unknown;
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return jsonError(404, "not_found");

  const store = await cookies();
  const accountId = store.get(ACCOUNT_COOKIE)?.value;
  const hasAccount = !!accountId && /^\d+$/.test(accountId);

  let payload: ClientPayload;
  try {
    payload = (await req.json()) as ClientPayload;
  } catch {
    return jsonError(400, "invalid_json");
  }

  const body = typeof payload.body === "string" ? payload.body : "";
  if (body.trim().length === 0) {
    return jsonError(400, "validation_error", { reason: "invalid_body" });
  }
  const parentCommentId =
    typeof payload.parentCommentId === "number" && Number.isInteger(payload.parentCommentId)
      ? payload.parentCommentId
      : null;

  let res: Response;
  try {
    res = await fetch(
      `${internalApiBase().replace(/\/+$/, "")}/community/threads/${id}/comments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalApiToken()}`,
          ...(hasAccount ? { "X-Community-Account-Id": accountId! } : {}),
        },
        body: JSON.stringify({ body, parentCommentId }),
        cache: "no-store",
      },
    );
  } catch {
    return jsonError(502, "upstream_unreachable");
  }

  const ct = res.headers.get("content-type") ?? "";
  const parsed = ct.includes("application/json") ? await res.json().catch(() => null) : null;

  if (res.status === 201) {
    return NextResponse.json({ ok: true, ...(parsed ?? {}) }, { status: 201, headers: NO_STORE });
  }

  const label =
    parsed && typeof parsed.error === "string" ? parsed.error : "upstream_error";
  const extra: Record<string, unknown> = {};
  if (parsed && typeof parsed.reason === "string") extra.reason = parsed.reason;
  return jsonError(res.status, label, extra);
}
