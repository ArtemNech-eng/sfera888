import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "../../../lib/env";

/**
 * Marketplace front-end → backend leads bridge.
 *
 * The browser POSTs JSON here; we forward it server-side to
 * `INTERNAL_API_BASE_URL/marketplace/leads` with the Bearer token. The
 * shared token stays on the server.
 *
 * On 201 we redirect the browser to /zayavka/spasibo. Other statuses are
 * surfaced to the client as plain-text error messages.
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

export async function POST(req: NextRequest) {
  let payload: ClientPayload;
  try {
    payload = (await req.json()) as ClientPayload;
  } catch {
    return new NextResponse("invalid_json", { status: 400 });
  }

  const phone = asString(payload.phone, 30);
  const citySlug = asString(payload.citySlug, 100);
  const serviceSlug = asString(payload.serviceSlug, 100);
  const consent = payload.consent === true;

  if (!phone || !citySlug || !serviceSlug || !consent) {
    return new NextResponse("validation_error", { status: 400 });
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
    return new NextResponse("upstream_unreachable", { status: 502 });
  }

  if (res.status === 201) {
    // 303 See Other so a POST → GET redirect is correct per RFC 7231.
    const url = new URL("/zayavka/spasibo", req.url);
    return NextResponse.redirect(url, 303);
  }

  // Pass back upstream error labels (validation_error / city_not_found / …)
  // without echoing internal details. Body is plain text for the client.
  const text = await res.text().catch(() => "");
  return new NextResponse(text || "upstream_error", { status: res.status });
}
