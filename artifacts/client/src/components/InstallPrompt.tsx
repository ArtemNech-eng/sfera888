import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    const saved = localStorage.getItem("pwa_install_dismissed");
    if (saved && Date.now() - Number(saved) < 3 * 24 * 60 * 60 * 1000) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowAndroid(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isIOS() && !isInStandaloneMode()) {
      setShowIOS(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    setShowAndroid(false);
    setShowIOS(false);
    localStorage.setItem("pwa_install_dismissed", String(Date.now()));
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowAndroid(false);
      setDeferredPrompt(null);
    }
  };

  if (dismissed) return null;

  if (showAndroid) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
        background: "#fff", borderTop: "1px solid #e5e7eb",
        padding: "16px 20px",
        boxShadow: "0 -4px 20px rgba(0,0,0,.12)",
        display: "flex", alignItems: "center", gap: 14,
        paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ width: 44, height: 44, background: "#1d4ed8", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Установить приложение</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Быстрый доступ с экрана телефона</div>
        </div>
        <button onClick={install} style={{
          padding: "10px 16px", background: "#1d4ed8", color: "#fff",
          border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
        }}>
          Установить
        </button>
        <button onClick={dismiss} style={{
          width: 32, height: 32, background: "none", border: "none",
          cursor: "pointer", color: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    );
  }

  if (showIOS) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
        background: "#fff", borderTop: "1px solid #e5e7eb",
        padding: "16px 20px",
        boxShadow: "0 -4px 20px rgba(0,0,0,.12)",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, background: "#1d4ed8", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Установить приложение</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Честный мастер</div>
            </div>
          </div>
          <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 13, color: "#0369a1", lineHeight: 1.6 }}>
            Нажмите{" "}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#fff", border: "1px solid #bae6fd", borderRadius: 6, padding: "2px 8px", verticalAlign: "middle" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0369a1" strokeWidth="2" strokeLinecap="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0369a1" }}>Поделиться</span>
            </span>
            {" "}→ «На экран Домой» чтобы добавить ярлык приложения
          </div>
        </div>
      </div>
    );
  }

  return null;
}
