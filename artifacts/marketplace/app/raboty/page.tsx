import Link from "next/link";
import type { Metadata } from "next";
import { fetchRabotyList } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import { buildRabotyIndexMeta } from "../../lib/seoMeta";
import type { RabotyListItem } from "../../lib/types";

/**
 * Public feed of all portfolio cases (Houzz-model main entry).
 *
 * Server-rendered grid + simple pagination. Filters by serviceSlug / citySlug
 * are handled by /raboty/[serviceSlug] and /raboty/[serviceSlug]/[citySlug]
 * (separate routes for clean SEO URLs); this page shows the global feed.
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

  // Cheap pre-fetch only when we need pagination meta. Cache TTL handles repeats.
  const data = await fetchRabotyList({ page, limit: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / data.limit));
  const meta = buildRabotyIndexMeta({ total: data.total ?? 0, page, totalPages });

  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: page > 1 ? `${publicUrl()}/raboty?page=${page}` : `${publicUrl()}/raboty` },
    // Pages 2+ are still indexable but lower-priority via canonical chaining.
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

      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
            Работы мастеров
          </h1>
          <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
            Фото реальных ремонтов от наших мастеров. Цены, сроки и автор каждой работы — открыто.
            Понравилась работа — нажмите «Хочу такую же», заявка уйдёт автору первой.
          </p>
          {data.total > 0 ? (
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              Всего {data.total} {pluralWorks(data.total)}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-muted)]">
            Пока работ нет. Загляните позже — мастера активно публикуют новые кейсы.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => (
              <CaseCard key={item.id} item={item} />
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <Pagination currentPage={page} totalPages={totalPages} />
        ) : null}
      </section>
    </>
  );
}

function CaseCard({ item }: { item: RabotyListItem }) {
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const priceFrom = item.priceFrom ? parseFloat(item.priceFrom) : null;
  const area = item.area ? parseFloat(item.area) : null;
  const masterName = item.master.publicTitle?.trim() || item.master.alias?.trim() || `Мастер #${item.master.id}`;
  if (!item.slug) return null;

  return (
    <li className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]">
      <Link href={`/raboty/${item.slug}`} className="block">
        {cover ? (
          <div className="relative aspect-[4/3] w-full bg-[var(--color-background)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt={item.title} loading="lazy" className="block h-full w-full object-cover" />
            {item.isFeatured ? (
              <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">
                Рекомендуется
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="p-4">
          <div className="text-base font-medium text-[var(--color-text)] line-clamp-2">{item.title}</div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            {item.service?.name ? <span>{item.service.name}</span> : null}
            {item.service?.name && (item.city?.name || item.master.city) ? <span aria-hidden> · </span> : null}
            {item.city?.name ?? item.master.city ?? null}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {priceFrom && Number.isFinite(priceFrom) && priceFrom > 0 ? (
              <span className="rounded-full bg-[var(--color-background)] px-2 py-0.5 font-medium text-[var(--color-text)]">
                от {formatNumber(priceFrom)} ₽
              </span>
            ) : null}
            {area && Number.isFinite(area) && area > 0 ? (
              <span className="rounded-full bg-[var(--color-background)] px-2 py-0.5 text-[var(--color-text)]">
                {formatNumber(area)} м²
              </span>
            ) : null}
          </div>
          <div className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-muted)]">
            {masterName}
          </div>
        </div>
      </Link>
    </li>
  );
}

function Pagination({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
  const prev = currentPage > 1 ? currentPage - 1 : null;
  const next = currentPage < totalPages ? currentPage + 1 : null;
  return (
    <nav className="mt-10 flex items-center justify-center gap-3">
      {prev ? (
        <Link
          href={prev === 1 ? `/raboty` : `/raboty?page=${prev}`}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
        >
          ← Назад
        </Link>
      ) : (
        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm text-[var(--color-muted)]">
          ← Назад
        </span>
      )}
      <span className="text-sm text-[var(--color-muted)]">
        Стр. {currentPage} из {totalPages}
      </span>
      {next ? (
        <Link
          href={`/raboty?page=${next}`}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
        >
          Дальше →
        </Link>
      ) : (
        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2 text-sm text-[var(--color-muted)]">
          Дальше →
        </span>
      )}
    </nav>
  );
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
