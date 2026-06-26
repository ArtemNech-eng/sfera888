"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

interface Props {
  citySlug: string;
  serviceSlug: string;
  /** Used as `sourcePageUrl` in the lead row for analytics. */
  sourcePageUrl: string;
  /**
   * Optional — when the form is rendered on a master's profile page,
   * the lead is attached to that master via FK. The id is sent to the
   * route handler in body.attachedMasterId; the api-server validates that
   * the master is published (not just any positive integer).
   */
  attachedMasterId?: number;
  /**
   * Optional human-readable label shown above the form so the user knows
   * the lead is going to a specific master ("Заявка для мастера: <name>").
   * Only rendered when `attachedMasterId` is also set.
   */
  attachedMasterTitle?: string;
  /**
   * Optional. Prepended to the user's comment before submission. Use it
   * when the form lives on a page that needs structured context inside
   * the lead's comment field (e.g. "Хочу AI-дизайн: ванная, скандинавский").
   * If the user wrote their own comment, the prefix and comment are joined
   * with a period.
   */
  commentPrefix?: string;
  /**
   * Optional. Override the source-page-type label sent upstream. Defaults
   * to "master" when `attachedMasterId` is set, otherwise "service-city".
   * Allowed values are constrained on the route handler's whitelist.
   */
  sourcePageType?: "service-city" | "master" | "design_waitlist";
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
  too_fast: "Проверьте форму и попробуйте ещё раз",
  rate_limited: "Слишком много заявок. Попробуйте позже",
};

function friendlyError(label: string | undefined): string {
  if (!label) return "Не удалось отправить заявку, попробуйте позже";
  return ERROR_MESSAGES[label] ?? "Не удалось отправить заявку, попробуйте позже";
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Yandex.Metrika reachGoal helper                                          */
/* ──────────────────────────────────────────────────────────────────────── */

type YmFn = (
  counterId: number,
  action: string,
  ...args: unknown[]
) => void;

declare global {
  interface Window {
    ym?: YmFn;
  }
}

/**
 * Send a Metrika goal if the counter is configured and loaded. No-op
 * otherwise (no env, no script tag, ad blocker). Never carries PII —
 * callers pass only safe identifiers (serviceSlug, citySlug, error label).
 */
function reachGoal(goal: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const id = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;
  if (!id) return;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return;
  const ym = window.ym;
  if (typeof ym !== "function") return;
  try {
    if (params) ym(numId, "reachGoal", goal, params);
    else ym(numId, "reachGoal", goal);
  } catch {
    // Metrika failures must never break the form.
  }
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
export function LeadForm({
  citySlug,
  serviceSlug,
  sourcePageUrl,
  attachedMasterId,
  attachedMasterTitle,
  commentPrefix,
  sourcePageType,
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errMessage, setErrMessage] = useState<string | null>(null);
  // Captured on mount so the route handler can reject submissions filled in
  // under MIN_FILL_MS — typical bot behaviour. `null` until effect runs (SSR).
  const formStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    formStartedAtRef.current = Date.now();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrMessage(null);

    const fd = new FormData(event.currentTarget);
    const userComment = String(fd.get("comment") ?? "").trim();
    const finalComment = commentPrefix && commentPrefix.length > 0
      ? userComment.length > 0
        ? `${commentPrefix}. ${userComment}`
        : commentPrefix
      : userComment;
    const body = {
      name: String(fd.get("name") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim(),
      comment: finalComment,
      consent: fd.get("consent") === "on",
      // Honeypot — must stay empty. Real users never see the field.
      website: String(fd.get("website") ?? "").trim(),
      // May be null if the user submitted before the mount-effect ran (very
      // unlikely in practice). Server treats absent value as "no info" and
      // doesn't reject for it.
      formStartedAt: formStartedAtRef.current,
      citySlug,
      serviceSlug,
      sourcePageUrl,
      // Pre-set on master profile pages; absent everywhere else.
      attachedMasterId: attachedMasterId ?? null,
      // Optional override for pages that aren't service-city or master
      // (currently used by /dizajn/new for "design_waitlist" leads).
      sourcePageType: sourcePageType ?? null,
    };

    let res: Response;
    try {
      // Track only AFTER the body is built (so we know phoneless / honeypot
      // rejections still count as attempts), but BEFORE the network call.
      // Only safe metadata leaves the page — never the user's phone, name,
      // comment, or anything PII-shaped.
      reachGoal("lead_form_submit_attempt", { serviceSlug, citySlug });
      res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Real network failure — DNS, offline, TLS, aborted. Anything that
      // never produced an HTTP response.
      reachGoal("lead_form_submit_error", {
        serviceSlug,
        citySlug,
        error: "network_error",
      });
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
      reachGoal("lead_form_submit_error", {
        serviceSlug,
        citySlug,
        error: label ?? `http_${res.status}`,
      });
      setErrMessage(friendlyError(label));
      setStatus("error");
      return;
    }

    if (typeof parsed.redirectTo === "string" && parsed.redirectTo.startsWith("/")) {
      reachGoal("lead_form_submit_success", { serviceSlug, citySlug });
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
      {attachedMasterId != null && attachedMasterTitle ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)]">
          Заявка для мастера: <span className="font-medium">{attachedMasterTitle}</span>
        </div>
      ) : null}

      {/* Honeypot — visually hidden but not display:none (some bots skip those).
          Real users will never tab into or see this field. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label>
          Website (do not fill)
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>

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
          Отправляя заявку, я соглашаюсь с{" "}
          <Link
            href="/policy/privacy"
            className="underline hover:text-[var(--color-primary)]"
          >
            Политикой конфиденциальности
          </Link>{" "}
          и принимаю{" "}
          <Link
            href="/policy/terms"
            className="underline hover:text-[var(--color-primary)]"
          >
            Пользовательское соглашение
          </Link>
          .
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
        className="inline-flex items-center justify-center rounded-xl bg-[var(--color-cta)] px-5 py-3 text-base font-medium text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)] disabled:opacity-60"
      >
        {submitting ? "Отправляем…" : "Получить мастера"}
      </button>
    </form>
  );
}
