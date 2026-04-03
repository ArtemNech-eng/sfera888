import { useState } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  CheckCircle2, XCircle, Clock, RefreshCw, ChevronLeft, ChevronRight,
  Send, Users, MapPin, Wrench, BotMessageSquare, AlarmClock, TrendingUp, Save,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckinMaster {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  maxChatId: string | null;
  checkin: { id: number; isAvailable: boolean | null; respondedAt: string | null } | null;
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
  const { toast } = useToast();
  const qc = useQueryClient();

  // Daily report
  const { data, isLoading, refetch } = useQuery<CheckinsResponse>({
    queryKey: ["/api/masters/checkins", date],
    queryFn: async () => {
      const res = await fetch(`/api/masters/checkins?date=${date}`, { credentials: "include" });
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json();
    },
  });

  // Stats
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["/api/masters/checkins/stats"],
    queryFn: async () => {
      const res = await fetch("/api/masters/checkins/stats", { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  // Broadcast time config
  const { data: config } = useQuery<{ broadcastTime: string }>({
    queryKey: ["/api/masters/checkins/config"],
    queryFn: async () => {
      const res = await fetch("/api/masters/checkins/config", { credentials: "include" });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: (d) => {
      if (editTime === null) setEditTime(d.broadcastTime);
    },
  } as any);

  // Save broadcast time
  const saveTimeMutation = useMutation({
    mutationFn: async (broadcastTime: string) => {
      const res = await fetch("/api/masters/checkins/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ broadcastTime }),
      });
      if (!res.ok) throw new Error("Ошибка");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/masters/checkins/config"] });
      toast({ title: "Время рассылки сохранено" });
    },
    onError: () => toast({ title: "Ошибка сохранения", variant: "destructive" }),
  });

  // Manual broadcast
  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/masters/checkins/broadcast", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Ошибка");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Рассылка запущена", description: "Сообщения отправлены мастерам" });
      setTimeout(() => refetch(), 3000);
    },
    onError: () => toast({ title: "Ошибка", description: "Не удалось запустить рассылку", variant: "destructive" }),
  });

  const isToday = date === toDateStr(new Date());
  const displayDate = (() => {
    try { return format(parseISO(date), "d MMMM yyyy", { locale: ru }); }
    catch { return date; }
  })();

  const ready     = data?.masters.filter((m) => m.checkin?.isAvailable === true)  ?? [];
  const notReady  = data?.masters.filter((m) => m.checkin?.isAvailable === false) ?? [];
  const noResponse = data?.masters.filter((m) => !m.checkin || m.checkin.respondedAt === null) ?? [];

  const currentTime = editTime ?? config?.broadcastTime ?? "07:00";
  const timeChanged = config?.broadcastTime !== undefined && currentTime !== config.broadcastTime;

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Готовность мастеров</h1>
        <p className="text-sm text-gray-500 mt-0.5">Ежедневный отчёт — кто готов принимать заказы</p>
      </div>

      {/* Stats + time config row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Max bot connection stats */}
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

              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: pct(stats.connectedToMax, stats.totalActive) }}
                />
              </div>
              <p className="text-xs text-gray-500">
                {pct(stats.connectedToMax, stats.totalActive)} мастеров подключены к боту
              </p>

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
            <div className="h-16 flex items-center">
              <RefreshCw className="w-4 h-4 animate-spin text-gray-300" />
            </div>
          )}
        </div>

        {/* Broadcast time config */}
        <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <AlarmClock className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-semibold">Время рассылки (МСК)</span>
          </div>

          <p className="text-xs text-gray-500">
            Каждый день бот автоматически опрашивает мастеров в заданное время
          </p>

          <div className="flex items-center gap-3">
            <input
              type="time"
              value={currentTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-400 w-32"
            />
            <button
              onClick={() => saveTimeMutation.mutate(currentTime)}
              disabled={!timeChanged || saveTimeMutation.isPending}
              className="flex items-center gap-1.5 h-10 px-4 rounded-lg bg-violet-600 text-white text-sm font-medium transition-colors hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              {saveTimeMutation.isPending ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>

          {config && !timeChanged && (
            <p className="text-xs text-gray-400">
              Текущее время: <span className="font-medium text-gray-600">{config.broadcastTime} МСК</span>
            </p>
          )}

          <div className="pt-2 border-t border-gray-50">
            <button
              onClick={() => broadcastMutation.mutate()}
              disabled={broadcastMutation.isPending}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
            >
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
          <button
            onClick={() => setDate(toDateStr(addDays(new Date(date), -1)))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={date}
            max={toDateStr(new Date())}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setDate(toDateStr(addDays(new Date(date), 1)))}
            disabled={isToday}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => refetch()} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors" title="Обновить">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Daily summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Всего с ботом", value: data.summary.total,      color: "bg-gray-50 text-gray-700",   icon: Users },
            { label: "Готовы",        value: data.summary.ready,       color: "bg-green-50 text-green-700", icon: CheckCircle2 },
            { label: "Не готовы",     value: data.summary.notReady,    color: "bg-red-50 text-red-600",     icon: XCircle },
            { label: "Нет ответа",    value: data.summary.noResponse,  color: "bg-amber-50 text-amber-700", icon: Clock },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className={`rounded-xl px-4 py-3 ${color}`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" />
                <p className="text-xs font-medium opacity-80">{label}</p>
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Master list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !data || data.masters.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Нет мастеров с подключённым Max-ботом</p>
        </div>
      ) : (
        <div className="space-y-4">
          {[
            { label: "✅ Готовы к заказам",  items: ready,      emptyText: "Никто пока не ответил «Готов»" },
            { label: "❌ Не готовы сегодня", items: notReady,   emptyText: "Нет отказов" },
            { label: "⏳ Нет ответа",        items: noResponse, emptyText: "Все ответили" },
          ].map(({ label, items, emptyText }) => (
            <div key={label}>
              <h2 className="text-sm font-semibold text-gray-600 mb-2">
                {label} <span className="font-normal text-gray-400">({items.length})</span>
              </h2>
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 pl-1">{emptyText}</p>
              ) : (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map((m, i) => (
                        <tr
                          key={m.id}
                          className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/30 transition-colors`}
                        >
                          <td className="px-4 py-2.5 font-medium text-gray-900">{m.alias}</td>
                          <td className="px-4 py-2.5 text-gray-500">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0" />{m.city || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">
                            <span className="flex items-center gap-1">
                              <Wrench className="w-3 h-3 shrink-0" />{m.specialization || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge checkin={m.checkin} />
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs hidden md:table-cell">
                            {m.checkin?.respondedAt
                              ? format(new Date(m.checkin.respondedAt), "HH:mm", { locale: ru })
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
