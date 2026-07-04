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
 * Sosedi_Zone — страница жилого комплекса `/zhk/[zhk]` (spec task 13.1).
 *
 * Локальная лента ЖК (Local_Feed): соседский чат об авариях ЖКХ, дефектах
 * застройщика, обмене инструментом и локальных рекомендациях (Requirement 3).
 * Отображаются ТОЛЬКО темы этого ЖК (Requirement 3.3); пустая лента —
 * индикатор пустого состояния, не ошибка (Requirement 3.6).
 *
 * Данные — server-to-server через `lib/communityApi.ts`
 * (`GET /api/community/geo/zhk/:zhkSlug`), без прямого доступа к БД
 * (Requirements 20.5, 20.6). Несуществующий ЖК → 404 (Requirement 1.5).
 *
 * Атрибуты ЖК (застройщик, срок сдачи, корпуса) показываются ТОЛЬКО когда
 * заполнены (Requirement 1.7). Портал не содержит разделов PRO_Zone
 * (Requirements 5.3, 8.1).
 */

export const revalidate = 60;

interface RouteParams {
  zhk: string;
}

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { zhk: zhkSlug } = await params;
  const data = await fetchCommunityZhk(zhkSlug, { revalidate: 300 });
  if (!data) {
    return { title: "ЖК не найден — Соседи" };
  }
  const { zhk } = data;
  const title = `${zhk.name} — соседский чат жилого комплекса`;
  const description =
    `Соседское сообщество ЖК «${zhk.name}»: аварии ЖКХ, дефекты застройщика, ` +
    `обмен инструментом и локальные рекомендации.`;
  return {
    title,
    description,
    alternates: { canonical: `${publicUrl()}/zhk/${zhk.slug}` },
  };
}

export default async function ZhkPage(
  { params }: { params: Promise<RouteParams> },
) {
  const { zhk: zhkSlug } = await params;
  const data = await fetchCommunityZhk(zhkSlug);
  if (!data) notFound();

  const { zhk, localFeed } = data;

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Соседи", url: `${publicUrl()}/zhk/${zhk.slug}` },
    { name: zhk.name, url: `${publicUrl()}/zhk/${zhk.slug}` },
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
            {zhk.name}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Локальный чат соседей: аварии ЖКХ, дефекты застройщика, обмен
            инструментом и рекомендации рядом с домом.
          </p>
          <ZhkAttributes zhk={zhk} />
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[1fr_22rem]">
        {/* Local_Feed */}
        <section>
          <h2 className="font-display mb-4 text-2xl text-[var(--color-text)]">
            Соседские темы
          </h2>
          <FeedList
            items={localFeed.items}
            emptyState={localFeed.emptyState}
            emptyText="В этом ЖК пока нет тем. Начните первое обсуждение с соседями."
            showCategory
          />
        </section>

        {/* Create topic (Requirement 3) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-cozy sm:p-6">
            <h2 className="font-display text-xl text-[var(--color-text)]">
              Новая тема
            </h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              Спросите соседей или поделитесь полезным.
            </p>
            <div className="mt-4">
              <CreateTopicForm zhkName={zhk.name} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * Атрибуты ЖК — застройщик, срок сдачи, корпуса. Каждый рендерится ТОЛЬКО при
 * заполнении; незаполненные не отображаются (Requirement 1.7).
 */
function ZhkAttributes({ zhk }: { zhk: CommunityZhk }) {
  const buildings = zhk.buildings?.filter((b) => b.name?.trim()) ?? [];
  const hasAny = !!zhk.developer || !!zhk.completionDate || buildings.length > 0;
  if (!hasAny) return null;

  return (
    <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
      {zhk.developer ? (
        <div>
          <dt className="text-[var(--color-faint)]">Застройщик</dt>
          <dd className="mt-0.5 font-medium text-[var(--color-text)]">{zhk.developer}</dd>
        </div>
      ) : null}
      {zhk.completionDate ? (
        <div>
          <dt className="text-[var(--color-faint)]">Срок сдачи</dt>
          <dd className="mt-0.5 font-medium text-[var(--color-text)]">{zhk.completionDate}</dd>
        </div>
      ) : null}
      {buildings.length > 0 ? (
        <div>
          <dt className="text-[var(--color-faint)]">Корпуса</dt>
          <dd className="mt-0.5 font-medium text-[var(--color-text)]">
            {buildings.map((b) => b.name).join(", ")}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
