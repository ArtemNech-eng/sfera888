import { useState, useMemo, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  Loader2, CheckCircle2, TrendingDown, TrendingUp, AlertCircle, Search, X,
  RefreshCw, MapPin, Phone, Clock, ChevronLeft, ChevronRight, Calendar,
  ReceiptText, BarChart3, FileText, Download, Bell, ChevronDown, ChevronUp,
  Users, Banknote, TrendingDown as DebtIcon,
} from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type StatusFilter  = "all" | "pending" | "overdue" | "paid";
type PageTab       = "transactions" | "by-master" | "estimates";
type Period        = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";
type EstimateStatus = "all" | "paid" | "pending" | "unpaid" | "no-receipt" | "cancelled";

interface NoReceiptEntry {
  orderId: number; masterAlias: string; maxChatId: string | null;
  city: string; district: string; serviceType: string;
  assignedAt: string; hoursWithoutReceipt: number;
  risk: "critical" | "warning"; masterPhone: string | null;
}

interface Transaction {
  id: number; orderId: number | null; masterId: number; masterAlias: string;
  city: string; serviceType: string; area: number | null;
  orderAmount: number; commission: number; prepaymentDeducted: number; netPayable: number;
  paymentStatus: string; sourceType: string | null;
  createdAt: string; paidAt: string | null; dueDate: string; daysOverdue: number;
}

interface MasterStat {
  masterId: number; alias: string; city: string; phone: string | null;
  orderCount: number; totalOrderAmount: number; totalCommission: number;
  paidCommission: number; pendingCommission: number; overdueCommission: number;
  paidCount: number; pendingCount: number; overdueCount: number;
  lastPaidAt: string | null; debtTotal: number;
}

interface LineItem { description: string; unit?: string; quantity?: number; price: number }

interface Estimate {
  id: number; token: string; orderId: number; masterId: number; masterAlias: string;
  clientName: string; clientPhone: string; serviceType: string;
  city: string; district: string | null; lineItems: LineItem[];
  totalAmount: number; prepaymentAmount: number; remainder: number;
  notes: string | null; createdAt: string;
  clientSubmittedName: string | null; prepaymentSubmittedAt: string | null;
  prepaymentScreenshotUrl: string | null; prepaymentSeenAt: string | null;
  status: "paid" | "pending" | "unpaid"; orderStatus: string | null; hoursAgo: number;
}

interface FinanceSummary {
  totalIncome: number; totalDebt: number; avgCommission: number;
  paidCount: number; pendingCount: number; overdueCount: number; totalCount: number;
  pendingAmount: number; overdueAmount: number;
}

interface EstimateStats {
  total: number; paidCount: number; pendingCount: number; unpaidCount: number;
  paidSum: number; pendingSum: number; avgCheck: number; avgHours: number; conversionRate: number;
  byService: { name: string; count: number; total: number }[];
  byCity: { city: string; avgAmount: number }[];
  daily: { date: string; paid: number; unpaid: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Сегодня" }, { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },  { key: "quarter", label: "Квартал" },
  { key: "year",  label: "Год" },    { key: "all", label: "Всё время" },
  { key: "custom", label: "Диапазон" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

function getPeriodRange(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const todayStart = new Date(y, m, d, 0, 0, 0, 0).getTime();
  const todayEnd   = new Date(y, m, d, 23, 59, 59, 999).getTime();
  switch (period) {
    case "today":   return { from: todayStart, to: todayEnd };
    case "week": {
      const dow = now.getDay(), daysToMon = dow === 0 ? -6 : 1 - dow;
      return { from: new Date(y, m, d + daysToMon, 0, 0, 0, 0).getTime(), to: todayEnd };
    }
    case "month":   return { from: new Date(y, m, 1, 0, 0, 0, 0).getTime(), to: todayEnd };
    case "quarter": { const q = Math.floor(m / 3); return { from: new Date(y, q * 3, 1, 0, 0, 0, 0).getTime(), to: todayEnd }; }
    case "year":    return { from: new Date(y, 0, 1, 0, 0, 0, 0).getTime(), to: todayEnd };
    case "custom":  return {
      from: customFrom ? new Date(customFrom + "T00:00:00").getTime() : undefined,
      to:   customTo   ? new Date(customTo   + "T23:59:59.999").getTime() : undefined,
    };
    default: return {};
  }
}

function downloadCSV(filename: string, rows: string[][], headers: string[]) {
  const bom  = "\uFEFF"; // UTF-8 BOM for Excel
  const sep  = ";";
  const lines = [headers.join(sep), ...rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(sep))];
  const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function PeriodSelector({ value, onChange, customFrom, customTo, onCustomFrom, onCustomTo }: {
  value: Period; onChange: (p: Period) => void;
  customFrom: string; customTo: string;
  onCustomFrom: (v: string) => void; onCustomTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
      {PERIODS.map(p => (
        <button key={p.key} onClick={() => onChange(p.key)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
            value === p.key ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-background border-border/60 text-muted-foreground hover:text-foreground"}`}>
          {p.label}
        </button>
      ))}
      {value === "custom" && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)}
            className="text-xs border border-border/60 rounded-xl px-2.5 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/30" />
          <span className="text-muted-foreground text-xs">—</span>
          <input type="date" value={customTo} onChange={e => onCustomTo(e.target.value)}
            className="text-xs border border-border/60 rounded-xl px-2.5 py-1.5 bg-background outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      )}
    </div>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: total }, (_, i) => i + 1)
    .filter(p => p === 1 || p === total || Math.abs(p - page) <= 2)
    .reduce<(number | "…")[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
      acc.push(p); return acc;
    }, []);
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        className="p-1.5 rounded-lg border border-border/60 bg-background text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
        <ChevronLeft className="w-4 h-4" />
      </button>
      {pages.map((p, i) => p === "…" ? (
        <span key={`d${i}`} className="px-2 text-muted-foreground text-sm">…</span>
      ) : (
        <button key={p} onClick={() => onChange(p as number)}
          className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
            page === p ? "bg-primary text-primary-foreground" : "bg-background border border-border/60 text-muted-foreground hover:text-foreground"}`}>
          {p}
        </button>
      ))}
      <button onClick={() => onChange(Math.min(total, page + 1))} disabled={page === total}
        className="p-1.5 rounded-lg border border-border/60 bg-background text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid:    "bg-emerald-100 text-emerald-700 border-emerald-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    overdue: "bg-red-100 text-red-700 border-red-200",
    unpaid:  "bg-red-100 text-red-700 border-red-200",
  };
  const labels: Record<string, string> = { paid: "Оплачено", pending: "Ожидает", overdue: "Просрочено", unpaid: "Не оплачено" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${map[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Finance() {
  const queryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

  const [pageTab, setPageTab] = useState<PageTab>("transactions");

  // ── Tab 1 state ──
  const [txPeriod, setTxPeriod]       = useState<Period>("all");
  const [txFrom, setTxFrom]           = useState("");
  const [txTo, setTxTo]               = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch]           = useState("");
  const [cityFilter, setCityFilter]   = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [txPage, setTxPage]           = useState(1);
  const [pageSize, setPageSize]       = useState(20);
  const [confirmPay, setConfirmPay]   = useState<Transaction | null>(null);
  const [remindSent, setRemindSent]   = useState<Set<number>>(new Set());
  const [payLoading, setPayLoading]   = useState<number | null>(null);

  // ── Tab 2 state ──
  const [statsPeriod, setStatsPeriod] = useState<Period>("month");
  const [statsFrom, setStatsFrom]     = useState("");
  const [statsTo, setStatsTo]         = useState("");
  const [confirmPayAll, setConfirmPayAll] = useState<MasterStat | null>(null);
  const [masterActionLoading, setMasterActionLoading] = useState<{ id: number; action: string } | null>(null);

  // ── Tab 3 state ──
  const [estPeriod, setEstPeriod]     = useState<Period>("month");
  const [estFrom, setEstFrom]         = useState("");
  const [estTo, setEstTo]             = useState("");
  const [estStatus, setEstStatus]     = useState<EstimateStatus>("all");
  const [estSearch, setEstSearch]     = useState("");
  const [estCity, setEstCity]         = useState("");
  const [expandedEst, setExpandedEst] = useState<number | null>(null);
  const [estPage, setEstPage]         = useState(1);
  const [confirmEst, setConfirmEst]   = useState<Estimate | null>(null);
  const [estConfirmLoading, setEstConfirmLoading] = useState<number | null>(null);

  // ── No-receipt orders state (shared with AI Office) ──
  const [nrData, setNrData]           = useState<{ critical: NoReceiptEntry[]; warning: NoReceiptEntry[] } | null>(null);
  const [nrLoading, setNrLoading]     = useState(false);
  const [nrActionLoading, setNrActionLoading] = useState<Record<number, string>>({});
  const [nrConfirm, setNrConfirm]     = useState<{ orderId: number; type: "reassign" | "cancel"; masterAlias: string } | null>(null);
  const [nrMsgSent, setNrMsgSent]     = useState<Set<number>>(new Set());

  // ─── Data fetching ────────────────────────────────────────────────────────

  const { data: summary, refetch: refetchSummary } = useQuery<FinanceSummary>({
    queryKey: [`${BASE}/api/finance/summary`],
    queryFn: () => fetch(`${BASE}/api/finance/summary`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: transactions, isLoading: txLoading, refetch: refetchTx } = useQuery<Transaction[]>({
    queryKey: [`${BASE}/api/finance/transactions`],
    queryFn: () => fetch(`${BASE}/api/finance/transactions`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const statsRange = useMemo(() => getPeriodRange(statsPeriod, statsFrom, statsTo), [statsPeriod, statsFrom, statsTo]);
  const statsParams = new URLSearchParams();
  if (statsRange.from) statsParams.set("from", new Date(statsRange.from).toISOString());
  if (statsRange.to)   statsParams.set("to",   new Date(statsRange.to).toISOString());

  const { data: masterStats, isLoading: statsLoading } = useQuery<MasterStat[]>({
    queryKey: [`${BASE}/api/finance/master-stats`, statsRange.from, statsRange.to],
    queryFn: () => fetch(`${BASE}/api/finance/master-stats?${statsParams}`, { credentials: "include" }).then(r => r.json()),
    enabled: pageTab === "by-master",
    staleTime: 30_000,
  });

  const estRange  = useMemo(() => getPeriodRange(estPeriod, estFrom, estTo), [estPeriod, estFrom, estTo]);
  const estParams = new URLSearchParams();
  if (estRange.from)  estParams.set("from",   new Date(estRange.from).toISOString());
  if (estRange.to)    estParams.set("to",     new Date(estRange.to).toISOString());
  if (estSearch)      estParams.set("search", estSearch);
  // estCity is NOT sent to server — city filtering is done client-side so the city dropdown
  // always shows all available cities regardless of current selection.

  const { data: estimates, isLoading: estLoading } = useQuery<Estimate[]>({
    queryKey: [`${BASE}/api/finance/estimates`, estRange.from, estRange.to, estSearch],
    queryFn: () => fetch(`${BASE}/api/finance/estimates?${estParams}`, { credentials: "include" }).then(r => r.json()),
    enabled: pageTab === "estimates",
    staleTime: 30_000,
  });

  const { data: estStats } = useQuery<EstimateStats>({
    queryKey: [`${BASE}/api/finance/estimates/stats`, estRange.from, estRange.to],
    queryFn: () => fetch(`${BASE}/api/finance/estimates/stats?${estParams}`, { credentials: "include" }).then(r => r.json()),
    enabled: pageTab === "estimates",
    staleTime: 30_000,
  });

  // ─── Derived: transactions ────────────────────────────────────────────────

  const txList = Array.isArray(transactions) ? transactions : [];

  const allCities = useMemo(() =>
    [...new Set(txList.map(t => t.city).filter(Boolean))].sort(),
  [txList]);

  const filtered = useMemo(() => {
    let list = [...txList];
    if (statusFilter !== "all") list = list.filter(t => t.paymentStatus === statusFilter);
    if (cityFilter)  list = list.filter(t => t.city === cityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.masterAlias.toLowerCase().includes(q));
    }
    if (orderSearch.trim()) {
      list = list.filter(t => String(t.orderId ?? "").includes(orderSearch.trim()));
    }
    const { from, to } = getPeriodRange(txPeriod, txFrom, txTo);
    if (from !== undefined || to !== undefined) {
      list = list.filter(t => {
        const ms = new Date(t.createdAt).getTime();
        if (from !== undefined && ms < from) return false;
        if (to   !== undefined && ms > to)   return false;
        return true;
      });
    }
    return list;
  }, [txList, statusFilter, cityFilter, search, orderSearch, txPeriod, txFrom, txTo]);

  const txSummary = useMemo(() => {
    // "Общий доход" = деньги фактически полученные:
    //   - для оплаченных транзакций: полная комиссия
    //   - для ожидающих/просроченных: только уже полученная предоплата (prepaymentDeducted)
    //   Т.е. НЕ считаем неоплаченный остаток (netPayable) по ожидающим транзакциям
    const income = filtered.reduce((s, t) => {
      if (t.paymentStatus === "paid") return s + t.commission;
      return s + t.prepaymentDeducted; // только предоплата, остаток не считаем
    }, 0);
    return {
      income,
      pending: filtered.filter(t => t.paymentStatus === "pending").reduce((s, t) => s + t.netPayable, 0),
      overdue: filtered.filter(t => t.paymentStatus === "overdue").reduce((s, t) => s + t.netPayable, 0),
      avg:     filtered.length ? filtered.reduce((s, t) => s + t.commission, 0) / filtered.length : 0,
      paidCount:    filtered.filter(t => t.paymentStatus === "paid").length,
      pendingCount: filtered.filter(t => t.paymentStatus === "pending").length,
      overdueCount: filtered.filter(t => t.paymentStatus === "overdue").length,
    };
  }, [filtered]);

  const totalTxPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeTxPage   = Math.min(txPage, totalTxPages);
  const paginated    = filtered.slice((safeTxPage - 1) * pageSize, safeTxPage * pageSize);

  // ─── Derived: estimates ───────────────────────────────────────────────────

  const filteredEst = useMemo(() => {
    if (!estimates) return [];
    if (estStatus === "no-receipt") return []; // handled by separate no-receipt table
    let list = estStatus === "all"
      ? estimates
      : estStatus === "cancelled"
        ? estimates.filter(e => e.orderStatus === "cancelled")
        : estimates.filter(e => e.status === estStatus);
    if (estCity) list = list.filter(e => e.city === estCity);
    return list;
  }, [estimates, estStatus, estCity]);

  const estCities = useMemo(() => {
    const fromEstimates = (estimates ?? []).map(e => e.city);
    const fromNr = nrData
      ? [...nrData.critical, ...nrData.warning].map(e => e.city)
      : [];
    return [...new Set([...fromEstimates, ...fromNr].filter(Boolean))].sort();
  }, [estimates, nrData]);

  const totalEstPages = Math.max(1, Math.ceil(filteredEst.length / 20));
  const safeEstPage   = Math.min(estPage, totalEstPages);
  const paginatedEst  = filteredEst.slice((safeEstPage - 1) * 20, safeEstPage * 20);

  // ─── Derived: master stats summary ───────────────────────────────────────

  const msList = Array.isArray(masterStats) ? masterStats : [];

  const statsSummary = useMemo(() => {
    return msList.reduce((acc, m) => ({
      totalPaid:    acc.totalPaid    + m.paidCommission,
      totalPending: acc.totalPending + m.pendingCommission,
      totalOverdue: acc.totalOverdue + m.overdueCommission,
      totalDebt:    acc.totalDebt    + m.debtTotal,
      debtors:      acc.debtors     + (m.debtTotal > 0 ? 1 : 0),
    }), { totalPaid: 0, totalPending: 0, totalOverdue: 0, totalDebt: 0, debtors: 0 });
  }, [msList]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const doMarkPaid = async (tx: Transaction) => {
    setPayLoading(tx.id);
    try {
      const r = await fetch(`${BASE}/api/finance/transactions/${tx.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: "paid" }),
      });
      if (!r.ok) throw new Error();
      toast.success(`Комиссия по заказу #${tx.orderId} отмечена оплаченной`);
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/transactions`] });
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/summary`] });
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/master-stats`] });
    } catch { toast.error("Ошибка при обновлении транзакции"); }
    finally { setPayLoading(null); setConfirmPay(null); }
  };

  const doRemind = async (tx: Transaction) => {
    try {
      const r = await fetch(`${BASE}/api/finance/transactions/${tx.id}/remind`, {
        method: "POST", credentials: "include",
      });
      if (r.status === 429) {
        const body = await r.json().catch(() => ({}));
        toast.warning(body.error ?? "Напоминание уже было отправлено недавно");
        return;
      }
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error); }
      toast.success("Напоминание отправлено");
      setRemindSent(s => new Set([...s, tx.id]));
    } catch (e: any) { toast.error(e?.message ?? "Не удалось отправить напоминание"); }
  };

  const doRemindAll = async (m: MasterStat) => {
    setMasterActionLoading({ id: m.masterId, action: "remind" });
    try {
      const r = await fetch(`${BASE}/api/finance/masters/${m.masterId}/remind-all`, { method: "POST", credentials: "include" });
      if (r.status === 429) {
        const body = await r.json().catch(() => ({}));
        toast.warning(body.error ?? "Сводка уже была отправлена недавно");
        return;
      }
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error); }
      toast.success(`Напоминание отправлено мастеру ${m.alias}`);
    } catch (e: any) { toast.error(e?.message ?? "Ошибка при отправке напоминания"); }
    finally { setMasterActionLoading(null); }
  };

  const doPayAll = async (m: MasterStat) => {
    setMasterActionLoading({ id: m.masterId, action: "pay" });
    try {
      const r = await fetch(`${BASE}/api/finance/masters/${m.masterId}/pay-all`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error();
      toast.success(`Все транзакции мастера ${m.alias} отмечены оплаченными`);
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/transactions`] });
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/summary`] });
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/master-stats`] });
    } catch { toast.error("Ошибка при оплате"); }
    finally { setMasterActionLoading(null); setConfirmPayAll(null); }
  };

  const doConfirmPrepayment = async (e: Estimate) => {
    setEstConfirmLoading(e.id);
    try {
      const r = await fetch(`${BASE}/api/receipts/${e.id}/confirm`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorNote: "Подтверждено оператором из CRM" }),
      });
      if (!r.ok) throw new Error();
      toast.success(`Предоплата по смете #${e.id} подтверждена`);
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/estimates`] });
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/estimates/stats`] });
      // Refresh transactions and master-stats — a new transaction was just created server-side
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/transactions`] });
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/summary`] });
      queryClient.invalidateQueries({ queryKey: [`${BASE}/api/finance/master-stats`] });
    } catch { toast.error("Ошибка при подтверждении сметы"); }
    finally { setEstConfirmLoading(null); setConfirmEst(null); }
  };

  // ─── No-receipt handlers ──────────────────────────────────────────────────

  const fetchNoReceipt = useCallback(async () => {
    setNrLoading(true);
    try {
      const r = await fetch(`${BASE}/api/ai-office/template-scenarios/orders-without-receipts/live`, { credentials: "include" });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setNrData(data);
    } catch { toast.error("Не удалось загрузить заказы без сметы"); }
    finally { setNrLoading(false); }
  }, [BASE]);

  useEffect(() => {
    if (pageTab === "estimates") fetchNoReceipt();
  }, [pageTab]); // intentionally omit fetchNoReceipt to avoid infinite loop

  const handleNrMessage = async (orderId: number) => {
    setNrActionLoading(p => ({ ...p, [orderId]: "message" }));
    try {
      const r = await fetch(`${BASE}/api/ai-office/template-scenarios/orders-without-receipts/${orderId}/message-master`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error();
      setNrMsgSent(p => new Set(p).add(orderId));
      toast.success("Сообщение отправлено мастеру");
    } catch { toast.error("Не удалось отправить сообщение"); }
    finally { setNrActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; }); }
  };

  const handleNrReassign = async (orderId: number) => {
    setNrActionLoading(p => ({ ...p, [orderId]: "reassign" }));
    try {
      const r = await fetch(`${BASE}/api/ai-office/template-scenarios/orders-without-receipts/${orderId}/reassign`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error();
      toast.success("Заказ отправлен на переназначение");
      fetchNoReceipt();
    } catch { toast.error("Не удалось переназначить заказ"); }
    finally { setNrActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; }); setNrConfirm(null); }
  };

  const handleNrCancel = async (orderId: number) => {
    setNrActionLoading(p => ({ ...p, [orderId]: "cancel" }));
    try {
      const r = await fetch(`${BASE}/api/ai-office/template-scenarios/orders-without-receipts/${orderId}/cancel`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error();
      toast.success("Заказ отменён");
      fetchNoReceipt();
    } catch { toast.error("Не удалось отменить заказ"); }
    finally { setNrActionLoading(p => { const n = { ...p }; delete n[orderId]; return n; }); setNrConfirm(null); }
  };

  const exportTxCSV = useCallback(() => {
    const headers = ["Дата", "Заказ", "Мастер", "Город", "Вид работ", "Сумма заказа", "Комиссия", "К оплате", "Статус", "Дата оплаты"];
    const rows = filtered.map(t => [
      formatDate(t.createdAt), String(t.orderId ?? ""), t.masterAlias, t.city, t.serviceType,
      String(t.orderAmount), String(t.commission), String(t.netPayable), t.paymentStatus,
      t.paidAt ? formatDate(t.paidAt) : "",
    ]);
    downloadCSV("транзакции.csv", rows, headers);
  }, [filtered]);

  const exportMasterCSV = useCallback(() => {
    if (msList.length === 0) return;
    const headers = ["Мастер", "Город", "Заказов", "Оборот", "Оплачено", "Ожидает", "Просрочено", "Долг итого"];
    const rows = msList.map(m => [
      m.alias, m.city, String(m.orderCount), String(m.totalOrderAmount),
      String(m.paidCommission), String(m.pendingCommission), String(m.overdueCommission), String(m.debtTotal),
    ]);
    downloadCSV("по_мастерам.csv", rows, headers);
  }, [msList]);

  const exportEstCSV = useCallback(() => {
    if (!filteredEst) return;
    const headers = ["Дата", "Заказ", "Мастер", "Клиент", "Телефон", "Город", "Вид работ", "Сумма", "Предоплата", "Статус"];
    const rows = filteredEst.map(e => [
      formatDate(e.createdAt), String(e.orderId), e.masterAlias, e.clientName, e.clientPhone,
      e.city, e.serviceType, String(e.totalAmount), String(e.prepaymentAmount),
      { paid: "Оплачена", pending: "Ожидает", unpaid: "Не оплачена" }[e.status as string] ?? e.status,
    ]);
    downloadCSV("сметы.csv", rows, headers);
  }, [filteredEst]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="finance">
      <Layout>
        <div className="space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Финансы</h1>
              <p className="text-muted-foreground mt-1">Управление комиссиями и выплатами</p>
            </div>
            <button onClick={() => { refetchTx(); refetchSummary(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/60 text-sm text-muted-foreground hover:text-foreground bg-background transition-colors">
              <RefreshCw className="w-4 h-4" /> Обновить
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex rounded-2xl border border-border/50 bg-muted/30 p-1 gap-1 w-fit">
            {([
              { key: "transactions", label: "Транзакции",  icon: <ReceiptText className="w-4 h-4" /> },
              { key: "by-master",    label: "По мастерам", icon: <BarChart3 className="w-4 h-4" /> },
              { key: "estimates",    label: "Сметы",        icon: <FileText className="w-4 h-4" /> },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setPageTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  pageTab === tab.key ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════ TAB 1: TRANSACTIONS ══════════════ */}
          {pageTab === "transactions" && (
            <div className="space-y-5">

              {/* 5 summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow-lg shadow-emerald-500/20 col-span-2 lg:col-span-1">
                  <p className="text-emerald-50 text-xs font-medium mb-1">💰 Общий доход</p>
                  <p className="text-2xl font-bold">{formatCurrency(txSummary.income)}</p>
                  <p className="text-emerald-100 text-[11px] mt-1">{filtered.length} транзакций · {txSummary.paidCount} оплачено</p>
                </div>
                <div className={`rounded-2xl p-4 border shadow-sm ${txSummary.pending > 0 ? "bg-amber-50 border-amber-200" : "bg-card border-border/50"}`}>
                  <p className="text-xs font-medium text-amber-700 mb-1">⏳ Ожидает оплаты</p>
                  <p className="text-2xl font-bold text-amber-800">{formatCurrency(txSummary.pending)}</p>
                  <p className="text-amber-600 text-[11px] mt-1">{txSummary.pendingCount} транзакций</p>
                </div>
                <div className={`rounded-2xl p-4 border shadow-sm ${txSummary.overdue > 0 ? "bg-red-50 border-red-200" : "bg-card border-border/50"}`}>
                  <p className="text-xs font-medium text-red-700 mb-1">⚠️ Просрочено</p>
                  <p className={`text-2xl font-bold ${txSummary.overdue > 0 ? "text-red-700" : "text-foreground"}`}>{formatCurrency(txSummary.overdue)}</p>
                  <p className="text-red-500 text-[11px] mt-1">{txSummary.overdueCount} транзакций</p>
                </div>
                <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-1">📊 Средняя комиссия</p>
                  <p className="text-2xl font-bold">{formatCurrency(txSummary.avg)}</p>
                  <p className="text-muted-foreground text-[11px] mt-1">за транзакцию</p>
                </div>
                <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-1">📋 Транзакций</p>
                  <p className="text-2xl font-bold">{filtered.length}</p>
                  <p className="text-muted-foreground text-[11px] mt-1">за период</p>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
                <PeriodSelector value={txPeriod} onChange={p => { setTxPeriod(p); setTxPage(1); }}
                  customFrom={txFrom} customTo={txTo}
                  onCustomFrom={v => { setTxFrom(v); setTxPage(1); }}
                  onCustomTo={v => { setTxTo(v); setTxPage(1); }} />
                <div className="flex flex-wrap gap-2">
                  {/* Status filter */}
                  <div className="flex rounded-xl border border-border/60 overflow-hidden bg-background text-xs">
                    {(["all", "pending", "overdue", "paid"] as StatusFilter[]).map(s => (
                      <button key={s} onClick={() => { setStatusFilter(s); setTxPage(1); }}
                        className={`px-3 py-2 font-medium transition-colors ${
                          statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        {s === "all" ? "Все" : s === "pending" ? "Ожидают" : s === "overdue" ? "Просрочено" : "Оплачено"}
                      </button>
                    ))}
                  </div>
                  {/* City filter */}
                  {allCities.length > 0 && (
                    <select value={cityFilter} onChange={e => { setCityFilter(e.target.value); setTxPage(1); }}
                      className="text-xs border border-border/60 rounded-xl px-3 py-2 bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Все города</option>
                      {allCities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  {/* Master search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input value={search} onChange={e => { setSearch(e.target.value); setTxPage(1); }}
                      placeholder="Поиск по мастеру..."
                      className="pl-8 pr-8 py-2 text-xs bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 w-44" />
                    {search && <button onClick={() => { setSearch(""); setTxPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
                  </div>
                  {/* Order search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input value={orderSearch} onChange={e => { setOrderSearch(e.target.value); setTxPage(1); }}
                      placeholder="Номер заказа..."
                      className="pl-8 pr-8 py-2 text-xs bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 w-36" />
                    {orderSearch && <button onClick={() => { setOrderSearch(""); setTxPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
                  </div>
                  <button onClick={exportTxCSV}
                    className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border/60 text-xs text-muted-foreground hover:text-foreground bg-background transition-colors">
                    <Download className="w-3.5 h-3.5" /> Выгрузить CSV
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50 text-xs">
                      <tr>
                        <th className="px-4 py-3">Дата</th>
                        <th className="px-4 py-3">Заказ</th>
                        <th className="px-4 py-3">Мастер</th>
                        <th className="px-4 py-3">Город / Вид работ</th>
                        <th className="px-4 py-3 text-right">Сумма заказа</th>
                        <th className="px-4 py-3 text-right">Комиссия</th>
                        <th className="px-4 py-3 text-right">К оплате</th>
                        <th className="px-4 py-3">Срок / Просрочка</th>
                        <th className="px-4 py-3">Статус</th>
                        <th className="px-4 py-3 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {txLoading ? (
                        <tr><td colSpan={10} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                      ) : paginated.length === 0 ? (
                        <tr><td colSpan={10} className="py-12 text-center text-muted-foreground text-sm">Нет транзакций за выбранный период</td></tr>
                      ) : paginated.map(tx => {
                        const rowBg = tx.paymentStatus === "paid"    ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                                    : tx.paymentStatus === "overdue" ? "bg-red-50/40 hover:bg-red-50/70"
                                    : "hover:bg-slate-50/50";
                        const isLoading = payLoading === tx.id;
                        const reminded  = remindSent.has(tx.id);
                        return (
                          <tr key={tx.id} className={`transition-colors ${rowBg}`}>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(tx.createdAt)}</td>
                            <td className="px-4 py-3">
                              <span className="font-medium text-foreground">#{tx.orderId ?? "—"}</span>
                              {tx.sourceType === "receipt" && <div className="text-[10px] text-violet-600 mt-0.5">📋 Из сметы</div>}
                            </td>
                            <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{tx.masterAlias}</td>
                            <td className="px-4 py-3">
                              <div className="text-xs text-muted-foreground">{tx.city}</div>
                              <div className="text-xs text-foreground truncate max-w-[160px]">{tx.serviceType}</div>
                            </td>
                            <td className="px-4 py-3 text-right text-foreground whitespace-nowrap">
                              {tx.orderAmount > 0 ? formatCurrency(tx.orderAmount) : <span className="text-muted-foreground italic text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-medium">{formatCurrency(tx.commission)}</span>
                              {tx.orderAmount > 50_000
                                ? <div className="text-[10px] text-violet-500">15%</div>
                                : <div className="text-[10px] text-muted-foreground">фикс.</div>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-bold ${tx.netPayable > 0 ? "text-foreground" : "text-emerald-600"}`}>
                                {tx.netPayable > 0 ? formatCurrency(tx.netPayable) : "Погашено"}
                              </span>
                              {tx.prepaymentDeducted > 0 && (
                                <div className="text-[10px] text-emerald-600">−{formatCurrency(tx.prepaymentDeducted)} предоплата</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              <div className="text-muted-foreground">{new Date(tx.dueDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</div>
                              {tx.daysOverdue > 0 && <div className="text-red-600 font-semibold">+{tx.daysOverdue} дн.</div>}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={tx.paymentStatus} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end flex-wrap">
                                {(tx.paymentStatus === "pending" || tx.paymentStatus === "overdue") && <>
                                  <button onClick={() => setConfirmPay(tx)} disabled={isLoading}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50">
                                    {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Оплачено
                                  </button>
                                  <button onClick={() => doRemind(tx)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                                      reminded ? "bg-blue-50 text-blue-500 cursor-default" : "bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"}`}
                                    disabled={reminded}>
                                    <Bell className="w-3 h-3" /> {reminded ? "Отправлено" : "Напомнить"}
                                  </button>
                                </>}
                                {tx.orderId && (
                                  <a href={`/orders?id=${tx.orderId}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-600 hover:text-white rounded-lg text-[11px] font-medium transition-colors">
                                    📋 Заказ
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {!txLoading && (
                  <div className="px-4 py-3 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{filtered.length === 0 ? "Нет транзакций" : `${(safeTxPage - 1) * pageSize + 1}–${Math.min(safeTxPage * pageSize, filtered.length)} из ${filtered.length}`}</span>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span>По</span>
                        <div className="flex rounded-lg border border-border/60 overflow-hidden">
                          {PAGE_SIZE_OPTIONS.map(size => (
                            <button key={size} onClick={() => { setPageSize(size); setTxPage(1); }}
                              className={`px-2.5 py-1 text-xs font-medium transition-colors ${pageSize === size ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>
                              {size}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Pagination page={safeTxPage} total={totalTxPages} onChange={setTxPage} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════ TAB 2: BY MASTER ═════════════════ */}
          {pageTab === "by-master" && (
            <div className="space-y-5">
              <PeriodSelector value={statsPeriod} onChange={setStatsPeriod}
                customFrom={statsFrom} customTo={statsTo}
                onCustomFrom={setStatsFrom} onCustomTo={setStatsTo} />

              {/* 4 summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "💰 Общий доход", value: statsSummary.totalPaid, color: "emerald", icon: <TrendingUp className="w-4 h-4 text-emerald-500" /> },
                  { label: "⏳ Долг мастеров", value: statsSummary.totalDebt, color: statsSummary.totalDebt > 0 ? "red" : "slate", icon: <DebtIcon className="w-4 h-4 text-red-500" /> },
                  { label: "⚠️ Просрочено транз.", value: msList.reduce((s, m) => s + m.overdueCount, 0), color: "red", icon: <AlertCircle className="w-4 h-4 text-red-500" />, isCount: true },
                  { label: "👷 Должников", value: statsSummary.debtors, color: "amber", icon: <Users className="w-4 h-4 text-amber-500" />, isCount: true },
                ].map(card => (
                  <div key={card.label} className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">{card.icon}{card.label}</p>
                    <p className={`text-xl font-bold text-${card.color}-600 dark:text-${card.color}-400`}>
                      {card.isCount ? card.value : formatCurrency(card.value as number)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Master table */}
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between p-4 border-b border-border/50">
                  <h3 className="font-display font-semibold">Статистика по мастерам</h3>
                  <button onClick={exportMasterCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 text-xs text-muted-foreground hover:text-foreground bg-background transition-colors">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50 text-xs">
                      <tr>
                        <th className="px-4 py-3">Мастер</th>
                        <th className="px-4 py-3">Город</th>
                        <th className="px-4 py-3 text-right">Заказов</th>
                        <th className="px-4 py-3 text-right">Оборот</th>
                        <th className="px-4 py-3 text-right">Оплачено</th>
                        <th className="px-4 py-3 text-right">Ожидает</th>
                        <th className="px-4 py-3 text-right">Просрочено</th>
                        <th className="px-4 py-3 text-right">Долг итого</th>
                        <th className="px-4 py-3">Посл. оплата</th>
                        <th className="px-4 py-3 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {statsLoading ? (
                        <tr><td colSpan={10} className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                      ) : msList.length === 0 ? (
                        <tr><td colSpan={10} className="py-12 text-center text-muted-foreground text-sm">Нет данных за выбранный период</td></tr>
                      ) : msList.map(m => {
                        const rowBg = m.overdueCommission > 0 ? "bg-red-50/40 hover:bg-red-50/70"
                                    : m.pendingCommission > 0 ? "bg-amber-50/30 hover:bg-amber-50/60"
                                    : "bg-emerald-50/20 hover:bg-emerald-50/50";
                        const isReminding = masterActionLoading?.id === m.masterId && masterActionLoading?.action === "remind";
                        const isPaying    = masterActionLoading?.id === m.masterId && masterActionLoading?.action === "pay";
                        const hasDebt     = m.debtTotal > 0;
                        return (
                          <tr key={m.masterId} className={`transition-colors ${rowBg}`}>
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{m.alias}</div>
                              {m.phone && <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{m.phone}</div>}
                            </td>
                            <td className="px-4 py-3"><div className="flex items-center gap-1 text-muted-foreground text-xs"><MapPin className="w-3 h-3" />{m.city}</div></td>
                            <td className="px-4 py-3 text-right font-medium">{m.orderCount}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(m.totalOrderAmount)}</td>
                            <td className="px-4 py-3 text-right">
                              {m.paidCommission > 0 ? <div><span className="text-emerald-700 font-medium">{formatCurrency(m.paidCommission)}</span><div className="text-[10px] text-muted-foreground">{m.paidCount} транз.</div></div> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {m.pendingCommission > 0 ? <div><span className="text-amber-700 font-medium">{formatCurrency(m.pendingCommission)}</span><div className="text-[10px] text-muted-foreground">{m.pendingCount} транз.</div></div> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {m.overdueCommission > 0 ? <div><span className="text-red-700 font-bold">{formatCurrency(m.overdueCommission)}</span><div className="text-[10px] text-muted-foreground">{m.overdueCount} транз.</div></div> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-bold ${m.debtTotal > 0 ? "text-red-700" : "text-emerald-600"}`}>
                                {m.debtTotal > 0 ? formatCurrency(m.debtTotal) : "Нет долга"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {m.lastPaidAt ? formatDate(m.lastPaidAt) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {hasDebt && (
                                <div className="flex items-center gap-1 justify-end">
                                  <button onClick={() => doRemindAll(m)} disabled={!!masterActionLoading}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50">
                                    {isReminding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />} Напомнить
                                  </button>
                                  <button onClick={() => setConfirmPayAll(m)} disabled={!!masterActionLoading}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50">
                                    {isPaying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Оплатить всё
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════ TAB 3: ESTIMATES ═════════════════ */}
          {pageTab === "estimates" && (
            <div className="space-y-5">

              {/* No-receipt alert banner */}
              {(() => {
                const nrTotal = (nrData?.critical.length ?? 0) + (nrData?.warning.length ?? 0);
                if (!nrTotal && !nrLoading) return null;
                return (
                  <div className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border shadow-sm
                    ${nrData?.critical.length ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {nrLoading
                        ? <span className="text-sm font-medium">Проверка заказов без сметы...</span>
                        : <span className="text-sm font-medium">
                            Заказов без сметы: <strong>{nrTotal}</strong>
                            {nrData?.critical.length ? <span className="ml-2 text-xs">({nrData.critical.length} критических 🔴)</span> : null}
                          </span>}
                    </div>
                    {!nrLoading && nrTotal > 0 && estStatus !== "no-receipt" && (
                      <button onClick={() => { setEstStatus("no-receipt"); setEstPage(1); }}
                        className="text-xs font-semibold underline underline-offset-2 hover:opacity-70 transition-opacity shrink-0">
                        Показать →
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* 5 summary cards */}
              {estStats && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {[
                    { label: "📄 Всего смет",        value: estStats.total,         color: "slate",   isCount: true },
                    { label: "💰 Оплачено",           value: estStats.paidCount,     color: "emerald", isCount: true, sub: formatCurrency(estStats.paidSum) },
                    { label: "⏳ Ждут оплаты",        value: estStats.pendingCount,  color: "amber",   isCount: true, sub: formatCurrency(estStats.pendingSum) },
                    { label: "❌ Не оплачено",        value: estStats.unpaidCount,   color: "red",     isCount: true },
                    { label: "📊 Средний чек",        value: estStats.avgCheck,      color: "violet",  isCount: false },
                  ].map(card => (
                    <div key={card.label} className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{card.label}</p>
                      <p className={`text-2xl font-bold text-${card.color}-600 dark:text-${card.color}-400`}>
                        {card.isCount ? card.value : formatCurrency(card.value as number)}
                      </p>
                      {card.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{card.sub}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Filters */}
              <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
                <PeriodSelector value={estPeriod} onChange={p => { setEstPeriod(p); setEstPage(1); }}
                  customFrom={estFrom} customTo={estTo}
                  onCustomFrom={v => { setEstFrom(v); setEstPage(1); }}
                  onCustomTo={v => { setEstTo(v); setEstPage(1); }} />
                <div className="flex flex-wrap gap-2">
                  <div className="flex rounded-xl border border-border/60 overflow-hidden bg-background text-xs">
                    {(["all", "paid", "pending", "unpaid", "no-receipt", "cancelled"] as EstimateStatus[]).map(s => (
                      <button key={s} onClick={() => { setEstStatus(s); setEstPage(1); }}
                        className={`px-3 py-2 font-medium transition-colors ${estStatus === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        {s === "all" ? "Все"
                          : s === "paid" ? "Оплачены"
                          : s === "pending" ? "Ожидают"
                          : s === "unpaid" ? "Не оплачены"
                          : s === "no-receipt" ? "⚠️ Без сметы"
                          : "❌ Отменённые"}
                      </button>
                    ))}
                  </div>
                  {estCities.length > 0 && (
                    <select value={estCity} onChange={e => { setEstCity(e.target.value); setEstPage(1); }}
                      className="text-xs border border-border/60 rounded-xl px-3 py-2 bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Все города</option>
                      {estCities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input value={estSearch} onChange={e => { setEstSearch(e.target.value); setEstPage(1); }}
                      placeholder="Клиент, заказ..."
                      className="pl-8 pr-8 py-2 text-xs bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 w-44" />
                    {estSearch && <button onClick={() => { setEstSearch(""); setEstPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
                  </div>
                  <button onClick={exportEstCSV} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 text-xs text-muted-foreground hover:text-foreground bg-background transition-colors">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              </div>

              {/* No-receipt table (shown instead of estimates when filter = "no-receipt") */}
              {estStatus === "no-receipt" && (
                <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                  {nrLoading ? (
                    <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>
                  ) : (!nrData || (nrData.critical.length === 0 && nrData.warning.length === 0)) ? (
                    <div className="py-12 text-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Все заказы со сметами — молодцы! 🎉</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {([...nrData.critical.map(e => ({ ...e, risk: "critical" as const })), ...nrData.warning.map(e => ({ ...e, risk: "warning" as const }))])
                        .filter(entry => !estCity || entry.city === estCity)
                        .map(entry => {
                        const isCritical = entry.risk === "critical";
                        const msgLoading = nrActionLoading[entry.orderId] === "message";
                        const reassignLoading = nrActionLoading[entry.orderId] === "reassign";
                        const cancelLoading = nrActionLoading[entry.orderId] === "cancel";
                        const anyLoading = !!nrActionLoading[entry.orderId];
                        const msgSent = nrMsgSent.has(entry.orderId);
                        return (
                          <div key={entry.orderId} className={`px-4 py-3 ${isCritical ? "bg-red-50/40" : "bg-amber-50/20"}`}>
                            <div className="flex items-start gap-3 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-base">{isCritical ? "🔴" : "🟡"}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-foreground">Заказ #{entry.orderId}</span>
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isCritical ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                                      {entry.hoursWithoutReceipt}ч без сметы
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                    <span>{entry.masterAlias}</span>
                                    <span>{entry.city}{entry.district ? `, ${entry.district}` : ""}</span>
                                    <span>{entry.serviceType}</span>
                                    {entry.masterPhone && <span>📞 {entry.masterPhone}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                <button
                                  onClick={() => !msgSent && handleNrMessage(entry.orderId)}
                                  disabled={anyLoading || msgSent}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
                                    ${msgSent ? "bg-emerald-100 text-emerald-700 cursor-default" : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"}`}>
                                  {msgLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : msgSent ? "✅ Отправлено" : "💬 Написать"}
                                </button>
                                <button
                                  onClick={() => setNrConfirm({ orderId: entry.orderId, type: "reassign", masterAlias: entry.masterAlias })}
                                  disabled={anyLoading}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors">
                                  {reassignLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "🔄 Переназначить"}
                                </button>
                                <button
                                  onClick={() => setNrConfirm({ orderId: entry.orderId, type: "cancel", masterAlias: entry.masterAlias })}
                                  disabled={anyLoading}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors">
                                  {cancelLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "✕ Отменить"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="px-4 py-2 border-t border-border/50 flex justify-end gap-2">
                    <button onClick={fetchNoReceipt} disabled={nrLoading}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                      <RefreshCw className={`w-3.5 h-3.5 ${nrLoading ? "animate-spin" : ""}`} /> Обновить
                    </button>
                  </div>
                </div>
              )}

              {/* Estimates table */}
              {estStatus !== "no-receipt" && (
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
                {estLoading ? (
                  <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>
                ) : paginatedEst.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">Нет смет за выбранный период</div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {paginatedEst.map(e => {
                      const isExpanded = expandedEst === e.id;
                      const rowBg = e.status === "paid"    ? "bg-emerald-50/30"
                                  : e.status === "unpaid"  ? "bg-red-50/30"
                                  : "";
                      return (
                        <div key={e.id} className={rowBg}>
                          {/* Collapsed row */}
                          <button
                            onClick={() => setExpandedEst(isExpanded ? null : e.id)}
                            className="w-full px-4 py-3 text-left hover:bg-black/[0.02] transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                                <span className="font-medium text-foreground text-sm">#{e.orderId}</span>
                                <StatusBadge status={e.status} />
                              </div>
                              <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
                                <div className="text-muted-foreground">{e.masterAlias}</div>
                                <div className="text-muted-foreground">{e.clientName}</div>
                                <div className="text-muted-foreground">{e.city}{e.district ? `, ${e.district}` : ""}</div>
                                <div className="text-muted-foreground truncate">{e.serviceType}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-bold text-sm">{formatCurrency(e.totalAmount)}</p>
                                <p className="text-[11px] text-muted-foreground">{formatDate(e.createdAt)}</p>
                              </div>
                            </div>
                          </button>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Line items */}
                                <div className="bg-slate-50 rounded-xl border border-border/50 overflow-hidden">
                                  <div className="px-3 py-2 border-b border-border/50 bg-slate-100/60">
                                    <p className="text-xs font-semibold text-foreground">Состав работ</p>
                                  </div>
                                  <div className="divide-y divide-border/30">
                                    {(e.lineItems ?? []).map((item, i) => {
                                      const sum = (item.quantity ?? 1) * item.price;
                                      return (
                                        <div key={i} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                                          <span className="text-foreground flex-1">{item.description}</span>
                                          <span className="text-muted-foreground shrink-0">
                                            {item.quantity ? `${item.quantity} ${item.unit ?? "м²"} × ${formatCurrency(item.price)}` : formatCurrency(item.price)}
                                          </span>
                                          <span className="font-semibold shrink-0">{formatCurrency(sum)}</span>
                                        </div>
                                      );
                                    })}
                                    <div className="px-3 py-2 bg-slate-100/60 flex justify-between text-sm font-bold">
                                      <span>Итого</span><span>{formatCurrency(e.totalAmount)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Payment info */}
                                <div className="space-y-3">
                                  <div className="bg-slate-50 rounded-xl border border-border/50 p-3 space-y-2">
                                    <p className="text-xs font-semibold text-foreground mb-2">Информация об оплате</p>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">Предоплата:</span>
                                      <span className="font-medium">{formatCurrency(e.prepaymentAmount)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">Статус предоплаты:</span>
                                      <span>
                                        {e.prepaymentSubmittedAt
                                          ? <span className="text-emerald-600 font-medium">✅ Оплачена {new Date(e.prepaymentSubmittedAt).toLocaleDateString("ru-RU")}</span>
                                          : e.hoursAgo > 72
                                            ? <span className="text-red-600 font-medium">❌ Не оплачена</span>
                                            : <span className="text-amber-600 font-medium">⏳ Ожидает ({e.hoursAgo}ч назад)</span>}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">Остаток к оплате:</span>
                                      <span className="font-bold">{formatCurrency(e.remainder)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs pt-1 border-t border-border/50">
                                      <span className="text-muted-foreground">Комиссия платформы:</span>
                                      <span className="font-medium text-violet-600">
                                        {e.totalAmount > 50_000
                                          ? `${formatCurrency(e.totalAmount * 0.15)} (${e.totalAmount.toLocaleString("ru-RU")}₽ × 15%)`
                                          : `5 000₽ (фиксированная)`}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="bg-slate-50 rounded-xl border border-border/50 p-3 text-xs space-y-1.5">
                                    <p className="font-semibold text-foreground mb-1.5">Клиент</p>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Имя:</span><span>{e.clientName}</span></div>
                                    <div className="flex justify-between"><span className="text-muted-foreground">Телефон:</span><span>{e.clientPhone}</span></div>
                                    {e.clientSubmittedName && <div className="flex justify-between"><span className="text-muted-foreground">Подтвердил:</span><span>{e.clientSubmittedName}</span></div>}
                                  </div>
                                  {/* Screenshot preview if client submitted */}
                                  {e.prepaymentScreenshotUrl && (
                                    <div className="rounded-xl overflow-hidden border border-border/50">
                                      <p className="text-xs text-muted-foreground px-3 pt-2 pb-1">Скриншот оплаты</p>
                                      <a href={e.prepaymentScreenshotUrl} target="_blank" rel="noreferrer">
                                        <img src={e.prepaymentScreenshotUrl} alt="Скриншот" className="w-full max-h-48 object-cover" />
                                      </a>
                                    </div>
                                  )}
                                  <div className="flex gap-2 flex-wrap">
                                    <a href={`/api/receipt/${e.token}`} target="_blank" rel="noreferrer"
                                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border/60 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">
                                      👁 Смета для клиента
                                    </a>
                                    {e.status !== "paid" && (
                                      <button
                                        onClick={() => setConfirmEst(e)}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/60 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                                        ✅ Подтвердить предоплату
                                      </button>
                                    )}
                                    {e.orderId && (
                                      <a href={`/orders?id=${e.orderId}`}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-border/60 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">
                                        📋 Открыть заказ
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {!estLoading && filteredEst.length > 20 && (
                  <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{(safeEstPage - 1) * 20 + 1}–{Math.min(safeEstPage * 20, filteredEst.length)} из {filteredEst.length}</span>
                    <Pagination page={safeEstPage} total={totalEstPages} onChange={setEstPage} />
                  </div>
                )}
              </div>
              )}

              {/* Analytics block */}
              {estStats && estStats.total > 0 && (
                <div className="space-y-4">
                  <h3 className="font-display font-semibold text-lg">Аналитика по сметам</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Conversion */}
                    <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                      <p className="text-sm font-semibold mb-3">Конверсия смет</p>
                      <div className="space-y-2 text-sm">
                        {[
                          { label: "Отправлено смет", value: estStats.total, color: "bg-slate-400" },
                          { label: `Оплачено (${estStats.conversionRate}%)`, value: estStats.paidCount, color: "bg-emerald-500" },
                          { label: "Не оплачено", value: estStats.unpaidCount, color: "bg-red-400" },
                        ].map(row => (
                          <div key={row.label}>
                            <div className="flex justify-between mb-1"><span className="text-muted-foreground text-xs">{row.label}</span><span className="font-semibold text-xs">{row.value}</span></div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full ${row.color} rounded-full transition-all`} style={{ width: `${estStats.total > 0 ? (row.value / estStats.total) * 100 : 0}%` }} />
                            </div>
                          </div>
                        ))}
                        {estStats.avgHours > 0 && (
                          <p className="text-xs text-muted-foreground pt-2">⏱ Среднее время до оплаты: <strong>{estStats.avgHours}ч</strong></p>
                        )}
                      </div>
                    </div>

                    {/* By service */}
                    {estStats.byService.length > 0 && (
                      <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                        <p className="text-sm font-semibold mb-3">Топ видов работ</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={estStats.byService} layout="vertical" margin={{ left: 0, right: 20 }}>
                            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}к`} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                            <Tooltip formatter={(v: number) => formatCurrency(v)} />
                            <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* By city */}
                    {estStats.byCity.length > 0 && (
                      <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                        <p className="text-sm font-semibold mb-3">Средний чек по городам</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={estStats.byCity}>
                            <XAxis dataKey="city" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}к`} />
                            <Tooltip formatter={(v: number) => formatCurrency(v)} />
                            <Bar dataKey="avgAmount" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Daily dynamics */}
                    {estStats.daily.length > 1 && (
                      <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
                        <p className="text-sm font-semibold mb-3">Динамика смет по дням</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={estStats.daily}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                            <Tooltip />
                            <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="paid"   name="Оплачены"     stroke="#10b981" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="unpaid" name="Не оплачены"  stroke="#ef4444" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Confirm: mark paid ────────────────────────────────────────────── */}
        {confirmPay && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <h3 className="text-lg font-display font-semibold">Подтвердите оплату</h3>
              <p className="text-sm text-muted-foreground">
                Отметить комиссию по заказу <strong>#{confirmPay.orderId}</strong> как оплаченную?<br />
                Сумма: <strong>{formatCurrency(confirmPay.netPayable)}</strong>
              </p>
              <p className="text-xs text-muted-foreground bg-blue-50 rounded-xl p-3">
                Мастеру будет отправлено уведомление в Max.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmPay(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Отмена
                </button>
                <button onClick={() => doMarkPaid(confirmPay)} disabled={payLoading === confirmPay.id}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {payLoading === confirmPay.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Да, оплачено"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm: pay-all for master ───────────────────────────────────── */}
        {confirmPayAll && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <h3 className="text-lg font-display font-semibold">Оплатить всё</h3>
              <p className="text-sm text-muted-foreground">
                Отметить все неоплаченные транзакции мастера <strong>{confirmPayAll.alias}</strong> как оплаченные?<br /><br />
                Количество: <strong>{confirmPayAll.pendingCount + confirmPayAll.overdueCount}</strong><br />
                Сумма: <strong>{formatCurrency(confirmPayAll.debtTotal)}</strong>
              </p>
              <p className="text-xs text-muted-foreground bg-blue-50 rounded-xl p-3">
                Мастеру будет отправлено уведомление в Max.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmPayAll(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Отмена
                </button>
                <button onClick={() => doPayAll(confirmPayAll)}
                  disabled={masterActionLoading?.id === confirmPayAll.masterId}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {masterActionLoading?.id === confirmPayAll.masterId ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Да, оплатить всё"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── No-receipt confirm dialog ─────────────────────────────────────── */}
        {nrConfirm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <h3 className="text-lg font-display font-semibold">
                {nrConfirm.type === "reassign" ? "🔄 Переназначить заказ" : "✕ Отменить заказ"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {nrConfirm.type === "reassign"
                  ? <>Заказ <strong>#{nrConfirm.orderId}</strong> будет снят с мастера <strong>{nrConfirm.masterAlias}</strong> и отправлен на переназначение. Мастер получит уведомление.</>
                  : <>Заказ <strong>#{nrConfirm.orderId}</strong> будет отменён (мастер: <strong>{nrConfirm.masterAlias}</strong>). Действие необратимо.</>}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setNrConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Отмена
                </button>
                <button
                  onClick={() => nrConfirm.type === "reassign" ? handleNrReassign(nrConfirm.orderId) : handleNrCancel(nrConfirm.orderId)}
                  disabled={!!nrActionLoading[nrConfirm.orderId]}
                  className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 transition-colors
                    ${nrConfirm.type === "reassign" ? "bg-amber-500 hover:bg-amber-600" : "bg-red-600 hover:bg-red-700"}`}>
                  {nrActionLoading[nrConfirm.orderId]
                    ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    : nrConfirm.type === "reassign" ? "Да, переназначить" : "Да, отменить"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm prepayment dialog ─────────────────────────────────────── */}
        {confirmEst && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <h3 className="text-lg font-display font-semibold">Подтвердить предоплату</h3>
              <p className="text-sm text-muted-foreground">
                Отметить предоплату по смете <strong>#{confirmEst.id}</strong> как полученную?<br /><br />
                Клиент: <strong>{confirmEst.clientName}</strong><br />
                Предоплата: <strong>{formatCurrency(confirmEst.prepaymentAmount)}</strong>
              </p>
              <p className="text-xs text-muted-foreground bg-emerald-50 rounded-xl p-3">
                Мастеру придёт уведомление об оплате в Max. Статус сметы изменится на «Оплачено».
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmEst(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Отмена
                </button>
                <button onClick={() => doConfirmPrepayment(confirmEst)}
                  disabled={estConfirmLoading === confirmEst.id}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {estConfirmLoading === confirmEst.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "✅ Подтвердить"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
