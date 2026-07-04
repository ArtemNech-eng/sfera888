import Link from "next/link";
import type { Metadata } from "next";
import { fetchCommunityCities } from "../../lib/communityApi";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";

/**
 * Хаб раздела «Соседи» — точка входа в гео-сообщество (spec: hochu-takzhe-community).
 * Portal-стиль (см. .portal в globals.css): плоско, гротеск, каталог-сетка.
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
    <div className="portal">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />

      <div className="portal-wrap">
        <header className="portal-masthead">
          <nav className="portal-crumbs">
            <Link href="/">Главная</Link> / <span>Соседи</span>
          </nav>
          <span className="portal-eyebrow">Соседи</span>
          <h1 className="portal-h1">Соседские сообщества</h1>
          <p className="portal-lead">
            Выберите город — обсуждайте с соседями приёмку и дефекты застройщика,
            аварии ЖКХ, ремонт и жизнь жилых комплексов.
          </p>
          <p className="portal-note">
            Вы мастер? Профессиональные обсуждения — в разделе{" "}
            <Link href="/pro">«Хочу также ПРО»</Link>.
          </p>
        </header>

        <div className="portal-kicker">
          <h2 className="portal-h2">Города</h2>
          <span className="portal-kicker-count">{cities.length}</span>
        </div>

        {cities.length > 0 ? (
          <div className="portal-catalog portal-catalog--3">
            {cities.map((c) => (
              <Link key={c.slug} href={`/goroda/${c.slug}`} className="portal-cell">
                <div className="portal-cell-title">{c.name}</div>
                {c.region ? <div className="portal-cell-sub">{c.region}</div> : null}
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
