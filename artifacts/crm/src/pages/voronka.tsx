import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, User, Clock, ChevronRight, X, RefreshCw, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale/ru";

const STAGES = [
  { key: "new", label: "Новые диалоги", color: "border-t-blue-500", badge: "bg-blue-100 text-blue-700" },
  { key: "processing", label: "В обработке", color: "border-t-orange-500", badge: "bg-orange-100 text-orange-700" },
  { key: "deciding", label: "Принимает решение", color: "border-t-purple-500", badge: "bg-purple-100 text-purple-700" },
  { key: "on_site", label: "На объекте", color: "border-t-green-500", badge: "bg-green-100 text-green-700" },
  { key: "completed", label: "Успешно завершено", color: "border-t-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
];

interface Chat {
  id: number;
  telegramChatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  stage: string;
  assignedOperatorName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

interface Message {
  id: number;
  chatId: string;
  text: string;
  fromBot: boolean;
  senderName: string | null;
  createdAt: string;
}

function Avatar({ chat, size = "md" }: { chat: Chat; size?: "sm" | "md" }) {
  const initials = [chat.firstName, chat.lastName]
    .filter(Boolean)
    .map(n => n![0])
    .join("")
    .toUpperCase() || chat.username?.[0]?.toUpperCase() || "?";

  const sz = size === "sm" ? "w-9 h-9 text-sm" : "w-11 h-11 text-base";

  if (chat.avatarUrl) {
    return (
      <img
        src={chat.avatarUrl}
        alt={initials}
        className={`${sz} rounded-full object-cover flex-shrink-0`}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  const colors = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];
  const color = colors[chat.id % colors.length];
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function ChatCard({ chat, onClick, selected }: { chat: Chat; onClick: () => void; selected: boolean }) {
  const name = [chat.firstName, chat.lastName].filter(Boolean).join(" ") || chat.username || `ID ${chat.telegramChatId}`;
  const timeAgo = chat.lastMessageAt
    ? formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: false, locale: ru })
    : "";

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-xl cursor-pointer transition-all border ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar chat={chat} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-sm font-semibold text-foreground truncate">{name}</p>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo}</span>
          </div>
          {chat.lastMessage && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{chat.lastMessage}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            {chat.assignedOperatorName && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> {chat.assignedOperatorName}
              </span>
            )}
            {chat.unreadCount > 0 && (
              <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {chat.unreadCount > 9 ? "9+" : chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatDialog({ chat, onClose, onStageChange }: { chat: Chat; onClose: () => void; onStageChange: (stage: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const name = [chat.firstName, chat.lastName].filter(Boolean).join(" ") || chat.username || `ID ${chat.telegramChatId}`;

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/telegram/chats/${chat.telegramChatId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [chat.telegramChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/telegram/chats/${chat.telegramChatId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.trim() }),
      });
      if (res.ok) {
        setInput("");
        await fetchMessages();
      }
    } finally {
      setSending(false);
    }
  };

  const currentStage = STAGES.find(s => s.key === chat.stage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Avatar chat={chat} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">{name}</p>
            {chat.username && <p className="text-xs text-muted-foreground">@{chat.username}</p>}
          </div>

          {/* Stage selector */}
          <select
            value={chat.stage}
            onChange={(e) => onStageChange(e.target.value)}
            className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
          >
            {STAGES.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>

          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Сообщений пока нет</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.fromBot ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.fromBot
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  <p>{msg.text}</p>
                  <p className={`text-xs mt-1 ${msg.fromBot ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(msg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    {msg.fromBot && <Check className="w-3 h-3 inline ml-1" />}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Написать сообщение..."
              className="flex-1 bg-muted rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Voronka() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);

  const fetchChats = async () => {
    try {
      const res = await fetch("/api/telegram/chats");
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChats();
    const interval = setInterval(fetchChats, 5000);
    return () => clearInterval(interval);
  }, []);

  const moveToStage = async (chatId: number, stage: string) => {
    await fetch(`/api/telegram/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, stage } : c));
    if (selectedChat?.id === chatId) {
      setSelectedChat(prev => prev ? { ...prev, stage } : null);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Воронка Telegram</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {chats.length} диалогов · обновляется автоматически
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Telegram подключён
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
              <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-lg font-semibold text-foreground mb-1">Диалогов пока нет</h3>
              <p className="text-sm text-center max-w-sm">
                Напишите вашему боту в Telegram — диалог появится здесь автоматически
              </p>
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
              {STAGES.map(stage => {
                const stageChats = chats.filter(c => c.stage === stage.key);
                return (
                  <div key={stage.key} className="flex-shrink-0 w-72 flex flex-col">
                    <div className={`bg-card rounded-2xl border-t-4 ${stage.color} border border-border shadow-sm flex flex-col h-full`}>
                      <div className="p-4 border-b border-border flex items-center justify-between">
                        <h3 className="font-semibold text-sm text-foreground">{stage.label}</h3>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.badge}`}>
                          {stageChats.length}
                        </span>
                      </div>
                      <div className="p-3 space-y-2 overflow-y-auto flex-1">
                        {stageChats.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-6">Пусто</p>
                        ) : (
                          stageChats.map(chat => (
                            <ChatCard
                              key={chat.id}
                              chat={chat}
                              onClick={() => setSelectedChat(chat)}
                              selected={selectedChat?.id === chat.id}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedChat && (
          <ChatDialog
            chat={selectedChat}
            onClose={() => setSelectedChat(null)}
            onStageChange={(stage) => moveToStage(selectedChat.id, stage)}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
}
