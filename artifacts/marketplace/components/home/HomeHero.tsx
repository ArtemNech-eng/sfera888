import Link from "next/link";
import { DEMO_CASES, ROOM_CATEGORIES } from "../../lib/demoCases";
import type { City, MarketplaceStats } from "../../lib/types";

interface Props {
  stats: MarketplaceStats;
  cities: City[];
}

/**
 * Portal-grade hero (plan §21 portal iteration).
 *
 * Functional-first hero, the way serious country-scale platforms (Госуслуги,
 * Profi.ru, Yandex.Services, ЦИАН) lay out their first screen:
 *   1. tight headline + subtitle
 *   2. search form — пользователь сразу делает что-то полезное, а не любуется
 *   3. live platform stats inline as a credibility row
 *   4. quick-pick category chips for the most common rooms / services
 *   5. visual banner (3-photo strip) underneath as the "this is interior",
 *      not a hero-collage that eats the viewport
 */
export function HomeHero({ stats, cities }: Props) {
  const collage = [
    DEMO_CASES[1],
    DEMO_CASES[0],
    DEMO_CASES[3],
  ].filter((d): d is NonNullable<typeof d> => Boolean(d));

  return (
    <section className="bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-14">
        <p className="font-eyebrow">Планировщик ремонта</p>
        <h1 className="font-editorial mt-4 max-w-3xl text-3xl text-[var(--color-text)] sm:text-4xl lg:text-[2.75rem]">
          Найдите мастера для ремонта в вашем городе.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)]">
          Реальные ремонты с фото и ценами, AI-визуализация интерьера,
          калькулятор по фактическим сделкам и подбор проверенных мастеров.
          Без агрегаторов, без авансов, по договору.
        </p>

        {/* Search form — primary action of the page */}
        <form
          action="/mastera"
          method="GET"
          className="mt-7 grid grid-cols-1 gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-cozy sm:grid-cols-[1fr_1fr_auto] sm:gap-2"
        >
          <SearchSelect
            name="room"
            ariaLabel="Что ремонтируем"
            placeholder="Что ремонтируем"
            options={ROOM_CATEGORIES.map((r) => ({ value: r.slug, label: r.label }))}
          />
          <SearchSelect
            name="city"
            ariaLabel="Город"
            placeholder="Любой город"
            options={cities.slice(0, 60).map((c) => ({ value: c.slug, label: c.name }))}
          />
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-7 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            Найти мастера
          </button>
        </form>

        {/* Live platform stats — inline credibility row */}
        <p className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-[var(--color-muted)]">
          <StatItem value={formatCount(Math.max(stats.publishedMasters, 0))} label="проверенных мастеров" />
          <StatItem value={formatCount(stats.citiesCount)} label="городов" />
          <StatItem value={formatCount(stats.publishedCases)} label="работ в каталоге" />
          {stats.completedOrders > 0 ? (
            <StatItem value={formatCount(stats.completedOrders)} label="ремонтов завершено" />
          ) : null}
        </p>

        {/* Quick category chips */}
        <div className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
            Популярные направления
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {QUICK_PICKS.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Visual banner — 3 photos in a tight strip under the hero
          (not eating the viewport like the previous magazine collage). */}
      <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
        <div className="grid h-44 grid-cols-3 gap-2 sm:h-56 sm:gap-3">
          {collage.map((data, idx) => (
            <CollageTile key={`${data.imageUrl}-${idx}`} data={data} />
          ))}
        </div>
      </div>
    </section>
  );
}

const QUICK_PICKS: { label: string; href: string }[] = [
  { label: "Ванная под ключ", href: "/mastera?room=vannaya" },
  { label: "Кухня", href: "/mastera?room=kuhnya" },
  { label: "Квартира под ключ", href: "/mastera?service=kompleksnyy-remont" },
  { label: "Электрика", href: "/mastera?service=elektrika" },
  { label: "Сантехника", href: "/mastera?service=santehnika" },
  { label: "Плиточные работы", href: "/mastera?service=plitochnye-raboty" },
  { label: "Натяжные потолки", href: "/mastera?service=natyazhnye-potolki" },
  { label: "Поклейка обоев", href: "/mastera?service=poklejka-oboev" },
  { label: "Демонтаж", href: "/mastera?service=demontazh" },
  { label: "Малярные работы", href: "/mastera?service=malyarnye-raboty" },
  { label: "Балкон / лоджия", href: "/mastera?room=balkon" },
  { label: "Ремонт офисов", href: "/uslugi" },
];

// ── Subcomponents ──────────────────────────────────────────────────────────

function SearchSelect({
  name,
  ariaLabel,
  placeholder,
  options,
}: {
  name: string;
  ariaLabel: string;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      name={name}
      aria-label={ariaLabel}
      defaultValue=""
      className="h-12 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
    >
      <option value="">{placeholder}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-base font-bold text-[var(--color-text)]">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function CollageTile({ data }: { data: (typeof DEMO_CASES)[number] }) {
  return (
    <Link
      href="/raboty"
      className="group relative overflow-hidden rounded-lg bg-[var(--color-border)]"
    >
      <img
        src={data.imageUrl}
        alt={data.alt}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />
      <span className="absolute bottom-2.5 left-2.5 inline-flex rounded bg-[var(--color-surface)]/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text)]">
        {data.category}
      </span>
    </Link>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}K+`;
  }
  return new Intl.NumberFormat("ru-RU").format(n);
}
