// /components/work-board-table.tsx — табличный интерфейс для контроля комиссий и оперативного управления заказами
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  getPaginationRowModel,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle, Bell, Bot, CheckCircle2, ChevronDown, ChevronUp,
  Clock, Filter, Inbox, MapPin, Radio, RefreshCw, Search,
  TrendingUp, User, Wallet, ArrowUpDown, MoreHorizontal,
  Circle, CircleDot, ArrowRight, Diamond, Banknote,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── Types (match backend TableRow) ───────────────────────────────────────────

type ColumnKey =
  | "new"
  | "waiting_master"
  | "no_estimate"
  | "estimate_unpaid"
  | "estimate_paid"
  | "commission_left"
  | "closed_24h"
  | "problem";

type BotTone = "ok" | "warn" | "bad";
type BadgeTone = "ok" | "warn" | "bad" | "info";

interface Card {
  id: string;
  orderId: number;
  leadId: number | null;
  title: string;
  address: string;
  master: string | null;
  masterId: number | null;
  timeInStage: string;
  ageMs: number;
  money?: { kind: "estimate" | "paid" | "commission"; amount: number; tier?: "fixed" | "percent" };
  commission?: {
    orderTotal: number;
    total: number;
    paid: number;
    left: number;
    tier: "fixed" | "percent";
    prepaymentDeducted?: number;
    totalPartialPaid?: number;
    partialPayments?: { id: number; amount: number; note: string | null; paidAt: string }[];
  };
  bot?: { action: string; eta: string; tone: BotTone };
  badge?: { text: string; tone: BadgeTone };
  status: string;
  problemReason?: string;
  responseCount?: number;
  paymentModel?: string;
}

export interface TableRowData extends Card {
  masterDebt: number;
  commissionLeft: number;
  isProblem: boolean;
  columnKey: ColumnKey;
  clientName?: string;
  clientPhone?: string;
  clientDistrict?: string;
  serviceType?: string;
  paymentModel?: string;
  tokensCharged?: number;
}

interface TableResponse {
  rows: TableRowData[];
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

// ── Visual constants ──────────────────────────────────────────────────────────

const COLUMN_STYLE: Record<ColumnKey, { accent: string; bg: string; text: string }> = {
  new:             { accent: "#60a5fa", bg: "rgba(219,234,254,0.2)", text: "#1d4ed8" },
  waiting_master:  { accent: "#fb923c", bg: "rgba(255,237,213,0.2)", text: "#c2410c" },
  no_estimate:     { accent: "#a78bfa", bg: "rgba(237,233,254,0.2)", text: "#5b21b6" },
  estimate_unpaid: { accent: "#fbbf24", bg: "rgba(254,243,199,0.2)", text: "#92400e" },
  estimate_paid:   { accent: "#34d399", bg: "rgba(209,250,229,0.2)", text: "#065f46" },
  commission_left: { accent: "#2dd4bf", bg: "rgba(204,251,241,0.2)", text: "#0f766e" },
  closed_24h:      { accent: "#94a3b8", bg: "rgba(241,245,249,0.2)", text: "#475569" },
  problem:         { accent: "#f87171", bg: "rgba(254,226,226,0.2)", text: "#b91c1c" },
};

const BADGE_TONE: Record<BadgeTone, string> = {
  ok:   "bg-emerald-100 text-emerald-800 border-emerald-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  bad:  "bg-red-100 text-red-800 border-red-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
};

const BOT_TONE: Record<BotTone, string> = {
  ok:   "bg-slate-100 text-slate-700 border-slate-200",
  warn: "bg-amber-100 text-amber-800 border-amber-200",
  bad:  "bg-red-100 text-red-800 border-red-200",
};

const fmtMoney = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";

const formatTimeCriticality = (ageMs: number): { color: string; label: string } => {
  if (ageMs < 60 * 60 * 1000) return { color: "text-emerald-600", label: "норма" };
  if (ageMs < 24 * 60 * 60 * 1000) return { color: "text-amber-600", label: "давно" };
  return { color: "text-red-600", label: "очень давно" };
};

function formatTimeAgo(ms: number): string {
  if (ms < 60_000) return "<1 мин";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч ${m % 60}м`;
  const d = Math.floor(h / 24);
  const remainingH = h % 24;
  const remainingM = m % 60;
  if (remainingH === 0 && remainingM === 0) return `${d}д`;
  if (remainingH === 0) return `${d}д ${remainingM}м`;
  return `${d}д ${remainingH}ч`;
}

// ── Helper components ────────────────────────────────────────────────────────

function StatusBadge({ columnKey }: { columnKey: ColumnKey }) {
  const style = COLUMN_STYLE[columnKey];
  const labels: Record<ColumnKey, string> = {
    new: "🆕 Новые",
    waiting_master: "📡 Ждут мастера",
    no_estimate: "📋 Без сметы",
    estimate_unpaid: "💰 Смета + ждём оплату",
    estimate_paid: "✅ Смета оплачена",
    commission_left: "🪙 С остатком комиссии",
    closed_24h: "🏁 Закрыто 24ч",
    problem: "🚨 Проблема",
  };
  return (
    <Badge variant="outline" className="text-xs font-medium" style={{ borderColor: style.accent, color: style.text }}>
      {labels[columnKey]}
    </Badge>
  );
}

function CommissionProgress({ commission }: { commission: TableRowData['commission'] }) {
  if (!commission) return null;
  const percent = commission.total > 0 ? Math.round((commission.paid / commission.total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">{fmtMoney(commission.paid)}</span>
        <span className="text-slate-500">{fmtMoney(commission.total)}</span>
      </div>
      <Progress value={percent} className="h-1.5" />
      <div className="flex justify-between text-xs">
        <span className={commission.left === 0 ? "text-emerald-600 font-medium" : "text-amber-600"}>
          {commission.left === 0 ? "оплачено" : `остаток ${fmtMoney(commission.left)}`}
        </span>
        <span className="text-slate-500">{percent}%</span>
      </div>
    </div>
  );
}

function MasterWithDebt({ master, masterDebt }: { master: string | null; masterDebt: number }) {
  if (!master) return <span className="text-slate-400">не назначен</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="font-medium">{master}</div>
      {masterDebt > 0 && (
        <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200" title={`Общий долг: ${fmtMoney(masterDebt)}`}>
          ⚠️ долг
        </span>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function WorkBoardTable({ onOpenOrder }: { onOpenOrder: (orderId: number) => void }) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State for table
  const [sorting, setSorting] = useState<SortingState>([{ id: "ageMs", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [paymentModelFilter, setPaymentModelFilter] = useState<string>("all");
  const [columnVisibility, setColumnVisibility] = useState({ problemReason: false });
  
  // Query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: String(pagination.pageIndex + 1),
      limit: String(pagination.pageSize),
      sortBy: sorting[0]?.id || "commissionLeft",
      sortDir: sorting[0]?.desc ? "desc" : "asc",
    });
    if (globalFilter) params.set("search", globalFilter);
    // Add column filters
    columnFilters.forEach(filter => {
      if (filter.id === "status" && Array.isArray(filter.value)) {
        params.set("status", filter.value.join(","));
      }
      if (filter.id === "hasCommissionLeft" && filter.value === true) {
        params.set("hasCommissionLeft", "true");
      }
      if (filter.id === "problemOnly" && filter.value === true) {
        params.set("problemOnly", "true");
      }
    });
    return params.toString();
  }, [pagination, sorting, columnFilters, globalFilter]);

  // Fetch table data
  const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery<TableResponse>({
    queryKey: ["/api/work-board/table", queryParams],
    queryFn: async () => {
      const r = await fetch(`/api/work-board/table?${queryParams}`, { credentials: "include" });
      if (!r.ok) {
        const text = await r.text();
        let errorMsg = "Не удалось загрузить таблицу";
        try {
          const json = JSON.parse(text);
          errorMsg = json.error || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }
      return r.json();
    },
    refetchInterval: 15_000,
  });

  const enrichedData = useMemo(() => {
    if (!data) return null;
    let rows = data.rows;
    if (paymentModelFilter !== "all") {
      rows = rows.filter(row => (row.paymentModel || "commission") === paymentModelFilter);
    }
    return {
      ...data,
      rows,
      total: rows.length,
    };
  }, [data, paymentModelFilter]);

  // SSE for live updates
  useEffect(() => {
    const es = new EventSource("/api/work-board/table/stream", { withCredentials: true });
    const onAny = () => queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
    es.addEventListener("tick", onAny);
    es.addEventListener("changed", onAny);
    es.onerror = () => { /* auto-reconnect */ };
    return () => es.close();
  }, [queryClient]);

  // Mutations for actions
  const returnToPool = useMutation<{ok: boolean}, Error, number>({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/work-board/return-to-pool/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmed: true }),
      });
      if (!r.ok) {
        const text = await r.text();
        let errorMsg = "Ошибка";
        try {
          const json = JSON.parse(text);
          errorMsg = json.error || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Заявка возвращена в пул" });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (e: unknown) => toast({
      title: "Не удалось вернуть",
      description: e instanceof Error ? e.message : String(e),
      variant: "destructive",
    }),
  });

  const partialPayment = useMutation<{ok: boolean; payment: any}, Error, {orderId: number; amount: number; note?: string}>({
    mutationFn: async ({ orderId, amount, note }) => {
      const r = await fetch(`/api/work-board/orders/${orderId}/partial-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, note }),
      });
      if (!r.ok) {
        const text = await r.text();
        let errorMsg = "Ошибка";
        try {
          const json = JSON.parse(text);
          errorMsg = json.error || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: `Оплата ${fmtMoney(data.payment.amount)} принята` });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board"] });
    },
    onError: (e: unknown) => toast({
      title: "Не удалось принять оплату",
      description: e instanceof Error ? e.message : String(e),
      variant: "destructive",
    }),
  });

  // Table columns definition
  const columns = useMemo<ColumnDef<TableRowData>[]>(
    () => [
      {
        accessorKey: "orderId",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}
                  className="font-semibold -ml-4">
            № заказа
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <Button variant="link" className="font-mono font-bold p-0 h-auto" onClick={() => onOpenOrder(row.original.orderId)}>
              #{row.original.orderId}
            </Button>
            {(row.original.paymentModel || "token") === "token" ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
                <Diamond className="w-2.5 h-2.5 mr-0.5" /> Токены
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200 w-fit">
                <Banknote className="w-2.5 h-2.5 mr-0.5" /> Комиссия
              </span>
            )}
          </div>
        ),
        size: 80,
      },
      {
        accessorKey: "columnKey",
        header: "Статус",
        cell: ({ row }) => <StatusBadge columnKey={row.original.columnKey} />,
        filterFn: (row, columnId, filterValue) => {
          if (!filterValue || filterValue.length === 0) return true;
          return filterValue.includes(row.original.columnKey);
        },
        size: 140,
      },
      {
        accessorKey: "clientName",
        header: "Клиент",
        cell: ({ row }) => {
          const name = row.original.clientName || "—";
          const phone = row.original.clientPhone;
          return (
            <div className="space-y-0.5">
              <div className="font-medium text-sm">{name}</div>
              {phone && <a href={`tel:${phone}`} className="text-xs text-blue-600 hover:underline">{phone}</a>}
            </div>
          );
        },
        size: 160,
      },
      {
        accessorKey: "address",
        header: "Адрес",
        cell: ({ row }) => (
          <div className="text-sm text-foreground truncate max-w-[160px]" title={row.original.address}>
            {row.original.address || "—"}
          </div>
        ),
        size: 160,
      },
      {
        accessorKey: "master",
        header: "Мастер",
        cell: ({ row }) => (
          <MasterWithDebt master={row.original.master} masterDebt={row.original.masterDebt} />
        ),
        size: 180,
      },
      {
        accessorKey: "commission.orderTotal",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}
                  className="font-semibold">
            Сумма
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const isToken = (row.original.paymentModel || "token") === "token";
          if (isToken) {
            return (
              <div className="font-bold flex items-center gap-1 text-emerald-700">
                <Diamond className="w-3 h-3" />
                {row.original.tokensCharged ?? 0} т
              </div>
            );
          }
          const total = row.original.commission?.orderTotal || row.original.money?.amount || 0;
          return <div className="font-bold">{fmtMoney(total)}</div>;
        },
        size: 120,
      },
      {
        accessorKey: "commissionLeft",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}
                  className="font-semibold">
            Остаток
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const isToken = (row.original.paymentModel || "token") === "token";
          if (isToken) {
            return (
              <div className="text-emerald-600 font-bold">
                0 т
              </div>
            );
          }
          const left = row.original.commissionLeft;
          return (
            <div className={left === 0 ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
              {fmtMoney(left)}
            </div>
          );
        },
        filterFn: (row, columnId, filterValue) => {
          if (filterValue === undefined) return true;
          return filterValue ? row.original.commissionLeft > 0 : row.original.commissionLeft === 0;
        },
        size: 120,
      },
      {
        accessorKey: "timeInStage",
        header: ({ column }) => (
          <Button variant="ghost" size="sm" onClick={() => column.toggleSorting()}
                  className="font-semibold">
            <Clock className="mr-2 h-3 w-3" />
            Время
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const criticality = formatTimeCriticality(row.original.ageMs);
          return (
            <div className="flex items-center gap-2">
              <span className={criticality.color}>{formatTimeAgo(row.original.ageMs)}</span>
              <span className="text-xs text-slate-400">{criticality.label}</span>
            </div>
          );
        },
        size: 140,
      },
      {
        accessorKey: "problemReason",
        header: "Проблема",
        cell: ({ row }) => {
          if (!row.original.problemReason) return null;
          return (
            <div className="flex items-center gap-1 text-sm text-red-700">
              <AlertTriangle className="h-3 w-3" />
              <span className="truncate">{row.original.problemReason}</span>
            </div>
          );
        },
        filterFn: (row, columnId, filterValue) => {
          if (filterValue === undefined) return true;
          return filterValue ? !!row.original.problemReason : !row.original.problemReason;
        },
        size: 200,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const isReturnable = row.original.columnKey === "problem" || row.original.columnKey === "waiting_master";
          const hasCommissionLeft = row.original.commissionLeft > 0;
          return (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Открыть детали" onClick={() => onOpenOrder(row.original.orderId)}>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              </Button>
              {isReturnable && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Вернуть в пул" onClick={() => returnToPool.mutate(row.original.orderId)} disabled={returnToPool.isPending}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
              {hasCommissionLeft && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Частичная оплата" onClick={() => {
                  const input = window.prompt(`Сумма оплаты (остаток ${fmtMoney(row.original.commissionLeft)}):`, String(row.original.commissionLeft));
                  if (input === null) return;
                  const amount = parseFloat(input.replace(/[^0-9.]/g, ""));
                  if (!amount || amount <= 0 || amount > row.original.commissionLeft + 0.01) { alert("Некорректная сумма"); return; }
                  if (confirm(`Принять оплату ${fmtMoney(amount)} по заказу #${row.original.orderId}?`)) {
                    partialPayment.mutate({ orderId: row.original.orderId, amount });
                  }
                }}>
                  <Banknote className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
        size: 80,
      },
    ],
    [onOpenOrder, returnToPool, partialPayment]
  );

  // Table instance
  const table = useReactTable<TableRowData>({
    data: enrichedData?.rows || [],
    columns,
    state: { sorting, columnFilters, globalFilter, pagination, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    pageCount: enrichedData ? Math.ceil(enrichedData.total / pagination.pageSize) : -1,
  });

  // Container ref for scrolling
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Funnel metrics
  const f = data?.funnel;
  const updatedAgo = useMemo(() => {
    if (!dataUpdatedAt) return "—";
    const sec = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));
    if (sec < 60) return `${sec}с назад`;
    return `${Math.floor(sec / 60)}м назад`;
  }, [dataUpdatedAt]);

  // Mobile view: compact cards
  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* Funnel header */}
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Активных</div>
              <div className="text-xl font-bold">{f?.activeCount ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Остаток комиссии</div>
              <div className="text-xl font-bold text-red-600">
                {f ? fmtMoney(f.sumInWork) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Оплачено</div>
              <div className="text-xl font-bold text-emerald-600">
                {f ? fmtMoney(f?.sumPaid) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Проблемы</div>
              <div className="text-xl font-bold text-red-600">
                {f?.problemCount ?? 0}
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
            <span>обновлено {updatedAgo}</span>
            <button onClick={() => refetch()} disabled={isLoading} className="flex items-center gap-1">
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
              Обновить
            </button>
          </div>
        </div>

        {/* Search and filters */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Поиск по №, адресу, мастеру..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {/* Payment model tabs mobile */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-0.5 flex-shrink-0">
            {([
              { key: "all" as string, label: "Все", icon: undefined },
              { key: "token" as string, label: "Токены", icon: Diamond },
              { key: "commission" as string, label: "Комиссия", icon: Banknote },
            ]).map(t => {
              const isActive = paymentModelFilter === t.key;
              const count = t.key === "all" ? (enrichedData?.rows.length ?? data?.total ?? 0)
                : enrichedData?.rows.filter(r => (r.paymentModel || "token") === t.key).length ?? 0;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setPaymentModelFilter(t.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-white text-foreground shadow-sm ring-1 ring-black/5"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  <span>{t.label}</span>
                  <span className={`ml-0.5 text-[10px] ${isActive ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <Button variant="outline" size="sm" onClick={() => {
            setColumnFilters(prev => prev.filter(f => f.id !== "hasCommissionLeft"));
            setColumnFilters(prev => [...prev, { id: "hasCommissionLeft", value: true }]);
          }}>
            С остатком
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            setColumnFilters(prev => prev.filter(f => f.id !== "problemOnly"));
            setColumnFilters(prev => [...prev, { id: "problemOnly", value: true }]);
          }}>
            Проблемы
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setColumnFilters([]); setPaymentModelFilter("all"); }}>
            Сбросить
          </Button>
        </div>

        {/* Mobile cards */}
        {error && (
          <div className="text-center py-8 text-red-600">
            Ошибка загрузки: {error instanceof Error ? error.message : String(error)}
          </div>
        )}
        {isLoading && !data && (
          <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
        )}
        {!isLoading && enrichedData && enrichedData.rows.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Заявок не найдено
          </div>
        )}
        {enrichedData?.rows.map(row => (
          <div key={row.id} className={`bg-card border ${(row.paymentModel || "token") === "token" ? "border-l-4 border-l-emerald-400 border-emerald-200" : "border-border"} rounded-xl p-4 space-y-3`}>
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-0.5">
                <Button variant="link" className="p-0 font-bold h-auto" onClick={() => onOpenOrder(row.orderId)}>
                  #{row.orderId}
                </Button>
                {(row.paymentModel || "token") === "token" ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
                    <Diamond className="w-2.5 h-2.5 mr-0.5" /> Токены
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200 w-fit">
                    <Banknote className="w-2.5 h-2.5 mr-0.5" /> Комиссия
                  </span>
                )}
              </div>
              <StatusBadge columnKey={row.columnKey} />
            </div>
            <div className="space-y-2">
              {row.clientName && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{row.clientName}</span>
                  {row.clientPhone && <a href={`tel:${row.clientPhone}`} className="text-xs text-blue-600">{row.clientPhone}</a>}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{row.address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{row.master || "не назначен"}</span>
                {row.masterDebt > 0 && (
                  <span className="text-xs text-red-600">долг: {fmtMoney(row.masterDebt)}</span>
                )}
              </div>
            </div>
            {(row.paymentModel || "token") === "token" ? (
              <div className="bg-emerald-50 rounded-lg p-3">
                <div className="flex justify-between text-sm font-bold text-emerald-800">
                  <span className="flex items-center gap-1">
                    <Diamond className="w-3 h-3" /> Стоимость: {row.tokensCharged ?? 0} т
                  </span>
                  <span>Списано</span>
                </div>
              </div>
            ) : row.commission && (
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex justify-between text-sm font-bold">
                  <span>Сумма: {fmtMoney(row.commission.orderTotal)}</span>
                  <span className={row.commissionLeft === 0 ? "text-emerald-600" : "text-red-600"}>
                    Остаток: {fmtMoney(row.commissionLeft)}
                  </span>
                </div>
                <Progress value={row.commission.total > 0 ? (row.commission.paid / row.commission.total) * 100 : 0} className="mt-2" />
                <div className="text-xs text-slate-500 mt-1">
                  {row.commission.paid} / {row.commission.total} ₽ ({row.commission.tier === "fixed" ? "фикс 5к" : "15%"})
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatTimeAgo(row.ageMs)}</span>
              </div>
              <div className="flex gap-2">
                {(row.columnKey === "problem" || row.columnKey === "waiting_master") && (
                  <Button variant="outline" size="sm" onClick={() => returnToPool.mutate(row.orderId)}>
                    ↩️ Вернуть
                  </Button>
                )}
                {(row.paymentModel || "token") !== "token" && row.commissionLeft > 0 && (
                  <Button variant="default" size="sm" onClick={() => {
                    const input = window.prompt(`Сумма оплаты (остаток ${fmtMoney(row.commissionLeft)}):`, String(row.commissionLeft));
                    if (input === null) return;
                    const amount = parseFloat(input.replace(/[^0-9.]/g, ""));
                    if (!amount || amount <= 0 || amount > row.commissionLeft + 0.01) { alert("Некорректная сумма"); return; }
                    if (confirm(`Принять оплату ${fmtMoney(amount)} по заказу #${row.orderId}?`)) {
                      partialPayment.mutate({ orderId: row.orderId, amount });
                    }
                  }}>
                    💰 Оплата
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Desktop view: full table
  return (
    <div className="space-y-4">
      {/* Funnel header */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Активных в работе</div>
            <div className="text-2xl font-bold mt-1">{f?.activeCount ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">обновлено {updatedAgo}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Wallet className="h-3 w-3" /> в работе
            </div>
            <div className="text-xl font-bold text-violet-700 mt-1">
              {f ? fmtMoney(f.sumInWork) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">смета без оплаты + остаток комиссии</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" /> оплачено
            </div>
            <div className="text-xl font-bold text-emerald-700 mt-1">
              {f ? fmtMoney(f.sumPaid) : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              комиссия: {f ? fmtMoney(f.expectedCommission) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> доходимость
            </div>
            <div className="text-xl font-bold mt-1">{f?.conversionPct ?? 0}%</div>
            <div className="text-xs text-muted-foreground mt-1">завершено / в работе</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <AlertTriangle className={`h-3 w-3 ${(f?.problemCount ?? 0) > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              требуют тебя
            </div>
            <div className={`text-xl font-bold mt-1 ${(f?.problemCount ?? 0) > 0 ? "text-red-600" : ""}`}>
              {f?.problemCount ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">в колонке «Проблема»</div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-emerald-700 border border-emerald-200 bg-emerald-50/80 rounded-lg px-2 py-1">
              <Radio className="h-3 w-3" /> live · SSE
            </div>
            <span className="text-xs text-muted-foreground">
              {data?.total ?? 0} заявок, стр. {data?.page ?? 1} из {data ? Math.ceil(data.total / pagination.pageSize) : 0}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-3 w-3 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Поиск по №, адресу, мастеру, клиенту..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Payment model tabs */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-0.5">
            {([
              { key: "all" as string, label: "Все", icon: undefined },
              { key: "token" as string, label: "Токены", icon: Diamond },
              { key: "commission" as string, label: "Комиссия", icon: Banknote },
            ]).map(t => {
              const isActive = paymentModelFilter === t.key;
              const count = t.key === "all" ? (enrichedData?.rows.length ?? data?.total ?? 0)
                : enrichedData?.rows.filter(r => (r.paymentModel || "token") === t.key).length ?? 0;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setPaymentModelFilter(t.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-white text-foreground shadow-sm ring-1 ring-black/5"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  <span>{t.label}</span>
                  <span className={`ml-0.5 text-[10px] ${isActive ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="h-4 w-px bg-border/50" />

          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            className="bg-background border border-input rounded-md px-3 py-1 text-sm"
            value={(columnFilters.find(f => f.id === "status")?.value as string[] | undefined)?.join(",") || ""}
            onChange={e => {
              const value = e.target.value;
              setColumnFilters(prev => [
                ...prev.filter(f => f.id !== "status"),
                ...(value ? [{ id: "status", value: value.split(",").filter(Boolean) }] : []),
              ]);
            }}
          >
            <option value="">Все статусы</option>
            <option value="problem">Проблема</option>
            <option value="commission_left">С остатком комиссии</option>
            <option value="estimate_paid">Смета оплачена</option>
            <option value="estimate_unpaid">Смета + ждём оплату</option>
            <option value="no_estimate">Без сметы</option>
            <option value="waiting_master">Ждут мастера</option>
            <option value="new">Новые</option>
            <option value="closed_24h">Закрыто 24ч</option>
          </select>
          <Button
            variant={columnFilters.find(f => f.id === "hasCommissionLeft") ? "default" : "outline"}
            size="sm"
            onClick={() => {
              const current = columnFilters.find(f => f.id === "hasCommissionLeft");
              setColumnFilters(prev => [
                ...prev.filter(f => f.id !== "hasCommissionLeft"),
                ...(!current ? [{ id: "hasCommissionLeft", value: true }] : []),
              ]);
            }}
          >
            Только с остатком
          </Button>
          <Button
            variant={columnFilters.find(f => f.id === "problemOnly") ? "default" : "outline"}
            size="sm"
            onClick={() => {
              const current = columnFilters.find(f => f.id === "problemOnly");
              setColumnFilters(prev => [
                ...prev.filter(f => f.id !== "problemOnly"),
                ...(!current ? [{ id: "problemOnly", value: true }] : []),
              ]);
            }}
          >
            Только проблемы
          </Button>
          <Button variant="ghost" size="sm" onClick={() => {
            setColumnFilters([]);
            setGlobalFilter("");
          }}>
            Сбросить
          </Button>
          <div className="h-4 w-px bg-border/50" />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-3 w-3 mr-1" /> Колонки
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllLeafColumns().map(column => {
                if (column.id === "actions") return null;
                return (
                  <DropdownMenuItem key={column.id} onSelect={(e) => e.preventDefault()} onClick={column.getToggleVisibilityHandler()} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={column.getIsVisible()} readOnly className="w-3.5 h-3.5 rounded border-border accent-primary" />
                    <span className="text-sm">{typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="text-center py-12 text-red-600">
          Ошибка загрузки: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : (
        <div ref={tableContainerRef} className="border border-border rounded-xl overflow-auto max-h-[calc(100vh-300px)]">
          <Table>
            <TableHeader className="bg-slate-50/50 sticky top-0 z-10">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id} style={{ width: header.getSize() }}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {isLoading ? "Загрузка..." : "Заявок не найдено"}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map(row => {
                  const isToken = (row.original.paymentModel || "token") === "token";
                  return (
                    <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}
                             className={`${row.original.isProblem ? "bg-red-50/60 hover:bg-red-50/80" : isToken ? "bg-emerald-50/20 hover:bg-emerald-50/40" : ""}`}>
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Показано {table.getRowModel().rows.length} из {data?.total ?? 0} заявок
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Назад
          </Button>
          <span className="text-sm">
            Страница {table.getState().pagination.pageIndex + 1} из {table.getPageCount()}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Вперед
          </Button>
          <select
            className="bg-background border border-input rounded-md px-2 py-1 text-sm"
            value={table.getState().pagination.pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
          >
            {[25, 50, 100, 200].map(pageSize => (
              <option key={pageSize} value={pageSize}>
                {pageSize} строк
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="text-xs text-muted-foreground flex items-center gap-4">
        <Bell className="h-3 w-3" />
        <span>Сортировка по умолчанию: «Остаток» (убывание) → «Время» (возрастание)</span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          Красный — остаток комиссии
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          Зелёный — комиссия оплачена
        </span>
      </div>
    </div>
  );
}