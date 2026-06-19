import Link from "next/link";
import type { RabotyListItem } from "../../lib/types";
import { DEMO_CASES } from "../../lib/demoCases";
import { CaseCard } from "../CaseCard";

interface Props {
  cases: RabotyListItem[];
}

/**
 * «Популярные объекты» — главный блок главной (план §22.4 п.2).
 *
 * Заменяет старый HomeRecentCases. Использует CaseCard как central UI primitive
 * платформы — каждый кейс трактуется как ОБЪЕКТ (результат ремонта), не как
 * текстовая карточка работы мастера.
 *
 * Когда реальных кейсов <3 → показываем 6 demo-карточек со стилевыми
 * референсами (Unsplash CC0). Они помечены бейджем «Пример», без счётчиков
 * и без price — чтобы не путать с реальными кейсами.
 */
export function HomePopularObjects({ cases }: Props) {
  const isDemoMode = cases.length < 3;
  const realVisible = cases.slice(0, 9);

  if (!isDemoMode && realVisible.length === 0) return null;

  return (
    <section className="bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-eyebrow">{isDemoMode ? "Идеи" : "Популярные объекты"}</p>
            <h2 className="font-editorial mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
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
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4 transition hover:decoration-[var(--color-text)] sm:inline"
          >
            Все идеи →
          </Link>
        </div>

        <ul className="mt-10 grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {isDemoMode
            ? DEMO_CASES.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <CaseCard
                    href="/raboty"
                    cover={d.imageUrl}
                    title={d.title}
                    alt={d.alt}
                    metaParts={[d.category, "стилевой референс"]}
                    priceLabel={null}
                    badge={{ tone: "demo", label: "Пример" }}
                  />
                </li>
              ))
            : realVisible.map((c) => (
                <li key={c.id}>
                  <CaseCard {...rabotyToCaseCardProps(c)} />
                </li>
              ))}
        </ul>

        <div className="mt-8 sm:hidden">
          <Link
            href="/raboty"
            className="text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4"
          >
            Все идеи →
          </Link>
        </div>
      </div>
    </section>
  );
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
