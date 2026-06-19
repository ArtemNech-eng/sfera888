import type { MarketStatsResponse } from "../../lib/types";

interface CaseMarketStatsProps {
  data: MarketStatsResponse | null;
}

/**
 * Market-average price block (plan §22, Requirement 7).
 *
 * Renders only when there's enough underlying data to be meaningful:
 *   • russia.count >= 5 — the section appears at all
 *   • city.count >= 3   — the city sub-row appears (otherwise hidden)
 *
 * Numbers are rounded to the nearest 1 000 ₽ for display — fine resolution
 * isn't useful here ("от 122 384 ₽" feels suspiciously precise) and
 * 1K-rounding keeps the prices readable.
 *
 * Server component, no JS.
 */
export function CaseMarketStats({ data }: CaseMarketStatsProps) {
  if (!data) return null;
  if (data.russia.count < 5) return null;

  const areaLabel = formatAreaBucket(data.areaTarget);
  const russia = formatRange(data.russia.p25, data.russia.p75);

  return (
    <section className="bg-[var(--color-cream-deep)]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="font-eyebrow">Сколько стоят такие ремонты</p>
          <h2 className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
            {data.serviceName} {areaLabel} — рыночная цена.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
            Диапазон цен по похожим объектам в нашей базе. Считаем по фактической стоимости
            работ — не по «от 5 000 ₽/м²» из рекламы.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-5">
          <Bucket
            label="По России"
            range={russia}
            count={data.russia.count}
          />
          {data.city ? (
            <Bucket
              label={`В ${declineCityForLocation(data.city.cityName)}`}
              range={formatRange(data.city.p25, data.city.p75)}
              count={data.city.count}
              accent
            />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/50 p-6 text-sm text-[var(--color-muted)] sm:p-7">
              <p className="font-eyebrow">В вашем городе</p>
              <p className="mt-3">
                Пока недостаточно опубликованных кейсов для города, чтобы
                показать локальный диапазон. По мере наполнения каталога он появится здесь.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function Bucket({
  label,
  range,
  count,
  accent,
}: {
  label: string;
  range: string;
  count: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-6 sm:p-7 ${
        accent
          ? "border-[var(--color-primary)] bg-[var(--color-surface)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <p className="font-eyebrow">{label}</p>
      <p className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
        {range}
      </p>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        На основе {count} {pluralObjects(count)}
      </p>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRubles(n: number): string {
  // Round to the nearest 1000 for display — finer precision feels
  // suspicious on small samples.
  const rounded = Math.round(n / 1000) * 1000;
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} ₽`;
}

function formatRange(p25: number, p75: number): string {
  if (p25 <= 0 && p75 <= 0) return "—";
  if (p25 > 0 && p75 > 0) return `от ${formatRubles(p25)} до ${formatRubles(p75)}`;
  if (p25 > 0) return `от ${formatRubles(p25)}`;
  return `до ${formatRubles(p75)}`;
}

function formatAreaBucket(target: number): string {
  if (!Number.isFinite(target) || target <= 0) return "";
  // Show ±30% as a friendly range
  const lo = Math.max(1, Math.floor(target * 0.7));
  const hi = Math.ceil(target * 1.3);
  if (lo === hi) return `${lo} м²`;
  return `${lo}-${hi} м²`;
}

function pluralObjects(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "объектов";
  if (m10 === 1) return "объекта";
  if (m10 >= 2 && m10 <= 4) return "объектов";
  return "объектов";
}

/**
 * Decline a city name to the prepositional case for "в" / "в Москве".
 * Crude heuristic — covers the most common Russian endings. Falls back
 * to the nominative form for cities that don't fit the pattern.
 */
function declineCityForLocation(name: string): string {
  if (!name) return name;
  const trimmed = name.trim();
  // Already in some inflected form (-ске, -е) — keep as-is on the input.
  // Try common patterns:
  // "Москва" → "Москве", "Уфа" → "Уфе", "Казань" → "Казани"
  // "Санкт-Петербург" → "Санкт-Петербурге"
  // "Краснодар" → "Краснодаре"
  if (/[аяАЯ]$/.test(trimmed)) {
    return trimmed.slice(0, -1) + "е";
  }
  if (/ь$/.test(trimmed)) {
    return trimmed.slice(0, -1) + "и";
  }
  // Most masculine consonant-ending names: Краснодар, Челябинск, Ростов
  return trimmed + "е";
}
