import Link from "next/link";
import type { RabotyListItem } from "../../lib/types";
import { DEMO_CASES, type DemoCase } from "../../lib/demoCases";

interface Props {
  cases: RabotyListItem[];
}

/**
 * "Идеи" / "Реальные ремонты" section on the homepage (plan §20.2 [3] [7]).
 *
 * - When ≥3 real cases are published → renders them with full data (price,
 *   area, master, rating). Title swaps to "Реальные ремонты с ценами".
 * - When fewer than 3 → falls back to Unsplash CC0 stylistic references
 *   (plan §20.4 photo policy, plan §20.3.10 graceful demo). Each demo card
 *   carries a "Пример" badge instead of price/master so we never imply a
 *   fake case. Title softens to "Идеи для ремонта".
 *
 * Both modes link to /raboty so the user lands on the real catalog.
 *
 * Server component, zero JS.
 */
export function HomeRecentCases({ cases }: Props) {
  const isDemoMode = cases.length < 3;
  const realVisible = cases.slice(0, 6);

  // While bootstrapping (no real cases yet) we show only demos. Once 3+
  // real cases exist, demos disappear entirely — at that point our own
  // content is enough to fill the rail.
  const items: Array<RealCaseItem | DemoCaseItem> = isDemoMode
    ? DEMO_CASES.slice(0, 6).map((d) => ({ kind: "demo", data: d }))
    : realVisible.map((r) => ({ kind: "real", data: r }));

  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
            Идеи
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
            {isDemoMode ? "Идеи для вашего ремонта" : "Реальные ремонты с ценами и сроками"}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)] sm:text-base">
            {isDemoMode
              ? "Стилевые референсы, которые помогут определиться с направлением. По мере появления реальных работ мастеров заменяем подборку их кейсами."
              : "Каждая работа — фото до и после, бюджет, длительность. Можно отправить заявку по понравившемуся проекту."}
          </p>
        </div>
        <Link
          href="/raboty"
          className="hidden text-sm font-semibold text-[var(--color-secondary)] hover:underline sm:inline"
        >
          {isDemoMode ? "К каталогу работ →" : "Все работы →"}
        </Link>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) =>
          item.kind === "real" ? (
            <li key={`r-${item.data.id}`}>
              <RealCaseCard data={item.data} />
            </li>
          ) : (
            <li key={`d-${item.data.id}`}>
              <DemoCaseCard data={item.data} />
            </li>
          ),
        )}
      </ul>

      <div className="mt-6 sm:hidden">
        <Link
          href="/raboty"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-secondary)]"
        >
          {isDemoMode ? "К каталогу работ →" : "Все работы →"}
        </Link>
      </div>
    </section>
  );
}

// ── Variants ─────────────────────────────────────────────────────────────────

interface RealCaseItem {
  kind: "real";
  data: RabotyListItem;
}
interface DemoCaseItem {
  kind: "demo";
  data: DemoCase;
}

function RealCaseCard({ data }: { data: RabotyListItem }) {
  if (!data.slug) return null;

  const cover = data.afterPhotos[0] ?? data.beforePhotos[0] ?? null;
  const priceFrom = parseNumeric(data.priceFrom);
  const area = parseNumeric(data.area);
  const masterName = data.master.publicTitle?.trim() || data.master.alias?.trim() || `Мастер #${data.master.id}`;
  const cityPart = data.city?.name ? ` в ${data.city.name}` : "";

  return (
    <Link
      href={`/raboty/${data.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white transition hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--color-secondary)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-background)]">
        {cover ? (
          <img
            src={cover}
            alt={`${data.title}${cityPart} — фото работы`}
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

/**
 * Demo card. Visually similar to a real case so the rail looks consistent,
 * but **never** renders a price or master attribution. The "Пример" badge
 * sits where the "Топ" badge would, so a glance is enough to know it's a
 * placeholder.
 */
function DemoCaseCard({ data }: { data: DemoCase }) {
  return (
    <Link
      href="/raboty"
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white transition hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--color-secondary)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-background)]">
        <img
          src={data.imageUrl}
          alt={data.alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] shadow-sm ring-1 ring-[var(--color-border)]">
          Пример
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
          {data.category}
        </span>
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-secondary)]">
          {data.title}
        </h3>
        <p className="mt-auto pt-1 text-xs text-[var(--color-muted)]">
          Стилевой референс. Найдите мастера, который реализует похожий проект →
        </p>
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
