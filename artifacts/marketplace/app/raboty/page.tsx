import Link from "next/link";
import type { Metadata } from "next";
import { fetchRabotyList } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import { buildRabotyIndexMeta } from "../../lib/seoMeta";
import type { RabotyListItem } from "../../lib/types";
import { ROOM_CATEGORIES, DEMO_CASES } from "../../lib/demoCases";
import { CaseCard } from "../../components/CaseCard";

/**
 * `/raboty` — каталог идей в Pinterest-masonry стиле (план §22.4).
 *
 * Главный товар платформы — РЕЗУЛЬТАТ РЕМОНТА (объект). Эта страница —
 * витрина, где пользователь приходит за вдохновением. Поэтому:
 *
 *   • masonry-сетка из CaseCard (порт. 4:5), не utility-таблица
 *   • большие фото на первом плане, текст вторичен
 *   • sticky browse-by chip rails сверху (по комнатам / по стилю), AirBnB-style
 *   • subtle pagination внизу
 *
 * Воронка: visitor browses → opens a case at /raboty/[slug] → reads the
 * story → either keeps browsing or hits "Хочу такой же" lead form.
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
  q?: string;
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

  const activeRoom = typeof sp.room === "string" ? sp.room : null;
  const activeStyle = typeof sp.style === "string" ? sp.style : null;

  const data = await fetchRabotyList({ page, limit: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / data.limit));
  const isDemoMode = data.items.length < 3 && page === 1;

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Идеи", url: `${publicUrl()}/raboty` },
  ]);

  const paginationUrl = (p: number) => {
    const params = new URLSearchParams();
    if (activeRoom) params.set("room", activeRoom);
    if (activeStyle) params.set("style", activeStyle);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/raboty${qs ? `?${qs}` : ""}`;
  };
  const browseUrl = (params: { room?: string | null; style?: string | null }) => {
    const sp2 = new URLSearchParams();
    const r = params.room === undefined ? activeRoom : params.room;
    const s = params.style === undefined ? activeStyle : params.style;
    if (r) sp2.set("room", r);
    if (s) sp2.set("style", s);
    const qs = sp2.toString();
    return `/raboty${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />

      {/* ── Compact inspiration header ──────────────────────────── */}
      <header className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-7 pt-10 sm:px-6 sm:pt-14">
          <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Идеи</span>
          </nav>

          <h1 className="font-display mt-7 max-w-3xl text-4xl text-[var(--color-text)] sm:text-5xl">
            Ремонты, которые хочется повторить.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Сохраняйте идеи, что зацепили. Подбор мастера, который повторит — на
            странице каждой работы.
          </p>
        </div>
      </header>

      {/* ── Sticky browse-by chip rails (AirBnB-style filters) ─── */}
      <section className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-4 sm:px-6 sm:py-5">
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

      {/* ── Masonry grid (Pinterest-feel) ────────────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          {totalPages > 1 ? (
            <div className="mb-8 text-sm text-[var(--color-faint)]">
              Стр. {page} из {totalPages}
            </div>
          ) : null}

          {isDemoMode ? <DemoNotice /> : null}

          {data.items.length > 0 ? (
            <div className="masonry">
              {data.items.map((item) => (
                <div key={item.id} className="masonry-item">
                  <CaseCard {...rabotyToCardProps(item)} />
                </div>
              ))}
            </div>
          ) : null}

          {isDemoMode ? (
            <div className={`${data.items.length > 0 ? "mt-12" : ""} masonry`}>
              {DEMO_CASES.map((d) => (
                <div key={d.id} className="masonry-item">
                  <CaseCard
                    href="/raboty"
                    cover={d.imageUrl}
                    title={d.title}
                    alt={d.alt}
                    metaParts={[d.category]}
                    priceLabel={null}
                  />
                </div>
              ))}
            </div>
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function rabotyToCardProps(item: RabotyListItem) {
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const priceFrom = parseNumeric(item.priceFrom);
  const area = parseNumeric(item.area);
  const cityName = item.city?.name ?? item.master.city ?? null;
  const masterName =
    item.master.publicTitle?.trim() ||
    item.master.alias?.trim() ||
    `Мастер #${item.master.id}`;

  return {
    href: `/raboty/${item.slug}`,
    cover,
    title: item.title,
    alt: `${item.title}${cityName ? ` в ${cityName}` : ""} — фото ремонта`,
    metaParts: [
      cityName,
      area != null ? `${area} м²` : null,
      masterName,
    ],
    priceLabel: priceFrom != null ? `от ${formatNumber(priceFrom)} ₽` : null,
    badge: item.isFeatured ? ({ tone: "featured" as const, label: "Топ" }) : null,
    views: null,
    saves: item.saveCount,
  };
}

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
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
        {label}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => {
          const isActive = item.slug === active;
          return (
            <li key={item.slug ?? "all"}>
              <Link
                href={buildHref(item.slug)}
                className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                  isActive
                    ? "border-[var(--color-primary)] bg-[var(--color-cta)] text-[var(--color-on-cta)]"
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

function DemoNotice() {
  return (
    <div className="mb-12 rounded-2xl border border-[var(--color-border)] bg-[var(--color-cream-deep)] p-6 sm:p-7">
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
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-cta)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)]"
        >
          Далее →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}
