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
import { HomePopularObjects } from "../components/home/HomePopularObjects";
import { HomeIdeasCategories } from "../components/home/HomeIdeasCategories";
import { HomeCalculator } from "../components/home/HomeCalculator";
import { HomeTopMasters } from "../components/home/HomeTopMasters";
import { HomeHowItWorks } from "../components/home/HomeHowItWorks";

// Skip prerender at build time — page depends on the marketplace API which is
// only available at runtime. ISR caching (5 min) lives in lib/api.ts.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Самая большая база реальных ремонтов в России",
    description:
      "Найдите ремонт, который хотите повторить. Реальные кейсы с фото, ценами и сроками, AI-визуализация, подбор мастера, который сделает похоже.",
    alternates: { canonical: "/" },
  };
}

/**
 * Inspiration-platform homepage (план §22.4).
 *
 * Порядок секций:
 *   1. Hero            — search + visual category chips + stats
 *   2. ПОПУЛЯРНЫЕ ОБЪЕКТЫ — главный блок (ObjectCard сетка)
 *   3. Идеи по комнатам — категориальная навигация
 *   4. Лучшие мастера месяца — поддерживающая секция (не основной фокус)
 *   5. Калькулятор      — utility-якорь и SEO
 *   6. Как работает     — trust
 *
 * Backend feed: один параллельный fetch на все секции, с per-source
 * fallback'ом — единичный сбой UPstream деградирует только data-секции
 * (objects, masters, stats), но не валит главную целиком.
 */
export default async function HomePage() {
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
    fetchRabotyList({ limit: 9 })
      .then((r) => r.items)
      .catch(() => [] as RabotyListItem[]),
    fetchCities().catch(() => [] as City[]),
  ]);

  return (
    <>
      <HomeHero stats={stats} cities={cities} />
      <HomePopularObjects cases={cases} />
      <HomeIdeasCategories />
      <HomeTopMasters masters={masters} />
      <HomeCalculator cities={cities} />
      <HomeHowItWorks />
    </>
  );
}
