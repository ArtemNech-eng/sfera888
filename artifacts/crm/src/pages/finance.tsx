import { useState, useMemo, useRef } from "react";
import { Layout } from "@/components/layout";
import { useGetTransactions, useGetFinanceSummary, useUpdateTransaction, TransactionPaymentStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Loader2, CheckCircle2, TrendingDown, TrendingUp, AlertCircle, Search, X,
  RefreshCw, ShieldAlert, MessageSquare, ThumbsUp, ThumbsDown, Minus,
  BarChart3, ReceiptText, MapPin, Phone, Award, Clock,
} from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, endOfDay } from "date-fns";
import { ru } from "date-fns/locale";

type StatusFilter = "all" | "pending" | "overdue" | "paid";
type Sentiment = "positive" | "negative" | "neutral";
type PageTab = "transactions" | "by-master";

type Period = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";

interface PendingReviewInfo {
  masterId: number;
  masterAlias: string;
  orderId: number | null;
}

interface MasterStat {
  masterId: number;
  alias: string;
  city: string;
  phone: string | null;
  orderCount: number;
  totalOrderAmount: number;
  totalCommission: number;
  paidCommission: number;
  pendingCommission: number;
  overdueCommission: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
}

const SENTIMENTS: { value: Sentiment; label: string; icon: React.ReactNode; activeClass: string }[] = [
  { value: "positive", label: "Позитивный", icon: <ThumbsUp className="w-4 h-4" />,   activeClass: "bg-emerald-500 text-white border-emerald-500" },
  { value: "neutral",  label: "Нейтральный", icon: <Minus className="w-4 h-4" />,      activeClass: "bg-amber-500 text-white border-amber-500" },
  { value: "negative", label: "Негативный",  icon: <ThumbsDown className="w-4 h-4" />, activeClass: "bg-red-500 text-white border-red-500" },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "today",   label: "Сегодня" },
  { key: "week",    label: "Неделя" },
  { key: "month",   label: "Месяц" },
  { key: "quarter", label: "Квартал" },
  { key: "year",    label: "Год" },
  { key: "all",     label: "Всё время" },
  { key: "custom",  label: "Диапазон" },
];

function getPeriodRange(period: Period, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  if (period === "today")   return { from: startOfDay(now).toISOString(),     to: endOfDay(now).toISOString() };
  if (period === "week")    return { from: startOfWeek(now, { locale: ru }).toISOString(), to: endOfDay(now).toISOString() };
  if (period === "month")   return { from: startOfMonth(now).toISOString(),   to: endOfDay(now).toISOString() };
  if (period === "quarter") return { from: startOfQuarter(now).toISOString(), to: endOfDay(now).toISOString() };
  if (period === "year")    return { from: startOfYear(now).toISOString(),    to: endOfDay(now).toISOString() };
  if (period === "custom")  return {
    from: customFrom ? new Date(customFrom).toISOString() : undefined,
    to:   customTo   ? endOfDay(new Date(customTo)).toISOString()   : undefined,
  };
  return {};
}

export default function Finance() {
  const queryClient = useQueryClient();
  const { data: summary } = useGetFinanceSummary();
  const { data: transactions, isLoading } = useGetTransactions();

  const { data: overdueMasters } = useQuery<{ masterId: number; alias: string; totalOverdue: number; count: number }[]>({
    queryKey: ["/api/finance/overdue-masters"],
    queryFn: () => fetch("/api/finance/overdue-masters", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const overdueCheckMutation = useMutation({
    mutationFn: () => fetch("/api/finance/check-overdue", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/overdue-masters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/transactions"] });
    },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pageTab, setPageTab] = useState<PageTab>("transactions");

  // ── Master stats state ───────────────────────────────────────────────────
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = getPeriodRange(period, customFrom, customTo);
  const masterStatsParams = new URLSearchParams();
  if (range.from) masterStatsParams.set("from", range.from);
  if (range.to)   masterStatsParams.set("to",   range.to);

  const { data: masterStats, isLoading: statsLoading } = useQuery<MasterStat[]>({
    queryKey: ["/api/finance/master-stats", range.from, range.to],
    queryFn: () => fetch(`/api/finance/master-stats?${masterStatsParams}`, { credentials: "include" }).then(r => r.json()),
    enabled: pageTab === "by-master",
    staleTime: 30_000,
  });

  const statsSummary = useMemo(() => {
    if (!masterStats) return { totalPaid: 0, totalPending: 0, totalOverdue: 0, totalOrderAmount: 0 };
    return masterStats.reduce((acc, m) => ({
      totalPaid:        acc.totalPaid        + m.paidCommission,
      totalPending:     acc.totalPending     + m.pendingCommission,
      totalOverdue:     acc.totalOverdue     + m.overdueCommission,
      totalOrderAmount: acc.totalOrderAmount + m.totalOrderAmount,
    }), { totalPaid: 0, totalPending: 0, totalOverdue: 0, totalOrderAmount: 0 });
  }, [masterStats]);

  // ── Review modal state ───────────────────────────────────────────────────
  const pendingTxRef = useRef<PendingReviewInfo | null>(null);
  const [pendingReviewInfo, setPendingReviewInfo] = useState<PendingReviewInfo | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [reviewSentiment, setReviewSentiment] = useState<Sentiment>("positive");
  const [savingReview, setSavingReview] = useState(false);

  const updateMutation = useUpdateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/finance/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/finance/summary"] });
        if (pendingTxRef.current) {
          setPendingReviewInfo(pendingTxRef.current);
          setReviewText("");
          setReviewSentiment("positive");
          pendingTxRef.current = null;
        }
      }
    }
  });

  const handleMarkPaid = (tx: { id: number; masterId: number; masterAlias: string; orderId: number | null }) => {
    pendingTxRef.current = { masterId: tx.masterId, masterAlias: tx.masterAlias, orderId: tx.orderId };
    updateMutation.mutate({ id: tx.id, data: { paymentStatus: TransactionPaymentStatus.paid } });
  };

  const submitReview = async () => {
    if (!pendingReviewInfo || !reviewText.trim()) return;
    setSavingReview(true);
    try {
      const r = await fetch("/api/master-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          masterId: pendingReviewInfo.masterId,
          orderId: pendingReviewInfo.orderId,
          sentiment: reviewSentiment,
          text: reviewText.trim(),
        }),
      });
      if (r.ok) {
        toast.success("Отзыв сохранён");
        setPendingReviewInfo(null);
      } else {
        toast.error("Не удалось сохранить отзыв");
      }
    } finally {
      setSavingReview(false);
    }
  };

  const filtered = useMemo(() => {
    if (!transactions) return [];
    let list = [...transactions];
    if (statusFilter !== "all") list = list.filter(t => t.paymentStatus === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.masterAlias.toLowerCase().includes(q) ||
        `tx-${t.id}`.includes(q) ||
        String(t.orderId).includes(q)
      );
    }
    return list;
  }, [transactions, statusFilter, search]);

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all",     label: "Все" },
    { key: "pending", label: "Ожидают" },
    { key: "overdue", label: "Просрочено" },
    { key: "paid",    label: "Оплачено" },
  ];

  return (
    <ProtectedRoute allowedRoles={['admin', 'master_operator', 'lead_operator']} permissionKey="finance">
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Финансы</h1>
            <p className="text-muted-foreground mt-1">Управление комиссиями и выплатами</p>
          </div>

          {/* ── Global summary cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-500/20">
              <div className="flex justify-between items-start mb-4">
                <p className="text-emerald-50 font-medium">Общий доход</p>
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
              </div>
              <h2 className="text-3xl font-display font-bold">{formatCurrency(summary?.totalIncome || 0)}</h2>
            </div>

            <div className="bg-gradient-to-br from-destructive to-red-600 rounded-2xl p-6 text-white shadow-lg shadow-red-500/20">
              <div className="flex justify-between items-start mb-4">
                <p className="text-red-50 font-medium">Ожидает оплаты (Долг)</p>
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                  <TrendingDown className="w-5 h-5 text-white" />
                </div>
              </div>
              <h2 className="text-3xl font-display font-bold">{formatCurrency(summary?.totalDebt || 0)}</h2>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-6 shadow-sm">
              <p className="text-muted-foreground font-medium mb-4">Статистика транзакций</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-emerald-600 font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Оплачено
                  </span>
                  <span className="font-bold">{summary?.paidCount || 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-amber-600 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Ожидают
                  </span>
                  <span className="font-bold">{summary?.pendingCount || 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-red-600 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Просрочено
                  </span>
                  <span className="font-bold">{summary?.overdueCount || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Overdue warning block ─────────────────────────────────────── */}
          {overdueMasters && overdueMasters.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  <h3 className="font-semibold text-red-800">Мастера с просроченной комиссией ({overdueMasters.length})</h3>
                </div>
                <span className="text-xs text-red-600 bg-red-100 border border-red-200 rounded-full px-2 py-0.5 font-medium">заблокированы от приёма заказов</span>
              </div>
              <div className="space-y-1.5">
                {overdueMasters.map(m => (
                  <div key={m.masterId} className="flex items-center justify-between bg-white rounded-xl border border-red-100 px-4 py-2.5">
                    <span className="font-medium text-foreground">{m.alias}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{m.count} транз.</span>
                      <span className="text-red-700 font-bold">{m.totalOverdue.toLocaleString("ru")} ₽</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Page tab bar ─────────────────────────────────────────────── */}
          <div className="flex rounded-2xl border border-border/50 bg-muted/30 p-1 gap-1 w-fit">
            <button
              onClick={() => setPageTab("transactions")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                pageTab === "transactions"
                  ? "bg-white shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ReceiptText className="w-4 h-4" />
              Транзакции
            </button>
            <button
              onClick={() => setPageTab("by-master")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                pageTab === "by-master"
                  ? "bg-white shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              По мастерам
            </button>
          </div>

          {/* ════════════════════ TAB: TRANSACTIONS ══════════════════════ */}
          {pageTab === "transactions" && (
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-display font-semibold text-lg">Транзакции</h3>
                  <button
                    onClick={() => overdueCheckMutation.mutate()}
                    disabled={overdueCheckMutation.isPending}
                    title="Отметить просроченные (старше 7 дней)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-border bg-background hover:bg-slate-50 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                  >
                    {overdueCheckMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />}
                    Проверить просрочку
                  </button>
                  {overdueCheckMutation.isSuccess && (
                    <span className="text-xs text-emerald-600">Отмечено: {(overdueCheckMutation.data as any)?.marked ?? 0}</span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-none sm:w-56">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Мастер, TX-ID, заказ..."
                      className="w-full pl-9 pr-8 py-2 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {search && (
                      <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex rounded-xl border border-border/60 overflow-hidden bg-background text-sm">
                    {STATUS_TABS.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setStatusFilter(tab.key)}
                        className={`px-3 py-2 font-medium transition-colors ${
                          statusFilter === tab.key
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50">
                    <tr>
                      <th className="px-6 py-4">ID / Дата</th>
                      <th className="px-6 py-4">Мастер</th>
                      <th className="px-6 py-4">Сумма заказа</th>
                      <th className="px-6 py-4">Комиссия (Долг)</th>
                      <th className="px-6 py-4">Статус</th>
                      <th className="px-6 py-4 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center">
                          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm">
                          {search || statusFilter !== "all" ? "Ничего не найдено" : "Нет транзакций"}
                        </td>
                      </tr>
                    ) : filtered.map((tx) => {
                      const isPlaceholder = tx.commission === 0 && tx.orderAmount === 0;
                      const hasPrepay = (tx.prepaymentDeducted ?? 0) > 0;
                      const netPayable = tx.netPayable ?? tx.commission;
                      const isFromReceipt = (tx as any).sourceType === "receipt";
                      const isLargeReceipt = isFromReceipt && tx.orderAmount > 50000;
                      return (
                        <tr key={tx.id} className={`hover:bg-slate-50/50 transition-colors ${isPlaceholder ? "opacity-70" : ""}`}>
                          <td className="px-6 py-4">
                            <span className="font-medium text-foreground">TX-{tx.id}</span>
                            <div className="text-xs text-muted-foreground mt-1">{formatDate(tx.createdAt)}</div>
                            {isPlaceholder && <div className="text-[10px] text-amber-500 font-medium mt-0.5">На объекте</div>}
                            {isFromReceipt && <div className="text-[10px] text-violet-600 font-medium mt-0.5">📋 Из сметы</div>}
                          </td>
                          <td className="px-6 py-4 font-medium">{tx.masterAlias}</td>
                          <td className="px-6 py-4">{isPlaceholder ? <span className="text-muted-foreground italic text-xs">Неизвестна</span> : formatCurrency(tx.orderAmount)}</td>
                          <td className="px-6 py-4">
                            {isPlaceholder ? (
                              <span className="text-muted-foreground italic text-xs">Неизвестна</span>
                            ) : (
                              <div>
                                <span className="font-bold text-foreground">{formatCurrency(netPayable)}</span>
                                {hasPrepay && (
                                  <div className="text-xs text-emerald-600 mt-0.5">
                                    −{formatCurrency(tx.prepaymentDeducted)} предоплата
                                  </div>
                                )}
                                {isLargeReceipt && netPayable > 0 && (
                                  <div className="text-xs text-amber-600 mt-0.5 font-medium">
                                    ожидается: {formatCurrency(netPayable)}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={tx.paymentStatus} type="payment" />
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!isPlaceholder && (tx.paymentStatus === TransactionPaymentStatus.pending || tx.paymentStatus === TransactionPaymentStatus.overdue) && (
                              <button
                                onClick={() => handleMarkPaid({ id: tx.id, masterId: tx.masterId, masterAlias: tx.masterAlias, orderId: tx.orderId })}
                                disabled={updateMutation.isPending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg font-medium text-xs transition-colors"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Оплачено
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!isLoading && filtered.length > 0 && (
                <div className="px-6 py-3 border-t border-border/50 text-xs text-muted-foreground">
                  Показано {filtered.length} из {transactions?.length ?? 0} транзакций
                </div>
              )}
            </div>
          )}

          {/* ════════════════════ TAB: BY MASTER ═══════════════════════ */}
          {pageTab === "by-master" && (
            <div className="space-y-5">
              {/* Period selector */}
              <div className="flex flex-wrap gap-2 items-center">
                {PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                      period === p.key
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {period === "custom" && (
                  <div className="flex items-center gap-2 ml-2">
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                      className="text-sm border border-border/60 rounded-xl px-3 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="text-muted-foreground text-sm">—</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                      className="text-sm border border-border/60 rounded-xl px-3 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}
              </div>

              {/* Period summary mini-cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Поступило в кассу
                  </p>
                  <p className="text-xl font-bold text-emerald-600">{formatCurrency(statsSummary.totalPaid)}</p>
                </div>
                <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" /> Ожидает оплаты
                  </p>
                  <p className="text-xl font-bold text-amber-600">{formatCurrency(statsSummary.totalPending)}</p>
                </div>
                <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" /> Просрочено
                  </p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(statsSummary.totalOverdue)}</p>
                </div>
                <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-blue-500" /> Оборот заказов
                  </p>
                  <p className="text-xl font-bold text-blue-600">{formatCurrency(statsSummary.totalOrderAmount)}</p>
                </div>
              </div>

              {/* Master ranking table */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  <h3 className="font-display font-semibold text-lg">Рейтинг мастеров по выручке</h3>
                  {statsLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />}
                </div>

                {statsLoading ? (
                  <div className="py-16 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                  </div>
                ) : !masterStats || masterStats.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground text-sm">
                    Нет данных за выбранный период
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50 text-left">
                        <tr>
                          <th className="px-5 py-3.5 w-10">#</th>
                          <th className="px-5 py-3.5">Мастер</th>
                          <th className="px-5 py-3.5 text-right">Заказов</th>
                          <th className="px-5 py-3.5 text-right">Оборот</th>
                          <th className="px-5 py-3.5 text-right">В кассу ✓</th>
                          <th className="px-5 py-3.5 text-right">Ожидает</th>
                          <th className="px-5 py-3.5 text-right">Просрочено</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {masterStats.map((m, i) => {
                          const totalBilled = m.paidCommission + m.pendingCommission + m.overdueCommission;
                          const paidPct = totalBilled > 0 ? (m.paidCommission / totalBilled) * 100 : 0;
                          const isTop = i === 0;
                          return (
                            <tr key={m.masterId} className={`hover:bg-slate-50/50 transition-colors ${isTop ? "bg-emerald-50/40" : ""}`}>
                              <td className="px-5 py-4">
                                {i === 0 && <span className="text-lg">🥇</span>}
                                {i === 1 && <span className="text-lg">🥈</span>}
                                {i === 2 && <span className="text-lg">🥉</span>}
                                {i > 2 && <span className="text-muted-foreground font-medium">{i + 1}</span>}
                              </td>
                              <td className="px-5 py-4">
                                <div className="font-semibold text-foreground">{m.alias}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{m.city}</span>
                                  {m.phone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{m.phone}</span>}
                                </div>
                                {/* Payment progress bar */}
                                {totalBilled > 0 && (
                                  <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden w-32">
                                    <div
                                      className="h-full bg-emerald-400 rounded-full transition-all"
                                      style={{ width: `${paidPct}%` }}
                                    />
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-4 text-right font-medium">{m.orderCount}</td>
                              <td className="px-5 py-4 text-right text-muted-foreground">{formatCurrency(m.totalOrderAmount)}</td>
                              <td className="px-5 py-4 text-right">
                                <span className={`font-bold ${m.paidCommission > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                                  {formatCurrency(m.paidCommission)}
                                </span>
                                {m.paidCount > 0 && <div className="text-[10px] text-emerald-500">{m.paidCount} оплачено</div>}
                              </td>
                              <td className="px-5 py-4 text-right">
                                {m.pendingCommission > 0
                                  ? <span className="font-medium text-amber-600">{formatCurrency(m.pendingCommission)}</span>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              <td className="px-5 py-4 text-right">
                                {m.overdueCommission > 0
                                  ? <span className="font-bold text-red-600">{formatCurrency(m.overdueCommission)}</span>
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Review prompt modal ────────────────────────────────────────── */}
        {pendingReviewInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-white">Оставить отзыв о мастере</p>
                  <p className="text-blue-100 text-sm mt-0.5">{pendingReviewInfo.masterAlias}</p>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Общее впечатление</label>
                  <div className="flex gap-2">
                    {SENTIMENTS.map(s => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setReviewSentiment(s.value)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                          reviewSentiment === s.value
                            ? s.activeClass
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        {s.icon}
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Комментарий</label>
                  <textarea
                    value={reviewText}
                    onChange={e => setReviewText(e.target.value)}
                    placeholder="Качество работы, соблюдение сроков, общение с клиентом..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setPendingReviewInfo(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Пропустить
                  </button>
                  <button
                    onClick={submitReview}
                    disabled={savingReview || !reviewText.trim()}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Сохранить отзыв
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
