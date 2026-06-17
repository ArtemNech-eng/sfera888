import Link from "next/link";
import type { RabotyListItem } from "../../lib/types";
import { DEMO_CASES, type DemoCase } from "../../lib/demoCases";

interface Props {
  cases: RabotyListItem[];
}

/**
 * Scandi-warm cases rail (plan §21 scandi iteration).
 *
 * - When ≥3 real cases are published → renders them with full data.
 * - When fewer than 3 → falls back to Unsplash CC0 stylistic references.
 *
 * Cards use rounded-xl photos with soft warm shadows. Sits on cream-deep
 * accent for natural separation from the white surface above.
 */
export function HomeRecentCases({ cases }: Props) {
  const isDemoMode = cases.length < 3;
  const realVisible = cases.slice(0, 6);

  const items: Array<RealCaseItem | DemoCaseItem> = isDemoMode
    ? DEMO_CASES.slice(0, 6).map((d) => ({ kind: "demo", data: d }))
    : realVisible.map((r) => ({ kind: "real", data: r }));

  if (items.length === 0) return null;

  return (
    <section className="bg-[var(--color-cream-deep)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-eyebrow">{isDemoMode ? "Идеи" : "Реальные ремонты"}</p>
            <h2 className="font-editorial mt-4 text-3xl text-[var(--color-text)] sm:text-4xl">
              {isDemoMode
                ? "Идеи для вашего ремонта."
                : "Ремонты с фото, ценами и сроками."}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--color-muted)]">
              {isDemoMode
                ? "Стилевые референсы — пока мастера наполняют каталог собственными работами."
                : "Каждая работа — фото до и после, бюджет, длительность. Понравился проект — оставьте заявку, подберём мастера, который сделает похоже."}
            </p>
          </div>
          <Link
            href="/raboty"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4 transition hover:decoration-[var(--color-text)] sm:inline"
          >
            {isDemoMode ? "К каталогу работ →" : "Все работы →"}
          </Link>
        </div>

        <ul className="mt-10 grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
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

        <div className="mt-8 sm:hidden">
          <Link
            href="/raboty"
            className="text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4"
          >
            {isDemoMode ? "К каталогу работ →" : "Все работы →"}
          </Link>
        </div>
      </div>
    </section>
  );
}

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
      className="group block"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--color-border)] shadow-cozy transition group-hover:shadow-cozy-md">
        {cover ? (
          <img
            src={cover}
            alt={`${data.title}${cityPart} — фото работы`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-muted)]">
            Без фото
          </div>
        )}

        {data.isFeatured ? (
          <span className="absolute left-3 top-3 inline-flex items-center rounded bg-[var(--color-primary)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
            Топ
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2 px-1">
        <h3 className="font-editorial text-xl text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-2xl">
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

        <div className="flex items-end justify-between gap-3 pt-1">
          {priceFrom != null ? (
            <p className="text-sm">
              <span className="text-[var(--color-faint)]">от </span>
              <span className="font-semibold text-[var(--color-text)]">
                {formatPrice(priceFrom)} ₽
              </span>
            </p>
          ) : <span />}
          <div className="text-right text-xs text-[var(--color-muted)]">
            <div className="line-clamp-1">{masterName}</div>
            {data.master.publicRating ? (
              <div className="text-[var(--color-text)]">
                <span aria-hidden className="text-[var(--color-primary)]">★ </span>
                <span className="font-semibold">{parseFloat(data.master.publicRating).toFixed(1)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

function DemoCaseCard({ data }: { data: DemoCase }) {
  return (
    <Link
      href="/raboty"
      className="group block"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--color-border)] shadow-cozy transition group-hover:shadow-cozy-md">
        <img
          src={data.imageUrl}
          alt={data.alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <span className="absolute left-3 top-3 inline-flex items-center rounded bg-[var(--color-surface)]/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
          Пример
        </span>
      </div>

      <div className="mt-4 space-y-2 px-1">
        <p className="font-eyebrow text-[var(--color-primary)]">{data.category}</p>
        <h3 className="font-editorial text-xl text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-2xl">
          {data.title}
        </h3>
        <p className="text-xs text-[var(--color-muted)]">
          Стилевой референс — найдите мастера, который реализует похоже.
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
