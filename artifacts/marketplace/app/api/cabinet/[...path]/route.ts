import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, canonicalHost } from "@/lib/env";

export const runtime = "nodejs";
// Cabinet endpoints carry session state — never cache.
export const dynamic = "force-dynamic";

/**
 * Catch-all proxy for the cabinet client. Forwards every request from
 * `chestnye-mastera.ru/api/cabinet/<rest>` → `${INTERNAL_API_BASE_URL}/master-pwa/<rest>`,
 * passing through cookies, request body, query string, and the upstream
 * response (including `Set-Cookie` headers used by login/logout).
 *
 * Why this design (vs shared cookie on `.chestnye-mastera.ru`):
 *   • The api-server lives on `sfera-master.ru/api` and we don't want to add
 *     a CNAME `api.chestnye-mastera.ru` for V1.5 (DNS work, custom domain
 *     setup, env updates).
 *   • With this proxy, the browser sees responses originating from
 *     `chestnye-mastera.ru`, so `Set-Cookie: connect.sid=…` (no Domain attr
 *     on api-server) is naturally scoped to the marketplace host.
 *   • Subsequent browser requests include the cookie automatically; the
 *     proxy forwards it to api-server, which validates against the shared
 *     `sessions` PG table. No backend changes required.
 *
 * CSRF protection (V1.5 minimum):
 *   • Reject any state-changing method (POST/PATCH/PUT/DELETE) whose `Origin`
 *     header isn't our canonical host. Browsers attach the Origin header on
 *     all cross-origin requests, so an attacker site embedding our endpoint
 *     in a form/fetch is blocked. GETs are safe by convention.
 *   • TODO V1.5 polish: add a double-submit CSRF token in addition to Origin.
 *
 * What we deliberately do NOT proxy:
 *   • `/api/cabinet/health` and similar bootstrap-only paths — there's no
 *     equivalent on master-pwa, and we don't want to leak a generic proxy
 *     surface. The catch-all forwards exactly what's under `/master-pwa/*`.
 */

const ALLOWED_HOSTS = new Set<string>([
  canonicalHost(),
  `www.${canonicalHost()}`,
]);

function isCsrfSafe(req: NextRequest): boolean {
  // Only enforce on state-changing methods. GET/HEAD/OPTIONS are safe.
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return true;
  }
  const origin = req.headers.get("origin");
  if (!origin) {
    // Same-origin server-side calls don't always send Origin. We require it
    // for write-operations from a browser context. Direct curl/server callers
    // should hit the api-server with an internal token instead.
    return false;
  }
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
  // Strip these so Next's response can re-encode/size cleanly.
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
  const targetUrl = `${apiBase}/master-pwa/${upstreamPath}${search}`;

  // Forward cookies, content-type, accept. Drop `host`/`origin` so the
  // upstream sees its own host.
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  if (cookie) headers["Cookie"] = cookie;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;
  const accept = req.headers.get("accept");
  if (accept) headers["Accept"] = accept;
  const userAgent = req.headers.get("user-agent");
  if (userAgent) headers["User-Agent"] = userAgent;
  // Pass through real client IP so api-server's rate-limit middleware sees
  // the user, not the marketplace runtime.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) headers["X-Forwarded-For"] = xff;

  // Body: pass-through ArrayBuffer for non-GET. We deliberately don't try to
  // stream — Node fetch ReadableStream support requires `duplex: "half"` and
  // is brittle. For our payload sizes (≤10 MB photos) buffering is fine.
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
    console.error("[cabinet-proxy] upstream fetch failed", { path: upstreamPath, err: String(err) });
    return NextResponse.json(
      { error: "upstream_unreachable", message: "Сервер недоступен. Попробуйте ещё раз." },
      { status: 502 },
    );
  }

  // Build response, preserving status, body and headers (esp. Set-Cookie).
  const respBuffer = await upstream.arrayBuffer();
  const response = new NextResponse(respBuffer, {
    status: upstream.status,
    statusText: upstream.statusText,
  });

  // Headers.set() collapses multiple Set-Cookie into one — use append on the
  // raw values from the upstream Headers iterator.
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    if (lower === "set-cookie") {
      // Defer — handled below.
      return;
    }
    response.headers.set(key, value);
  });

  // `Headers.getSetCookie()` is the Node 20+ API for retrieving multiple
  // Set-Cookie values without folding them.
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
