"use client";

import { useState } from "react";

/**
 * Проверятор смет (spec: .kiro/specs/real-price, Req 7). Клиент вводит позиции
 * своей сметы → POST /api/real-price/check → построчный вердикт «светофора»
 * против медианы реальных сделок. Виральный вход под трафик. Zen-стиль.
 */

interface CityOpt {
  slug: string;
  name: string;
}
interface Row {
  description: string;
  quantity: string;
  unit: string;
  price: string;
}
type Verdict = "green" | "yellow" | "red" | "unknown";
interface ResultItem {
  description: string;
  matched: { name: string; unit: string | null } | null;
  yourUnitPrice: number | null;
  quantity?: number;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  n?: number;
  verdict: Verdict;
  note?: string;
}
interface CheckResult {
  city: { slug: string; name: string };
  items: ResultItem[];
  summary: { green: number; yellow: number; red: number; unknown: number };
  suggestedService?: { slug: string; name: string } | null;
}

const VERDICT: Record<Verdict, { label: string; fg: string; bg: string }> = {
  green: { label: "рынок", fg: "#0a7d56", bg: "#e7f6ee" },
  yellow: { label: "выше рынка", fg: "#b4600a", bg: "#fff4e6" },
  red: { label: "завышено", fg: "#b42318", bg: "#fef2f2" },
  unknown: { label: "нет данных", fg: "#6b7280", bg: "#eef0f2" },
};

const EMPTY: Row = { description: "", quantity: "", unit: "м²", price: "" };

export interface SharedResult {
  g: number;
  y: number;
  r: number;
  u: number;
  cityName: string | null;
  total: number;
}

export function CheckForm({ cities, shared }: { cities: CityOpt[]; shared?: SharedResult | null }) {
  const [citySlug, setCitySlug] = useState(cities[0]?.slug ?? "krasnodar");
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY }, { ...EMPTY }, { ...EMPTY }]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Конверсия в лид (Req 7.3).
  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadConsent, setLeadConsent] = useState(false);
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "done">("idle");
  const [leadError, setLeadError] = useState<string | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { ...EMPTY }]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));
  }

  async function submit() {
    const items = rows
      .filter((r) => r.description.trim() && parseFloat(r.price.replace(",", ".")) > 0)
      .map((r) => ({
        description: r.description.trim(),
        unit: r.unit.trim() || undefined,
        quantity: r.quantity ? parseFloat(r.quantity.replace(",", ".")) : undefined,
        price: parseFloat(r.price.replace(",", ".")),
      }));
    if (items.length === 0) {
      setError("Добавьте хотя бы одну позицию с ценой.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/real-price/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citySlug, items }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError("Не удалось проверить смету. Попробуйте позже.");
        setResult(null);
      } else {
        setResult(data as CheckResult);
      }
    } catch {
      setError("Сеть недоступна. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  /** Ссылка с зашитым итогом — для превью в мессенджерах (OG) и лендинга. */
  function buildShareUrl(res: CheckResult): string {
    const origin = typeof location !== "undefined" ? location.origin : "https://chestnye-mastera.ru";
    const q = new URLSearchParams({
      g: String(res.summary.green),
      y: String(res.summary.yellow),
      r: String(res.summary.red),
      u: String(res.summary.unknown),
      cn: res.city.name,
    });
    return `${origin}/proverit-smetu?${q.toString()}`;
  }

  async function submitLead() {
    if (!result || leadStatus === "sending") return;
    const phone = leadPhone.trim();
    if (phone.length < 5) {
      setLeadError("Укажите телефон");
      return;
    }
    if (!leadConsent) {
      setLeadError("Нужно согласие на обработку данных");
      return;
    }
    const serviceSlug = result.suggestedService?.slug;
    if (!serviceSlug) {
      setLeadError("Сервис временно недоступен, попробуйте позже");
      return;
    }
    setLeadStatus("sending");
    setLeadError(null);
    const s = result.summary;
    const comment =
      `Проверка сметы: ${s.green} по рынку, ${s.yellow} выше рынка, ${s.red} завышено` +
      (result.suggestedService ? ` · интересует: ${result.suggestedService.name}` : "");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: leadName.trim(),
          phone,
          comment,
          consent: true,
          citySlug: result.city.slug,
          serviceSlug,
          sourcePageType: "smeta_check",
          sourcePageUrl: typeof location !== "undefined" ? location.href : undefined,
          formStartedAt: Date.now() - 3000,
        }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (res.ok && data.ok) {
        setLeadStatus("done");
      } else {
        setLeadStatus("idle");
        setLeadError("Не удалось отправить заявку. Попробуйте позже.");
      }
    } catch {
      setLeadStatus("idle");
      setLeadError("Сеть недоступна. Попробуйте позже.");
    }
  }

  function share() {
    if (!result) return;
    const s = result.summary;
    const text = `Проверил смету на ремонт в ${result.city.name} на «Честных мастерах»: ${s.green} по рынку, ${s.yellow} выше рынка, ${s.red} завышено.`;
    const url = buildShareUrl(result);
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "Проверка сметы", text, url }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(`${text} ${url}`)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        })
        .catch(() => {});
    }
  }

  return (
    <div className="zen">
      <div className="zen-shell" style={{ maxWidth: 820 }}>
        <span className="zen-eyebrow">Проверка сметы · бесплатно</span>
        <h1 className="zen-title" style={{ marginTop: 6 }}>Вам не завысили смету на ремонт?</h1>
        <p className="zen-sub">
          Вставьте позиции из вашей сметы — сравним каждую с реальными ценами подтверждённых сделок в вашем
          городе и покажем, где переплата.
        </p>

        {shared && !result ? (
          <div
            style={{
              marginTop: 16,
              padding: "14px 18px",
              background: "var(--z-accent-soft)",
              border: "1px solid var(--z-line)",
              borderRadius: "var(--z-radius)",
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--z-ink, #141414)" }}>
              Кто-то проверил {shared.total}{" "}
              {shared.cityName ? `поз. сметы в ${shared.cityName}` : "позиций сметы"}:
            </span>
            <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
              <Pill v="green" n={shared.g} />
              <Pill v="yellow" n={shared.y} />
              <Pill v="red" n={shared.r} />
            </span>
            <span style={{ fontSize: 13.5, color: "var(--z-muted)" }}>Проверьте и свою смету ↓</span>
          </div>
        ) : null}

        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 14, fontWeight: 600, color: "var(--z-muted)" }}>Город:</label>
          <select
            className="zen-input"
            style={{ width: "auto", minWidth: 200 }}
            value={citySlug}
            onChange={(e) => setCitySlug(e.target.value)}
          >
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Форма позиций */}
        <div style={{ marginTop: 16, background: "var(--z-surface)", border: "1px solid var(--z-line)", borderRadius: "var(--z-radius)", boxShadow: "var(--z-shadow)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 74px 70px 96px 32px", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--z-line)", fontSize: 12, fontWeight: 700, color: "var(--z-faint)", textTransform: "uppercase", letterSpacing: ".04em" }}>
            <span>Вид работ</span><span>Кол-во</span><span>Ед.</span><span>Цена/ед.</span><span></span>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 74px 70px 96px 32px", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--z-line, #ededed)", alignItems: "center" }}>
              <input className="zen-input" placeholder="напр. укладка плитки на стены" value={r.description} onChange={(e) => update(i, { description: e.target.value })} />
              <input className="zen-input" inputMode="decimal" placeholder="28" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
              <input className="zen-input" placeholder="м²" value={r.unit} onChange={(e) => update(i, { unit: e.target.value })} />
              <input className="zen-input" inputMode="decimal" placeholder="₽" value={r.price} onChange={(e) => update(i, { price: e.target.value })} />
              <button type="button" onClick={() => removeRow(i)} aria-label="Удалить" style={{ background: "none", border: 0, color: "var(--z-faint)", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
          ))}
          <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button type="button" onClick={addRow} style={{ background: "var(--z-accent-soft)", color: "var(--z-accent)", border: 0, borderRadius: 999, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ позиция</button>
            <button type="button" className="zen-btn" onClick={submit} disabled={loading}>
              {loading ? "Проверяю…" : "Проверить смету"}
            </button>
          </div>
        </div>

        <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--z-faint)" }}>
          Совет: указывайте количество и единицу (м², шт) — так сравнение точнее. Цена — за единицу.
        </p>

        {error ? (
          <div className="zen-alert zen-alert--err" style={{ marginTop: 12 }}>{error}</div>
        ) : null}

        {/* Результат */}
        {result ? (
          <section style={{ marginTop: 26 }}>
            <h2 className="zen-section-title">Результат по {result.city.name}</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <Pill v="green" n={result.summary.green} />
              <Pill v="yellow" n={result.summary.yellow} />
              <Pill v="red" n={result.summary.red} />
              <Pill v="unknown" n={result.summary.unknown} />
            </div>
            <div style={{ background: "var(--z-surface)", border: "1px solid var(--z-line)", borderRadius: "var(--z-radius)", boxShadow: "var(--z-shadow)", overflow: "hidden" }}>
              {result.items.map((it, i) => {
                const v = VERDICT[it.verdict];
                return (
                  <div key={i} style={{ padding: "13px 16px", borderBottom: "1px solid var(--z-line)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{it.matched?.name || it.description}</div>
                      <div style={{ fontSize: 12.5, color: "var(--z-muted)", marginTop: 2 }}>
                        {it.yourUnitPrice != null ? `ваша цена: ${money(it.yourUnitPrice)} ₽${it.matched?.unit ? `/${it.matched.unit}` : ""}` : it.description}
                        {it.median != null ? ` · рынок: ${money(it.median)} ₽${it.matched?.unit ? `/${it.matched.unit}` : ""} (${it.n} сделок)` : ""}
                      </div>
                      {it.note ? <div style={{ fontSize: 12, color: "var(--z-faint)", marginTop: 3 }}>{it.note}</div> : null}
                    </div>
                    <span style={{ flex: "none", background: v.bg, color: v.fg, fontWeight: 700, fontSize: 12.5, padding: "5px 11px", borderRadius: 999, whiteSpace: "nowrap" }}>{v.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="zen-btn" onClick={share}>Поделиться результатом</button>
              <a className="zen-btn zen-btn--ghost" href="/mastera">Найти честного мастера</a>
              {copied ? <span style={{ fontSize: 13, color: "var(--z-muted)" }}>Ссылка скопирована ✓</span> : null}
            </div>

            {/* Конверсия в лид (Req 7.3) */}
            {result.suggestedService ? (
              <div
                style={{
                  marginTop: 20,
                  background: "var(--z-surface)",
                  border: "1px solid var(--z-line)",
                  borderRadius: "var(--z-radius)",
                  boxShadow: "var(--z-shadow)",
                  padding: "20px 20px 22px",
                }}
              >
                {leadStatus === "done" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: "var(--z-ink, #141414)" }}>
                      Заявка принята ✓
                    </span>
                    <span style={{ fontSize: 14, color: "var(--z-muted)" }}>
                      Скоро с вами свяжется оператор и подберёт проверенного мастера в {result.city.name}. Работаем по
                      реальным ценам — без накруток.
                    </span>
                  </div>
                ) : (
                  <>
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--z-ink, #141414)" }}>
                      {result.summary.red > 0
                        ? "Нашли переплату? Подберём мастера по реальным ценам"
                        : "Нужен проверенный мастер под эту смету?"}
                    </h3>
                    <p style={{ fontSize: 13.5, color: "var(--z-muted)", margin: "6px 0 14px" }}>
                      Оставьте телефон — оператор бесплатно подберёт мастера в {result.city.name}. Никакого спама, только
                      по вашей заявке.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <input
                        className="zen-input"
                        placeholder="Ваше имя"
                        value={leadName}
                        onChange={(e) => setLeadName(e.target.value)}
                      />
                      <input
                        className="zen-input"
                        type="tel"
                        inputMode="tel"
                        placeholder="+7 999 123-45-67"
                        value={leadPhone}
                        onChange={(e) => setLeadPhone(e.target.value)}
                      />
                    </div>
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 12.5, color: "var(--z-muted)" }}>
                      <input
                        type="checkbox"
                        checked={leadConsent}
                        onChange={(e) => setLeadConsent(e.target.checked)}
                        style={{ marginTop: 2 }}
                      />
                      <span>
                        Соглашаюсь с{" "}
                        <a href="/policy/privacy" style={{ textDecoration: "underline" }}>политикой конфиденциальности</a> и{" "}
                        <a href="/policy/terms" style={{ textDecoration: "underline" }}>пользовательским соглашением</a>.
                      </span>
                    </label>
                    {leadError ? (
                      <div className="zen-alert zen-alert--err" style={{ marginTop: 10 }}>{leadError}</div>
                    ) : null}
                    <button
                      type="button"
                      className="zen-btn"
                      style={{ marginTop: 14 }}
                      onClick={submitLead}
                      disabled={leadStatus === "sending"}
                    >
                      {leadStatus === "sending" ? "Отправляю…" : "Подобрать мастера"}
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Pill({ v, n }: { v: Verdict; n: number }) {
  const c = VERDICT[v];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: c.bg, color: c.fg, fontWeight: 700, fontSize: 13, padding: "6px 12px", borderRadius: 999 }}>
      {n} · {c.label}
    </span>
  );
}

function money(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}
