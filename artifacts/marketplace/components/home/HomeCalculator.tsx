"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalcCategory, City } from "../../lib/types";
import { CATEGORY_META, DEFAULT_AREA, DEFAULT_CATEGORY } from "../../lib/calculatorDefaults";

interface Props {
  cities: City[];
}

const CATEGORIES: CalcCategory[] = ["kosmetic", "evro", "premium"];

/**
 * Compact home-page calculator strip (plan §20.2 [6]). Three-column form:
 * city + category + area. Submitting routes to `/kalkulyator?...` where the
 * full SEO landing page renders the answer with methodology, social proof
 * and the lead CTA.
 *
 * Why server-rendered destination instead of inline result here:
 *   • The result page IS the SEO asset (each (city, area, category) combo
 *     is shareable and indexable).
 *   • Keeps the home page tight — no nested calculator UI that competes
 *     with the rest of the planner narrative.
 */
export function HomeCalculator({ cities }: Props) {
  const router = useRouter();
  const [citySlug, setCitySlug] = useState<string>("");
  const [category, setCategory] = useState<CalcCategory>(DEFAULT_CATEGORY);
  const [area, setArea] = useState<number>(DEFAULT_AREA);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (citySlug) params.set("city", citySlug);
    params.set("category", category);
    params.set("area", String(Math.max(8, Math.min(500, Math.round(area || DEFAULT_AREA)))));
    router.push(`/kalkulyator?${params.toString()}`);
  }

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-[var(--color-accent-soft)] opacity-50 blur-3xl"
      />
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Калькулятор
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
              Узнайте бюджет ремонта за 30 секунд
            </h2>
            <p className="mt-3 text-base text-[var(--color-muted)]">
              Считаем по реальным сделкам в вашем городе и региональным коэффициентам — близко к жизни,
              а не «от 5 000 ₽/м²» из рекламы.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-[var(--color-muted)]">
              {BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mt-0.5 flex-shrink-0 text-[var(--color-primary)]"
                    aria-hidden
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-md sm:p-6"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {/* City */}
              <div className="sm:col-span-2">
                <label htmlFor="home-calc-city" className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  Город
                </label>
                <select
                  id="home-calc-city"
                  value={citySlug}
                  onChange={(e) => setCitySlug(e.target.value)}
                  className="mt-1 block h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]"
                >
                  <option value="">По региону</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.slug}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Area */}
              <div>
                <label htmlFor="home-calc-area" className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  Площадь, м²
                </label>
                <input
                  id="home-calc-area"
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
                  className="mt-1 block h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]"
                />
              </div>

              {/* Category */}
              <div>
                <label htmlFor="home-calc-category" className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  Отделка
                </label>
                <select
                  id="home-calc-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CalcCategory)}
                  className="mt-1 block h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-ring)]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)]"
            >
              Рассчитать бюджет
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
            </button>

            <p className="mt-3 text-center text-[11px] text-[var(--color-muted)]">
              Бесплатно. Без регистрации. По реальным данным платформы.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

const BULLETS = [
  "Цена за м² и итоговый бюджет — три уровня от низкого к премиуму",
  "Срок работ с учётом размера бригады и материалов",
  "Социальный proof: сколько похожих проектов уже на платформе",
  "В конце — точная смета от мастера после осмотра, бесплатно",
] as const;
