import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { AlertCircle, Diamond, Users, UserCheck, MessageSquare, RefreshCw, XCircle, Loader2 } from "lucide-react";

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
  serviceType: string;
  city: string;
  status: string;
  paymentModel?: string;
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
 *   - Pending responses on token leads (emerald)
 *   - Pending responses on commission leads (blue)
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

  // Map orderId → paymentModel for splitting pending responses
  const paymentModelByOrder = new Map<number, string>();
  for (const o of cancellationOrders) paymentModelByOrder.set(o.id, o.paymentModel ?? "commission");
  const tokenPending = (pendingDispatches ?? []).filter(p => paymentModelByOrder.get(p.orderId) === "token");
  const commissionPending = (pendingDispatches ?? []).filter(p => paymentModelByOrder.get(p.orderId) !== "token");

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

  // Hide all banners if everything's clear
  if (cancellationOrders.length === 0 && tokenPending.length === 0 && commissionPending.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Cancellation requests */}
      {cancellationOrders.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-red-800 font-semibold text-sm">
            <AlertCircle className="w-4 h-4" />
            {cancellationOrders.length === 1 ? "1 запрос на отмену" : `${cancellationOrders.length} запроса на отмену`}
          </div>
          {cancellationOrders.map(order => (
            <div key={order.id} className="bg-white rounded-xl border border-red-100 px-3 py-2 flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onOpenOrder(order.id)}
                  className="font-medium text-foreground hover:underline"
                >
                  #{order.id}
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
                    if (confirm(`Назначить другого мастера на #${order.id}? Текущий мастер будет откреплён.`)) {
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
                    if (confirm(`Отменить #${order.id}?`)) {
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

      {/* Token pending responses */}
      {tokenPending.length > 0 && (
        <ResponsesBanner
          tone="emerald"
          icon={<Diamond className="w-4 h-4" />}
          title={tokenPending.length === 1 ? "1 токеновая заявка ждёт назначения" : `${tokenPending.length} токеновых заявок ждут назначения`}
          items={tokenPending}
          onOpenOrder={onOpenOrder}
          onOpenMasterChat={openMasterChat}
        />
      )}

      {/* Commission pending responses */}
      {commissionPending.length > 0 && (
        <ResponsesBanner
          tone="blue"
          icon={<Users className="w-4 h-4" />}
          title={commissionPending.length === 1 ? "1 заявка ждёт назначения" : `${commissionPending.length} заявок ждут назначения`}
          items={commissionPending}
          onOpenOrder={onOpenOrder}
          onOpenMasterChat={openMasterChat}
        />
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
}

function ResponsesBanner({ tone, icon, title, items, onOpenOrder, onOpenMasterChat }: ResponsesBannerProps) {
  const cls = tone === "emerald"
    ? { wrap: "bg-emerald-50 border-emerald-200", titleC: "text-emerald-800", card: "border-emerald-100", btn: "bg-emerald-500 hover:bg-emerald-600" }
    : { wrap: "bg-blue-50 border-blue-200", titleC: "text-blue-800", card: "border-blue-100", btn: "bg-blue-500 hover:bg-blue-600" };
  return (
    <div className={`${cls.wrap} border rounded-2xl p-3 space-y-2`}>
      <div className={`flex items-center gap-2 font-semibold text-sm ${cls.titleC}`}>
        {icon}
        {title}
      </div>
      {items.map(item => (
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
