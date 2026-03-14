import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useGetSalesFunnel } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Area, AreaChart,
} from "recharts";
import { Loader2, TrendingUp, CheckCircle2, XCircle, Target } from "lucide-react";

interface MonthPoint { label: string; income: number; count: number }

function useMonthlyRevenue() {
  return useQuery<MonthPoint[]>({
    queryKey: ["/api/analytics/monthly-revenue"],
    queryFn: () => fetch("/api/analytics/monthly-revenue", { credentials: "include" }).then(r => r.json()),
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

export default function Analytics() {
  const { data: funnel, isLoading: funnelLoading } = useGetSalesFunnel();
  const { data: monthly, isLoading: monthlyLoading } = useMonthlyRevenue();

  const funnelData = funnel ? [
    { name: "Всего заявок",  value: funnel.total,       color: "#3b82f6" },
    { name: "В обработке",   value: funnel.processing,  color: "#f59e0b" },
    { name: "В работе",      value: funnel.sentToWork,  color: "#10b981" },
    { name: "Завершено",     value: funnel.completed,   color: "#059669" },
    { name: "Отказ",         value: funnel.refusal,     color: "#ef4444" },
    { name: "Нецелевые",     value: funnel.nonTarget,   color: "#64748b" },
  ] : [];

  const conversionRate = funnel && funnel.total > 0
    ? Math.round((funnel.sentToWork / funnel.total) * 1000) / 10
    : 0;

  const completionRate = funnel && funnel.sentToWork > 0
    ? Math.round((funnel.completed / funnel.sentToWork) * 1000) / 10
    : 0;

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
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
              <MetricCard label="Отказов / нецелевых" value={funnel.refusal + funnel.nonTarget} icon={XCircle} color="bg-red-100 text-red-600" />
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
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
