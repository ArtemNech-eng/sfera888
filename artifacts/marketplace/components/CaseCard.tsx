import Link from "next/link";

/**
 * Universal Pinterest-style case card (plan §22 — inspiration-first archetype).
 *
 * One source of truth used on the home rail, the /raboty catalog, and any
 * future room/style landings. Tone: 40 % Pinterest (vertical 4:5 photo, no
 * border, photo-first), 30 % Houzz (price + concrete numbers under photo),
 * 20 % Airbnb (clean type, generous gutters, reveal-on-hover CTA), 10 %
 * social network (visible "save" affordance).
 *
 * Click target is the entire tile → opens `/raboty/{slug}` where the real
 * "Хочу такой же" lead form lives. The bottom-right pill on the photo is
 * a visual affordance only — keeps Pinterest DNA without nesting <button>
 * inside <a>.
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
}: CaseCardProps) {
  const meta = metaParts.filter((p): p is string => Boolean(p && p.trim().length > 0)).join(" · ");
  const hasCounters =
    (typeof views === "number" && views > 0) ||
    (typeof saves === "number" && saves > 0);

  return (
    <Link href={href} className="group block focus:outline-none">
      {/* ── Photo ─────────────────────────────────────────── */}
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-[var(--color-cream-deep)]">
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
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-surface)]/95 text-[var(--color-faint)]"
            }`}
          >
            {badge.label}
          </span>
        ) : null}

        {/* Save affordance (top-right) — visual cue that the platform is
            collectible. Real wiring lands with §22.4 user_saves table. */}
        <span
          aria-hidden
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface)]/95 text-[var(--color-text)] opacity-0 shadow-cozy transition group-hover:opacity-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </span>

        {/* Hover-only "Хочу такой же" pill — keeps Pinterest CTA pattern.
            Real action happens on the detail page (lead form). */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-3 right-3 inline-flex translate-y-1 items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-cozy-md transition group-hover:translate-y-0 group-hover:opacity-100"
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
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[var(--color-text)] transition group-hover:text-[var(--color-primary)] sm:text-base">
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
                {typeof saves === "number" && saves > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    {formatStat(saves)}
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
