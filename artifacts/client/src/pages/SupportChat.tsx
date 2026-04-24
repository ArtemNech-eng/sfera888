import { useState, useEffect, useRef, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import { getStoredPhone, setStoredPhone, formatPhone } from "@/utils/phone";

function useVisualViewportHeight() {
  const [height, setHeight] = useState(() =>
    typeof window !== "undefined"
      ? (window.visualViewport?.height ?? window.innerHeight)
      : 600
  );
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return height;
}

interface Message {
  id: number;
  message: string;
  fromClient: boolean;
  operatorName: string | null;
  clientName: string | null;
  createdAt: string;
  seenAt: string | null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function PhoneEntry({ onEnter }: { onEnter: (phone: string) => void }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 10) { setErr("Введите номер телефона полностью"); return; }
    const phone = value.trim();
    setStoredPhone(phone);
    onEnter(phone);
  };

  return (
    <div style={{ height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column", background: "#F5FAFA", fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #D0EDEB", padding: "14px 16px", paddingTop: "calc(14px + env(safe-area-inset-top, 0px))", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, boxShadow: "0 1px 8px rgba(13,148,136,.06)" }}>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#0D9488,#14B8A6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0D2B28" }}>Чат с поддержкой</div>
          <div style={{ fontSize: 11, color: "#4A6B69" }}>Честный мастер</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 24px" }}>
        <div style={{ width: 72, height: 72, background: "linear-gradient(135deg,#0D9488,#14B8A6)", borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, boxShadow: "0 8px 28px rgba(13,148,136,.25)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0D2B28", marginBottom: 10, textAlign: "center", letterSpacing: -0.4 }}>Укажите номер телефона</h2>
        <p style={{ fontSize: 13, color: "#4A6B69", textAlign: "center", lineHeight: 1.6, marginBottom: 28, maxWidth: 280 }}>
          Введите номер, который вы указывали при обращении к мастеру
        </p>
        <div style={{ width: "100%", maxWidth: 340 }}>
          <input
            type="tel"
            autoFocus
            autoComplete="tel"
            value={value}
            onChange={e => { setValue(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="+7 999 000-00-00"
            style={{ width: "100%", height: 52, border: `1.5px solid ${err ? "#ef4444" : "#D0EDEB"}`, borderRadius: 14, padding: "0 18px", fontSize: 18, fontFamily: "inherit", color: "#0D2B28", background: "#fff", outline: "none", boxSizing: "border-box", textAlign: "center", letterSpacing: 1 }}
          />
          {err && <div style={{ fontSize: 12, color: "#ef4444", textAlign: "center", marginTop: 6 }}>{err}</div>}
        </div>
        <button onClick={submit} style={{ width: "100%", maxWidth: 340, height: 50, background: "linear-gradient(135deg,#0F4C45,#0D9488)", color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 14, boxShadow: "0 4px 16px rgba(13,148,136,.3)" }}>
          Открыть чат
        </button>
      </div>

      <BottomNav active="support" staticMode />
    </div>
  );
}

function getPhoneFromUrl(): string | null {
  try {
    const p = new URLSearchParams(window.location.search).get("p");
    return p ? decodeURIComponent(p) : null;
  } catch { return null; }
}

export default function SupportChat() {
  const [phone, setPhone] = useState<string | null>(() => {
    const stored = getStoredPhone();
    if (stored) return stored;
    const urlPhone = getPhoneFromUrl();
    if (urlPhone) {
      setStoredPhone(urlPhone);
      return urlPhone;
    }
    return null;
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const normalizedPhone = phone ? phone.replace(/\D/g, "").slice(-10) : null;
  const vpHeight = useVisualViewportHeight();

  const loadMessages = useCallback(async () => {
    if (!normalizedPhone) return;
    try {
      const r = await fetch(`/api/client/support/${normalizedPhone}`);
      if (!r.ok) return;
      const d = await r.json();
      setMessages(d.messages ?? []);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [normalizedPhone]);

  useEffect(() => {
    if (!normalizedPhone) { setLoading(false); return; }
    loadMessages();
    pollRef.current = setInterval(loadMessages, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadMessages, normalizedPhone]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [vpHeight]);

  const send = async () => {
    if (!text.trim() || sending || !normalizedPhone) return;
    setSending(true);
    const msg = text.trim();
    setText("");
    try {
      const r = await fetch(`/api/client/support/${normalizedPhone}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (r.ok) await loadMessages();
    } catch {}
    setSending(false);
    inputRef.current?.focus();
  };

  if (!phone) return <PhoneEntry onEnter={p => setPhone(p)} />;

  if (loading) return (
    <div style={{ height: `${vpHeight}px`, display: "flex", alignItems: "center", justifyContent: "center", background: "#F5FAFA", fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #5EEAD4", borderTopColor: "#0D9488", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  let lastDateLabel = "";

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", height: `${vpHeight}px`, display: "flex", flexDirection: "column", background: "#F5FAFA", overflow: "hidden" }}>
      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #D0EDEB", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", flexShrink: 0, paddingTop: "calc(14px + env(safe-area-inset-top, 0px))", boxShadow: "0 1px 8px rgba(13,148,136,.06)" }}>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#0D9488,#14B8A6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0D2B28" }}>Чат с поддержкой</div>
          <div style={{ fontSize: 11, color: "#4A6B69" }}>Честный мастер · отвечаем в течение часа</div>
        </div>
        <div style={{ fontSize: 11, color: "#4A6B69", background: "#F0FDFA", padding: "4px 9px", borderRadius: 20, fontWeight: 500 }}>
          {formatPhone(phone)}
        </div>
      </div>

      {/* Info banner */}
      <div style={{ flexShrink: 0, padding: "10px 12px 0" }}>
        <div style={{ background: "#D0EDEB", border: "1.5px solid #99F6E4", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#0D9488,#14B8A6)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0D2B28" }}>Служба поддержки</div>
            <div style={{ fontSize: 11, color: "#0F766E" }}>Задайте любой вопрос — ответим в течение часа</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "12px 12px 8px", WebkitOverflowScrolling: "touch", minWidth: 0 } as React.CSSProperties}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#0D2B28", marginBottom: 6 }}>Напишите нам</div>
            <div style={{ fontSize: 13, color: "#4A6B69", lineHeight: 1.6 }}>Задайте вопрос — оператор ответит как можно скорее</div>
          </div>
        )}
        {messages.map((msg) => {
          const dateLabel = formatDate(msg.createdAt);
          const showDate = dateLabel !== lastDateLabel;
          if (showDate) lastDateLabel = dateLabel;
          const isClient = msg.fromClient;
          return (
            <div key={msg.id}>
              {showDate && (
                <div style={{ textAlign: "center", margin: "12px 0 8px" }}>
                  <span style={{ fontSize: 11, color: "#4A6B69", background: "#D0EDEB", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{dateLabel}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: isClient ? "flex-end" : "flex-start", marginBottom: 8, alignItems: "flex-end", gap: 6 }}>
                {!isClient && (
                  <div style={{ width: 26, height: 26, background: "#0D9488", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                )}
                <div style={{ maxWidth: "78%", minWidth: 0, display: "flex", flexDirection: "column", alignItems: isClient ? "flex-end" : "flex-start" }}>
                  {!isClient && <span style={{ fontSize: 10, color: "#4A6B69", marginBottom: 2, paddingLeft: 2 }}>{msg.operatorName ?? "Оператор"}</span>}
                  <div style={{ padding: "10px 14px", borderRadius: isClient ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: isClient ? "#0D9488" : "#fff", color: isClient ? "#fff" : "#0D2B28", fontSize: 14, lineHeight: 1.5, boxShadow: "0 1px 4px rgba(0,0,0,.08)", border: isClient ? "none" : "1px solid #D0EDEB", wordBreak: "break-word", overflowWrap: "break-word" }}>
                    {msg.message}
                  </div>
                  <span style={{ fontSize: 10, color: "#4A6B69", marginTop: 3 }}>{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, background: "#fff", borderTop: "1px solid #D0EDEB", padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Написать сообщение..."
          style={{ flex: 1, height: 44, border: "1.5px solid #D0EDEB", borderRadius: 22, padding: "0 16px", fontSize: 14, fontFamily: "inherit", outline: "none", background: "#f9f7ff", color: "#0D2B28" }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: text.trim() ? "#0D9488" : "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", cursor: text.trim() ? "pointer" : "default", transition: "background 0.15s", flexShrink: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={text.trim() ? "#fff" : "#9ca3af"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      <BottomNav active="support" staticMode supportPhone={phone ?? undefined} />
    </div>
  );
}
