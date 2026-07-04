import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCommunityZhk } from "../../../lib/communityApi";
import { publicUrl } from "../../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";
import { FeedList } from "../../../components/community/FeedList";
import { CreateTopicForm } from "../../../components/community/CreateTopicForm";
import type { CommunityZhk } from "../../../lib/types";

/**
 * Sosedi_Zone — страница ЖК `/zhk/[zhk]` (spec task 13.1). Portal-стиль.
 * Local_Feed + форма новой темы. Только темы этого ЖК (Requirement 3.3).
 * Атрибуты ЖК — только заполненные (Requirement 1.7). Данные server-to-server.
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
  const title = `${zhk.name} — соседский чат жилого комплекса`;
  const description =
    `Соседское сообщество ЖК «${zhk.name}»: аварии ЖКХ, дефекты застройщика, обмен инструментом и локальные рекомендации.`;
  return { title, description, alternates: { canonical: `${publicUrl()}/zhk/${zhk.slug}` } };
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
    <div className="portal">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />

      <div className="portal-wrap">
        <header className="portal-masthead">
          <nav className="portal-crumbs">
            <Link href="/">Главная</Link> / <Link href="/soobshchestvo">Соседи</Link> / <span>{zhk.name}</span>
          </nav>
          <span className="portal-eyebrow">Жилой комплекс</span>
          <h1 className="portal-h1">{zhk.name}</h1>
          <p className="portal-lead">
            Локальный чат соседей: аварии ЖКХ, дефекты застройщика, обмен
            инструментом и рекомендации рядом с домом.
          </p>
          <ZhkAttributes zhk={zhk} />
        </header>

        <div className="mx-auto grid gap-10 py-2 lg:grid-cols-[1fr_22rem]">
          <section>
            <div className="portal-kicker">
              <h2 className="portal-h2">Соседские темы</h2>
            </div>
            <div className="mt-5">
              <FeedList
                items={localFeed.items}
                emptyState={localFeed.emptyState}
                emptyText="В этом ЖК пока нет тем. Начните первое обсуждение с соседями."
                showCategory
              />
            </div>
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start" style={{ marginTop: 44 }}>
            <div className="portal-panel">
              <div className="portal-panel-title">Новая тема</div>
              <p className="portal-panel-sub">Спросите соседей или поделитесь полезным.</p>
              <div className="mt-4">
                <CreateTopicForm zhkName={zhk.name} />
              </div>
            </div>
          </aside>
        </div>

        <div style={{ height: 56 }} />
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
    <dl className="portal-attrs">
      {zhk.developer ? (
        <div className="portal-attr"><dt>Застройщик</dt><dd>{zhk.developer}</dd></div>
      ) : null}
      {zhk.completionDate ? (
        <div className="portal-attr"><dt>Срок сдачи</dt><dd>{zhk.completionDate}</dd></div>
      ) : null}
      {buildings.length > 0 ? (
        <div className="portal-attr"><dt>Корпуса</dt><dd>{buildings.map((b) => b.name).join(", ")}</dd></div>
      ) : null}
    </dl>
  );
}
