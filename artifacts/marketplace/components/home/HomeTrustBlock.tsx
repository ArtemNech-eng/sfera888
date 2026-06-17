import type { MarketplaceStats } from "../../lib/types";

interface Props {
  stats: MarketplaceStats;
}

/**
 * Full trust block (plan §20.2 [10]) — actual numbers from the database, not
 * marketing claims. Cards with a count of 0 hide so we don't show "0 ремонтов
 * завершено" while bootstrapping. avgRating shows only when ≥1 published
 * master has a non-zero rating.
 *
 * Companion to <HomeTrustStrip /> right under the hero — that strip carries
 * the qualitative reassurances (contract, no upfront, vetted), this block
 * carries the quantitative ones.
 *
 * Server component, no JS shipped.
 */
export function HomeTrustBlock({ stats }: Props) {
  const cards: TrustCard[] = [];

  if (stats.completedOrders > 0) {
    cards.push({
      value: formatCount(stats.completedOrders),
      label: pluralRu(stats.completedOrders, ["завершённый ремонт", "завершённых ремонта", "завершённых ремонтов"]),
      tint: "teal",
    });
  }

  if (stats.publishedCases > 0) {
    cards.push({
      value: formatCount(stats.publishedCases),
      label: pluralRu(stats.publishedCases, ["работа в каталоге", "работы в каталоге", "работ в каталоге"]),
      tint: "indigo",
    });
  }

  if (stats.publishedMasters > 0) {
    cards.push({
      value: formatCount(stats.publishedMasters),
      label: pluralRu(stats.publishedMasters, ["проверенный мастер", "проверенных мастера", "проверенных мастеров"]),
      tint: "amber",
    });
  }

  if (typeof stats.avgRating === "number" && stats.avgRating > 0) {
    cards.push({
      value: stats.avgRating.toFixed(1),
      label: "средняя оценка мастеров",
      tint: "teal",
      decoration: "stars",
    });
  }

  if (stats.citiesCount > 0) {
    cards.push({
      value: formatCount(stats.citiesCount),
      label: pluralRu(stats.citiesCount, ["город", "города", "городов"]),
      tint: "indigo",
    });
  }

  // While bootstrapping, the trust strip under the hero already provides
  // enough reassurance — don't render an empty section.
  if (cards.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Цифры платформы
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
          Реальные данные, не маркетинговые лозунги
        </h2>
        <p className="mt-3 text-base text-[var(--color-muted)]">
          Каждое число обновляется ежедневно из нашей базы заказов и работ.
        </p>
      </div>

      <ul
        className={`mx-auto mt-10 grid gap-3 sm:gap-4 ${
          cards.length <= 3 ? "max-w-3xl sm:grid-cols-3" : "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
        }`}
      >
        {cards.map((card, idx) => (
          <li
            key={idx}
            className="rounded-2xl border border-[var(--color-border)] bg-white p-5 text-center shadow-sm"
          >
            <p className={`text-3xl font-extrabold tracking-tight ${TINT_TEXT[card.tint]}`}>
              {card.decoration === "stars" ? <span aria-hidden className="mr-1.5">★</span> : null}
              {card.value}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)] sm:text-sm">{card.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface TrustCard {
  value: string;
  label: string;
  tint: "teal" | "indigo" | "amber";
  decoration?: "stars";
}

const TINT_TEXT: Record<TrustCard["tint"], string> = {
  teal: "text-[var(--color-primary)]",
  indigo: "text-[var(--color-secondary)]",
  amber: "text-[var(--color-accent-hover)]",
};

/** Russian plural forms: 1 → first, 2-4 → second, 0/5+/teen → third. */
function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** ru-RU thousands separator. 12_543 → "12 543". */
function formatCount(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}
