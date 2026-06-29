"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import {
  ROOM_TYPES,
  STYLES,
  PALETTES,
  PRICE_SEGMENTS,
  buildDesignPrompt,
  describeConfig,
  type RoomTypeId,
  type StyleId,
  type PaletteId,
  type PriceSegmentId,
} from "../../lib/designPrompt";
import { useGenerationQuota } from "../../lib/useGenerationQuota";
import { PaywallModal } from "./PaywallModal";

/**
 * «Хочу также» — визуальный конфигуратор дизайна интерьера (Модуль 1).
 *
 * Премиальная тёмная glassmorphism-стилистика (локальная для инструмента,
 * не зависит от тёплой светлой темы маркетплейса — все цвета инлайн, без
 * --color-* токенов).
 *
 * Пользователь НЕ пишет промпт руками — только выбирает карточки:
 * тип комнаты → стиль → палитра → ценовой сегмент → площадь. Английский
 * промпт собирается `buildDesignPrompt` (для превью; финальный промпт
 * строит worker на api-server).
 *
 * Submission идёт на существующий, уже рабочий пайплайн
 * `POST /api/dizajn/generate` (captcha + rate-limit + worker + polling +
 * страница результата `/dizajn/{slug}` с коллажом 2×2 одной комнаты).
 * Контракт бэкенда (см. dizajnFormSchema.ts):
 *   roomType, style, widthCm, lengthCm, heightCm, budget, features[],
 *   cf-turnstile-response. Поэтому:
 *     • площадь (м²) → near-square width/length в см (clamp 200..800);
 *     • ценовой сегмент → budget (₽);
 *     • палитра → feature-хинт (forward-compatible; worker подхватит
 *       палитру в промпт после расширения, сейчас не ломает запрос).
 *
 * Система ограничений (Модуль 3): перед запросом проверяем клиентскую квоту
 * (useGenerationQuota). Лимит исчерпан → PaywallModal вместо генерации.
 * Серверный rate-limit на api-server остаётся настоящей границей abuse.
 */

interface DesignConfiguratorProps {
  /** Cloudflare Turnstile site key (требуется бэкендом для anti-abuse). */
  turnstileSiteKey: string;
}

// Площадь, м² → бюджетный ориентир по сегменту (₽ за весь проект).
const SEGMENT_BUDGET: Record<PriceSegmentId, number> = {
  econom: 200_000,
  optima: 500_000,
  premium: 1_500_000,
};

const AREA_MIN = 6;
const AREA_MAX = 60;
const AREA_DEFAULT = 16;

/** Площадь (м²) → near-square размеры комнаты в см, clamp 200..800. */
function areaToDimsCm(areaSqm: number): { widthCm: number; lengthCm: number } {
  const safeArea = Math.min(AREA_MAX, Math.max(AREA_MIN, areaSqm));
  const sideM = Math.sqrt(safeArea);
  // Лёгкий прямоугольник: ширина чуть меньше длины (1 : 1.15).
  const widthM = sideM / Math.sqrt(1.15);
  const lengthM = sideM * Math.sqrt(1.15);
  const clamp = (m: number) => Math.min(800, Math.max(200, Math.round((m * 100) / 10) * 10));
  return { widthCm: clamp(widthM), lengthCm: clamp(lengthM) };
}

interface ApiBody {
  ok?: boolean;
  error?: string;
  design?: { slug?: string };
  violations?: Array<{ path?: string; message?: string }>;
  retryAfterSeconds?: number;
  message?: string;
}

export function DesignConfigurator({ turnstileSiteKey }: DesignConfiguratorProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const quota = useGenerationQuota();

  const [roomType, setRoomType] = useState<RoomTypeId>("bedroom");
  const [style, setStyle] = useState<StyleId>("modern");
  const [palette, setPalette] = useState<PaletteId>("warm_neutral");
  const [segment, setSegment] = useState<PriceSegmentId>("optima");
  const [area, setArea] = useState<number>(AREA_DEFAULT);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Превью промпта + человекочитаемое резюме выбора (реактивно).
  const summary = useMemo(
    () => describeConfig({ roomType, style, palette, priceSegment: segment, areaSqm: area }),
    [roomType, style, palette, segment, area],
  );
  const promptPreview = useMemo(
    () =>
      buildDesignPrompt({ roomType, style, palette, priceSegment: segment, areaSqm: area }).prompt,
    [roomType, style, palette, segment, area],
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // ── Гейт квоты (Модуль 3) ───────────────────────────────────────────
    if (quota.ready && !quota.canGenerate) {
      setPaywallOpen(true);
      return;
    }

    // Turnstile-токен кладётся виджетом в hidden input внутри формы.
    const formEl = formRef.current ?? (e.currentTarget as HTMLFormElement);
    const fd = new FormData(formEl);
    const turnstileToken = String(fd.get("cf-turnstile-response") ?? "").trim();
    if (!turnstileToken) {
      setError("Проверка Cloudflare ещё не завершилась — подождите пару секунд.");
      return;
    }

    const { widthCm, lengthCm } = areaToDimsCm(area);
    const body = {
      roomType,
      style,
      widthCm,
      lengthCm,
      heightCm: 270,
      budget: SEGMENT_BUDGET[segment],
      // Палитра как forward-compatible feature-хинт (схема принимает строки).
      features: [`palette:${palette}`, `segment:${segment}`],
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
      setError("Сеть недоступна. Проверьте подключение и попробуйте ещё раз.");
      setSubmitting(false);
      return;
    }

    let parsed: ApiBody | null = null;
    try {
      parsed = (await res.json()) as ApiBody;
    } catch {
      parsed = null;
    }

    if (res.status === 202 && parsed?.design?.slug) {
      // Квота тратится только на успешном старте генерации.
      quota.record();
      router.push(`/dizajn/${parsed.design.slug}`);
      return;
    }

    setError(friendlyError(res.status, parsed));
    setSubmitting(false);
    // Сбрасываем одноразовый Turnstile-токен для повторной попытки.
    try {
      (window as unknown as { turnstile?: { reset?: () => void } }).turnstile?.reset?.();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-5 text-white sm:p-8">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        async
        defer
      />

      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative">
        {/* Header + quota badge */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/80">
              Хочу также
            </span>
            <h2 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
              Соберите дизайн интерьера
            </h2>
            <p className="mt-1 max-w-md text-sm text-white/50">
              Выберите параметры — нейросеть нарисует одну комнату в четырёх
              ракурсах. Без ручного ввода промпта.
            </p>
          </div>
          {quota.ready ? (
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60">
              {quota.tier === "pro" ? (
                <span className="font-semibold text-amber-300">PRO</span>
              ) : (
                <>
                  Осталось{" "}
                  <span className="font-semibold text-white">{quota.remaining}</span> из{" "}
                  {quota.limit}
                </>
              )}
            </span>
          ) : null}
        </div>

        <form ref={formRef} onSubmit={onSubmit} className="mt-7 grid gap-7">
          {/* ── Тип комнаты ─────────────────────────────────────── */}
          <Section title="Тип помещения" hint="на MVP открыта спальня">
            <div className="flex flex-wrap gap-2">
              {ROOM_TYPES.map((opt) => (
                <Chip
                  key={opt.id}
                  active={roomType === opt.id}
                  disabled={!opt.enabled}
                  onClick={() => opt.enabled && setRoomType(opt.id)}
                  label={opt.label}
                  badge={opt.enabled ? undefined : "скоро"}
                />
              ))}
            </div>
          </Section>

          {/* ── Стиль ───────────────────────────────────────────── */}
          <Section title="Стиль">
            <div className="flex flex-wrap gap-2">
              {STYLES.map((opt) => (
                <Chip
                  key={opt.id}
                  active={style === opt.id}
                  onClick={() => setStyle(opt.id)}
                  label={opt.label}
                />
              ))}
            </div>
          </Section>

          {/* ── Палитра ─────────────────────────────────────────── */}
          <Section title="Палитра">
            <div className="flex flex-wrap gap-2">
              {PALETTES.map((opt) => (
                <Chip
                  key={opt.id}
                  active={palette === opt.id}
                  onClick={() => setPalette(opt.id)}
                  label={opt.label}
                />
              ))}
            </div>
          </Section>

          {/* ── Ценовой сегмент ─────────────────────────────────── */}
          <Section title="Бюджет проекта">
            <div className="grid gap-2 sm:grid-cols-3">
              {PRICE_SEGMENTS.map((opt) => {
                const active = segment === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSegment(opt.id)}
                    className={[
                      "rounded-2xl border p-4 text-left transition",
                      active
                        ? "border-amber-400/60 bg-amber-400/10"
                        : "border-white/10 bg-white/5 hover:border-white/25",
                    ].join(" ")}
                  >
                    <span className="block text-sm font-semibold text-white">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-white/50">
                      ≈ {SEGMENT_BUDGET[opt.id].toLocaleString("ru-RU")} ₽
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ── Площадь ─────────────────────────────────────────── */}
          <Section title="Площадь" hint={`${area} м²`}>
            <input
              type="range"
              min={AREA_MIN}
              max={AREA_MAX}
              step={1}
              value={area}
              onChange={(e) => setArea(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-amber-400"
            />
            <div className="mt-1 flex justify-between text-[11px] text-white/35">
              <span>{AREA_MIN} м²</span>
              <span>{AREA_MAX} м²</span>
            </div>
          </Section>

          {/* ── Резюме выбора ───────────────────────────────────── */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <span className="text-[11px] uppercase tracking-widest text-white/40">
              Ваш выбор
            </span>
            <p className="mt-1 text-sm font-medium text-white/90">{summary}</p>
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/35">
              {promptPreview}
            </p>
          </div>

          {/* ── Cloudflare Turnstile ────────────────────────────── */}
          <div
            className="cf-turnstile"
            data-sitekey={turnstileSiteKey}
            data-action="ai_design_submit"
            data-theme="dark"
          />

          {/* ── Error ───────────────────────────────────────────── */}
          {error ? (
            <p
              role="alert"
              className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200"
            >
              {error}
            </p>
          ) : null}

          {/* ── Submit ──────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={submitting}
            className="group relative inline-flex h-14 items-center justify-center gap-2 overflow-hidden rounded-full bg-amber-400 px-8 text-base font-bold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? (
              <>
                <Spinner />
                Создаём дизайн…
              </>
            ) : (
              <>
                Создать дизайн
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* ── Skeleton-лоадер во время генерации ────────────────── */}
        {submitting ? <GenerationSkeleton /> : null}
      </div>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        tier={quota.tier}
        used={quota.used}
      />
    </div>
  );
}

// ── Presentational helpers ───────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-white/90">{title}</span>
        {hint ? <span className="text-xs text-white/35">— {hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Chip({
  label,
  active,
  disabled,
  badge,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={disabled}
      disabled={disabled}
      className={[
        "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
        disabled
          ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-white/25"
          : active
            ? "border-amber-400/70 bg-amber-400/15 text-white"
            : "border-white/10 bg-white/5 text-white/80 hover:border-white/30 hover:text-white",
      ].join(" ")}
    >
      {label}
      {badge ? (
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/40">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}

function GenerationSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="aspect-[4/3] animate-pulse rounded-2xl bg-gradient-to-br from-white/10 to-white/[0.03]"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

function friendlyError(status: number, parsed: ApiBody | null): string {
  const code = parsed?.error ?? `http_${status}`;
  switch (code) {
    case "invalid_captcha":
      return "Не удалось пройти проверку Cloudflare. Обновите страницу и попробуйте снова.";
    case "rate_limited": {
      const secs = parsed?.retryAfterSeconds;
      if (typeof secs === "number" && secs > 0) {
        const mins = Math.ceil(secs / 60);
        return `Слишком много запросов. Попробуйте через ${mins} мин.`;
      }
      return "Достигнут лимит генераций. Попробуйте позже.";
    }
    case "room_too_small":
      return parsed?.message ?? "Слишком маленькая площадь для этого типа комнаты.";
    case "validation_error":
      return "Проверьте параметры и попробуйте ещё раз.";
    case "upstream_unreachable":
      return "Сервер недоступен. Попробуйте через минуту.";
    default:
      return parsed?.message ?? "Не удалось запустить генерацию. Попробуйте ещё раз.";
  }
}
