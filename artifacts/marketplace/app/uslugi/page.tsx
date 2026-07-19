import Link from "next/link";
import type { Metadata } from "next";
import { fetchCities, fetchServices } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import type { City } from "../../lib/types";
import { ServicesCatalog } from "../../components/ServicesCatalog";

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

export default async function ServicesPage() {
  const [services, cities] = await Promise.all([fetchServices(), fetchCities()]);
  const fallbackCity = pickCitySlug(cities);
  // city-launch-model: рейл городов ведёт в каталог мастеров (/mastera?city=),
  // поэтому показываем только операционно запущенные города — иначе ссылка вела
  // бы в пустой каталог. Пре-лонч города находят через свои хабы /goroda/[city].
  const launchedCities = cities.filter((c) => c.isLaunched);

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
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-14">
          <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Услуги</span>
          </nav>

          <h1 className="font-display mt-8 max-w-3xl text-4xl text-[var(--color-text)] sm:text-5xl">
            Все услуги.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Сантехника, электрика, отделочные работы, монтаж, демонтаж — каждая
            услуга открывает страницу с ценами и подбором мастера в вашем городе.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/kalkulyator"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] shadow-cozy transition hover:bg-[var(--color-cta-hover)]"
            >
              Прикинуть бюджет
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/raboty"
              className="inline-flex h-12 items-center rounded-full border border-[var(--color-text)] bg-transparent px-6 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white"
            >
              Посмотреть работы
            </Link>
          </div>
        </div>
      </section>

      {/* ── Services catalog (масштаб на сотни услуг: поиск + А–Я + компактно) ── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
          {services.length === 0 ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
              <p className="font-display text-2xl text-[var(--color-text)]">
                Каталог обновляется.
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Зайдите чуть позже — мы доформируем список услуг.
              </p>
            </div>
          ) : (
            <ServicesCatalog services={services} fallbackCity={fallbackCity} />
          )}
        </div>
      </section>

      {/* ── Cities rail ── */}
      {launchedCities.length > 0 ? (
        <section className="border-t border-[var(--color-border)] bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
              Города, где уже работаем.
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--color-muted)]">
              Выбирайте свой город — в нём свои проверенные мастера для быстрого
              выезда. Новые города открываем по мере подключения мастеров.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {launchedCities.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/mastera?city=${encodeURIComponent(c.slug)}`}
                    className="inline-flex h-11 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm font-medium text-[var(--color-text)] transition hover:-translate-y-0.5 hover:border-[var(--color-text)] hover:shadow-cozy"
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
