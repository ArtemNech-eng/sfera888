/**
 * Pure, server-free flow helpers shared by the community auth UI components
 * (`RegisterForm`, `LoginForm`, `PublishGate`) — spec:
 * community-phone-registration, Requirement 8.
 *
 * Extracted here (no `"use client"`, no React, no `next/*`, no DOM) so the
 * behaviours the components rely on can be asserted by fast, DOM-free unit
 * tests (task 7.5) — the same pattern as `lib/communityAuthForm.ts`.
 *
 * IMPORTANT: this module is a behaviour-preserving extraction of logic that
 * previously lived inline inside the three client components. The components
 * now import from here; their runtime behaviour is unchanged.
 *
 * Contract encoded here:
 *   • Rejection → human-readable message mapping (Requirement 8.6): the message
 *     shown when the Community_Auth_Service rejects a register/login request.
 *   • Field reset on rejection (Requirement 8.6): keep every field EXCEPT the
 *     password, which is cleared.
 *   • Post-success redirect target (Requirement 8.5): internal `next` path or a
 *     safe default hub.
 *   • Publish-gate links with `?next=` (Requirement 8.7): the register / login
 *     paths a participant is offered when there is no valid Community_Session,
 *     carrying an internal return path.
 */

// ── Internal routes of the community Web_Facade ──────────────────────────────

/** Registration form route (Web_Facade). */
export const COMMUNITY_REGISTER_PATH = "/soobshchestvo/registraciya";
/** Login form route (Web_Facade). */
export const COMMUNITY_LOGIN_PATH = "/soobshchestvo/vhod";
/** Default community hub used as a safe post-auth landing target. */
export const COMMUNITY_HUB_PATH = "/soobshchestvo";

// ── Shape of the JSON error body returned by Community_Auth_Service ──────────

/** Minimal shape of the API response body the forms read on rejection. */
export interface CommunityAuthApiBody {
  reason?: string;
  error?: string;
  message?: string;
  account?: unknown;
}

// ── Registration rejection reasons + messages (Requirement 8.6) ──────────────

/** Reasons the Community_Auth_Service can reject a registration. */
export type RegisterRejectionReason =
  | "phone_missing"
  | "phone_invalid"
  | "password_missing"
  | "password_invalid"
  | "phone_taken"
  | "captcha_missing"
  | "captcha_failed"
  | "captcha_unavailable"
  | "too_many_requests";

/** Human-readable registration rejection copy (Requirement 8.6). */
export const REGISTER_REJECTION_MESSAGES: Record<RegisterRejectionReason, string> = {
  phone_missing: "Введите номер телефона.",
  phone_invalid: "Недопустимый номер телефона. Проверьте и попробуйте снова.",
  password_missing: "Введите пароль.",
  password_invalid: "Пароль должен быть от 8 до 72 символов.",
  phone_taken:
    "Этот телефон уже зарегистрирован. Войдите или используйте другой номер.",
  captcha_missing: "Пройдите проверку «Я не робот» и попробуйте снова.",
  captcha_failed: "Проверка не пройдена. Попробуйте пройти капчу ещё раз.",
  captcha_unavailable:
    "Проверка временно недоступна. Подождите немного и попробуйте снова.",
  too_many_requests:
    "Слишком много попыток. Подождите немного и попробуйте позже.",
};

/** Fallback shown when a registration rejection has no known reason/status. */
export const REGISTER_REJECTION_FALLBACK =
  "Не удалось зарегистрироваться. Попробуйте ещё раз.";

/**
 * Map a registration rejection (HTTP status + optional JSON body) to a
 * human-readable message (Requirement 8.6). Prefers an explicit
 * `reason`/`error` code, then falls back to status-based mapping.
 */
export function friendlyRegisterRejection(
  status: number,
  body: CommunityAuthApiBody | null,
): string {
  const raw = body?.reason ?? body?.error;
  if (raw && raw in REGISTER_REJECTION_MESSAGES) {
    return REGISTER_REJECTION_MESSAGES[raw as RegisterRejectionReason];
  }
  if (status === 429) return REGISTER_REJECTION_MESSAGES.too_many_requests;
  if (status === 409) return REGISTER_REJECTION_MESSAGES.phone_taken;
  if (status === 503) return REGISTER_REJECTION_MESSAGES.captcha_unavailable;
  return REGISTER_REJECTION_FALLBACK;
}

// ── Login rejection reasons + messages (Requirement 8.6, 3.7) ────────────────

/** Reasons the Community_Auth_Service can reject a login. */
export type LoginRejectionReason = "invalid_credentials" | "too_many_requests";

/** Human-readable login rejection copy (Requirement 8.6). */
export const LOGIN_REJECTION_MESSAGES: Record<LoginRejectionReason, string> = {
  // Single message that does NOT reveal which factor failed (Requirement 3.7).
  invalid_credentials:
    "Неверный телефон или пароль. Проверьте данные и попробуйте снова.",
  too_many_requests:
    "Слишком много попыток входа. Подождите немного и попробуйте позже.",
};

/** Fallback shown when a login rejection has no known reason/status. */
export const LOGIN_REJECTION_FALLBACK = "Не удалось войти. Попробуйте ещё раз.";

/**
 * Map a login rejection (HTTP status + optional JSON body) to a human-readable
 * message (Requirement 8.6). A 401 (and anything else unknown) resolves to the
 * single non-revealing credentials message (Requirement 3.7).
 */
export function friendlyLoginRejection(
  status: number,
  body: CommunityAuthApiBody | null,
): string {
  const raw = body?.reason ?? body?.error;
  if (raw && raw in LOGIN_REJECTION_MESSAGES) {
    return LOGIN_REJECTION_MESSAGES[raw as LoginRejectionReason];
  }
  if (status === 429) return LOGIN_REJECTION_MESSAGES.too_many_requests;
  // 401 and everything else — single, non-revealing error (Requirement 3.7).
  if (status === 401) return LOGIN_REJECTION_MESSAGES.invalid_credentials;
  return LOGIN_REJECTION_FALLBACK;
}

// ── Field reset on rejection (Requirement 8.6) ───────────────────────────────

/** The subset of form field values whose reset behaviour we model. */
export interface CommunityAuthFieldValues {
  phone: string;
  password: string;
}

/**
 * On a rejected submission the Web_Facade keeps every entered value EXCEPT the
 * password, which it clears (Requirement 8.6). Returns the fields as they
 * should be after a rejection: phone preserved, password emptied.
 */
export function resetFieldsAfterRejection(
  fields: CommunityAuthFieldValues,
): CommunityAuthFieldValues {
  return { phone: fields.phone, password: "" };
}

// ── Safe internal-path guard (open-redirect hardening) ───────────────────────

/**
 * Whether `next` is a SAFE internal navigation target — a same-origin absolute
 * path that a browser cannot interpret as a different origin.
 *
 * A bare `startsWith("/")` check is NOT enough: browsers treat
 *   • `//evil.example`  (protocol-relative) and
 *   • `/\evil.example`  (backslash the browser normalises to `/`)
 * as ABSOLUTE URLs pointing at another origin, so allowing them through a
 * redirect / link is an open-redirect vector. We therefore require the value to
 * start with exactly one `/` that is NOT followed by another `/` or a
 * backslash. Control characters (which some parsers strip, shifting the first
 * meaningful char) also disqualify the value.
 */
export function isInternalPath(next: string | undefined | null): next is string {
  if (typeof next !== "string" || next.length === 0) return false;
  if (next[0] !== "/") return false; // must be an absolute path
  // Reject protocol-relative (`//`) and backslash-scheme (`/\`) forms.
  if (next[1] === "/" || next[1] === "\\") return false;
  // Reject embedded control characters (incl. CR/LF/TAB and NUL) that parsers
  // may strip to reveal a `//`/`\` prefix or enable header/URL smuggling.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return false;
  return true;
}

// ── Post-success redirect target (Requirement 8.5) ───────────────────────────

/**
 * Resolve where to send the participant after a successful register / login
 * (Requirement 8.5): an internal absolute `next` path when provided, otherwise
 * the community hub. Missing or non-internal `next` (including protocol-relative
 * `//evil` and backslash `/\evil` forms) falls back to the hub so an open
 * redirect is impossible (see {@link isInternalPath}).
 */
export function resolveSuccessTarget(next: string | undefined | null): string {
  return isInternalPath(next) ? next : COMMUNITY_HUB_PATH;
}

// ── Publish-gate links with `?next=` (Requirement 8.7) ───────────────────────

/**
 * Build a link that carries an internal `?next=` return path, passing only
 * SAFE internal absolute paths through (Requirement 8.7). A missing or
 * non-internal `next` — including protocol-relative `//evil` and backslash
 * `/\evil` forms — yields the bare base path (no query), preventing open
 * redirects (see {@link isInternalPath}).
 */
export function withNext(base: string, next: string | undefined | null): string {
  if (!isInternalPath(next)) return base;
  return `${base}?next=${encodeURIComponent(next)}`;
}
