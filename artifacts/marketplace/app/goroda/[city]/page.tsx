import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCommunityCity } from "../../../lib/communityApi";
import { publicUrl } from "../../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";
import { FeedList } from "../../../components/community/FeedList";
import { CreateZhkForm } from "../../../components/community/CreateZhkForm";

/**
 * Sosedi_Zone — общегородская страница `/goroda/[city]` (spec task 13.1).
 *
 * Чистый эстетичный портал жителей (Requirement 5.1): показывает City_Feed
 * (широкие городские темы — покупки, отзывы о магазинах, поиск бригад,
 * Requirement 2) и форму добавления нового ЖК жителем (Requirement 4).
 *
 * Данные берутся server-to-server через `lib/communityApi.ts`
 * (`GET /api/community/geo/city/:citySlug`) — фасад НЕ обращается к БД напрямую
 * (Requirements 20.5, 20.6). Несуществующий город → 404 (Requirement 1.5).
 * Пустая лента — не ошибка, а индикатор пустого состояния (Requirement 1.3).
 *
 * Портал НЕ содержит профессиональных разделов PRO_Zone (Requirements 5.3, 8.1):
 * ни ленты PRO, ни рекламных предложений мастеров здесь не рендерится.
 */

// ISR: городская лента живёт активнее каталога, но кэш важен для поисковых
// роботов; страница пересобирается по TTL и по on-demand ревалидации.
export const revalidate = 60;

interface RouteParams {
  city: string;
}

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { city: citySlug } = await params;
  const data = await fetchCommunityCity(citySlug, { revalidate: 300 });
  if (!data) {
    return { title: "Город не найден — Соседи" };
  }
  const { city } = data;
  const title = city.seoTitle ?? `${city.name} — соседский портал ЖК`;
  const description =
    city.seoDescription ??
    `Соседское сообщество ${city.name}: обсуждения покупок, отзывы о магазинах, ` +
      `поиск бригад и жизнь жилых комплексов города.`;
  return {
    title,
    description,
    alternates: { canonical: `${publicUrl()}/goroda/${city.slug}` },
  };
}

export default async function CityPage(
  { params }: { params: Promise<RouteParams> },
) {
  const { city: citySlug } = await params;
  const data = await fetchCommunityCity(citySlug);
  if (!data) notFound();

  const { city, cityFeed } = data;

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Соседи", url: `${publicUrl()}/goroda/${city.slug}` },
    { name: city.name, url: `${publicUrl()}/goroda/${city.slug}` },
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
            {city.h1 ?? `${city.name}: соседское сообщество`}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Общегородские темы: где купить материалы, отзывы о магазинах, поиск
            проверенных бригад. Выберите свой ЖК ниже или добавьте новый.
          </p>
          {city.region ? (
            <p className="mt-2 text-sm text-[var(--color-faint)]">{city.region}</p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[1fr_20rem]">
        {/* City_Feed */}
        <section>
          <h2 className="font-display mb-4 text-2xl text-[var(--color-text)]">
            Городские темы
          </h2>
          <FeedList
            items={cityFeed.items}
            emptyState={cityFeed.emptyState}
            emptyText="Пока нет городских тем. Будьте первым — начните обсуждение в своём ЖК."
          />
        </section>

        {/* Add-ZhK sidebar (Requirement 4) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-cozy sm:p-6">
            <h2 className="font-display text-xl text-[var(--color-text)]">
              Нет вашего ЖК?
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              Добавьте свой жилой комплекс — и соседское обсуждение начнётся сразу.
            </p>
            <div className="mt-4">
              <CreateZhkForm citySlug={city.slug} cityName={city.name} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
