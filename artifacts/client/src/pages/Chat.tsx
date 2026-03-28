import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import BottomNav from "@/components/BottomNav";

interface Message {
  id: number;
  message: string;
  fromClient: boolean;
  operatorName: string | null;
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

export default function Chat() {
  const { token } = useParams<{ token: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const r = await fetch(`/api/client/chat/${token}`);
      if (r.status === 404) { setNotFound(true); setLoading(false); return; }
      const d = await r.json();
      setMessages(d.messages ?? []);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(loadMessages, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const msg = text.trim();
    setText("");
    try {
      const r = await fetch(`/api/client/chat/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (r.ok) await loadMessages();
    } catch {}
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (loading) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef0f5", fontFamily: "Inter, sans-serif" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #bfdbfe", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (notFound) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef0f5", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>Смета не найдена</h2>
      </div>
    </div>
  );

  let lastDateLabel = "";

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "#f5f3ff",
      overflow: "hidden",
    }}>
      {/* Topbar */}
      <div style={{
        background: "#fff",
        borderBottom: "1.5px solid #ede9fc",
        display: "flex", alignItems: "center",
        gap: 10, padding: "14px 16px",
        flexShrink: 0,
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
        boxShadow: "0 1px 8px rgba(109,40,217,.06)",
      }}>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1040" }}>Чат с поддержкой</span>
          <div style={{ fontSize: 11, color: "#9490b4", marginTop: 1 }}>Честный мастер</div>
        </div>
      </div>

      {/* Operator info banner */}
      <div style={{ flexShrink: 0, padding: "10px 12px 0" }}>
        <div style={{ background: "#ede9fc", border: "1.5px solid #ddd6fe", borderRadius: 14, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1040" }}>Служба поддержки</div>
            <div style={{ fontSize: 11, color: "#6d5fd0", marginTop: 1 }}>Честный мастер · отвечаем в течение часа</div>
          </div>
        </div>
      </div>

      {/* Messages — scrollable area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 8px", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#9ca3af" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Напишите нам</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>Задайте вопрос — оператор ответит как можно скорее</div>
          </div>
        )}

        {messages.map((msg, i) => {
          const dateLabel = formatDate(msg.createdAt);
          const showDate = dateLabel !== lastDateLabel;
          if (showDate) lastDateLabel = dateLabel;
          const isClient = msg.fromClient;

          return (
            <div key={msg.id}>
              {showDate && (
                <div style={{ textAlign: "center", margin: "12px 0 8px" }}>
                  <span style={{ fontSize: 11, color: "#9ca3af", background: "#e5e7eb", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{dateLabel}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: isClient ? "flex-end" : "flex-start", marginBottom: 8, alignItems: "flex-end", gap: 6 }}>
                {!isClient && (
                  <div style={{ width: 26, height: 26, background: "#1d4ed8", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                )}
                <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: isClient ? "flex-end" : "flex-start" }}>
                  {!isClient && <span style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2, paddingLeft: 2 }}>{msg.operatorName ?? "Оператор"}</span>}
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: isClient ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    background: isClient ? "#1d4ed8" : "#fff",
                    color: isClient ? "#fff" : "#111827",
                    fontSize: 14, lineHeight: 1.5,
                    boxShadow: "0 1px 4px rgba(0,0,0,.08)",
                    border: isClient ? "none" : "1px solid #e5e7eb",
                  }}>
                    {msg.message}
                  </div>
                  <span style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {/* Input bar — статичный, прилипает к низу */}
      <div style={{
        flexShrink: 0,
        background: "#fff",
        borderTop: "1px solid #e5e7eb",
        padding: "10px 12px",
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}>
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Написать сообщение..."
          style={{
            flex: 1, height: 44, border: "1.5px solid #e5e7eb", borderRadius: 22,
            padding: "0 16px", fontSize: 14, fontFamily: "inherit",
            outline: "none", background: "#f9fafb", color: "#111827",
          }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          style={{
            width: 44, height: 44, borderRadius: "50%", border: "none",
            background: text.trim() ? "#1d4ed8" : "#e5e7eb",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: text.trim() ? "pointer" : "default",
            transition: "background 0.15s", flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={text.trim() ? "#fff" : "#9ca3af"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      {/* Bottom nav — статичный, часть flex-колонки */}
      <BottomNav token={token} active="chat" staticMode />
    </div>
  );
}
