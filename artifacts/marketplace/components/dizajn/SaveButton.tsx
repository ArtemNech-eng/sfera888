"use client";

import { useState } from "react";

/**
 * Save toggle button для AI-design на странице `/dizajn/[slug]`.
 *
 * Optimistic update: на клик мгновенно меняем local state, отправляем
 * POST /api/dizajn/[slug]/save, синхронизируем по ответу. На ошибке —
 * откатываем visual state.
 *
 * Cookie management полностью на стороне Next route handler (HTTP-only
 * `kiro_anon_id` cookie выставляется/читается там). С client-side
 * никаких cookie операций.
 */

interface Props {
  slug: string;
  initialSaved: boolean;
  initialCount: number;
  /** Variant 'pill' (на странице дизайна) или 'icon' (компактный для feed/aggregate). */
  variant?: "pill" | "icon";
}

export function SaveButton({ slug, initialSaved, initialCount, variant = "pill" }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [count, setCount] = useState(initialCount);
  const [submitting, setSubmitting] = useState(false);

  async function toggle() {
    if (submitting) return;
    setSubmitting(true);

    // Optimistic update.
    const nextSaved = !saved;
    setSaved(nextSaved);
    setCount((c) => Math.max(0, nextSaved ? c + 1 : c - 1));

    try {
      const res = await fetch(`/api/dizajn/${slug}/save`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.ok && typeof data.saved === "boolean") {
        setSaved(data.saved);
        setCount(typeof data.count === "number" ? data.count : count);
      } else {
        // Rollback.
        setSaved(saved);
        setCount(count);
      }
    } catch {
      setSaved(saved);
      setCount(count);
    } finally {
      setSubmitting(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={submitting}
        aria-label={saved ? "Убрать из избранного" : "Сохранить в избранное"}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-cozy transition ${
          saved
            ? "bg-[var(--color-cta)] text-[var(--color-on-cta)]"
            : "bg-[var(--color-surface)]/95 text-[var(--color-text)] hover:bg-[var(--color-surface)]"
        }`}
      >
        <Heart filled={saved} />
        {count > 0 ? <span>{formatCount(count)}</span> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={submitting}
      className={`inline-flex h-12 items-center gap-2 rounded-full border px-6 text-sm font-semibold transition ${
        saved
          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          : "border-[var(--color-text)] bg-transparent text-[var(--color-text)] hover:bg-[var(--color-text)] hover:text-white"
      }`}
    >
      <Heart filled={saved} />
      {saved ? "Сохранено" : "Сохранить"}
      {count > 0 ? <span className="text-[var(--color-faint)]">· {formatCount(count)}</span> : null}
    </button>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
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

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}K`;
  }
  return new Intl.NumberFormat("ru-RU").format(n);
}
