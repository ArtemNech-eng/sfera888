import type { PortfolioEstimate } from "../../lib/types";

interface CaseEstimateProps {
  estimate: PortfolioEstimate | null;
}

/**
 * Estimate breakdown block (plan §22, Requirement 3).
 *
 * Renders only when the case has a structured estimate filled in by the
 * master. Three lines: works / materials / total. Total is taken from
 * `estimate.total` if present, otherwise computed as `works + materials`.
 *
 * Server component, no JS. JSONB shape ready for future `breakdown[]`
 * line items (electrical / plumbing / etc.) — Phase 2 expansion without
 * a migration.
 */
export function CaseEstimate({ estimate }: CaseEstimateProps) {
  if (!estimate) return null;

  // Defensive parse — JSONB → unknown until we trust the row.
  const works = Number.isFinite(estimate.works) && estimate.works >= 0 ? estimate.works : 0;
  const materials = Number.isFinite(estimate.materials) && estimate.materials >= 0 ? estimate.materials : 0;
  const total = estimate.total != null && Number.isFinite(estimate.total) && estimate.total >= 0
    ? estimate.total
    : works + materials;

  if (works === 0 && materials === 0 && total === 0) return null;

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-eyebrow">Смета объекта</p>
          <h2 className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
            Из чего сложился бюджет.
          </h2>

          <div className="mt-8 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <Row label="Стоимость работ" value={works} />
            <Row label="Материалы" value={materials} />
            <Row label="Итого" value={total} highlight />
          </div>

          <p className="mt-4 text-xs text-[var(--color-muted)]">
            Цифры — фактическая стоимость по этому объекту. Финальная смета по вашему ремонту
            может отличаться: зависит от площади, материалов и сложности работ.
          </p>
        </div>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 border-t border-[var(--color-border)] px-5 py-4 first:border-t-0 sm:px-6 sm:py-5 ${
        highlight ? "bg-[var(--color-cream-deep)]" : ""
      }`}
    >
      <span
        className={`text-sm sm:text-base ${
          highlight ? "font-bold text-[var(--color-text)]" : "text-[var(--color-muted)]"
        }`}
      >
        {label}
      </span>
      <span
        className={`whitespace-nowrap font-bold tabular-nums ${
          highlight ? "text-xl text-[var(--color-text)] sm:text-2xl" : "text-base text-[var(--color-text)] sm:text-lg"
        }`}
      >
        {formatRubles(value)}
      </span>
    </div>
  );
}

function formatRubles(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} ₽`;
}
