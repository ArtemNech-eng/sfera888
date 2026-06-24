"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

/**
 * Клиентская форма запуска AI-дизайн-проекта.
 *
 * Соглашения:
 *   • На MVP единственный активный `roomType` — `bedroom`. Остальные
 *     7 значений отрисованы с пометкой «скоро» и не выбираются —
 *     это закрывает Requirement 1.3 на стороне UX до того, как api-server
 *     вернёт `mvp_room_locked`.
 *   • Под полями ширины/длины показываем подсказку «обычно 12–18 м²»
 *     (Requirement 1.7) — без автоподстановки в поле, только текстом.
 *   • Cloudflare Turnstile рендерится неявно по классу `cf-turnstile`
 *     с `data-action="ai_design_submit"`. Виджет автоматически кладёт
 *     токен в hidden input `cf-turnstile-response` внутри текущей
 *     формы — мы вытаскиваем его из FormData при submit.
 *   • POST `/api/marketplace/dizajn/generate` идёт JSON-ом. Бэкенд
 *     ожидает `cf-turnstile-response` среди полей тела — это
 *     согласовано с задачей 16.2 (capt verifies before any other
 *     validation, Requirement 3.2).
 *   • На 202 редирект на `/dizajn/{slug}`; на 400/429 показываем
 *     человеко-читаемое сообщение и/или per-field violations.
 */

interface Props {
  turnstileSiteKey: string;
}

const ROOM_TYPES: Array<{ value: string; label: string; enabled: boolean }> = [
  { value: "bedroom", label: "Спальня", enabled: true },
  { value: "kitchen", label: "Кухня", enabled: false },
  { value: "bathroom", label: "Ванная", enabled: false },
  { value: "living_room", label: "Гостиная", enabled: false },
  { value: "hallway", label: "Прихожая", enabled: false },
  { value: "nursery", label: "Детская", enabled: false },
  { value: "apartment", label: "Квартира", enabled: false },
];

const STYLES: Array<{ value: string; label: string }> = [
  { value: "modern", label: "Современный" },
  { value: "scandinavian", label: "Скандинавский" },
  { value: "loft", label: "Лофт" },
  { value: "minimalism", label: "Минимализм" },
  { value: "neoclassic", label: "Неоклассика" },
  { value: "japandi", label: "Японди" },
  { value: "classic", label: "Классика" },
];

const FEATURES: Array<{ value: string; label: string }> = [
  { value: "work_zone", label: "Рабочая зона" },
  { value: "accent_wall", label: "Акцентная стена" },
  { value: "extra_storage", label: "Дополнительное хранение" },
  { value: "soft_lighting", label: "Мягкое освещение" },
  { value: "reading_nook", label: "Уголок для чтения" },
];

/** Подсказки типичных размеров по типу помещения (Requirement 1.7). */
const ROOM_SIZE_HINTS: Record<string, string> = {
  bedroom: "обычно 12–18 м²",
  kitchen: "обычно 8–14 м²",
  bathroom: "обычно 4–8 м²",
  living_room: "обычно 16–24 м²",
  hallway: "обычно 3–6 м²",
  nursery: "обычно 10–15 м²",
  apartment: "обычно 30–60 м²",
};

interface ValidationViolation {
  field: string;
  code?: string;
  message?: string;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
  violations?: ValidationViolation[];
  retryAfterHours?: number;
  // api-server может класть код ошибки в разные поля — поддерживаем оба.
  code?: string;
  detail?: string;
}

export function AiDesignForm({ turnstileSiteKey }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [roomType, setRoomType] = useState<string>("bedroom");
  const [style, setStyle] = useState<string>("modern");
  const [widthCm, setWidthCm] = useState<string>("");
  const [lengthCm, setLengthCm] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("270");
  const [budget, setBudget] = useState<string>("");
  const [features, setFeatures] = useState<Set<string>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Подстраховка от двойного рендера Turnstile-виджета в dev (StrictMode).
  // Виджет сам по себе идемпотентен на уровне DOM-attr `data-sitekey`, но
  // мы дополнительно даём ему уникальный id, чтобы избежать предупреждений.
  const widgetIdRef = useRef<string>(`turnstile-${Math.random().toString(36).slice(2, 9)}`);

  // Сбрасываем per-field ошибки, когда пользователь правит соответствующее поле.
  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function toggleFeature(value: string) {
    setFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  // После неуспешной отправки полезно сбросить уже использованный
  // Turnstile-токен (он одноразовый), чтобы пользователь мог сабмитить
  // повторно после исправления полей.
  useEffect(() => {
    if (!topError && Object.keys(fieldErrors).length === 0) return;
    const w = (window as unknown as { turnstile?: { reset?: () => void } }).turnstile;
    try {
      w?.reset?.();
    } catch {
      // ignore — повтор инициализации Turnstile не должен ломать UI
    }
  }, [topError, fieldErrors]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setTopError(null);
    setFieldErrors({});

    // Базовая клиентская валидация — на сервере всё равно будут такие же
    // проверки (Requirement 1.10), но локально ловим очевидное и не
    // сжигаем Turnstile-токен на заведомо плохом запросе.
    const localErrors = collectClientErrors({
      roomType,
      style,
      widthCm,
      lengthCm,
      heightCm,
      budget,
    });
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    const formEl = formRef.current ?? (e.currentTarget as HTMLFormElement);
    const fd = new FormData(formEl);
    const turnstileToken = String(fd.get("cf-turnstile-response") ?? "").trim();

    if (!turnstileToken) {
      setTopError("Не удалось пройти проверку Cloudflare. Подождите пару секунд и попробуйте ещё раз.");
      return;
    }

    const body = {
      roomType,
      style,
      widthCm: Number(widthCm),
      lengthCm: Number(lengthCm),
      heightCm: Number(heightCm),
      budget: Number(budget),
      features: Array.from(features),
      "cf-turnstile-response": turnstileToken,
    };

    setSubmitting(true);

    let res: Response;
    try {
      res = await fetch("/api/dizajn/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setTopError("Сеть недоступна. Проверьте подключение и попробуйте ещё раз.");
      setSubmitting(false);
      return;
    }

    let parsed: (ApiErrorBody & { slug?: string }) | null = null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try {
        parsed = (await res.json()) as ApiErrorBody & { slug?: string };
      } catch {
        parsed = null;
      }
    }

    if (res.status === 202 && parsed?.slug) {
      // Дальше — polling на странице /dizajn/{slug}; см. задачу 22.1.
      router.push(`/dizajn/${parsed.slug}`);
      return;
    }

    // Любой не-202 трактуем как ошибку. Для 400/429 показываем
    // человеко-читаемое сообщение по коду; для прочего — generic fallback.
    const errorCode = parsed?.error ?? parsed?.code ?? `http_${res.status}`;

    if (res.status === 400 && errorCode === "validation_error" && Array.isArray(parsed?.violations)) {
      const perField: Record<string, string> = {};
      for (const v of parsed.violations) {
        if (v && typeof v.field === "string" && v.field.length > 0) {
          perField[v.field] = v.message ?? friendlyFieldError(v.field);
        }
      }
      setFieldErrors(perField);
      setTopError("Проверьте поля формы и попробуйте ещё раз.");
      setSubmitting(false);
      return;
    }

    setTopError(friendlyApiError(errorCode, parsed));
    setSubmitting(false);
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        async
        defer
      />

      <form ref={formRef} onSubmit={onSubmit} className="grid gap-6">
        {/* ── Тип помещения ──────────────────────────────── */}
        <Field
          label="Тип помещения"
          hint="на MVP активна только спальня — остальные типы скоро"
          error={fieldErrors.roomType}
        >
          <div className="flex flex-wrap gap-2">
            {ROOM_TYPES.map((opt) => {
              const active = roomType === opt.value;
              const disabled = !opt.enabled;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    setRoomType(opt.value);
                    clearFieldError("roomType");
                  }}
                  className={[
                    "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
                    disabled
                      ? "cursor-not-allowed border-[var(--color-border)] bg-[var(--color-cream-deep)] text-[var(--color-faint)]"
                      : active
                        ? "border-[var(--color-text)] bg-[var(--color-text)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-text)]",
                  ].join(" ")}
                >
                  {opt.label}
                  {disabled ? (
                    <span className="rounded-full bg-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                      скоро
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </Field>

        {/* ── Стиль ──────────────────────────────────────── */}
        <Field label="Стиль" error={fieldErrors.style}>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((opt) => {
              const active = style === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setStyle(opt.value);
                    clearFieldError("style");
                  }}
                  className={[
                    "inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition",
                    active
                      ? "border-[var(--color-text)] bg-[var(--color-text)] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-text)]",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* ── Размеры ────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Ширина, см"
            hint={ROOM_SIZE_HINTS[roomType]}
            error={fieldErrors.widthCm}
          >
            <NumberInput
              value={widthCm}
              onChange={(v) => {
                setWidthCm(v);
                clearFieldError("widthCm");
              }}
              min={200}
              max={800}
              step={10}
              placeholder="350"
              disabled={submitting}
            />
          </Field>
          <Field
            label="Длина, см"
            hint={ROOM_SIZE_HINTS[roomType]}
            error={fieldErrors.lengthCm}
          >
            <NumberInput
              value={lengthCm}
              onChange={(v) => {
                setLengthCm(v);
                clearFieldError("lengthCm");
              }}
              min={200}
              max={800}
              step={10}
              placeholder="400"
              disabled={submitting}
            />
          </Field>
          <Field label="Высота, см" error={fieldErrors.heightCm}>
            <NumberInput
              value={heightCm}
              onChange={(v) => {
                setHeightCm(v);
                clearFieldError("heightCm");
              }}
              min={220}
              max={350}
              step={5}
              placeholder="270"
              disabled={submitting}
            />
          </Field>
        </div>

        {/* ── Бюджет ─────────────────────────────────────── */}
        <Field
          label="Бюджет, ₽"
          hint="ориентир на материалы, мебель и работы"
          error={fieldErrors.budget}
        >
          <NumberInput
            value={budget}
            onChange={(v) => {
              setBudget(v);
              clearFieldError("budget");
            }}
            min={50_000}
            max={5_000_000}
            step={10_000}
            placeholder="350000"
            disabled={submitting}
          />
        </Field>

        {/* ── Дополнительно ──────────────────────────────── */}
        <Field label="Дополнительно" hint="опционально">
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURES.map((opt) => {
              const checked = features.has(opt.value);
              return (
                <label
                  key={opt.value}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm transition",
                    checked
                      ? "border-[var(--color-text)] bg-[var(--color-cream-deep)] text-[var(--color-text)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-text)]",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFeature(opt.value)}
                    disabled={submitting}
                    className="h-4 w-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-[var(--color-primary-ring)]"
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        </Field>

        {/* ── Cloudflare Turnstile ───────────────────────── */}
        <div>
          <span className="block text-sm font-semibold text-[var(--color-text)]">
            Подтверждение
          </span>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Cloudflare убеждается, что вы человек — не нажимайте никуда,
            просто подождите пару секунд.
          </p>
          <div
            id={widgetIdRef.current}
            className="cf-turnstile mt-3"
            data-sitekey={turnstileSiteKey}
            data-action="ai_design_submit"
            data-theme="light"
          />
        </div>

        {/* ── Top-level error ────────────────────────────── */}
        {topError ? (
          <p
            role="alert"
            className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]"
          >
            {topError}
          </p>
        ) : null}

        {/* ── Submit ─────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-7 text-base font-semibold text-white shadow-cozy-md transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Запускаем генерацию…" : "Создать дизайн-проект"}
          </button>
          <p className="text-xs text-[var(--color-faint)] sm:max-w-sm sm:text-right">
            Отправляя форму, вы соглашаетесь с{" "}
            <a
              href="/policy/privacy"
              className="underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text)]"
            >
              политикой конфиденциальности
            </a>
            .
          </p>
        </div>
      </form>
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        {label}
        {hint ? (
          <span className="text-xs font-normal text-[var(--color-faint)]">— {hint}</span>
        ) : null}
      </span>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-1.5 text-xs text-[var(--color-danger)]">{error}</p>
      ) : null}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm text-[var(--color-text)] placeholder-[var(--color-faint)] focus:border-[var(--color-text)] focus:outline-none"
    />
  );
}

function collectClientErrors(input: {
  roomType: string;
  style: string;
  widthCm: string;
  lengthCm: string;
  heightCm: string;
  budget: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  // MVP-гейт продублирован на клиенте — кнопки уже не дают выбрать
  // не-bedroom, но валидируем и здесь, чтобы submit с замоканной DOM-формы
  // не уходил впустую.
  if (input.roomType !== "bedroom") {
    errors.roomType = "На MVP доступна только спальня — остальные типы скоро.";
  }

  const validStyles = STYLES.map((s) => s.value);
  if (!validStyles.includes(input.style)) {
    errors.style = "Выберите стиль.";
  }

  const w = Number(input.widthCm);
  if (!Number.isFinite(w) || w < 200 || w > 800) {
    errors.widthCm = "Ширина от 200 до 800 см.";
  }
  const l = Number(input.lengthCm);
  if (!Number.isFinite(l) || l < 200 || l > 800) {
    errors.lengthCm = "Длина от 200 до 800 см.";
  }
  const h = Number(input.heightCm);
  if (!Number.isFinite(h) || h < 220 || h > 350) {
    errors.heightCm = "Высота от 220 до 350 см.";
  }
  const b = Number(input.budget);
  if (!Number.isFinite(b) || b < 50_000 || b > 5_000_000) {
    errors.budget = "Бюджет от 50 000 до 5 000 000 ₽.";
  }

  return errors;
}

function friendlyFieldError(field: string): string {
  switch (field) {
    case "roomType":
      return "Выберите тип помещения.";
    case "style":
      return "Выберите стиль.";
    case "widthCm":
      return "Ширина от 200 до 800 см.";
    case "lengthCm":
      return "Длина от 200 до 800 см.";
    case "heightCm":
      return "Высота от 220 до 350 см.";
    case "budget":
      return "Бюджет от 50 000 до 5 000 000 ₽.";
    case "features":
      return "Проверьте выбранные опции.";
    default:
      return "Проверьте значение.";
  }
}

function friendlyApiError(code: string, parsed: ApiErrorBody | null): string {
  switch (code) {
    case "invalid_captcha":
      return "Не удалось пройти проверку Cloudflare. Обновите страницу и попробуйте снова.";
    case "rate_limited": {
      const hours = parsed?.retryAfterHours;
      if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
        return `Достигнут дневной лимит, попробуйте через ${hours} ${pluralizeHours(hours)}.`;
      }
      return "Достигнут дневной лимит, попробуйте позже.";
    }
    case "room_too_small":
      return parsed?.message ?? "Комната слишком мала для выбранного типа помещения.";
    case "mvp_room_locked":
      return "Тип помещения пока недоступен — на MVP активна только спальня.";
    case "validation_error":
      return parsed?.message ?? "Проверьте поля формы и попробуйте ещё раз.";
    case "upstream_unreachable":
      return "Сервер недоступен. Попробуйте через минуту.";
    default:
      return parsed?.message ?? "Не удалось запустить генерацию. Попробуйте ещё раз.";
  }
}

function pluralizeHours(n: number): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return "час";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "часа";
  return "часов";
}
