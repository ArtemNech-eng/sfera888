import type { Metadata } from "next";
import { fetchPriceIndex } from "@/lib/api";
import { IndexView } from "@/components/indeks/IndexView";
import type { PriceIndexResponse } from "@/lib/types";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Индекс цен на ремонт — как меняются цены по месяцам",
  description:
    "Индекс реальных цен на ремонт по подтверждённым сделкам: уровень цен по месяцам и кварталам. Национальный уровень и Краснодар.",
  alternates: { canonical: "/indeks" },
};

/**
 * `/indeks` — индекс цен на ремонт (Real Price, Req 8). v0: национальный уровень
 * + Краснодар. Данные из подтверждённых сделок (price_points), уровень по месяцам.
 */
export default async function IndeksPage() {
  const [national, krasnodar] = await Promise.all([
    fetchPriceIndex().catch(() => null),
    fetchPriceIndex("krasnodar").catch(() => null),
  ]);

  const scopes: PriceIndexResponse[] = [];
  if (national) scopes.push(national);
  if (krasnodar && krasnodar.totalDeals > 0) scopes.push(krasnodar);

  return <IndexView scopes={scopes} />;
}
