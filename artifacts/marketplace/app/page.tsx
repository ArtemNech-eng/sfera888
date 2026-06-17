import Link from "next/link";
import type { Metadata } from "next";
import { fetchCities, fetchServices } from "../lib/api";
import type { City, Service } from "../lib/types";
import { HomeHero } from "../components/home/HomeHero";
import { HomeTrustStrip } from "../components/home/HomeTrustStrip";

// Skip prerender at build time — page depends on the marketplace API which is
// only available at runtime. ISR caching (5 min) lives in lib/api.ts.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Спланируйте ремонт — от идеи до мастера",
    description:
      "Реальные ремонты с фото и ценами, AI-визуализация и подбор проверенных мастеров в вашем городе. Без агрегаторов, без авансов, с договором.",
    alternates: { canonical: "/" },
  };
}

function defaultLink(service: Service, cities: City[]): string {
  const krd = cities.find((c) => c.slug === "krasnodar");
  const target = krd ?? cities[0];
  return target ? `/${service.slug}/${target.slug}` : `/uslugi`;
}

export default async function HomePage() {
  // Both fetches are cached for 5 min in lib/api.ts; failures are tolerated
  // because the hero + trust strip render without any DB data — only the
  // service grid below depends on these.
  const [services, cities] = await Promise.all([
    fetchServices().catch(() => [] as Service[]),
    fetchCities().catch(() => [] as City[]),
  ]);

  return (
    <>
      <HomeHero />
      <HomeTrustStrip />

      {/* Popular services — kept from V1 while we build the visual idea
          masonry (plan §11.11). Layout cleaned up: one card per service,
          softer cards, no abrupt borders. */}
      {services.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                Каталог
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
                Популярные услуги
              </h2>
            </div>
            <Link href="/uslugi" className="text-sm font-semibold text-[var(--color-primary)] hover:underline">
              Все услуги →
            </Link>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.slice(0, 9).map((service) => (
              <li key={service.id}>
                <Link
                  href={defaultLink(service, cities)}
                  className="block rounded-2xl border border-[var(--color-border)] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:shadow-md"
                >
                  <div className="text-base font-semibold text-[var(--color-text)]">{service.name}</div>
                  {service.description ? (
                    <div className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">
                      {service.description}
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* How it works — funnel-aware version per plan §20.2 block [9].
          Replaces the previous 1-2-3 abstract flow with the four planning
          stages: idea → visualise → budget → match. */}
      <section className="border-t border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Как это работает
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
              Четыре шага от идеи до готового ремонта
            </h2>
            <p className="mt-3 text-base text-[var(--color-muted)]">
              Не нужно сразу искать подрядчика — сначала спланируйте, потом найдёте.
            </p>
          </div>

          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li
                key={step.n}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-sm font-bold text-[var(--color-primary)]">
                    {step.n}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    {step.kicker}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-[var(--color-text)]">{step.title}</h3>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}

const STEPS = [
  {
    n: "1",
    kicker: "Идеи",
    title: "Найдите идею",
    description: "Просматривайте реальные ремонты с фото до и после, ценами и сроками.",
  },
  {
    n: "2",
    kicker: "AI-дизайн",
    title: "Визуализируйте",
    description: "Загрузите фото вашей комнаты и получите дизайн в нужном стиле.",
  },
  {
    n: "3",
    kicker: "Калькулятор",
    title: "Узнайте бюджет",
    description: "Считаем смету по реальным сделкам в вашем городе.",
  },
  {
    n: "4",
    kicker: "Подбор",
    title: "Найдите мастера",
    description: "Подберём проверенных специалистов и пришлём предложения.",
  },
] as const;
