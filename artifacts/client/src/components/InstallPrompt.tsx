import { useState, useEffect } from "react";
import { getStoredPhone, setStoredPhone } from "@/utils/phone";

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

  const [step, setStep] = useState<"banner" | "phone" | "ios-instructions">("banner");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [shaking, setShaking] = useState(false);

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

  const handleInstallClick = () => {
    const stored = getStoredPhone();
    if (stored) {
      triggerInstall();
    } else {
      setStep("phone");
    }
  };

  const handleIOSClick = () => {
    const stored = getStoredPhone();
    if (stored) {
      setStep("ios-instructions");
    } else {
      setStep("phone");
    }
  };

  const handlePhoneSubmit = () => {
    setPhoneError("");
    const trimmed = phone.trim();
    if (trimmed.replace(/\D/g, "").length < 10) {
      setPhoneError("Введите номер телефона полностью");
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return;
    }
    setStoredPhone(trimmed);
    if (showIOS) {
      setStep("ios-instructions");
    } else {
      triggerInstall();
    }
  };

  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowAndroid(false);
      setDeferredPrompt(null);
    }
  };

  if (dismissed) return null;
  if (!showAndroid && !showIOS) return null;

  if (step === "phone") {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(26,16,64,0.55)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-end",
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      }}>
        <div style={{
          width: "100%", background: "#fff",
          borderRadius: "24px 24px 0 0",
          padding: "6px 0 0",
          boxShadow: "0 -8px 40px rgba(29,78,216,.18)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}>
          <div style={{ width: 36, height: 4, background: "#e5e7eb", borderRadius: 4, margin: "0 auto 20px" }} />

          <div style={{ padding: "0 24px 28px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div style={{ width: 44, height: 44, background: "linear-gradient(135deg,#1e3a8a,#2563eb)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 14px rgba(29,78,216,.3)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1a1040" }}>Ваш номер телефона</div>
                <div style={{ fontSize: 12, color: "#9490b4", marginTop: 2 }}>Для доступа к заказам и чату</div>
              </div>
            </div>

            <div style={{ animation: shaking ? "shake 0.4s ease" : "none", marginBottom: 12 }}>
              <input
                type="tel"
                autoFocus
                autoComplete="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setPhoneError(""); }}
                onKeyDown={e => e.key === "Enter" && handlePhoneSubmit()}
                placeholder="+7 999 000-00-00"
                style={{
                  width: "100%", height: 52,
                  border: `1.5px solid ${phoneError ? "#ef4444" : "#ede9fc"}`,
                  borderRadius: 14, padding: "0 18px",
                  fontSize: 20, fontFamily: "inherit",
                  color: "#1a1040", background: "#f5f3ff",
                  outline: "none", boxSizing: "border-box",
                  textAlign: "center", letterSpacing: 1,
                  transition: "border-color 0.15s",
                }}
              />
              {phoneError && (
                <div style={{ fontSize: 12, color: "#ef4444", textAlign: "center", marginTop: 6, lineHeight: 1.4 }}>{phoneError}</div>
              )}
            </div>

            <button
              onClick={handlePhoneSubmit}
              style={{
                width: "100%", height: 50,
                background: "linear-gradient(135deg,#1e3a8a,#1d4ed8)", color: "#fff",
                border: "none", borderRadius: 14,
                fontSize: 15, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 4px 16px rgba(29,78,216,.3)",
                marginBottom: 10,
              }}
            >
              {showIOS ? "Продолжить" : "Установить приложение"}
            </button>

            <button onClick={dismiss} style={{ width: "100%", background: "none", border: "none", fontSize: 13, color: "#9490b4", cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}>
              Пропустить
            </button>
          </div>
        </div>
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-8px); }
            40% { transform: translateX(8px); }
            60% { transform: translateX(-6px); }
            80% { transform: translateX(6px); }
          }
        `}</style>
      </div>
    );
  }

  if (step === "ios-instructions") {
    return (
      <div style={{
        position: "fixed", bottom: "56px", left: 0, right: 0, zIndex: 999,
        background: "#fff", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb",
        padding: "14px 20px",
        boxShadow: "0 -4px 20px rgba(0,0,0,.12)",
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
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

  if (showAndroid) {
    return (
      <div style={{
        position: "fixed", bottom: "56px", left: 0, right: 0, zIndex: 999,
        background: "#fff", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb",
        padding: "14px 20px",
        boxShadow: "0 -4px 20px rgba(0,0,0,.12)",
        display: "flex", alignItems: "center", gap: 14,
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
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
        <button onClick={handleInstallClick} style={{
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
        position: "fixed", bottom: "56px", left: 0, right: 0, zIndex: 999,
        background: "#fff", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb",
        padding: "14px 20px",
        boxShadow: "0 -4px 20px rgba(0,0,0,.12)",
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
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
        <button
          onClick={handleIOSClick}
          style={{
            width: "100%", padding: "11px 0",
            background: "linear-gradient(135deg,#1e3a8a,#1d4ed8)", color: "#fff",
            border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", marginBottom: 10,
          }}
        >
          Установить на экран
        </button>
        <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
          Нажмите и следуйте инструкции
        </div>
      </div>
    );
  }

  return null;
}
