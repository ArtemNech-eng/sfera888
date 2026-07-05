/**
 * Pure client-side validation for the community auth forms (registration /
 * login) — spec: community-phone-registration.
 *
 * Extracted as a pure, server-free module (no `"use client"`, no React, no
 * `next/*`, no DOM) so the field-level validation contract can be asserted by
 * unit / property tests (tasks 7.4 / 7.5) without dragging in the Next.js
 * client runtime — the same pattern as `lib/communityLocalityForm.ts`.
 *
 * Contract encoded here (Requirement 8.1, 8.3):
 *   • Phone: between 10 and 15 DIGITS inclusive (non-digit separators such as
 *     spaces, dashes, parentheses and a leading `+` are ignored — only the
 *     count of digit characters matters at the facade layer; canonical
 *     normalisation to `+7…` happens server-side).
 *   • Password: between 8 and 72 characters inclusive (`Password_Policy`).
 *
 * The Web_Facade validates BEFORE calling the Community_Auth_Service and does
 * not hit the API when validation fails (Requirement 8.3).
 */

/** Phone must contain between this many digits (inclusive lower bound). */
export const PHONE_MIN_DIGITS = 10;
/** Phone must contain at most this many digits (inclusive upper bound). */
export const PHONE_MAX_DIGITS = 15;

/** Password_Policy lower bound (inclusive), in characters. */
export const PASSWORD_MIN_LENGTH = 8;
/** Password_Policy upper bound (inclusive), in characters — bcrypt byte cap. */
export const PASSWORD_MAX_LENGTH = 72;

/** Which form field failed client-side validation. */
export type CommunityAuthFieldError =
  | "phone_required"
  | "phone_length"
  | "password_required"
  | "password_length";

/** Field-keyed validation errors. Empty object === input is valid. */
export interface CommunityAuthFormErrors {
  phone?: CommunityAuthFieldError;
  password?: CommunityAuthFieldError;
}

/** Count the digit characters in an arbitrary string. */
export function countPhoneDigits(raw: string): number {
  let n = 0;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") n += 1;
  }
  return n;
}

/**
 * Validate a phone value at the facade layer (Requirement 8.1, 8.3).
 * Returns a field-error code, or `null` when the phone is acceptable.
 */
export function validatePhoneField(raw: string): CommunityAuthFieldError | null {
  const digits = countPhoneDigits(raw);
  if (digits === 0) return "phone_required";
  if (digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) return "phone_length";
  return null;
}

/**
 * Validate a password value against Password_Policy (Requirement 8.3).
 * Returns a field-error code, or `null` when the password is acceptable.
 */
export function validatePasswordField(raw: string): CommunityAuthFieldError | null {
  if (raw.length === 0) return "password_required";
  if (raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH) {
    return "password_length";
  }
  return null;
}

/**
 * Validate the registration/login form input as a whole. Returns a map of the
 * fields that failed; an empty map means the input passed client validation
 * and the Web_Facade may call the Community_Auth_Service (Requirement 8.3).
 */
export function validateCommunityAuthForm(input: {
  phone: string;
  password: string;
}): CommunityAuthFormErrors {
  const errors: CommunityAuthFormErrors = {};
  const phoneError = validatePhoneField(input.phone);
  if (phoneError) errors.phone = phoneError;
  const passwordError = validatePasswordField(input.password);
  if (passwordError) errors.password = passwordError;
  return errors;
}

/** Human-readable Russian copy for each field-level validation error. */
export const COMMUNITY_AUTH_FIELD_MESSAGES: Record<CommunityAuthFieldError, string> = {
  phone_required: "Введите номер телефона.",
  phone_length: "Телефон должен содержать от 10 до 15 цифр.",
  password_required: "Введите пароль.",
  password_length: "Пароль должен быть от 8 до 72 символов.",
};
