import { useState } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  CheckCircle2, XCircle, Clock, RefreshCw, ChevronLeft, ChevronRight,
  Send, Users, MapPin, BotMessageSquare, AlarmClock, Save, Bell,
  MessageSquare, ChevronDown, ChevronUp, Download, Flame, Filter,
  AlertTriangle, TrendingUp, TrendingDown, Minus, BarChart2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryDay {
  date: string;
  isAvailable: boolean | null;
  reason: string | null;
  respondedAt: string | null;
}

interface CheckinMaster {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  maxChatId: string | null;
  checkin: { id: number; isAvailable: boolean | null; reason: string | null; respondedAt: string | null } | null;
  streak: number;
  responseRate: number;
  avgResponseTime: string | null;
  history: HistoryDay[];
}

interface CheckinsResponse {
  date: string;
  masters: CheckinMaster[];
  summary: { ready: number; notReady: number; noResponse: number; total: number };
}

interface StatsResponse {
  totalActive: number;
  connectedToMax: number;
  last7dTotal: number;
  last7dResponded: number;
  last7dReady: number;
  todayReady: number;
  lastWeekReady: number;
}

interface MonthlyDay {
  date: string;
  ready: number;
  notReady: number;
  noResponse: number;
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function pct(a: number, b: number): string {
  if (!b) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}

function getLast14Days(): string[] {
  const days: string[] = [];
  const cur = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(cur);
    d.setDate(d.getDate() - i);
    days.push(toDateStr(d));
  }
  return days;
}

const REASON_LABELS: Record<string, string> = {
  vacation: "🏖 Отпуск",
  sick: "🤒 Болезнь",
  busy: "🔧 На объекте",
  other: "🔘 Другое",
};

function exportCsv(date: string, masters: CheckinMaster[]) {
  const header = "Псевдоним,Город,Специализация,Статус,Причина,Время ответа";
  const rows = masters.map((m) => {
    const status = !m.checkin || m.checkin.respondedAt === null
      ? "Нет ответа"
      : m.checkin.isAvailable === true ? "Готов" : "Не готов";
    const reason = m.checkin?.reason ? (REASON_LABELS[m.checkin.reason] ?? m.checkin.reason) : "";
    const time = m.checkin?.respondedAt
      ? format(new Date(m.checkin.respondedAt), "HH:mm", { locale: ru })
      : "";
    return [m.alias, m.city || "", m.specialization || "", status, reason, time]
      .map((v) => `"${v.replace(/"/g, '""')}"`)
      .join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `готовность-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ checkin }: { checkin: CheckinMaster["checkin"] }) {
  if (!checkin || checkin.respondedAt === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        <Clock className="w-3 h-3" /> Нет ответа
      </span>
    );
  }
  if (checkin.isAvailable === true) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" /> Готов
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
      <XCircle className="w-3 h-3" /> Не готов
    </span>
  );
}

function ReasonBadge({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-100">
      {REASON_LABELS[reason] ?? reason}
    </span>
  );
}

// ─── History Mini-Grid ────────────────────────────────────────────────────────

function HistoryGrid({ history }: { history: HistoryDay[] }) {
  const days = getLast14Days();
  const byDate = new Map(history.map((h) => [h.date, h]));
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {days.map((d) => {
        const h = byDate.get(d);
        const label = format(parseISO(d), "d MMM", { locale: ru });
        if (!h || h.respondedAt === null) {
          return <div key={d} title={`${label} — нет ответа`} className="w-4 h-4 rounded-sm bg-gray-200" />;
        }
        if (h.isAvailable === true) {
          return <div key={d} title={`${label} — готов`} className="w-4 h-4 rounded-sm bg-green-400" />;
        }
        return <div key={d} title={`${label} — не готов${h.reason ? ` (${REASON_LABELS[h.reason] ?? h.reason})` : ""}`} className="w-4 h-4 rounded-sm bg-red-300" />;
      })}
      <span className="text-xs text-gray-400 ml-1">14 дн.</span>
    </div>
  );
}

// ─── Streak Badge ─────────────────────────────────────────────────────────────

function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-600" title={`${streak} дней подряд готов`}>
      <Flame className="w-3 h-3" />{streak}
    </span>
  );
}

// ─── Last Week Delta ──────────────────────────────────────────────────────────

function WeekDelta({ today, lastWeek }: { today: number; lastWeek: number }) {
  const diff = today - lastWeek;
  if (diff === 0) return <span className="text-xs text-gray-400 flex items-center gap-0.5"><Minus className="w-3 h-3" />как нед. назад</span>;
  if (diff > 0) return <span className="text-xs text-green-600 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" />+{diff} vs нед. назад</span>;
  return <span className="text-xs text-red-500 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" />{diff} vs нед. назад</span>;
}

// ─── Monthly Chart ────────────────────────────────────────────────────────────

function MonthlyChart({ data }: { data: MonthlyDay[] }) {
  const chartData = data.map((d) => ({
    date: format(parseISO(d.date), "d MMM", { locale: ru }),
    "Готовы": d.ready,
    "Не готовы": d.notReady,
    "Нет ответа": d.noResponse,
  }));

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-2 mb-4 text-gray-700">
        <BarChart2 className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-semibold">График за 30 дней</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} barSize={8} barGap={1}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            interval={4}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            cursor={{ fill: "#f3f4f6" }}
          />
          <Bar dataKey="Готовы" stackId="a" fill="#4ade80" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Не готовы" stackId="a" fill="#f87171" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Нет ответа" stackId="a" fill="#d1d5db" radius={[2, 2, 0, 0]} />
          <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckinsPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <CheckinsContent />
      </Layout>
    </ProtectedRoute>
  );
}

function CheckinsContent() {
  const [date, setDate] = useState(toDateStr(new Date()));
  const [editTime, setEditTime] = useState<string | null>(null);
  const [editReminderTime, setEditReminderTime] = useState<string | null>(null);
  const [localReminderEnabled, setLocalReminderEnabled] = useState<boolean | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [showChart, setShowChart] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [rowLimit, setRowLimit] = useState<number | null>(10);

  function toggleSection(label: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<CheckinsResponse>({
    queryKey: ["/api/masters/checkins", date],
    queryFn: async () => {
      const res = await fetch(`/api/masters/checkins?date=${date}`, { credentials: "include" });
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json();
    },
  });

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["/api/masters/checkins/stats"],
    queryFn: async () => {
      const res = await fetch("/api/masters/checkins/stats", { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const { data: monthly } = useQuery<MonthlyDay[]>({
    queryKey: ["/api/masters/checkins/monthly"],
    queryFn: async () => {
      const res = await fetch("/api/masters/checkins/monthly", { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: showChart,
  });

  const { data: config } = useQuery<{ broadcastTime: string; reminderTime: string; reminderEnabled: boolean }>({
    queryKey: ["/api/masters/checkins/config"],
    queryFn: async () => {
      const res = await fetch("/api/masters/checkins/config", { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: (d) => {
      if (editTime === null) setEditTime(d.broadcastTime);
      if (editReminderTime === null) setEditReminderTime(d.reminderTime);
      if (localReminderEnabled === null) setLocalReminderEnabled(d.reminderEnabled);
    },
  } as any);

  const saveTimeMutation = useMutation({
    mutationFn: async (broadcastTime: string) => {
      const res = await fetch("/api/masters/checkins/config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ broadcastTime }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/masters/checkins/config"] }); toast({ title: "Время рассылки сохранено" }); },
    onError: () => toast({ title: "Ошибка сохранения", variant: "destructive" }),
  });

  const saveReminderMutation = useMutation({
    mutationFn: async (payload: { reminderTime: string; reminderEnabled: boolean }) => {
      const res = await fetch("/api/masters/checkins/config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/masters/checkins/config"] }); toast({ title: "Настройки напоминания сохранены" }); },
    onError: () => toast({ title: "Ошибка сохранения", variant: "destructive" }),
  });

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/masters/checkins/broadcast", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => { toast({ title: "Рассылка запущена" }); setTimeout(() => refetch(), 3000); },
    onError: () => toast({ title: "Ошибка рассылки", variant: "destructive" }),
  });

  const nudgeMutation = useMutation({
    mutationFn: async (masterId: number) => {
      const res = await fetch(`/api/masters/checkins/nudge/${masterId}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => toast({ title: "Напоминание отправлено" }),
    onError: () => toast({ title: "Не удалось отправить", variant: "destructive" }),
  });

  const overrideMutation = useMutation({
    mutationFn: async ({ masterId, isAvailable }: { masterId: number; isAvailable: boolean }) => {
      const res = await fetch(`/api/masters/${masterId}/checkin`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ date, isAvailable }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => { toast({ title: "Статус обновлён" }); qc.invalidateQueries({ queryKey: ["/api/masters/checkins", date] }); },
    onError: () => toast({ title: "Ошибка обновления", variant: "destructive" }),
  });

  const isToday = date === toDateStr(new Date());
  const displayDate = (() => {
    try { return format(parseISO(date), "d MMMM yyyy", { locale: ru }); }
    catch { return date; }
  })();

  const allCities = Array.from(new Set((data?.masters ?? []).map((m) => m.city).filter(Boolean))).sort();
  const filteredMasters = (data?.masters ?? []).filter((m) => cityFilter === "all" || m.city === cityFilter);

  const ready      = filteredMasters.filter((m) => m.checkin?.isAvailable === true);
  const notReady   = filteredMasters.filter((m) => m.checkin?.isAvailable === false);
  const noResponse = filteredMasters.filter((m) => !m.checkin || m.checkin.respondedAt === null);

  const currentTime = editTime ?? config?.broadcastTime ?? "07:00";
  const timeChanged = config?.broadcastTime !== undefined && currentTime !== config.broadcastTime;
  const currentReminderTime = editReminderTime ?? config?.reminderTime ?? "12:00";
  const reminderEnabledVal = localReminderEnabled ?? config?.reminderEnabled ?? false;
  const reminderChanged = config !== undefined && (currentReminderTime !== config.reminderTime || reminderEnabledVal !== config.reminderEnabled);

  // Alert: today + more than half not responded
  const showAlert = isToday && data && data.summary.total > 0 && noResponse.length > 0 && noResponse.length >= ready.length;

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Готовность мастеров</h1>
        <p className="text-sm text-gray-500 mt-0.5">Ежедневный отчёт — кто готов принимать заказы</p>
      </div>

      {/* Stats + time config row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <BotMessageSquare className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold">Подключение к Max</span>
          </div>
          {stats ? (
            <>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold text-gray-900">{stats.connectedToMax}</span>
                <span className="text-sm text-gray-400 mb-1">/ {stats.totalActive} активных</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: pct(stats.connectedToMax, stats.totalActive) }} />
              </div>
              <p className="text-xs text-gray-500">{pct(stats.connectedToMax, stats.totalActive)} мастеров подключены к боту</p>
              <div className="pt-1 border-t border-gray-50 grid grid-cols-2 gap-2 text-xs text-gray-500">
                <div>
                  <p className="font-medium text-gray-700">{pct(stats.last7dResponded, stats.last7dTotal)}</p>
                  <p>отвечают за 7 дней</p>
                </div>
                <div>
                  <p className="font-medium text-green-600">{pct(stats.last7dReady, stats.last7dTotal)}</p>
                  <p>готовы в среднем</p>
                </div>
              </div>
            </>
          ) : (
            <div className="h-16 flex items-center"><RefreshCw className="w-4 h-4 animate-spin text-gray-300" /></div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <AlarmClock className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-semibold">Время рассылки (МСК)</span>
          </div>
          <p className="text-xs text-gray-500">Каждый день бот автоматически опрашивает мастеров в заданное время</p>
          <div className="flex items-center gap-3">
            <input type="time" value={currentTime} onChange={(e) => setEditTime(e.target.value)}
              className="h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 w-32" />
            <button onClick={() => saveTimeMutation.mutate(currentTime)} disabled={!timeChanged || saveTimeMutation.isPending}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium transition-colors hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed">
              <Save className="w-3.5 h-3.5" />
              {saveTimeMutation.isPending ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
          {config && !timeChanged && (
            <p className="text-xs text-gray-400">Текущее время: <span className="font-medium text-gray-600">{config.broadcastTime} МСК</span></p>
          )}
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-gray-700">
                <Bell className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold">Напоминание не ответившим</span>
              </div>
              <button onClick={() => setLocalReminderEnabled(!reminderEnabledVal)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${reminderEnabledVal ? "bg-amber-500" : "bg-gray-200"}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${reminderEnabledVal ? "translate-x-4" : "translate-x-1"}`} />
              </button>
            </div>
            {reminderEnabledVal && (
              <div className="flex items-center gap-3">
                <input type="time" value={currentReminderTime} onChange={(e) => setEditReminderTime(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 w-28" />
                <span className="text-xs text-gray-400">МСК</span>
              </div>
            )}
            <button onClick={() => saveReminderMutation.mutate({ reminderTime: currentReminderTime, reminderEnabled: reminderEnabledVal })}
              disabled={!reminderChanged || saveReminderMutation.isPending}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-500 text-white text-xs font-medium transition-colors hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed">
              <Save className="w-3 h-3" />
              {saveReminderMutation.isPending ? "Сохраняю…" : "Сохранить напоминание"}
            </button>
          </div>
          <div className="pt-2 border-t border-gray-50">
            <button onClick={() => broadcastMutation.mutate()} disabled={broadcastMutation.isPending}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50">
              <Send className="w-3.5 h-3.5" />
              {broadcastMutation.isPending ? "Отправляю…" : "Разослать прямо сейчас"}
            </button>
          </div>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-base font-semibold text-gray-800">{displayDate}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(toDateStr(addDays(new Date(date), -1)))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={date} max={toDateStr(new Date())} onChange={(e) => setDate(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => setDate(toDateStr(addDays(new Date(date), 1)))} disabled={isToday}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => refetch()} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors" title="Обновить">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Daily summary cards with last-week delta */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Всего с ботом", value: data.summary.total,     color: "bg-gray-50 text-gray-700",   icon: Users,         delta: null },
            { label: "Готовы",        value: data.summary.ready,      color: "bg-green-50 text-green-700", icon: CheckCircle2,  delta: stats ? { today: stats.todayReady, lastWeek: stats.lastWeekReady } : null },
            { label: "Не готовы",     value: data.summary.notReady,   color: "bg-red-50 text-red-600",     icon: XCircle,       delta: null },
            { label: "Нет ответа",    value: data.summary.noResponse, color: "bg-amber-50 text-amber-700", icon: Clock,         delta: null },
          ].map(({ label, value, color, icon: Icon, delta }) => (
            <div key={label} className={`rounded-xl px-4 py-3 ${color}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" />
                <p className="text-xs font-medium opacity-80">{label}</p>
              </div>
              <p className="text-2xl font-bold">{value}</p>
              {delta && isToday && (
                <div className="mt-1">
                  <WeekDelta today={delta.today} lastWeek={delta.lastWeek} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Alert: low readiness */}
      {showAlert && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Мало готовых мастеров</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Сегодня готовы {ready.length} из {data?.summary.total}, ещё {noResponse.length} не ответили.
            </p>
          </div>
          <button
            onClick={() => broadcastMutation.mutate()}
            disabled={broadcastMutation.isPending}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {broadcastMutation.isPending ? "Отправляю…" : "Напомнить всем"}
          </button>
        </div>
      )}

      {/* City breakdown */}
      {data && allCities.length > 1 && (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-center gap-2 mb-3 text-gray-700">
            <MapPin className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold">Разбивка по городам</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allCities.map((city) => {
              const cityMasters = data.masters.filter((m) => m.city === city);
              const cityReady = cityMasters.filter((m) => m.checkin?.isAvailable === true).length;
              return (
                <div key={city} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs font-semibold text-gray-700 truncate">{city}</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{cityReady}<span className="text-xs font-normal text-gray-400"> / {cityMasters.length}</span></p>
                  <p className="text-xs text-gray-500">готовы</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly chart toggle */}
      <div>
        <button
          onClick={() => setShowChart((v) => !v)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <BarChart2 className="w-4 h-4" />
          {showChart ? "Скрыть график" : "График за 30 дней"}
          {showChart ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showChart && monthly && monthly.length > 0 && (
          <div className="mt-3">
            <MonthlyChart data={monthly} />
          </div>
        )}
        {showChart && !monthly && (
          <div className="mt-3 flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-gray-300" /></div>
        )}
      </div>

      {/* Master list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : !data || data.masters.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Нет мастеров с подключённым Max-ботом</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Filters + Export */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              <button onClick={() => setCityFilter("all")}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${cityFilter === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                Все города
              </button>
              {allCities.map((city) => (
                <button key={city} onClick={() => setCityFilter(city === cityFilter ? "all" : city)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${cityFilter === city ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {city}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {/* Row limit switcher */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                {([5, 10, null] as (number | null)[]).map((limit) => (
                  <button
                    key={limit ?? "all"}
                    onClick={() => setRowLimit(limit)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${rowLimit === limit ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    {limit ?? "Все"}
                  </button>
                ))}
              </div>
              <button onClick={() => exportCsv(date, filteredMasters)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                <Download className="w-3.5 h-3.5" />
                Экспорт CSV
              </button>
            </div>
          </div>

          {[
            { label: "✅ Готовы к заказам",  items: ready,      emptyText: "Никто пока не ответил «Готов»" },
            { label: "❌ Не готовы сегодня", items: notReady,   emptyText: "Нет отказов" },
            { label: "⏳ Нет ответа",        items: noResponse, emptyText: "Все ответили" },
          ].map(({ label, items, emptyText }) => {
            const isCollapsed = collapsedSections.has(label);
            const visibleItems = rowLimit !== null ? items.slice(0, rowLimit) : items;
            const hiddenCount = items.length - visibleItems.length;
            return (
            <div key={label}>
              <button
                onClick={() => toggleSection(label)}
                className="flex items-center gap-1.5 mb-2 group w-full text-left"
              >
                <h2 className="text-sm font-semibold text-gray-600">
                  {label} <span className="font-normal text-gray-400">({items.length})</span>
                </h2>
                {isCollapsed
                  ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" />
                  : <ChevronUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" />
                }
              </button>
              {!isCollapsed && (items.length === 0 ? (
                <p className="text-xs text-gray-400 pl-1">{emptyText}</p>
              ) : (
                <>
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {visibleItems.map((m, i) => (
                        <>
                          <tr
                            key={m.id}
                            onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                            className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/30 transition-colors cursor-pointer`}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-gray-900">{m.alias}</span>
                                <StreakBadge streak={m.streak} />
                                {expandedId === m.id
                                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                }
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0" />{m.city || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <StatusBadge checkin={m.checkin} />
                                {m.checkin?.isAvailable === false && <ReasonBadge reason={m.checkin.reason} />}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-gray-400 text-xs hidden md:table-cell">
                              {m.checkin?.respondedAt
                                ? format(new Date(m.checkin.respondedAt), "HH:mm", { locale: ru })
                                : "—"}
                            </td>
                            <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1.5 justify-end">
                                {m.checkin?.isAvailable !== true && (
                                  <button onClick={() => overrideMutation.mutate({ masterId: m.id, isAvailable: true })}
                                    disabled={overrideMutation.isPending} title="Отметить как Готов"
                                    className="p-1 rounded-md text-green-600 hover:bg-green-50 transition-colors disabled:opacity-40">
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                )}
                                {m.checkin?.isAvailable !== false && (
                                  <button onClick={() => overrideMutation.mutate({ masterId: m.id, isAvailable: false })}
                                    disabled={overrideMutation.isPending} title="Отметить как Не готов"
                                    className="p-1 rounded-md text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                )}
                                {(!m.checkin || m.checkin.respondedAt === null) && (
                                  <button onClick={() => nudgeMutation.mutate(m.id)}
                                    disabled={nudgeMutation.isPending} title="Напомнить в Max"
                                    className="p-1 rounded-md text-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-40">
                                    <MessageSquare className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded history row */}
                          {expandedId === m.id && (
                            <tr key={`${m.id}-history`} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                              <td colSpan={5} className="px-4 pb-3 pt-0">
                                <div className="border-t border-gray-100 pt-2.5 space-y-2.5">
                                  <div className="flex items-center gap-4 text-xs text-gray-600 flex-wrap">
                                    <span>
                                      Отвечает <span className="font-semibold text-gray-800">{m.responseRate}%</span> дней
                                    </span>
                                    {m.avgResponseTime && (
                                      <span>
                                        Обычно в <span className="font-semibold text-gray-800">{m.avgResponseTime}</span>
                                      </span>
                                    )}
                                    {m.streak >= 2 && (
                                      <span className="flex items-center gap-1 text-orange-600">
                                        <Flame className="w-3 h-3" /> {m.streak} дней подряд готов
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-400 font-medium mb-1.5">История последних 14 дней</p>
                                    <HistoryGrid history={m.history} />
                                  </div>
                                  <div className="flex gap-3 text-xs text-gray-400">
                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> Готов</span>
                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> Не готов</span>
                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" /> Нет ответа</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hiddenCount > 0 && (
                  <button
                    onClick={() => setRowLimit(null)}
                    className="w-full text-xs text-gray-400 hover:text-blue-600 py-2 text-center transition-colors"
                  >
                    + ещё {hiddenCount} {hiddenCount === 1 ? "мастер" : hiddenCount < 5 ? "мастера" : "мастеров"}
                  </button>
                )}
                </>
              ))}
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
