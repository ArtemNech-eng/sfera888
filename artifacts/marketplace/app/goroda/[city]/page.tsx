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
 * Portal-стиль. City_Feed + список ЖК города + форма добавления ЖК.
 * Данные server-to-server (Requirements 20.5, 20.6). Нет города → 404.
 */

export const revalidate = 60;

interface RouteParams { city: string; }

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { city: citySlug } = await params;
  const data = await fetchCommunityCity(citySlug, { revalidate: 300 });
  if (!data) return { title: "Город не найден — Соседи" };
  const { city } = data;
  const title = city.seoTitle ?? `${city.name} — соседский портал ЖК`;
  const description =
    city.seoDescription ??
    `Соседское сообщество ${city.name}: приёмка и дефекты застройщика, ЖКХ, ремонт и жизнь жилых комплексов.`;
  return { title, description, alternates: { canonical: `${publicUrl()}/goroda/${city.slug}` } };
}

export default async function CityPage({ params }: { params: Promise<RouteParams> }) {
  const { city: citySlug } = await params;
  const data = await fetchCommunityCity(citySlug);
  if (!data) notFound();

  const { city, cityFeed } = data;
  const zhk = data.zhk ?? [];

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Соседи", url: `${publicUrl()}/soobshchestvo` },
    { name: city.name, url: `${publicUrl()}/goroda/${city.slug}` },
  ]);

  return (
    <div className="portal">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />

      <div className="portal-wrap">
        <header className="portal-masthead">
          <nav className="portal-crumbs">
            <Link href="/">Главная</Link> / <Link href="/soobshchestvo">Соседи</Link> / <span>{city.name}</span>
          </nav>
          <span className="portal-eyebrow">Соседи · {city.region ?? "город"}</span>
          <h1 className="portal-h1">{city.h1 ?? `${city.name}`}</h1>
          <p className="portal-lead">
            Общегородские темы: где купить материалы, отзывы о магазинах, поиск
            проверенных бригад. Выберите свой ЖК ниже.
          </p>
        </header>

        {zhk.length > 0 ? (
          <>
            <div className="portal-kicker">
              <h2 className="portal-h2">Жилые комплексы</h2>
              <span className="portal-kicker-count">{zhk.length}</span>
            </div>
            <div className="portal-catalog portal-catalog--3">
              {zhk.map((z) => (
                <Link key={z.slug} href={`/zhk/${z.slug}`} className="portal-cell">
                  <div className="portal-cell-title">{z.name}</div>
                  <div className="portal-cell-sub">Локальное сообщество →</div>
                </Link>
              ))}
            </div>
          </>
        ) : null}

        <div className="mx-auto grid gap-10 py-2 lg:grid-cols-[1fr_20rem]">
          <section>
            <div className="portal-kicker">
              <h2 className="portal-h2">Городские темы</h2>
            </div>
            <div className="mt-5">
              <FeedList
                items={cityFeed.items}
                emptyState={cityFeed.emptyState}
                emptyText="Пока нет городских тем. Будьте первым — начните обсуждение."
              />
            </div>
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start" style={{ marginTop: 44 }}>
            <div className="portal-panel">
              <div className="portal-panel-title">Нет вашего ЖК?</div>
              <p className="portal-panel-sub">Добавьте жилой комплекс — соседское обсуждение начнётся сразу.</p>
              <div className="mt-4">
                <CreateZhkForm citySlug={city.slug} cityName={city.name} />
              </div>
            </div>
          </aside>
        </div>

        <div style={{ height: 56 }} />
      </div>
    </div>
  );
}
