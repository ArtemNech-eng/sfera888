import Link from "next/link";
import { ROOM_CATEGORIES } from "../../lib/demoCases";

/**
 * Magazine hero (home-magazine-redesign).
 *
 * Принципы:
 *   • один-единственный месседж: «Найдите ремонт, который хотите повторить»
 *   • Fraunces serif H1 — журнальный тон, не utility-portal
 *   • photo-collage 3 фото asymmetric — главная визуальная зона
 *   • один primary CTA, никаких search-bar / 4 chips / stats-line
 *   • счётчики «1 ремонтов · 3 городов» убраны полностью — пока данных
 *     мало они психологически убивают доверие
 *
 * Photo collage использует существующие Unsplash-референсы из ROOM_CATEGORIES
 * (CC0). Когда мастера наполнят каталог — заменим на реальные кейсы из feed'а.
 */
export function HomeHero() {
  // 3 фото для asymmetric collage: 1 большое (4:5 portrait) + 2 узких (1:1).
  // Подобраны так, чтобы стилистически читались как «один разворот журнала».
  const cover = ROOM_CATEGORIES.find((r) => r.slug === "kuhnya")!;
  const top = ROOM_CATEGORIES.find((r) => r.slug === "vannaya")!;
  const bottom = ROOM_CATEGORIES.find((r) => r.slug === "gostinaya")!;

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,_1fr)_minmax(0,_1.05fr)] lg:gap-14">
          {/* ── Headline column ─────────────────────────────── */}
          <div>
            <h1 className="font-display text-[2.4rem] text-[var(--color-text)] sm:text-5xl lg:text-[3.5rem]">
              Найдите ремонт,
              <br />
              который хотите
              <br />
              повторить.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
              Тысячи реальных ремонтов и AI-дизайнов с ценами, сроками и
              мастерами. Понравился объект — нажмите «Хочу такой же».
            </p>
            <div className="mt-7">
              <Link
                href="/raboty"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-7 text-base font-semibold text-white shadow-cozy-md transition hover:bg-[var(--color-primary-hover)]"
              >
                Смотреть ремонты
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          {/* ── Photo collage column ────────────────────────── */}
          <div className="grid grid-cols-5 gap-3 sm:gap-4">
            {/* Big centerpiece (4:5 portrait, takes 3 columns, full height) */}
            <div className="col-span-3 row-span-2 overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy">
              <div className="relative aspect-[4/5] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.imageUrl}
                  alt={cover.alt}
                  loading="eager"
                  className="block h-full w-full object-cover"
                />
              </div>
            </div>
            {/* Top-right (1:1) */}
            <div className="col-span-2 overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy">
              <div className="relative aspect-[1/1] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={top.imageUrl}
                  alt={top.alt}
                  loading="eager"
                  className="block h-full w-full object-cover"
                />
              </div>
            </div>
            {/* Bottom-right (1:1) */}
            <div className="col-span-2 overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy">
              <div className="relative aspect-[1/1] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bottom.imageUrl}
                  alt={bottom.alt}
                  loading="eager"
                  className="block h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
