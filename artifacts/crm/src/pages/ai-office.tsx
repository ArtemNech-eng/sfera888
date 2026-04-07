import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Play, Square, Globe, Send, Trash2, Plus, Eye, EyeOff,
  Brain, Loader2, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, Link2, Lock, MessageSquare, Zap, TrendingUp,
  Users, ClipboardList, Bot, Cpu, Radio, RefreshCw,
  BookOpen, Pencil, X, ChevronDown, ChevronUp, Rocket,
  BarChart2, Train, ScrollText, Calendar, Clock, CheckSquare,
  Info, ShieldAlert,
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

// ─── Scenario Types ────────────────────────────────────────────────────────

interface PredefinedScenario {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  icon: string;
  color: string;
  estimatedMinutes: number;
  category: string;
  requiresConfirmation?: boolean;
}

interface ScenarioPreview {
  criticalCount: number;
  warningCount: number;
  totalTargets: number;
  totalAmount: number;
  cities: string[];
  masters: {
    alias: string;
    city: string;
    risk: string;
    daysSinceContact: number;
    totalAmount: number;
    orderCount: number;
    riskReasons: string[];
  }[];
}

interface ScenarioSchedule {
  enabled: boolean;
  days: number[]; // 0=Вс, 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб
}

type Schedules = Record<string, ScenarioSchedule>;

const DAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  pricing:    { label: "Ценообразование", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  analytics:  { label: "Аналитика",       color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  content:    { label: "Контент",          color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  marketing:  { label: "Маркетинг",       color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  operations: { label: "Операции",        color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

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
  const [tab, setTab] = useState<"employees" | "autonomous" | "memory">("employees");
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
  const [scenarios, setScenarios] = useState<PredefinedScenario[]>([]);
  const [schedules, setSchedules] = useState<Schedules>({});
  // Confirmation modal state
  const [confirmScenario, setConfirmScenario] = useState<PredefinedScenario | null>(null);
  const [confirmPreview, setConfirmPreview] = useState<ScenarioPreview | null>(null);
  const [confirmPreviewLoading, setConfirmPreviewLoading] = useState(false);
  const [skipConfirmMap, setSkipConfirmMap] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("skipConfirmScenarios") ?? "{}"); } catch { return {}; }
  });
  const [runningScenarios, setRunningScenarios] = useState<Set<string>>(new Set());
  const [openSchedule, setOpenSchedule] = useState<string | null>(null);

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

  // ── Memory ─────────────────────────────────────────────────────────────────

  const fetchAgentMemory = useCallback(async (category?: string) => {
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
    fetchAgentMemory(memFilter === "all" ? undefined : memFilter);
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
    fetchAgentMemory();
    toast({ title: category ? `Категория «${category}» очищена` : "Память очищена" });
  }

  useEffect(() => {
    if (tab === "memory") fetchAgentMemory(memFilter === "all" ? undefined : memFilter);
  }, [tab, memFilter, fetchAgentMemory]);

  // ── Scenarios ───────────────────────────────────────────────────────────────

  const fetchScenarios = useCallback(async () => {
    try {
      const [sRes, schRes] = await Promise.all([
        fetch(`${BASE}/api/autonomous/scenarios`, { credentials: "include" }),
        fetch(`${BASE}/api/autonomous/schedules`, { credentials: "include" }),
      ]);
      if (sRes.ok) setScenarios(await sRes.json());
      if (schRes.ok) setSchedules(await schRes.json());
    } catch {}
  }, []);

  async function executeRunScenario(scenarioId: string) {
    setRunningScenarios(prev => new Set([...prev, scenarioId]));
    setConfirmScenario(null);
    setConfirmPreview(null);
    try {
      const res = await fetch(`${BASE}/api/autonomous/scenarios/${scenarioId}/run`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Сценарий запущен", description: "Агент начал работу..." });
      fetchAutoSessions();
      if (autoPollingRef.current) clearInterval(autoPollingRef.current);
      autoPollingRef.current = setInterval(() => pollActiveSession(data.sessionId), 3000);
      pollActiveSession(data.sessionId);
    } catch (e) {
      toast({ title: "Ошибка запуска", description: String(e), variant: "destructive" });
    } finally {
      setRunningScenarios(prev => { const s = new Set(prev); s.delete(scenarioId); return s; });
    }
  }

  async function handleRunScenario(scenario: PredefinedScenario) {
    // Skip confirmation if user checked "don't ask again" or scenario doesn't require it
    if (!scenario.requiresConfirmation || skipConfirmMap[scenario.id]) {
      await executeRunScenario(scenario.id);
      return;
    }
    // Load preview and show confirmation modal
    setConfirmScenario(scenario);
    setConfirmPreview(null);
    setConfirmPreviewLoading(true);
    try {
      const res = await fetch(`${BASE}/api/autonomous/scenarios/${scenario.id}/preview`, { credentials: "include" });
      if (res.ok) setConfirmPreview(await res.json());
    } catch {}
    setConfirmPreviewLoading(false);
  }

  function toggleSkipConfirm(scenarioId: string, skip: boolean) {
    const updated = { ...skipConfirmMap, [scenarioId]: skip };
    setSkipConfirmMap(updated);
    localStorage.setItem("skipConfirmScenarios", JSON.stringify(updated));
  }

  async function saveSchedule(scenarioId: string, schedule: ScenarioSchedule) {
    const updated = { ...schedules, [scenarioId]: schedule };
    setSchedules(updated);
    try {
      await fetch(`${BASE}/api/autonomous/schedules`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      toast({ title: "Расписание сохранено" });
    } catch {
      toast({ title: "Ошибка сохранения расписания", variant: "destructive" });
    }
  }

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

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchStats();
    const statsInterval = setInterval(fetchStats, 30000);
    return () => { clearInterval(statsInterval); };
  }, [fetchStats]);

  useEffect(() => {
    if (tab === "autonomous") {
      fetchAutoSessions();
      fetchScenarios();
    }
    return () => { if (autoPollingRef.current) clearInterval(autoPollingRef.current); };
  }, [tab, fetchAutoSessions, fetchScenarios]);


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
              <p className="text-xs text-muted-foreground">Цифровые сотрудники и авто-агент</p>
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchAgentMemory(memFilter === "all" ? undefined : memFilter)}>
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

              {/* ── Scenarios section ── */}
              {scenarios.length > 0 && (
                <div className="border-b border-border shrink-0">
                  <div className="px-4 py-2.5 flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-3.5 h-3.5 text-violet-500" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Сценарии</p>
                    </div>
                  </div>
                  <div className="px-3 pb-3 space-y-2">
                    {scenarios.map(scenario => {
                      const isRunning = runningScenarios.has(scenario.id);
                      const schedule = schedules[scenario.id];
                      const hasSchedule = schedule?.enabled && schedule.days.length > 0;
                      const catInfo = CATEGORY_LABELS[scenario.category];
                      const colorClass = SCENARIO_COLOR_MAP[scenario.color] ?? "from-gray-500 to-gray-700";
                      const icon = SCENARIO_ICON_MAP[scenario.icon] ?? <Rocket className="w-4 h-4" />;
                      const isScheduleOpen = openSchedule === scenario.id;

                      return (
                        <div key={scenario.id} className="rounded-xl border border-border bg-card overflow-hidden">
                          {/* Card header */}
                          <div className="px-3 py-2.5 flex items-start gap-2.5">
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center text-white shrink-0`}>
                              {icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-semibold leading-tight">{scenario.title}</p>
                                {catInfo && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${catInfo.color}`}>
                                    {catInfo.label}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                                {scenario.shortDescription}
                              </p>
                            </div>
                          </div>

                          {/* Schedule editor (inline, collapsible) */}
                          {isScheduleOpen && (
                            <div className="px-3 pb-2.5 border-t border-border/60 bg-muted/20 pt-2">
                              <div className="flex items-center gap-2 mb-2">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                <p className="text-xs font-medium text-muted-foreground">Автозапуск каждый день в 09:00 МСК</p>
                              </div>
                              <div className="flex gap-1 flex-wrap">
                                {DAY_LABELS.map((label, dayIdx) => {
                                  const isOn = schedule?.days?.includes(dayIdx) ?? false;
                                  return (
                                    <button
                                      key={dayIdx}
                                      onClick={() => {
                                        const cur = schedules[scenario.id] ?? { enabled: true, days: [] };
                                        const days = isOn
                                          ? cur.days.filter(d => d !== dayIdx)
                                          : [...cur.days, dayIdx];
                                        saveSchedule(scenario.id, { enabled: days.length > 0, days });
                                      }}
                                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                                        isOn
                                          ? "bg-violet-600 text-white"
                                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                              {hasSchedule && (
                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Запускается по: {schedule.days.map(d => DAY_LABELS[d]).join(", ")}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="px-3 pb-2.5 flex items-center gap-2">
                            <Button
                              size="sm"
                              className="gap-1.5 h-7 text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white flex-1"
                              onClick={() => handleRunScenario(scenario)}
                              disabled={isRunning}
                            >
                              {isRunning
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Запускаю...</>
                                : scenario.requiresConfirmation
                                  ? <><ShieldAlert className="w-3 h-3" /> Запустить</>
                                  : <><Play className="w-3 h-3" /> Запустить</>
                              }
                            </Button>
                            <button
                              onClick={() => setOpenSchedule(isScheduleOpen ? null : scenario.id)}
                              className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors border ${
                                hasSchedule
                                  ? "bg-violet-100 dark:bg-violet-900/30 border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400"
                                  : isScheduleOpen
                                  ? "bg-muted border-border text-foreground"
                                  : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                              }`}
                              title="Настроить расписание"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                        { icon: <Brain className="w-4 h-4 text-blue-500 mx-auto mb-1" />, text: "ИИ выполняет каждый шаг" },
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

                  {/* Action button: launch followup from AL-diagnostics results */}
                  {activeSession.status === "done" &&
                   activeSession.goal === "АЛ-Диагностика: пульс пайплайна" && (
                    <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-950/10 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-white shrink-0">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-sm">Следующий шаг</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Написать мастерам из зоны риска — уточнить статус зависших заказов
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="mt-3 w-full gap-1.5 h-8 text-xs bg-gradient-to-r from-red-500 to-orange-600 hover:opacity-90 text-white"
                        onClick={() => {
                          const followupScenario = scenarios.find(s => s.id === "master_followup");
                          if (followupScenario) handleRunScenario(followupScenario);
                        }}
                        disabled={runningScenarios.has("master_followup")}
                      >
                        {runningScenarios.has("master_followup")
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Запускаю...</>
                          : <><ShieldAlert className="w-3 h-3" /> Написать мастерам из зоны риска</>
                        }
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Confirmation Modal ────────────────────────────────────────────── */}
      {confirmScenario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-white shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm">{confirmScenario.title}</p>
                  <p className="text-xs text-muted-foreground">Требует подтверждения перед запуском</p>
                </div>
              </div>
              <button onClick={() => { setConfirmScenario(null); setConfirmPreview(null); }}
                className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Preview body */}
            <div className="px-5 py-4 space-y-3">
              {confirmPreviewLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Загружаем данные...
                </div>
              )}

              {!confirmPreviewLoading && confirmPreview && (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2.5 text-center">
                      <p className="text-xl font-bold text-red-600 dark:text-red-400">{confirmPreview.criticalCount}</p>
                      <p className="text-[10px] text-red-600/70 dark:text-red-400/70 font-medium">🔴 Критично</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 text-center">
                      <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{confirmPreview.warningCount}</p>
                      <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 font-medium">🟡 Внимание</p>
                    </div>
                    <div className="rounded-lg bg-muted p-2.5 text-center">
                      <p className="text-xl font-bold">{confirmPreview.totalTargets}</p>
                      <p className="text-[10px] text-muted-foreground font-medium">Получат сообщ.</p>
                    </div>
                  </div>

                  {confirmPreview.totalAmount > 0 && (
                    <div className="rounded-lg bg-muted/50 px-3 py-2 flex items-center gap-2">
                      <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Общая сумма зависших заказов:{" "}
                        <span className="font-semibold text-foreground">{confirmPreview.totalAmount.toLocaleString("ru-RU")} ₽</span>
                      </p>
                    </div>
                  )}

                  {confirmPreview.masters.length > 0 && (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="px-3 py-1.5 bg-muted/40 border-b border-border">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          Мастера в зоне риска
                        </p>
                      </div>
                      <div className="max-h-36 overflow-y-auto divide-y divide-border">
                        {confirmPreview.masters.map((m, i) => (
                          <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                            <span>{m.risk === "critical" ? "🔴" : "🟡"}</span>
                            <span className="font-medium min-w-0 truncate">{m.alias}</span>
                            <span className="text-muted-foreground shrink-0">{m.city}</span>
                            <span className="text-muted-foreground shrink-0 ml-auto">{m.daysSinceContact}д.</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {confirmPreview.cities.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Города: {confirmPreview.cities.join(", ")}
                    </p>
                  )}

                  {confirmPreview.totalTargets === 0 && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                      Нет мастеров в зоне риска — рассылка не нужна
                    </div>
                  )}
                </>
              )}

              {!confirmPreviewLoading && !confirmPreview && (
                <div className="py-3 text-center text-sm text-muted-foreground">
                  Не удалось загрузить предпросмотр. Можно запустить без него.
                </div>
              )}

              {/* Skip confirmation checkbox */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={!!skipConfirmMap[confirmScenario.id]}
                  onChange={e => toggleSkipConfirm(confirmScenario.id, e.target.checked)}
                />
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  Не запрашивать подтверждение в следующий раз
                </span>
              </label>
            </div>

            {/* Footer buttons */}
            <div className="px-5 py-4 border-t border-border flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-9"
                onClick={() => { setConfirmScenario(null); setConfirmPreview(null); }}>
                Отмена
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9 gap-1.5 bg-gradient-to-r from-red-500 to-orange-600 hover:opacity-90 text-white"
                disabled={runningScenarios.has(confirmScenario.id) || (confirmPreview?.totalTargets === 0)}
                onClick={() => executeRunScenario(confirmScenario.id)}
              >
                {runningScenarios.has(confirmScenario.id)
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Запускаю...</>
                  : <><Play className="w-3.5 h-3.5" /> Запустить</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
