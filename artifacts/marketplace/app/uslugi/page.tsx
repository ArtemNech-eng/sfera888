import Link from "next/link";
import type { Metadata } from "next";
import { fetchCities, fetchServices } from "../../lib/api";
import type { City, Service } from "../../lib/types";

// Same reason as `/` — this page calls the marketplace API at request time.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Все услуги мастеров",
    description:
      "Полный список услуг: сантехника, электрика, отделочные работы, монтаж, демонтаж и другие виды работ.",
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

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">Все услуги</h1>
      <p className="mt-2 text-base text-[var(--color-muted)]">
        Выберите услугу — мы покажем условия работы и форму заявки.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service: Service) => {
          const href = fallbackCity ? `/${service.slug}/${fallbackCity}` : "#";
          return (
            <li key={service.id}>
              <Link
                href={href}
                className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-primary)] hover:shadow-sm"
              >
                <div className="text-base font-medium text-[var(--color-text)]">{service.name}</div>
                {service.description ? (
                  <div className="mt-1 text-sm text-[var(--color-muted)]">{service.description}</div>
                ) : null}
                {service.priceFrom != null ? (
                  <div className="mt-2 text-sm font-medium text-[var(--color-primary)]">от {service.priceFrom} ₽</div>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
