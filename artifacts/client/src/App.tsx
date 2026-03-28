import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import Smeta from "@/pages/Smeta";
import Chat from "@/pages/Chat";
import History from "@/pages/History";
import Estimate from "@/pages/Estimate";
import MyOrders from "@/pages/MyOrders";
import InstallPrompt from "@/components/InstallPrompt";
import BottomNav from "@/components/BottomNav";
import { getStoredPhone, clearStoredPhone, formatPhone } from "@/utils/phone";

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
  const [storedPhone] = useState(() => getStoredPhone());
  const [orderCount, setOrderCount] = useState<number | null>(null);

  useEffect(() => {
    if (!storedPhone) return;
    fetch(`/api/client/my-orders?phone=${encodeURIComponent(storedPhone)}`)
      .then(r => r.json())
      .then(d => setOrderCount(d.items?.length ?? 0))
      .catch(() => {});
  }, [storedPhone]);

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "#f5f3ff",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        background: "#fff",
        borderBottom: "1.5px solid #ede9fc",
        padding: "12px 16px",
        paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        boxShadow: "0 1px 8px rgba(109,40,217,.06)",
      }}>
        <AppIcon size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", letterSpacing: -0.3 }}>Честный мастер</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Ремонт · Безопасно · Гарантия 6 мес.</div>
        </div>
        {storedPhone && (
          <button
            onClick={() => window.location.href = `${BASE}/my-orders`}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8" }}>Мои заказы</span>
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 16px" }}>

        {/* My orders card (if logged in) */}
        {storedPhone && (
          <div onClick={() => window.location.href = `${BASE}/my-orders`} style={{
            background: "#fff", borderRadius: 14, padding: "12px 14px",
            marginBottom: 10, border: "1.5px solid #bfdbfe",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ width: 36, height: 36, background: "#dbeafe", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="12 8 12 12 14 14"/>
                <path d="M3.05 11a9 9 0 1 0 .5-4.5"/><polyline points="3 3 3 8 8 8"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a8a" }}>Мои заказы</div>
              <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 1 }}>
                {formatPhone(storedPhone)}
                {orderCount !== null ? ` · ${orderCount} ${orderCount === 1 ? "заказ" : orderCount < 5 ? "заказа" : "заказов"}` : ""}
              </div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        )}

        {/* AI estimate card — primary action */}
        <div onClick={() => { window.location.href = `${BASE}/estimate`; }} style={{
          background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
          borderRadius: 18, padding: "16px 16px 14px",
          cursor: "pointer", userSelect: "none",
          boxShadow: "0 6px 20px rgba(29,78,216,.3)",
          marginBottom: 10,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", right: -20, top: -20, width: 90, height: 90, background: "rgba(255,255,255,.07)", borderRadius: "50%" }} />
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,.2)", borderRadius: 20, padding: "3px 9px", marginBottom: 10 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>AI · Бесплатно</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 6px", lineHeight: 1.2, letterSpacing: -0.4, position: "relative" }}>
            Узнать стоимость работ
          </h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.7)", margin: "0 0 14px", lineHeight: 1.5, position: "relative" }}>
            Сфотографируйте задачу — AI составит смету за 30 секунд
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.18)", borderRadius: 12, padding: "10px 14px", position: "relative" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Получить оценку</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>

        {/* Smeta info */}
        <div style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", marginBottom: 10, border: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, background: "#eff6ff", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Открыть мою смету</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Перейдите по ссылке от мастера</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5, margin: 0 }}>
            Мастер прислал ссылку в сообщении. Нажмите на неё — откроется смета с деталями и возможностью оплатить бронь.
          </p>
        </div>

        {/* Trust badges */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, title: "Гарантия", sub: "6 месяцев" },
            { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>, title: "ИП офиц.", sub: "ИНН 2624..." },
            { icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>, title: "Поддержка", sub: "24/7" },
          ].map((b, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "10px 8px", textAlign: "center", border: "1px solid #e5e7eb" }}>
              <div style={{ marginBottom: 4, display: "flex", justifyContent: "center" }}>{b.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{b.title}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{b.sub}</div>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", fontSize: 10, color: "#d1d5db", marginTop: 14 }}>sfera-project.digital</p>
      </div>

      <BottomNav active="home" staticMode />
      <InstallPrompt />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/estimate" component={Estimate} />
      <Route path="/my-orders" component={MyOrders} />
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
