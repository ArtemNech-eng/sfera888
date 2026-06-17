import Link from "next/link";
import type { Metadata } from "next";
import { fetchRabotyList } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import { buildRabotyIndexMeta } from "../../lib/seoMeta";
import type { RabotyListItem } from "../../lib/types";
import { ROOM_CATEGORIES, DEMO_CASES } from "../../lib/demoCases";

/**
 * Public feed of all portfolio cases (Houzz-model main entry, plan §11.7).
 *
 * V1.5 redesign: dark cover hero, room-category chip rail for fast
 * orientation, 3-column responsive grid using the new card chrome shared
 * with the home page and case detail. When the DB has fewer than 3 real
 * published cases, the grid falls back to the curated Unsplash references
 * with a clear "Пример" badge on each tile (plan §20.4 photo policy).
 */

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

interface SearchParams {
  page?: string;
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

  const data = await fetchRabotyList({ page, limit: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / data.limit));
  const isDemoMode = data.items.length < 3 && page === 1;

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Работы", url: `${publicUrl()}/raboty` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />

      {/* ── Cover hero ── */}
      <section className="relative overflow-hidden bg-[var(--color-text)]">
        {/* Soft tinted overlay so the dark band doesn't feel flat. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-[var(--color-secondary)] opacity-30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 left-0 h-72 w-72 rounded-full bg-[var(--color-accent)] opacity-25 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/70">
            <Link href="/" className="hover:text-white">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-white/85">Работы</span>
          </nav>

          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
            Реальные ремонты
          </p>
          <h1 className="mt-1 max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Работы наших мастеров —{" "}
            <span className="text-white/85">фото, цены, сроки</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/75 sm:text-lg">
            Каждая работа — это реальный объект с проверенным мастером, ценой по договору и
            длительностью по факту. Понравится — отправьте заявку «Хочу такую же», она уйдёт автору
            работы первой.
          </p>

          {/* Stats strip */}
          <dl className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-5 border-t border-white/10 pt-6 text-white">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
                Всего работ
              </dt>
              <dd className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                {data.total > 0 ? `${formatNumber(data.total)} ${pluralWorks(data.total)}` : "Каталог формируется"}
              </dd>
            </div>
            {data.total > 0 ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
                  Страница
                </dt>
                <dd className="mt-1 text-base font-bold">
                  {page} из {totalPages}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      {/* ── Room category chip rail ── */}
      <section className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            По комнатам
          </p>
          <ul className="flex flex-wrap gap-2">
            {ROOM_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/raboty?room=${c.slug}`}
                  className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-white px-4 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Cases grid ── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {isDemoMode ? (
          <DemoNotice />
        ) : null}

        {data.items.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => (
              <RealCaseCard key={item.id} item={item} />
            ))}
          </ul>
        ) : null}

        {isDemoMode ? (
          <ul className={`${data.items.length > 0 ? "mt-4" : ""} grid gap-4 sm:grid-cols-2 lg:grid-cols-3`}>
            {DEMO_CASES.map((d) => (
              <DemoCardLi key={d.id} demo={d} />
            ))}
          </ul>
        ) : null}

        {totalPages > 1 ? (
          <Pagination currentPage={page} totalPages={totalPages} />
        ) : null}
      </section>
    </>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

function RealCaseCard({ item }: { item: RabotyListItem }) {
  if (!item.slug) return null;
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const priceFrom = parseNumeric(item.priceFrom);
  const area = parseNumeric(item.area);
  const masterName = item.master.publicTitle?.trim() || item.master.alias?.trim() || `Мастер #${item.master.id}`;
  const cityPart = item.city?.name ? ` в ${item.city.name}` : "";

  return (
    <li>
      <Link
        href={`/raboty/${item.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--color-secondary)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-background)]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={`${item.title}${cityPart} — фото работы`}
              loading="lazy"
              className="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-muted)]">
              Без фото
            </div>
          )}
          {item.isFeatured ? (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="m12 2 3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
              </svg>
              Топ
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-secondary)]">
            {item.title}
          </h3>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            {item.service?.name ? <span>{item.service.name}</span> : null}
            {item.city?.name || item.master.city ? (
              <>
                <span aria-hidden>·</span>
                <span>{item.city?.name ?? item.master.city}</span>
              </>
            ) : null}
            {area != null ? (
              <>
                <span aria-hidden>·</span>
                <span>{area} м²</span>
              </>
            ) : null}
          </div>

          <div className="mt-auto flex items-end justify-between gap-3 pt-3 border-t border-[var(--color-border)]">
            {priceFrom != null ? (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">от</p>
                <p className="text-base font-bold text-[var(--color-text)]">
                  {formatNumber(priceFrom)} ₽
                </p>
              </div>
            ) : <span />}
            <div className="text-right text-xs text-[var(--color-muted)]">
              <div className="line-clamp-1">{masterName}</div>
              {item.master.publicRating ? (
                <div className="text-[var(--color-text)] font-semibold">
                  ★ {parseFloat(item.master.publicRating).toFixed(1)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function DemoCardLi({ demo }: { demo: typeof DEMO_CASES[number] }) {
  return (
    <li>
      <Link
        href="/raboty"
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--color-secondary)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-background)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={demo.imageUrl}
            alt={demo.alt}
            loading="lazy"
            className="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] shadow-sm ring-1 ring-[var(--color-border)]">
            Пример
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
            {demo.category}
          </span>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-secondary)]">
            {demo.title}
          </h3>
          <p className="mt-auto pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted)]">
            Стилевой референс. Найдите мастера, который реализует похожий проект.
          </p>
        </div>
      </Link>
    </li>
  );
}

function DemoNotice() {
  return (
    <div className="mb-8 flex items-start gap-3 rounded-2xl border border-[var(--color-secondary-soft)] bg-[var(--color-secondary-soft)]/60 p-5 sm:items-center">
      <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-[var(--color-secondary)]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--color-text)]">
          Каталог только формируется
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Пока мастера публикуют свои работы, мы показываем стилевые референсы.
          По мере появления реальных кейсов они автоматически вытесняют референсы.
        </p>
      </div>
    </div>
  );
}

function Pagination({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
  const prev = currentPage > 1 ? currentPage - 1 : null;
  const next = currentPage < totalPages ? currentPage + 1 : null;
  return (
    <nav className="mt-12 flex items-center justify-center gap-3">
      {prev ? (
        <Link
          href={prev === 1 ? `/raboty` : `/raboty?page=${prev}`}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--color-text)] shadow-sm transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Назад
        </Link>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-2.5 text-sm text-[var(--color-muted)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Назад
        </span>
      )}
      <span className="text-sm font-semibold text-[var(--color-muted)]">
        Стр. {currentPage} из {totalPages}
      </span>
      {next ? (
        <Link
          href={`/raboty?page=${next}`}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)]"
        >
          Дальше
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-5 py-2.5 text-sm text-[var(--color-muted)]">
          Дальше
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
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
  if (mod100 >= 11 && mod100 <= 14) return "работ";
  if (mod10 === 1) return "работа";
  if (mod10 >= 2 && mod10 <= 4) return "работы";
  return "работ";
}
