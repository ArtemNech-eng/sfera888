/**
 * Property tests for the pure client-side community auth form validator
 * (`./communityAuthForm.ts`) — spec: community-phone-registration, Task 7.4.
 *
 * Feature: community-phone-registration, Task 7.4
 * Property 8.3-validator: the Web_Facade rejects submissions with a phone
 * outside 10–15 digits or a password outside 8–72 characters BEFORE calling the
 * Community_Auth_Service (Requirement 8.3). The module under test is a pure,
 * server-free validator (no React / next / DOM), so these tests run fully
 * in-memory.
 *
 * Validates: Requirements 8.3
 *
 * Runner / convention. The marketplace (Next.js 15) package uses Node's
 * built-in test runner (`node:test`) driven by `tsx` (see `package.json` →
 * `"test": "tsx --test ./lib/**\/*.test.ts"`), with `fast-check` for
 * generators — the same convention as the sibling community property tests
 * (`communityLocalityMeta.property.test.ts`). Run:
 *
 *   pnpm --filter @workspace/marketplace test
 *   # or, directly:
 *   npx tsx --test ./lib/communityAuthForm.property.test.ts
 *
 * Each property runs a minimum of 100 iterations (`{ numRuns: 200 }`) and the
 * generators are pinned to include the exact boundary values 9/10/15/16 digit
 * phones and 7/8/72/73 character passwords (Property 2 boundary mandate).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  validateCommunityAuthForm,
  validatePhoneField,
  validatePasswordField,
  countPhoneDigits,
  PHONE_MIN_DIGITS,
  PHONE_MAX_DIGITS,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./communityAuthForm";

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * A single digit character `0`–`9`.
 */
const digitCharArb: fc.Arbitrary<string> = fc.constantFrom(
  ..."0123456789".split(""),
);

/**
 * Non-digit separators that `countPhoneDigits` must ignore (spaces, dashes,
 * parentheses, a leading `+`, dots, non-breaking space).
 */
const separatorArb: fc.Arbitrary<string> = fc.constantFrom(
  " ",
  "-",
  "(",
  ")",
  "+",
  ".",
  "\u00a0",
  "\t",
);

/**
 * Build a phone-like string that contains exactly `digitCount` digits,
 * optionally interleaved with non-digit separators (which must not affect the
 * digit count). This lets us drive the validator across the whole digit-count
 * space independently of formatting noise.
 */
function phoneWithDigits(
  digitCount: number,
): fc.Arbitrary<string> {
  if (digitCount === 0) {
    // Pure separators / empty — zero digits.
    return fc.array(separatorArb, { minLength: 0, maxLength: 6 }).map((s) => s.join(""));
  }
  return fc
    .tuple(
      fc.array(digitCharArb, { minLength: digitCount, maxLength: digitCount }),
      fc.array(separatorArb, { minLength: 0, maxLength: digitCount }),
    )
    .map(([digits, seps]) => {
      // Interleave separators between digits without adding/removing digits.
      const out: string[] = [];
      for (let i = 0; i < digits.length; i += 1) {
        if (seps[i]) out.push(seps[i]);
        out.push(digits[i]);
      }
      if (seps[digits.length]) out.push(seps[digits.length]);
      return out.join("");
    });
}

/**
 * Digit counts to exercise. MUST include the boundaries 9/10/15/16 plus 0
 * (empty/required) and a broad spread on either side of the [10,15] window.
 */
const digitCountArb: fc.Arbitrary<number> = fc.oneof(
  // pinned boundaries (Property boundary mandate)
  fc.constantFrom(0, 9, 10, 15, 16),
  // broader spread: too-short, in-range, too-long
  fc.integer({ min: 0, max: 25 }),
);

/** Arbitrary phone string spanning the whole digit-count space. */
const phoneArb: fc.Arbitrary<string> = digitCountArb.chain(phoneWithDigits);

/**
 * Password lengths to exercise. MUST include the boundaries 7/8/72/73 plus 0
 * (empty/required) and a spread across and beyond the [8,72] window.
 */
const passwordLengthArb: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(0, 7, 8, 72, 73),
  fc.integer({ min: 0, max: 90 }),
);

/** Arbitrary password string of a controlled length. */
const passwordArb: fc.Arbitrary<string> = passwordLengthArb.chain((len) =>
  fc.string({ minLength: len, maxLength: len }),
);

// ─── Property 8.3-validator — phone field ─────────────────────────────────────
// Feature: community-phone-registration, Task 7.4
// Property 8.3-validator (phone): validatePhoneField returns null iff the digit
// count is within [10,15]; else phone_required for 0 digits, phone_length otherwise.

describe("communityAuthForm — Property 8.3 (phone field validity ⇔ 10–15 digits)", () => {
  // Validates: Requirements 8.3

  it("validatePhoneField === null iff digit count ∈ [10,15]; else required/length", () => {
    fc.assert(
      fc.property(phoneArb, (phone) => {
        const digits = countPhoneDigits(phone);
        const result = validatePhoneField(phone);

        if (digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS) {
          assert.equal(
            result,
            null,
            `phone with ${digits} digits must be valid: ${JSON.stringify(phone)}`,
          );
        } else if (digits === 0) {
          assert.equal(
            result,
            "phone_required",
            `phone with 0 digits must be phone_required: ${JSON.stringify(phone)}`,
          );
        } else {
          assert.equal(
            result,
            "phone_length",
            `phone with ${digits} digits must be phone_length: ${JSON.stringify(phone)}`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it("boundary digit counts 9/10/15/16 classify exactly", () => {
    // 9 digits → too short (phone_length)
    assert.equal(validatePhoneField("123456789"), "phone_length");
    // 10 digits → valid (lower boundary)
    assert.equal(validatePhoneField("1234567890"), null);
    // 15 digits → valid (upper boundary)
    assert.equal(validatePhoneField("123456789012345"), null);
    // 16 digits → too long (phone_length)
    assert.equal(validatePhoneField("1234567890123456"), "phone_length");
    // 0 digits → required
    assert.equal(validatePhoneField(""), "phone_required");
    assert.equal(validatePhoneField("+-() "), "phone_required");
  });

  it("non-digit separators are ignored by countPhoneDigits (10 digits stays valid)", () => {
    // 10 digits formatted with +, spaces, dashes and parentheses.
    const formatted = "+1 (234) 567-890";
    assert.equal(countPhoneDigits(formatted), 10);
    assert.equal(validatePhoneField(formatted), null);
  });
});

// ─── Property 8.3-validator — password field ──────────────────────────────────
// Feature: community-phone-registration, Task 7.4
// Property 8.3-validator (password): validatePasswordField returns null iff
// length ∈ [8,72]; else password_required for empty, password_length otherwise.

describe("communityAuthForm — Property 8.3 (password field validity ⇔ 8–72 chars)", () => {
  // Validates: Requirements 8.3

  it("validatePasswordField === null iff length ∈ [8,72]; else required/length", () => {
    fc.assert(
      fc.property(passwordArb, (password) => {
        const len = password.length;
        const result = validatePasswordField(password);

        if (len >= PASSWORD_MIN_LENGTH && len <= PASSWORD_MAX_LENGTH) {
          assert.equal(result, null, `password length ${len} must be valid`);
        } else if (len === 0) {
          assert.equal(
            result,
            "password_required",
            "empty password must be password_required",
          );
        } else {
          assert.equal(
            result,
            "password_length",
            `password length ${len} must be password_length`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it("boundary lengths 7/8/72/73 classify exactly", () => {
    assert.equal(validatePasswordField("a".repeat(7)), "password_length"); // too short
    assert.equal(validatePasswordField("a".repeat(8)), null); // lower boundary
    assert.equal(validatePasswordField("a".repeat(72)), null); // upper boundary
    assert.equal(validatePasswordField("a".repeat(73)), "password_length"); // too long
    assert.equal(validatePasswordField(""), "password_required"); // empty
  });
});

// ─── Property 8.3-validator — form composition ────────────────────────────────
// Feature: community-phone-registration, Task 7.4
// The whole-form validator composes the two field validators: it reports the
// field-keyed errors iff the corresponding field validator fails, and returns
// an empty map (⇒ the facade may call the service) iff BOTH fields are valid.

describe("communityAuthForm — Property 8.3 (form composition)", () => {
  // Validates: Requirements 8.3

  it("validateCommunityAuthForm mirrors the field validators for every input", () => {
    fc.assert(
      fc.property(phoneArb, passwordArb, (phone, password) => {
        const errors = validateCommunityAuthForm({ phone, password });
        const phoneError = validatePhoneField(phone);
        const passwordError = validatePasswordField(password);

        // Each key present iff (and equal to) the corresponding field error.
        assert.equal(errors.phone ?? null, phoneError);
        assert.equal(errors.password ?? null, passwordError);

        // Empty map ⇔ both fields valid (⇒ safe to call the service).
        const isEmpty = Object.keys(errors).length === 0;
        assert.equal(isEmpty, phoneError === null && passwordError === null);

        // No stray keys beyond the two known fields.
        for (const key of Object.keys(errors)) {
          assert.ok(
            key === "phone" || key === "password",
            `unexpected error key: ${key}`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it("a valid phone + valid password yields an empty error map", () => {
    assert.deepEqual(
      validateCommunityAuthForm({ phone: "+7 912 345 67 89", password: "correct horse" }),
      {},
    );
  });

  it("both fields invalid ⇒ both keys reported", () => {
    const errors = validateCommunityAuthForm({ phone: "123", password: "short" });
    assert.equal(errors.phone, "phone_length");
    assert.equal(errors.password, "password_length");
  });
});
