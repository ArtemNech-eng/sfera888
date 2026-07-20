import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchRealPrice } from "@/lib/api";
import { CenyView } from "@/components/ceny/CenyView";

// Данные зависят от рантайм-API; не пререндерим (ISR-кэш 5 мин в lib/api).
export const dynamic = "force-dynamic";

interface RouteParams {
  workSlug: string;
  citySlug: string;
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { workSlug, citySlug } = await params;
  const data = await fetchRealPrice(workSlug, citySlug).catch(() => null);
  if (!data) return { robots: { index: false, follow: false } };
  const agg = data.cityAggregate;
  const work = data.workType.name.toLowerCase();
  const title = `Сколько стоит ${work} в ${data.city.name} — реальные цены`;
  const description =
    agg && agg.n > 0
      ? `Реальные цены на ${work} в ${data.city.name} по ${agg.n} подтверждённым сделкам: медиана и диапазон P25–P75, динамика за 12 месяцев.`
      : `Цены на ${work} в ${data.city.name} — собираем по подтверждённым сделкам платформы.`;
  return {
    title,
    description,
    alternates: { canonical: `/ceny/${data.workType.slug}/${data.city.slug}` },
    // Не индексируем тонкие страницы без достаточного числа сделок (Req 4.4).
    robots: agg?.isIndexable ? undefined : { index: false, follow: true },
  };
}

export default async function CenyCityPage({ params }: { params: Promise<RouteParams> }) {
  const { workSlug, citySlug } = await params;
  const data = await fetchRealPrice(workSlug, citySlug).catch(() => null);
  if (!data) notFound();
  return <CenyView data={data} scope="city" />;
}
