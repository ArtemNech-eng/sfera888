"use client";
import { useState, type FormEvent } from "react";

interface Props {
  citySlug: string;
  serviceSlug: string;
  /** Used as `sourcePageUrl` in the lead row for analytics. */
  sourcePageUrl: string;
}

type Status = "idle" | "submitting" | "error";

/**
 * Client-side lead form. Submits a JSON POST to the marketplace's own
 * `/api/leads` route handler (NOT directly to the api-server), so the
 * internal Bearer token never reaches the browser.
 */
export function LeadForm({ citySlug, serviceSlug, sourcePageUrl }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errMessage, setErrMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrMessage(null);

    const fd = new FormData(event.currentTarget);
    const body = {
      name: String(fd.get("name") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      comment: String(fd.get("comment") ?? "").trim(),
      consent: fd.get("consent") === "on",
      citySlug,
      serviceSlug,
      sourcePageUrl,
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setErrMessage(text || "Не получилось отправить заявку. Попробуйте ещё раз.");
        setStatus("error");
        return;
      }
      // Fallback if the route returns JSON instead of a redirect.
      window.location.href = "/zayavka/spasibo";
    } catch {
      setErrMessage("Сетевая ошибка. Проверьте интернет-соединение.");
      setStatus("error");
    }
  }

  const submitting = status === "submitting";

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        <span className="text-[var(--color-text)]">Как к вам обращаться</span>
        <input
          type="text"
          name="name"
          maxLength={100}
          autoComplete="given-name"
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-base outline-none focus:border-[var(--color-primary)]"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-[var(--color-text)]">Телефон <span className="text-red-600">*</span></span>
        <input
          type="tel"
          name="phone"
          required
          minLength={5}
          maxLength={30}
          autoComplete="tel"
          placeholder="+7 999 123-45-67"
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-base outline-none focus:border-[var(--color-primary)]"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-[var(--color-text)]">Что нужно сделать</span>
        <textarea
          name="comment"
          maxLength={2000}
          rows={3}
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-base outline-none focus:border-[var(--color-primary)]"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-[var(--color-muted)]">
        <input type="checkbox" name="consent" required className="mt-1" />
        <span>
          Я согласен на обработку персональных данных и условия обработки заявки.
        </span>
      </label>

      {errMessage ? (
        <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {errMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-3 text-base font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
      >
        {submitting ? "Отправляем…" : "Получить мастера"}
      </button>
    </form>
  );
}
