import Link from "next/link";
import { ROOM_CATEGORIES, type RoomCategory } from "../../lib/demoCases";

/**
 * "Идеи по комнатам" rail — 6 large visual category cards (plan §20.2 [3]).
 *
 * This block replaces the old plain "Популярные услуги" 9-grid. Houzz /
 * Lovi-Insite / INMYROOM all surface room categories above the fold because
 * "Я хочу обновить кухню" is the way most users actually start a planning
 * session. Generic skilled trades ("Демонтажные работы", "Электромонтаж")
 * are second-order detail and live on /uslugi.
 *
 * Cards link to `/raboty` for now and to `/idei/{slug}` once §11.11 ships.
 *
 * Server component, zero JS.
 */
export function HomeIdeasCategories() {
  return (
    <section className="border-y border-[var(--color-border)] bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
              Идеи
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
              С чего начнём ремонт?
            </h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)] sm:text-base">
              Выберите комнату — покажем подборку идей, проверенных мастеров
              и средний бюджет работ для вашего города.
            </p>
          </div>
          <Link
            href="/raboty"
            className="hidden text-sm font-semibold text-[var(--color-secondary)] hover:underline sm:inline"
          >
            Все идеи →
          </Link>
        </div>

        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {ROOM_CATEGORIES.map((category) => (
            <li key={category.slug}>
              <CategoryCard category={category} />
            </li>
          ))}
        </ul>

        <div className="mt-6 sm:hidden">
          <Link
            href="/raboty"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-secondary)]"
          >
            Все идеи →
          </Link>
        </div>
      </div>
    </section>
  );
}

function CategoryCard({ category }: { category: RoomCategory }) {
  return (
    <Link
      href="/raboty"
      className="group relative block overflow-hidden rounded-2xl bg-[var(--color-background)] shadow-sm ring-1 ring-[var(--color-border)] transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-[var(--color-secondary)]"
    >
      <div className="aspect-[4/5] w-full overflow-hidden">
        <img
          src={category.imageUrl}
          alt={category.alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
      <div className="absolute inset-x-3 bottom-3">
        <h3 className="text-base font-bold text-white drop-shadow sm:text-lg">
          {category.label}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-white/85 sm:text-xs">
          {category.blurb}
        </p>
      </div>
    </Link>
  );
}
