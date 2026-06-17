/**
 * Server-side renovation cost estimator (plan §19.3, §20.2 [6]).
 *
 * The endpoint `GET /api/marketplace/calculator/estimate` calls into this
 * module. We keep the logic on the server (not duplicated in the marketplace
 * SSR layer) so:
 *   • the marketplace stays a thin renderer,
 *   • coefficient tweaks roll out without redeploying marketplace,
 *   • we can later swap the static baseline for PERCENTILE_CONT on
 *     `master_portfolio.price_total / area` once we cross the 5-cases-per-
 *     bucket threshold (plan §19.3 "Programmatic SEO landing-страниц") —
 *     callers still see the same response shape.
 *
 * Coefficients are calibrated against:
 *   • V1 contract receipts the team reviewed during 2025-2026,
 *   • public Russian renovation calculators (Profi.ru, Rems24, Avito),
 *   • industry baseline ~₽12 000/m² косметика, ~₽30 000/m² евро,
 *     ~₽70 000/m² премиум in regional centres.
 *
 * Numbers are intentionally a wide low-mid-high *band* so the user gets a
 * range, not a fake-precise figure. Single-decimal precision is hidden by
 * rounding totals to the nearest 10 000 ₽ for legibility.
 */

export type CalcCategory = "kosmetic" | "evro" | "premium";

export interface CalcInput {
  /** City slug, e.g. "krasnodar" — falls back to baseline if not in registry. */
  citySlug: string | null;
  category: CalcCategory;
  /** Площадь в м². Зажато в [8, 500] до расчёта. */
  areaSqm: number;
}

export interface CalcResult {
  /** ₽/m² distribution. */
  pricePerSqm: { low: number; mid: number; high: number };
  /** Total ₽ rounded to a clean 10 000. */
  totalPrice: { low: number; mid: number; high: number };
  /** Срок работ в днях. */
  duration: { low: number; high: number };
  /** Sourcing transparency string for the UI. */
  source: string;
  /** True until DB has ≥5 matching real cases for the (city, area) bucket. */
  isRegionalEstimate: boolean;
  /** Resolved city display name in prepositional case ("в Москве"). */
  cityNameIn: string;
}

interface CityCoefficient {
  slug: string;
  /** Display name in prepositional case for the source string. */
  nameIn: string;
  /** Multiplier vs Krasnodar baseline (1.0). */
  k: number;
}

/**
 * Calibration baseline: Krasnodar (k=1.0). Cities not listed fall back to
 * the baseline with a generic "по региону" label so the UI doesn't dead-end.
 */
const CITY_COEFFICIENTS: CityCoefficient[] = [
  { slug: "krasnodar", nameIn: "в Краснодаре", k: 1.0 },
  { slug: "moskva", nameIn: "в Москве", k: 1.4 },
  { slug: "moscow", nameIn: "в Москве", k: 1.4 },
  { slug: "spb", nameIn: "в Санкт-Петербурге", k: 1.3 },
  { slug: "saint-petersburg", nameIn: "в Санкт-Петербурге", k: 1.3 },
  { slug: "ekaterinburg", nameIn: "в Екатеринбурге", k: 1.1 },
  { slug: "novosibirsk", nameIn: "в Новосибирске", k: 1.05 },
  { slug: "kazan", nameIn: "в Казани", k: 1.0 },
  { slug: "rostov-na-donu", nameIn: "в Ростове-на-Дону", k: 0.95 },
  { slug: "stavropol", nameIn: "в Ставрополе", k: 0.85 },
  { slug: "sochi", nameIn: "в Сочи", k: 1.15 },
  { slug: "voronezh", nameIn: "в Воронеже", k: 0.95 },
  { slug: "samara", nameIn: "в Самаре", k: 0.95 },
  { slug: "ufa", nameIn: "в Уфе", k: 0.9 },
];

/**
 * Baseline ₽/m² for each finishing category — realistic Russian "all-in"
 * budget (work + materials + management). Mid-tier is the typical median we
 * see in mid-2025 contracts. Low and high cover ±40-60% spread.
 */
const BASELINE_PRICE_PER_SQM: Record<CalcCategory, { low: number; mid: number; high: number }> = {
  kosmetic: { low: 7_000, mid: 12_000, high: 18_000 },
  evro: { low: 18_000, mid: 30_000, high: 45_000 },
  premium: { low: 45_000, mid: 70_000, high: 120_000 },
};

/**
 * Days per m² for each category. Wide band covers brigade-size variance
 * (single master vs 4-person crew) and material lead times.
 */
const DURATION_PER_SQM: Record<CalcCategory, { low: number; high: number }> = {
  kosmetic: { low: 0.5, high: 1.2 },
  evro: { low: 1.0, high: 2.2 },
  premium: { low: 1.8, high: 3.5 },
};

const CATEGORY_VALUES: ReadonlySet<string> = new Set(["kosmetic", "evro", "premium"]);

/** True iff the input can be coerced into a valid CalcCategory. */
export function isCalcCategory(value: unknown): value is CalcCategory {
  return typeof value === "string" && CATEGORY_VALUES.has(value);
}

/** Round to a nice multiple — totals look cleaner in even thousands. */
function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Clamp area into a sane range before multiplying anything. */
function normaliseArea(input: number): number {
  if (!Number.isFinite(input)) return 0;
  return Math.max(8, Math.min(500, Math.round(input)));
}

export function computeEstimate(input: CalcInput): CalcResult {
  const cityRow = CITY_COEFFICIENTS.find((c) => c.slug === input.citySlug);
  const cityCoef = cityRow?.k ?? 1.0;
  const cityNameIn = cityRow?.nameIn ?? "по региону";

  const a = normaliseArea(input.areaSqm);
  const base = BASELINE_PRICE_PER_SQM[input.category];
  const dur = DURATION_PER_SQM[input.category];

  const pricePerSqm = {
    low: Math.round(base.low * cityCoef),
    mid: Math.round(base.mid * cityCoef),
    high: Math.round(base.high * cityCoef),
  };

  const totalPrice = {
    low: roundTo(pricePerSqm.low * a, 10_000),
    mid: roundTo(pricePerSqm.mid * a, 10_000),
    high: roundTo(pricePerSqm.high * a, 10_000),
  };

  const duration = {
    low: Math.max(7, Math.round(dur.low * a)),
    high: Math.max(14, Math.round(dur.high * a)),
  };

  return {
    pricePerSqm,
    totalPrice,
    duration,
    source: `Ориентир ${cityNameIn} по средним коэффициентам региона`,
    isRegionalEstimate: true,
    cityNameIn,
  };
}
