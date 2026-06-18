import Link from "next/link";

interface CaseAIDesignsProps {
  /** room slug used to deep-link into /dizajn/new with a preset (e.g. 'vannaya'). */
  roomSlug: string | null;
}

/**
 * AI-design suggestions block (plan §22, Requirement 8).
 *
 * Iteration 1 — three style stubs (Современный / Минимализм / Лофт). Each
 * card deep-links into `/dizajn/new?style=…&room=…` so when the AI visualiser
 * lands (Phase 8) the funnel is already wired.
 *
 * Server component, no JS.
 */
export function CaseAIDesigns({ roomSlug }: CaseAIDesignsProps) {
  const presets = STYLE_PRESETS.map((s) => ({
    ...s,
    href: roomSlug
      ? `/dizajn/new?style=${s.slug}&room=${roomSlug}`
      : `/dizajn/new?style=${s.slug}`,
  }));

  return (
    <section className="bg-[var(--color-cream-deep)]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="font-eyebrow">AI-дизайн</p>
            <h2 className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
              Похожие идеи дизайна.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
              Загрузите фото своей комнаты — AI покажет, как она будет выглядеть в выбранном стиле.
            </p>
          </div>
          <Link
            href="/dizajn"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4 transition hover:decoration-[var(--color-text)] sm:inline"
          >
            Все стили →
          </Link>
        </div>

        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {presets.map((preset) => (
            <li key={preset.slug}>
              <Link href={preset.href} className="group block">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--color-border)] shadow-cozy transition group-hover:shadow-cozy-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preset.imageUrl}
                    alt={preset.alt}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-surface)]/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                    AI
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 px-1">
                  <h3 className="text-base font-semibold text-[var(--color-text)] transition group-hover:text-[var(--color-primary)]">
                    {preset.label}
                  </h3>
                  <span className="text-sm font-semibold text-[var(--color-primary)] opacity-0 transition group-hover:opacity-100">
                    Попробовать →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-6 sm:hidden">
          <Link
            href="/dizajn"
            className="text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4"
          >
            Все стили →
          </Link>
        </div>
      </div>
    </section>
  );
}

const UNSPLASH = "w=900&q=80&auto=format&fit=crop&crop=entropy";

const STYLE_PRESETS = [
  {
    slug: "sovremennyy",
    label: "Современный",
    imageUrl: `https://images.unsplash.com/photo-1600210492493-0946911123c4?${UNSPLASH}`,
    alt: "Современный стиль интерьера — пример AI-дизайна",
  },
  {
    slug: "minimalizm",
    label: "Минимализм",
    imageUrl: `https://images.unsplash.com/photo-1616594039964-ae9021a400a0?${UNSPLASH}`,
    alt: "Минималистичный стиль интерьера — пример AI-дизайна",
  },
  {
    slug: "loft",
    label: "Лофт",
    imageUrl: `https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?${UNSPLASH}`,
    alt: "Лофт-стиль интерьера — пример AI-дизайна",
  },
] as const;
