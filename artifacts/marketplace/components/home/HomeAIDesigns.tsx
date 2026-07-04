import Link from "next/link";
import { ROOM_CATEGORIES } from "../../lib/demoCases";
import { fetchRecentDesigns } from "../../lib/api";

/**
 * AI-дизайн teaser (home-magazine-redesign + AI-designer Iter 1).
 *
 * Server-component с live-feed недавних опубликованных дизайнов через
 * `fetchRecentDesigns`. Когда дизайнов мало (<3) — рендерим placeholder
 * style-cards (Unsplash CC0 рефересы), как в первой версии.
 *
 * После Iter 1 AI-designer: пользователи реально создают дизайны —
 * HomeAIDesigns показывает их живыми примерами.
 */

const STYLE_PLACEHOLDERS = [
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

export async function HomeAIDesigns() {
  const recent = await fetchRecentDesigns({ limit: 3 }).catch(() => []);
  const showLive = recent.length >= 3;

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="font-eyebrow">AI-дизайн · вдохновение</p>
          <h2 className="font-display mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
            Создайте свой дизайн комнаты.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-muted)]">
            Загрузите фото своей комнаты — AI нарисует 4 ракурса в выбранном
            стиле, подберёт материалы и составит смету. Сохраните дизайн и
            подберите мастера, который его повторит.
          </p>
          {/* Requirements 14.2, 14.3: AI-контент — вспомогательный слой
              (вдохновение и платная утилита), а НЕ основное доказательство
              доверия. Доверие формирует живое сообщество и реальные работы
              (см. HomeTrustBlock / реальные кейсы), а не галерея AI-изображений. */}
          <p className="mt-4 inline-flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-muted)]">
            <span aria-hidden className="mt-0.5 text-[var(--color-primary)]">✨</span>
            <span>
              AI-дизайн — это <strong className="font-semibold text-[var(--color-text)]">вдохновение</strong> и платная
              утилита, а не доказательство качества. Доверие подтверждают реальные
              работы мастеров и живое сообщество соседей.
            </span>
          </p>
        </div>

        <ul aria-label="Примеры AI-дизайна (вдохновение)" className="mt-10 grid gap-4 sm:grid-cols-3">
          {showLive
            ? recent.slice(0, 3).map((d) => (
                <li key={d.id}>
                  <Link href={`/dizajn/${d.slug}`} className="group block focus:outline-none">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy transition group-hover:shadow-cozy-md">
                      {d.resultImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.resultImageUrl}
                          alt={d.h1 ?? `Дизайн ${d.roomType}`}
                          loading="lazy"
                          className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                        />
                      ) : null}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4 sm:p-5">
                        <p className="line-clamp-2 text-sm font-semibold text-white sm:text-base">
                          {d.h1 ?? `Дизайн ${d.roomType}`}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))
            : STYLE_PLACEHOLDERS.map((style) => (
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
            className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--color-text)] bg-transparent px-7 text-base font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white"
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
