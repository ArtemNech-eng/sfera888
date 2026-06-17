import Link from "next/link";
import type { Metadata } from "next";
import { fetchCities, fetchMasters, fetchServices } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { MasterCard } from "../../components/MasterCard";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";

/**
 * Public catalog of all published masters with optional filters by city
 * and service. Server-rendered, no client JS.
 *
 * Query params:
 *   ?city=krasnodar    — restrict to a single city slug
 *   ?service=santehnika — restrict to a single service slug
 *   ?page=2            — pagination (1..N)
 *
 * Pagination: server-rendered prev/next links. Pages 2+ get noindex,follow
 * to keep duplicate listings out of the index without breaking deep crawl.
 */

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

interface SearchParams {
  city?: string;
  service?: string;
  page?: string;
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<SearchParams> },
): Promise<Metadata> {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const noindex = page > 1;

  let title = "Все мастера — Честные мастера";
  let description = "Каталог проверенных мастеров: рейтинги, цены, отзывы. Подберите специалиста для ремонта или быта в вашем городе.";

  if (sp.city || sp.service) {
    const [cities, services] = await Promise.all([fetchCities(), fetchServices()]);
    const city = sp.city ? cities.find((c) => c.slug === sp.city) : null;
    const service = sp.service ? services.find((s) => s.slug === sp.service) : null;
    if (city || service) {
      const partService = service ? service.name : "Мастера";
      const partCity = city ? `в ${city.nameIn ?? city.name}` : "";
      title = [partService, partCity].filter(Boolean).join(" ") + " — Честные мастера";
      description = `Каталог мастеров${city ? ` в ${city.nameIn ?? city.name}` : ""}${
        service ? `: услуга «${service.name}»` : ""
      }. Рейтинги, цены, отзывы.`;
    }
  }

  // Build canonical without page param (page=1 only)
  const params = new URLSearchParams();
  if (sp.city) params.set("city", sp.city);
  if (sp.service) params.set("service", sp.service);
  const qs = params.toString();
  const canonicalPath = `/mastera${qs ? `?${qs}` : ""}`;

  return {
    title,
    description,
    alternates: { canonical: `${publicUrl()}${canonicalPath}` },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 100); // cap at 100 to prevent overscanning
}

export default async function MasteraPage(
  { searchParams }: { searchParams: Promise<SearchParams> },
) {
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const [cities, services, list] = await Promise.all([
    fetchCities(),
    fetchServices(),
    fetchMasters({
      citySlug: sp.city,
      serviceSlug: sp.service,
      page,
      limit: PAGE_SIZE,
    }),
  ]);

  const cityFilter = sp.city ? cities.find((c) => c.slug === sp.city) ?? null : null;
  const serviceFilter = sp.service ? services.find((s) => s.slug === sp.service) ?? null : null;

  const partService = serviceFilter ? serviceFilter.name : "Все мастера";
  const partCity = cityFilter ? `в ${cityFilter.nameIn ?? cityFilter.name}` : "";
  const h1 = [partService, partCity].filter(Boolean).join(" ");

  const totalPages = Math.max(1, Math.ceil((list.total ?? 0) / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  // Build URL helper for pagination/filter links
  const buildUrl = (overrides: { page?: number; city?: string | null; service?: string | null }) => {
    const params = new URLSearchParams();
    const c = overrides.city === null ? undefined : overrides.city ?? sp.city;
    const s = overrides.service === null ? undefined : overrides.service ?? sp.service;
    const p = overrides.page ?? page;
    if (c) params.set("city", c);
    if (s) params.set("service", s);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/mastera${qs ? `?${qs}` : ""}`;
  };

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: h1, url: `${publicUrl()}${buildUrl({ page: 1 })}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />

      {/* Hero */}
      <section className="border-b border-[var(--color-border)] bg-gradient-to-b from-[var(--color-primary-soft)]/40 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
          <nav className="mb-5 flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-primary)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Мастера</span>
          </nav>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            Каталог
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-5xl">
            {h1}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-[var(--color-muted)] sm:text-lg">
            Проверенные специалисты с рейтингом и реальными отзывами клиентов.
            Договор с каждым мастером, без авансов.
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Фильтры:
            </span>
            <FilterChip
              label={cityFilter ? cityFilter.name : "Все города"}
              active={!!cityFilter}
              clearHref={cityFilter ? buildUrl({ city: null, page: 1 }) : null}
            />
            <FilterChip
              label={serviceFilter ? serviceFilter.name : "Все услуги"}
              active={!!serviceFilter}
              clearHref={serviceFilter ? buildUrl({ service: null, page: 1 }) : null}
            />
          </div>

          {/* Quick filter rows */}
          {cities.length > 0 ? (
            <details className="mt-3 group">
              <summary className="cursor-pointer text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)]">
                Выбрать город ↓
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cities.slice(0, 30).map((c) => (
                  <Link
                    key={c.slug}
                    href={buildUrl({ city: c.slug, page: 1 })}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      cityFilter?.slug === c.slug
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                    }`}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}

          {services.length > 0 ? (
            <details className="mt-2 group">
              <summary className="cursor-pointer text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)]">
                Выбрать услугу ↓
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {services.slice(0, 30).map((s) => (
                  <Link
                    key={s.slug}
                    href={buildUrl({ service: s.slug, page: 1 })}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      serviceFilter?.slug === s.slug
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                    }`}
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      {/* Results */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-4 text-sm text-[var(--color-muted)]">
          Найдено мастеров: <strong className="text-[var(--color-text)]">{list.total}</strong>
        </div>

        {list.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
            <p className="text-base text-[var(--color-text)]">Мастера не найдены</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Попробуйте изменить фильтры или{" "}
              <Link href="/uslugi" className="underline hover:text-[var(--color-primary)]">
                посмотреть каталог услуг
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.items.map((m) => (
              <li key={m.id}>
                <MasterCard master={m} />
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {totalPages > 1 ? (
          <nav
            className="mt-8 flex items-center justify-between gap-3 text-sm"
            aria-label="Пагинация"
          >
            {hasPrev ? (
              <Link
                href={buildUrl({ page: page - 1 })}
                rel="prev"
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 hover:border-[var(--color-primary)]"
              >
                ← Назад
              </Link>
            ) : <span />}
            <span className="text-[var(--color-muted)]">
              Страница {page} из {totalPages}
            </span>
            {hasNext ? (
              <Link
                href={buildUrl({ page: page + 1 })}
                rel="next"
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 hover:border-[var(--color-primary)]"
              >
                Далее →
              </Link>
            ) : <span />}
          </nav>
        ) : null}
      </section>
    </>
  );
}

function FilterChip({
  label,
  active,
  clearHref,
}: {
  label: string;
  active: boolean;
  clearHref: string | null;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
        active
          ? "bg-[var(--color-primary)] text-white"
          : "bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)]"
      }`}
    >
      {label}
      {active && clearHref ? (
        <Link
          href={clearHref}
          aria-label="Сбросить фильтр"
          className="ml-1 inline-block opacity-80 hover:opacity-100"
        >
          ×
        </Link>
      ) : null}
    </span>
  );
}
