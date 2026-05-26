import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Coins, TrendingUp, ShoppingCart, Clock, Download, Loader2,
} from "lucide-react";

// ─── HELPERS ────────────────────────────────────────────────────────────────

function formatRub(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₽`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ₽`;
  return `${n} ₽`;
}

function fmtNum(n: number) {
  return n.toLocaleString("ru-RU");
}

function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const bom = "\uFEFF";
  const csv = bom + [headers, ...rows].map(r => r.join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  a.click();
}

// ─── PERIOD FILTER ───────────────────────────────────────────────────────────

type Period = "today" | "yesterday" | "week" | "prev_week" | "month" | "prev_month" | "custom";

interface DateRange { from: string; to: string }

function getPeriodDates(period: Period, custom: DateRange): DateRange {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = fmt(now);
  const yesterday = fmt(new Date(now.getTime() - 86400000));
  const weekAgo = fmt(new Date(now.getTime() - 7 * 86400000));
  const monthStart = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
  const prevMonthStart = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonthEnd = fmt(new Date(new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 86400000));
  const prevWeekStart = fmt(new Date(now.getTime() - 14 * 86400000));
  const prevWeekEnd = fmt(new Date(now.getTime() - 8 * 86400000));

  if (period === "today") return { from: today, to: today };
  if (period === "yesterday") return { from: yesterday, to: yesterday };
  if (period === "week") return { from: weekAgo, to: today };
  if (period === "prev_week") return { from: prevWeekStart, to: prevWeekEnd };
  if (period === "month") return { from: monthStart, to: today };
  if (period === "prev_month") return { from: prevMonthStart, to: prevMonthEnd };
  return custom;
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  week: "Эта неделя",
  prev_week: "Прошлая неделя",
  month: "Этот месяц",
  prev_month: "Прошлый месяц",
  custom: "Произвольно",
};

function PeriodFilter({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === p
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

// ─── KPI CARD ────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = "blue" }: {
  icon: any; label: string; value: string; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    green: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400",
  };
  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color] ?? colorMap.blue}`}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-display font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ─── CHART TOOLTIP ───────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/50 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.dataKey === "revenue" ? formatRub(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

interface AnalyticsData {
  totalRevenue: number;
  totalPurchases: number;
  avgOrderValue: number;
  pendingRevenue: number;
  chartData: { date: string; revenue: number; count: number }[];
  byPackage: { package_name: string; revenue: number; count: number }[];
  topMasters: { alias: string; city: string; revenue: number; count: number }[];
  byCity: { city: string; revenue: number; count: number }[];
}

export default function TokenAnalyticsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState<DateRange>({ from: "", to: "" });

  const dates = useMemo(() => getPeriodDates(period, customRange), [period, customRange]);
  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("from", dates.from);
    params.set("to", dates.to);
    return params.toString();
  }, [dates]);

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/wallet/analytics", qs],
    queryFn: () => fetch(`/api/wallet/analytics?${qs}`, { credentials: "include" }).then(r => r.json()),
  });

  const handleExport = () => {
    if (!data) return;
    exportCSV(
      `token-analytics-${dates.from}-${dates.to}.csv`,
      ["Дата", "Выручка", "Количество"],
      data.chartData.map(r => [r.date, r.revenue, r.count])
    );
  };

  const packageColors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#84cc16"];

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Аналитика токенов</h1>
              <p className="text-sm text-muted-foreground">Доход от покупок токенов мастерами</p>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={isLoading || !data}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Экспорт
          </button>
        </div>

        {/* Period filter */}
        <PeriodFilter value={period} onChange={setPeriod} />
        {period === "custom" && (
          <div className="flex gap-2">
            <input
              type="date"
              value={customRange.from}
              onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background"
            />
            <input
              type="date"
              value={customRange.to}
              onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))}
              className="text-sm border rounded-lg px-3 py-1.5 bg-background"
            />
          </div>
        )}

        {/* KPI Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border/50 p-5 animate-pulse">
                <div className="h-8 w-24 bg-muted rounded mb-2" />
                <div className="h-10 w-32 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={TrendingUp}
              label="Выручка"
              value={formatRub(data?.totalRevenue ?? 0)}
              sub="подтверждено"
              color="green"
            />
            <KpiCard
              icon={ShoppingCart}
              label="Покупок"
              value={fmtNum(data?.totalPurchases ?? 0)}
              sub="транзакций"
              color="blue"
            />
            <KpiCard
              icon={Coins}
              label="Средний чек"
              value={formatRub(data?.avgOrderValue ?? 0)}
              sub="за покупку"
              color="amber"
            />
            <KpiCard
              icon={Clock}
              label="Ожидает"
              value={formatRub(data?.pendingRevenue ?? 0)}
              sub="не подтверждено"
              color="violet"
            />
          </div>
        )}

        {/* Revenue chart */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5">
          <h2 className="text-lg font-semibold mb-4">Динамика выручки</h2>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data?.chartData ?? []}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => formatRub(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Выручка"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Two columns: packages & cities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By package */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-lg font-semibold mb-4">По пакетам</h2>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data?.byPackage ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="package_name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => formatRub(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="revenue" name="Выручка" radius={[4, 4, 0, 0]}>
                    {(data?.byPackage ?? []).map((_, i) => (
                      <Cell key={i} fill={packageColors[i % packageColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* By city */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-lg font-semibold mb-4">По городам</h2>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data?.byCity ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="city" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => formatRub(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="revenue" name="Выручка" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top masters table */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5">
          <h2 className="text-lg font-semibold mb-4">Топ мастеров</h2>
          {isLoading ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs font-semibold text-muted-foreground uppercase">
                    <th className="px-4 py-3">Мастер</th>
                    <th className="px-4 py-3">Город</th>
                    <th className="px-4 py-3 text-right">Выручка</th>
                    <th className="px-4 py-3 text-right">Покупок</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.topMasters ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        Нет данных
                      </td>
                    </tr>
                  )}
                  {(data?.topMasters ?? []).map((m, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{m.alias}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.city}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatRub(m.revenue)}</td>
                      <td className="px-4 py-3 text-right">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
