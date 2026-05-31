import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { TrendingUp, TrendingDown, Minus, Search, X, Target, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtRub(n: number) {
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

// ─── Mini sparkline (SVG) ─────────────────────────────────────────────────────

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

// ─── Revenue badge ────────────────────────────────────────────────────────────

function RevBadge({ value, target }: { value: number; target: number }) {
  if (value === 0) return <span className="text-muted-foreground/40 tabular-nums">—</span>;
  const pct = (value / target) * 100;
  const cls = pct >= 100
    ? "text-emerald-600 dark:text-emerald-400 font-semibold"
    : pct >= 60
    ? "text-amber-600 dark:text-amber-400 font-medium"
    : "text-red-500 dark:text-red-400 font-medium";
  return <span className={cn("tabular-nums", cls)}>{fmtRub(value)}</span>;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: "green" | "blue" | "amber" | "violet" }) {
  const colors = {
    green:  "from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-100 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-300",
    blue:   "from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-300",
    amber:  "from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-100 dark:border-amber-800/30 text-amber-700 dark:text-amber-300",
    violet: "from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border-violet-100 dark:border-violet-800/30 text-violet-700 dark:text-violet-300",
  };
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br p-4 space-y-1", colors[color])}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Trend icon ───────────────────────────────────────────────────────────────

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

// ─── Progress bar ─────────────────────────────────────────────────────────────

function TargetBar({ value, target }: { value: number; target: number }) {
  const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0);
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="w-full h-1.5 rounded-full bg-muted/50 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Last 12 months columns ───────────────────────────────────────────────────

function buildLast12Months() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

function MasterRevenueContent() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [target, setTarget] = useState(20000);
  const [view, setView] = useState<"summary" | "monthly">("summary");

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
      return matchSearch && matchCity;
    });
  }, [data, search, city]);

  const totalThisMonth = filtered.reduce((s, m) => s + m.currentMonth, 0);
  const aboveTarget = filtered.filter(m => m.currentMonth >= target).length;
  const belowTarget = filtered.filter(m => m.currentMonth > 0 && m.currentMonth < target).length;
  const noRevenue   = filtered.filter(m => m.currentMonth === 0).length;

  const last12 = useMemo(() => buildLast12Months(), []);
  const currentMonthKey = last12[last12.length - 1];

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 p-4 flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold shrink-0">!</div>
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Ошибка загрузки данных</p>
            <p className="text-xs text-red-600 dark:text-red-400">{(error as Error).message}</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
          <Coins className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Доход с мастеров</h1>
          <p className="text-sm text-muted-foreground">Сколько платформа зарабатывает с каждого мастера по токен-модели</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Доход за текущий месяц" value={fmtRub(totalThisMonth)} sub={`${filtered.length} мастеров`} color="green" />
        <KpiCard label={`≥ ${(target / 1000).toFixed(0)}K — выше цели`} value={String(aboveTarget)} sub="мастеров" color="blue" />
        <KpiCard label="Ниже цели (есть платежи)" value={String(belowTarget)} sub="мастеров" color="amber" />
        <KpiCard label="Без платежей в этом мес." value={String(noRevenue)} sub="мастеров" color="violet" />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
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

        {/* City */}
        <input
          className="h-9 px-3 text-sm rounded-xl border bg-background w-32 focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Город…"
          value={city}
          onChange={e => setCity(e.target.value)}
        />

        {/* Target */}
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Цель:</span>
          <input
            type="number"
            min={1000}
            step={1000}
            className="h-9 px-3 text-sm rounded-xl border bg-background w-28 focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={target}
            onChange={e => setTarget(Math.max(1000, Number(e.target.value)))}
          />
          <span className="text-sm text-muted-foreground">₽/мес</span>
        </div>

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 bg-muted/40 rounded-xl p-1">
          <button
            onClick={() => setView("summary")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", view === "summary" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >
            Итоги
          </button>
          <button
            onClick={() => setView("monthly")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", view === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
          >
            По месяцам
          </button>
        </div>
      </div>

      {/* Table — Summary view */}
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
                  <th className="text-left px-3 py-3 font-medium">Прогресс</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                        Загрузка…
                      </div>
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-muted-foreground">
                      <Coins className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p>Нет данных — мастера ещё не покупали токены</p>
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.map((m, idx) => (
                  <tr key={m.masterId} className={cn("border-b last:border-0", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">#{idx + 1}</td>
                    <td className="px-3 py-3 font-medium">{m.alias}</td>
                    <td className="px-3 py-3 text-muted-foreground hidden md:table-cell text-xs">{m.city}</td>
                    <td className="px-3 py-3 text-right">
                      <RevBadge value={m.currentMonth} target={target} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                      {m.last3Months > 0 ? fmtRub(m.last3Months) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell text-muted-foreground">
                      {m.lastYear > 0 ? fmtRub(m.lastYear) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell text-indigo-600 dark:text-indigo-400 font-medium">
                      {m.currentMonthSpent > 0 ? fmtTokens(m.currentMonthSpent) : "—"}
                    </td>
                    <td className="px-3 py-3 text-center hidden md:table-cell">
                      <TrendIcon trend={m.trend} cur={m.currentMonth} prev={m.prevMonth} />
                    </td>
                    <td className="px-3 py-3 text-center hidden lg:table-cell">
                      <Sparkline data={m.months} />
                    </td>
                    <td className="px-3 py-3 w-32">
                      <TargetBar value={m.currentMonth} target={target} />
                      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                        {target > 0 ? `${Math.min(100, Math.round((m.currentMonth / target) * 100))}%` : ""}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table — Monthly view (matrix: masters × months) */}
      {view === "monthly" && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm min-w-max">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="text-left px-4 py-3 font-medium sticky left-0 bg-muted/40 z-10">Мастер</th>
                  <th className="text-left px-3 py-3 font-medium sticky left-[160px] bg-muted/40 z-10 hidden md:table-cell">Город</th>
                  {last12.map(m => (
                    <th key={m} className={cn("text-right px-3 py-3 font-medium whitespace-nowrap", m === currentMonthKey && "text-primary")}>
                      {fmtMonth(m)}
                    </th>
                  ))}
                  <th className="text-right px-3 py-3 font-medium">Итого</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={15} className="text-center py-16 text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                        Загрузка…
                      </div>
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.map((m, idx) => {
                  const revenueMap: Record<string, number> = {};
                  const spentMap: Record<string, number> = {};
                  for (const x of m.months) {
                    revenueMap[x.month] = x.revenue;
                    spentMap[x.month] = x.spentTokens;
                  }
                  return (
                    <>
                      {/* Revenue row */}
                      <tr key={`${m.masterId}-rev`} className={cn("border-b", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                        <td className="px-4 py-3 font-medium whitespace-nowrap sticky left-0 bg-inherit z-10">{m.alias}</td>
                        <td className="px-3 py-3 text-muted-foreground text-xs whitespace-nowrap sticky left-[160px] bg-inherit z-10 hidden md:table-cell">{m.city}</td>
                        {last12.map(month => {
                          const rev = revenueMap[month] ?? 0;
                          return (
                            <td key={month} className={cn("px-3 py-3 text-right tabular-nums", month === currentMonthKey && "bg-primary/5")}>
                              {rev > 0 ? (
                                <span className={cn("font-medium", rev >= target ? "text-emerald-600 dark:text-emerald-400" : rev >= target * 0.6 ? "text-amber-600 dark:text-amber-400" : "text-red-500 dark:text-red-400")}>
                                  {fmtRub(rev)}
                                </span>
                              ) : <span className="text-muted-foreground/25">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-right tabular-nums font-semibold">
                          {m.lastYear > 0 ? fmtRub(m.lastYear) : "—"}
                        </td>
                      </tr>
                      {/* Spent tokens row */}
                      <tr key={`${m.masterId}-spent`} className={cn("border-b last:border-0", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-inherit z-10" colSpan={2}>
                          <span className="inline-flex items-center gap-1">
                            <Coins className="w-3 h-3 text-indigo-500" /> Потрачено токенов
                          </span>
                        </td>
                        {last12.map(month => {
                          const spent = spentMap[month] ?? 0;
                          return (
                            <td key={month} className={cn("px-3 py-2 text-right tabular-nums text-xs", month === currentMonthKey && "bg-primary/5")}>
                              {spent > 0 ? (
                                <span className="font-medium text-indigo-600 dark:text-indigo-400">{fmtTokens(spent)}</span>
                              ) : <span className="text-muted-foreground/25">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                          {m.lastYearSpent > 0 ? fmtTokens(m.lastYearSpent) : "—"}
                        </td>
                      </tr>
                    </>
                  );
                })}
                {/* Totals row */}
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
                          {total > 0 ? fmtRub(total) : "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right tabular-nums text-primary">{fmtRub(filtered.reduce((s, m) => s + m.lastYear, 0))}</td>
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

export default function MasterRevenuePage() {
  return (
    <ProtectedRoute>
      <Layout>
        <MasterRevenueContent />
      </Layout>
    </ProtectedRoute>
  );
}
