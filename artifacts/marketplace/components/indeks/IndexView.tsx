"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PriceIndexResponse, PriceIndexMonth } from "../../lib/types";

/**
 * `/indeks` — индекс цен на ремонт (Real Price, Req 8) в Zen-стиле.
 *
 * Показывает уровень цен по месяцам (база = 100) и квартальные срезы для
 * пресс-релизов. Методика — честная для разреженных данных (индекс Жевонса,
 * фиксированная база), объём сделок виден всегда. Переключение область
 * (страна / город) — без дозагрузки, данные приходят с сервера.
 */
export function IndexView({ scopes }: { scopes: PriceIndexResponse[] }) {
  const [active, setActive] = useState(0);
  const data = scopes[active] ?? null;

  const scopeLabel = (s: PriceIndexResponse) => (s.scope.type === "city" ? s.scope.name : "Вся Россия");

  return (
    <div className="zen">
      <div className="zen-shell">
        <div className="zen-crumbs">
          <Link href="/">Главная</Link> · <span>Индекс цен</span>
        </div>

        <span className="zen-eyebrow">Индекс цен · подтверждённые сделки</span>
        <h1 className="zen-title" style={{ marginTop: 6 }}>Индекс цен на ремонт</h1>
        <p className="zen-sub">
          Как меняются реальные цены на ремонт по подтверждённым сделкам платформы. Уровень месяца — база 100 по
          первому месяцу с данными; сравниваются относительные изменения цен по видам работ.
        </p>

        {scopes.length > 1 ? (
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {scopes.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                style={{
                  border: "1px solid var(--z-line)",
                  background: i === active ? "var(--z-accent)" : "var(--z-surface)",
                  color: i === active ? "#fff" : "var(--z-ink, #141414)",
                  borderRadius: 999,
                  padding: "7px 16px",
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                {scopeLabel(s)}
              </button>
            ))}
          </div>
        ) : null}

        {!data || data.totalDeals === 0 ? (
          <Empty />
        ) : (
          <ScopeBlock data={data} />
        )}

        {/* Методика */}
        <section style={{ marginTop: 32 }}>
          <h2 className="zen-section-title">Как считается</h2>
          <p style={{ fontSize: 14, color: "var(--z-muted)", lineHeight: 1.6, maxWidth: 680 }}>
            За каждый месяц берём медиану цены за единицу по каждому виду работ (из подтверждённых сделок). Уровень
            индекса — среднее геометрическое отношений медиан к базовому месяцу по видам работ, встречающимся и в базе,
            и в текущем месяце. Так корректно сравниваются разнородные работы. Пока сделок немного, индекс носит
            ориентировочный характер и уточняется по мере накопления данных.{" "}
            <Link href="/about/method" style={{ textDecoration: "underline" }}>Подробнее о методике</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}

function ScopeBlock({ data }: { data: PriceIndexResponse }) {
  const withLevel = data.months.filter((m) => m.level != null);
  const latest = withLevel.length > 0 ? withLevel[withLevel.length - 1]! : null;
  const quartersWithLevel = data.quarters.filter((q) => q.level != null);
  const lastQuarter = quartersWithLevel.length > 0 ? quartersWithLevel[quartersWithLevel.length - 1]! : null;

  return (
    <>
      {/* Сводка */}
      <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Card
          label="Текущий уровень"
          value={latest?.level != null ? String(latest.level) : "—"}
          sub={latest ? `${monthLabel(latest.month)} · база 100` : "недостаточно данных"}
        />
        <Card
          label="За квартал"
          value={lastQuarter?.qoqPct != null ? `${lastQuarter.qoqPct > 0 ? "+" : ""}${lastQuarter.qoqPct}%` : "—"}
          sub={lastQuarter ? lastQuarter.quarter : "нужен ещё квартал данных"}
          accent={lastQuarter?.qoqPct != null ? (lastQuarter.qoqPct >= 0 ? "up" : "down") : undefined}
        />
        <Card label="Всего сделок в базе" value={String(data.totalDeals)} sub="нормализованных позиций" />
      </div>

      {/* График уровня */}
      {withLevel.length >= 2 ? (
        <section style={{ marginTop: 24 }}>
          <h2 className="zen-section-title">Уровень цен по месяцам</h2>
          <LineChart months={data.months} />
        </section>
      ) : (
        <p style={{ marginTop: 20, fontSize: 14, color: "var(--z-muted)" }}>
          График появится, когда наберётся минимум два месяца сопоставимых данных. Ниже — объём сделок по месяцам.
        </p>
      )}

      {/* Объём сделок по месяцам */}
      <section style={{ marginTop: 24 }}>
        <h2 className="zen-section-title">Объём сделок</h2>
        <DealsBars months={data.months} />
      </section>

      {/* Квартальная таблица */}
      {quartersWithLevel.length > 0 ? (
        <section style={{ marginTop: 24 }}>
          <h2 className="zen-section-title">Кварталы</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 520, fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--z-faint)" }}>
                  <th style={thStyle}>Квартал</th>
                  <th style={thStyle}>Уровень</th>
                  <th style={thStyle}>К пред. кварталу</th>
                  <th style={thStyle}>Сделок</th>
                </tr>
              </thead>
              <tbody>
                {data.quarters.map((q) => (
                  <tr key={q.quarter} style={{ borderTop: "1px solid var(--z-line)" }}>
                    <td style={tdStyle}>{q.quarter}</td>
                    <td style={tdStyle}>{q.level ?? "—"}</td>
                    <td style={{ ...tdStyle, color: qColor(q.qoqPct) }}>
                      {q.qoqPct != null ? `${q.qoqPct > 0 ? "+" : ""}${q.qoqPct}%` : "—"}
                    </td>
                    <td style={tdStyle}>{q.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function LineChart({ months }: { months: PriceIndexMonth[] }) {
  const W = 720;
  const H = 220;
  const padX = 36;
  const padY = 24;
  const pts = months.map((m, i) => ({ i, level: m.level, month: m.month }));
  const levels = pts.filter((p) => p.level != null).map((p) => p.level!) ;
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const span = max - min || 1;
  const n = months.length;
  const x = (i: number) => padX + (n <= 1 ? 0 : (i * (W - 2 * padX)) / (n - 1));
  const y = (v: number) => padY + (H - 2 * padY) * (1 - (v - min) / span);

  const linePts = pts.filter((p) => p.level != null).map((p) => `${x(p.i)},${y(p.level!)}`).join(" ");

  // Подписи оси X — не более ~6 равномерных.
  const labelStep = Math.max(1, Math.ceil(n / 6));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block" }} role="img" aria-label="График уровня цен по месяцам">
        {/* база 100 */}
        {min <= 100 && max >= 100 ? (
          <line x1={padX} x2={W - padX} y1={y(100)} y2={y(100)} stroke="var(--z-line, #e5e5e5)" strokeDasharray="4 4" />
        ) : null}
        <polyline points={linePts} fill="none" stroke="var(--z-accent, #FF5A3C)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.filter((p) => p.level != null).map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.level!)} r={3.5} fill="var(--z-accent, #FF5A3C)" />
        ))}
        {pts.map((p) =>
          p.i % labelStep === 0 ? (
            <text key={p.i} x={x(p.i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--z-faint, #999)">
              {shortMonth(p.month)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

function DealsBars({ months }: { months: PriceIndexMonth[] }) {
  const max = Math.max(1, ...months.map((m) => m.n));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 96, overflowX: "auto", paddingTop: 8 }}>
      {months.map((m) => (
        <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 26 }}>
          <div
            title={`${m.n} сделок`}
            style={{
              width: 18,
              height: `${Math.round((m.n / max) * 72)}px`,
              minHeight: m.n > 0 ? 3 : 0,
              background: m.n > 0 ? "var(--z-accent-soft, #ffe3dc)" : "transparent",
              borderTop: m.n > 0 ? "2px solid var(--z-accent, #FF5A3C)" : "none",
              borderRadius: 3,
            }}
          />
          <span style={{ fontSize: 10, color: "var(--z-faint, #999)", whiteSpace: "nowrap" }}>{shortMonth(m.month)}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: "up" | "down" }) {
  const valueColor = accent === "up" ? "#0a7d56" : accent === "down" ? "#b42318" : "var(--z-ink, #141414)";
  return (
    <div
      style={{
        background: "var(--z-surface)",
        border: "1px solid var(--z-line)",
        borderRadius: "var(--z-radius)",
        boxShadow: "var(--z-shadow)",
        padding: "16px 18px",
        minWidth: 150,
        flex: "1 1 150px",
        maxWidth: 220,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--z-faint)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color: valueColor, marginTop: 4, letterSpacing: "-.02em" }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "var(--z-muted)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Empty() {
  return (
    <div
      style={{
        marginTop: 20,
        background: "var(--z-surface)",
        border: "1px solid var(--z-line)",
        borderRadius: "var(--z-radius)",
        padding: 28,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 34 }}>📈</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "10px 0 4px" }}>Индекс скоро появится</h2>
      <p style={{ fontSize: 14, color: "var(--z-muted)", maxWidth: 460, margin: "0 auto" }}>
        Мы считаем индекс только по подтверждённым сделкам. Как только их наберётся достаточно, здесь появится уровень
        цен по месяцам. А пока можно посмотреть{" "}
        <Link href="/proverit-smetu" style={{ textDecoration: "underline" }}>проверятор смет</Link>.
      </p>
    </div>
  );
}

const MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
function shortMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_RU[(m! - 1) % 12]} ${String(y!).slice(2)}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_RU[(m! - 1) % 12]} ${y}`;
}
function qColor(pct: number | null): string {
  if (pct == null) return "var(--z-muted)";
  return pct >= 0 ? "#0a7d56" : "#b42318";
}

const thStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "8px 10px" };
