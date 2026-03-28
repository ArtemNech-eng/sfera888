interface BottomNavProps {
  token: string;
  active: "smeta" | "chat" | "history";
  unread?: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function BottomNav({ token, active, unread = 0 }: BottomNavProps) {
  const nav = [
    {
      id: "smeta",
      label: "Смета",
      href: `${BASE}/smeta/${token}`,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    },
    {
      id: "history",
      label: "История",
      href: `${BASE}/smeta/${token}/history`,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="12 8 12 12 14 14"/>
          <path d="M3.05 11a9 9 0 1 0 .5-4.5"/>
          <polyline points="3 3 3 8 8 8"/>
        </svg>
      ),
    },
  ] as const;

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: "#fff", borderTop: "1px solid #e5e7eb",
      display: "flex", zIndex: 100,
      boxShadow: "0 -2px 12px rgba(0,0,0,.06)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {nav.map(item => {
        const isActive = active === item.id;
        return (
          <a
            key={item.id}
            href={item.href}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "10px 4px 8px", gap: 3,
              color: isActive ? "#1d4ed8" : "#9ca3af",
              textDecoration: "none", position: "relative",
              transition: "color 0.15s",
            }}
            onClick={e => { e.preventDefault(); window.location.href = item.href; }}
          >
            <div style={{ position: "relative" }}>
              {item.icon}
              {"badge" in item && item.badge > 0 && (
                <span style={{
                  position: "absolute", top: -4, right: -6,
                  background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700,
                  width: 16, height: 16, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>{item.badge}</span>
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 400, letterSpacing: "0.01em" }}>{item.label}</span>
            {isActive && (
              <span style={{
                position: "absolute", top: 0, left: "20%", right: "20%",
                height: 3, background: "#1d4ed8", borderRadius: "0 0 4px 4px",
              }} />
            )}
          </a>
        );
      })}
    </nav>
  );
}
