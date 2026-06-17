"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  enablePush,
  disablePush,
  getPushState,
  type PushState,
} from "../_lib/push";

/**
 * Compact opt-in card for browser push notifications.
 *
 * Surfaces in three places without the user having to think — dashboard banner,
 * profile editor section, anywhere the master is likely to spend dwell time.
 *
 * The card hides itself entirely when push isn't supported (Safari before iOS
 * 16.4 / WebView, or non-https). When permission is denied, we render a
 * read-only hint pointing at the browser settings — re-prompting is impossible.
 *
 * Live state subscribes to `notificationclick` in case the user later disables
 * notifications via the system tray and reopens the tab.
 */
export function PushNotificationCard({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushState().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next.status === "subscribed") {
        toast.success("Уведомления включены — будем сообщать о новых заявках.");
      } else if (next.status === "denied") {
        toast.error("Браузер заблокировал уведомления. Разрешите их в настройках сайта.");
      } else if (next.status === "unsupported") {
        toast.error("Этот браузер не поддерживает push-уведомления.");
      } else if (next.status === "error") {
        toast.error("Не удалось включить уведомления. Попробуйте ещё раз.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      const next = await disablePush();
      setState(next);
      toast.success("Уведомления отключены.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  if (state.status === "unsupported") return null;

  if (compact) {
    // Dashboard variant — single-line strip, hidden once subscribed.
    if (state.status === "subscribed") return null;
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${
          state.status === "denied"
            ? "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted)]"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">
          {state.status === "denied"
            ? "Уведомления заблокированы. Разрешите их в настройках браузера."
            : "Включите уведомления, чтобы не пропускать заявки"}
        </span>
        {state.status !== "denied" ? (
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:opacity-50"
          >
            {busy ? <Spinner /> : null}
            Включить
          </button>
        ) : null}
      </div>
    );
  }

  // Full variant — for profile/edit, with descriptive help text.
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-4">
        <span className="mt-1 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <BellIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-[var(--color-text)]">Уведомления</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            {state.status === "subscribed"
              ? "Сейчас вам приходят push-уведомления о новых заявках, ответах диспетчера и оплатах."
              : state.status === "denied"
                ? "Браузер заблокировал уведомления для этого сайта. Разрешите их в настройках, чтобы получать заявки моментально."
                : "Включите push-уведомления — будем мгновенно сообщать о новых заявках и ответах."}
          </p>
          <div className="mt-4">
            {state.status === "subscribed" ? (
              <button
                type="button"
                onClick={handleDisable}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:border-red-300 hover:text-red-700 disabled:opacity-50"
              >
                {busy ? <Spinner /> : null}
                Отключить уведомления
              </button>
            ) : state.status === "denied" ? (
              <p className="text-xs text-[var(--color-muted)]">
                Откройте настройки сайта в браузере и переключите «Уведомления» на «Разрешить».
              </p>
            ) : (
              <button
                type="button"
                onClick={handleEnable}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:opacity-50"
              >
                {busy ? <Spinner /> : <BellSmallIcon />}
                Включить уведомления
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function BellSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
  );
}
