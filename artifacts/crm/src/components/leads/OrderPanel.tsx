import { StatusBadge } from "@/components/status-badge";
import { PaymentStateBadge, type PaymentState } from "@/components/orders/PaymentStateBadge";
import { ReconcileBanner } from "@/components/orders/ReconcileBanner";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, Plus, X, Pencil, AlertTriangle, Send, UserCheck, Clock,
  AlertCircle, CheckCircle2, ExternalLink, Copy, ReceiptText, ChevronDown,
  FileText, Timer, History, MessageSquare, ClipboardList, Banknote,
  XCircle, Trash2, RefreshCw, Check, Bell,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface StatusLogEntry {
  id: number;
  orderId: number;
  oldStatus: string | null;
  newStatus: string;
  userId: number | null;
  userAlias: string | null;
  note: string | null;
  createdAt: string;
}

interface ReceiptEntry {
  id: number;
  token: string;
  prepaymentAmount: number;
  totalAmount: number;
  notes: string | null;
  clientName: string;
  clientPhone: string;
  createdAt: string;
  publicUrl: string;
  lineItems: { description: string; unit?: string; quantity?: number; price: number }[];
  prepaymentSubmittedAt: string | null;
  clientSubmittedName: string | null;
  prepaymentScreenshotUrl: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_ORDER_LABELS: Record<string, string> = {
  waiting_master:        "Ожидает мастера",
  master_assigned:       "Мастер назначен",
  in_progress:           "В работе",
  completed:             "Завершён",
  cancelled:             "Отменён",
  cancellation_requested:"Запрос отмены",
};

const UNITS = ["", "шт", "м²", "м³", "м.п.", "м", "кг", "т", "л", "упак.", "компл.", "ч"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeBetween(start: string | Date, end: string | Date): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч ${m % 60} мин`;
  const d = Math.floor(h / 24);
  return `${d}д ${h % 24}ч`;
}

function fmtMoney(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

// ─── Component ───────────────────────────────────────────────────────────────

interface Order {
  id: number;
  status: string;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  comment: string | null;
  createdAt: string;
  scheduledAt: string | null;
  masterId: number | null;
  masterName: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  orderAmount?: number | string | null;
  proposedAmount?: number | string | null;
  commission?: number | string | null;
  transactionInfo?: { paymentStatus: string; commission: number | string } | null;
  operatorNote?: string | null;
  dispatchStatus?: string | null;
  dispatchResendCount?: number;
  lastDispatchResendAt?: string | null;
  cancelReason?: string | null;
  assignedAt?: string | null;
  completedAt?: string | null;
  photosBefore?: string[];
  photosAfter?: string[];
  photoAct?: string | null;
  maxMasters?: number;
  assignedMasterCount?: number;
}

interface OrderPanelProps {
  orderId: number;
  /** Optional preloaded order. When omitted, the panel fetches it via /api/orders/:id. */
  order?: Order;
  onClose: () => void;
  onOpenMasterChat: (masterId: number) => void;
  onNavigateToTasks: (orderId: number) => void;
}

export default function OrderPanel({
  orderId,
  order,
  onClose,
  onOpenMasterChat,
  onNavigateToTasks,
}: OrderPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { flags } = useFeatureFlags();
  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: dispatchData, isLoading: dispatchLoading } = useQuery<DispatchInfo>({
    queryKey: ["/api/dispatch", orderId],
    queryFn: async () => {
      const r = await fetch(`/api/dispatch/${orderId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: true,
    refetchInterval: 5000,
  });

  const { data: receipts } = useQuery<ReceiptEntry[]>({
    queryKey: ["/api/receipts/order", orderId],
    queryFn: async () => {
      const r = await fetch(`/api/receipts/order/${orderId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: true,
  });

  const [showStatusLog, setShowStatusLog] = useState(false);
  const { data: statusLog } = useQuery<StatusLogEntry[]>({
    queryKey: ["/api/orders", orderId, "status-log"],
    queryFn: async () => {
      const r = await fetch(`/api/orders/${orderId}/status-log`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: showStatusLog,
  });

  const { data: activeMasters, isLoading: activeMastersLoading, error: activeMastersError } = useQuery<{ id: number; alias: string; city: string | null }[]>({
    queryKey: ["/api/masters"],
    queryFn: async () => {
      const r = await fetch("/api/masters", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load masters");
      return r.json();
    },
  });

  const { data: fetchedOrder, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const r = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !order,
  });

  // ── Computed ───────────────────────────────────────────────────────────────
  const respondents = useMemo(() => dispatchData?.dispatches.filter(d => d.status === "responded") ?? [], [dispatchData]);
  const rejectedDispatches = useMemo(() => dispatchData?.dispatches.filter(d => d.status === "rejected") ?? [], [dispatchData]);
  const pendingDispatched = useMemo(() => dispatchData?.dispatches.filter(d => d.status === "sent") ?? [], [dispatchData]);
  const assignedDispatches = useMemo(() => dispatchData?.dispatches.filter(d => d.status === "assigned") ?? [], [dispatchData]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [notifCopied, setNotifCopied] = useState(false);

  const [editAmountId, setEditAmountId] = useState<number | null>(null);
  const [editAmountValue, setEditAmountValue] = useState("");

  const [showManualAssign, setShowManualAssign] = useState(false);
  const [selectedMasterForAssign, setSelectedMasterForAssign] = useState("");

  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [unassignReason, setUnassignReason] = useState("");
  const [rebroadcastOnUnassign, setRebroadcastOnUnassign] = useState(false);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelDialogReason, setCancelDialogReason] = useState("");
  const [cancelDialogNote, setCancelDialogNote] = useState("");

  const [showPartialPayment, setShowPartialPayment] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialNote, setPartialNote] = useState("");

  const [operatorNoteEdit, setOperatorNoteEdit] = useState<string | null>(null);
  const [maxMastersEdit, setMaxMastersEdit] = useState<string | null>(null);

  const [showReceipts, setShowReceipts] = useState(false);
  const [showCreateReceipt, setShowCreateReceipt] = useState(false);
  const [crmLineItems, setCrmLineItems] = useState<{ description: string; unit: string; quantity: string; price: string }[]>([{ description: "", unit: "", quantity: "1", price: "" }]);
  const [crmPrepayment, setCrmPrepayment] = useState("5000");
  const [crmNotes, setCrmNotes] = useState("");
  const [crmCreating, setCrmCreating] = useState(false);
  const [crmCreatedUrl, setCrmCreatedUrl] = useState<string | null>(null);
  const [crmCopied, setCrmCopied] = useState(false);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const setAmountMutation = useMutation({
    mutationFn: async ({ orderId: oid, amount }: { orderId: number; amount: number }) => {
      const r = await fetch(`/api/orders/${oid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ orderAmount: amount }) });
      if (!r.ok) { const text = await r.text(); let msg = "Ошибка"; try { msg = JSON.parse(text).error ?? msg; } catch {} throw new Error(msg); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); setEditAmountId(null); setEditAmountValue(""); },
  });

  // Phase 2 of estimate-optional-flow: одна кнопка "Принять предложение мастера".
  // Вызывает POST /api/orders/:id/agreement с source=master_proposal — создаёт
  // audit-row, шлёт push/MAX мастеру, переводит order в agreed.
  const acceptProposalMutation = useMutation({
    mutationFn: async ({ orderId: oid, amount }: { orderId: number; amount: number }) => {
      const r = await fetch(`/api/orders/${oid}/agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, source: "master_proposal" }),
      });
      if (!r.ok) {
        const text = await r.text();
        let msg = "Не удалось принять предложение";
        try { msg = JSON.parse(text).error ?? msg; } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
      toast({ title: "Сумма зафиксирована", description: "Мастеру отправлено уведомление" });
    },
    onError: (e: Error) =>
      toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const broadcastMutation = useMutation({
    mutationFn: async (oid: number) => {
      const r = await fetch(`/api/dispatch/${oid}/broadcast`, { method: "POST", credentials: "include" });
      if (!r.ok) { const text = await r.text(); let msg = "Ошибка"; try { msg = JSON.parse(text).error ?? msg; } catch {} throw new Error(msg); }
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Рассылка запущена", description: data?.message ?? "Мастерам отправляются уведомления" });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", orderId] });
    },
    onError: (e: Error) => toast({ title: "Ошибка рассылки", description: e.message, variant: "destructive" }),
  });

  const resendMutation = useMutation({
    mutationFn: async (oid: number) => {
      const r = await fetch(`/api/dispatch/${oid}/resend`, { method: "POST", credentials: "include" });
      if (!r.ok) { const text = await r.text(); let msg = "Ошибка"; try { msg = JSON.parse(text).error ?? msg; } catch {} throw new Error(msg); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Повторная рассылка запущена", description: "Неответившим мастерам отправлено напоминание" });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", orderId] });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: async ({ orderId: oid, masterId }: { orderId: number; masterId: number }) => {
      const r = await fetch(`/api/dispatch/${oid}/assign/${masterId}`, { method: "POST", credentials: "include" });
      if (!r.ok) {
        const text = await r.text();
        let msg = "Ошибка";
        try {
          const parsed = JSON.parse(text);
          msg = parsed.error ?? msg;
        } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/dispatch", orderId] }); broadcastMutation.reset(); toast({ title: "Мастер назначен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const manualAssignMutation = useMutation({
    mutationFn: async ({ orderId: oid, masterId }: { orderId: number; masterId: number }) => {
      const r = await fetch(`/api/orders/${oid}/manual-assign/${masterId}`, { method: "POST", credentials: "include" });
      if (!r.ok) {
        const text = await r.text();
        let msg = "Ошибка";
        try {
          const parsed = JSON.parse(text);
          msg = parsed.error ?? msg;
        } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", orderId] });
      broadcastMutation.reset();
      setTimeout(() => {
        setShowManualAssign(false);
        setSelectedMasterForAssign("");
        toast({ title: "Мастер назначен вручную" });
      }, 0);
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const unassignMutation = useMutation({
    mutationFn: async ({ orderId: oid, reason, rebroadcast, masterId }: { orderId: number; reason: string; rebroadcast: boolean; masterId?: number }) => {
      const r = await fetch(`/api/orders/${oid}/unassign-master`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ reason, rebroadcast, masterId }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", orderId] });
      broadcastMutation.reset();
      setShowUnassignDialog(false);
      setUnassignReason("");
      setRebroadcastOnUnassign(false);
      if (data?.rebroadcasted) toast({ title: "Мастер снят, заявка переразослана" });
      else toast({ title: "Мастер снят с заказа" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId: oid, reason }: { orderId: number; reason: string }) => {
      const r = await fetch(`/api/orders/${oid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status: "cancelled", clientCancelReason: reason }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch/pending"] });
      onClose();
      setShowCancelDialog(false);
      setCancelDialogReason("");
      setCancelDialogNote("");
      toast({ title: "Заказ отменён" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const restoreOrderMutation = useMutation({
    mutationFn: async (oid: number) => {
      const r = await fetch(`/api/orders/${oid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ restoreOrder: true }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); onClose(); toast({ title: "Заказ восстановлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/orders/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); toast({ title: "Перемещено в корзину" }); },
  });

  const partialPaymentMutation = useMutation({
    mutationFn: async ({ orderId: oid, amount, note }: { orderId: number; amount: number; note?: string }) => {
      const r = await fetch(`/api/work-board/orders/${oid}/partial-payment`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ amount, note }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", orderId] });
      setShowPartialPayment(false);
      setPartialAmount("");
      setPartialNote("");
      toast({ title: "Частичная оплата добавлена" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ orderId: oid, note }: { orderId: number; note: string }) => {
      const r = await fetch(`/api/orders/${oid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ operatorNote: note }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); setOperatorNoteEdit(null); toast({ title: "Заметка сохранена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const saveMaxMastersMutation = useMutation({
    mutationFn: async ({ orderId: oid, maxMasters: mm }: { orderId: number; maxMasters: number }) => {
      const r = await fetch(`/api/orders/${oid}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ maxMasters: mm }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); setMaxMastersEdit(null); toast({ title: "Макс. мастеров обновлено" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const closeEnrollmentMutation = useMutation({
    mutationFn: async (oid: number) => {
      const r = await fetch(`/api/orders/${oid}/close-enrollment`, { method: "POST", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", orderId] });
      toast({ title: "Набор мастеров завершён" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteReceiptMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/receipts/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", orderId] }); toast({ title: "Смета удалена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  // ── Derived order data ─────────────────────────────────────────────────────
  const openOrder = order ?? fetchedOrder;

  // Reset broadcast mutation when order's dispatchStatus changes from the server
  useEffect(() => {
    broadcastMutation.reset();
  }, [openOrder?.dispatchStatus]);

  if (!openOrder && orderLoading) {
    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-card w-full max-w-md h-full overflow-hidden flex flex-col shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  if (!openOrder) {
    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-card w-full max-w-md h-full overflow-hidden flex flex-col shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Заказ не найден
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-card w-full max-w-md h-full overflow-hidden flex flex-col shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-display font-bold text-foreground">Заказ #{orderId}</h2>
              <StatusBadge status={openOrder.status} type="order" />
              {(openOrder as any).paymentState && (
                <PaymentStateBadge state={(openOrder as any).paymentState as PaymentState} size="sm" />
              )}
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                Комиссия
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{openOrder.serviceType} · {openOrder.city}{openOrder.district ? `, ${openOrder.district}` : ""}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 flex-shrink-0 ml-2"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          <div className="p-6 space-y-4">
            {/* Order info card */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Дата заявки</p><p className="font-medium text-foreground">{formatDate(openOrder.createdAt)}</p></div>
                <div><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Площадь</p><p className="font-medium text-foreground">{openOrder.area} м²</p></div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Макс. мастеров</p>
                  {maxMastersEdit !== null ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <input
                        type="number"
                        min={Math.max(1, openOrder.assignedMasterCount ?? 0)}
                        value={maxMastersEdit}
                        onChange={e => setMaxMastersEdit(e.target.value)}
                        className="w-16 border border-border rounded-lg px-2 py-0.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                        autoFocus
                      />
                      <button
                        onClick={() => { const v = parseInt(maxMastersEdit); if (!isNaN(v) && v >= 1) saveMaxMastersMutation.mutate({ orderId, maxMasters: v }); }}
                        className="text-emerald-600 hover:text-emerald-700"
                      ><Check className="w-3 h-3" /></button>
                      <button
                        onClick={() => setMaxMastersEdit(null)}
                        className="text-slate-400 hover:text-slate-600"
                      ><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-foreground">{openOrder.maxMasters ?? 3}</p>
                      <button
                        onClick={() => setMaxMastersEdit(String(openOrder.maxMasters ?? 3))}
                        className="text-muted-foreground/50 hover:text-primary"
                      ><Pencil className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
                <div className="col-span-2 border-t border-border/30 pt-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide mb-1.5">Клиент</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {openOrder.clientName && (
                      <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Имя</p><p className="font-medium text-foreground">{openOrder.clientName}</p></div>
                    )}
                    {openOrder.clientPhone && (
                      <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Телефон</p><a href={`tel:${openOrder.clientPhone}`} className="font-medium text-blue-600 hover:underline">{openOrder.clientPhone}</a></div>
                    )}
                    <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Город</p><p className="font-medium text-foreground">{openOrder.city}</p></div>
                    {openOrder.district && (
                      <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Адрес объекта</p><p className="font-medium text-foreground">{openOrder.district}</p></div>
                    )}
                  </div>
                  <button onClick={() => {
                    const text = openOrder.status === "master_assigned"
                      ? `Здравствуйте! Мастер ${openOrder.masterName} назначен на вашу заявку (${openOrder.serviceType}, ${openOrder.city}).`
                      : `Здравствуйте! Ваша заявка (${openOrder.serviceType}, ${openOrder.city}) принята в обработку.`;
                    navigator.clipboard.writeText(text).then(() => { setNotifCopied(true); setTimeout(() => setNotifCopied(false), 2500); });
                  }} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors mt-2">
                    {notifCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Bell className="w-3 h-3" />}
                    {notifCopied ? "Скопировано!" : "Уведомить клиента"}
                  </button>
                </div>
                {openOrder.scheduledAt && <div><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Дата визита</p><p className="font-medium text-blue-600">{new Date(openOrder.scheduledAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>}
                {openOrder.masterName && <div><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Мастер</p><button onClick={() => openOrder.masterId && onOpenMasterChat(openOrder.masterId)} className="font-medium text-blue-600 hover:underline text-left">{openOrder.masterName}</button></div>}
                {openOrder.masterId && receipts && receipts.length === 0 && ["master_assigned","in_progress"].includes(openOrder.status) && (
                  <div className="col-span-2 flex items-center gap-2 bg-red-50 border border-red-300 rounded-xl px-3 py-2 text-xs font-semibold text-red-700">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />Смета не создана — клиент не может внести предоплату
                  </div>
                )}
                {(openOrder as any).hasReconcileConflict && (openOrder as any).conflictReceiptAmount && openOrder.orderAmount && (
                  <div className="col-span-2">
                    <ReconcileBanner
                      orderId={orderId}
                      agreementAmount={Number(openOrder.orderAmount)}
                      receiptAmount={Number((openOrder as any).conflictReceiptAmount)}
                      onResolved={() => queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] })}
                    />
                  </div>
                )}
                {(() => {
                  const confirmed = openOrder.orderAmount ? Number(openOrder.orderAmount) : null;
                  const proposed = openOrder.proposedAmount ? Number(openOrder.proposedAmount) : null;
                  if (confirmed) return (
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Сумма</p>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">{fmtMoney(confirmed)}</span>
                        <button onClick={() => { setEditAmountId(orderId); setEditAmountValue(String(confirmed)); }} className="text-muted-foreground/50 hover:text-primary"><Pencil className="w-3 h-3" /></button>
                      </div>
                      {openOrder.commission && <p className="text-[10px] text-muted-foreground">ком. {fmtMoney(Number(openOrder.commission))}</p>}
                      {openOrder.transactionInfo?.paymentStatus === "paid" ? <p className="text-[10px] text-green-600 font-medium">✅ комиссия оплачена</p> : openOrder.transactionInfo?.paymentStatus && Number(openOrder.transactionInfo.commission) > 0 ? <p className="text-[10px] text-amber-600">⏳ комиссия не оплачена</p> : null}
                    </div>
                  );
                  if (proposed) return (
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Предложено</p>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-amber-700">{fmtMoney(proposed)}</span>
                        <button onClick={() => { setEditAmountId(orderId); setEditAmountValue(String(proposed)); }} className="text-amber-400 hover:text-amber-700"><Pencil className="w-3 h-3" /></button>
                      </div>
                      {(openOrder as any).paymentState === "no_amount" && flags.payment_state_master_proposal_oneclick && (
                        <button
                          onClick={() => acceptProposalMutation.mutate({ orderId, amount: proposed })}
                          disabled={acceptProposalMutation.isPending}
                          title="Зафиксировать сумму = предложение мастера и уведомить его"
                          className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md text-[10px] font-semibold text-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {acceptProposalMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          Принять предложение мастера
                        </button>
                      )}
                      {openOrder.transactionInfo?.paymentStatus === "paid" ? <p className="text-[10px] text-green-600 font-medium">✅ комиссия оплачена</p> : openOrder.transactionInfo?.paymentStatus && Number(openOrder.transactionInfo.commission) > 0 ? <p className="text-[10px] text-amber-600">⏳ комиссия не оплачена</p> : null}
                    </div>
                  );
                  return (
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Сумма</p>
                      <button onClick={() => { setEditAmountId(orderId); setEditAmountValue(""); }} className="text-xs text-primary hover:underline flex items-center gap-1"><Pencil className="w-3 h-3" />Указать сумму</button>
                      {openOrder.transactionInfo?.paymentStatus === "paid" ? <p className="text-[10px] text-green-600 font-medium">✅ комиссия оплачена</p> : openOrder.transactionInfo?.paymentStatus && Number(openOrder.transactionInfo.commission) > 0 ? <p className="text-[10px] text-amber-600">⏳ комиссия не оплачена</p> : null}
                    </div>
                  );
                })()}
              </div>
              {openOrder.comment && <div className="pt-1.5 border-t border-border/40"><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide mb-1">Комментарий</p><p className="text-sm text-foreground">{openOrder.comment}</p></div>}
              {/* Edit amount inline */}
              {editAmountId === orderId && (
                <div className="pt-1.5 border-t border-border/40 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Сумма заказа</p>
                  <div className="flex gap-2">
                    <input type="number" value={editAmountValue} onChange={e => setEditAmountValue(e.target.value)} placeholder="Сумма в ₽" className="flex-1 border border-border rounded-xl px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" autoFocus />
                    <button onClick={() => setAmountMutation.mutate({ orderId: editAmountId!, amount: parseFloat(editAmountValue) })} disabled={!editAmountValue || setAmountMutation.isPending} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-medium disabled:opacity-50">{setAmountMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}</button>
                    <button onClick={() => { setEditAmountId(null); setEditAmountValue(""); }} className="px-3 py-1.5 border border-border rounded-xl text-xs font-medium text-muted-foreground"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              )}
              {/* Quick actions */}
              <div className="pt-1.5 border-t border-border/40 flex items-center gap-2 flex-wrap">
                {openOrder.masterId && <button onClick={() => openOrder.masterId && onOpenMasterChat(openOrder.masterId)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-medium text-foreground hover:bg-slate-100 transition-colors"><MessageSquare className="w-3 h-3" />Чат с мастером</button>}
                <button onClick={() => { onClose(); onNavigateToTasks(orderId); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-medium text-foreground hover:bg-slate-100 transition-colors"><ClipboardList className="w-3 h-3" />Создать задачу</button>
                {openOrder.masterId && (
                  <button
                    onClick={() => {
                      if (!openOrder.orderAmount) {
                        setEditAmountId(orderId);
                        setEditAmountValue("");
                      }
                      setShowPartialPayment(!showPartialPayment);
                      setPartialAmount("");
                      setPartialNote("");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                  >
                    <Banknote className="w-3 h-3" />{openOrder.orderAmount ? "Частичная оплата" : "Оплата комиссии"}
                  </button>
                )}
                {openOrder.status === "cancelled" && <button onClick={() => restoreOrderMutation.mutate(orderId)} disabled={restoreOrderMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors">{restoreOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Восстановить</button>}
                {openOrder.status !== "cancelled" && openOrder.status !== "completed" && !showCancelDialog && <button onClick={() => { setShowCancelDialog(true); setCancelDialogReason(""); setCancelDialogNote(""); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors"><XCircle className="w-3 h-3" />Отменить заказ</button>}
                <button onClick={() => { if (confirm(`Удалить заказ #${orderId}?`)) { deleteOrderMutation.mutate(orderId); onClose(); } }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-3 h-3" />В корзину</button>
              </div>
              {/* Partial payment form */}
              {showPartialPayment && (
                <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-emerald-800">Частичная оплата комиссии</p>
                  <p className="text-xs text-emerald-600">Сумма, которую мастер внёс в счёт оплаты комиссии по заказу #{orderId}</p>
                  <div className="flex gap-2">
                    <input type="number" placeholder="Сумма ₽" value={partialAmount} onChange={e => setPartialAmount(e.target.value)} className="flex-1 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400" autoFocus />
                  </div>
                  <input type="text" placeholder="Примечание (необязательно)" value={partialNote} onChange={e => setPartialNote(e.target.value)} className="w-full border border-emerald-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                  <div className="flex gap-2">
                    <button onClick={() => { const amt = parseFloat(partialAmount); if (!isNaN(amt) && amt > 0) { partialPaymentMutation.mutate({ orderId, amount: amt, note: partialNote.trim() || undefined }); } }} disabled={!partialAmount || parseFloat(partialAmount) <= 0 || partialPaymentMutation.isPending} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors" > {partialPaymentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />} Добавить оплату </button>
                    <button onClick={() => { setShowPartialPayment(false); setPartialAmount(""); setPartialNote(""); }} className="px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">Отмена</button>
                  </div>
                  {partialPaymentMutation.isError && <p className="text-xs text-red-600">{(partialPaymentMutation.error as Error).message}</p>}
                </div>
              )}
              {/* Cancel dialog */}
              {showCancelDialog && openOrder.status !== "cancelled" && openOrder.status !== "completed" && (
                <div className="border border-orange-200 bg-orange-50 rounded-xl p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-orange-800">Причина отмены</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[{ value: "client_changed_mind", label: "Передумал" }, { value: "found_cheaper", label: "Нашёл дешевле" }, { value: "found_other_master", label: "Другой мастер" }, { value: "no_answer", label: "Не берёт трубку" }, { value: "other", label: "Другое" }].map(opt => (
                      <button key={opt.value} onClick={() => setCancelDialogReason(opt.value)} className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${cancelDialogReason === opt.value ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-orange-200 text-orange-700 hover:bg-orange-100"}`}>{opt.label}</button>
                    ))}
                  </div>
                  {cancelDialogReason === "other" && <textarea value={cancelDialogNote} onChange={e => setCancelDialogNote(e.target.value)} placeholder="Уточните причину..." rows={2} className="w-full text-xs border border-orange-200 rounded-lg px-2.5 py-1.5 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-orange-400" />}
                  <div className="flex gap-2">
                    <button onClick={() => { if (!cancelDialogReason) return; const labels: Record<string, string> = { client_changed_mind: "Клиент передумал", found_cheaper: "Нашёл дешевле", found_other_master: "Другой мастер", no_answer: "Не берёт трубку", other: cancelDialogNote.trim() || "Другое" }; cancelOrderMutation.mutate({ orderId, reason: labels[cancelDialogReason] ?? cancelDialogReason }); }} disabled={!cancelDialogReason || cancelOrderMutation.isPending} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 disabled:opacity-50">{cancelOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}Подтвердить</button>
                    <button onClick={() => { setShowCancelDialog(false); setCancelDialogReason(""); setCancelDialogNote(""); }} className="px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-xs font-medium text-orange-700 hover:bg-orange-50 transition-colors">Отмена</button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Dispatch section ── */}
            {(openOrder.dispatchStatus ?? "none") === "none" && openOrder.status !== "cancelled" && openOrder.status !== "completed" && (
              <div className="space-y-3">
                {openOrder.cancelReason && (
                  <div className="flex flex-col gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                    <div className="flex items-start gap-2"><AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" /><p className="text-xs font-semibold text-amber-700">Причина снятия мастера</p></div>
                    <p className="text-xs text-amber-700 ml-6">{openOrder.cancelReason}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">Заявка будет отправлена активным мастерам в городе <b>{openOrder.city}</b>. Телефон клиента скрыт — передаётся только после назначения.</p>
                {broadcastMutation.isError && <p className="text-sm text-red-500">{(broadcastMutation.error as Error).message}</p>}
                {openOrder.dispatchStatus === "dispatching" && (
                  <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Рассылка выполняется, уведомления отправляются мастерам…</span>
                  </div>
                )}
                {((dispatchData?.dispatches.length ?? 0) > 0 && openOrder.dispatchStatus === "none") && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠️ Рассылка была выполнена ранее, но статус сброшен. Можно разослать повторно.
                  </p>
                )}
                <button onClick={() => broadcastMutation.mutate(orderId)} disabled={broadcastMutation.isPending || openOrder.dispatchStatus === "dispatching"} className="w-full py-2.5 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 flex items-center justify-center gap-2 disabled:opacity-50">
                  {broadcastMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : openOrder.dispatchStatus === "dispatching" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {broadcastMutation.isPending ? "Запуск…" : openOrder.dispatchStatus === "dispatching" ? "Рассылка выполняется…" : "Разослать мастерам"}
                </button>
              </div>
            )}

            {(openOrder.dispatchStatus ?? "none") !== "none" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Статус рассылки</p>
                  {dispatchLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>

                {/* Dispatch stats bar */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-muted-foreground">
                    <Send className="w-3 h-3" /> Отправлено {(dispatchData?.dispatches.length ?? 0)}
                  </span>
                  {assignedDispatches.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 text-violet-700">
                      <UserCheck className="w-3 h-3" /> Назначено {assignedDispatches.length}
                    </span>
                  )}
                  {respondents.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-green-50 text-green-700">
                      <Check className="w-3 h-3" /> Откликнулись {respondents.length}
                    </span>
                  )}
                  {pendingDispatched.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-700">
                      <Clock className="w-3 h-3" /> Без ответа {pendingDispatched.length}
                    </span>
                  )}
                  {rejectedDispatches.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-700">
                      <X className="w-3 h-3" /> Отказались {rejectedDispatches.length}
                    </span>
                  )}
                  {(openOrder.dispatchResendCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-700">
                      <RefreshCw className="w-3 h-3" /> Повторно {(openOrder.dispatchResendCount ?? 0)}
                    </span>
                  )}
                </div>

                {/* Resend button */}
                {openOrder.status === "waiting_master" && pendingDispatched.length > 0 && (
                  <div>
                    {(() => {
                      const lastResend = openOrder.lastDispatchResendAt ? new Date(openOrder.lastDispatchResendAt).getTime() : 0;
                      const cooldownMs = 15 * 60 * 1000;
                      const now = Date.now();
                      const canResend = now - lastResend >= cooldownMs;
                      const minutesLeft = Math.ceil((cooldownMs - (now - lastResend)) / 60000);
                      const maxResends = 3;
                      const atLimit = (openOrder.dispatchResendCount ?? 0) >= maxResends;
                      if (atLimit) {
                        return (
                          <p className="text-xs text-muted-foreground">
                            Достигнут лимит повторных рассылок ({maxResends})
                          </p>
                        );
                      }
                      return (
                        <button
                          onClick={() => resendMutation.mutate(orderId)}
                          disabled={!canResend || resendMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-medium text-foreground hover:bg-slate-100 transition-colors disabled:opacity-50"
                        >
                          {resendMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          {canResend ? `Повторить рассылку (${pendingDispatched.length})` : `Повторная рассылка через ${minutesLeft} мин`}
                        </button>
                      );
                    })()}
                  </div>
                )}

                {respondents.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1"><Check className="w-3 h-3" />Откликнулись ({respondents.length})</p>
                    {respondents.map(d => {
                      const note = d.responseNote ?? "";
                      const isConstrained = note.startsWith("⚠️");
                      const [rawTags, masterNote] = isConstrained
                        ? note.replace(/^⚠️\s*/, "").split(" | ")
                        : [null, note || null];
                      const tags = rawTags ? rawTags.split(",").map(t => t.trim()).filter(Boolean) : [];
                      const hasLimit = tags.some(t => t === "Лимит") || note.includes("активном заказе");
                      const hasFomo = tags.some(t => t === "ФОМО");
                      const noContract = tags.some(t => t === "Без договора");
                      const hasDebt = tags.some(t => t === "Долг");
                      const hasOther = tags.some(t => t === "Ограничение");
                      const cardBg = isConstrained ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-100";
                      return (
                        <div key={d.id} className={`p-3 border rounded-xl space-y-2 ${cardBg}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{d.masterName}</p>
                              {d.respondedAt && <p className="text-xs text-muted-foreground">{new Date(d.respondedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</p>}
                            </div>
                            {(openOrder.assignedMasterCount ?? 0) < (openOrder.maxMasters ?? 3) && (
                              <button onClick={() => assignMutation.mutate({ orderId, masterId: d.masterId })} disabled={assignMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white hover:bg-green-600 rounded-lg font-medium text-xs disabled:opacity-50 flex-shrink-0">{assignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}Назначить</button>
                            )}
                          </div>
                          {(tags.length > 0 || (isConstrained && !hasLimit && !hasFomo && !noContract && !hasDebt && !hasOther)) && (
                            <div className="flex flex-wrap gap-1">
                              {hasLimit && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">⏳ С лимитом</span>}
                              {hasFomo && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚡ ФОМО</span>}
                              {noContract && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">📋 Без договора</span>}
                              {hasDebt && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">💳 Просроч. долг</span>}
                              {hasOther && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">⚠️ Ограничение</span>}
                              {isConstrained && !hasLimit && !hasFomo && !noContract && !hasDebt && !hasOther && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">⏳ С лимитом</span>}
                            </div>
                          )}
                          {masterNote && <div className="bg-white/80 border border-current/10 rounded-lg px-3 py-2"><p className="text-[10px] text-muted-foreground font-semibold uppercase mb-1">Предложение</p><p className="text-xs text-gray-700">{masterNote}</p></div>}
                          <button onClick={() => onOpenMasterChat(d.masterId)} className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline"><MessageSquare className="w-3 h-3" />Написать в чат</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {rejectedDispatches.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide flex items-center gap-1"><X className="w-3 h-3" />Отказались ({rejectedDispatches.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {rejectedDispatches.map(d => (
                        <span key={d.id} title={d.rejectionReason ? `Причина: ${d.rejectionReason}` : undefined} className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-100 rounded-full px-2.5 py-0.5">
                          {d.masterName}{d.rejectionReason && <span className="text-red-400 text-[10px]">·&nbsp;{d.rejectionReason.length > 20 ? d.rejectionReason.slice(0, 20) + "…" : d.rejectionReason}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {pendingDispatched.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1"><Clock className="w-3 h-3" />Ожидают ответа ({pendingDispatched.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pendingDispatched.map(d => <span key={d.id} className="text-xs bg-gray-100 text-gray-600 rounded-lg px-2 py-0.5">{d.masterName}</span>)}
                    </div>
                  </div>
                )}
                {respondents.length === 0 && rejectedDispatches.length === 0 && (
                  <div className="text-center py-6 text-sm text-muted-foreground"><Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />Ожидаем откликов от мастеров...</div>
                )}
                {(openOrder.assignedMasterCount ?? 0) > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      Назначено {openOrder.assignedMasterCount} из {openOrder.maxMasters ?? 3} мастеров.
                    </div>
                    {(openOrder.assignedMasterCount ?? 0) < (openOrder.maxMasters ?? 3) && openOrder.status !== "master_assigned" && (
                      <button onClick={() => { if (confirm("Завершить набор мастеров? Новые отклики будут недоступны.")) closeEnrollmentMutation.mutate(orderId); }} disabled={closeEnrollmentMutation.isPending} className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 disabled:opacity-50 transition-colors">{closeEnrollmentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Завершить набор мастеров</button>
                    )}
                    <button onClick={() => { setShowUnassignDialog(true); setUnassignReason(""); }} disabled={unassignMutation.isPending} className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors">{unassignMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}Снять мастера с заказа</button>
                  </div>
                )}
                {(dispatchData?.dispatches.length ?? 0) > 0 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">Все получившие заявку ({dispatchData?.dispatches.length})</summary>
                    <div className="mt-2 space-y-1 pl-2 border-l border-border">
                      {dispatchData?.dispatches.map(d => (
                        <div key={d.id} className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.status === "assigned" ? "bg-green-500" : d.status === "responded" ? "bg-blue-500" : d.status === "rejected" ? "bg-red-400" : "bg-gray-300"}`} />
                          <button onClick={() => { onClose(); onOpenMasterChat(d.masterId); }} className="font-medium text-foreground hover:text-blue-600 hover:underline transition-colors text-left">{d.masterName}</button>
                          <span className="text-muted-foreground/60">{d.status === "assigned" ? "назначен" : d.status === "responded" ? "откликнулся" : d.status === "rejected" ? "не выбран" : "ожидает"}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Unassign dialog */}
            {showUnassignDialog && (
              <div className="border border-red-200 bg-red-50 rounded-xl p-3 space-y-2.5">
                <p className="text-xs font-semibold text-red-800">Снять мастера — причина</p>
                <textarea value={unassignReason} onChange={e => setUnassignReason(e.target.value)} placeholder="Опишите причину..." rows={2} className="w-full text-xs border border-red-200 rounded-lg px-2.5 py-1.5 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-red-400" />
                <label className="flex items-center gap-2 text-xs text-red-700 cursor-pointer">
                  <input type="checkbox" checked={rebroadcastOnUnassign} onChange={e => setRebroadcastOnUnassign(e.target.checked)} className="rounded" />
                  Сразу переразослать заявку другим мастерам
                </label>
                <div className="flex gap-2">
                  <button onClick={() => { if (!unassignReason.trim()) return; unassignMutation.mutate({ orderId, reason: unassignReason, rebroadcast: rebroadcastOnUnassign, masterId: openOrder.masterId ?? undefined }); }} disabled={!unassignReason.trim() || unassignMutation.isPending} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50">{unassignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}Снять мастера</button>
                  <button onClick={() => { setShowUnassignDialog(false); setUnassignReason(""); setRebroadcastOnUnassign(false); }} className="px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50">Отмена</button>
                </div>
              </div>
            )}

            {/* Manual assign */}
            <div className="border-t border-border/50 pt-4 space-y-2">
              {!showManualAssign ? (
                <button onClick={() => setShowManualAssign(true)} className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-primary border border-primary/30 rounded-xl hover:bg-primary/5 transition-colors">
                  <UserCheck className="w-3.5 h-3.5" />Назначить мастера вручную
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Выбрать мастера</p>
                  {activeMastersLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Загрузка мастеров…
                    </div>
                  )}
                  {activeMastersError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      Ошибка загрузки мастеров. Попробуйте позже.
                    </div>
                  )}
                  {!activeMastersLoading && !activeMastersError && (
                    <div className="space-y-2">
                      <select value={selectedMasterForAssign} onChange={e => setSelectedMasterForAssign(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                        <option value="">— Выберите мастера —</option>
                        {(activeMasters ?? []).map(m => <option key={m.id} value={String(m.id)}>{m.alias}{m.city ? ` (${m.city})` : ""}</option>)}
                      </select>
                      {openOrder?.masterId && selectedMasterForAssign && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ Текущий мастер будет заменён</p>}
                      <div className="flex gap-2">
                        <button onClick={() => { setShowManualAssign(false); setSelectedMasterForAssign(""); }} className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-slate-50">Отмена</button>
                        <button onClick={() => { if (!selectedMasterForAssign) return; manualAssignMutation.mutate({ orderId, masterId: parseInt(selectedMasterForAssign) }); }} disabled={!selectedMasterForAssign || manualAssignMutation.isPending} className="flex-1 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">{manualAssignMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}Назначить</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Operator note */}
            <div className="border-t border-border/50 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Заметка оператора</p>
                {operatorNoteEdit === null && <button onClick={() => setOperatorNoteEdit(openOrder.operatorNote ?? "")} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"><Pencil className="w-3 h-3" />Редактировать</button>}
              </div>
              {operatorNoteEdit !== null ? (
                <div className="space-y-2">
                  <textarea value={operatorNoteEdit} onChange={e => setOperatorNoteEdit(e.target.value)} placeholder="Внутренняя заметка..." rows={2} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" autoFocus />
                  <div className="flex gap-2">
                    <button onClick={() => setOperatorNoteEdit(null)} className="flex-1 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-slate-50">Отмена</button>
                    <button onClick={() => orderId && saveNoteMutation.mutate({ orderId, note: operatorNoteEdit })} disabled={saveNoteMutation.isPending} className="flex-1 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1">{saveNoteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}Сохранить</button>
                  </div>
                </div>
              ) : openOrder.operatorNote ? (
                <p className="text-sm text-muted-foreground bg-slate-50 rounded-lg px-3 py-2 italic">{openOrder.operatorNote}</p>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic">Нет заметки</p>
              )}
            </div>

            {/* Сметы */}
            <div className="border-t border-border/50 pt-3">
              <button onClick={() => setShowReceipts(v => !v)} className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide">
                  <ReceiptText className="w-3.5 h-3.5" />Сметы
                  {receipts && receipts.filter(r => !r.prepaymentSubmittedAt).length > 0 && <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">{receipts.filter(r => !r.prepaymentSubmittedAt).length}</span>}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showReceipts ? "rotate-180" : ""}`} />
              </button>
              {showReceipts && (
                <div className="mt-2 space-y-2">
                  {!receipts && <div className="text-xs text-muted-foreground text-center py-2"><Loader2 className="w-3 h-3 animate-spin mx-auto" /></div>}
                  {receipts?.filter(r => !r.prepaymentSubmittedAt).map(r => (
                    <div key={r.id} className="rounded-xl p-3 space-y-1.5 bg-muted/40">
                      <div className="flex items-center justify-between">
                        <div><span className="text-xs text-muted-foreground">Бронь: </span><span className="text-sm font-bold text-primary">{Number(r.prepaymentAmount).toLocaleString("ru-RU")} ₽</span><span className="text-xs text-muted-foreground ml-1">/ {Number(r.totalAmount).toLocaleString("ru-RU")} ₽</span></div>
                        <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600">⏳ Ожидает оплаты</span>
                        <button onClick={async () => {
                          if (!window.confirm("Подтвердить получение предоплаты?")) return;
                          const resp = await fetch(`/api/receipts/${r.id}/confirm`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ operatorNote: "Подтверждено оператором" }) });
                          if (resp.ok) { toast({ title: "Предоплата подтверждена!" }); queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", orderId] }); }
                          else toast({ title: "Ошибка", variant: "destructive" });
                        }} className="ml-auto flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-1 rounded-lg font-medium hover:bg-green-700"><CheckCircle2 className="w-3 h-3" />Подтвердить</button>
                      </div>
                      {r.prepaymentScreenshotUrl && <a href={r.prepaymentScreenshotUrl} target="_blank" rel="noopener noreferrer" className="block"><img src={r.prepaymentScreenshotUrl} alt="Скриншот оплаты" className="max-h-32 rounded-lg border object-contain bg-muted" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /></a>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={r.publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline"><ExternalLink className="w-3 h-3" />Открыть</a>
                        <button onClick={() => { navigator.clipboard.writeText(r.publicUrl); toast({ title: "Ссылка скопирована!" }); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3" />Ссылка</button>
                        <button onClick={() => { if (!window.confirm("Удалить смету?")) return; deleteReceiptMutation.mutate(r.id); }} disabled={deleteReceiptMutation.isPending} className="flex items-center gap-1 text-xs text-destructive hover:opacity-80 disabled:opacity-50 ml-auto"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ))}
                  {receipts?.filter(r => r.prepaymentSubmittedAt).map(r => (
                    <div key={r.id} className="rounded-xl p-3 space-y-1.5 bg-emerald-50/60 border border-emerald-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-muted-foreground">Бронь: </span>
                          <span className="text-sm font-bold text-emerald-700">{Number(r.prepaymentAmount).toLocaleString("ru-RU")} ₽</span>
                          <span className="text-xs text-muted-foreground ml-1">/ {Number(r.totalAmount).toLocaleString("ru-RU")} ₽</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 className="w-3 h-3" />Оплачено</span>
                        {r.clientSubmittedName && <span className="text-xs text-muted-foreground">· {r.clientSubmittedName}</span>}
                      </div>
                      {r.lineItems?.length > 0 && (
                        <div className="space-y-0.5 pt-1 border-t border-emerald-100">
                          {r.lineItems.map((li, i) => (
                            <div key={i} className="flex justify-between text-xs text-muted-foreground">
                              <span className="truncate max-w-[140px]">{li.description}</span>
                              <span className="font-medium text-foreground ml-2 flex-shrink-0">{Number(li.price).toLocaleString("ru-RU")} ₽</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.prepaymentScreenshotUrl && (
                        <a href={r.prepaymentScreenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={r.prepaymentScreenshotUrl} alt="Скриншот оплаты" className="max-h-32 rounded-lg border object-contain bg-muted" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </a>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={r.publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline"><ExternalLink className="w-3 h-3" />Открыть</a>
                        <button onClick={() => { navigator.clipboard.writeText(r.publicUrl); toast({ title: "Ссылка скопирована!" }); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3" />Ссылка</button>
                        <button onClick={() => { if (!window.confirm("Удалить смету?")) return; deleteReceiptMutation.mutate(r.id); }} disabled={deleteReceiptMutation.isPending} className="flex items-center gap-1 text-xs text-destructive hover:opacity-80 disabled:opacity-50 ml-auto"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                  ))}
                  {!showCreateReceipt && !crmCreatedUrl && (
                    <button onClick={() => { setShowCreateReceipt(true); setCrmCreatedUrl(null); setCrmCopied(false); }} className="w-full flex items-center justify-center gap-1.5 text-xs text-primary font-semibold py-2 border border-dashed border-primary/40 rounded-xl hover:bg-primary/5 transition-colors">
                      <Plus className="w-3.5 h-3.5" />Создать смету
                    </button>
                  )}
                  {crmCreatedUrl && (
                    <div className="bg-green-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2 text-green-700 font-semibold text-xs"><CheckCircle2 className="w-4 h-4" />Смета создана</div>
                      <div className="bg-white rounded-lg p-2 text-xs font-mono break-all text-muted-foreground">{crmCreatedUrl}</div>
                      <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard.writeText(crmCreatedUrl!); setCrmCopied(true); setTimeout(() => setCrmCopied(false), 2000); }} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-primary text-white text-xs font-semibold">{crmCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{crmCopied ? "Скопировано" : "Скопировать"}</button>
                        <a href={crmCreatedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted"><ExternalLink className="w-3 h-3" />Открыть</a>
                      </div>
                      <button onClick={() => { setShowCreateReceipt(true); setCrmCreatedUrl(null); }} className="w-full text-xs text-primary hover:underline">+ Создать ещё</button>
                    </div>
                  )}
                  {showCreateReceipt && !crmCreatedUrl && (
                    <div className="border border-border rounded-xl p-3 space-y-3 bg-muted/20">
                      <div className="flex items-center justify-between"><p className="text-xs font-semibold text-foreground">Новая смета</p><button onClick={() => setShowCreateReceipt(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button></div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">Перечень работ</p><button onClick={() => setCrmLineItems(prev => [...prev, { description: "", unit: "", quantity: "1", price: "" }])} className="text-xs text-primary flex items-center gap-0.5 font-medium"><Plus className="w-3 h-3" />добавить</button></div>
                        {crmLineItems.map((item, i) => (
                          <div key={i} className="rounded-lg border border-border bg-muted/20 p-2 space-y-1.5 mb-2">
                            <div className="flex gap-1.5 items-center">
                              <input value={item.description} onChange={e => setCrmLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))} placeholder="Перечень работ" className="flex-1 h-7 rounded-lg border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
                              {crmLineItems.length > 1 && <button onClick={() => setCrmLineItems(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                              <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Объём</div><input type="number" value={item.quantity} onChange={e => setCrmLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: e.target.value } : it))} placeholder="1" className="w-full h-6 px-1 text-xs rounded border border-border bg-background text-center focus:outline-none" /></div>
                              <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Ед.</div><select value={item.unit} onChange={e => setCrmLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, unit: e.target.value } : it))} className="w-full h-6 px-0.5 text-[10px] rounded border border-border bg-background focus:outline-none appearance-none text-center">{UNITS.map(u => <option key={u} value={u}>{u === "" ? "—" : u}</option>)}</select></div>
                              <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Цена ₽</div><input type="number" value={item.price} onChange={e => setCrmLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, price: e.target.value } : it))} placeholder="0" className="w-full h-6 px-1 text-xs rounded border border-border bg-background font-semibold text-center focus:outline-none" /></div>
                              <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Сумма</div><div className="h-6 rounded bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">{((parseFloat(item.quantity)||1)*(parseFloat(item.price)||0))>0?((parseFloat(item.quantity)||1)*(parseFloat(item.price)||0)).toLocaleString("ru-RU"):"—"}</div></div>
                            </div>
                          </div>
                        ))}
                        {(() => { const t = crmLineItems.reduce((s, it) => s + (parseFloat(it.quantity)||1)*(parseFloat(it.price)||0), 0); return t > 0 ? (<div className="flex justify-between text-xs px-1"><span className="text-muted-foreground">Итого</span><span className="font-bold">{t.toLocaleString("ru-RU")} ₽</span></div>) : null; })()}
                      </div>
                      <div><p className="text-xs font-medium text-muted-foreground">Предоплата (₽)</p><input type="number" value={crmPrepayment} onChange={e => setCrmPrepayment(e.target.value)} className="w-full h-9 rounded-lg border-2 border-primary/40 bg-background px-3 text-sm font-bold focus:outline-none mt-0.5" placeholder="5000" /></div>
                      <div><p className="text-xs font-medium text-muted-foreground">Примечание</p><textarea value={crmNotes} onChange={e => setCrmNotes(e.target.value)} rows={2} className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none mt-0.5 resize-none" placeholder="Необязательно" /></div>
                      <button disabled={crmCreating} onClick={async () => {
                        const valid = crmLineItems.filter(it => it.description.trim() && parseFloat(it.price) > 0);
                        if (!valid.length) { toast({ title: "Добавьте хотя бы одну позицию", variant: "destructive" }); return; }
                        const prepay = parseFloat(crmPrepayment);
                        if (!prepay || prepay <= 0) { toast({ title: "Введите сумму предоплаты", variant: "destructive" }); return; }
                        if (!openOrder) return;
                        setCrmCreating(true);
                        try {
                          const resp = await fetch("/api/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ orderId, clientName: openOrder.clientName ?? "", clientPhone: openOrder.clientPhone ?? "", lineItems: valid.map(i => ({ description: i.description.trim(), unit: i.unit || undefined, quantity: parseFloat(i.quantity) > 0 ? parseFloat(i.quantity) : undefined, price: parseFloat(i.price) })), prepaymentAmount: prepay, notes: crmNotes.trim() || undefined }) });
                          if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error ?? "Ошибка"); }
                          const result = await resp.json();
                          setCrmCreatedUrl(result.publicUrl);
                          setShowCreateReceipt(false);
                          queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", orderId] });
                          setCrmLineItems([{ description: "", unit: "", quantity: "1", price: "" }]);
                          setCrmPrepayment("5000");
                          setCrmNotes("");
                        } catch (e: any) { toast({ title: e.message ?? "Ошибка", variant: "destructive" }); } finally { setCrmCreating(false); }
                      }} className="w-full h-9 rounded-lg bg-primary text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                        {crmCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Создать смету
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Timing stats */}
            {(openOrder.assignedAt || openOrder.completedAt) && (
              <div className="border-t border-border/50 pt-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" />Время в заказе</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {openOrder.createdAt && openOrder.assignedAt && <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-muted-foreground">Ожидание мастера</p><p className="font-semibold text-foreground">{timeBetween(openOrder.createdAt, openOrder.assignedAt)}</p></div>}
                  {openOrder.assignedAt && openOrder.completedAt && <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-muted-foreground">Время работы</p><p className="font-semibold text-foreground">{timeBetween(openOrder.assignedAt, openOrder.completedAt)}</p></div>}
                </div>
              </div>
            )}

            {/* Status log */}
            <div className="border-t border-border/50 pt-3">
              <button onClick={() => setShowStatusLog(v => !v)} className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide"><History className="w-3.5 h-3.5" />История статусов</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showStatusLog ? "rotate-180" : ""}`} />
              </button>
              {showStatusLog && statusLog && (
                <div className="mt-2 relative pl-4 space-y-0">
                  <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                  {statusLog.map(entry => (
                    <div key={entry.id} className="relative flex gap-3 py-1.5">
                      <div className="absolute -left-2.5 top-2.5 w-2 h-2 rounded-full bg-primary/40 border-2 border-background" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground">{entry.oldStatus ? `${STATUS_ORDER_LABELS[entry.oldStatus] ?? entry.oldStatus} → ` : ""}<b>{STATUS_ORDER_LABELS[entry.newStatus] ?? entry.newStatus}</b></p>
                        <p className="text-[10px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{entry.userAlias ? ` · ${entry.userAlias}` : ""}{entry.note ? ` · ${entry.note}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
