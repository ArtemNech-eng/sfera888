import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useGetSalesFunnel } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Area, AreaChart, PieChart, Pie, Legend,
} from "recharts";
import { Loader2, TrendingUp, CheckCircle2, XCircle, Target, Megaphone } from "lucide-react";

interface MonthPoint { label: string; income: number; count: number }
interface SourceStat { source: string; total: number; sentToWork: number; nonTarget: number; clientRefusal: number; conversion: number }

const SOURCE_LABELS: Record<string, string> = {
  call: "Входящий звонок",
  website: "Сайт",
  ads: "Реклама",
  avito: "Авито",
  referral: "Рекомендация",
  repeat: "Повторный",
  other: "Другое",
};

const SOURCE_COLORS: Record<string, string> = {
  call: "#6366f1",
  website: "#10b981",
  ads: "#f59e0b",
  avito: "#3b82f6",
  referral: "#8b5cf6",
  repeat: "#059669",
  other: "#94a3b8",
};

function useMonthlyRevenue() {
  return useQuery<MonthPoint[]>({
    queryKey: ["/api/analytics/monthly-revenue"],
    queryFn: () => fetch("/api/analytics/monthly-revenue", { credentials: "include" }).then(r => r.json()),
  });
}

function useLeadsBySource() {
  return useQuery<SourceStat[]>({
    queryKey: ["/api/analytics/leads-by-source"],
    queryFn: () => fetch("/api/analytics/leads-by-source", { credentials: "include" }).then(r => r.json()),
  });
}

function formatRub(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₽`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K ₽`;
  return `${n} ₽`;
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border/50 rounded-xl shadow-lg px-4 py-3 text-sm">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: <strong>{p.dataKey === "income" ? formatRub(p.value) : p.value}</strong>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const SourceTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    const d = payload[0].payload as SourceStat;
    return (
      <div className="bg-card border border-border/50 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[180px]">
        <p className="font-semibold text-foreground mb-2">{SOURCE_LABELS[d.source] ?? d.source}</p>
        <p className="text-muted-foreground">Всего: <strong className="text-foreground">{d.total}</strong></p>
        <p className="text-emerald-600">В работу: <strong>{d.sentToWork}</strong></p>
        <p className="text-orange-500">Нецелевых: <strong>{d.nonTarget}</strong></p>
        <p className="text-red-500">Отказов: <strong>{d.clientRefusal}</strong></p>
        <p className="text-primary mt-1">Конверсия: <strong>{d.conversion}%</strong></p>
      </div>
    );
  }
  return null;
};

export default function Analytics() {
  const { data: funnel, isLoading: funnelLoading } = useGetSalesFunnel();
  const { data: monthly, isLoading: monthlyLoading } = useMonthlyRevenue();
  const { data: sourceStats, isLoading: sourceLoading } = useLeadsBySource();

  const funnelData = funnel ? [
    { name: "Всего заявок",  value: funnel.total,       color: "#3b82f6" },
    { name: "В обработке",   value: funnel.processing,  color: "#f59e0b" },
    { name: "В работе",      value: funnel.sentToWork,  color: "#10b981" },
    { name: "Завершено",     value: funnel.completed,   color: "#059669" },
    { name: "Отменено",      value: (funnel as any).cancelled ?? 0, color: "#f97316" },
    { name: "Отказ",         value: funnel.refusal,     color: "#ef4444" },
    { name: "Нецелевые",     value: funnel.nonTarget,   color: "#64748b" },
  ] : [];

  const conversionRate = funnel && funnel.total > 0
    ? Math.round((funnel.sentToWork / funnel.total) * 1000) / 10
    : 0;

  const completionRate = funnel && funnel.sentToWork > 0
    ? Math.round((funnel.completed / funnel.sentToWork) * 1000) / 10
    : 0;

  const sourceBarData = (Array.isArray(sourceStats) ? sourceStats : []).map(s => ({
    ...s,
    name: SOURCE_LABELS[s.source] ?? s.source,
    color: SOURCE_COLORS[s.source] ?? "#94a3b8",
  }));

  const pieData = sourceBarData.filter(s => s.total > 0).map(s => ({ name: s.name, value: s.total, fill: s.color }));

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="analytics">
      <Layout>
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Аналитика</h1>
            <p className="text-muted-foreground mt-1">Детальные отчёты и воронка продаж</p>
          </div>

          {funnelLoading ? (
            <div className="h-24 flex items-center justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : funnel ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Всего заявок"    value={funnel.total}       icon={Target}       color="bg-blue-100 text-blue-600" />
              <MetricCard label="В работе"         value={funnel.sentToWork}  icon={TrendingUp}   color="bg-emerald-100 text-emerald-600" />
              <MetricCard label="Завершено заказов" value={funnel.completed}  icon={CheckCircle2} color="bg-green-100 text-green-700" />
              <MetricCard label="Отменено / отказ / нецел." value={((funnel as any).cancelled ?? 0) + funnel.refusal + funnel.nonTarget} icon={XCircle} color="bg-red-100 text-red-600" />
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6">
              <h3 className="font-display font-semibold text-lg mb-1">Воронка продаж</h3>
              <p className="text-xs text-muted-foreground mb-5">
                Конверсия заявка → в работу: <strong>{conversionRate}%</strong> &nbsp;·&nbsp;
                Завершено из работ: <strong>{completionRate}%</strong>
              </p>
              {funnelLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} dy={8} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Количество" radius={[6, 6, 0, 0]}>
                        {funnelData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6">
              <h3 className="font-display font-semibold text-lg mb-1">Доход по месяцам</h3>
              <p className="text-xs text-muted-foreground mb-5">Оплаченные комиссии за последние 6 месяцев</p>
              {monthlyLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : monthly && monthly.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dy={8} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={formatRub} width={60} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="income"
                        name="Доход"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        fill="url(#incomeGrad)"
                        dot={{ fill: "#6366f1", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                  Нет данных об оплатах
                </div>
              )}
            </div>
          </div>

          {/* Source analytics */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Megaphone className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-display font-semibold text-foreground">Источники заявок</h2>
                <p className="text-xs text-muted-foreground">Конверсия и качество заявок по каждому каналу</p>
              </div>
            </div>
            {sourceLoading ? (
              <div className="h-24 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
              </div>
            ) : sourceBarData.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border/50 p-10 text-center text-muted-foreground text-sm">
                Недостаточно данных для отображения
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Bar chart: volume */}
                <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 shadow-sm p-6">
                  <h3 className="font-display font-semibold mb-1">Объём и конверсия по источникам</h3>
                  <p className="text-xs text-muted-foreground mb-5">Синие = всего, зелёные = в работу</p>
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sourceBarData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} dy={8} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} allowDecimals={false} />
                        <Tooltip content={<SourceTooltip />} />
                        <Bar dataKey="total" name="Всего" radius={[4, 4, 0, 0]} fill="#cbd5e1" />
                        <Bar dataKey="sentToWork" name="В работу" radius={[4, 4, 0, 0]} fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie chart: distribution */}
                <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6 flex flex-col">
                  <h3 className="font-display font-semibold mb-1">Распределение</h3>
                  <p className="text-xs text-muted-foreground mb-4">Доля каждого источника</p>
                  <div className="flex-1 min-h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="45%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                        <Tooltip formatter={(value: any, name: any) => [value, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Table: conversion rates */}
                <div className="lg:col-span-3 bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Источник</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Всего</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">В работу</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Нецелевых</th>
                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Отказов</th>
                        <th className="text-right px-5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Конверсия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourceBarData.map((s, i) => (
                        <tr key={s.source} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                              <span className="font-medium text-foreground">{s.name}</span>
                            </div>
                          </td>
                          <td className="text-right px-4 py-3 text-foreground font-semibold">{s.total}</td>
                          <td className="text-right px-4 py-3 text-emerald-600 font-semibold">{s.sentToWork}</td>
                          <td className="text-right px-4 py-3 text-orange-500">{s.nonTarget}</td>
                          <td className="text-right px-4 py-3 text-red-500">{s.clientRefusal}</td>
                          <td className="text-right px-5 py-3">
                            <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold ${s.conversion >= 50 ? "bg-emerald-100 text-emerald-700" : s.conversion >= 25 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                              {s.conversion}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
