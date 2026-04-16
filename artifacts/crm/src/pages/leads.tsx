import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetLeads, useCreateLead, useSendLeadToBuffer, useGetCities, useGetServices, LeadStatus,
  useGetOrders, OrderStatus
} from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { PhotoUploader } from "@/components/photo-uploader";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Plus, Search, Filter, Play, Trash2, User, Phone, MapPin, ChevronDown,
  Sparkles, Images, Pencil, X, Calendar, Radio, Save, Ban, UserX, MessageSquare,
  CheckCircle2, Clock, ArrowRight, ExternalLink, AlertTriangle, History, Send, Users,
  UserCheck, DollarSign, Check, AlertCircle, FileText, Timer, RefreshCw, XCircle,
  ReceiptText, Copy, Bell, Archive, Inbox, Briefcase, CopyX, ClipboardList,
  CalendarDays, ChevronRight
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ServiceRow {
  type: string;
  area: string;
  pricePerM2: string;
}

interface LeadRow {
  id: number;
  clientName: string;
  clientPhone: string;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  services: Array<{ type: string; area: number; pricePerM2: number }> | null;
  scheduledAt: string | null;
  comment: string | null;
  source: string | null;
  status: string;
  photos: string[] | null;
  createdAt: string;
  updatedAt: string;
  cancellationReason: string | null;
  orderId: number | null;
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

interface PendingDispatch {
  orderId: number;
  leadId: number | null;
  serviceType: string;
  city: string;
  district: string | null;
  respondentCount: number;
  respondents: { masterId: number; masterName: string; respondedAt: string | null }[];
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

// ─── Constants ───────────────────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  { value: "call",     label: "Входящий звонок" },
  { value: "website",  label: "Сайт" },
  { value: "ads",      label: "Реклама" },
  { value: "avito",    label: "Авито" },
  { value: "referral", label: "Рекомендация" },
  { value: "repeat",   label: "Повторный клиент" },
  { value: "other",    label: "Другое" },
];

const UNITS = ["", "шт", "м²", "м³", "м.п.", "м", "кг", "т", "л", "упак.", "компл.", "ч"];

const STATUS_ORDER_LABELS: Record<string, string> = {
  waiting_master:        "Ожидает мастера",
  master_assigned:       "Мастер назначен",
  in_progress:           "В работе",
  completed:             "Завершён",
  cancelled:             "Отменён",
  cancellation_requested:"Запрос на отмену",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

function timeSince(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч`;
  const d = Math.floor(h / 24);
  return `${d}д`;
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

function leadAge(lead: LeadRow): { label: string; urgent: boolean; warning: boolean } | null {
  if (lead.status !== "new" && lead.status !== "processing") return null;
  const ms = Date.now() - new Date(lead.createdAt).getTime();
  const m = Math.floor(ms / 60000);
  let label: string;
  if (m < 60) label = `${m} мин`;
  else if (m < 1440) label = `${Math.floor(m / 60)} ч`;
  else label = `${Math.floor(m / 1440)} дн`;
  return { label, urgent: m > 1440, warning: m > 480 && m <= 1440 };
}

// ─── Subcomponent: DispatchBadge ────────────────────────────────────────────

function DispatchBadge({ status }: { status: string }) {
  if (status === "none") return null;
  if (status === "dispatching")
    return <span className="inline-flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5 font-medium"><Clock className="w-3 h-3" />Разослано</span>;
  if (status === "assigned")
    return <span className="inline-flex items-center gap-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium"><CheckCircle2 className="w-3 h-3" />Назначен</span>;
  return null;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Leads() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Tab state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"new" | "work" | "archive">(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    if (t === "work") return "work";
    if (t === "archive") return "archive";
    return "new";
  });

  // ── Leads (Tab 1) state ───────────────────────────────────────────────────
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>("");
  const [leadSourceFilter, setLeadSourceFilter] = useState<string>("");
  const [leadSearchQuery, setLeadSearchQuery] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadRow | null>(null);
  const [confirmSendLead, setConfirmSendLead] = useState<LeadRow | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [showLeadTimeline, setShowLeadTimeline] = useState(false);
  const [reasonDialog, setReasonDialog] = useState<{ lead: LeadRow; targetStatus: "non_target" | "client_refusal" } | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [phoneCheckResult, setPhoneCheckResult] = useState<{ duplicate: boolean; existing?: { id: number; clientName: string; status: string }[] } | null>(null);
  const phoneCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create form
  const [formData, setFormData] = useState({ clientName: "", clientPhone: "", city: "", district: "", comment: "", scheduledAt: "", source: "" });
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([{ type: "", area: "", pricePerM2: "" }]);
  const [photosPaths, setPhotosPaths] = useState<string[]>([]);

  // Edit form
  const [editFormData, setEditFormData] = useState({ clientName: "", clientPhone: "", city: "", district: "", comment: "", scheduledAt: "", source: "", status: "" });
  const [editServiceRows, setEditServiceRows] = useState<ServiceRow[]>([{ type: "", area: "", pricePerM2: "" }]);
  const [editPhotosPaths, setEditPhotosPaths] = useState<string[]>([]);

  // ── Orders (Tab 2) state ──────────────────────────────────────────────────
  const [orderSubFilter, setOrderSubFilter] = useState<"all" | "waiting_master" | "master_assigned" | "in_progress" | "cancellation_requested">("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [openDispatchId, setOpenDispatchId] = useState<number | null>(() => {
    const p = new URLSearchParams(window.location.search);
    const hl = parseInt(p.get("highlight") ?? "");
    return isNaN(hl) ? null : hl;
  });
  const [showManualAssign, setShowManualAssign] = useState(false);
  const [selectedMasterForAssign, setSelectedMasterForAssign] = useState<string>("");
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);
  const [unassignReason, setUnassignReason] = useState("");
  const [rebroadcastOnUnassign, setRebroadcastOnUnassign] = useState(false);
  const [operatorNoteEdit, setOperatorNoteEdit] = useState<string | null>(null);
  const [showStatusLog, setShowStatusLog] = useState(false);
  const [showReceipts, setShowReceipts] = useState(false);
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
  const [editAmountId, setEditAmountId] = useState<number | null>(null);
  const [editAmountValue, setEditAmountValue] = useState("");
  const [notifCopied, setNotifCopied] = useState(false);

  // ── Archive (Tab 3) state ─────────────────────────────────────────────────
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<"all" | "completed" | "cancelled" | "non_target" | "client_refusal" | "sent_to_work">("all");
  const [archiveCityFilter, setArchiveCityFilter] = useState("all");
  const [archiveDateFilter, setArchiveDateFilter] = useState<"all" | "today" | "yesterday" | "week" | "month">("all");
  const [archiveSearch, setArchiveSearch] = useState("");

  // ── Highlight from URL ────────────────────────────────────────────────────
  const highlightId = parseInt(new URLSearchParams(window.location.search).get("highlight") ?? "") || null;
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: leads, isLoading: leadsLoading } = useGetLeads({}, { query: { refetchInterval: 10000 } });
  const { data: orders, isLoading: ordersLoading } = useGetOrders({}, { query: { refetchInterval: 8000 } });
  const { data: cities } = useGetCities();
  const { data: services } = useGetServices();

  const { data: activeMasters } = useQuery<{ id: number; alias: string; city: string | null }[]>({
    queryKey: ["/api/masters"],
    queryFn: async () => {
      const r = await fetch("/api/masters", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      return (data as any[]).filter((m: any) => m.status === "active").map(m => ({ id: m.id, alias: m.alias, city: m.city }));
    },
    staleTime: 30000,
  });

  const { data: dispatchData, isLoading: dispatchLoading } = useQuery<DispatchInfo>({
    queryKey: ["/api/dispatch", openDispatchId],
    queryFn: async () => {
      const r = await fetch(`/api/dispatch/${openDispatchId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!openDispatchId,
    refetchInterval: 5000,
  });

  const { data: pendingDispatches } = useQuery<PendingDispatch[]>({
    queryKey: ["/api/dispatch/pending"],
    queryFn: async () => {
      const r = await fetch("/api/dispatch/pending", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 6000,
  });

  interface ReceiptEntry { id: number; token: string; prepaymentAmount: number; totalAmount: number; notes: string | null; clientName: string; clientPhone: string; createdAt: string; publicUrl: string; lineItems: { description: string; unit?: string; quantity?: number; price: number }[]; prepaymentSubmittedAt: string | null; clientSubmittedName: string | null; prepaymentScreenshotUrl: string | null; }
  const { data: receipts } = useQuery<ReceiptEntry[]>({
    queryKey: ["/api/receipts/order", openDispatchId],
    queryFn: async () => {
      const r = await fetch(`/api/receipts/order/${openDispatchId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!openDispatchId,
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

  const { data: leadTimelineEvents } = useQuery<{ id: number; event_type: string; description: string; user_alias: string | null; created_at: string }[]>({
    queryKey: ["/api/leads", selectedLead?.id, "events"],
    queryFn: async () => {
      const r = await fetch(`/api/leads/${selectedLead!.id}/events`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!selectedLead && showLeadTimeline,
  });

  // ── Auto-open lead from URL ────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openLeadId = parseInt(params.get("openLead") ?? "");
    if (openLeadId && leads) {
      const found = (leads as unknown as LeadRow[]).find(l => l.id === openLeadId);
      if (found) { setSelectedLead(found); window.history.replaceState({}, "", window.location.pathname); }
    }
  }, [leads]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const openOrder = openDispatchId ? orders?.find(o => o.id === openDispatchId) : null;
  const respondents = dispatchData?.dispatches.filter(d => d.status === "responded") ?? [];
  const rejectedDispatches = dispatchData?.dispatches.filter(d => d.status === "rejected") ?? [];
  const pendingDispatched = dispatchData?.dispatches.filter(d => d.status === "dispatched") ?? [];

  const activeLeads = useMemo(() => {
    if (!leads) return [];
    return (leads as unknown as LeadRow[]).filter(l => l.status === "new" || l.status === "processing");
  }, [leads]);

  const allLeads = useMemo(() => leads as unknown as LeadRow[] ?? [], [leads]);

  const filteredLeads = useMemo(() => {
    const q = leadSearchQuery.trim().toLowerCase();
    return allLeads.filter(l => {
      if (leadStatusFilter && l.status !== leadStatusFilter) return false;
      if (leadSourceFilter && l.source !== leadSourceFilter) return false;
      if (q) {
        const matches = l.clientName?.toLowerCase().includes(q) || l.clientPhone?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || (l.district ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [allLeads, leadStatusFilter, leadSourceFilter, leadSearchQuery]);

  // Only new/processing leads for Tab 1 display when no filter is set
  const tab1Leads = useMemo(() => {
    if (leadStatusFilter || leadSourceFilter || leadSearchQuery) return filteredLeads;
    return allLeads.filter(l => l.status === "new" || l.status === "processing");
  }, [allLeads, filteredLeads, leadStatusFilter, leadSourceFilter, leadSearchQuery]);

  const activeOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o => o.status !== "cancelled" && o.status !== "completed");
  }, [orders]);

  const filteredActiveOrders = useMemo(() => {
    if (!orders) return [];
    const q = orderSearch.toLowerCase();
    return orders.filter(o => {
      if (o.status === "cancelled" || o.status === "completed") return false;
      if (orderSubFilter !== "all" && o.status !== orderSubFilter) return false;
      if (q) {
        const m = String(o.id).includes(q) || (o.leadId != null && String(o.leadId).includes(q)) || o.city?.toLowerCase().includes(q) || o.serviceType?.toLowerCase().includes(q) || o.masterName?.toLowerCase().includes(q) || (o as any).clientPhone?.toLowerCase().includes(q);
        if (!m) return false;
      }
      return true;
    });
  }, [orders, orderSubFilter, orderSearch]);

  const archiveLeads = useMemo(() => {
    if (!allLeads) return [];
    return allLeads.filter(l => ["non_target", "client_refusal", "sent_to_work"].includes(l.status));
  }, [allLeads]);

  const archiveOrders = useMemo(() => {
    if (!orders) return [];
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = startOfDay(now);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const q = archiveSearch.toLowerCase();
    return orders.filter(o => {
      if (o.status !== "cancelled" && o.status !== "completed") return false;
      if (archiveStatusFilter !== "all" && o.status !== archiveStatusFilter) return false;
      if (archiveCityFilter !== "all" && o.city !== archiveCityFilter) return false;
      if (q) {
        const m = String(o.id).includes(q) || o.city?.toLowerCase().includes(q) || o.serviceType?.toLowerCase().includes(q) || o.masterName?.toLowerCase().includes(q) || (o as any).clientPhone?.toLowerCase().includes(q);
        if (!m) return false;
      }
      if (archiveDateFilter !== "all") {
        const created = new Date(o.createdAt);
        if (archiveDateFilter === "today" && created < today) return false;
        if (archiveDateFilter === "yesterday" && (created < yesterday || created >= today)) return false;
        if (archiveDateFilter === "week" && created < weekAgo) return false;
        if (archiveDateFilter === "month" && created < monthStart) return false;
      }
      return true;
    });
  }, [orders, archiveStatusFilter, archiveCityFilter, archiveDateFilter, archiveSearch]);

  const availableArchiveCities = useMemo(() => {
    if (!orders) return [];
    return Array.from(new Set(orders.filter(o => o.status === "completed" || o.status === "cancelled").map(o => o.city).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "ru"));
  }, [orders]);

  const pendingAmountOrders = orders?.filter(o => (o as any).proposedAmount && !(o as any).orderAmount) ?? [];
  const cancellationOrders = orders?.filter(o => o.status === "cancellation_requested" as any) ?? [];
  const pendingResponseOrders = pendingDispatches ?? [];

  // Tab badge counts
  const newLeadsCount = activeLeads.filter(l => l.status === "new").length;
  const problemOrdersCount = cancellationOrders.length;
  const tab1Badge = newLeadsCount;
  const tab2Badge = problemOrdersCount + pendingResponseOrders.length;

  // ── Leads Mutations ───────────────────────────────────────────────────────
  const createMutation = useCreateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
        setIsCreateOpen(false);
        resetForm();
        toast({ title: "Заявка создана" });
      }
    }
  });

  const sendToWorkMutation = useSendLeadToBuffer({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        setConfirmSendLead(null);
        toast({ title: "Заявка отправлена мастерам", description: data?.id ? `Создан заказ #${data.leadId ?? data.id}` : "Заказ создан" });
        setActiveTab("work");
      },
      onError: () => toast({ title: "Ошибка отправки", variant: "destructive" }),
    }
  });

  const quickStatusMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: number; status: string; reason?: string }) => {
      const r = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status, ...(reason ? { cancellationReason: reason } : {}) }) });
      if (!r.ok) throw new Error("Ошибка");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/leads"] }),
    onError: () => toast({ title: "Ошибка смены статуса", variant: "destructive" }),
  });

  const deleteLeadMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/leads/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Перемещено в корзину" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (id: number) => {
      const validRows = editServiceRows.filter(r => r.type && r.area);
      const srvs = validRows.map(r => ({ type: r.type, area: parseFloat(r.area), pricePerM2: parseFloat(r.pricePerM2) || 0 }));
      const body: any = { ...editFormData, services: srvs, photos: editPhotosPaths, scheduledAt: editFormData.scheduledAt || null, source: editFormData.source || null, comment: editFormData.comment || null };
      const r = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Ошибка сохранения");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/leads"] }); toast({ title: "Заявка обновлена" }); closeEditModal(); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  // ── Orders Mutations ──────────────────────────────────────────────────────
  const broadcastMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/dispatch/${orderId}/broadcast`, { method: "POST", credentials: "include" });
      if (!r.ok) { const text = await r.text(); let msg = "Ошибка"; try { msg = JSON.parse(text).error ?? msg; } catch {} throw new Error(msg); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] }); },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ orderId, masterId }: { orderId: number; masterId: number }) => {
      const r = await fetch(`/api/dispatch/${orderId}/assign/${masterId}`, { method: "POST", credentials: "include" });
      if (!r.ok) { const text = await r.text(); let msg = "Ошибка"; try { msg = JSON.parse(text).error ?? msg; } catch {} throw new Error(msg); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] }); toast({ title: "Мастер назначен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const manualAssignMutation = useMutation({
    mutationFn: async ({ orderId, masterId }: { orderId: number; masterId: number }) => {
      const r = await fetch(`/api/orders/${orderId}/manual-assign/${masterId}`, { method: "POST", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] }); setShowManualAssign(false); setSelectedMasterForAssign(""); toast({ title: "Мастер назначен вручную" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const unassignMutation = useMutation({
    mutationFn: async ({ orderId, reason, rebroadcast }: { orderId: number; reason: string; rebroadcast: boolean }) => {
      const r = await fetch(`/api/orders/${orderId}/unassign-master`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, rebroadcast }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dispatch", openDispatchId] });
      broadcastMutation.reset();
      setShowUnassignDialog(false);
      setUnassignReason("");
      setRebroadcastOnUnassign(false);
      const rebroadcastInfo = data?.rebroadcast?.ok ? ` Разослано ${data.rebroadcast.sent} мастерам.` : "";
      toast({ title: "Мастер снят с заказа", description: `Снят успешно.${rebroadcastInfo}` });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: number; reason: string }) => {
      const r = await fetch(`/api/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status: "cancelled", clientCancelReason: reason }) });
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
      toast({ title: "Заказ отменён" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/orders/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); toast({ title: "Перемещено в корзину" }); },
  });

  const acceptProposedMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ acceptProposedAmount: true }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
  });

  const setAmountMutation = useMutation({
    mutationFn: async ({ orderId, amount }: { orderId: number; amount: number }) => {
      const r = await fetch(`/api/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ orderAmount: amount }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); setEditAmountId(null); setEditAmountValue(""); },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async ({ orderId, note }: { orderId: number; note: string }) => {
      const r = await fetch(`/api/orders/${orderId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operatorNote: note }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); setOperatorNoteEdit(null); toast({ title: "Заметка сохранена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const approveCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ approveCancellation: true }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
  });

  const rejectCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ rejectCancellation: true }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/orders"] }),
  });

  const restoreOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ restoreOrder: true }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/orders"] }); setOpenDispatchId(null); toast({ title: "Заказ восстановлен" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const deleteReceiptMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/receipts/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", openDispatchId] }); toast({ title: "Смета удалена" }); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openMasterChat = (masterId: number) => { closeOrderPanel(); setLocation(`/master-chat?masterId=${masterId}`); };

  const closeOrderPanel = () => {
    setOpenDispatchId(null);
    setShowManualAssign(false);
    setSelectedMasterForAssign("");
    setShowStatusLog(false);
    setShowReceipts(false);
    setShowCreateReceipt(false);
    setCrmCreatedUrl(null);
    setCrmLineItems([{ description: "", unit: "", quantity: "1", price: "" }]);
    setCrmPrepayment("5000");
    setCrmNotes("");
    setOperatorNoteEdit(null);
    setShowCancelDialog(false);
    setCancelDialogReason("");
    setCancelDialogNote("");
    setEditingCrmReceiptId(null);
    broadcastMutation.reset();
  };

  const checkPhone = useCallback((phone: string) => {
    if (phoneCheckTimeout.current) clearTimeout(phoneCheckTimeout.current);
    if (phone.length < 7) { setPhoneCheckResult(null); return; }
    phoneCheckTimeout.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/leads/check-phone?phone=${encodeURIComponent(phone)}`, { credentials: "include" });
        if (r.ok) setPhoneCheckResult(await r.json());
      } catch {}
    }, 600);
  }, []);

  const resetForm = () => {
    setFormData({ clientName: "", clientPhone: "", city: "", district: "", comment: "", scheduledAt: "", source: "" });
    setServiceRows([{ type: "", area: "", pricePerM2: "" }]);
    setPhotosPaths([]);
    setPhoneCheckResult(null);
  };

  const openEditModal = (lead: LeadRow) => {
    setEditingLead(lead);
    setEditFormData({ clientName: lead.clientName, clientPhone: lead.clientPhone, city: lead.city, district: lead.district ?? "", comment: lead.comment ?? "", scheduledAt: lead.scheduledAt ? lead.scheduledAt.slice(0, 16) : "", source: lead.source ?? "", status: lead.status });
    setEditServiceRows(lead.services && lead.services.length > 0 ? lead.services.map(s => ({ type: s.type, area: String(s.area), pricePerM2: String(s.pricePerM2 ?? "") })) : [{ type: lead.serviceType, area: String(lead.area), pricePerM2: "" }]);
    setEditPhotosPaths(lead.photos ?? []);
  };

  const closeEditModal = () => {
    setEditingLead(null);
    setEditFormData({ clientName: "", clientPhone: "", city: "", district: "", comment: "", scheduledAt: "", source: "", status: "" });
    setEditServiceRows([{ type: "", area: "", pricePerM2: "" }]);
    setEditPhotosPaths([]);
  };

  const addRow = () => setServiceRows(r => [...r, { type: "", area: "", pricePerM2: "" }]);
  const removeRow = (i: number) => setServiceRows(r => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof ServiceRow, value: string) => setServiceRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row));

  const editAddRow = () => setEditServiceRows(r => [...r, { type: "", area: "", pricePerM2: "" }]);
  const editRemoveRow = (i: number) => setEditServiceRows(r => r.filter((_, idx) => idx !== i));
  const editUpdateRow = (i: number, field: keyof ServiceRow, value: string) => setEditServiceRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row));

  const totalArea = serviceRows.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  const totalEstimate = serviceRows.reduce((sum, r) => sum + (parseFloat(r.area) || 0) * (parseFloat(r.pricePerM2) || 0), 0);
  const editTotalArea = editServiceRows.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  const editTotalEstimate = editServiceRows.reduce((sum, r) => sum + (parseFloat(r.area) || 0) * (parseFloat(r.pricePerM2) || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = serviceRows.filter(r => r.type && r.area);
    if (validRows.length === 0) return;
    const srvs = validRows.map(r => ({ type: r.type, area: parseFloat(r.area), pricePerM2: parseFloat(r.pricePerM2) || 0 }));
    createMutation.mutate({ data: { ...formData, services: srvs as any, serviceType: srvs.map(s => s.type).join(", "), area: srvs.reduce((sum, s) => sum + s.area, 0), photos: photosPaths.length > 0 ? photosPaths as any : undefined } });
  };

  // ── Order sub-filter labels ───────────────────────────────────────────────
  const subFilters: { key: typeof orderSubFilter; label: string; color: string }[] = [
    { key: "all",                    label: "Все",                  color: "" },
    { key: "waiting_master",         label: "⏳ Ждут мастера",      color: "amber" },
    { key: "master_assigned",        label: "👷 Мастер назначен",   color: "blue" },
    { key: "in_progress",            label: "🔨 В работе",          color: "green" },
    { key: "cancellation_requested", label: "⚠️ Проблемные",        color: "red" },
  ];

  const subFilterCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, waiting_master: 0, master_assigned: 0, in_progress: 0, cancellation_requested: 0 };
    for (const o of activeOrders) {
      counts.all++;
      if (o.status === "waiting_master") counts.waiting_master++;
      else if (o.status === "master_assigned") counts.master_assigned++;
      else if (o.status === "in_progress") counts.in_progress++;
      else if (o.status === "cancellation_requested") counts.cancellation_requested++;
    }
    return counts;
  }, [activeOrders]);

  // ── Row color for orders ──────────────────────────────────────────────────
  const orderRowBg = (order: any) => {
    const waitH = (Date.now() - new Date(order.createdAt).getTime()) / 3600000;
    if (order.status === "cancellation_requested") return "bg-red-50/60";
    if (order.status === "waiting_master") {
      if (waitH > 2) return "bg-red-50/40";
      if (waitH > 1) return "bg-amber-50/40";
      return "";
    }
    if (order.status === "master_assigned") return "bg-blue-50/30";
    if (order.status === "in_progress") return "bg-green-50/30";
    return "";
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <ProtectedRoute allowedRoles={['admin', 'lead_operator', 'master_operator']} permissionKey="leads">
      <Layout>
        <div className="space-y-6">

          {/* ── Page Header ── */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Заявки</h1>
              <p className="text-muted-foreground mt-1">Управление заявками и заказами</p>
            </div>
            {activeTab === "new" && (
              <button onClick={() => setIsCreateOpen(true)} className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <Plus className="w-4 h-4" /> Новая заявка
              </button>
            )}
          </div>

          {/* ── Tab Bar ── */}
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-2xl border border-border/50">
            {[
              { key: "new",     label: "Новые",    icon: Inbox,    badge: tab1Badge },
              { key: "work",    label: "В работе", icon: Briefcase, badge: tab2Badge },
              { key: "archive", label: "Архив",    icon: Archive,  badge: null },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative ${activeTab === tab.key ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════
              TAB 1: НОВЫЕ
          ══════════════════════════════════════════════════════════ */}
          {activeTab === "new" && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card rounded-2xl border border-border/50 px-4 py-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${newLeadsCount > 0 ? "bg-red-100" : "bg-slate-100"}`}>
                    <Inbox className={`w-4 h-4 ${newLeadsCount > 0 ? "text-red-600" : "text-slate-400"}`} />
                  </div>
                  <div>
                    <p className={`text-xl font-bold ${newLeadsCount > 0 ? "text-red-600" : "text-foreground"}`}>{newLeadsCount}</p>
                    <p className="text-xs text-muted-foreground">Новых</p>
                  </div>
                </div>
                <div className="bg-card rounded-2xl border border-border/50 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{activeLeads.filter(l => l.status === "processing").length}</p>
                    <p className="text-xs text-muted-foreground">В обработке</p>
                  </div>
                </div>
                <div className="bg-card rounded-2xl border border-border/50 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
                    <Timer className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">
                      {activeLeads.length > 0 ? (() => {
                        const oldest = Math.max(...activeLeads.map(l => Date.now() - new Date(l.createdAt).getTime()));
                        const m = Math.floor(oldest / 60000);
                        return m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч`;
                      })() : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Самая старая</p>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  <input type="text" value={leadSearchQuery} onChange={e => setLeadSearchQuery(e.target.value)} placeholder="Поиск по имени, телефону, городу..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                  {leadSearchQuery && <button onClick={() => setLeadSearchQuery("")} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
                </div>
                <div className="w-full sm:w-44 relative">
                  <Filter className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
                  <select value={leadStatusFilter} onChange={e => setLeadStatusFilter(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none text-sm">
                    <option value="">Все статусы</option>
                    <option value={LeadStatus.new}>Новые</option>
                    <option value={LeadStatus.processing}>В обработке</option>
                    <option value={LeadStatus.sent_to_work}>Отправлены в работу</option>
                    <option value={LeadStatus.non_target}>Нецелевые</option>
                    <option value={LeadStatus.client_refusal}>Отказ</option>
                  </select>
                </div>
                <div className="w-full sm:w-44 relative">
                  <Radio className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
                  <select value={leadSourceFilter} onChange={e => setLeadSourceFilter(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none text-sm">
                    <option value="">Все источники</option>
                    {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3 self-center">
                  {!leadsLoading && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {tab1Leads.length} заявок
                    </span>
                  )}
                  {(leadStatusFilter || leadSourceFilter || leadSearchQuery) && (
                    <button onClick={() => { setLeadStatusFilter(""); setLeadSourceFilter(""); setLeadSearchQuery(""); }} className="text-xs text-primary hover:underline whitespace-nowrap">Сбросить</button>
                  )}
                </div>
              </div>

              {/* Leads table */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50 text-xs">
                      <tr>
                        <th className="px-3 py-2.5 pl-4">Статус</th>
                        <th className="px-3 py-2.5">ID</th>
                        <th className="px-3 py-2.5">Клиент</th>
                        <th className="px-3 py-2.5">Город · Источник</th>
                        <th className="px-3 py-2.5">Услуги</th>
                        <th className="px-3 py-2.5">Смета</th>
                        <th className="px-3 py-2.5 pr-4 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {leadsLoading ? (
                        <tr><td colSpan={7} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                      ) : tab1Leads.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">{leadSearchQuery || leadStatusFilter || leadSourceFilter ? "Ничего не найдено" : "Новых заявок нет"}</td></tr>
                      ) : tab1Leads.map(lead => {
                        const srvs = lead.services;
                        const estimate = srvs ? srvs.reduce((sum, s) => sum + s.area * (s.pricePerM2 || 0), 0) : 0;
                        const sourceName = SOURCE_OPTIONS.find(o => o.value === lead.source)?.label;
                        const isActive = lead.status === LeadStatus.new || lead.status === LeadStatus.processing;
                        const firstService = srvs && srvs.length > 0 ? srvs[0] : null;
                        const serviceLabel = firstService ? `${firstService.type}${srvs!.length > 1 ? ` +${srvs!.length - 1}` : ""}` : lead.serviceType;
                        const totalArea2 = srvs ? srvs.reduce((s, r) => s + r.area, 0) : lead.area;
                        const age = leadAge(lead);
                        return (
                          <tr key={lead.id} onClick={() => { setSelectedLead(lead); setShowLeadTimeline(false); }} className={`cursor-pointer hover:bg-slate-50 transition-colors ${isActive ? "" : "opacity-75"}`}>
                            <td className="px-3 py-2.5 pl-4">
                              <StatusBadge status={lead.status} type="lead" />
                              {lead.scheduledAt && <div className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-500 font-medium"><Clock className="w-2.5 h-2.5" />{new Date(lead.scheduledAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</div>}
                              {age && <div className={`flex items-center gap-0.5 mt-0.5 text-[10px] font-medium ${age.urgent ? "text-red-500" : age.warning ? "text-orange-500" : "text-muted-foreground"}`}><Clock className="w-2.5 h-2.5" />{age.label}</div>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="font-semibold text-foreground">#{lead.id}</span>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(lead.createdAt)}</div>
                            </td>
                            <td className="px-3 py-2.5 max-w-[160px]">
                              <p className="font-medium text-foreground truncate">{lead.clientName}</p>
                              <a href={`tel:${lead.clientPhone}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline">{lead.clientPhone}</a>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <p className="text-sm text-foreground">{lead.city}</p>
                              {lead.district && <p className="text-[10px] text-muted-foreground">{lead.district}</p>}
                              {sourceName && <p className="text-[10px] text-muted-foreground/70">{sourceName}</p>}
                            </td>
                            <td className="px-3 py-2.5 max-w-[180px]">
                              <p className="text-sm text-foreground truncate">{serviceLabel}</p>
                              <p className="text-xs text-muted-foreground">{totalArea2} м²</p>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {estimate > 0 ? <span className="font-semibold text-emerald-600">{fmtMoney(estimate)}</span> : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-2.5 pr-4">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {(lead.photos?.length ?? 0) > 0 && <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5"><Images className="w-2.5 h-2.5" />{lead.photos!.length}</span>}
                                {lead.status === "sent_to_work" && lead.orderId && (
                                  <button onClick={e => { e.stopPropagation(); setActiveTab("work"); setOpenDispatchId(lead.orderId!); }} className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-medium hover:bg-emerald-100 transition-colors">
                                    <ExternalLink className="w-2.5 h-2.5" />Заказ #{lead.orderId}
                                  </button>
                                )}
                                {isActive && (
                                  <button onClick={e => { e.stopPropagation(); setConfirmSendLead(lead); }} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium hover:bg-primary/20 transition-colors">
                                    <Play className="w-2.5 h-2.5" />Отправить
                                  </button>
                                )}
                                <button onClick={e => { e.stopPropagation(); deleteLeadMutation.mutate(lead.id); }} title="В корзину" className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════
              TAB 2: В РАБОТЕ
          ══════════════════════════════════════════════════════════ */}
          {activeTab === "work" && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Ждут мастера", count: subFilterCounts.waiting_master, color: "amber" },
                  { label: "Мастер назначен", count: subFilterCounts.master_assigned, color: "blue" },
                  { label: "В работе", count: subFilterCounts.in_progress, color: "green" },
                  { label: "Проблемные", count: subFilterCounts.cancellation_requested, color: "red" },
                ].map(stat => (
                  <div key={stat.label} className="bg-card rounded-2xl border border-border/50 px-4 py-3">
                    <p className={`text-xl font-bold ${stat.count > 0 && stat.color === "red" ? "text-red-600" : stat.count > 0 && stat.color === "amber" ? "text-amber-600" : "text-foreground"}`}>{stat.count}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Cancellation requests banner */}
              {cancellationOrders.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-red-800 font-semibold text-sm mb-1">
                    <AlertCircle className="w-4 h-4" />
                    {cancellationOrders.length === 1 ? "1 запрос на отмену заказа" : `${cancellationOrders.length} запроса на отмену`}
                  </div>
                  {cancellationOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-xl border border-red-100 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                            <span className="font-medium text-foreground">#{order.leadId ?? order.id}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-foreground">{order.serviceType}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-muted-foreground text-xs">{order.city}</span>
                          </div>
                          {order.masterName && <button onClick={() => order.masterId && openMasterChat(order.masterId)} className="text-xs text-blue-600 hover:underline mt-0.5">мастер {order.masterName}</button>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {order.masterId && <button onClick={() => openMasterChat(order.masterId!)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg font-medium text-xs"><MessageSquare className="w-3 h-3" />Чат</button>}
                          <button onClick={() => { if (confirm(`Назначить другого мастера?`)) rejectCancellationMutation.mutate(order.id); }} disabled={rejectCancellationMutation.isPending} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg font-medium text-xs disabled:opacity-50"><RefreshCw className="w-3 h-3" />Назначить другого</button>
                          <button onClick={() => { if (confirm(`Отменить заказ?`)) approveCancellationMutation.mutate(order.id); }} disabled={approveCancellationMutation.isPending} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500 text-white hover:bg-red-600 rounded-lg font-medium text-xs disabled:opacity-50"><XCircle className="w-3 h-3" />Отменить</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending responses banner */}
              {pendingResponseOrders.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm mb-1">
                    <Users className="w-4 h-4" />
                    {pendingResponseOrders.length === 1 ? "1 заявка — есть отклики от мастеров" : `${pendingResponseOrders.length} заявки — есть отклики`}
                  </div>
                  {pendingResponseOrders.map(item => (
                    <div key={item.orderId} className="bg-white rounded-xl border border-blue-100 px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                          <span className="font-medium text-foreground">#{item.leadId ?? item.orderId}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-foreground">{item.serviceType}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground text-xs">{item.city}{item.district ? `, ${item.district}` : ""}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
                            <UserCheck className="w-3 h-3" />{item.respondentCount} {item.respondentCount === 1 ? "отклик" : item.respondentCount < 5 ? "отклика" : "откликов"}
                          </span>
                        </div>
                        <button onClick={() => setOpenDispatchId(item.orderId)} className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded-lg font-medium text-xs">
                          <UserCheck className="w-3 h-3" />Назначить мастера
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.respondents.map(r => (
                          <button key={r.masterId} onClick={() => openMasterChat(r.masterId)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-medium">
                            <MessageSquare className="w-3 h-3" />{r.masterName}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending amount banner */}
              {pendingAmountOrders.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-1">
                    <DollarSign className="w-4 h-4" />
                    {pendingAmountOrders.length === 1 ? "1 заказ ожидает подтверждения суммы" : `${pendingAmountOrders.length} заказа ожидают подтверждения`}
                  </div>
                  {pendingAmountOrders.map(order => (
                    <div key={order.id} className="flex items-start justify-between gap-3 bg-white rounded-xl border border-amber-100 px-4 py-3">
                      <div>
                        <span className="font-medium text-foreground">#{order.leadId ?? order.id}</span>
                        <span className="mx-2 text-muted-foreground">·</span>
                        <span className="text-foreground">{order.serviceType}</span>
                        <span className="mx-2 text-muted-foreground">·</span>
                        <span className="text-amber-700 font-semibold">{fmtMoney(Number((order as any).proposedAmount))}</span>
                        {order.masterName && <button onClick={() => order.masterId && openMasterChat(order.masterId)} className="ml-2 text-xs text-blue-600 hover:underline">мастер {order.masterName}</button>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {order.masterId && <button onClick={() => openMasterChat(order.masterId!)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg font-medium text-xs"><MessageSquare className="w-3 h-3" />Чат</button>}
                        <button onClick={() => { if (confirm(`Принять сумму ${fmtMoney(Number((order as any).proposedAmount))}?`)) acceptProposedMutation.mutate(order.id); }} disabled={acceptProposedMutation.isPending} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500 text-white hover:bg-amber-600 rounded-lg font-medium text-xs disabled:opacity-50">{acceptProposedMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}Принять</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Sub-filter pills + search */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border/50 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {subFilters.map(sf => (
                      <button key={sf.key} onClick={() => setOrderSubFilter(sf.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${orderSubFilter === sf.key ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"}`}
                      >
                        {sf.label}
                        {subFilterCounts[sf.key] > 0 && <span className="ml-1.5 font-bold">{subFilterCounts[sf.key]}</span>}
                      </button>
                    ))}
                    <div className="relative ml-auto">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Поиск..." className="w-full pl-8 pr-8 py-1.5 text-sm bg-background border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      {orderSearch && <button onClick={() => setOrderSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                </div>

                {/* Orders table */}
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
                        <th className="px-3 py-2.5">Время</th>
                        <th className="px-3 py-2.5 pr-4 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {ordersLoading ? (
                        <tr><td colSpan={8} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                      ) : filteredActiveOrders.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">{orderSearch ? "Ничего не найдено" : "Активных заказов нет"}</td></tr>
                      ) : filteredActiveOrders.map(order => {
                        const ds = (order as any).dispatchStatus ?? "none";
                        const confirmed = (order as any).orderAmount ? Number((order as any).orderAmount) : null;
                        const proposed = (order as any).proposedAmount ? Number((order as any).proposedAmount) : null;
                        const waitH = (Date.now() - new Date(order.createdAt).getTime()) / 3600000;
                        const rowBg = orderRowBg(order);
                        return (
                          <tr key={order.id} ref={order.id === highlightId ? highlightRowRef : undefined}
                            onClick={() => { setOpenDispatchId(order.id); broadcastMutation.reset(); }}
                            className={`cursor-pointer transition-colors hover:bg-slate-50 ${rowBg} ${order.id === highlightId ? "ring-2 ring-inset ring-primary/40" : ""}`}
                          >
                            <td className="px-3 py-2.5 pl-4">
                              <StatusBadge status={order.status} type="order" />
                              {ds !== "none" && <div className="mt-0.5"><DispatchBadge status={ds} /></div>}
                              {order.status === "waiting_master" && (
                                <div className={`flex items-center gap-1 mt-0.5 text-[10px] font-medium ${waitH > 2 ? "text-red-500" : waitH > 1 ? "text-amber-500" : "text-muted-foreground"}`}>
                                  <Timer className="w-2.5 h-2.5" />{timeSince(order.createdAt)}{waitH > 2 && <AlertTriangle className="w-2.5 h-2.5" />}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="font-semibold text-foreground">#{order.leadId ?? order.id}</span>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(order.createdAt)}</div>
                            </td>
                            <td className="px-3 py-2.5 max-w-[220px]">
                              <p className="font-medium text-foreground truncate">{order.serviceType}</p>
                              <p className="text-xs text-muted-foreground truncate">{order.city}{order.district ? `, ${order.district}` : ""}</p>
                            </td>
                            <td className="px-3 py-2.5 max-w-[140px]">
                              <p className="font-medium text-foreground truncate">{(order as any).clientName ?? "—"}</p>
                              {(order as any).clientPhone && <a href={`tel:${(order as any).clientPhone}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline">{(order as any).clientPhone}</a>}
                            </td>
                            <td className="px-3 py-2.5">
                              {order.masterName ? (
                                <button onClick={e => { e.stopPropagation(); if (order.masterId) openMasterChat(order.masterId); }} className="text-xs text-blue-600 hover:underline text-left">{order.masterName}</button>
                              ) : <span className="text-muted-foreground/40 text-xs">не назначен</span>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {confirmed ? <span className="font-semibold text-emerald-600 text-xs">{fmtMoney(confirmed)}</span>
                                : proposed ? <span className="text-amber-600 text-xs font-medium">{fmtMoney(proposed)} <span className="text-[10px] text-muted-foreground">предл.</span></span>
                                : <span className="text-muted-foreground/40 text-xs">—</span>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="text-xs text-muted-foreground">{timeSince(order.createdAt)}</span>
                            </td>
                            <td className="px-3 py-2.5 pr-4">
                              <div className="flex items-center justify-end gap-1">
                                {order.masterId && (
                                  <button onClick={e => { e.stopPropagation(); openMasterChat(order.masterId!); }} title="Чат с мастером" className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-blue-600 hover:bg-blue-50 transition-all"><MessageSquare className="w-3.5 h-3.5" /></button>
                                )}
                                <button onClick={e => { e.stopPropagation(); setOpenDispatchId(order.id); broadcastMutation.reset(); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-all"><ChevronRight className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════
              TAB 3: АРХИВ
          ══════════════════════════════════════════════════════════ */}
          {activeTab === "archive" && (
            <>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3 bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex-wrap">
                <div className="flex-1 min-w-[180px] relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  <input value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)} placeholder="Поиск по ID, городу, услуге..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
                </div>
                <div className="w-full sm:w-44 relative">
                  <Filter className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
                  <select value={archiveStatusFilter} onChange={e => setArchiveStatusFilter(e.target.value as any)} className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none appearance-none text-sm">
                    <option value="all">Все статусы</option>
                    <option value="completed">Завершённые</option>
                    <option value="cancelled">Отменённые</option>
                  </select>
                </div>
                {availableArchiveCities.length > 1 && (
                  <div className="w-full sm:w-40 relative">
                    <MapPin className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
                    <select value={archiveCityFilter} onChange={e => setArchiveCityFilter(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none appearance-none text-sm">
                      <option value="all">Все города</option>
                      {availableArchiveCities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {(["all","today","yesterday","week","month"] as const).map(period => {
                    const labels = { all: "Все", today: "Сегодня", yesterday: "Вчера", week: "7 дней", month: "Месяц" };
                    return (
                      <button key={period} onClick={() => setArchiveDateFilter(period)} className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${archiveDateFilter === period ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"}`}>
                        {labels[period]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Archive table */}
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50 text-xs">
                      <tr>
                        <th className="px-3 py-2.5 pl-4">ID</th>
                        <th className="px-3 py-2.5">Дата</th>
                        <th className="px-3 py-2.5">Город · Услуга</th>
                        <th className="px-3 py-2.5">Клиент</th>
                        <th className="px-3 py-2.5">Мастер</th>
                        <th className="px-3 py-2.5">Сумма</th>
                        <th className="px-3 py-2.5">Ком.</th>
                        <th className="px-3 py-2.5">Статус</th>
                        <th className="px-3 py-2.5 pr-4 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {ordersLoading ? (
                        <tr><td colSpan={9} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                      ) : archiveOrders.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Архив пуст</td></tr>
                      ) : archiveOrders.map(order => {
                        const amount = (order as any).orderAmount ? Number((order as any).orderAmount) : null;
                        const commission = (order as any).commission ? Number((order as any).commission) : null;
                        const rating = (order as any).clientRating;
                        return (
                          <tr key={order.id} onClick={() => setOpenDispatchId(order.id)} className="cursor-pointer hover:bg-slate-50 transition-colors opacity-90">
                            <td className="px-3 py-2.5 pl-4 whitespace-nowrap">
                              <span className="font-semibold text-foreground">#{order.leadId ?? order.id}</span>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <p className="text-xs text-foreground">{formatDate(order.createdAt)}</p>
                            </td>
                            <td className="px-3 py-2.5 max-w-[200px]">
                              <p className="font-medium text-foreground truncate">{order.serviceType}</p>
                              <p className="text-xs text-muted-foreground">{order.city}{order.district ? `, ${order.district}` : ""}</p>
                            </td>
                            <td className="px-3 py-2.5 max-w-[140px]">
                              <p className="text-sm text-foreground truncate">{(order as any).clientName ?? "—"}</p>
                              {(order as any).clientPhone && <p className="text-xs text-muted-foreground">{(order as any).clientPhone}</p>}
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="text-sm text-foreground">{order.masterName ?? "—"}</p>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {amount ? <span className="font-semibold text-emerald-600 text-xs">{fmtMoney(amount)}</span> : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {commission ? <span className="text-xs text-muted-foreground">{fmtMoney(commission)}</span> : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              <StatusBadge status={order.status} type="order" />
                              {rating && <div className="text-[10px] text-amber-500 mt-0.5">{"★".repeat(rating)}{"☆".repeat(5-rating)}</div>}
                            </td>
                            <td className="px-3 py-2.5 pr-4">
                              <button onClick={e => { e.stopPropagation(); setOpenDispatchId(order.id); }} className="text-xs text-primary hover:underline">Открыть</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

        </div>

        {/* ══════════════════════════════════════════════════════════
            LEAD DETAIL PANEL (right slide)
        ══════════════════════════════════════════════════════════ */}
        {selectedLead && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
              <div className="px-6 py-4 border-b border-border/50 flex items-start justify-between flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-display font-bold text-foreground">Заявка #{selectedLead.id}</h2>
                    <StatusBadge status={selectedLead.status} type="lead" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{selectedLead.city}{selectedLead.district ? `, ${selectedLead.district}` : ""}</p>
                </div>
                <button onClick={() => setSelectedLead(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 flex-shrink-0 ml-2"><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <div className="overflow-y-auto flex-1">
                <div className="p-6 space-y-4">
                  {/* Client info */}
                  <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5 text-sm">
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Клиент</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Имя</p><p className="font-medium text-foreground">{selectedLead.clientName}</p></div>
                      <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Телефон</p><a href={`tel:${selectedLead.clientPhone}`} className="font-medium text-blue-600 hover:underline">{selectedLead.clientPhone}</a></div>
                      <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Город · Район</p><p className="font-medium text-foreground">{selectedLead.city}{selectedLead.district ? `, ${selectedLead.district}` : ""}</p></div>
                      {selectedLead.source && <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Источник</p><p className="font-medium text-foreground">{SOURCE_OPTIONS.find(o => o.value === selectedLead.source)?.label ?? selectedLead.source}</p></div>}
                      {selectedLead.scheduledAt && <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Дата выезда</p><p className="font-medium text-blue-600">{new Date(selectedLead.scheduledAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>}
                      <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Создана</p><p className="font-medium text-foreground">{formatDate(selectedLead.createdAt)}</p></div>
                    </div>
                  </div>
                  {/* Services */}
                  {(() => {
                    const srvs = selectedLead.services;
                    const estimate = srvs ? srvs.reduce((sum, s) => sum + s.area * (s.pricePerM2 || 0), 0) : 0;
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Услуги</p>
                          {estimate > 0 && <span className="text-sm font-bold text-emerald-600">≈ {fmtMoney(estimate)}</span>}
                        </div>
                        <div className="rounded-xl border border-border/60 overflow-hidden">
                          {srvs && srvs.length > 0 ? srvs.map((s, i) => (
                            <div key={i} className={`flex items-center justify-between px-4 py-2.5 text-sm ${i > 0 ? "border-t border-border/40" : ""}`}>
                              <div><span className="font-medium text-foreground">{s.type}</span><span className="text-muted-foreground text-xs ml-2">{s.area} м²</span></div>
                              {s.area * (s.pricePerM2 || 0) > 0 && <span className="font-semibold text-emerald-600 text-xs">{(s.area * s.pricePerM2).toLocaleString("ru-RU")} ₽</span>}
                            </div>
                          )) : (
                            <div className="px-4 py-2.5 text-sm flex items-center justify-between">
                              <div><span className="font-medium text-foreground">{selectedLead.serviceType}</span><span className="text-muted-foreground text-xs ml-2">{selectedLead.area} м²</span></div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Comment */}
                  {selectedLead.comment && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Комментарий</p>
                      <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-foreground leading-relaxed">{selectedLead.comment}</div>
                    </div>
                  )}
                  {/* Photos */}
                  {selectedLead.photos && selectedLead.photos.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Фотографии ({selectedLead.photos.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedLead.photos.map((p, i) => (
                          <a key={i} href={`/api/storage${p}`} target="_blank" rel="noopener noreferrer"><img src={`/api/storage${p}`} alt={`Фото ${i+1}`} className="w-16 h-16 object-cover rounded-xl border border-border hover:opacity-80 transition-opacity" /></a>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Timeline */}
                  <div className="space-y-2">
                    <button onClick={() => setShowLeadTimeline(v => !v)} className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground font-semibold tracking-wide hover:text-foreground transition-colors">
                      <History className="w-3.5 h-3.5" />История событий<ChevronDown className={`w-3 h-3 transition-transform ${showLeadTimeline ? "rotate-180" : ""}`} />
                    </button>
                    {showLeadTimeline && (
                      <div className="space-y-1">
                        {!leadTimelineEvents ? (
                          <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                        ) : leadTimelineEvents.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">Событий не найдено</p>
                        ) : (
                          <div className="relative pl-4 space-y-0">
                            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                            {leadTimelineEvents.map(ev => (
                              <div key={ev.id} className="relative flex gap-3 py-1.5">
                                <div className="absolute -left-2.5 top-2.5 w-2 h-2 rounded-full bg-primary/40 border-2 border-background" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-foreground leading-snug">{ev.description}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(ev.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{ev.user_alias ? ` · ${ev.user_alias}` : ""}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Link to order */}
                  {selectedLead.status === "sent_to_work" && selectedLead.orderId && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /><span className="text-sm font-medium text-emerald-700">Заявка отправлена в работу</span></div>
                      <button onClick={() => { setSelectedLead(null); setActiveTab("work"); setOpenDispatchId(selectedLead.orderId!); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline">
                        Заказ #{selectedLead.orderId} <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {/* Cancellation reason */}
                  {selectedLead.cancellationReason && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide mb-1">Причина закрытия</p>
                      <p className="text-sm text-foreground">{selectedLead.cancellationReason}</p>
                    </div>
                  )}
                  {/* Quick actions */}
                  {(selectedLead.status === LeadStatus.new || selectedLead.status === LeadStatus.processing) && (
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Быстрые действия</p>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedLead.status === LeadStatus.new && (
                          <button onClick={() => { quickStatusMutation.mutate({ id: selectedLead.id, status: "processing" }); setSelectedLead({ ...selectedLead, status: "processing" }); }} disabled={quickStatusMutation.isPending} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-50">
                            <Clock className="w-3.5 h-3.5" />В обработке
                          </button>
                        )}
                        <button onClick={() => { setReasonDialog({ lead: selectedLead, targetStatus: "non_target" }); setReasonInput(""); setSelectedLead(null); }} disabled={quickStatusMutation.isPending} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-medium hover:bg-orange-100 transition-colors disabled:opacity-50">
                          <Ban className="w-3.5 h-3.5" />Нецелевая
                        </button>
                        <button onClick={() => { setReasonDialog({ lead: selectedLead, targetStatus: "client_refusal" }); setReasonInput(""); setSelectedLead(null); }} disabled={quickStatusMutation.isPending} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50">
                          <UserX className="w-3.5 h-3.5" />Отказ клиента
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Main actions */}
                  <div className="border-t border-border/50 pt-4 space-y-2">
                    {(selectedLead.status === LeadStatus.new || selectedLead.status === LeadStatus.processing) && (
                      <button onClick={() => { setConfirmSendLead(selectedLead); setSelectedLead(null); }} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors">
                        <Play className="w-4 h-4" />🚀 Отправить мастерам
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => { openEditModal(selectedLead); setSelectedLead(null); }} className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-white border border-border rounded-xl font-medium text-sm text-foreground hover:bg-slate-50 transition-colors"><Pencil className="w-3.5 h-3.5" />Редактировать</button>
                      <button onClick={() => { if (confirm(`Удалить заявку #${selectedLead.id}?`)) { deleteLeadMutation.mutate(selectedLead.id); setSelectedLead(null); } }} className="flex items-center justify-center gap-2 py-2 px-4 bg-white border border-red-200 rounded-xl font-medium text-sm text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5" />В корзину</button>
                    </div>
                    <button onClick={() => setSelectedLead(null)} className="w-full py-2 text-sm font-medium text-muted-foreground hover:bg-slate-50 rounded-xl transition-colors">Закрыть</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            ORDER DETAIL PANEL
        ══════════════════════════════════════════════════════════ */}
        {openDispatchId && (
          <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={closeOrderPanel} />
            <div className="bg-card w-full max-w-md h-full overflow-hidden flex flex-col shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
              {/* Header */}
              {openOrder ? (
                <>
                  <div className="px-6 py-4 border-b border-border/50 flex items-start justify-between flex-shrink-0">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-display font-bold text-foreground">Заявка #{openOrder.leadId ?? openDispatchId}</h2>
                        <StatusBadge status={openOrder.status} type="order" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{openOrder.serviceType} · {openOrder.city}{openOrder.district ? `, ${openOrder.district}` : ""}</p>
                    </div>
                    <button onClick={closeOrderPanel} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 flex-shrink-0 ml-2"><X className="w-4 h-4 text-muted-foreground" /></button>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    <div className="p-6 space-y-4">
                      {/* Order info card */}
                      <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <div><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Дата заявки</p><p className="font-medium text-foreground">{formatDate(openOrder.createdAt)}</p></div>
                          <div><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Площадь</p><p className="font-medium text-foreground">{openOrder.area} м²</p></div>
                          {(openOrder as any).clientPhone && (
                            <div className="col-span-2">
                              <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide mb-1">Клиент</p>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-medium text-foreground">{(openOrder as any).clientName}</span>
                                <a href={`tel:${(openOrder as any).clientPhone}`} className="font-medium text-blue-600 hover:underline">{(openOrder as any).clientPhone}</a>
                                <button onClick={() => {
                                  const text = openOrder.status === "master_assigned"
                                    ? `Здравствуйте! Мастер ${openOrder.masterName} назначен на вашу заявку (${openOrder.serviceType}, ${openOrder.city}).`
                                    : `Здравствуйте! Ваша заявка (${openOrder.serviceType}, ${openOrder.city}) принята в обработку.`;
                                  navigator.clipboard.writeText(text).then(() => { setNotifCopied(true); setTimeout(() => setNotifCopied(false), 2500); });
                                }} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors">
                                  {notifCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Bell className="w-3 h-3" />}
                                  {notifCopied ? "Скопировано!" : "Уведомить клиента"}
                                </button>
                              </div>
                            </div>
                          )}
                          {openOrder.scheduledAt && <div><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Дата визита</p><p className="font-medium text-blue-600">{new Date(openOrder.scheduledAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>}
                          {openOrder.masterName && <div><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Мастер</p><button onClick={() => openOrder.masterId && openMasterChat(openOrder.masterId)} className="font-medium text-blue-600 hover:underline text-left">{openOrder.masterName}</button></div>}
                          {openOrder.masterId && receipts && receipts.length === 0 && ["master_assigned","in_progress"].includes(openOrder.status) && (
                            <div className="col-span-2 flex items-center gap-2 bg-red-50 border border-red-300 rounded-xl px-3 py-2 text-xs font-semibold text-red-700">
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />Смета не создана — клиент не может внести предоплату
                            </div>
                          )}
                          {(() => {
                            const confirmed = (openOrder as any).orderAmount ? Number((openOrder as any).orderAmount) : null;
                            const proposed = (openOrder as any).proposedAmount ? Number((openOrder as any).proposedAmount) : null;
                            if (confirmed) return (
                              <div>
                                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Сумма</p>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-foreground">{fmtMoney(confirmed)}</span>
                                  <button onClick={() => { setEditAmountId(openDispatchId); setEditAmountValue(String(confirmed)); }} className="text-muted-foreground/50 hover:text-primary"><Pencil className="w-3 h-3" /></button>
                                </div>
                                {(openOrder as any).commission && <p className="text-[10px] text-muted-foreground">ком. {fmtMoney(Number((openOrder as any).commission))}</p>}
                              </div>
                            );
                            if (proposed) return (
                              <div>
                                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Предложено</p>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-amber-700">{fmtMoney(proposed)}</span>
                                  <button onClick={() => { setEditAmountId(openDispatchId); setEditAmountValue(String(proposed)); }} className="text-amber-400 hover:text-amber-700"><Pencil className="w-3 h-3" /></button>
                                </div>
                              </div>
                            );
                            return <div><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Сумма</p><button onClick={() => { setEditAmountId(openDispatchId); setEditAmountValue(""); }} className="text-xs text-primary hover:underline flex items-center gap-1"><Pencil className="w-3 h-3" />Указать сумму</button></div>;
                          })()}
                        </div>
                        {openOrder.comment && <div className="pt-1.5 border-t border-border/40"><p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide mb-1">Комментарий</p><p className="text-sm text-foreground">{openOrder.comment}</p></div>}
                        {/* Edit amount inline */}
                        {editAmountId === openDispatchId && (
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
                          {openOrder.masterId && <button onClick={() => openMasterChat(openOrder.masterId!)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-medium text-foreground hover:bg-slate-100 transition-colors"><MessageSquare className="w-3 h-3" />Чат с мастером</button>}
                          <button onClick={() => { closeOrderPanel(); setLocation(`/tasks?newOrder=${openDispatchId}`); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs font-medium text-foreground hover:bg-slate-100 transition-colors"><ClipboardList className="w-3 h-3" />Создать задачу</button>
                          {openOrder.status === "cancelled" && <button onClick={() => restoreOrderMutation.mutate(openDispatchId!)} disabled={restoreOrderMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors">{restoreOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Восстановить</button>}
                          {openOrder.status !== "cancelled" && openOrder.status !== "completed" && !showCancelDialog && <button onClick={() => { setShowCancelDialog(true); setCancelDialogReason(""); setCancelDialogNote(""); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors"><XCircle className="w-3 h-3" />Отменить заказ</button>}
                          <button onClick={() => { if (confirm(`Удалить заявку #${openOrder?.leadId ?? openDispatchId}?`)) { deleteOrderMutation.mutate(openDispatchId!); closeOrderPanel(); } }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-3 h-3" />В корзину</button>
                        </div>
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
                              <button onClick={() => { if (!cancelDialogReason) return; const labels: Record<string, string> = { client_changed_mind: "Клиент передумал", found_cheaper: "Нашёл дешевле", found_other_master: "Другой мастер", no_answer: "Не берёт трубку", other: cancelDialogNote.trim() || "Другое" }; cancelOrderMutation.mutate({ orderId: openDispatchId!, reason: labels[cancelDialogReason] ?? cancelDialogReason }); }} disabled={!cancelDialogReason || cancelOrderMutation.isPending} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 disabled:opacity-50">{cancelOrderMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}Подтвердить</button>
                              <button onClick={() => { setShowCancelDialog(false); setCancelDialogReason(""); setCancelDialogNote(""); }} className="px-3 py-1.5 bg-white border border-orange-200 rounded-lg text-xs font-medium text-orange-700 hover:bg-orange-50 transition-colors">Отмена</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Dispatch section ── */}
                      {((openOrder as any).dispatchStatus ?? "none") === "none" && openOrder.status !== "cancelled" && openOrder.status !== "completed" && (
                        <div className="space-y-3">
                          {(openOrder as any).cancelReason && (
                            <div className="flex flex-col gap-1.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                              <div className="flex items-start gap-2"><AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" /><p className="text-xs font-semibold text-amber-700">Причина снятия мастера</p></div>
                              <p className="text-xs text-amber-700 ml-6">{(openOrder as any).cancelReason}</p>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground">Заявка будет отправлена активным мастерам в городе <b>{openOrder.city}</b>. Телефон клиента скрыт — передаётся только после назначения.</p>
                          {broadcastMutation.isError && <p className="text-sm text-red-500">{(broadcastMutation.error as Error).message}</p>}
                          {broadcastMutation.isSuccess && (
                            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3 space-y-0.5">
                              <p>✅ Разослано: <b>{(broadcastMutation.data as any)?.sent}</b> мастеров</p>
                              {(broadcastMutation.data as any)?.skipped > 0 && <p className="text-muted-foreground text-xs">⏭ Пропущено {(broadcastMutation.data as any).skipped}</p>}
                            </div>
                          )}
                          <button onClick={() => broadcastMutation.mutate(openDispatchId!)} disabled={broadcastMutation.isPending || broadcastMutation.isSuccess} className="w-full py-2.5 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 flex items-center justify-center gap-2 disabled:opacity-50">
                            {broadcastMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Разослать мастерам
                          </button>
                        </div>
                      )}

                      {((openOrder as any).dispatchStatus ?? "none") !== "none" && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground">Статус рассылки</p>
                            {dispatchLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                          </div>
                          {respondents.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1"><Check className="w-3 h-3" />Откликнулись ({respondents.length})</p>
                              {respondents.map(d => (
                                <div key={d.id} className="p-3 bg-green-50 border border-green-100 rounded-xl space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div><p className="text-sm font-semibold text-foreground">{d.masterName}</p>{d.respondedAt && <p className="text-xs text-muted-foreground">{new Date(d.respondedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</p>}</div>
                                    {(openOrder as any).dispatchStatus !== "assigned" && (
                                      <button onClick={() => assignMutation.mutate({ orderId: openDispatchId!, masterId: d.masterId })} disabled={assignMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white hover:bg-green-600 rounded-lg font-medium text-xs disabled:opacity-50">{assignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}Назначить</button>
                                    )}
                                  </div>
                                  {d.responseNote && <div className="bg-white border border-green-200 rounded-lg px-3 py-2"><p className="text-[10px] text-green-700 font-semibold uppercase mb-1">Предложение</p><p className="text-xs text-gray-700">{d.responseNote}</p></div>}
                                  <button onClick={() => openMasterChat(d.masterId)} className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline"><MessageSquare className="w-3 h-3" />Написать в чат</button>
                                </div>
                              ))}
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
                          {(openOrder as any).dispatchStatus === "assigned" && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm"><CheckCircle2 className="w-4 h-4 flex-shrink-0" />Заявка назначена. Мастер получил контакт клиента.</div>
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
                                    <button onClick={() => { closeOrderPanel(); openMasterChat(d.masterId); }} className="font-medium text-foreground hover:text-blue-600 hover:underline transition-colors text-left">{d.masterName}</button>
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
                            <button onClick={() => { if (!unassignReason.trim()) return; unassignMutation.mutate({ orderId: openDispatchId!, reason: unassignReason, rebroadcast: rebroadcastOnUnassign }); }} disabled={!unassignReason.trim() || unassignMutation.isPending} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50">{unassignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}Снять мастера</button>
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
                            <select value={selectedMasterForAssign} onChange={e => setSelectedMasterForAssign(e.target.value)} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                              <option value="">— Выберите мастера —</option>
                              {(activeMasters ?? []).map(m => <option key={m.id} value={String(m.id)}>{m.alias}{m.city ? ` (${m.city})` : ""}</option>)}
                            </select>
                            {(openOrder as any)?.masterId && selectedMasterForAssign && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ Текущий мастер будет заменён</p>}
                            <div className="flex gap-2">
                              <button onClick={() => { setShowManualAssign(false); setSelectedMasterForAssign(""); }} className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-slate-50">Отмена</button>
                              <button onClick={() => { if (!selectedMasterForAssign) return; manualAssignMutation.mutate({ orderId: openDispatchId!, masterId: parseInt(selectedMasterForAssign) }); }} disabled={!selectedMasterForAssign || manualAssignMutation.isPending} className="flex-1 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">{manualAssignMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}Назначить</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Operator note */}
                      <div className="border-t border-border/50 pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Заметка оператора</p>
                          {operatorNoteEdit === null && <button onClick={() => setOperatorNoteEdit((openOrder as any).operatorNote ?? "")} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"><Pencil className="w-3 h-3" />Редактировать</button>}
                        </div>
                        {operatorNoteEdit !== null ? (
                          <div className="space-y-2">
                            <textarea value={operatorNoteEdit} onChange={e => setOperatorNoteEdit(e.target.value)} placeholder="Внутренняя заметка..." rows={2} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" autoFocus />
                            <div className="flex gap-2">
                              <button onClick={() => setOperatorNoteEdit(null)} className="flex-1 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-slate-50">Отмена</button>
                              <button onClick={() => openDispatchId && saveNoteMutation.mutate({ orderId: openDispatchId, note: operatorNoteEdit })} disabled={saveNoteMutation.isPending} className="flex-1 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1">{saveNoteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}Сохранить</button>
                            </div>
                          </div>
                        ) : (openOrder as any).operatorNote ? (
                          <p className="text-sm text-muted-foreground bg-slate-50 rounded-lg px-3 py-2 italic">{(openOrder as any).operatorNote}</p>
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
                                    if (resp.ok) { toast({ title: "Предоплата подтверждена!" }); queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", openDispatchId] }); }
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
                            {receipts?.filter(r => r.prepaymentSubmittedAt).length ? (
                              <p className="text-xs text-muted-foreground text-center">{receipts.filter(r => r.prepaymentSubmittedAt).length} смет оплачено</p>
                            ) : null}
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
                                    const resp = await fetch("/api/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ orderId: openDispatchId, clientName: (openOrder as any).clientName ?? "", clientPhone: (openOrder as any).clientPhone ?? "", lineItems: valid.map(i => ({ description: i.description.trim(), unit: i.unit || undefined, quantity: parseFloat(i.quantity) > 0 ? parseFloat(i.quantity) : undefined, price: parseFloat(i.price) })), prepaymentAmount: prepay, notes: crmNotes.trim() || undefined }) });
                                    if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error ?? "Ошибка"); }
                                    const result = await resp.json();
                                    setCrmCreatedUrl(result.publicUrl);
                                    setShowCreateReceipt(false);
                                    queryClient.invalidateQueries({ queryKey: ["/api/receipts/order", openDispatchId] });
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
                      {((openOrder as any).assignedAt || (openOrder as any).completedAt) && (
                        <div className="border-t border-border/50 pt-4 space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" />Время в заказе</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {openOrder?.createdAt && (openOrder as any).assignedAt && <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-muted-foreground">Ожидание мастера</p><p className="font-semibold text-foreground">{timeBetween(openOrder.createdAt, (openOrder as any).assignedAt)}</p></div>}
                            {(openOrder as any).assignedAt && (openOrder as any).completedAt && <div className="bg-slate-50 rounded-lg px-3 py-2"><p className="text-muted-foreground">Время работы</p><p className="font-semibold text-foreground">{timeBetween((openOrder as any).assignedAt, (openOrder as any).completedAt)}</p></div>}
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
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            CREATE LEAD MODAL
        ══════════════════════════════════════════════════════════ */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200" style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
              <div className="relative px-7 pt-7 pb-5 flex items-center justify-between flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2.5 mb-1"><div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Sparkles className="w-4 h-4 text-primary" /></div><h2 className="text-xl font-display font-bold text-gray-900">Новая заявка</h2></div>
                  <p className="text-sm text-gray-400 ml-10">Заполните данные клиента и список работ</p>
                </div>
                <button onClick={() => { setIsCreateOpen(false); resetForm(); }} className="w-9 h-9 flex items-center justify-center rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-all">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
                <div className="px-7 pb-6 space-y-5">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Клиент</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Имя клиента</label><div className="relative"><User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input required value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" placeholder="Иван Иванов" /></div></div>
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Телефон</label><div className="relative"><Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input required value={formData.clientPhone} onChange={e => { setFormData({...formData, clientPhone: e.target.value}); checkPhone(e.target.value); }} className={`w-full pl-9 pr-3 py-2.5 rounded-xl border bg-white focus:ring-2 outline-none text-sm transition-all ${phoneCheckResult?.duplicate ? "border-orange-400 focus:border-orange-400 focus:ring-orange-200" : "border-gray-200 focus:border-primary focus:ring-primary/15"}`} placeholder="+7 999 000-00-00" /></div>
                        {phoneCheckResult?.duplicate && phoneCheckResult.existing && (<div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5"><AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" /><div className="text-xs text-orange-700"><p className="font-semibold mb-1">Этот телефон уже есть в базе:</p>{phoneCheckResult.existing.map(e => (<p key={e.id}>· #{e.id} {e.clientName}</p>))}</div></div>)}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Город</label><div className="relative"><MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /><ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /><select required value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"><option value="">Выберите город</option>{cities?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div></div>
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Район</label><input required value={formData.district} onChange={e => setFormData({...formData, district: e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" placeholder="Центральный" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" />Дата выезда<span className="text-gray-400 font-normal text-xs ml-auto">необязательно</span></label><input type="datetime-local" value={formData.scheduledAt} onChange={e => setFormData({...formData, scheduledAt: e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" /></div>
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Radio className="w-3.5 h-3.5 text-gray-400" />Источник<span className="text-gray-400 font-normal text-xs ml-auto">необязательно</span></label><div className="relative"><ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /><select value={formData.source} onChange={e => setFormData({...formData, source: e.target.value})} className="w-full px-3 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"><option value="">Выберите источник</option>{SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div></div>
                    </div>
                  </div>
                  {/* Services table */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Услуги</p>
                      {(totalArea > 0 || totalEstimate > 0) && (
                        <div className="flex items-center gap-3 text-xs">
                          {totalArea > 0 && <span className="text-gray-500">Итого: <b className="text-gray-700">{totalArea} м²</b></span>}
                          {totalEstimate > 0 && <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-100">≈ {fmtMoney(totalEstimate)}</span>}
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                      <div className="grid items-center bg-gray-50 border-b border-gray-100 px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide" style={{ gridTemplateColumns: "1fr 80px 100px 90px 32px" }}>
                        <span>Тип услуги</span><span className="text-center">м²</span><span className="text-center">₽/м²</span><span className="text-right pr-2">Итого</span><span />
                      </div>
                      <div className="divide-y divide-gray-100">
                        {serviceRows.map((row, i) => {
                          const rowTotal = (parseFloat(row.area) || 0) * (parseFloat(row.pricePerM2) || 0);
                          return (
                            <div key={i} className="group px-3 py-1.5" style={{ gridTemplateColumns: "1fr 80px 100px 90px 32px", display: "grid", alignItems: "center", gap: 0 }}>
                              <div className="relative"><select required value={row.type} onChange={e => updateRow(i, "type", e.target.value)} className="w-full pl-2 pr-6 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none appearance-none transition-all cursor-pointer"><option value="">Выберите...</option>{services?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select><ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div>
                              <input required type="number" min="0.1" step="0.1" value={row.area} onChange={e => updateRow(i, "area", e.target.value)} placeholder="—" className="px-2 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all w-full" />
                              <div className="relative"><input type="number" min="0" step="1" value={row.pricePerM2} onChange={e => updateRow(i, "pricePerM2", e.target.value)} placeholder="—" className="w-full pl-2 pr-5 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">₽</span></div>
                              <div className="text-right pr-2">{rowTotal > 0 ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{rowTotal.toLocaleString("ru-RU")} ₽</span> : <span className="text-xs text-gray-300">—</span>}</div>
                              <button type="button" onClick={() => removeRow(i)} disabled={serviceRows.length === 1} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-0 disabled:pointer-events-none transition-all mx-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-dashed border-gray-200"><button type="button" onClick={addRow} className="w-full py-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-primary hover:bg-primary/5 transition-all"><div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center"><Plus className="w-3 h-3" /></div>Добавить услугу</button></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Комментарий</label><textarea value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} rows={4} placeholder="Дополнительная информация..." className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none resize-none text-sm transition-all h-full min-h-[100px]" /></div>
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5"><Images className="w-3.5 h-3.5" />Фотографии{photosPaths.length > 0 && <span className="ml-auto text-primary font-bold">{photosPaths.length}</span>}</label><PhotoUploader value={photosPaths} onChange={setPhotosPaths} maxPhotos={8} /></div>
                  </div>
                </div>
                <div className="px-7 py-5 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50/50 rounded-b-3xl">
                  {totalEstimate > 0 ? <div className="text-sm"><span className="text-gray-500">Смета:</span><span className="ml-2 font-bold text-emerald-600 text-base">{fmtMoney(totalEstimate)}</span>{totalArea > 0 && <span className="ml-2 text-gray-400 text-xs">{totalArea} м²</span>}</div> : <div />}
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => { setIsCreateOpen(false); resetForm(); }} className="px-5 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-200 transition-colors text-sm">Отмена</button>
                    <button type="submit" disabled={createMutation.isPending || serviceRows.every(r => !r.type || !r.area)} className="px-6 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 transition-all text-sm shadow-sm shadow-primary/30">{createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Создать заявку</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            EDIT LEAD MODAL
        ══════════════════════════════════════════════════════════ */}
        {editingLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200" style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
              <div className="relative px-7 pt-7 pb-5 flex items-center justify-between flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2.5 mb-1"><div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center"><Pencil className="w-4 h-4 text-amber-600" /></div><h2 className="text-xl font-display font-bold text-gray-900">Редактировать заявку #{editingLead.id}</h2></div>
                  <p className="text-sm text-gray-400 ml-10">Изменения сохранятся после нажатия «Сохранить»</p>
                </div>
                <button onClick={closeEditModal} className="w-9 h-9 flex items-center justify-center rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-all"><X className="w-4 h-4" /></button>
              </div>
              <form onSubmit={e => { e.preventDefault(); editMutation.mutate(editingLead.id); }} className="flex flex-col flex-1 overflow-y-auto">
                <div className="px-7 pb-6 space-y-5">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Клиент</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Имя клиента</label><div className="relative"><User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input required value={editFormData.clientName} onChange={e => setEditFormData({...editFormData, clientName: e.target.value})} className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" placeholder="Иван Иванов" /></div></div>
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Телефон</label><div className="relative"><Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input required value={editFormData.clientPhone} onChange={e => setEditFormData({...editFormData, clientPhone: e.target.value})} className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" placeholder="+7 999 000-00-00" /></div></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Город</label><div className="relative"><MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /><ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /><select required value={editFormData.city} onChange={e => setEditFormData({...editFormData, city: e.target.value})} className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"><option value="">Выберите город</option>{cities?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div></div>
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Район</label><input required value={editFormData.district} onChange={e => setEditFormData({...editFormData, district: e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" placeholder="Центральный" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" />Дата выезда<span className="text-gray-400 font-normal text-xs ml-auto">необязательно</span></label><input type="datetime-local" value={editFormData.scheduledAt} onChange={e => setEditFormData({...editFormData, scheduledAt: e.target.value})} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" /></div>
                      <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Источник</label><div className="relative"><ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /><select value={editFormData.source} onChange={e => setEditFormData({...editFormData, source: e.target.value})} className="w-full px-3 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"><option value="">Не указан</option>{SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div></div>
                    </div>
                    <div className="space-y-1.5"><label className="text-sm font-medium text-gray-700">Статус заявки</label><div className="relative"><ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /><select value={editFormData.status} onChange={e => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-3 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"><option value="new">Новая</option><option value="processing">В обработке</option><option value="sent_to_work">Отправлена в работу</option><option value="non_target">Нецелевая</option><option value="client_refusal">Отказ клиента</option></select></div></div>
                  </div>
                  {/* Services */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Услуги</p>
                      {(editTotalArea > 0 || editTotalEstimate > 0) && <div className="flex items-center gap-3 text-xs">{editTotalArea > 0 && <span className="text-gray-500">Итого: <b className="text-gray-700">{editTotalArea} м²</b></span>}{editTotalEstimate > 0 && <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-100">≈ {fmtMoney(editTotalEstimate)}</span>}</div>}
                    </div>
                    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                      <div className="grid items-center bg-gray-50 border-b border-gray-100 px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide" style={{ gridTemplateColumns: "1fr 80px 100px 90px 32px" }}>
                        <span>Тип услуги</span><span className="text-center">м²</span><span className="text-center">₽/м²</span><span className="text-right pr-2">Итого</span><span />
                      </div>
                      <div className="divide-y divide-gray-100">
                        {editServiceRows.map((row, i) => {
                          const rowTotal = (parseFloat(row.area) || 0) * (parseFloat(row.pricePerM2) || 0);
                          return (
                            <div key={i} className="px-3 py-1.5" style={{ gridTemplateColumns: "1fr 80px 100px 90px 32px", display: "grid", alignItems: "center", gap: 0 }}>
                              <div className="relative"><select required value={row.type} onChange={e => editUpdateRow(i, "type", e.target.value)} className="w-full pl-2 pr-6 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none appearance-none transition-all cursor-pointer"><option value="">Выберите...</option>{services?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select><ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div>
                              <input required type="number" min="0.1" step="0.1" value={row.area} onChange={e => editUpdateRow(i, "area", e.target.value)} className="w-full pl-2 pr-5 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all" placeholder="0" />
                              <div className="relative"><input type="number" min="0" step="1" value={row.pricePerM2} onChange={e => editUpdateRow(i, "pricePerM2", e.target.value)} className="w-full pl-2 pr-5 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all" placeholder="0" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">₽</span></div>
                              <div className="text-right pr-2">{rowTotal > 0 ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{rowTotal.toLocaleString("ru-RU")} ₽</span> : <span className="text-xs text-gray-300">—</span>}</div>
                              <button type="button" onClick={() => editRemoveRow(i)} disabled={editServiceRows.length === 1} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-0 disabled:pointer-events-none transition-all mx-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-dashed border-gray-200"><button type="button" onClick={editAddRow} className="w-full py-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-primary hover:bg-primary/5 transition-all"><div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center"><Plus className="w-3 h-3" /></div>Добавить услугу</button></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Комментарий</label><textarea value={editFormData.comment} onChange={e => setEditFormData({...editFormData, comment: e.target.value})} rows={4} placeholder="Дополнительная информация..." className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none resize-none text-sm transition-all h-full min-h-[100px]" /></div>
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5"><Images className="w-3.5 h-3.5" />Фотографии{editPhotosPaths.length > 0 && <span className="ml-auto text-primary font-bold">{editPhotosPaths.length}</span>}</label><PhotoUploader value={editPhotosPaths} onChange={setEditPhotosPaths} maxPhotos={8} /></div>
                  </div>
                </div>
                <div className="px-7 py-5 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50/50 rounded-b-3xl">
                  {editTotalEstimate > 0 ? <div className="text-sm"><span className="text-gray-500">Смета:</span><span className="ml-2 font-bold text-emerald-600 text-base">{fmtMoney(editTotalEstimate)}</span>{editTotalArea > 0 && <span className="ml-2 text-gray-400 text-xs">{editTotalArea} м²</span>}</div> : <div />}
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={closeEditModal} className="px-5 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-200 transition-colors text-sm">Отмена</button>
                    <button type="submit" disabled={editMutation.isPending || editServiceRows.every(r => !r.type || !r.area)} className="px-6 py-2.5 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 flex items-center gap-2 disabled:opacity-50 transition-all text-sm shadow-sm shadow-amber-500/30">{editMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Сохранить</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            REASON DIALOG
        ══════════════════════════════════════════════════════════ */}
        {reasonDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${reasonDialog.targetStatus === "non_target" ? "bg-orange-100" : "bg-red-100"}`}>
                  {reasonDialog.targetStatus === "non_target" ? <Ban className="w-5 h-5 text-orange-600" /> : <UserX className="w-5 h-5 text-red-600" />}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{reasonDialog.targetStatus === "non_target" ? "Нецелевая заявка" : "Отказ клиента"}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Заявка #{reasonDialog.lead.id} · {reasonDialog.lead.clientName}</p>
                </div>
              </div>
              <div className="space-y-3 mb-5">
                <label className="text-sm font-medium text-gray-700">Причина <span className="text-gray-400 font-normal">(необязательно)</span></label>
                <textarea value={reasonInput} onChange={e => setReasonInput(e.target.value)} placeholder={reasonDialog.targetStatus === "non_target" ? "Не тот тип работ, регион не обслуживаем..." : "Нашёл другого исполнителя, слишком дорого..."} rows={3} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none resize-none text-sm transition-all" autoFocus />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setReasonDialog(null)} className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-100 transition-colors text-sm">Отмена</button>
                <button onClick={() => { quickStatusMutation.mutate({ id: reasonDialog.lead.id, status: reasonDialog.targetStatus, reason: reasonInput || undefined }); setReasonDialog(null); setReasonInput(""); }} disabled={quickStatusMutation.isPending} className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all text-sm ${reasonDialog.targetStatus === "non_target" ? "bg-orange-500 hover:bg-orange-600" : "bg-red-500 hover:bg-red-600"}`}>
                  {quickStatusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Подтвердить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            CONFIRM SEND TO WORK
        ══════════════════════════════════════════════════════════ */}
        {confirmSendLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-primary" /></div>
                <div><h3 className="font-bold text-gray-900">Отправить мастерам?</h3><p className="text-xs text-gray-500 mt-0.5">Будет создан заказ и запущена рассылка</p></div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 mb-5 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Клиент</span><span className="font-medium text-gray-800">{confirmSendLead.clientName}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Телефон</span><span className="font-medium text-gray-800">{confirmSendLead.clientPhone}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Город</span><span className="font-medium text-gray-800">{confirmSendLead.city}{confirmSendLead.district ? `, ${confirmSendLead.district}` : ""}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Услуга</span><span className="font-medium text-gray-800">{confirmSendLead.serviceType}</span></div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setConfirmSendLead(null)} className="flex-1 px-4 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-100 transition-colors text-sm">Отмена</button>
                <button onClick={() => sendToWorkMutation.mutate({ id: confirmSendLead.id })} disabled={sendToWorkMutation.isPending} className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50 transition-all text-sm">
                  {sendToWorkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Отправить
                </button>
              </div>
            </div>
          </div>
        )}

      </Layout>
    </ProtectedRoute>
  );
}
