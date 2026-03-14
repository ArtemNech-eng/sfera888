import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { Send, MessageSquare, RefreshCw, Check, CheckCheck } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface Thread {
  masterId: number;
  alias: string;
  city: string;
  telegramId: string | null;
  lastMessage: string;
  lastAt: string;
  unread: number;
}

interface Message {
  id: number;
  masterId: number;
  telegramChatId: string;
  text: string;
  fromMaster: boolean;
  senderName: string | null;
  isRead: boolean;
  createdAt: string;
}

interface ConversationData {
  master: { id: number; alias: string; city: string; telegramId: string | null };
  messages: Message[];
}

function timeAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru });
  } catch { return ""; }
}

function timeStamp(dateStr: string) {
  try {
    return format(new Date(dateStr), "HH:mm", { locale: ru });
  } catch { return ""; }
}

export default function MasterChat() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [conv, setConv] = useState<ConversationData | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchThreads = useCallback(async () => {
    const r = await fetch("/api/master-chat");
    if (r.ok) {
      const data = await r.json();
      setThreads(data);
      setLoading(false);
    }
  }, []);

  const fetchConversation = useCallback(async (masterId: number) => {
    const r = await fetch(`/api/master-chat/${masterId}`);
    if (r.ok) {
      const data = await r.json();
      setConv(data);
      // Mark as read
      await fetch(`/api/master-chat/${masterId}/read`, { method: "PATCH" });
      setThreads(p => p.map(t => t.masterId === masterId ? { ...t, unread: 0 } : t));
    }
  }, []);

  useEffect(() => {
    fetchThreads();
    const t = setInterval(fetchThreads, 6000);
    return () => clearInterval(t);
  }, [fetchThreads]);

  useEffect(() => {
    if (selectedId) {
      fetchConversation(selectedId);
      const t = setInterval(() => fetchConversation(selectedId), 5000);
      return () => clearInterval(t);
    }
  }, [selectedId, fetchConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length]);

  const selectThread = async (masterId: number) => {
    setSelectedId(masterId);
  };

  const sendReply = async () => {
    if (!reply.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/master-chat/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: reply.trim(),
          operatorName: user?.name ?? "Оператор",
        }),
      });
      if (r.ok) {
        setReply("");
        await fetchConversation(selectedId);
      }
    } finally {
      setSending(false);
    }
  };

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  return (
    <ProtectedRoute>
      <Layout>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div>
              <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                Чат с мастерами
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 ml-1">
                    {totalUnread}
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">Сообщения от мастеров через Telegram бот</p>
            </div>
            <button onClick={fetchThreads} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Chat layout */}
          <div className="flex-1 flex gap-4 min-h-0">
            {/* Threads list */}
            <div className="w-72 flex-shrink-0 bg-white border border-gray-100 rounded-2xl overflow-hidden flex flex-col shadow-sm">
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {loading ? "Загрузка..." : `${threads.length} диалогов`}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {threads.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <MessageSquare className="w-10 h-10 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Пока нет сообщений</p>
                    <p className="text-xs text-gray-300 mt-1">Мастера пишут через бот</p>
                  </div>
                )}
                {threads.map(t => (
                  <button
                    key={t.masterId}
                    onClick={() => selectThread(t.masterId)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selectedId === t.masterId ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-sm text-gray-800 truncate">{t.alias}</span>
                          {t.unread > 0 && (
                            <span className="flex-shrink-0 bg-blue-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                              {t.unread > 9 ? "9+" : t.unread}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">{t.city}</p>
                        <p className="text-xs text-gray-500 mt-1 truncate">{t.lastMessage}</p>
                      </div>
                      <span className="text-[10px] text-gray-300 flex-shrink-0 mt-0.5">{timeAgo(t.lastAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation view */}
            <div className="flex-1 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col overflow-hidden min-w-0">
              {!selectedId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <MessageSquare className="w-14 h-14 text-gray-150 mb-4" />
                  <p className="text-gray-400 font-medium">Выберите диалог</p>
                  <p className="text-sm text-gray-300 mt-1">Выберите мастера из списка слева</p>
                </div>
              ) : (
                <>
                  {/* Conv header */}
                  {conv && (
                    <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {conv.master.alias.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{conv.master.alias}</p>
                        <p className="text-[11px] text-gray-400">{conv.master.city}
                          {conv.master.telegramId && <span className="ml-1 text-blue-400">· TG: {conv.master.telegramId}</span>}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {conv?.messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.fromMaster ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                          msg.fromMaster
                            ? "bg-gray-100 text-gray-800 rounded-tl-sm"
                            : "bg-blue-500 text-white rounded-tr-sm"
                        }`}>
                          {msg.fromMaster && (
                            <p className="text-[10px] font-semibold text-gray-500 mb-1">{msg.senderName ?? "Мастер"}</p>
                          )}
                          <p className="text-sm leading-relaxed">{msg.text}</p>
                          <div className={`flex items-center gap-1 mt-1 ${msg.fromMaster ? "justify-start" : "justify-end"}`}>
                            <span className={`text-[10px] ${msg.fromMaster ? "text-gray-400" : "text-blue-100"}`}>
                              {timeStamp(msg.createdAt)}
                            </span>
                            {!msg.fromMaster && (
                              msg.isRead
                                ? <CheckCheck className="w-3 h-3 text-blue-200" />
                                : <Check className="w-3 h-3 text-blue-200" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {conv?.messages.length === 0 && (
                      <div className="text-center text-sm text-gray-300 mt-8">Нет сообщений</div>
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Reply input */}
                  <div className="px-4 py-3.5 border-t border-gray-50 flex items-end gap-3 flex-shrink-0">
                    <textarea
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                      placeholder="Напишите ответ мастеру..."
                      rows={1}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-100 resize-none"
                      style={{ minHeight: 42, maxHeight: 120 }}
                    />
                    <button
                      onClick={sendReply}
                      disabled={!reply.trim() || sending || !conv?.master.telegramId}
                      className="flex-shrink-0 w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 disabled:opacity-40 transition-colors"
                      title={!conv?.master.telegramId ? "Мастер не подключён к боту" : "Отправить"}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
