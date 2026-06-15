"use client";
import { useState, type FormEvent } from "react";

interface Props {
  citySlug: string;
  serviceSlug: string;
  /** Used as `sourcePageUrl` in the lead row for analytics. */
  sourcePageUrl: string;
}

type Status = "idle" | "submitting" | "error";

interface SuccessEnvelope {
  ok: true;
  redirectTo: string;
}
interface ErrorEnvelope {
  ok: false;
  error: string;
  details?: unknown;
}
type Envelope = SuccessEnvelope | ErrorEnvelope;

/** User-friendly Russian error messages keyed by upstream/route error label. */
const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Проверьте телефон и согласие на обработку данных",
  invalid_json: "Не удалось обработать данные формы. Перезагрузите страницу и попробуйте ещё раз",
  city_not_found: "Город временно недоступен",
  service_not_found: "Услуга временно недоступна",
  attached_master_not_found: "Карточка мастера временно недоступна",
  upstream_unreachable: "Сервис временно недоступен, попробуйте позже",
  upstream_error: "Не удалось отправить заявку, попробуйте позже",
  unauthorized: "Сервис временно недоступен, попробуйте позже",
};

function friendlyError(label: string | undefined): string {
  if (!label) return "Не удалось отправить заявку, попробуйте позже";
  return ERROR_MESSAGES[label] ?? "Не удалось отправить заявку, попробуйте позже";
}

/**
 * Client-side lead form. Submits a JSON POST to the marketplace's own
 * `/api/leads` route handler (NOT directly to the api-server), so the
 * internal Bearer token never reaches the browser.
 *
 * The route handler responds with a stable JSON envelope:
 *   { ok: true,  redirectTo: "/zayavka/spasibo" }
 *   { ok: false, error: "<label>", details?: ... }
 * No HTTP redirect — the client controls navigation explicitly.
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

    let res: Response;
    try {
      res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Real network failure — DNS, offline, TLS, aborted. Anything that
      // never produced an HTTP response.
      setErrMessage("Сетевая ошибка. Проверьте интернет-соединение");
      setStatus("error");
      return;
    }

    // We have an HTTP response. Parse the envelope without touching .redirected
    // (the route handler now never redirects).
    const contentType = res.headers.get("content-type") ?? "";
    let parsed: Envelope | null = null;
    if (contentType.includes("application/json")) {
      try {
        parsed = (await res.json()) as Envelope;
      } catch {
        parsed = null;
      }
    } else {
      // Not JSON — keep the raw text but cap it so a giant HTML body never
      // ends up in the alert box.
      try {
        const txt = (await res.text()).trim().slice(0, 200);
        parsed = { ok: false, error: txt || "upstream_error" };
      } catch {
        parsed = { ok: false, error: "upstream_error" };
      }
    }

    if (!res.ok || !parsed || parsed.ok !== true) {
      const label =
        parsed && parsed.ok === false && typeof parsed.error === "string"
          ? parsed.error
          : undefined;
      setErrMessage(friendlyError(label));
      setStatus("error");
      return;
    }

    if (typeof parsed.redirectTo === "string" && parsed.redirectTo.startsWith("/")) {
      window.location.assign(parsed.redirectTo);
      return;
    }

    // Success but no redirectTo — shouldn't happen with our contract, but be
    // defensive so the user sees a meaningful state.
    setErrMessage("Заявка отправлена, но не пришёл адрес для перехода. Перезагрузите страницу");
    setStatus("error");
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
        <span className="text-xs text-[var(--color-muted)]">
          Телефон нужен, чтобы мастер или оператор связался с вами по заявке.
        </span>
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
