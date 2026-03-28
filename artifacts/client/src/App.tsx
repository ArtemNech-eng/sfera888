import { Switch, Route, Router as WouterRouter } from "wouter";
import Smeta from "@/pages/Smeta";
import Chat from "@/pages/Chat";
import History from "@/pages/History";
import Estimate from "@/pages/Estimate";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function Home() {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", minHeight: "100vh", background: "#eef0f5", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 52, height: 52, background: "#2563eb", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 10, textAlign: "center" }}>Честный мастер</h1>
      <p style={{ fontSize: 15, color: "#6b7280", textAlign: "center", maxWidth: 320, lineHeight: 1.6, marginBottom: 28 }}>
        Откройте ссылку на смету, которую прислал вам мастер, или узнайте стоимость работ прямо сейчас.
      </p>
      <a
        href={`${BASE}/estimate`}
        onClick={e => { e.preventDefault(); window.location.href = `${BASE}/estimate`; }}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px", background: "#1d4ed8", color: "#fff", borderRadius: 14, textDecoration: "none", fontSize: 15, fontWeight: 700 }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Узнать стоимость
      </a>
      <p style={{ marginTop: 28, fontSize: 12, color: "#9ca3af" }}>sfera-project.digital</p>
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
