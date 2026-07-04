import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchThread } from "../../../lib/communityApi";
import { publicUrl } from "../../../lib/env";
import { localFeedCategoryLabel } from "../../../lib/types";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";
import { CommentSection } from "../../../components/community/CommentSection";

/**
 * Страница темы с обсуждением `/t/[id]` (форум-слой). Zen-стиль, читаемая колонка.
 */

export const dynamic = "force-dynamic";

interface RouteParams { id: string; }
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
  const description = thread.body.length > 160 ? `${thread.body.slice(0, 160).trimEnd()}…` : thread.body || thread.title;
  return { title: thread.title, description, alternates: { canonical: `${publicUrl()}/t/${thread.id}` } };
}

export default async function ThreadPage({ params }: { params: Promise<RouteParams> }) {
  const { id } = await params;
  const num = parseId(id);
  if (num === null) notFound();
  const data = await fetchThread(num);
  if (!data) notFound();

  const { thread, comments } = data;

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
    <div className="zen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />
      <div className="zen-shell" style={{ maxWidth: 760 }}>
        <nav className="zen-crumbs">
          <Link href="/">Главная</Link> · <Link href={zoneHref}>{zoneLabel}</Link> · <Link href={parent.href}>{parent.label}</Link>
        </nav>

        <article className="zen-panel" style={{ padding: 28 }}>
          <div className="zen-post-meta">
            {categoryLabel ? <span className="zen-chip">{categoryLabel}</span> : null}
            <time dateTime={thread.createdAt}>{formatDate(thread.createdAt)}</time>
          </div>
          <h1 className="zen-title" style={{ marginTop: 10, fontSize: "clamp(24px,3.2vw,34px)" }}>{thread.title}</h1>
          {thread.body ? <div className="zen-article-body">{thread.body}</div> : null}
          <Link href={parent.href} className="zen-back">← {parent.label}</Link>
        </article>

        <CommentSection threadId={thread.id} comments={comments} />
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch {
    return "";
  }
}
