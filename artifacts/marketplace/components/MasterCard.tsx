import Link from "next/link";
import type { Master } from "../lib/types";
import { buildMasterAvatarAlt } from "../lib/seoMeta";

/**
 * Editorial master card (plan §21).
 *
 * Used on `/mastera` catalog and on service-city pages. Replaces the previous
 * rounded-2xl card with hairline-bordered byline-style row: square avatar,
 * serif name, comma-separated meta line, hairline divider, plain spec list.
 * The whole row is a Link for one-tap navigation on mobile.
 *
 * Server component, zero JS.
 */
export function MasterCard({ master }: { master: Master }) {
  if (!master.slug) return null;

  const displayName = pickDisplayName(master);
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "М";

  const rating = formatRating(master.publicRating ?? master.rating);
  const reviewsCount = master.publicReviewsCount;
  const minPrice = pickMinPrice(master.servicePrices ?? []);
  const visibleSpecs = (master.specializations ?? []).slice(0, 3);

  return (
    <Link
      href={`/master/${master.slug}`}
      className="group block border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-text)]"
    >
      <div className="flex items-start gap-4 p-5">
        {master.avatarUrl ? (
          <img
            src={master.avatarUrl}
            alt={buildMasterAvatarAlt(master)}
            loading="lazy"
            className="h-16 w-16 flex-none object-cover sm:h-20 sm:w-20"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-16 w-16 flex-none items-center justify-center bg-[var(--color-text)] text-base font-semibold text-white sm:h-20 sm:w-20 sm:text-lg"
          >
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="font-editorial truncate text-lg leading-snug text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-xl">
            {displayName}
          </h3>

          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted)]">
            {master.city ? <span>{master.city}</span> : null}
            {master.yearsExperience != null && master.yearsExperience > 0 ? (
              <>
                {master.city ? <span aria-hidden>·</span> : null}
                <span>опыт {master.yearsExperience} {pluralYears(master.yearsExperience)}</span>
              </>
            ) : null}
          </p>

          {rating || reviewsCount > 0 ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs">
              {rating ? (
                <span className="inline-flex items-baseline gap-1 text-[var(--color-text)]">
                  <span aria-hidden className="text-[var(--color-primary)]">★</span>
                  <span className="font-semibold">{rating}</span>
                </span>
              ) : null}
              {reviewsCount > 0 ? (
                <span className="text-[var(--color-muted)]">
                  {rating ? " · " : ""}{reviewsCount} {pluralReviews(reviewsCount)}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {minPrice != null ? (
          <div className="ml-2 flex-none text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-faint)]">от</p>
            <p className="mt-0.5 whitespace-nowrap text-sm font-semibold text-[var(--color-text)]">
              {formatNumber(minPrice)} ₽
            </p>
          </div>
        ) : null}
      </div>

      {visibleSpecs.length > 0 ? (
        <p className="border-t border-[var(--color-border)] px-5 py-3 text-xs text-[var(--color-muted)]">
          {visibleSpecs.join(" · ")}
        </p>
      ) : null}
    </Link>
  );
}

function pickDisplayName(m: Master): string {
  if (m.publicTitle && m.publicTitle.trim().length > 0) return m.publicTitle.trim();
  if (m.alias && m.alias.trim().length > 0) return m.alias.trim();
  return `Мастер #${m.id}`;
}

function pickMinPrice(prices: { service: string; priceFrom: number }[]): number | null {
  if (!prices.length) return null;
  const valid = prices
    .map((p) => (typeof p.priceFrom === "number" && p.priceFrom > 0 ? p.priceFrom : null))
    .filter((n): n is number => n != null);
  return valid.length > 0 ? Math.min(...valid) : null;
}

function formatRating(value: string | null): string | null {
  if (!value) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(1);
}

function formatNumber(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function pluralYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "лет";
  if (mod10 === 1) return "год";
  if (mod10 >= 2 && mod10 <= 4) return "года";
  return "лет";
}

function pluralReviews(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "отзывов";
  if (mod10 === 1) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4) return "отзыва";
  return "отзывов";
}
