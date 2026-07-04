import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCommunityZhk } from "../../../lib/communityApi";
import { publicUrl } from "../../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";
import { FeedList } from "../../../components/community/FeedList";
import { AskForm } from "../../../components/community/AskForm";
import { CommunityRail } from "../../../components/community/CommunityRail";
import type { CommunityZhk } from "../../../lib/types";

/**
 * Sosedi_Zone — страница ЖК `/zhk/[zhk]` (spec task 13.1). Zen-стиль.
 * Local_Feed + форма новой темы. Только темы этого ЖК (Requirement 3.3).
 * Атрибуты — только заполненные (Requirement 1.7).
 */

export const revalidate = 60;

interface RouteParams { zhk: string; }

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { zhk: zhkSlug } = await params;
  const data = await fetchCommunityZhk(zhkSlug, { revalidate: 300 });
  if (!data) return { title: "ЖК не найден — Соседи" };
  const { zhk } = data;
  return {
    title: `${zhk.name} — соседский чат жилого комплекса`,
    description: `Соседское сообщество ЖК «${zhk.name}»: аварии ЖКХ, дефекты застройщика, обмен инструментом и локальные рекомендации.`,
    alternates: { canonical: `${publicUrl()}/zhk/${zhk.slug}` },
  };
}

export default async function ZhkPage({ params }: { params: Promise<RouteParams> }) {
  const { zhk: zhkSlug } = await params;
  const data = await fetchCommunityZhk(zhkSlug);
  if (!data) notFound();

  const { zhk, localFeed } = data;

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Соседи", url: `${publicUrl()}/soobshchestvo` },
    { name: zhk.name, url: `${publicUrl()}/zhk/${zhk.slug}` },
  ]);

  return (
    <div className="zen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />
      <div className="zen-shell">
        <div className="zen-layout zen-layout--rail">
          <CommunityRail active="sosedi" />

          <main>
            <nav className="zen-crumbs">
              <Link href="/">Главная</Link> · <Link href="/soobshchestvo">Соседи</Link> · {zhk.name}
            </nav>
            <span className="zen-eyebrow">Жилой комплекс</span>
            <h1 className="zen-title">{zhk.name}</h1>
            <p className="zen-sub">
              Локальный чат соседей: аварии ЖКХ, дефекты застройщика, обмен
              инструментом и рекомендации рядом с домом.
            </p>
            <ZhkAttributes zhk={zhk} />

            <div className="grid gap-8 lg:grid-cols-[1fr_22rem]" style={{ marginTop: 8 }}>
              <section>
                <h2 className="zen-section-title">Соседские темы</h2>
                <FeedList
                  items={localFeed.items}
                  emptyState={localFeed.emptyState}
                  emptyText="В этом ЖК пока нет тем. Начните первое обсуждение с соседями."
                  showCategory
                />
              </section>
              <aside className="lg:sticky lg:top-24 lg:self-start" style={{ marginTop: 52 }}>
                <div className="zen-panel">
                  <div className="zen-panel-title">Спросить соседей</div>
                  <p className="zen-panel-sub">Задайте вопрос или поделитесь полезным — без регистрации.</p>
                  <div style={{ marginTop: 16 }}>
                    <AskForm
                      zhkSlug={zhk.slug}
                      placeholder={`Спросите жителей ЖК «${zhk.name}»…`}
                      suggestions={[
                        "Как принимали квартиру — на что смотреть?",
                        "Кто делал ремонт в нашем ЖК — посоветуйте бригаду",
                        "Проблемы с застройщиком — как решали?",
                        "Как обстоят дела со звукоизоляцией?",
                      ]}
                    />
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

/** Атрибуты ЖК — только заполненные (Requirement 1.7). */
function ZhkAttributes({ zhk }: { zhk: CommunityZhk }) {
  const buildings = zhk.buildings?.filter((b) => b.name?.trim()) ?? [];
  const hasAny = !!zhk.developer || !!zhk.completionDate || buildings.length > 0;
  if (!hasAny) return null;
  return (
    <dl className="zen-attrs">
      {zhk.developer ? (<div className="zen-attr"><dt>Застройщик</dt><dd>{zhk.developer}</dd></div>) : null}
      {zhk.completionDate ? (<div className="zen-attr"><dt>Срок сдачи</dt><dd>{zhk.completionDate}</dd></div>) : null}
      {buildings.length > 0 ? (<div className="zen-attr"><dt>Корпуса</dt><dd>{buildings.map((b) => b.name).join(", ")}</dd></div>) : null}
    </dl>
  );
}
