import { useState, useMemo, useRef } from "react";
import { Layout } from "@/components/layout";
import { useGetTransactions, useGetFinanceSummary, useUpdateTransaction, TransactionPaymentStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatCurrency } from "@/lib/utils";
import { Loader2, CheckCircle2, TrendingDown, TrendingUp, AlertCircle, Search, X, RefreshCw, ShieldAlert, MessageSquare, ThumbsUp, ThumbsDown, Minus } from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

type StatusFilter = "all" | "pending" | "overdue" | "paid";
type Sentiment = "positive" | "negative" | "neutral";

interface PendingReviewInfo {
  masterId: number;
  masterAlias: string;
  orderId: number | null;
}

const SENTIMENTS: { value: Sentiment; label: string; icon: React.ReactNode; activeClass: string }[] = [
  { value: "positive", label: "Позитивный", icon: <ThumbsUp className="w-4 h-4" />, activeClass: "bg-emerald-500 text-white border-emerald-500" },
  { value: "neutral",  label: "Нейтральный", icon: <Minus className="w-4 h-4" />,    activeClass: "bg-amber-500 text-white border-amber-500" },
  { value: "negative", label: "Негативный", icon: <ThumbsDown className="w-4 h-4" />, activeClass: "bg-red-500 text-white border-red-500" },
];

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

  // ── Review modal state ──────────────────────────────────────────────────────
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
    { key: "all", label: "Все" },
    { key: "pending", label: "Ожидают" },
    { key: "overdue", label: "Просрочено" },
    { key: "paid", label: "Оплачено" },
  ];

  return (
    <ProtectedRoute allowedRoles={['admin', 'master_operator', 'lead_operator']} permissionKey="finance">
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Финансы</h1>
            <p className="text-muted-foreground mt-1">Управление комиссиями и выплатами</p>
          </div>

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

          {/* Overdue masters warning block */}
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
                    return (
                    <tr key={tx.id} className={`hover:bg-slate-50/50 transition-colors ${isPlaceholder ? "opacity-70" : ""}`}>
                      <td className="px-6 py-4">
                        <span className="font-medium text-foreground">TX-{tx.id}</span>
                        <div className="text-xs text-muted-foreground mt-1">{formatDate(tx.createdAt)}</div>
                        {isPlaceholder && <div className="text-[10px] text-amber-500 font-medium mt-0.5">На объекте</div>}
                      </td>
                      <td className="px-6 py-4 font-medium">{tx.masterAlias}</td>
                      <td className="px-6 py-4">{isPlaceholder ? <span className="text-muted-foreground italic text-xs">Неизвестна</span> : formatCurrency(tx.orderAmount)}</td>
                      <td className="px-6 py-4 font-bold text-foreground">{isPlaceholder ? <span className="text-muted-foreground italic text-xs">Неизвестна</span> : formatCurrency(tx.commission)}</td>
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
        </div>

        {/* ── Review prompt modal ─────────────────────────────────────────────── */}
        {pendingReviewInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              {/* Header */}
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
                {/* Sentiment selector */}
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

                {/* Review text */}
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

                {/* Actions */}
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
