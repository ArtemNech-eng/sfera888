import Link from "next/link";
import type { Metadata } from "next";
import { fetchCities, fetchServices } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import type { City, Service } from "../../lib/types";

// Same reason as `/` — this page calls the marketplace API at request time.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Все услуги — каталог работ Честных мастеров",
    description:
      "Полный список услуг: сантехника, электрика, отделка, монтаж, демонтаж. Цены от мастеров и подбор по вашему городу.",
    alternates: { canonical: "/uslugi" },
  };
}

function pickCitySlug(cities: City[]): string | null {
  const krd = cities.find((c) => c.slug === "krasnodar");
  if (krd) return krd.slug;
  const first = cities[0];
  return first ? first.slug : null;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function pluralServices(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "услуг";
  if (mod10 === 1) return "услуга";
  if (mod10 >= 2 && mod10 <= 4) return "услуги";
  return "услуг";
}

function pluralCities(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "городов";
  if (mod10 === 1) return "город";
  if (mod10 >= 2 && mod10 <= 4) return "города";
  return "городов";
}

export default async function ServicesPage() {
  const [services, cities] = await Promise.all([fetchServices(), fetchCities()]);
  const fallbackCity = pickCitySlug(cities);

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Услуги", url: `${publicUrl()}/uslugi` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />

      {/* ── Hero ── */}
      <section className="border-b border-[var(--color-border)] bg-gradient-to-b from-[var(--color-primary-soft)]/40 to-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <nav className="mb-5 flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-primary)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Услуги</span>
          </nav>

          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            Каталог
          </p>
          <h1 className="mt-1 max-w-3xl text-3xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-5xl">
            Все услуги Честных мастеров
          </h1>
          <p className="mt-4 max-w-2xl text-base text-[var(--color-muted)] sm:text-lg">
            Сантехника, электрика, отделочные работы, монтаж, демонтаж — всё в одном каталоге.
            Каждая услуга открывает страницу мастеров с ценами и подбором по вашему городу.
          </p>

          <dl className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-5 text-[var(--color-text)]">
            <Stat
              label="Услуг в каталоге"
              value={services.length > 0 ? `${formatNumber(services.length)} ${pluralServices(services.length)}` : "Каталог формируется"}
            />
            {cities.length > 0 ? (
              <Stat
                label="Городов работаем"
                value={`${formatNumber(cities.length)} ${pluralCities(cities.length)}`}
              />
            ) : null}
          </dl>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/kalkulyator"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)]"
            >
              Прикинуть бюджет
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/raboty"
              className="inline-flex h-11 items-center rounded-xl border border-[var(--color-border)] bg-white px-5 text-sm font-semibold text-[var(--color-text)] backdrop-blur transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
            >
              Посмотреть работы
            </Link>
          </div>
        </div>
      </section>

      {/* ── Services grid ── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {services.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center">
            <p className="text-base font-semibold text-[var(--color-text)]">
              Каталог обновляется
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Зайдите чуть позже — мы доформируем список услуг.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service: Service) => {
              const href = fallbackCity ? `/${service.slug}/${fallbackCity}` : `/uslugi`;
              return (
                <li key={service.id}>
                  <Link
                    href={href}
                    className="group relative flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--color-primary)] sm:p-6"
                  >
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                        <ServiceIcon />
                      </span>
                      <h2 className="text-base font-bold text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-lg">
                        {service.name}
                      </h2>
                    </div>
                    {service.description ? (
                      <p className="mt-3 line-clamp-3 text-sm text-[var(--color-muted)]">
                        {service.description}
                      </p>
                    ) : null}
                    <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                      {service.priceFrom != null && service.priceFrom > 0 ? (
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">от</span>
                          <span className="ml-1 text-base font-bold text-[var(--color-text)]">
                            {formatNumber(service.priceFrom)} ₽
                          </span>
                        </div>
                      ) : <span />}
                      <span className="inline-flex items-center text-sm font-semibold text-[var(--color-primary)] transition group-hover:translate-x-1">
                        Подобрать
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="ml-1" aria-hidden>
                          <path d="M5 12h14" />
                          <path d="m12 5 7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Cities rail ── */}
      {cities.length > 0 ? (
        <section className="border-t border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
              Города
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
              Работаем по всей стране
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
              В каждом городе свои мастера — выбирайте локального для быстрого выезда.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {cities.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/mastera?city=${encodeURIComponent(c.slug)}`}
                    className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-white px-4 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">{value}</dd>
    </div>
  );
}

function ServiceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
