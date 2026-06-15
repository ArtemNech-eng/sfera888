import Link from "next/link";
import type { Metadata } from "next";
import { fetchCities, fetchServices } from "../lib/api";
import type { City, Service } from "../lib/types";

// Skip prerender at build time — page depends on the marketplace API which is
// only available at runtime. ISR caching (5 min) lives in lib/api.ts.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Найдите проверенного мастера для ремонта",
    description:
      "Опишите задачу — подберём мастера в вашем городе. Сантехники, электрики, плиточники и другие специалисты с проверенными отзывами.",
    alternates: { canonical: "/" },
  };
}

function defaultLink(service: Service, cities: City[]): string {
  const krd = cities.find((c) => c.slug === "krasnodar");
  const target = krd ?? cities[0];
  return target ? `/${service.slug}/${target.slug}` : `/uslugi`;
}

export default async function HomePage() {
  const [services, cities] = await Promise.all([fetchServices(), fetchCities()]);

  return (
    <>
      {/* Hero */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:py-20">
          <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-5xl">
            Найдите проверенного мастера для ремонта
          </h1>
          <p className="mt-4 text-base text-[var(--color-muted)] sm:text-lg">
            Опишите задачу — подберём мастера в вашем городе. Без агрегаторов и спама.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/uslugi"
              className="inline-flex items-center rounded-xl bg-[var(--color-primary)] px-6 py-3 text-base font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
            >
              Выбрать услугу
            </Link>
          </div>
        </div>
      </section>

      {/* Popular services */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold text-[var(--color-text)]">Популярные услуги</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.slice(0, 9).map((service) => (
            <li key={service.id}>
              <Link
                href={defaultLink(service, cities)}
                className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-primary)] hover:shadow-sm"
              >
                <div className="text-base font-medium text-[var(--color-text)]">{service.name}</div>
                {service.description ? (
                  <div className="mt-1 text-sm text-[var(--color-muted)]">{service.description}</div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
        {services.length > 9 ? (
          <div className="mt-6">
            <Link href="/uslugi" className="text-sm font-medium text-[var(--color-primary)]">
              Все услуги →
            </Link>
          </div>
        ) : null}
      </section>

      {/* Cities */}
      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <h2 className="text-2xl font-semibold text-[var(--color-text)]">Города</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {cities.map((city) => (
            <li key={city.id}>
              <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)]">
                {city.name}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section className="bg-[var(--color-surface)] border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-2xl font-semibold text-[var(--color-text)]">Как это работает</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { n: "1", t: "Оставляете заявку", d: "Опишите задачу — это займёт минуту" },
              { n: "2", t: "Мы подбираем мастера", d: "Из проверенных специалистов в вашем городе" },
              { n: "3", t: "Мастер связывается с вами", d: "Уточняет детали и согласовывает время" },
            ].map((step) => (
              <li key={step.n} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
                <div className="text-3xl font-semibold text-[var(--color-primary)]">{step.n}</div>
                <div className="mt-2 text-base font-medium text-[var(--color-text)]">{step.t}</div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">{step.d}</div>
              </li>
            ))}
          </ol>
          <div className="mt-8 text-center">
            <Link
              href="/uslugi"
              className="inline-flex items-center rounded-xl bg-[var(--color-primary)] px-6 py-3 text-base font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
            >
              Перейти к услугам
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
