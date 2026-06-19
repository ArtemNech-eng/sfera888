import type { Metadata } from "next";
import { fetchRabotyList } from "../lib/api";
import type { RabotyListItem } from "../lib/types";
import { HomeHero } from "../components/home/HomeHero";
import { HomePopularNow } from "../components/home/HomePopularNow";
import { HomePopularObjects } from "../components/home/HomePopularObjects";
import { HomeAIDesigns } from "../components/home/HomeAIDesigns";
import { HomeQuestions } from "../components/home/HomeQuestions";
import { HomeForMasters } from "../components/home/HomeForMasters";

// Skip prerender at build time — page depends on the marketplace API which is
// only available at runtime. ISR caching (5 min) lives in lib/api.ts.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Найдите ремонт, который хотите повторить",
    description:
      "Тысячи реальных ремонтов и AI-дизайнов с ценами, сроками и мастерами. Понравился объект — нажмите «Хочу такой же», подберём мастера, который сделает похоже.",
    alternates: { canonical: "/" },
  };
}

/**
 * Magazine homepage (home-magazine-redesign).
 *
 * Стратегия v3: главный товар — РЕЗУЛЬТАТ РЕМОНТА. Не каталог мастеров.
 * Pinterest-журнал ремонтов с 4-слойной контент-моделью:
 *   • L1 AI-дизайны (главный SEO-двигатель, ~100К страниц через комбинаторику)
 *   • L2 Listicles (отложено, редакторский = медленно)
 *   • L3 Q&A «Спроси мастера» (новый SEO-канал)
 *   • L4 Профили мастеров (B2B-фокус)
 *
 * Порядок секций (6 экранов):
 *   1. Hero            — Lora H1 + photo-collage + один primary CTA
 *   2. Популярное сейчас — filter pills (Pinterest-style discovery)
 *   3. Популярные объекты — главный inspiration-блок (mixed aspect grid)
 *   4. AI-дизайн teaser — «Создайте свой дизайн комнаты»
 *   5. Q&A featured     — один вопрос-ответ от мастера-эксперта (SO-style card)
 *   6. Для мастеров     — B2B CTA-блок, ведёт на sfera-master.ru/masteram
 *
 * Удалены из render'а (файлы оставлены): HomeIdeasCategories, HomeTopMasters,
 * HomeCalculator, HomeHowItWorks, HomePricingTable. Pricing вернётся когда
 * будет достаточно опубликованных кейсов на каждый bucket для live-агрегации
 * через `/api/marketplace/raboty/market-stats`.
 *
 * Backend feed: один параллельный fetch (cases для главного блока).
 * Per-source fallback — единичный сбой UPstream деградирует только эту
 * секцию, не валит главную.
 */
export default async function HomePage() {
  const [cases] = await Promise.all([
    fetchRabotyList({ limit: 12 })
      .then((r) => r.items)
      .catch(() => [] as RabotyListItem[]),
  ]);

  return (
    <>
      <HomeHero />
      <HomePopularNow />
      <HomePopularObjects cases={cases} />
      <HomeAIDesigns />
      <HomeQuestions />
      <HomeForMasters />
    </>
  );
}
