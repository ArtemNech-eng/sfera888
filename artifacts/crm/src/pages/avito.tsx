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
  Package, Search, Filter, X, FileText, Copy, Zap, Plus, Trash2, Pencil,
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
  stats?: {
    uniqViews?: number; uniqContacts?: number; uniqFavorites?: number;
    viewsDay?: number; viewsWeek?: number; viewsMonth?: number;
    contactsDay?: number; contactsWeek?: number; contactsMonth?: number;
    favsDay?: number; favsWeek?: number; favsMonth?: number;
    daily?: { date: string; uniqViews: number; uniqContacts: number; uniqFavorites: number }[];
  };
}

interface CrmStats {
  leads:  { total: number; month: number; week: number; today: number };
  orders: { total: number; month: number; week: number };
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

// ── Reply templates (по спецификации) ──────────────────────────────────────

const REPLY_TEMPLATES = [
  {
    label: "Цены",
    text: "Здравствуйте!\nОбои от 300₽/м²\nШпаклёвка от 350₽/м²\nПокраска от 200₽/м²\nПлитка от 1200₽/м²\n\nПодскажите:\n1. Какой район?\n2. Примерная площадь?\n3. Когда хотите начать?",
  },
  {
    label: "Мастер приедет",
    text: "Отлично! Сейчас подберу мастера из вашего района. Он свяжется с вами в течение часа и договоритесь по времени.\nСкиньте номер для связи 👍",
  },
  {
    label: "Гарантия",
    text: "После работы выдаём гарантийный сертификат на 2 года.\nЕсли что-то отклеится — приедем и переделаем бесплатно 👍",
  },
  {
    label: "Бригада",
    text: "Да, мы частная бригада, работаем по районам. Цены одинаковые. Кто ближе — тот и выезжает.",
  },
  {
    label: "Приветствие",
    text: "Здравствуйте! Спасибо за обращение. Чем могу помочь?",
  },
  {
    label: "Контакт",
    text: "Оставьте, пожалуйста, номер телефона — наш менеджер свяжется с вами в течение часа.",
  },
];

// ── Quick Replies Manager ──────────────────────────────────────────────────

interface QuickReplyItem {
  id: string;
  label: string;
  text: string;
}

function QuickRepliesManager() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<QuickReplyItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newText, setNewText] = useState("");

  const { data, isLoading } = useQuery<{ replies: QuickReplyItem[] }>({
    queryKey: ["/api/avito/quick-replies"],
    queryFn: () => fetch(`${BASE}/api/avito/quick-replies`, { credentials: "include" }).then(r => r.json()),
  });
  const replies = data?.replies ?? [];

  const saveMutation = useMutation({
    mutationFn: async (next: QuickReplyItem[]) => {
      const r = await fetch(`${BASE}/api/avito/quick-replies`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ replies: next }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/avito/quick-replies"] });
      toast({ title: "Сохранено" });
      setEditing(null);
      setCreating(false);
      setNewLabel("");
      setNewText("");
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const handleAdd = () => {
    if (!newLabel.trim() || !newText.trim()) return;
    const item: QuickReplyItem = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      label: newLabel.trim(),
      text: newText.trim(),
    };
    saveMutation.mutate([...replies, item]);
  };

  const handleDelete = (id: string) => {
    saveMutation.mutate(replies.filter(r => r.id !== id));
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    saveMutation.mutate(replies.map(r => r.id === editing.id ? editing : r));
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Быстрые ответы
          </CardTitle>
          <CardDescription>
            Кнопки быстрых ответов отображаются в мессенджере Авито над полем ввода. Нажмите — текст вставится в поле.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
            </div>
          ) : (
            <>
              {replies.map(reply => (
                <div key={reply.id} className="border rounded-xl p-4 space-y-2 bg-card">
                  {editing?.id === reply.id ? (
                    <>
                      <div className="flex gap-2">
                        <Input
                          value={editing.label}
                          onChange={e => setEditing({ ...editing, label: e.target.value })}
                          placeholder="Название кнопки"
                          className="text-sm h-8 flex-1"
                        />
                      </div>
                      <Textarea
                        value={editing.text}
                        onChange={e => setEditing({ ...editing, text: e.target.value })}
                        placeholder="Текст ответа..."
                        className="text-sm resize-none"
                        rows={4}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveEdit} disabled={saveMutation.isPending} className="h-7 text-xs">
                          Сохранить
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-7 text-xs">
                          Отмена
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm px-2 py-0.5 rounded-full border border-orange-200 bg-orange-50 text-orange-700">
                          {reply.label}
                        </span>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(reply)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(reply.id)}
                            disabled={saveMutation.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap pl-1">{reply.text}</p>
                    </>
                  )}
                </div>
              ))}

              {/* Add new */}
              {creating ? (
                <div className="border-2 border-dashed border-primary/30 rounded-xl p-4 space-y-2 bg-primary/5">
                  <Input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="Название кнопки (например: «Цены»)"
                    className="text-sm h-8"
                    autoFocus
                  />
                  <Textarea
                    value={newText}
                    onChange={e => setNewText(e.target.value)}
                    placeholder="Текст быстрого ответа..."
                    className="text-sm resize-none"
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAdd}
                      disabled={saveMutation.isPending || !newLabel.trim() || !newText.trim()}
                      className="h-7 text-xs"
                    >
                      {saveMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                      Добавить
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewLabel(""); setNewText(""); }} className="h-7 text-xs">
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreating(true)}
                  className="w-full h-9 border-dashed gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-4 h-4" />
                  Добавить быстрый ответ
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [leadForm, setLeadForm] = useState({ city: "", serviceType: "", district: "", area: "", comment: "" });
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [oauthLoading, setOauthLoading] = useState(false);
  const prevUnreadRef = useRef(0);
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
  const { data: itemsData, isLoading: itemsLoading, error: itemsError, refetch: refetchItems } = useQuery<{ resources: AvitoItem[]; meta?: { total?: number }; statsError?: string | null }>({
    queryKey: ["/api/avito/items-with-stats"],
    queryFn: () => apiFetch("/api/avito/items-with-stats"),
    enabled: !!settings?.connected && (tab === "items" || tab === "analytics"),
    staleTime: 3 * 60_000,
  });
  const statsError = itemsData?.statsError ?? null;

  // CRM linkage: Avito-sourced leads and orders
  const { data: crmStats } = useQuery<CrmStats>({
    queryKey: ["/api/avito/crm-stats"],
    queryFn: () => apiFetch("/api/avito/crm-stats"),
    enabled: tab === "analytics",
    staleTime: 5 * 60_000,
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

  // Analytics totals — use month fields from new stats format
  const totalViews    = useMemo(() => allItems.reduce((s, i) => s + (i.stats?.viewsMonth    ?? i.stats?.uniqViews    ?? 0), 0), [allItems]);
  const totalContacts = useMemo(() => allItems.reduce((s, i) => s + (i.stats?.contactsMonth ?? i.stats?.uniqContacts ?? 0), 0), [allItems]);
  const totalFavorites= useMemo(() => allItems.reduce((s, i) => s + (i.stats?.favsMonth     ?? i.stats?.uniqFavorites?? 0), 0), [allItems]);
  const totalViewsWeek= useMemo(() => allItems.reduce((s, i) => s + (i.stats?.viewsWeek    ?? 0), 0), [allItems]);
  const totalContactsWeek = useMemo(() => allItems.reduce((s, i) => s + (i.stats?.contactsWeek ?? 0), 0), [allItems]);
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

  // Load cities + services for lead form
  useEffect(() => {
    fetch(`${BASE}/api/settings/cities`).then(r => r.ok ? r.json() : [])
      .then((d: { name: string }[]) => setAvailableCities(d.map(c => c.name))).catch(() => {});
    fetch(`${BASE}/api/settings/services`).then(r => r.ok ? r.json() : [])
      .then((d: { name: string }[]) => setAvailableServices(d.map(s => s.name))).catch(() => {});
  }, []);

  // Handle OAuth callback result from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("avito_connected");
    const avitoUser = params.get("avito_user");
    const avitoError = params.get("avito_error");

    if (connected === "1") {
      toast({ title: "✅ Авито подключён через OAuth", description: avitoUser ? `Аккаунт: ${avitoUser}` : "Успешно" });
      qc.invalidateQueries({ queryKey: ["/api/avito/settings"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (avitoError) {
      toast({ title: "Ошибка подключения Авито", description: decodeURIComponent(avitoError), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Sound notification for new unread messages
  useEffect(() => {
    const current = unreadTotal;
    if (current > prevUnreadRef.current) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch {}
    }
    prevUnreadRef.current = current;
  }, [unreadTotal]);

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
    mutationFn: ({ chat, form }: { chat: AvitoChat; form: typeof leadForm }) => {
      const user = chat.users.find(u => u.id.toString() !== settings?.avitoUserId);
      return apiFetch("/api/avito/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          clientName: user?.name,
          itemTitle: chat.context?.value?.title,
          city: form.city || "Не указан",
          serviceType: form.serviceType || chat.context?.value?.title || "Авито",
          district: form.district,
          area: form.area,
          comment: form.comment,
        }),
      });
    },
    onSuccess: (data) => {
      toast({ title: "Заявка создана", description: `Заявка #${data.leadId}` });
      setShowLeadModal(false);
      setLeadForm({ city: "", serviceType: "", district: "", area: "", comment: "" });
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
              <Button variant="outline" size="sm" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending} data-avito-disconnect>
                <Unplug className="w-4 h-4 mr-1.5" /> Отключить
              </Button>
            </div>
          )}
        </div>

        {/* ── Connection card ──────────────────────────────────────────── */}
        {settings?.connected ? (
          <Card className="border-orange-200 bg-orange-50/40 dark:border-orange-900 dark:bg-orange-950/10">
            <CardContent className="py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">
                  Авито подключён — {settings.avitoUserName ?? settings.avitoUserId}
                </p>
              </div>
              <span className="text-muted-foreground text-xs hidden sm:block">Чаты обновляются автоматически</span>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plug className="w-5 h-5 text-orange-500" /> Подключить Авито
              </CardTitle>
              <CardDescription>
                Введите Client ID и Client Secret из личного кабинета Авито Developers.<br />
                Redirect URL в настройках Авито: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">https://sfera-master.ru/api/avito/callback</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* OAuth button — recommended */}
              <div className="rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white">Рекомендуется</span>
                  <p className="text-sm font-medium">Войти через Авито (OAuth)</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Нажмите кнопку — откроется страница Авито для авторизации. Токен обновляется автоматически, не надо вводить заново.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Client ID</label>
                    <Input placeholder="Введите Client ID" value={clientId} onChange={e => setClientId(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Client Secret</label>
                    <Input type="password" placeholder="Введите Client Secret" value={clientSecret} onChange={e => setClientSecret(e.target.value)} className="h-9" />
                  </div>
                </div>
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  disabled={!clientId || !clientSecret || oauthLoading}
                  onClick={() => {
                    if (!clientId || !clientSecret) return;
                    setOauthLoading(true);
                    window.location.href = `/api/avito/oauth-start?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
                  }}
                >
                  {oauthLoading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Перенаправление...</>
                    : <><ExternalLink className="w-4 h-4 mr-2" /> Войти через Авито →</>}
                </Button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">или напрямую через токен</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Client credentials fallback */}
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Если OAuth не работает — подключитесь через Client Credentials (токен действует 24 часа, обновляется автоматически):
                </p>
                {connectMutation.isError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {connectMutation.error?.message}
                  </div>
                )}
                <Button variant="outline" onClick={() => connectMutation.mutate()} disabled={!clientId || !clientSecret || connectMutation.isPending} className="w-full">
                  {connectMutation.isPending
                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Подключение...</>
                    : <><Plug className="w-4 h-4 mr-2" /> Подключить через Client Credentials</>}
                </Button>
              </div>

              <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                <div>
                  <p className="font-medium text-foreground mb-1">Как получить ключи:</p>
                  <ol className="space-y-0.5 list-decimal list-inside">
                    <li>Откройте <a href="https://developers.avito.ru" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">developers.avito.ru <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Создайте приложение → доступ: Messenger + Items</li>
                    <li>Укажите Redirect URI: <code className="bg-muted px-1 rounded">https://sfera-master.ru/api/avito/callback</code></li>
                    <li>Скопируйте Client ID и Client Secret</li>
                  </ol>
                </div>
              </div>
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
              <TabsTrigger value="quick-replies" className="flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                Быстрые ответы
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
                              onClick={() => setShowLeadModal(true)}>
                              <UserPlus className="w-4 h-4 mr-1.5" />
                              Заявка
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                        {messages.length === 0 ? (
                          <div className="text-center text-muted-foreground text-sm py-8">
                            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            Нет сообщений
                          </div>
                        ) : [...messages].reverse().map(msg => {
                          const isOurs = msg.author_id.toString() === settings.avitoUserId;
                          const text = msg.content?.text?.text;
                          return (
                            <div key={msg.id} className={cn("flex", isOurs ? "justify-end" : "justify-start")}>
                              <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                                isOurs
                                  ? "bg-orange-500 text-white rounded-br-sm"
                                  : "bg-white dark:bg-card text-foreground rounded-bl-sm border border-border/50")}>
                                {text
                                  ? <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
                                  : <p className="italic opacity-60">[вложение]</p>}
                                <p className={cn("text-[10px] mt-1",
                                  isOurs ? "text-orange-100 text-right" : "text-muted-foreground")}>
                                  {msg.created ? formatTime(msg.created) : ""}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* Reply area */}
                      <div className="border-t shrink-0">
                        {/* Quick reply chips — horizontal scroll */}
                        <div className="px-3 pt-2.5 pb-1 flex gap-2 overflow-x-auto scrollbar-none">
                          {REPLY_TEMPLATES.map(tpl => (
                            <button
                              key={tpl.label}
                              onClick={() => setReplyText(tpl.text)}
                              className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border border-orange-300 bg-orange-50 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:hover:bg-orange-950/50 text-orange-700 dark:text-orange-400 transition-colors whitespace-nowrap">
                              {tpl.label}
                            </button>
                          ))}
                        </div>
                        {/* Input row */}
                        <div className="flex gap-2 p-3 pt-1.5">
                          <Textarea
                            placeholder="Написать сообщение... (Enter — отправить)"
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            rows={2}
                            className="resize-none text-sm flex-1"
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
                            className="bg-orange-500 hover:bg-orange-600 text-white h-10 w-10 shrink-0 self-end">
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

              {/* Stats scope warning */}
              {statsError && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900">Статистика недоступна</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Токен Авито не имеет разрешения <code className="bg-amber-100 px-1 rounded">stats:read</code>.
                      Нужно переподключить Авито.
                    </p>
                  </div>
                  <Button size="sm" variant="outline"
                    className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 h-7 text-xs"
                    onClick={() => { const el = document.querySelector("[data-avito-disconnect]") as HTMLButtonElement | null; el?.click(); }}>
                    Отключить
                  </Button>
                </div>
              )}

              {itemsError && (
                <Card className="border-red-200 bg-red-50/50">
                  <CardContent className="py-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-700">Ошибка загрузки данных Авито</p>
                      <p className="text-xs text-red-600/80 mt-0.5">{(itemsError as Error).message}</p>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => refetchItems()}>Повторить</Button>
                  </CardContent>
                </Card>
              )}

              {/* ── Сводные карточки (месяц) ─────────────────────────── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Просмотры / мес", value: totalViews, sub: `${totalViewsWeek} за нед`, icon: Eye, color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Контакты / мес",  value: totalContacts, sub: `${totalContactsWeek} за нед`, icon: Phone, color: "text-green-600", bg: "bg-green-50" },
                  { label: "В избранном / мес",value: totalFavorites, sub: `${allItems.length} объявлений`, icon: Star, color: "text-amber-500", bg: "bg-amber-50" },
                  { label: "Конверсия",        value: null, sub: "контакты / просмотры", icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
                ].map((card, i) => (
                  <Card key={card.label}>
                    <CardContent className="py-4 px-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-muted-foreground">{card.label}</p>
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", card.bg)}>
                          <card.icon className={cn("w-3.5 h-3.5", card.color)} />
                        </div>
                      </div>
                      <p className="text-2xl font-bold tabular-nums">
                        {itemsLoading ? "—" : i === 3 ? `${avgConversion}%` : card.value!.toLocaleString("ru-RU")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── Связка с CRM ────────────────────────────────────── */}
              <Card>
                <CardHeader className="py-3 px-5 border-b">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Связка с CRM — лиды и заказы из Авито
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-4 px-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Лидов всего",   value: crmStats?.leads.total  ?? "—", sub: "из Авито в CRM" },
                      { label: "Лидов за мес",  value: crmStats?.leads.month  ?? "—", sub: "последние 30 дней" },
                      { label: "Лидов за нед",  value: crmStats?.leads.week   ?? "—", sub: "последние 7 дней" },
                      { label: "Сегодня",       value: crmStats?.leads.today  ?? "—", sub: "новых лидов" },
                    ].map(s => (
                      <div key={s.label} className="text-center p-3 bg-muted/30 rounded-xl">
                        <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                        <p className="text-xs font-medium mt-0.5">{s.label}</p>
                        <p className="text-xs text-muted-foreground">{s.sub}</p>
                      </div>
                    ))}
                  </div>
                  {crmStats && (
                    <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-muted/30 rounded-xl">
                        <p className="text-xl font-bold tabular-nums">{crmStats.orders.total}</p>
                        <p className="text-xs font-medium mt-0.5">Заказов всего</p>
                        <p className="text-xs text-muted-foreground">по Авито лидам</p>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-xl">
                        <p className="text-xl font-bold tabular-nums">{crmStats.orders.month}</p>
                        <p className="text-xs font-medium mt-0.5">Заказов за мес</p>
                        <p className="text-xs text-muted-foreground">последние 30 дней</p>
                      </div>
                      <div className="p-3 bg-muted/30 rounded-xl">
                        <p className="text-xl font-bold tabular-nums">
                          {crmStats.leads.total > 0
                            ? `${Math.round(crmStats.orders.total / crmStats.leads.total * 100)}%`
                            : "—"}
                        </p>
                        <p className="text-xs font-medium mt-0.5">Конверсия лид→заказ</p>
                        <p className="text-xs text-muted-foreground">в CRM</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Таблица объявлений: день / неделя / месяц ──────── */}
              <Card>
                <CardHeader className="py-4 px-5 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      Статистика объявлений
                    </CardTitle>
                    <Button size="sm" variant="ghost" onClick={() => refetchItems()} disabled={itemsLoading}>
                      <Loader2 className={cn("w-3.5 h-3.5 mr-1", itemsLoading && "animate-spin")} />
                      Обновить
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {itemsLoading ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Загрузка статистики...
                    </div>
                  ) : allItems.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">Нет объявлений</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs min-w-[180px]">Объявление</th>
                            <th className="text-center px-2 py-2.5 font-medium text-muted-foreground text-xs" colSpan={3}>
                              <Eye className="w-3 h-3 inline mr-1" />Просмотры
                            </th>
                            <th className="text-center px-2 py-2.5 font-medium text-muted-foreground text-xs" colSpan={3}>
                              <Phone className="w-3 h-3 inline mr-1" />Контакты
                            </th>
                            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Конверсия</th>
                            <th className="text-center px-3 py-2.5 font-medium text-muted-foreground text-xs">Статус</th>
                          </tr>
                          <tr className="border-b bg-muted/10 text-[10px] text-muted-foreground">
                            <td className="px-4 pb-1" />
                            <td className="text-center px-2 pb-1">День</td>
                            <td className="text-center px-2 pb-1">Нед</td>
                            <td className="text-center px-2 pb-1 border-r">Мес</td>
                            <td className="text-center px-2 pb-1">День</td>
                            <td className="text-center px-2 pb-1">Нед</td>
                            <td className="text-center px-2 pb-1 border-r">Мес</td>
                            <td className="pb-1" />
                            <td className="pb-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {[...allItems]
                            .sort((a, b) => (b.stats?.viewsMonth ?? b.stats?.uniqViews ?? 0) - (a.stats?.viewsMonth ?? a.stats?.uniqViews ?? 0))
                            .map(item => {
                              const vD = item.stats?.viewsDay    ?? 0;
                              const vW = item.stats?.viewsWeek   ?? 0;
                              const vM = item.stats?.viewsMonth  ?? item.stats?.uniqViews    ?? 0;
                              const cD = item.stats?.contactsDay ?? 0;
                              const cW = item.stats?.contactsWeek?? 0;
                              const cM = item.stats?.contactsMonth ?? item.stats?.uniqContacts ?? 0;
                              const conv = vM > 0 ? (cM / vM * 100).toFixed(1) : "0";
                              const convNum = parseFloat(conv);
                              const statusLabel = item.status === "active" ? "Активно"
                                : item.status === "blocked" ? "Заблокировано"
                                : item.status === "rejected" ? "Отклонено"
                                : item.status === "archived" ? "Архив"
                                : item.status ?? "—";
                              const statusColor = item.status === "active" ? "bg-green-100 text-green-700"
                                : item.status === "blocked" || item.status === "rejected" ? "bg-red-100 text-red-700"
                                : "bg-muted text-muted-foreground";
                              return (
                                <tr key={item.id} className="border-b hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <a href={item.url} target="_blank" rel="noreferrer"
                                      className="font-medium text-xs leading-tight line-clamp-2 hover:text-primary transition-colors max-w-[200px] block">
                                      {item.title}
                                    </a>
                                    {item.category?.name && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.category.name}</p>
                                    )}
                                    {item.price > 0 && (
                                      <p className="text-[10px] text-muted-foreground">{item.price.toLocaleString("ru-RU")} ₽</p>
                                    )}
                                  </td>
                                  <td className="text-center px-2 py-2.5 tabular-nums text-xs">{vD}</td>
                                  <td className="text-center px-2 py-2.5 tabular-nums text-xs font-medium">{vW}</td>
                                  <td className="text-center px-2 py-2.5 tabular-nums text-xs font-bold border-r">{vM}</td>
                                  <td className="text-center px-2 py-2.5 tabular-nums text-xs">{cD}</td>
                                  <td className="text-center px-2 py-2.5 tabular-nums text-xs font-medium">{cW}</td>
                                  <td className="text-center px-2 py-2.5 tabular-nums text-xs font-bold border-r">{cM}</td>
                                  <td className="text-right px-4 py-2.5">
                                    <span className={cn("inline-flex items-center gap-0.5 font-semibold text-xs tabular-nums",
                                      convNum >= 5 ? "text-green-600" : convNum >= 2 ? "text-amber-600" : cM === 0 && vM === 0 ? "text-muted-foreground" : "text-red-500")}>
                                      {conversionIcon(vM, cM)}
                                      {conv}%
                                    </span>
                                  </td>
                                  <td className="text-center px-3 py-2.5">
                                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", statusColor)}>
                                      {statusLabel}
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

              {/* ── AI анализ ───────────────────────────────────────── */}
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
                  <CardDescription>ИИ изучит объявления со статистикой и даст советы по конверсии</CardDescription>
                </CardHeader>
                <CardContent className="py-4">
                  {!aiAnalysis && !isAnalyzing && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Нажмите «Проанализировать» — ИИ изучит статистику<br />и даст рекомендации по заголовкам, ценам и описаниям</p>
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
                      <Button variant="ghost" size="sm" className="absolute top-2 right-2"
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

            </TabsContent>

            {/* ════════════════ QUICK REPLIES TAB ════════════════ */}
            <TabsContent value="quick-replies">
              <QuickRepliesManager />
            </TabsContent>

          </Tabs>
        )}
      </div>

      {/* ── Модал создания заявки из Авито чата ─────────────────────────── */}
      {showLeadModal && selectedChat && settings && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowLeadModal(false)}
        >
          <div
            className="bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-orange-50/50 dark:bg-orange-950/10">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base">Создать заявку</h3>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500 text-white">Авито</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Клиент: <strong>{selectedChat.users.find(u => u.id.toString() !== settings.avitoUserId)?.name ?? "Клиент"}</strong>
                  {selectedChat.context?.value?.title && ` · ${selectedChat.context.value.title}`}
                </p>
              </div>
              <button
                onClick={() => setShowLeadModal(false)}
                className="text-muted-foreground hover:text-foreground h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form fields */}
            <div className="p-5 space-y-4">
              {/* Readonly fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Источник</label>
                  <div className="h-9 px-3 rounded-lg bg-muted/50 border border-border text-sm flex items-center text-muted-foreground">
                    Авито
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Имя клиента</label>
                  <div className="h-9 px-3 rounded-lg bg-muted/50 border border-border text-sm flex items-center text-muted-foreground truncate">
                    {selectedChat.users.find(u => u.id.toString() !== settings.avitoUserId)?.name ?? "Клиент"}
                  </div>
                </div>
              </div>

              {/* City + Service */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Город <span className="text-red-500">*</span></label>
                  <select
                    value={leadForm.city}
                    onChange={e => setLeadForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                  >
                    <option value="">Выберите город</option>
                    {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Вид работ</label>
                  <select
                    value={leadForm.serviceType}
                    onChange={e => setLeadForm(f => ({ ...f, serviceType: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                  >
                    <option value="">Выберите услугу</option>
                    {availableServices.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* District + Area */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Район</label>
                  <Input
                    placeholder="Район клиента"
                    value={leadForm.district}
                    onChange={e => setLeadForm(f => ({ ...f, district: e.target.value }))}
                    className="h-9 text-sm focus-visible:ring-orange-400/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Площадь</label>
                  <Input
                    placeholder="м², кол-во комнат"
                    value={leadForm.area}
                    onChange={e => setLeadForm(f => ({ ...f, area: e.target.value }))}
                    className="h-9 text-sm focus-visible:ring-orange-400/50"
                  />
                </div>
              </div>

              {/* Comment */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Комментарий</label>
                <Textarea
                  placeholder="Доп. информация из переписки..."
                  value={leadForm.comment}
                  onChange={e => setLeadForm(f => ({ ...f, comment: e.target.value }))}
                  rows={2}
                  className="resize-none text-sm focus-visible:ring-orange-400/50"
                />
              </div>

              {/* Chat link notice */}
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                Ссылка на чат Авито будет автоматически привязана к заявке
              </p>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowLeadModal(false)}
              >
                Отмена
              </Button>
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                disabled={!leadForm.city || createLeadMutation.isPending}
                onClick={() => createLeadMutation.mutate({ chat: selectedChat, form: leadForm })}
              >
                {createLeadMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Создание...</>
                  : <><UserPlus className="w-4 h-4 mr-2" />Создать заявку</>}
              </Button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}
