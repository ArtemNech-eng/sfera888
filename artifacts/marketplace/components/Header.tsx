"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  external?: boolean;
  /** When true, the entry is the in-scope flagship link (Идеи, Работы, etc.). */
  primary?: boolean;
}

/**
 * Public navigation. Order reflects the planner-first funnel from plan §20.2:
 *   Идеи → Работы → AI-дизайн → Услуги → Мастера.
 * "Идеи" and "ЖК"/"Цены" point to existing routes that double up — we'll
 * split them into their own pages as plan sections §11.11 / §19 ship.
 */
const NAV: NavItem[] = [
  { href: "/raboty", label: "Работы", primary: true },
  { href: "/dizajn", label: "AI-дизайн", primary: true },
  { href: "/uslugi", label: "Услуги" },
  { href: "/mastera", label: "Мастера" },
];

const EXTERNAL_FOR_MASTERS = "https://sfera-master.ru/masteram";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname() ?? "/";

  // Sticky shadow only after the user scrolls — keeps the hero hero clean.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu when navigating.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    if (!menuOpen || typeof document === "undefined") {
      return undefined;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-shadow ${
        scrolled
          ? "border-[var(--color-border)] bg-white/95 backdrop-blur shadow-sm"
          : "border-transparent bg-[var(--color-background)]/95 backdrop-blur"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-bold tracking-tight text-[var(--color-text)]"
        >
          <span aria-hidden className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-teal-500 text-white shadow-sm">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 12 12 3l9 9" />
              <path d="M5 10v10h14V10" />
              <path d="M9 21V14h6v7" />
            </svg>
          </span>
          <span className="text-base sm:text-lg">Честные мастера</span>
        </Link>

        {/* Desktop nav */}
        <nav className="ml-auto hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "text-[var(--color-primary)] bg-[var(--color-primary-soft)]/50"
                    : "text-[var(--color-text)] hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <a
            href={EXTERNAL_FOR_MASTERS}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]"
            rel="noopener noreferrer"
          >
            Для мастеров
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {/* Login — secondary outline button so it doesn't fight with the
              hero CTAs. Hides on the smallest screens (mobile menu has it). */}
          <Link
            href="/login"
            className="hidden h-10 items-center rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] sm:inline-flex"
          >
            Войти
          </Link>

          {/* Mobile menu trigger */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-text)] transition hover:border-[var(--color-primary)] lg:hidden"
          >
            {menuOpen ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="lg:hidden">
          <nav className="border-t border-[var(--color-border)] bg-white">
            <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-xl px-4 py-3 text-base font-medium transition-colors ${
                        active
                          ? "bg-[var(--color-primary-soft)]/50 text-[var(--color-primary)]"
                          : "text-[var(--color-text)] hover:bg-slate-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <a
                  href={EXTERNAL_FOR_MASTERS}
                  className="block rounded-xl px-4 py-3 text-base font-medium text-[var(--color-muted)] hover:bg-slate-100 hover:text-[var(--color-text)]"
                  rel="noopener noreferrer"
                >
                  Для мастеров
                </a>
              </li>
              <li className="mt-2 border-t border-[var(--color-border)] pt-3">
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-[var(--color-primary-hover)]"
                >
                  Войти в кабинет мастера
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
