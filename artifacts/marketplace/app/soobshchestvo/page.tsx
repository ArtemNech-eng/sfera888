import Link from "next/link";
import type { Metadata } from "next";
import { fetchCommunityCities } from "../../lib/communityApi";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import { CommunityRail } from "../../components/community/CommunityRail";

/**
 * Хаб раздела «Соседи» — точка входа в гео-сообщество (spec: hochu-takzhe-community).
 * Zen-стиль (см. .zen в globals.css): светлый фид-портал с левым рэйлом.
 */

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const title = "Соседи — сообщества по городам и ЖК";
  const description =
    "Соседские сообщества жителей: обсуждения по городам и жилым комплексам, " +
    "аварии ЖКХ, дефекты застройщиков, рекомендации мастеров.";
  return { title, description, alternates: { canonical: `${publicUrl()}/soobshchestvo` } };
}

export default async function CommunityHubPage() {
  const cities = await fetchCommunityCities();
  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Соседи", url: `${publicUrl()}/soobshchestvo` },
  ]);

  return (
    <div className="zen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />
      <div className="zen-shell">
        <div className="zen-layout zen-layout--rail">
          <CommunityRail active="sosedi" cities={cities} />

          <main>
            <header>
              <span className="zen-eyebrow">Соседи</span>
              <h1 className="zen-title">Соседские сообщества</h1>
              <p className="zen-sub">
                Выберите город — обсуждайте с соседями приёмку и дефекты застройщика,
                аварии ЖКХ, ремонт и жизнь жилых комплексов.
              </p>
              <p className="zen-note">
                Вы мастер? Профессиональные обсуждения — в разделе{" "}
                <Link href="/pro">«Хочу также ПРО»</Link>.
              </p>
            </header>

            <h2 className="zen-section-title">Города</h2>
            {cities.length > 0 ? (
              <div className="zen-grid zen-grid--3">
                {cities.map((c) => (
                  <Link key={c.slug} href={`/goroda/${c.slug}`} className="zen-card">
                    <div className="zen-card-title">{c.name}</div>
                    {c.region ? <div className="zen-card-sub">{c.region}</div> : null}
                    <div className="zen-card-arrow">Открыть сообщество →</div>
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
