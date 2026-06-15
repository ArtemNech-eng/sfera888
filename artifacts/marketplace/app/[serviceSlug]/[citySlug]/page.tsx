import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchServiceCity } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { LeadForm } from "../../../components/LeadForm";

// Dynamic [params] route — Next won't prerender these at build anyway, but we
// declare it explicitly so generateMetadata + fetch can use server-only env.
export const dynamic = "force-dynamic";

interface RouteParams {
  serviceSlug: string;
  citySlug: string;
}

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { serviceSlug, citySlug } = await params;
  const data = await fetchServiceCity(serviceSlug, citySlug);
  if (!data) return { robots: { index: false, follow: false } };
  const cityPrepositional = data.city.nameIn ?? data.city.name;
  const pageH1 = `${data.service.name} в ${cityPrepositional}`;
  const path = `/${serviceSlug}/${citySlug}`;
  return {
    title: `${pageH1} — Честные мастера`,
    description: `Оставьте заявку на услугу «${data.service.name}» в ${cityPrepositional}. Подберём проверенного мастера.`,
    alternates: { canonical: `${publicUrl()}${path}` },
  };
}

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Сколько стоит вызов мастера?",
    a: "Выезд бесплатный. Окончательная стоимость работ согласовывается до начала на объекте.",
  },
  {
    q: "Что если работа не понравится?",
    a: "Мы держим связь с мастером и помогаем решить спорные ситуации. Без вас не уйдёт.",
  },
  {
    q: "Как быстро приедет мастер?",
    a: "В зависимости от загрузки — обычно в течение нескольких часов или на следующий день.",
  },
  {
    q: "Все мастера проверены?",
    a: "Да. Каждый мастер проходит проверку документов перед началом работы.",
  },
];

export default async function ServiceCityPage(
  { params }: { params: Promise<RouteParams> },
) {
  const { serviceSlug, citySlug } = await params;
  const data = await fetchServiceCity(serviceSlug, citySlug);
  if (!data) notFound();

  const cityPrepositional = data.city.nameIn ?? data.city.name;
  const pageH1 = `${data.service.name} в ${cityPrepositional}`;
  const sourcePageUrl = `${publicUrl()}/${serviceSlug}/${citySlug}`;

  return (
    <>
      {/* Hero */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
          <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-5xl">
            {pageH1}
          </h1>
          <p className="mt-3 text-base text-[var(--color-muted)] sm:text-lg">
            Подбираем проверенных мастеров под вашу задачу. Выезд бесплатный.
          </p>
        </div>
      </section>

      {/* Stats + form */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--color-text)]">
              Оставьте заявку — подберём мастера
            </h2>
            <p className="mt-2 text-base text-[var(--color-muted)]">
              Перезвоним в течение часа в рабочее время.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Stat label="Мастеров в городе" value={String(data.stats.mastersCount)} />
              <Stat
                label="Цена от"
                value={data.stats.minPrice != null ? `${data.stats.minPrice} ₽` : "—"}
              />
              <Stat
                label="Средняя оценка"
                value={data.stats.avgRating != null ? data.stats.avgRating.toFixed(1) : "—"}
              />
              <Stat label="Отзывы клиентов" value={String(data.stats.reviewsCount)} />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
            <LeadForm
              citySlug={data.city.slug}
              serviceSlug={data.service.slug}
              sourcePageUrl={sourcePageUrl}
            />
          </div>
        </div>
      </section>

      {/* How we pick a master */}
      <section className="bg-[var(--color-surface)] border-y border-[var(--color-border)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-2xl font-semibold text-[var(--color-text)]">Как мы подбираем мастера</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { n: "1", t: "Принимаем заявку", d: `Передаём её мастерам, работающим в ${cityPrepositional}` },
              { n: "2", t: "Подбираем подходящего", d: "Учитываем район, время и тип работ" },
              { n: "3", t: "Согласуем визит", d: "Мастер связывается с вами для уточнения деталей" },
            ].map((s) => (
              <li key={s.n} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
                <div className="text-3xl font-semibold text-[var(--color-primary)]">{s.n}</div>
                <div className="mt-2 text-base font-medium text-[var(--color-text)]">{s.t}</div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">{s.d}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold text-[var(--color-text)]">Частые вопросы</h2>
        <div className="mt-6 grid gap-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <summary className="cursor-pointer list-none text-base font-medium text-[var(--color-text)]">
                {item.q}
              </summary>
              <p className="mt-3 text-sm text-[var(--color-muted)]">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[var(--color-text)]">{value}</div>
    </div>
  );
}
