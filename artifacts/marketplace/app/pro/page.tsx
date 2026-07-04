import Link from "next/link";
import type { Metadata } from "next";
import { fetchCommunitySpecialties } from "../../lib/communityApi";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";

/**
 * PRO_Zone — индексная страница «Хочу также ПРО» (spec: hochu-takzhe-community).
 * Отдельная от соседского портала зона (Requirement 5.3 / 8.1). Portal-стиль.
 */

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const title = "Хочу также ПРО — сообщества мастеров по специальностям";
  const description =
    "Профессиональные сообщества мастеров: электрики, сантехники, плиточники, " +
    "отделочники и другие. Цены, инструмент, материалы и разбор объектов.";
  return { title, description, alternates: { canonical: `${publicUrl()}/pro` } };
}

export default async function ProHubPage() {
  const specialties = await fetchCommunitySpecialties();
  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Хочу также ПРО", url: `${publicUrl()}/pro` },
  ]);

  return (
    <div className="portal">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />

      <div className="portal-wrap">
        <header className="portal-masthead">
          <nav className="portal-crumbs">
            <Link href="/">Главная</Link> / <span>Хочу также ПРО</span>
          </nav>
          <span className="portal-eyebrow">Хочу также ПРО</span>
          <h1 className="portal-h1">Сообщества мастеров</h1>
          <p className="portal-lead">
            Профессиональные обсуждения по специальностям: инструмент, материалы,
            цены и разбор сложных объектов. Выберите свою специальность.
          </p>
          <p className="portal-note">
            Ищете соседей по дому и городу? — раздел{" "}
            <Link href="/soobshchestvo">«Соседи»</Link>.
          </p>
        </header>

        <div className="portal-kicker">
          <h2 className="portal-h2">Специальности</h2>
          <span className="portal-kicker-count">{specialties.length}</span>
        </div>

        {specialties.length > 0 ? (
          <div className="portal-catalog portal-catalog--3">
            {specialties.map((s) => (
              <Link key={s.slug} href={`/pro/${s.slug}`} className="portal-cell">
                <div className="portal-cell-title">{s.name}</div>
                <div className="portal-cell-sub">Профессиональное сообщество</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="portal-empty" style={{ marginTop: 24 }}>
            Сообщества скоро появятся. Загляните позже.
          </div>
        )}

        <div style={{ height: 56 }} />
      </div>
    </div>
  );
}
