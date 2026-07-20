import Link from "next/link";
import type { PriceAggregateDTO, RealPriceResponse } from "../../lib/types";

/**
 * Страница «Реальная цена» (spec: .kiro/specs/real-price) в Zen-стиле.
 * Рендерит агрегат по (вид работ × город) или (вид работ × ЖК): медиана,
 * вилка P25–P75, число подтверждённых сделок, помесячный ряд, разбивка по ЖК.
 * Schema.org Dataset + FAQPage — для цитирования в поиске и AI-ответах.
 */

interface Props {
  data: RealPriceResponse;
  scope: "city" | "zhk";
  zhkName?: string;
}

export function CenyView({ data, scope, zhkName }: Props) {
  const agg: PriceAggregateDTO | null =
    scope === "zhk" ? data.zhk.find((z) => z.district === zhkName) ?? null : data.cityAggregate;

  const work = data.workType.name;
  const city = data.city.name;
  const cityLoc = data.city.nameIn?.trim() || data.city.name;
  const locative = scope === "zhk" && zhkName ? `${zhkName}, ${cityLoc}` : cityLoc;
  const unit = agg?.unit ?? data.workType.unit ?? null;

  const p50 = num(agg?.p50);
  const p25 = num(agg?.p25);
  const p75 = num(agg?.p75);
  const hasData = agg != null && agg.n > 0 && p50 != null;

  const jsonLd = hasData ? buildJsonLd({ work, locative, unit, p25, p50, p75, n: agg!.n }) : null;

  return (
    <div className="zen">
      <div className="zen-shell">
        <div className="zen-crumbs">
          <Link href="/">Главная</Link> · <span>Цены</span> · <span>{work}</span> · <span>{locative}</span>
        </div>

        <span className="zen-eyebrow">Реальная цена · подтверждённые сделки</span>
        <h1 className="zen-title" style={{ marginTop: 6 }}>
          Сколько стоит {work.toLowerCase()} в {locative}
        </h1>

        {hasData ? (
          <>
            <div
              style={{
                marginTop: 20,
                background: "var(--z-surface)",
                border: "1px solid var(--z-line)",
                borderRadius: "var(--z-radius)",
                boxShadow: "var(--z-shadow)",
                padding: 24,
                maxWidth: 640,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.02em" }}>{priceLabel(p50!, unit)}</span>
                <span style={{ color: "var(--z-muted)", fontSize: 14 }}>медиана</span>
              </div>
              {p25 != null && p75 != null ? (
                <div style={{ marginTop: 6, color: "var(--z-muted)", fontSize: 15 }}>
                  Обычный диапазон: {priceLabel(p25, unit)} – {priceLabel(p75, unit)}
                </div>
              ) : null}
              <Sparkline series={agg!.series12m} />
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--z-line)", fontSize: 13, color: "var(--z-muted)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#e7f6ee", color: "#0a7d56", fontWeight: 700, padding: "4px 10px", borderRadius: 999 }}>
                  ✓ подтверждено сделками
                </span>
                <span>по <b style={{ color: "var(--z-ink)" }}>{agg!.n}</b> сделкам · обновлено {formatDate(agg!.updatedAt)}</span>
                <Link href="/about/method" style={{ color: "var(--z-accent)", fontWeight: 600 }}>Как считаем →</Link>
              </div>
            </div>

            {scope === "city" && data.zhk.length > 0 ? (
              <section style={{ marginTop: 32 }}>
                <h2 className="zen-section-title">Цены по ЖК и районам {city}</h2>
                <div style={{ background: "var(--z-surface)", border: "1px solid var(--z-line)", borderRadius: "var(--z-radius)", boxShadow: "var(--z-shadow)", overflow: "hidden" }}>
                  {data.zhk.map((z) => (
                    <Link
                      key={z.district}
                      href={`/ceny/${data.workType.slug}/${data.city.slug}/${encodeURIComponent(z.district)}`}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: "1px solid var(--z-line)" }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{z.district}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontWeight: 700 }}>{priceLabel(num(z.p50)!, z.unit ?? unit)}</span>
                        <span style={{ fontSize: 12.5, color: "var(--z-faint)" }}>{z.n} сделок</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div className="zen-empty" style={{ marginTop: 20 }}>
            По {work.toLowerCase()} в {locative} пока недостаточно подтверждённых сделок для честной медианы.
            Данные копятся по мере закрытия заказов — загляните позже.
          </div>
        )}

        <section style={{ marginTop: 32 }}>
          <div
            style={{
              background: "var(--z-accent-soft)",
              borderRadius: "var(--z-radius)",
              padding: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>Нужен такой ремонт?</div>
              <p style={{ margin: "6px 0 0", color: "#8a4a3d", fontSize: 15 }}>
                Подберём проверенного мастера в {cityLoc} — по реальной цене, без наценки платформы.
              </p>
            </div>
            <Link href="/mastera" className="zen-btn">Найти мастера →</Link>
          </div>
        </section>

        <p className="zen-note" style={{ marginTop: 22 }}>
          Цены построены на суммах реальных сделок через платформу (без точных адресов и данных клиентов).
          Методика — на странице <Link href="/about/method">как мы считаем цены</Link>.
        </p>
      </div>

      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
    </div>
  );
}

function Sparkline({ series }: { series: Array<{ month: string; p50: number; n: number }> }) {
  const vals = series.map((s) => s.p50);
  const max = Math.max(...vals, 0);
  if (max <= 0) return null;
  return (
    <div style={{ marginTop: 16, display: "flex", alignItems: "flex-end", gap: 4, height: 48 }} aria-label="Динамика за 12 месяцев">
      {series.map((s) => (
        <div
          key={s.month}
          title={`${s.month}: ${s.n ? Math.round(s.p50) : "нет данных"}`}
          style={{
            flex: 1,
            height: `${s.p50 > 0 ? Math.max(6, (s.p50 / max) * 100) : 4}%`,
            background: s.p50 > 0 ? "var(--z-accent)" : "var(--z-line)",
            borderRadius: 3,
            opacity: s.p50 > 0 ? 0.85 : 1,
          }}
        />
      ))}
    </div>
  );
}

function buildJsonLd(a: { work: string; locative: string; unit: string | null; p25: number | null; p50: number | null; p75: number | null; n: number }) {
  const unitText = a.unit && a.unit !== "объект" ? ` за ${a.unit}` : "";
  const rangeText =
    a.p25 != null && a.p75 != null
      ? `от ${Math.round(a.p25)} до ${Math.round(a.p75)} ₽${unitText}`
      : `около ${Math.round(a.p50!)} ₽${unitText}`;
  const answer = `По ${a.n} подтверждённым сделкам: медиана ${Math.round(a.p50!)} ₽${unitText}, обычный диапазон ${rangeText}.`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `Цены: ${a.work} в ${a.locative}`,
      description: `Реальные цены на ${a.work.toLowerCase()} в ${a.locative} по подтверждённым сделкам. ${answer}`,
      creator: { "@type": "Organization", name: "Честные мастера" },
      variableMeasured: [
        { "@type": "PropertyValue", name: "Медиана", value: Math.round(a.p50!), unitText: a.unit ?? "RUB" },
        ...(a.p25 != null ? [{ "@type": "PropertyValue", name: "P25", value: Math.round(a.p25) }] : []),
        ...(a.p75 != null ? [{ "@type": "PropertyValue", name: "P75", value: Math.round(a.p75) }] : []),
        { "@type": "PropertyValue", name: "Число сделок", value: a.n },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: `Сколько стоит ${a.work.toLowerCase()} в ${a.locative}?`,
          acceptedAnswer: { "@type": "Answer", text: answer },
        },
      ],
    },
  ];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function num(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function priceLabel(value: number, unit: string | null): string {
  const money = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  const per = unit && unit !== "объект" ? `/${unit}` : "";
  return `${money} ₽${per}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch {
    return "";
  }
}
