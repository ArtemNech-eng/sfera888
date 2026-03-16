import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Send, Loader2, MessageCircle } from "lucide-react";

interface Message {
  id: number;
  text: string;
  photoUrl: string | null;
  fromMaster: boolean;
  senderName: string | null;
  isRead: boolean;
  editedAt: string | null;
  createdAt: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export default function ChatPage() {
  const { master } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = async (silent = false) => {
    try {
      const data = await api.chat.messages();
      setMessages(data);
      if (!silent) setLoading(false);
    } catch {
      if (!silent) {
        toast.error("Ошибка загрузки чата");
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const msg = await api.chat.send(trimmed);
      setMessages(prev => [...prev, msg]);
      setText("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка отправки");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Group messages by day
  const grouped: { day: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const day = formatDay(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last?.day === day) {
      last.msgs.push(msg);
    } else {
      grouped.push({ day, msgs: [msg] });
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)]">
      <div className="px-4 py-3 border-b border-border bg-card">
        <h1 className="font-bold text-base">Чат с менеджером</h1>
        <p className="text-xs text-muted-foreground">Обычно отвечаем в течение часа</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageCircle size={28} className="text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Нет сообщений</p>
              <p className="text-xs text-muted-foreground mt-1">
                Напишите менеджеру — мы поможем с вопросами
              </p>
            </div>
          </div>
        ) : (
          grouped.map(({ day, msgs }) => (
            <div key={day} className="space-y-2">
              <div className="flex justify-center">
                <span className="text-[11px] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {day}
                </span>
              </div>
              {msgs.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.fromMaster ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                      msg.fromMaster
                        ? "bg-primary text-white rounded-br-sm"
                        : "bg-card border border-border text-foreground rounded-bl-sm"
                    }`}
                  >
                    {!msg.fromMaster && msg.senderName && (
                      <p className="text-[11px] font-semibold text-primary mb-1">
                        {msg.senderName}
                      </p>
                    )}
                    {msg.photoUrl && (
                      <a href={msg.photoUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={msg.photoUrl}
                          alt="фото"
                          className="rounded-xl max-w-full mb-1.5"
                        />
                      </a>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>
                    <div className={`flex items-center gap-1 mt-1 justify-end text-[10px] ${
                      msg.fromMaster ? "text-white/70" : "text-muted-foreground"
                    }`}>
                      <span>{formatTime(msg.createdAt)}</span>
                      {msg.editedAt && <span className="italic">ред.</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-3 border-t border-border bg-card flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Написать менеджеру..."
          rows={1}
          className="flex-1 resize-none px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring max-h-28 overflow-y-auto leading-relaxed"
          style={{ minHeight: 44 }}
        />
        <button
          onClick={sendMessage}
          disabled={!text.trim() || sending}
          className="shrink-0 w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center active:opacity-80 disabled:opacity-50"
        >
          {sending
            ? <Loader2 size={18} className="animate-spin" />
            : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
