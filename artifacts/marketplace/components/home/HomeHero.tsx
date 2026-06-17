import Link from "next/link";
import { DEMO_CASES } from "../../lib/demoCases";

/**
 * Top-funnel home hero (plan §20.2 block [2]).
 *
 * Houzz-style split layout: text + three CTAs on the left, a 2×2 photo
 * collage on the right. Mobile collapses to a stack with the collage moving
 * below the CTAs.
 *
 * Three equal CTAs map to the three planning entry points:
 *   1. Идеи      — visual inspiration (currently re-uses /raboty until /idei
 *                  ships in §11.11).
 *   2. AI-дизайн — killer feature, see §17.
 *   3. Калькулятор — top-funnel pricing entry, see §19.3.
 *
 * Photo collage uses Unsplash CC0 references until masters publish their
 * own work (plan §20.4 photo policy). Each tile clicks through to /raboty so
 * we never dead-end visual exploration.
 */
export function HomeHero() {
  // Take four hero-quality references for the collage. Hand-tuned ordering
  // — first one is the largest tile, so we want a wide-frame interior.
  const collage = [
    DEMO_CASES[1], // scandi living room — wide composition
    DEMO_CASES[0], // modern kitchen
    DEMO_CASES[3], // loft bathroom
    DEMO_CASES[2], // minimal bedroom
  ].filter((d): d is NonNullable<typeof d> => Boolean(d));

  return (
    <section className="relative overflow-hidden">
      {/* Soft brand-coloured blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-1/3 h-[28rem] w-[28rem] rounded-full bg-[var(--color-primary-soft)] opacity-50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-0 h-80 w-80 rounded-full bg-[var(--color-accent-soft)] opacity-60 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          {/* ── Left: text + CTAs ── */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary-ring)]/40 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)] backdrop-blur">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-primary)] opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-primary)]" />
              </span>
              Планировщик ремонта
            </div>

            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-[var(--color-text)] sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">
              Спланируйте ремонт{" "}
              <span className="bg-gradient-to-r from-[var(--color-primary)] via-teal-500 to-[var(--color-accent)] bg-clip-text text-transparent">
                от идеи до мастера
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base text-[var(--color-muted)] sm:text-lg">
              Бесплатно. За 5 минут. Без агрегаторов и спама — только проверенные мастера в вашем городе.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <CtaButton
                href="/raboty"
                tint="indigo"
                label="Смотреть идеи"
                sub="Реальные ремонты с ценами"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                }
              />
              <CtaButton
                href="/dizajn"
                tint="amber"
                label="AI-дизайн"
                sub="Из фото вашей комнаты"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m12 2 .94 3.06L16 6l-3.06.94L12 10l-.94-3.06L8 6l3.06-.94L12 2Z" />
                    <path d="m20 14-1 3-3 1 3 1 1 3 1-3 3-1-3-1-1-3Z" />
                    <path d="M9.5 14.5 4 20" />
                  </svg>
                }
              />
              <CtaButton
                href="/kalkulyator"
                tint="teal"
                label="Калькулятор"
                sub="Бюджет за 30 секунд"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

            <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Договор на каждую работу
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Без авансов
              </span>
            </p>
          </div>

          {/* ── Right: 2×2 photo collage ── */}
          <div className="relative">
            <div className="grid aspect-square gap-3 sm:gap-4">
              <div className="grid grid-cols-2 grid-rows-2 gap-3 sm:gap-4">
                <CollageTile data={collage[0]!} className="row-span-2" />
                <CollageTile data={collage[1]!} />
                <CollageTile data={collage[2]!} />
              </div>
            </div>

            {/* Floating "Пример работы" badge so first-time visitors don't
                think these are real cases. Disappears once we have ≥6 real
                published cases (HomeRecentCases takes over the visual story). */}
            <span className="pointer-events-none absolute -top-3 right-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-text)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-lg">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              Стилевые референсы
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CTA button ────────────────────────────────────────────────────────────────

interface CtaButtonProps {
  href: string;
  tint: "indigo" | "amber" | "teal";
  label: string;
  sub: string;
  icon: React.ReactNode;
}

const CTA_TINT: Record<CtaButtonProps["tint"], string> = {
  indigo:
    "bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary-hover)] ring-[var(--color-secondary)]/30",
  amber:
    "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] ring-[var(--color-accent)]/30",
  teal:
    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] ring-[var(--color-primary)]/30",
};

function CtaButton({ href, tint, label, sub, icon }: CtaButtonProps) {
  return (
    <Link
      href={href}
      className={`group inline-flex flex-1 items-center gap-3 rounded-2xl px-5 py-3 text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${CTA_TINT[tint]}`}
    >
      <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/15">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-bold leading-tight">{label}</span>
        <span className="text-[11px] font-medium leading-tight text-white/80">{sub}</span>
      </span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ml-auto opacity-70 transition-transform group-hover:translate-x-1 group-hover:opacity-100"
        aria-hidden
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </Link>
  );
}

// ── Collage tile ──────────────────────────────────────────────────────────────

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
      className={`group relative overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-xl ${className}`}
    >
      <img
        src={data.imageUrl}
        alt={data.alt}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" />
      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
        <span className="rounded-md bg-white/95 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text)] backdrop-blur">
          {data.category}
        </span>
        <span
          aria-hidden
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[var(--color-text)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
