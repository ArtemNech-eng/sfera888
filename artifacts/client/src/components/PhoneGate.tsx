import { useState } from "react";
import { setStoredPhone, phonesMatch } from "@/utils/phone";

interface PhoneGateProps {
  expectedPhone: string;
  onSuccess: () => void;
}

export default function PhoneGate({ expectedPhone, onSuccess }: PhoneGateProps) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);

  const handleSubmit = () => {
    setError("");
    const trimmed = phone.trim();
    if (trimmed.replace(/\D/g, "").length < 10) {
      setError("Введите номер телефона полностью");
      return;
    }
    if (!phonesMatch(trimmed, expectedPhone)) {
      setError("Номер не совпадает с данными в смете. Проверьте и попробуйте ещё раз.");
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      return;
    }
    setStoredPhone(trimmed);
    onSuccess();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#F1FBF3",
      display: "flex", flexDirection: "column",
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background: "#fff",
        borderBottom: "1.5px solid #D5EDD8",
        padding: "14px 20px",
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        flexShrink: 0,
        boxShadow: "0 1px 8px rgba(33,160,56,.06)",
      }}>
        <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#155724,#21A038)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#0F2014" }}>Честный мастер</span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 24px" }}>
        {/* Icon */}
        <div style={{
          width: 72, height: 72,
          background: "linear-gradient(135deg,#21A038,#4CAF50)",
          borderRadius: 22,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 24, boxShadow: "0 8px 28px rgba(33,160,56,.25)",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F2014", marginBottom: 10, textAlign: "center", letterSpacing: -0.5 }}>
          Подтвердите номер
        </h1>
        <p style={{ fontSize: 14, color: "#5E7A62", textAlign: "center", lineHeight: 1.6, marginBottom: 28, maxWidth: 300 }}>
          Введите номер телефона, который вы указали при обращении к мастеру
        </p>

        {/* Input */}
        <div style={{
          width: "100%", maxWidth: 360,
          animation: shaking ? "shake 0.4s ease" : "none",
        }}>
          <input
            type="tel"
            autoComplete="tel"
            autoFocus
            value={phone}
            onChange={e => { setPhone(e.target.value); setError(""); }}
            onKeyDown={handleKey}
            placeholder="+7 999 000-00-00"
            style={{
              width: "100%", height: 54,
              border: `1.5px solid ${error ? "#ef4444" : "#D5EDD8"}`,
              borderRadius: 14, padding: "0 18px",
              fontSize: 20, fontFamily: "inherit",
              color: "#0F2014", background: "#fff",
              outline: "none", boxSizing: "border-box",
              textAlign: "center", letterSpacing: 1,
              transition: "border-color 0.15s",
              boxShadow: "0 1px 4px rgba(33,160,56,.06)",
            }}
          />
          {error && (
            <div style={{ fontSize: 13, color: "#ef4444", textAlign: "center", marginTop: 8, lineHeight: 1.4 }}>
              {error}
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          style={{
            width: "100%", maxWidth: 360, height: 52,
            background: "linear-gradient(135deg,#155724,#21A038)", color: "#fff",
            border: "none", borderRadius: 14,
            fontSize: 16, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
            marginTop: 14,
            boxShadow: "0 4px 16px rgba(33,160,56,.3)",
          }}
        >
          Открыть смету
        </button>

        <p style={{ fontSize: 12, color: "#5E7A62", textAlign: "center", marginTop: 16, lineHeight: 1.5, maxWidth: 280 }}>
          Номер используется только для идентификации вашего заказа
        </p>
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
