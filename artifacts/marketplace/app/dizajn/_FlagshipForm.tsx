"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useGenerationQuota } from "../../lib/useGenerationQuota";
import { PaywallModal } from "../../components/dizajn/PaywallModal";
import {
  ROOM_TYPES,
  STYLES,
  PALETTES,
  SEGMENT_BUDGET,
  PRICE_SEGMENTS,
  WIDTH_CM_MIN,
  WIDTH_CM_MAX,
  ROOM_HEIGHT_CM,
  BUDGET_MIN_RUB,
  BUDGET_MAX_RUB,
  MAX_PHOTO_SIZE_BYTES,
  ALLOWED_PHOTO_MIME_TYPES,
  MIN_AREA_SQM_BY_ROOM_TYPE,
  AREA_DEFAULT,
  deriveRoomDims,
  mvpRoomLockBadge,
  handleGenerateOutcome,
  type PriceSegmentId,
} from "./_flagshipFormConfig";

// Re-export the pure derivation so existing importers/tests keep their path.
export { deriveRoomDims } from "./_flagshipFormConfig";

/**
 * `Flagship_Form` — единая публичная форма AI_Design_Flagship на канонической
 * странице `/dizajn`. Консолидирует лучшее из трёх исторических форм:
 *   • загрузку фото + preview — из `UploadForm` (`/dizajn` legacy);
 *   • Turnstile + per-field/top-level ошибки по `violations`/`error` — из
 *     `_AiDesignForm` (`/ai-design`);
 *   • визуальные плитки (тип/стиль/палитра/сегмент), клиентскую квоту и
 *     `Paywall_Modal` — из `DesignConfigurator` (`/hochu-takzhe`).
 *
 * Единый контракт запроса — `multipart/form-data` на всём пути
 * `Flagship_Form → Proxy_Route → Generate_Endpoint → Design_Worker`.
 * Площадь (`area`, м²) — первичный пользовательский ввод; размеры комнаты в см
 * выводятся детерминированно `deriveRoomDims` и перепроверяются на backend.
 *
 * Поведение submit (design.md → «Flagship_Form (клиент)»):
 *   1. клиентская предвалидация (площадь, бюджет, тип/размер фото, MVP-замок);
 *   2. `Free_Quota.canGenerate === false` → открыть `Paywall_Modal`, не слать;
 *   3. собрать `FormData` (+ опц. `image`, `cf-turnstile-response`) →
 *      `POST /api/dizajn/generate`;
 *   4. `202 {slug}` → `record()` (списать 1 квоту) → `router.push('/dizajn/'+slug)`;
 *   5. `400/429` → top-level + per-field сообщения; сброс Turnstile-токена.
 */

interface FlagshipFormProps {
  /** Cloudflare Turnstile site key (требуется backend для anti-abuse). */
  turnstileSiteKey: string;
}

// ── ответы API ────────────────────────────────────────────────────────────────

interface ApiViolation {
  path?: string;
  field?: string;
  code?: string;
  message?: string;
}

interface ApiBody {
  ok?: boolean;
  error?: string;
  message?: string;
  design?: { slug?: string };
  violations?: ApiViolation[];
  retryAfterSeconds?: number;
}

export function FlagshipForm({ turnstileSiteKey }: FlagshipFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quota = useGenerationQuota();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [roomType, setRoomType] = useState<string>("bedroom");
  const [style, setStyle] = useState<string>("modern");
  const [palette, setPalette] = useState<string>("warm_neutral");
  const [segment, setSegment] = useState<PriceSegmentId>("optima");
  const [budget, setBudget] = useState<string>(String(SEGMENT_BUDGET.optima));
  const [area, setArea] = useState<string>(AREA_DEFAULT);

  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [paywallOpen, setPaywallOpen] = useState(false);

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function handleFileChange(next: File | null) {
    clearFieldError("image");
    if (!next) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    // Клиентская предвалидация фото (дублирует серверную, Requirement 5.5/5.6).
    if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(next.type)) {
      setFieldErrors((prev) => ({ ...prev, image: "Фото должно быть в формате JPG или PNG." }));
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (next.size > MAX_PHOTO_SIZE_BYTES) {
      setFieldErrors((prev) => ({ ...prev, image: "Размер фото не должен превышать 8 МБ." }));
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFile(next);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(next);
  }

  function selectSegment(id: PriceSegmentId) {
    setSegment(id);
    setBudget(String(SEGMENT_BUDGET[id]));
    clearFieldError("budget");
  }

  function resetTurnstile() {
    try {
      (window as unknown as { turnstile?: { reset?: () => void } }).turnstile?.reset?.();
    } catch {
      /* ignore — повтор инициализации Turnstile не должен ломать UI */
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setTopError(null);
    setFieldErrors({});

    // ── 2. Гейт квоты (Requirement 8.3): исчерпана → Paywall, не отправляем ──
    if (quota.ready && !quota.canGenerate) {
      setPaywallOpen(true);
      return;
    }

    // ── 1. Клиентская предвалидация ─────────────────────────────────────────
    const localErrors = collectClientErrors({ roomType, area, budget });
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    const formEl = formRef.current ?? (e.currentTarget as HTMLFormElement);
    // Turnstile-виджет кладёт одноразовый токен в hidden input внутри формы.
    const turnstileToken = String(
      new FormData(formEl).get("cf-turnstile-response") ?? "",
    ).trim();
    if (!turnstileToken) {
      setTopError(
        "Проверка Cloudflare ещё не завершилась — подождите пару секунд и попробуйте снова.",
      );
      return;
    }

    const dims = deriveRoomDims(Number(area));

    // ── 3. Сборка multipart FormData ────────────────────────────────────────
    const fd = new FormData();
    fd.append("roomType", roomType);
    fd.append("style", style);
    fd.append("palette", palette);
    fd.append("widthCm", String(dims.widthCm));
    fd.append("lengthCm", String(dims.lengthCm));
    fd.append("heightCm", String(dims.heightCm));
    fd.append("budget", String(Number(budget)));
    fd.append("area", String(Number(area)));
    fd.append("cf-turnstile-response", turnstileToken);
    if (file) fd.append("image", file);

    setSubmitting(true);

    let res: Response;
    try {
      res = await fetch("/api/dizajn/generate", { method: "POST", body: fd });
    } catch {
      setTopError("Сеть недоступна. Проверьте подключение и попробуйте ещё раз.");
      setSubmitting(false);
      resetTurnstile();
      return;
    }

    let parsed: ApiBody | null = null;
    try {
      parsed = (await res.json()) as ApiBody;
    } catch {
      parsed = null;
    }

    // ── 4. Успешный старт ───────────────────────────────────────────────────
    // На 202 со slug: списать ровно одну единицу квоты (Requirement 8.4) и
    // перейти на `/dizajn/{slug}` (Requirement 2.7) — ровно по одному разу.
    const navigated = handleGenerateOutcome(res.status, parsed, {
      record: quota.record,
      navigate: (path) => router.push(path),
    });
    if (navigated) return;

    // ── 5. Ошибки: per-field по violations[] + top-level по error ───────────
    applyServerErrors(res.status, parsed);
    setSubmitting(false);
    resetTurnstile(); // одноразовый токен сгорел — сбрасываем для повтора
  }

  /** Раскладывает серверные нарушения по полям формы + общий текст ошибки. */
  function applyServerErrors(status: number, parsed: ApiBody | null) {
    const code = parsed?.error ?? `http_${status}`;

    if (Array.isArray(parsed?.violations) && parsed.violations.length > 0) {
      const perField: Record<string, string> = {};
      for (const v of parsed.violations) {
        const path = (v.path ?? v.field ?? "").trim();
        if (!path) continue;
        const key = mapViolationPathToField(path);
        // Не затираем уже выставленное более конкретное сообщение поля.
        if (!perField[key]) perField[key] = v.message ?? friendlyFieldError(key);
      }
      if (Object.keys(perField).length > 0) {
        setFieldErrors(perField);
        setTopError("Проверьте подсвеченные поля и попробуйте ещё раз.");
        return;
      }
    }

    setTopError(friendlyApiError(code, parsed));
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        async
        defer
      />

      {/* Заголовок + бейдж остатка Free_Quota (включая «0 осталось») */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-eyebrow">AI-дизайн</p>
          <h2 className="font-display mt-1 text-2xl text-[var(--color-text)] sm:text-3xl">
            Соберите дизайн-проект
          </h2>
          <p className="mt-1 max-w-md text-sm text-[var(--color-muted)]">
            Загрузите фото комнаты (опционально) и выберите параметры — AI
            нарисует дизайн в выбранном стиле.
          </p>
        </div>
        {quota.ready ? (
          <span
            data-testid="quota-badge"
            className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
          >
            {quota.tier === "pro" ? (
              <span className="font-semibold text-[var(--color-primary)]">PRO</span>
            ) : quota.remaining > 0 ? (
              <>
                Осталось{" "}
                <span className="font-semibold text-[var(--color-text)]">{quota.remaining}</span>{" "}
                из {quota.limit}
              </>
            ) : (
              <span className="font-semibold text-[var(--color-text)]">0 осталось</span>
            )}
          </span>
        ) : null}
      </div>

      <form ref={formRef} onSubmit={onSubmit} className="grid gap-7">
        {/* ── Фото комнаты (опционально) ──────────────────────────── */}
        <Field
          label="Фото комнаты"
          hint="опционально — JPG/PNG до 8 МБ"
          error={fieldErrors.image}
        >
          <div
            className={`relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl border-2 border-dashed transition ${
              previewUrl
                ? "border-[var(--color-text)] bg-[var(--color-cream-deep)]"
                : "border-[var(--color-border-strong)] bg-[var(--color-cream-deep)] hover:border-[var(--color-text)]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              disabled={submitting}
              aria-label="Фото комнаты"
              className="absolute inset-0 z-10 cursor-pointer opacity-0"
            />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Превью загруженного фото"
                className="block h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-[var(--color-muted)]"
                  aria-hidden
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-sm text-[var(--color-text)]">Нажмите чтобы выбрать фото</p>
                <p className="text-xs text-[var(--color-faint)]">
                  без фото — генерация по параметрам
                </p>
              </div>
            )}
          </div>
          {file ? (
            <button
              type="button"
              onClick={() => {
                handleFileChange(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              disabled={submitting}
              className="mt-3 text-xs text-[var(--color-muted)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text)]"
            >
              Убрать фото
            </button>
          ) : null}
        </Field>

        {/* ── Тип помещения ───────────────────────────────────────── */}
        <Field
          label="Тип помещения"
          hint="на MVP доступна только спальня — остальные скоро"
          error={fieldErrors.roomType}
        >
          <div className="flex flex-wrap gap-2">
            {ROOM_TYPES.map((opt) => {
              const active = roomType === opt.value;
              const disabled = !opt.enabled;
              return (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  active={active}
                  disabled={disabled}
                  badge={mvpRoomLockBadge(opt)}
                  onClick={() => {
                    if (disabled) return;
                    setRoomType(opt.value);
                    clearFieldError("roomType");
                  }}
                />
              );
            })}
          </div>
        </Field>

        {/* ── Стиль ───────────────────────────────────────────────── */}
        <Field label="Стиль" error={fieldErrors.style}>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                active={style === opt.value}
                onClick={() => {
                  setStyle(opt.value);
                  clearFieldError("style");
                }}
              />
            ))}
          </div>
        </Field>

        {/* ── Палитра ─────────────────────────────────────────────── */}
        <Field label="Палитра" error={fieldErrors.palette}>
          <div className="flex flex-wrap gap-2">
            {PALETTES.map((opt) => {
              const active = palette === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setPalette(opt.value);
                    clearFieldError("palette");
                  }}
                  className={[
                    "inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition",
                    active
                      ? "border-[var(--color-text)] bg-[var(--color-text)] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-text)]",
                  ].join(" ")}
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: opt.swatch }}
                    aria-hidden
                  />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Field>

        {/* ── Бюджет: сегмент-плитки + явный ввод ──────────────────── */}
        <Field label="Бюджет проекта" hint="выберите сегмент или укажите сумму" error={fieldErrors.budget}>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRICE_SEGMENTS.map((opt) => {
              const active = segment === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => selectSegment(opt.id)}
                  className={[
                    "rounded-2xl border p-4 text-left transition",
                    active
                      ? "border-[var(--color-text)] bg-[var(--color-cream-deep)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text)]",
                  ].join(" ")}
                >
                  <span className="block text-sm font-semibold text-[var(--color-text)]">
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                    ≈ {SEGMENT_BUDGET[opt.id].toLocaleString("ru-RU")} ₽
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <input
              type="number"
              inputMode="numeric"
              step={10_000}
              min={BUDGET_MIN_RUB}
              max={BUDGET_MAX_RUB}
              value={budget}
              onChange={(e) => {
                setBudget(e.target.value);
                clearFieldError("budget");
              }}
              disabled={submitting}
              aria-label="Бюджет, ₽"
              placeholder="500000"
              className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm text-[var(--color-text)] placeholder-[var(--color-faint)] focus:border-[var(--color-text)] focus:outline-none sm:max-w-xs"
            />
          </div>
        </Field>

        {/* ── Площадь, м² ─────────────────────────────────────────── */}
        <Field label="Площадь, м²" hint="размеры комнаты выводятся автоматически" error={fieldErrors.area}>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="1"
            max="999"
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              clearFieldError("area");
            }}
            disabled={submitting}
            aria-label="Площадь, м²"
            placeholder="16"
            className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm text-[var(--color-text)] placeholder-[var(--color-faint)] focus:border-[var(--color-text)] focus:outline-none sm:max-w-xs"
          />
        </Field>

        {/* ── Cloudflare Turnstile ─────────────────────────────────── */}
        <div>
          <span className="block text-sm font-semibold text-[var(--color-text)]">
            Подтверждение
          </span>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Cloudflare убеждается, что вы человек — просто подождите пару секунд.
          </p>
          <div
            className="cf-turnstile mt-3"
            data-sitekey={turnstileSiteKey}
            data-action="ai_design_submit"
            data-theme="light"
          />
        </div>

        {/* ── Top-level error ──────────────────────────────────────── */}
        {topError ? (
          <p
            role="alert"
            className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]"
          >
            {topError}
          </p>
        ) : null}

        {/* ── Submit ───────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-cta)] px-7 text-base font-semibold text-[var(--color-on-cta)] shadow-cozy-md transition hover:bg-[var(--color-cta-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {submitting ? "Запускаем генерацию…" : "Создать дизайн-проект"}
          {!submitting ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          ) : null}
        </button>

        <p className="text-xs text-[var(--color-faint)]">
          Отправляя форму, вы соглашаетесь с{" "}
          <a
            href="/policy/privacy"
            className="underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text)]"
          >
            политикой конфиденциальности
          </a>
          .
        </p>
      </form>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        tier={quota.tier}
        used={quota.used}
      />
    </>
  );
}

// ── presentational helpers ───────────────────────────────────────────────────

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
    <div className="block">
      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        {label}
        {hint ? (
          <span className="text-xs font-normal text-[var(--color-faint)]">— {hint}</span>
        ) : null}
      </span>
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1.5 text-xs text-[var(--color-danger)]">{error}</p> : null}
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
          ? "cursor-not-allowed border-[var(--color-border)] bg-[var(--color-cream-deep)] text-[var(--color-faint)]"
          : active
            ? "border-[var(--color-text)] bg-[var(--color-text)] text-white"
            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-text)]",
      ].join(" ")}
    >
      {label}
      {badge ? (
        <span className="rounded-full bg-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

// ── валидация и сообщения ─────────────────────────────────────────────────────

/**
 * Клиентская предвалидация (Requirement 6.1 + 5.x на стороне UX): ловит
 * очевидно невалидный ввод, чтобы не сжигать одноразовый Turnstile-токен.
 * Backend остаётся источником истины.
 */
function collectClientErrors(input: {
  roomType: string;
  area: string;
  budget: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  // MVP-замок (дублирует disabled-плитки).
  if (input.roomType !== "bedroom") {
    errors.roomType = "На MVP доступна только спальня — остальные типы скоро.";
  }

  const areaSqm = Number(input.area);
  if (!Number.isFinite(areaSqm) || areaSqm <= 0) {
    errors.area = "Укажите площадь в м².";
  } else {
    // Проверяем производную площадь так же, как backend (checkMinArea).
    const dims = deriveRoomDims(areaSqm);
    const derivedAreaSqm = (dims.widthCm * dims.lengthCm) / 10_000;
    const minSqm = MIN_AREA_SQM_BY_ROOM_TYPE[input.roomType] ?? 0;
    if (derivedAreaSqm < minSqm) {
      errors.area = `Слишком маленькая площадь — минимум ${minSqm} м² для этого помещения.`;
    }
  }

  const budget = Number(input.budget);
  if (!Number.isFinite(budget) || budget < BUDGET_MIN_RUB || budget > BUDGET_MAX_RUB) {
    errors.budget = `Бюджет от ${BUDGET_MIN_RUB.toLocaleString("ru-RU")} до ${BUDGET_MAX_RUB.toLocaleString("ru-RU")} ₽.`;
  }

  return errors;
}

/**
 * Сводит серверный `violations[].path` к ключу поля формы. Производные размеры
 * (`widthCm`/`lengthCm`/`heightCm`) и `area` пользователь задаёт одним полем
 * «Площадь», поэтому их нарушения показываем на нём.
 */
function mapViolationPathToField(path: string): string {
  const head = path.split(".")[0];
  switch (head) {
    case "widthCm":
    case "lengthCm":
    case "heightCm":
    case "area":
      return "area";
    case "image":
      return "image";
    case "palette":
      return "palette";
    case "style":
      return "style";
    case "roomType":
      return "roomType";
    case "budget":
      return "budget";
    default:
      return head || "area";
  }
}

function friendlyFieldError(field: string): string {
  switch (field) {
    case "roomType":
      return "Выберите тип помещения.";
    case "style":
      return "Выберите стиль.";
    case "palette":
      return "Выберите палитру.";
    case "budget":
      return `Бюджет от ${BUDGET_MIN_RUB.toLocaleString("ru-RU")} до ${BUDGET_MAX_RUB.toLocaleString("ru-RU")} ₽.`;
    case "area":
      return "Проверьте площадь помещения.";
    case "image":
      return "Фото должно быть JPG или PNG до 8 МБ.";
    default:
      return "Проверьте значение.";
  }
}

function friendlyApiError(code: string, parsed: ApiBody | null): string {
  switch (code) {
    case "invalid_captcha":
      return "Не удалось пройти проверку Cloudflare. Обновите страницу и попробуйте снова.";
    case "rate_limited": {
      const secs = parsed?.retryAfterSeconds;
      if (typeof secs === "number" && Number.isFinite(secs) && secs > 0) {
        const mins = Math.ceil(secs / 60);
        return `Слишком много запросов. Попробуйте через ${mins} мин.`;
      }
      return "Достигнут лимит генераций. Попробуйте позже.";
    }
    case "room_too_small":
      return parsed?.message ?? "Слишком маленькая площадь для этого типа помещения.";
    case "mvp_room_locked":
      return "Тип помещения пока недоступен — на MVP активна только спальня.";
    case "validation_error":
      return parsed?.message ?? "Проверьте поля формы и попробуйте ещё раз.";
    case "upstream_unreachable":
      return "Сервер недоступен. Попробуйте через минуту.";
    case "anon_id_unavailable":
      return "Не удалось создать сессию. Очистите cookies и попробуйте снова.";
    default:
      return parsed?.message ?? "Не удалось запустить генерацию. Попробуйте ещё раз.";
  }
}
