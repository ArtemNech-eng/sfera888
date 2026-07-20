import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchRealPrice } from "@/lib/api";
import { CenyView } from "@/components/ceny/CenyView";

export const dynamic = "force-dynamic";

interface RouteParams {
  workSlug: string;
  citySlug: string;
  zhk: string;
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { workSlug, citySlug, zhk: zhkRaw } = await params;
  const zhk = decodeURIComponent(zhkRaw);
  const data = await fetchRealPrice(workSlug, citySlug).catch(() => null);
  if (!data) return { robots: { index: false, follow: false } };
  const agg = data.zhk.find((z) => z.district === zhk) ?? null;
  const work = data.workType.name.toLowerCase();
  const title = `Сколько стоит ${work} в ${zhk}, ${data.city.name} — реальные цены`;
  const description =
    agg && agg.n > 0
      ? `Реальные цены на ${work} в ${zhk} (${data.city.name}) по ${agg.n} подтверждённым сделкам: медиана и диапазон.`
      : `Цены на ${work} в ${zhk} (${data.city.name}) — собираем по подтверждённым сделкам.`;
  return {
    title,
    description,
    alternates: { canonical: `/ceny/${data.workType.slug}/${data.city.slug}/${encodeURIComponent(zhk)}` },
    robots: agg?.isIndexable ? undefined : { index: false, follow: true },
  };
}

export default async function CenyZhkPage({ params }: { params: Promise<RouteParams> }) {
  const { workSlug, citySlug, zhk: zhkRaw } = await params;
  const zhk = decodeURIComponent(zhkRaw);
  const data = await fetchRealPrice(workSlug, citySlug).catch(() => null);
  if (!data) notFound();
  // Нет агрегата по этому ЖК — не создаём тонкую страницу.
  if (!data.zhk.some((z) => z.district === zhk)) notFound();
  return <CenyView data={data} scope="zhk" zhkName={zhk} />;
}
