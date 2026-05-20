import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Send, Plus, Phone, Loader2, MessageSquare, RefreshCw,
  Search, X, ChevronRight, AlertCircle, User2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery as useQ2 } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvitoUser {
  id: number;
  name: string;
  url?: string;
}

interface AvitoChat {
  id: string;
  context?: { type: string; value?: { id?: number; title?: string; url?: string; price_string?: string } };
  created: number;
  updated: number;
  last_message?: {
    id: string;
    author_id: number;
    content?: { text?: string };
    created: number;
    type: string;
  };
  users: AvitoUser[];
  unread_counter: number;
  /** virtual — set by us */
  hasLead?: boolean;
}

interface AvitoMessage {
  id: string;
  author_id: number;
  content?: { text?: string; image?: { sizes?: Record<string, string> } };
  created: number;
  type: string;
  read: boolean;
}

interface QuickReply {
  id: string;
  label: string;
  text: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays < 7) {
    return d.toLocaleDateString("ru-RU", { weekday: "short" });
  }
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getChatClientName(chat: AvitoChat, myId?: number): string {
  const others = chat.users.filter(u => u.id !== myId);
  return others.length > 0 ? others[0].name : chat.users[0]?.name ?? "Клиент";
}

function getChatStatus(chat: AvitoChat, myId?: number, leadsSet?: Set<string>): "unread" | "replied" | "lead" | "default" {
  if (leadsSet?.has(chat.id)) return "lead";
  if (chat.unread_counter > 0) return "unread";
  const lastMsg = chat.last_message;
  if (lastMsg && lastMsg.author_id === myId) return "replied";
  return "default";
}

// ─── Lead Modal ───────────────────────────────────────────────────────────────

function LeadModal({
  open,
  onClose,
  chat,
  myId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  chat: AvitoChat | null;
  myId?: number;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const clientName = chat ? getChatClientName(chat, myId) : "";
  const [city, setCity] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [district, setDistrict] = useState("");
  const [area, setArea] = useState("");
  const [comment, setComment] = useState(chat?.context?.value?.title ?? "");
  const [when, setWhen] = useState("");

  const { data: citiesData } = useQ2<{ cities: string[] }>({
    queryKey: ["/api/cities"],
    queryFn: () => fetch("/api/cities", { credentials: "include" }).then(r => r.json()),
  });
  const { data: servicesData } = useQ2<{ serviceTypes: string[] }>({
    queryKey: ["/api/service-types"],
    queryFn: () => fetch("/api/service-types", { credentials: "include" }).then(r => r.json()),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/avito/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chatId: chat?.id,
          clientName,
          itemTitle: chat?.context?.value?.title,
          city,
          serviceType,
          district,
          area,
          comment: [comment, when ? `Когда: ${when}` : ""].filter(Boolean).join("\n"),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Заявка создана", description: `Заявка от ${clientName} добавлена` });
      onCreated();
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  if (!open || !chat) return null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>📋 Создать заявку из чата Авито</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Источник</label>
            <Input value="Авито" disabled className="mt-1 bg-muted text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Имя клиента</label>
            <Input value={clientName} disabled className="mt-1 bg-muted text-sm" />
          </div>
          {chat.context?.value?.title && (
            <div>
              <label className="text-xs text-muted-foreground font-medium">Объявление</label>
              <Input value={chat.context.value.title} disabled className="mt-1 bg-muted text-xs" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Город *</label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger className="mt-1 text-sm"><SelectValue placeholder="Выбрать" /></SelectTrigger>
                <SelectContent>
                  {(citiesData?.cities ?? []).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Вид работ *</label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger className="mt-1 text-sm"><SelectValue placeholder="Выбрать" /></SelectTrigger>
                <SelectContent>
                  {(servicesData?.serviceTypes ?? []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium">Адрес</label>
              <Input placeholder="Центральный" value={district} onChange={e => setDistrict(e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Площадь (м²)</label>
              <Input placeholder="50" value={area} onChange={e => setArea(e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Когда нужно</label>
            <Select value={when} onValueChange={setWhen}>
              <SelectTrigger className="mt-1 text-sm"><SelectValue placeholder="Выбрать" /></SelectTrigger>
              <SelectContent>
                {["Срочно (сегодня-завтра)", "На этой неделе", "В этом месяце", "Обсудить"].map(w =>
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Комментарий</label>
            <Textarea placeholder="Доп. информация..." value={comment} onChange={e => setComment(e.target.value)} className="mt-1 text-sm resize-none" rows={3} />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Отмена</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !city || !serviceType}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Создать заявку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function AvitoMessagesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [search, setSearch] = useState("");
  const [leadModal, setLeadModal] = useState(false);
  const [leadsSet, setLeadsSet] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("avito_lead_chats") ?? "[]")); }
    catch { return new Set(); }
  });
  const [isMobileChat, setIsMobileChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const prevUnreadCount = useRef<number>(0);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: settingsData } = useQuery<any>({
    queryKey: ["/api/avito/settings"],
    queryFn: () => fetch("/api/avito/settings", { credentials: "include" }).then(r => r.json()),
  });
  const myId: number | undefined = settingsData?.avitoUserId ? Number(settingsData.avitoUserId) : undefined;
  const connected = !!settingsData?.enabled;

  const { data: chatsData, isLoading: chatsLoading, refetch: refetchChats } = useQuery<{ chats: AvitoChat[] }>({
    queryKey: ["/api/avito/chats"],
    queryFn: () => fetch("/api/avito/chats?limit=100", { credentials: "include" }).then(r => r.json()),
    enabled: connected,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  const chats: AvitoChat[] = chatsData?.chats ?? [];

  const selectedChat = chats.find(c => c.id === selectedChatId) ?? null;

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ messages: AvitoMessage[] }>({
    queryKey: ["/api/avito/chats", selectedChatId, "messages"],
    queryFn: () =>
      fetch(`/api/avito/chats/${selectedChatId}/messages?limit=100`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedChatId,
    refetchInterval: 15_000,
  });

  const messages = (messagesData?.messages ?? []).slice().sort((a, b) => a.created - b.created);

  const { data: quickRepliesData } = useQuery<{ replies: QuickReply[] }>({
    queryKey: ["/api/avito/quick-replies"],
    queryFn: () => fetch("/api/avito/quick-replies", { credentials: "include" }).then(r => r.json()),
  });
  const quickReplies = quickRepliesData?.replies ?? [];

  // ── Notification sound on new unread ──────────────────────────────────────

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/avito/unread-count"],
    queryFn: () => fetch("/api/avito/unread-count", { credentials: "include" }).then(r => r.json()),
    enabled: connected,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const count = unreadData?.count ?? 0;
    if (count > prevUnreadCount.current && prevUnreadCount.current !== -1) {
      try { audioRef.current?.play(); } catch {}
    }
    prevUnreadCount.current = count;
  }, [unreadData?.count]);

  // ── Scroll to bottom when messages load ───────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedChatId]);

  // ── Mark as read when opening chat ────────────────────────────────────────

  useEffect(() => {
    if (!selectedChatId) return;
    const chat = chats.find(c => c.id === selectedChatId);
    if (chat && chat.unread_counter > 0) {
      fetch(`/api/avito/chats/${selectedChatId}/read`, {
        method: "POST",
        credentials: "include",
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/avito/chats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/avito/unread-count"] });
      }).catch(() => {});
    }
  }, [selectedChatId]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await fetch(`/api/avito/chats/${selectedChatId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(err.error ?? r.statusText);
      }
      return r.json();
    },
    onSuccess: () => {
      setInputText("");
      queryClient.invalidateQueries({ queryKey: ["/api/avito/chats", selectedChatId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/avito/chats"] });
    },
    onError: (e: any) => {
      toast({ title: "Ошибка отправки", description: e.message, variant: "destructive" });
    },
  });

  const handleSend = useCallback(() => {
    const t = inputText.trim();
    if (!t || !selectedChatId || sendMutation.isPending) return;
    sendMutation.mutate(t);
  }, [inputText, selectedChatId, sendMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Filtered chats ────────────────────────────────────────────────────────

  const filteredChats = chats.filter(c => {
    if (!search) return true;
    const name = getChatClientName(c, myId).toLowerCase();
    const lastMsg = c.last_message?.content?.text?.toLowerCase() ?? "";
    const title = c.context?.value?.title?.toLowerCase() ?? "";
    const q = search.toLowerCase();
    return name.includes(q) || lastMsg.includes(q) || title.includes(q);
  });

  const markLead = (chatId: string) => {
    const next = new Set(leadsSet);
    next.add(chatId);
    setLeadsSet(next);
    localStorage.setItem("avito_lead_chats", JSON.stringify([...next]));
  };

  const selectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setIsMobileChat(true);
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <AlertCircle className="w-12 h-12 text-orange-500" />
        <h2 className="text-xl font-bold">Авито не подключён</h2>
        <p className="text-muted-foreground max-w-sm">
          Перейдите в раздел Авито и подключите аккаунт через OAuth.
        </p>
        <Button asChild variant="outline">
          <a href="/avito">Перейти в настройки Авито</a>
        </Button>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-white overflow-hidden">
      {/* Hidden audio for notification */}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAA..." preload="auto" />

      {/* ── LEFT PANEL: Chat List ── */}
      <div className={cn(
        "w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white",
        isMobileChat ? "hidden md:flex" : "flex"
      )}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-base">💬 Авито Сообщения</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetchChats()}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Обновить"
            >
              <RefreshCw className={cn("w-4 h-4", chatsLoading && "animate-spin")} />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск чата..."
              className="pl-9 h-9 text-sm bg-gray-50 border-gray-200"
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {chatsLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!chatsLoading && filteredChats.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <MessageSquare className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? "Чатов не найдено" : "Нет активных чатов"}
              </p>
            </div>
          )}
          {filteredChats.map(chat => {
            const clientName = getChatClientName(chat, myId);
            const status = getChatStatus(chat, myId, leadsSet);
            const isSelected = chat.id === selectedChatId;
            const lastText = chat.last_message?.content?.text ?? "";
            const itemTitle = chat.context?.value?.title ?? "";

            return (
              <button
                key={chat.id}
                onClick={() => selectChat(chat.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50 flex gap-3",
                  isSelected && "bg-emerald-50 border-l-[3px] border-l-[#34C759]"
                )}
              >
                {/* Avatar */}
                <div className="flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold text-base">
                    {clientName[0]?.toUpperCase() ?? "?"}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-sm text-gray-900 truncate">{clientName}</span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                      {chat.last_message ? formatTime(chat.last_message.created) : formatTime(chat.updated)}
                    </span>
                  </div>
                  {itemTitle && (
                    <p className="text-[11px] text-orange-600 truncate font-medium">{itemTitle}</p>
                  )}
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-gray-500 truncate">
                      {lastText ? lastText.slice(0, 50) + (lastText.length > 50 ? "…" : "") : ""}
                    </p>
                    <div className="flex-shrink-0">
                      {status === "unread" && (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                          {chat.unread_counter > 9 ? "9+" : chat.unread_counter}
                        </span>
                      )}
                      {status === "lead" && <span className="text-sm">🔵</span>}
                      {status === "replied" && <span className="text-sm">🟢</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT PANEL: Chat Window ── */}
      <div className={cn(
        "flex-1 flex flex-col bg-gray-50",
        !isMobileChat && !selectedChatId ? "hidden md:flex" : "flex"
      )}>
        {!selectedChatId ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
              <MessageSquare className="w-10 h-10 text-[#34C759]" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700">Выберите чат</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Выберите чат слева, чтобы просмотреть переписку и ответить клиенту
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
              <button
                className="md:hidden p-1 hover:bg-gray-100 rounded"
                onClick={() => { setIsMobileChat(false); setSelectedChatId(null); }}
              >
                <ChevronRight className="w-5 h-5 rotate-180 text-gray-500" />
              </button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                {selectedChat ? getChatClientName(selectedChat, myId)[0]?.toUpperCase() : "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-900">
                  {selectedChat ? getChatClientName(selectedChat, myId) : ""}
                </p>
                {selectedChat?.context?.value?.title && (
                  <p className="text-xs text-orange-600 truncate">{selectedChat.context.value.title}</p>
                )}
              </div>
              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => setLeadModal(true)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Создать заявку</span>
                </Button>
                {selectedChat?.context?.value?.url && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    asChild
                  >
                    <a href={selectedChat.context.value.url} target="_blank" rel="noreferrer">
                      <Phone className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Объявление</span>
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {messagesLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!messagesLoading && messages.length === 0 && (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  Нет сообщений в этом чате
                </div>
              )}
              {messages.map((msg, idx) => {
                const isOwn = msg.author_id === myId;
                const text = msg.content?.text ?? "";
                const imageUrl = msg.content?.image?.sizes?.["1280x960"] ??
                  msg.content?.image?.sizes?.["640x480"] ??
                  Object.values(msg.content?.image?.sizes ?? {})[0];
                const showTime =
                  idx === 0 ||
                  Math.abs(messages[idx - 1].created - msg.created) > 300;

                return (
                  <div key={msg.id}>
                    {showTime && (
                      <div className="flex justify-center my-2">
                        <span className="text-[11px] text-gray-400 bg-white rounded-full px-3 py-0.5 shadow-sm">
                          {formatDateTime(msg.created)}
                        </span>
                      </div>
                    )}
                    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                        isOwn
                          ? "bg-[#dcf8c6] text-gray-900 rounded-br-sm"
                          : "bg-white text-gray-900 rounded-bl-sm border border-gray-100"
                      )}>
                        {imageUrl && (
                          <img
                            src={imageUrl}
                            alt="Изображение"
                            className="rounded-lg max-w-full mb-1"
                            style={{ maxHeight: 200 }}
                          />
                        )}
                        {text && (
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
                        )}
                        <div className={cn(
                          "flex items-center justify-end gap-1 mt-1",
                          isOwn ? "text-[#4fc464]" : "text-gray-400"
                        )}>
                          <span className="text-[10px]">
                            {new Date(msg.created * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isOwn && <span className="text-[11px]">{msg.read ? "✓✓" : "✓"}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick replies */}
            {quickReplies.length > 0 && (
              <div className="bg-white border-t border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto scrollbar-none">
                {quickReplies.map(qr => (
                  <button
                    key={qr.id}
                    onClick={() => setInputText(qr.text)}
                    className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors font-medium whitespace-nowrap"
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input area */}
            <div className="bg-white border-t border-gray-200 px-4 py-3">
              <div className="flex gap-2 items-end">
                <Textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Введите сообщение..."
                  className="flex-1 resize-none min-h-[44px] max-h-32 text-sm border-gray-200 rounded-xl focus-visible:ring-emerald-500"
                  rows={1}
                />
                <Button
                  onClick={handleSend}
                  disabled={!inputText.trim() || sendMutation.isPending}
                  className="h-11 w-11 p-0 rounded-full bg-[#34C759] hover:bg-[#2db84d] flex-shrink-0"
                >
                  {sendMutation.isPending
                    ? <Loader2 className="w-5 h-5 animate-spin text-white" />
                    : <Send className="w-5 h-5 text-white" />
                  }
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lead modal */}
      <LeadModal
        open={leadModal}
        onClose={() => setLeadModal(false)}
        chat={selectedChat}
        myId={myId}
        onCreated={() => {
          if (selectedChatId) markLead(selectedChatId);
        }}
      />
    </div>
  );
}

export default function AvitoMessagesRoute() {
  return (
    <ProtectedRoute allowedRoles={["admin", "lead_operator"]}>
      <Layout>
        <AvitoMessagesPage />
      </Layout>
    </ProtectedRoute>
  );
}
