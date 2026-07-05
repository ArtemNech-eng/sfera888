/**
 * Feature: community-phone-registration, Task 7.5, Validates: Requirements 8.1, 8.2, 8.4, 8.5, 8.6, 8.7
 *
 * Component / render behaviour tests for the community auth forms.
 *
 * NOTE ON TEST INFRA. The marketplace (Next.js 15 App Router) package does NOT
 * ship a DOM render-testing toolchain — there is no React Testing Library, no
 * jsdom / happy-dom, and no vitest configured (see `package.json`: the runner
 * is `tsx --test`, i.e. Node's built-in `node:test`, with `fast-check`).
 * Introducing a heavy new DOM toolchain for a single optional test would be
 * disproportionate. Per the design's Testing Strategy — which classifies the
 * Web_Facade form layer as EXAMPLE tests — this file is the faithful,
 * DOM-free substitute: it asserts the pure logic the three client components
 * (`RegisterForm`, `LoginForm`, `PublishGate`) rely on for the required
 * behaviours. That logic was extracted, behaviour-preserving, into the pure
 * module `./communityAuthFlow` (imported and used by the components), so these
 * assertions exercise the exact code paths the rendered components run.
 *
 * What each required behaviour maps to here:
 *   • 8.1 / 8.2 — field + captcha presence: asserted structurally against the
 *     component source (phone + password inputs in both forms; the SmartCaptcha
 *     widget container ONLY in RegisterForm; NO captcha in LoginForm).
 *   • 8.4 — captcha required on register: RegisterForm blocks submit without a
 *     captcha token (asserted structurally against the guard in the source).
 *   • 8.5 — post-success redirect: `resolveSuccessTarget` sends the participant
 *     to an internal `next` path or the community hub.
 *   • 8.6 — rejection handling: the friendly message mapping and the
 *     "clear password, preserve phone" field reset.
 *   • 8.7 — publish gate: `withNext` builds register/login links carrying an
 *     internal `?next=` (and ignores non-internal `next`).
 *
 * Runner / convention (mirrors the sibling task 7.4 tests):
 *   pnpm --filter @workspace/marketplace test
 *   # or directly:
 *   npx tsx --test ./lib/communityAuthFlow.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  friendlyRegisterRejection,
  friendlyLoginRejection,
  resetFieldsAfterRejection,
  resolveSuccessTarget,
  withNext,
  isInternalPath,
  REGISTER_REJECTION_MESSAGES,
  REGISTER_REJECTION_FALLBACK,
  LOGIN_REJECTION_MESSAGES,
  LOGIN_REJECTION_FALLBACK,
  COMMUNITY_REGISTER_PATH,
  COMMUNITY_LOGIN_PATH,
  COMMUNITY_HUB_PATH,
} from "./communityAuthFlow";

// ─── Component source loading (structural render assertions) ──────────────────
// The components are Next.js client components that cannot be executed under a
// plain Node runner (no DOM). To assert the *presence* of fields / widgets
// (Requirements 8.1, 8.2, 8.4) we read the component source and assert the
// rendered markup it contains — a DOM-free stand-in for a render test.

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = join(HERE, "..", "components", "community");

function readComponent(name: string): string {
  return readFileSync(join(COMPONENTS_DIR, name), "utf8");
}

const registerSrc = readComponent("RegisterForm.tsx");
const loginSrc = readComponent("LoginForm.tsx");

// ─── Requirement 8.1 — registration form renders phone + password + captcha ───

describe("RegisterForm — Requirement 8.1: phone, password and SmartCaptcha widget", () => {
  it("renders a phone input", () => {
    assert.match(registerSrc, /id="register-phone"/);
    assert.match(registerSrc, /name="phone"/);
    assert.match(registerSrc, /type="tel"/);
  });

  it("renders a password input", () => {
    assert.match(registerSrc, /id="register-password"/);
    assert.match(registerSrc, /name="password"/);
  });

  it("renders the SmartCaptcha widget container with data-sitekey", () => {
    // captcha.js renders into `.smart-captcha` and expects a `data-sitekey`.
    assert.match(registerSrc, /className="smart-captcha"/);
    assert.match(registerSrc, /data-sitekey=\{captchaSiteKey\}/);
    // The Yandex SmartCaptcha script is loaded.
    assert.match(registerSrc, /smartcaptcha\.yandexcloud\.net\/captcha\.js/);
  });
});

// ─── Requirement 8.2 — login form renders phone + password, NO captcha ────────

describe("LoginForm — Requirement 8.2: phone + password, no captcha", () => {
  it("renders a phone input", () => {
    assert.match(loginSrc, /id="login-phone"/);
    assert.match(loginSrc, /name="phone"/);
    assert.match(loginSrc, /type="tel"/);
  });

  it("renders a password input", () => {
    assert.match(loginSrc, /id="login-password"/);
    assert.match(loginSrc, /name="password"/);
  });

  it("does NOT render a captcha widget (login is not captcha-protected)", () => {
    assert.doesNotMatch(loginSrc, /smart-captcha/);
    assert.doesNotMatch(loginSrc, /data-sitekey/);
    assert.doesNotMatch(loginSrc, /captcha\.js/);
  });
});

// ─── Requirement 8.4 — registration blocks submit without a captcha token ─────

describe("RegisterForm — Requirement 8.4: captcha token required before API call", () => {
  it("guards on an empty captcha token and returns before fetch", () => {
    // Reads the one-time token from the hidden `smart-token` input …
    assert.match(registerSrc, /get\("smart-token"\)/);
    // … and blocks submission (early return with a prompt) when it is empty.
    assert.match(registerSrc, /if\s*\(!captchaToken\)/);
    // The captcha guard sits before the actual fetch call to the endpoint.
    const guardIdx = registerSrc.indexOf("if (!captchaToken)");
    const fetchIdx = registerSrc.indexOf("await fetch(url");
    assert.ok(guardIdx > 0, "captcha guard must be present");
    assert.ok(fetchIdx > 0, "register endpoint fetch must be present");
    assert.ok(
      guardIdx < fetchIdx,
      "captcha guard must run BEFORE the register API call",
    );
  });
});

// ─── Requirement 8.6 — rejection: clear password, preserve phone ──────────────

describe("resetFieldsAfterRejection — Requirement 8.6: clear password, keep phone", () => {
  it("clears the password while preserving the phone", () => {
    const after = resetFieldsAfterRejection({
      phone: "+7 900 123-45-67",
      password: "s3cret-pass",
    });
    assert.equal(after.password, "", "password must be cleared on rejection");
    assert.equal(after.phone, "+7 900 123-45-67", "phone must be preserved");
  });

  it("keeps an already-empty phone empty and never leaks the password", () => {
    const after = resetFieldsAfterRejection({ phone: "", password: "whatever" });
    assert.equal(after.phone, "");
    assert.equal(after.password, "");
  });

  it("the components apply the same reset (setPassword('')) on rejection", () => {
    // Structural check: both forms clear the password state on API rejection.
    assert.match(registerSrc, /setPassword\(""\)/);
    assert.match(loginSrc, /setPassword\(""\)/);
  });
});

// ─── Requirement 8.6 — friendly rejection message mapping ─────────────────────

describe("friendlyRegisterRejection — Requirement 8.6", () => {
  it("maps a known reason code to its message", () => {
    assert.equal(
      friendlyRegisterRejection(409, { reason: "phone_taken" }),
      REGISTER_REJECTION_MESSAGES.phone_taken,
    );
    assert.equal(
      friendlyRegisterRejection(400, { error: "captcha_failed" }),
      REGISTER_REJECTION_MESSAGES.captcha_failed,
    );
  });

  it("falls back to status-based mapping when no reason code is present", () => {
    assert.equal(
      friendlyRegisterRejection(429, null),
      REGISTER_REJECTION_MESSAGES.too_many_requests,
    );
    assert.equal(
      friendlyRegisterRejection(409, {}),
      REGISTER_REJECTION_MESSAGES.phone_taken,
    );
    assert.equal(
      friendlyRegisterRejection(503, null),
      REGISTER_REJECTION_MESSAGES.captcha_unavailable,
    );
  });

  it("returns the generic fallback for unknown status/reason", () => {
    assert.equal(friendlyRegisterRejection(400, null), REGISTER_REJECTION_FALLBACK);
    assert.equal(
      friendlyRegisterRejection(500, { reason: "mystery" }),
      REGISTER_REJECTION_FALLBACK,
    );
  });
});

describe("friendlyLoginRejection — Requirement 8.6 / 3.7 (non-revealing)", () => {
  it("maps 401 to the single non-revealing credentials message", () => {
    assert.equal(
      friendlyLoginRejection(401, null),
      LOGIN_REJECTION_MESSAGES.invalid_credentials,
    );
    // Same message regardless of which factor failed — no leak.
    assert.equal(
      friendlyLoginRejection(401, { reason: "invalid_credentials" }),
      LOGIN_REJECTION_MESSAGES.invalid_credentials,
    );
  });

  it("maps 429 to the rate-limit message", () => {
    assert.equal(
      friendlyLoginRejection(429, null),
      LOGIN_REJECTION_MESSAGES.too_many_requests,
    );
  });

  it("returns the generic fallback for other unknown statuses", () => {
    assert.equal(friendlyLoginRejection(500, null), LOGIN_REJECTION_FALLBACK);
  });
});

// ─── Open-redirect guard — isInternalPath ────────────────────────────────────

describe("isInternalPath — open-redirect hardening", () => {
  it("accepts genuine same-origin absolute paths", () => {
    assert.equal(isInternalPath("/"), true);
    assert.equal(isInternalPath("/soobshchestvo"), true);
    assert.equal(isInternalPath("/zhk/zarya?tab=feed"), true);
    assert.equal(isInternalPath("/a/b/c#frag"), true);
  });

  it("rejects empty / non-string / relative values", () => {
    assert.equal(isInternalPath(undefined), false);
    assert.equal(isInternalPath(null), false);
    assert.equal(isInternalPath(""), false);
    assert.equal(isInternalPath("soobshchestvo"), false);
    assert.equal(isInternalPath("evil.example"), false);
  });

  it("rejects absolute cross-origin URLs", () => {
    assert.equal(isInternalPath("https://evil.example"), false);
    assert.equal(isInternalPath("http://evil.example/x"), false);
    assert.equal(isInternalPath("javascript:alert(1)"), false);
  });

  it("rejects protocol-relative (//) and backslash (/\\) forms", () => {
    assert.equal(isInternalPath("//evil.example"), false);
    assert.equal(isInternalPath("//evil.example/path"), false);
    assert.equal(isInternalPath("/\\evil.example"), false);
    assert.equal(isInternalPath("/\\\\evil"), false);
  });

  it("rejects paths carrying control characters (CR/LF/TAB/NUL)", () => {
    assert.equal(isInternalPath("/\r/evil"), false);
    assert.equal(isInternalPath("/\n//evil"), false);
    assert.equal(isInternalPath("/\t/evil"), false);
    assert.equal(isInternalPath("/\u0000/evil"), false);
  });
});

// ─── Requirement 8.5 — post-success redirect target ──────────────────────────

describe("resolveSuccessTarget — Requirement 8.5", () => {
  it("returns an internal absolute next path", () => {
    assert.equal(resolveSuccessTarget("/soobshchestvo/zhk/zarya"), "/soobshchestvo/zhk/zarya");
  });

  it("falls back to the community hub for missing / non-internal next", () => {
    assert.equal(resolveSuccessTarget(undefined), COMMUNITY_HUB_PATH);
    assert.equal(resolveSuccessTarget(null), COMMUNITY_HUB_PATH);
    assert.equal(resolveSuccessTarget(""), COMMUNITY_HUB_PATH);
    // Absolute URLs / values without a leading slash are not internal → hub.
    assert.equal(resolveSuccessTarget("https://evil.example"), COMMUNITY_HUB_PATH);
    assert.equal(resolveSuccessTarget("evil.example"), COMMUNITY_HUB_PATH);
  });

  it("rejects protocol-relative and backslash open-redirect forms → hub", () => {
    // Browsers treat these as ABSOLUTE cross-origin URLs — must NOT pass through.
    assert.equal(resolveSuccessTarget("//evil.example"), COMMUNITY_HUB_PATH);
    assert.equal(resolveSuccessTarget("//evil.example/path"), COMMUNITY_HUB_PATH);
    assert.equal(resolveSuccessTarget("/\\evil.example"), COMMUNITY_HUB_PATH);
    assert.equal(resolveSuccessTarget("/\t/evil"), COMMUNITY_HUB_PATH); // control char
    // A genuine single-slash internal path still passes.
    assert.equal(resolveSuccessTarget("/soobshchestvo"), "/soobshchestvo");
  });
});

// ─── Requirement 8.7 — publish gate offers register/login with ?next= ─────────

describe("withNext — Requirement 8.7: publish gate links carry internal ?next=", () => {
  it("builds a register link carrying the return path", () => {
    const href = withNext(COMMUNITY_REGISTER_PATH, "/soobshchestvo/zhk/zarya");
    assert.equal(
      href,
      "/soobshchestvo/registraciya?next=%2Fsoobshchestvo%2Fzhk%2Fzarya",
    );
  });

  it("builds a login link carrying the return path", () => {
    const href = withNext(COMMUNITY_LOGIN_PATH, "/soobshchestvo/zhk/zarya");
    assert.equal(href, "/soobshchestvo/vhod?next=%2Fsoobshchestvo%2Fzhk%2Fzarya");
  });

  it("ignores a missing or non-internal next (no query, no open redirect)", () => {
    assert.equal(withNext(COMMUNITY_REGISTER_PATH, undefined), COMMUNITY_REGISTER_PATH);
    assert.equal(withNext(COMMUNITY_LOGIN_PATH, null), COMMUNITY_LOGIN_PATH);
    assert.equal(withNext(COMMUNITY_REGISTER_PATH, ""), COMMUNITY_REGISTER_PATH);
    assert.equal(
      withNext(COMMUNITY_REGISTER_PATH, "https://evil.example"),
      COMMUNITY_REGISTER_PATH,
    );
    assert.equal(
      withNext(COMMUNITY_LOGIN_PATH, "evil.example"),
      COMMUNITY_LOGIN_PATH,
    );
  });

  it("ignores protocol-relative and backslash open-redirect forms (no query)", () => {
    // `//evil` and `/\evil` are cross-origin absolute URLs to the browser.
    assert.equal(withNext(COMMUNITY_REGISTER_PATH, "//evil.example"), COMMUNITY_REGISTER_PATH);
    assert.equal(withNext(COMMUNITY_LOGIN_PATH, "//evil.example/x"), COMMUNITY_LOGIN_PATH);
    assert.equal(withNext(COMMUNITY_REGISTER_PATH, "/\\evil.example"), COMMUNITY_REGISTER_PATH);
    assert.equal(withNext(COMMUNITY_LOGIN_PATH, "/\r/evil"), COMMUNITY_LOGIN_PATH); // control char
  });

  it("the publish gate uses the community register/login routes", () => {
    const gateSrc = readComponent("PublishGate.tsx");
    assert.match(gateSrc, /COMMUNITY_REGISTER_PATH/);
    assert.match(gateSrc, /COMMUNITY_LOGIN_PATH/);
    assert.equal(COMMUNITY_REGISTER_PATH, "/soobshchestvo/registraciya");
    assert.equal(COMMUNITY_LOGIN_PATH, "/soobshchestvo/vhod");
  });
});
