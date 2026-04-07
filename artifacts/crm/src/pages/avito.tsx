import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2, RefreshCw, MessageSquare, UserPlus, Send,
  ChevronRight, ExternalLink, Plug, Unplug, AlertCircle,
  LayoutGrid, BarChart3, Eye, Phone, Heart, Wifi, WifiOff,
  TrendingUp, TrendingDown, Minus, Sparkles, Loader2, Star,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as any;
    throw new Error(j.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}

interface AvitoSettings {
  connected: boolean;
  clientId?: string;
  avitoUserId?: string;
  avitoUserName?: string;
  enabled?: boolean;
}

interface AvitoChat {
  id: string;
  created: number;
  updated: number;
  unread_counter: number;
  users: Array<{ id: number; name: string }>;
  context?: { value?: { title?: string } };
  last_message?: { content?: { text?: { text?: string } }; created?: number };
}

interface AvitoMessage {
  id: string;
  author_id: number;
  created: number;
  content?: { text?: { text?: string } };
  type: string;
}

interface AvitoItem {
  id: number;
  title: string;
  price: number;
  status: string;
  url: string;
  category?: { id: number; name: string };
  images?: Array<{ "832x624"?: string; "140x105"?: string }>;
}

interface ItemStats {
  itemId: number;
  fields: { uniqViews?: number; uniqContacts?: number; uniqFavorites?: number };
}

export default function AvitoPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState("chats");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [selectedChat, setSelectedChat] = useState<AvitoChat | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery<AvitoSettings>({
    queryKey: ["/api/avito/settings"],
    queryFn: () => apiFetch("/api/avito/settings"),
    refetchInterval: 30_000,
  });

  const { data: chatsData, isLoading: chatsLoading, refetch: refetchChats } = useQuery<{ chats: AvitoChat[] }>({
    queryKey: ["/api/avito/chats"],
    queryFn: () => apiFetch("/api/avito/chats"),
    enabled: !!settings?.connected,
    refetchInterval: 120_000,
  });

  const { data: messagesData, refetch: refetchMessages } = useQuery<{ messages: AvitoMessage[] }>({
    queryKey: ["/api/avito/chats", selectedChat?.id, "messages"],
    queryFn: () => apiFetch(`/api/avito/chats/${selectedChat!.id}/messages`),
    enabled: !!selectedChat,
    refetchInterval: 30_000,
  });

  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems } = useQuery<{ resources: AvitoItem[]; meta?: { total?: number } }>({
    queryKey: ["/api/avito/items"],
    queryFn: () => apiFetch("/api/avito/items"),
    enabled: !!settings?.connected && tab === "items",
    staleTime: 5 * 60_000,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<{ result: { items: ItemStats[] } }>({
    queryKey: ["/api/avito/stats"],
    queryFn: () => apiFetch("/api/avito/stats"),
    enabled: !!settings?.connected && tab === "analytics",
    staleTime: 5 * 60_000,
  });

  // ── Auto-ping every 2 minutes to stay online ─────────────────────────────
  const doPing = async () => {
    if (!settings?.connected) return;
    try {
      const result = await apiFetch("/api/avito/ping");
      setIsOnline(result.online);
      setLastPing(new Date());
    } catch {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    if (!settings?.connected) return;
    doPing();
    pingInterval.current = setInterval(doPing, 2 * 60_000);
    return () => { if (pingInterval.current) clearInterval(pingInterval.current); };
  }, [settings?.connected]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const connectMutation = useMutation({
    mutationFn: () => apiFetch("/api/avito/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    }),
    onSuccess: (data: any) => {
      toast({ title: "Авито подключён", description: `Аккаунт: ${data.avitoUserName ?? data.avitoUserId}` });
      qc.invalidateQueries({ queryKey: ["/api/avito/settings"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Ошибка подключения", description: e.message }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch("/api/avito/settings", { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Авито отключён" });
      qc.invalidateQueries({ queryKey: ["/api/avito/settings"] });
      setSelectedChat(null);
      setIsOnline(null);
    },
  });

  const replyMutation = useMutation({
    mutationFn: () => apiFetch(`/api/avito/chats/${selectedChat!.id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: replyText }),
    }),
    onSuccess: () => {
      setReplyText("");
      refetchMessages();
      toast({ title: "Сообщение отправлено" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Ошибка отправки", description: e.message }),
  });

  const createLeadMutation = useMutation({
    mutationFn: (chat: AvitoChat) => {
      const user = chat.users.find(u => u.id.toString() !== settings?.avitoUserId);
      return apiFetch("/api/avito/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chat.id, clientName: user?.name, itemTitle: chat.context?.value?.title }),
      });
    },
    onSuccess: (data: any) => toast({ title: "Заявка создана", description: `ID: ${data.leadId}` }),
    onError: (e: any) => toast({ variant: "destructive", title: "Ошибка создания заявки", description: e.message }),
  });

  const handleAiAnalyze = async () => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const data = await apiFetch("/api/avito/ai-analyze", { method: "POST" });
      setAiAnalysis(data.analysis);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Ошибка AI анализа", description: e.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const chats = chatsData?.chats ?? [];
  const messages = messagesData?.messages ?? [];
  const items = itemsData?.resources ?? [];
  const statsItems: ItemStats[] = statsData?.result?.items ?? [];
  const statsMap = Object.fromEntries(statsItems.map(s => [s.itemId, s.fields]));

  const totalViews = statsItems.reduce((sum, s) => sum + (s.fields.uniqViews ?? 0), 0);
  const totalContacts = statsItems.reduce((sum, s) => sum + (s.fields.uniqContacts ?? 0), 0);
  const totalFavorites = statsItems.reduce((sum, s) => sum + (s.fields.uniqFavorites ?? 0), 0);
  const avgConversion = totalViews > 0 ? (totalContacts / totalViews * 100).toFixed(1) : "0";

  function formatTime(ts: number) {
    return new Date(ts * 1000).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }

  function conversionColor(views: number, contacts: number) {
    if (views === 0) return "text-muted-foreground";
    const rate = contacts / views * 100;
    if (rate >= 5) return "text-green-600";
    if (rate >= 2) return "text-amber-600";
    return "text-red-500";
  }

  function conversionIcon(views: number, contacts: number) {
    if (views === 0) return <Minus className="w-3.5 h-3.5" />;
    const rate = contacts / views * 100;
    if (rate >= 5) return <TrendingUp className="w-3.5 h-3.5 text-green-600" />;
    if (rate >= 2) return <Minus className="w-3.5 h-3.5 text-amber-600" />;
    return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  }

  function statusLabel(status: string) {
    const map: Record<string, { label: string; color: string }> = {
      active: { label: "Активно", color: "bg-green-100 text-green-700" },
      old: { label: "Неактивно", color: "bg-gray-100 text-gray-600" },
      blocked: { label: "Заблокировано", color: "bg-red-100 text-red-700" },
      rejected: { label: "Отклонено", color: "bg-red-100 text-red-700" },
    };
    return map[status] ?? { label: status, color: "bg-gray-100 text-gray-600" };
  }

  const unreadTotal = chats.reduce((sum, c) => sum + c.unread_counter, 0);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Авито
              {settings?.connected && (
                <span className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                  isOnline === true ? "bg-green-100 text-green-700" :
                  isOnline === false ? "bg-red-100 text-red-600" :
                  "bg-gray-100 text-gray-500"
                )}>
                  {isOnline === true ? <><Wifi className="w-3 h-3" /> Онлайн</> :
                   isOnline === false ? <><WifiOff className="w-3 h-3" /> Офлайн</> :
                   "..."}
                </span>
              )}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {settings?.connected
                ? `${settings.avitoUserName ?? settings.avitoUserId} · обновление каждые 2 мин${lastPing ? ` · был в сети ${lastPing.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}`
                : "Подключите аккаунт Авито"}
            </p>
          </div>
          {settings?.connected && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => { refetchChats(); refetchItems(); doPing(); }}>
                <RefreshCw className="w-4 h-4 mr-1.5" /> Обновить
              </Button>
              <Button
                variant="outline" size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                <Unplug className="w-4 h-4 mr-1.5" /> Отключить
              </Button>
            </div>
          )}
        </div>

        {/* ── Connection status / form ───────────────────────────────────── */}
        {settingsLoading ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">Загрузка...</CardContent></Card>
        ) : settings?.connected ? (
          <Card className="border-green-200 bg-green-50/40 dark:bg-green-950/20">
            <CardContent className="py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <p className="font-medium text-green-800 dark:text-green-400 text-sm">
                Авито подключён — {settings.avitoUserName ?? settings.avitoUserId}
              </p>
              <span className="text-green-600/50 text-xs ml-auto">Сессия активна · чаты обновляются автоматически</span>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plug className="w-5 h-5 text-primary" /> Подключить Авито
              </CardTitle>
              <CardDescription>
                Введите Client ID и Client Secret из личного кабинета Авито Developers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Client ID</label>
                  <Input placeholder="Введите Client ID" value={clientId} onChange={e => setClientId(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Client Secret</label>
                  <Input type="password" placeholder="Введите Client Secret" value={clientSecret} onChange={e => setClientSecret(e.target.value)} />
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                <div>
                  <p className="font-medium text-foreground">Как получить ключи:</p>
                  <ol className="mt-1 space-y-1 list-decimal list-inside">
                    <li>Перейдите на <a href="https://developers.avito.ru" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">developers.avito.ru <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Создайте приложение → укажите доступ к Messenger + Items</li>
                    <li>Скопируйте Client ID и Client Secret</li>
                  </ol>
                </div>
              </div>
              <Button onClick={() => connectMutation.mutate()} disabled={!clientId || !clientSecret || connectMutation.isPending} className="w-full">
                {connectMutation.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Подключение...</> : <><Plug className="w-4 h-4 mr-2" /> Подключить Авито</>}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Main tabs (only when connected) ───────────────────────────── */}
        {settings?.connected && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="chats" className="flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" />
                Чаты
                {unreadTotal > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {unreadTotal}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="items" className="flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Объявления
                {items.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({items.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                Аналитика
              </TabsTrigger>
            </TabsList>

            {/* ════════════════════ CHATS TAB ════════════════════ */}
            <TabsContent value="chats">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[580px]">
                {/* Chat list */}
                <Card className="lg:col-span-1 flex flex-col overflow-hidden">
                  <CardHeader className="py-3 px-4 border-b shrink-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      Входящие чаты
                      {chats.length > 0 && <Badge variant="secondary" className="ml-auto">{chats.length}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <div className="flex-1 overflow-y-auto">
                    {chatsLoading ? (
                      <div className="p-6 text-center text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Загрузка...</div>
                    ) : chats.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        Нет активных чатов
                      </div>
                    ) : chats.map(chat => {
                      const opponent = chat.users.find(u => u.id.toString() !== settings.avitoUserId);
                      const lastText = chat.last_message?.content?.text?.text;
                      const isSelected = selectedChat?.id === chat.id;
                      return (
                        <button key={chat.id} onClick={() => setSelectedChat(chat)}
                          className={cn("w-full text-left p-3 border-b hover:bg-muted/50 transition-colors", isSelected && "bg-primary/5 border-l-2 border-l-primary")}>
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm truncate">{opponent?.name ?? "Клиент"}</span>
                                {chat.unread_counter > 0 && (
                                  <Badge className="bg-red-500 text-white text-[10px] h-4 px-1.5 shrink-0">{chat.unread_counter}</Badge>
                                )}
                              </div>
                              {chat.context?.value?.title && <p className="text-xs text-muted-foreground truncate">{chat.context.value.title}</p>}
                              {lastText && <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{lastText}</p>}
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          </div>
                          {chat.updated && <p className="text-[10px] text-muted-foreground mt-1">{formatTime(chat.updated)}</p>}
                        </button>
                      );
                    })}
                  </div>
                </Card>

                {/* Messages panel */}
                <Card className="lg:col-span-2 flex flex-col overflow-hidden">
                  {!selectedChat ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">Выберите чат слева</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <CardHeader className="py-3 px-4 border-b shrink-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-base truncate">
                              {selectedChat.users.find(u => u.id.toString() !== settings.avitoUserId)?.name ?? "Клиент"}
                            </CardTitle>
                            {selectedChat.context?.value?.title && (
                              <CardDescription className="text-xs truncate">{selectedChat.context.value.title}</CardDescription>
                            )}
                          </div>
                          <Button size="sm" variant="outline" onClick={() => createLeadMutation.mutate(selectedChat)} disabled={createLeadMutation.isPending} className="shrink-0">
                            <UserPlus className="w-4 h-4 mr-1.5" />
                            {createLeadMutation.isPending ? "Создание..." : "Создать заявку"}
                          </Button>
                        </div>
                      </CardHeader>
                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 ? (
                          <div className="text-center text-muted-foreground text-sm py-8">Нет сообщений</div>
                        ) : [...messages].reverse().map(msg => {
                          const isOurs = msg.author_id.toString() === settings.avitoUserId;
                          const text = msg.content?.text?.text;
                          return (
                            <div key={msg.id} className={cn("flex", isOurs ? "justify-end" : "justify-start")}>
                              <div className={cn("max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                                isOurs ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm")}>
                                {text ? <p className="whitespace-pre-wrap">{text}</p> : <p className="italic opacity-60">[вложение]</p>}
                                <p className={cn("text-[10px] mt-1", isOurs ? "text-primary-foreground/60 text-right" : "text-muted-foreground")}>
                                  {msg.created ? formatTime(msg.created) : ""}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="p-3 border-t shrink-0">
                        <div className="flex gap-2">
                          <Textarea
                            placeholder="Написать сообщение..."
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            rows={2}
                            className="resize-none text-sm"
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (replyText.trim()) replyMutation.mutate(); } }}
                          />
                          <Button onClick={() => replyMutation.mutate()} disabled={!replyText.trim() || replyMutation.isPending} size="icon" className="h-full aspect-square">
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">Enter — отправить · Shift+Enter — новая строка</p>
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* ════════════════════ ITEMS TAB ════════════════════ */}
            <TabsContent value="items">
              <Card>
                <CardHeader className="py-4 px-5 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-primary" />
                      Мои объявления
                      {itemsData?.meta?.total != null && (
                        <Badge variant="secondary">{itemsData.meta.total}</Badge>
                      )}
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={() => refetchItems()} disabled={itemsLoading}>
                      <RefreshCw className={cn("w-4 h-4 mr-1.5", itemsLoading && "animate-spin")} /> Обновить
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {itemsLoading ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Загрузка объявлений...
                    </div>
                  ) : items.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">Объявлений не найдено</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {items.map(item => {
                        const st = statusLabel(item.status);
                        const stats = statsMap[item.id] ?? {};
                        const views = stats.uniqViews ?? 0;
                        const contacts = stats.uniqContacts ?? 0;
                        const favs = stats.uniqFavorites ?? 0;
                        const img = item.images?.[0]?.["140x105"];
                        return (
                          <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                            {/* Thumbnail */}
                            <div className="w-16 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                              {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Package className="w-6 h-6 m-auto mt-3 text-muted-foreground/40" />}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <p className="font-medium text-sm truncate flex-1">{item.title}</p>
                                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", st.color)}>{st.label}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                {item.price > 0 && <span className="text-sm font-semibold">{item.price.toLocaleString("ru-RU")} ₽</span>}
                                {item.category?.name && <span className="text-xs text-muted-foreground">{item.category.name}</span>}
                              </div>
                            </div>
                            {/* Mini stats */}
                            <div className="hidden md:flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{views}</span>
                              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{contacts}</span>
                              <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{favs}</span>
                            </div>
                            <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0 text-primary hover:text-primary/80">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ════════════════════ ANALYTICS TAB ════════════════════ */}
            <TabsContent value="analytics" className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Просмотры (30д)", value: totalViews.toLocaleString("ru-RU"), icon: Eye, color: "text-blue-600" },
                  { label: "Контакты (30д)", value: totalContacts.toLocaleString("ru-RU"), icon: Phone, color: "text-green-600" },
                  { label: "В избранном (30д)", value: totalFavorites.toLocaleString("ru-RU"), icon: Star, color: "text-amber-500" },
                  { label: "Конверсия", value: `${avgConversion}%`, icon: TrendingUp, color: "text-purple-600" },
                ].map(card => (
                  <Card key={card.label}>
                    <CardContent className="py-4 px-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-muted-foreground">{card.label}</p>
                        <card.icon className={cn("w-4 h-4", card.color)} />
                      </div>
                      <p className="text-2xl font-bold">{statsLoading ? "—" : card.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* AI analysis */}
              <Card>
                <CardHeader className="py-4 px-5 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      AI-анализ объявлений
                    </CardTitle>
                    <Button onClick={handleAiAnalyze} disabled={isAnalyzing} size="sm">
                      {isAnalyzing ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Анализирую...</> : <><Sparkles className="w-4 h-4 mr-1.5" /> Проанализировать</>}
                    </Button>
                  </div>
                  <CardDescription>ИИ изучит ваши объявления и даст конкретные советы по улучшению конверсии</CardDescription>
                </CardHeader>
                <CardContent className="py-4">
                  {!aiAnalysis && !isAnalyzing && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Нажмите «Проанализировать» — ИИ изучит ваши объявления<br />и даст рекомендации по заголовкам, ценам и описаниям</p>
                    </div>
                  )}
                  {isAnalyzing && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm">ИИ анализирует объявления и статистику...</p>
                    </div>
                  )}
                  {aiAnalysis && (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-muted/40 rounded-xl p-4">{aiAnalysis}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Per-item conversion table */}
              <Card>
                <CardHeader className="py-4 px-5 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Конверсии по объявлениям
                    <span className="text-xs text-muted-foreground font-normal">за 30 дней</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {statsLoading ? (
                    <div className="py-8 text-center text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Загрузка...</div>
                  ) : statsItems.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">Нет данных за последние 30 дней</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Объявление</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs"><Eye className="w-3.5 h-3.5 inline mr-1" />Просмотры</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs"><Phone className="w-3.5 h-3.5 inline mr-1" />Контакты</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs"><Heart className="w-3.5 h-3.5 inline mr-1" />Избранное</th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Конверсия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statsItems
                            .sort((a, b) => (b.fields.uniqViews ?? 0) - (a.fields.uniqViews ?? 0))
                            .map(stat => {
                              const item = items.find(i => i.id === stat.itemId);
                              const views = stat.fields.uniqViews ?? 0;
                              const contacts = stat.fields.uniqContacts ?? 0;
                              const favs = stat.fields.uniqFavorites ?? 0;
                              const rate = views > 0 ? (contacts / views * 100).toFixed(1) : "0";
                              return (
                                <tr key={stat.itemId} className="border-b hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-3">
                                    <p className="font-medium truncate max-w-[280px]">{item?.title ?? `#${stat.itemId}`}</p>
                                    {item?.category?.name && <p className="text-xs text-muted-foreground">{item.category.name}</p>}
                                  </td>
                                  <td className="text-right px-3 py-3 tabular-nums">{views.toLocaleString("ru-RU")}</td>
                                  <td className="text-right px-3 py-3 tabular-nums">{contacts.toLocaleString("ru-RU")}</td>
                                  <td className="text-right px-3 py-3 tabular-nums">{favs.toLocaleString("ru-RU")}</td>
                                  <td className="text-right px-4 py-3">
                                    <span className={cn("flex items-center justify-end gap-1 font-semibold tabular-nums", conversionColor(views, contacts))}>
                                      {conversionIcon(views, contacts)}
                                      {rate}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
}
