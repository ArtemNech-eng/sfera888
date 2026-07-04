"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

/**
 * Portal-grade public header (plan §21.9).
 *
 * Dense single-band layout with the green-tile wordmark on the left, primary
 * nav text links in the middle, city picker + login CTA on the right.
 * Sticky band, hairline border that appears on scroll. Mobile drawer
 * exposes the same options stacked.
 *
 * The city picker is a placeholder until the city-detection backend ships
 * (plan §11.10.3). For now it links to /mastera as a sane catch-all.
 */
const NAV: NavItem[] = [
  { href: "/raboty", label: "Идеи" },
  { href: "/dizajn", label: "AI-дизайн" },
  { href: "/kalkulyator", label: "Калькулятор" },
  { href: "/uslugi", label: "Услуги" },
  { href: "/mastera", label: "Мастера" },
  { href: "/soobshchestvo", label: "Соседи" },
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
          : "border-b border-transparent bg-[var(--color-surface)]/95 backdrop-blur"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
        {/* Wordmark — clean type, no tile-icon (magazine-feel) */}
        <Link href="/" className="flex items-center gap-2 text-[var(--color-text)]">
          <span className="font-display text-xl leading-none sm:text-[1.375rem]">
            Честные мастера
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="ml-10 hidden items-center gap-6 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm transition ${
                  active
                    ? "font-semibold text-[var(--color-primary)]"
                    : "font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {/* City picker — placeholder, links to catalog until detection ships */}
          <Link
            href="/mastera"
            className="hidden items-center gap-1.5 text-sm font-medium text-[var(--color-text)] transition hover:text-[var(--color-primary)] lg:inline-flex"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Москва
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Link>

          <a
            href={EXTERNAL_FOR_MASTERS}
            className="hidden text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)] lg:inline"
            rel="noopener noreferrer"
          >
            Для мастеров
          </a>

          <Link
            href="/login"
            className="hidden h-10 items-center rounded-md bg-[var(--color-cta)] px-4 text-sm font-semibold text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)] sm:inline-flex"
          >
            Войти
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-text)] hover:bg-[var(--color-cream-deep)] lg:hidden"
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
              <li>
                <Link
                  href="/mastera"
                  className="flex items-center gap-2 py-4 text-base text-[var(--color-text)]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Город: <span className="font-semibold">Москва</span>
                </Link>
              </li>
              {NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block py-4 text-base ${
                        active ? "font-semibold text-[var(--color-primary)]" : "text-[var(--color-text)]"
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
                  className="my-3 inline-flex w-full items-center justify-center rounded-md bg-[var(--color-cta)] px-4 py-3 text-base font-semibold text-[var(--color-on-cta)]"
                >
                  Войти в кабинет
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
