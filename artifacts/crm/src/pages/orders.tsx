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
  ClipboardList, CalendarDays, ChevronDown, AlertTriangle,
  FileText, History, Timer, RefreshCw, CopyX, XCircle, ReceiptText, ExternalLink, Plus, Copy,
  Bell, Printer, Lock, Banknote, Diamond,
} from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function resolvePhotoUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}

function printReceipt(r: {
  id: number;
  clientName: string;
  clientPhone: string;
  createdAt: string;
  lineItems: { description: string; unit?: string; quantity?: number; price: number }[];
  totalAmount: number;
  prepaymentAmount: number;
  notes: string | null;
}, order?: { city?: string; district?: string | null; serviceType?: string; area?: number } | null) {
  const date = new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const fmtNum = (n: number) => Number(n).toLocaleString("ru-RU");
  const rows = (r.lineItems ?? []).map((item, i) => {
    const qty = item.quantity ?? 1;
    const total = qty * item.price;
    return `<tr>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;">${item.description}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${item.unit ?? "—"}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;">${qty}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;">${fmtNum(item.price)}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-weight:600;">${fmtNum(total)}</td>
    </tr>`;
  }).join("");

  const orderInfo = order
    ? `${order.serviceType ?? ""}${order.city ? `, ${order.city}` : ""}${order.district ? ` (${order.district})` : ""}${order.area ? `, ${order.area} м²` : ""}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<title>Смета №${r.id}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #000; background: #fff; padding: 32px; }
  h1 { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 12px; color: #444; margin-bottom: 24px; }
  .meta { margin-bottom: 16px; }
  .meta table { width: 100%; }
  .meta td { padding: 3px 0; font-size: 13px; }
  .meta td:first-child { color: #555; width: 180px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 16px; }
  table.items th { padding: 7px 8px; border: 1px solid #ccc; background: #f0f0f0; font-size: 12px; text-align: left; }
  table.items th:nth-child(n+3) { text-align: center; }
  .total-row td { padding: 8px; border: 1px solid #ccc; font-size: 14px; }
  .summary { margin-top: 16px; text-align: right; }
  .summary p { font-size: 14px; margin-bottom: 4px; }
  .summary p.main { font-size: 16px; font-weight: bold; }
  .notes { margin-top: 16px; padding: 10px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; color: #333; }
  .signature { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #333; }
  .signature div { flex: 1; padding-right: 24px; }
  .sig-line { margin-top: 24px; border-top: 1px solid #000; }
  @media print { body { padding: 16px; } button { display: none !important; } }
</style>
</head>
<body>
<h1>СМЕТА №${r.id}</h1>
<div class="subtitle">Честный мастер · sfera-master.ru</div>
<hr style="border:none;border-top:1px solid #ccc;margin-bottom:20px;"/>
<div class="meta">
  <table>
    <tr><td>Дата составления:</td><td><strong>${date}</strong></td></tr>
    <tr><td>Клиент:</td><td><strong>${r.clientName}</strong></td></tr>
    <tr><td>Телефон клиента:</td><td>${r.clientPhone}</td></tr>
    ${orderInfo ? `<tr><td>Объект / услуга:</td><td>${orderInfo}</td></tr>` : ""}
  </table>
</div>
<table class="items">
  <thead>
    <tr>
      <th style="width:36px;text-align:center;">№</th>
      <th>Наименование работ / материалов</th>
      <th style="width:70px;text-align:center;">Ед.</th>
      <th style="width:60px;text-align:center;">Кол-во</th>
      <th style="width:90px;text-align:right;">Цена, ₽</th>
      <th style="width:100px;text-align:right;">Сумма, ₽</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="summary">
  <p>Итого: <strong>${fmtNum(r.totalAmount)} ₽</strong></p>
  <p class="main">Предоплата (бронирование): <strong>${fmtNum(r.prepaymentAmount)} ₽</strong></p>
</div>
${r.notes ? `<div class="notes"><strong>Примечания:</strong> ${r.notes}</div>` : ""}
<div class="signature">
  <div>
    <p>Исполнитель: ____________________________</p>
    <div class="sig-line"></div>
    <p style="margin-top:4px;">подпись / дата</p>
  </div>
  <div>
    <p>Заказчик: ______________________________</p>
    <div class="sig-line"></div>
    <p style="margin-top:4px;">подпись / дата</p>
  </div>
</div>
<script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
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

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function timeSince(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч`;
  const d = Math.floor(h / 24);
  return `${d}д ${h % 24}ч`;
}

function timeBetween(start: string | Date, end: string | Date): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч ${m % 60}мин`;
  const d = Math.floor(h / 24);
  return `${d}д ${h % 24}ч`;
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

const UNITS = ["", "шт", "м²", "м³", "м.п.", "м", "кг", "т", "л", "упак.", "компл.", "ч"];

const STATUS_LABELS: Record<string, string> = {
  waiting_master: "Ожидает мастера",
  master_assigned: "Мастер назначен",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
  cancellation_requested: "Запрос на отмену",
};

export default function Orders() {
  const [location, setLocation] = useLocation();
  const [openDispatchId, setOpenDispatchId] = useState<number | null>(null);
  const [editAmountId, setEditAmountId] = useState<number | null>(null);
  const [notifCopied, setNotifCopied] = useState(false);
  const [editAmountValue, setEditAmountValue] = useState("");
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") ?? "";
  });
  const [dateFilter, setDateFilter] = useState<"all"|"today"|"yesterday"|"week"|"month">("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [paymentModelFilter, setPaymentModelFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("pm") ?? "all";
  });
  const highlightId = parseInt(new URLSearchParams(window.location.search).get("highlight") ?? "") || null;
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);

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

  const { data: orders, isLoading } = useGetOrders({}, { query: { queryKey: ["/api/orders"], refetchInterval: 8000 } });

  useEffect(() => {
    if (highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, orders]);

  // Sync paymentModel filter with URL
  useEffect(() => {
    const url = new URL(window.location.href);
    if (paymentModelFilter !== "all") {
      url.searchParams.set("pm", paymentModelFilter);
    } else {
      url.searchParams.delete("pm");
    }
    window.history.replaceState({}, "", url);
  }, [paymentModelFilter]);

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

  const resendMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/dispatch/${orderId}/resend`, { method: "POST", credentials: "include" });
      if (!r.ok) {
        const text = await r.text();
        let msg = "Ошибка сервера";
        try { msg = JSON.parse(text).error ?? msg; } catch {}
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Повторная рассылка запущена", description: "Неответившим мастерам отправлено напоминание" });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
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
    onError: (e: Error) => toast({ title: "Ошибка назначения", description: e.message, variant: "destructive" }),
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

  const restoreOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ restoreOrder: true }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setOpenDispatchId(null);
      setStatusFilter("active");
      const restoredStatus = data?.status === "master_assigned" ? "Мастер назначен" : "Ожидает мастера";
      toast({ title: "Заказ восстановлен", description: `Статус: ${restoredStatus}` });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
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

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: number; reason: string }) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "cancelled", clientCancelReason: reason }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch/pending"] });
      setOpenDispatchId(null);
      setShowCancelDialog(false);
      setCancelDialogReason("");
      setCancelDialogNote("");
      setStatusFilter("active");
      toast({ title: "Заказ отменён", description: "Убран из активных. Найти в истории: фильтр → Отменён." });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const [showManualAssign, setShowManualAssign] = useState(false);
  const [selectedMasterForAssign, setSelectedMasterForAssign] = useState<string>("");
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [unassignReason, setUnassignReason] = useState("");
  const [rebroadcastOnUnassign, setRebroadcastOnUnassign] = useState(false);
  const [operatorNoteEdit, setOperatorNoteEdit] = useState<string | null>(null);
  const [showStatusLog, setShowStatusLog] = useState(false);
  const [showReceipts, setShowReceipts] = useState(false);
  const [showPendingReview, setShowPendingReview] = useState(true);
  const [showPaidCommissions, setShowPaidCommissions] = useState(false);
  const [showCreateReceipt, setShowCreateReceipt] = useState(false);
  const [crmLineItems, setCrmLineItems] = useState([{ description: "", unit: "", quantity: "1", price: "" }]);
  const [crmPrepayment, setCrmPrepayment] = useState("5000");
  const [crmNotes, setCrmNotes] = useState("");
  const [crmCreating, setCrmCreating] = useState(false);
  const [crmCreatedUrl, setCrmCreatedUrl] = useState<string | null>(null);
  const [crmCopied, setCrmCopied] = useState(false);
  const [editingCrmReceiptId, setEditingCrmReceiptId] = useState<number | null>(null);
  const [crmEditLineItems, setCrmEditLineItems] = useState([{ description: "", unit: "", quantity: "1", price: "" }]);
  const [crmEditPrepayment, setCrmEditPrepayment] = useState("5000");
  const [crmEditNotes, setCrmEditNotes] = useState("");
  const [crmEditing, setCrmEditing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelDialogReason, setCancelDialogReason] = useState("");
  const [cancelDialogNote, setCancelDialogNote] = useState("");
  const [showPartialPayment, setShowPartialPayment] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialNote, setPartialNote] = useState("");

  const partialPaymentMutation = useMutation({
    mutationFn: async ({ orderId, amount, note }: { orderId: number; amount: number; note?: string }) => {
      const r = await fetch(`/api/work-board/orders/${orderId}/partial-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount, note }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setShowPartialPayment(false);
      setPartialAmount("");
      setPartialNote("");
      toast({ title: "Частичная оплата добавлена", description: `Остаток комиссии: ${Number(data.remaining).toLocaleString("ru-RU")} ₽` });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const { data: activeMasters } = useQuery<{ id: number; alias: string; city: string | null; tokensBalance: number; creditLimitTokens: number }[]>({
    queryKey: ["/api/masters"],
    queryFn: async () => {
      const r = await fetch("/api/masters", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      return (data as any[])
        .filter((m: any) => m.status === "active")
        .map(m => ({ id: m.id, alias: m.alias, city: m.city, tokensBalance: m.tokensBalance ?? 0, creditLimitTokens: m.creditLimitTokens ?? 0 }));
    },
    staleTime: 30000,
  });

  const unassignMutation = useMutation({
    mutationFn: async ({ orderId, reason, rebroadcast }: { orderId: number; reason: string; rebroadcast: boolean }) => {
      const r = await fetch(`/api/orders/${orderId}/unassign-master`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, rebroadcast }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", openDispatchId, "status-log"] });
      broadcastMutation.reset();
      setShowUnassignDialog(false);
      setUnassignReason("");
      setRebroadcastOnUnassign(false);
      const rebroadcastInfo = data?.rebroadcast?.ok ? ` Разослано ${data.rebroadcast.sent} мастерам.` : "";
      toast({ title: "Мастер снят с заказа", description: `Снят успешно.${rebroadcastInfo}` });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ orderId, note }: { orderId: number; note: string }) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorNote: note }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setOperatorNoteEdit(null);
      toast({ title: "Заметка сохранена" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const { data: statusLog } = useQuery<StatusLogEntry[]>({
    queryKey: ["/api/orders", openDispatchId, "status-log"],
    queryFn: async () => {
      const r = await fetch(`/api/orders/${openDispatchId}/status-log`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!openDispatchId && showStatusLog,
  });

  interface ReceiptEntry { id: number; token: string; prepaymentAmount: number; totalAmount: number; notes: string | null; clientName: string; clientPhone: string; createdAt: string; publicUrl: string; lineItems: { description: string; unit?: string; quantity?: number; price: number }[]; prepaymentSubmittedAt: string | null; clientSubmittedName: string | null; prepaymentScreenshotUrl: string | null; prepaymentSeenAt: string | null; }
  const { data: receipts } = useQuery<ReceiptEntry[]>({
    queryKey: ["/api/receipts/order", openDispatchId],
    queryFn: async () => {
      const r = await fetch(`/api/receipts/order/${openDispatchId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!openDispatchId,
  });

  const { data: fomoPresses } = useQuery<Array<{
    id: number; masterId: number; masterAlias: string | null; reason: string | null; createdAt: string;
  }>>({
    queryKey: ["/api/orders", openDispatchId, "fomo-presses"],
    queryFn: async () => {
      const r = await fetch(`/api/orders/${openDispatchId}/fomo-presses`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!openDispatchId,
    refetchInterval: 15_000,
  });

  const deleteReceiptMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/receipts/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", openDispatchId] });
      toast({ title: "Смета удалена" });
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
      setTimeout(() => {
        setShowManualAssign(false);
        setSelectedMasterForAssign("");
        toast({ title: "Мастер назначен вручную" });
      }, 0);
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const setStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  interface PendingDispatch {
    orderId: number;
    leadId: number | null;
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
  const pendingDispatched = dispatchData?.dispatches.filter(d => d.status === "sent") ?? [];

  const pendingAmountOrders = orders?.filter(o => (o as any).proposedAmount && !(o as any).orderAmount) ?? [];
  const cancellationOrders = orders?.filter(o => o.status === "cancellation_requested" as any) ?? [];
  const pendingResponseOrders = pendingDispatches ?? [];

  const getOrderPaymentModel = (orderId: number) => {
    const o = orders?.find(x => x.id === orderId);
    return ((o as any)?.paymentModel ?? "commission") as string;
  };
  const tokenPendingResponses = pendingResponseOrders.filter(p => getOrderPaymentModel(p.orderId) === "token");
  const commissionPendingResponses = pendingResponseOrders.filter(p => getOrderPaymentModel(p.orderId) === "commission");

  const availableCities = useMemo(() => {
    if (!orders) return [];
    const cities = Array.from(new Set(orders.map(o => o.city).filter(Boolean) as string[]));
    return cities.sort((a, b) => a.localeCompare(b, "ru"));
  }, [orders]);

  const activeFilterCount = [
    dateFilter !== "all" ? 1 : 0,
    statusFilter !== "all" ? 1 : 0,
    cityFilter !== "all" ? 1 : 0,
    paymentModelFilter !== "all" ? 1 : 0,
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
          (o.leadId != null && String(o.leadId).includes(q)) ||
          o.city?.toLowerCase().includes(q) ||
          (o as any).district?.toLowerCase().includes(q) ||
          o.serviceType?.toLowerCase().includes(q) ||
          o.masterName?.toLowerCase().includes(q) ||
          (o as any).clientPhone?.toLowerCase().includes(q);
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
      if (paymentModelFilter !== "all" && ((o as any).paymentModel ?? "commission") !== paymentModelFilter) return false;

      return true;
    }).sort((a, b) => {
      // When showing all, token orders come first
      if (paymentModelFilter === "all") {
        const aToken = ((a as any).paymentModel ?? "commission") === "token" ? 1 : 0;
        const bToken = ((b as any).paymentModel ?? "commission") === "token" ? 1 : 0;
        if (aToken !== bToken) return bToken - aToken;
      }
      // Within group, sort by createdAt desc (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [orders, search, dateFilter, statusFilter, cityFilter, paymentModelFilter]);

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
              {cancellationOrders.map(order => {
                const ct = (order as any).cancelType as string | null;
                const cancelTypeMeta: Record<string, { label: string; badge: string; hint?: string }> = {
                  client_refused:     { label: "Клиент отказался",          badge: "bg-blue-100 text-blue-800",    hint: "Рекомендуется: Отменить заказ" },
                  price_disagreement: { label: "Не договорились по цене",   badge: "bg-amber-100 text-amber-800",  hint: "Рекомендуется: Назначить другого мастера" },
                  master_cant:        { label: "Мастер не может выполнить", badge: "bg-orange-100 text-orange-800", hint: "Рекомендуется: Назначить другого мастера" },
                  other:              { label: "Другая причина",             badge: "bg-slate-100 text-slate-700" },
                };
                const meta = ct ? cancelTypeMeta[ct] : null;
                return (
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
                            if (confirm(`Назначить другого мастера на заказ #${order.id}? Текущий мастер будет откреплён.`)) {
                              rejectCancellationMutation.mutate(order.id);
                            }
                          }}
                          disabled={rejectCancellationMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Назначить другого
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Отменить заказ #${order.id}? Заказ будет закрыт.`)) {
                              approveCancellationMutation.mutate(order.id);
                            }
                          }}
                          disabled={approveCancellationMutation.isPending}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500 text-white hover:bg-red-600 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                        >
                          {approveCancellationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                          Отменить заказ
                        </button>
                      </div>
                    </div>
                    {meta && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${meta.badge}`}>
                          {meta.label}
                        </span>
                        {meta.hint && (
                          <span className="text-xs text-muted-foreground">{meta.hint}</span>
                        )}
                      </div>
                    )}
                    {(order as any).cancelReason && (
                      <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                        <span className="font-medium">Комментарий мастера: </span>{(order as any).cancelReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Token pending responses banner */}
          {tokenPendingResponses.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm mb-1">
                <Diamond className="w-4 h-4" />
                {tokenPendingResponses.length === 1
                  ? `1 токеновая заявка — есть отклики`
                  : `${tokenPendingResponses.length} токеновые заявки — есть отклики`}
              </div>
              {tokenPendingResponses.map(item => (
                <div key={item.orderId} className="bg-white rounded-xl border border-emerald-100 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                      <span className="font-medium text-foreground">#{item.orderId}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-foreground">{item.serviceType}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground text-xs">{item.city}{item.district ? `, ${item.district}` : ""}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                        <UserCheck className="w-3 h-3" />
                        {item.respondentCount} {item.respondentCount === 1 ? "отклик" : item.respondentCount < 5 ? "отклика" : "откликов"}
                      </span>
                    </div>
                    <button
                      onClick={() => setOpenDispatchId(item.orderId)}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white hover:bg-emerald-600 rounded-lg font-medium text-xs transition-colors"
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-medium transition-colors"
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

          {/* Commission pending responses banner */}
          {commissionPendingResponses.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-1">
                <Users className="w-4 h-4" />
                {commissionPendingResponses.length === 1
                  ? `1 комиссионная заявка — есть отклики`
                  : `${commissionPendingResponses.length} комиссионные заявки — есть отклики`}
              </div>
              {commissionPendingResponses.map(item => (
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
                    onClick={() => { setDateFilter("all"); setStatusFilter("all"); setCityFilter("all"); setPaymentModelFilter("all"); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Сбросить ({activeFilterCount})
                  </button>
                )}
                {!isLoading && (() => {
                  const cancelledCount = orders?.filter(o => o.status === "cancelled").length ?? 0;
                  return (
                    <div className="flex items-center gap-2 ml-auto">
                      {cancelledCount > 0 && statusFilter !== "cancelled" && (
                        <button
                          onClick={() => setStatusFilter("cancelled")}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-200 transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                          Отменённые: {cancelledCount}
                        </button>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {filteredOrders.length} {filteredOrders.length === 1 ? "заказ" : filteredOrders.length < 5 ? "заказа" : "заказов"}
                        {orders && filteredOrders.length !== orders.length && (
                          <span className="text-muted-foreground/60"> из {orders.length}</span>
                        )}
                      </span>
                    </div>
                  );
                })()}
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

                {/* Payment model tabs */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-0.5">
                  {([
                    { key: "all" as string, label: "Все", icon: undefined },
                    { key: "token" as string, label: "Токены", icon: Diamond },
                    { key: "commission" as string, label: "Комиссия", icon: Banknote },
                  ]).map(t => {
                    const isActive = paymentModelFilter === t.key;
                    const count = t.key === "all" ? orders?.length ?? 0
                      : orders?.filter(o => ((o as any).paymentModel ?? "token") === t.key).length ?? 0;
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

              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50 text-xs">
                  <tr>
                    <th className="px-3 py-2.5 pl-4">Статус</th>
                    <th className="px-3 py-2.5">ID</th>
                    <th className="px-3 py-2.5">Услуга · Локация</th>
                    <th className="px-3 py-2.5">Клиент</th>
                    <th className="px-3 py-2.5">Мастер</th>
                    <th className="px-3 py-2.5">Сумма</th>
                    <th className="px-3 py-2.5 pr-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        {search ? "Ничего не найдено" : "Заказов в буфере нет"}
                      </td>
                    </tr>
                  ) : filteredOrders.map((order) => {
                    const ds = (order as any).dispatchStatus ?? "none";
                    const proposed = (order as any).proposedAmount ? Number((order as any).proposedAmount) : null;
                    const confirmed = (order as any).orderAmount ? Number((order as any).orderAmount) : null;
                    const pendingResp = pendingResponseOrders.find(p => p.orderId === order.id);
                    const waitH = (Date.now() - new Date(order.createdAt).getTime()) / 3600000;
                    const openPanel = () => { setOpenDispatchId(order.id); broadcastMutation.reset(); };
                    const isToken = ((order as any).paymentModel ?? "token") === "token";
                    return (
                      <tr
                        key={order.id}
                        ref={order.id === highlightId ? highlightRowRef : undefined}
                        onClick={openPanel}
                        className={`cursor-pointer transition-colors ${
                          isToken ? "border-l-4 border-l-emerald-400 " : ""
                        }${
                          order.status === "cancelled"
                            ? "opacity-50 bg-slate-50/60 hover:opacity-70"
                            : order.id === highlightId ? "bg-primary/5 ring-2 ring-inset ring-primary/40 hover:bg-slate-50"
                            : proposed && !confirmed ? "bg-amber-50/40 hover:bg-slate-50"
                            : pendingResp ? "bg-blue-50/40 hover:bg-slate-50"
                            : (order as any).source === "client_site" && order.status === "waiting_master" && waitH > 0.5
                              ? "bg-red-50/60 hover:bg-red-50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        {/* Status */}
                        <td className="px-3 py-2.5 pl-4">
                          <StatusBadge status={order.status} type="order" />
                          <div className="mt-0.5">
                            {((order as any).paymentModel ?? "token") === "token" ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                Токены
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                                Комиссия
                              </span>
                            )}
                          </div>
                          {order.status === "waiting_master" && (
                            <div className={`flex items-center gap-1 mt-0.5 text-[10px] font-medium ${waitH > 24 ? "text-red-500" : "text-amber-500"}`}>
                              <Timer className="w-2.5 h-2.5" />
                              {timeSince(order.createdAt)}
                              {waitH > 24 && <AlertTriangle className="w-2.5 h-2.5" />}
                            </div>
                          )}
                        </td>

                        {/* ID + date */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">#{order.id}</span>
                            {(order as any).source === "client_site" && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                                С сайта
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(order.createdAt)}</div>
                        </td>

                        {/* Service + location */}
                        <td className="px-3 py-2.5 max-w-[260px]">
                          <p className="font-medium text-foreground truncate">{order.serviceType}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {order.area} м² · {order.city}{order.district ? `, ${order.district}` : ""}
                            {order.scheduledAt && (
                              <span className="text-blue-500 ml-1">
                                · {new Date(order.scheduledAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </p>
                        </td>

                        {/* Client */}
                        <td className="px-3 py-2.5 max-w-[140px]">
                          {(order as any).clientName ? (
                            <p className="text-sm font-medium text-foreground truncate">{(order as any).clientName}</p>
                          ) : null}
                          {(order as any).clientPhone ? (
                            <a
                              href={`tel:${(order as any).clientPhone}`}
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {(order as any).clientPhone}
                            </a>
                          ) : (
                            !((order as any).clientName) && <span className="text-muted-foreground/40 text-xs">—</span>
                          )}
                        </td>

                        {/* Master */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {order.masterName ? (
                            <button
                              onClick={e => { e.stopPropagation(); order.masterId && openMasterChat(order.masterId); }}
                              className="text-sm font-medium text-left hover:text-blue-600 hover:underline transition-colors max-w-[120px] truncate block"
                            >
                              {order.masterName}
                            </button>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs italic">Не назначен</span>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {confirmed ? (
                            <div>
                              <span className="font-semibold text-foreground">{fmt(confirmed)}</span>
                              {(order as any).commission && (
                                <div className="text-[10px] text-muted-foreground">ком. {fmt(Number((order as any).commission))}</div>
                              )}
                            </div>
                          ) : proposed ? (
                            <div>
                              <span className="text-[10px] text-amber-600 font-medium block">предложено</span>
                              <span className="font-semibold text-amber-700">{fmt(proposed)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2.5 pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Dispatch / response badge */}
                            {ds === "dispatching" && pendingResp && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500 text-white rounded-full px-2 py-0.5 font-medium">
                                <Users className="w-2.5 h-2.5" />{pendingResp.respondentCount}
                              </span>
                            )}
                            {ds === "dispatching" && !pendingResp && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 font-medium">
                                <Clock className="w-2.5 h-2.5" />Разослано
                              </span>
                            )}
                            {ds === "assigned" && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium">
                                <CheckCircle2 className="w-2.5 h-2.5" />Назначен
                              </span>
                            )}
                            {order.status === OrderStatus.waiting_master && ds === "none" && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 font-medium">
                                <Send className="w-2.5 h-2.5" />Разослать
                              </span>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); setLocation(`/tasks?newOrder=${order.id}`); }}
                              title="Создать задачу"
                              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-all"
                            >
                              <ClipboardList className="w-3.5 h-3.5" />
                            </button>
                            {order.status === "cancelled" ? (
                              <button
                                onClick={e => { e.stopPropagation(); restoreOrderMutation.mutate(order.id); }}
                                title="Восстановить заказ"
                                disabled={restoreOrderMutation.isPending}
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-emerald-600 hover:bg-emerald-50 border border-emerald-200 hover:border-emerald-400 transition-all"
                              >
                                {restoreOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                Восстановить
                              </button>
                            ) : (
                              <button
                                disabled={deleteOrderMutation.isPending}
                                onClick={e => { e.stopPropagation(); if (confirm(`Переместить заказ #${order.id} в корзину?`)) deleteOrderMutation.mutate(order.id); }}
                                title="В корзину"
                                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

        {/* Order Detail Panel */}
        {openDispatchId && openOrder && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="px-6 py-4 border-b border-border/50 flex items-start justify-between flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-display font-bold text-foreground">Заказ #{openDispatchId}</h2>
                    <StatusBadge status={openOrder.status} type="order" />
                    {openOrder.leadId && (
                      <a
                        href={`/leads?openLead=${openOrder.leadId}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/70 hover:text-primary border border-primary/20 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 rounded-full px-2 py-0.5 transition-all"
                        title="Открыть в разделе Заявки"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />Открыть заявку
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{openOrder.serviceType} · {openOrder.city}{openOrder.district ? `, ${openOrder.district}` : ""}</p>
                </div>
                <button onClick={() => { setOpenDispatchId(null); setShowManualAssign(false); setSelectedMasterForAssign(""); setShowStatusLog(false); setShowReceipts(false); setShowCreateReceipt(false); setCrmCreatedUrl(null); setCrmLineItems([{ description: "", unit: "", quantity: "1", price: "" }]); setCrmPrepayment("5000"); setCrmNotes(""); setOperatorNoteEdit(null); setShowCancelDialog(false); setCancelDialogReason(""); setCancelDialogNote(""); setEditingCrmReceiptId(null); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 flex-shrink-0 ml-2">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1">
              <div className="p-6 space-y-4">

                {/* Order details card */}
                <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Дата заявки</p>
                      <p className="font-medium text-foreground">{formatDate(openOrder.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Площадь</p>
                      <p className="font-medium text-foreground">{openOrder.area} м²</p>
                    </div>
                    {(openOrder as any).clientPhone && (
                      <div className="col-span-2">
                        <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide mb-1">Клиент</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <a href={`tel:${(openOrder as any).clientPhone}`} className="font-medium text-blue-600 hover:underline">{(openOrder as any).clientPhone}</a>
                          <button
                            onClick={() => {
                              const master = openOrder.masterName ?? "мастер";
                              const service = openOrder.serviceType ?? "услуга";
                              const city = openOrder.city ?? "";
                              const scheduled = openOrder.scheduledAt
                                ? new Date(openOrder.scheduledAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
                                : null;
                              const text = openOrder.status === "master_assigned"
                                ? `Здравствуйте! Мастер ${master} назначен на вашу заявку (${service}${city ? `, ${city}` : ""}).${scheduled ? ` Дата визита: ${scheduled}.` : ""} По вопросам пишите или звоните — sfera-master.ru`
                                : openOrder.status === "in_progress"
                                ? `Здравствуйте! Мастер ${master} уже выполняет работы по вашему заказу (${service}${city ? `, ${city}` : ""}). По вопросам пишите или звоните — sfera-master.ru`
                                : `Здравствуйте! Ваша заявка (${service}${city ? `, ${city}` : ""}) принята в обработку. Мы свяжемся с вами в ближайшее время — sfera-master.ru`;
                              navigator.clipboard.writeText(text).then(() => {
                                setNotifCopied(true);
                                setTimeout(() => setNotifCopied(false), 2500);
                              });
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
                          >
                            {notifCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Bell className="w-3 h-3" />}
                            {notifCopied ? "Скопировано!" : "Уведомить клиента"}
                          </button>
                        </div>
                      </div>
                    )}
                    {openOrder.scheduledAt && (
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Дата визита</p>
                        <p className="font-medium text-blue-600">{new Date(openOrder.scheduledAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    )}
                    {openOrder.masterName && (
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Мастер</p>
                        <button onClick={() => openOrder.masterId && openMasterChat(openOrder.masterId)} className="font-medium text-blue-600 hover:underline text-left">{openOrder.masterName}</button>
                      </div>
                    )}
                    {openOrder.masterId && receipts && receipts.length === 0 && ["master_assigned","in_progress"].includes(openOrder.status) && (
                      <div className="col-span-2 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-400">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        Смета не создана — клиент не может внести предоплату
                      </div>
                    )}
                    {(() => {
                      const confirmed = (openOrder as any).orderAmount ? Number((openOrder as any).orderAmount) : null;
                      const proposed = (openOrder as any).proposedAmount ? Number((openOrder as any).proposedAmount) : null;
                      if (confirmed) return (
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Сумма</p>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">{fmt(confirmed)}</span>
                            <button onClick={() => { setEditAmountId(openDispatchId); setEditAmountValue(String(confirmed)); }} className="text-muted-foreground/50 hover:text-primary">
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                          {(openOrder as any).commission && <p className="text-[10px] text-muted-foreground">ком. {fmt(Number((openOrder as any).commission))}</p>}
                        </div>
                      );
                      if (proposed) return (
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Предложено</p>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-amber-700">{fmt(proposed)}</span>
                            <button onClick={() => { setEditAmountId(openDispatchId); setEditAmountValue(String(proposed)); }} className="text-amber-400 hover:text-amber-700">
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                      return (
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Сумма</p>
                          <button onClick={() => { setEditAmountId(openDispatchId); setEditAmountValue(""); }} className="text-xs text-primary hover:underline flex items-center gap-1">
                            <Pencil className="w-3 h-3" />Указать сумму
                          </button>
                        </div>
                      );
                    })()}
                    {((openOrder as any).paymentModel ?? "token") === "token" && (
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Токены</p>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-amber-700">
                            {(openOrder as any).tokensCharged ? Number((openOrder as any).tokensCharged) : ((openOrder as any).manualTokenCost ? Number((openOrder as any).manualTokenCost) : "—")} т.
                          </span>
                          <button
                            onClick={() => {
                              const val = prompt("Укажите стоимость в токенах:", String((openOrder as any).manualTokenCost ?? ""));
                              if (val !== null) {
                                const num = parseFloat(val);
                                if (!isNaN(num) && num >= 0) {
                                  fetch(`/api/orders/${openDispatchId}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    credentials: "include",
                                    body: JSON.stringify({ manualTokenCost: num }),
                                  }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }));
                                }
                              }
                            }}
                            className="text-muted-foreground/50 hover:text-primary"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {openOrder.comment && (
                    <div className="pt-1.5 border-t border-border/40">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide mb-1">Комментарий</p>
                      <p className="text-sm text-foreground">{openOrder.comment}</p>
                    </div>
                  )}
                  {/* Quick actions */}
                  <div className="pt-1.5 border-t border-border/40 flex items-center gap-2 flex-wrap">
                    {openOrder.masterId && (
                      <button onClick={() => openMasterChat(openOrder.masterId!)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-medium text-foreground hover:bg-slate-100 transition-colors">
                        <MessageSquare className="w-3 h-3" />Чат с мастером
                      </button>
                    )}
                    <button onClick={() => { setOpenDispatchId(null); setLocation(`/tasks?newOrder=${openDispatchId}`); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-medium text-foreground hover:bg-slate-100 transition-colors">
                      <ClipboardList className="w-3 h-3" />Создать задачу
                    </button>
                    {openOrder.masterId && (
                      <button
                        onClick={() => {
                          if (!(openOrder as any).orderAmount) {
                            setEditAmountId(openDispatchId);
                            setEditAmountValue("");
                            toast({ title: "Укажите сумму заказа", description: "Чтобы добавить частичную оплату комиссии, сначала укажите сумму заказа" });
                            return;
                          }
                          setShowPartialPayment(!showPartialPayment);
                          setPartialAmount("");
                          setPartialNote("");
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                      >
                        <Banknote className="w-3 h-3" />{(openOrder as any).orderAmount ? "Частичная оплата" : "Оплата комиссии"}
                      </button>
                    )}
                    {openOrder.status === "cancelled" && (
                      <button
                        onClick={() => restoreOrderMutation.mutate(openDispatchId!)}
                        disabled={restoreOrderMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        {restoreOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Восстановить заказ
                      </button>
                    )}
                    {openOrder.status === "master_assigned" && (
                      <button
                        onClick={() => setStatusMutation.mutate({ orderId: openDispatchId!, status: "in_progress" })}
                        disabled={setStatusMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-300 rounded-lg text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50"
                      >
                        {setStatusMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                        В работе
                      </button>
                    )}
                    {openOrder.status === "in_progress" && (
                      <button
                        onClick={() => { if (confirm(`Завершить заказ #${openDispatchId}?`)) setStatusMutation.mutate({ orderId: openDispatchId!, status: "completed" }); }}
                        disabled={setStatusMutation.isPending}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white border border-emerald-500 rounded-lg text-xs font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                      >
                        {setStatusMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Завершить
                      </button>
                    )}
                    {openOrder.status !== "cancelled" && openOrder.status !== "completed" && !showCancelDialog && (
                      <button
                        onClick={() => { setShowCancelDialog(true); setCancelDialogReason(""); setCancelDialogNote(""); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors"
                      >
                        <XCircle className="w-3 h-3" />Отменить заказ
                      </button>
                    )}
                    <button onClick={() => { if (confirm(`Переместить заказ #${openDispatchId} в корзину?`)) { deleteOrderMutation.mutate(openDispatchId!); setOpenDispatchId(null); } }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3 h-3" />В корзину
                    </button>
                  </div>

                  {/* Partial payment form */}
                  {showPartialPayment && (
                    <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2.5">
                      <p className="text-xs font-semibold text-emerald-800">Частичная оплата комиссии</p>
                      <p className="text-xs text-emerald-600">Сумма, которую мастер внёс в счёт оплаты комиссии по заказу #{openDispatchId}</p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            value={partialAmount}
                            onChange={e => setPartialAmount(e.target.value)}
                            placeholder="Сумма, ₽"
                            className="w-full pr-8 pl-3 py-1.5 text-sm border border-emerald-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            autoFocus
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-400 text-xs">₽</span>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={partialNote}
                        onChange={e => setPartialNote(e.target.value)}
                        placeholder="Примечание (необязательно)"
                        className="w-full px-3 py-1.5 text-xs border border-emerald-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const amt = parseFloat(partialAmount);
                            if (!isNaN(amt) && amt > 0) {
                              partialPaymentMutation.mutate({ orderId: openDispatchId!, amount: amt, note: partialNote.trim() || undefined });
                            }
                          }}
                          disabled={!partialAmount || parseFloat(partialAmount) <= 0 || partialPaymentMutation.isPending}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {partialPaymentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Banknote className="w-3 h-3" />}
                          Добавить оплату
                        </button>
                        <button
                          onClick={() => { setShowPartialPayment(false); setPartialAmount(""); setPartialNote(""); }}
                          className="px-3 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          Отмена
                        </button>
                      </div>
                      {partialPaymentMutation.isError && (
                        <p className="text-xs text-red-600">{(partialPaymentMutation.error as Error).message}</p>
                      )}
                    </div>
                  )}

                  {/* Inline cancel dialog */}
                  {showCancelDialog && openOrder.status !== "cancelled" && openOrder.status !== "completed" && (
                    <div className="border border-orange-200 bg-orange-50 rounded-xl p-3 space-y-2.5">
                      <p className="text-xs font-semibold text-orange-800">Причина отмены заказа</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { value: "client_changed_mind", label: "Передумал" },
                          { value: "found_cheaper", label: "Нашёл дешевле" },
                          { value: "found_other_master", label: "Другой мастер" },
                          { value: "no_answer", label: "Не берёт трубку" },
                          { value: "other", label: "Другое" },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setCancelDialogReason(opt.value)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${cancelDialogReason === opt.value ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-orange-200 text-orange-700 hover:bg-orange-100"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {cancelDialogReason === "other" && (
                        <textarea
                          value={cancelDialogNote}
                          onChange={e => setCancelDialogNote(e.target.value)}
                          placeholder="Уточните причину..."
                          rows={2}
                          className="w-full text-xs border border-orange-200 rounded-lg px-2.5 py-1.5 bg-white resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!cancelDialogReason) return;
                            const reasonLabels: Record<string, string> = {
                              client_changed_mind: "Клиент передумал",
                              found_cheaper: "Нашёл дешевле",
                              found_other_master: "Другой мастер",
                              no_answer: "Не берёт трубку",
                              other: cancelDialogNote.trim() || "Другое",
                            };
                            cancelOrderMutation.mutate({ orderId: openDispatchId!, reason: reasonLabels[cancelDialogReason] ?? cancelDialogReason });
                          }}
                          disabled={!cancelDialogReason || cancelOrderMutation.isPending}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
                        >
                          {cancelOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                          Подтвердить отмену
                        </button>
                        <button
                          onClick={() => { setShowCancelDialog(false); setCancelDialogReason(""); setCancelDialogNote(""); }}
                          className="px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-xs font-medium text-orange-700 hover:bg-orange-50 transition-colors"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {((openOrder as any).dispatchStatus ?? "none") === "none" && (
                  <div className="space-y-3">
                    {(openOrder as any).cancelReason && (
                      <div className="flex flex-col gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs font-semibold text-amber-700">Причина снятия мастера</p>
                        </div>
                        {(openOrder as any).cancelType && (() => {
                          const ctMeta: Record<string, { label: string; badge: string }> = {
                            client_refused:     { label: "Клиент отказался",          badge: "bg-blue-100 text-blue-800" },
                            price_disagreement: { label: "Не договорились по цене",   badge: "bg-amber-100 text-amber-800" },
                            master_cant:        { label: "Мастер не может выполнить", badge: "bg-orange-100 text-orange-800" },
                            other:              { label: "Другая причина",             badge: "bg-slate-100 text-slate-700" },
                          };
                          const m = ctMeta[(openOrder as any).cancelType];
                          return m ? (
                            <span className={`inline-flex items-center self-start px-2 py-0.5 rounded-full text-xs font-semibold ml-6 ${m.badge}`}>
                              {m.label}
                            </span>
                          ) : null;
                        })()}
                        <p className="text-xs text-amber-700 ml-6">{(openOrder as any).cancelReason}</p>
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

                    {/* Dispatch stats bar */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-muted-foreground">
                        <Send className="w-3 h-3" /> Отправлено {(dispatchData?.dispatches.length ?? 0)}
                      </span>
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
                      {((openOrder as any).dispatchResendCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-700">
                          <RefreshCw className="w-3 h-3" /> Повторно {(openOrder as any).dispatchResendCount ?? 0}
                        </span>
                      )}
                    </div>

                    {/* Resend button */}
                    {openOrder.status === "waiting_master" && pendingDispatched.length > 0 && (
                      <div>
                        {(() => {
                          const lastResend = (openOrder as any).lastDispatchResendAt ? new Date((openOrder as any).lastDispatchResendAt).getTime() : 0;
                          const cooldownMs = 15 * 60 * 1000;
                          const now = Date.now();
                          const canResend = now - lastResend >= cooldownMs;
                          const minutesLeft = Math.ceil((cooldownMs - (now - lastResend)) / 60000);
                          const maxResends = 3;
                          const atLimit = ((openOrder as any).dispatchResendCount ?? 0) >= maxResends;
                          if (atLimit) {
                            return (
                              <p className="text-xs text-muted-foreground">
                                Достигнут лимит повторных рассылок ({maxResends})
                              </p>
                            );
                          }
                          return (
                            <button
                              onClick={() => resendMutation.mutate(openDispatchId!)}
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
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-red-600 uppercase tracking-wide flex items-center gap-1">
                          <X className="w-3 h-3" /> Отказались ({rejectedDispatches.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {rejectedDispatches.map(d => (
                            <span
                              key={d.id}
                              title={d.rejectionReason ? `Причина: ${d.rejectionReason}` : undefined}
                              className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-100 rounded-full px-2.5 py-0.5 cursor-default"
                            >
                              {d.masterName}
                              {d.rejectionReason && <span className="text-red-400 text-[10px]">·&nbsp;{d.rejectionReason.length > 20 ? d.rejectionReason.slice(0, 20) + "…" : d.rejectionReason}</span>}
                            </span>
                          ))}
                        </div>
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

                    {/* FOMO blocked button presses */}
                    {(fomoPresses?.length ?? 0) > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Заблокированные попытки ({fomoPresses!.length})
                        </p>
                        <div className="space-y-1">
                          {fomoPresses!.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs font-medium text-orange-800">{p.masterAlias ?? `Мастер #${p.masterId}`}</span>
                              <span className="text-[10px] text-orange-500">{new Date(p.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {respondents.length === 0 && rejectedDispatches.length === 0 && (openOrder as any).dispatchStatus !== "assigned" && (
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
                            .filter(m => !openOrder || !m.city || m.city === (openOrder as any).city)
                            .map(m => {
                              const balance = m.tokensBalance;
                              const limit = m.creditLimitTokens;
                              const available = balance + limit;
                              return (
                                <option key={m.id} value={String(m.id)}>
                                  {m.alias}{m.city ? ` (${m.city})` : ""} — {balance} т. (лимит {limit}){available < 0 ? " ❌" : ""}
                                </option>
                              );
                            })}
                        </select>
                        {(openOrder as any)?.masterId && selectedMasterForAssign && (
                          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            ⚠️ Текущий мастер будет заменён
                          </p>
                        )}
                        {(() => {
                          const selId = parseInt(selectedMasterForAssign);
                          if (isNaN(selId)) return null;
                          const m = activeMasters?.find(x => x.id === selId);
                          if (!m) return null;
                          if ((openOrder as any)?.paymentModel !== "token") return null;
                          const orderCost = (openOrder as any)?.tokensCharged ? Number((openOrder as any).tokensCharged) : ((openOrder as any)?.manualTokenCost ? Number((openOrder as any).manualTokenCost) : 1);
                          if (m.tokensBalance + m.creditLimitTokens < orderCost) {
                            return (
                              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                ❌ Недостаточно токенов: баланс {m.tokensBalance} + лимит {m.creditLimitTokens} = {m.tokensBalance + m.creditLimitTokens} т., нужно {orderCost} т.
                              </p>
                            );
                          }
                          if (m.tokensBalance < orderCost) {
                            return (
                              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                ⚠️ Токены уйдут в минус: баланс {m.tokensBalance} т., спишется {orderCost} т. (лимит {m.creditLimitTokens})
                              </p>
                            );
                          }
                          return (
                            <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                              ✅ Достаточно токенов: {m.tokensBalance} т. (спишется {orderCost} т.)
                            </p>
                          );
                        })()}
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

                {/* ─── Operator note ─────────────────────────────────────── */}
                <div className="border-t border-border/50 pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />Заметка оператора
                    </p>
                    {operatorNoteEdit === null && (
                      <button
                        onClick={() => setOperatorNoteEdit((openOrder as any).operatorNote ?? "")}
                        className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" />Редактировать
                      </button>
                    )}
                  </div>
                  {operatorNoteEdit !== null ? (
                    <div className="space-y-2">
                      <textarea
                        value={operatorNoteEdit}
                        onChange={e => setOperatorNoteEdit(e.target.value)}
                        placeholder="Внутренняя заметка (видна только операторам)..."
                        rows={2}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setOperatorNoteEdit(null)}
                          className="flex-1 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-slate-50"
                        >Отмена</button>
                        <button
                          onClick={() => openDispatchId && saveNoteMutation.mutate({ orderId: openDispatchId, note: operatorNoteEdit })}
                          disabled={saveNoteMutation.isPending}
                          className="flex-1 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {saveNoteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                          Сохранить
                        </button>
                      </div>
                    </div>
                  ) : (openOrder as any).operatorNote ? (
                    <p className="text-sm text-muted-foreground bg-slate-50 rounded-lg px-3 py-2 italic">{(openOrder as any).operatorNote}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic">Нет заметки</p>
                  )}
                </div>

                {/* ─── Timing stats ──────────────────────────────────────── */}
                {((openOrder as any).assignedAt || (openOrder as any).completedAt) && (
                  <div className="border-t border-border/50 pt-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5" />Время в заказе
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {openOrder?.createdAt && (openOrder as any).assignedAt && (
                        <div className="bg-slate-50 rounded-lg px-3 py-2">
                          <p className="text-muted-foreground">Ожидание мастера</p>
                          <p className="font-semibold text-foreground">{timeBetween(openOrder.createdAt, (openOrder as any).assignedAt)}</p>
                        </div>
                      )}
                      {(openOrder as any).assignedAt && (openOrder as any).completedAt && (
                        <div className="bg-slate-50 rounded-lg px-3 py-2">
                          <p className="text-muted-foreground">Время работы</p>
                          <p className="font-semibold text-foreground">{timeBetween((openOrder as any).assignedAt, (openOrder as any).completedAt)}</p>
                        </div>
                      )}
                      {openOrder?.createdAt && (openOrder as any).completedAt && (
                        <div className="bg-slate-50 rounded-lg px-3 py-2 col-span-2">
                          <p className="text-muted-foreground">Общее время заказа</p>
                          <p className="font-semibold text-foreground">{timeBetween(openOrder.createdAt, (openOrder as any).completedAt)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ─── Duplicate client warning ──────────────────────────── */}
                {openOrder && (() => {
                  const phone = (openOrder as any).clientPhone;
                  if (!phone) return null;
                  const dupes = (orders ?? []).filter(o =>
                    o.id !== openOrder.id &&
                    (o as any).clientPhone === phone &&
                    !["cancelled"].includes(o.status)
                  );
                  if (dupes.length === 0) return null;
                  return (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <CopyX className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-amber-700">Дублирующий клиент</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          Этот телефон встречается ещё в {dupes.length} заказ{dupes.length === 1 ? "е" : dupes.length < 5 ? "ах" : "ах"}:{" "}
                          {dupes.slice(0, 3).map(d => `#${d.id}`).join(", ")}
                          {dupes.length > 3 && ` и ещё ${dupes.length - 3}`}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* ─── Сметы (ожидают оплаты) ────────────────────────────── */}
                <div className="border-t border-border/50 pt-3">
                  <button
                    onClick={() => setShowReceipts(v => !v)}
                    className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide">
                      <ReceiptText className="w-3.5 h-3.5" />Сметы
                      {receipts && receipts.filter(r => !r.prepaymentSubmittedAt).length > 0 && (
                        <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                          {receipts.filter(r => !r.prepaymentSubmittedAt).length}
                        </span>
                      )}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showReceipts ? "rotate-180" : ""}`} />
                  </button>
                  {showReceipts && (
                    <div className="mt-2 space-y-2">
                      {!receipts && <div className="text-xs text-muted-foreground text-center py-2"><Loader2 className="w-3 h-3 animate-spin mx-auto" /></div>}
                      {receipts?.filter(r => !r.prepaymentSubmittedAt).length === 0 && !showCreateReceipt && !crmCreatedUrl && (
                        <p className="text-xs text-muted-foreground/60 text-center py-1">Нет расписок, ожидающих оплаты</p>
                      )}
                      {receipts?.filter(r => !r.prepaymentSubmittedAt).map(r => (
                        <div key={r.id} className="rounded-xl p-3 space-y-1.5 bg-muted/40">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs text-muted-foreground">Бронь: </span>
                              <span className="text-sm font-bold text-primary">{Number(r.prepaymentAmount).toLocaleString("ru-RU")} ₽</span>
                              <span className="text-xs text-muted-foreground ml-1">/ {Number(r.totalAmount).toLocaleString("ru-RU")} ₽ итого</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-amber-600 dark:text-amber-400">⏳ Ожидает оплаты</span>
                            <button
                              onClick={async () => {
                                if (!window.confirm("Подтвердить получение предоплаты вручную?")) return;
                                const resp = await fetch(`/api/receipts/${r.id}/confirm`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ operatorNote: "Подтверждено оператором" }) });
                                if (resp.ok) { toast({ title: "Предоплата подтверждена!" }); queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", openDispatchId] }); }
                                else toast({ title: "Ошибка подтверждения", variant: "destructive" });
                              }}
                              className="ml-auto flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-1 rounded-lg font-medium hover:bg-green-700"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Подтвердить
                            </button>
                          </div>
                          {r.prepaymentScreenshotUrl && (
                            <a href={r.prepaymentScreenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={r.prepaymentScreenshotUrl} alt="Скриншот оплаты" className="max-h-32 rounded-lg border object-contain bg-muted" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            </a>
                          )}
                          {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                          <div className="flex items-center gap-2 flex-wrap">
                            <a href={r.publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
                              <ExternalLink className="w-3 h-3" /> Открыть
                            </a>
                            <button onClick={() => { navigator.clipboard.writeText(r.publicUrl); toast({ title: "Ссылка скопирована!" }); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                              <Copy className="w-3 h-3" /> Ссылка
                            </button>
                            <button onClick={() => printReceipt(r, openOrder)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                              <Printer className="w-3 h-3" /> Печать
                            </button>
                            <button onClick={() => { if (editingCrmReceiptId === r.id) { setEditingCrmReceiptId(null); return; } setEditingCrmReceiptId(r.id); setCrmEditLineItems(r.lineItems?.length ? r.lineItems.map((i: any) => ({ description: i.description, unit: i.unit ?? "", quantity: String(i.quantity ?? 1), price: String(i.price) })) : [{ description: "", unit: "", quantity: "1", price: "" }]); setCrmEditPrepayment(String(r.prepaymentAmount)); setCrmEditNotes(r.notes ?? ""); }} className="flex items-center gap-1 text-xs text-primary font-medium hover:underline ml-auto">
                              {editingCrmReceiptId === r.id ? "Отмена" : "Изменить"}
                            </button>
                            <button onClick={() => { if (!window.confirm("Удалить смету?")) return; deleteReceiptMutation.mutate(r.id); }} disabled={deleteReceiptMutation.isPending} className="flex items-center gap-1 text-xs text-destructive hover:opacity-80 disabled:opacity-50" title="Удалить смету">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          {editingCrmReceiptId === r.id && (
                            <div className="border border-border rounded-xl p-3 space-y-2 bg-background mt-1">
                              <p className="text-xs font-semibold">Редактирование сметы</p>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs text-muted-foreground">Перечень работ</p>
                                  <button onClick={() => setCrmEditLineItems(prev => [...prev, { description: "", unit: "", quantity: "1", price: "" }])} className="text-xs text-primary flex items-center gap-0.5 font-medium"><Plus className="w-3 h-3" /> добавить</button>
                                </div>
                                {crmEditLineItems.map((item, i) => (
                                  <div key={i} className="rounded-lg border border-border bg-muted/20 p-2 space-y-1.5 mb-1.5">
                                    <div className="flex gap-1.5 items-center">
                                      <input value={item.description} onChange={e => setCrmEditLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))} placeholder="Перечень работ" className="flex-1 h-7 px-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                                      {crmEditLineItems.length > 1 && <button onClick={() => setCrmEditLineItems(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>}
                                    </div>
                                    <div className="grid grid-cols-4 gap-1">
                                      <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Объём</div><input type="number" value={item.quantity} onChange={e => setCrmEditLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: e.target.value } : it))} placeholder="1" className="w-full h-6 px-1 text-xs rounded border border-border bg-background text-center focus:outline-none focus:ring-1 focus:ring-primary/30" /></div>
                                      <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Ед.</div><select value={item.unit} onChange={e => setCrmEditLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, unit: e.target.value } : it))} className="w-full h-6 px-0.5 text-[10px] rounded border border-border bg-background text-muted-foreground focus:outline-none appearance-none text-center">{UNITS.map(u => <option key={u} value={u}>{u === "" ? "—" : u}</option>)}</select></div>
                                      <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Цена ₽</div><input type="number" value={item.price} onChange={e => setCrmEditLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, price: e.target.value } : it))} placeholder="0" className="w-full h-6 px-1 text-xs rounded border border-border bg-background font-semibold text-center focus:outline-none focus:ring-1 focus:ring-primary/30" /></div>
                                      <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Сумма</div><div className="h-6 rounded bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">{((parseFloat(item.quantity)||1)*(parseFloat(item.price)||0))>0?((parseFloat(item.quantity)||1)*(parseFloat(item.price)||0)).toLocaleString("ru-RU"):"—"}</div></div>
                                    </div>
                                  </div>
                                ))}
                                {(() => { const t = crmEditLineItems.reduce((s, it) => s + (parseFloat(it.quantity)||1)*(parseFloat(it.price)||0), 0); return t > 0 ? (<div className="flex justify-between text-xs bg-muted/50 rounded-lg px-2 py-1.5"><span className="text-muted-foreground">Итого</span><span className="font-bold">{t.toLocaleString("ru-RU")} ₽</span></div>) : null; })()}
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Предоплата (₽)</label>
                                <input type="number" value={crmEditPrepayment} onChange={e => setCrmEditPrepayment(e.target.value)} className="w-full h-7 px-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 mt-0.5 font-semibold" />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Примечание</label>
                                <textarea value={crmEditNotes} onChange={e => setCrmEditNotes(e.target.value)} rows={2} className="w-full px-2 py-1 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 mt-0.5 resize-none" placeholder="Необязательно" />
                              </div>
                              <button disabled={crmEditing} onClick={async () => {
                                const valid = crmEditLineItems.filter(it => it.description.trim() && parseFloat(it.price) > 0);
                                if (!valid.length) { toast({ title: "Добавьте хотя бы одну позицию", variant: "destructive" }); return; }
                                const prepay = parseFloat(crmEditPrepayment);
                                if (!prepay || prepay <= 0) { toast({ title: "Введите сумму предоплаты", variant: "destructive" }); return; }
                                setCrmEditing(true);
                                try {
                                  const resp = await fetch(`/api/receipts/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ lineItems: valid.map(i => ({ description: i.description.trim(), unit: i.unit || undefined, quantity: parseFloat(i.quantity) > 0 ? parseFloat(i.quantity) : undefined, price: parseFloat(i.price) })), prepaymentAmount: prepay, notes: crmEditNotes.trim() || undefined }) });
                                  if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error ?? "Ошибка"); }
                                  toast({ title: "Смета обновлена!" }); setEditingCrmReceiptId(null); queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", openDispatchId] });
                                } catch (e: any) { toast({ title: e.message ?? "Ошибка", variant: "destructive" }); } finally { setCrmEditing(false); }
                              }} className="w-full h-8 rounded-lg bg-primary text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                                {crmEditing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Сохранить изменения
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* ── Create receipt form ── */}
                      {!showCreateReceipt && !crmCreatedUrl && (
                        <button onClick={() => { setShowCreateReceipt(true); setCrmCreatedUrl(null); setCrmCopied(false); }} className="w-full flex items-center justify-center gap-1.5 text-xs text-primary font-semibold py-2 border border-dashed border-primary/40 rounded-xl hover:bg-primary/5 transition-colors">
                          <Plus className="w-3.5 h-3.5" /> Создать смету
                        </button>
                      )}
                      {crmCreatedUrl && (
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold text-xs"><CheckCircle2 className="w-4 h-4" /> Смета создана</div>
                          <div className="bg-white dark:bg-muted rounded-lg p-2 text-xs font-mono break-all text-muted-foreground">{crmCreatedUrl}</div>
                          <div className="flex gap-2">
                            <button onClick={() => { navigator.clipboard.writeText(crmCreatedUrl!); setCrmCopied(true); setTimeout(() => setCrmCopied(false), 2000); }} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-primary text-white text-xs font-semibold">
                              {crmCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{crmCopied ? "Скопировано" : "Скопировать"}
                            </button>
                            <a href={crmCreatedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted"><ExternalLink className="w-3 h-3" /> Открыть</a>
                          </div>
                          <button onClick={() => { setShowCreateReceipt(true); setCrmCreatedUrl(null); }} className="w-full text-xs text-primary hover:underline">+ Создать ещё смету</button>
                        </div>
                      )}

                      {showCreateReceipt && !crmCreatedUrl && (
                        <div className="border border-border rounded-xl p-3 space-y-3 bg-muted/20">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-foreground">Новая смета</p>
                            <button onClick={() => setShowCreateReceipt(false)} className="text-muted-foreground hover:text-foreground">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">Перечень работ</p>
                              <button
                                onClick={() => setCrmLineItems(prev => [...prev, { description: "", unit: "", quantity: "1", price: "" }])}
                                className="text-xs text-primary flex items-center gap-0.5 font-medium"
                              >
                                <Plus className="w-3 h-3" /> добавить
                              </button>
                            </div>
                            {crmLineItems.map((item, i) => (
                              <div key={i} className="rounded-lg border border-border bg-muted/20 p-2 space-y-1.5 mb-2">
                                <div className="flex gap-1.5 items-center">
                                  <input
                                    value={item.description}
                                    onChange={e => setCrmLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))}
                                    placeholder="Перечень работ"
                                    className="flex-1 h-7 rounded-lg border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                                  />
                                  {crmLineItems.length > 1 && (
                                    <button onClick={() => setCrmLineItems(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div className="grid grid-cols-4 gap-1">
                                  <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Объём</div><input type="number" value={item.quantity} onChange={e => setCrmLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: e.target.value } : it))} placeholder="1" className="w-full h-6 px-1 text-xs rounded border border-border bg-background text-center focus:outline-none focus:ring-1 focus:ring-primary/40" /></div>
                                  <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Ед.</div><select value={item.unit} onChange={e => setCrmLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, unit: e.target.value } : it))} className="w-full h-6 px-0.5 text-[10px] rounded border border-border bg-background text-muted-foreground focus:outline-none appearance-none text-center">{UNITS.map(u => <option key={u} value={u}>{u === "" ? "—" : u}</option>)}</select></div>
                                  <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Цена ₽</div><input type="number" value={item.price} onChange={e => setCrmLineItems(prev => prev.map((it, idx) => idx === i ? { ...it, price: e.target.value } : it))} placeholder="0" className="w-full h-6 px-1 text-xs rounded border border-border bg-background font-semibold text-center focus:outline-none focus:ring-1 focus:ring-primary/40" /></div>
                                  <div><div className="text-[9px] text-muted-foreground text-center mb-0.5">Сумма</div><div className="h-6 rounded bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">{((parseFloat(item.quantity)||1)*(parseFloat(item.price)||0))>0?((parseFloat(item.quantity)||1)*(parseFloat(item.price)||0)).toLocaleString("ru-RU"):"—"}</div></div>
                                </div>
                              </div>
                            ))}
                            {(() => {
                              const t = crmLineItems.reduce((s, it) => s + (parseFloat(it.quantity)||1)*(parseFloat(it.price)||0), 0);
                              return t > 0 ? (
                                <div className="flex justify-between text-xs px-1">
                                  <span className="text-muted-foreground">Итого</span>
                                  <span className="font-bold">{t.toLocaleString("ru-RU")} ₽</span>
                                </div>
                              ) : null;
                            })()}
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Предоплата (₽)</p>
                            <input
                              type="number"
                              value={crmPrepayment}
                              onChange={e => setCrmPrepayment(e.target.value)}
                              className="w-full h-9 rounded-lg border-2 border-primary/40 bg-background px-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-primary/40"
                              placeholder="5000"
                            />
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Примечание</p>
                            <textarea
                              value={crmNotes}
                              onChange={e => setCrmNotes(e.target.value)}
                              rows={2}
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                              placeholder="Необязательно"
                            />
                          </div>

                          <button
                            disabled={crmCreating}
                            onClick={async () => {
                              const valid = crmLineItems.filter(it => it.description.trim() && parseFloat(it.price) > 0);
                              if (valid.length === 0) { toast({ title: "Ошибка", description: "Добавьте хотя бы одну позицию", variant: "destructive" }); return; }
                              const prep = parseFloat(crmPrepayment);
                              if (!prep || prep <= 0) { toast({ title: "Ошибка", description: "Укажите сумму предоплаты", variant: "destructive" }); return; }
                              setCrmCreating(true);
                              try {
                                const r = await fetch("/api/receipts/crm", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  credentials: "include",
                                  body: JSON.stringify({
                                    orderId: openDispatchId,
                                    lineItems: valid.map(it => ({ description: it.description.trim(), unit: it.unit || undefined, quantity: parseFloat(it.quantity) > 0 ? parseFloat(it.quantity) : undefined, price: parseFloat(it.price) })),
                                    prepaymentAmount: prep,
                                    notes: crmNotes.trim() || undefined,
                                  }),
                                });
                                if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Ошибка"); }
                                const data = await r.json();
                                setCrmCreatedUrl(data.publicUrl);
                                setShowCreateReceipt(false);
                                queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", openDispatchId] });
                              } catch (err: any) {
                                toast({ title: "Ошибка", description: err.message, variant: "destructive" });
                              } finally {
                                setCrmCreating(false);
                              }
                            }}
                            className="w-full h-9 bg-primary text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-60"
                          >
                            {crmCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ReceiptText className="w-3.5 h-3.5" />}
                            Создать смету
                          </button>
                        </div>
                      )}
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
                              {r.lineItems.map((li: any, i: number) => (
                                <div key={i} className="flex justify-between text-xs text-muted-foreground">
                                  <span className="truncate max-w-[150px]">{li.description}</span>
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
                          {!r.prepaymentSeenAt && (
                            <button
                              onClick={async () => {
                                if (!window.confirm(`Подтвердить получение оплаты от ${r.clientSubmittedName ?? "клиента"}?`)) return;
                                const resp = await fetch(`/api/receipts/${r.id}/confirm`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ operatorNote: "Подтверждено оператором" }) });
                                if (resp.ok) { toast({ title: "✅ Оплата подтверждена!" }); queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", openDispatchId] }); queryClient.invalidateQueries({ queryKey: ["/api/receipts/dialogs/unread-count"] }); }
                                else toast({ title: "Ошибка подтверждения", variant: "destructive" });
                              }}
                              className="w-full flex items-center justify-center gap-1.5 text-xs bg-green-600 text-white px-3 py-2 rounded-xl font-semibold hover:bg-green-700"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Подтвердить оплату
                            </button>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <a href={r.publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline"><ExternalLink className="w-3 h-3" />Открыть</a>
                            <button onClick={() => { navigator.clipboard.writeText(r.publicUrl); toast({ title: "Ссылка скопирована!" }); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3" />Ссылка</button>
                            <button onClick={() => { if (!window.confirm("Удалить смету?")) return; deleteReceiptMutation.mutate(r.id); }} disabled={deleteReceiptMutation.isPending} className="flex items-center gap-1 text-xs text-destructive hover:opacity-80 disabled:opacity-50 ml-auto"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ─── Ожидает проверки оператора ───────────────────────── */}
                {receipts && receipts.filter(r => r.prepaymentSubmittedAt && !r.prepaymentSeenAt).length > 0 && (
                  <div className="border-t border-border/50 pt-3">
                    <button
                      onClick={() => setShowPendingReview(v => !v)}
                      className="w-full flex items-center justify-between text-xs hover:text-foreground transition-colors py-1"
                    >
                      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        <Clock className="w-3.5 h-3.5" />
                        Ожидает проверки
                        <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                          {receipts.filter(r => r.prepaymentSubmittedAt && !r.prepaymentSeenAt).length}
                        </span>
                      </span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showPendingReview ? "rotate-180" : ""}`} />
                    </button>
                    {showPendingReview && (
                      <div className="mt-2 space-y-2">
                        {receipts.filter(r => r.prepaymentSubmittedAt && !r.prepaymentSeenAt).map(r => (
                          <div key={r.id} className="rounded-xl p-3 space-y-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs text-muted-foreground">Бронь: </span>
                                <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{Number(r.prepaymentAmount).toLocaleString("ru-RU")} ₽</span>
                                <span className="text-xs text-muted-foreground ml-1">/ {Number(r.totalAmount).toLocaleString("ru-RU")} ₽ итого</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{new Date(r.prepaymentSubmittedAt!).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            {r.clientSubmittedName && (
                              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                                Клиент подтвердил оплату · {r.clientSubmittedName}
                              </div>
                            )}
                            {r.prepaymentScreenshotUrl && (
                              <a href={r.prepaymentScreenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                                <img src={r.prepaymentScreenshotUrl} alt="Скриншот оплаты" className="max-h-40 rounded-lg border border-amber-200 object-contain bg-white w-full" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              </a>
                            )}
                            {!r.prepaymentScreenshotUrl && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                                Скриншот не прикреплён
                              </div>
                            )}
                            <button
                              onClick={async () => {
                                if (!window.confirm(`Подтвердить оплату брони от ${r.clientSubmittedName ?? "клиента"}?`)) return;
                                const resp = await fetch(`/api/receipts/${r.id}/confirm`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ operatorNote: "Подтверждено оператором" }) });
                                if (resp.ok) { toast({ title: "✅ Оплата подтверждена!" }); queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", openDispatchId] }); queryClient.invalidateQueries({ queryKey: ["/api/receipts/dialogs/unread-count"] }); }
                                else toast({ title: "Ошибка подтверждения", variant: "destructive" });
                              }}
                              className="w-full flex items-center justify-center gap-1.5 text-xs bg-green-600 text-white px-3 py-2 rounded-xl font-semibold hover:bg-green-700"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Подтвердить оплату
                            </button>
                            <div className="flex items-center gap-2 flex-wrap">
                              <a href={r.publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
                                <ExternalLink className="w-3 h-3" /> Открыть смету
                              </a>
                              <button onClick={() => printReceipt(r, openOrder)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                <Printer className="w-3 h-3" /> Печать
                              </button>
                              <button onClick={() => { navigator.clipboard.writeText(r.publicUrl); toast({ title: "Ссылка скопирована!" }); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto">
                                <Copy className="w-3 h-3" /> Ссылка
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Комиссия оплачена (confirmed receipts) ───────────── */}
                {receipts && receipts.filter(r => r.prepaymentSeenAt).length > 0 && (
                  <div className="border-t border-border/50 pt-3">
                    <button
                      onClick={() => setShowPaidCommissions(v => !v)}
                      className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-green-700 dark:text-green-400">Комиссия оплачена</span>
                        <span className="bg-green-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                          {receipts.filter(r => r.prepaymentSeenAt).length}
                        </span>
                      </span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showPaidCommissions ? "rotate-180" : ""}`} />
                    </button>
                    {showPaidCommissions && (
                      <div className="mt-2 space-y-2">
                        {receipts.filter(r => r.prepaymentSeenAt).map(r => (
                          <div key={r.id} className="rounded-xl p-3 space-y-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs text-muted-foreground">Бронь: </span>
                                <span className="text-sm font-bold text-green-700 dark:text-green-400">{Number(r.prepaymentAmount).toLocaleString("ru-RU")} ₽</span>
                                <span className="text-xs text-muted-foreground ml-1">/ {Number(r.totalAmount).toLocaleString("ru-RU")} ₽ итого</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                              Оплата подтверждена · {new Date(r.prepaymentSubmittedAt!).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              {r.clientSubmittedName && <span className="text-muted-foreground font-normal">· {r.clientSubmittedName}</span>}
                            </div>
                            {r.prepaymentScreenshotUrl && (
                              <a href={r.prepaymentScreenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                                <img src={r.prepaymentScreenshotUrl} alt="Скриншот оплаты" className="max-h-32 rounded-lg border border-green-200 object-contain bg-white" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              </a>
                            )}
                            {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                            <div className="flex items-center gap-2 flex-wrap">
                              <a href={r.publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
                                <ExternalLink className="w-3 h-3" /> Открыть
                              </a>
                              <button onClick={() => printReceipt(r, openOrder)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                <Printer className="w-3 h-3" /> Печать
                              </button>
                              <button onClick={() => { navigator.clipboard.writeText(r.publicUrl); toast({ title: "Ссылка скопирована!" }); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                <Copy className="w-3 h-3" /> Ссылка
                              </button>
                              <button onClick={() => { if (!window.confirm("Удалить смету?")) return; deleteReceiptMutation.mutate(r.id); }} disabled={deleteReceiptMutation.isPending} className="flex items-center gap-1 text-xs text-destructive hover:opacity-80 disabled:opacity-50 ml-auto" title="Удалить смету">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Status log ────────────────────────────────────────── */}
                <div className="border-t border-border/50 pt-3">
                  <button
                    onClick={() => setShowStatusLog(v => !v)}
                    className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide">
                      <History className="w-3.5 h-3.5" />История статусов
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showStatusLog ? "rotate-180" : ""}`} />
                  </button>
                  {showStatusLog && (
                    <div className="mt-2 space-y-1.5">
                      {!statusLog && <div className="text-xs text-muted-foreground text-center py-2"><Loader2 className="w-3 h-3 animate-spin mx-auto" /></div>}
                      {statusLog && statusLog.length === 0 && (
                        <p className="text-xs text-muted-foreground/60 text-center py-2">Нет записей</p>
                      )}
                      {statusLog?.map(entry => (
                        <div key={entry.id} className="flex items-start gap-2 text-xs">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {entry.oldStatus && (
                                <><span className="text-muted-foreground">{STATUS_LABELS[entry.oldStatus] ?? entry.oldStatus}</span>
                                <span className="text-muted-foreground">→</span></>
                              )}
                              <span className="font-medium text-foreground">{STATUS_LABELS[entry.newStatus] ?? entry.newStatus}</span>
                            </div>
                            <div className="text-muted-foreground/60 mt-0.5 flex items-center gap-2">
                              <span>{new Date(entry.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                              {entry.userAlias && <span>· {entry.userAlias}</span>}
                            </div>
                            {entry.note && <p className="text-muted-foreground/80 mt-0.5 italic">{entry.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
                  <button onClick={() => { setOpenDispatchId(null); setShowStatusLog(false); setShowReceipts(false); setShowCreateReceipt(false); setCrmCreatedUrl(null); setCrmLineItems([{ description: "", unit: "", quantity: "1", price: "" }]); setCrmPrepayment("5000"); setCrmNotes(""); setOperatorNoteEdit(null); }} className="px-4 py-2 rounded-xl font-medium text-muted-foreground hover:bg-slate-100 text-sm">
                    Закрыть
                  </button>
                </div>
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
                placeholder="Например: мастер не выходит на связь; передаём другому мастеру..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 resize-none"
                autoFocus
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={rebroadcastOnUnassign}
                  onChange={e => setRebroadcastOnUnassign(e.target.checked)}
                />
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${rebroadcastOnUnassign ? "bg-blue-500 border-blue-500" : "border-gray-300 bg-white group-hover:border-blue-300"}`}>
                  {rebroadcastOnUnassign && <Check className="w-3 h-3 text-white" />}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Разослать сразу после снятия</p>
                <p className="text-xs text-gray-400 mt-0.5">Этот мастер больше не получит заявку. Остальные подходящие мастера получат её немедленно.</p>
              </div>
            </label>

            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => { setShowUnassignDialog(false); setUnassignReason(""); setRebroadcastOnUnassign(false); }}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!unassignReason.trim()) return;
                  unassignMutation.mutate({ orderId: openDispatchId!, reason: unassignReason.trim(), rebroadcast: rebroadcastOnUnassign });
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
