import Link from "next/link";
import type { Metadata } from "next";
import { fetchRabotyList } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import { buildRabotyIndexMeta } from "../../lib/seoMeta";
import type { RabotyListItem } from "../../lib/types";
import { ROOM_CATEGORIES, DEMO_CASES } from "../../lib/demoCases";

/**
 * `/raboty` — inspiration catalog of finished renovations
 * (plan §11.7, §21.9 funnel correction).
 *
 * The heart of the project: people come here to **browse for ideas**, not to
 * pick a contractor. So this page intentionally is NOT styled like
 * /mastera or /uslugi (utility catalogs with filters and sort first). It
 * stays photo-led, large-card, "gallery of inspiration":
 *
 *   • compact header with eyebrow + headline, no functional bar
 *   • horizontal "browse by room / style" chip rail above the grid
 *   • large photo cards, minimal meta beneath (title, master, price)
 *   • subtle result count + sort link, not a primary control
 *
 * Funnel: visitor browses → opens a case at /raboty/[slug] → reads the
 * story → either keeps browsing or hits "Хочу такую же" lead form.
 */

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

const STYLE_CHIPS: { slug: string; label: string }[] = [
  { slug: "sovremennyy", label: "Современный" },
  { slug: "skandinavskiy", label: "Скандинавский" },
  { slug: "loft", label: "Лофт" },
  { slug: "minimalizm", label: "Минимализм" },
  { slug: "neoklassika", label: "Неоклассика" },
  { slug: "svetlyy", label: "Светлый" },
];

interface SearchParams {
  page?: string;
  room?: string;
  style?: string;
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<SearchParams> },
): Promise<Metadata> {
  const sp = await searchParams;
  const pageRaw = parseInt(String(sp.page ?? "1"), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const data = await fetchRabotyList({ page, limit: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / data.limit));
  const meta = buildRabotyIndexMeta({ total: data.total ?? 0, page, totalPages });

  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: {
      canonical: page > 1 ? `${publicUrl()}/raboty?page=${page}` : `${publicUrl()}/raboty`,
    },
  };
}

export default async function RabotyIndexPage(
  { searchParams }: { searchParams: Promise<SearchParams> },
) {
  const sp = await searchParams;
  const pageRaw = parseInt(String(sp.page ?? "1"), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  // Active browse-by selection. Backend filtering by room/style is not yet
  // wired in fetchRabotyList — for now we surface the param visually and
  // pass it through pagination links so the URL is a stable share-link.
  const activeRoom = typeof sp.room === "string" ? sp.room : null;
  const activeStyle = typeof sp.style === "string" ? sp.style : null;

  const data = await fetchRabotyList({ page, limit: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / data.limit));
  const isDemoMode = data.items.length < 3 && page === 1;

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Идеи", url: `${publicUrl()}/raboty` },
  ]);

  // Build pagination URL preserving room/style params.
  const paginationUrl = (p: number) => {
    const params = new URLSearchParams();
    if (activeRoom) params.set("room", activeRoom);
    if (activeStyle) params.set("style", activeStyle);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/raboty${qs ? `?${qs}` : ""}`;
  };
  const browseUrl = (params: { room?: string | null; style?: string | null }) => {
    const sp = new URLSearchParams();
    const r = params.room === undefined ? activeRoom : params.room;
    const s = params.style === undefined ? activeStyle : params.style;
    if (r) sp.set("room", r);
    if (s) sp.set("style", s);
    const qs = sp.toString();
    return `/raboty${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />

      {/* ── Compact inspiration header ──────────────────────────── */}
      <header className="bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Идеи</span>
          </nav>

          <p className="font-eyebrow mt-7">Каталог идей</p>
          <h1 className="font-editorial mt-3 max-w-3xl text-3xl text-[var(--color-text)] sm:text-4xl">
            Реальные ремонты с фото и ценами.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--color-muted)]">
            Сохраняйте кейсы, что зацепили. Подбор мастера, который повторит — на странице каждой работы.
          </p>
        </div>
      </header>

      {/* ── Browse-by chip rails ────────────────────────────────── */}
      <section className="bg-[var(--color-cream-deep)]">
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-7">
          <ChipRail
            label="По комнатам"
            items={[
              { slug: null, label: "Все" },
              ...ROOM_CATEGORIES.map((r) => ({ slug: r.slug, label: r.label })),
            ]}
            active={activeRoom}
            buildHref={(slug) => browseUrl({ room: slug })}
          />
          <ChipRail
            label="По стилю"
            items={[
              { slug: null, label: "Любой" },
              ...STYLE_CHIPS,
            ]}
            active={activeStyle}
            buildHref={(slug) => browseUrl({ style: slug })}
          />
        </div>
      </section>

      {/* ── Grid ────────────────────────────────────────────────── */}
      <section className="bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3 text-sm text-[var(--color-muted)]">
            <span>
              {data.total > 0 ? (
                <>
                  <span className="font-bold text-[var(--color-text)]">{formatNumber(data.total)}</span>{" "}
                  {pluralWorks(data.total)}
                </>
              ) : (
                "Каталог формируется"
              )}
              {totalPages > 1 ? (
                <span className="ml-3 text-[var(--color-faint)]">стр. {page} из {totalPages}</span>
              ) : null}
            </span>
          </div>

          {isDemoMode ? <DemoNotice /> : null}

          {data.items.length > 0 ? (
            <ul className="grid gap-x-4 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((item) => (
                <RealCaseCard key={item.id} item={item} />
              ))}
            </ul>
          ) : null}

          {isDemoMode ? (
            <ul className={`${data.items.length > 0 ? "mt-12" : ""} grid gap-x-4 gap-y-12 sm:grid-cols-2 lg:grid-cols-3`}>
              {DEMO_CASES.map((d) => (
                <DemoCardLi key={d.id} demo={d} />
              ))}
            </ul>
          ) : null}

          {totalPages > 1 ? (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              buildHref={paginationUrl}
            />
          ) : null}
        </div>
      </section>
    </>
  );
}

// ── Chip rail (browse-by) ────────────────────────────────────────────────────

function ChipRail({
  label,
  items,
  active,
  buildHref,
}: {
  label: string;
  items: { slug: string | null; label: string }[];
  active: string | null;
  buildHref: (slug: string | null) => string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
        {label}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => {
          const isActive = item.slug === active;
          return (
            <li key={item.slug ?? "all"}>
              <Link
                href={buildHref(item.slug)}
                className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Cards (large photo-led, minimal meta) ───────────────────────────────────

function RealCaseCard({ item }: { item: RabotyListItem }) {
  if (!item.slug) return null;
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const priceFrom = parseNumeric(item.priceFrom);
  const masterName = item.master.publicTitle?.trim() || item.master.alias?.trim() || `Мастер #${item.master.id}`;
  const cityPart = item.city?.name ? ` в ${item.city.name}` : "";

  return (
    <li>
      <Link href={`/raboty/${item.slug}`} className="group block">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[var(--color-border)]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={`${item.title}${cityPart} — фото работы`}
              loading="lazy"
              className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-muted)]">
              Без фото
            </div>
          )}
          {item.isFeatured ? (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-[var(--color-primary)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
              Топ
            </span>
          ) : null}
        </div>

        <div className="mt-4 px-1">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-lg">
            {item.title}
          </h3>
          <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
            {[item.service?.name, item.city?.name ?? item.master.city].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
            {priceFrom != null ? (
              <span>
                <span className="text-[var(--color-faint)]">от </span>
                <span className="font-semibold text-[var(--color-text)]">
                  {formatNumber(priceFrom)} ₽
                </span>
              </span>
            ) : <span />}
            <span className="truncate text-[var(--color-muted)]">{masterName}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function DemoCardLi({ demo }: { demo: typeof DEMO_CASES[number] }) {
  return (
    <li>
      <Link href="/raboty" className="group block">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[var(--color-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={demo.imageUrl}
            alt={demo.alt}
            loading="lazy"
            className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-[var(--color-surface)]/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
            Пример
          </span>
        </div>
        <div className="mt-4 px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
            {demo.category}
          </p>
          <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-lg">
            {demo.title}
          </h3>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Стилевой референс — найдите мастера, который реализует похоже.
          </p>
        </div>
      </Link>
    </li>
  );
}

function DemoNotice() {
  return (
    <div className="mb-12 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream-deep)] p-6 sm:p-7">
      <p className="font-eyebrow">Каталог формируется</p>
      <p className="mt-3 text-base font-semibold text-[var(--color-text)]">
        Пока мастера публикуют работы, мы показываем стилевые референсы.
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        По мере появления реальных кейсов референсы автоматически вытесняются.
      </p>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  const prev = currentPage > 1 ? currentPage - 1 : null;
  const next = currentPage < totalPages ? currentPage + 1 : null;
  return (
    <nav className="mt-16 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-8">
      {prev ? (
        <Link
          href={buildHref(prev)}
          rel="prev"
          className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-text)]"
        >
          ← Назад
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-[var(--color-muted)]">
        Стр. {currentPage} из {totalPages}
      </span>
      {next ? (
        <Link
          href={buildHref(next)}
          rel="next"
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
        >
          Далее →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function pluralWorks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "идей";
  if (mod10 === 1) return "идея";
  if (mod10 >= 2 && mod10 <= 4) return "идеи";
  return "идей";
}
