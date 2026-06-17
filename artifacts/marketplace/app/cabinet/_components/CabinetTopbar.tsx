"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CabinetMaster } from "@/lib/cabinetAuth";

interface Props {
  master: CabinetMaster;
}

/**
 * Sticky topbar for cabinet routes. Hosts the brand link (back to public
 * site), session info, and logout. Bottom-nav remains the primary navigation
 * surface on mobile.
 */
export function CabinetTopbar({ master }: Props) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/cabinet/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Ignore — clearing the cookie via the proxy isn't strictly required:
      // a hard refresh + the cabinet layout's auth-guard will redirect to
      // /login on next render anyway.
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-white px-4 sm:px-6">
      <Link
        href="/cabinet/orders"
        className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]"
      >
        <span aria-hidden className="inline-block h-7 w-7 rounded-lg bg-[var(--color-primary)]" />
        <span className="hidden sm:inline">Кабинет мастера</span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/"
          className="hidden text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] sm:inline"
        >
          На сайт
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-2 pr-3 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">
              {master.alias.slice(0, 1).toUpperCase()}
            </span>
            <span className="max-w-[100px] truncate">{master.alias}</span>
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-11 w-56 rounded-xl border border-[var(--color-border)] bg-white p-2 shadow-lg"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className="px-3 py-2 text-xs text-[var(--color-muted)]">
                {master.phone ?? master.pwaLogin ?? "—"}
              </div>
              <div className="my-1 h-px bg-[var(--color-border)]" />
              <Link
                href="/cabinet/profile"
                role="menuitem"
                className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface,#f5f5f7)]"
                onClick={() => setMenuOpen(false)}
              >
                Профиль
              </Link>
              <Link
                href="/cabinet/dashboard"
                role="menuitem"
                className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface,#f5f5f7)]"
                onClick={() => setMenuOpen(false)}
              >
                Метрики
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                disabled={loggingOut}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {loggingOut ? "Выход…" : "Выйти из аккаунта"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
