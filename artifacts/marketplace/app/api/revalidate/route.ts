import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { internalApiToken } from "../../../lib/env";

/**
 * Marketplace revalidation webhook.
 *
 * Called server-to-server from the api-server (`lib/marketplaceRevalidate.ts`)
 * after master self-publishes / unpublishes their profile, after operator
 * override in CRM, after portfolio changes (Iteration 2), etc.
 *
 * Auth: Bearer token equal to INTERNAL_API_SHARED_TOKEN. Constant-time check
 * to avoid timing oracles. Same token that protects /api/marketplace/*
 * (api-server side calls it MARKETPLACE_INGEST_TOKEN — same value, two names).
 *
 * Body: { "paths": string[] }
 *   • absolute paths starting with "/" (e.g. "/sitemap.xml", "/master/ivan-petrov")
 *   • max 50 paths per request, max 200 chars each
 *   • non-string / malformed entries are silently dropped
 *
 * Response: { ok: true, revalidated: number, skipped: number }
 *
 * Notes:
 *   • Always Cache-Control: no-store (the webhook itself must not be cached).
 *   • Never returns details about WHY a path failed — opaque to caller.
 *   • Never logs the token. Errors are stringified safely.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const MAX_PATHS = 50;
const MAX_PATH_LEN = 200;

function checkBearer(req: NextRequest): boolean {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length).trim();
  if (provided.length === 0) return false;

  let expected: string;
  try {
    expected = internalApiToken();
  } catch {
    // Token misconfigured — refuse all requests.
    return false;
  }

  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(provided, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sanitizePaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_PATH_LEN) continue;
    if (!trimmed.startsWith("/")) continue;
    // Refuse anything with a protocol or '..' traversal — defence in depth.
    if (trimmed.includes("://") || trimmed.includes("..")) continue;
    out.push(trimmed);
    if (out.length >= MAX_PATHS) break;
  }
  // De-duplicate while preserving order (first occurrence wins).
  return Array.from(new Set(out));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkBearer(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400, headers: NO_STORE },
    );
  }

  const paths = sanitizePaths((body as { paths?: unknown })?.paths);
  if (paths.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no_valid_paths" },
      { status: 400, headers: NO_STORE },
    );
  }

  let revalidated = 0;
  let skipped = 0;
  for (const p of paths) {
    try {
      revalidatePath(p);
      revalidated++;
    } catch (e: unknown) {
      // Don't bubble — try remaining paths so a single bad path doesn't
      // block sitemap/profile updates. Log a safe message (no path content
      // beyond the path itself, which is already public/non-sensitive).
      console.warn(
        `[marketplace/revalidate] failed path=${p} err=${e instanceof Error ? e.message : "unknown"}`,
      );
      skipped++;
    }
  }

  return NextResponse.json(
    { ok: true, revalidated, skipped },
    { status: 200, headers: NO_STORE },
  );
}
