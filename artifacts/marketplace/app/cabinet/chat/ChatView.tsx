"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import {
  cabinetChat,
  uploadPhoto,
  type ChatMessage,
} from "../_lib/cabinetClient";
import { resolvePhotoUrl } from "../_lib/photo";

const POLL_INTERVAL_MS = 5_000;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10 MB — same limit as master-pwa.

/**
 * `/cabinet/chat` view (plan §18.3 W2).
 *
 * Polls `/chat` every 5 seconds (matching master-pwa) — silent reload that
 * doesn't flicker the spinner. Grouping by day uses the local timezone of
 * the client. Sending appends the response message optimistically; the next
 * poll reconciles any messages added by the dispatcher meanwhile.
 *
 * Why polling and not WebSocket: master-pwa already runs on polling with no
 * UX issues, and adding a socket layer to marketplace just for chat doubles
 * the attack surface (auth, CSP, edge-proxy headers) for no real win.
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

  // Initial load + polling. We don't surface errors on silent polls so a
  // transient network hiccup doesn't spam toasts.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load(silent = false) {
      try {
        const data = await cabinetChat.fetch();
        if (cancelled) return;
        setMessages(data);
        if (!silent) setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (!silent) {
          const msg = err instanceof Error ? err.message : "Ошибка загрузки чата";
          toast.error(msg);
          setLoading(false);
        }
      }
    }

    void load();
    timer = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  // Auto-scroll on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Cleanup pending object URL on unmount.
  useEffect(() => {
    return () => {
      if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Выберите изображение");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      toast.error("Файл слишком большой (макс. 10 МБ)");
      e.target.value = "";
      return;
    }
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview);
    const preview = URL.createObjectURL(file);
    setPendingPhoto({ file, preview });
    e.target.value = "";
  };

  const removePendingPhoto = () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview);
    setPendingPhoto(null);
  };

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
      // Force scroll on next paint — `useEffect` watcher handles this too,
      // but `setTimeout` is a defensive fallback for fast mobile transitions.
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка отправки";
      toast.error(msg);
    } finally {
      setSending(false);
      setUploadingPhoto(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter inserts newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Group messages by day for the date dividers.
  const grouped: { day: string; msgs: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const day = formatDay(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last?.day === day) last.msgs.push(msg);
    else grouped.push({ day, msgs: [msg] });
  }

  const canSend = (text.trim().length > 0 || pendingPhoto !== null) && !sending && !uploadingPhoto;

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm sm:h-[calc(100dvh-6rem)]">
      {/* Header */}
      <header className="flex-shrink-0 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-600 px-5 py-4">
        <h1 className="text-base font-bold text-white sm:text-lg">Чат с диспетчером</h1>
        <p className="text-xs text-white/80">Обычно отвечаем в течение часа</p>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-[var(--color-background)] px-3 py-4 sm:px-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-soft)]">
              <MessageIcon className="text-[var(--color-primary)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">Нет сообщений</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Напишите диспетчеру — мы поможем с вопросами по заказам и оплатам.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ day, msgs }) => (
              <div key={day} className="space-y-2">
                <div className="flex justify-center">
                  <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[var(--color-muted)] shadow-sm">
                    {day}
                  </span>
                </div>
                {msgs.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-[var(--color-border)] bg-white px-3 py-3 sm:px-4">
        {pendingPhoto ? (
          <div className="mb-2 inline-flex">
            <div className="relative">
              <img
                src={pendingPhoto.preview}
                alt="предпросмотр"
                className="h-20 w-20 rounded-xl border border-[var(--color-border)] object-cover"
              />
              <button
                type="button"
                onClick={removePendingPhoto}
                aria-label="Убрать фото"
                className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
              >
                <CloseIcon />
              </button>
              {uploadingPhoto ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                  <Spinner light />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={sending}
            title="Прикрепить фото"
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-muted)] shadow-sm transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
          >
            <PhotoIcon />
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написать диспетчеру…"
            rows={1}
            style={{ minHeight: 40 }}
            className="max-h-28 flex-1 resize-none rounded-2xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm text-[var(--color-text)] shadow-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            aria-label="Отправить"
            className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-cta)] text-[var(--color-on-cta)] shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:opacity-50"
          >
            {sending ? <Spinner /> : <SendIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isMine = msg.fromMaster;
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
          isMine
            ? "rounded-br-sm bg-[var(--color-cta)] text-[var(--color-on-cta)]"
            : "rounded-bl-sm bg-white text-[var(--color-text)] border border-[var(--color-border)]"
        }`}
      >
        {!isMine && msg.senderName ? (
          <p className="mb-1 text-[11px] font-semibold text-[var(--color-primary)]">
            {msg.senderName}
          </p>
        ) : null}
        {msg.photoUrl ? (
          <a href={resolvePhotoUrl(msg.photoUrl)} target="_blank" rel="noopener noreferrer">
            <img
              src={resolvePhotoUrl(msg.photoUrl)}
              alt="фото"
              className="mb-1.5 max-w-full rounded-xl"
              loading="lazy"
            />
          </a>
        ) : null}
        {msg.text && msg.text !== "📷 Фото" ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {msg.text}
          </p>
        ) : null}
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            isMine ? "text-white/70" : "text-[var(--color-muted)]"
          }`}
        >
          <span>{formatTime(msg.createdAt)}</span>
          {msg.editedAt ? <span className="italic">ред.</span> : null}
        </div>
      </div>
    </div>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 5h6" />
      <path d="M19 2v6" />
      <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function Spinner({ light }: { light?: boolean }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${
        light ? "text-white" : ""
      }`}
      aria-hidden
    />
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDay(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Сегодня";
    if (d.toDateString() === yesterday.toDateString()) return "Вчера";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  } catch {
    return iso;
  }
}
