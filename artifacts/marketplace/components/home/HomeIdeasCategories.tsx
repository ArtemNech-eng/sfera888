import Link from "next/link";
import { ROOM_CATEGORIES, type RoomCategory } from "../../lib/demoCases";

/**
 * Scandi-warm room-categories rail (plan §21 scandi iteration).
 *
 * Six rooms as photo cards with rounded-xl corners and soft warm shadows.
 * Replaces the handwritten kicker with a structural eyebrow label.
 *
 * Server component, zero JS.
 */
export function HomeIdeasCategories() {
  return (
    <section className="bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-eyebrow">Идеи по комнатам</p>
            <h2 className="font-editorial mt-4 text-3xl text-[var(--color-text)] sm:text-4xl">
              С чего начнём ремонт?
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--color-muted)]">
              Выберите комнату — покажем подборку идей, проверенных мастеров
              и средний бюджет работ для вашего города.
            </p>
          </div>
          <Link
            href="/raboty"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4 transition hover:decoration-[var(--color-text)] sm:inline"
          >
            Все идеи →
          </Link>
        </div>

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
          {ROOM_CATEGORIES.map((category) => (
            <li key={category.slug}>
              <CategoryCard category={category} />
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

function CategoryCard({ category }: { category: RoomCategory }) {
  return (
    <Link
      href="/raboty"
      className="group block"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-[var(--color-border)] shadow-cozy transition group-hover:shadow-cozy-md">
        <img
          src={category.imageUrl}
          alt={category.alt}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
      </div>
      <div className="mt-3 px-1">
        <h3 className="text-sm font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
          {category.label}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-muted)]">
          {category.blurb}
        </p>
      </div>
    </Link>
  );
}
