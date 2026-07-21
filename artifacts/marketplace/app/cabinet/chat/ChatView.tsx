"use client";

import {
  useEffect, useRef, useState, useLayoutEffect,
  type ChangeEvent, type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import {
  cabinetChat,
  uploadPhoto,
  type ChatMessage,
} from "../_lib/cabinetClient";
import { resolvePhotoUrl } from "../_lib/photo";

const POLL_MS = 5_000;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

/**
 * Premium chat — Telegram/WhatsApp grade.
 * Keeps the same polling logic as before; only the UI is upgraded.
 */
export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Fetch + poll ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load(silent = false) {
      try {
        const data = await cabinetChat.fetch();
        if (cancelled) return;
        setMessages(data);
        if (!silent) setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (!silent) {
          toast.error(err instanceof Error ? err.message : "Ошибка загрузки чата");
          setLoading(false);
        }
      }
    }
    void load();
    const timer = setInterval(() => void load(true), POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: loading ? "instant" : "smooth" });
  }, [messages.length, loading]);

  // ── Textarea auto-resize ────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [text]);

  // ── Photo select ────────────────────────────────────────────────────────────
  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Выберите изображение"); e.target.value = ""; return; }
    if (file.size > MAX_PHOTO_SIZE) { toast.error("Файл слишком большой (макс. 10 МБ)"); e.target.value = ""; return; }
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview);
    setPendingPhoto({ file, preview: URL.createObjectURL(file) });
    e.target.value = "";
  };

  const removePendingPhoto = () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview);
    setPendingPhoto(null);
  };

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !pendingPhoto) return;
    if (sending || uploadingPhoto) return;
    setSending(true);
    try {
      let photoUrl: string | undefined;
      if (pendingPhoto) {
        setUploadingPhoto(true);
        photoUrl = await uploadPhoto(pendingPhoto.file);
        setUploadingPhoto(false);
      }
      const msg = await cabinetChat.send(trimmed, photoUrl);
      setMessages((prev) => [...prev, msg]);
      setText("");
      removePendingPhoto();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setSending(false);
      setUploadingPhoto(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  };

  // ── Group by day ────────────────────────────────────────────────────────────
  const grouped: { day: string; msgs: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const day = formatDay(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last?.day === day) last.msgs.push(msg);
    else grouped.push({ day, msgs: [msg] });
  }

  const canSend = (text.trim().length > 0 || pendingPhoto !== null) && !sending && !uploadingPhoto;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="relative flex flex-shrink-0 items-center gap-3 overflow-hidden px-4 py-3"
        style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)" }}>
        {/* Subtle pattern overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

        {/* Avatar */}
        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20 shadow-inner ring-2 ring-white/30">
          <DispatcherIcon />
          {/* Online dot */}
          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-indigo-500 bg-emerald-400" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-white">Диспетчер SFERA</p>
          <p className="text-[11px] text-white/75">на связи · отвечаем в течение часа</p>
        </div>
      </header>

      {/* ── Messages ── */}
      <div
        ref={listRef}
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4"
        style={{ background: "linear-gradient(180deg, #f0f4ff 0%, #f5f5f7 100%)" }}
      >
        {/* Subtle dot pattern */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(#6366f1 1px, transparent 1px)", backgroundSize: "20px 20px" }} />

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <span className="inline-block h-9 w-9 animate-spin rounded-full border-[3px] border-indigo-100 border-t-indigo-500" />
              <p className="text-xs text-gray-400">Загружаем чат…</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="relative space-y-1">
            {grouped.map(({ day, msgs }) => (
              <div key={day}>
                {/* Day divider */}
                <div className="my-4 flex items-center justify-center">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm backdrop-blur-sm">
                    {day}
                  </span>
                </div>
                {msgs.map((msg, i) => {
                  const prev = i > 0 ? msgs[i - 1] : null;
                  const next = i < msgs.length - 1 ? msgs[i + 1] : null;
                  const isFirst = !prev || prev.fromMaster !== msg.fromMaster;
                  const isLast = !next || next.fromMaster !== msg.fromMaster;
                  return (
                    <MessageBubble key={msg.id} msg={msg} isFirst={isFirst} isLast={isLast} />
                  );
                })}
              </div>
            ))}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </div>

      {/* ── Composer ── */}
      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-3 pb-safe pt-2 sm:px-4"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}>

        {/* Photo preview strip */}
        {pendingPhoto && (
          <div className="mb-2 flex items-end gap-2">
            <div className="relative inline-block">
              <img
                src={pendingPhoto.preview}
                alt="фото"
                className="h-16 w-16 rounded-xl border border-gray-200 object-cover shadow-sm"
              />
              {uploadingPhoto ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                  <Spinner light />
                </div>
              ) : (
                <button type="button" onClick={removePendingPhoto}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-white shadow-md transition hover:bg-red-500">
                  <CloseIcon />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">Нажмите → для отправки</p>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Photo attach */}
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
          <button type="button" onClick={() => photoInputRef.current?.click()} disabled={sending}
            title="Прикрепить фото"
            className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-indigo-50 hover:text-indigo-500 disabled:opacity-40">
            <PhotoIcon />
          </button>

          {/* Text input */}
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Написать диспетчеру…"
              rows={1}
              className="block w-full resize-none rounded-[20px] border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              style={{ lineHeight: "1.4", minHeight: 40, maxHeight: 120 }}
            />
          </div>

          {/* Send */}
          <button type="button" onClick={() => void handleSend()} disabled={!canSend} aria-label="Отправить"
            className="mb-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full shadow-sm transition disabled:opacity-40"
            style={{ background: canSend ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "#e5e7eb" }}>
            {sending ? <Spinner light /> : <SendIcon active={canSend} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-md"
        style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-bold text-gray-800">Напишите диспетчеру</p>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
          Здесь можно задать вопрос по заказу, оплате или<br />любой другой рабочей ситуации. Мы поможем.
        </p>
      </div>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg, isFirst, isLast,
}: {
  msg: ChatMessage;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isMine = msg.fromMaster;
  const hasText = msg.text && msg.text !== "📷 Фото" && msg.text.trim().length > 0;
  const photoOnly = !!msg.photoUrl && !hasText;

  // Border-radius: full corners except the "tail" corner (last bubble in chain)
  const radius = isMine
    ? `18px 18px ${isLast ? "4px" : "18px"} 18px`
    : `18px 18px 18px ${isLast ? "4px" : "18px"}`;

  return (
    <div className={`mb-0.5 flex ${isMine ? "justify-end" : "justify-start"} ${isFirst ? "mt-3" : ""}`}>
      {/* Dispatcher avatar — only on first bubble of their chain */}
      {!isMine && (
        <div className={`mr-1.5 flex-shrink-0 self-end ${isLast ? "opacity-100" : "opacity-0"}`}>
          <div className="flex h-6 w-6 items-center justify-center rounded-full text-white"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        </div>
      )}

      <div
        className={`relative max-w-[72%] shadow-sm ${photoOnly ? "overflow-hidden" : "px-3.5 py-2"}`}
        style={{
          borderRadius: radius,
          background: isMine
            ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
            : "#ffffff",
          border: isMine ? "none" : "1px solid #e5e7eb",
        }}
      >
        {/* Sender name (dispatcher) */}
        {!isMine && msg.senderName && isFirst && (
          <p className="mb-1 text-[11px] font-bold" style={{ color: "#6366f1" }}>
            {msg.senderName}
          </p>
        )}

        {/* Photo */}
        {msg.photoUrl && (
          <a href={resolvePhotoUrl(msg.photoUrl)} target="_blank" rel="noopener noreferrer"
            className={photoOnly ? "block" : "mb-2 block"}>
            <img
              src={resolvePhotoUrl(msg.photoUrl)}
              alt="фото"
              className={`w-full object-cover ${photoOnly ? "max-h-64 rounded-[inherit]" : "max-h-48 rounded-xl"}`}
              loading="lazy"
            />
          </a>
        )}

        {/* Text */}
        {hasText && (
          <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${isMine ? "text-white" : "text-gray-900"}`}>
            {msg.text}
          </p>
        )}

        {/* Timestamp + edited */}
        <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isMine ? "text-white/60" : "text-gray-400"} ${photoOnly ? "absolute bottom-1.5 right-2.5 rounded-full bg-black/30 px-1.5 py-0.5 text-white/80" : ""}`}>
          <span>{formatTime(msg.createdAt)}</span>
          {msg.editedAt && <span className="italic">ред.</span>}
          {isMine && <ChecksIcon />}
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function DispatcherIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function SendIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? "white" : "#9ca3af"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function ChecksIcon() {
  return (
    <svg width="13" height="9" viewBox="0 0 16 10" fill="none" aria-hidden>
      <path d="M1 5l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 5l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner({ light }: { light?: boolean }) {
  return (
    <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${light ? "text-white" : "text-gray-400"}`} aria-hidden />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function formatDay(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return "Сегодня";
    if (d.toDateString() === yesterday.toDateString()) return "Вчера";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  } catch { return iso; }
}
