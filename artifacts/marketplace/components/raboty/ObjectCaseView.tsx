import Link from "next/link";
import type { ObjectCaseResponse, ObjectCaseStage, ObjectCaseStageLine } from "../../lib/types";

/**
 * Кейс-страница Объекта (Real Price, spec: .kiro/specs/real-price) — по
 * согласованному прототипу object-page-public-v1. Значок «подтверждённая
 * сделка», смета по этапам, фото до/после (с согласия), карточка мастера,
 * CTA «хочу такой же». Приватность: без точного адреса и данных клиента.
 */
export function ObjectCaseView({ data }: { data: ObjectCaseResponse }) {
  const o = data.object;
  const loc = [o.zhk, o.district].filter(Boolean)[0] ?? null;
  const total = num(o.totalAmount);
  const photos = [...o.photosAfter.map((u) => ({ u, tag: "После" })), ...o.photosBefore.map((u) => ({ u, tag: "До" }))];
  const cover = photos[0] ?? null;
  const rest = photos.slice(1, 3);

  return (
    <div className="zen">
      <div className="zen-shell" style={{ maxWidth: 940 }}>
        <div className="zen-crumbs">
          <Link href="/">Главная</Link> · <Link href="/raboty">Ремонты</Link> · <span>{o.city}</span> · <span>{o.serviceType}</span>
        </div>

        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#e7f6ee", color: "#0a7d56", fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999, marginTop: 8 }}>
          ✓ Подтверждённая сделка через платформу
        </span>
        <h1 className="zen-title" style={{ marginTop: 12 }}>
          {o.serviceType}{o.area ? `, ${formatArea(o.area)} м²` : ""} — {loc ? `${loc}, ` : ""}{o.city}
        </h1>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {loc ? <Pill>📍 {loc}</Pill> : null}
          {o.area ? <Pill><b>{formatArea(o.area)} м²</b></Pill> : null}
          {total != null ? <Pill>Итог: <b>{money(total)} ₽</b></Pill> : null}
        </div>

        {/* Галерея (реальные фото мастера, с согласия) */}
        {photos.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: rest.length ? "1.4fr 1fr" : "1fr", gap: 12, marginTop: 22 }}>
            <Shot url={cover!.u} tag={cover!.tag} big />
            {rest.length ? (
              <div style={{ display: "grid", gridTemplateRows: rest.length > 1 ? "1fr 1fr" : "1fr", gap: 12 }}>
                {rest.map((p, i) => <Shot key={i} url={p.u} tag={p.tag} />)}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Смета по этапам */}
        {o.stages.length > 0 ? (
          <section style={{ marginTop: 32 }}>
            <h2 className="zen-section-title">Смета по этапам</h2>
            <p style={{ color: "var(--z-muted)", fontSize: 15, margin: "0 0 16px" }}>
              Что именно делали и сколько это стоило — построчно, из сметы мастера.
            </p>
            {o.stages.map((st, i) => (
              <div key={i} style={{ background: "var(--z-surface)", border: "1px solid var(--z-line)", borderRadius: "var(--z-radius)", boxShadow: "var(--z-shadow)", marginBottom: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 18px", borderBottom: "1px solid var(--z-line)" }}>
                  <span style={{ width: 26, height: 26, borderRadius: 999, background: "var(--z-accent-soft)", color: "var(--z-accent)", fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{st.title || `Этап ${i + 1}`}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 16 }}>{money(stageSum(st))} ₽</span>
                </div>
                {(st.lineItems ?? []).map((li, j) => (
                  <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "12px 18px", borderBottom: j < (st.lineItems!.length - 1) ? "1px solid #f3f4f5" : "none" }}>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{li.name || li.description}</div>
                      <div style={{ fontSize: 12.5, color: "var(--z-muted)", marginTop: 2 }}>{lineQty(li)}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap" }}>{money(lineSum(li))} ₽</div>
                  </div>
                ))}
              </div>
            ))}
            {total != null ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--z-ink)", color: "#fff", borderRadius: "var(--z-radius)", padding: "16px 20px", marginTop: 6 }}>
                <span>Итого работ</span><span style={{ fontSize: 22, fontWeight: 800 }}>{money(total)} ₽</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Мастер */}
        {data.master ? (
          <section style={{ marginTop: 32 }}>
            <h2 className="zen-section-title">Мастер, который это сделал</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 16, background: "var(--z-surface)", border: "1px solid var(--z-line)", borderRadius: "var(--z-radius)", boxShadow: "var(--z-shadow)", padding: 20 }}>
              <div style={{ width: 60, height: 60, borderRadius: 999, background: "var(--z-accent-soft)", color: "var(--z-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 20, flex: "none" }}>{initials(data.master.name)}</div>
              <div>
                <h4 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{data.master.name}</h4>
                <div style={{ fontSize: 13.5, color: "var(--z-muted)", marginTop: 2 }}>
                  {[data.master.specialization, data.master.city].filter(Boolean).join(" · ")}
                </div>
                {ratingLabel(data.master.rating) ? (
                  <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 700 }}>★ {ratingLabel(data.master.rating)}{data.master.reviewsCount > 0 ? ` · ${data.master.reviewsCount} отзывов` : ""}</div>
                ) : null}
              </div>
              {data.master.slug ? (
                <Link href={`/master/${data.master.slug}`} className="zen-btn zen-btn--ghost" style={{ marginLeft: "auto" }}>Профиль →</Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* CTA */}
        <section style={{ marginTop: 24 }}>
          <div style={{ background: "var(--z-accent-soft)", borderRadius: "var(--z-radius)", padding: 30, textAlign: "center" }}>
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Хочу такой же ремонт</h3>
            <p style={{ margin: "8px auto 0", color: "#8a4a3d", maxWidth: 460, fontSize: 15 }}>
              Подберём проверенного мастера в {o.city} — повторит по такой же смете, по реальной цене.
            </p>
            <div style={{ marginTop: 20 }}><Link href="/mastera" className="zen-btn">Подобрать мастера →</Link></div>
          </div>
        </section>

        <p className="zen-note" style={{ marginTop: 22 }}>
          Точный адрес и данные клиента не публикуются — только район и ЖК. Смета и состав работ взяты из
          подтверждённой сделки на платформе. <Link href="/about/method">Как мы считаем цены</Link>.
        </p>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid var(--z-line)", borderRadius: 999, padding: "7px 13px", fontSize: 13.5, fontWeight: 600, boxShadow: "var(--z-shadow)" }}>{children}</span>;
}

function Shot({ url, tag, big }: { url: string; tag: string; big?: boolean }) {
  return (
    <div style={{ position: "relative", borderRadius: "var(--z-radius)", overflow: "hidden", border: "1px solid var(--z-line)", minHeight: big ? 240 : 0, aspectRatio: big ? undefined : "4/3", background: "#eef0f2" }}>
      <span style={{ position: "absolute", left: 12, top: 12, background: "rgba(28,28,30,.72)", color: "#fff", fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999, zIndex: 1 }}>{tag}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Фото ремонта — ${tag}`} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  );
}

// helpers
function lineUnitPrice(li: ObjectCaseStageLine): number {
  const up = Number(li.unitPrice ?? li.price);
  return Number.isFinite(up) && up > 0 ? up : 0;
}
function lineSum(li: ObjectCaseStageLine): number {
  if (li.sum != null && Number(li.sum) > 0) return Number(li.sum);
  const q = Number(li.quantity);
  return Number.isFinite(q) && q > 0 ? lineUnitPrice(li) * q : lineUnitPrice(li);
}
function stageSum(st: ObjectCaseStage): number {
  return (st.lineItems ?? []).reduce((s, li) => s + lineSum(li), 0);
}
function lineQty(li: ObjectCaseStageLine): string {
  const q = Number(li.quantity);
  const up = lineUnitPrice(li);
  if (Number.isFinite(q) && q > 0 && li.unit) return `${q} ${li.unit} · ${money(up)} ₽/${li.unit}`;
  return "1 усл.";
}
function num(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function money(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}
function formatArea(a: string): string {
  const n = parseFloat(a);
  return Number.isFinite(n) ? String(Math.round(n)) : a;
}
function ratingLabel(raw: string | null): string | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n.toFixed(1).replace(".", ",") : null;
}
function initials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "М";
}
