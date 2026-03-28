import { Switch, Route, Router as WouterRouter } from "wouter";
import Smeta from "@/pages/Smeta";
import Chat from "@/pages/Chat";
import History from "@/pages/History";
import Estimate from "@/pages/Estimate";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function Home() {
  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      minHeight: "100vh",
      background: "linear-gradient(160deg, #eff6ff 0%, #f0f4ff 50%, #eef0f5 100%)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "48px 24px 0", textAlign: "center" }}>
        <div style={{
          width: 64, height: 64,
          background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
          borderRadius: 18,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 24px rgba(29,78,216,.3)",
          marginBottom: 18,
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: "0 0 6px", letterSpacing: -0.5 }}>Честный мастер</h1>
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Ремонт · Безопасно · Гарантия</p>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "28px 20px 40px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>

        {/* AI Estimate card */}
        <div
          onClick={() => { window.location.href = `${BASE}/estimate`; }}
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)",
            borderRadius: 20, padding: "22px 22px",
            cursor: "pointer", userSelect: "none",
            boxShadow: "0 8px 28px rgba(29,78,216,.35)",
            position: "relative", overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", right: -10, top: -10, width: 100, height: 100, background: "rgba(255,255,255,.06)", borderRadius: "50%" }} />
          <div style={{ position: "absolute", right: 20, bottom: -20, width: 80, height: 80, background: "rgba(255,255,255,.04)", borderRadius: "50%" }} />
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, position: "relative" }}>
            <div style={{ width: 48, height: 48, background: "rgba(255,255,255,.2)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,.65)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>AI · Бесплатно</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.25, marginBottom: 6 }}>Узнать стоимость работ</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", lineHeight: 1.5 }}>Сфотографируйте и опишите задачу — AI составит смету за 30 секунд</div>
            </div>
          </div>
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, height: 40, background: "rgba(255,255,255,.15)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Получить оценку →</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>или</span>
          <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
        </div>

        {/* Open smeta card */}
        <div style={{ background: "#fff", borderRadius: 20, padding: "20px 20px", boxShadow: "0 2px 16px rgba(0,0,0,.07)", border: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, background: "#f0f9ff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Открыть мою смету</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Мастер прислал вам ссылку</div>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: "0 0 14px" }}>
            Перейдите по ссылке из сообщения мастера, чтобы посмотреть смету и подтвердить бронирование.
          </p>
          <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>Пример ссылки:</div>
            <div style={{ fontSize: 13, color: "#374151", fontFamily: "monospace" }}>sfera-project.digital/client/smeta/...</div>
          </div>
        </div>

        {/* Trust badges */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { icon: "🛡", title: "Гарантия", sub: "6 месяцев" },
            { icon: "✓", title: "ИП офиц.", sub: "ИНН 2624..." },
            { icon: "📞", title: "Поддержка", sub: "8 989 286-08-63" },
          ].map((b, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "14px 10px", textAlign: "center", boxShadow: "0 1px 6px rgba(0,0,0,.05)", border: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{b.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{b.title}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{b.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: 12, color: "#d1d5db", paddingBottom: 24 }}>sfera-project.digital</p>
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
