/**
 * Yandex SmartCaptcha server-side verification for the AI-design flow.
 *
 * Replaces the previous Cloudflare Turnstile integration. The public form
 * (`/dizajn` `Flagship_Form`) renders the SmartCaptcha widget; on success the
 * widget injects a one-time `smart-token` into the form, which the backend
 * validates here.
 *
 * Docs: https://yandex.cloud/en/docs/smartcaptcha/quickstart
 *       ("Verify the user's response").
 *
 * What this module does:
 *   - One POST to https://smartcaptcha.yandexcloud.net/validate with
 *     `secret` (SMARTCAPTCHA_SERVER_KEY), `token` (the client `smart-token`)
 *     and, when available, `ip` (best-effort client address), all sent as
 *     `application/x-www-form-urlencoded`.
 *   - SmartCaptcha responds with `{ status: "ok" | "failed", message? }`.
 *     `status === "ok"` ⇒ the request is human; anything else ⇒ reject.
 *   - Maps any network failure (timeout, abort, DNS, non-2xx, malformed body)
 *     to `success: false` with code `network-error`. We deliberately fail
 *     CLOSED on infra errors to protect AI spend; the server-side Rate_Limiter
 *     remains the volume guard regardless.
 *
 * Dev-mode short-circuit:
 *   - When SMARTCAPTCHA_SERVER_KEY is missing we return `success: true`, so
 *     local dev / E2E suites (which never load the real widget) aren't blocked.
 *     In production the env is set; a missing key in prod is a deployment
 *     misconfiguration the operator must catch via their own env validation.
 *
 * Why fetch and not axios:
 *   - Node 18+ ships built-in fetch; the api-server already targets Node 18+.
 *     Pulling in another HTTP client for one POST is unnecessary weight.
 */

declare const console: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

const VALIDATE_ENDPOINT = "https://smartcaptcha.yandexcloud.net/validate";

/** Per-call timeout. Captcha verify is a blocking step on POST /generate, so
 *  we fail fast rather than make the user wait on a flaky network. */
const TIMEOUT_MS = 8_000;

/**
 * Result of `verifyCaptchaToken`.
 *
 * - `success: true`  ⇒ SmartCaptcha returned `status: "ok"` (or dev bypass).
 * - `success: false` ⇒ `errorCodes` is non-empty. Synthetic codes:
 *     - `missing-input-response` — no token supplied
 *     - `invalid-input-response` — SmartCaptcha returned `status: "failed"`
 *     - `network-error`          — could not reach SmartCaptcha / bad response
 */
export interface CaptchaVerifyResult {
  success: boolean;
  /** Non-empty whenever `success` is false. */
  errorCodes: string[];
  /** Raw `status` echoed by SmartCaptcha (`ok`/`failed`), or null. */
  status: string | null;
  /** Diagnostic message from SmartCaptcha — for logs only, never shown to users. */
  message: string | null;
}

/** Shape of the JSON body returned by the SmartCaptcha validate endpoint. */
interface SmartCaptchaValidateResponse {
  status?: string;
  message?: string;
  host?: string;
}

export interface VerifyCaptchaInput {
  /** Raw `smart-token` value from the form submission. */
  token: string;
  /** Client IP (best-effort); passed to SmartCaptcha as `ip` when set. */
  remoteIp: string | null;
}

/**
 * Verify a SmartCaptcha token against Yandex's validate endpoint.
 *
 * Never throws — all failure modes are surfaced as `success: false` with
 * descriptive `errorCodes` so the route handler can branch without try/catch.
 */
export async function verifyCaptchaToken(input: VerifyCaptchaInput): Promise<CaptchaVerifyResult> {
  const secret = process.env["SMARTCAPTCHA_SERVER_KEY"];

  // Dev-mode bypass: no server key ⇒ we cannot verify, and blocking dev/E2E on
  // captcha would make the suite unrunnable. Production env validation must
  // guarantee the key is present (out of scope here).
  if (!secret) {
    return { success: true, errorCodes: [], status: "ok", message: null };
  }

  // Empty token short-circuit: SmartCaptcha would reject anyway, no reason to
  // spend an HTTP round-trip.
  if (!input.token) {
    return { success: false, errorCodes: ["missing-input-response"], status: null, message: null };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("token", input.token);
  if (input.remoteIp) {
    body.set("ip", input.remoteIp);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let parsed: SmartCaptchaValidateResponse;
  try {
    const res = await fetch(VALIDATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[smartcaptcha] validate status=${res.status}`);
      return networkError();
    }
    parsed = (await res.json()) as SmartCaptchaValidateResponse;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[smartcaptcha] validate fetch error: ${msg}`);
    return networkError();
  } finally {
    clearTimeout(timeout);
  }

  const status = typeof parsed.status === "string" ? parsed.status : null;
  const message = typeof parsed.message === "string" ? parsed.message : null;

  if (status === "ok") {
    return { success: true, errorCodes: [], status, message };
  }

  return {
    success: false,
    errorCodes: ["invalid-input-response"],
    status,
    message,
  };
}

function networkError(): CaptchaVerifyResult {
  return {
    success: false,
    errorCodes: ["network-error"],
    status: null,
    message: null,
  };
}
