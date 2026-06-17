"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CalcCategory, City, Service } from "../../lib/types";
import { CATEGORY_META } from "../../lib/calculatorDefaults";

interface Initial {
  citySlug: string | null;
  serviceSlug: string | null;
  category: CalcCategory;
  area: number;
}

interface Props {
  cities: City[];
  services: Service[];
  initial: Initial;
}

const CATEGORIES: CalcCategory[] = ["kosmetic", "evro", "premium"];

const CATEGORY_TINT: Record<CalcCategory, { ring: string; activeBg: string; activeText: string }> = {
  kosmetic: {
    ring: "data-[active=true]:ring-[var(--color-secondary)]",
    activeBg: "data-[active=true]:bg-[var(--color-secondary-soft)]",
    activeText: "data-[active=true]:text-[var(--color-secondary)]",
  },
  evro: {
    ring: "data-[active=true]:ring-[var(--color-primary)]",
    activeBg: "data-[active=true]:bg-[var(--color-primary-soft)]",
    activeText: "data-[active=true]:text-[var(--color-primary)]",
  },
  premium: {
    ring: "data-[active=true]:ring-[var(--color-accent)]",
    activeBg: "data-[active=true]:bg-[var(--color-accent-soft)]",
    activeText: "data-[active=true]:text-[var(--color-accent-hover)]",
  },
};

/**
 * Calculator form. Pushes its state to the URL searchParams so the result
 * is shareable, bookmarkable and indexable. The page server-renders the
 * answer using those params — no client-side network round-trip.
 */
export function KalkulyatorForm({ cities, services, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [citySlug, setCitySlug] = useState<string | null>(initial.citySlug);
  const [serviceSlug, setServiceSlug] = useState<string | null>(initial.serviceSlug);
  const [category, setCategory] = useState<CalcCategory>(initial.category);
  const [area, setArea] = useState<number>(initial.area);
  const [areaError, setAreaError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!Number.isFinite(area) || area < 8 || area > 500) {
      setAreaError("Площадь от 8 до 500 м²");
      return;
    }
    setAreaError(null);

    const params = new URLSearchParams();
    if (citySlug) params.set("city", citySlug);
    if (serviceSlug) params.set("service", serviceSlug);
    params.set("category", category);
    params.set("area", String(Math.round(area)));

    startTransition(() => {
      router.push(`/kalkulyator?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-20"
    >
      <h2 className="text-base font-bold text-[var(--color-text)]">Параметры расчёта</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">Меняйте поля — пересчёт автоматически.</p>

      {/* City */}
      <div className="mt-5">
        <label htmlFor="calc-city" className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Город
        </label>
        <select
          id="calc-city"
          value={citySlug ?? ""}
          onChange={(e) => setCitySlug(e.target.value ? e.target.value : null)}
          className="mt-1 block h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]"
        >
          <option value="">По региону</option>
          {cities.map((c) => (
            <option key={c.id} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Service (optional, narrows real-cases count) */}
      {services.length > 0 ? (
        <div className="mt-4">
          <label htmlFor="calc-service" className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Тип работ <span className="font-normal text-[var(--color-muted)]">(опц.)</span>
          </label>
          <select
            id="calc-service"
            value={serviceSlug ?? ""}
            onChange={(e) => setServiceSlug(e.target.value ? e.target.value : null)}
            className="mt-1 block h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]"
          >
            <option value="">Все услуги</option>
            {services.map((s) => (
              <option key={s.id} value={s.slug}>{s.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Area */}
      <div className="mt-4">
        <label htmlFor="calc-area" className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Площадь
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="calc-area"
            type="number"
            inputMode="numeric"
            min={8}
            max={500}
            step={1}
            value={Number.isFinite(area) ? area : ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setArea(Number.isFinite(n) ? n : 0);
            }}
            className="block h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]"
          />
          <span className="text-sm font-semibold text-[var(--color-muted)]">м²</span>
        </div>
        {areaError ? (
          <p className="mt-1 text-xs text-red-600">{areaError}</p>
        ) : null}
      </div>

      {/* Category */}
      <fieldset className="mt-5">
        <legend className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Категория отделки
        </legend>
        <div className="mt-2 space-y-2">
          {CATEGORIES.map((c) => {
            const meta = CATEGORY_META[c];
            const tint = CATEGORY_TINT[c];
            const active = category === c;
            return (
              <label
                key={c}
                data-active={active}
                className={`flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-[var(--color-border)] transition ${tint.ring} ${tint.activeBg} ${tint.activeText} hover:ring-[var(--color-text)]/20`}
              >
                <input
                  type="radio"
                  name="category"
                  value={c}
                  checked={active}
                  onChange={() => setCategory(c)}
                  className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{meta.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">{meta.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
      >
        {pending ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <>
            Рассчитать стоимость
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </>
        )}
      </button>
    </form>
  );
}
