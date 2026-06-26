import Link from "next/link";

/**
 * Universal magazine-style case card (home-magazine-redesign).
 *
 * One source of truth used on the home rails, the /raboty catalog, and any
 * future room/style landings. Tone: 50% Pinterest (vertical photo, no
 * border, photo-first), 30% Houzz (price + concrete numbers under photo),
 * 20% Airbnb (clean type, generous gutters, reveal-on-hover CTA).
 *
 * Click target is the entire tile → opens `/raboty/{slug}` where the real
 * "Хочу такой же" lead form lives. The bottom-right pill on the photo is
 * a visual affordance only — keeps Pinterest CTA pattern without nesting
 * <button> inside <a>.
 *
 * `aspectVariant` lets the parent choose 4:5 portrait, 4:3 landscape, or
 * 1:1 square per tile to break monotony in masonry-feel grids. Default is
 * 4:5 portrait (Pinterest-canonical).
 *
 * Engagement counters (views, saves) come from the api-server (plan §22.4
 * `portfolio_items.view_count` / `save_count`). When the columns are absent
 * we render the card without the counter strip — no fake numbers.
 */
export interface CaseCardProps {
  href: string;
  cover: string | null;
  title: string;
  /** Joined with " · ". Falsy parts are skipped. */
  metaParts: (string | null | undefined)[];
  /** Pre-formatted price string (e.g. "от 275 000 ₽"). null hides the column. */
  priceLabel?: string | null;
  /** Backend-provided counters. null hides the badge. */
  views?: number | null;
  saves?: number | null;
  badge?: { tone: "featured" | "demo"; label: string } | null;
  /** Image alt for SEO + accessibility. */
  alt: string;
  /** Photo aspect ratio. Default `4:5` matches Pinterest portrait DNA. */
  aspectVariant?: "4:5" | "4:3" | "1:1";
}

export function CaseCard({
  href,
  cover,
  title,
  metaParts,
  priceLabel,
  views,
  saves,
  badge,
  alt,
  aspectVariant = "4:5",
}: CaseCardProps) {
  const meta = metaParts.filter((p): p is string => Boolean(p && p.trim().length > 0)).join(" · ");
  // saves is rendered as a top-right badge on the photo (always-visible);
  // bottom row only shows views when we have them.
  const hasCounters = typeof views === "number" && views > 0;

  const aspectClass =
    aspectVariant === "4:3"
      ? "aspect-[4/3]"
      : aspectVariant === "1:1"
        ? "aspect-square"
        : "aspect-[4/5]";

  return (
    <Link href={href} className="group block focus:outline-none">
      {/* ── Photo ─────────────────────────────────────────── */}
      <div className={`relative ${aspectClass} w-full overflow-hidden rounded-2xl bg-[var(--color-cream-deep)]`}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={alt}
            loading="lazy"
            className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-faint)]">
            Без фото
          </div>
        )}

        {badge ? (
          <span
            className={`absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
              badge.tone === "featured"
                ? "bg-[var(--color-cta)] text-[var(--color-on-cta)]"
                : "bg-[var(--color-surface)]/95 text-[var(--color-faint)]"
            }`}
          >
            {badge.label}
          </span>
        ) : null}

        {/* Save count badge (top-right) — passive display, always visible when count > 0.
            Real toggle interactivity lives on the case detail page (CasePrimaryCTA);
            on the list, the whole card is a Link, so we don't compete with navigation. */}
        {typeof saves === "number" && saves > 0 ? (
          <span
            aria-label={`${saves} сохранений`}
            className="absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--color-surface)]/95 px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] shadow-cozy"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {formatStat(saves)}
          </span>
        ) : null}

        {/* Hover-only "Хочу такой же" pill — keeps Pinterest CTA pattern.
            Real action happens on the detail page (lead form). */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 right-3 inline-flex translate-y-1 items-center gap-1.5 rounded-full bg-[var(--color-cta)] px-4 py-2 text-xs font-semibold text-[var(--color-on-cta)] opacity-0 shadow-cozy-md transition group-hover:translate-y-0 group-hover:opacity-100"
        >
          Хочу такой же
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="mt-3 px-1">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--color-text)] transition group-hover:text-[var(--color-primary)] sm:text-base">
          {title}
        </h3>
        {meta ? (
          <p className="mt-1 truncate text-xs text-[var(--color-muted)]">{meta}</p>
        ) : null}
        {priceLabel || hasCounters ? (
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
            {priceLabel ? (
              <span className="font-semibold text-[var(--color-text)]">{priceLabel}</span>
            ) : (
              <span />
            )}
            {hasCounters ? (
              <span className="flex items-center gap-2.5 text-[var(--color-faint)]">
                {typeof views === "number" && views > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {formatStat(views)}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function formatStat(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}K`;
  }
  return new Intl.NumberFormat("ru-RU").format(n);
}
