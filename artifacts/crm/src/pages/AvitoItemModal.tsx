import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  X, ExternalLink, Eye, Phone, Heart, TrendingUp,
  ShoppingBag, Loader2, ToggleLeft, ToggleRight, AlertCircle, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface AvitoItem {
  id: number;
  title: string;
  status: string;
  url: string;
  category?: { id: number; name: string };
  location?: { name?: string };
  addresses?: { city?: string }[];
  publishedAt?: string;
  stats?: {
    viewsDay?: number; viewsWeek?: number; viewsMonth?: number;
    contactsDay?: number; contactsWeek?: number; contactsMonth?: number;
    favsDay?: number; favsWeek?: number; favsMonth?: number;
    daily?: { date: string; uniqViews: number; uniqContacts: number; uniqFavorites: number }[];
  };
}

interface CrmData {
  leads: number;
  orders: number;
  revenue: number;
}

interface Props {
  item: AvitoItem;
  crmData?: CrmData;
  itemSpend?: number | null;
  onClose: () => void;
}

type Period = "today" | "week" | "month";

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      🟢 Активно
    </span>
  );
  if (status === "blocked") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      ⚫ Заблокировано
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      🔴 Неактивно
    </span>
  );
}

function MetricCard({ icon, label, value, sub, highlight }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; highlight?: string;
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("text-lg font-bold tabular-nums", highlight)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function roiColor(roi: number | null) {
  if (roi === null) return undefined;
  if (roi >= 3) return "text-green-600 dark:text-green-400";
  if (roi >= 1.5) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function Recommendations({ roi, convView, convLead }: {
  roi: number | null; convView: number; convLead: number;
}) {
  const recs: { emoji: string; text: string; color: string }[] = [];

  if (roi !== null) {
    if (roi > 5) recs.push({ emoji: "🔥", text: "Суперэффективное! Увеличьте бюджет на продвижение.", color: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:text-green-300" });
    else if (roi >= 3) recs.push({ emoji: "🟢", text: "Хорошо работает. Оставьте как есть.", color: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:text-green-300" });
    else if (roi >= 1.5) recs.push({ emoji: "🟡", text: "Средняя эффективность. Попробуйте обновить фото или заголовок.", color: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" });
    else recs.push({ emoji: "🔴", text: "Не окупается. Рекомендуется отключить или полностью переделать.", color: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:text-red-300" });
  }
  if (convView > 0 && convView < 5) {
    recs.push({ emoji: "⚠️", text: "Мало кликают. Смените заголовок или главное фото.", color: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" });
  }
  if (convLead > 0 && convLead < 20) {
    recs.push({ emoji: "⚠️", text: "Много обращений, мало заявок. Проверьте скорость ответа и скрипты.", color: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" });
  }

  if (recs.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Рекомендации системы</p>
      {recs.map((r, i) => (
        <div key={i} className={cn("flex gap-2 p-3 rounded-lg border text-sm", r.color)}>
          <span className="shrink-0">{r.emoji}</span>
          <span>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

export function AvitoItemModal({ item, crmData, itemSpend, onClose }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [toggleSuccess, setToggleSuccess] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // ── Period stats — use precomputed values from item.stats ──────────────────
  const s = item.stats;
  const periodStats = period === "today"
    ? { views: s?.viewsDay ?? 0, contacts: s?.contactsDay ?? 0, favorites: s?.favsDay ?? 0 }
    : period === "week"
    ? { views: s?.viewsWeek ?? 0, contacts: s?.contactsWeek ?? 0, favorites: s?.favsWeek ?? 0 }
    : { views: s?.viewsMonth ?? 0, contacts: s?.contactsMonth ?? 0, favorites: s?.favsMonth ?? 0 };

  // ── Chart from daily array ─────────────────────────────────────────────────
  const chartData = (s?.daily ?? []).map(d => ({
    date: new Date(d.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
    views: d.uniqViews,
    contacts: d.uniqContacts,
  }));

  // ── Computed metrics ───────────────────────────────────────────────────────
  const city = item.location?.name || item.addresses?.[0]?.city || "—";
  const category = item.category?.name || "—";
  const isActive = item.status === "active";

  const convView = periodStats.views > 0 ? (periodStats.contacts / periodStats.views * 100) : 0;
  const leads = crmData?.leads ?? 0;
  const orders = crmData?.orders ?? 0;
  const revenue = crmData?.revenue ?? 0;
  const convLead = periodStats.contacts > 0 ? (leads / periodStats.contacts * 100) : 0;
  const convOrder = leads > 0 ? (orders / leads * 100) : 0;
  const spend = itemSpend ?? null;
  const cpc = spend !== null && spend > 0 && periodStats.contacts > 0 ? Math.round(spend / periodStats.contacts) : null;
  const cpo = spend !== null && spend > 0 && orders > 0 ? Math.round(spend / orders) : null;
  const roi = spend !== null && spend > 0 && revenue > 0 ? revenue / spend : null;

  // ── Toggle endpoint ────────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async (action: "activate" | "deactivate") => {
      setToggleError(null);
      setToggleSuccess(null);
      const r = await fetch(`${BASE}/api/avito/items/${item.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      return j;
    },
    onSuccess: (_data, action) => {
      setToggleSuccess(action === "activate" ? "Объявление включено" : "Объявление выключено");
      queryClient.invalidateQueries({ queryKey: ["/api/avito/items-with-stats"] });
    },
    onError: (e: Error) => {
      setToggleError(e.message);
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl my-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold leading-snug line-clamp-2">{item.title}</h2>
            <div className="flex items-center flex-wrap gap-2 mt-1.5">
              <StatusBadge status={item.status} />
              <span className="text-xs text-muted-foreground">ID: {item.id}</span>
              {city !== "—" && <span className="text-xs text-muted-foreground">📍 {city}</span>}
              {category !== "—" && <span className="text-xs text-muted-foreground">📂 {category}</span>}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Period switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Период:</span>
            {(["today", "week", "month"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                )}
              >
                {p === "today" ? "День" : p === "week" ? "Неделя" : "Месяц"}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-muted-foreground">данные за {period === "today" ? "сегодня" : period === "week" ? "7 дней" : "30 дней"}</span>
          </div>

          {/* Avito stats */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Статистика Авито</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricCard icon={<Eye className="w-3.5 h-3.5" />} label="Просмотры" value={periodStats.views.toLocaleString("ru-RU")} />
              <MetricCard icon={<Phone className="w-3.5 h-3.5" />} label="Контакты" value={periodStats.contacts.toLocaleString("ru-RU")} />
              <MetricCard
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                label="Конверсия"
                value={periodStats.views > 0 ? `${convView.toFixed(1)}%` : "—"}
                sub="просмотр → контакт"
              />
              <MetricCard icon={<Heart className="w-3.5 h-3.5" />} label="Избранное" value={periodStats.favorites.toLocaleString("ru-RU")} />
            </div>
          </div>

          {/* CRM stats */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Наша аналитика (CRM)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricCard icon={<ShoppingBag className="w-3.5 h-3.5" />} label="Заявок" value={leads} />
              <MetricCard icon={<Star className="w-3.5 h-3.5 text-amber-500" />} label="Заказов" value={orders} />
              <MetricCard
                icon={<TrendingUp className="w-3.5 h-3.5 text-blue-500" />}
                label="Конв. контакт→заявка"
                value={periodStats.contacts > 0 ? `${convLead.toFixed(1)}%` : "—"}
              />
              <MetricCard
                icon={<TrendingUp className="w-3.5 h-3.5 text-green-500" />}
                label="Конв. заявка→заказ"
                value={leads > 0 ? `${convOrder.toFixed(1)}%` : "—"}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <MetricCard
                icon={<span className="text-xs font-bold">₽</span>}
                label="Доход"
                value={revenue > 0 ? `${revenue.toLocaleString("ru-RU")} ₽` : "—"}
                highlight="text-green-600 dark:text-green-400"
              />
              <MetricCard
                icon={<span className="text-xs">₽</span>}
                label="₽/контакт"
                value={cpc !== null ? `${cpc.toLocaleString("ru-RU")} ₽` : "—"}
              />
              <MetricCard
                icon={<span className="text-xs">₽</span>}
                label="₽/заказ (CPO)"
                value={cpo !== null ? `${cpo.toLocaleString("ru-RU")} ₽` : "—"}
              />
              <MetricCard
                icon={<TrendingUp className="w-3.5 h-3.5" />}
                label="ROI"
                value={roi !== null ? `×${roi.toFixed(1)}` : "—"}
                sub={spend !== null ? `расход ${spend.toLocaleString("ru-RU")} ₽` : undefined}
                highlight={roiColor(roi)}
              />
            </div>
          </div>

          {/* Chart — 30-day daily from item.stats.daily */}
          {chartData.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                График за 30 дней ({chartData.length} дней с данными)
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="views" stroke="#22c55e" dot={false} name="Просмотры" strokeWidth={2} />
                  <Line type="monotone" dataKey="contacts" stroke="#3b82f6" dot={false} name="Контакты" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center text-xs text-muted-foreground py-4 bg-muted/30 rounded-lg">
              Нет данных за прошлые дни
            </div>
          )}

          {/* Recommendations */}
          <Recommendations roi={roi} convView={convView} convLead={convLead} />

          {/* Toggle feedback */}
          {toggleSuccess && (
            <div className="flex gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
              ✅ {toggleSuccess}
            </div>
          )}
          {toggleError && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Не удалось изменить статус</p>
                <p className="text-xs mt-0.5">{toggleError}</p>
                <a href={item.url} target="_blank" rel="noreferrer" className="text-xs underline mt-1 block">
                  Открыть в Авито для ручного управления →
                </a>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1 border-t">
            {isActive ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate("deactivate")}
              >
                {toggleMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                Выключить
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-green-200 text-green-600 hover:bg-green-50"
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate("activate")}
              >
                {toggleMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ToggleRight className="w-3.5 h-3.5" />}
                Включить
              </Button>
            )}
            <a href={item.url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                Открыть в Авито
              </Button>
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
