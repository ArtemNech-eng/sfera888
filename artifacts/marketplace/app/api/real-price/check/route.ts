import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "@/lib/env";

/**
 * Проверятор смет: браузер POST-ит сюда, мы серверно форвардим в
 * `INTERNAL_API_BASE_URL/marketplace/real-price/check` с Bearer-токеном
 * (токен не утекает в браузер). Всегда JSON, no-store.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400, headers: NO_STORE });
  }
  const body = (payload ?? {}) as { citySlug?: unknown; items?: unknown };
  const citySlug = typeof body.citySlug === "string" ? body.citySlug.trim() : "";
  const items = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  if (!citySlug || items.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400, headers: NO_STORE });
  }

  try {
    const url = `${internalApiBase().replace(/\/+$/, "")}/marketplace/real-price/check`;
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${internalApiToken()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ citySlug, items }),
      cache: "no-store",
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json({ ok: false, error: "upstream_error" }, { status: 502, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, ...data }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, error: "upstream_unreachable" }, { status: 502, headers: NO_STORE });
  }
}
