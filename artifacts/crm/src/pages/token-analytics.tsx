import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Coins, TrendingUp, ShoppingCart, Clock, Download, Loader2,
  Search, X, Target, TrendingDown, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

// ─── Masters matrix helpers ───────────────────────────────────────────────────

function fmtRubZero(n: number) {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₽`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ₽`;
  return `${n} ₽`;
}

function fmtTokens(n: number) {
  if (n === 0) return "—";
  return `${n} ток.`;
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function buildLast12Months() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

function Sparkline({ data }: { data: { month: string; revenue: number }[] }) {
  if (data.length < 2) return <span className="text-muted-foreground/30 text-xs">—</span>;
  const W = 72, H = 24;
  const vals = data.map(d => d.revenue);
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - (v / max) * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const color = last > prev ? "#10b981" : last < prev ? "#ef4444" : "#94a3b8";
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function RevBadge({ value, target }: { value: number; target: number }) {
  if (value === 0) return <span className="text-muted-foreground/40 tabular-nums">—</span>;
  const pct = (value / target) * 100;
  const cls = pct >= 100
    ? "text-emerald-600 dark:text-emerald-400 font-semibold"
    : pct >= 60
    ? "text-amber-600 dark:text-amber-400 font-medium"
    : "text-red-500 dark:text-red-400 font-medium";
  return <span className={cn("tabular-nums", cls)}>{fmtRubZero(value)}</span>;
}

function KpiCard2({ label, value, sub, color }: { label: string; value: string; sub?: string; color: "green" | "blue" | "amber" | "violet" | "red" | "orange" }) {
  const colors = {
    green:  "from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-100 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-300",
    blue:   "from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300",
    amber:  "from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-100 dark:border-amber-800/30 text-amber-700 dark:text-amber-300",
    violet: "from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border-violet-100 dark:border-violet-800/30 text-violet-700 dark:text-violet-300",
    red:    "from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-100 dark:border-red-800/30 text-red-700 dark:text-red-300",
    orange: "from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-100 dark:border-orange-800/30 text-orange-700 dark:text-orange-300",
  };
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br p-4 space-y-1", colors[color])}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function TrendIcon({ trend, cur, prev }: { trend: string; cur: number; prev: number }) {
  if (cur === 0 && prev === 0) return <Minus className="w-4 h-4 text-muted-foreground/30" />;
  if (trend === "up") {
    const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 100;
    return (
      <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
        <TrendingUp className="w-3.5 h-3.5" />+{pct}%
      </span>
    );
  }
  if (trend === "down") {
    const pct = prev > 0 ? Math.round(((prev - cur) / prev) * 100) : 100;
    return (
      <span className="flex items-center gap-0.5 text-red-500 dark:text-red-400 text-xs font-medium">
        <TrendingDown className="w-3.5 h-3.5" />-{pct}%
      </span>
    );
  }
  return <Minus className="w-4 h-4 text-muted-foreground/40" />;
}

function TargetBar({ value, target }: { value: number; target: number }) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="w-full h-1.5 rounded-full bg-muted/50 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface MasterRevenueRow {
  masterId: number;
  alias: string;
  city: string;
  months: { month: string; revenue: number; spentTokens: number }[];
  currentMonth: number;
  prevMonth: number;
  last3Months: number;
  lastYear: number;
  trend: "up" | "down" | "stable";
  currentMonthSpent: number;
  last3MonthsSpent: number;
  lastYearSpent: number;
}

interface CreditMasterRow {
  masterId: number;
  alias: string;
  city: string;
  tokensBalance: number;
  creditLimitTokens: number;
  creditTokensIssued: number;
  creditTokensSpent: number;
  debtAmount: number;
}

interface CreditAnalyticsData {
  totalDebtTokens: number;
  totalCreditSpent: number;
  debtorCount: number;
  masters: CreditMasterRow[];
}

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
  const [activeTab, setActiveTab] = useState<"overview" | "masters" | "debt">(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    return t === "masters" ? "masters" : t === "debt" ? "debt" : "overview";
  });

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

  const { data: creditData, isLoading: creditLoading } = useQuery<CreditAnalyticsData>({
    queryKey: ["/api/wallet/credit-analytics"],
    queryFn: () => fetch("/api/wallet/credit-analytics", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60_000,
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
            disabled={isLoading || !data || activeTab !== "overview"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Экспорт
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 w-fit">
          <button
            onClick={() => { setActiveTab("overview"); const u = new URL(window.location.href); u.searchParams.delete("tab"); window.history.replaceState({}, "", u.toString()); }}
            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-colors", activeTab === "overview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >Обзор</button>
          <button
            onClick={() => { setActiveTab("masters"); const u = new URL(window.location.href); u.searchParams.set("tab", "masters"); window.history.replaceState({}, "", u.toString()); }}
            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-colors", activeTab === "masters" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >По мастерам</button>
          <button
            onClick={() => { setActiveTab("debt"); const u = new URL(window.location.href); u.searchParams.set("tab", "debt"); window.history.replaceState({}, "", u.toString()); }}
            className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-colors", activeTab === "debt" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >Долги / Кредиты</button>
        </div>

        {activeTab === "overview" && (
          <>
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
        {isLoading || creditLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border/50 p-5 animate-pulse">
                <div className="h-8 w-24 bg-muted rounded mb-2" />
                <div className="h-10 w-32 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
            <KpiCard
              icon={TrendingDown}
              label="В долге"
              value={fmtNum(creditData?.totalDebtTokens ?? 0)}
              sub={`${creditData?.debtorCount ?? 0} мастеров`}
              color="red"
            />
            <KpiCard
              icon={Target}
              label="Кредит потрачен"
              value={fmtNum(creditData?.totalCreditSpent ?? 0)}
              sub="токенов из лимита"
              color="orange"
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
          </>
        )}
        {/* Debtors section in Overview */}
        {activeTab === "overview" && (
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5">
            <h2 className="text-lg font-semibold mb-4">Мастера в долге</h2>
            {creditLoading ? (
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
                      <th className="px-4 py-3 text-right">Баланс токенов</th>
                      <th className="px-4 py-3 text-right">Кредитный лимит</th>
                      <th className="px-4 py-3 text-right">Долг</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(creditData?.masters ?? []).filter(m => m.debtAmount > 0).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          Нет мастеров с отрицательным балансом
                        </td>
                      </tr>
                    )}
                    {(creditData?.masters ?? []).filter(m => m.debtAmount > 0).map((m, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{m.alias}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.city}</td>
                        <td className={cn("px-4 py-3 text-right font-semibold", m.tokensBalance < 0 ? "text-red-500" : "text-emerald-600")}>
                          {m.tokensBalance}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{m.creditLimitTokens}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-500">{m.debtAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "masters" && <MastersMatrix creditData={creditData} />}
        {activeTab === "debt" && <DebtorsTab />}
      </div>
    </Layout>
  );
}

function MastersMatrix({ creditData }: { creditData?: CreditAnalyticsData }) {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [target, setTarget] = useState(20000);
  const [view, setView] = useState<"summary" | "monthly">("summary");
  const [onlyDebtors, setOnlyDebtors] = useState(false);

  const { data: rawData, isLoading, error } = useQuery<MasterRevenueRow[]>({
    queryKey: ["/api/wallet/master-revenue"],
    queryFn: async () => {
      const r = await fetch("/api/wallet/master-revenue", { credentials: "include" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      if (!Array.isArray(json)) throw new Error("Неверный формат ответа от сервера");
      return json;
    },
    refetchInterval: 60_000,
  });
  const data = Array.isArray(rawData) ? rawData : [];

  const filtered = useMemo(() => {
    return data.filter(m => {
      const q = search.toLowerCase();
      const matchSearch = !q || m.alias.toLowerCase().includes(q) || m.city.toLowerCase().includes(q);
      const matchCity = !city || m.city.toLowerCase().includes(city.toLowerCase());
      const matchDebtor = !onlyDebtors || (creditData?.masters.find(wm => wm.masterId === m.masterId)?.debtAmount ?? 0) > 0;
      return matchSearch && matchCity && matchDebtor;
    });
  }, [data, search, city, onlyDebtors, creditData]);

  const totalThisMonth = filtered.reduce((s, m) => s + m.currentMonth, 0);
  const aboveTarget = filtered.filter(m => m.currentMonth >= target).length;
  const belowTarget = filtered.filter(m => m.currentMonth > 0 && m.currentMonth < target).length;
  const noRevenue   = filtered.filter(m => m.currentMonth === 0).length;

  const last12 = useMemo(() => buildLast12Months(), []);
  const currentMonthKey = last12[last12.length - 1];

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 p-4 flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shrink-0">!</div>
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Ошибка загрузки данных</p>
            <p className="text-xs text-red-600 dark:text-red-400">{(error as Error).message}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard2 label="Доход за текущий месяц" value={fmtRubZero(totalThisMonth)} sub={`${filtered.length} мастеров`} color="green" />
        <KpiCard2 label={`≥ ${(target / 1000).toFixed(0)}K — выше цели`} value={String(aboveTarget)} sub="мастеров" color="blue" />
        <KpiCard2 label="Ниже цели (есть платежи)" value={String(belowTarget)} sub="мастеров" color="amber" />
        <KpiCard2 label="Без платежей в этом мес." value={String(noRevenue)} sub="мастеров" color="violet" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="h-9 pl-9 pr-8 text-sm rounded-xl border bg-background w-52 focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Имя мастера…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <input
          className="h-9 px-3 text-sm rounded-xl border bg-background w-32 focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Город…"
          value={city}
          onChange={e => setCity(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Цель:</span>
          <input
            type="number" min={1000} step={1000}
            className="h-9 px-3 text-sm rounded-xl border bg-background w-28 focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={target}
            onChange={e => setTarget(Math.max(1000, Number(e.target.value)))}
          />
          <span className="text-sm text-muted-foreground">₽/мес</span>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyDebtors}
            onChange={e => setOnlyDebtors(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          Только должники
        </label>
        <div className="ml-auto flex items-center gap-1 bg-muted/40 rounded-xl p-1">
          <button
            onClick={() => setView("summary")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", view === "summary" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >Итоги</button>
          <button
            onClick={() => setView("monthly")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", view === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >По месяцам</button>
        </div>
      </div>

      {/* Summary view */}
      {view === "summary" && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium">#</th>
                  <th className="text-left px-3 py-3 font-medium">Мастер</th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Город</th>
                  <th className="text-right px-3 py-3 font-medium">Текущий мес.</th>
                  <th className="text-right px-3 py-3 font-medium hidden sm:table-cell">3 месяца</th>
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">Год</th>
                  <th className="text-right px-3 py-3 font-medium hidden md:table-cell">Токены мес.</th>
                  <th className="text-center px-3 py-3 font-medium hidden md:table-cell">Тренд</th>
                  <th className="text-center px-3 py-3 font-medium hidden lg:table-cell">12 мес.</th>
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">Баланс</th>
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">Кредит</th>
                  <th className="text-right px-3 py-3 font-medium hidden lg:table-cell">Долг</th>
                  <th className="text-left px-3 py-3 font-medium">Прогресс</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={13} className="text-center py-16 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />Загрузка…
                    </div>
                  </td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={13} className="text-center py-16 text-muted-foreground">
                    <Coins className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p>Нет данных — мастера ещё не покупали токены</p>
                  </td></tr>
                )}
                {!isLoading && filtered.map((m, idx) => {
                  const w = creditData?.masters.find(wm => wm.masterId === m.masterId);
                  return (
                  <tr key={m.masterId} className={cn("border-b last:border-0", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">#{idx + 1}</td>
                    <td className="px-3 py-3 font-medium">{m.alias}</td>
                    <td className="px-3 py-3 text-muted-foreground hidden md:table-cell text-xs">{m.city}</td>
                    <td className="px-3 py-3 text-right"><RevBadge value={m.currentMonth} target={target} /></td>
                    <td className="px-3 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">{m.last3Months > 0 ? fmtRubZero(m.last3Months) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell text-muted-foreground">{m.lastYear > 0 ? fmtRubZero(m.lastYear) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell text-indigo-600 dark:text-indigo-400 font-medium">{m.currentMonthSpent > 0 ? fmtTokens(m.currentMonthSpent) : "—"}</td>
                    <td className="px-3 py-3 text-center hidden md:table-cell"><TrendIcon trend={m.trend} cur={m.currentMonth} prev={m.prevMonth} /></td>
                    <td className="px-3 py-3 text-center hidden lg:table-cell"><Sparkline data={m.months} /></td>
                    <td className={cn("px-3 py-3 text-right tabular-nums hidden lg:table-cell font-medium", (w?.tokensBalance ?? 0) < 0 ? "text-red-500" : "text-emerald-600")}>{w?.tokensBalance ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell text-muted-foreground">{w?.creditLimitTokens ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell font-bold text-red-500">{w && w.debtAmount > 0 ? w.debtAmount : "—"}</td>
                    <td className="px-3 py-3 w-32">
                      <TargetBar value={m.currentMonth} target={target} />
                      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{target > 0 ? `${Math.min(100, Math.round((m.currentMonth / target) * 100))}%` : ""}</p>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly view */}
      {view === "monthly" && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm min-w-max">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium sticky left-0 bg-muted/40 z-10">Мастер</th>
                  <th className="text-left px-3 py-3 font-medium sticky left-[160px] bg-muted/40 z-10 hidden md:table-cell">Город</th>
                  {last12.map(m => (
                    <th key={m} className={cn("text-right px-3 py-3 font-medium whitespace-nowrap", m === currentMonthKey && "text-primary")}>{fmtMonth(m)}</th>
                  ))}
                  <th className="text-right px-3 py-3 font-medium">Итого</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={15} className="text-center py-16 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />Загрузка…
                    </div>
                  </td></tr>
                )}
                {!isLoading && filtered.map((m, idx) => {
                  const revenueMap: Record<string, number> = {};
                  const spentMap: Record<string, number> = {};
                  for (const x of m.months) { revenueMap[x.month] = x.revenue; spentMap[x.month] = x.spentTokens; }
                  return (
                    <>
                      <tr key={`${m.masterId}-rev`} className={cn("border-b", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                        <td className="px-4 py-3 font-medium whitespace-nowrap sticky left-0 bg-inherit z-10">{m.alias}</td>
                        <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap sticky left-[160px] bg-inherit z-10 hidden md:table-cell">{m.city}</td>
                        {last12.map(month => {
                          const rev = revenueMap[month] ?? 0;
                          return (
                            <td key={month} className={cn("px-3 py-3 text-right tabular-nums", month === currentMonthKey && "bg-primary/5")}>
                              {rev > 0 ? (
                                <span className={cn("font-medium", rev >= target ? "text-emerald-600 dark:text-emerald-400" : rev >= target * 0.6 ? "text-amber-600 dark:text-amber-400" : "text-red-500 dark:text-red-400")}>
                                  {fmtRubZero(rev)}
                                </span>
                              ) : <span className="text-muted-foreground/25">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-right tabular-nums font-semibold">{m.lastYear > 0 ? fmtRubZero(m.lastYear) : "—"}</td>
                      </tr>
                      <tr key={`${m.masterId}-spent`} className={cn("border-b last:border-0", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-inherit z-10" colSpan={2}>
                          <span className="inline-flex items-center gap-1"><Coins className="w-3 h-3 text-indigo-500" /> Потрачено токенов</span>
                        </td>
                        {last12.map(month => {
                          const spent = spentMap[month] ?? 0;
                          return (
                            <td key={month} className={cn("px-3 py-2 text-right tabular-nums text-xs", month === currentMonthKey && "bg-primary/5")}>
                              {spent > 0 ? <span className="font-medium text-indigo-600 dark:text-indigo-400">{fmtTokens(spent)}</span> : <span className="text-muted-foreground/25">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-indigo-700 dark:text-indigo-300">{m.lastYearSpent > 0 ? fmtTokens(m.lastYearSpent) : "—"}</td>
                      </tr>
                    </>
                  );
                })}
                {!isLoading && filtered.length > 0 && (
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="px-4 py-3 sticky left-0 bg-muted/30 z-10">Итого</td>
                    <td className="px-3 py-3 hidden md:table-cell sticky left-[160px] bg-muted/30 z-10" />
                    {last12.map(month => {
                      const total = filtered.reduce((s, m) => {
                        const mm: Record<string, number> = {};
                        for (const x of m.months) mm[x.month] = x.revenue;
                        return s + (mm[month] ?? 0);
                      }, 0);
                      return (
                        <td key={month} className={cn("px-3 py-3 text-right tabular-nums", month === currentMonthKey && "bg-primary/5 text-primary")}>
                          {total > 0 ? fmtRubZero(total) : "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right tabular-nums text-primary">{fmtRubZero(filtered.reduce((s, m) => s + m.lastYear, 0))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DebtorsTab() {
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery<CreditAnalyticsData>({
    queryKey: ["/api/wallet/credit-analytics"],
    queryFn: async () => {
      const r = await fetch("/api/wallet/credit-analytics", { credentials: "include" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
      return json;
    },
    refetchInterval: 60_000,
  });

  const sorted = useMemo(() => {
    const masters = data?.masters ?? [];
    const q = search.toLowerCase();
    const filtered = q ? masters.filter(m => m.alias.toLowerCase().includes(q) || m.city.toLowerCase().includes(q)) : masters;
    return [...filtered].sort((a, b) => b.debtAmount - a.debtAmount || b.tokensBalance - a.tokensBalance);
  }, [data, search]);

  const debtors = sorted.filter(m => m.debtAmount > 0);
  const totalDebt = debtors.reduce((s, m) => s + m.debtAmount, 0);

  const handleExport = () => {
    if (!sorted.length) return;
    exportCSV(
      `credit-analytics-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Мастер", "Город", "Баланс токенов", "Кредитный лимит", "Выдано кредита", "Потрачено из кредита", "Долг"],
      sorted.map(m => [m.alias, m.city, m.tokensBalance, m.creditLimitTokens, m.creditTokensIssued, m.creditTokensSpent, m.debtAmount])
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 p-4 flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shrink-0">!</div>
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Ошибка загрузки данных</p>
            <p className="text-xs text-red-600 dark:text-red-400">{(error as Error).message}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard2 label="Всего мастеров" value={String(data?.masters.length ?? 0)} sub="в системе" color="blue" />
        <KpiCard2 label="В долге" value={String(debtors.length)} sub={`${totalDebt} токенов`} color="red" />
        <KpiCard2 label="Кредит выдан" value={String(data?.masters.reduce((s, m) => s + m.creditTokensIssued, 0) ?? 0)} sub="токенов" color="amber" />
        <KpiCard2 label="Кредит потрачен" value={String(data?.totalCreditSpent ?? 0)} sub="токенов" color="violet" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="h-9 pl-9 pr-8 text-sm rounded-xl border bg-background w-52 focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Имя мастера…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={isLoading || !data}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Экспорт
        </button>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-3 py-3 font-medium">Мастер</th>
                <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Город</th>
                <th className="text-right px-3 py-3 font-medium">Баланс токенов</th>
                <th className="text-right px-3 py-3 font-medium hidden sm:table-cell">Кредитный лимит</th>
                <th className="text-right px-3 py-3 font-medium hidden md:table-cell">Выдано кредита</th>
                <th className="text-right px-3 py-3 font-medium hidden md:table-cell">Потрачено из кредита</th>
                <th className="text-right px-3 py-3 font-medium">Долг</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-16 text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />Загрузка…
                  </div>
                </td></tr>
              )}
              {!isLoading && sorted.length === 0 && (
                <tr><td colSpan={8} className="text-center py-16 text-muted-foreground">
                  <Coins className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p>Нет данных</p>
                </td></tr>
              )}
              {!isLoading && sorted.map((m, idx) => (
                <tr key={m.masterId} className={cn("border-b last:border-0", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                  <td className="px-4 py-3 text-muted-foreground text-xs font-mono">#{idx + 1}</td>
                  <td className="px-3 py-3 font-medium">{m.alias}</td>
                  <td className="px-3 py-3 text-muted-foreground hidden md:table-cell text-xs">{m.city}</td>
                  <td className={cn("px-3 py-3 text-right tabular-nums font-medium", m.tokensBalance < 0 ? "text-red-500" : "text-emerald-600")}>{m.tokensBalance}</td>
                  <td className="px-3 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">{m.creditLimitTokens}</td>
                  <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">{m.creditTokensIssued}</td>
                  <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell text-violet-600 font-medium">{m.creditTokensSpent}</td>
                  <td className={cn("px-3 py-3 text-right tabular-nums font-bold", m.debtAmount > 0 ? "text-red-500" : "text-muted-foreground")}>{m.debtAmount > 0 ? m.debtAmount : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
