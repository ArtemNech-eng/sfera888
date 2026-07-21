"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  deriveHeaderSession,
  headerAvatarInitial,
  MASTER_MENU_ITEMS,
  CREATE_OBJECT_HREF,
  type HeaderSession,
  type HeaderMaster,
} from "../lib/headerSession";

interface NavItem {
  href: string;
  label: string;
}

/** Город сообщества для переключателя в шапке (передаётся из layout). */
interface CityOption {
  slug: string;
  name: string;
}

/**
 * Portal-grade public header (plan §21.9) + единый Zen-мир (real-price §5.5).
 *
 * Dense single-band layout with the wordmark on the left, primary nav text
 * links in the middle, city picker + auth cluster on the right. Sticky band,
 * hairline border that appears on scroll. Mobile drawer exposes the same
 * options stacked.
 *
 * Auth cluster (real-price Req 10.1): the header detects the logged-in master
 * on the CLIENT via `GET /api/cabinet/auth/me` (see `lib/headerSession.ts` for
 * why this must not happen in the root layout — it would force the whole site
 * dynamic and break SSG/ISR for the SEO pages). Anonymous visitors keep the
 * plain «Войти» CTA; a logged-in master gets «＋ Создать объект» + avatar-menu
 * so they stay in one Zen product instead of teleporting to a separate app.
 *
 * The city picker is a placeholder until the city-detection backend ships
 * (plan §11.10.3). For now it links to /soobshchestvo as a sane catch-all.
 */
const NAV: NavItem[] = [
  { href: "/raboty", label: "Идеи" },
  { href: "/dizajn", label: "AI-дизайн" },
  { href: "/kalkulyator", label: "Калькулятор" },
  { href: "/uslugi", label: "Услуги" },
  { href: "/mastera", label: "Мастера" },
  { href: "/soobshchestvo", label: "Соседи" },
  { href: "/pro", label: "Хочу также ПРО" },
];

const EXTERNAL_FOR_MASTERS = "https://sfera-master.ru/masteram";

/**
 * Client hook: resolve the current master (if any) after hydration.
 *
 * Returns `null` while the request is in flight so callers can render the
 * anonymous CTA optimistically (the common case) and swap in owner controls
 * once resolved. `reset()` flips to anonymous locally after logout without a
 * full reload.
 */
function useHeaderSession(): { session: HeaderSession | null; reset: () => void } {
  const [session, setSession] = useState<HeaderSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cabinet/auth/me", {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (cancelled) return;
        if (!res.ok) {
          setSession({ status: "anonymous" });
          return;
        }
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        setSession(deriveHeaderSession(data));
      } catch {
        if (!cancelled) setSession({ status: "anonymous" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = useCallback(() => setSession({ status: "anonymous" }), []);
  return { session, reset };
}

export function Header({ cities = [] }: { cities?: CityOption[] }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const { session, reset } = useHeaderSession();
  const master = session?.status === "master" ? session.master : null;

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
    setCityMenuOpen(false);
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
          {/* City picker → раздел «Соседи»: дропдаун реальных городов сообщества */}
          {cities.length > 0 ? (
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setCityMenuOpen((v) => !v)}
                aria-expanded={cityMenuOpen}
                aria-label="Выбрать город сообщества"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)] transition hover:text-[var(--color-primary)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Город
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {cityMenuOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-cozy-md">
                  <ul className="flex flex-col">
                    {cities.map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={`/goroda/${c.slug}`}
                          className="block rounded-lg px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-cream-deep)]"
                        >
                          {c.name}
                        </Link>
                      </li>
                    ))}
                    <li className="mt-1 border-t border-[var(--color-border)] pt-1">
                      <Link
                        href="/soobshchestvo"
                        className="block rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-cream-deep)]"
                      >
                        Все сообщества
                      </Link>
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <Link
              href="/soobshchestvo"
              className="hidden items-center gap-1.5 text-sm font-medium text-[var(--color-text)] transition hover:text-[var(--color-primary)] lg:inline-flex"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Соседи
            </Link>
          )}

          {master ? (
            <>
              <Link
                href={CREATE_OBJECT_HREF}
                className="hidden h-10 items-center gap-1.5 rounded-md bg-[var(--color-cta)] px-4 text-sm font-semibold text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)] sm:inline-flex"
              >
                <span aria-hidden className="text-base leading-none">＋</span>
                Создать объект
              </Link>
              <AvatarMenu master={master} onLoggedOut={reset} />
            </>
          ) : (
            <>
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
            </>
          )}

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
              {cities.length > 0 ? (
                <li className="py-3">
                  <p className="pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-faint)]">
                    Город
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {cities.map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={`/goroda/${c.slug}`}
                          className="inline-flex rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)]"
                        >
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}
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

              {master ? (
                <>
                  <li className="py-3">
                    <div className="flex items-center gap-3 pb-3">
                      <AvatarChip master={master} />
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-[var(--color-text)]">
                          {master.alias}
                        </p>
                        {master.contact ? (
                          <p className="truncate text-sm text-[var(--color-muted)]">{master.contact}</p>
                        ) : null}
                      </div>
                    </div>
                    <Link
                      href={CREATE_OBJECT_HREF}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-cta)] px-4 py-3 text-base font-semibold text-[var(--color-on-cta)]"
                    >
                      <span aria-hidden className="text-lg leading-none">＋</span>
                      Создать объект
                    </Link>
                  </li>
                  {MASTER_MENU_ITEMS.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="block py-4 text-base text-[var(--color-text)]">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <LogoutButton
                      onLoggedOut={reset}
                      className="block w-full py-4 text-left text-base text-red-700"
                    />
                  </li>
                </>
              ) : (
                <>
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
                </>
              )}
            </ul>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

/** Round avatar chip: custom image when present, else the alias initial. */
function AvatarChip({ master }: { master: HeaderMaster }) {
  if (master.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- external avatar, no optimization needed in header chip
    return (
      <img
        src={master.avatarUrl}
        alt=""
        className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-bold text-white">
      {headerAvatarInitial(master.alias)}
    </span>
  );
}

/**
 * Desktop avatar dropdown for a logged-in master. Mirrors the cabinet topbar
 * pattern (same Zen affordances) but lives on the public site.
 */
function AvatarMenu({ master, onLoggedOut }: { master: HeaderMaster; onLoggedOut: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Меню мастера"
        className="flex h-10 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 pr-3 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)]"
      >
        <AvatarChip master={master} />
        <span className="max-w-[110px] truncate">{master.alias}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-cozy-md"
          onMouseLeave={() => setOpen(false)}
        >
          {master.contact ? (
            <div className="truncate px-3 py-2 text-xs text-[var(--color-muted)]">{master.contact}</div>
          ) : null}
          <div className="my-1 h-px bg-[var(--color-border)]" />
          {MASTER_MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-cream-deep)]"
            >
              {item.label}
            </Link>
          ))}
          <div className="my-1 h-px bg-[var(--color-border)]" />
          <LogoutButton
            onLoggedOut={() => {
              setOpen(false);
              onLoggedOut();
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 transition hover:bg-red-50 disabled:opacity-50"
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Logout action shared by the desktop menu and mobile drawer. Posts to the
 * cabinet proxy (`/api/cabinet/auth/logout` → master-pwa), flips the local
 * session to anonymous, and refreshes so any server-rendered content re-reads
 * the cleared cookie. Mirrors `CabinetTopbar` but keeps the user on the site.
 */
function LogoutButton({
  onLoggedOut,
  className,
}: {
  onLoggedOut: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/cabinet/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Ignore — worst case the cabinet auth-guard redirects to /login later.
    }
    onLoggedOut();
    router.refresh();
  }

  return (
    <button type="button" role="menuitem" onClick={handleLogout} disabled={loggingOut} className={className}>
      {loggingOut ? "Выход…" : "Выйти из аккаунта"}
    </button>
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
