import { useState, useEffect, useMemo, useCallback } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import {
  Loader2, RefreshCw, FileText, Clock, CreditCard, AlertTriangle,
  Phone, MessageSquare, Eye, ClipboardList, RotateCcw, XCircle,
  ChevronLeft, ChevronRight, Search, MapPin, User, Lock, X,
  CheckCircle2, AlertCircle, Building2, Ruler, Calendar, UserCheck, Wallet,
  CheckSquare, Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type WorkOrder = {
  id: number;
  leadId: number | null;
  status: string;
  city: string;
  district: string;
  serviceType: string;
  area: number;
  commission: number | null;
  proposedAmount: number | null;
  assignedAt: string | null;
  updatedAt: string | null;
  masterId: number | null;
  masterAlias: string | null;
  masterPhone: string | null;
  masterMaxChatId: string | null;
  masterFomoDisabled: boolean;
  clientName: string | null;
  clientPhone: string | null;
  receiptId: number | null;
  receiptTotalAmount: number | null;
  receiptPrepaymentAmount: number | null;
  receiptCreatedAt: string | null;
  receiptPrepaymentSubmittedAt: string | null;
  receiptPrepaymentPaidAt: string | null;
  receiptToken: string | null;
  hoursWithoutEstimate: number | null;
  hoursWithoutPayment: number | null;
  problemReasons: string[];
  commissionPaid: boolean;
};

type SubTab = "all" | "with_estimate" | "without_estimate" | "waiting_payment" | "problematic";

const PAGE_SIZE = 20;

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function fmtHours(h: number) {
  if (h < 24) return `${h}ч`;
  const d = Math.floor(h / 24);
  const rem = h % 24;
  return rem > 0 ? `${d}д ${rem}ч` : `${d}д`;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1ч";
  if (h < 24) return `${h}ч назад`;
  return `${Math.floor(h / 24)}д назад`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function rowColor(hours: number | null, type: "estimate" | "payment") {
  if (hours === null) return "";
  if (type === "payment") {
    if (hours < 24) return "";
    if (hours < 48) return "bg-[#FFFDE7]";
    if (hours < 72) return "bg-orange-50";
    return "bg-[#FFF0F0]";
  }
  if (hours < 24) return "";
  if (hours < 48) return "bg-[#FFFDE7]";
  if (hours < 72) return "bg-orange-50";
  return "bg-[#FFF0F0]";
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>
      {label}
    </span>
  );
}

function ActionBtn({
  onClick, color, icon: Icon, title, disabled,
}: {
  onClick: () => void; color: string; icon: React.ElementType; title: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${color}`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

export default function WorkMonitor() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>("all");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sendingTo, setSendingTo] = useState<number | null>(null);
  const [notifyPreview, setNotifyPreview] = useState<{ order: WorkOrder; text: string } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [confirmComplete, setConfirmComplete] = useState<WorkOrder | null>(null);
  const [completing, setCompleting] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const r = await fetch("/api/work-monitor", { credentials: "include" });
      if (r.ok) setOrders(await r.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => { setPage(1); }, [subTab, search, cityFilter]);

  const isProblematic = (o: WorkOrder) => o.problemReasons.length > 0;
  const hasEstimate = (o: WorkOrder) => o.receiptId !== null;
  const waitingPayment = (o: WorkOrder) =>
    o.receiptId !== null && !o.receiptPrepaymentPaidAt;
  const withoutEstimate = (o: WorkOrder) =>
    o.hoursWithoutEstimate !== null;

  const subsets = useMemo(() => ({
    all: orders,
    with_estimate: orders.filter(hasEstimate),
    without_estimate: orders.filter(withoutEstimate),
    waiting_payment: orders.filter(waitingPayment),
    problematic: orders.filter(isProblematic),
  }), [orders]);

  const summary = useMemo(() => ({
    withEstimateCount: subsets.with_estimate.length,
    withEstimateAmount: subsets.with_estimate.reduce((s, o) => s + (o.receiptTotalAmount ?? 0), 0),
    withoutEstimateCount: subsets.without_estimate.length,
    withoutEstimateCommission: subsets.without_estimate.reduce((s, o) => s + (o.commission ?? 0), 0),
    waitingPaymentCount: subsets.waiting_payment.length,
    waitingPaymentPrepayment: subsets.waiting_payment.reduce((s, o) => s + (o.receiptPrepaymentAmount ?? 5000), 0),
    problematicCount: subsets.problematic.length,
    problematicAmount: subsets.problematic.reduce((s, o) => s + (o.receiptTotalAmount ?? o.proposedAmount ?? o.commission ?? 0), 0),
  }), [subsets]);

  const cities = useMemo(() => {
    const s = new Set(orders.map(o => o.city).filter(Boolean));
    return [...s].sort();
  }, [orders]);

  const filtered = useMemo(() => {
    let list = subsets[subTab];
    if (cityFilter !== "all") list = list.filter(o => o.city === cityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        String(o.leadId ?? o.id).includes(q) ||
        String(o.id).includes(q) ||
        (o.leadId ? String(o.leadId).includes(q) : false) ||
        o.masterAlias?.toLowerCase().includes(q) ||
        o.clientName?.toLowerCase().includes(q) ||
        o.clientPhone?.includes(q)
      );
    }
    return list;
  }, [subsets, subTab, cityFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const notifyMaster = async (o: WorkOrder, text: string) => {
    if (!o.masterMaxChatId) {
      toast({ title: "У мастера нет Max-чата", variant: "destructive" });
      return;
    }
    setSendingTo(o.id);
    try {
      const r = await fetch("/api/work-monitor/notify-master", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterId: o.masterId, text }),
      });
      if (r.ok) toast({ title: "Сообщение отправлено мастеру" });
      else toast({ title: "Ошибка отправки", variant: "destructive" });
    } finally {
      setSendingTo(null);
    }
  };

  const doCompleteOrder = async (o: WorkOrder) => {
    setCompleting(true);
    try {
      const r = await fetch(`/api/work-monitor/complete-order/${o.id}`, {
        method: "POST",
        credentials: "include",
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast({ title: body.error ?? "Не удалось завершить заказ", variant: "destructive" });
        return;
      }
      toast({ title: `Заказ #${o.leadId ?? o.id} завершён` });
      setConfirmComplete(null);
      setSelectedOrder(null);
      fetchData(true);
    } finally {
      setCompleting(false);
    }
  };

  const estimateReminderText = (o: WorkOrder) =>
    `${o.masterAlias ?? "Мастер"}, по заказу #${o.leadId ?? o.id} смета ещё не отправлена клиенту. Пожалуйста, составьте смету через приложение сегодня. Без сметы вы не сможете откликаться на новые заказы.`;

  const paymentReminderText = (o: WorkOrder) =>
    `${o.masterAlias ?? "Мастер"}, по заказу #${o.leadId ?? o.id} клиент ещё не оплатил предоплату. Напомните клиенту про бронь. Если клиент отказывается — сообщите нам, вернём в пул.`;

  const tabs: { key: SubTab; label: string; icon: string }[] = [
    { key: "all", label: "Все", icon: "📋" },
    { key: "with_estimate", label: "Со сметой", icon: "📄" },
    { key: "without_estimate", label: "Без сметы", icon: "⏰" },
    { key: "waiting_payment", label: "Ждут оплату", icon: "💰" },
    { key: "problematic", label: "Проблемные", icon: "🔴" },
  ];

  const tabCount: Record<SubTab, number> = {
    all: subsets.all.length,
    with_estimate: subsets.with_estimate.length,
    without_estimate: subsets.without_estimate.length,
    waiting_payment: subsets.waiting_payment.length,
    problematic: subsets.problematic.length,
  };

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="orders">
        <Layout>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-[#34C759]" />
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="orders">
      <Layout>
        <div className="flex flex-col gap-4 h-full">

          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Мониторинг — В работе</h1>
              <p className="text-xs text-gray-400 mt-0.5">Автообновление каждые 60 сек</p>
            </div>
            <button
              onClick={() => fetchData()}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Обновить
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
            <SummaryCard
              icon="📄"
              label="Со сметой"
              count={summary.withEstimateCount}
              amount={summary.withEstimateAmount}
              onClick={() => setSubTab("with_estimate")}
            />
            <SummaryCard
              icon="⏰"
              label="Без сметы"
              count={summary.withoutEstimateCount}
              amount={summary.withoutEstimateCommission}
              amountLabel="Ожид. комиссия"
              onClick={() => setSubTab("without_estimate")}
            />
            <SummaryCard
              icon="💰"
              label="Ждут оплату"
              count={summary.waitingPaymentCount}
              amount={summary.waitingPaymentPrepayment}
              amountLabel="Ожид. предоплата"
              onClick={() => setSubTab("waiting_payment")}
            />
            <SummaryCard
              icon="🔴"
              label="Проблемные"
              count={summary.problematicCount}
              amount={summary.problematicAmount}
              amountLabel="Зависло"
              urgent={summary.problematicCount > 0}
              onClick={() => setSubTab("problematic")}
            />
          </div>

          {/* Sub-tabs + filters */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setSubTab(t.key)}
                  className={`relative flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                    subTab === t.key
                      ? "bg-[#34C759] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <span>{t.icon}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                  <span className={`ml-0.5 text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                    subTab === t.key ? "bg-white/20 text-white" : "bg-white text-gray-600"
                  }`}>
                    {tabCount[t.key]}
                  </span>
                  {t.key === "problematic" && tabCount.problematic > 0 && subTab !== "problematic" && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="№ заказа, мастер, клиент..."
                  className="pl-7 pr-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#34C759]/30 w-52"
                />
              </div>
              {cities.length > 0 && (
                <select
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none"
                >
                  <option value="all">Все города</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {filtered.length} заказов
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <ClipboardList className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">Нет заказов в этой категории</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {subTab === "all" && <AllHeaders />}
                      {subTab === "with_estimate" && <EstimateHeaders />}
                      {subTab === "without_estimate" && <NoEstimateHeaders />}
                      {subTab === "waiting_payment" && <WaitingPaymentHeaders />}
                      {subTab === "problematic" && <ProblematicHeaders />}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(o => (
                      <tr
                        key={o.id}
                        onClick={() => setSelectedOrder(o)}
                        className={`border-b border-gray-50 hover:brightness-95 transition-colors cursor-pointer ${
                          o.status === "cancellation_requested"
                            ? "bg-orange-50"
                            : subTab === "problematic"
                              ? "bg-[#FFF0F0]"
                              : subTab === "with_estimate"
                                ? o.receiptPrepaymentPaidAt
                                  ? "bg-green-50"
                                  : rowColor(o.hoursWithoutPayment, "payment")
                                : subTab === "without_estimate"
                                  ? rowColor(o.hoursWithoutEstimate, "estimate")
                                  : subTab === "waiting_payment"
                                    ? rowColor(o.hoursWithoutPayment, "payment")
                                    : ""
                        }`}
                      >
                        {subTab === "all" && (
                          <AllRow o={o} onNotify={(o, t) => setNotifyPreview({ order: o, text: t })} onComplete={setConfirmComplete} sendingTo={sendingTo}
                            estimateText={estimateReminderText(o)} paymentText={paymentReminderText(o)} />
                        )}
                        {subTab === "with_estimate" && (
                          <EstimateRow o={o} onNotify={(o, t) => setNotifyPreview({ order: o, text: t })} onComplete={setConfirmComplete} sendingTo={sendingTo}
                            paymentText={paymentReminderText(o)} />
                        )}
                        {subTab === "without_estimate" && (
                          <NoEstimateRow o={o} onNotify={(o, t) => setNotifyPreview({ order: o, text: t })} onComplete={setConfirmComplete} sendingTo={sendingTo}
                            estimateText={estimateReminderText(o)} />
                        )}
                        {subTab === "waiting_payment" && (
                          <WaitingPaymentRow o={o} onNotify={(o, t) => setNotifyPreview({ order: o, text: t })} onComplete={setConfirmComplete} sendingTo={sendingTo}
                            paymentText={paymentReminderText(o)} />
                        )}
                        {subTab === "problematic" && (
                          <ProblematicRow o={o} onNotify={(o, t) => setNotifyPreview({ order: o, text: t })} onComplete={setConfirmComplete} sendingTo={sendingTo}
                            estimateText={estimateReminderText(o)} paymentText={paymentReminderText(o)} />
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 flex-shrink-0 pb-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>
      </Layout>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onComplete={o => { setSelectedOrder(null); setConfirmComplete(o); }}
        />
      )}

      {/* Notify preview dialog */}
      {notifyPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setNotifyPreview(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-gray-100">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Напоминание мастеру</p>
                <p className="text-xs text-gray-500 truncate">
                  {notifyPreview.order.masterAlias ?? "Мастер"} · #{notifyPreview.order.leadId ?? notifyPreview.order.id}
                </p>
              </div>
            </div>

            {/* Message preview */}
            <div className="px-5 py-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Сообщение</p>
              <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed border border-blue-100 max-h-64 overflow-y-auto">
                {notifyPreview.text}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setNotifyPreview(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={async () => {
                  const { order, text } = notifyPreview;
                  setNotifyPreview(null);
                  await notifyMaster(order, text);
                }}
                disabled={sendingTo === notifyPreview.order.id}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {sendingTo === notifyPreview.order.id
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Отправка…</>
                  : <><Send className="w-4 h-4" />Отправить</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm complete dialog */}
      {confirmComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setConfirmComplete(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckSquare className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Завершить заказ</h3>
                <p className="text-sm text-gray-500">#{confirmComplete.leadId ?? confirmComplete.id} · {confirmComplete.masterAlias ?? "Мастер"}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              Заказ будет отмечен как завершённый. Это действие аналогично тому, как если бы мастер сам закрыл его в приложении.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmComplete(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => doCompleteOrder(confirmComplete)}
                disabled={completing}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                Завершить
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}

// ── Summary Card ────────────────────────────────────────────────────────────
function SummaryCard({ icon, label, count, amount, amountLabel, urgent, onClick }: {
  icon: string; label: string; count: number; amount: number;
  amountLabel?: string; urgent?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-xl border p-3 shadow-sm hover:shadow-md transition-shadow ${urgent ? "border-red-200" : "border-gray-100"}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        {urgent && <span className="ml-auto w-2 h-2 bg-red-500 rounded-full" />}
      </div>
      <p className={`text-2xl font-bold ${urgent ? "text-red-600" : "text-gray-800"}`}>{count}</p>
      {amount > 0 && (
        <p className="text-xs text-[#34C759] font-semibold mt-0.5">
          {amountLabel ? `${amountLabel}: ` : ""}{fmt(amount)}
        </p>
      )}
    </button>
  );
}

// ── Shared cells ────────────────────────────────────────────────────────────
function OrderNumCell({ o }: { o: WorkOrder }) {
  return (
    <td className="px-2 py-1.5 whitespace-nowrap">
      <a
        href={`/leads?openOrder=${o.id}`}
        className="font-semibold text-blue-600 hover:underline text-xs"
        onClick={e => e.stopPropagation()}
      >
        #{o.leadId ?? o.id}
      </a>
    </td>
  );
}

function MasterCell({ o }: { o: WorkOrder }) {
  return (
    <td className="px-2 py-1.5 max-w-[130px]">
      <div className="flex items-center gap-1">
        <span className="font-medium text-gray-800 text-xs truncate">{o.masterAlias ?? "—"}</span>
        {!o.masterFomoDisabled && o.hoursWithoutEstimate !== null && o.hoursWithoutEstimate >= 24 && (
          <Lock className="w-3 h-3 flex-shrink-0 text-orange-500" />
        )}
      </div>
      {o.masterPhone && (
        <a href={`tel:${o.masterPhone}`} className="text-[10px] text-emerald-600 hover:underline">
          {o.masterPhone}
        </a>
      )}
    </td>
  );
}

function ClientCityCell({ o }: { o: WorkOrder }) {
  return (
    <td className="px-2 py-1.5 max-w-[140px]">
      <p className="font-medium text-gray-800 text-xs truncate">{o.clientName ?? "—"}</p>
      <div className="flex items-center gap-0.5 text-[10px] text-gray-400">
        <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="truncate">{o.city}{o.district ? `, ${o.district}` : ""}</span>
      </div>
    </td>
  );
}

function ServiceCell({ o }: { o: WorkOrder }) {
  return (
    <td className="px-2 py-1.5 max-w-[140px]">
      <p className="text-xs text-gray-700 truncate">{o.serviceType}</p>
      {o.area > 0 && <p className="text-[10px] text-gray-400">{o.area} м²</p>}
    </td>
  );
}

type ActionProps = {
  o: WorkOrder;
  onNotify: (o: WorkOrder, text: string) => void;
  onComplete: (o: WorkOrder) => void;
  sendingTo: number | null;
  estimateText?: string;
  paymentText?: string;
};

// ── ALL tab ────────────────────────────────────────────────────────────────
function AllHeaders() {
  return <>
    <th className="px-2 py-2 text-left">№</th>
    <th className="px-2 py-2 text-left">Мастер</th>
    <th className="px-2 py-2 text-left">Клиент · Город</th>
    <th className="px-2 py-2 text-left">Вид работ</th>
    <th className="px-2 py-2 text-left">Смета · Оплата</th>
    <th className="px-2 py-2 text-left">Статус</th>
    <th className="px-2 py-2 text-left">Действия</th>
  </>;
}

function AllRow({ o, onNotify, onComplete, sendingTo, estimateText, paymentText }: ActionProps) {
  return <>
    <OrderNumCell o={o} />
    <MasterCell o={o} />
    <ClientCityCell o={o} />
    <ServiceCell o={o} />
    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
      {o.receiptId
        ? <>
            <div className="text-[#34C759] font-semibold">{fmt(o.receiptTotalAmount ?? 0)}</div>
            <div className="text-[10px]">
              {o.receiptPrepaymentPaidAt
                ? <span className="text-[#34C759]">✅ подтверждено</span>
                : o.receiptPrepaymentSubmittedAt
                  ? <span className="text-blue-600">📸 ждёт проверки</span>
                  : <span className="text-amber-600">⏳ {fmtHours(o.hoursWithoutPayment ?? 0)}</span>}
            </div>
          </>
        : o.hoursWithoutEstimate !== null
          ? <span className={o.hoursWithoutEstimate >= 48 ? "text-red-500 font-semibold" : "text-amber-600"}>
              {fmtHours(o.hoursWithoutEstimate)} без сметы
            </span>
          : <span className="text-gray-400">—</span>
      }
    </td>
    <td className="px-2 py-1.5">
      {o.status === "cancellation_requested"
        ? <Badge label="🚫 Отмена" color="bg-orange-100 text-orange-700" />
        : o.problemReasons.length > 0
          ? <Badge label="⚠ Проблема" color="bg-red-100 text-red-700" />
          : <Badge label="✓ Норма" color="bg-green-100 text-green-700" />
      }
    </td>
    <td className="px-2 py-1.5">
      <div className="flex items-center gap-1">
        {o.masterMaxChatId && (
          <ActionBtn onClick={() => onNotify(o, !o.receiptId ? estimateText! : paymentText!)} color="bg-blue-100 text-blue-600 hover:bg-blue-200" icon={MessageSquare} title="Написать мастеру" disabled={sendingTo === o.id} />
        )}
        {o.clientPhone && (
          <ActionBtn onClick={() => window.open(`tel:${o.clientPhone}`)} color="bg-green-100 text-green-600 hover:bg-green-200" icon={Phone} title="Позвонить клиенту" />
        )}
        <ActionBtn onClick={() => window.open(`/leads?openOrder=${o.id}`, "_blank")} color="bg-gray-100 text-gray-600 hover:bg-gray-200" icon={ClipboardList} title="Открыть заказ" />
        <ActionBtn
          onClick={() => onComplete(o)}
          color={o.commissionPaid ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white" : "bg-gray-100 text-gray-400"}
          icon={CheckSquare}
          title={o.commissionPaid ? "Завершить заказ" : "Завершить нельзя: комиссия не оплачена"}
          disabled={!o.commissionPaid}
        />
      </div>
    </td>
  </>;
}

// ── WITH ESTIMATE tab ───────────────────────────────────────────────────────
function EstimateHeaders() {
  return <>
    <th className="px-2 py-2 text-left">№</th>
    <th className="px-2 py-2 text-left">Мастер</th>
    <th className="px-2 py-2 text-left">Клиент · Город</th>
    <th className="px-2 py-2 text-left">Вид работ</th>
    <th className="px-2 py-2 text-left">Смета</th>
    <th className="px-2 py-2 text-left">Предоплата</th>
    <th className="px-2 py-2 text-left">Ждём</th>
    <th className="px-2 py-2 text-left">Действия</th>
  </>;
}

function EstimateRow({ o, onNotify, onComplete, sendingTo, paymentText }: ActionProps) {
  const confirmed = !!o.receiptPrepaymentPaidAt;       // operator confirmed
  const submitted = !!o.receiptPrepaymentSubmittedAt;  // client sent screenshot
  const hoursWaiting = o.hoursWithoutPayment;
  const prepay = o.receiptPrepaymentAmount ?? 5000;
  const total = o.receiptTotalAmount ?? 0;
  return <>
    <OrderNumCell o={o} />
    <MasterCell o={o} />
    <ClientCityCell o={o} />
    <ServiceCell o={o} />
    <td className="px-2 py-1.5 text-xs font-semibold text-gray-800 whitespace-nowrap">
      {fmt(total)}
      {o.receiptCreatedAt && <div className="text-[10px] text-gray-400 font-normal">{formatDate(o.receiptCreatedAt)}</div>}
    </td>
    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
      {confirmed
        ? <span className="text-[#34C759] font-semibold">✅ Подтверждено</span>
        : submitted
          ? <span className="text-blue-600 font-semibold">📸 Ждёт проверки</span>
          : <span className="text-amber-600">⏳ {fmt(prepay)}</span>
      }
    </td>
    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
      {confirmed ? <span className="text-gray-400">—</span> : hoursWaiting !== null ? (
        <span className={hoursWaiting >= 48 ? "text-red-600 font-semibold" : hoursWaiting >= 24 ? "text-amber-600" : "text-gray-600"}>
          {fmtHours(hoursWaiting)}
        </span>
      ) : <span className="text-gray-400">—</span>}
    </td>
    <td className="px-2 py-1.5">
      <div className="flex items-center gap-1">
        {o.masterMaxChatId && !confirmed && <ActionBtn onClick={() => onNotify(o, paymentText!)} color="bg-blue-100 text-blue-600 hover:bg-blue-200" icon={MessageSquare} title="Напомнить мастеру про оплату" disabled={sendingTo === o.id} />}
        {o.clientPhone && <ActionBtn onClick={() => window.open(`tel:${o.clientPhone}`)} color="bg-green-100 text-green-600 hover:bg-green-200" icon={Phone} title="Позвонить клиенту" />}
        {o.receiptToken && <ActionBtn onClick={() => window.open(`/receipt/${o.receiptToken}`, "_blank")} color="bg-gray-100 text-gray-600 hover:bg-gray-200" icon={Eye} title="Открыть смету" />}
        <ActionBtn onClick={() => window.open(`/leads?openOrder=${o.id}`, "_blank")} color="bg-gray-100 text-gray-600 hover:bg-gray-200" icon={ClipboardList} title="Открыть заказ" />
        <ActionBtn onClick={() => onComplete(o)} color={o.commissionPaid ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white" : "bg-gray-100 text-gray-400"} icon={CheckSquare} title={o.commissionPaid ? "Завершить заказ" : "Завершить нельзя: комиссия не оплачена"} disabled={!o.commissionPaid} />
      </div>
    </td>
  </>;
}

// ── WITHOUT ESTIMATE tab ────────────────────────────────────────────────────
function NoEstimateHeaders() {
  return <>
    <th className="px-2 py-2 text-left">№</th>
    <th className="px-2 py-2 text-left">Мастер</th>
    <th className="px-2 py-2 text-left">Город · Назначен</th>
    <th className="px-2 py-2 text-left">Вид работ</th>
    <th className="px-2 py-2 text-left">Без сметы</th>
    <th className="px-2 py-2 text-left">Риск</th>
    <th className="px-2 py-2 text-left">Действия</th>
  </>;
}

function NoEstimateRow({ o, onNotify, onComplete, sendingTo, estimateText }: ActionProps) {
  const h = o.hoursWithoutEstimate ?? 0;
  return <>
    <OrderNumCell o={o} />
    <MasterCell o={o} />
    <td className="px-2 py-1.5 text-xs text-gray-600">
      <div className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{o.city}</div>
      <div className="text-[10px] text-gray-400">{timeAgo(o.assignedAt)}</div>
    </td>
    <ServiceCell o={o} />
    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
      <span className={h >= 72 ? "text-red-600 font-bold" : h >= 48 ? "text-red-500 font-semibold" : "text-amber-600"}>
        {fmtHours(h)}
      </span>
    </td>
    <td className="px-2 py-1.5">
      {o.status === "cancellation_requested"
        ? <><Badge label="🚫 Отмена" color="bg-orange-100 text-orange-700" />{h >= 48 && <div className="mt-0.5"><Badge label="🔴" color="bg-red-100 text-red-700" /></div>}</>
        : h >= 72
          ? <Badge label="🔴 Блок" color="bg-red-100 text-red-700" />
          : h >= 48
            ? <Badge label="🔴 Критично" color="bg-red-100 text-red-700" />
            : h >= 24
              ? <Badge label="🟡 Внимание" color="bg-yellow-100 text-yellow-700" />
              : <Badge label="🟢 Новый" color="bg-green-100 text-green-700" />
      }
    </td>
    <td className="px-2 py-1.5">
      <div className="flex items-center gap-1">
        {o.masterMaxChatId && <ActionBtn onClick={() => onNotify(o, estimateText!)} color="bg-blue-100 text-blue-600 hover:bg-blue-200" icon={MessageSquare} title="Напомнить про смету" disabled={sendingTo === o.id} />}
        {o.masterPhone && <ActionBtn onClick={() => window.open(`tel:${o.masterPhone}`)} color="bg-green-100 text-green-600 hover:bg-green-200" icon={Phone} title="Позвонить мастеру" />}
        <ActionBtn onClick={() => window.open(`/leads?openOrder=${o.id}`, "_blank")} color="bg-gray-100 text-gray-600 hover:bg-gray-200" icon={ClipboardList} title="Открыть заказ" />
        <ActionBtn onClick={() => onComplete(o)} color={o.commissionPaid ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white" : "bg-gray-100 text-gray-400"} icon={CheckSquare} title={o.commissionPaid ? "Завершить заказ" : "Завершить нельзя: комиссия не оплачена"} disabled={!o.commissionPaid} />
      </div>
    </td>
  </>;
}

// ── WAITING PAYMENT tab ─────────────────────────────────────────────────────
function WaitingPaymentHeaders() {
  return <>
    <th className="px-2 py-2 text-left">№</th>
    <th className="px-2 py-2 text-left">Мастер</th>
    <th className="px-2 py-2 text-left">Клиент · Город</th>
    <th className="px-2 py-2 text-left">Вид работ</th>
    <th className="px-2 py-2 text-left">Смета · Предоплата</th>
    <th className="px-2 py-2 text-left">Без оплаты · Риск</th>
    <th className="px-2 py-2 text-left">Действия</th>
  </>;
}

function WaitingPaymentRow({ o, onNotify, onComplete, sendingTo, paymentText }: ActionProps) {
  const h = o.hoursWithoutPayment ?? 0;
  const submitted = !!o.receiptPrepaymentSubmittedAt;
  return <>
    <OrderNumCell o={o} />
    <MasterCell o={o} />
    <ClientCityCell o={o} />
    <ServiceCell o={o} />
    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
      <div className="font-semibold text-gray-800">{fmt(o.receiptTotalAmount ?? 0)}</div>
      {submitted
        ? <div className="text-blue-600">📸 ждёт проверки</div>
        : <div className="text-amber-600">⏳ {fmt(o.receiptPrepaymentAmount ?? 5000)}</div>
      }
    </td>
    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
      <div className={h >= 72 ? "text-red-600 font-bold" : h >= 48 ? "text-red-500 font-semibold" : h >= 24 ? "text-amber-600" : "text-gray-600"}>{fmtHours(h)}</div>
      <div>
        {h >= 48
          ? <Badge label="🔴 Критично" color="bg-red-100 text-red-700" />
          : h >= 24
            ? <Badge label="🟡 Внимание" color="bg-yellow-100 text-yellow-700" />
            : <Badge label="✓ Норма" color="bg-green-100 text-green-700" />
        }
      </div>
    </td>
    <td className="px-2 py-1.5">
      <div className="flex items-center gap-1">
        {o.masterMaxChatId && !submitted && <ActionBtn onClick={() => onNotify(o, paymentText!)} color="bg-blue-100 text-blue-600 hover:bg-blue-200" icon={MessageSquare} title="Напомнить про оплату" disabled={sendingTo === o.id} />}
        {o.clientPhone && <ActionBtn onClick={() => window.open(`tel:${o.clientPhone}`)} color="bg-green-100 text-green-600 hover:bg-green-200" icon={Phone} title="Позвонить клиенту" />}
        {o.receiptToken && <ActionBtn onClick={() => window.open(`/receipt/${o.receiptToken}`, "_blank")} color="bg-gray-100 text-gray-600 hover:bg-gray-200" icon={Eye} title="Открыть смету" />}
        <ActionBtn onClick={() => window.open(`/leads?openOrder=${o.id}`, "_blank")} color="bg-gray-100 text-gray-600 hover:bg-gray-200" icon={ClipboardList} title="Открыть заказ" />
        <ActionBtn onClick={() => onComplete(o)} color={o.commissionPaid ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white" : "bg-gray-100 text-gray-400"} icon={CheckSquare} title={o.commissionPaid ? "Завершить заказ" : "Завершить нельзя: комиссия не оплачена"} disabled={!o.commissionPaid} />
      </div>
    </td>
  </>;
}

// ── PROBLEMATIC tab ─────────────────────────────────────────────────────────
function ProblematicHeaders() {
  return <>
    <th className="px-2 py-2 text-left">№</th>
    <th className="px-2 py-2 text-left">Мастер</th>
    <th className="px-2 py-2 text-left">Клиент · Город</th>
    <th className="px-2 py-2 text-left">Вид работ · Сумма</th>
    <th className="px-2 py-2 text-left">Причина</th>
    <th className="px-2 py-2 text-left">Действия</th>
  </>;
}

function ProblematicRow({ o, onNotify, onComplete, sendingTo, estimateText, paymentText }: ActionProps) {
  const notifyText = !o.receiptId ? estimateText! : paymentText!;
  return <>
    <OrderNumCell o={o} />
    <MasterCell o={o} />
    <ClientCityCell o={o} />
    <td className="px-2 py-1.5 max-w-[140px]">
      <p className="text-xs text-gray-700 truncate">{o.serviceType}</p>
      <p className="text-[10px] text-gray-500 font-semibold">
        {o.receiptTotalAmount ? fmt(o.receiptTotalAmount) : o.proposedAmount ? fmt(o.proposedAmount) : o.commission ? fmt(o.commission) : "—"}
      </p>
    </td>
    <td className="px-2 py-1.5 max-w-[160px]">
      <div className="flex flex-col gap-0.5">
        {o.problemReasons.map((r, i) => (
          <span key={i} className="text-[11px] text-red-700 font-medium">{r}</span>
        ))}
      </div>
    </td>
    <td className="px-2 py-1.5">
      <div className="flex items-center gap-1">
        {o.masterMaxChatId && <ActionBtn onClick={() => onNotify(o, notifyText)} color="bg-blue-100 text-blue-600 hover:bg-blue-200" icon={MessageSquare} title="Написать мастеру" disabled={sendingTo === o.id} />}
        {o.masterPhone && <ActionBtn onClick={() => window.open(`tel:${o.masterPhone}`)} color="bg-green-100 text-green-600 hover:bg-green-200" icon={Phone} title="Позвонить мастеру" />}
        <ActionBtn onClick={() => window.open(`/leads?openOrder=${o.id}`, "_blank")} color="bg-gray-100 text-gray-600 hover:bg-gray-200" icon={ClipboardList} title="Открыть заказ" />
        <ActionBtn onClick={() => onComplete(o)} color={o.commissionPaid ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white" : "bg-gray-100 text-gray-400"} icon={CheckSquare} title={o.commissionPaid ? "Завершить заказ" : "Завершить нельзя: комиссия не оплачена"} disabled={!o.commissionPaid} />
      </div>
    </td>
  </>;
}

// ── Order Detail Modal ───────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  waiting_master:         { label: "Ждёт мастера",   cls: "bg-amber-100 text-amber-800" },
  master_assigned:        { label: "Мастер назначен", cls: "bg-blue-100 text-blue-800" },
  in_progress:            { label: "В работе",        cls: "bg-green-100 text-green-800" },
  cancellation_requested: { label: "Запрос отмены",   cls: "bg-orange-100 text-orange-800" },
  completed:              { label: "Завершён",         cls: "bg-gray-100 text-gray-700" },
  cancelled:              { label: "Отменён",          cls: "bg-red-100 text-red-800" },
};

function OrderDetailModal({ order: o, onClose, onComplete }: { order: WorkOrder; onClose: () => void; onComplete: (o: WorkOrder) => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const st = STATUS_LABELS[o.status] ?? { label: o.status, cls: "bg-gray-100 text-gray-700" };
  const fmtDate = (s: string | null) => s
    ? new Date(s).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

  const payStatus = !o.receiptId
    ? null
    : o.receiptPrepaymentPaidAt
      ? { label: "✅ Подтверждено оператором", cls: "text-green-700 bg-green-50" }
      : o.receiptPrepaymentSubmittedAt
        ? { label: "📸 Ждёт проверки оператора", cls: "text-blue-700 bg-blue-50" }
        : { label: "⏳ Ожидает оплаты клиентом",  cls: "text-amber-700 bg-amber-50" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">#{o.leadId ?? o.id}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{o.serviceType} · {o.city}{o.district ? `, ${o.district}` : ""}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors ml-2 flex-shrink-0">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <InfoBlock icon={MapPin} label="Адрес" value={`${o.city}${o.district ? `, ${o.district}` : ""}`} />
            <InfoBlock icon={Ruler} label="Площадь" value={`${o.area} м²`} />
            <InfoBlock icon={Calendar} label="Назначен" value={fmtDate(o.assignedAt ?? o.updatedAt)} />
            {o.hoursWithoutEstimate !== null && !o.receiptId && (
              <InfoBlock icon={Clock} label="Без сметы" value={fmtHours(o.hoursWithoutEstimate)}
                valueClass={o.hoursWithoutEstimate >= 48 ? "text-red-600 font-bold" : o.hoursWithoutEstimate >= 24 ? "text-amber-600 font-semibold" : "text-gray-700"} />
            )}
          </div>

          {/* Master */}
          {(o.masterAlias || o.masterPhone) && (
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-400 mb-2">Мастер</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold text-blue-800">{o.masterAlias ?? "—"}</span>
                </div>
                {o.masterPhone && (
                  <a href={`tel:${o.masterPhone}`} onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                    <Phone className="w-3.5 h-3.5" />{o.masterPhone}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Client */}
          {(o.clientName || o.clientPhone) && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-2">Клиент</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-semibold text-gray-800">{o.clientName ?? "—"}</span>
                </div>
                {o.clientPhone && (
                  <a href={`tel:${o.clientPhone}`} onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900">
                    <Phone className="w-3.5 h-3.5" />{o.clientPhone}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Estimate & payment */}
          {o.receiptId && (
            <div className="bg-emerald-50 rounded-xl p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500 mb-1">Смета и оплата</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Итого</span>
                <span className="font-bold text-emerald-700">{fmt(o.receiptTotalAmount ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Предоплата</span>
                <span className="font-semibold text-gray-800">{fmt(o.receiptPrepaymentAmount ?? 0)}</span>
              </div>
              {o.receiptCreatedAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Смета создана</span>
                  <span className="text-gray-700">{fmtDate(o.receiptCreatedAt)}</span>
                </div>
              )}
              {payStatus && (
                <div className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg mt-1 ${payStatus.cls}`}>
                  {payStatus.label}
                  {o.hoursWithoutPayment !== null && !o.receiptPrepaymentPaidAt && (
                    <span className="ml-auto font-normal opacity-75">{fmtHours(o.hoursWithoutPayment)} ожидания</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Commission */}
          {o.commission && (
            <div className="flex items-center justify-between text-sm px-1">
              <span className="text-gray-500">Ожид. комиссия</span>
              <span className="font-semibold text-gray-700">{fmt(o.commission)}</span>
            </div>
          )}

          {/* Problem reasons */}
          {o.problemReasons.length > 0 && (
            <div className="bg-red-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <p className="text-[10px] uppercase tracking-wider font-semibold text-red-400">Проблемы</p>
              </div>
              <div className="space-y-1">
                {o.problemReasons.map((r, i) => (
                  <p key={i} className="text-sm text-red-700 font-medium">{r}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 flex-shrink-0 flex-wrap">
          {o.receiptToken && (
            <button onClick={e => { e.stopPropagation(); window.open(`/receipt/${o.receiptToken}`, "_blank"); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-sm font-medium transition-colors min-w-[90px]">
              <Eye className="w-4 h-4" />Смета
            </button>
          )}
          {o.clientPhone && (
            <a href={`tel:${o.clientPhone}`} onClick={e => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-50 text-gray-700 hover:bg-gray-100 text-sm font-medium transition-colors min-w-[90px]">
              <Phone className="w-4 h-4" />Клиент
            </a>
          )}
          {o.receiptId && (
            <button onClick={e => { e.stopPropagation(); window.open(`/finance?orderId=${o.id}`, "_blank"); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 text-sm font-medium transition-colors min-w-[90px]">
              <Wallet className="w-4 h-4" />Финансы
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); window.open(`/leads?openOrder=${o.id}`, "_blank"); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium transition-colors min-w-[90px]">
            <ClipboardList className="w-4 h-4" />Открыть заказ
          </button>
          <button
            onClick={e => { e.stopPropagation(); onComplete(o); }}
            disabled={!o.commissionPaid}
            title={!o.commissionPaid ? "Комиссия не оплачена" : "Завершить заказ за мастера"}
            className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-colors ${
              o.commissionPaid
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            {o.commissionPaid ? "Завершить заказ" : "Завершить нельзя — комиссия не оплачена"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ icon: Icon, label, value, valueClass = "text-gray-700" }: {
  icon: React.ElementType; label: string; value: string; valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-sm font-semibold ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}
