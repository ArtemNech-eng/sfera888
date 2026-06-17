import Link from "next/link";
import type { Metadata } from "next";
import { fetchRabotyList } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import { buildRabotyIndexMeta } from "../../lib/seoMeta";
import type { RabotyListItem } from "../../lib/types";
import { ROOM_CATEGORIES, DEMO_CASES } from "../../lib/demoCases";

/**
 * Public catalog of all portfolio cases (plan §11.7, §21).
 *
 * Editorial redesign — replaces the dark cover hero with a magazine-style
 * head section: breadcrumbs, eyebrow, oversized serif headline. Cards lose
 * the rounded-2xl + shadow chrome in favour of plain photo-led layout.
 * Demo notice and pagination follow the new minimal tone.
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

      {/* ── Editorial header ────────────────────────────────────── */}
      <header className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pt-14 lg:pt-20">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            <Link href="/" className="transition hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Работы</span>
          </nav>

          <p className="font-eyebrow mt-9 text-[var(--color-primary)]">Реальные ремонты</p>
          <h1 className="font-editorial mt-5 max-w-4xl text-5xl text-[var(--color-text)] sm:text-6xl lg:text-[4.25rem]">
            Работы наших мастеров — фото, цены, сроки.
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Каждая работа — реальный объект с проверенным мастером, цена по договору
            и срок по факту. Понравится — отправьте «Хочу такую же», заявка уйдёт автору
            работы первой.
          </p>

          {data.total > 0 ? (
            <p className="mt-9 inline-flex items-baseline gap-3 text-sm text-[var(--color-muted)]">
              <span className="font-editorial text-2xl text-[var(--color-text)]">
                {formatNumber(data.total)}
              </span>
              <span>{pluralWorks(data.total)} в каталоге</span>
              {totalPages > 1 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>стр. {page} из {totalPages}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      {/* ── Room category chip rail ─────────────────────────────── */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <p className="font-eyebrow mb-3">По комнатам</p>
          <ul className="flex flex-wrap gap-2">
            {ROOM_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/raboty?room=${c.slug}`}
                  className="inline-flex items-center border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-text)]"
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Cases grid ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        {isDemoMode ? <DemoNotice /> : null}

        {data.items.length > 0 ? (
          <ul className="grid gap-x-3 gap-y-10 sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-3">
            {data.items.map((item) => (
              <RealCaseCard key={item.id} item={item} />
            ))}
          </ul>
        ) : null}

        {isDemoMode ? (
          <ul className={`${data.items.length > 0 ? "mt-10" : ""} grid gap-x-3 gap-y-10 sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-3`}>
            {DEMO_CASES.map((d) => (
              <DemoCardLi key={d.id} demo={d} />
            ))}
          </ul>
        ) : null}

        {totalPages > 1 ? <Pagination currentPage={page} totalPages={totalPages} /> : null}
      </section>
    </>
  );
}

// ── Cards (no rounded chrome — photo-led editorial) ────────────────────────

function RealCaseCard({ item }: { item: RabotyListItem }) {
  if (!item.slug) return null;
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const priceFrom = parseNumeric(item.priceFrom);
  const area = parseNumeric(item.area);
  const masterName = item.master.publicTitle?.trim() || item.master.alias?.trim() || `Мастер #${item.master.id}`;
  const cityPart = item.city?.name ? ` в ${item.city.name}` : "";

  return (
    <li>
      <Link href={`/raboty/${item.slug}`} className="group block">
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-border)]">
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
            <span className="absolute left-3 top-3 inline-flex items-center bg-[var(--color-text)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
              Топ
            </span>
          ) : null}
        </div>

        <div className="mt-4 space-y-2">
          <h3 className="font-editorial line-clamp-2 text-xl leading-snug text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-2xl">
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

          <div className="flex items-end justify-between gap-3 pt-1">
            {priceFrom != null ? (
              <p className="text-sm">
                <span className="text-[var(--color-faint)]">от </span>
                <span className="font-semibold text-[var(--color-text)]">
                  {formatNumber(priceFrom)} ₽
                </span>
              </p>
            ) : <span />}
            <div className="text-right text-xs text-[var(--color-muted)]">
              <div className="line-clamp-1">{masterName}</div>
              {item.master.publicRating ? (
                <div className="text-[var(--color-text)]">
                  <span aria-hidden className="text-[var(--color-primary)]">★ </span>
                  <span className="font-semibold">
                    {parseFloat(item.master.publicRating).toFixed(1)}
                  </span>
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
      <Link href="/raboty" className="group block">
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={demo.imageUrl}
            alt={demo.alt}
            loading="lazy"
            className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
          <span className="absolute left-3 top-3 inline-flex items-center bg-[var(--color-surface)]/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-faint)]">
            Пример
          </span>
        </div>
        <div className="mt-4 space-y-2">
          <p className="font-eyebrow text-[var(--color-primary)]">{demo.category}</p>
          <h3 className="font-editorial line-clamp-2 text-xl leading-snug text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-2xl">
            {demo.title}
          </h3>
          <p className="text-xs text-[var(--color-muted)]">
            Стилевой референс — найдите мастера, который реализует похоже.
          </p>
        </div>
      </Link>
    </li>
  );
}

function DemoNotice() {
  return (
    <div className="mb-12 border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-7">
      <p className="font-eyebrow">Каталог только формируется</p>
      <p className="font-editorial mt-3 text-xl text-[var(--color-text)] sm:text-2xl">
        Пока мастера публикуют свои работы, мы показываем стилевые референсы.
      </p>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        По мере появления реальных кейсов референсы автоматически вытесняются.
      </p>
    </div>
  );
}

function Pagination({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
  const prev = currentPage > 1 ? currentPage - 1 : null;
  const next = currentPage < totalPages ? currentPage + 1 : null;
  return (
    <nav className="mt-16 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-8">
      {prev ? (
        <Link
          href={prev === 1 ? `/raboty` : `/raboty?page=${prev}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-border-strong)] underline-offset-4 transition hover:decoration-[var(--color-text)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Назад
        </Link>
      ) : (
        <span className="inline-flex items-center gap-2 text-sm text-[var(--color-faint)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Назад
        </span>
      )}
      <span className="text-sm text-[var(--color-muted)]">
        Стр. {currentPage} из {totalPages}
      </span>
      {next ? (
        <Link
          href={`/raboty?page=${next}`}
          className="inline-flex items-center gap-2 bg-[var(--color-text)] px-5 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:bg-[var(--color-primary)]"
        >
          Дальше
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      ) : (
        <span className="inline-flex items-center gap-2 text-sm text-[var(--color-faint)]">
          Дальше
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
