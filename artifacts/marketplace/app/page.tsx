import type { Metadata } from "next";
import {
  fetchCities,
  fetchMarketplaceStats,
  fetchMasters,
  fetchRabotyList,
} from "../lib/api";
import type {
  City,
  MarketplaceStats,
  Master,
  RabotyListItem,
} from "../lib/types";
import { HomeHero } from "../components/home/HomeHero";
import { HomeIdeasCategories } from "../components/home/HomeIdeasCategories";
import { HomeRecentCases } from "../components/home/HomeRecentCases";
import { HomeCalculator } from "../components/home/HomeCalculator";
import { HomeTopMasters } from "../components/home/HomeTopMasters";
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
  // stats, calculator) instead of taking down the homepage.
  const [stats, masters, cases, cities] = await Promise.all([
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
    fetchCities().catch(() => [] as City[]),
  ]);

  return (
    <>
      <HomeHero stats={stats} cities={cities} />
      <HomeIdeasCategories />
      <HomeRecentCases cases={cases} />
      <HomeCalculator cities={cities} />
      <HomeTopMasters masters={masters} />
      <HomeHowItWorks />
    </>
  );
}
