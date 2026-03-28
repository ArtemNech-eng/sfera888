interface BottomNavProps {
  token?: string;
  active: "home" | "smeta" | "chat" | "history" | "estimate";
  unread?: number;
  staticMode?: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function BottomNav({ token, active, unread = 0, staticMode = false }: BottomNavProps) {
  const hasToken = !!token;

  const homeNav = [
    {
      id: "home",
      label: "Главная",
      href: `${BASE}/`,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
    {
      id: "estimate",
      label: "AI Оценка",
      href: `${BASE}/estimate`,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      ),
    },
  ] as const;

  const smetaNav = [
    {
      id: "smeta",
      label: "Смета",
      href: `${BASE}/smeta/${token}`,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      ),
    },
    {
      id: "chat",
      label: "Чат",
      href: `${BASE}/smeta/${token}/chat`,
      badge: unread > 0 ? unread : 0,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    },
    {
      id: "history",
      label: "История",
      href: `${BASE}/smeta/${token}/history`,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="12 8 12 12 14 14"/>
          <path d="M3.05 11a9 9 0 1 0 .5-4.5"/>
          <polyline points="3 3 3 8 8 8"/>
        </svg>
      ),
    },
    {
      id: "estimate",
      label: "AI Оценка",
      href: `${BASE}/estimate`,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      ),
    },
  ] as const;

  const nav = hasToken ? smetaNav : homeNav;

  return (
    <nav style={{
      position: staticMode ? "static" : "fixed",
      bottom: staticMode ? undefined : 0,
      left: 0, right: 0,
      background: "#fff",
      borderTop: "1.5px solid #ede9fc",
      display: "flex",
      zIndex: staticMode ? undefined : 100,
      boxShadow: staticMode ? "none" : "0 -4px 16px rgba(109,40,217,.08)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      flexShrink: 0,
    }}>
      {nav.map(item => {
        const isActive = active === item.id;
        return (
          <a
            key={item.id}
            href={item.href}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "12px 4px 10px", gap: 4,
              color: isActive ? "#1d4ed8" : "#9490b4",
              textDecoration: "none", position: "relative",
              transition: "color 0.15s",
            }}
            onClick={e => { e.preventDefault(); window.location.href = item.href; }}
          >
            <div style={{ position: "relative" }}>
              <svg style={{ opacity: 0, position: "absolute", pointerEvents: "none" }}><path strokeWidth={isActive ? "2.2" : "1.8"}/></svg>
              <span style={{ color: isActive ? "#1d4ed8" : "#9490b4", display: "flex" }}>
                {item.icon}
              </span>
              {"badge" in item && item.badge > 0 && (
                <span style={{
                  position: "absolute", top: -4, right: -6,
                  background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700,
                  minWidth: 15, height: 15, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1.5px solid #fff",
                }}>{item.badge > 9 ? "9+" : item.badge}</span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, letterSpacing: "0.01em", lineHeight: 1 }}>{item.label}</span>
            {isActive && (
              <span style={{
                position: "absolute", top: 0, left: "20%", right: "20%",
                height: 2.5, background: "#1d4ed8", borderRadius: "0 0 4px 4px",
              }} />
            )}
          </a>
        );
      })}
    </nav>
  );
}
