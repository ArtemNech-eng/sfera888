import Link from "next/link";
import type { RabotyListItem } from "../../lib/types";

interface Props {
  cases: RabotyListItem[];
}

/**
 * "Реальные ремонты" section on the homepage (plan §20.2 [7]).
 *
 * Mirrors the case-card style used on /raboty but compacted for an above-
 * the-fold rail: only cover photo + title + price + master ref. Up to 6
 * cards, hidden when fewer than 3 published cases exist (anti-thin-content
 * per plan §20.3.10).
 *
 * Server component, zero JS.
 */
export function HomeRecentCases({ cases }: Props) {
  if (cases.length < 3) return null;

  const visible = cases.slice(0, 6);

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
            Идеи
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
            Реальные ремонты с ценами и сроками
          </h2>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)] sm:text-base">
            Каждая работа — фото до и после, бюджет, длительность. Можно отправить заявку по понравившемуся проекту.
          </p>
        </div>
        <Link
          href="/raboty"
          className="hidden text-sm font-semibold text-[var(--color-secondary)] hover:underline sm:inline"
        >
          Все работы →
        </Link>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => (
          <li key={c.id}>
            <RecentCaseCard data={c} />
          </li>
        ))}
      </ul>

      <div className="mt-6 sm:hidden">
        <Link
          href="/raboty"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-secondary)]"
        >
          Все работы →
        </Link>
      </div>
    </section>
  );
}

function RecentCaseCard({ data }: { data: RabotyListItem }) {
  if (!data.slug) return null;

  const cover = data.afterPhotos[0] ?? data.beforePhotos[0] ?? null;
  const priceFrom = parseNumeric(data.priceFrom);
  const area = parseNumeric(data.area);
  const masterName = data.master.publicTitle?.trim() || data.master.alias?.trim() || `Мастер #${data.master.id}`;

  return (
    <Link
      href={`/raboty/${data.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white transition hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--color-secondary)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-background)]">
        {cover ? (
          <img
            src={cover}
            alt={buildAlt(data)}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-muted)]">
            Без фото
          </div>
        )}

        {data.isFeatured ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="m12 2 3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
            </svg>
            Топ
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-secondary)]">
          {data.title}
        </h3>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
          {data.service?.name ? <span>{data.service.name}</span> : null}
          {data.city?.name ? (
            <>
              <span aria-hidden>·</span>
              <span>{data.city.name}</span>
            </>
          ) : null}
          {area != null ? (
            <>
              <span aria-hidden>·</span>
              <span>{area} м²</span>
            </>
          ) : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          {priceFrom != null ? (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                от
              </div>
              <div className="text-base font-bold text-[var(--color-text)]">
                {formatPrice(priceFrom)} ₽
              </div>
            </div>
          ) : <span />}
          <div className="text-right text-xs text-[var(--color-muted)]">
            <div className="line-clamp-1">{masterName}</div>
            {data.master.publicRating ? (
              <div className="text-[var(--color-text)]">★ {parseFloat(data.master.publicRating).toFixed(1)}</div>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatPrice(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function buildAlt(c: RabotyListItem): string {
  const cityPart = c.city?.name ? ` в ${c.city.name}` : "";
  return `${c.title}${cityPart} — фото работы`;
}
