import { Layout } from "@/components/layout";
import { useGetDashboard } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, TrendingUp, TrendingDown, Users, DollarSign, Target, BarChart3,
  AlertCircle, CheckCircle2, Clock, UserX, Ban, Receipt, ArrowRight, Star,
  ShieldAlert, CalendarDays, Zap, FileText, Wallet,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ProtectedRoute } from "@/hooks/use-auth";
import { Link } from "wouter";

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

function StatCard({ title, value, subtitle, icon: Icon, trend, href, accent }: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
  trend?: number | null;
  href?: string;
  accent?: "default" | "red" | "green" | "blue";
}) {
  const accentMap = {
    default: "bg-primary/10 text-primary",
    red: "bg-red-100 text-red-600",
    green: "bg-emerald-100 text-emerald-600",
    blue: "bg-blue-100 text-blue-600",
  };
  const iconBg = accentMap[accent ?? "default"];

  const inner = (
    <div className={`bg-card p-5 rounded-2xl border border-border/50 shadow-sm flex flex-col gap-3 h-full ${href ? "hover:border-primary/30 hover:shadow-md transition-all" : ""}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground leading-tight">{title}</h3>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-foreground leading-none">{value}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <TrendBadge value={trend} />
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
      </div>
      {href && (
        <div className="flex items-center gap-1 text-xs text-primary font-medium mt-auto pt-1">
          Подробнее <ArrowRight className="w-3 h-3" />
        </div>
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function AlertItem({ icon: Icon, label, count, href, color }: {
  icon: any; label: string; count: number; href: string;
  color: "red" | "amber" | "blue" | "purple";
}) {
  const colors = {
    red:    "bg-red-50 border-red-200 text-red-800 hover:bg-red-100",
    amber:  "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100",
    blue:   "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100",
    purple: "bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100",
  };
  const badgeColors = {
    red: "bg-red-500", amber: "bg-amber-500", blue: "bg-blue-500", purple: "bg-purple-500",
  };
  return (
    <Link href={href}>
      <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border font-medium text-sm transition-colors cursor-pointer ${colors[color]}`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        {label}
        <span className={`${badgeColors[color]} text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5`}>
          {count}
        </span>
      </div>
    </Link>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`p-4 rounded-xl border ${highlight ? "bg-primary/5 border-primary/15" : "bg-slate-50 border-slate-100"}`}>
      <p className={`text-xs mb-1 ${highlight ? "text-primary font-medium" : "text-muted-foreground"}`}>{label}</p>
      <p className={`text-xl font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading, error } = useGetDashboard();
  const { data: overdueMasters } = useQuery<{ masterId: number; alias: string; totalOverdue: number; count: number }[]>({
    queryKey: ["/api/finance/overdue-masters"],
    queryFn: () => fetch("/api/finance/overdue-masters", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60_000,
  });
  const { data: avitoAdvanceData } = useQuery<{ advanceBalance: number; source?: string; needsReauth?: boolean; updatedAt?: string | null }>({
    queryKey: ["/api/avito/advance"],
    queryFn: () => fetch("/api/avito/advance", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  const avitoBalanceRub = avitoAdvanceData?.advanceBalance ?? null;

  const s = stats as any;
  const alerts = s ? [
    s.newLeads > 0 && { icon: Zap, label: "Новых заявок", count: s.newLeads, href: "/leads", color: "blue" as const },
    s.ordersWaitingMaster > 0 && { icon: Clock, label: "Без мастера", count: s.ordersWaitingMaster, href: "/orders", color: "amber" as const },
    s.noMasterFoundMonth > 0 && { icon: UserX, label: "Не нашли мастера (месяц)", count: s.noMasterFoundMonth, href: "/orders", color: "red" as const },
    s.cancellationRequests > 0 && { icon: Ban, label: "Запросов отмены", count: s.cancellationRequests, href: "/orders", color: "red" as const },
    s.pendingAmounts > 0 && { icon: Receipt, label: "Суммы на согласовании", count: s.pendingAmounts, href: "/orders", color: "purple" as const },
    s.pendingContracts > 0 && { icon: FileText, label: "Договоры на проверку", count: s.pendingContracts, href: "/masters?status=contract_review", color: "amber" as const },
  ].filter(Boolean) : [];

  return (
    <ProtectedRoute allowedRoles={['admin', 'master_operator', 'lead_operator']} permissionKey="dashboard">
      <Layout>
        <div className="space-y-6">
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
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard
                  title="Доход за месяц"
                  value={formatCurrency(stats.incomeMonth)}
                  subtitle="к прошлому месяцу"
                  icon={DollarSign}
                  trend={s.incomeTrend ?? null}
                  href="/finance"
                  accent="green"
                />
                <StatCard
                  title="Задолженность"
                  value={formatCurrency(stats.totalDebt)}
                  subtitle="Ожидает оплаты"
                  icon={AlertCircle}
                  href="/finance"
                  accent={stats.totalDebt > 0 ? "red" : "default"}
                />
                <StatCard
                  title="Конверсия"
                  value={`${stats.conversionRate}%`}
                  subtitle="лид → заказ за месяц"
                  icon={Target}
                  trend={s.conversionTrend ?? null}
                  href="/analytics"
                />
                <StatCard
                  title="Средний чек"
                  value={formatCurrency(stats.avgCheck)}
                  subtitle="За завершённый заказ"
                  icon={BarChart3}
                />
                <StatCard
                  title="Активных мастеров"
                  value={String(s.activeMasters ?? "—")}
                  subtitle="В базе"
                  icon={Users}
                  href="/masters"
                  accent="blue"
                />
                {avitoBalanceRub !== null && (
                  <StatCard
                    title="Аванс Авито"
                    value={`${avitoBalanceRub.toLocaleString("ru-RU")} ₽`}
                    subtitle={avitoAdvanceData?.needsReauth ? "⚠ Переподключите Авито" : avitoAdvanceData?.source === "ops" ? "расчёт авто" : "аванс Авито"}
                    icon={Wallet}
                    href="/avito"
                    accent={avitoBalanceRub < 1000 ? "red" : "green"}
                  />
                )}
              </div>

              {/* Attention block */}
              {alerts.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-semibold text-amber-900">Требует внимания</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(alerts as any[]).map((a: any, i: number) => (
                      <AlertItem key={i} {...a} />
                    ))}
                  </div>
                </div>
              )}

              {/* Overdue masters warning */}
              {overdueMasters && overdueMasters.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-xl">
                      <ShieldAlert className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-red-900">
                        {overdueMasters.length === 1 ? "1 мастер" : `${overdueMasters.length} мастера`} с просроченной комиссией
                      </p>
                      <p className="text-sm text-red-700">
                        Итого: {overdueMasters.reduce((s, m) => s + m.totalOverdue, 0).toLocaleString("ru")} ₽ — приём заказов заблокирован
                      </p>
                    </div>
                  </div>
                  <Link href="/finance">
                    <span className="text-sm font-medium text-red-700 bg-red-100 border border-red-200 rounded-xl px-3 py-1.5 hover:bg-red-200 transition-colors cursor-pointer">
                      Открыть финансы →
                    </span>
                  </Link>
                </div>
              )}

              {/* Bottom grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Activity stats */}
                <div className="lg:col-span-2 bg-card rounded-2xl border border-border/50 shadow-sm p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-semibold text-lg">Активность</h3>
                    <CalendarDays className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Заявки (лиды)</p>
                    <div className="grid grid-cols-3 gap-3">
                      <MiniStat label="Сегодня" value={stats.leadsToday} />
                      <MiniStat label="За 7 дней" value={stats.leadsWeek} />
                      <MiniStat label="За месяц" value={stats.leadsMonth} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Заказы</p>
                    <div className="grid grid-cols-3 gap-3">
                      <MiniStat label="Завершено сегодня" value={s.completedToday ?? 0} />
                      <MiniStat label="Завершено за месяц" value={s.completedMonth ?? 0} />
                      <MiniStat label="Активных сейчас" value={stats.ordersActive} highlight />
                    </div>
                    {(s.noMasterFoundTotal ?? 0) > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 border border-red-100">
                        <UserX className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>
                          Не нашли мастера: <b>{s.noMasterFoundTotal}</b> всего
                          {(s.noMasterFoundMonth ?? 0) > 0 && <>, <b>{s.noMasterFoundMonth}</b> в этом месяце</>}
                          {" "}— заказы закрыты автоматически после 48ч
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Top masters */}
                <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-display font-semibold text-lg">Топ мастеров</h3>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="w-3 h-3" /> за месяц
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    {stats.topMasters.length > 0 ? stats.topMasters.map((master: any, i: number) => (
                      <div key={master.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-background border border-border/50 hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                            i === 0 ? "bg-yellow-100 text-yellow-700" :
                            i === 1 ? "bg-slate-100 text-slate-600" :
                            i === 2 ? "bg-amber-100 text-amber-700" :
                            "bg-primary/10 text-primary"
                          }`}>
                            {i + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{master.alias}</p>
                            <p className="text-xs text-muted-foreground">{master.city}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className="text-sm font-bold text-foreground">{master.completedMonth ?? 0} зак.</p>
                          <p className="text-xs text-muted-foreground">★ {master.rating.toFixed(1)}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="flex flex-col items-center justify-center h-full py-10 text-center">
                        <UserX className="w-8 h-8 text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">Нет активных мастеров</p>
                      </div>
                    )}
                  </div>
                  {stats.topMasters.length > 0 && (
                    <Link href="/masters">
                      <div className="mt-4 text-center text-xs text-primary font-medium flex items-center justify-center gap-1 hover:underline cursor-pointer">
                        Все мастера <ArrowRight className="w-3 h-3" />
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
