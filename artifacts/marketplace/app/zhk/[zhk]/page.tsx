import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCommunityZhk } from "../../../lib/communityApi";
import { publicUrl } from "../../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";
import {
  buildLocalityMetadata,
  localityKindEyebrow,
} from "../../../lib/communityLocalityMeta";
import { FeedList } from "../../../components/community/FeedList";
import { AskForm } from "../../../components/community/AskForm";
import { PublishGate } from "../../../components/community/PublishGate";
import { CreateTopicForm } from "../../../components/community/CreateTopicForm";
import { CommunityRail } from "../../../components/community/CommunityRail";
import type { CommunityZhk } from "../../../lib/types";

/**
 * Sosedi_Zone — страница локации `/zhk/[zhk]` (community-generalized-locality
 * task 9.1). Zen-стиль. Обслуживает локацию ЛЮБОГО Locality_Kind — ЖК, район
 * или посёлок (Requirement 3.2). Local_Feed + форма новой темы. Только темы
 * этой локации. Атрибуты — только заполненные (Requirement 1.7).
 *
 * Метаданные (title/description/canonical/noindex) — через чистый билдер
 * `buildLocalityMetadata`: непустые title и описание, абсолютный canonical для
 * любого kind (Requirement 6.6); `noindex` эмитится iff `isIndexable === false`
 * (Requirement 6.7).
 */

export const revalidate = 60;

interface RouteParams { zhk: string; }

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { zhk: zhkSlug } = await params;
  const data = await fetchCommunityZhk(zhkSlug, { revalidate: 300 });
  // Not-found путь сохраняет непустой title (Requirement 6.6).
  if (!data) return { title: "Локация не найдена — Соседи" };
  const { zhk } = data;
  const meta = buildLocalityMetadata(
    { name: zhk.name, slug: zhk.slug, kind: zhk.kind, isIndexable: zhk.isIndexable },
    publicUrl(),
  );
  const metadata: Metadata = {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical },
  };
  // Директива noindex — только для неиндексируемых локаций (Requirement 6.7).
  if (meta.robots) metadata.robots = meta.robots;
  return metadata;
}

export default async function ZhkPage({ params }: { params: Promise<RouteParams> }) {
  const { zhk: zhkSlug } = await params;
  const data = await fetchCommunityZhk(zhkSlug);
  if (!data) notFound();

  const { zhk, localFeed } = data;

  // Браузерная база api-server для клиентской проверки Community_Session в
  // гейте публикации (Requirement 8.7) — та же переменная, что у форм
  // регистрации/входа. Значение вшивается в бандл на этапе СБОРКИ.
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://sfera-master.ru/api";

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
            <span className="zen-eyebrow">{localityKindEyebrow(zhk.kind)}</span>
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
                {/* Гейт публикации: создание темы Local_Feed — только для
                    участников с действительной Community_Session. Без сессии
                    гейт предлагает регистрацию или вход (Requirement 8.7). */}
                <div className="zen-panel" style={{ marginBottom: 16 }}>
                  <div className="zen-panel-title">Создать тему</div>
                  <p className="zen-panel-sub">
                    Полноценная тема в ленте вашего ЖК — для зарегистрированных соседей.
                  </p>
                  <div style={{ marginTop: 16 }}>
                    <PublishGate
                      apiBaseUrl={apiBaseUrl}
                      next={`/zhk/${zhk.slug}`}
                      title="Создание темы — для участников"
                      description="Чтобы опубликовать тему в ленте ЖК, зарегистрируйтесь или войдите. Телефон станет вашим логином."
                    >
                      <CreateTopicForm zhkName={zhk.name} />
                    </PublishGate>
                  </div>
                </div>

                <div className="zen-panel">
                  <div className="zen-panel-title">Спросить соседей</div>
                  <p className="zen-panel-sub">Задайте вопрос или поделитесь полезным — без регистрации.</p>
                  <div style={{ marginTop: 16 }}>
                    <AskForm
                      zhkSlug={zhk.slug}
                      placeholder={`Спросите соседей «${zhk.name}»…`}
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
