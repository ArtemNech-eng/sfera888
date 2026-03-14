import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { Send, MessageSquare, RefreshCw, Check, CheckCheck, Paperclip, X, Image, Camera } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface Thread {
  masterId: number;
  alias: string;
  city: string;
  telegramId: string | null;
  avatarUrl: string | null;
  lastMessage: string;
  lastAt: string;
  unread: number;
}

interface Message {
  id: number;
  masterId: number;
  telegramChatId: string;
  text: string;
  photoUrl: string | null;
  fromMaster: boolean;
  senderName: string | null;
  isRead: boolean;
  createdAt: string;
}

interface ConversationData {
  master: { id: number; alias: string; city: string; telegramId: string | null; avatarUrl: string | null };
  messages: Message[];
}

// Inline avatar — falls back to coloured initials
function ChatAvatar({ name, id, avatarUrl, size = 32 }: { name: string; id: number; avatarUrl?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const PALLETE = ["#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316","#eab308","#22c55e","#14b8a6","#0ea5e9","#3b82f6"];
  const bg = PALLETE[id % PALLETE.length];
  const initials = name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
  if (avatarUrl && !failed) {
    return (
      <img src={avatarUrl} alt={name} onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0" />
    );
  }
  return (
    <div style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

function timeAgo(dateStr: string) {
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru }); }
  catch { return ""; }
}

function timeStamp(dateStr: string) {
  try { return format(new Date(dateStr), "HH:mm", { locale: ru }); }
  catch { return ""; }
}

export default function MasterChat() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [conv, setConv] = useState<ConversationData | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const fetchThreads = useCallback(async () => {
    const r = await fetch("/api/master-chat");
    if (r.ok) { setThreads(await r.json()); setLoading(false); }
  }, []);

  const fetchConversation = useCallback(async (masterId: number) => {
    const r = await fetch(`/api/master-chat/${masterId}`);
    if (r.ok) {
      const data = await r.json();
      setConv(data);
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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearPhoto = () => { setPhotoFile(null); setPhotoPreview(null); };

  const sendReply = async () => {
    if ((!reply.trim() && !photoFile) || !selectedId || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      if (reply.trim()) form.append("text", reply.trim());
      form.append("operatorName", user?.name ?? "Оператор");
      if (photoFile) form.append("photo", photoFile);

      const r = await fetch(`/api/master-chat/${selectedId}/reply`, {
        method: "POST",
        body: form,
      });
      if (r.ok) {
        setReply("");
        clearPhoto();
        await fetchConversation(selectedId);
      }
    } finally {
      setSending(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!selectedId) return;
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const r = await fetch(`/api/masters/${selectedId}/avatar`, { method: "POST", body: form });
      if (r.ok) {
        await Promise.all([fetchConversation(selectedId), fetchThreads()]);
      }
    } finally {
      setAvatarUploading(false);
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
                    onClick={() => setSelectedId(t.masterId)}
                    className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      selectedId === t.masterId ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex-shrink-0">
                        <ChatAvatar name={t.alias} id={t.masterId} avatarUrl={t.avatarUrl} size={36} />
                        {t.unread > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                            {t.unread > 9 ? "9+" : t.unread}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`font-semibold text-sm truncate ${t.unread > 0 ? "text-gray-900" : "text-gray-700"}`}>{t.alias}</span>
                          <span className="text-[10px] text-gray-300 flex-shrink-0">{timeAgo(t.lastAt)}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate">{t.city}</p>
                        <p className={`text-xs mt-0.5 truncate ${t.unread > 0 ? "text-gray-700 font-medium" : "text-gray-400"}`}>{t.lastMessage}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation view */}
            <div className="flex-1 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col overflow-hidden min-w-0">
              {!selectedId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <MessageSquare className="w-14 h-14 text-gray-200 mb-4" />
                  <p className="text-gray-400 font-medium">Выберите диалог</p>
                  <p className="text-sm text-gray-300 mt-1">Выберите мастера из списка слева</p>
                </div>
              ) : (
                <>
                  {/* Conv header */}
                  {conv && (
                    <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
                      {/* Clickable avatar — click to upload photo */}
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
                      />
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="relative group flex-shrink-0"
                        title="Загрузить фото мастера"
                        disabled={avatarUploading}
                      >
                        <ChatAvatar name={conv.master.alias} id={conv.master.id} avatarUrl={conv.master.avatarUrl} size={38} />
                        <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {avatarUploading
                            ? <RefreshCw className="w-4 h-4 text-white animate-spin" />
                            : <Camera className="w-4 h-4 text-white" />}
                        </span>
                      </button>
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{conv.master.alias}</p>
                        <p className="text-[11px] text-gray-400">
                          {conv.master.city}
                          {conv.master.telegramId && <span className="ml-1 text-blue-400">· Telegram</span>}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {conv?.messages.map(msg => {
                      const isMaster = msg.fromMaster;
                      const senderLabel = msg.senderName ?? (isMaster ? conv.master.alias : "Оператор");
                      return (
                        <div key={msg.id} className={`flex items-end gap-2 ${isMaster ? "justify-start" : "justify-end"}`}>
                          {/* Master avatar — left */}
                          {isMaster && (
                            <ChatAvatar name={conv.master.alias} id={conv.master.id} avatarUrl={conv.master.avatarUrl} size={28} />
                          )}
                          {/* Bubble */}
                          <div className={`max-w-[70%] rounded-2xl px-3.5 py-2.5 ${
                            isMaster
                              ? "bg-gray-100 text-gray-800 rounded-bl-sm"
                              : "bg-blue-500 text-white rounded-br-sm"
                          }`}>
                            <p className={`text-[10px] font-semibold mb-1 ${isMaster ? "text-gray-500" : "text-blue-100"}`}>
                              {senderLabel}
                            </p>
                            {msg.photoUrl && (
                              <a href={msg.photoUrl} target="_blank" rel="noopener noreferrer" className="block mb-2">
                                <img
                                  src={msg.photoUrl} alt="фото"
                                  className="rounded-xl max-w-full max-h-52 object-cover cursor-zoom-in"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              </a>
                            )}
                            {msg.text && <p className="text-sm leading-relaxed">{msg.text}</p>}
                            <div className={`flex items-center gap-1 mt-1 ${isMaster ? "justify-start" : "justify-end"}`}>
                              <span className={`text-[10px] ${isMaster ? "text-gray-400" : "text-blue-100"}`}>
                                {timeStamp(msg.createdAt)}
                              </span>
                              {!isMaster && (msg.isRead
                                ? <CheckCheck className="w-3 h-3 text-blue-200" />
                                : <Check className="w-3 h-3 text-blue-200" />
                              )}
                            </div>
                          </div>
                          {/* Operator avatar — right */}
                          {!isMaster && (
                            <ChatAvatar name={senderLabel} id={0} size={28} />
                          )}
                        </div>
                      );
                    })}
                    {conv?.messages.length === 0 && (
                      <div className="text-center text-sm text-gray-300 mt-8">Нет сообщений</div>
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Photo preview bar */}
                  {photoPreview && (
                    <div className="px-4 pt-3 flex items-center gap-3 border-t border-gray-50">
                      <div className="relative inline-block">
                        <img src={photoPreview} alt="preview" className="h-16 w-16 rounded-xl object-cover border border-gray-200" />
                        <button
                          onClick={clearPhoto}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-900 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">{photoFile?.name}</p>
                    </div>
                  )}

                  {/* Reply input */}
                  <div className="px-4 py-3.5 border-t border-gray-50 flex items-end gap-2 flex-shrink-0">
                    {/* Photo attach button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Прикрепить фото"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

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
                      disabled={(!reply.trim() && !photoFile) || sending || !conv?.master.telegramId}
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
