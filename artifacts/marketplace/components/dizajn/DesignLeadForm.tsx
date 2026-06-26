"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Lead-form «Хочу такой же» для AI-design страницы. Pre-fill — дизайн
 * передаёт slug, всё остальное (city, room, style) сервер берёт из БД при
 * INSERT. Frontend собирает только имя + телефон + опц. комментарий.
 *
 * После успешного submit — redirect на /zayavka/spasibo (как у других
 * лид-форм проекта).
 */

interface Props {
  slug: string;
}

export function DesignLeadForm({ slug }: Props) {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (clientName.trim().length < 2) {
      setError("Укажите имя");
      return;
    }
    const phoneDigits = clientPhone.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      setError("Укажите телефон");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/dizajn/${slug}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          comment: comment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError("Не удалось отправить заявку. Попробуйте ещё раз.");
        setSubmitting(false);
        return;
      }
      router.push("/zayavka/spasibo");
    } catch {
      setError("Сеть недоступна. Попробуйте через минуту.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="design-lead-name" className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
          Имя
        </label>
        <input
          id="design-lead-name"
          type="text"
          autoComplete="given-name"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          disabled={submitting}
          required
          minLength={2}
          maxLength={80}
          placeholder="Артём"
          className="mt-2 h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-base text-[var(--color-text)] placeholder-[var(--color-faint)] focus:border-[var(--color-text)] focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="design-lead-phone" className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
          Телефон
        </label>
        <input
          id="design-lead-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={clientPhone}
          onChange={(e) => setClientPhone(e.target.value)}
          disabled={submitting}
          required
          placeholder="+7 999 123-45-67"
          className="mt-2 h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-base text-[var(--color-text)] placeholder-[var(--color-faint)] focus:border-[var(--color-text)] focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="design-lead-comment" className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
          Комментарий <span className="font-normal lowercase text-[var(--color-faint)]">— по желанию</span>
        </label>
        <textarea
          id="design-lead-comment"
          rows={3}
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={submitting}
          placeholder="Уточните детали — желаемый бюджет, сроки, особенности"
          className="mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-base text-[var(--color-text)] placeholder-[var(--color-faint)] focus:border-[var(--color-text)] focus:outline-none"
        />
      </div>

      {error ? (
        <p className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-cta)] px-7 text-base font-semibold text-[var(--color-on-cta)] shadow-cozy-md transition hover:bg-[var(--color-cta-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Отправляем…" : "Хочу такой же"}
        {!submitting ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        ) : null}
      </button>

      <p className="text-xs text-[var(--color-faint)]">
        Нажимая «Хочу такой же», вы соглашаетесь с{" "}
        <a
          href="/policy/privacy"
          className="underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text)]"
        >
          политикой конфиденциальности
        </a>
        . Контакт получит мастер, который сможет повторить дизайн.
      </p>
    </form>
  );
}
