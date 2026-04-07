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
  BookOpen, Pencil, X, ChevronDown, ChevronUp, Rocket,
  BarChart2, Train, ScrollText,
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
  status: "idle" | "starting" | "running" | "done" | "error" | "stopped" | "waiting_input";
  task: string;
  hasScreenshot: boolean;
  logs: AgentLog[];
  pendingInputPrompt: string | null;
}

interface Credential {
  site: string;
  login: string;
  last_login_at: string | null;
}

interface Scenario {
  id: number;
  name: string;
  description: string;
  task_template: string;
  icon: string;
  color: string;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
}

// ─── Autonomous Types ──────────────────────────────────────────────────────

interface AutoSession {
  id: number;
  goal: string;
  status: "planning" | "running" | "done" | "error" | "cancelled";
  currentStep: number;
  startedAt: string;
  completedAt: string | null;
  finalReport: string | null;
}

interface AutoStepResult {
  index: number;
  title: string;
  description: string;
  task: string;
  status: "pending" | "running" | "done" | "error";
  report: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

interface AutoSessionDetail extends AutoSession {
  plan: { index: number; title: string; description: string }[];
  steps: AutoStepResult[];
}

// ─── Memory Types ──────────────────────────────────────────────────────────

interface MemEntry {
  id: number;
  agent: string;
  category: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  sessionId: number | null;
  importance: number;
  createdAt: string;
  expiresAt: string | null;
}

interface MemCategoryInfo { key: string; label: string; emoji: string }

const IMP_LABEL: Record<number, string> = { 5: "Критично", 4: "Важно", 3: "Средне", 2: "Низкое", 1: "Минимально" };
const IMP_COLOR: Record<number, string> = {
  5: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  4: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  3: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  2: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  1: "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500",
};

const STATUS_COLOR: Record<string, string> = {
  planning: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 dark:text-yellow-400",
  running:  "text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400",
  done:     "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400",
  error:    "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400",
  cancelled:"text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400",
};
const STATUS_LABEL: Record<string, string> = {
  planning: "Планирование", running: "Выполняется",
  done: "Готово", error: "Ошибка", cancelled: "Отменено",
};

const SCENARIO_ICON_MAP: Record<string, React.ReactNode> = {
  message:  <MessageSquare className="w-5 h-5" />,
  users:    <Users className="w-5 h-5" />,
  chart:    <BarChart2 className="w-5 h-5" />,
  plus:     <Plus className="w-5 h-5" />,
  eye:      <Eye className="w-5 h-5" />,
  train:    <Train className="w-5 h-5" />,
  globe:    <Globe className="w-5 h-5" />,
  bot:      <Bot className="w-5 h-5" />,
  rocket:   <Rocket className="w-5 h-5" />,
  zap:      <Zap className="w-5 h-5" />,
  book:     <BookOpen className="w-5 h-5" />,
  scroll:   <ScrollText className="w-5 h-5" />,
};

const SCENARIO_COLOR_MAP: Record<string, string> = {
  blue:   "from-blue-500 to-blue-700",
  orange: "from-orange-500 to-orange-700",
  green:  "from-emerald-500 to-emerald-700",
  purple: "from-purple-500 to-purple-700",
  teal:   "from-teal-500 to-teal-600",
  red:    "from-red-500 to-red-700",
  violet: "from-violet-500 to-violet-700",
  yellow: "from-yellow-500 to-yellow-600",
};

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
  const [tab, setTab] = useState<"employees" | "browser" | "scenarios" | "autonomous" | "memory">("employees");
  const [stats, setStats] = useState<OfficeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Memory state
  const [memEntries, setMemEntries] = useState<MemEntry[]>([]);
  const [memTotal, setMemTotal] = useState(0);
  const [memCategories, setMemCategories] = useState<MemCategoryInfo[]>([]);
  const [memCatCounts, setMemCatCounts] = useState<Record<string, number>>({});
  const [memFilter, setMemFilter] = useState<string>("all");
  const [memLoading, setMemLoading] = useState(false);
  const [memSearch, setMemSearch] = useState("");
  const [addingMem, setAddingMem] = useState(false);
  const [newMem, setNewMem] = useState({ category: "general", title: "", content: "", importance: 3 });

  // Autonomous agent state
  const [autoGoal, setAutoGoal] = useState("");
  const [autoSessions, setAutoSessions] = useState<AutoSession[]>([]);
  const [activeSession, setActiveSession] = useState<AutoSessionDetail | null>(null);
  const [autoStarting, setAutoStarting] = useState(false);
  const autoPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scenarios state
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Partial<Scenario> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedScenario, setExpandedScenario] = useState<number | null>(null);
  const [runningScenario, setRunningScenario] = useState<number | null>(null);

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
  const [userInputValue, setUserInputValue] = useState("");
  const [userInputLoading, setUserInputLoading] = useState(false);
  const [agentMemory, setAgentMemory] = useState<{ key: string; value: string; context: string | null; updatedAt: string }[]>([]);
  const [memoryAddKey, setMemoryAddKey] = useState("");
  const [memoryAddValue, setMemoryAddValue] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
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

  const fetchBrowserMemory = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/browser-agent/memory`, { credentials: "include" });
      if (res.ok) setAgentMemory(await res.json());
    } catch {}
  }, []);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/browser-agent/credentials`, { credentials: "include" });
      if (res.ok) setCredentials(await res.json());
    } catch {}
  }, []);

  const fetchScenarios = useCallback(async () => {
    setScenariosLoading(true);
    try {
      const res = await fetch(`${BASE}/api/browser-agent/scenarios`, { credentials: "include" });
      if (res.ok) setScenarios(await res.json());
    } catch {} finally { setScenariosLoading(false); }
  }, []);

  async function handleRunScenario(id: number) {
    setRunningScenario(id);
    try {
      const res = await fetch(`${BASE}/api/browser-agent/scenarios/${id}/run`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Сценарий запущен", description: "Переключитесь на вкладку «Браузер-агент» для наблюдения" });
      fetchScenarios();
      setTab("browser");
      if (!launched) { setLaunched(true); setTimeout(refreshScreenshot, 1500); }
    } catch (e) {
      toast({ title: "Ошибка запуска", description: String(e), variant: "destructive" });
    } finally { setRunningScenario(null); }
  }

  async function handleSaveScenario() {
    if (!editingScenario?.name || !editingScenario?.task_template) return;
    const body = {
      name: editingScenario.name,
      description: editingScenario.description ?? "",
      task_template: editingScenario.task_template,
      icon: editingScenario.icon ?? "globe",
      color: editingScenario.color ?? "blue",
    };
    if (isCreating) {
      await fetch(`${BASE}/api/browser-agent/scenarios`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast({ title: "Сценарий создан" });
    } else if (editingScenario.id) {
      await fetch(`${BASE}/api/browser-agent/scenarios/${editingScenario.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast({ title: "Сценарий сохранён" });
    }
    setEditingScenario(null);
    setIsCreating(false);
    fetchScenarios();
  }

  async function handleDeleteScenario(id: number) {
    await fetch(`${BASE}/api/browser-agent/scenarios/${id}`, {
      method: "DELETE", credentials: "include",
    });
    fetchScenarios();
    toast({ title: "Сценарий удалён" });
  }

  // ── Memory ─────────────────────────────────────────────────────────────────

  const fetchMemory = useCallback(async (category?: string) => {
    setMemLoading(true);
    try {
      const [dataRes, catRes] = await Promise.all([
        fetch(`${BASE}/api/agent-memory${category && category !== "all" ? `?category=${category}` : ""}`, { credentials: "include" }),
        fetch(`${BASE}/api/agent-memory/categories`, { credentials: "include" }),
      ]);
      if (dataRes.ok) {
        const d = await dataRes.json();
        setMemEntries(d.entries ?? []);
        setMemTotal(d.total ?? 0);
        setMemCategories(d.categories ?? []);
      }
      if (catRes.ok) {
        const d = await catRes.json();
        const counts: Record<string, number> = {};
        ((d.counts ?? []) as any[]).forEach((r: any) => { counts[r.category] = Number(r.count); });
        setMemCatCounts(counts);
        if (!memCategories.length) setMemCategories(d.categories ?? []);
      }
    } catch {} finally { setMemLoading(false); }
  }, [memCategories.length]);

  async function handleAddMemory() {
    if (!newMem.title || !newMem.content) return;
    await fetch(`${BASE}/api/agent-memory`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMem),
    });
    setNewMem({ category: "general", title: "", content: "", importance: 3 });
    setAddingMem(false);
    fetchMemory(memFilter === "all" ? undefined : memFilter);
    toast({ title: "Запись добавлена" });
  }

  async function handleDeleteMem(id: number) {
    await fetch(`${BASE}/api/agent-memory/${id}`, { method: "DELETE", credentials: "include" });
    setMemEntries(p => p.filter(e => e.id !== id));
    setMemTotal(p => p - 1);
    toast({ title: "Запись удалена" });
  }

  async function handleClearCategory(category?: string) {
    const url = category ? `${BASE}/api/agent-memory?category=${category}` : `${BASE}/api/agent-memory`;
    await fetch(url, { method: "DELETE", credentials: "include" });
    fetchMemory();
    toast({ title: category ? `Категория «${category}» очищена` : "Память очищена" });
  }

  useEffect(() => {
    if (tab === "memory") fetchMemory(memFilter === "all" ? undefined : memFilter);
  }, [tab, memFilter, fetchMemory]);

  // ── Autonomous agent ────────────────────────────────────────────────────────

  const fetchAutoSessions = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/autonomous`, { credentials: "include" });
      if (res.ok) setAutoSessions(await res.json());
    } catch {}
  }, []);

  const pollActiveSession = useCallback(async (id: number) => {
    try {
      const res = await fetch(`${BASE}/api/autonomous/${id}`, { credentials: "include" });
      if (res.ok) {
        const data: AutoSessionDetail = await res.json();
        setActiveSession(data);
        if (data.status === "done" || data.status === "error" || data.status === "cancelled") {
          if (autoPollingRef.current) { clearInterval(autoPollingRef.current); autoPollingRef.current = null; }
          fetchAutoSessions();
        }
      }
    } catch {}
  }, [fetchAutoSessions]);

  async function handleStartAutonomous() {
    if (!autoGoal.trim()) return;
    setAutoStarting(true);
    try {
      const res = await fetch(`${BASE}/api/autonomous`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: autoGoal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Агент запущен", description: "Планирую шаги..." });
      setAutoGoal("");
      fetchAutoSessions();
      // Start polling this session
      if (autoPollingRef.current) clearInterval(autoPollingRef.current);
      autoPollingRef.current = setInterval(() => pollActiveSession(data.sessionId), 3000);
      pollActiveSession(data.sessionId);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setAutoStarting(false);
    }
  }

  async function handleOpenSession(id: number) {
    const res = await fetch(`${BASE}/api/autonomous/${id}`, { credentials: "include" });
    if (res.ok) {
      const data: AutoSessionDetail = await res.json();
      setActiveSession(data);
      // Poll if still running
      if (data.status === "running" || data.status === "planning") {
        if (autoPollingRef.current) clearInterval(autoPollingRef.current);
        autoPollingRef.current = setInterval(() => pollActiveSession(id), 3000);
      }
    }
  }

  async function handleCancelSession(id: number) {
    await fetch(`${BASE}/api/autonomous/${id}/cancel`, { method: "POST", credentials: "include" });
    if (autoPollingRef.current) { clearInterval(autoPollingRef.current); autoPollingRef.current = null; }
    pollActiveSession(id);
    toast({ title: "Задание отменено" });
  }

  useEffect(() => {
    if (tab === "autonomous") fetchAutoSessions();
    return () => { if (autoPollingRef.current) clearInterval(autoPollingRef.current); };
  }, [tab, fetchAutoSessions]);

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
    fetchScenarios();
    fetchBrowserMemory();
    const statsInterval = setInterval(fetchStats, 30000);
    const browserInterval = setInterval(fetchBrowserStatus, 2500);
    const memoryInterval = setInterval(fetchBrowserMemory, 15000);
    return () => { clearInterval(statsInterval); clearInterval(browserInterval); clearInterval(memoryInterval); };
  }, [fetchStats, fetchBrowserStatus, fetchCredentials, fetchScenarios, fetchBrowserMemory]);

  useEffect(() => {
    if (launched) {
      screenshotPollRef.current = setInterval(refreshScreenshot, 2000);
    }
    return () => { if (screenshotPollRef.current) clearInterval(screenshotPollRef.current); };
  }, [launched, refreshScreenshot]);

  useEffect(() => {
    const isActive = browserStatus?.status === "running" || browserStatus?.status === "starting";
    if (isActive && logsContainerRef.current) {
      const el = logsContainerRef.current;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [browserStatus?.logs, browserStatus?.status]);

  const isRunning = browserStatus?.status === "running" || browserStatus?.status === "starting";
  const isAgentActive = isRunning || browserStatus?.status === "waiting_input";

  async function handleAbortTask() {
    await fetch(`${BASE}/api/browser-agent/abort`, { method: "POST", credentials: "include" });
    // If waiting for input, unblock it
    if (browserStatus?.status === "waiting_input") {
      await fetch(`${BASE}/api/browser-agent/input`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "__aborted__" }),
      });
    }
  }

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

  async function handleAgentMessage() {
    const msg = userInputValue.trim();
    if (!msg) return;
    setUserInputLoading(true);
    try {
      const status = browserStatus?.status;
      if (status === "waiting_input") {
        // Agent is paused waiting for a code/data — send directly
        const res = await fetch(`${BASE}/api/browser-agent/input`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: msg }),
        });
        if (res.ok) {
          setUserInputValue("");
          toast({ title: "Отправлено агенту" });
        } else {
          toast({ title: "Ошибка", description: "Агент не ожидает ввода", variant: "destructive" });
        }
      } else if (status === "running" || status === "starting") {
        // Agent is busy — queue the value, it will be used on next request_input call
        const res = await fetch(`${BASE}/api/browser-agent/input`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: msg }),
        });
        if (res.ok) {
          setUserInputValue("");
          toast({ title: "Сохранено в очередь", description: "Агент подставит значение когда дойдёт до ввода" });
        } else {
          toast({ title: "Ошибка отправки", variant: "destructive" });
        }
      } else {
        // Agent is idle/done — treat as a new task
        const res = await fetch(`${BASE}/api/browser-agent/task`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: msg }),
        });
        if (res.ok) {
          setUserInputValue("");
          if (!launched) { setLaunched(true); setTimeout(refreshScreenshot, 1500); }
          toast({ title: "Задача отправлена" });
        } else {
          toast({ title: "Ошибка", description: "Не удалось отправить задачу", variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "Ошибка отправки", variant: "destructive" });
    } finally {
      setUserInputLoading(false);
    }
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
            <button
              onClick={() => setTab("scenarios")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                tab === "scenarios"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Сценарии
              {scenarios.length > 0 && (
                <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full px-1.5 py-0.5 font-semibold">
                  {scenarios.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("autonomous")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                tab === "autonomous"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Rocket className="w-4 h-4" />
              Авто-агент
              {autoSessions.some(s => s.status === "running" || s.status === "planning") && (
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setTab("memory")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                tab === "memory"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Память
              {memTotal > 0 && (
                <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full px-1.5 py-0.5 font-semibold">
                  {memTotal}
                </span>
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

        {/* ── Memory tab ── */}
        {tab === "memory" && (
          <div className="flex-1 overflow-hidden flex">

            {/* Left: category filter */}
            <div className="w-56 flex flex-col border-r border-border overflow-hidden shrink-0 bg-muted/20">
              <div className="px-3 py-3 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Категории</p>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                <button
                  onClick={() => setMemFilter("all")}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-muted/60 transition-colors ${memFilter === "all" ? "bg-muted font-medium" : ""}`}
                >
                  <span className="flex items-center gap-2">📋 Все записи</span>
                  <span className="text-xs text-muted-foreground">{memTotal}</span>
                </button>
                {memCategories.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setMemFilter(cat.key)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-muted/60 transition-colors ${memFilter === cat.key ? "bg-muted font-medium" : ""}`}
                  >
                    <span className="flex items-center gap-2">{cat.emoji} {cat.label}</span>
                    {memCatCounts[cat.key] > 0 && (
                      <span className="text-xs text-muted-foreground">{memCatCounts[cat.key]}</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="p-3 border-t border-border space-y-1.5">
                <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs h-7"
                  onClick={() => setAddingMem(true)}>
                  <Plus className="w-3 h-3" /> Добавить вручную
                </Button>
                <Button size="sm" variant="outline"
                  className="w-full gap-1.5 text-xs h-7 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300"
                  onClick={() => handleClearCategory(memFilter === "all" ? undefined : memFilter)}>
                  <Trash2 className="w-3 h-3" />
                  {memFilter === "all" ? "Очистить всё" : "Очистить категорию"}
                </Button>
              </div>
            </div>

            {/* Right: entries */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3 shrink-0">
                <div className="flex-1 relative">
                  <Input
                    placeholder="Поиск по памяти..."
                    value={memSearch}
                    onChange={e => setMemSearch(e.target.value)}
                    className="text-sm h-8 pl-8"
                  />
                  <Globe className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2" />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchMemory(memFilter === "all" ? undefined : memFilter)}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Add memory form */}
              {addingMem && (
                <div className="mx-4 my-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10 space-y-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Новая запись в памяти</p>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddingMem(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs mb-1 block">Категория</Label>
                      <select
                        value={newMem.category}
                        onChange={e => setNewMem(p => ({ ...p, category: e.target.value }))}
                        className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                      >
                        {memCategories.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Важность (1-5)</Label>
                      <Input type="number" min={1} max={5} value={newMem.importance}
                        onChange={e => setNewMem(p => ({ ...p, importance: Number(e.target.value) }))}
                        className="h-8 text-xs" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Заголовок *</Label>
                    <Input placeholder="Цена конкурента на шпаклёвку" value={newMem.title}
                      onChange={e => setNewMem(p => ({ ...p, title: e.target.value }))} className="text-sm h-8" />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Содержание *</Label>
                    <Textarea placeholder="Компания «СтройПро» берёт 350 руб/м² за шпаклёвку..."
                      value={newMem.content} onChange={e => setNewMem(p => ({ ...p, content: e.target.value }))}
                      className="text-sm resize-none min-h-[60px]" />
                  </div>
                  <Button size="sm" className="gap-1.5" onClick={handleAddMemory}
                    disabled={!newMem.title || !newMem.content}>
                    <Plus className="w-3 h-3" /> Сохранить
                  </Button>
                </div>
              )}

              {/* Entries */}
              <div className="flex-1 overflow-y-auto p-4">
                {memLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
                  </div>
                ) : memEntries.length === 0 ? (
                  <div className="text-center py-20 space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                      <BookOpen className="w-7 h-7 text-muted-foreground/30" />
                    </div>
                    <p className="text-muted-foreground text-sm">Памяти пока нет</p>
                    <p className="text-xs text-muted-foreground/60">
                      Агенты будут накапливать знания после каждого выполненного задания
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {memEntries
                      .filter(e => !memSearch || e.title.toLowerCase().includes(memSearch.toLowerCase()) || e.content.toLowerCase().includes(memSearch.toLowerCase()))
                      .map(e => {
                        const catInfo = memCategories.find(c => c.key === e.category);
                        return (
                          <div key={e.id} className="group rounded-xl border border-border bg-card hover:shadow-sm transition-shadow p-3.5">
                            <div className="flex items-start gap-3">
                              <div className="text-lg shrink-0 mt-0.5">{catInfo?.emoji ?? "📝"}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-medium text-sm">{e.title}</p>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${IMP_COLOR[e.importance] ?? IMP_COLOR[3]}`}>
                                      {IMP_LABEL[e.importance] ?? "Средне"}
                                    </span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => handleDeleteMem(e.id)}>
                                      <Trash2 className="w-3 h-3 text-red-400" />
                                    </Button>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{e.content}</p>
                                <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground/50">
                                  {catInfo && <span className="bg-muted/60 px-1.5 py-0.5 rounded">{catInfo.label}</span>}
                                  {e.sourceUrl && <span className="truncate max-w-[150px]">🔗 {e.sourceUrl}</span>}
                                  <span>{new Date(e.createdAt).toLocaleDateString("ru-RU")}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Scenarios tab ── */}
        {tab === "scenarios" && (
          <div className="flex-1 overflow-y-auto p-6">

            {/* Header row */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-lg">Библиотека сценариев</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Сохранённые задачи — запускаются одной кнопкой без текста
                </p>
              </div>
              <Button
                className="gap-2 bg-violet-600 hover:bg-violet-700"
                onClick={() => { setIsCreating(true); setEditingScenario({ name: "", description: "", task_template: "", icon: "globe", color: "blue" }); }}
              >
                <Plus className="w-4 h-4" />
                Новый сценарий
              </Button>
            </div>

            {/* Create / Edit form */}
            {editingScenario && (
              <div className="mb-6 rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{isCreating ? "Создать сценарий" : "Редактировать сценарий"}</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingScenario(null); setIsCreating(false); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Название *</Label>
                    <Input
                      placeholder="Проверить сообщения на Авито"
                      value={editingScenario.name ?? ""}
                      onChange={e => setEditingScenario(p => ({ ...p, name: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Короткое описание</Label>
                    <Input
                      placeholder="Что делает сценарий"
                      value={editingScenario.description ?? ""}
                      onChange={e => setEditingScenario(p => ({ ...p, description: e.target.value }))}
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Задача для агента * <span className="text-muted-foreground">(полное описание что нужно сделать)</span></Label>
                  <Textarea
                    placeholder="Зайди на avito.ru, авторизуйся используя сохранённые учётные данные, открой раздел Сообщения..."
                    value={editingScenario.task_template ?? ""}
                    onChange={e => setEditingScenario(p => ({ ...p, task_template: e.target.value }))}
                    className="text-sm resize-none min-h-[100px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Иконка</Label>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(SCENARIO_ICON_MAP).map(k => (
                        <button
                          key={k}
                          onClick={() => setEditingScenario(p => ({ ...p, icon: k }))}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                            editingScenario.icon === k
                              ? "border-violet-500 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                              : "border-border bg-muted/50 text-muted-foreground hover:border-violet-300"
                          }`}
                        >
                          <span className="scale-75">{SCENARIO_ICON_MAP[k]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Цвет</Label>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(SCENARIO_COLOR_MAP).map(c => (
                        <button
                          key={c}
                          onClick={() => setEditingScenario(p => ({ ...p, color: c }))}
                          className={`w-7 h-7 rounded-full bg-gradient-to-br ${SCENARIO_COLOR_MAP[c]} border-2 transition-all ${
                            editingScenario.color === c ? "border-foreground scale-110" : "border-transparent"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    className="gap-2"
                    onClick={handleSaveScenario}
                    disabled={!editingScenario.name || !editingScenario.task_template}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isCreating ? "Создать" : "Сохранить"}
                  </Button>
                  <Button variant="outline" onClick={() => { setEditingScenario(null); setIsCreating(false); }}>
                    Отмена
                  </Button>
                </div>
              </div>
            )}

            {/* Scenarios grid */}
            {scenariosLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/40" />
              </div>
            ) : scenarios.length === 0 ? (
              <div className="text-center py-20 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                  <BookOpen className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <p className="text-muted-foreground font-medium">Сценариев пока нет</p>
                <p className="text-sm text-muted-foreground/60">Создайте первый шаблон задачи</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {scenarios.map(s => (
                  <div key={s.id} className="rounded-2xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow">
                    {/* Card header */}
                    <div className={`bg-gradient-to-br ${SCENARIO_COLOR_MAP[s.color] ?? SCENARIO_COLOR_MAP.blue} p-4 flex items-start justify-between`}>
                      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white">
                        {SCENARIO_ICON_MAP[s.icon] ?? SCENARIO_ICON_MAP.globe}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setIsCreating(false); setEditingScenario({ ...s }); }}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteScenario(s.id)}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-red-400/40 flex items-center justify-center text-white transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-4 space-y-3">
                      <div>
                        <h3 className="font-semibold text-sm">{s.name}</h3>
                        {s.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Rocket className="w-3 h-3" /> {s.run_count} запусков
                        </span>
                        {s.last_run_at && (
                          <span>
                            · {new Date(s.last_run_at).toLocaleDateString("ru-RU")}
                          </span>
                        )}
                      </div>

                      {/* Task preview toggle */}
                      <button
                        onClick={() => setExpandedScenario(expandedScenario === s.id ? null : s.id)}
                        className="w-full text-left flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {expandedScenario === s.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {expandedScenario === s.id ? "Скрыть задачу" : "Показать задачу"}
                      </button>
                      {expandedScenario === s.id && (
                        <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5 leading-relaxed border border-border">
                          {s.task_template}
                        </div>
                      )}

                      {/* Run button */}
                      <Button
                        className={`w-full gap-2 bg-gradient-to-r ${SCENARIO_COLOR_MAP[s.color] ?? SCENARIO_COLOR_MAP.blue} hover:opacity-90 text-white border-0`}
                        onClick={() => handleRunScenario(s.id)}
                        disabled={runningScenario === s.id}
                      >
                        {runningScenario === s.id
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Запуск...</>
                          : <><Play className="w-3.5 h-3.5" /> Запустить</>
                        }
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Autonomous Agent tab ── */}
        {tab === "autonomous" && (
          <div className="flex-1 overflow-hidden flex">

            {/* Left: session list + goal input */}
            <div className="w-80 flex flex-col border-r border-border overflow-hidden shrink-0">
              {/* New goal */}
              <div className="p-4 border-b border-border space-y-3 shrink-0 bg-gradient-to-b from-violet-50/50 dark:from-violet-950/10 to-transparent">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                    <Rocket className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Автономный агент</p>
                    <p className="text-xs text-muted-foreground">GPT-4o планирует + браузер выполняет</p>
                  </div>
                </div>
                <Textarea
                  placeholder="Создай лендинг для услуги укладки плитки. Изучи конкурентов, напиши продающий текст..."
                  value={autoGoal}
                  onChange={e => setAutoGoal(e.target.value)}
                  className="resize-none text-sm min-h-[90px]"
                  disabled={autoStarting}
                />
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white"
                  onClick={handleStartAutonomous}
                  disabled={!autoGoal.trim() || autoStarting}
                >
                  {autoStarting
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Планирование...</>
                    : <><Rocket className="w-3.5 h-3.5" /> Запустить задание</>
                  }
                </Button>

                {/* Quick goals */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Примеры заданий:</p>
                  {[
                    "Изучи конкурентов по ремонту квартир в Краснодаре: найди их цены, УТП и контакты",
                    "Найди 5 лучших поставщиков плитки оптом, сравни цены и условия доставки",
                    "Проверь отзывы на нас на Авито и Яндекс Услугах, составь отчёт",
                    "Напиши продающий текст объявления на Авито для услуги шпаклёвки",
                  ].map((g, i) => (
                    <button key={i} onClick={() => setAutoGoal(g)}
                      className="w-full text-left text-xs px-2.5 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground leading-snug">
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sessions list */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="px-4 py-2 flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">История заданий</p>
                  <button onClick={fetchAutoSessions} className="text-muted-foreground hover:text-foreground">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                {autoSessions.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground/50">
                    <ScrollText className="w-6 h-6 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Заданий ещё нет</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {autoSessions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleOpenSession(s.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors ${
                          activeSession?.id === s.id ? "bg-muted/60" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium line-clamp-2 flex-1">{s.goal}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[s.status]}`}>
                            {STATUS_LABEL[s.status]}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(s.startedAt).toLocaleString("ru-RU", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: session detail */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {!activeSession ? (
                <div className="flex-1 flex items-center justify-center text-center p-8">
                  <div className="space-y-4 max-w-sm">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/10 to-indigo-600/10 border border-violet-200 dark:border-violet-800 flex items-center justify-center mx-auto">
                      <Rocket className="w-10 h-10 text-violet-400/60" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg">Автономный агент</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Введите высокоуровневую цель — ИИ сам разберётся что нужно сделать и выполнит каждый шаг
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
                      {[
                        { icon: <Zap className="w-4 h-4 text-yellow-500 mx-auto mb-1" />, text: "GPT-4o планирует шаги" },
                        { icon: <Monitor className="w-4 h-4 text-blue-500 mx-auto mb-1" />, text: "Браузер выполняет каждый" },
                        { icon: <ClipboardList className="w-4 h-4 text-emerald-500 mx-auto mb-1" />, text: "Отчёт по каждому шагу" },
                      ].map((f, i) => (
                        <div key={i} className="rounded-xl bg-muted/40 p-3">
                          {f.icon}
                          {f.text}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Session header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[activeSession.status]}`}>
                          {activeSession.status === "running" && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
                          {STATUS_LABEL[activeSession.status]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(activeSession.startedAt).toLocaleString("ru-RU")}
                        </span>
                      </div>
                      <h2 className="font-bold text-base">{activeSession.goal}</h2>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {(activeSession.status === "running" || activeSession.status === "planning") && (
                        <Button variant="destructive" size="sm" className="gap-1.5"
                          onClick={() => handleCancelSession(activeSession.id)}>
                          <Square className="w-3 h-3" /> Отменить
                        </Button>
                      )}
                      {activeSession.finalReport && activeSession.finalReport !== "available" && (
                        <Button variant="outline" size="sm" className="gap-1.5"
                          onClick={() => navigator.clipboard.writeText(activeSession.finalReport ?? "").then(() => toast({ title: "Скопировано" }))}>
                          <ClipboardList className="w-3.5 h-3.5" /> Копировать
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {activeSession.steps.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Прогресс</span>
                        <span>{activeSession.steps.filter(s => s.status === "done").length} / {activeSession.steps.length} шагов</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-1000"
                          style={{ width: `${(activeSession.steps.filter(s => s.status === "done").length / activeSession.steps.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Planning state */}
                  {activeSession.status === "planning" && (
                    <div className="rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20 p-4 flex items-center gap-3">
                      <Loader2 className="w-5 h-5 animate-spin text-yellow-500 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">GPT-4o анализирует задачу...</p>
                        <p className="text-xs text-muted-foreground">Составляет план из шагов</p>
                      </div>
                    </div>
                  )}

                  {/* Steps */}
                  {activeSession.steps.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Шаги выполнения
                      </p>
                      {activeSession.steps.map((step, i) => (
                        <div key={i} className={`rounded-xl border overflow-hidden ${
                          step.status === "running" ? "border-blue-300 dark:border-blue-700" :
                          step.status === "done"    ? "border-emerald-200 dark:border-emerald-800" :
                          step.status === "error"   ? "border-red-200 dark:border-red-800" :
                          "border-border"
                        }`}>
                          {/* Step header */}
                          <div className={`px-4 py-3 flex items-center gap-3 ${
                            step.status === "running" ? "bg-blue-50/60 dark:bg-blue-950/20" :
                            step.status === "done"    ? "bg-emerald-50/40 dark:bg-emerald-950/10" :
                            step.status === "error"   ? "bg-red-50/40 dark:bg-red-950/10" :
                            "bg-muted/20"
                          }`}>
                            {/* Icon */}
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              step.status === "running" ? "bg-blue-500 text-white" :
                              step.status === "done"    ? "bg-emerald-500 text-white" :
                              step.status === "error"   ? "bg-red-500 text-white" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {step.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                               step.status === "done"    ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                               step.status === "error"   ? <XCircle className="w-3.5 h-3.5" /> :
                               i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{step.title}</p>
                              <p className="text-xs text-muted-foreground">{step.description}</p>
                            </div>
                            {step.durationMs && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {Math.round(step.durationMs / 1000)}с
                              </span>
                            )}
                          </div>

                          {/* Step report */}
                          {step.report && (
                            <div className="px-4 py-3 border-t border-border/50 bg-background text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                              {step.report}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Final report */}
                  {activeSession.finalReport && activeSession.finalReport !== "available" && (
                    <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/10 overflow-hidden">
                      <div className="px-4 py-3 border-b border-violet-200 dark:border-violet-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-4 h-4 text-violet-600" />
                          <p className="font-semibold text-sm text-violet-800 dark:text-violet-300">Итоговый отчёт</p>
                        </div>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-violet-700 dark:text-violet-300 h-7"
                          onClick={() => navigator.clipboard.writeText(activeSession.finalReport ?? "").then(() => toast({ title: "Скопировано" }))}>
                          <ClipboardList className="w-3 h-3" /> Копировать
                        </Button>
                      </div>
                      <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
                        {activeSession.finalReport}
                      </div>
                    </div>
                  )}
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

            {/* Right: logs + input */}
            <div className="w-96 flex flex-col overflow-hidden bg-background">

              {/* Agent status bar */}
              <div className={`px-4 py-2.5 flex items-center gap-2 shrink-0 border-b ${
                browserStatus?.status === "waiting_input"
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                  : isRunning
                  ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                  : "bg-muted/30 border-border"
              }`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  browserStatus?.status === "waiting_input" ? "bg-amber-500" :
                  isRunning ? "bg-blue-500 animate-pulse" :
                  browserStatus?.status === "done" ? "bg-emerald-500" :
                  "bg-muted-foreground/30"
                }`} />
                <span className="text-xs font-medium flex-1 truncate">
                  {browserStatus?.status === "waiting_input" ? "Ожидает ввода" :
                   browserStatus?.status === "starting" ? "Запускается..." :
                   browserStatus?.status === "running"
                     ? `Выполняет: ${(browserStatus.task ?? "").slice(0, 35)}${(browserStatus.task ?? "").length > 35 ? "…" : ""}`
                     : browserStatus?.status === "done" ? "Задача выполнена"
                     : "Готов к работе"}
                </span>
                {isAgentActive && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleAbortTask}
                    className="h-7 px-2.5 gap-1.5 text-xs shrink-0"
                  >
                    <Square className="w-3 h-3" />
                    Остановить
                  </Button>
                )}
              </div>

              {/* Memory panel */}
              <div className="shrink-0 border-t border-border">
                <details className="group">
                  <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <span>🧠</span>
                      <span>Память агента</span>
                      {agentMemory.length > 0 && (
                        <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{agentMemory.length}</span>
                      )}
                    </div>
                    <span className="text-muted-foreground text-xs group-open:rotate-180 transition-transform">▾</span>
                  </summary>
                  <div className="px-4 pb-3 space-y-2 max-h-48 overflow-y-auto">
                    {agentMemory.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 py-2 text-center">Агент ещё ничего не запомнил. Он учится в процессе работы.</p>
                    ) : (
                      agentMemory.map(m => (
                        <div key={m.key} className="flex items-start gap-2 group/mem text-xs bg-violet-50/50 dark:bg-violet-950/10 rounded-lg px-2.5 py-2 border border-violet-100 dark:border-violet-900/30">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-violet-700 dark:text-violet-300 block truncate">{m.key}</span>
                            <span className="text-foreground/70 break-words">{m.value}</span>
                            {m.context && <span className="text-muted-foreground/50 text-[10px] block">{m.context}</span>}
                          </div>
                          <button
                            className="shrink-0 opacity-0 group-hover/mem:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                            title="Забыть"
                            onClick={async () => {
                              await fetch(`${BASE}/api/browser-agent/memory/${encodeURIComponent(m.key)}`, { method: "DELETE", credentials: "include" });
                              fetchBrowserMemory();
                            }}
                          >×</button>
                        </div>
                      ))
                    )}
                    {/* Add memory manually */}
                    <div className="flex gap-1.5 pt-1">
                      <input
                        className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background placeholder:text-muted-foreground/50 min-w-0"
                        placeholder="Что запомнить…"
                        value={memoryAddKey}
                        onChange={e => setMemoryAddKey(e.target.value)}
                      />
                      <input
                        className="flex-1 text-xs border border-border rounded px-2 py-1 bg-background placeholder:text-muted-foreground/50 min-w-0"
                        placeholder="Значение"
                        value={memoryAddValue}
                        onChange={e => setMemoryAddValue(e.target.value)}
                        onKeyDown={async e => {
                          if (e.key === "Enter" && memoryAddKey.trim() && memoryAddValue.trim()) {
                            await fetch(`${BASE}/api/browser-agent/memory`, {
                              method: "POST", credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ key: memoryAddKey.trim(), value: memoryAddValue.trim() }),
                            });
                            setMemoryAddKey(""); setMemoryAddValue("");
                            fetchBrowserMemory();
                          }
                        }}
                      />
                      <button
                        className="text-xs px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700 shrink-0"
                        onClick={async () => {
                          if (!memoryAddKey.trim() || !memoryAddValue.trim()) return;
                          await fetch(`${BASE}/api/browser-agent/memory`, {
                            method: "POST", credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ key: memoryAddKey.trim(), value: memoryAddValue.trim() }),
                          });
                          setMemoryAddKey(""); setMemoryAddValue("");
                          fetchBrowserMemory();
                        }}
                      >+</button>
                    </div>
                  </div>
                </details>
              </div>

              {/* Logs */}
              <div ref={logsContainerRef} className="flex-1 overflow-y-auto p-4 space-y-1 min-h-0">
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

              {/* Waiting input banner — just info, input is in the bottom box */}
              {browserStatus?.status === "waiting_input" && browserStatus.pendingInputPrompt && (
                <div className="mx-3 mb-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 flex items-start gap-2 shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                    <span className="font-semibold">Агент ждёт: </span>
                    {browserStatus.pendingInputPrompt}
                  </p>
                </div>
              )}

              {/* Universal agent chat input */}
              <div className="border-t border-border p-3 shrink-0 bg-muted/10">
                <div className="flex items-start gap-2">
                  <Textarea
                    value={userInputValue}
                    onChange={e => setUserInputValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAgentMessage();
                      }
                    }}
                    placeholder={
                      browserStatus?.status === "waiting_input"
                        ? (browserStatus.pendingInputPrompt ?? "Введите код или данные...")
                        : isRunning
                        ? "Напишите агенту — код, данные, уточнение..."
                        : "Напишите задачу для агента..."
                    }
                    rows={2}
                    className="text-sm flex-1 resize-none min-h-0"
                  />
                  <Button
                    size="icon"
                    onClick={handleAgentMessage}
                    disabled={userInputLoading || !userInputValue.trim()}
                    className={`shrink-0 ${browserStatus?.status === "waiting_input" ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                  >
                    {userInputLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 pl-0.5">
                  {browserStatus?.status === "waiting_input"
                    ? "⏸ Агент ждёт ввода — Enter для отправки"
                    : "Enter — отправить · Shift+Enter — новая строка"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
