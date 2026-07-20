import Link from "next/link";
import type { RabotyListItem } from "../../lib/types";
import { DEMO_CASES } from "../../lib/demoCases";
import { CaseCard } from "../CaseCard";

interface Props {
  cases: RabotyListItem[];
}

/**
 * «Популярные объекты» — главный inspiration-блок главной (home-magazine-redesign).
 *
 * 4 col на desktop (sm:2, md:3, lg:4) с mixed aspect ratios — карточки
 * варьируются 4:5/4:3/1:1 по `index % 3`, что даёт masonry-feel без CSS columns
 * (избегаем visual gaps на keyboard navigation).
 *
 * Когда реальных кейсов <3 → показываем 8 demo-карточек со стилевыми
 * референсами (Unsplash CC0). Они помечены бейджем «Пример», без счётчиков
 * и без price.
 */
export function HomePopularObjects({ cases }: Props) {
  const isDemoMode = cases.length < 3;
  const realVisible = cases.slice(0, 12);

  if (!isDemoMode && realVisible.length === 0) return null;

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
              {isDemoMode
                ? "Стилевые референсы, чтобы было от чего оттолкнуться."
                : "Ремонты, которые хочется повторить."}
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--color-muted)]">
              {isDemoMode
                ? "Пока мастера наполняют каталог — это подборка идей в нашем стиле."
                : "Сохраните идею в свою подборку. Подбор мастера, который повторит — на странице каждой работы."}
            </p>
          </div>
          <Link
            href="/raboty"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-text)] decoration-2 underline-offset-4 transition hover:text-[var(--color-primary)] hover:decoration-[var(--color-primary)] sm:inline"
          >
            Все ремонты →
          </Link>
        </div>

        <ul className="mt-10 masonry">
          {isDemoMode
            ? DEMO_CASES.slice(0, 8).map((d, idx) => (
                <li key={d.id} className="masonry-item">
                  <CaseCard
                    href="/raboty"
                    cover={d.imageUrl}
                    title={d.title}
                    alt={d.alt}
                    metaParts={[d.category]}
                    priceLabel={null}
                    aspectVariant={pickAspect(idx)}
                  />
                </li>
              ))
            : realVisible.map((c, idx) => (
                <li key={c.id} className="masonry-item">
                  <CaseCard
                    {...rabotyToCaseCardProps(c)}
                    aspectVariant={pickAspect(idx)}
                  />
                </li>
              ))}
        </ul>

        <div className="mt-8 sm:hidden">
          <Link
            href="/raboty"
            className="text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-text)] decoration-2 underline-offset-4"
          >
            Все ремонты →
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Variation across the grid: 4:5 portrait (default), 4:3 landscape, 1:1 square. */
function pickAspect(idx: number): "4:5" | "4:3" | "1:1" {
  const m = idx % 3;
  if (m === 0) return "4:5";
  if (m === 1) return "4:3";
  return "1:1";
}

/**
 * Преобразует RabotyListItem (тип API) в пропы CaseCard. Тонкая обёртка
 * чтобы не дублировать маппинг между home / raboty / master pages.
 */
function rabotyToCaseCardProps(item: RabotyListItem) {
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const priceFrom = parseNumeric(item.priceFrom);
  const area = parseNumeric(item.area);
  const cityName = item.city?.name ?? item.master.city ?? null;
  const masterName =
    item.master.publicTitle?.trim() ||
    item.master.alias?.trim() ||
    `Мастер #${item.master.id}`;

  return {
    href: `/raboty/${item.slug}`,
    cover,
    title: item.title,
    alt: `${item.title}${cityName ? ` в ${cityName}` : ""} — фото ремонта`,
    metaParts: [
      cityName,
      area != null ? `${area} м²` : null,
      masterName,
    ],
    priceLabel: priceFrom != null ? `от ${formatNumber(priceFrom)} ₽` : null,
    badge: item.isFeatured ? ({ tone: "featured" as const, label: "Топ" }) : null,
    views: null,
    saves: item.saveCount,
  };
}

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}
