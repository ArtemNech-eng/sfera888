import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, canonicalHost } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cabinet "extra" proxy — same wire format as `/api/cabinet/*` but forwards
 * to `${INTERNAL_API_BASE_URL}/<rest>` directly (no `master-pwa` prefix).
 *
 * Use cases:
 *   • `/api/cabinet-extra/account-balance/my` → `/api/account-balance/my`
 *   • `/api/cabinet-extra/account-balance/my/topup-request` → `/api/account-balance/my/topup-request`
 *
 * The api-server's `/api/account-balance/*` endpoints already require a
 * master session (the same `connect.sid` cookie), so the proxy just passes
 * the cookie through. Splitting it from `/api/cabinet/*` keeps the catch-all
 * proxy single-purpose ("forwards to master-pwa") and avoids a runtime
 * branch on the upstream path.
 *
 * Same CSRF guard as the cabinet proxy: state-changing methods require
 * a same-host Origin header.
 */

const ALLOWED_HOSTS = new Set<string>([
  canonicalHost(),
  `www.${canonicalHost()}`,
]);

function isCsrfSafe(req: NextRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return true;
  }
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return ALLOWED_HOSTS.has(url.host);
  } catch {
    return false;
  }
}

const HOP_BY_HOP = new Set([
  "transfer-encoding",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "upgrade",
  "content-encoding",
  "content-length",
]);

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  if (!isCsrfSafe(req)) {
    return NextResponse.json(
      { error: "csrf_blocked", message: "Запрос отклонён (origin)" },
      { status: 403 },
    );
  }

  const upstreamPath = segments.map(encodeURIComponent).join("/");
  if (!upstreamPath) {
    return NextResponse.json(
      { error: "not_found", message: "Не указан endpoint" },
      { status: 404 },
    );
  }

  const apiBase = internalApiBase().replace(/\/+$/, "");
  const search = new URL(req.url).search;
  const targetUrl = `${apiBase}/${upstreamPath}${search}`;

  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  if (cookie) headers["Cookie"] = cookie;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;
  const accept = req.headers.get("accept");
  if (accept) headers["Accept"] = accept;
  const userAgent = req.headers.get("user-agent");
  if (userAgent) headers["User-Agent"] = userAgent;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) headers["X-Forwarded-For"] = xff;

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (err) {
    console.error("[cabinet-extra-proxy] upstream fetch failed", { path: upstreamPath, err: String(err) });
    return NextResponse.json(
      { error: "upstream_unreachable", message: "Сервер недоступен. Попробуйте ещё раз." },
      { status: 502 },
    );
  }

  const respBuffer = await upstream.arrayBuffer();
  const response = new NextResponse(respBuffer, {
    status: upstream.status,
    statusText: upstream.statusText,
  });

  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") return;
    response.headers.set(key, value);
  });

  const setCookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (setCookies && setCookies.length > 0) {
    for (const c of setCookies) {
      response.headers.append("set-cookie", c);
    }
  }

  return response;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
