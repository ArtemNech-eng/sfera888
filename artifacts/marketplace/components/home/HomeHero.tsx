import Link from "next/link";
import { ROOM_CATEGORIES } from "../../lib/demoCases";
import type { City, MarketplaceStats } from "../../lib/types";

interface Props {
  stats: MarketplaceStats;
  cities: City[];
}

/**
 * Inspiration-platform hero (план §22.4).
 *
 * Базовый принцип: «Главный товар — РЕЗУЛЬТАТ РЕМОНТА». Hero — витрина, не
 * marketplace мастеров.
 *
 *   1. Heading: «Самая большая база реальных ремонтов в России»
 *   2. Subheading: «Найдите ремонт, который хотите повторить»
 *   3. Search-bar «Что хотите сделать?» — submit в /raboty
 *   4. Visual category chips (4 крупные cards-chip с фото) — Ванная, Кухня,
 *      Санузел, Квартира. Это deep-link в `/raboty?room=...`. Не select,
 *      а photo-cards чтобы тон был «витрина», а не «utility».
 *   5. Live stats: «N ремонтов в каталоге · M городов · K мастеров готовы повторить»
 *
 * Изменения относительно §21.9:
 *   • убран двойной select-фильтр в форме (только текст-поле)
 *   • убран hero-collage (его роль теперь у category chips)
 *   • убраны quick-pick chips (12 текстовых ссылок) — заменены на 4 photo-card
 */
export function HomeHero({ stats, cities: _cities }: Props) {
  // Топ-4 категории для visual chips: Ванная, Кухня, Санузел (=ванная-санузел),
  // Квартира (= общая навигация в /raboty без room-фильтра).
  const visualChips: Array<{ slug: string | null; label: string; imageUrl: string; alt: string }> = [
    {
      slug: "vannaya",
      label: "Ванная",
      imageUrl: ROOM_CATEGORIES.find((r) => r.slug === "vannaya")!.imageUrl,
      alt: "Идеи ремонта ванной",
    },
    {
      slug: "kuhnya",
      label: "Кухня",
      imageUrl: ROOM_CATEGORIES.find((r) => r.slug === "kuhnya")!.imageUrl,
      alt: "Идеи ремонта кухни",
    },
    {
      slug: "spalnya",
      label: "Спальня",
      imageUrl: ROOM_CATEGORIES.find((r) => r.slug === "spalnya")!.imageUrl,
      alt: "Идеи ремонта спальни",
    },
    {
      slug: null,
      label: "Квартира",
      imageUrl: ROOM_CATEGORIES.find((r) => r.slug === "gostinaya")!.imageUrl,
      alt: "Идеи ремонта квартиры под ключ",
    },
  ];

  return (
    <section className="bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pb-14 sm:pt-16">
        <p className="font-eyebrow">Каталог ремонтов</p>
        <h1 className="font-editorial mt-4 max-w-3xl text-3xl leading-tight text-[var(--color-text)] sm:text-4xl lg:text-[2.75rem]">
          Самая большая база реальных ремонтов в России.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
          Найдите ремонт, который хотите повторить. Сохраните в подборку, посмотрите
          бюджет и сроки. Когда определитесь — мастер сам напишет.
        </p>

        {/* Search-bar — single text field, submits to /raboty */}
        <form
          action="/raboty"
          method="GET"
          className="mt-7 flex max-w-2xl rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-cozy focus-within:border-[var(--color-primary)] focus-within:shadow-cozy-md"
        >
          <input
            type="text"
            name="q"
            aria-label="Что хотите сделать"
            placeholder="Что хотите сделать? Например, ванную в скандинавском стиле"
            className="h-11 min-w-0 flex-1 rounded-full bg-transparent px-4 text-sm text-[var(--color-text)] placeholder-[var(--color-faint)] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex h-11 flex-shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)] sm:px-7"
            aria-label="Смотреть идеи"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <span className="hidden sm:inline">Смотреть идеи</span>
          </button>
        </form>

        {/* Visual category chips — 4 крупные cards-chip, photo-led */}
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {visualChips.map((chip) => (
            <li key={chip.label}>
              <VisualChip chip={chip} />
            </li>
          ))}
        </ul>

        {/* Live stats — приземлённое доверие, не маркетинговое преувеличение */}
        <p className="mt-10 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-[var(--color-muted)]">
          <StatItem value={formatCount(stats.publishedCases)} label="ремонтов в каталоге" />
          <StatItem value={formatCount(stats.citiesCount)} label="городов" />
          <StatItem value={formatCount(Math.max(stats.publishedMasters, 0))} label="мастеров готовы повторить" />
          {stats.completedOrders > 0 ? (
            <StatItem value={formatCount(stats.completedOrders)} label="завершённых ремонтов" />
          ) : null}
        </p>
      </div>
    </section>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function VisualChip({
  chip,
}: {
  chip: { slug: string | null; label: string; imageUrl: string; alt: string };
}) {
  const href = chip.slug ? `/raboty?room=${chip.slug}` : "/raboty";
  return (
    <Link
      href={href}
      className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-[var(--color-border)] transition hover:shadow-cozy-md sm:aspect-[3/4]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={chip.imageUrl}
        alt={chip.alt}
        loading="eager"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 px-4 pb-4 text-base font-semibold text-white sm:text-lg">
        {chip.label}
      </span>
    </Link>
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

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}K+`;
  }
  return new Intl.NumberFormat("ru-RU").format(n);
}
