"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

/**
 * Editorial public header (plan §21 visual direction).
 *
 * Magazine-masthead approach — a single thin band with the wordmark on the
 * left, primary nav as text links in the middle, secondary entrance ("Войти",
 * "Для мастеров") on the right. No icon-in-coloured-tile logo, no gradient
 * tint on the active link, no rounded buttons. Active state is a tracked
 * underline. Sticky, with a hairline border that appears on scroll.
 */
const NAV: NavItem[] = [
  { href: "/raboty", label: "Работы" },
  { href: "/dizajn", label: "AI-дизайн" },
  { href: "/uslugi", label: "Услуги" },
  { href: "/mastera", label: "Мастера" },
  { href: "/kalkulyator", label: "Калькулятор" },
];

const EXTERNAL_FOR_MASTERS = "https://sfera-master.ru/masteram";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname() ?? "/";

  // Hairline appears once the user starts scrolling so the hero stays clean.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-close mobile drawer on navigation.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Body scroll lock while drawer is open.
  useEffect(() => {
    if (!menuOpen || typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <header
      className={`sticky top-0 z-40 transition-colors ${
        scrolled
          ? "border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur"
          : "border-b border-transparent bg-[var(--color-background)]/95 backdrop-blur"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
        {/* Wordmark — text-led, no icon-in-tile chrome. */}
        <Link
          href="/"
          className="flex items-center gap-2 text-[var(--color-text)]"
        >
          <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center bg-[var(--color-text)]">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
              aria-hidden
            >
              <path d="M4 12 12 4l8 8" />
              <path d="m9 16 3 3 6-6" stroke="#A4642A" />
            </svg>
          </span>
          <span className="font-editorial text-lg leading-none sm:text-xl">
            Честные мастера
          </span>
        </Link>

        {/* Desktop nav — text links with tracked underline on active. */}
        <nav className="ml-12 hidden items-center gap-7 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition ${
                  active
                    ? "font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-[6px]"
                    : "font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-5">
          <a
            href={EXTERNAL_FOR_MASTERS}
            className="hidden text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)] lg:inline"
            rel="noopener noreferrer"
          >
            Для мастеров
          </a>

          <Link
            href="/login"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-border-strong)] underline-offset-4 transition hover:decoration-[var(--color-text)] sm:inline"
          >
            Войти
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            className="inline-flex h-10 w-10 items-center justify-center text-[var(--color-text)] lg:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="lg:hidden">
          <nav className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
            <ul className="mx-auto flex max-w-6xl flex-col divide-y divide-[var(--color-border)] px-4 sm:px-6">
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block py-4 text-base ${
                        active
                          ? "font-semibold text-[var(--color-text)]"
                          : "text-[var(--color-text)]"
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
                  className="block py-4 text-base text-[var(--color-muted)]"
                  rel="noopener noreferrer"
                >
                  Для мастеров
                </a>
              </li>
              <li>
                <Link
                  href="/login"
                  className="block py-4 text-base font-semibold text-[var(--color-text)]"
                >
                  Войти в кабинет →
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
