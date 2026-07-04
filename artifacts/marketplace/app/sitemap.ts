import type { MetadataRoute } from "next";
import { fetchCities, fetchPublishedCaseSlugs, fetchPublishedDesignSlugs, fetchPublishedMasterSlugs, fetchServices } from "../lib/api";
import { fetchCommunitySitemap } from "../lib/communityApi";
import { publicUrl } from "../lib/env";

// Generated at runtime, not at build time:
//   • depends on the marketplace API (cities + services from DB),
//   • the Bearer token only exists at runtime, never during `next build`.
// `revalidate=3600` makes Next.js cache the rendered XML for an hour
// in production — Yandex/Google crawlers won't hit the upstream every time.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicUrl().replace(/\/+$/, "");
  const now = new Date();
  const top: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/mastera`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/uslugi`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/raboty`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/dizajn`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/kalkulyator`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${base}/o-nas`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/kontakty`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // If the API is unreachable (e.g. during a degraded deploy) we still want a
  // valid sitemap with at least the static entries — better than a 500.
  let services: Awaited<ReturnType<typeof fetchServices>> = [];
  let cities: Awaited<ReturnType<typeof fetchCities>> = [];
  let masterSlugs: string[] = [];
  let caseSlugs: string[] = [];
  let designSlugs: string[] = [];
  try {
    [services, cities, masterSlugs, caseSlugs, designSlugs] = await Promise.all([
      fetchServices(),
      fetchCities(),
      fetchPublishedMasterSlugs(),
      fetchPublishedCaseSlugs(),
      fetchPublishedDesignSlugs(),
    ]);
  } catch {
    return top;
  }

  const pairs: MetadataRoute.Sitemap = [];
  for (const service of services) {
    for (const city of cities) {
      pairs.push({
        url: `${base}/${service.slug}/${city.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  const masters: MetadataRoute.Sitemap = masterSlugs.map((slug) => ({
    url: `${base}/master/${slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // /raboty/[slug] — Houzz-model main long-tail SEO asset (plan §11.7).
  // Higher priority than service-city pairs because cases carry unique
  // user-generated content (photos, custom descriptions, prices) and we
  // want crawlers to pick them up quickly after publication.
  const raboty: MetadataRoute.Sitemap = caseSlugs.map((slug) => ({
    url: `${base}/raboty/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.75,
  }));

  // /dizajn/{slug} — каждый AI-дизайн = SEO-страница. L1 контент-двигатель
  // из стратегии v3. Меняется редко после генерации (immutable result).
  //
  // `fetchPublishedDesignSlugs` уже отдаёт ТОЛЬКО завершённые проекты: backend
  // фильтрует `status='completed'`, а на стороне marketplace ответ проходит
  // через чистый предикат `selectSitemapDesignSlugs` (lib/dizajnIndexing.ts).
  // Включение зависит от статуса, а не от доступности ассетов, поэтому
  // завершённый проект остаётся в sitemap даже при временной недоступности
  // `resultImageUrl` (Req 10.1, 10.2, 10.5; Property 14/17).
  const designs: MetadataRoute.Sitemap = designSlugs.map((slug) => ({
    url: `${base}/dizajn/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.75,
  }));

  // /dizajn/{room-style} — aggregate landing pages. Заполняются по мере
  // появления реальных дизайнов; пустые отдают «empty state + CTA».
  const designAggregates = buildDesignAggregateEntries(base, now);

  // ── Гео-сообщество «ХочуТакже» (task 11.2, Requirements 5.2, 6.5, 16.1, 16.3) ──
  // Включаем ТОЛЬКО индексируемые страницы: города целевого SEO-набора
  // (`is_geo_covered`), ЖК выше порога контента (`is_indexable`) и специальности
  // PRO_Public_Layer. Бэкенд уже исключил «тонкие» страницы (Requirement 16.3),
  // поэтому фасаду не нужно повторно фильтровать. Деградирует к пустым спискам
  // при недоступности апстрима — sitemap остаётся валидным.
  const community = await fetchCommunitySitemap();
  const communityEntries: MetadataRoute.Sitemap = [
    ...community.cities.map((slug) => ({
      url: `${base}/goroda/${slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...community.zhk.map((slug) => ({
      url: `${base}/zhk/${slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.65,
    })),
    ...community.specialties.map((slug) => ({
      url: `${base}/pro/${slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];

  return [...top, ...masters, ...raboty, ...pairs, ...designs, ...designAggregates, ...communityEntries];
}

// ── AI-designer sitemap entries ─────────────────────────────────────────────

const DESIGN_ROOMS = ["bathroom", "kitchen", "living-room", "bedroom", "hallway", "nursery", "apartment"];
const DESIGN_STYLES = ["modern", "scandinavian", "loft", "minimalism", "neoclassic", "japandi", "classic"];

/**
 * Билдер aggregate-URL'ов /dizajn/{room}-{style}. 7×7 = 49 комбинаций.
 * Также добавляем «только room» и «только style» агрегаты для widest reach.
 */
function buildDesignAggregateEntries(base: string, now: Date): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  // Combo: room-style
  for (const room of DESIGN_ROOMS) {
    for (const style of DESIGN_STYLES) {
      entries.push({
        url: `${base}/dizajn/${room}-${style}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.65,
      });
    }
  }
  // Только room (все стили)
  for (const room of DESIGN_ROOMS) {
    entries.push({
      url: `${base}/dizajn/${room}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  // Только style (все комнаты)
  for (const style of DESIGN_STYLES) {
    entries.push({
      url: `${base}/dizajn/${style}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  return entries;
}
