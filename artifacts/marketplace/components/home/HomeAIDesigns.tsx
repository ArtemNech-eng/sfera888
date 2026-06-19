import Link from "next/link";
import { ROOM_CATEGORIES } from "../../lib/demoCases";

/**
 * AI-дизайн teaser (home-magazine-redesign).
 *
 * Содержательный посыл: «Создайте свой дизайн комнаты», не «попробуйте
 * стили». В стратегии v3 AI-дизайны = главный SEO-двигатель, контент
 * который генерируют сами пользователи (~100К страниц через комбинаторику).
 *
 * Photo-led teaser: 3 style-cards с before/after хинтом + один primary CTA
 * в `/dizajn`. Сама генерация — отдельный спек (Fal.ai/Replicate backend).
 */

interface Style {
  label: string;
  imageUrl: string;
  alt: string;
}

const STYLES: Style[] = [
  {
    label: "Современный",
    imageUrl: ROOM_CATEGORIES.find((r) => r.slug === "kuhnya")!.imageUrl,
    alt: "Современный стиль интерьера",
  },
  {
    label: "Минимализм",
    imageUrl: ROOM_CATEGORIES.find((r) => r.slug === "spalnya")!.imageUrl,
    alt: "Минималистичный стиль интерьера",
  },
  {
    label: "Лофт",
    imageUrl: ROOM_CATEGORIES.find((r) => r.slug === "gostinaya")!.imageUrl,
    alt: "Лофт-стиль интерьера",
  },
];

export function HomeAIDesigns() {
  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="font-eyebrow">✨ AI-дизайн</p>
          <h2 className="font-display mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
            Создайте свой дизайн комнаты.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-muted)]">
            Загрузите фото своей комнаты — покажем, как она будет выглядеть в
            выбранном стиле. Сохраните дизайн и подберите мастера, который его
            повторит.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {STYLES.map((style) => (
            <li key={style.label}>
              <Link
                href={`/dizajn?style=${encodeURIComponent(style.label.toLowerCase())}`}
                className="group block focus:outline-none"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy transition group-hover:shadow-cozy-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={style.imageUrl}
                    alt={style.alt}
                    loading="lazy"
                    className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4 sm:p-5">
                    <p className="text-base font-semibold text-white sm:text-lg">
                      {style.label}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <Link
            href="/dizajn"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-7 text-base font-semibold text-white shadow-cozy-md transition hover:bg-[var(--color-primary-hover)]"
          >
            Попробовать AI-дизайн
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
