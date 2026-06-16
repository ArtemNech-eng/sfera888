import { NextResponse, type NextRequest } from "next/server";
import { internalApiBase, internalApiToken } from "../../../lib/env";
import { checkLeadRateLimit, recordLeadAttempt } from "../../../lib/rateLimit";

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
 * Anti-spam (basic, no captcha yet):
 *   1. Honeypot field `website` — if filled, fake-success and skip upstream.
 *   2. Minimum form fill time `formStartedAt` — reject if user is too fast.
 *   3. Per-IP / per-phone in-memory rate limit (lib/rateLimit).
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
  /** Honeypot: must be empty for real users. */
  website?: unknown;
  /** Client-side Date.now() captured on form mount. */
  formStartedAt?: unknown;
  /** Optional — set when the form lives on a master's profile page. */
  attachedMasterId?: unknown;
}

function asString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MIN_FILL_MS = 2_000;

function jsonError(
  status: number,
  error: string,
  details?: unknown,
  extraHeaders?: Record<string, string>,
) {
  const body: Record<string, unknown> = { ok: false, error };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE, ...(extraHeaders ?? {}) },
  });
}

function fakeSuccess() {
  // Returned for honeypot trips. The same shape a real success uses, so a
  // bot can't tell its submission was discarded.
  return NextResponse.json(
    { ok: true, redirectTo: "/zayavka/spasibo" },
    { status: 201, headers: NO_STORE },
  );
}

export async function POST(req: NextRequest) {
  let payload: ClientPayload;
  try {
    payload = (await req.json()) as ClientPayload;
  } catch {
    return jsonError(400, "invalid_json");
  }

  // 1. Honeypot — reject silently. Bots that auto-fill all inputs will set
  // `website` to a URL or some keyword; real users never see the field.
  // Honeypot trips do NOT consume a rate-limit slot — the bot mustn't be
  // able to feel that it's locked out.
  const honey = typeof payload.website === "string" ? payload.website.trim() : "";
  if (honey.length > 0) {
    return fakeSuccess();
  }

  // 2. Rate limit — applied BEFORE validation/too_fast/upstream so that a
  // bot spraying invalid bodies still burns its IP burst budget. The phone
  // key is best-effort: extracted up front, used if present, ignored otherwise.
  const headers = req.headers;
  const xff = headers.get("x-forwarded-for") ?? "";
  const clientIp = xff.split(",")[0]?.trim() || undefined;
  const rawPhone = asString(payload.phone, 30);

  const rl = checkLeadRateLimit({ ip: clientIp, phone: rawPhone });
  if (!rl.allowed) {
    return jsonError(
      429,
      "rate_limited",
      undefined,
      rl.retryAfterSec !== undefined ? { "Retry-After": String(rl.retryAfterSec) } : undefined,
    );
  }
  // Count this attempt as soon as the gate is passed. Validation /
  // too-fast / upstream errors below do not retroactively un-record.
  // `recordLeadAttempt` only writes the phone bucket when `rawPhone` was
  // present, so legit users without a phone still consume only the IP slot.
  recordLeadAttempt({ ip: clientIp, phone: rawPhone });

  // 3. Body validation.
  const phone = rawPhone;
  const citySlug = asString(payload.citySlug, 100);
  const serviceSlug = asString(payload.serviceSlug, 100);
  const consent = payload.consent === true;

  if (!phone || !citySlug || !serviceSlug || !consent) {
    return jsonError(400, "validation_error");
  }

  // 4. Minimum fill time — only enforced when the client provided a sane
  // numeric `formStartedAt`. We don't reject for missing it (legacy clients,
  // strict CSP that broke our useEffect, etc.) — only for "too fast".
  if (typeof payload.formStartedAt === "number" && Number.isFinite(payload.formStartedAt)) {
    const elapsed = Date.now() - payload.formStartedAt;
    // `elapsed < 0` means the client clock is ahead — treat as "too fast" too,
    // because a bot could send a future timestamp to bypass the check.
    if (elapsed >= 0 && elapsed < MIN_FILL_MS) {
      return jsonError(400, "too_fast");
    }
  }

  const ua = headers.get("user-agent") ?? undefined;

  // Validate optional attachedMasterId. Must be a positive safe integer if
  // present — anything else is dropped silently (the upstream would 400 on
  // garbage anyway). Validity of the master id (published, slug-ready) is
  // re-checked server-side on api-server with FK + filter.
  let attachedMasterId: number | undefined;
  if (typeof payload.attachedMasterId === "number" && Number.isFinite(payload.attachedMasterId)) {
    if (Number.isInteger(payload.attachedMasterId) && payload.attachedMasterId > 0) {
      attachedMasterId = payload.attachedMasterId;
    }
  }

  const upstream = {
    name: asString(payload.name, 100),
    phone,
    citySlug,
    serviceSlug,
    comment: asString(payload.comment, 2000),
    sourcePageUrl: asString(payload.sourcePageUrl, 1000),
    // When the lead is attached to a specific master we mark the page type
    // accordingly so the CRM filter can distinguish service-city leads from
    // master-card leads. Same `marketplace` source either way.
    sourcePageType: (attachedMasterId !== undefined ? "master" : "service-city") as
      | "master"
      | "service-city",
    referrer: headers.get("referer") ?? undefined,
    clientIp,
    clientUserAgent: ua ? ua.slice(0, 500) : undefined,
    consentGiven: true as const,
    ...(attachedMasterId !== undefined ? { attachedMasterId } : {}),
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
