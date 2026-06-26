import type { Metadata } from "next";
import Link from "next/link";
import { fetchCalculatorEstimate, fetchCities, fetchServices } from "../../lib/api";
import type { CalcCategory, CalculatorEstimate, City, Service } from "../../lib/types";
import {
  CATEGORY_META,
  DEFAULT_AREA,
  DEFAULT_CATEGORY,
  formatRubles,
  pluralDays,
  pluralProjects,
} from "../../lib/calculatorDefaults";
import { KalkulyatorForm } from "./_KalkulyatorForm";
import { publicUrl } from "../../lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CalcSearchParams {
  city?: string;
  service?: string;
  category?: string;
  area?: string;
}

function parseInput(raw: CalcSearchParams): {
  citySlug: string | null;
  serviceSlug: string | null;
  category: CalcCategory;
  area: number;
  hasInput: boolean;
} {
  const citySlug = raw.city && raw.city.trim() ? raw.city.trim() : null;
  const serviceSlug = raw.service && raw.service.trim() ? raw.service.trim() : null;
  const cat = raw.category && (raw.category === "kosmetic" || raw.category === "evro" || raw.category === "premium")
    ? (raw.category as CalcCategory)
    : DEFAULT_CATEGORY;
  const areaParsed = parseFloat(raw.area ?? "");
  const areaClamped = Number.isFinite(areaParsed)
    ? Math.max(8, Math.min(500, Math.round(areaParsed)))
    : DEFAULT_AREA;
  const hasInput = Boolean(raw.area && Number.isFinite(areaParsed));
  return { citySlug, serviceSlug, category: cat, area: areaClamped, hasInput };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<CalcSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const { area, hasInput } = parseInput(params);
  if (!hasInput) {
    return {
      title: "Калькулятор стоимости ремонта — расчёт за 30 секунд",
      description:
        "Узнайте бюджет ремонта квартиры по реальным сделкам в вашем городе. Косметический, евро, премиум — три уровня отделки и срок работ.",
      alternates: { canonical: "/kalkulyator" },
    };
  }
  return {
    title: `Стоимость ремонта ${area} м² — калькулятор Честных мастеров`,
    description: `Расчёт стоимости ремонта ${area} м² по реальным сделкам и региональным коэффициентам. Цена за м², итоговый бюджет, срок работ.`,
    alternates: { canonical: `/kalkulyator?area=${area}` },
  };
}

export default async function KalkulyatorPage({
  searchParams,
}: {
  searchParams: Promise<CalcSearchParams>;
}) {
  const params = await searchParams;
  const { citySlug, serviceSlug, category, area, hasInput } = parseInput(params);

  const [cities, services] = await Promise.all([
    fetchCities().catch(() => [] as City[]),
    fetchServices().catch(() => [] as Service[]),
  ]);

  let estimate: CalculatorEstimate | null = null;
  if (hasInput) {
    estimate = await fetchCalculatorEstimate({
      citySlug,
      serviceSlug,
      category,
      areaSqm: area,
    }).catch(() => null);
  }

  return (
    <div className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
        {/* Page header */}
        <nav className="mb-6 flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <Link href="/" className="hover:text-[var(--color-primary)]">Главная</Link>
          <span aria-hidden>/</span>
          <span className="text-[var(--color-text)]">Калькулятор</span>
        </nav>

        <header className="max-w-3xl">
          <p className="font-eyebrow">Калькулятор</p>
          <h1 className="font-editorial mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
            Сколько стоит ремонт квартиры в 2026
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
            Считаем бюджет «под ключ» — работа, материалы, инженерия. Используем реальные сделки наших мастеров и
            региональные коэффициенты, чтобы цифры были близки к жизни, а не к рекламным «от 5 000 ₽/м²».
          </p>
        </header>

        {/* Form + result two-column */}
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-10">
          <KalkulyatorForm
            cities={cities}
            services={services}
            initial={{
              citySlug,
              serviceSlug,
              category,
              area,
            }}
          />

          <div>
            {estimate ? (
              <Result estimate={estimate} />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

        {/* Methodology */}
        <section className="mt-12 rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)] sm:text-xl">
            Как мы считаем
          </h2>
          <ol className="mt-4 grid gap-4 text-sm text-[var(--color-muted)] sm:grid-cols-2 sm:gap-6">
            <li className="flex items-start gap-3">
              <Step n={1} />
              <p>
                Берём реальные сделки наших мастеров — суммы по договорам и площадь объекта. Это даёт
                <span className="text-[var(--color-text)] font-medium"> ₽/м²</span> для нашего города и услуги.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <Step n={2} />
              <p>
                Если данных по вашему городу пока мало (меньше 5 проектов), считаем по{" "}
                <span className="text-[var(--color-text)] font-medium">региональным коэффициентам</span>.
                Они откалиброваны по контрактам V1 и публичным калькуляторам Profi.ru, Авито, Rems24.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <Step n={3} />
              <p>
                Категория отделки задаёт базовую вилку:{" "}
                <span className="text-[var(--color-text)] font-medium">косметический</span> 7–18 ₽/тыс./м²,{" "}
                <span className="text-[var(--color-text)] font-medium">евро</span> 18–45 ₽/тыс./м²,{" "}
                <span className="text-[var(--color-text)] font-medium">премиум</span> 45–120 ₽/тыс./м² (Краснодар).
              </p>
            </li>
            <li className="flex items-start gap-3">
              <Step n={4} />
              <p>
                Срок зависит от размера бригады и логистики материалов: косм. ≈ 0.5–1.2 дня/м², евро ≈ 1.0–2.2,
                премиум ≈ 1.8–3.5.
              </p>
            </li>
          </ol>
          <p className="mt-6 rounded-xl bg-[var(--color-background)] p-4 text-xs text-[var(--color-muted)]">
            Калькулятор даёт <strong className="text-[var(--color-text)]">ориентир, не оферту</strong>. Точную смету мастер
            готовит после осмотра объекта или подробного описания. Бесплатно — оставьте заявку.
          </p>
        </section>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-bold text-[var(--color-primary)]">
      {n}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center">
      <div>
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 7h8" />
            <path d="M8 12h2" />
            <path d="M14 12h2" />
            <path d="M8 17h2" />
            <path d="M14 17h2" />
          </svg>
        </div>
        <h2 className="mt-4 text-base font-semibold text-[var(--color-text)]">
          Заполните форму — покажем расчёт
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Город, площадь и категория отделки — больше ничего не нужно.
        </p>
      </div>
    </div>
  );
}

function Result({ estimate }: { estimate: CalculatorEstimate }) {
  const cat = CATEGORY_META[estimate.category];
  const tintClass =
    cat.tint === "amber"
      ? "from-[var(--color-accent-soft)] to-white"
      : cat.tint === "indigo"
        ? "from-[var(--color-secondary-soft)] to-white"
        : "from-[var(--color-primary-soft)] to-white";

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
      <header className={`bg-gradient-to-br ${tintClass} px-6 py-6 sm:px-8`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Ориентировочная стоимость
        </p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-3xl">
          Ремонт {estimate.areaSqm} м² {estimate.cityNameIn}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Категория «{cat.label}» — {cat.description}
        </p>
      </header>

      <div className="grid gap-6 px-6 py-6 sm:grid-cols-2 sm:px-8 sm:py-8">
        {/* Total price tier */}
        <PriceTier label="Бюджет работ" data={estimate.totalPrice} unit="₽" />
        <PriceTier label="Цена за м²" data={estimate.pricePerSqm} unit="₽/м²" small />
      </div>

      <div className="grid gap-6 border-t border-[var(--color-border)] px-6 py-6 sm:grid-cols-2 sm:px-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Срок работ
          </p>
          <p className="mt-1 text-xl font-bold text-[var(--color-text)]">
            {estimate.duration.low}–{estimate.duration.high} {pluralDays(estimate.duration.high)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Зависит от размера бригады и сроков поставки материалов.
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Источник
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{estimate.source}</p>
          {estimate.matchingRealCasesCount > 0 ? (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              На платформе уже {estimate.matchingRealCasesCount}{" "}
              {pluralProjects(estimate.matchingRealCasesCount)} в этом диапазоне площади.
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Расчёт по региональным коэффициентам — реальных проектов в этом диапазоне на платформе пока недостаточно.
            </p>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col gap-3 border-t border-[var(--color-border)] bg-[var(--color-background)] px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-sm text-[var(--color-muted)]">
          Точную смету подготовит мастер после осмотра — бесплатно.
        </p>
        <Link
          href="/uslugi"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--color-cta)] px-5 text-sm font-semibold text-[var(--color-on-cta)] shadow-sm transition hover:bg-[var(--color-cta-hover)]"
        >
          Получить точную смету
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
            className="ml-2"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      </div>
    </article>
  );
}

function PriceTier({
  label,
  data,
  unit,
  small,
}: {
  label: string;
  data: { low: number; mid: number; high: number };
  unit: string;
  small?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </p>
      <p className={`mt-1 font-extrabold tracking-tight text-[var(--color-text)] ${small ? "text-xl" : "text-3xl sm:text-4xl"}`}>
        {formatRubles(data.low)}–{formatRubles(data.high)}{" "}
        <span className="text-base font-semibold text-[var(--color-muted)]">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Медиана: <span className="font-medium text-[var(--color-text)]">{formatRubles(data.mid)} {unit}</span>
      </p>
    </div>
  );
}
