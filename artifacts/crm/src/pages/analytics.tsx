import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  Loader2, TrendingUp, TrendingDown, DollarSign, Calendar,
  Users, BarChart2, MapPin, Star, AlertTriangle, Download,
  ChevronUp, ChevronDown, ChevronsUpDown, Megaphone,
} from "lucide-react";

// ─── HELPERS ────────────────────────────────────────────────────────────────

function formatRub(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₽`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ₽`;
  return `${n} ₽`;
}

function pctColor(v: number | null) {
  if (v === null) return "text-muted-foreground";
  return v >= 0 ? "text-emerald-600" : "text-red-500";
}

function pctIcon(v: number | null) {
  if (v === null) return null;
  return v >= 0
    ? <TrendingUp className="w-3.5 h-3.5" />
    : <TrendingDown className="w-3.5 h-3.5" />;
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

// ─── SECTION HEADER ──────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle, action }: {
  icon: any; title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-display font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

function ExportBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      <Download className="w-3.5 h-3.5" />
      Экспорт
    </button>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/50 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.dataKey?.includes("income") || p.dataKey?.includes("Income") ? formatRub(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── BLOCK 1: ДЕНЬГИ ─────────────────────────────────────────────────────────

function MoneyBlock() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/revenue"],
    queryFn: () => fetch("/api/analytics/revenue", { credentials: "include" }).then(r => r.json()),
  });

  if (isLoading) return <BlockLoader />;

  const cards = [
    { label: "Доход сегодня", value: data?.today ?? 0, cmp: data?.todayVsYesterday, sub: "vs вчера" },
    { label: "Доход за неделю", value: data?.week ?? 0, cmp: data?.weekVsPrev, sub: "vs прошлая неделя" },
    { label: "Доход за месяц", value: data?.month ?? 0, cmp: data?.monthVsPrev, sub: "vs прошлый месяц" },
    { label: "Средний доход в день", value: data?.avgDay ?? 0, cmp: null, sub: "текущий месяц" },
  ];

  return (
    <div>
      <SectionHeader icon={DollarSign} title="Деньги" subtitle="Оплаченные предоплаты и комиссии" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(c => (
          <div key={c.label} className="bg-card rounded-2xl border border-border/50 shadow-sm p-5">
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className="text-2xl font-display font-bold text-foreground">{formatRub(c.value)}</p>
            {c.cmp !== null && c.cmp !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${pctColor(c.cmp)}`}>
                {pctIcon(c.cmp)}
                <span>{c.cmp > 0 ? "+" : ""}{c.cmp}% {c.sub}</span>
              </div>
            )}
            {c.cmp === null && <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6">
        <h3 className="font-display font-semibold mb-4">Доход по дням (последние 30 дней)</h3>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.daily ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} interval={4} dy={6} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={formatRub} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="income" name="Доход" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── BLOCK 2: ВОРОНКА ────────────────────────────────────────────────────────

function FunnelBlock({ cities }: { cities: string[] }) {
  const [period, setPeriod] = useState<Period>("month");
  const [city, setCity] = useState("all");
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const dates = getPeriodDates(period, custom);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/funnel-detail", dates, city],
    queryFn: () => fetch(`/api/analytics/funnel-detail?from=${dates.from}&to=${dates.to}&city=${city}`, { credentials: "include" }).then(r => r.json()),
  });

  const stages = data?.stages ?? [];
  const maxCount = Math.max(...stages.map((s: any) => s.count), 1);

  return (
    <div>
      <SectionHeader icon={BarChart2} title="Воронка продаж" subtitle="Путь клиента от обращения до завершения" />
      <div className="flex flex-wrap gap-3 mb-5">
        <PeriodFilter value={period} onChange={setPeriod} />
        <CitySelect value={city} onChange={setCity} cities={cities} />
      </div>

      {isLoading ? <BlockLoader /> : (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6">
          <div className="space-y-3">
            {stages.map((stage: any, i: number) => {
              const width = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
              const colors = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#f97316", "#059669"];
              const color = colors[i] ?? "#94a3b8";
              return (
                <div key={stage.name}>
                  {i > 0 && (
                    <div className="flex items-center gap-2 py-1 pl-4">
                      <div className="w-px h-4 bg-border" />
                      <span className="text-xs text-muted-foreground">
                        ↓ {stage.pctFromPrev}% от предыдущего &nbsp;·&nbsp; {stage.pctFromFirst}% от начала
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-40 flex-shrink-0 text-sm font-medium text-foreground truncate">{stage.name}</div>
                    <div className="flex-1 relative h-9 bg-muted/30 rounded-lg overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                        style={{ width: `${width}%`, backgroundColor: color }}
                      />
                      <div className="absolute inset-0 flex items-center px-3">
                        <span className="text-sm font-bold" style={{ color: width > 30 ? "white" : color }}>
                          {stage.count.toLocaleString("ru-RU")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-border/50 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Итоговая конверсия (обращение → завершение):</span>
            <span className={`text-lg font-bold ${(data?.finalConversion ?? 0) >= 20 ? "text-emerald-600" : (data?.finalConversion ?? 0) >= 10 ? "text-amber-600" : "text-red-500"}`}>
              {data?.finalConversion ?? 0}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BLOCK 3: СТОИМОСТЬ ПРИВЛЕЧЕНИЯ ──────────────────────────────────────────

function SourcesROIBlock() {
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const dates = getPeriodDates(period, custom);

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/analytics/sources-roi", dates],
    queryFn: () => fetch(`/api/analytics/sources-roi?from=${dates.from}&to=${dates.to}`, { credentials: "include" }).then(r => r.json()),
  });

  const rows = data ?? [];

  function roiBadge(roi: number | null) {
    if (roi === null) return <span className="text-muted-foreground text-xs">—</span>;
    const cls = roi >= 3 ? "bg-emerald-100 text-emerald-700" : roi >= 1.5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
    return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>x{roi.toFixed(1)}</span>;
  }

  function doExport() {
    exportCSV("sources-roi.csv",
      ["Источник", "Потрачено", "Обращений", "Заявок", "Заказов", "Цена обращения", "Цена заявки", "Цена заказа", "Доход", "ROI"],
      rows.map(r => [r.label, r.spent, r.appeals, r.applications, r.orders,
        r.costPerAppeal ?? "—", r.costPerApplication ?? "—", r.costPerOrder ?? "—",
        r.income, r.roi ? `x${r.roi.toFixed(1)}` : "—"]));
  }

  return (
    <div>
      <SectionHeader icon={Megaphone} title="Стоимость привлечения" subtitle="ROI по источникам рекламы"
        action={<ExportBtn onClick={doExport} />} />
      <div className="flex flex-wrap gap-3 mb-5">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {isLoading ? <BlockLoader /> : (
        <>
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    {["Источник", "Потрачено", "Обращений", "Заявок", "Заказов", "Цена обращения", "Цена заявки", "Цена заказа", "Доход", "ROI"].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.appeals > 0).map((r, i) => (
                    <tr key={r.source} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${i % 2 ? "bg-muted/10" : ""}`}>
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{r.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.spent > 0 ? formatRub(r.spent) : "—"}</td>
                      <td className="px-4 py-3 font-semibold">{r.appeals}</td>
                      <td className="px-4 py-3">{r.applications}</td>
                      <td className="px-4 py-3 text-emerald-600 font-semibold">{r.orders}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.costPerAppeal ? formatRub(r.costPerAppeal) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.costPerApplication ? formatRub(r.costPerApplication) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.costPerOrder ? formatRub(r.costPerOrder) : "—"}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{formatRub(r.income)}</td>
                      <td className="px-4 py-3">{roiBadge(r.roi)}</td>
                    </tr>
                  ))}
                  {rows.filter(r => r.appeals > 0).length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-sm">Нет данных за период</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            * Расходы на рекламу по источникам (кроме Авито) требуют ручного ввода — функция в разработке
          </p>
        </>
      )}
    </div>
  );
}

// ─── BLOCK 4: АНАЛИТИКА ПО ГОРОДАМ ───────────────────────────────────────────

type SortDir = "asc" | "desc";

function CitiesBlock() {
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const [sortKey, setSortKey] = useState("income");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const dates = getPeriodDates(period, custom);

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/analytics/cities", dates],
    queryFn: () => fetch(`/api/analytics/cities?from=${dates.from}&to=${dates.to}`, { credentials: "include" }).then(r => r.json()),
  });

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "desc" ? -diff : diff;
    });
  }, [data, sortKey, sortDir]);

  function handleSort(key: string) {
    if (key === sortKey) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: string }) {
    if (k !== sortKey) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />;
  }

  function Th({ label, k }: { label: string; k: string }) {
    return (
      <th
        className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-foreground select-none"
        onClick={() => handleSort(k)}
      >
        <div className="flex items-center gap-1">{label}<SortIcon k={k} /></div>
      </th>
    );
  }

  function doExport() {
    exportCSV("cities.csv",
      ["Город", "Мастеров", "Заявок", "Заказов", "Конверсия", "Средний чек", "Доход", "Прибыль"],
      sorted.map(r => [r.city, r.masters, r.leads, r.completed, `${r.conversion}%`, r.avgCheck, r.income, r.profit]));
  }

  return (
    <div>
      <SectionHeader icon={MapPin} title="Аналитика по городам" subtitle="Показатели по каждому городу"
        action={<ExportBtn onClick={doExport} />} />
      <div className="flex flex-wrap gap-3 mb-5">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {isLoading ? <BlockLoader /> : (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide">Город</th>
                  <Th label="Мастеров" k="masters" />
                  <Th label="Заявок" k="leads" />
                  <Th label="Заказов" k="completed" />
                  <Th label="Конверсия" k="conversion" />
                  <Th label="Средний чек" k="avgCheck" />
                  <Th label="Доход" k="income" />
                  <Th label="Прибыль" k="profit" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.city} className={`border-b border-border/30 hover:bg-muted/20 ${i % 2 ? "bg-muted/10" : ""}`}>
                    <td className="px-4 py-3 font-medium text-foreground">{r.city}</td>
                    <td className="px-4 py-3">{r.masters}</td>
                    <td className="px-4 py-3">{r.leads}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">{r.completed}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.conversion >= 20 ? "bg-emerald-100 text-emerald-700" : r.conversion >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                        {r.conversion}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.avgCheck > 0 ? formatRub(r.avgCheck) : "—"}</td>
                    <td className="px-4 py-3 font-semibold">{formatRub(r.income)}</td>
                    <td className="px-4 py-3">
                      <span className={r.profit >= 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                        {r.profit >= 0 ? "+" : ""}{formatRub(r.profit)}
                      </span>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">Нет данных</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BLOCK 5: РЕЙТИНГ МАСТЕРОВ ───────────────────────────────────────────────

function MastersRatingBlock({ cities }: { cities: string[] }) {
  const [period, setPeriod] = useState<Period>("month");
  const [city, setCity] = useState("all");
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const [sortKey, setSortKey] = useState("conversion");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const dates = getPeriodDates(period, custom);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/masters-rating", dates, city],
    queryFn: () => fetch(`/api/analytics/masters-rating?from=${dates.from}&to=${dates.to}&city=${city}`, { credentials: "include" }).then(r => r.json()),
  });

  const sorted = useMemo(() => {
    const list = data?.masters ?? [];
    return [...list].sort((a: any, b: any) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "desc" ? -diff : diff;
    });
  }, [data, sortKey, sortDir]);

  function handleSort(key: string) {
    if (key === sortKey) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortIcon({ k }: { k: string }) {
    if (k !== sortKey) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />;
  }

  function Th({ label, k }: { label: string; k: string }) {
    return (
      <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-foreground select-none"
        onClick={() => handleSort(k)}>
        <div className="flex items-center gap-1">{label}<SortIcon k={k} /></div>
      </th>
    );
  }

  function doExport() {
    exportCSV("masters-rating.csv",
      ["Место", "Имя", "Город", "Заявок", "Завершено", "Конверсия", "Рейтинг", "Заработок", "Принёс компании"],
      sorted.map((r: any, i: number) => [i + 1, r.alias, r.city, r.periodLeads, r.periodCompleted,
        `${r.conversion}%`, r.rating, r.earnings, r.broughtToCompany]));
  }

  return (
    <div>
      <SectionHeader icon={Star} title="Рейтинг мастеров" subtitle="ТОП по конверсии в завершённые заказы"
        action={<ExportBtn onClick={doExport} />} />
      <div className="flex flex-wrap gap-3 mb-5">
        <PeriodFilter value={period} onChange={setPeriod} />
        <CitySelect value={city} onChange={setCity} cities={cities} />
      </div>

      {isLoading ? <BlockLoader /> : (
        <>
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide">Место</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide">Имя</th>
                    <th className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide">Город</th>
                    <Th label="Заявок" k="periodLeads" />
                    <Th label="Завершено" k="periodCompleted" />
                    <Th label="Конверсия" k="conversion" />
                    <Th label="Рейтинг" k="rating" />
                    <Th label="Заработок" k="earnings" />
                    <Th label="Принёс компании" k="broughtToCompany" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((m: any, i: number) => (
                    <tr key={m.id} className={`border-b border-border/30 hover:bg-muted/20 ${i % 2 ? "bg-muted/10" : ""}`}>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">#{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{m.alias}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.city}</td>
                      <td className="px-4 py-3">{m.periodLeads}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">{m.periodCompleted}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${m.conversion >= 80 ? "bg-emerald-100 text-emerald-700" : m.conversion >= 60 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                          {m.conversion}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <span className="font-semibold">{m.rating.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{m.earnings > 0 ? formatRub(m.earnings) : "—"}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{m.broughtToCompany > 0 ? formatRub(m.broughtToCompany) : "—"}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">Нет данных за период</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {(data?.problematic ?? []).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold text-red-700">Проблемные мастера</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(data.problematic as any[]).map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-1.5 text-sm">
                    <span className="font-medium text-foreground">{m.alias}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{m.city}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="flex items-center gap-0.5 text-amber-600">
                      <Star className="w-3 h-3 fill-amber-400" />{m.rating.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── BLOCK 6: АВИТО ОБЪЯВЛЕНИЯ ────────────────────────────────────────────────

function AvitoAdsBlock({ cities }: { cities: string[] }) {
  const [city, setCity] = useState("all");

  // Correct endpoint: /api/avito/items-with-stats returns { resources: [...], meta, statsError }
  // Each item has: id, title, status, stats: { uniqViews, uniqContacts, uniqFavorites, ... }
  const { data: avitoData, isLoading, error } = useQuery<any>({
    queryKey: ["/api/avito/items-with-stats"],
    queryFn: () => fetch("/api/avito/items-with-stats?per_page=100", { credentials: "include" }).then(r => r.json()),
    retry: 1,
  });

  const items: any[] = useMemo(() => {
    const list: any[] = avitoData?.resources ?? [];
    if (city === "all") return list;
    return list.filter((item: any) => item.title?.toLowerCase().includes(city.toLowerCase()));
  }, [avitoData, city]);

  // Items that need attention
  const recommendations = items.filter((it: any) => {
    const views = it.stats?.uniqViews ?? 0;
    const contacts = it.stats?.uniqContacts ?? 0;
    const conversion = views > 0 ? (contacts / views) * 100 : 0;
    return conversion < 5 && views >= 20; // low conversion with enough views
  });

  function conversionColor(conv: number) {
    if (conv >= 5) return "bg-emerald-100 text-emerald-700";
    if (conv >= 2) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-600";
  }

  function doExport() {
    exportCSV("avito-ads.csv",
      ["Название", "Статус", "Просмотры (месяц)", "Просмотры (неделя)", "Контакты (месяц)", "Контакты (неделя)", "Конверсия %"],
      items.map(it => {
        const views = it.stats?.uniqViews ?? 0;
        const viewsW = it.stats?.viewsWeek ?? 0;
        const contacts = it.stats?.uniqContacts ?? 0;
        const contactsW = it.stats?.contactsWeek ?? 0;
        const conv = views > 0 ? ((contacts / views) * 100).toFixed(1) : "0";
        return [it.title, it.status, views, viewsW, contacts, contactsW, `${conv}%`];
      }));
  }

  if (isLoading) return (
    <div>
      <SectionHeader icon={BarChart2} title="Эффективность объявлений" subtitle="Данные из Авито API" />
      <BlockLoader />
    </div>
  );

  const isNotConnected = (error as any) || avitoData?.error || avitoData?.code === "NO_ITEMS_PERMISSION";

  if (isNotConnected) return (
    <div>
      <SectionHeader icon={BarChart2} title="Эффективность объявлений" subtitle="Данные из Авито API" />
      <div className="bg-card rounded-2xl border border-border/50 p-8 text-center text-muted-foreground text-sm">
        Авито не подключён или нет доступа к объявлениям. Настройте интеграцию в разделе Авито.
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader icon={BarChart2} title="Эффективность объявлений" subtitle="Данные из Авито API"
        action={<ExportBtn onClick={doExport} />} />
      <div className="flex flex-wrap gap-3 mb-5">
        <CitySelect value={city} onChange={setCity} cities={cities} />
      </div>

      {recommendations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-700">Рекомендации системы</span>
          </div>
          {recommendations.slice(0, 5).map((it: any) => {
            const views = it.stats?.uniqViews ?? 0;
            const contacts = it.stats?.uniqContacts ?? 0;
            const conv = views > 0 ? (contacts / views) * 100 : 0;
            return (
              <p key={it.id} className="text-xs text-amber-800">
                ⚠️ «{it.title}» — мало кликают (конверсия {conv.toFixed(1)}% при {views} просмотрах). Рекомендуется изменить заголовок или фото.
              </p>
            );
          })}
        </div>
      )}

      {avitoData?.statsError && (
        <div className="bg-muted/30 border border-border/50 rounded-xl px-4 py-2 mb-4 text-xs text-muted-foreground">
          Статистика просмотров временно недоступна: {avitoData.statsError}
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[750px]">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                {["Название", "Статус", "Просмотры (мес.)", "Просмотры (нед.)", "Контакты (мес.)", "Контакты (нед.)", "Конверсия"].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, i: number) => {
                const views = it.stats?.uniqViews ?? 0;
                const viewsW = it.stats?.viewsWeek ?? 0;
                const contacts = it.stats?.uniqContacts ?? 0;
                const contactsW = it.stats?.contactsWeek ?? 0;
                const conv = views > 0 ? (contacts / views) * 100 : 0;
                const isActive = it.status === "active";
                return (
                  <tr key={it.id ?? i} className={`border-b border-border/30 hover:bg-muted/20 ${i % 2 ? "bg-muted/10" : ""}`}>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[220px] truncate">{it.title}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {isActive ? "Активно" : it.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold">{views.toLocaleString("ru-RU")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{viewsW.toLocaleString("ru-RU")}</td>
                    <td className="px-4 py-3 font-semibold text-blue-600">{contacts}</td>
                    <td className="px-4 py-3 text-muted-foreground">{contactsW}</td>
                    <td className="px-4 py-3">
                      {views > 0
                        ? <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${conversionColor(conv)}`}>{conv.toFixed(1)}%</span>
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Нет объявлений</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {items.length > 0 && (
          <div className="px-5 py-3 border-t border-border/30 text-xs text-muted-foreground">
            Всего объявлений: {items.length} · Активных: {items.filter((it: any) => it.status === "active").length}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BLOCK 7: ДИНАМИКА ────────────────────────────────────────────────────────

function DynamicsBlock() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/analytics/dynamics", days],
    queryFn: () => fetch(`/api/analytics/dynamics?days=${days}`, { credentials: "include" }).then(r => r.json()),
  });

  const daily = data?.daily ?? [];
  const weeks = data?.weeks ?? [];

  return (
    <div>
      <SectionHeader icon={TrendingUp} title="Динамика" subtitle="Тренды за выбранный период" />
      <div className="flex gap-1.5 mb-6">
        {[30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${days === d ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}>
            {d} дней
          </button>
        ))}
      </div>

      {isLoading ? <BlockLoader /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Заявки по дням">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} interval={Math.floor(days / 6)} dy={6} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="leads" name="Заявки" stroke="#3b82f6" strokeWidth={2} fill="url(#leadsGrad)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Доход по дням">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="incGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} interval={Math.floor(days / 6)} dy={6} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={formatRub} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="income" name="Доход" stroke="#10b981" strokeWidth={2} fill="url(#incGrad2)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Мастера">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} interval={Math.floor(days / 6)} dy={6} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line type="monotone" dataKey="activeMasters" name="Активных" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="newMasters" name="Новых" stroke="#f59e0b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Конверсия по неделям">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} dy={6} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v: any) => [`${v}%`, "Конверсия"]} />
                <Bar dataKey="conversion" name="Конверсия" fill="#6366f1" radius={[4, 4, 0, 0]}>
                  {weeks.map((_: any, i: number) => (
                    <Cell key={i} fill={i === weeks.length - 1 ? "#6366f1" : "#c7d2fe"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6">
      <h3 className="font-display font-semibold mb-4 text-foreground">{title}</h3>
      <div className="h-[200px]">{children}</div>
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function BlockLoader() {
  return (
    <div className="h-40 flex items-center justify-center">
      <Loader2 className="w-7 h-7 animate-spin text-primary" />
    </div>
  );
}

function CitySelect({ value, onChange, cities }: { value: string; onChange: (c: string) => void; cities: string[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-8 px-3 text-xs rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      <option value="all">Все города</option>
      {cities.map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { data: cities = [] } = useQuery<string[]>({
    queryKey: ["/api/analytics/city-list"],
    queryFn: () => fetch("/api/analytics/city-list", { credentials: "include" }).then(r => r.json()),
  });

  return (
    <ProtectedRoute allowedRoles={["admin"]} permissionKey="analytics">
      <Layout>
        <div className="space-y-12">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">📊 Аналитика</h1>
            <p className="text-muted-foreground mt-1">Полный отчёт по работе сервиса</p>
          </div>

          <MoneyBlock />
          <div className="border-t border-border/30" />
          <FunnelBlock cities={cities} />
          <div className="border-t border-border/30" />
          <SourcesROIBlock />
          <div className="border-t border-border/30" />
          <CitiesBlock />
          <div className="border-t border-border/30" />
          <MastersRatingBlock cities={cities} />
          <div className="border-t border-border/30" />
          <AvitoAdsBlock cities={cities} />
          <div className="border-t border-border/30" />
          <DynamicsBlock />
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
