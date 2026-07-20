import type { Metadata } from "next";
import { fetchCities } from "@/lib/api";
import { CheckForm } from "@/components/ceny/CheckForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Проверить смету на ремонт — не завышена ли цена",
  description:
    "Вставьте позиции своей сметы — сравним каждую с реальными ценами подтверждённых сделок в вашем городе и покажем, где переплата.",
  alternates: { canonical: "/proverit-smetu" },
};

export default async function ProveritSmetuPage() {
  const cities = await fetchCities()
    .then((cs) => cs.filter((c) => c.isLaunched && c.slug))
    .catch(() => []);
  const list = cities.map((c) => ({ slug: c.slug as string, name: c.name }));
  return <CheckForm cities={list.length > 0 ? list : [{ slug: "krasnodar", name: "Краснодар" }]} />;
}
