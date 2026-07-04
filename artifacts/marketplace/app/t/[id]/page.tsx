import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchThread } from "../../../lib/communityApi";
import { publicUrl } from "../../../lib/env";
import { localFeedCategoryLabel } from "../../../lib/types";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";
import { CommentSection } from "../../../components/community/CommentSection";

/**
 * Страница отдельной темы с обсуждением `/t/[id]` (форум-слой сообщества).
 *
 * Единый маршрут для тем всех зон (City_Feed / Local_Feed / PRO_Public):
 * показывает полный текст темы и дерево комментариев с формой ответа.
 * Данные — server-to-server через lib/communityApi (Requirement 20.6);
 * несуществующая/скрытая тема → 404.
 */

export const dynamic = "force-dynamic";

interface RouteParams {
  id: string;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { id } = await params;
  const num = parseId(id);
  if (num === null) return { title: "Тема не найдена" };
  const data = await fetchThread(num);
  if (!data) return { title: "Тема не найдена" };
  const { thread } = data;
  const description =
    thread.body.length > 160 ? `${thread.body.slice(0, 160).trimEnd()}…` : thread.body || thread.title;
  return {
    title: thread.title,
    description,
    alternates: { canonical: `${publicUrl()}/t/${thread.id}` },
  };
}

export default async function ThreadPage({ params }: { params: Promise<RouteParams> }) {
  const { id } = await params;
  const num = parseId(id);
  if (num === null) notFound();

  const data = await fetchThread(num);
  if (!data) notFound();

  const { thread, comments } = data;

  // Родительская лента для «назад» и хлебных крошек.
  const parent =
    thread.scope === "zhk" && thread.zhkSlug
      ? { href: `/zhk/${thread.zhkSlug}`, label: thread.zhkName ?? "Жилой комплекс" }
      : thread.scope === "pro" && thread.specialtySlug
        ? { href: `/pro/${thread.specialtySlug}`, label: thread.specialtyName ?? "Сообщество мастеров" }
        : thread.citySlug
          ? { href: `/goroda/${thread.citySlug}`, label: thread.cityName ?? "Город" }
          : { href: "/soobshchestvo", label: "Соседи" };

  const zoneLabel = thread.zone === "pro_public" ? "Хочу также ПРО" : "Соседи";
  const zoneHref = thread.zone === "pro_public" ? "/pro" : "/soobshchestvo";
  const categoryLabel = localFeedCategoryLabel(thread.category);

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: zoneLabel, url: `${publicUrl()}${zoneHref}` },
    { name: parent.label, url: `${publicUrl()}${parent.href}` },
    { name: thread.title, url: `${publicUrl()}/t/${thread.id}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />

      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
          <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
          <span aria-hidden>/</span>
          <Link href={zoneHref} className="hover:text-[var(--color-text)]">{zoneLabel}</Link>
          <span aria-hidden>/</span>
          <Link href={parent.href} className="hover:text-[var(--color-text)]">{parent.label}</Link>
        </nav>

        {/* Тема */}
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[var(--color-faint)]">
          {categoryLabel ? (
            <span className="rounded-full bg-[var(--color-cream-deep)] px-3 py-1 font-medium text-[var(--color-text)]">
              {categoryLabel}
            </span>
          ) : null}
          <time dateTime={thread.createdAt}>{formatDate(thread.createdAt)}</time>
        </div>

        <h1 className="font-display mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
          {thread.title}
        </h1>

        {thread.body ? (
          <div className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-[var(--color-text)]">
            {thread.body}
          </div>
        ) : null}

        <div className="mt-6">
          <Link href={parent.href} className="text-sm text-[var(--color-primary)] hover:underline">
            ← {parent.label}
          </Link>
        </div>

        {/* Обсуждение */}
        <CommentSection threadId={thread.id} comments={comments} />
      </article>
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}
