import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { internalApiBase, internalApiToken } from "../../../../lib/env";

/**
 * POST /api/community/zhk — создание нового ЖК жителем (уровень доступа 3).
 *
 * Браузер POST'ит сюда JSON `{ name, citySlug }`; мы форвардим его на
 * `${INTERNAL_API_BASE_URL}/community/geo/zhk` с Bearer-токеном (токен остаётся
 * на сервере — Requirement 20.6) и заголовком `X-Community-Account-Id`,
 * идентифицирующим публикующий Community_Account.
 *
 * Уровень 3 гейтится на клиенте наличием сессии сообщества: id аккаунта хранится
 * в HTTP-only cookie `kiro_community_account_id` (её выставляет флоу
 * Phone_Verification, задача 8.x). Если cookie нет — публикация невозможна:
 * возвращаем 401 `verification_required`, клиент показывает предложение
 * подтвердить телефон (Requirement 11.1, 11.3).
 *
 * Стабильный JSON-контракт (всегда `Cache-Control: no-store`):
 *   • 201 { ok: true, status: "created", zhk }
 *   • 200 { ok: true, status: "duplicate_suggested", existing }   (R4.5)
 *   • 4xx { ok: false, error: <label>, reason?, status? }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const ACCOUNT_COOKIE = "kiro_community_account_id";

interface ClientPayload {
  name?: unknown;
  citySlug?: unknown;
}

function asString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error, ...(extra ?? {}) },
    { status, headers: NO_STORE },
  );
}

export async function POST(req: NextRequest) {
  // Level-3 gate: resolve the publishing Community_Account from the session
  // cookie. Absent → not verified yet (Requirement 11.1/11.3).
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

  const name = asString(payload.name, 100);
  const citySlug = asString(payload.citySlug, 100);
  if (!name || !citySlug) {
    return jsonError(400, "validation_error");
  }

  let res: Response;
  try {
    res = await fetch(`${internalApiBase().replace(/\/+$/, "")}/community/geo/zhk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalApiToken()}`,
        "X-Community-Account-Id": accountId,
      },
      body: JSON.stringify({ name, citySlug }),
      cache: "no-store",
    });
  } catch {
    return jsonError(502, "upstream_unreachable");
  }

  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json")
    ? await res.json().catch(() => null)
    : null;

  // Success: created (201) or existing suggested (200) — both are OK for UX.
  if (res.status === 201 || res.status === 200) {
    return NextResponse.json({ ok: true, ...(body ?? {}) }, { status: res.status, headers: NO_STORE });
  }

  // Map upstream rejection to a stable client-facing envelope.
  const label =
    body && typeof body.error === "string"
      ? body.error
      : res.status === 403
        ? "verification_required"
        : "upstream_error";
  const reason = body && typeof body.reason === "string" ? body.reason : undefined;
  return jsonError(res.status, label, reason ? { reason } : undefined);
}
