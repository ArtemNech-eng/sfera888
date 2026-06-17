"use client";

import { useRouter } from "next/navigation";

interface Props {
  alias: string;
}

/**
 * Full-screen placeholder shown when the master account is suspended. Mirrors
 * master-pwa's `SuspendedScreen`: explain the state, offer a logout path, do
 * not let them navigate further into cabinet UI.
 */
export function SuspendedScreen({ alias }: Props) {
  const router = useRouter();

  async function logout() {
    try {
      await fetch("/api/cabinet/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      /* ignore — UX redirects regardless */
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--color-background,#f8fafc)] px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-500"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M4.93 4.93l14.14 14.14" />
        </svg>
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Аккаунт заблокирован</h1>
        <p className="max-w-xs text-sm text-[var(--color-muted)]">
          {alias}, ваш аккаунт временно отстранён от работы. Свяжитесь с менеджером для уточнения деталей.
        </p>
      </div>
      <button
        type="button"
        onClick={logout}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface,#f5f5f7)]"
      >
        Выйти из аккаунта
      </button>
    </div>
  );
}
