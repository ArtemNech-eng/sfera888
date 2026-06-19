"use client";

import { useState, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { City } from "../../lib/types";

/**
 * Форма «создать AI-дизайн». Client-component, потому что нужен file input,
 * preview и async submit. После submit редиректит на `/dizajn/{slug}` где
 * polling и финальный design-board.
 *
 * Архитектура:
 *   • Файл превью — FileReader → data URL (без upload до submit).
 *   • Submit → POST /api/dizajn/generate (multipart) → {slug}.
 *   • Router push на /dizajn/{slug} — там polling.
 *
 * Прогресс UX: пока submit идёт, показываем loading-state на кнопке
 * («Загружаем фото… → Запускаем генерацию…»). После get slug — мгновенный
 * redirect; на следующей странице будет polling spinner с прогресс-баром.
 */

interface Props {
  cities: City[];
}

const ROOMS: Array<{ value: string; label: string }> = [
  { value: "bathroom", label: "Ванная" },
  { value: "kitchen", label: "Кухня" },
  { value: "living_room", label: "Гостиная" },
  { value: "bedroom", label: "Спальня" },
  { value: "hallway", label: "Прихожая" },
  { value: "apartment", label: "Квартира" },
];

const STYLES: Array<{ value: string; label: string }> = [
  { value: "modern", label: "Современный" },
  { value: "scandinavian", label: "Скандинавский" },
  { value: "loft", label: "Лофт" },
  { value: "minimalism", label: "Минимализм" },
  { value: "neoclassic", label: "Неоклассика" },
  { value: "japandi", label: "Японди" },
];

export function UploadForm({ cities }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [room, setRoom] = useState<string>("bedroom");
  const [style, setStyle] = useState<string>("modern");
  const [area, setArea] = useState<string>("");
  const [budget, setBudget] = useState<string>("");
  const [durationWeeks, setDurationWeeks] = useState<string>("");
  const [citySlug, setCitySlug] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(file: File | null) {
    setFile(file);
    setError(null);
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Файл слишком большой — максимум 8 МБ.");
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Загрузите фото комнаты");
      return;
    }
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("room", room);
    formData.append("style", style);
    if (area) formData.append("area", area);
    if (budget) formData.append("budget", budget);
    if (durationWeeks) formData.append("durationWeeks", durationWeeks);
    if (citySlug) formData.append("citySlug", citySlug);

    try {
      const res = await fetch("/api/dizajn/generate", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const code: string = data.error ?? "unknown";
        const msg =
          code === "rate_limit"
            ? "Лимит на сегодня — 5 дизайнов. Попробуйте завтра."
            : code === "missing_file"
              ? "Загрузите фото"
              : code === "invalid_room" || code === "invalid_style"
                ? "Выберите комнату и стиль"
                : code === "missing_anon_id"
                  ? "Не удалось создать сессию. Очистите cookies и попробуйте снова."
                  : code === "storage_not_configured"
                    ? "Хранилище не настроено. Сообщите в поддержку."
                    : code === "upstream_unreachable"
                      ? "Сервер недоступен. Попробуйте через минуту."
                      : `Не удалось запустить генерацию (${code}).`;
        setError(msg);
        setSubmitting(false);
        return;
      }
      router.push(`/dizajn/${data.design.slug}`);
    } catch {
      setError("Сеть недоступна. Проверьте подключение.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:gap-10">
      {/* ── Photo upload + preview ─────────────────────────── */}
      <div>
        <label className="block">
          <span className="text-sm font-semibold text-[var(--color-text)]">
            Фото комнаты
          </span>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Снимок с телефона подходит. JPG/PNG до 8 МБ.
          </p>
        </label>

        <div
          className={`mt-3 relative aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-dashed transition ${
            previewUrl
              ? "border-[var(--color-text)] bg-[var(--color-cream-deep)]"
              : "border-[var(--color-border-strong)] bg-[var(--color-cream-deep)] hover:border-[var(--color-text)]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="absolute inset-0 z-10 cursor-pointer opacity-0"
            disabled={submitting}
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
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-sm text-[var(--color-text)]">
                Нажмите чтобы выбрать фото
              </p>
              <p className="text-xs text-[var(--color-faint)]">
                или сделайте снимок на телефоне
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
            className="mt-3 text-xs text-[var(--color-muted)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text)]"
            disabled={submitting}
          >
            Загрузить другое фото
          </button>
        ) : null}
      </div>

      {/* ── Параметры дизайн-проекта ────────────────────────── */}
      <div className="space-y-5">
        <Field label="Помещение">
          <SelectButtons options={ROOMS} value={room} onChange={setRoom} disabled={submitting} />
        </Field>

        <Field label="Стиль">
          <SelectButtons options={STYLES} value={style} onChange={setStyle} disabled={submitting} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Площадь, м²" hint="опционально">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min="1"
              max="999"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="15"
              disabled={submitting}
              className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm text-[var(--color-text)] placeholder-[var(--color-faint)] focus:border-[var(--color-text)] focus:outline-none"
            />
          </Field>
          <Field label="Бюджет, ₽" hint="опционально">
            <input
              type="number"
              inputMode="numeric"
              step="10000"
              min="50000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="200000"
              disabled={submitting}
              className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm text-[var(--color-text)] placeholder-[var(--color-faint)] focus:border-[var(--color-text)] focus:outline-none"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Сроки, недели" hint="опционально">
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              max="52"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(e.target.value)}
              placeholder="6"
              disabled={submitting}
              className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm text-[var(--color-text)] placeholder-[var(--color-faint)] focus:border-[var(--color-text)] focus:outline-none"
            />
          </Field>
          <Field label="Город" hint="опционально">
            <select
              value={citySlug}
              onChange={(e) => setCitySlug(e.target.value)}
              disabled={submitting}
              className="h-11 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm text-[var(--color-text)] focus:border-[var(--color-text)] focus:outline-none"
            >
              <option value="">Не указан</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error ? (
          <p className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !file}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-7 text-base font-semibold text-white shadow-cozy-md transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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
          Загружая фото, вы подтверждаете, что это ваше изображение и вы
          согласны с обработкой по{" "}
          <a
            href="/policy/privacy"
            className="underline decoration-[var(--color-border-strong)] underline-offset-4 hover:text-[var(--color-text)]"
          >
            политике конфиденциальности
          </a>
          .
        </p>
      </div>
    </form>
  );
}

// ── Form bits ───────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        {label}
        {hint ? <span className="text-xs font-normal text-[var(--color-faint)]">— {hint}</span> : null}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function SelectButtons({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition ${
              active
                ? "border-[var(--color-text)] bg-[var(--color-text)] text-white"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-text)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
