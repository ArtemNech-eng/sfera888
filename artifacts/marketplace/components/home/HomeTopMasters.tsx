import Link from "next/link";
import type { Master } from "../../lib/types";
import { MasterCard } from "../MasterCard";

interface Props {
  masters: Master[];
}

/**
 * «Лучшие мастера месяца» (план §22.4 п.4).
 *
 * Намеренно не главный фокус — основной товар платформы это РЕЗУЛЬТАТ
 * РЕМОНТА (см. ObjectCard и блок «Популярные объекты»). Мастера — поддерживающая
 * секция, чтобы пользователь видел, что за идеями стоят реальные люди.
 *
 * Стилистика — portal-grade (никаких uppercase/tracking-wider от старой
 * палитры), consistent с HomePopularObjects и HomeIdeasCategories.
 *
 * Скрывается при <3 опубликованных мастерах — пустая сетка ломает доверие.
 */
export function HomeTopMasters({ masters }: Props) {
  if (masters.length < 3) return null;

  // 4 на главной — компактно, не отнимает воздух у объектов
  const visible = masters.slice(0, 4);

  return (
    <section className="bg-[var(--color-cream-deep)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-eyebrow">Подбор</p>
            <h2 className="font-editorial mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
              Лучшие мастера месяца.
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--color-muted)]">
              Те, чьи работы сохраняют чаще всего. Каждый прошёл собеседование,
              работает по договору, без авансов.
            </p>
          </div>
          <Link
            href="/mastera"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4 transition hover:decoration-[var(--color-text)] sm:inline"
          >
            Все мастера →
          </Link>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {visible.map((master) => (
            <li key={master.id}>
              <MasterCard master={master} />
            </li>
          ))}
        </ul>

        <div className="mt-8 sm:hidden">
          <Link
            href="/mastera"
            className="text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4"
          >
            Все мастера →
          </Link>
        </div>
      </div>
    </section>
  );
}
