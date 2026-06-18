"use client";

import { useState } from "react";

interface ShareButtonProps {
  url: string;
  title: string;
}

/**
 * Native Share API button with copy-to-clipboard fallback (plan §22, Req 9.1).
 *
 * - Mobile / supported browsers: opens the native share sheet.
 * - Desktop / unsupported: copies the URL and shows a "Скопировано!" tick.
 *
 * No backend, no analytics dependency. AbortError is silently swallowed
 * (user closed the native dialog — not an error).
 */
export function ShareButton({ url, title }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function onClick() {
    // 1. Native share if available (mobile + some desktops).
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title, text: title });
        return;
      } catch (e) {
        // User aborted — nothing to show.
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Other errors — fall through to clipboard.
      }
    }
    // 2. Clipboard fallback.
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Browser denied clipboard access. Last-ditch: prompt with the URL.
      // Some browsers in private mode don't have clipboard permissions.
      try {
        // eslint-disable-next-line no-alert
        window.prompt("Скопируйте ссылку:", url);
      } catch {
        // Give up silently.
      }
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? "Ссылка скопирована" : "Поделиться"}
      className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition hover:border-[var(--color-text)]"
    >
      {copied ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <path d="m16 6-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
      )}
    </button>
  );
}
