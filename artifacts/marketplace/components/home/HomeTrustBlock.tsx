import type { MarketplaceStats } from "../../lib/types";

interface Props {
  stats: MarketplaceStats;
}

/**
 * Editorial numbers section (plan §20.2 [10], §21 visual direction).
 *
 * Displays live database stats as oversized serif figures with a thin label
 * underneath — magazine layout, not dashboard cards. Each number animates
 * in via CSS gradient on the strip behind it, but is otherwise unchromed.
 *
 * Cards with zero hide so we don't show "0 ремонтов завершено" while
 * bootstrapping. avgRating shows only when ≥1 master has a non-zero score.
 */
export function HomeTrustBlock({ stats }: Props) {
  const cards: TrustCard[] = [];

  if (stats.completedOrders > 0) {
    cards.push({
      value: formatCount(stats.completedOrders),
      label: pluralRu(stats.completedOrders, ["завершённый ремонт", "завершённых ремонта", "завершённых ремонтов"]),
    });
  }

  if (stats.publishedCases > 0) {
    cards.push({
      value: formatCount(stats.publishedCases),
      label: pluralRu(stats.publishedCases, ["работа в каталоге", "работы в каталоге", "работ в каталоге"]),
    });
  }

  if (stats.publishedMasters > 0) {
    cards.push({
      value: formatCount(stats.publishedMasters),
      label: pluralRu(stats.publishedMasters, ["проверенный мастер", "проверенных мастера", "проверенных мастеров"]),
    });
  }

  if (typeof stats.avgRating === "number" && stats.avgRating > 0) {
    cards.push({
      value: stats.avgRating.toFixed(1),
      label: "средняя оценка мастеров",
      decoration: "stars",
    });
  }

  if (stats.citiesCount > 0) {
    cards.push({
      value: formatCount(stats.citiesCount),
      label: pluralRu(stats.citiesCount, ["город", "города", "городов"]),
    });
  }

  if (cards.length === 0) return null;

  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="max-w-2xl">
          <p className="font-eyebrow">Цифры платформы</p>
          <h2 className="font-editorial mt-4 text-4xl text-[var(--color-text)] sm:text-5xl">
            Каждое число — из живой базы заказов.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--color-muted)]">
            Не маркетинговые лозунги. Реальные мастера, реальные сделки,
            обновляется каждые сутки.
          </p>
        </div>

        <ul
          className={`mt-16 grid divide-y divide-[var(--color-border)] sm:divide-y-0 ${
            cards.length <= 3
              ? "sm:grid-cols-3 sm:divide-x"
              : "sm:grid-cols-2 sm:divide-x lg:grid-cols-5"
          }`}
        >
          {cards.map((card, idx) => (
            <li key={idx} className="px-2 py-8 sm:px-6 sm:py-10">
              <p className="font-editorial text-5xl text-[var(--color-text)] sm:text-6xl">
                {card.decoration === "stars" ? (
                  <span aria-hidden className="mr-2 text-[var(--color-primary)]">★</span>
                ) : null}
                {card.value}
              </p>
              <p className="mt-3 max-w-[18ch] text-sm leading-snug text-[var(--color-muted)]">
                {card.label}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

interface TrustCard {
  value: string;
  label: string;
  decoration?: "stars";
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}
