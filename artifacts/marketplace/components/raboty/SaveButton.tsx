"use client";

import { useState } from "react";

interface SaveButtonProps {
  slug: string;
  initialSaved: boolean;
  initialCount: number;
  /** Optional compact mode — small heart without count, used inside CaseCard. */
  variant?: "default" | "compact";
}

/**
 * Save / unsave toggle (plan §22 Iteration 4).
 *
 * Optimistic UX: clicking flips the heart immediately. Network call to
 * `/api/raboty/[slug]/save` happens in background; on error we roll back.
 *
 * Anon-id management is server-side — the marketplace route handler reads
 * (or sets) the `kiro_anon_id` HTTP-only cookie and forwards to api-server.
 * From the client we just see `{ saved, count }`.
 *
 * Accessibility: aria-pressed reflects current state, aria-label switches
 * with state, button is keyboard-focusable.
 */
export function SaveButton({
  slug,
  initialSaved,
  initialCount,
  variant = "default",
}: SaveButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    // When SaveButton sits inside a Link (CaseCard), prevent the click from
    // bubbling up and triggering navigation.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    // Optimistic update.
    const wasSaved = saved;
    const wasCount = count;
    setSaved(!wasSaved);
    setCount(Math.max(0, wasCount + (wasSaved ? -1 : 1)));
    setBusy(true);

    try {
      const res = await fetch(`/api/raboty/${encodeURIComponent(slug)}/save`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        // Body is empty — anonId comes from cookie server-side.
        body: "{}",
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = (await res.json()) as { ok: boolean; saved?: boolean; count?: number };
      if (!data.ok || typeof data.saved !== "boolean" || typeof data.count !== "number") {
        throw new Error("bad_response");
      }
      // Sync with server truth (handles race / clock skew).
      setSaved(data.saved);
      setCount(data.count);
    } catch {
      // Roll back optimistic update.
      setSaved(wasSaved);
      setCount(wasCount);
      // No toast in v1 — failure on a background button shouldn't disrupt
      // the user's flow. Keep silent; they can click again.
    } finally {
      setBusy(false);
    }
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? "Убрать из избранного" : "Сохранить в избранное"}
        className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)]/95 shadow-cozy transition hover:bg-[var(--color-surface)] disabled:opacity-60 ${
          saved ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"
        }`}
      >
        <Heart filled={saved} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Убрать из избранного" : "Сохранить в избранное"}
      className={`inline-flex h-12 flex-shrink-0 items-center justify-center gap-1.5 rounded-full border bg-[var(--color-surface)] px-4 text-sm font-semibold transition disabled:opacity-60 ${
        saved
          ? "border-[var(--color-primary)] text-[var(--color-primary)]"
          : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-text)]"
      }`}
    >
      <Heart filled={saved} />
      {count > 0 ? <span>{count}</span> : null}
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
