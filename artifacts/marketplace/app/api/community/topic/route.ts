import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { internalApiBase, internalApiToken } from "../../../../lib/env";

/**
 * POST /api/community/topic — публикация темы Local_Feed (уровень доступа 3).
 *
 * Браузер POST'ит `{ category, title, body }`; форвардим на
 * `${INTERNAL_API_BASE_URL}/community/feeds/zhk` с Bearer-токеном (остаётся на
 * сервере — Requirement 20.6) и `X-Community-Account-Id`. Тема привязывается к
 * ЖК аккаунта на момент публикации на стороне api-server (Requirement 3.2).
 *
 * Уровень 3 гейтится cookie `kiro_community_account_id` (Phone_Verification,
 * задача 8.x). Нет cookie → 401 `verification_required` (Requirement 11.1/11.3).
 *
 * При отклонении бэкенд сохраняет введённые данные как черновик и возвращает
 * `draftId` — ввод не теряется (Requirements 3.4, 3.5). Мы пробрасываем
 * `reason`/`draftId` клиенту, чтобы форма показала причину и не потеряла ввод.
 *
 * Стабильный JSON-контракт (всегда `Cache-Control: no-store`):
 *   • 201 { ok: true, status: "created", thread }
 *   • 4xx { ok: false, error: <label>, reason?, draftId? }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const ACCOUNT_COOKIE = "kiro_community_account_id";

/** Категории Local_Feed — whitelist, чтобы не форвардить произвольные строки. */
const ALLOWED_CATEGORIES: ReadonlySet<string> = new Set([
  "utility_incident",
  "developer_defect",
  "tool_sharing",
  "local_recommendation",
]);

interface ClientPayload {
  category?: unknown;
  title?: unknown;
  body?: unknown;
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error, ...(extra ?? {}) },
    { status, headers: NO_STORE },
  );
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  const accountId = store.get(ACCOUNT_COOKIE)?.value;
  if (!accountId || !/^\d+$/.test(accountId)) {
    return jsonError(401, "verification_required");
  }

  let payload: ClientPayload;
  try {
    payload = (await req.json()) as ClientPayload;
  } catch {
    return jsonError(400, "invalid_json");
  }

  // Light client-side validation; api-server is the source of truth and will
  // persist a draft on rejection (R3.4). We still forward the raw values so
  // the backend can save exactly what the user typed.
  const category = typeof payload.category === "string" ? payload.category : "";
  const title = typeof payload.title === "string" ? payload.title : "";
  const bodyText = typeof payload.body === "string" ? payload.body : "";

  if (!ALLOWED_CATEGORIES.has(category)) {
    return jsonError(400, "validation_error", { reason: "invalid_category" });
  }

  let res: Response;
  try {
    res = await fetch(`${internalApiBase().replace(/\/+$/, "")}/community/feeds/zhk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalApiToken()}`,
        "X-Community-Account-Id": accountId,
      },
      body: JSON.stringify({ category, title, body: bodyText }),
      cache: "no-store",
    });
  } catch {
    return jsonError(502, "upstream_unreachable");
  }

  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : null;

  if (res.status === 201) {
    return NextResponse.json({ ok: true, ...(body ?? {}) }, { status: 201, headers: NO_STORE });
  }

  const label =
    body && typeof body.error === "string"
      ? body.error
      : res.status === 403
        ? "verification_required"
        : "upstream_error";
  const extra: Record<string, unknown> = {};
  if (body && typeof body.reason === "string") extra.reason = body.reason;
  if (body && (typeof body.draftId === "number" || body.draftId === null)) extra.draftId = body.draftId;
  return jsonError(res.status, label, extra);
}
