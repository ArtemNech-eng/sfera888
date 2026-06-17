import Link from "next/link";
import type { Master } from "../../lib/types";
import { MasterCard } from "../MasterCard";

interface Props {
  masters: Master[];
}

/**
 * "Топ-мастера" section on the homepage (plan §20.2 [8]).
 *
 * In V1.5 we don't yet detect the user's city — we just take the top 4
 * published masters globally, sorted by the same default order used in the
 * /mastera catalog (rating, then created_at). When geo-detection ships
 * (plan §11.10.3) we'll thread `citySlug` through and re-title the section.
 *
 * Section is hidden when there are fewer than 3 masters; the trust block
 * already implies "we have masters" via `publishedMasters > 0`, so an empty
 * grid would feel inconsistent.
 */
export function HomeTopMasters({ masters }: Props) {
  if (masters.length < 3) return null;

  // Cap at 4 — homepage block, not catalog. Catalog is one click away.
  const visible = masters.slice(0, 4);

  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Подбор
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
              Лучшие мастера на платформе
            </h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)] sm:text-base">
              Каждый прошёл собеседование, стажировку и работает по договору.
            </p>
          </div>
          <Link
            href="/mastera"
            className="hidden text-sm font-semibold text-[var(--color-primary)] hover:underline sm:inline"
          >
            Все мастера →
          </Link>
        </div>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {visible.map((master) => (
            <li key={master.id}>
              <MasterCard master={master} />
            </li>
          ))}
        </ul>

        <div className="mt-6 sm:hidden">
          <Link
            href="/mastera"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)]"
          >
            Все мастера →
          </Link>
        </div>
      </div>
    </section>
  );
}
