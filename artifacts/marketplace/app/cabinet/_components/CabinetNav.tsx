"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cabinetChat } from "../_lib/cabinetClient";

const UNREAD_POLL_MS = 30_000;

const ITEMS: Array<{
  href: string;
  label: string;
  short: string;
  icon: React.ReactNode;
}> = [
  {
    href: "/cabinet/orders",
    label: "Заказы",
    short: "Заказы",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 8h18" />
        <path d="M8 14h6" />
      </svg>
    ),
  },
  {
    href: "/cabinet/chat",
    label: "Чат",
    short: "Чат",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/cabinet/balance",
    label: "Баланс",
    short: "Баланс",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <circle cx="17" cy="15" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/cabinet/schedule",
    label: "Расписание",
    short: "Календарь",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
  {
    href: "/cabinet/portfolio",
    label: "Кейсы и профиль",
    short: "Профиль",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

const SIDEBAR_EXTRA: Array<{ href: string; label: string }> = [
  { href: "/cabinet/dashboard", label: "Метрики" },
  { href: "/cabinet/analytics", label: "Аналитика" },
  { href: "/cabinet/wallet", label: "Кошелёк" },
  { href: "/cabinet/checkin", label: "Чек-ин" },
  { href: "/cabinet/profile", label: "Настройки профиля" },
];

interface Props {
  variant: "sidebar" | "bottom";
}

/**
 * Lightweight chat-unread polling. 30-second cadence is the right balance —
 * fast enough for "I just got a message" feedback, slow enough that polling
 * doesn't show up in tab CPU profiles. Pauses when the user is on `/cabinet/chat`
 * since the page itself reloads messages and the badge is redundant there.
 */
function useChatUnread(): number {
  const pathname = usePathname() ?? "";
  const onChat = pathname === "/cabinet/chat" || pathname.startsWith("/cabinet/chat/");
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const res = await cabinetChat.unread();
        if (!cancelled) setCount(res.count);
      } catch {
        // Silent — never spam toasts from a background poller.
      }
    }

    void load();
    if (!onChat) {
      timer = setInterval(() => void load(), UNREAD_POLL_MS);
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [onChat]);

  // While on the chat page itself, mute the badge — assume the polling on
  // /cabinet/chat will mark messages read soon.
  return onChat ? 0 : count;
}

export function CabinetNav({ variant }: Props) {
  const pathname = usePathname() ?? "";
  const unread = useChatUnread();

  if (variant === "bottom") {
    return (
      <ul className="grid h-16 grid-cols-5 px-2">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const showBadge = item.href === "/cabinet/chat" && unread > 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
                }`}
              >
                <span className="relative">
                  {item.icon}
                  {showBadge ? <BadgeDot count={unread} /> : null}
                </span>
                <span>{item.short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <nav className="space-y-6 text-sm">
      <ul className="space-y-1">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const showBadge = item.href === "/cabinet/chat" && unread > 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 font-medium transition-colors ${
                  active
                    ? "bg-[var(--color-cta)] text-[var(--color-on-cta)]"
                    : "text-[var(--color-text)] hover:bg-[var(--color-surface,#f5f5f7)]"
                }`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {showBadge ? <BadgePill count={unread} active={active} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div>
        <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Дополнительно
        </h3>
        <ul className="space-y-1">
          {SIDEBAR_EXTRA.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-xl px-3 py-2 font-medium transition-colors ${
                    active
                      ? "bg-[var(--color-cta)] text-[var(--color-on-cta)]"
                      : "text-[var(--color-text)] hover:bg-[var(--color-surface,#f5f5f7)]"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

// ── Unread badges ──────────────────────────────────────────────────────────

/**
 * Tiny red dot with count that overlays the bottom-nav icon. Caps display at
 * 99+ so it doesn't blow out the column. Positioned absolutely so it doesn't
 * shift the icon centerline.
 */
function BadgeDot({ count }: { count: number }) {
  return (
    <span
      className="absolute -right-2 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm"
      aria-label={`${count} непрочитанных сообщений`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Inline pill rendered at the right of a sidebar nav item. Adapts colour
 * to the active row (white text on primary background) so it stays legible.
 */
function BadgePill({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
        active ? "bg-white text-[var(--color-primary)]" : "bg-red-500 text-white"
      }`}
      aria-label={`${count} непрочитанных сообщений`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
