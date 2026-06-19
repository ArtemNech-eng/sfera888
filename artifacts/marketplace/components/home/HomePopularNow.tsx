import Link from "next/link";

/**
 * «Популярное сейчас» — filter-pills блок (home-magazine-redesign).
 *
 * Pinterest-style discovery rail: маленькие pills с горящим эмодзи ведут
 * в `/raboty` с уже применённым фильтром. Это и filter-discovery (юзер не
 * ищет, а «выбирает из готового»), и SEO-якоря для long-tail запросов.
 *
 * В этой итерации — 8 хардкодом. Дальше — autoсегменты по тренду из
 * Метрики (отдельный спек, plan §22.4 п.5).
 */

interface Pill {
  label: string;
  href: string;
  emoji: string;
}

const PILLS: Pill[] = [
  { label: "Ванные до 200К", href: "/raboty?room=vannaya&maxPrice=200000", emoji: "🛁" },
  { label: "Кухни в новостройках", href: "/raboty?room=kuhnya&housingType=novostroyka", emoji: "🍳" },
  { label: "Санузлы 4-6 м²", href: "/raboty?room=vannaya&minArea=4&maxArea=6", emoji: "🚿" },
  { label: "Лофт", href: "/raboty?style=loft", emoji: "🧱" },
  { label: "Скандинавский", href: "/raboty?style=skandinavskiy", emoji: "🌿" },
  { label: "Минимализм", href: "/raboty?style=minimalizm", emoji: "⚪" },
  { label: "Тёмная палитра", href: "/raboty?palette=dark", emoji: "🖤" },
  { label: "Квартиры до 1 млн", href: "/raboty?room=kvartira&maxPrice=1000000", emoji: "🏠" },
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
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] shadow-cozy transition hover:-translate-y-0.5 hover:border-[var(--color-text)] hover:shadow-cozy-md"
              >
                <span aria-hidden>{pill.emoji}</span>
                {pill.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
