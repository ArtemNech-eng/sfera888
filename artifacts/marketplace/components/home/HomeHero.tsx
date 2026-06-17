import Link from "next/link";

/**
 * Top-funnel home hero (plan §20.2 block [2]).
 *
 * Three equal CTAs map to the three planning entry points:
 *   1. Идеи      — visual inspiration (currently re-uses /raboty until /idei
 *                  ships in §11.11).
 *   2. AI-дизайн — killer feature, see §17.
 *   3. Калькулятор — top-funnel pricing entry, see §19.3.
 *
 * No photo background yet by design (plan §20.4: "real content only, no
 * Unsplash placeholders"). The visual interest comes from typography, soft
 * brand-coloured blobs and a gradient ribbon on the headline. As soon as we
 * have ≥6 published cases we'll layer a slideshow behind this block.
 */
export function HomeHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft brand-coloured blobs — pure decoration, hidden from AT. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-1/3 h-[28rem] w-[28rem] rounded-full bg-[var(--color-primary-soft)] opacity-60 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-0 h-80 w-80 rounded-full bg-[var(--color-accent-soft)] opacity-70 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-1/2 h-72 w-72 rounded-full bg-[var(--color-secondary-soft)] opacity-60 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-28">
        {/* Eyebrow tag */}
        <div className="mx-auto flex max-w-fit items-center gap-2 rounded-full border border-[var(--color-primary-ring)]/40 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)] backdrop-blur">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-primary)]" />
          </span>
          Планировщик ремонта
        </div>

        {/* Headline */}
        <h1 className="mx-auto mt-6 max-w-3xl text-center text-4xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-5xl lg:text-6xl">
          Спланируйте ремонт{" "}
          <span className="bg-gradient-to-r from-[var(--color-primary)] via-teal-500 to-[var(--color-accent)] bg-clip-text text-transparent">
            от идеи до мастера
          </span>
        </h1>

        {/* Subhead */}
        <p className="mx-auto mt-5 max-w-xl text-center text-base text-[var(--color-muted)] sm:text-lg">
          Бесплатно. За 5 минут. Без агрегаторов и спама — только проверенные мастера в вашем городе.
        </p>

        {/* Three multi-CTAs */}
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:mt-14 md:grid-cols-3 md:gap-6">
          <CtaCard
            href="/raboty"
            tint="indigo"
            badge="Идеи"
            title="Найдите дизайн, который нравится"
            blurb="Реальные ремонты с фото до и после, ценами и сроками."
            cta="Смотреть работы"
            icon={
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            }
          />
          <CtaCard
            href="/dizajn"
            tint="amber"
            badge="AI-дизайн"
            title="Ваша комната → ваш дизайн"
            blurb="Загрузите фото комнаты — получите визуализацию и смету."
            cta="Попробовать бесплатно"
            icon={
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M9.5 14.5 4 20" />
                <path d="m12 2 .94 3.06L16 6l-3.06.94L12 10l-.94-3.06L8 6l3.06-.94L12 2Z" />
                <path d="m20 14-1 3-3 1 3 1 1 3 1-3 3-1-3-1-1-3Z" />
              </svg>
            }
          />
          <CtaCard
            href="/uslugi"
            tint="teal"
            badge="Калькулятор"
            title="Узнайте бюджет за 30 секунд"
            blurb="Точная смета по реальным сделкам в вашем городе."
            cta="Рассчитать стоимость"
            icon={
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M8 7h8" />
                <path d="M8 12h2" />
                <path d="M14 12h2" />
                <path d="M8 17h2" />
                <path d="M14 17h2" />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  );
}

interface CtaCardProps {
  href: string;
  tint: "indigo" | "amber" | "teal";
  badge: string;
  title: string;
  blurb: string;
  cta: string;
  icon: React.ReactNode;
}

const TINT: Record<CtaCardProps["tint"], { ring: string; chipBg: string; chipText: string; iconBg: string; iconText: string; ctaText: string }> = {
  indigo: {
    ring: "hover:ring-[var(--color-secondary)]/40",
    chipBg: "bg-[var(--color-secondary-soft)]",
    chipText: "text-[var(--color-secondary)]",
    iconBg: "bg-[var(--color-secondary-soft)]",
    iconText: "text-[var(--color-secondary)]",
    ctaText: "text-[var(--color-secondary)]",
  },
  amber: {
    ring: "hover:ring-[var(--color-accent)]/40",
    chipBg: "bg-[var(--color-accent-soft)]",
    chipText: "text-[var(--color-accent-hover)]",
    iconBg: "bg-[var(--color-accent-soft)]",
    iconText: "text-[var(--color-accent-hover)]",
    ctaText: "text-[var(--color-accent-hover)]",
  },
  teal: {
    ring: "hover:ring-[var(--color-primary)]/40",
    chipBg: "bg-[var(--color-primary-soft)]",
    chipText: "text-[var(--color-primary)]",
    iconBg: "bg-[var(--color-primary-soft)]",
    iconText: "text-[var(--color-primary)]",
    ctaText: "text-[var(--color-primary)]",
  },
};

function CtaCard({ href, tint, badge, title, blurb, cta, icon }: CtaCardProps) {
  const t = TINT[tint];
  return (
    <Link
      href={href}
      className={`group relative flex flex-col gap-3 rounded-2xl bg-white/95 p-6 ring-1 ring-[var(--color-border)] shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-lg ${t.ring}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${t.iconBg} ${t.iconText}`}>
          {icon}
        </span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${t.chipBg} ${t.chipText}`}>
          {badge}
        </span>
      </div>
      <h2 className="text-lg font-bold leading-snug tracking-tight text-[var(--color-text)]">{title}</h2>
      <p className="text-sm text-[var(--color-muted)]">{blurb}</p>
      <span className={`mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-semibold transition-all group-hover:gap-2.5 ${t.ctaText}`}>
        {cta}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </span>
    </Link>
  );
}
