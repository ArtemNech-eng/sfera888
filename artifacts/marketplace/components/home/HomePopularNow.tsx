import Link from "next/link";

/**
 * «Популярное сейчас» — filter-pills блок (home-magazine-redesign).
 *
 * Pinterest-canonical text-only pills. Без эмодзи (cheap-tell), без иконок —
 * чистая типографика. Каждая pill ведёт в `/raboty` с уже применённым
 * фильтром: и filter-discovery, и SEO-якоря для long-tail запросов.
 *
 * В этой итерации — 8 хардкодом. Дальше — autoсегменты по тренду из
 * Метрики (отдельный спек).
 */

interface Pill {
  label: string;
  href: string;
}

const PILLS: Pill[] = [
  { label: "Ванные до 200К", href: "/raboty?room=vannaya&maxPrice=200000" },
  { label: "Кухни в новостройках", href: "/raboty?room=kuhnya&housingType=novostroyka" },
  { label: "Санузлы 4-6 м²", href: "/raboty?room=vannaya&minArea=4&maxArea=6" },
  { label: "Лофт", href: "/raboty?style=loft" },
  { label: "Скандинавский", href: "/raboty?style=skandinavskiy" },
  { label: "Минимализм", href: "/raboty?style=minimalizm" },
  { label: "Тёмная палитра", href: "/raboty?palette=dark" },
  { label: "Квартиры до 1 млн", href: "/raboty?room=kvartira&maxPrice=1000000" },
];

export function HomePopularNow() {
  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 sm:pb-16">
        <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
          Популярное сейчас.
        </h2>
        <ul className="mt-7 flex flex-wrap gap-2.5">
          {PILLS.map((pill) => (
            <li key={pill.label}>
              <Link
                href={pill.href}
                className="inline-flex h-11 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm font-medium text-[var(--color-text)] transition hover:-translate-y-0.5 hover:border-[var(--color-text)] hover:shadow-cozy"
              >
                {pill.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
