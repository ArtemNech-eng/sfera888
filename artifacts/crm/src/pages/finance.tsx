import { useState, useMemo, useRef } from "react";
import { Layout } from "@/components/layout";
import { useGetTransactions, useGetFinanceSummary, useUpdateTransaction, TransactionPaymentStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Loader2, CheckCircle2, TrendingDown, TrendingUp, AlertCircle, Search, X,
  RefreshCw, ShieldAlert, ThumbsUp, ThumbsDown, Minus,
  BarChart3, ReceiptText, MapPin, Phone, Award, Clock,
  ChevronLeft, ChevronRight, Calendar,
} from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

type StatusFilter = "all" | "pending" | "overdue" | "paid";
type Sentiment = "positive" | "negative" | "neutral";
type PageTab = "transactions" | "by-master";
type Period = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

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

/** Returns ms-timestamp bounds for the given period. Uses local browser time. */
function getPeriodRange(period: Period, customFrom: string, customTo: string): { from?: number; to?: number } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  // Start / end of today in LOCAL time
  const todayStart = new Date(y, m, d, 0, 0, 0, 0).getTime();
  const todayEnd   = new Date(y, m, d, 23, 59, 59, 999).getTime();

  switch (period) {
    case "today":
      return { from: todayStart, to: todayEnd };

    case "week": {
      // Monday-based week (Russian calendar)
      const dow = now.getDay(); // 0=Sun … 6=Sat
      const daysToMon = dow === 0 ? -6 : 1 - dow;
      const monDate = new Date(y, m, d + daysToMon, 0, 0, 0, 0);
      return { from: monDate.getTime(), to: todayEnd };
    }

    case "month":
      return { from: new Date(y, m, 1, 0, 0, 0, 0).getTime(), to: todayEnd };

    case "quarter": {
      const q = Math.floor(m / 3);
      return { from: new Date(y, q * 3, 1, 0, 0, 0, 0).getTime(), to: todayEnd };
    }

    case "year":
      return { from: new Date(y, 0, 1, 0, 0, 0, 0).getTime(), to: todayEnd };

    case "custom":
      return {
        from: customFrom ? new Date(customFrom + "T00:00:00").getTime() : undefined,
        to:   customTo   ? new Date(customTo   + "T23:59:59.999").getTime() : undefined,
      };

    default:
      return {};
  }
}

export default function Finance() {
  const queryClient = useQueryClient();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pageTab, setPageTab]     = useState<PageTab>("transactions");

  // ── Transactions date filter ──────────────────────────────────────────────
  const [txPeriod, setTxPeriod]           = useState<Period>("all");
  const [txCustomFrom, setTxCustomFrom]   = useState("");
  const [txCustomTo, setTxCustomTo]       = useState("");

  // ── Pagination ────────────────────────────────────────────────────────────
  const [pageSize, setPageSize]       = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Master-stats period ───────────────────────────────────────────────────
  const [statsPeriod, setStatsPeriod]       = useState<Period>("month");
  const [statsCustomFrom, setStatsCustomFrom] = useState("");
  const [statsCustomTo, setStatsCustomTo]     = useState("");

  // ── Review modal ──────────────────────────────────────────────────────────
  const pendingTxRef = useRef<PendingReviewInfo | null>(null);
  const [pendingReviewInfo, setPendingReviewInfo] = useState<PendingReviewInfo | null>(null);
  const [reviewText, setReviewText]       = useState("");
  const [reviewSentiment, setReviewSentiment] = useState<Sentiment>("positive");
  const [savingReview, setSavingReview]   = useState(false);

  const statsRange = useMemo(
    () => getPeriodRange(statsPeriod, statsCustomFrom, statsCustomTo),
    [statsPeriod, statsCustomFrom, statsCustomTo],
  );

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: summary } = useGetFinanceSummary();

  // Load ALL transactions — client filters by date / status / search.
  const { data: transactions, isLoading } = useGetTransactions();

  const { data: overdueMasters } = useQuery<{ masterId: number; alias: string; totalOverdue: number; count: number }[]>({
    queryKey: ["/api/finance/overdue-masters"],
    queryFn: () => fetch("/api/finance/overdue-masters", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const statsParams = new URLSearchParams();
  if (statsRange.from) statsParams.set("from", new Date(statsRange.from).toISOString());
  if (statsRange.to)   statsParams.set("to",   new Date(statsRange.to).toISOString());

  const { data: masterStats, isLoading: statsLoading } = useQuery<MasterStat[]>({
    queryKey: ["/api/finance/master-stats", statsRange.from, statsRange.to],
    queryFn: () => fetch(`/api/finance/master-stats?${statsParams}`, { credentials: "include" }).then(r => r.json()),
    enabled: pageTab === "by-master",
    staleTime: 30_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const overdueCheckMutation = useMutation({
    mutationFn: () => fetch("/api/finance/check-overdue", { method: "POST", credentials: "include" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance/overdue-masters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/transactions"] });
    },
  });

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
      },
    },
  });

  // ── Derived data ──────────────────────────────────────────────────────────
  const statsSummary = useMemo(() => {
    if (!masterStats) return { totalPaid: 0, totalPending: 0, totalOverdue: 0, totalOrderAmount: 0 };
    return masterStats.reduce((acc, m) => ({
      totalPaid:        acc.totalPaid        + m.paidCommission,
      totalPending:     acc.totalPending     + m.pendingCommission,
      totalOverdue:     acc.totalOverdue     + m.overdueCommission,
      totalOrderAmount: acc.totalOrderAmount + m.totalOrderAmount,
    }), { totalPaid: 0, totalPending: 0, totalOverdue: 0, totalOrderAmount: 0 });
  }, [masterStats]);

  // Client-side filtering: status + search + date period
  const filtered = useMemo(() => {
    if (!transactions) return [];
    let list = [...transactions].sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());

    if (statusFilter !== "all") list = list.filter(t => t.paymentStatus === statusFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.masterAlias.toLowerCase().includes(q) ||
        `tx-${t.id}`.includes(q) ||
        String(t.orderId).includes(q)
      );
    }

    // Date filter — compare in ms (local browser time)
    const { from: fromMs, to: toMs } = getPeriodRange(txPeriod, txCustomFrom, txCustomTo);
    if (fromMs !== undefined || toMs !== undefined) {
      list = list.filter(t => {
        if (!t.createdAt) return false;
        const ms = new Date(t.createdAt as string).getTime();
        if (isNaN(ms)) return false;
        if (fromMs !== undefined && ms < fromMs) return false;
        if (toMs   !== undefined && ms > toMs)   return false;
        return true;
      });
    }

    return list;
  }, [transactions, statusFilter, search, txPeriod, txCustomFrom, txCustomTo]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const resetPage = () => setCurrentPage(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(currentPage, totalPages);
  const paginated  = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // ── Handlers ──────────────────────────────────────────────────────────────
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

          {/* ── Summary cards ─────────────────────────────────────────────── */}
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

          {/* ── Overdue masters alert ─────────────────────────────────────── */}
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

          {/* ── Tab bar ───────────────────────────────────────────────────── */}
          <div className="flex rounded-2xl border border-border/50 bg-muted/30 p-1 gap-1 w-fit">
            {([
              { key: "transactions", label: "Транзакции", icon: <ReceiptText className="w-4 h-4" /> },
              { key: "by-master",    label: "По мастерам", icon: <BarChart3 className="w-4 h-4" /> },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setPageTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  pageTab === tab.key
                    ? "bg-white shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* ════════════ TAB: TRANSACTIONS ════════════════════════════════ */}
          {pageTab === "transactions" && (
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">

              {/* Date period filter */}
              <div className="px-4 pt-4 pb-3 border-b border-border/50">
                <div className="flex flex-wrap items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  {PERIODS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => { setTxPeriod(p.key); resetPage(); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                        txPeriod === p.key
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  {txPeriod === "custom" && (
                    <div className="flex items-center gap-1.5 ml-1">
                      <input
                        type="date"
                        value={txCustomFrom}
                        onChange={e => { setTxCustomFrom(e.target.value); resetPage(); }}
                        className="text-xs border border-border/60 rounded-xl px-2.5 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <span className="text-muted-foreground text-xs">—</span>
                      <input
                        type="date"
                        value={txCustomTo}
                        onChange={e => { setTxCustomTo(e.target.value); resetPage(); }}
                        className="text-xs border border-border/60 rounded-xl px-2.5 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Search + status filter */}
              <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-display font-semibold text-lg">Транзакции</h3>
                  <button
                    onClick={() => overdueCheckMutation.mutate()}
                    disabled={overdueCheckMutation.isPending}
                    title="Отметить просроченные (старше 7 дней)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-border bg-background hover:bg-slate-50 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                  >
                    {overdueCheckMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
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
                      onChange={e => { setSearch(e.target.value); resetPage(); }}
                      placeholder="Мастер, TX-ID, заказ..."
                      className="w-full pl-9 pr-8 py-2 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {search && (
                      <button onClick={() => { setSearch(""); resetPage(); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex rounded-xl border border-border/60 overflow-hidden bg-background text-sm">
                    {STATUS_TABS.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => { setStatusFilter(tab.key); resetPage(); }}
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

              {/* Table */}
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
                    ) : paginated.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-sm">
                          {search || statusFilter !== "all" || txPeriod !== "all"
                            ? "Ничего не найдено за выбранный период"
                            : "Нет транзакций"}
                        </td>
                      </tr>
                    ) : paginated.map(tx => {
                      const isPlaceholder  = tx.commission === 0 && tx.orderAmount === 0;
                      const hasPrepay      = (tx.prepaymentDeducted ?? 0) > 0;
                      const netPayable     = tx.netPayable ?? tx.commission;
                      const isFromReceipt  = tx.sourceType === "receipt";
                      const isLargeReceipt = isFromReceipt && tx.orderAmount > 50_000;
                      return (
                        <tr key={tx.id} className={`hover:bg-slate-50/50 transition-colors ${isPlaceholder ? "opacity-70" : ""}`}>
                          <td className="px-6 py-4">
                            <span className="font-medium text-foreground">TX-{tx.id}</span>
                            <div className="text-xs text-muted-foreground mt-1">{formatDate(tx.createdAt)}</div>
                            {isPlaceholder  && <div className="text-[10px] text-amber-500 font-medium mt-0.5">На объекте</div>}
                            {isFromReceipt  && <div className="text-[10px] text-violet-600 font-medium mt-0.5">📋 Из сметы</div>}
                          </td>
                          <td className="px-6 py-4 font-medium">{tx.masterAlias}</td>
                          <td className="px-6 py-4">
                            {isPlaceholder
                              ? <span className="text-muted-foreground italic text-xs">Неизвестна</span>
                              : formatCurrency(tx.orderAmount)}
                          </td>
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
                            {!isPlaceholder && (
                              tx.paymentStatus === TransactionPaymentStatus.pending ||
                              tx.paymentStatus === TransactionPaymentStatus.overdue
                            ) && (
                              <button
                                onClick={() => handleMarkPaid({
                                  id: tx.id, masterId: tx.masterId,
                                  masterAlias: tx.masterAlias, orderId: tx.orderId,
                                })}
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

              {/* Footer: counter + page-size + pagination */}
              {!isLoading && (
                <div className="px-4 py-3 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>
                      {filtered.length === 0
                        ? "Нет транзакций"
                        : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} из ${filtered.length}`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">По</span>
                      <div className="flex rounded-lg border border-border/60 overflow-hidden">
                        {PAGE_SIZE_OPTIONS.map(size => (
                          <button
                            key={size}
                            onClick={() => { setPageSize(size); setCurrentPage(1); }}
                            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                              pageSize === size
                                ? "bg-primary text-primary-foreground"
                                : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        className="p-1.5 rounded-lg border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                        .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, idx) =>
                          p === "…" ? (
                            <span key={`dots-${idx}`} className="px-2 text-muted-foreground text-sm">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setCurrentPage(p as number)}
                              className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                                safePage === p
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                        className="p-1.5 rounded-lg border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════════════ TAB: BY MASTER ════════════════════════════════════ */}
          {pageTab === "by-master" && (
            <div className="space-y-5">
              {/* Period selector */}
              <div className="flex flex-wrap gap-2 items-center">
                {PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setStatsPeriod(p.key)}
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                      statsPeriod === p.key
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                {statsPeriod === "custom" && (
                  <div className="flex items-center gap-2 ml-2">
                    <input
                      type="date"
                      value={statsCustomFrom}
                      onChange={e => setStatsCustomFrom(e.target.value)}
                      className="text-sm border border-border/60 rounded-xl px-3 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="text-muted-foreground text-sm">—</span>
                    <input
                      type="date"
                      value={statsCustomTo}
                      onChange={e => setStatsCustomTo(e.target.value)}
                      className="text-sm border border-border/60 rounded-xl px-3 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}
              </div>

              {/* Mini-cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Поступило в кассу",  value: statsSummary.totalPaid,        color: "emerald", icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> },
                  { label: "Ожидает оплаты",      value: statsSummary.totalPending,     color: "amber",   icon: <Clock className="w-3.5 h-3.5 text-amber-500" /> },
                  { label: "Просрочено",           value: statsSummary.totalOverdue,     color: "red",     icon: <AlertCircle className="w-3.5 h-3.5 text-red-500" /> },
                  { label: "Оборот мастеров",     value: statsSummary.totalOrderAmount, color: "violet",  icon: <Award className="w-3.5 h-3.5 text-violet-500" /> },
                ].map(card => (
                  <div key={card.label} className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
                      {card.icon}{card.label}
                    </p>
                    <p className={`text-xl font-bold text-${card.color}-600`}>{formatCurrency(card.value)}</p>
                  </div>
                ))}
              </div>

              {/* Master stats table */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border/50">
                  <h3 className="font-display font-semibold text-lg">Статистика по мастерам</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50">
                      <tr>
                        <th className="px-6 py-4">Мастер</th>
                        <th className="px-6 py-4">Город</th>
                        <th className="px-6 py-4">Заказов</th>
                        <th className="px-6 py-4">Оборот</th>
                        <th className="px-6 py-4">Оплачено</th>
                        <th className="px-6 py-4">Ожидает</th>
                        <th className="px-6 py-4">Просрочено</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {statsLoading ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center">
                            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                          </td>
                        </tr>
                      ) : !masterStats || masterStats.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground text-sm">
                            Нет данных за выбранный период
                          </td>
                        </tr>
                      ) : masterStats.map(m => (
                        <tr key={m.masterId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-medium text-foreground">{m.alias}</div>
                            {m.phone && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" />{m.phone}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5" />{m.city}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-medium">{m.orderCount}</td>
                          <td className="px-6 py-4">{formatCurrency(m.totalOrderAmount)}</td>
                          <td className="px-6 py-4">
                            {m.paidCommission > 0 ? (
                              <div>
                                <span className="text-emerald-700 font-medium">{formatCurrency(m.paidCommission)}</span>
                                <div className="text-[10px] text-muted-foreground">{m.paidCount} транз.</div>
                              </div>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-6 py-4">
                            {m.pendingCommission > 0 ? (
                              <div>
                                <span className="text-amber-700 font-medium">{formatCurrency(m.pendingCommission)}</span>
                                <div className="text-[10px] text-muted-foreground">{m.pendingCount} транз.</div>
                              </div>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-6 py-4">
                            {m.overdueCommission > 0 ? (
                              <div>
                                <span className="text-red-700 font-bold">{formatCurrency(m.overdueCommission)}</span>
                                <div className="text-[10px] text-muted-foreground">{m.overdueCount} транз.</div>
                              </div>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Review modal ──────────────────────────────────────────────────── */}
        {pendingReviewInfo && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5">
              <div>
                <h3 className="text-lg font-display font-semibold">Оставить отзыв</h3>
                <p className="text-sm text-muted-foreground mt-1">Мастер: <strong>{pendingReviewInfo.masterAlias}</strong></p>
              </div>
              <div className="flex gap-2">
                {SENTIMENTS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => setReviewSentiment(s.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium border transition-all ${
                      reviewSentiment === s.value ? s.activeClass : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.icon}{s.label}
                  </button>
                ))}
              </div>
              <textarea
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder="Комментарий о мастере..."
                rows={3}
                className="w-full text-sm border border-border/60 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setPendingReviewInfo(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  Пропустить
                </button>
                <button
                  onClick={submitReview}
                  disabled={savingReview || !reviewText.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingReview ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
