import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { internalApiBase, internalApiToken } from "../../../../lib/env";

/**
 * POST /api/dizajn/generate — proxy на api-server с set-cookie для anon-id.
 *
 * Принимает multipart/form-data (фото + параметры), пробрасывает в
 * `${INTERNAL_API_BASE_URL}/marketplace/dizajn/generate` с добавлением
 * `anonId` (UUID v4) — берётся из cookie `kiro_anon_id` или генерится впервые.
 *
 * Cookie выставляется в HTTP-only chunked Set-Cookie (1 год). Это та же
 * cookie что использует /api/raboty/[slug]/save — все anon-операции
 * связаны с одним id.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "kiro_anon_id";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest) {
  // Resolve anon-id (existing or fresh UUID).
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  const anonId = existing && UUID_RE.test(existing) ? existing : crypto.randomUUID();

  // Re-build multipart form to inject anonId field.
  let originalForm: FormData;
  try {
    originalForm = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_form" },
      { status: 400, headers: NO_STORE },
    );
  }

  const upstreamForm = new FormData();
  for (const [key, value] of originalForm.entries()) {
    upstreamForm.append(key, value);
  }
  upstreamForm.set("anonId", anonId);

  let upstream: Response;
  try {
    upstream = await fetch(
      `${internalApiBase().replace(/\/+$/, "")}/marketplace/dizajn/generate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${internalApiToken()}`,
          // Не задаём Content-Type сами — fetch выставит правильный
          // multipart/form-data boundary автоматически.
        },
        body: upstreamForm,
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "upstream_unreachable" },
      { status: 502, headers: NO_STORE },
    );
  }

  const responseBody = await upstream.json().catch(() => ({ ok: false, error: "upstream_error" }));
  const response = NextResponse.json(responseBody, {
    status: upstream.status,
    headers: NO_STORE,
  });

  // Always issue Set-Cookie if newly generated.
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
