import type { Metadata } from "next";
import { fetchRabotyList, fetchServices, fetchMasters } from "../lib/api";
import type { RabotyListItem, Service, Master } from "../lib/types";
import { HomeZen } from "../components/home/HomeZen";

// Skip prerender at build time — page depends on the marketplace API which is
// only available at runtime. ISR caching (5 min) lives in lib/api.ts.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Ремонт в Краснодаре — идеи, цены и мастера в одной ленте",
    description:
      "Городской сервис ремонта: реальные работы с ценами, AI-дизайн комнаты, сметы по ценам города и проверенные мастера рядом. Всё в одной ленте.",
    alternates: { canonical: "/" },
  };
}

/**
 * Главная в Zen-стиле (city-service нового поколения). Рендер вынесен в
 * `HomeZen` (общая Zen-дизайн-система из globals.css). Здесь — только серверный
 * сбор данных с per-source fallback: единичный сбой апстрима деградирует
 * соответствующую секцию, не валит страницу.
 */
export default async function HomePage() {
  const [cases, services, mastersResp] = await Promise.all([
    fetchRabotyList({ limit: 6 })
      .then((r) => r.items)
      .catch(() => [] as RabotyListItem[]),
    fetchServices().catch(() => [] as Service[]),
    fetchMasters({ limit: 4 })
      .then((r) => r.items)
      .catch(() => [] as Master[]),
  ]);

  return <HomeZen cases={cases} services={services} masters={mastersResp} />;
}
