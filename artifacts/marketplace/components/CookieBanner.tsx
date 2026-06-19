"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "kiro_consent_v1";
const ACCEPTED_VALUE = "accepted-v1";

/**
 * Cookie consent banner (plan §22 visitor-fingerprint F0).
 *
 * Shown on every page until the user clicks «Понятно». Required by
 * 152-ФЗ before we can legitimately use `kiro_anon_id` cookie for
 * saves (Iter 4). State stored in localStorage — survives sessions,
 * not synced across devices (which is fine for consent-style UX).
 *
 * Design rules:
 *   • Bottom sheet on mobile, bottom-right card on desktop
 *   • Does NOT block content underneath (max-width on desktop, no overlay)
 *   • Does NOT block first click anywhere on the page (pointer-events isolated to the card)
 *   • SSR-safe: renders nothing during server pass, mounts after hydration
 *
 * Hydration safety: we ALWAYS render `null` on first client render (matches
 * SSR), then `useEffect` flips visibility based on localStorage. No
 * mismatch warnings, no flicker for users who already accepted.
 */
export function CookieBanner() {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      if (value !== ACCEPTED_VALUE) setShow(true);
    } catch {
      // localStorage blocked (private mode, sandbox) — skip the banner;
      // we don't have a way to remember the consent anyway.
    }
  }, []);

  function accept() {
    try {
      window.localStorage.setItem(STORAGE_KEY, ACCEPTED_VALUE);
    } catch {
      // Best-effort — if storage is blocked, the banner reappears next visit.
    }
    setShow(false);
  }

  // Server pass + the moment between hydration and useEffect → render nothing.
  if (!mounted || !show) return null;

  return (
    <div
      role="dialog"
      aria-label="Уведомление об использовании cookie"
      className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
    >
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-cozy-md sm:p-5">
        <p className="text-sm text-[var(--color-text)]">
          <span className="font-bold">Используем cookie</span> для работы сохранений и
          защиты от ботов. Технические параметры устройства (браузер, экран, часовой пояс)
          обрабатываются для аналитики и rate-limit.
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link
            href="/policy/privacy#cookies"
            className="text-xs font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4 transition hover:decoration-[var(--color-text)]"
          >
            Подробнее
          </Link>
          <button
            type="button"
            onClick={accept}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}
