import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "../../../lib/env";

/**
 * Marketplace front-end → backend leads bridge.
 *
 * The browser POSTs JSON here; we forward it server-side to
 * `INTERNAL_API_BASE_URL/marketplace/leads` with the Bearer token. The
 * shared token stays on the server.
 *
 * Response contract (always JSON, always Cache-Control: no-store):
 *   • 201  { ok: true,  redirectTo: "/zayavka/spasibo" }
 *   • 4xx  { ok: false, error: <label>, details?: ... }
 *   • 5xx  { ok: false, error: "upstream_unreachable" | "upstream_error" }
 *
 * Why no HTTP redirect: cross-origin fetch + 303 chain proved unreliable in
 * the browser (some clients fall into the catch block on the redirected HTML
 * response). A plain JSON contract makes the client straightforward.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClientPayload {
  name?: unknown;
  phone?: unknown;
  comment?: unknown;
  consent?: unknown;
  citySlug?: unknown;
  serviceSlug?: unknown;
  sourcePageUrl?: unknown;
}

function asString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

function jsonError(status: number, error: string, details?: unknown) {
  const body: Record<string, unknown> = { ok: false, error };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  let payload: ClientPayload;
  try {
    payload = (await req.json()) as ClientPayload;
  } catch {
    return jsonError(400, "invalid_json");
  }

  const phone = asString(payload.phone, 30);
  const citySlug = asString(payload.citySlug, 100);
  const serviceSlug = asString(payload.serviceSlug, 100);
  const consent = payload.consent === true;

  if (!phone || !citySlug || !serviceSlug || !consent) {
    return jsonError(400, "validation_error");
  }

  const headers = req.headers;
  const ua = headers.get("user-agent") ?? undefined;
  // Best-effort client IP. Marketplace is behind Railway edge / Cloudflare,
  // so x-forwarded-for is the canonical place.
  const xff = headers.get("x-forwarded-for") ?? "";
  const clientIp = xff.split(",")[0]?.trim() || undefined;

  const upstream = {
    name: asString(payload.name, 100),
    phone,
    citySlug,
    serviceSlug,
    comment: asString(payload.comment, 2000),
    sourcePageUrl: asString(payload.sourcePageUrl, 1000),
    sourcePageType: "service-city" as const,
    referrer: headers.get("referer") ?? undefined,
    clientIp,
    clientUserAgent: ua ? ua.slice(0, 500) : undefined,
    consentGiven: true as const,
  };

  let res: Response;
  try {
    res = await fetch(`${internalApiBase().replace(/\/+$/, "")}/marketplace/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalApiToken()}`,
      },
      body: JSON.stringify(upstream),
      // Lead submissions are user-action; do not let Next cache anything.
      cache: "no-store",
    });
  } catch {
    return jsonError(502, "upstream_unreachable");
  }

  // Successful intake from api-server.
  if (res.status === 201) {
    return NextResponse.json(
      { ok: true, redirectTo: "/zayavka/spasibo" },
      { status: 201, headers: NO_STORE },
    );
  }

  // Non-201 — try to extract a structured error label from the upstream
  // response. Always return JSON so the client has a stable contract.
  let upstreamLabel = "upstream_error";
  let upstreamDetails: unknown = undefined;
  const ct = res.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const body = (await res.json()) as { error?: unknown; details?: unknown };
      if (typeof body.error === "string") upstreamLabel = body.error;
      if (body.details !== undefined) upstreamDetails = body.details;
    } else {
      const text = (await res.text()).trim();
      if (text.length > 0 && text.length <= 100) upstreamLabel = text;
    }
  } catch {
    // Keep default upstreamLabel.
  }

  return jsonError(res.status, upstreamLabel, upstreamDetails);
}
