import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchThread } from "../../../lib/communityApi";
import { publicUrl } from "../../../lib/env";
import { localFeedCategoryLabel } from "../../../lib/types";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";
import { CommentSection } from "../../../components/community/CommentSection";

/**
 * Страница темы с обсуждением `/t/[id]` (форум-слой). Portal-стиль.
 * Единый маршрут для тем всех зон. Нет темы → 404.
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
    <div className="portal">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />

      <div className="portal-wrap" style={{ maxWidth: 800 }}>
        <header className="portal-masthead">
          <nav className="portal-crumbs">
            <Link href="/">Главная</Link> / <Link href={zoneHref}>{zoneLabel}</Link> / <Link href={parent.href}>{parent.label}</Link>
          </nav>
          <div className="portal-row-meta" style={{ marginTop: 16 }}>
            {categoryLabel ? <span className="portal-chip">{categoryLabel}</span> : null}
            <time dateTime={thread.createdAt}>{formatDate(thread.createdAt)}</time>
          </div>
          <h1 className="portal-h1" style={{ fontSize: "clamp(28px,4vw,44px)" }}>{thread.title}</h1>
        </header>

        {thread.body ? (
          <div style={{ whiteSpace: "pre-wrap", fontSize: 17, lineHeight: 1.6, marginTop: 22 }}>
            {thread.body}
          </div>
        ) : null}

        <Link href={parent.href} className="portal-back">← {parent.label}</Link>

        <CommentSection threadId={thread.id} comments={comments} />

        <div style={{ height: 56 }} />
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
