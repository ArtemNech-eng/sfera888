import { useState } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  CheckCircle2, XCircle, Clock, RefreshCw, ChevronLeft, ChevronRight,
  Send, Users, MapPin, Wrench,
} from "lucide-react";

interface CheckinMaster {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  maxChatId: string | null;
  checkin: {
    id: number;
    isAvailable: boolean | null;
    respondedAt: string | null;
  } | null;
}

interface CheckinsResponse {
  date: string;
  masters: CheckinMaster[];
  summary: { ready: number; notReady: number; noResponse: number; total: number };
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export default function CheckinsPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <CheckinsContent />
      </Layout>
    </ProtectedRoute>
  );
}

function StatusBadge({ checkin }: { checkin: CheckinMaster["checkin"] }) {
  if (!checkin || checkin.respondedAt === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        <Clock className="w-3 h-3" />
        Нет ответа
      </span>
    );
  }
  if (checkin.isAvailable === true) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" />
        Готов
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
      <XCircle className="w-3 h-3" />
      Не готов
    </span>
  );
}

function CheckinsContent() {
  const [date, setDate] = useState(toDateStr(new Date()));
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<CheckinsResponse>({
    queryKey: ["/api/masters/checkins", date],
    queryFn: async () => {
      const res = await fetch(`/api/masters/checkins?date=${date}`, { credentials: "include" });
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json();
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/masters/checkins/broadcast", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Ошибка");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Рассылка запущена", description: "Сообщения отправлены мастерам" });
      setTimeout(() => refetch(), 3000);
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось запустить рассылку", variant: "destructive" });
    },
  });

  const isToday = date === toDateStr(new Date());
  const displayDate = (() => {
    try {
      return format(parseISO(date), "d MMMM yyyy", { locale: ru });
    } catch {
      return date;
    }
  })();

  const ready = data?.masters.filter((m) => m.checkin?.isAvailable === true) ?? [];
  const notReady = data?.masters.filter((m) => m.checkin?.isAvailable === false) ?? [];
  const noResponse = data?.masters.filter((m) => !m.checkin || m.checkin.respondedAt === null) ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Готовность мастеров</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Ежедневный отчёт — кто готов принимать заказы
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date navigation */}
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

          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            title="Обновить"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isToday && (
            <button
              onClick={() => broadcastMutation.mutate()}
              disabled={broadcastMutation.isPending}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              {broadcastMutation.isPending ? "Отправка…" : "Разослать сейчас"}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm font-medium text-gray-700 -mt-2">{displayDate}</p>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Всего с ботом", value: data.summary.total, color: "bg-gray-50 text-gray-700", icon: Users },
            { label: "Готовы", value: data.summary.ready, color: "bg-green-50 text-green-700", icon: CheckCircle2 },
            { label: "Не готовы", value: data.summary.notReady, color: "bg-red-50 text-red-600", icon: XCircle },
            { label: "Нет ответа", value: data.summary.noResponse, color: "bg-amber-50 text-amber-700", icon: Clock },
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
            { label: "✅ Готовы к заказам", items: ready, emptyText: "Никто пока не ответил «Готов»" },
            { label: "❌ Не готовы сегодня", items: notReady, emptyText: "Нет отказов" },
            { label: "⏳ Нет ответа", items: noResponse, emptyText: "Все ответили" },
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
                              <MapPin className="w-3 h-3 shrink-0" />
                              {m.city || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">
                            <span className="flex items-center gap-1">
                              <Wrench className="w-3 h-3 shrink-0" />
                              {m.specialization || "—"}
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
