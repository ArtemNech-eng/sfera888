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

// ─── Template Scenario Types ───────────────────────────────────────────────

interface TemplateScenario {
  id: string;
  title: string;
  description: string;
  autoInterval: string;
  autoEnabled: boolean;
  lastRun: {
    run_type: string;
    status: "success" | "error";
    summary: any;
    error_text: string | null;
    duration_ms: number;
    created_at: string;
  } | null;
}

interface ScenarioLog {
  id: number;
  run_type: string;
  status: string;
  summary: any;
  error_text: string | null;
  duration_ms: number;
  created_at: string;
}

interface DiagReason { text: string; recommendation: string }
interface DiagEntry {
  orderId: number;
  masterAlias: string;
  maxChatId: string | null;
  city: string;
  district: string;
  serviceType: string;
  status: string;
  daysSinceAssigned: number;
  daysSinceUpdated: number;
  hasReceipt: boolean;
  prepaidOk: boolean;
  amount: number;
  risk: string;
  reasons: DiagReason[];
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
  const [tab, setTab] = useState<"employees" | "scenarios" | "autonomous" | "memory">("employees");
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

  // Template scenarios state
  const [templateScenarios, setTemplateScenarios] = useState<TemplateScenario[]>([]);
  const [templateScenariosLoading, setTemplateScenariosLoading] = useState(false);
  const [runningTemplates, setRunningTemplates] = useState<Set<string>>(new Set());
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [scenarioLogs, setScenarioLogs] = useState<Record<string, ScenarioLog[]>>({});
  const [diagResult, setDiagResult] = useState<{ critical: DiagEntry[]; warning: DiagEntry[]; ok: DiagEntry[]; totalAmount: { critical: number; warning: number } } | null>(null);
  const [diagLiveResult, setDiagLiveResult] = useState<{ critical: DiagEntry[]; warning: DiagEntry[]; ok: DiagEntry[]; totalAmount: { critical: number; warning: number } } | null>(null);
  const [diagLiveLoading, setDiagLiveLoading] = useState(false);
  const [diagMsgSent, setDiagMsgSent] = useState<Set<number>>(new Set());
  const [messagingOrderId, setMessagingOrderId] = useState<number | null>(null);

  // Payment-reminders state
  interface PaymentEntry { orderId: number; masterAlias: string; maxChatId: string | null; clientName: string; clientPhone: string | null; city: string; district: string; serviceType: string; receiptSentAt: string; hoursWithoutPayment: number; totalAmount: number; commission: number; risk: "super" | "critical" | "warning" }
  const [paymentResult, setPaymentResult] = useState<{ warning: PaymentEntry[]; critical: PaymentEntry[]; superCritical: PaymentEntry[]; totalAmount: number } | null>(null);
  const [paymentLiveLoading, setPaymentLiveLoading] = useState(false);
  const [paymentActionLoading, setPaymentActionLoading] = useState<Record<number, string>>({});
  const [paymentMsgSent, setPaymentMsgSent] = useState<Set<number>>(new Set());
  const [paymentConfirm, setPaymentConfirm] = useState<{ orderId: number; type: "return-to-pool" | "cancel"; masterAlias: string } | null>(null);
  const [paymentCallModal, setPaymentCallModal] = useState<{ orderId: number; clientPhone: string; clientName: string } | null>(null);
  const [paymentCallComment, setPaymentCallComment] = useState<Record<number, string>>({});
  const [paymentCommentSaved, setPaymentCommentSaved] = useState<Set<number>>(new Set());
  const [paymentSendAllState, setPaymentSendAllState] = useState<"idle" | "confirm" | "loading">("idle");

  // Orders-without-receipts state
  interface NoReceiptEntry { orderId: number; masterAlias: string; maxChatId: string | null; city: string; district: string; serviceType: string; assignedAt: string; hoursWithoutReceipt: number; risk: "critical" | "warning"; masterPhone: string | null }
  const [noReceiptResult, setNoReceiptResult] = useState<{ critical: NoReceiptEntry[]; warning: NoReceiptEntry[] } | null>(null);
  const [noReceiptLiveLoading, setNoReceiptLiveLoading] = useState(false);
  const [noReceiptActionLoading, setNoReceiptActionLoading] = useState<Record<number, string>>({});
  const [noReceiptConfirm, setNoReceiptConfirm] = useState<{ orderId: number; type: "reassign" | "cancel"; masterAlias: string } | null>(null);
  const [noReceiptMsgSent, setNoReceiptMsgSent] = useState<Set<number>>(new Set());
  const [noReceiptCallModal, setNoReceiptCallModal] = useState<{ orderId: number; masterPhone: string; masterAlias: string } | null>(null);
  const [noReceiptCallComment, setNoReceiptCallComment] = useState<Record<number, string>>({});
  const [noReceiptCommentSaved, setNoReceiptCommentSaved] = useState<Set<number>>(new Set());
  const [noReceiptSendAllState, setNoReceiptSendAllState] = useState<"idle" | "confirm" | "loading">("idle");

  // Broadcast-orders live state
  interface BroadcastOrderEntry { orderId: number; city: string; district: string; serviceType: string; area: string; scheduledAt: string | null; createdAt: string; currentWave: number | null; wave1SentAt: string | null; wave2SentAt: string | null; wave3SentAt: string | null; wave4SentAt: string | null; adminAlerted: boolean; wave1Count: number; wave2Count: number; wave3Count: number; wave4Count: number; totalNotified: number; totalResponded: number; elapsedMin: number; isStuck: boolean }
  interface BroadcastLiveData { orders: BroadcastOrderEntry[]; stats: { openCount: number; assignedTodayCount: number; awaitingCount: number; stuckCount: number } }
  const [broadcastLive, setBroadcastLive] = useState<BroadcastLiveData | null>(null);
  const [broadcastLiveLoading, setBroadcastLiveLoading] = useState(false);
  const [broadcastActionLoading, setBroadcastActionLoading] = useState<Record<number, string>>({});
  const [broadcastCancelConfirm, setBroadcastCancelConfirm] = useState<{ orderId: number; serviceType: string } | null>(null);

  // Legacy GPT scenarios state
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
  const [scenarioDays, setScenarioDays] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem("scenarioDays") ?? "{}"); } catch { return {}; }
  });

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

  // ── Template Scenarios ─────────────────────────────────────────────────────
  const fetchTemplateScenarios = useCallback(async () => {
    setTemplateScenariosLoading(true);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios`, { credentials: "include" });
      const data = await res.json();
      setTemplateScenarios(data);
    } catch (e) {
      console.error("[template-scenarios]", e);
    } finally {
      setTemplateScenariosLoading(false);
    }
  }, []);

  const fetchScenarioLogs = useCallback(async (id: string) => {
    const res = await fetch(`${BASE}/api/ai-office/template-scenarios/${id}/logs`, { credentials: "include" });
    const data = await res.json();
    setScenarioLogs(prev => ({ ...prev, [id]: data }));
  }, []);

  // ── Broadcast-orders handlers ──────────────────────────────────────────────
  const fetchBroadcastLive = useCallback(async () => {
    setBroadcastLiveLoading(true);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/broadcast-orders/live`, { credentials: "include" });
      const data = await res.json();
      setBroadcastLive(data);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: String(e), variant: "destructive" });
    } finally {
      setBroadcastLiveLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBroadcastResend = useCallback(async (orderId: number) => {
    setBroadcastActionLoading(p => ({ ...p, [orderId]: "resend" }));
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/broadcast-orders/${orderId}/resend`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Волны сброшены ✓", description: "Заказ будет разослан заново на следующем запуске" });
      fetchBroadcastLive();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setBroadcastActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; });
    }
  }, [fetchBroadcastLive]);

  const handleBroadcastCancel = useCallback(async (orderId: number) => {
    setBroadcastActionLoading(p => ({ ...p, [orderId]: "cancel" }));
    setBroadcastCancelConfirm(null);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/broadcast-orders/${orderId}/cancel`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Заказ отменён ✓" });
      fetchBroadcastLive();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setBroadcastActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; });
    }
  }, [fetchBroadcastLive]);

  // ── Payment-reminders handlers ─────────────────────────────────────────────
  const fetchPaymentLive = useCallback(async () => {
    setPaymentLiveLoading(true);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/payment-reminders/live`, { credentials: "include" });
      const data = await res.json();
      setPaymentResult(data);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: String(e), variant: "destructive" });
    } finally {
      setPaymentLiveLoading(false);
    }
  }, []);

  const handlePaymentMessage = useCallback(async (orderId: number) => {
    setPaymentActionLoading(p => ({ ...p, [orderId]: "message" }));
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/payment-reminders/${orderId}/message-master`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setPaymentMsgSent(prev => new Set(prev).add(orderId));
      toast({ title: "Сообщение отправлено мастеру ✓" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setPaymentActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; });
    }
  }, []);

  const handlePaymentReturnToPool = useCallback(async (orderId: number) => {
    setPaymentActionLoading(p => ({ ...p, [orderId]: "pool" }));
    setPaymentConfirm(null);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/payment-reminders/${orderId}/return-to-pool`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Заказ возвращён в пул ✓" });
      fetchPaymentLive();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setPaymentActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; });
    }
  }, [fetchPaymentLive]);

  const handlePaymentCancel = useCallback(async (orderId: number) => {
    setPaymentActionLoading(p => ({ ...p, [orderId]: "cancel" }));
    setPaymentConfirm(null);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/payment-reminders/${orderId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Заказ отменён ✓" });
      fetchPaymentLive();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setPaymentActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; });
    }
  }, [fetchPaymentLive]);

  const handlePaymentSendAll = useCallback(async () => {
    setPaymentSendAllState("loading");
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/payment-reminders/send-all`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const skipNote = data.skipped > 0 ? `, пропущено ${data.skipped} (уже уведомлены)` : "";
      toast({ title: `Отправлено ${data.sent} мастерам ✓${skipNote}` });
      setPaymentMsgSent(new Set());
      fetchPaymentLive();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setPaymentSendAllState("idle");
    }
  }, [fetchPaymentLive]);

  const handleNoReceiptSendAll = useCallback(async () => {
    setNoReceiptSendAllState("loading");
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/orders-without-receipts/send-all`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const skipNote = data.skipped > 0 ? `, пропущено ${data.skipped} (уже уведомлены)` : "";
      toast({ title: `Отправлено ${data.sent} мастерам ✓${skipNote}` });
      setNoReceiptMsgSent(new Set());
      fetchNoReceiptLive();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setNoReceiptSendAllState("idle");
    }
  }, []);

  const handleRunTemplate = useCallback(async (id: string) => {
    setRunningTemplates(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/${id}/run`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      toast({ title: "Сценарий выполнен ✓", description: "Результат записан в историю." });
      if (id === "order-diagnostics" && data.result) setDiagResult(data.result);
      if (id === "orders-without-receipts" && data.result) setNoReceiptResult(data.result);
      if (id === "payment-reminders" && data.result) setPaymentResult(data.result);
      fetchTemplateScenarios();
      fetchScenarioLogs(id);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setRunningTemplates(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [fetchTemplateScenarios, fetchScenarioLogs]);

  const handleToggleAuto = useCallback(async (id: string, enabled: boolean) => {
    try {
      await fetch(`${BASE}/api/ai-office/template-scenarios/${id}/toggle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      setTemplateScenarios(prev => prev.map(s => s.id === id ? { ...s, autoEnabled: enabled } : s));
      toast({ title: enabled ? "Автозапуск включён" : "Автозапуск выключен" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  }, []);

  const fetchDiagLive = useCallback(async () => {
    setDiagLiveLoading(true);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/order-diagnostics/live`, { credentials: "include" });
      const data = await res.json();
      setDiagLiveResult(data);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: String(e), variant: "destructive" });
    } finally {
      setDiagLiveLoading(false);
    }
  }, []);

  const handleMessageMaster = useCallback(async (orderId: number) => {
    setMessagingOrderId(orderId);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/order-diagnostics/${orderId}/message-master`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setDiagMsgSent(prev => new Set(prev).add(orderId));
      toast({ title: "Сообщение отправлено мастеру ✓" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setMessagingOrderId(null);
    }
  }, []);

  const fetchNoReceiptLive = useCallback(async () => {
    setNoReceiptLiveLoading(true);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/orders-without-receipts/live`, { credentials: "include" });
      const data = await res.json();
      setNoReceiptResult(data);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: String(e), variant: "destructive" });
    } finally {
      setNoReceiptLiveLoading(false);
    }
  }, []);

  const handleNoReceiptMessage = useCallback(async (orderId: number) => {
    setNoReceiptActionLoading(p => ({ ...p, [orderId]: "message" }));
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/orders-without-receipts/${orderId}/message-master`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNoReceiptMsgSent(prev => new Set(prev).add(orderId));
      toast({ title: "Сообщение отправлено мастеру ✓" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setNoReceiptActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; });
    }
  }, []);

  const handleNoReceiptReassign = useCallback(async (orderId: number) => {
    setNoReceiptActionLoading(p => ({ ...p, [orderId]: "reassign" }));
    setNoReceiptConfirm(null);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/orders-without-receipts/${orderId}/reassign`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Заказ переназначен ✓" });
      fetchNoReceiptLive();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setNoReceiptActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; });
    }
  }, [fetchNoReceiptLive]);

  const handleNoReceiptCancel = useCallback(async (orderId: number) => {
    setNoReceiptActionLoading(p => ({ ...p, [orderId]: "cancel" }));
    setNoReceiptConfirm(null);
    try {
      const res = await fetch(`${BASE}/api/ai-office/template-scenarios/orders-without-receipts/${orderId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Заказ отменён ✓" });
      fetchNoReceiptLive();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setNoReceiptActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; });
    }
  }, [fetchNoReceiptLive]);

  // ── Legacy GPT Scenarios ───────────────────────────────────────────────────
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

  async function executeRunScenario(scenarioId: string, days?: number) {
    setRunningScenarios(prev => new Set([...prev, scenarioId]));
    setConfirmScenario(null);
    setConfirmPreview(null);
    try {
      const body: Record<string, unknown> = {};
      if (days !== undefined) body.days = days;
      const res = await fetch(`${BASE}/api/autonomous/scenarios/${scenarioId}/run`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  async function handleRunScenario(scenario: PredefinedScenario, days?: number) {
    const effectiveDays = days ?? scenarioDays[scenario.id] ?? 7;
    // Skip confirmation if user checked "don't ask again" or scenario doesn't require it
    if (!scenario.requiresConfirmation || skipConfirmMap[scenario.id]) {
      await executeRunScenario(scenario.id, effectiveDays);
      return;
    }
    // Load preview and show confirmation modal
    setConfirmScenario(scenario);
    setConfirmPreview(null);
    setConfirmPreviewLoading(true);
    try {
      const res = await fetch(`${BASE}/api/autonomous/scenarios/${scenario.id}/preview?days=${effectiveDays}`, { credentials: "include" });
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
    if (tab === "scenarios") {
      fetchTemplateScenarios();
    }
    if (tab === "autonomous") {
      fetchAutoSessions();
      fetchScenarios();
    }
    return () => { if (autoPollingRef.current) clearInterval(autoPollingRef.current); };
  }, [tab, fetchAutoSessions, fetchScenarios, fetchTemplateScenarios]);

  // Auto-fetch live data for action scenarios when their lastRun summary is loaded
  useEffect(() => {
    const hasPayment = templateScenarios.find(s => s.id === "payment-reminders")?.lastRun?.summary;
    const hasReceipt = templateScenarios.find(s => s.id === "orders-without-receipts")?.lastRun?.summary;
    const hasBroadcast = templateScenarios.find(s => s.id === "broadcast-orders");
    if (hasPayment) fetchPaymentLive();
    if (hasReceipt) fetchNoReceiptLive();
    if (hasBroadcast) fetchBroadcastLive();
  }, [templateScenarios]); // eslint-disable-line react-hooks/exhaustive-deps


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
              onClick={() => setTab("scenarios")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                tab === "scenarios"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              Сценарии
              <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-full px-1.5 py-0.5 font-semibold">
                5
              </span>
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

        {/* ── Scenarios tab ── */}
        {tab === "scenarios" && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">Шаблонные сценарии</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Готовые автоматические сценарии — рассылка заказов, контроль оплат, диагностика, анализ цен.
                    Запускайте вручную или включите автозапуск по расписанию.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchTemplateScenarios} disabled={templateScenariosLoading}>
                  <RefreshCw className={`w-3.5 h-3.5 ${templateScenariosLoading ? "animate-spin" : ""}`} />
                  Обновить
                </Button>
              </div>

              {/* Scenario cards */}
              {templateScenariosLoading && templateScenarios.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {(templateScenarios.length > 0 ? templateScenarios : [
                    { id: "broadcast-orders", title: "📋 Разослать открытые заказы", description: "Находит заказы «ищем мастера», подбирает мастеров по городу и специализации, рассылает уведомления в Max.", autoInterval: "каждые 15 мин", autoEnabled: false, lastRun: null },
                    { id: "payment-reminders", title: "💰 Напомнить об оплате", description: "Проверяет сметы без предоплаты более 24ч, отправляет напоминания. После 72ч — возвращает заказ в пул.", autoInterval: "каждые 6 часов", autoEnabled: false, lastRun: null },
                    { id: "order-diagnostics", title: "🔍 Диагностика заказов", description: "Анализирует активные заказы на риски: нет отклика, задержка оплаты, заказ завис. Уровни: 🔴 Критично / 🟡 Внимание / 🟢 Норма.", autoInterval: "ежедневно в 9:00", autoEnabled: false, lastRun: null },
                    { id: "price-analysis", title: "📊 Анализ рыночных цен", description: "Считает среднюю/медианную цену за м² по услугам и городам, выявляет аномалии у мастеров.", autoInterval: "еженедельно пн 8:00", autoEnabled: false, lastRun: null },
                  ] as TemplateScenario[]).map(scenario => {
                    const isRunning = runningTemplates.has(scenario.id);
                    const logs = scenarioLogs[scenario.id] ?? [];
                    const logsOpen = expandedLogs === scenario.id;
                    const lastRun = scenario.lastRun;

                    const COLORS: Record<string, string> = {
                      "broadcast-orders": "from-blue-600 to-cyan-600",
                      "payment-reminders": "from-emerald-600 to-teal-600",
                      "order-diagnostics": "from-orange-500 to-amber-600",
                      "price-analysis": "from-violet-600 to-indigo-600",
                      "orders-without-receipts": "from-amber-500 to-orange-600",
                    };
                    const colorClass = COLORS[scenario.id] ?? "from-gray-500 to-gray-700";

                    function formatDuration(ms: number) {
                      if (ms < 1000) return `${ms}ms`;
                      return `${(ms / 1000).toFixed(1)}s`;
                    }

                    function formatLastRunSummary(s: TemplateScenario["lastRun"]) {
                      if (!s) return null;
                      if (s.status === "error") return { text: "Ошибка: " + (s.error_text ?? "неизвестно"), color: "text-red-500" };
                      const sm = s.summary;
                      if (!sm) return null;
                      if (scenario.id === "broadcast-orders") {
                        const parts = [];
                        if (sm.newOrders > 0) parts.push(`🟢 ${sm.newOrders} новых`);
                        if (sm.wavesAdvanced > 0) parts.push(`⏩ ${sm.wavesAdvanced} волн`);
                        if (sm.adminAlerts > 0) parts.push(`⚠️ ${sm.adminAlerts} алертов`);
                        if (sm.totalSent > 0) parts.push(`📤 ${sm.totalSent} сообщ.`);
                        return { text: parts.length > 0 ? parts.join(" · ") : `📤 ${sm.totalSent ?? 0} сообщ. по ${sm.totalOrders ?? 0} заказам`, color: "text-blue-600 dark:text-blue-400" };
                      }
                      if (scenario.id === "payment-reminders") {
                        const total = (sm.superCritical?.length ?? 0) + (sm.critical?.length ?? 0) + (sm.warning?.length ?? 0);
                        const sent = (sm.sent24h ?? 0) + (sm.sent48h ?? 0) + (sm.sent72h ?? 0);
                        return { text: `⚫ ${sm.superCritical?.length ?? 0} 🔴 ${sm.critical?.length ?? 0} 🟡 ${sm.warning?.length ?? 0} · ${sent} напомин.`, color: "text-emerald-600 dark:text-emerald-400" };
                      }
                      if (scenario.id === "order-diagnostics") return { text: `🔴 ${sm.critical?.length ?? 0} крит. 🟡 ${sm.warning?.length ?? 0} внимание 🟢 ${sm.ok?.length ?? 0} ок`, color: "text-orange-600 dark:text-orange-400" };
                      if (scenario.id === "price-analysis") return { text: `📊 ${sm.services?.length ?? 0} услуг, ${sm.anomalies?.length ?? 0} аномалий`, color: "text-violet-600 dark:text-violet-400" };
                      if (scenario.id === "orders-without-receipts") return { text: `🔴 ${sm.critical?.length ?? 0} крит. 🟡 ${sm.warning?.length ?? 0} внимание · ${sm.totalNotified ?? 0} уведомлено`, color: "text-amber-600 dark:text-amber-400" };
                      return null;
                    }

                    const lastRunSummary = formatLastRunSummary(lastRun);

                    return (
                      <div key={scenario.id} className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
                        {/* Gradient header */}
                        <div className={`bg-gradient-to-br ${colorClass} px-5 py-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-white font-bold text-base leading-snug">{scenario.title}</p>
                            {/* Auto toggle */}
                            <button
                              onClick={() => handleToggleAuto(scenario.id, !scenario.autoEnabled)}
                              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                                scenario.autoEnabled
                                  ? "bg-white text-green-700"
                                  : "bg-white/20 text-white/80 hover:bg-white/30"
                              }`}
                            >
                              {scenario.autoEnabled ? (
                                <><CheckCircle2 className="w-3 h-3" /> Авто</>
                              ) : (
                                <><Clock className="w-3 h-3" /> Авто</>
                              )}
                            </button>
                          </div>
                          <p className="text-white/75 text-xs mt-1.5 leading-snug">{scenario.description}</p>
                          <p className="text-white/50 text-[10px] mt-2 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {scenario.autoEnabled ? `Автозапуск: ${scenario.autoInterval}` : `Расписание: ${scenario.autoInterval}`}
                          </p>
                        </div>

                        {/* Body */}
                        <div className="flex-1 p-4 space-y-3">
                          {/* Last run info */}
                          {lastRun ? (
                            <div className={`rounded-xl px-3 py-2.5 text-xs border ${
                              lastRun.status === "error"
                                ? "bg-red-50 dark:bg-red-950/20 border-red-200/60 dark:border-red-800/40"
                                : "bg-muted/40 border-border"
                            }`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">
                                  {lastRun.run_type === "auto" ? "🤖 Авто" : "▶ Ручной"} · {new Date(lastRun.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {formatDuration(lastRun.duration_ms)}
                                </span>
                                {lastRun.status === "success" ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                ) : (
                                  <span className="text-red-500 font-medium shrink-0">Ошибка</span>
                                )}
                              </div>
                              {lastRunSummary && (
                                <p className={`mt-1 font-medium ${lastRunSummary.color}`}>{lastRunSummary.text}</p>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-xl px-3 py-2.5 text-xs bg-muted/30 border border-border text-muted-foreground">
                              Сценарий ещё не запускался
                            </div>
                          )}

                          {/* Broadcast-orders inline panel */}
                          {scenario.id === "broadcast-orders" && (() => {
                            const data = broadcastLive;
                            const orders: BroadcastOrderEntry[] = data?.orders ?? [];
                            const stats = data?.stats ?? { openCount: 0, assignedTodayCount: 0, awaitingCount: 0, stuckCount: 0 };

                            function waveInfo(o: BroadcastOrderEntry): { label: string; color: string; bg: string } {
                              if (o.adminAlerted) return { label: "⚫ Без ответа", color: "text-gray-600", bg: "bg-red-50/80 dark:bg-red-950/20" };
                              if (!o.currentWave) return { label: "⏳ Новый", color: "text-gray-400", bg: "" };
                              const wl = ["", "🟢 Волна 1", "🟡 Волна 2", "🟠 Волна 3", "🔴 Волна 4"];
                              const wc = ["", "text-green-600", "text-yellow-600", "text-orange-600", "text-red-600"];
                              const wb = ["", "", "", "", "bg-amber-50/60 dark:bg-amber-950/10"];
                              return { label: wl[o.currentWave] ?? `Волна ${o.currentWave}`, color: wc[o.currentWave] ?? "", bg: wb[o.currentWave] ?? "" };
                            }

                            function elapsedLabel(min: number): string {
                              if (min < 60) return `${min} мин`;
                              const h = Math.floor(min / 60); const m = min % 60;
                              return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
                            }

                            return (
                              <div className="space-y-2 mt-1">
                                {/* 4 summary cards */}
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div className="rounded-lg px-2.5 py-2 bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 text-center">
                                    <p className="text-[11px] text-blue-600 font-semibold">📋 Открытых</p>
                                    <p className="text-base font-bold text-blue-700 dark:text-blue-400">{stats.openCount}</p>
                                  </div>
                                  <div className="rounded-lg px-2.5 py-2 bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 text-center">
                                    <p className="text-[11px] text-emerald-600 font-semibold">✅ Назначено сегодня</p>
                                    <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">{stats.assignedTodayCount}</p>
                                  </div>
                                  <div className="rounded-lg px-2.5 py-2 bg-yellow-50/80 dark:bg-yellow-950/20 border border-yellow-200/60 dark:border-yellow-800/40 text-center">
                                    <p className="text-[11px] text-yellow-600 font-semibold">⏳ Ждут отклика</p>
                                    <p className="text-base font-bold text-yellow-700 dark:text-yellow-400">{stats.awaitingCount}</p>
                                  </div>
                                  <div className="rounded-lg px-2.5 py-2 bg-red-50/80 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 text-center">
                                    <p className="text-[11px] text-red-500 font-semibold">⚠️ Без мастера 1ч+</p>
                                    <p className="text-base font-bold text-red-700 dark:text-red-400">{stats.stuckCount}</p>
                                  </div>
                                </div>

                                {/* Refresh row */}
                                <div className="flex items-center gap-2 text-xs">
                                  {orders.length === 0 && !broadcastLiveLoading && (
                                    <span className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold">✅ Нет открытых заказов</span>
                                  )}
                                  <button onClick={fetchBroadcastLive} disabled={broadcastLiveLoading}
                                    className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                                    <RefreshCw className={`w-3 h-3 ${broadcastLiveLoading ? "animate-spin" : ""}`} />
                                    <span>Обновить</span>
                                  </button>
                                </div>

                                {/* Orders list */}
                                {orders.length > 0 && (
                                  <div className="rounded-xl border border-border overflow-hidden">
                                    <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
                                      {orders.map(o => {
                                        const wi = waveInfo(o);
                                        const resendLoading = broadcastActionLoading[o.orderId] === "resend";
                                        const cancelLoading = broadcastActionLoading[o.orderId] === "cancel";
                                        const scheduledStr = o.scheduledAt
                                          ? new Date(o.scheduledAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
                                          : "по договор.";
                                        const isCancelling = broadcastCancelConfirm?.orderId === o.orderId;

                                        return (
                                          <div key={o.orderId} className={`px-3 py-2.5 ${wi.bg}`}>
                                            <div className="flex items-start gap-2 flex-wrap">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="text-xs font-bold text-foreground">#{o.orderId}</span>
                                                  <span className={`text-[11px] font-semibold ${wi.color}`}>{wi.label}</span>
                                                  {o.elapsedMin > 0 && (
                                                    <span className="text-[10px] text-muted-foreground">· {elapsedLabel(o.elapsedMin)}</span>
                                                  )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                                  📍 {o.city}{o.district !== "—" ? `, ${o.district}` : ""} · 🔨 {o.serviceType}
                                                  {o.area !== "—" ? ` · ${o.area} м²` : ""} · 📅 {scheduledStr}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                                  📬 {o.totalNotified} мастеров · {o.totalResponded > 0 ? `✅ ${o.totalResponded} откликнулись` : "Откликов нет"}
                                                  {o.wave1Count > 0 && ` · В1:${o.wave1Count}`}
                                                  {o.wave2Count > 0 && ` В2:${o.wave2Count}`}
                                                  {o.wave3Count > 0 && ` В3:${o.wave3Count}`}
                                                  {o.wave4Count > 0 && ` В4:${o.wave4Count}`}
                                                </p>
                                              </div>

                                              {/* Actions */}
                                              <div className="flex items-center gap-1 shrink-0">
                                                {isCancelling ? (
                                                  <>
                                                    <span className="text-[11px] text-red-600 font-semibold">Отменить?</span>
                                                    <button
                                                      onClick={() => handleBroadcastCancel(o.orderId)}
                                                      disabled={cancelLoading}
                                                      className="px-1.5 py-0.5 rounded text-[11px] bg-red-500 text-white font-semibold hover:opacity-80 transition-colors"
                                                    >{cancelLoading ? "..." : "Да"}</button>
                                                    <button
                                                      onClick={() => setBroadcastCancelConfirm(null)}
                                                      className="px-1.5 py-0.5 rounded text-[11px] bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                    >Нет</button>
                                                  </>
                                                ) : (
                                                  <>
                                                    <button
                                                      onClick={() => handleBroadcastResend(o.orderId)}
                                                      disabled={resendLoading}
                                                      title="Сбросить волны и разослать заново"
                                                      className="px-1.5 py-0.5 rounded text-[11px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:opacity-80 transition-colors font-medium"
                                                    >{resendLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin inline" /> : "📱 Повтор"}</button>
                                                    <button
                                                      onClick={() => setBroadcastCancelConfirm({ orderId: o.orderId, serviceType: o.serviceType })}
                                                      className="px-1.5 py-0.5 rounded text-[11px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:opacity-80 transition-colors font-medium"
                                                    >❌</button>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Payment-reminders inline panel */}
                          {scenario.id === "payment-reminders" && (paymentResult || lastRun?.summary) && (() => {
                            const data = paymentResult ?? (lastRun?.summary as any ?? null);
                            const superCritical: any[] = data?.superCritical ?? [];
                            const critical: any[] = data?.critical ?? [];
                            const warning: any[] = data?.warning ?? [];
                            const totalAmt: number = data?.totalAmount ?? 0;
                            const total = superCritical.length + critical.length + warning.length;
                            const allItems = [...superCritical, ...critical, ...warning];
                            const totalCommission: number = allItems.reduce((s, e) => s + (Number(e.commission) || 0), 0);

                            return (
                              <div className="space-y-2">
                                {/* 4 summary cards */}
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div className="rounded-lg px-2.5 py-2 bg-red-100/80 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 text-center">
                                    <p className="text-[11px] text-red-500 font-semibold">⚫ 72ч+</p>
                                    <p className="text-base font-bold text-red-700 dark:text-red-400">{superCritical.length}</p>
                                  </div>
                                  <div className="rounded-lg px-2.5 py-2 bg-orange-100/80 dark:bg-orange-950/30 border border-orange-200/60 dark:border-orange-800/40 text-center">
                                    <p className="text-[11px] text-orange-500 font-semibold">🔴 48-72ч</p>
                                    <p className="text-base font-bold text-orange-700 dark:text-orange-400">{critical.length}</p>
                                  </div>
                                  <div className="rounded-lg px-2.5 py-2 bg-yellow-100/80 dark:bg-yellow-950/30 border border-yellow-200/60 dark:border-yellow-800/40 text-center">
                                    <p className="text-[11px] text-yellow-600 font-semibold">🟡 24-48ч</p>
                                    <p className="text-base font-bold text-yellow-700 dark:text-yellow-400">{warning.length}</p>
                                  </div>
                                  <div className="rounded-lg px-2.5 py-2 bg-emerald-100/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 text-center">
                                    <p className="text-[11px] text-emerald-600 font-semibold">💰 Ожидается</p>
                                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{totalAmt.toLocaleString("ru-RU")}₽</p>
                                    {totalCommission > 0 && (
                                      <p className="text-[10px] text-violet-500 dark:text-violet-400 font-medium">+{totalCommission.toLocaleString("ru-RU")}₽ ком.</p>
                                    )}
                                  </div>
                                </div>

                                {/* Refresh + send-all row */}
                                <div className="flex items-center gap-2 text-xs">
                                  {total === 0 && (
                                    <span className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold">✅ Все оплатили</span>
                                  )}
                                  {total > 0 && paymentSendAllState === "idle" && (
                                    <button
                                      onClick={() => setPaymentSendAllState("confirm")}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:opacity-80 transition-colors font-semibold"
                                    >
                                      📨 Отправить всем
                                    </button>
                                  )}
                                  {total > 0 && paymentSendAllState === "confirm" && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-orange-600 dark:text-orange-400 font-semibold">Отправить {total} мастерам?</span>
                                      <button
                                        onClick={handlePaymentSendAll}
                                        className="px-2 py-0.5 rounded-lg bg-orange-500 text-white font-semibold hover:opacity-80 transition-colors"
                                      >
                                        Да
                                      </button>
                                      <button
                                        onClick={() => setPaymentSendAllState("idle")}
                                        className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        Нет
                                      </button>
                                    </div>
                                  )}
                                  {paymentSendAllState === "loading" && (
                                    <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-semibold">
                                      <Loader2 className="w-3 h-3 animate-spin" /> Отправляю...
                                    </span>
                                  )}
                                  <button onClick={fetchPaymentLive} disabled={paymentLiveLoading}
                                    className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                                    <RefreshCw className={`w-3 h-3 ${paymentLiveLoading ? "animate-spin" : ""}`} />
                                    <span>Обновить</span>
                                  </button>
                                </div>

                                {/* Orders table */}
                                {allItems.length > 0 && (
                                  <div className="rounded-xl border border-border overflow-hidden">
                                    <div className="divide-y divide-border max-h-96 overflow-y-auto">
                                      {allItems.map((entry: any) => {
                                        const isSuper = entry.risk === "super";
                                        const isCrit = entry.risk === "critical";
                                        const msgLoading = paymentActionLoading[entry.orderId] === "message";
                                        const poolLoading = paymentActionLoading[entry.orderId] === "pool";
                                        const cancelLoading = paymentActionLoading[entry.orderId] === "cancel";
                                        const msgSent = paymentMsgSent.has(entry.orderId);
                                        const rowBg = isSuper
                                          ? "bg-red-50/70 dark:bg-red-950/20"
                                          : isCrit
                                          ? "bg-orange-50/50 dark:bg-orange-950/10"
                                          : "bg-yellow-50/30 dark:bg-yellow-950/5";

                                        return (
                                          <div key={entry.orderId} className={`px-3 py-2.5 ${rowBg}`}>
                                            <div className="flex items-start gap-2 flex-wrap">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className={`text-xs font-bold ${isSuper ? "text-red-700 dark:text-red-400" : isCrit ? "text-orange-600 dark:text-orange-400" : "text-yellow-700 dark:text-yellow-400"}`}>
                                                    {isSuper ? "⚫" : isCrit ? "🔴" : "🟡"} #{entry.orderId}
                                                  </span>
                                                  <span className="text-xs text-muted-foreground">{entry.serviceType}</span>
                                                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 ml-auto flex flex-col items-end leading-tight">
                                                    <span>{Number(entry.totalAmount).toLocaleString("ru-RU")}₽</span>
                                                    {entry.commission > 0 && (
                                                      <span className="text-violet-500 dark:text-violet-400">+{Number(entry.commission).toLocaleString("ru-RU")}₽ ком.</span>
                                                    )}
                                                  </span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                  {entry.masterAlias} · {entry.clientName} · {entry.district || entry.city}
                                                </p>
                                                <p className="text-[11px] font-medium mt-0.5 text-red-600 dark:text-red-400">
                                                  {entry.hoursWithoutPayment}ч без оплаты · смета {new Date(entry.receiptSentAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                                                </p>
                                              </div>
                                            </div>

                                            {/* Action buttons */}
                                            <div className="flex gap-1 flex-wrap mt-2">
                                              <button
                                                onClick={() => handlePaymentMessage(entry.orderId)}
                                                disabled={!!paymentActionLoading[entry.orderId] || msgSent}
                                                className={`text-[10px] px-2 py-1 rounded-lg transition-colors font-medium ${
                                                  msgSent
                                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                                    : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:opacity-80"
                                                } disabled:opacity-50`}
                                              >
                                                {msgLoading ? "…" : msgSent ? "✅ Отправлено" : "📱 Написать мастеру"}
                                              </button>
                                              {entry.clientPhone ? (
                                                <button
                                                  onClick={() => setPaymentCallModal({ orderId: entry.orderId, clientPhone: entry.clientPhone, clientName: entry.clientName })}
                                                  className="text-[10px] px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:opacity-80 transition-colors font-medium"
                                                >
                                                  📞 Позвонить клиенту
                                                </button>
                                              ) : null}
                                              <button
                                                onClick={() => setPaymentConfirm({ orderId: entry.orderId, type: "return-to-pool", masterAlias: entry.masterAlias })}
                                                disabled={!!paymentActionLoading[entry.orderId]}
                                                className="text-[10px] px-2 py-1 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:opacity-80 transition-colors font-medium disabled:opacity-50"
                                              >
                                                {poolLoading ? "…" : "🔄 Вернуть в пул"}
                                              </button>
                                              <button
                                                onClick={() => setPaymentConfirm({ orderId: entry.orderId, type: "cancel", masterAlias: entry.masterAlias })}
                                                disabled={!!paymentActionLoading[entry.orderId]}
                                                className="text-[10px] px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:opacity-80 transition-colors font-medium disabled:opacity-50"
                                              >
                                                {cancelLoading ? "…" : "❌ Отменить заказ"}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Orders-without-receipts inline panel */}
                          {scenario.id === "orders-without-receipts" && (noReceiptResult || lastRun?.summary) && (() => {
                            const data = noReceiptResult ?? (lastRun?.summary as any ?? null);
                            const allCritical: any[] = data?.critical ?? [];
                            const warning: any[] = data?.warning ?? [];
                            const superCriticalItems = allCritical.filter((e: any) => e.hoursWithoutReceipt >= 72);
                            const criticalItems = allCritical.filter((e: any) => e.hoursWithoutReceipt < 72);
                            const total = allCritical.length + warning.length;
                            const allItems = [...superCriticalItems, ...criticalItems, ...warning];

                            return (
                              <div className="space-y-2">
                                {/* 4 summary cards */}
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div className="rounded-lg px-2.5 py-2 bg-red-100/80 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 text-center">
                                    <p className="text-[11px] text-red-500 font-semibold">⚫ 72ч+</p>
                                    <p className="text-base font-bold text-red-700 dark:text-red-400">{superCriticalItems.length}</p>
                                  </div>
                                  <div className="rounded-lg px-2.5 py-2 bg-orange-100/80 dark:bg-orange-950/30 border border-orange-200/60 dark:border-orange-800/40 text-center">
                                    <p className="text-[11px] text-orange-500 font-semibold">🔴 48-72ч</p>
                                    <p className="text-base font-bold text-orange-700 dark:text-orange-400">{criticalItems.length}</p>
                                  </div>
                                  <div className="rounded-lg px-2.5 py-2 bg-yellow-100/80 dark:bg-yellow-950/30 border border-yellow-200/60 dark:border-yellow-800/40 text-center">
                                    <p className="text-[11px] text-yellow-600 font-semibold">🟡 24-48ч</p>
                                    <p className="text-base font-bold text-yellow-700 dark:text-yellow-400">{warning.length}</p>
                                  </div>
                                  <div className="rounded-lg px-2.5 py-2 bg-amber-100/80 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 text-center">
                                    <p className="text-[11px] text-amber-600 font-semibold">📋 Всего</p>
                                    <p className="text-base font-bold text-amber-700 dark:text-amber-400">{total}</p>
                                  </div>
                                </div>

                                {/* Refresh + send-all row */}
                                <div className="flex items-center gap-2 text-xs">
                                  {total === 0 && (
                                    <span className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold">✅ Все сметы отправлены</span>
                                  )}
                                  {total > 0 && noReceiptSendAllState === "idle" && (
                                    <button
                                      onClick={() => setNoReceiptSendAllState("confirm")}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:opacity-80 transition-colors font-semibold"
                                    >
                                      📨 Отправить всем
                                    </button>
                                  )}
                                  {total > 0 && noReceiptSendAllState === "confirm" && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Отправить {total} мастерам?</span>
                                      <button
                                        onClick={handleNoReceiptSendAll}
                                        className="px-2 py-0.5 rounded-lg bg-amber-500 text-white font-semibold hover:opacity-80 transition-colors"
                                      >
                                        Да
                                      </button>
                                      <button
                                        onClick={() => setNoReceiptSendAllState("idle")}
                                        className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        Нет
                                      </button>
                                    </div>
                                  )}
                                  {noReceiptSendAllState === "loading" && (
                                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                                      <Loader2 className="w-3 h-3 animate-spin" /> Отправляю...
                                    </span>
                                  )}
                                  <button onClick={fetchNoReceiptLive} disabled={noReceiptLiveLoading}
                                    className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                                    <RefreshCw className={`w-3 h-3 ${noReceiptLiveLoading ? "animate-spin" : ""}`} />
                                    <span>Обновить</span>
                                  </button>
                                </div>

                                {/* Orders table */}
                                {allItems.length > 0 && (
                                  <div className="rounded-xl border border-border overflow-hidden">
                                    <div className="divide-y divide-border max-h-96 overflow-y-auto">
                                      {allItems.map((entry: any) => {
                                        const hours = entry.hoursWithoutReceipt ?? 0;
                                        const isSuper = hours >= 72;
                                        const isCrit = hours >= 48 && hours < 72;
                                        const msgLoading = noReceiptActionLoading[entry.orderId] === "message";
                                        const reassignLoading = noReceiptActionLoading[entry.orderId] === "reassign";
                                        const cancelLoading = noReceiptActionLoading[entry.orderId] === "cancel";
                                        const msgSent = noReceiptMsgSent.has(entry.orderId);
                                        const rowBg = isSuper
                                          ? "bg-red-50/70 dark:bg-red-950/20"
                                          : isCrit
                                          ? "bg-orange-50/50 dark:bg-orange-950/10"
                                          : "bg-yellow-50/30 dark:bg-yellow-950/5";

                                        return (
                                          <div key={entry.orderId} className={`px-3 py-2.5 ${rowBg}`}>
                                            <div className="flex items-start gap-2 flex-wrap">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className={`text-xs font-bold ${isSuper ? "text-red-700 dark:text-red-400" : isCrit ? "text-orange-600 dark:text-orange-400" : "text-yellow-700 dark:text-yellow-400"}`}>
                                                    {isSuper ? "⚫" : isCrit ? "🔴" : "🟡"} #{entry.orderId}
                                                  </span>
                                                  <span className="text-xs text-muted-foreground">{entry.serviceType}</span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                  {entry.masterAlias} · {entry.district || entry.city}
                                                </p>
                                                <p className="text-[11px] font-medium mt-0.5 text-orange-600 dark:text-orange-400">
                                                  {hours}ч без сметы · назначен {new Date(entry.assignedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                                                </p>
                                              </div>
                                            </div>

                                            {/* Action buttons */}
                                            <div className="flex gap-1 flex-wrap mt-2">
                                              <button
                                                onClick={() => handleNoReceiptMessage(entry.orderId)}
                                                disabled={!!noReceiptActionLoading[entry.orderId] || msgSent}
                                                className={`text-[10px] px-2 py-1 rounded-lg transition-colors font-medium ${
                                                  msgSent
                                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                                    : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:opacity-80"
                                                } disabled:opacity-50`}
                                              >
                                                {msgLoading ? "…" : msgSent ? "✅ Отправлено" : "📱 Написать мастеру"}
                                              </button>
                                              {entry.masterPhone ? (
                                                <button
                                                  onClick={() => setNoReceiptCallModal({ orderId: entry.orderId, masterPhone: entry.masterPhone, masterAlias: entry.masterAlias })}
                                                  className="text-[10px] px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:opacity-80 transition-colors font-medium"
                                                >
                                                  📞 Позвонить мастеру
                                                </button>
                                              ) : null}
                                              <button
                                                onClick={() => setNoReceiptConfirm({ orderId: entry.orderId, type: "reassign", masterAlias: entry.masterAlias })}
                                                disabled={!!noReceiptActionLoading[entry.orderId]}
                                                className="text-[10px] px-2 py-1 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:opacity-80 transition-colors font-medium disabled:opacity-50"
                                              >
                                                {reassignLoading ? "…" : "🔄 Переназначить"}
                                              </button>
                                              <button
                                                onClick={() => setNoReceiptConfirm({ orderId: entry.orderId, type: "cancel", masterAlias: entry.masterAlias })}
                                                disabled={!!noReceiptActionLoading[entry.orderId]}
                                                className="text-[10px] px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:opacity-80 transition-colors font-medium disabled:opacity-50"
                                              >
                                                {cancelLoading ? "…" : "❌ Отменить заказ"}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Diagnostics live panel */}
                          {scenario.id === "order-diagnostics" && (() => {
                            const data = diagLiveResult ?? (diagResult ?? null);
                            const allCritical = data?.critical ?? [];
                            const allWarning = data?.warning ?? [];
                            const allOk = data?.ok ?? [];
                            const total = allCritical.length + allWarning.length + allOk.length;
                            const allItems = [...allCritical, ...allWarning];
                            return (
                              <div className="space-y-3">
                                {/* Stats cards */}
                                <div className="grid grid-cols-4 gap-1.5">
                                  <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/30 px-2 py-2 text-center">
                                    <p className="text-[10px] text-red-500 dark:text-red-400 font-medium">🔴 Критично</p>
                                    <p className="text-base font-bold text-red-700 dark:text-red-400">{allCritical.length}</p>
                                  </div>
                                  <div className="rounded-xl bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-100 dark:border-yellow-900/30 px-2 py-2 text-center">
                                    <p className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium">🟡 Внимание</p>
                                    <p className="text-base font-bold text-yellow-700 dark:text-yellow-400">{allWarning.length}</p>
                                  </div>
                                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 px-2 py-2 text-center">
                                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">🟢 Норма</p>
                                    <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">{allOk.length}</p>
                                  </div>
                                  <div className="rounded-xl bg-muted/50 border border-border px-2 py-2 text-center">
                                    <p className="text-[10px] text-muted-foreground font-medium">📋 Всего</p>
                                    <p className="text-base font-bold">{total}</p>
                                  </div>
                                </div>

                                {/* Refresh row */}
                                <div className="flex items-center gap-2 text-xs">
                                  {total === 0 && data && (
                                    <span className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold">✅ Все заказы в норме</span>
                                  )}
                                  <button onClick={fetchDiagLive} disabled={diagLiveLoading}
                                    className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                                    <RefreshCw className={`w-3 h-3 ${diagLiveLoading ? "animate-spin" : ""}`} />
                                    <span>Обновить</span>
                                  </button>
                                </div>

                                {/* Orders with problems */}
                                {allItems.length > 0 && (
                                  <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                                    {allItems.map(entry => {
                                      const isCrit = entry.risk === "critical";
                                      const msgSent = diagMsgSent.has(entry.orderId);
                                      return (
                                        <div key={entry.orderId} className={`px-3 py-2.5 ${isCrit ? "bg-red-50/40 dark:bg-red-950/10" : "bg-yellow-50/20 dark:bg-yellow-950/10"}`}>
                                          <div className="flex items-start gap-2">
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-xs font-semibold">#{entry.orderId}</span>
                                                <span className="text-xs text-muted-foreground">{entry.serviceType}</span>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${entry.status === "master_assigned" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"}`}>
                                                  {entry.status === "master_assigned" ? "Назначен" : "В работе"}
                                                </span>
                                              </div>
                                              <p className="text-[11px] text-muted-foreground mt-0.5">{entry.masterAlias} · {entry.district || entry.city}</p>
                                              <div className="mt-1.5 space-y-1">
                                                {entry.reasons.map((r, i) => (
                                                  <div key={i} className="space-y-0.5">
                                                    <p className={`text-[11px] font-medium ${isCrit ? "text-red-600 dark:text-red-400" : "text-yellow-700 dark:text-yellow-400"}`}>
                                                      {isCrit ? "🔴" : "🟡"} {r.text}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground pl-3">💡 {r.recommendation}</p>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          </div>
                                          {entry.maxChatId && (
                                            <div className="mt-2 flex gap-1.5">
                                              <button
                                                onClick={() => handleMessageMaster(entry.orderId)}
                                                disabled={messagingOrderId === entry.orderId || msgSent}
                                                className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-opacity disabled:opacity-50 ${msgSent ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : isCrit ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:opacity-80" : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:opacity-80"}`}
                                              >
                                                {messagingOrderId === entry.orderId ? "…" : msgSent ? "✓ Отправлено" : "📨 Написать мастеру"}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* History toggle */}
                          <button
                            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
                            onClick={async () => {
                              if (!logsOpen) {
                                fetchScenarioLogs(scenario.id);
                                setExpandedLogs(scenario.id);
                              } else {
                                setExpandedLogs(null);
                              }
                            }}
                          >
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3" />
                              История запусков
                            </span>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${logsOpen ? "rotate-180" : ""}`} />
                          </button>

                          {logsOpen && (
                            <div className="rounded-xl border border-border overflow-hidden">
                              {logs.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-3 py-3 text-center">Нет запусков</p>
                              ) : (
                                <div className="divide-y divide-border max-h-48 overflow-y-auto">
                                  {logs.map(log => (
                                    <div key={log.id} className="px-3 py-2 flex items-center gap-2">
                                      {log.status === "success"
                                        ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                        : <span className="text-[10px] text-red-500 font-medium shrink-0">ERR</span>
                                      }
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[11px] truncate">
                                          {log.run_type === "auto" ? "🤖 Авто" : "▶ Ручной"} · {new Date(log.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                        </p>
                                        {log.error_text && <p className="text-[10px] text-red-500 truncate">{log.error_text}</p>}
                                      </div>
                                      <span className="text-[10px] text-muted-foreground shrink-0">{formatDuration(log.duration_ms)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 pb-4">
                          <Button
                            className={`w-full gap-2 bg-gradient-to-r ${colorClass} hover:opacity-90 text-white`}
                            onClick={() => handleRunTemplate(scenario.id)}
                            disabled={isRunning}
                          >
                            {isRunning
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> Запускаю...</>
                              : <><Play className="w-4 h-4" /> Запустить</>
                            }
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

              {/* ── Scrollable area: session list ── */}
              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">

              {/* Sessions list */}
              <div className="flex-1 min-h-0">
                <div className="px-4 py-2 flex items-center justify-between border-b border-border">
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
              </div>{/* end scrollable wrapper */}
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
                onClick={() => executeRunScenario(confirmScenario.id, scenarioDays[confirmScenario.id] ?? 7)}
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
      {/* ── Payment-reminders: call modal ── */}
      {paymentCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <span className="text-xl">📞</span>
                </div>
                <div>
                  <p className="font-bold text-sm">{paymentCallModal.clientName}</p>
                  <p className="text-xs text-muted-foreground">Заказ #{paymentCallModal.orderId}</p>
                </div>
              </div>
              <button onClick={() => setPaymentCallModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <a
              href={`tel:${paymentCallModal.clientPhone}`}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
            >
              <span>📞</span>
              {paymentCallModal.clientPhone}
            </a>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Что сказал клиент?</Label>
              <Textarea
                placeholder="Комментарий по звонку..."
                value={paymentCallComment[paymentCallModal.orderId] ?? ""}
                onChange={e => setPaymentCallComment(p => ({ ...p, [paymentCallModal.orderId]: e.target.value }))}
                className="text-sm resize-none"
                rows={3}
              />
              <Button
                size="sm"
                className="w-full"
                variant={paymentCommentSaved.has(paymentCallModal.orderId) ? "outline" : "default"}
                onClick={() => {
                  setPaymentCommentSaved(prev => new Set(prev).add(paymentCallModal.orderId));
                  toast({ title: "Комментарий сохранён ✓" });
                }}
              >
                {paymentCommentSaved.has(paymentCallModal.orderId) ? "✅ Сохранено" : "Сохранить комментарий"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment-reminders: confirm dialog ── */}
      {paymentConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            {paymentConfirm.type === "return-to-pool" ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <span className="text-xl">🔄</span>
                  </div>
                  <div>
                    <p className="font-bold text-sm">Вернуть заказ в пул?</p>
                    <p className="text-xs text-muted-foreground">Заказ #{paymentConfirm.orderId}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Мастер <strong>{paymentConfirm.masterAlias}</strong> получит уведомление в Max о возврате заказа в пул.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setPaymentConfirm(null)}>Отмена</Button>
                  <Button
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={() => handlePaymentReturnToPool(paymentConfirm.orderId)}
                    disabled={paymentActionLoading[paymentConfirm.orderId] === "pool"}
                  >
                    {paymentActionLoading[paymentConfirm.orderId] === "pool" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Да, вернуть"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <span className="text-xl">❌</span>
                  </div>
                  <div>
                    <p className="font-bold text-sm">Отменить заказ #{paymentConfirm.orderId}?</p>
                    <p className="text-xs text-muted-foreground">Это действие нельзя отменить</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Мастер <strong>{paymentConfirm.masterAlias}</strong> получит уведомление в Max об отмене заказа.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setPaymentConfirm(null)}>Нет</Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handlePaymentCancel(paymentConfirm.orderId)}
                    disabled={paymentActionLoading[paymentConfirm.orderId] === "cancel"}
                  >
                    {paymentActionLoading[paymentConfirm.orderId] === "cancel" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Да, отменить"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Orders-without-receipts: call modal ── */}
      {noReceiptCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <span className="text-xl">📞</span>
                </div>
                <div>
                  <p className="font-bold text-sm">{noReceiptCallModal.masterAlias}</p>
                  <p className="text-xs text-muted-foreground">Заказ #{noReceiptCallModal.orderId}</p>
                </div>
              </div>
              <button onClick={() => setNoReceiptCallModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <a
              href={`tel:${noReceiptCallModal.masterPhone}`}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
            >
              <span>📞</span>
              {noReceiptCallModal.masterPhone}
            </a>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Комментарий по звонку</Label>
              <Textarea
                placeholder="Что сказал мастер?..."
                value={noReceiptCallComment[noReceiptCallModal.orderId] ?? ""}
                onChange={e => setNoReceiptCallComment(p => ({ ...p, [noReceiptCallModal.orderId]: e.target.value }))}
                className="text-sm resize-none"
                rows={3}
              />
              <Button
                size="sm"
                className="w-full"
                variant={noReceiptCommentSaved.has(noReceiptCallModal.orderId) ? "outline" : "default"}
                onClick={() => {
                  setNoReceiptCommentSaved(prev => new Set(prev).add(noReceiptCallModal.orderId));
                  toast({ title: "Комментарий сохранён ✓" });
                }}
              >
                {noReceiptCommentSaved.has(noReceiptCallModal.orderId) ? "✅ Сохранено" : "Сохранить комментарий"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Orders-without-receipts confirm dialog ── */}
      {noReceiptConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            {noReceiptConfirm.type === "reassign" ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <span className="text-xl">🔄</span>
                  </div>
                  <div>
                    <p className="font-bold text-sm">Переназначить заказ?</p>
                    <p className="text-xs text-muted-foreground">Заказ #{noReceiptConfirm.orderId}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Мастер <strong>{noReceiptConfirm.masterAlias}</strong> получит уведомление о переназначении заказа.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setNoReceiptConfirm(null)}>
                    Отмена
                  </Button>
                  <Button
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                    onClick={() => handleNoReceiptReassign(noReceiptConfirm.orderId)}
                    disabled={!!noReceiptActionLoading[noReceiptConfirm.orderId]}
                  >
                    {noReceiptActionLoading[noReceiptConfirm.orderId] ? <Loader2 className="w-4 h-4 animate-spin" /> : "Да, переназначить"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <span className="text-xl">❌</span>
                  </div>
                  <div>
                    <p className="font-bold text-sm">Отменить заказ #{noReceiptConfirm.orderId}?</p>
                    <p className="text-xs text-muted-foreground">Это действие нельзя отменить</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Мастер <strong>{noReceiptConfirm.masterAlias}</strong> получит уведомление в Max об отмене заказа.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setNoReceiptConfirm(null)}>Нет</Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleNoReceiptCancel(noReceiptConfirm.orderId)}
                    disabled={!!noReceiptActionLoading[noReceiptConfirm.orderId]}
                  >
                    {noReceiptActionLoading[noReceiptConfirm.orderId] ? <Loader2 className="w-4 h-4 animate-spin" /> : "Да, отменить"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </AppLayout>
  );
}
