import type { Metadata } from "next";
import {
  fetchMarketplaceStats,
  fetchMasters,
  fetchRabotyList,
} from "../lib/api";
import type {
  MarketplaceStats,
  Master,
  RabotyListItem,
} from "../lib/types";
import { HomeHero } from "../components/home/HomeHero";
import { HomeTrustStrip } from "../components/home/HomeTrustStrip";
import { HomeIdeasCategories } from "../components/home/HomeIdeasCategories";
import { HomeRecentCases } from "../components/home/HomeRecentCases";
import { HomeTopMasters } from "../components/home/HomeTopMasters";
import { HomeTrustBlock } from "../components/home/HomeTrustBlock";
import { HomeHowItWorks } from "../components/home/HomeHowItWorks";

// Skip prerender at build time — page depends on the marketplace API which is
// only available at runtime. ISR caching (5 min) lives in lib/api.ts.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Спланируйте ремонт — от идеи до мастера",
    description:
      "Реальные ремонты с фото и ценами, AI-визуализация и подбор проверенных мастеров в вашем городе. Без агрегаторов, без авансов, с договором.",
    alternates: { canonical: "/" },
  };
}

export default async function HomePage() {
  // Parallel fetches with per-source error fallbacks: hero + trust strip +
  // idea categories + how-it-works render without any DB data, so a single
  // upstream blip degrades only the data-driven sections (cases, masters,
  // stats) instead of taking down the homepage.
  const [stats, masters, cases] = await Promise.all([
    fetchMarketplaceStats().catch((): MarketplaceStats => ({
      completedOrders: 0,
      publishedMasters: 0,
      publishedCases: 0,
      avgRating: null,
      citiesCount: 0,
    })),
    fetchMasters({ limit: 8 })
      .then((r) => r.items)
      .catch(() => [] as Master[]),
    fetchRabotyList({ limit: 6 })
      .then((r) => r.items)
      .catch(() => [] as RabotyListItem[]),
  ]);

  return (
    <>
      <HomeHero />
      <HomeTrustStrip />
      <HomeIdeasCategories />
      <HomeRecentCases cases={cases} />
      <HomeTopMasters masters={masters} />
      <HomeTrustBlock stats={stats} />
      <HomeHowItWorks />
    </>
  );
}
