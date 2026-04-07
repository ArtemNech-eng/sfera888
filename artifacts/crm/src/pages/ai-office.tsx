import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Play, Square, Globe, Send, Trash2, Plus, Eye, EyeOff,
  Monitor, Loader2, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, Link2, Lock, MessageSquare, Zap, TrendingUp,
  Users, ClipboardList, Bot, Cpu, Radio, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

interface OfficeStats {
  manager: {
    online: boolean;
    todayStats: { sessions: number; leads: number; messages: number };
    recentActivity: { ts: string; text: string }[];
  };
  dispatcher: {
    online: boolean;
    todayStats: { sent: number; responded: number; assigned: number };
    recentActivity: { ts: string; text: string }[];
  };
  browser: {
    recentLogs: { ts: string; type: string; text: string }[];
  };
}

interface AgentLog {
  id: string;
  ts: string;
  type: "thought" | "action" | "result" | "error" | "info";
  text: string;
}

interface BrowserStatus {
  status: "idle" | "starting" | "running" | "done" | "error" | "stopped";
  task: string;
  hasScreenshot: boolean;
  logs: AgentLog[];
}

interface Credential {
  site: string;
  login: string;
  last_login_at: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOG_ICON: Record<string, React.ReactNode> = {
  thought: <ChevronRight className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />,
  action:  <Play className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />,
  result:  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />,
  error:   <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />,
  info:    <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />,
};

const QUICK_TASKS = [
  "Зайди на avito.ru, авторизуйся и проверь последние сообщения",
  "Открой avito.ru, авторизуйся и посмотри мои активные объявления",
  "Зайди на hh.ru и найди вакансии плиточника в Краснодаре",
  "Открой wildberries.ru и найди ценовой диапазон на [товар]",
];

// ─── Employee Card ────────────────────────────────────────────────────────────

function EmployeeCard({
  name, role, description, online, icon: Icon, color, gradient,
  stats, statLabels, recentActivity, onlineLabel = "Онлайн",
}: {
  name: string;
  role: string;
  description: string;
  online: boolean;
  icon: React.ElementType;
  color: string;
  gradient: string;
  stats: { value: number; label: string; icon: React.ElementType }[];
  statLabels?: string[];
  recentActivity: { ts: string; text: string }[];
  onlineLabel?: string;
}) {
  return (
    <div className="flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Header / Avatar */}
      <div className={`relative p-6 ${gradient} flex items-start gap-4`}>
        {/* Animated avatar */}
        <div className={`relative shrink-0`}>
          <div className={`w-16 h-16 rounded-2xl ${color} flex items-center justify-center shadow-xl`}>
            <Icon className="w-8 h-8 text-white" />
          </div>
          {/* Pulse ring when online */}
          {online && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white" />
            </span>
          )}
          {!online && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="relative inline-flex rounded-full h-4 w-4 bg-gray-400 border-2 border-white" />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-white drop-shadow-sm">{name}</h3>
          <p className="text-white/70 text-sm font-medium">{role}</p>
          <p className="text-white/50 text-xs mt-1 line-clamp-2">{description}</p>
        </div>

        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
          online ? "bg-emerald-500/30 text-emerald-200 border border-emerald-400/30"
                 : "bg-gray-500/30 text-gray-300 border border-gray-400/30"
        }`}>
          {online ? onlineLabel : "Офлайн"}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {stats.map((s, i) => (
          <div key={i} className="flex flex-col items-center py-3 px-2">
            <s.icon className="w-4 h-4 text-muted-foreground mb-1" />
            <span className="font-bold text-xl">{s.value}</span>
            <span className="text-xs text-muted-foreground text-center leading-tight">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div className="flex-1 p-4 space-y-2 min-h-[140px] max-h-[180px] overflow-y-auto">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Последние действия
        </p>
        {recentActivity.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground/40">
            <p className="text-xs">Нет активности сегодня</p>
          </div>
        ) : (
          recentActivity.slice(0, 5).map((a, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="text-foreground/80 line-clamp-2">{a.text}</span>
                <span className="text-muted-foreground/40 text-[10px]">
                  {new Date(a.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AiOfficePage() {
  const [tab, setTab] = useState<"employees" | "browser">("employees");
  const [stats, setStats] = useState<OfficeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Browser agent state
  const [browserStatus, setBrowserStatus] = useState<BrowserStatus | null>(null);
  const [task, setTask] = useState("");
  const [navUrl, setNavUrl] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [newCred, setNewCred] = useState({ site: "", login: "", password: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [launchLoading, setLaunchLoading] = useState(false);
  const [launched, setLaunched] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const screenshotPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  // ── Stats polling ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/ai-office/stats`, { credentials: "include" });
      if (res.ok) setStats(await res.json());
    } catch {} finally {
      setStatsLoading(false);
    }
  }, []);

  // ── Browser agent polling ──────────────────────────────────────────────────
  const fetchBrowserStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/browser-agent/status`, { credentials: "include" });
      if (res.ok) setBrowserStatus(await res.json());
    } catch {}
  }, []);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/browser-agent/credentials`, { credentials: "include" });
      if (res.ok) setCredentials(await res.json());
    } catch {}
  }, []);

  const refreshScreenshot = useCallback(async () => {
    try {
      const url = `${BASE}/api/browser-agent/screenshot?t=${Date.now()}`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok && res.status !== 204) {
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        setScreenshotUrl(prev => { if (prev) URL.revokeObjectURL(prev); return objUrl; });
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStats();
    fetchBrowserStatus();
    fetchCredentials();
    const statsInterval = setInterval(fetchStats, 30000);
    const browserInterval = setInterval(fetchBrowserStatus, 2500);
    return () => { clearInterval(statsInterval); clearInterval(browserInterval); };
  }, [fetchStats, fetchBrowserStatus, fetchCredentials]);

  useEffect(() => {
    if (launched) {
      screenshotPollRef.current = setInterval(refreshScreenshot, 2000);
      return () => { if (screenshotPollRef.current) clearInterval(screenshotPollRef.current); };
    }
  }, [launched, refreshScreenshot]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [browserStatus?.logs]);

  const isRunning = browserStatus?.status === "running" || browserStatus?.status === "starting";

  // ── Browser actions ────────────────────────────────────────────────────────
  async function handleLaunch() {
    setLaunchLoading(true);
    try {
      const res = await fetch(`${BASE}/api/browser-agent/launch`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLaunched(true);
      setTimeout(refreshScreenshot, 1500);
      toast({ title: "Браузер запущен" });
    } catch (e) {
      toast({ title: "Ошибка запуска", description: String(e), variant: "destructive" });
    } finally {
      setLaunchLoading(false);
    }
  }

  async function handleStop() {
    await fetch(`${BASE}/api/browser-agent/stop`, { method: "POST", credentials: "include" });
    setLaunched(false);
    setScreenshotUrl(null);
    toast({ title: "Браузер остановлен" });
  }

  async function handleSendTask() {
    if (!task.trim()) return;
    const res = await fetch(`${BASE}/api/browser-agent/task`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: task.trim() }),
    });
    if (res.ok) toast({ title: "Задача отправлена" });
  }

  async function handleNavigate() {
    let url = navUrl.trim();
    if (!url) return;
    if (!url.startsWith("http")) url = "https://" + url;
    await fetch(`${BASE}/api/browser-agent/navigate`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    setTimeout(refreshScreenshot, 1500);
  }

  async function handleSaveCred() {
    const { site, login, password } = newCred;
    if (!site || !login || !password) return;
    await fetch(`${BASE}/api/browser-agent/credentials`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site, login, password }),
    });
    setNewCred({ site: "", login: "", password: "" });
    fetchCredentials();
    toast({ title: "Аккаунт сохранён" });
  }

  async function handleDeleteCred(site: string) {
    await fetch(`${BASE}/api/browser-agent/credentials/${encodeURIComponent(site)}`, {
      method: "DELETE", credentials: "include",
    });
    fetchCredentials();
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">

        {/* ── Header ── */}
        <div className="border-b border-border px-6 py-4 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-lg">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">ИИ Офис</h1>
              <p className="text-xs text-muted-foreground">Цифровые сотрудники и браузер-агент</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            <button
              onClick={() => setTab("employees")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                tab === "employees"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-4 h-4" />
              Сотрудники
            </button>
            <button
              onClick={() => setTab("browser")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                tab === "browser"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="w-4 h-4" />
              Браузер-агент
              {browserStatus?.status === "running" && (
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
          </div>

          <Button variant="outline" size="sm" className="gap-2" onClick={fetchStats}>
            <RefreshCw className="w-3.5 h-3.5" />
            Обновить
          </Button>
        </div>

        {/* ── Employees tab ── */}
        {tab === "employees" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Office banner */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-violet-900 via-indigo-900 to-blue-900 p-6 flex items-center gap-6">
              <div className="space-y-1">
                <p className="text-white/60 text-sm font-medium uppercase tracking-widest">Честный Мастер</p>
                <h2 className="text-white font-bold text-2xl">Цифровой офис</h2>
                <p className="text-white/50 text-sm max-w-md">
                  ИИ-сотрудники работают 24/7 — принимают заявки, рассылают заказы, управляют браузером
                </p>
              </div>
              <div className="ml-auto flex gap-3">
                {[
                  { label: "Ботов онлайн", value: [stats?.manager.online, stats?.dispatcher.online].filter(Boolean).length + "/2" },
                  { label: "Заявок сегодня", value: stats?.manager.todayStats.leads ?? "—" },
                  { label: "Рассылок сегодня", value: stats?.dispatcher.todayStats.sent ?? "—" },
                ].map((s, i) => (
                  <div key={i} className="text-center bg-white/10 rounded-xl px-4 py-3 backdrop-blur-sm">
                    <div className="font-bold text-white text-xl">{s.value}</div>
                    <div className="text-white/50 text-xs mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Employee cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Manager Bot */}
              <EmployeeCard
                name="Менеджер-бот"
                role="AI Менеджер · Max messenger"
                description="Принимает заявки голосом и текстом, строит отчёты, консультирует владельца, управляет заказами"
                online={stats?.manager.online ?? false}
                icon={Bot}
                color="bg-gradient-to-br from-violet-500 to-purple-700"
                gradient="bg-gradient-to-br from-violet-950/60 to-purple-950/40"
                stats={[
                  { value: stats?.manager.todayStats.messages ?? 0, label: "сообщений", icon: MessageSquare },
                  { value: stats?.manager.todayStats.sessions ?? 0, label: "сессий", icon: Users },
                  { value: stats?.manager.todayStats.leads ?? 0, label: "заявок", icon: ClipboardList },
                ]}
                recentActivity={stats?.manager.recentActivity ?? []}
              />

              {/* Dispatcher Bot */}
              <EmployeeCard
                name="Диспетчер-бот"
                role="AI Диспетчер · Max messenger"
                description="Рассылает заказы мастерам, ведёт переговоры, отслеживает SLA, назначает подходящих исполнителей"
                online={stats?.dispatcher.online ?? false}
                icon={Radio}
                color="bg-gradient-to-br from-blue-500 to-cyan-600"
                gradient="bg-gradient-to-br from-blue-950/60 to-cyan-950/40"
                stats={[
                  { value: stats?.dispatcher.todayStats.sent ?? 0, label: "рассылок", icon: Zap },
                  { value: stats?.dispatcher.todayStats.responded ?? 0, label: "откликов", icon: MessageSquare },
                  { value: stats?.dispatcher.todayStats.assigned ?? 0, label: "назначений", icon: TrendingUp },
                ]}
                recentActivity={stats?.dispatcher.recentActivity ?? []}
              />
            </div>

            {/* Browser agent status card (compact) */}
            <div
              className="border border-border rounded-2xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setTab("browser")}
            >
              <div className="bg-gradient-to-r from-gray-900 to-slate-900 p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shrink-0">
                  <Monitor className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-white">Браузер-агент</h3>
                  <p className="text-white/50 text-sm">RPA + ИИ — ходит по сайтам как живой человек</p>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                  browserStatus?.status === "running"
                    ? "bg-blue-500/20 text-blue-300 border border-blue-400/30"
                    : browserStatus?.status === "idle" && launched
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-400/20"
                }`}>
                  {browserStatus?.status === "running" ? "🔄 Работает" :
                   launched ? "✅ Готов" : "⏸ Остановлен"}
                </div>
                <ChevronRight className="w-5 h-5 text-white/30" />
              </div>
              {(stats?.browser.recentLogs?.length ?? 0) > 0 && (
                <div className="px-5 py-3 border-t border-white/5 space-y-1">
                  {stats!.browser.recentLogs.slice(0, 2).map((l, i) => (
                    <div key={i} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-muted-foreground/40 shrink-0">
                        {new Date(l.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="line-clamp-1">{l.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Browser Agent tab ── */}
        {tab === "browser" && (
          <div className="flex-1 overflow-hidden flex">

            {/* Left: screenshot */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
              {/* URL bar */}
              {launched && (
                <div className="px-4 py-3 border-b border-border flex gap-2 shrink-0 bg-muted/30">
                  <Globe className="w-4 h-4 text-muted-foreground mt-2.5 shrink-0" />
                  <Input
                    placeholder="Введите URL и нажмите Enter..."
                    value={navUrl}
                    onChange={e => setNavUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleNavigate()}
                    className="font-mono text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={handleNavigate}>
                    <Link2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleStop} className="gap-1.5 shrink-0">
                    <Square className="w-3.5 h-3.5" /> Стоп
                  </Button>
                </div>
              )}

              {/* Screenshot */}
              <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-950 relative">
                {!launched ? (
                  <div className="text-center space-y-5">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 flex items-center justify-center mx-auto border border-emerald-500/20">
                      <Monitor className="w-12 h-12 text-emerald-400/60" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-white/70 text-lg">Браузер не запущен</p>
                      <p className="text-white/30 text-sm mt-1">Нажмите кнопку чтобы запустить Chromium</p>
                    </div>
                    <Button onClick={handleLaunch} disabled={launchLoading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                      {launchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Запустить браузер
                    </Button>
                  </div>
                ) : screenshotUrl ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={screenshotUrl}
                      alt="Браузер"
                      className="max-w-full max-h-full object-contain"
                    />
                    {isRunning && (
                      <div className="absolute top-3 right-3 bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Агент работает...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-white/40 space-y-2">
                    <Loader2 className="w-8 h-8 mx-auto animate-spin opacity-40" />
                    <p className="text-sm">Загрузка скриншота...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: task + logs + credentials */}
            <div className="w-96 flex flex-col overflow-hidden bg-background">
              {/* Task input */}
              <div className="p-4 border-b border-border space-y-3 shrink-0">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Задача для агента
                </Label>
                <Textarea
                  placeholder="Зайди на авито, авторизуйся и проверь сообщения..."
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  className="resize-none text-sm min-h-[80px]"
                  disabled={isRunning}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleSendTask}
                    disabled={!task.trim() || !launched || isRunning}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isRunning ? "Выполняет..." : "Выполнить"}
                  </Button>
                  {isRunning && (
                    <Button variant="destructive" size="icon"
                      onClick={() => fetch(`${BASE}/api/browser-agent/abort`, { method: "POST", credentials: "include" })}>
                      <Square className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {!launched && (
                    <Button onClick={handleLaunch} disabled={launchLoading} size="icon" variant="outline">
                      {launchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </Button>
                  )}
                </div>

                {/* Quick tasks */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Быстрые задачи:</p>
                  {QUICK_TASKS.map((qt, i) => (
                    <button
                      key={i}
                      onClick={() => setTask(qt)}
                      className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg bg-muted/60 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground line-clamp-1"
                    >
                      {qt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logs */}
              <div className="flex-1 overflow-y-auto p-4 space-y-1 min-h-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Лог действий</p>
                {!browserStatus?.logs?.length ? (
                  <div className="text-center py-8 text-muted-foreground/50">
                    <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Лог появится когда агент начнёт работу</p>
                  </div>
                ) : (
                  browserStatus.logs.map(log => (
                    <div key={log.id} className={`flex gap-2 text-xs py-1.5 px-2.5 rounded-lg ${
                      log.type === "error"  ? "bg-red-50 dark:bg-red-950/20" :
                      log.type === "result" ? "bg-emerald-50 dark:bg-emerald-950/20" :
                      log.type === "thought"? "bg-blue-50/60 dark:bg-blue-950/20" : "bg-muted/30"
                    }`}>
                      {LOG_ICON[log.type]}
                      <div className="flex-1 min-w-0">
                        <span className="break-words leading-relaxed">{log.text}</span>
                        <span className="block text-muted-foreground/40 text-[10px] mt-0.5">
                          {new Date(log.ts).toLocaleTimeString("ru-RU")}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>

              {/* Credentials */}
              <div className="border-t border-border p-4 space-y-3 shrink-0 bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> Сохранённые аккаунты
                  </p>
                  <Button variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => setShowPasswords(!showPasswords)}>
                    {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                {credentials.length > 0 && (
                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {credentials.map(c => (
                      <div key={c.site} className="flex items-center gap-2 text-xs bg-background rounded-lg px-2.5 py-1.5">
                        <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate flex-1">{c.site}</span>
                        <span className="text-muted-foreground truncate">{c.login}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                          onClick={() => handleDeleteCred(c.site)}>
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <Input placeholder="Сайт (avito.ru)" value={newCred.site}
                    onChange={e => setNewCred(p => ({ ...p, site: e.target.value }))} className="text-xs h-7" />
                  <Input placeholder="Логин / email" value={newCred.login}
                    onChange={e => setNewCred(p => ({ ...p, login: e.target.value }))} className="text-xs h-7" />
                  <Input placeholder="Пароль" type={showPasswords ? "text" : "password"} value={newCred.password}
                    onChange={e => setNewCred(p => ({ ...p, password: e.target.value }))} className="text-xs h-7 col-span-2" />
                  <Button size="sm" variant="outline" className="col-span-2 h-7 gap-1.5 text-xs"
                    onClick={handleSaveCred} disabled={!newCred.site || !newCred.login || !newCred.password}>
                    <Plus className="w-3 h-3" /> Сохранить аккаунт
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
