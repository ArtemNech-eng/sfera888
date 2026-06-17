import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, canonicalHost } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catch-all proxy for `chestnye-mastera.ru/api/storage/*` →
 * `${INTERNAL_API_BASE_URL}/storage/*`.
 *
 * Mirrors the auth pattern used by `/api/cabinet/[...path]/route.ts` —
 * cookies are forwarded so the api-server's session middleware authenticates
 * the upload, and Set-Cookie responses are passed back through unchanged
 * (browsers scope them to the marketplace host).
 *
 * Used by cabinet pages that upload images: portfolio photos, master avatars,
 * payment proofs sent through the chat. The /api/storage/uploads/request-url
 * endpoint returns a signed URL; the actual binary upload happens directly
 * to the object storage host (R2/GCS) and skips this proxy.
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
    return ALLOWED_HOSTS.has(new URL(origin).host);
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
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const apiBase = internalApiBase().replace(/\/+$/, "");
  const search = new URL(req.url).search;
  // INTERNAL_API_BASE_URL ends with /api; storage lives at /api/storage/*
  // (same pattern as /api/master-pwa/*).
  const targetUrl = `${apiBase}/storage/${upstreamPath}${search}`;

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
    console.error("[storage-proxy] upstream fetch failed", { path: upstreamPath, err: String(err) });
    return NextResponse.json(
      { error: "upstream_unreachable" },
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
    for (const c of setCookies) response.headers.append("set-cookie", c);
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
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
