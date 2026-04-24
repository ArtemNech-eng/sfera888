interface BottomNavProps {
  token?: string;
  active: "home" | "smeta" | "estimate" | "support" | "orders";
  staticMode?: boolean;
  supportPhone?: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const isStandalone =
  (typeof window !== "undefined" && (window.navigator as { standalone?: boolean }).standalone === true) ||
  (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches);

const IcHome = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const IcSmeta = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

const IcOrders = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="2"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
    <line x1="9" y1="16" x2="12" y2="16"/>
  </svg>
);

const IcCamera = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

const IcChat = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

export default function BottomNav({ token, active, staticMode = false, supportPhone }: BottomNavProps) {
  const phoneParam = supportPhone ? `?p=${encodeURIComponent(supportPhone)}` : "";

  const smetaTabs = [
    { id: "home" as const,    label: "Главная",   href: `${BASE}/`,                          icon: <IcHome /> },
    { id: "smeta" as const,   label: "Смета",     href: `${BASE}/smeta/${token}`,            icon: <IcSmeta /> },
    { id: "estimate" as const,label: "AI Оценка", href: `${BASE}/estimate`,                  icon: <IcCamera /> },
    { id: "support" as const, label: "Поддержка", href: `${BASE}/support${phoneParam}`,      icon: <IcChat /> },
  ];

  const homeTabs = [
    { id: "home" as const,    label: "Главная",   href: `${BASE}/`,                          icon: <IcHome /> },
    { id: "orders" as const,  label: "Заказы",    href: `${BASE}/my-orders`,                 icon: <IcOrders /> },
    { id: "estimate" as const,label: "AI Оценка", href: `${BASE}/estimate`,                  icon: <IcCamera /> },
    { id: "support" as const, label: "Поддержка", href: `${BASE}/support${phoneParam}`,      icon: <IcChat /> },
  ];

  const tabs = token ? smetaTabs : homeTabs;

  return (
    <nav style={{
      position: staticMode ? "static" : "fixed",
      bottom: staticMode ? undefined : 0,
      left: 0, right: 0,
      background: "#fff",
      borderTop: "1.5px solid #D0EDEB",
      display: "flex",
      zIndex: staticMode ? undefined : 100,
      boxShadow: staticMode ? "none" : "0 -2px 20px rgba(13,148,136,.07)",
      paddingBottom: isStandalone ? "env(safe-area-inset-bottom, 0px)" : "0px",
      flexShrink: 0,
    }}>
      {tabs.map(item => {
        const isActive = active === item.id;
        return (
          <a
            key={item.id}
            href={item.href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 2px 10px",
              gap: 3,
              textDecoration: "none",
              WebkitTapHighlightColor: "transparent",
            }}
            onClick={e => { e.preventDefault(); window.location.href = item.href; }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 28,
              borderRadius: 10,
              background: isActive ? "#F0FDFA" : "transparent",
              color: isActive ? "#0D9488" : "#4A6B69",
              transition: "background 0.15s, color 0.15s",
            }}>
              {item.icon}
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "#0D9488" : "#4A6B69",
              letterSpacing: "0.01em",
              lineHeight: 1,
              fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
              transition: "color 0.15s",
            }}>
              {item.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
