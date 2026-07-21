/**
 * Feature: real-price, Task 5.5 — единая Zen-шапка для залогиненного мастера.
 *
 * Pure, DOM-free logic for the public `Header` (`components/Header.tsx`) to
 * decide, on the client, whether the current visitor is an authenticated
 * master and — if so — what avatar-menu / «＋ Создать объект» controls to show.
 *
 * WHY CLIENT-SIDE (critical architectural constraint):
 *   The public site relies on SSG/ISR for its SEO pages (`/ceny/*`, `/raboty/*`,
 *   `/indeks`, …) — that is the whole point of the real-price flywheel. Resolving
 *   the master in the shared root `app/layout.tsx` would call `cookies()`, which
 *   opts the ENTIRE app into dynamic rendering and destroys SSG/ISR. So the
 *   Header (a client component) detects the session with a post-hydration
 *   `fetch('/api/cabinet/auth/me')` and swaps the CTA in place. Anonymous
 *   visitors (the vast majority) see the plain «Войти» CTA with zero cost.
 *
 * This module holds the pure seam so it can be unit-tested under `node:test`
 * without a DOM (mirrors the `buildPriceIndex` convention in api-server and the
 * sibling community form tests). The React wiring lives in `Header.tsx`.
 *
 * Validates: Requirement 10.1 (единый Zen-мир: залогиненный мастер остаётся на
 * сайте в общей Zen-шапке; появляются аватар-меню и «＋ Создать объект»).
 */

/** Narrow façade of the master returned by `GET /api/cabinet/auth/me`
 *  (proxied to `/api/master-pwa/auth/me`). Only the fields the header needs. */
export interface HeaderMaster {
  id: number;
  alias: string;
  avatarUrl: string | null;
  /** Best-effort contact line for the menu (phone → pwaLogin → null). */
  contact: string | null;
}

export type HeaderSession =
  | { status: "anonymous" }
  | { status: "master"; master: HeaderMaster };

/** Destination for the header «＋ Создать объект» CTA. Objects are created from
 *  an order (1 заказ = 1 Объект), so the CTA lands on the «Мои Объекты» hub
 *  (`/cabinet/objects`, task 5.6) where the master picks an order to fill in. */
export const CREATE_OBJECT_HREF = "/cabinet/objects";

/** Navigation entries in the avatar dropdown (logout is a separate action). */
export interface HeaderMenuItem {
  href: string;
  label: string;
}

export const MASTER_MENU_ITEMS: readonly HeaderMenuItem[] = [
  { href: "/cabinet/orders", label: "Мои заказы" },
  { href: "/cabinet/objects", label: "Мои Объекты" },
  { href: "/cabinet/profile", label: "Профиль" },
  { href: "/cabinet/dashboard", label: "Метрики" },
];

const ANONYMOUS: HeaderSession = { status: "anonymous" };

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): string | null {
  return nonEmptyString(value) ? value.trim() : null;
}

/**
 * Derive the header session from the raw `/api/cabinet/auth/me` payload.
 *
 * Returns `master` only for a well-formed payload with a numeric `id` and a
 * non-empty `alias`; anything else (null, 401 body, error object, malformed
 * JSON already parsed to a non-object, missing fields) resolves to anonymous so
 * the header never renders broken owner controls.
 */
export function deriveHeaderSession(raw: unknown): HeaderSession {
  if (raw === null || typeof raw !== "object") return ANONYMOUS;

  const rec = raw as Record<string, unknown>;
  const id = rec.id;
  if (typeof id !== "number" || !Number.isFinite(id)) return ANONYMOUS;
  if (!nonEmptyString(rec.alias)) return ANONYMOUS;

  const contact =
    optionalString(rec.phone) ?? optionalString(rec.pwaLogin) ?? null;

  return {
    status: "master",
    master: {
      id,
      alias: rec.alias.trim(),
      avatarUrl: optionalString(rec.customAvatarUrl),
      contact,
    },
  };
}

/**
 * Single uppercase initial for the avatar chip. Uses the first grapheme-ish
 * character of the alias; falls back to «М» (Мастер) when the alias yields no
 * usable letter (e.g. emoji-only or whitespace, already filtered upstream).
 */
export function headerAvatarInitial(alias: string): string {
  const trimmed = alias.trim();
  if (trimmed.length === 0) return "М";
  return trimmed.slice(0, 1).toUpperCase();
}
