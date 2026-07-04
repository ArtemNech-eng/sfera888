import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCommunityCity, fetchCommunityCities } from "../../../lib/communityApi";
import { publicUrl } from "../../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";
import { FeedList } from "../../../components/community/FeedList";
import { CreateZhkForm } from "../../../components/community/CreateZhkForm";
import { AskForm } from "../../../components/community/AskForm";
import { CommunityRail } from "../../../components/community/CommunityRail";

/**
 * Sosedi_Zone — страница города `/goroda/[city]` (spec task 13.1). Zen-стиль.
 * Список ЖК города + City_Feed + форма добавления ЖК. Нет города → 404.
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
  const [data, cities] = await Promise.all([
    fetchCommunityCity(citySlug),
    fetchCommunityCities(),
  ]);
  if (!data) notFound();

  const { city, cityFeed } = data;
  const zhk = data.zhk ?? [];

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Соседи", url: `${publicUrl()}/soobshchestvo` },
    { name: city.name, url: `${publicUrl()}/goroda/${city.slug}` },
  ]);

  return (
    <div className="zen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />
      <div className="zen-shell">
        <div className="zen-layout zen-layout--rail">
          <CommunityRail active="sosedi" cities={cities} activeCitySlug={city.slug} />

          <main>
            <nav className="zen-crumbs">
              <Link href="/">Главная</Link> · <Link href="/soobshchestvo">Соседи</Link> · {city.name}
            </nav>
            <span className="zen-eyebrow">Соседи{city.region ? ` · ${city.region}` : ""}</span>
            <h1 className="zen-title">{city.h1 ?? city.name}</h1>
            <p className="zen-sub">
              Общегородские темы: где купить материалы, отзывы о магазинах, поиск
              проверенных бригад. Выберите свой ЖК ниже.
            </p>

            <div className="zen-panel" style={{ marginTop: 8 }}>
              <div className="zen-panel-title">Спросите жителей {city.name}</div>
              <p className="zen-panel-sub">Любой вопрос о ремонте, ЖКХ, застройщиках и жизни в городе — без регистрации.</p>
              <div style={{ marginTop: 14 }}>
                <AskForm
                  citySlug={city.slug}
                  placeholder={`Задайте вопрос о жизни в ${city.name}…`}
                  suggestions={[
                    "Где заказать надёжный ремонт под ключ?",
                    "Как оспорить перерасчёт за ЖКХ?",
                    "Посоветуйте проверенного электрика",
                    "Какие ЖК лучше по качеству постройки?",
                  ]}
                />
              </div>
            </div>

            {zhk.length > 0 ? (
              <>
                <h2 className="zen-section-title">Жилые комплексы</h2>
                <div className="zen-grid zen-grid--2">
                  {zhk.map((z) => (
                    <Link key={z.slug} href={`/zhk/${z.slug}`} className="zen-card">
                      <div className="zen-card-title">{z.name}</div>
                      <div className="zen-card-arrow">Локальное сообщество →</div>
                    </Link>
                  ))}
                </div>
              </>
            ) : null}

            <div className="grid gap-8 lg:grid-cols-[1fr_20rem]" style={{ marginTop: 8 }}>
              <section>
                <h2 className="zen-section-title">Городские темы</h2>
                <FeedList
                  items={cityFeed.items}
                  emptyState={cityFeed.emptyState}
                  emptyText="Пока нет городских тем. Будьте первым — начните обсуждение."
                />
              </section>
              <aside className="lg:sticky lg:top-24 lg:self-start" style={{ marginTop: 52 }}>
                <div className="zen-panel">
                  <div className="zen-panel-title">Нет вашего ЖК?</div>
                  <p className="zen-panel-sub">Добавьте жилой комплекс — соседское обсуждение начнётся сразу.</p>
                  <div style={{ marginTop: 16 }}>
                    <CreateZhkForm citySlug={city.slug} cityName={city.name} />
                  </div>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
