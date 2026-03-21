import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useGetOrders, OrderStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import {
  Loader2, MapPin, Send, Users, CheckCircle2, Clock, X, UserCheck,
  DollarSign, Check, Pencil, AlertCircle, MessageSquare, Trash2, Search,
  ClipboardList, CalendarDays, ChevronDown, Filter, Settings,
} from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function resolvePhotoUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}

interface DispatchEntry {
  id: number;
  masterId: number;
  masterName: string;
  masterCity: string | null;
  status: string;
  respondedAt: string | null;
  rejectionReason: string | null;
  responseNote: string | null;
}
interface DispatchInfo {
  dispatchStatus: string;
  dispatches: DispatchEntry[];
}

function useDispatch(orderId: number | null) {
  return useQuery<DispatchInfo>({
    queryKey: ["/api/dispatch", orderId],
    queryFn: async () => {
      const r = await fetch(`/api/dispatch/${orderId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!orderId,
    refetchInterval: 5000,
  });
}

function DispatchBadge({ status }: { status: string }) {
  if (status === "none") return null;
  if (status === "dispatching")
    return <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 font-medium"><Clock className="w-3 h-3" />Разослано</span>;
  if (status === "assigned")
    return <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium"><CheckCircle2 className="w-3 h-3" />Назначен</span>;
  return null;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function Orders() {
  const [location, setLocation] = useLocation();
  const [openDispatchId, setOpenDispatchId] = useState<number | null>(null);
  const [editAmountId, setEditAmountId] = useState<number | null>(null);
  const [editAmountValue, setEditAmountValue] = useState("");
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") ?? "";
  });
  const [dateFilter, setDateFilter] = useState<"all"|"today"|"yesterday"|"week"|"month">("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const highlightId = parseInt(new URLSearchParams(window.location.search).get("highlight") ?? "") || null;
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteOrderMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/orders/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Перемещено в корзину", description: "Заказ будет удалён через 30 дней. Восстановите в разделе «Корзина»." });
    },
  });

  const openMasterChat = (masterId: number) => setLocation(`/master-chat?masterId=${masterId}`);

  const { data: orders, isLoading } = useGetOrders({}, { query: { refetchInterval: 8000 } });
  const { data: dispatchData, isLoading: dispatchLoading } = useDispatch(openDispatchId);

  const broadcastMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/dispatch/${orderId}/broadcast`, { method: "POST", credentials: "include" });
      if (!r.ok) {
        const text = await r.text();
        let msg = "Ошибка сервера";
        try { msg = JSON.parse(text).error ?? msg; } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ orderId, masterId }: { orderId: number; masterId: number }) => {
      const r = await fetch(`/api/dispatch/${orderId}/assign/${masterId}`, { method: "POST", credentials: "include" });
      if (!r.ok) {
        const text = await r.text();
        let msg = "Ошибка сервера";
        try { msg = JSON.parse(text).error ?? msg; } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] });
    },
  });

  const acceptProposedMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ acceptProposed: true }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
  });

  const setAmountMutation = useMutation({
    mutationFn: async ({ orderId, amount }: { orderId: number; amount: number }) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderAmount: amount }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setEditAmountId(null);
      setEditAmountValue("");
    },
  });

  const approveCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ approveCancellation: true }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
  });

  const rejectCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rejectCancellation: true }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
  });

  const [showManualAssign, setShowManualAssign] = useState(false);
  const [selectedMasterForAssign, setSelectedMasterForAssign] = useState<string>("");
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [unassignReason, setUnassignReason] = useState("");

  const { data: activeMasters } = useQuery<{ id: number; alias: string; city: string | null }[]>({
    queryKey: ["/api/masters"],
    queryFn: async () => {
      const r = await fetch("/api/masters", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      return (data as any[])
        .filter((m: any) => m.status === "active")
        .map(m => ({ id: m.id, alias: m.alias, city: m.city }));
    },
    staleTime: 30000,
  });

  const unassignMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: number; reason: string }) => {
      const r = await fetch(`/api/orders/${orderId}/unassign-master`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] });
      broadcastMutation.reset();
      setShowUnassignDialog(false);
      setUnassignReason("");
      toast({ title: "Мастер снят с заказа", description: "Теперь можно сделать новую рассылку" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const manualAssignMutation = useMutation({
    mutationFn: async ({ orderId, masterId }: { orderId: number; masterId: number }) => {
      const r = await fetch(`/api/orders/${orderId}/manual-assign/${masterId}`, { method: "POST", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] });
      setShowManualAssign(false);
      setSelectedMasterForAssign("");
      toast({ title: "Мастер назначен вручную" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  interface PendingDispatch {
    orderId: number;
    serviceType: string;
    city: string;
    district: string | null;
    respondentCount: number;
    respondents: { masterId: number; masterName: string; respondedAt: string | null }[];
  }

  const { data: pendingDispatches } = useQuery<PendingDispatch[]>({
    queryKey: ["/api/dispatch/pending"],
    queryFn: async () => {
      const r = await fetch("/api/dispatch/pending", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 6000,
  });

  const openOrder = openDispatchId ? orders?.find(o => o.id === openDispatchId) : null;
  const respondents = dispatchData?.dispatches.filter(d => d.status === "responded") ?? [];
  const rejectedDispatches = dispatchData?.dispatches.filter(d => d.status === "rejected") ?? [];
  const pendingDispatched = dispatchData?.dispatches.filter(d => d.status === "dispatched") ?? [];

  const pendingAmountOrders = orders?.filter(o => (o as any).proposedAmount && !(o as any).orderAmount) ?? [];
  const cancellationOrders = orders?.filter(o => o.status === "cancellation_requested" as any) ?? [];
  const pendingResponseOrders = pendingDispatches ?? [];

  const availableCities = useMemo(() => {
    if (!orders) return [];
    const cities = Array.from(new Set(orders.map(o => o.city).filter(Boolean) as string[]));
    return cities.sort((a, b) => a.localeCompare(b, "ru"));
  }, [orders]);

  const activeFilterCount = [
    dateFilter !== "all" ? 1 : 0,
    statusFilter !== "all" ? 1 : 0,
    cityFilter !== "all" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];

    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = startOfDay(now);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return orders.filter(o => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          String(o.id).includes(q) ||
          o.city?.toLowerCase().includes(q) ||
          (o as any).district?.toLowerCase().includes(q) ||
          o.serviceType?.toLowerCase().includes(q) ||
          o.masterName?.toLowerCase().includes(q) ||
          o.clientPhone?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (dateFilter !== "all") {
        const created = new Date(o.createdAt);
        if (dateFilter === "today" && created < today) return false;
        if (dateFilter === "yesterday" && (created < yesterday || created >= today)) return false;
        if (dateFilter === "week" && created < weekAgo) return false;
        if (dateFilter === "month" && created < monthStart) return false;
      }

      if (statusFilter === "active") {
        if (o.status === "cancelled" || o.status === "completed") return false;
      } else if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (cityFilter !== "all" && o.city !== cityFilter) return false;

      return true;
    });
  }, [orders, search, dateFilter, statusFilter, cityFilter]);

  return (
    <ProtectedRoute allowedRoles={['admin', 'master_operator', 'lead_operator']} permissionKey="orders">
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Буфер заказов</h1>
            <p className="text-muted-foreground mt-1">Распределение заказов по мастерам</p>
          </div>

          {/* Cancellation request banner */}
          {cancellationOrders.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-800 font-semibold text-sm mb-1">
                <AlertCircle className="w-4 h-4" />
                {cancellationOrders.length === 1
                  ? "1 запрос на отмену заказа"
                  : `${cancellationOrders.length} запроса на отмену заказа`}
              </div>
              {cancellationOrders.map(order => (
                <div key={order.id} className="bg-white rounded-xl border border-red-100 px-4 py-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                        <span className="font-medium text-foreground">#{order.id}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-foreground">{order.serviceType}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground text-xs">{order.city}</span>
                      </div>
                      {order.masterName && (
                        <button
                          onClick={() => order.masterId && openMasterChat(order.masterId)}
                          className="text-xs text-blue-600 hover:underline mt-0.5"
                        >
                          мастер {order.masterName}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {order.masterId && (
                        <button
                          onClick={() => openMasterChat(order.masterId!)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-medium text-xs transition-colors"
                        >
                          <MessageSquare className="w-3 h-3" />
                          Чат
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`Отклонить запрос на отмену заказа #${order.id}? Заказ продолжится.`)) {
                            rejectCancellationMutation.mutate(order.id);
                          }
                        }}
                        disabled={rejectCancellationMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                        Отклонить
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Одобрить отмену заказа #${order.id}? Заказ будет закрыт.`)) {
                            approveCancellationMutation.mutate(order.id);
                          }
                        }}
                        disabled={approveCancellationMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500 text-white hover:bg-red-600 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                      >
                        {approveCancellationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Одобрить отмену
                      </button>
                    </div>
                  </div>
                  {(order as any).cancelReason && (
                    <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                      <span className="font-medium">Причина: </span>{(order as any).cancelReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pending responses banner */}
          {pendingResponseOrders.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-1">
                <Users className="w-4 h-4" />
                {pendingResponseOrders.length === 1
                  ? `1 заявка — есть отклики от мастеров`
                  : `${pendingResponseOrders.length} заявки — есть отклики от мастеров`}
              </div>
              {pendingResponseOrders.map(item => (
                <div key={item.orderId} className="bg-white rounded-xl border border-blue-100 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                      <span className="font-medium text-foreground">#{item.orderId}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-foreground">{item.serviceType}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground text-xs">{item.city}{item.district ? `, ${item.district}` : ""}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
                        <UserCheck className="w-3 h-3" />
                        {item.respondentCount} {item.respondentCount === 1 ? "отклик" : item.respondentCount < 5 ? "отклика" : "откликов"}
                      </span>
                    </div>
                    <button
                      onClick={() => setOpenDispatchId(item.orderId)}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded-lg font-medium text-xs transition-colors"
                    >
                      <UserCheck className="w-3 h-3" />
                      Назначить мастера
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.respondents.map(r => (
                      <button
                        key={r.masterId}
                        onClick={() => openMasterChat(r.masterId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-medium transition-colors"
                      >
                        <MessageSquare className="w-3 h-3" />
                        {r.masterName}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Proposed amount banner */}
          {pendingAmountOrders.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
                <DollarSign className="w-4 h-4" />
                {pendingAmountOrders.length === 1
                  ? "1 заказ ожидает подтверждения суммы"
                  : `${pendingAmountOrders.length} заказа ожидают подтверждения суммы`}
              </div>
              {pendingAmountOrders.map(order => (
                <div key={order.id} className="flex items-start justify-between gap-3 bg-white rounded-xl border border-amber-100 px-4 py-3">
                  <div>
                    <span className="font-medium text-foreground">#{order.id}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="text-foreground">{order.serviceType}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span className="text-amber-700 font-semibold">{fmt(Number((order as any).proposedAmount))}</span>
                    {order.masterName && (
                      <button
                        onClick={() => order.masterId && openMasterChat(order.masterId)}
                        className="ml-2 text-xs text-blue-600 hover:underline"
                      >
                        мастер {order.masterName}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {order.masterId && (
                      <button
                        onClick={() => openMasterChat(order.masterId!)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg font-medium text-xs transition-colors"
                      >
                        <MessageSquare className="w-3 h-3" />
                        Чат
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditAmountId(order.id);
                        setEditAmountValue(String((order as any).proposedAmount ?? ""));
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-xs transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      Своя сумма
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Принять сумму ${fmt(Number((order as any).proposedAmount))} для заказа #${order.id}?`)) {
                          acceptProposedMutation.mutate(order.id);
                        }
                      }}
                      disabled={acceptProposedMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500 text-white hover:bg-amber-600 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                    >
                      {acceptProposedMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Принять
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border/50 space-y-3">
              {/* Row 1: search + counter */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Поиск: ID, город, услуга, мастер..."
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
                    onClick={() => { setDateFilter("all"); setStatusFilter("all"); setCityFilter("all"); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Сбросить ({activeFilterCount})
                  </button>
                )}
                {!isLoading && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {filteredOrders.length} {filteredOrders.length === 1 ? "заказ" : filteredOrders.length < 5 ? "заказа" : "заказов"}
                    {orders && filteredOrders.length !== orders.length && (
                      <span className="text-muted-foreground/60"> из {orders.length}</span>
                    )}
                  </span>
                )}
              </div>

              {/* Row 2: date pills + status + city */}
              <div className="flex flex-wrap items-center gap-2">
                <CalendarDays className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                {(["all","today","yesterday","week","month"] as const).map(period => {
                  const labels = { all: "Все даты", today: "Сегодня", yesterday: "Вчера", week: "7 дней", month: "Этот месяц" };
                  const active = dateFilter === period;
                  return (
                    <button
                      key={period}
                      onClick={() => setDateFilter(period)}
                      className={`px-3 py-1 rounded-xl text-xs font-medium transition-colors border ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"
                      }`}
                    >
                      {labels[period]}
                    </button>
                  );
                })}

                <div className="h-4 w-px bg-border/50 mx-1" />

                {/* Status filter */}
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className={`appearance-none pl-3 pr-7 py-1 rounded-xl text-xs font-medium border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                      statusFilter !== "active"
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"
                    }`}
                  >
                    <option value="active">Активные</option>
                    <option value="all">Все статусы</option>
                    <option value="waiting_master">Ожидает мастера</option>
                    <option value="master_assigned">Мастер назначен</option>
                    <option value="in_progress">В работе</option>
                    <option value="cancellation_requested">Запрос отмены</option>
                    <option value="completed">Завершён</option>
                    <option value="cancelled">Отменён</option>
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                </div>

                {/* City filter */}
                {availableCities.length > 1 && (
                  <div className="relative">
                    <select
                      value={cityFilter}
                      onChange={e => setCityFilter(e.target.value)}
                      className={`appearance-none pl-3 pr-7 py-1 rounded-xl text-xs font-medium border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                        cityFilter !== "all"
                          ? "bg-primary/10 border-primary/40 text-primary"
                          : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"
                      }`}
                    >
                      <option value="all">Все города</option>
                      {availableCities.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50">
                  <tr>
                    <th className="px-6 py-4">ID заказа</th>
                    <th className="px-6 py-4">Локация</th>
                    <th className="px-6 py-4">Услуга / Объем</th>
                    <th className="px-6 py-4">Статус</th>
                    <th className="px-6 py-4">Мастер</th>
                    <th className="px-6 py-4">Сумма</th>
                    <th className="px-6 py-4 text-right">Рассылка</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                        {search ? "Ничего не найдено" : "Заказов в буфере нет"}
                      </td>
                    </tr>
                  ) : filteredOrders.map((order) => {
                    const ds = (order as any).dispatchStatus ?? "none";
                    const proposed = (order as any).proposedAmount ? Number((order as any).proposedAmount) : null;
                    const confirmed = (order as any).orderAmount ? Number((order as any).orderAmount) : null;
                    const pendingResp = pendingResponseOrders.find(p => p.orderId === order.id);
                    return (
                      <tr
                        key={order.id}
                        ref={order.id === highlightId ? highlightRowRef : undefined}
                        className={`hover:bg-slate-50/50 transition-colors ${
                          order.id === highlightId
                            ? "bg-primary/5 ring-2 ring-inset ring-primary/40"
                            : proposed && !confirmed ? "bg-amber-50/30"
                            : pendingResp ? "bg-blue-50/30"
                            : ""
                        }`}
                      >
                        <td className="px-6 py-4">
                          <span className="font-medium text-foreground">#{order.id}</span>
                          <div className="text-xs text-muted-foreground mt-1">{formatDate(order.createdAt)}</div>
                          {(order as any).clientPhone && (
                            <a
                              href={`tel:${(order as any).clientPhone}`}
                              className="text-xs text-blue-600 hover:underline mt-0.5 flex items-center gap-1"
                              onClick={e => e.stopPropagation()}
                            >
                              {(order as any).clientPhone}
                            </a>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-foreground font-medium">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                            {order.city}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{order.district}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-foreground">{order.serviceType}</div>
                          <div className="text-xs text-muted-foreground mt-1">{order.area} м²</div>
                          {order.scheduledAt && (
                            <div className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              {new Date(order.scheduledAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                          {order.comment && (
                            <div className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-[180px]" title={order.comment}>
                              {order.comment}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={order.status} type="order" />
                        </td>
                        <td className="px-6 py-4">
                          {order.masterName ? (
                            <button
                              onClick={() => order.masterId && openMasterChat(order.masterId)}
                              className="font-medium text-left hover:text-blue-600 hover:underline transition-colors"
                            >
                              {order.masterName}
                            </button>
                          ) : (
                            <span className="text-muted-foreground italic">Не назначен</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {confirmed ? (
                            <div className="flex items-start gap-1">
                              <div>
                                <span className="font-semibold text-foreground">{fmt(confirmed)}</span>
                                {(order as any).commission && (
                                  <div className="text-xs text-muted-foreground mt-0.5">ком. {fmt(Number((order as any).commission))}</div>
                                )}
                              </div>
                              <button
                                onClick={() => { setEditAmountId(order.id); setEditAmountValue(String(confirmed)); }}
                                title="Изменить сумму"
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-muted-foreground/40 hover:text-primary transition-all ml-0.5"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          ) : proposed ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
                                <DollarSign className="w-3 h-3" />Предложено
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="font-semibold text-amber-700">{fmt(proposed)}</span>
                                <button
                                  onClick={() => { setEditAmountId(order.id); setEditAmountValue(String(proposed)); }}
                                  title="Указать свою сумму"
                                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-amber-100 text-amber-400 hover:text-amber-700 transition-all"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">—</span>
                              <button
                                onClick={() => { setEditAmountId(order.id); setEditAmountValue(""); }}
                                title="Указать сумму"
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 text-muted-foreground/30 hover:text-primary transition-all"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setLocation(`/tasks?newOrder=${order.id}`)}
                              title="Создать задачу по заказу"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-all"
                            >
                              <ClipboardList className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteOrderMutation.mutate(order.id)}
                              title="В корзину"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <DispatchBadge status={ds} />
                            {order.status === OrderStatus.waiting_master && ds === "none" && (
                              <button
                                onClick={() => {
                                  setOpenDispatchId(order.id);
                                  broadcastMutation.reset();
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded-lg font-medium text-xs transition-colors"
                              >
                                <Send className="w-3 h-3" /> Разослать
                              </button>
                            )}
                            {ds === "dispatching" && (
                              <button
                                onClick={() => setOpenDispatchId(order.id)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-colors ${pendingResp ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"}`}
                              >
                                <Users className="w-3 h-3" />
                                {pendingResp ? `Отклики (${pendingResp.respondentCount})` : "Отклики"}
                              </button>
                            )}
                            {(ds === "assigned" || (order.masterId && ds === "none" && order.status !== OrderStatus.waiting_master)) && (
                              <button
                                onClick={() => {
                                  setOpenDispatchId(order.id);
                                  broadcastMutation.reset();
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 rounded-lg font-medium text-xs transition-colors"
                              >
                                <Settings className="w-3 h-3" /> Управление
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Edit amount modal */}
        {editAmountId && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h2 className="font-display font-bold text-lg">Изменить сумму</h2>
                <button onClick={() => { setEditAmountId(null); setEditAmountValue(""); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Укажите итоговую стоимость заказа #{editAmountId}. Комиссия будет пересчитана автоматически.
                </p>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    value={editAmountValue}
                    onChange={e => setEditAmountValue(e.target.value)}
                    placeholder="Введите сумму..."
                    className="w-full pr-8 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₽</span>
                </div>
                {setAmountMutation.isError && (
                  <p className="text-sm text-destructive">{(setAmountMutation.error as Error).message}</p>
                )}
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => { setEditAmountId(null); setEditAmountValue(""); }}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-slate-100"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      const amt = parseFloat(editAmountValue);
                      if (!isNaN(amt) && amt > 0 && editAmountId) {
                        setAmountMutation.mutate({ orderId: editAmountId, amount: amt });
                      }
                    }}
                    disabled={setAmountMutation.isPending || !editAmountValue || parseFloat(editAmountValue) <= 0}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {setAmountMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Сохранить
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dispatch Panel */}
        {openDispatchId && openOrder && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">

              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-display font-bold text-foreground">Рассылка заявки #{openDispatchId}</h2>
                  <p className="text-sm text-muted-foreground">{openOrder.serviceType} · {openOrder.city}, {openOrder.district}</p>
                </div>
                <button onClick={() => { setOpenDispatchId(null); setShowManualAssign(false); setSelectedMasterForAssign(""); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="p-6 space-y-4">

                {((openOrder as any).dispatchStatus ?? "none") === "none" && (
                  <div className="space-y-3">
                    {(openOrder as any).cancelReason && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-amber-700">Причина снятия мастера</p>
                          <p className="text-xs text-amber-700 mt-0.5">{(openOrder as any).cancelReason}</p>
                        </div>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Заявка будет отправлена активным мастерам в городе <b>{openOrder.city}</b>. Телефон клиента скрыт — передаётся только после назначения.
                    </p>
                    {broadcastMutation.isError && (
                      <p className="text-sm text-red-500">{(broadcastMutation.error as Error).message}</p>
                    )}
                    {broadcastMutation.isSuccess && (
                      <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3 space-y-0.5">
                        <p>✅ Разослано: <b>{broadcastMutation.data?.sent}</b> мастеров</p>
                        {broadcastMutation.data?.skipped > 0 && (
                          <p className="text-muted-foreground text-xs">⏭ Пропущено {broadcastMutation.data.skipped} — достигли лимита заказов</p>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => broadcastMutation.mutate(openDispatchId)}
                      disabled={broadcastMutation.isPending || broadcastMutation.isSuccess}
                      className="w-full py-2.5 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {broadcastMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Разослать мастерам
                    </button>
                  </div>
                )}

                {((openOrder as any).dispatchStatus ?? "none") !== "none" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        Статус рассылки
                      </p>
                      {dispatchLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                    </div>

                    {/* Responded masters */}
                    {respondents.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1">
                          <Check className="w-3 h-3" /> Откликнулись ({respondents.length})
                        </p>
                        {respondents.map(d => (
                          <div key={d.id} className="p-3 bg-green-50 border border-green-100 rounded-xl space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-foreground">{d.masterName}</p>
                                {d.respondedAt && (
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(d.respondedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                )}
                              </div>
                              {(openOrder as any).dispatchStatus !== "assigned" && (
                                <button
                                  onClick={() => assignMutation.mutate({ orderId: openDispatchId, masterId: d.masterId })}
                                  disabled={assignMutation.isPending}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white hover:bg-green-600 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                                >
                                  {assignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                                  Назначить
                                </button>
                              )}
                            </div>
                            {d.responseNote && (
                              <div className="bg-white border border-green-200 rounded-lg px-3 py-2">
                                <p className="text-[10px] text-green-700 font-semibold uppercase mb-1">Предложение мастера</p>
                                <p className="text-xs text-gray-700">{d.responseNote}</p>
                              </div>
                            )}
                            <button
                              onClick={() => openMasterChat(d.masterId)}
                              className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline"
                            >
                              <MessageSquare className="w-3 h-3" /> Написать в чат
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Rejected masters */}
                    {rejectedDispatches.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-red-600 uppercase tracking-wide flex items-center gap-1">
                          <X className="w-3 h-3" /> Отказались ({rejectedDispatches.length})
                        </p>
                        {rejectedDispatches.map(d => (
                          <div key={d.id} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                            <p className="text-sm font-medium text-foreground">{d.masterName}</p>
                            {d.rejectionReason && (
                              <p className="text-xs text-red-600 mt-1">Причина: {d.rejectionReason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pending masters */}
                    {pendingDispatched.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Ожидают ответа ({pendingDispatched.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {pendingDispatched.map(d => (
                            <span key={d.id} className="text-xs bg-gray-100 text-gray-600 rounded-lg px-2 py-0.5">{d.masterName}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {respondents.length === 0 && rejectedDispatches.length === 0 && (
                      <div className="text-center py-6 text-sm text-muted-foreground">
                        <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                        Ожидаем откликов от мастеров...
                      </div>
                    )}

                    {(openOrder as any).dispatchStatus === "assigned" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                          Заявка назначена. Мастер получил контакт клиента.
                        </div>
                        <button
                          onClick={() => { setShowUnassignDialog(true); setUnassignReason(""); }}
                          disabled={unassignMutation.isPending}
                          className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {unassignMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          Снять мастера с заказа
                        </button>
                      </div>
                    )}

                    {(dispatchData?.dispatches.length ?? 0) > 0 && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">Все получившие заявку ({dispatchData?.dispatches.length})</summary>
                        <div className="mt-2 space-y-1 pl-2 border-l border-border">
                          {dispatchData?.dispatches.map(d => (
                            <div key={d.id} className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                d.status === "assigned" ? "bg-green-500"
                                : d.status === "responded" ? "bg-blue-500"
                                : d.status === "rejected" ? "bg-red-400"
                                : "bg-gray-300"
                              }`} />
                              <button
                                onClick={() => { setOpenDispatchId(null); openMasterChat(d.masterId); }}
                                className="font-medium text-foreground hover:text-blue-600 hover:underline transition-colors text-left"
                              >
                                {d.masterName}
                              </button>
                              <span className="text-muted-foreground/60">
                                {d.status === "assigned" ? "назначен"
                                : d.status === "responded" ? "откликнулся"
                                : d.status === "rejected" ? "не выбран"
                                : "ожидает"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {/* Manual assign section — always available in dispatch panel */}
                {openDispatchId && (
                  <div className="border-t border-border/50 pt-4 space-y-2">
                    {!showManualAssign ? (
                      <button
                        onClick={() => setShowManualAssign(true)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-primary border border-primary/30 rounded-xl hover:bg-primary/5 transition-colors"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Назначить мастера вручную
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Выбрать мастера</p>
                        <select
                          value={selectedMasterForAssign}
                          onChange={e => setSelectedMasterForAssign(e.target.value)}
                          className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">— Выберите мастера —</option>
                          {(activeMasters ?? [])
                            .filter(m => !openOrder || !m.city || m.city === (openOrder as any).city || true)
                            .map(m => (
                              <option key={m.id} value={String(m.id)}>
                                {m.alias}{m.city ? ` (${m.city})` : ""}
                              </option>
                            ))}
                        </select>
                        {(openOrder as any)?.masterId && selectedMasterForAssign && (
                          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            ⚠️ Текущий мастер будет заменён
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowManualAssign(false); setSelectedMasterForAssign(""); }}
                            className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-slate-50 transition-colors"
                          >
                            Отмена
                          </button>
                          <button
                            onClick={() => {
                              if (!selectedMasterForAssign) return;
                              manualAssignMutation.mutate({ orderId: openDispatchId, masterId: parseInt(selectedMasterForAssign) });
                            }}
                            disabled={!selectedMasterForAssign || manualAssignMutation.isPending}
                            className="flex-1 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                          >
                            {manualAssignMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                            Назначить
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Work photos section */}
                {(((openOrder as any).photosBefore?.length > 0) || ((openOrder as any).photosAfter?.length > 0) || (openOrder as any).photoAct) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Фото работ</p>
                    {(openOrder as any).photosBefore?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">До</p>
                        <div className="flex flex-wrap gap-2">
                          {(openOrder as any).photosBefore.map((url: string, i: number) => {
                            const src = resolvePhotoUrl(url);
                            return (
                              <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                                <img src={src} alt={`До ${i+1}`} className="w-16 h-16 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(openOrder as any).photosAfter?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">После</p>
                        <div className="flex flex-wrap gap-2">
                          {(openOrder as any).photosAfter.map((url: string, i: number) => {
                            const src = resolvePhotoUrl(url);
                            return (
                              <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                                <img src={src} alt={`После ${i+1}`} className="w-16 h-16 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(openOrder as any).photoAct && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Акт</p>
                        <a href={resolvePhotoUrl((openOrder as any).photoAct)} target="_blank" rel="noopener noreferrer">
                          <img src={resolvePhotoUrl((openOrder as any).photoAct)} alt="Акт" className="w-16 h-16 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity" />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button onClick={() => setOpenDispatchId(null)} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-slate-100 text-sm">
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      {/* ─── Unassign master dialog ───────────────────────────────────────────── */}
      {showUnassignDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <X className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-base">Снять мастера с заказа</h3>
                <p className="text-sm text-gray-500 mt-0.5">Заказ вернётся в статус ожидания. Укажите причину — она будет видна в карточке заказа и в чате мастера.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Причина снятия *</label>
              <textarea
                value={unassignReason}
                onChange={e => setUnassignReason(e.target.value)}
                placeholder="Например: созвонился с клиентом, заказ не актуален; мастер не выходит на связь; передаём другому мастеру..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 resize-none"
                autoFocus
              />
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => { setShowUnassignDialog(false); setUnassignReason(""); }}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!unassignReason.trim()) return;
                  unassignMutation.mutate({ orderId: openDispatchId!, reason: unassignReason.trim() });
                }}
                disabled={!unassignReason.trim() || unassignMutation.isPending}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {unassignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Снять мастера
              </button>
            </div>
          </div>
        </div>
      )}
      </Layout>
    </ProtectedRoute>
  );
}
