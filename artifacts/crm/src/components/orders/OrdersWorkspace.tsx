/**
 * OrdersWorkspace — unified orders/leads-in-work view.
 *
 * Replaces both the standalone /orders page and the WorkBoardTable inside
 * /leads?tab=work. Single source of truth: GET /api/work-board/table with
 * folder + city + period + paymentModel filters and SSE live updates.
 *
 * Composition:
 *   - <OrdersFolderTabs>   — top-level folder switcher (5 folders)
 *   - <OrdersFilterBar>    — search, period, city, status, payment-model
 *   - <OrdersFunnel>       — totals row pulled from the SSE-backed funnel
 *   - <OrdersBanners>      — 4 alert banners (cancellation / responses / amount)
 *   - <OrdersTable>        — TanStack table over `/api/work-board/table` rows
 *   - <ClosingDrawer>      — right-side drawer to close an order (active folders)
 *   - <MasterPickerPanel>  — right-side drawer to pick / replace a master
 *   - <UnassignDialog>     — modal with 4 preset reasons + free-form note
 *
 * The component is layout-agnostic. The host page provides the chrome
 * (Layout, ProtectedRoute, navigation) and the actual `OrderPanel` for
 * order details. The workspace only emits `onOpenOrder(id)` upwards.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Search, Loader2, X, Filter, AlertCircle, AlertTriangle,
  CalendarDays, ChevronDown, Banknote, CheckCircle2, XCircle, Timer,
  Inbox, RefreshCw, MessageSquare, UserCheck, UserMinus, UserPlus,
  Diamond, Wallet, MapPin, TrendingUp, Radio, Check, Clock, Pencil,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import OrdersFunnel from "./OrdersFunnel";
import OrdersBanners from "./OrdersBanners";
import ClosingDrawer from "./ClosingDrawer";
import MasterPickerPanel from "./MasterPickerPanel";
import UnassignDialog from "./UnassignDialog";

// ─── Types ───────────────────────────────────────────────────────────────────

type FolderKey =
  | "waiting_master"
  | "in_progress"
  | "pending_payment"
  | "completed"
  | "cancelled";

type ColumnKey =
  | "new" | "waiting_master" | "no_estimate" | "estimate_unpaid"
  | "estimate_paid" | "commission_left" | "closed_24h" | "problem";

interface TableRow {
  orderId: number;
  leadId: number | null;
  status: string;
  columnKey: ColumnKey;
  city?: string;
  district?: string;
  address: string;
  serviceType?: string;
  scheduledAt?: string | null;
  createdAt?: string;
  master: string | null;
  masterId: number | null;
  masterDebt: number;
  masterCity?: string | null;
  clientName?: string;
  clientPhone?: string;
  ageMs: number;
  timeInStage: string;
  isProblem: boolean;
  problemReason?: string;
  paymentModel?: string;
  tokensCharged?: number;
  commission?: {
    orderTotal: number;
    total: number;
    paid: number;
    left: number;
    tier: "fixed" | "percent";
    prepaymentDeducted?: number;
  };
  commissionLeft: number;
  commissionPaid?: boolean;
  money?: { kind: string; amount: number };
}

interface TableResponse {
  rows: TableRow[];
  total: number;
  page: number;
  limit: number;
  funnel: {
    activeCount: number;
    sumInWork: number;
    sumPaid: number;
    expectedCommission: number;
    conversionPct: number;
    problemCount: number;
  };
  generatedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FOLDERS: { id: FolderKey; label: string; icon: React.ComponentType<{ className?: string }>; color: string; activeBg: string }[] = [
  { id: "waiting_master",  label: "Ждут мастера",    icon: Inbox,        color: "text-orange-600",  activeBg: "bg-white" },
  { id: "in_progress",     label: "В работе",        icon: Timer,        color: "text-blue-600",    activeBg: "bg-white" },
  { id: "pending_payment", label: "Ожидание оплаты", icon: Banknote,     color: "text-amber-600",   activeBg: "bg-white" },
  { id: "completed",       label: "Успешные",        icon: CheckCircle2, color: "text-emerald-600", activeBg: "bg-white" },
  { id: "cancelled",       label: "Отказы",          icon: XCircle,      color: "text-red-600",     activeBg: "bg-white" },
];

const fmtMoney = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface OrdersWorkspaceProps {
  /** Called when the operator clicks a row or the "details" action. */
  onOpenOrder: (orderId: number) => void;
  /** Initial folder. Default: "waiting_master". */
  initialFolder?: FolderKey;
  /** Show the page-level title? false when embedded in /leads tabs. */
  showTitle?: boolean;
}

export default function OrdersWorkspace({ onOpenOrder, initialFolder = "waiting_master", showTitle = false }: OrdersWorkspaceProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [folder, setFolder] = useState<FolderKey>(initialFolder);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"all" | "today" | "yesterday" | "week" | "month">("all");
  const [city, setCity] = useState<string>("all");
  const [paymentModel, setPaymentModel] = useState<"all" | "token" | "commission">("all");
  const [problemOnly, setProblemOnly] = useState(false);
  const [hasCommissionLeft, setHasCommissionLeft] = useState(false);
  const [sortBy, setSortBy] = useState<"createdAt" | "ageMs" | "orderTotal" | "commissionLeft">(
    () => (initialFolder === "completed" || initialFolder === "cancelled" ? "createdAt" : "commissionLeft"),
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const limit = 50;

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [folder, search, period, city, paymentModel, problemOnly, hasCommissionLeft]);

  // Smart default sort when switching folders
  useEffect(() => {
    if (folder === "completed" || folder === "cancelled") setSortBy("createdAt");
    else if (sortBy === "createdAt") setSortBy("commissionLeft");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  // ── Action drawer / dialog state ──────────────────────────────────────────
  const [closingOrder, setClosingOrder] = useState<TableRow | null>(null);
  const [pickerForOrder, setPickerForOrder] = useState<TableRow | null>(null);
  const [unassignFor, setUnassignFor] = useState<TableRow | null>(null);

  // ── Server query ──────────────────────────────────────────────────────────
  const queryString = useMemo(() => {
    const qp = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sortBy,
      sortDir,
      folder,
    });
    if (search.trim()) qp.set("search", search.trim());
    if (period !== "all") qp.set("period", period);
    if (city !== "all") qp.set("city", city);
    if (paymentModel !== "all") qp.set("paymentModel", paymentModel);
    if (problemOnly) qp.set("problemOnly", "true");
    if (hasCommissionLeft) qp.set("hasCommissionLeft", "true");
    return qp.toString();
  }, [page, limit, sortBy, sortDir, folder, search, period, city, paymentModel, problemOnly, hasCommissionLeft]);

  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<TableResponse>({
    queryKey: ["/api/work-board/table", queryString],
    queryFn: async () => {
      const r = await fetch(`/api/work-board/table?${queryString}`, { credentials: "include" });
      if (!r.ok) {
        const text = await r.text();
        try {
          const j = JSON.parse(text);
          throw new Error(j.error ?? "Не удалось загрузить таблицу");
        } catch {
          throw new Error(text || "Не удалось загрузить таблицу");
        }
      }
      return r.json();
    },
    refetchInterval: 15_000,
  });

  // ── SSE live updates ──────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/work-board/table/stream", { withCredentials: true });
    const onAny = () => queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
    es.addEventListener("tick", onAny);
    es.addEventListener("changed", onAny);
    es.onerror = () => { /* auto-reconnect by browser */ };
    return () => es.close();
  }, [queryClient]);

  // ── Cities for filter (fetched once, refreshed every minute) ──────────────
  const { data: citiesData } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/settings/cities"],
    queryFn: async () => {
      const r = await fetch("/api/settings/cities", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60_000,
  });
  const cityList = useMemo(() => {
    if (!citiesData || citiesData.length === 0) {
      // Fallback: derive from current rows
      return Array.from(new Set((data?.rows ?? []).map(r => r.city).filter(Boolean) as string[])).sort();
    }
    return citiesData.map(c => c.name).sort();
  }, [citiesData, data]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dispatch/pending"] });
  };

  const togglePaidMutation = useMutation({
    mutationFn: async ({ orderId, paid }: { orderId: number; paid: boolean }) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ commissionPaid: paid }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: (_d, vars) => {
      invalidateAll();
      toast({ title: vars.paid ? "Отмечено: оплачено" : "Снята отметка об оплате" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const partialPaymentMutation = useMutation({
    mutationFn: async ({ orderId, amount, note }: { orderId: number; amount: number; note?: string }) => {
      const r = await fetch(`/api/work-board/orders/${orderId}/partial-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, note }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: (data: any) => {
      invalidateAll();
      toast({ title: "Оплата принята", description: `Остаток: ${fmtMoney(Number(data.remaining ?? 0))}` });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const returnToPoolMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/work-board/return-to-pool/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmed: true }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Заказ возвращён в пул" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const closeOrderMutation = useMutation({
    mutationFn: async ({ orderId, amount, commission, isPaid, status }: { orderId: number; amount: number; commission: number; isPaid: boolean; status: "completed" | "cancelled" }) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderAmount: amount, commission, commissionPaid: isPaid, status }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      invalidateAll();
      setClosingOrder(null);
      toast({ title: "Заказ обновлён" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const unassignMutation = useMutation({
    mutationFn: async ({ orderId, reason, rebroadcast }: { orderId: number; reason: string; rebroadcast: boolean }) => {
      const r = await fetch(`/api/orders/${orderId}/unassign-master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason, rebroadcast }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: (data: any) => {
      invalidateAll();
      setUnassignFor(null);
      const rebroadcastInfo = data?.rebroadcast?.ok ? ` Разослано ${data.rebroadcast.sent} мастерам.` : "";
      toast({ title: "Мастер снят", description: `Сделано.${rebroadcastInfo}` });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const manualAssignMutation = useMutation({
    mutationFn: async ({ orderId, masterId }: { orderId: number; masterId: number }) => {
      const r = await fetch(`/api/orders/${orderId}/manual-assign/${masterId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      invalidateAll();
      setPickerForOrder(null);
      toast({ title: "Мастер назначен" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  // ── Render helpers ────────────────────────────────────────────────────────
  const folderCount = (f: FolderKey): number | null => {
    // We only know the count of the currently-open folder from the server.
    // For other folders we'd need a separate /summary endpoint — skipped in v1.
    if (f === folder && data) return data.total;
    return null;
  };

  const activeFilterCount =
    (period !== "all" ? 1 : 0) +
    (city !== "all" ? 1 : 0) +
    (paymentModel !== "all" ? 1 : 0) +
    (problemOnly ? 1 : 0) +
    (hasCommissionLeft ? 1 : 0);

  const resetFilters = () => {
    setPeriod("all");
    setCity("all");
    setPaymentModel("all");
    setProblemOnly(false);
    setHasCommissionLeft(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {showTitle && (
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Заказы</h1>
          <p className="text-sm text-muted-foreground mt-1">Управление сделками, мастерами и финансами</p>
        </div>
      )}

      {/* Folder tabs */}
      <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-sm">
        {FOLDERS.map(f => {
          const active = folder === f.id;
          const Icon = f.icon;
          const count = folderCount(f.id);
          return (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                active ? `${f.activeBg} ${f.color} shadow-sm border border-slate-200/50` : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? f.color : "text-slate-400"}`} />
              {f.label}
              {active && count !== null && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 ${f.color}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Funnel metrics */}
      <OrdersFunnel funnel={data?.funnel} updatedAt={dataUpdatedAt} loading={isLoading} onRefresh={refetch} />

      {/* Banners (cancellation requests + responses + proposed amounts) */}
      <OrdersBanners onOpenOrder={onOpenOrder} />

      {/* Filter bar */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="p-3 border-b border-border/50 space-y-2">
          {/* Row 1: search + counter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск: ID, телефон, имя, мастер, город…"
                className="w-full pl-9 pr-8 py-2 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                <X className="w-3 h-3" />
                Сбросить ({activeFilterCount})
              </button>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              {data ? `${data.total} ${data.total === 1 ? "заказ" : data.total < 5 ? "заказа" : "заказов"}` : ""}
            </div>
          </div>

          {/* Row 2: filters */}
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {(["all", "today", "yesterday", "week", "month"] as const).map(p => {
              const labels = { all: "Все", today: "Сегодня", yesterday: "Вчера", week: "7 дней", month: "Месяц" };
              const active = period === p;
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"
                  }`}
                >
                  {labels[p]}
                </button>
              );
            })}

            <div className="h-4 w-px bg-border/50 mx-1" />

            {cityList.length > 1 && (
              <div className="relative">
                <select
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className={`appearance-none pl-3 pr-7 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                    city !== "all" ? "bg-primary/10 border-primary/40 text-primary" : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"
                  }`}
                >
                  <option value="all">Все города</option>
                  {cityList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
            )}

            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {([
                { key: "all" as const, label: "Все", icon: undefined },
                { key: "token" as const, label: "Токены", icon: Diamond },
                { key: "commission" as const, label: "Комиссия", icon: Banknote },
              ]).map(t => {
                const isActive = paymentModel === t.key;
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setPaymentModel(t.key)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                      isActive ? "bg-white text-foreground shadow-sm ring-1 ring-black/5" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {Icon && <Icon className="w-3 h-3" />}
                    {t.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setProblemOnly(p => !p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                problemOnly ? "bg-red-50 border-red-300 text-red-700" : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"
              }`}
            >
              🚨 Проблемные
            </button>

            {(folder === "in_progress" || folder === "pending_payment") && (
              <button
                onClick={() => setHasCommissionLeft(p => !p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  hasCommissionLeft ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"
                }`}
              >
                💰 С остатком
              </button>
            )}

            <div className="ml-auto flex items-center gap-1 text-xs text-emerald-700 border border-emerald-200 bg-emerald-50/80 rounded-lg px-2 py-1">
              <Radio className="w-3 h-3" /> live
            </div>
          </div>
        </div>

        {/* Table */}
        <OrdersTable
          rows={data?.rows ?? []}
          isLoading={isLoading}
          error={error}
          folder={folder}
          isMobile={isMobile}
          sortBy={sortBy}
          sortDir={sortDir}
          onToggleSort={(by) => {
            if (sortBy === by) setSortDir(d => d === "asc" ? "desc" : "asc");
            else { setSortBy(by); setSortDir("desc"); }
          }}
          onOpenOrder={onOpenOrder}
          onClose={(row) => setClosingOrder(row)}
          onPickMaster={(row) => setPickerForOrder(row)}
          onUnassign={(row) => setUnassignFor(row)}
          onTogglePaid={(row, paid) => togglePaidMutation.mutate({ orderId: row.orderId, paid })}
          onPartialPayment={(row) => {
            const left = row.commissionLeft;
            const input = window.prompt(`Сумма оплаты (остаток ${fmtMoney(left)}):`, String(left));
            if (input === null) return;
            const amount = parseFloat(input.replace(/[^0-9.]/g, ""));
            if (!amount || amount <= 0 || amount > left + 0.01) {
              toast({ title: "Некорректная сумма", variant: "destructive" });
              return;
            }
            partialPaymentMutation.mutate({ orderId: row.orderId, amount });
          }}
          onReturnToPool={(row) => {
            if (confirm(`Вернуть заказ #${row.orderId} в пул? Мастер будет снят.`)) {
              returnToPoolMutation.mutate(row.orderId);
            }
          }}
        />

        {/* Pagination */}
        {data && data.total > limit && (
          <div className="p-3 border-t border-border/50 flex items-center justify-between text-sm">
            <div className="text-muted-foreground text-xs">
              Страница {data.page} из {Math.max(1, Math.ceil(data.total / limit))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                Назад
              </Button>
              <Button variant="outline" size="sm" disabled={page * limit >= data.total} onClick={() => setPage(p => p + 1)}>
                Вперёд
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right-side drawers */}
      {closingOrder && (
        <ClosingDrawer
          order={closingOrder}
          onClose={() => setClosingOrder(null)}
          onSubmit={(values) => closeOrderMutation.mutate({ orderId: closingOrder.orderId, ...values })}
          isPending={closeOrderMutation.isPending}
        />
      )}

      {pickerForOrder && (
        <MasterPickerPanel
          order={pickerForOrder}
          onClose={() => setPickerForOrder(null)}
          onAssign={(masterId) => manualAssignMutation.mutate({ orderId: pickerForOrder.orderId, masterId })}
          isPending={manualAssignMutation.isPending}
        />
      )}

      {unassignFor && (
        <UnassignDialog
          order={unassignFor}
          onClose={() => setUnassignFor(null)}
          onConfirm={(reason, rebroadcast) => unassignMutation.mutate({ orderId: unassignFor.orderId, reason, rebroadcast })}
          isPending={unassignMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Inline OrdersTable component ────────────────────────────────────────────

interface OrdersTableProps {
  rows: TableRow[];
  isLoading: boolean;
  error: unknown;
  folder: FolderKey;
  isMobile: boolean;
  sortBy: "createdAt" | "ageMs" | "orderTotal" | "commissionLeft";
  sortDir: "asc" | "desc";
  onToggleSort: (by: "createdAt" | "ageMs" | "orderTotal" | "commissionLeft") => void;
  onOpenOrder: (orderId: number) => void;
  onClose: (row: TableRow) => void;
  onPickMaster: (row: TableRow) => void;
  onUnassign: (row: TableRow) => void;
  onTogglePaid: (row: TableRow, paid: boolean) => void;
  onPartialPayment: (row: TableRow) => void;
  onReturnToPool: (row: TableRow) => void;
}

function OrdersTable({
  rows, isLoading, error, folder, isMobile,
  sortBy, sortDir, onToggleSort,
  onOpenOrder, onClose, onPickMaster, onUnassign,
  onTogglePaid, onPartialPayment, onReturnToPool,
}: OrdersTableProps) {
  if (error) {
    return (
      <div className="p-8 text-center text-red-600 text-sm">
        Ошибка загрузки: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }
  if (isLoading && rows.length === 0) {
    return <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>;
  }
  if (rows.length === 0) {
    return <div className="p-12 text-center text-muted-foreground text-sm">Заказов не найдено</div>;
  }

  if (isMobile) {
    return (
      <div className="divide-y divide-border/50">
        {rows.map(row => (
          <OrderCardMobile
            key={row.orderId}
            row={row}
            folder={folder}
            onOpenOrder={onOpenOrder}
            onClose={onClose}
            onPickMaster={onPickMaster}
            onUnassign={onUnassign}
            onTogglePaid={onTogglePaid}
            onPartialPayment={onPartialPayment}
            onReturnToPool={onReturnToPool}
          />
        ))}
      </div>
    );
  }

  const SortHeader = ({ by, children, className }: { by: typeof sortBy; children: React.ReactNode; className?: string }) => (
    <button
      onClick={() => onToggleSort(by)}
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${className ?? ""}`}
    >
      {children}
      {sortBy === by ? (
        <span className="text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50 text-xs">
          <tr>
            <th className="px-3 py-2.5 pl-4 w-1"></th>
            <th className="px-3 py-2.5"><SortHeader by="createdAt">ID · Дата</SortHeader></th>
            <th className="px-3 py-2.5">Услуга · Локация</th>
            <th className="px-3 py-2.5">Клиент</th>
            <th className="px-3 py-2.5">Мастер</th>
            <th className="px-3 py-2.5"><SortHeader by="orderTotal">Сумма</SortHeader></th>
            <th className="px-3 py-2.5"><SortHeader by="commissionLeft">Комиссия</SortHeader></th>
            <th className="px-3 py-2.5"><SortHeader by="ageMs">Время</SortHeader></th>
            <th className="px-3 py-2.5 pr-4 text-right">Действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map(row => (
            <OrderRowDesktop
              key={row.orderId}
              row={row}
              folder={folder}
              onOpenOrder={onOpenOrder}
              onClose={onClose}
              onPickMaster={onPickMaster}
              onUnassign={onUnassign}
              onTogglePaid={onTogglePaid}
              onPartialPayment={onPartialPayment}
              onReturnToPool={onReturnToPool}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}


// ─── Desktop row ─────────────────────────────────────────────────────────────

interface RowProps {
  row: TableRow;
  folder: FolderKey;
  onOpenOrder: (orderId: number) => void;
  onClose: (row: TableRow) => void;
  onPickMaster: (row: TableRow) => void;
  onUnassign: (row: TableRow) => void;
  onTogglePaid: (row: TableRow, paid: boolean) => void;
  onPartialPayment: (row: TableRow) => void;
  onReturnToPool: (row: TableRow) => void;
}

function OrderRowDesktop({ row, folder, onOpenOrder, onClose, onPickMaster, onUnassign, onTogglePaid, onPartialPayment, onReturnToPool }: RowProps) {
  const isToken = (row.paymentModel ?? "commission") === "token";
  const dt = row.createdAt ? new Date(row.createdAt) : null;
  const dateLabel = dt ? dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }) : "";
  const isCompleted = row.status === "completed";
  const isCancelled = row.status === "cancelled";
  const isActive = !isCompleted && !isCancelled;

  return (
    <tr
      onClick={() => onOpenOrder(row.orderId)}
      className={`cursor-pointer transition-colors ${
        row.isProblem ? "bg-red-50/40 hover:bg-red-50/60"
        : isToken ? "bg-emerald-50/20 hover:bg-emerald-50/40"
        : "hover:bg-slate-50/60"
      }`}
    >
      {/* Color stripe */}
      <td className={`w-1 p-0 ${
        row.isProblem ? "bg-red-400"
        : row.columnKey === "commission_left" ? "bg-amber-400"
        : row.columnKey === "estimate_paid" ? "bg-emerald-400"
        : row.columnKey === "no_estimate" ? "bg-violet-400"
        : row.columnKey === "estimate_unpaid" ? "bg-yellow-400"
        : row.columnKey === "waiting_master" ? "bg-orange-400"
        : row.columnKey === "new" ? "bg-blue-400"
        : row.columnKey === "closed_24h" ? "bg-slate-300"
        : "bg-transparent"
      }`}></td>

      {/* ID + Date */}
      <td className="px-3 py-2.5">
        <div className="font-mono font-bold text-foreground">#{row.orderId}</div>
        <div className="text-[10px] text-muted-foreground">{dateLabel}</div>
        {isToken ? (
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 mt-0.5 rounded text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Diamond className="w-2 h-2" /> {row.tokensCharged ?? 0}т
          </span>
        ) : null}
      </td>

      {/* Service + Location */}
      <td className="px-3 py-2.5">
        <div className="text-sm font-medium text-foreground">{row.serviceType ?? "—"}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {row.city}{row.district ? `, ${row.district}` : ""}
        </div>
      </td>

      {/* Client */}
      <td className="px-3 py-2.5">
        {row.clientName && <div className="text-sm font-medium text-foreground">{row.clientName}</div>}
        {row.clientPhone && (
          <a href={`tel:${row.clientPhone}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline">
            {row.clientPhone}
          </a>
        )}
      </td>

      {/* Master */}
      <td className="px-3 py-2.5">
        {row.master ? (
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-foreground">{row.master}</div>
            <div className="flex items-center gap-1 flex-wrap">
              {row.masterCity && (
                <span className="text-[10px] text-muted-foreground">{row.masterCity}</span>
              )}
              {row.masterDebt > 0 && (
                <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-red-50 text-red-700 border border-red-200" title={`Долг: ${fmtMoney(row.masterDebt)}`}>
                  ⚠ {fmtMoney(row.masterDebt)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">не назначен</span>
        )}
      </td>

      {/* Sum */}
      <td className="px-3 py-2.5">
        {row.commission?.orderTotal ? (
          <div className="text-sm font-bold text-foreground">{fmtMoney(row.commission.orderTotal)}</div>
        ) : row.money?.amount ? (
          <div className="text-sm text-amber-700">{fmtMoney(row.money.amount)}</div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Commission */}
      <td className="px-3 py-2.5 min-w-[140px]">
        {row.commission && row.commission.total > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className={row.commissionLeft === 0 ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>
                {row.commissionLeft === 0 ? "оплачено" : `остаток ${fmtMoney(row.commissionLeft)}`}
              </span>
              <span className="text-muted-foreground">{fmtMoney(row.commission.total)}</span>
            </div>
            <Progress value={row.commission.total > 0 ? Math.round((row.commission.paid / row.commission.total) * 100) : 0} className="h-1" />
            {(folder === "pending_payment" || folder === "in_progress") && row.commission.total > 0 && (
              <label
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={!!row.commissionPaid}
                  onChange={e => onTogglePaid(row, e.target.checked)}
                  className="w-3 h-3 rounded border-border accent-emerald-600"
                />
                Отметка: оплачено
              </label>
            )}
          </div>
        ) : isToken ? (
          <span className="text-[11px] text-emerald-700 font-medium">токены списаны</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Time */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 text-xs">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className={
            row.ageMs > 24 * 3_600_000 ? "text-red-600 font-medium"
            : row.ageMs > 60 * 60 * 1000 ? "text-amber-600 font-medium"
            : "text-emerald-600"
          }>
            {row.timeInStage}
          </span>
        </div>
        {row.problemReason && (
          <div className="text-[10px] text-red-600 mt-0.5 truncate max-w-[140px]" title={row.problemReason}>
            {row.problemReason}
          </div>
        )}
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5 pr-4 text-right" onClick={e => e.stopPropagation()}>
        <div className="inline-flex items-center gap-1">
          {isActive && row.commissionLeft > 0 && (
            <button
              onClick={() => onPartialPayment(row)}
              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
              title="Частичная оплата"
            >
              <Banknote className="w-3.5 h-3.5" />
            </button>
          )}
          {(folder === "in_progress" || folder === "pending_payment") && (
            <button
              onClick={() => onClose(row)}
              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
              title="Закрыть заказ"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
          )}
          {row.masterId && (folder === "in_progress" || folder === "waiting_master") && (
            <button
              onClick={() => onPickMaster(row)}
              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
              title="Сменить мастера"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          )}
          {!row.masterId && folder === "waiting_master" && (
            <button
              onClick={() => onPickMaster(row)}
              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
              title="Назначить мастера"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          )}
          {row.masterId && folder === "in_progress" && (
            <button
              onClick={() => onUnassign(row)}
              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              title="Снять мастера"
            >
              <UserMinus className="w-3.5 h-3.5" />
            </button>
          )}
          {(row.columnKey === "problem" || row.columnKey === "waiting_master") && (
            <button
              onClick={() => onReturnToPool(row)}
              className="p-1.5 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors"
              title="Вернуть в пул"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Mobile card ─────────────────────────────────────────────────────────────

function OrderCardMobile({ row, folder, onOpenOrder, onClose, onPickMaster, onUnassign, onTogglePaid, onPartialPayment, onReturnToPool }: RowProps) {
  const isToken = (row.paymentModel ?? "commission") === "token";
  const isActive = row.status !== "completed" && row.status !== "cancelled";

  return (
    <div
      onClick={() => onOpenOrder(row.orderId)}
      className={`p-4 cursor-pointer ${
        row.isProblem ? "bg-red-50/40" : isToken ? "bg-emerald-50/20" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-mono font-bold text-foreground">#{row.orderId}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{row.serviceType} · {row.city}</div>
        </div>
        {row.isProblem && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 border border-red-200">
            <AlertTriangle className="w-3 h-3" /> проблема
          </span>
        )}
      </div>

      {row.clientName && (
        <div className="text-sm">
          <span className="font-medium">{row.clientName}</span>
          {row.clientPhone && <a href={`tel:${row.clientPhone}`} onClick={e => e.stopPropagation()} className="ml-2 text-xs text-blue-600">{row.clientPhone}</a>}
        </div>
      )}

      <div className="text-sm text-muted-foreground mt-1">
        Мастер: <span className="text-foreground font-medium">{row.master ?? "не назначен"}</span>
        {row.masterDebt > 0 && <span className="ml-1.5 text-xs text-red-600">долг {fmtMoney(row.masterDebt)}</span>}
      </div>

      {row.commission && row.commission.total > 0 && !isToken && (
        <div className="mt-2 bg-slate-50 rounded-lg p-2">
          <div className="flex justify-between text-xs">
            <span className="font-medium">{fmtMoney(row.commission.orderTotal)}</span>
            <span className={row.commissionLeft === 0 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
              {row.commissionLeft === 0 ? "✓ оплачено" : `остаток ${fmtMoney(row.commissionLeft)}`}
            </span>
          </div>
          <Progress value={row.commission.total > 0 ? Math.round((row.commission.paid / row.commission.total) * 100) : 0} className="h-1 mt-1" />
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap" onClick={e => e.stopPropagation()}>
        {isActive && row.commissionLeft > 0 && (
          <Button size="sm" variant="outline" onClick={() => onPartialPayment(row)}>
            <Banknote className="w-3 h-3 mr-1" /> Оплата
          </Button>
        )}
        {(folder === "in_progress" || folder === "pending_payment") && (
          <Button size="sm" variant="outline" onClick={() => onClose(row)}>
            <CheckCircle2 className="w-3 h-3 mr-1" /> Закрыть
          </Button>
        )}
        {((row.masterId && folder === "in_progress") || folder === "waiting_master") && (
          <Button size="sm" variant="outline" onClick={() => onPickMaster(row)}>
            <UserPlus className="w-3 h-3 mr-1" /> {row.masterId ? "Сменить" : "Назначить"}
          </Button>
        )}
        {row.masterId && folder === "in_progress" && (
          <Button size="sm" variant="outline" className="text-red-600" onClick={() => onUnassign(row)}>
            <UserMinus className="w-3 h-3 mr-1" /> Снять
          </Button>
        )}
        {(row.columnKey === "problem" || row.columnKey === "waiting_master") && (
          <Button size="sm" variant="outline" className="text-orange-600" onClick={() => onReturnToPool(row)}>
            <RefreshCw className="w-3 h-3 mr-1" /> В пул
          </Button>
        )}
      </div>
    </div>
  );
}
