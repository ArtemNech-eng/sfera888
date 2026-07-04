import Link from "next/link";
import type { Metadata } from "next";
import { fetchCommunitySpecialties } from "../../lib/communityApi";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import { CommunityRail } from "../../components/community/CommunityRail";

/**
 * PRO_Zone — индексная страница «Хочу также ПРО» (spec: hochu-takzhe-community).
 * Отдельная зона (Requirement 5.3 / 8.1). Zen-стиль.
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
    <div className="zen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />
      <div className="zen-shell">
        <div className="zen-layout zen-layout--rail">
          <CommunityRail active="pro" />

          <main>
            <span className="zen-eyebrow">Хочу также ПРО</span>
            <h1 className="zen-title">Сообщества мастеров</h1>
            <p className="zen-sub">
              Профессиональные обсуждения по специальностям: инструмент, материалы,
              цены и разбор сложных объектов. Выберите свою специальность.
            </p>
            <p className="zen-note">
              Ищете соседей по дому и городу? — раздел <Link href="/soobshchestvo">«Соседи»</Link>.
            </p>

            <h2 className="zen-section-title">Специальности</h2>
            {specialties.length > 0 ? (
              <div className="zen-grid zen-grid--3">
                {specialties.map((s) => (
                  <Link key={s.slug} href={`/pro/${s.slug}`} className="zen-card">
                    <div className="zen-card-title">{s.name}</div>
                    <div className="zen-card-sub">Профессиональное сообщество</div>
                    <div className="zen-card-arrow">Открыть →</div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="zen-empty">Сообщества скоро появятся. Загляните позже.</div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
