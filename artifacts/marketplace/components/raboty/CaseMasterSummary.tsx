import Link from "next/link";
import type { Master } from "../../lib/types";
import { buildMasterAvatarAlt } from "../../lib/seoMeta";

interface CaseMasterSummaryProps {
  master: Master;
  masterName: string;
  stats: {
    portfolioCount: number;
    completedOrders: number;
  };
}

/**
 * Strong master byline block (plan §22, Requirement 5).
 *
 * Shows: avatar + name, rating, city, plus a 4-stat row (portfolio,
 * completed orders, city, years on platform). Cells with zero data are
 * hidden — name + rating + city are mandatory.
 *
 * Server component, no JS.
 */
export function CaseMasterSummary({ master, masterName, stats }: CaseMasterSummaryProps) {
  const rating = formatRating(master.publicRating ?? master.rating);
  const reviewsCount = master.publicReviewsCount;
  const initials =
    masterName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "М";

  const cells: { icon: React.ReactNode; value: string; label: string }[] = [];

  if (stats.portfolioCount > 0) {
    cells.push({
      icon: <IconCamera />,
      value: String(stats.portfolioCount),
      label: pluralWorks(stats.portfolioCount),
    });
  }
  if (stats.completedOrders > 0) {
    cells.push({
      icon: <IconHome />,
      value: String(stats.completedOrders),
      label: `${pluralCompleted(stats.completedOrders)}`,
    });
  }
  if (master.city) {
    cells.push({ icon: <IconPin />, value: master.city, label: "" });
  }
  if (master.yearsExperience != null && master.yearsExperience > 0) {
    cells.push({
      icon: <IconClock />,
      value: String(master.yearsExperience),
      label: `${pluralYears(master.yearsExperience)} опыта`,
    });
  }

  return (
    <section className="bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="font-eyebrow">Автор работы</p>

        <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-7">
          {/* Top row: avatar + name + rating */}
          <div className="flex items-start gap-5">
            {master.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={master.avatarUrl}
                alt={buildMasterAvatarAlt(master)}
                className="h-20 w-20 flex-none rounded-full object-cover sm:h-24 sm:w-24"
              />
            ) : (
              <div
                aria-hidden
                className="flex h-20 w-20 flex-none items-center justify-center rounded-full bg-[var(--color-text)] text-xl font-bold text-white sm:h-24 sm:w-24 sm:text-2xl"
              >
                {initials}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h3 className="font-editorial truncate text-xl text-[var(--color-text)] sm:text-2xl">
                {masterName}
              </h3>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
                {rating ? (
                  <span className="inline-flex items-center gap-1 text-[var(--color-text)]">
                    <span aria-hidden className="text-[var(--color-primary)]">★</span>
                    <span className="font-semibold">{rating}</span>
                  </span>
                ) : null}
                {reviewsCount > 0 ? (
                  <span>{reviewsCount} {pluralReviews(reviewsCount)}</span>
                ) : null}
                {master.city ? <span>{master.city}</span> : null}
              </div>
            </div>

            <Link
              href={master.slug ? `/master/${master.slug}` : "/mastera"}
              className="hidden self-center rounded-full border border-[var(--color-text)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white sm:inline-flex"
            >
              Все работы →
            </Link>
          </div>

          {/* Stats grid */}
          {cells.length > 0 ? (
            <ul className="mt-6 grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-6 sm:grid-cols-4 sm:gap-4">
              {cells.map((cell, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span aria-hidden className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    {cell.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-[var(--color-text)] sm:text-lg">
                      {cell.value}
                    </p>
                    {cell.label ? (
                      <p className="text-xs text-[var(--color-muted)]">{cell.label}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Mobile CTA */}
          <Link
            href={master.slug ? `/master/${master.slug}` : "/mastera"}
            className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--color-text)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] sm:hidden"
          >
            Все работы мастера →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRating(value: string | null): string | null {
  if (!value) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(1);
}

function pluralReviews(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "отзывов";
  if (m10 === 1) return "отзыв";
  if (m10 >= 2 && m10 <= 4) return "отзыва";
  return "отзывов";
}

function pluralWorks(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "работ";
  if (m10 === 1) return "работа";
  if (m10 >= 2 && m10 <= 4) return "работы";
  return "работ";
}

function pluralCompleted(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "завершённых объектов";
  if (m10 === 1) return "завершённый объект";
  if (m10 >= 2 && m10 <= 4) return "завершённых объекта";
  return "завершённых объектов";
}

function pluralYears(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "лет";
  if (m10 === 1) return "год";
  if (m10 >= 2 && m10 <= 4) return "года";
  return "лет";
}

// ── Icons ──────────────────────────────────────────────────────────────────

function IconCamera() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5Z" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
