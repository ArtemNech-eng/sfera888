import { useState } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Users,
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  Award,
  Calendar,
  MapPin,
  Percent,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useGetCities } from "@workspace/api-client-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Types
interface PartnerStat {
  id: number;
  name: string;
  city: string;
  status: string;
  leads_count: number;
  accepted_count: number;
  conversion_pct: number;
  plan_pct: number;
  fixed_earned: number;
  fixed_pct: number;
  bonus_earned: number;
  total_earned: number;
}

interface Summary {
  total_partners: number;
  active_partners: number;
  leads_this_month: number;
  accepted_this_month: number;
  conversion_pct: number;
  fixed_earned_total: number;
  bonus_earned_total: number;
  roi_channel: number;
}

interface PlanCompletion {
  completed: number;
  almost: number;
  not_completed: number;
  avg_pct: number;
}

interface AnalyticsResponse {
  summary: Summary;
  plan_completion: PlanCompletion;
  partners: PartnerStat[];
  top5: PartnerStat[];
  settings: {
    partner_fixed_salary_max: number;
    partner_fixed_target_leads: number;
    partner_bonus_per_accepted_lead: number;
    partner_monthly_leads_plan: number;
    manual_partner_lead_review: boolean;
    partner_payout_day_start: number;
    partner_payout_day_end: number;
  };
}

interface DailyData {
  day: number;
  date: string;
  leads: number;
  accepted: number;
}

const statusLabels: Record<string, string> = {
  active: "Активен",
  paused: "На паузе",
  blocked: "Заблокирован",
  archived: "В архиве",
};

const statusBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  blocked: "destructive",
  archived: "outline",
};

// API functions
async function fetchAnalytics(params: {
  year?: number;
  month?: number;
}): Promise<AnalyticsResponse> {
  const qs = new URLSearchParams();
  if (params.year) qs.set("year", String(params.year));
  if (params.month) qs.set("month", String(params.month));
  const r = await fetch(`/api/crm/partner-analytics?${qs}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch analytics");
  return r.json();
}

async function fetchPartnerDaily(partnerId: number, year: number, month: number): Promise<DailyData[]> {
  const qs = new URLSearchParams();
  qs.set("year", String(year));
  qs.set("month", String(month));
  const r = await fetch(`/api/crm/partner-analytics/${partnerId}/daily?${qs}`, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch daily data");
  return r.json();
}

// Format number
function formatNum(n: number): string {
  return n.toLocaleString("ru-RU");
}

// Partner Detail Drawer
function PartnerDetailDrawer({
  partner,
  open,
  onOpenChange,
  year,
  month,
  settings,
}: {
  partner: PartnerStat | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
  month: number;
  settings: AnalyticsResponse["settings"] | null;
}) {
  const { data: daily, isLoading } = useQuery<DailyData[]>({
    queryKey: ["partner-daily", partner?.id, year, month],
    queryFn: () => fetchPartnerDaily(partner!.id, year, month),
    enabled: !!partner,
  });

  if (!partner) return null;

  const chartData = daily?.map((d) => ({
    ...d,
    label: `${d.day}`,
  })) || [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-2xl mx-auto max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {partner.name}
          </DrawerTitle>
          <DrawerDescription>
            Детальная аналитика партнёра
          </DrawerDescription>
        </DrawerHeader>
        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Profile */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Город</div>
                <div className="font-medium">{partner.city}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Статус</div>
                <Badge variant={statusBadgeVariants[partner.status]} className="mt-1">
                  {statusLabels[partner.status]}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Конверсия</div>
                <div className="font-medium text-lg">{partner.conversion_pct}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Итого</div>
                <div className="font-medium text-lg text-green-600">
                  {formatNum(partner.total_earned)} ₽
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Лиды и принятые по дням
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : chartData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(value: number, name: string) => [
                          value,
                          name === "leads" ? "Лиды" : "Принятые",
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="monotone"
                        dataKey="leads"
                        name="Лиды"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="accepted"
                        name="Принятые"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  Нет данных за выбранный период
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-blue-50">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-blue-600">{partner.leads_count}</div>
                <div className="text-xs text-blue-700">Лидов</div>
              </CardContent>
            </Card>
            <Card className="bg-green-50">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-green-600">{partner.accepted_count}</div>
                <div className="text-xs text-green-700">Принято</div>
              </CardContent>
            </Card>
            <Card className="bg-amber-50">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-amber-600">{partner.plan_pct}%</div>
                <div className="text-xs text-amber-700">План ({settings?.partner_monthly_leads_plan})</div>
              </CardContent>
            </Card>
            <Card className="bg-purple-50">
              <CardContent className="p-3">
                <div className="text-2xl font-bold text-purple-600">{partner.fixed_pct}%</div>
                <div className="text-xs text-purple-700">Фикс ({formatNum(partner.fixed_earned)} ₽)</div>
              </CardContent>
            </Card>
          </div>

          {/* Earnings breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Начисления</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Фиксированная часть</span>
                <span className="font-medium">{formatNum(partner.fixed_earned)} ₽</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Бонус ({partner.accepted_count} × {settings?.partner_bonus_per_accepted_lead})</span>
                <span className="font-medium">{formatNum(partner.bonus_earned)} ₽</span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="font-medium">Итого</span>
                <span className="font-bold text-lg">{formatNum(partner.total_earned)} ₽</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// Main Page
export default function PartnerAnalyticsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedPartner, setSelectedPartner] = useState<PartnerStat | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data, isLoading } = useQuery<AnalyticsResponse>({
    queryKey: ["partner-analytics", year, month],
    queryFn: () => fetchAnalytics({ year, month }),
  });

  const handleRowClick = (partner: PartnerStat) => {
    setSelectedPartner(partner);
    setDetailOpen(true);
  };

  const getPlanBadge = (pct: number) => {
    if (pct >= 100) return { label: "Выполнен", variant: "default" as const, color: "bg-green-100 text-green-700" };
    if (pct >= 70) return { label: "Почти", variant: "secondary" as const, color: "bg-yellow-100 text-yellow-700" };
    return { label: "Не выполнен", variant: "destructive" as const, color: "bg-red-100 text-red-700" };
  };

  const getFixedBadge = (pct: number) => {
    if (pct >= 100) return { color: "bg-green-100 text-green-700", icon: <TrendingUp className="w-3 h-3" /> };
    if (pct >= 50) return { color: "bg-yellow-100 text-yellow-700", icon: <TrendingUp className="w-3 h-3" /> };
    return { color: "bg-red-100 text-red-700", icon: <TrendingDown className="w-3 h-3" /> };
  };

  const summary = data?.summary;
  const planCompletion = data?.plan_completion;
  const partners = data?.partners || [];
  const top5 = data?.top5 || [];
  const settings = data?.settings;

  return (
    <ProtectedRoute>
      <Layout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BarChart3 className="w-6 h-6" />
                Аналитика партнёров
              </h1>
              <p className="text-muted-foreground text-sm">
                Статистика эффективности партнёрского канала
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {new Date(2000, m - 1).toLocaleString("ru-RU", { month: "long" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">{summary?.total_partners || 0}</div>
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="text-xs text-muted-foreground">Всего партнёров</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold text-green-600">{summary?.active_partners || 0}</div>
                      <Award className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="text-xs text-muted-foreground">Активных</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">{formatNum(summary?.leads_this_month || 0)}</div>
                      <Calendar className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="text-xs text-muted-foreground">Лидов за месяц</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold text-blue-600">{formatNum(summary?.accepted_this_month || 0)}</div>
                      <TrendingUp className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="text-xs text-muted-foreground">Принято мастером</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">{summary?.conversion_pct || 0}%</div>
                      <Percent className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="text-xs text-muted-foreground">Конверсия</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">{formatNum(summary?.fixed_earned_total || 0)} ₽</div>
                      <Wallet className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="text-xs text-muted-foreground">Начислено фиксов</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold text-amber-600">{formatNum(summary?.bonus_earned_total || 0)} ₽</div>
                      <Target className="w-5 h-5 text-amber-500" />
                    </div>
                    <div className="text-xs text-muted-foreground">Начислено бонусов</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">{summary?.roi_channel || 0}</div>
                      <BarChart3 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="text-xs text-muted-foreground">ROI канала</div>
                  </CardContent>
                </Card>
              </div>

              {/* Plan Completion */}
              <Card className="bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Выполнение плана ({settings?.partner_monthly_leads_plan} лидов/мес)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">{planCompletion?.completed || 0}</div>
                      <div className="text-sm text-green-700">Выполнили план</div>
                      <Badge variant="default" className="mt-1">100%+</Badge>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-yellow-600">{planCompletion?.almost || 0}</div>
                      <div className="text-sm text-yellow-700">Почти выполнили</div>
                      <Badge variant="secondary" className="mt-1">70–99%</Badge>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-600">{planCompletion?.not_completed || 0}</div>
                      <div className="text-sm text-red-700">Не выполнили</div>
                      <Badge variant="destructive" className="mt-1">&lt;70%</Badge>
                    </div>
                  </div>
                  <div className="mt-4 text-center text-sm text-muted-foreground">
                    Средний % выполнения: <span className="font-medium">{planCompletion?.avg_pct || 0}%</span>
                  </div>
                </CardContent>
              </Card>

              {/* Top-5 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Award className="w-5 h-5 text-yellow-500" />
                    Топ-5 партнёров за месяц (по принятым мастером)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {top5.map((p, idx) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg cursor-pointer hover:bg-muted/80"
                        onClick={() => handleRowClick(p)}
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          idx === 0 ? "bg-yellow-100 text-yellow-700" :
                          idx === 1 ? "bg-gray-100 text-gray-700" :
                          idx === 2 ? "bg-orange-100 text-orange-700" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.accepted_count} принято</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Partners Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Список партнёров (сортировка по конверсии)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-3 text-sm font-medium">Партнёр</th>
                          <th className="text-left px-4 py-3 text-sm font-medium">Город</th>
                          <th className="text-left px-4 py-3 text-sm font-medium">Статус</th>
                          <th className="text-left px-4 py-3 text-sm font-medium">Лидов</th>
                          <th className="text-left px-4 py-3 text-sm font-medium">Принято</th>
                          <th className="text-left px-4 py-3 text-sm font-medium">Конверсия</th>
                          <th className="text-left px-4 py-3 text-sm font-medium">План</th>
                          <th className="text-left px-4 py-3 text-sm font-medium">Фикс</th>
                          <th className="text-left px-4 py-3 text-sm font-medium">Бонус</th>
                          <th className="text-left px-4 py-3 text-sm font-medium">Итого</th>
                          <th className="text-left px-4 py-3 text-sm font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {partners.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="text-center py-8 text-muted-foreground">
                              Нет данных
                            </td>
                          </tr>
                        ) : (
                          partners.map((p) => {
                            const planBadge = getPlanBadge(p.plan_pct);
                            const fixedBadge = getFixedBadge(p.fixed_pct);
                            return (
                              <tr
                                key={p.id}
                                className="border-t hover:bg-muted/50 cursor-pointer"
                                onClick={() => handleRowClick(p)}
                              >
                                <td className="px-4 py-3 font-medium">{p.name}</td>
                                <td className="px-4 py-3 text-sm">{p.city}</td>
                                <td className="px-4 py-3">
                                  <Badge variant={statusBadgeVariants[p.status]} className="text-xs">
                                    {statusLabels[p.status]}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-sm">{p.leads_count}</td>
                                <td className="px-4 py-3 text-sm font-medium text-blue-600">{p.accepted_count}</td>
                                <td className="px-4 py-3 text-sm">{p.conversion_pct}%</td>
                                <td className="px-4 py-3">
                                  <Badge className={cn("text-xs", planBadge.color)}>
                                    {planBadge.label} ({p.plan_pct}%)
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1">
                                    <span className={cn("px-2 py-0.5 rounded text-xs", fixedBadge.color)}>
                                      {fixedBadge.icon}
                                    </span>
                                    <span className="text-sm">{p.fixed_pct}%</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-amber-600">{formatNum(p.bonus_earned)} ₽</td>
                                <td className="px-4 py-3 text-sm font-bold">{formatNum(p.total_earned)} ₽</td>
                                <td className="px-4 py-3">
                                  <Button variant="ghost" size="sm">
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <PartnerDetailDrawer
          partner={selectedPartner}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          year={year}
          month={month}
          settings={settings || null}
        />
      </Layout>
    </ProtectedRoute>
  );
}
