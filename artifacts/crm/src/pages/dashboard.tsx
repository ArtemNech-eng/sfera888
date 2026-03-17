import { Layout } from "@/components/layout";
import { useGetDashboard } from "@workspace/api-client-react";
import { Loader2, TrendingUp, TrendingDown, Users, DollarSign, Target, Activity } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ProtectedRoute } from "@/hooks/use-auth";

function TrendBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  const positive = value >= 0;
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${
      positive ? "text-emerald-700 bg-emerald-100" : "text-red-700 bg-red-100"
    }`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? "+" : ""}{value}%
    </span>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, trend }: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
  trend?: number | null;
}) {
  return (
    <div className="bg-card p-6 rounded-2xl border border-border/50 shadow-sm shadow-black/5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
      <div>
        <p className="text-3xl font-display font-bold text-foreground">{value}</p>
        <div className="flex items-center gap-2 mt-1">
          <TrendBadge value={trend} />
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading, error } = useGetDashboard();

  return (
    <ProtectedRoute allowedRoles={['admin', 'master_operator', 'lead_operator']} permissionKey="dashboard">
      <Layout>
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Дашборд</h1>
            <p className="text-muted-foreground mt-1">Обзор основных показателей бизнеса</p>
          </div>

          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="bg-destructive/10 text-destructive p-6 rounded-2xl border border-destructive/20 text-center">
              Ошибка загрузки данных
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  title="Доход за месяц"
                  value={formatCurrency(stats.incomeMonth)}
                  subtitle="к прошлому месяцу"
                  icon={DollarSign}
                  trend={(stats as any).incomeTrend ?? null}
                />
                <StatCard
                  title="Средний чек"
                  value={formatCurrency(stats.avgCheck)}
                  subtitle="За завершённый заказ"
                  icon={Activity}
                />
                <StatCard
                  title="Конверсия в заказ"
                  value={`${stats.conversionRate}%`}
                  subtitle="к прошлому месяцу"
                  icon={Target}
                  trend={(stats as any).conversionTrend ?? null}
                />
                <StatCard
                  title="Задолженность мастеров"
                  value={formatCurrency(stats.totalDebt)}
                  subtitle="Ожидает оплаты"
                  icon={TrendingUp}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 shadow-sm p-6">
                  <h3 className="font-display font-semibold text-lg mb-6">Воронка заявок</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-sm text-muted-foreground mb-1">Сегодня</p>
                      <p className="text-2xl font-bold text-foreground">{stats.leadsToday}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-sm text-muted-foreground mb-1">За неделю</p>
                      <p className="text-2xl font-bold text-foreground">{stats.leadsWeek}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                      <p className="text-sm text-primary font-medium mb-1">Активные заказы</p>
                      <p className="text-2xl font-bold text-primary">{stats.ordersActive}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-sm text-muted-foreground mb-1">Всего заказов</p>
                      <p className="text-2xl font-bold text-foreground">{stats.ordersTotal}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-display font-semibold text-lg">Топ мастеров</h3>
                    <Users className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 space-y-3">
                    {stats.topMasters.length > 0 ? stats.topMasters.map((master, i) => (
                      <div key={master.id} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border/50 hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                            {i + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-foreground">{master.alias}</p>
                            <p className="text-xs text-muted-foreground">{master.city}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">★ {master.rating.toFixed(1)}</p>
                          <p className="text-xs text-muted-foreground">{master.totalOrders} зак.</p>
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground text-center py-8">Нет данных</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
