import Link from "next/link";
import type { Master } from "../lib/types";

/**
 * Compact master card used in catalogs (`/mastera`) and on service-city
 * pages (`/[serviceSlug]/[citySlug]`). The whole card is a Link to the
 * master profile so click-through is single-tap on mobile.
 *
 * Server component — no client JS needed; click is just a navigation.
 */
export function MasterCard({ master }: { master: Master }) {
  if (!master.slug) return null; // safety: published master must have slug

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
      className="group block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-primary)] hover:shadow-md"
    >
      <div className="flex items-start gap-3 p-4">
        {master.avatarUrl ? (
          <img
            src={master.avatarUrl}
            alt={displayName}
            loading="lazy"
            className="h-16 w-16 flex-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-primary)] text-lg font-semibold text-white"
          >
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
            {displayName}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted)]">
            {master.city ? <span>{master.city}</span> : null}
            {master.yearsExperience != null && master.yearsExperience > 0 ? (
              <>
                {master.city ? <span aria-hidden>·</span> : null}
                <span>опыт {master.yearsExperience} {pluralYears(master.yearsExperience)}</span>
              </>
            ) : null}
          </div>
          {(rating || reviewsCount > 0) ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              {rating ? (
                <span className="inline-flex items-center gap-0.5 font-medium text-[var(--color-text)]">
                  <span aria-hidden>★</span>
                  <span>{rating}</span>
                </span>
              ) : null}
              {reviewsCount > 0 ? (
                <span className="text-[var(--color-muted)]">· {reviewsCount} {pluralReviews(reviewsCount)}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {minPrice != null ? (
          <div className="ml-2 flex-none text-right">
            <div className="text-xs text-[var(--color-muted)]">от</div>
            <div className="text-sm font-semibold text-[var(--color-text)] whitespace-nowrap">
              {formatNumber(minPrice)} ₽
            </div>
          </div>
        ) : null}
      </div>
      {visibleSpecs.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5">
          {visibleSpecs.map((s) => (
            <li
              key={s}
              className="rounded-full bg-[var(--color-surface)] px-2.5 py-0.5 text-[11px] text-[var(--color-muted)]"
            >
              {s}
            </li>
          ))}
        </ul>
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
