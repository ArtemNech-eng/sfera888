import Link from "next/link";
import { DEMO_CASES } from "../../lib/demoCases";

/**
 * Scandi-warm hero (plan §21 scandi iteration).
 *
 * Three-photo collage stays. Removed the handwritten kicker and clay
 * accents — replaced with a quiet eyebrow label and sage-eucalyptus
 * primary. Reads grown-up and well-made instead of blog-cute.
 */
export function HomeHero() {
  const collage = [
    DEMO_CASES[1],
    DEMO_CASES[0],
    DEMO_CASES[3],
  ].filter((d): d is NonNullable<typeof d> => Boolean(d));

  return (
    <section className="relative overflow-hidden bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:pb-24 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr,1fr] lg:gap-14">
          {/* ── Left: copy ──────────────────────────────────────────── */}
          <div className="flex flex-col">
            <p className="font-eyebrow">Планировщик ремонта</p>

            <h1 className="font-editorial mt-5 text-3xl text-[var(--color-text)] sm:text-4xl lg:text-5xl">
              Спланируйте ремонт прежде, чем искать мастера.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--color-muted)]">
              Реальные ремонты с фото и ценами, AI-визуализация интерьера и
              калькулятор по фактическим сделкам. Подбор проверенных мастеров
              остаётся на потом — когда вы уже знаете, чего хотите.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryCta href="/raboty" label="Смотреть идеи" />
              <SecondaryCta href="/dizajn" label="AI-дизайн" />
              <SecondaryCta href="/kalkulyator" label="Калькулятор" />
            </div>

            <p className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--color-faint)]">
              <FootnoteItem>Договор на каждую работу</FootnoteItem>
              <FootnoteItem>Без авансов до выезда</FootnoteItem>
              <FootnoteItem>Бесплатно, без регистрации</FootnoteItem>
            </p>
          </div>

          {/* ── Right: 3-photo collage ──────────────────────────────── */}
          <div className="relative grid h-[22rem] grid-cols-2 grid-rows-2 gap-3 sm:h-[26rem] sm:gap-4 lg:h-auto lg:aspect-[5/4]">
            <CollageTile data={collage[0]!} className="row-span-2" />
            <CollageTile data={collage[1]!} />
            <CollageTile data={collage[2]!} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CTA buttons ──────────────────────────────────────────────────────────────

function PrimaryCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-7 py-3.5 text-sm font-semibold tracking-wide text-white shadow-cozy transition hover:bg-[var(--color-primary-hover)] hover:shadow-cozy-md"
    >
      {label}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-transform group-hover:translate-x-0.5"
        aria-hidden
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </Link>
  );
}

function SecondaryCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-6 py-3.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-text)]"
    >
      {label}
    </Link>
  );
}

function FootnoteItem({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--color-primary)]"
        aria-hidden
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {children}
    </span>
  );
}

// ── Collage tile ─────────────────────────────────────────────────────────────

function CollageTile({
  data,
  className = "",
}: {
  data: (typeof DEMO_CASES)[number];
  className?: string;
}) {
  return (
    <Link
      href="/raboty"
      className={`group relative overflow-hidden rounded-xl bg-[var(--color-border)] shadow-cozy transition hover:shadow-cozy-md ${className}`}
    >
      <img
        src={data.imageUrl}
        alt={data.alt}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <span className="absolute bottom-3 left-3 inline-flex rounded bg-[var(--color-surface)]/95 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text)]">
        {data.category}
      </span>
    </Link>
  );
}
