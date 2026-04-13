import { useState, useEffect, useRef, useMemo } from "react";
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
  Package, Search, Filter, X, FileText, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as any;
    throw new ApiError(j.error ?? `HTTP ${r.status}`, j.code);
  }
  return r.json();
}

// ── Types ──────────────────────────────────────────────────────────────────

interface AvitoSettings {
  connected: boolean;
  clientId?: string;
  avitoUserId?: string;
  avitoUserName?: string;
  enabled?: boolean;
  tokenExpiresAt?: string;
}

interface AvitoChat {
  id: string;
  created: number;
  updated: number;
  unread_counter: number;
  users: Array<{ id: number; name: string }>;
  context?: { value?: { title?: string; id?: number } };
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
  stats?: { uniqViews?: number; uniqContacts?: number; uniqFavorites?: number };
}

interface ItemStats {
  itemId: number;
  fields: { uniqViews?: number; uniqContacts?: number; uniqFavorites?: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(ts: number) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "вчера";
  if (diffDays < 7) return d.toLocaleDateString("ru-RU", { weekday: "short" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function statusLabel(s: string) {
  const map: Record<string, { label: string; color: string }> = {
    active: { label: "Активно", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    old: { label: "Старое", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    blocked: { label: "Заблокировано", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    rejected: { label: "Отклонено", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
    removed: { label: "Удалено", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    archived: { label: "В архиве", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  };
  return map[s] ?? { label: s, color: "bg-gray-100 text-gray-600" };
}

function conversionColor(views: number, contacts: number) {
  if (views === 0) return "text-muted-foreground";
  const rate = contacts / views;
  if (rate >= 0.05) return "text-green-600 dark:text-green-400";
  if (rate >= 0.02) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function conversionIcon(views: number, contacts: number) {
  if (views === 0) return <Minus className="w-3 h-3" />;
  const rate = contacts / views;
  if (rate >= 0.05) return <TrendingUp className="w-3 h-3" />;
  if (rate >= 0.02) return <Minus className="w-3 h-3" />;
  return <TrendingDown className="w-3 h-3" />;
}

// ── Reply templates ────────────────────────────────────────────────────────

const REPLY_TEMPLATES = [
  { label: "Приветствие", text: "Здравствуйте! Спасибо за обращение. Чем могу помочь?" },
  { label: "Стоимость", text: "Стоимость зависит от объёма работ. Уточните, пожалуйста, что именно нужно сделать, и я назову точную цену." },
  { label: "Выезд мастера", text: "Мастер может выехать на замер и оценку бесплатно. Удобно завтра с 10 до 18?" },
  { label: "Сроки", text: "Сроки выполнения работ зависят от их объёма. Обычно от 1 до 5 рабочих дней. Можем обсудить подробнее." },
  { label: "Контакт", text: "Оставьте, пожалуйста, номер телефона — наш менеджер свяжется с вами в течение часа." },
  { label: "Спасибо", text: "Спасибо за обращение! Будем рады помочь. Если появятся вопросы — пишите." },
];

// ── Component ──────────────────────────────────────────────────────────────

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
  const [chatSearch, setChatSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemStatusFilter, setItemStatusFilter] = useState<string>("all");
  const [showTemplates, setShowTemplates] = useState(false);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────

  const { data: settings, isLoading: settingsLoading } = useQuery<AvitoSettings>({
    queryKey: ["/api/avito/settings"],
    queryFn: () => apiFetch("/api/avito/settings"),
    refetchInterval: 30_000,
  });

  const { data: chatsData, isLoading: chatsLoading, error: chatsError, refetch: refetchChats } = useQuery<{ chats: AvitoChat[] }>({
    queryKey: ["/api/avito/chats"],
    queryFn: () => apiFetch("/api/avito/chats"),
    enabled: !!settings?.connected,
    refetchInterval: 60_000,
  });

  const { data: messagesData, refetch: refetchMessages } = useQuery<{ messages: AvitoMessage[] }>({
    queryKey: ["/api/avito/chats", selectedChat?.id, "messages"],
    queryFn: () => apiFetch(`/api/avito/chats/${selectedChat!.id}/messages`),
    enabled: !!selectedChat,
    refetchInterval: 20_000,
  });

  // Items + stats combined in one request (fixes stats = 0 bug)
  const { data: itemsData, isLoading: itemsLoading, error: itemsError, refetch: refetchItems } = useQuery<{ resources: AvitoItem[]; meta?: { total?: number } }>({
    queryKey: ["/api/avito/items-with-stats"],
    queryFn: () => apiFetch("/api/avito/items-with-stats"),
    enabled: !!settings?.connected && (tab === "items" || tab === "analytics"),
    staleTime: 3 * 60_000,
  });

  // ── Derived ────────────────────────────────────────────────────────────

  const chats = useMemo(() => chatsData?.chats ?? [], [chatsData]);
  const unreadTotal = useMemo(() => chats.reduce((s, c) => s + (c.unread_counter ?? 0), 0), [chats]);
  const messages = useMemo(() => messagesData?.messages ?? [], [messagesData]);
  const allItems = useMemo(() => itemsData?.resources ?? [], [itemsData]);

  const filteredChats = useMemo(() => {
    if (!chatSearch.trim()) return chats;
    const q = chatSearch.toLowerCase();
    return chats.filter(c => {
      const name = c.users.find(u => u.id.toString() !== settings?.avitoUserId)?.name ?? "";
      const title = c.context?.value?.title ?? "";
      return name.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    });
  }, [chats, chatSearch, settings?.avitoUserId]);

  const filteredItems = useMemo(() => {
    let list = allItems;
    if (itemStatusFilter !== "all") list = list.filter(i => i.status === itemStatusFilter);
    if (itemSearch.trim()) {
      const q = itemSearch.toLowerCase();
      list = list.filter(i => i.title.toLowerCase().includes(q) || i.category?.name?.toLowerCase().includes(q));
    }
    return list;
  }, [allItems, itemStatusFilter, itemSearch]);

  // Analytics totals from enriched items
  const totalViews = useMemo(() => allItems.reduce((s, i) => s + (i.stats?.uniqViews ?? 0), 0), [allItems]);
  const totalContacts = useMemo(() => allItems.reduce((s, i) => s + (i.stats?.uniqContacts ?? 0), 0), [allItems]);
  const totalFavorites = useMemo(() => allItems.reduce((s, i) => s + (i.stats?.uniqFavorites ?? 0), 0), [allItems]);
  const avgConversion = useMemo(() => {
    if (totalViews === 0) return "0.0";
    return (totalContacts / totalViews * 100).toFixed(1);
  }, [totalViews, totalContacts]);

  // ── Auto-ping ──────────────────────────────────────────────────────────

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

  // Auto-scroll to newest messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Mutations ──────────────────────────────────────────────────────────

  const connectMutation = useMutation({
    mutationFn: () => apiFetch("/api/avito/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    }),
    onSuccess: (data) => {
      toast({ title: "Авито подключён", description: `Аккаунт: ${data.avitoUserName ?? data.avitoUserId}` });
      qc.invalidateQueries({ queryKey: ["/api/avito/settings"] });
      setClientId(""); setClientSecret("");
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка подключения", description: e.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch("/api/avito/settings", { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Авито отключён" });
      qc.invalidateQueries({ queryKey: ["/api/avito/settings"] });
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
      setShowTemplates(false);
      setTimeout(() => refetchMessages(), 500);
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка отправки", description: e.message, variant: "destructive" });
    },
  });

  const createLeadMutation = useMutation({
    mutationFn: (chat: AvitoChat) => {
      const user = chat.users.find(u => u.id.toString() !== settings?.avitoUserId);
      return apiFetch("/api/avito/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          clientName: user?.name,
          itemTitle: chat.context?.value?.title,
        }),
      });
    },
    onSuccess: (data) => {
      toast({ title: "Заявка создана", description: `Заявка #${data.leadId}` });
    },
    onError: (e: Error) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  const handleAiAnalyze = async () => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const data = await apiFetch("/api/avito/ai-analyze", { method: "POST" });
      setAiAnalysis(data.analysis);
    } catch (e: any) {
      toast({ title: "AI анализ недоступен", description: e.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (settingsLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Загрузка...
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 align-middle">
                Авито
              </span>
              Интеграция с Авито
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Чаты, объявления и аналитика в одном месте</p>
          </div>
          {settings?.connected && (
            <div className="flex items-center gap-2 shrink-0">
              <div className={cn("flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium",
                isOnline === true ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : isOnline === false ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-muted text-muted-foreground")}>
                {isOnline === true ? <Wifi className="w-3 h-3" /> : isOnline === false ? <WifiOff className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
                {isOnline === true ? "В сети" : isOnline === false ? "Не в сети" : "Проверка..."}
                {lastPing && <span className="opacity-60">· {lastPing.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>}
              </div>
              <Button variant="outline" size="sm" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
                <Unplug className="w-4 h-4 mr-1.5" /> Отключить
              </Button>
            </div>
          )}
        </div>

        {/* ── Connection card ──────────────────────────────────────────── */}
        {settings?.connected ? (
          <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
            <CardContent className="py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <p className="font-medium text-green-800 dark:text-green-400 text-sm">
                Авито подключён — {settings.avitoUserName ?? settings.avitoUserId}
              </p>
              <span className="text-green-600/50 text-xs ml-auto hidden sm:block">Чаты обновляются автоматически</span>
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
              {connectMutation.isError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {connectMutation.error?.message}
                </div>
              )}
              <Button onClick={() => connectMutation.mutate()} disabled={!clientId || !clientSecret || connectMutation.isPending} className="w-full">
                {connectMutation.isPending
                  ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Подключение...</>
                  : <><Plug className="w-4 h-4 mr-2" /> Подключить Авито</>}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Main tabs ────────────────────────────────────────────────── */}
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
                {allItems.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({allItems.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4" />
                Аналитика
              </TabsTrigger>
            </TabsList>

            {/* ════════════════ CHATS TAB ════════════════ */}
            <TabsContent value="chats">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">

                {/* Chat list */}
                <Card className="lg:col-span-1 flex flex-col overflow-hidden">
                  <CardHeader className="py-3 px-4 border-b shrink-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        Входящие чаты
                        {chats.length > 0 && <Badge variant="secondary">{chats.length}</Badge>}
                      </CardTitle>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetchChats()}>
                        <RefreshCw className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Поиск по имени или объявлению..."
                        value={chatSearch}
                        onChange={e => setChatSearch(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                      {chatSearch && (
                        <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setChatSearch("")}>
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  <div className="flex-1 overflow-y-auto">
                    {chatsLoading ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Загрузка...
                      </div>
                    ) : chatsError ? (
                      <div className="p-4 text-center text-sm">
                        <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-500" />
                        <p className="text-red-600 font-medium">Ошибка загрузки</p>
                        <p className="text-muted-foreground text-xs mt-1">{(chatsError as Error).message}</p>
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => refetchChats()}>
                          Повторить
                        </Button>
                      </div>
                    ) : filteredChats.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        {chatSearch ? "Ничего не найдено" : "Нет активных чатов"}
                      </div>
                    ) : filteredChats.map(chat => {
                      const opponent = chat.users.find(u => u.id.toString() !== settings.avitoUserId);
                      const lastText = chat.last_message?.content?.text?.text;
                      const isSelected = selectedChat?.id === chat.id;
                      const hasUnread = chat.unread_counter > 0;
                      return (
                        <button key={chat.id} onClick={() => setSelectedChat(chat)}
                          className={cn(
                            "w-full text-left px-4 py-3 border-b border-border/50 transition-colors",
                            "hover:bg-orange-50/60 dark:hover:bg-orange-950/10",
                            isSelected
                              ? "bg-orange-50 dark:bg-orange-950/20 border-l-[3px] border-l-orange-500 pl-[13px]"
                              : hasUnread
                              ? "border-l-[3px] border-l-orange-400 pl-[13px]"
                              : "border-l-[3px] border-l-transparent pl-[13px]"
                          )}>
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className={cn(
                              "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                              hasUnread
                                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                                : "bg-muted text-muted-foreground"
                            )}>
                              {(opponent?.name ?? "К").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className={cn("text-sm truncate", hasUnread ? "font-semibold" : "font-medium")}>
                                  {opponent?.name ?? "Клиент"}
                                </span>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {chat.updated ? formatTime(chat.updated) : ""}
                                </span>
                              </div>
                              {chat.context?.value?.title && (
                                <p className="text-[11px] text-orange-600 dark:text-orange-400 truncate font-medium">{chat.context.value.title}</p>
                              )}
                              <div className="flex items-center justify-between gap-1 mt-0.5">
                                {lastText ? (
                                  <p className="text-xs text-muted-foreground truncate">{lastText}</p>
                                ) : <span />}
                                {hasUnread && (
                                  <span className="shrink-0 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                                    {chat.unread_counter}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
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
                        <p className="text-xs mt-1 opacity-60">Чаты обновляются каждую минуту</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <CardHeader className="py-3 px-4 border-b shrink-0 bg-orange-50/50 dark:bg-orange-950/10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 flex items-center justify-center font-bold text-sm shrink-0">
                              {(selectedChat.users.find(u => u.id.toString() !== settings.avitoUserId)?.name ?? "К").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-sm truncate">
                                  {selectedChat.users.find(u => u.id.toString() !== settings.avitoUserId)?.name ?? "Клиент"}
                                </CardTitle>
                                <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500 text-white">
                                  Авито
                                </span>
                              </div>
                              {selectedChat.context?.value?.title && (
                                <p className="text-xs text-orange-600 dark:text-orange-400 truncate font-medium">
                                  {selectedChat.context.value.title}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {selectedChat.context?.value?.id && (
                              <a
                                href={`https://www.avito.ru/items/${selectedChat.context.value.id}`}
                                target="_blank" rel="noreferrer"
                                className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1 hover:underline">
                                <ExternalLink className="w-3.5 h-3.5" /> Объявление
                              </a>
                            )}
                            <Button size="sm"
                              className="bg-orange-500 hover:bg-orange-600 text-white border-0"
                              onClick={() => createLeadMutation.mutate(selectedChat)}
                              disabled={createLeadMutation.isPending}>
                              <UserPlus className="w-4 h-4 mr-1.5" />
                              {createLeadMutation.isPending ? "Создание..." : "Заявка"}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 ? (
                          <div className="text-center text-muted-foreground text-sm py-8">Нет сообщений</div>
                        ) : [...messages].reverse().map(msg => {
                          const isOurs = msg.author_id.toString() === settings.avitoUserId;
                          const text = msg.content?.text?.text;
                          return (
                            <div key={msg.id} className={cn("flex", isOurs ? "justify-end" : "justify-start")}>
                              <div className={cn("max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                                isOurs
                                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                                  : "bg-muted text-foreground rounded-tl-sm")}>
                                {text
                                  ? <p className="whitespace-pre-wrap">{text}</p>
                                  : <p className="italic opacity-60">[вложение]</p>}
                                <p className={cn("text-[10px] mt-1",
                                  isOurs ? "text-primary-foreground/60 text-right" : "text-muted-foreground")}>
                                  {msg.created ? formatTime(msg.created) : ""}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* Reply area */}
                      <div className="p-3 border-t shrink-0 space-y-2">
                        {/* Templates */}
                        {showTemplates && (
                          <div className="bg-muted/50 rounded-xl p-2 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5">Шаблоны быстрых ответов:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {REPLY_TEMPLATES.map(tpl => (
                                <button
                                  key={tpl.label}
                                  onClick={() => { setReplyText(tpl.text); setShowTemplates(false); }}
                                  className="text-left text-xs px-3 py-2 rounded-lg bg-background hover:bg-primary/5 border border-border/60 transition-colors">
                                  <span className="font-medium block">{tpl.label}</span>
                                  <span className="text-muted-foreground truncate block">{tpl.text.slice(0, 60)}…</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline" size="icon" className="h-10 w-10 shrink-0"
                            onClick={() => setShowTemplates(v => !v)}
                            title="Шаблоны ответов">
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Textarea
                            placeholder="Написать сообщение... (Enter — отправить, Shift+Enter — новая строка)"
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            rows={2}
                            className="resize-none text-sm"
                            onKeyDown={e => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (replyText.trim()) replyMutation.mutate();
                              }
                            }}
                          />
                          <Button
                            onClick={() => replyMutation.mutate()}
                            disabled={!replyText.trim() || replyMutation.isPending}
                            size="icon" className="h-10 w-10 shrink-0">
                            {replyMutation.isPending
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Send className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </TabsContent>

            {/* ════════════════ ITEMS TAB ════════════════ */}
            <TabsContent value="items">
              <Card>
                <CardHeader className="py-4 px-5 border-b">
                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-primary" />
                      Мои объявления
                      {itemsData?.meta?.total != null
                        ? <Badge variant="secondary">{itemsData.meta.total}</Badge>
                        : allItems.length > 0 && <Badge variant="secondary">{allItems.length}</Badge>}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => refetchItems()} disabled={itemsLoading}>
                        <RefreshCw className={cn("w-4 h-4 mr-1.5", itemsLoading && "animate-spin")} /> Обновить
                      </Button>
                    </div>
                  </div>
                  {/* Search + filter row */}
                  <div className="flex gap-2 mt-3">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Поиск объявлений..."
                        value={itemSearch}
                        onChange={e => setItemSearch(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                      {itemSearch && (
                        <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setItemSearch("")}>
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    <select
                      value={itemStatusFilter}
                      onChange={e => setItemStatusFilter(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                      <option value="all">Все статусы</option>
                      <option value="active">Активные</option>
                      <option value="old">Старые</option>
                      <option value="archived">В архиве</option>
                      <option value="blocked">Заблокированные</option>
                    </select>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {itemsLoading ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Загрузка объявлений и статистики...
                    </div>
                  ) : itemsError ? (
                    <div className="py-10 text-center px-6">
                      {(itemsError as ApiError).code === "NO_ITEMS_PERMISSION" ? (
                        <>
                          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-3">
                            <AlertCircle className="w-6 h-6 text-amber-500" />
                          </div>
                          <p className="text-sm font-semibold">Нет доступа к разделу «Объявления» (404)</p>
                          <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
                            Ваш аккаунт Авито подключён и токен действителен — но у приложения не включён доступ к API объявлений.
                            Это нужно разрешить в личном кабинете разработчика, даже для персональной авторизации.
                          </p>
                          <div className="mt-4 bg-muted/50 rounded-xl p-4 text-left text-xs space-y-2.5 max-w-sm mx-auto">
                            <p className="font-medium text-sm mb-1">Как включить доступ:</p>
                            <p><strong>1.</strong> Откройте <a href="https://developers.avito.ru/apps" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">developers.avito.ru/apps <ExternalLink className="w-3 h-3" /></a></p>
                            <p><strong>2.</strong> Нажмите на ваше приложение → раздел <strong>«Доступы»</strong> или <strong>«Права доступа»</strong></p>
                            <p><strong>3.</strong> Найдите и включите <strong>«Объявления»</strong> (Items / items:info)</p>
                            <p><strong>4.</strong> Сохраните изменения</p>
                            <p><strong>5.</strong> Вернитесь сюда → нажмите <strong>«Отключить»</strong> → подключите заново</p>
                          </div>
                          <Button size="sm" variant="outline" className="mt-4" onClick={() => refetchItems()}>
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Попробовать снова
                          </Button>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500" />
                          <p className="text-sm font-medium text-red-600">Ошибка загрузки объявлений</p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                            {(itemsError as Error).message}
                          </p>
                          <Button size="sm" variant="outline" className="mt-3" onClick={() => refetchItems()}>
                            Повторить запрос
                          </Button>
                        </>
                      )}
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">{itemSearch || itemStatusFilter !== "all" ? "Ничего не найдено" : "Объявлений не найдено"}</p>
                      {(itemSearch || itemStatusFilter !== "all") && (
                        <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setItemSearch(""); setItemStatusFilter("all"); }}>
                          Сбросить фильтры
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredItems.map(item => {
                        const st = statusLabel(item.status);
                        const views = item.stats?.uniqViews ?? 0;
                        const contacts = item.stats?.uniqContacts ?? 0;
                        const favs = item.stats?.uniqFavorites ?? 0;
                        const img = item.images?.[0]?.["140x105"];
                        const convRate = views > 0 ? (contacts / views * 100).toFixed(1) : null;
                        return (
                          <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                            {/* Thumbnail */}
                            <div className="w-16 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                              {img
                                ? <img src={img} alt="" className="w-full h-full object-cover" />
                                : <Package className="w-6 h-6 m-auto mt-3 text-muted-foreground/40" />}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <p className="font-medium text-sm truncate flex-1">{item.title}</p>
                                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", st.color)}>
                                  {st.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                {item.price > 0 && (
                                  <span className="text-sm font-semibold">{item.price.toLocaleString("ru-RU")} ₽</span>
                                )}
                                {item.category?.name && (
                                  <span className="text-xs text-muted-foreground">{item.category.name}</span>
                                )}
                              </div>
                            </div>
                            {/* Stats */}
                            <div className="hidden md:flex flex-col items-end gap-1 shrink-0">
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{views.toLocaleString("ru-RU")}</span>
                                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{contacts}</span>
                                <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{favs}</span>
                              </div>
                              {convRate !== null && (
                                <span className={cn("text-xs flex items-center gap-1 font-medium", conversionColor(views, contacts))}>
                                  {conversionIcon(views, contacts)} {convRate}% конверсия
                                </span>
                              )}
                            </div>
                            <a href={item.url} target="_blank" rel="noreferrer"
                              className="shrink-0 text-primary hover:text-primary/80 p-1">
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

            {/* ════════════════ ANALYTICS TAB ════════════════ */}
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
                      <p className="text-2xl font-bold">{itemsLoading ? "—" : card.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {itemsError && (
                <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
                  <CardContent className="py-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">Ошибка загрузки данных</p>
                      <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">{(itemsError as Error).message}</p>
                    </div>
                    <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => refetchItems()}>
                      Повторить
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* AI analysis */}
              <Card>
                <CardHeader className="py-4 px-5 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      AI-анализ объявлений
                    </CardTitle>
                    <Button onClick={handleAiAnalyze} disabled={isAnalyzing || allItems.length === 0} size="sm">
                      {isAnalyzing
                        ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Анализирую...</>
                        : <><Sparkles className="w-4 h-4 mr-1.5" /> Проанализировать</>}
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
                    <div className="relative">
                      <Button
                        variant="ghost" size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => { navigator.clipboard.writeText(aiAnalysis); toast({ title: "Скопировано" }); }}>
                        <Copy className="w-3.5 h-3.5 mr-1" /> Скопировать
                      </Button>
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed bg-muted/40 rounded-xl p-4 pr-28">
                        {aiAnalysis}
                      </pre>
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
                  {itemsLoading ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Загрузка...
                    </div>
                  ) : allItems.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">Нет данных</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Объявление</th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">
                              <Eye className="w-3.5 h-3.5 inline mr-1" />Просмотры
                            </th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">
                              <Phone className="w-3.5 h-3.5 inline mr-1" />Контакты
                            </th>
                            <th className="text-right px-3 py-2.5 font-medium text-muted-foreground text-xs">
                              <Heart className="w-3.5 h-3.5 inline mr-1" />Избранное
                            </th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Конверсия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...allItems]
                            .sort((a, b) => (b.stats?.uniqViews ?? 0) - (a.stats?.uniqViews ?? 0))
                            .map(item => {
                              const views = item.stats?.uniqViews ?? 0;
                              const contacts = item.stats?.uniqContacts ?? 0;
                              const favs = item.stats?.uniqFavorites ?? 0;
                              const rate = views > 0 ? (contacts / views * 100).toFixed(1) : "0";
                              return (
                                <tr key={item.id} className="border-b hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-3">
                                    <a href={item.url} target="_blank" rel="noreferrer"
                                      className="font-medium truncate max-w-[280px] block hover:text-primary transition-colors">
                                      {item.title}
                                    </a>
                                    {item.category?.name && (
                                      <p className="text-xs text-muted-foreground">{item.category.name}</p>
                                    )}
                                  </td>
                                  <td className="text-right px-3 py-3 tabular-nums">{views.toLocaleString("ru-RU")}</td>
                                  <td className="text-right px-3 py-3 tabular-nums">{contacts.toLocaleString("ru-RU")}</td>
                                  <td className="text-right px-3 py-3 tabular-nums">{favs.toLocaleString("ru-RU")}</td>
                                  <td className="text-right px-4 py-3">
                                    <span className={cn("flex items-center justify-end gap-1 font-semibold tabular-nums",
                                      conversionColor(views, contacts))}>
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
