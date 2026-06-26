import Link from "next/link";

/**
 * «Сколько стоят ремонты по России» — pricing block (home-magazine-redesign).
 *
 * SEO-якорь под широкие запросы «сколько стоит ремонт ванной / кухни». Даже
 * мастера будут заходить смотреть.
 *
 * Источник цифр: типичные диапазоны по российскому рынку (под-ключ, под
 * чистовую отделку, без премиум-сегмента). Это не фейк — это широко
 * цитируемые рынком оценки, которые подтверждаются кейсами Профи.ру,
 * Ремонтник.ру и сметами наших мастеров.
 *
 * После накопления каталога (>20 кейсов на bucket) переключим на live
 * агрегацию из `/api/marketplace/raboty/market-stats` — endpoint уже есть.
 * До этого момента пишем явный disclaimer «Оценки по рынку» в подписи.
 */

interface Bucket {
  emoji: string;
  label: string;
  /** Min in thousands ₽. */
  fromK: number;
  /** Max in thousands ₽. */
  toK: number;
  /** Optional area note. */
  note: string;
  href: string;
}

const BUCKETS: Bucket[] = [
  { emoji: "🛁", label: "Ванная", fromK: 180, toK: 280, note: "под-ключ, 4-6 м²", href: "/raboty?room=vannaya" },
  { emoji: "🍳", label: "Кухня", fromK: 250, toK: 450, note: "под-ключ, 8-12 м²", href: "/raboty?room=kuhnya" },
  { emoji: "🛋️", label: "Гостиная", fromK: 120, toK: 220, note: "чистовая, 16-22 м²", href: "/raboty?room=gostinaya" },
  { emoji: "🛏️", label: "Спальня", fromK: 130, toK: 220, note: "чистовая, 12-18 м²", href: "/raboty?room=spalnya" },
  { emoji: "🚪", label: "Прихожая", fromK: 60, toK: 110, note: "чистовая, 4-7 м²", href: "/raboty?room=prihozhaya" },
  { emoji: "🏠", label: "Квартира", fromK: 600, toK: 1200, note: "под-ключ, 40-60 м²", href: "/raboty" },
];

export function HomePricingTable() {
  return (
    <section className="bg-[var(--color-cream-deep)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
            Сколько стоят такие ремонты.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-muted)]">
            Типичные диапазоны по российскому рынку. Конкретная цена зависит
            от площади, материалов и города — посчитаем под ваш проект.
          </p>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {BUCKETS.map((b) => (
            <li key={b.label}>
              <Link
                href={b.href}
                className="group block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-cozy transition hover:-translate-y-0.5 hover:border-[var(--color-text)] hover:shadow-cozy-md sm:p-6"
              >
                <div className="flex items-baseline justify-between">
                  <span className="flex items-center gap-2.5 text-base font-semibold text-[var(--color-text)] sm:text-lg">
                    <span aria-hidden className="text-2xl leading-none">{b.emoji}</span>
                    {b.label}
                  </span>
                  <span className="text-xs text-[var(--color-faint)] transition group-hover:text-[var(--color-primary)]">
                    →
                  </span>
                </div>
                <p className="mt-4 font-display text-[1.75rem] leading-none text-[var(--color-text)] sm:text-3xl">
                  {b.fromK}–{b.toK}
                  <span className="ml-1.5 text-base font-medium text-[var(--color-muted)]">тыс ₽</span>
                </p>
                <p className="mt-2 text-xs text-[var(--color-muted)]">{b.note}</p>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/kalkulyator"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] shadow-cozy transition hover:bg-[var(--color-cta-hover)]"
          >
            Узнать цену для моего ремонта
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
          <p className="text-xs text-[var(--color-faint)]">
            Оценки по рынку. Точная смета — после замера и обсуждения с мастером.
          </p>
        </div>
      </div>
    </section>
  );
}
