import { Switch, Route, Router as WouterRouter } from "wouter";
import Smeta from "@/pages/Smeta";
import Chat from "@/pages/Chat";
import History from "@/pages/History";
import Estimate from "@/pages/Estimate";
import InstallPrompt from "@/components/InstallPrompt";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppIcon({ size = 44 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size,
      background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
      borderRadius: size * 0.24,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 4px 14px rgba(29,78,216,.35)",
      flexShrink: 0,
    }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    </div>
  );
}

function Home() {
  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "#f4f6fb",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "16px 20px",
        paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      }}>
        <AppIcon size={40} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", letterSpacing: -0.3 }}>Честный мастер</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Ремонт · Безопасно · Гарантия 6 мес.</div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 24px" }}>

        {/* AI estimate card — primary action */}
        <div
          onClick={() => { window.location.href = `${BASE}/estimate`; }}
          style={{
            background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
            borderRadius: 22, padding: "22px 20px 20px",
            cursor: "pointer", userSelect: "none",
            boxShadow: "0 8px 28px rgba(29,78,216,.35)",
            marginBottom: 14,
            position: "relative", overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", right: -24, top: -24, width: 100, height: 100, background: "rgba(255,255,255,.07)", borderRadius: "50%" }} />
          <div style={{ position: "absolute", right: 12, bottom: -28, width: 80, height: 80, background: "rgba(255,255,255,.04)", borderRadius: "50%" }} />

          <div style={{ display: "flex", gap: 4, marginBottom: 14, position: "relative" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,.2)", borderRadius: 20, padding: "4px 10px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>AI · Бесплатно</span>
            </div>
          </div>

          <div style={{ position: "relative" }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 8px", lineHeight: 1.2, letterSpacing: -0.5 }}>
              Узнать стоимость работ
            </h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.75)", margin: "0 0 18px", lineHeight: 1.5 }}>
              Сфотографируйте задачу — AI составит смету за 30 секунд
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.18)", borderRadius: 14, padding: "12px 18px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Получить оценку</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
        </div>

        {/* Smeta info */}
        <div style={{ background: "#fff", borderRadius: 18, padding: "18px 18px", marginBottom: 14, border: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 38, height: 38, background: "#eff6ff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Открыть мою смету</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Перейдите по ссылке от мастера</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>
            Мастер прислал ссылку в сообщении. Нажмите на неё — откроется смета с деталями заказа и возможностью оплатить бронь.
          </p>
        </div>

        {/* Trust badges */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            ), title: "Гарантия", sub: "6 месяцев" },
            { icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ), title: "ИП офиц.", sub: "ИНН 2624..." },
            { icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            ), title: "Поддержка", sub: "24/7" },
          ].map((b, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "14px 10px", textAlign: "center", border: "1px solid #e5e7eb" }}>
              <div style={{ marginBottom: 6, display: "flex", justifyContent: "center" }}>{b.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{b.title}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{b.sub}</div>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#d1d5db", marginTop: 20 }}>sfera-project.digital</p>
      </div>

      <InstallPrompt />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/estimate" component={Estimate} />
      <Route path="/smeta/:token/chat" component={Chat} />
      <Route path="/smeta/:token/history" component={History} />
      <Route path="/smeta/:token" component={Smeta} />
      <Route component={Home} />
    </Switch>
  );
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}
