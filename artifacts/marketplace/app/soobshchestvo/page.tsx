import Link from "next/link";
import type { Metadata } from "next";
import {
  fetchCommunityCities,
} from "../../lib/communityApi";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";

/**
 * Хаб раздела «Соседи» — точка входа в гео-сообщество (spec: hochu-takzhe-community).
 *
 * Публичная индексная страница со списком городов (Sosedi_Zone → /goroda/[slug])
 * и профессиональных сообществ (PRO_Public_Layer → /pro/[slug]). Служит целью
 * для пункта меню «Соседи» в шапке, т.к. сами разделы состоят из detail-страниц
 * без собственного индекса.
 *
 * Данные — server-to-server через lib/communityApi (фасад не ходит в БД
 * напрямую, Requirements 20.5, 20.6). Апстрим недоступен → пустые списки, не 500.
 */

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const title = "Соседи — сообщества по городам и ЖК";
  const description =
    "Соседские сообщества жителей: обсуждения по городам и жилым комплексам, " +
    "аварии ЖКХ, дефекты застройщиков, рекомендации мастеров и профессиональные " +
    "разделы по специальностям.";
  return {
    title,
    description,
    alternates: { canonical: `${publicUrl()}/soobshchestvo` },
  };
}

export default async function CommunityHubPage() {
  const cities = await fetchCommunityCities();
  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Соседи", url: `${publicUrl()}/soobshchestvo` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />

      {/* Hero */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-14">
          <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Соседи</span>
          </nav>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            Соседи
          </p>
          <h1 className="font-display mt-4 text-4xl text-[var(--color-text)] sm:text-5xl">
            Соседские сообщества
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Выберите свой город — обсуждайте покупки, отзывы о магазинах и жизнь
            жилых комплексов с соседями.
          </p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Вы мастер? Профессиональные обсуждения — в разделе{" "}
            <Link href="/pro" className="font-medium text-[var(--color-primary)] underline">
              «Хочу также ПРО»
            </Link>
            .
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Города */}
        <section>
          <h2 className="font-display mb-4 text-2xl text-[var(--color-text)]">
            Города
          </h2>
          {cities.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cities.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/goroda/${c.slug}`}
                    className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-cozy transition hover:shadow-cozy-md"
                  >
                    <span className="font-display text-lg text-[var(--color-text)]">
                      {c.name}
                    </span>
                    {c.region ? (
                      <span className="mt-1 block text-sm text-[var(--color-muted)]">
                        {c.region}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--color-muted)]">
              Сообщества скоро появятся. Загляните позже.
            </p>
          )}
        </section>

        {/* Популярные ЖК показываются на странице конкретного города
            (/goroda/[city]) — там ЖК сгруппированы по своему городу, а не
            свалены вперемешку. Зоны «Соседи» и «Хочу также ПРО» разделены
            (Requirement 5.3 / 8.1). */}
      </div>
    </>
  );
}
