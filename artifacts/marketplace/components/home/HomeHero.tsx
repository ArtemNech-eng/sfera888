import Link from "next/link";
import { DEMO_CASES } from "../../lib/demoCases";

/**
 * Editorial hero (plan §20.2 block [2], §21 visual direction).
 *
 * Houzz / AD-style: large serif headline carries the page, supporting
 * paragraph reads as a lead, three CTAs sit below. Right column is a
 * 3-photo collage rendered without rounded corners and minimal chrome —
 * looks like a magazine spread, not a product card.
 *
 * Photo collage uses Unsplash CC0 references until masters publish their
 * own work (plan §20.4 photo policy). Each tile clicks through to /raboty.
 */
export function HomeHero() {
  const collage = [
    DEMO_CASES[1], // wide composition — left column, full height
    DEMO_CASES[0], // top-right
    DEMO_CASES[3], // bottom-right
  ].filter((d): d is NonNullable<typeof d> => Boolean(d));

  return (
    <section className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:pt-28">
        <div className="grid gap-12 lg:grid-cols-[1.1fr,1fr] lg:gap-16">
          {/* ── Left: editorial copy ─────────────────────────────────── */}
          <div className="flex flex-col">
            <p className="font-eyebrow">
              Планировщик ремонта
            </p>

            <h1 className="font-editorial mt-5 text-5xl text-[var(--color-text)] sm:text-6xl lg:text-[4.5rem]">
              Спланируйте ремонт прежде, чем искать мастера.
            </h1>

            <p className="mt-7 max-w-xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
              Реальные ремонты с фото и ценами, AI-визуализация интерьера и
              калькулятор по фактическим сделкам. Подбор проверенных мастеров
              остаётся на потом — когда вы уже знаете, чего хотите.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <PrimaryCta href="/raboty" label="Смотреть идеи" />
              <SecondaryCta href="/dizajn" label="AI-дизайн" />
              <SecondaryCta href="/kalkulyator" label="Калькулятор" />
            </div>

            <p className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--color-faint)]">
              <FootnoteItem>Договор на каждую работу</FootnoteItem>
              <FootnoteItem>Без авансов до выезда</FootnoteItem>
              <FootnoteItem>Бесплатно, без регистрации</FootnoteItem>
            </p>
          </div>

          {/* ── Right: photo collage (no rounded corners, no shadows) ── */}
          <div className="relative grid h-[26rem] grid-cols-2 grid-rows-2 gap-3 sm:h-[32rem] sm:gap-4 lg:h-auto lg:aspect-[4/5]">
            <CollageTile data={collage[0]!} className="row-span-2" />
            <CollageTile data={collage[1]!} />
            <CollageTile data={collage[2]!} />

            <span className="absolute right-3 top-3 inline-flex items-center gap-1 bg-[var(--color-text)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
              Идеи
            </span>
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
      className="group inline-flex items-center gap-2 bg-[var(--color-text)] px-7 py-3.5 text-sm font-semibold tracking-wide text-white transition hover:bg-[var(--color-primary)]"
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
      className="inline-flex items-center gap-2 border border-[var(--color-border-strong)] bg-transparent px-6 py-3.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-text)]"
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
      className={`group relative overflow-hidden bg-[var(--color-border)] transition ${className}`}
    >
      <img
        src={data.imageUrl}
        alt={data.alt}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <span className="absolute bottom-3 left-3 inline-flex bg-[var(--color-surface)]/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text)]">
        {data.category}
      </span>
    </Link>
  );
}
