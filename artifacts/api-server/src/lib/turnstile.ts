/**
 * Cloudflare Turnstile server-side verification for the AI_Design_Product flow.
 *
 * Spec: .kiro/specs/ai-design-product (design.md → "Captcha_Provider").
 * Requirements: 3.1, 3.2.
 *
 * What this module does:
 *   - One POST to https://challenges.cloudflare.com/turnstile/v0/siteverify
 *     with `secret` (TURNSTILE_SECRET_KEY) and `response` (the client-side
 *     `cf-turnstile-response` token), optionally with `remoteip`.
 *   - Enforces that the action returned by Cloudflare matches the
 *     `expectedAction` supplied by the caller (we issue exactly one action,
 *     `ai_design_submit`, on the public form). A mismatch is reported as
 *     `success: false` with errorCode `action-mismatch` so callers can treat
 *     it identically to a bad token.
 *   - Maps any network failure (timeout, abort, DNS, non-2xx status, malformed
 *     body) to `success: false` with errorCode `network-error`. The route
 *     handler turns that into 503 captcha_unavailable (Requirement 3.2 wiring
 *     happens in task 16.2).
 *
 * Dev-mode short-circuit:
 *   - When TURNSTILE_SECRET_KEY is missing we return `success: true` with
 *     empty errorCodes, so local dev / E2E suites (which never load the real
 *     Turnstile widget) aren't blocked. In production the env is set; if it
 *     isn't, that is a deployment misconfiguration the operator must catch
 *     via their own env-validation step — not this module's job to scream.
 *
 * Why fetch and not axios:
 *   - Node 18+ has built-in fetch; the api-server already targets Node 18+
 *     (see package.json + Railway runtime). Pulling in another HTTP client
 *     for one POST is unnecessary weight.
 */

declare const console: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

const SITEVERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Per-call timeout. The captcha check is a blocking step on POST /generate, so
 *  we want to fail fast rather than make the user wait 30s on a flaky network. */
const TIMEOUT_MS = 8_000;

/**
 * Result of `verifyTurnstileToken`.
 *
 * - `success: true` means the token is valid AND (if `expectedAction` was
 *   supplied) the action matches.
 * - `success: false` ⇒ `errorCodes` is non-empty. Possible values include
 *   any code Cloudflare returns plus our two synthetic codes:
 *     - `action-mismatch` — token was valid but for a different action
 *     - `network-error`   — could not reach Cloudflare or response was not
 *                           a usable JSON body
 */
export interface TurnstileVerifyResult {
  success: boolean;
  /** Non-empty whenever `success` is false. */
  errorCodes: string[];
  /** ISO-8601 timestamp from Cloudflare, or null if unavailable. */
  challengeTs: string | null;
  /** Hostname Cloudflare saw the challenge come from, or null. */
  hostname: string | null;
  /** Action string echoed back by Cloudflare, or null. */
  action: string | null;
}

/** Shape of the JSON body returned by the Cloudflare siteverify endpoint. */
interface CloudflareSiteverifyResponse {
  success?: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

export interface VerifyTurnstileInput {
  /** Raw `cf-turnstile-response` value from the form submission. */
  token: string;
  /** Client IP (best-effort); passed to Cloudflare as `remoteip` when set. */
  remoteIp: string | null;
  /** Action the caller expects ('ai_design_submit' for the public form). */
  expectedAction?: string;
}

/**
 * Verify a Turnstile token against Cloudflare's siteverify endpoint.
 *
 * Never throws — all failure modes are surfaced as `success: false` with
 * descriptive `errorCodes` so the route handler can branch on them without
 * try/catch.
 */
export async function verifyTurnstileToken(input: VerifyTurnstileInput): Promise<TurnstileVerifyResult> {
  const expectedAction = input.expectedAction ?? null;
  const secret = process.env["TURNSTILE_SECRET_KEY"];

  // Dev-mode bypass: no secret configured ⇒ we cannot verify anything, and
  // blocking dev/E2E on captcha would make the suite unrunnable. Production
  // env-validation must guarantee the key is present (out of scope here).
  if (!secret) {
    return {
      success: true,
      errorCodes: [],
      challengeTs: null,
      hostname: null,
      action: expectedAction,
    };
  }

  // Empty token short-circuit: Cloudflare would reject with `missing-input-response`
  // anyway, no reason to spend an HTTP round-trip on it.
  if (!input.token) {
    return {
      success: false,
      errorCodes: ["missing-input-response"],
      challengeTs: null,
      hostname: null,
      action: null,
    };
  }

  // Cloudflare accepts both JSON and x-www-form-urlencoded. We send urlencoded
  // because that's the form documented in their official quickstart and avoids
  // any quirks around content-type negotiation.
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", input.token);
  if (input.remoteIp) {
    body.set("remoteip", input.remoteIp);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let parsed: CloudflareSiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Cloudflare returns 200 with a JSON body for any valid request, so a
      // non-2xx status means infra trouble (or our payload was rejected by an
      // intermediate). Treat as a network error.
      console.warn(`[turnstile] siteverify status=${res.status}`);
      return networkError();
    }
    parsed = (await res.json()) as CloudflareSiteverifyResponse;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[turnstile] siteverify fetch error: ${msg}`);
    return networkError();
  } finally {
    clearTimeout(timeout);
  }

  const cfErrorCodes = Array.isArray(parsed["error-codes"]) ? parsed["error-codes"] : [];
  const challengeTs = typeof parsed.challenge_ts === "string" ? parsed.challenge_ts : null;
  const hostname = typeof parsed.hostname === "string" ? parsed.hostname : null;
  const returnedAction = typeof parsed.action === "string" ? parsed.action : null;

  if (parsed.success !== true) {
    return {
      success: false,
      // Defensive default: Cloudflare always populates error-codes on failure,
      // but if for some reason it's empty we still want a non-empty list per
      // the TurnstileVerifyResult contract.
      errorCodes: cfErrorCodes.length > 0 ? cfErrorCodes : ["invalid-input-response"],
      challengeTs,
      hostname,
      action: returnedAction,
    };
  }

  // Token is valid as far as Cloudflare is concerned. Now enforce action
  // pinning if the caller supplied an expectedAction. Any mismatch (including
  // a missing action in the response) is a `success: false` with our synthetic
  // `action-mismatch` code.
  if (expectedAction !== null && returnedAction !== expectedAction) {
    return {
      success: false,
      errorCodes: ["action-mismatch"],
      challengeTs,
      hostname,
      action: returnedAction,
    };
  }

  return {
    success: true,
    errorCodes: [],
    challengeTs,
    hostname,
    action: returnedAction,
  };
}

function networkError(): TurnstileVerifyResult {
  return {
    success: false,
    errorCodes: ["network-error"],
    challengeTs: null,
    hostname: null,
    action: null,
  };
}
