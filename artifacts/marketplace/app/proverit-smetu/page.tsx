import type { Metadata } from "next";
import { fetchCities } from "@/lib/api";
import { CheckForm } from "@/components/ceny/CheckForm";
import { publicUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function toInt(v: string | string[] | undefined): number {
  const n = parseInt(String(one(v) ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 0;
}

/** Итог проверки, зашитый в ссылку при «Поделиться» (для превью и лендинга). */
function readShared(sp: Record<string, string | string[] | undefined>) {
  const g = toInt(sp.g);
  const y = toInt(sp.y);
  const r = toInt(sp.r);
  const u = toInt(sp.u);
  if (g + y + r + u === 0) return null;
  const cityName = (one(sp.cn) ?? "").trim().slice(0, 40) || null;
  return { g, y, r, u, cityName, total: g + y + r + u };
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const shared = readShared(sp);
  const base = publicUrl().replace(/\/+$/, "");
  const canonical = "/proverit-smetu";

  if (!shared) {
    return {
      title: "Проверить смету на ремонт — не завышена ли цена",
      description:
        "Вставьте позиции своей сметы — сравним каждую с реальными ценами подтверждённых сделок в вашем городе и покажем, где переплата.",
      alternates: { canonical },
    };
  }

  const cityLabel = shared.cityName ? ` в ${shared.cityName}` : "";
  const title = `Проверка сметы на ремонт${cityLabel}: ${shared.g} по рынку, ${shared.y} выше, ${shared.r} завышено`;
  const description =
    "Бесплатная проверка сметы против реальных цен подтверждённых сделок. Проверьте и свою — где переплата?";
  const ogParams = new URLSearchParams({
    g: String(shared.g),
    y: String(shared.y),
    r: String(shared.r),
    u: String(shared.u),
    ...(shared.cityName ? { city: shared.cityName } : {}),
  });
  const ogImage = `${base}/api/og/smeta?${ogParams.toString()}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: `${base}/proverit-smetu`,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function ProveritSmetuPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const shared = readShared(sp);
  const cities = await fetchCities()
    .then((cs) => cs.filter((c) => c.isLaunched && c.slug))
    .catch(() => []);
  const list = cities.map((c) => ({ slug: c.slug as string, name: c.name }));
  return (
    <CheckForm
      cities={list.length > 0 ? list : [{ slug: "krasnodar", name: "Краснодар" }]}
      shared={shared}
    />
  );
}
