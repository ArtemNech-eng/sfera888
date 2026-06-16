import type { MetadataRoute } from "next";
import { fetchCities, fetchPublishedMasterSlugs, fetchServices } from "../lib/api";
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
    { url: `${base}/uslugi`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/dizajn`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/o-nas`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/kontakty`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // If the API is unreachable (e.g. during a degraded deploy) we still want a
  // valid sitemap with at least the static entries — better than a 500.
  let services: Awaited<ReturnType<typeof fetchServices>> = [];
  let cities: Awaited<ReturnType<typeof fetchCities>> = [];
  let masterSlugs: string[] = [];
  try {
    [services, cities, masterSlugs] = await Promise.all([
      fetchServices(),
      fetchCities(),
      fetchPublishedMasterSlugs(),
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

  return [...top, ...masters, ...pairs];
}
