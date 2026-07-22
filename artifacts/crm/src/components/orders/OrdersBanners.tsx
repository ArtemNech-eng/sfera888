import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { AlertCircle, Users, UserCheck, MessageSquare, RefreshCw, XCircle, Loader2, ChevronDown, ChevronRight, Banknote, Undo2 } from "lucide-react";

// Persist collapsed-state per banner across page loads.
function useCollapsed(key: string, initial = false): [boolean, (v: boolean) => void] {
  const fullKey = `crm.banner.collapsed.${key}`;
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const v = window.localStorage.getItem(fullKey);
      return v === null ? initial : v === "1";
    } catch {
      return initial;
    }
  });
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try { window.localStorage.setItem(fullKey, v ? "1" : "0"); } catch {}
  };
  // Sync if localStorage changes in another tab
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === fullKey && e.newValue != null) setCollapsedState(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fullKey]);
  return [collapsed, setCollapsed];
}

interface PendingDispatch {
  orderId: number;
  leadId: number | null;
  serviceType: string;
  city: string;
  district: string | null;
  respondentCount: number;
  respondents: { masterId: number; masterName: string; respondedAt: string | null }[];
}

interface OrderRow {
  id: number;
  leadId?: number | null;
  serviceType: string;
  city: string;
  status: string;
  cancelType?: string | null;
  cancelReason?: string | null;
  masterId?: number | null;
  masterName?: string | null;
}

interface Props {
  onOpenOrder: (orderId: number) => void;
}

/**
 * Top-of-page alert banners for the Orders Workspace:
 *   - Cancellation requests from masters (red)
 *   - Pending master responses on dispatched leads (blue)
 *   - "Сумма не зафиксирована > 48ч" warnings (amber)
 *
 * Each banner is data-driven via a small dedicated query and disappears
 * automatically when there's nothing to show.
 */
export default function OrdersBanners({ onOpenOrder }: Props) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Pending responses banner data
  const { data: pendingDispatches } = useQuery<PendingDispatch[]>({
    queryKey: ["/api/dispatch/pending"],
    queryFn: async () => {
      const r = await fetch("/api/dispatch/pending", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 6_000,
  });

  // Orders in cancellation_requested status
  const { data: ordersData } = useQuery<{ rows: OrderRow[] }>({
    queryKey: ["/api/orders", "cancellation"],
    queryFn: async () => {
      const r = await fetch("/api/orders?status=cancellation_requested&limit=20", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 10_000,
  });
  const cancellationOrders = ordersData?.rows ?? [];

  // Phase 2 of estimate-optional-flow: "Сумма не зафиксирована > 48 часов".
  // Показываем только когда engine включён — иначе старые "Без сметы" каналы
  // продолжают работать и баннер был бы дублирующим сигналом.
  const { flags } = useFeatureFlags();
  const { data: noAmountStats } = useQuery<{ count: number; items: { id: number; leadId?: number | null; city: string; serviceType: string; ageHours: number }[] }>({
    queryKey: ["/api/orders/stats/payment-state", "no_amount", 48],
    queryFn: async () => {
      const r = await fetch("/api/orders/stats/payment-state?state=no_amount&staleHours=48", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 30_000,
    enabled: flags.payment_state_engine_enabled,
  });
  const noAmountItems = noAmountStats?.items ?? [];

  // All pending dispatches in a single banner — token model removed.
  const allPending = pendingDispatches ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────
  const approveCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ approveCancellation: true }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
      toast({ title: "Заказ отменён" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const rejectCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rejectCancellation: true }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
      toast({ title: "Назначение продолжено", description: "Текущий мастер откреплён, идёт переназначение" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const openMasterChat = (masterId: number) => setLocation(`/master-chat?masterId=${masterId}`);

  // Вернуть заказ тому же мастеру — мастер нажал «Отменить» по ошибке.
  const revertCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ revertCancellation: true }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
      toast({ title: "Заказ возвращён мастеру", description: "Запрос на отмену снят, заказ снова в работе" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  // Collapsed state for each banner — persisted across reloads
  const [cancelCollapsed, setCancelCollapsed] = useCollapsed("cancellation");
  const [pendingCollapsed, setPendingCollapsed] = useCollapsed("commission-pending");
  const [noAmountCollapsed, setNoAmountCollapsed] = useCollapsed("no-amount-stale");

  // Hide all banners if everything's clear
  if (
    cancellationOrders.length === 0 &&
    allPending.length === 0 &&
    noAmountItems.length === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Cancellation requests */}
      {cancellationOrders.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-2">
          <button
            type="button"
            onClick={() => setCancelCollapsed(!cancelCollapsed)}
            className="w-full flex items-center gap-2 text-red-800 font-semibold text-sm hover:opacity-80 transition-opacity"
            aria-expanded={!cancelCollapsed}
          >
            {cancelCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <AlertCircle className="w-4 h-4" />
            <span>
              {cancellationOrders.length === 1 ? "1 запрос на отмену" : `${cancellationOrders.length} запроса на отмену`}
            </span>
          </button>
          {!cancelCollapsed && cancellationOrders.map(order => (
            <div key={order.id} className="bg-white rounded-xl border border-red-100 px-3 py-2 flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onOpenOrder(order.id)}
                  className="font-medium text-foreground hover:underline"
                >
                  #{order.leadId ?? order.id}
                </button>
                <span className="ml-2 text-foreground">{order.serviceType}</span>
                <span className="ml-2 text-xs text-muted-foreground">· {order.city}</span>
                {order.masterName && (
                  <button
                    onClick={() => order.masterId && openMasterChat(order.masterId)}
                    className="ml-2 text-xs text-blue-600 hover:underline"
                  >
                    мастер {order.masterName}
                  </button>
                )}
                {order.cancelReason && (
                  <div className="text-xs text-red-700 mt-1 truncate">«{order.cancelReason}»</div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {order.masterId && (
                  <button
                    onClick={() => openMasterChat(order.masterId!)}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-md text-xs"
                  >
                    <MessageSquare className="w-3 h-3" /> Чат
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Вернуть #${order.leadId ?? order.id} мастеру? Запрос на отмену будет снят, заказ снова в работе.`)) {
                      revertCancellationMutation.mutate(order.id);
                    }
                  }}
                  disabled={revertCancellationMutation.isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-md text-xs disabled:opacity-50"
                >
                  {revertCancellationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                  Вернуть
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Назначить другого мастера на #${order.leadId ?? order.id}? Текущий мастер будет откреплён.`)) {
                      rejectCancellationMutation.mutate(order.id);
                    }
                  }}
                  disabled={rejectCancellationMutation.isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-md text-xs disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" /> Назначить другого
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Отменить #${order.leadId ?? order.id}?`)) {
                      approveCancellationMutation.mutate(order.id);
                    }
                  }}
                  disabled={approveCancellationMutation.isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-red-500 text-white hover:bg-red-600 rounded-md text-xs disabled:opacity-50"
                >
                  {approveCancellationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                  Отменить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending master responses */}
      {allPending.length > 0 && (
        <ResponsesBanner
          tone="blue"
          icon={<Users className="w-4 h-4" />}
          title={allPending.length === 1 ? "1 заявка ждёт назначения" : `${allPending.length} заявок ждут назначения`}
          items={allPending}
          onOpenOrder={onOpenOrder}
          onOpenMasterChat={openMasterChat}
          collapsed={pendingCollapsed}
          onToggleCollapsed={() => setPendingCollapsed(!pendingCollapsed)}
        />
      )}

      {/* "Сумма не зафиксирована > 48 ч" — Phase 2 of estimate-optional-flow */}
      {noAmountItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
          <button
            type="button"
            onClick={() => setNoAmountCollapsed(!noAmountCollapsed)}
            className="w-full flex items-center gap-2 text-amber-800 font-semibold text-sm hover:opacity-80 transition-opacity"
            aria-expanded={!noAmountCollapsed}
          >
            {noAmountCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <Banknote className="w-4 h-4" />
            <span>
              {noAmountItems.length === 1
                ? "1 заказ без зафиксированной суммы более 48 часов"
                : `${noAmountItems.length} заказов без зафиксированной суммы более 48 часов`}
            </span>
          </button>
          {!noAmountCollapsed && noAmountItems.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-amber-100 px-3 py-2 flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onOpenOrder(item.id)}
                  className="font-medium text-foreground hover:underline"
                >
                  #{item.leadId ?? item.id}
                </button>
                <span className="ml-2 text-foreground">{item.serviceType}</span>
                <span className="ml-2 text-xs text-muted-foreground">· {item.city}</span>
                <span className="ml-2 text-xs text-amber-700 font-medium">
                  {item.ageHours}ч без суммы
                </span>
              </div>
              <button
                onClick={() => onOpenOrder(item.id)}
                className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md font-medium text-xs"
              >
                <Banknote className="w-3 h-3" /> Зафиксировать сумму
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ResponsesBannerProps {
  tone: "emerald" | "blue";
  icon: React.ReactNode;
  title: string;
  items: PendingDispatch[];
  onOpenOrder: (orderId: number) => void;
  onOpenMasterChat: (masterId: number) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

function ResponsesBanner({ tone, icon, title, items, onOpenOrder, collapsed, onToggleCollapsed }: ResponsesBannerProps) {
  const cls = tone === "emerald"
    ? { wrap: "bg-emerald-50 border-emerald-200", titleC: "text-emerald-800", card: "border-emerald-100", btn: "bg-emerald-500 hover:bg-emerald-600" }
    : { wrap: "bg-blue-50 border-blue-200", titleC: "text-blue-800", card: "border-blue-100", btn: "bg-blue-500 hover:bg-blue-600" };
  return (
    <div className={`${cls.wrap} border rounded-2xl p-3 space-y-2`}>
      <button
        type="button"
        onClick={onToggleCollapsed}
        className={`w-full flex items-center gap-2 font-semibold text-sm hover:opacity-80 transition-opacity ${cls.titleC}`}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {icon}
        <span>{title}</span>
      </button>
      {!collapsed && items.map(item => (
        <div key={item.orderId} className={`bg-white rounded-xl border ${cls.card} px-3 py-2 flex items-center gap-2 flex-wrap`}>
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <button onClick={() => onOpenOrder(item.orderId)} className="font-medium text-foreground hover:underline">
              #{item.orderId}
            </button>
            <span className="text-foreground">{item.serviceType}</span>
            <span className="text-xs text-muted-foreground">· {item.city}{item.district ? `, ${item.district}` : ""}</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 rounded-full px-2 py-0.5 bg-slate-100">
              <UserCheck className="w-3 h-3" />
              {item.respondentCount} {item.respondentCount === 1 ? "отклик" : item.respondentCount < 5 ? "отклика" : "откликов"}
            </span>
          </div>
          <button
            onClick={() => onOpenOrder(item.orderId)}
            className={`flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 ${cls.btn} text-white rounded-md font-medium text-xs`}
          >
            <UserCheck className="w-3 h-3" /> Назначить
          </button>
        </div>
      ))}
    </div>
  );
}
