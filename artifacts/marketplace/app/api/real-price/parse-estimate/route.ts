import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "@/lib/env";

/**
 * Проверятор смет 3.4: браузер шлёт сюда multipart с полем `file` (фото/PDF
 * сметы), мы серверно форвардим байты «как есть» в
 * `INTERNAL_API_BASE_URL/marketplace/real-price/parse-estimate` с Bearer-токеном
 * (токен не утекает в браузер). Ответ — { items:[…] } для предзаполнения формы.
 *
 * Защита: тип контента только multipart, лимит размера, мягкий per-IP throttle
 * (LLM-вызов платный). Всегда no-store.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_BYTES = 12 * 1024 * 1024;

// Process-local лёгкий лимитер (как rateLimit.ts — на одном инстансе Railway).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // hard cap against unbounded growth
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "bad_content_type" }, { status: 400, headers: NO_STORE });
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "anon";
  if (rateLimited(ip)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: NO_STORE });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ ok: false, error: "empty" }, { status: 400, headers: NO_STORE });
  }
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413, headers: NO_STORE });
  }

  try {
    const url = `${internalApiBase().replace(/\/+$/, "")}/marketplace/real-price/parse-estimate`;
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${internalApiToken()}`,
        "Content-Type": contentType, // preserve multipart boundary
      },
      body: buf,
      cache: "no-store",
    });
    const data = (await upstream.json().catch(() => null)) as { error?: string; items?: unknown } | null;
    if (!upstream.ok || !data) {
      const status = upstream.status === 503 ? 503 : upstream.status === 415 ? 415 : 502;
      return NextResponse.json(
        { ok: false, error: data?.error ?? "upstream_error" },
        { status, headers: NO_STORE },
      );
    }
    return NextResponse.json({ ok: true, items: data.items ?? [] }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, error: "upstream_unreachable" }, { status: 502, headers: NO_STORE });
  }
}
