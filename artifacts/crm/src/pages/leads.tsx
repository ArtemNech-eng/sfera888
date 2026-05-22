import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useCreateLead, useSendLeadToBuffer, useGetCities, useGetServices,
} from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { WorkBoardTable } from "@/components/work-board-table";
import LeadList from "@/components/leads/LeadList";
import ArchiveList from "@/components/leads/ArchiveList";
import OrderPanel from "@/components/leads/OrderPanel";
import LeadDetailPanel from "@/components/leads/LeadDetailPanel";
import ReasonDialog from "@/components/leads/ReasonDialog";
import ConfirmSendDialog from "@/components/leads/ConfirmSendDialog";
import CreateLeadModal from "@/components/leads/CreateLeadModal";
import EditLeadModal from "@/components/leads/EditLeadModal";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Clock, Timer, Archive, Inbox, Briefcase,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type WMTab = "all" | "with_estimate" | "without_estimate" | "waiting_payment" | "problematic";

type WorkOrder = {
  id: number; leadId: number | null; status: string;
  city: string; district: string; serviceType: string; area: number;
  commission: number | null; proposedAmount: number | null;
  assignedAt: string | null; updatedAt: string | null;
  masterId: number | null; masterAlias: string | null;
  masterPhone: string | null; masterMaxChatId: string | null; masterFomoDisabled: boolean;
  clientName: string | null; clientPhone: string | null;
  receiptId: number | null; receiptTotalAmount: number | null;
  receiptPrepaymentAmount: number | null; receiptCreatedAt: string | null;
  receiptPrepaymentSubmittedAt: string | null; receiptPrepaymentPaidAt: string | null; receiptToken: string | null;
  hoursWithoutEstimate: number | null; hoursWithoutPayment: number | null;
  problemReasons: string[];
  transactionInfo: {
    orderAmount: number;
    commission: number;
    prepaymentDeducted: number;
    paymentStatus: string;
    paidAt: string | null;
  } | null;
};

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

interface PendingDispatch {
  orderId: number;
  leadId: number | null;
  serviceType: string;
  city: string;
  district: string | null;
  respondentCount: number;
  respondents: { masterId: number; masterName: string; respondedAt: string | null }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Leads() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();

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
  const [leadDateFilter, setLeadDateFilter] = useState<"all" | "today" | "yesterday" | "week" | "month">("all");
  const [leadSearchQuery, setLeadSearchQuery] = useState<string>("");
  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsLimit] = useState(50);
  const [editingLead, setEditingLead] = useState<LeadRow | null>(null);
  const [confirmSendLead, setConfirmSendLead] = useState<LeadRow | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [reasonDialog, setReasonDialog] = useState<{ lead: LeadRow; targetStatus: "non_target" | "client_refusal" } | null>(null);
  // Bulk operations
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);

  // Create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // ── Orders (Tab 2) state ──────────────────────────────────────────────────
  const [orderSubFilter, setOrderSubFilter] = useState<"all" | "waiting_master" | "master_assigned" | "in_progress" | "cancellation_requested">("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersLimit] = useState(50);
  const [wmTab, setWmTab] = useState<WMTab>("all");
  const [wmData, setWmData] = useState<WorkOrder[]>([]);
  const [wmLoading, setWmLoading] = useState(false);
  const [wmSearch, setWmSearch] = useState("");
  const [openDispatchId, setOpenDispatchId] = useState<number | null>(() => {
    const p = new URLSearchParams(window.location.search);
    const hl = parseInt(p.get("highlight") ?? "");
    return isNaN(hl) ? null : hl;
  });
  // ── Archive (Tab 3) state ─────────────────────────────────────────────────
  const [archiveStatusFilter, setArchiveStatusFilter] = useState<"all" | "completed" | "cancelled" | "non_target" | "client_refusal" | "sent_to_work">("all");
  const [archiveCityFilter, setArchiveCityFilter] = useState("all");
  const [archiveDateFilter, setArchiveDateFilter] = useState<"all" | "today" | "yesterday" | "week" | "month">("all");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archivePage, setArchivePage] = useState(1);
  const [archiveLimit] = useState(20);

  useEffect(() => { setLeadsPage(1); }, [leadStatusFilter, leadSourceFilter, leadDateFilter, leadSearchQuery]);
  useEffect(() => { setOrdersPage(1); }, [orderSubFilter, orderSearch]);
  useEffect(() => { setArchivePage(1); }, [archiveStatusFilter, archiveCityFilter, archiveDateFilter, archiveSearch]);

  // ── Highlight from URL ────────────────────────────────────────────────────
  const highlightId = parseInt(new URLSearchParams(window.location.search).get("highlight") ?? "") || null;
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId]);

  // Open OrderPanel from highlight param when orders load
  useEffect(() => {
    if (highlightId && orders) {
      const found = orders.find(o => o.id === highlightId);
      if (found) {
        setActiveTab("work");
        setOpenDispatchId(highlightId);
      }
    }
  }, [highlightId, orders]);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: leadsData, isLoading: leadsLoading } = useQuery<{ rows: LeadRow[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/leads", leadsPage, leadsLimit, leadStatusFilter, leadSourceFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(leadsPage), limit: String(leadsLimit) });
      if (leadStatusFilter) params.set("status", leadStatusFilter);
      if (leadSourceFilter) params.set("source", leadSourceFilter);
      const r = await fetch(`/api/leads?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load leads");
      return r.json();
    },
    refetchInterval: 10000,
  });
  const leads = leadsData?.rows ?? [];
  const leadsTotal = leadsData?.total ?? 0;

  const { data: ordersData, isLoading: ordersLoading } = useQuery<{ rows: any[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/orders", ordersPage, ordersLimit],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(ordersPage), limit: String(ordersLimit) });
      const r = await fetch(`/api/orders?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load orders");
      return r.json();
    },
    refetchInterval: 8000,
  });
  const orders = ordersData?.rows ?? [];
  const ordersTotal = ordersData?.total ?? 0;
  const { data: cities } = useGetCities();
  const { data: services } = useGetServices();

  const { data: pendingDispatches } = useQuery<PendingDispatch[]>({
    queryKey: ["/api/dispatch/pending"],
    queryFn: async () => {
      const r = await fetch("/api/dispatch/pending", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 6000,
  });

  const { data: leadTimelineEvents } = useQuery<{ id: number; event_type: string; description: string; user_alias: string | null; created_at: string }[]>({
    queryKey: ["/api/leads", selectedLead?.id, "events"],
    queryFn: async () => {
      const r = await fetch(`/api/leads/${selectedLead!.id}/events`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!selectedLead,
  });

  // ── Auto-open lead from URL ────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openLeadId = parseInt(params.get("openLead") ?? "");
    if (openLeadId && leads) {
      const found = leads.find(l => l.id === openLeadId);
      if (found) { setSelectedLead(found); window.history.replaceState({}, "", window.location.pathname); }
    }
  }, [leads]);

  // ── Work Monitor fetch ────────────────────────────────────────────────────
  const fetchWm = useCallback(async () => {
    setWmLoading(true);
    try {
      const res = await fetch("/api/work-monitor", { credentials: "include" });
      if (res.ok) { const json = await res.json(); setWmData(Array.isArray(json) ? json : json.orders ?? []); }
    } catch {}
    finally { setWmLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === "work") { fetchWm(); }
  }, [activeTab, fetchWm]);

  const wmFiltered = useMemo(() => {
    let list = wmData;
    if (wmTab === "with_estimate") list = list.filter(o => o.receiptId !== null);
    else if (wmTab === "without_estimate") list = list.filter(o => o.receiptId === null);
    else if (wmTab === "waiting_payment") list = list.filter(o => o.receiptId !== null && !o.receiptPrepaymentPaidAt);
    else if (wmTab === "problematic") list = list.filter(o => o.problemReasons.length > 0);
    if (wmSearch.trim()) {
      const q = wmSearch.toLowerCase();
      const isNumeric = /^\d+$/.test(q);
      list = list.filter(o =>
        (isNumeric ? String(o.id) === q : String(o.id).includes(q)) ||
        (o.masterAlias ?? "").toLowerCase().includes(q) ||
        (o.clientName ?? "").toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q) ||
        o.serviceType.toLowerCase().includes(q)
      );
    }
    return list;
  }, [wmData, wmTab, wmSearch]);

  const wmStats = useMemo(() => {
    const withEst = wmData.filter(o => o.receiptId !== null);
    const withoutEst = wmData.filter(o => o.receiptId === null);
    const waitPay = wmData.filter(o => o.receiptId !== null && !o.receiptPrepaymentPaidAt);
    const prob = wmData.filter(o => o.problemReasons.length > 0);
    const sumWithEst = withEst.reduce((s, o) => s + (o.receiptTotalAmount ?? 0), 0);
    const sumWithoutEst = withoutEst.reduce((s, o) => s + (o.commission ?? 0), 0);
    const sumWaitPay = waitPay.reduce((s, o) => s + (o.receiptPrepaymentAmount ?? 0), 0);
    const sumProb = prob.reduce((s, o) => s + (o.receiptTotalAmount ?? o.commission ?? 0), 0);
    return { withEst, withoutEst, waitPay, prob, sumWithEst, sumWithoutEst, sumWaitPay, sumProb };
  }, [wmData]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const openOrder = openDispatchId ? orders?.find(o => o.id === openDispatchId) : null;

  const activeLeads = useMemo(() => {
    return leads.filter(l => l.status === "new" || l.status === "processing");
  }, [leads]);

  const allLeads = useMemo(() => leads, [leads]);

  const filteredLeads = useMemo(() => {
    const q = leadSearchQuery.trim().toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return allLeads.filter(l => {
      if (leadStatusFilter && l.status !== leadStatusFilter) return false;
      if (leadSourceFilter && l.source !== leadSourceFilter) return false;
      if (leadDateFilter !== "all") {
        const created = new Date(l.createdAt);
        if (leadDateFilter === "today" && created < today) return false;
        if (leadDateFilter === "yesterday" && (created < yesterday || created >= today)) return false;
        if (leadDateFilter === "week" && created < weekAgo) return false;
        if (leadDateFilter === "month" && created < monthStart) return false;
      }
      if (q) {
        const orderIdMatch = l.orderId != null && String(l.orderId) === q.replace(/^#/, "");
        const matches = orderIdMatch || l.clientName?.toLowerCase().includes(q) || l.clientPhone?.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || (l.district ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [allLeads, leadStatusFilter, leadSourceFilter, leadDateFilter, leadSearchQuery]);

  // Only new/processing leads for Tab 1 display when no filter is set
  const tab1Leads = useMemo(() => {
    if (leadStatusFilter || leadSourceFilter || leadDateFilter !== "all" || leadSearchQuery) return filteredLeads;
    return allLeads.filter(l => l.status === "new" || l.status === "processing");
  }, [allLeads, filteredLeads, leadStatusFilter, leadSourceFilter, leadDateFilter, leadSearchQuery]);

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
        const isNumeric = /^\d+$/.test(q);
        const m = (isNumeric ? String(o.id) === q : String(o.id).includes(q)) || o.city?.toLowerCase().includes(q) || o.serviceType?.toLowerCase().includes(q) || o.masterName?.toLowerCase().includes(q) || (o as any).clientPhone?.toLowerCase().includes(q);
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
    const filtered = orders.filter(o => {
      if (o.status !== "cancelled" && o.status !== "completed") return false;
      if (archiveStatusFilter !== "all" && o.status !== archiveStatusFilter) return false;
      if (archiveCityFilter !== "all" && o.city !== archiveCityFilter) return false;
      if (q) {
        const isNumeric = /^\d+$/.test(q);
        const m = (isNumeric ? String(o.id) === q : String(o.id).includes(q)) || o.city?.toLowerCase().includes(q) || o.serviceType?.toLowerCase().includes(q) || o.masterName?.toLowerCase().includes(q) || (o as any).clientPhone?.toLowerCase().includes(q);
        if (!m) return false;
      }
      if (archiveDateFilter !== "all") {
        // Filter by updatedAt (когда заказ был завершён/отменён), not createdAt
        const changed = new Date((o as any).updatedAt ?? o.createdAt);
        if (archiveDateFilter === "today" && changed < today) return false;
        if (archiveDateFilter === "yesterday" && (changed < yesterday || changed >= today)) return false;
        if (archiveDateFilter === "week" && changed < weekAgo) return false;
        if (archiveDateFilter === "month" && changed < monthStart) return false;
      }
      return true;
    });
    // Sort by updatedAt DESC — recently completed orders appear first
    return filtered.sort((a, b) => {
      const ta = new Date((a as any).updatedAt ?? a.createdAt).getTime();
      const tb = new Date((b as any).updatedAt ?? b.createdAt).getTime();
      return tb - ta;
    });
  }, [orders, archiveStatusFilter, archiveCityFilter, archiveDateFilter, archiveSearch]);

  const paginatedArchiveOrders = useMemo(() => {
    const start = (archivePage - 1) * archiveLimit;
    return archiveOrders.slice(start, start + archiveLimit);
  }, [archiveOrders, archivePage, archiveLimit]);

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
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      const r = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Ошибка сохранения");
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/leads"] }); toast({ title: "Заявка обновлена" }); closeEditModal(); },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  // ── Orders Mutations ──────────────────────────────────────────────────────
  const acceptProposedMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ acceptProposed: true }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      fetchWm();
    },
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

  const openEditModal = (lead: LeadRow) => {
    setEditingLead(lead);
  };

  const closeEditModal = () => {
    setEditingLead(null);
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

              <LeadList
                leads={tab1Leads}
                activeLeads={activeLeads}
                loading={leadsLoading}
                total={leadsTotal}
                page={leadsPage}
                limit={leadsLimit}
                onPageChange={setLeadsPage}
                search={leadSearchQuery}
                onSearchChange={setLeadSearchQuery}
                statusFilter={leadStatusFilter}
                onStatusChange={setLeadStatusFilter}
                sourceFilter={leadSourceFilter}
                onSourceChange={setLeadSourceFilter}
                dateFilter={leadDateFilter}
                onDateChange={setLeadDateFilter}
                selectedIds={selectedLeadIds}
                onSelectedIdsChange={setSelectedLeadIds}
                isMobile={isMobile}
                onSelectLead={(lead) => { setSelectedLead(lead); }}
                onSendToWork={(lead) => setConfirmSendLead(lead)}
                onOpenOrder={(orderId) => { setActiveTab("work"); setOpenDispatchId(orderId); }}
                onDeleteLead={(id) => deleteLeadMutation.mutate(id)}
                deletePending={deleteLeadMutation.isPending}
                deleteTargetId={deleteLeadMutation.variables}
              />
            </>
          )}

          {/* ══════════════════════════════════════════════════════════
              TAB 2: В РАБОТЕ
          ══════════════════════════════════════════════════════════ */}
          {activeTab === "work" && (
            <WorkBoardTable
              onOpenOrder={(id) => { setOpenDispatchId(id); }}
            />
          )}

          {/* ══════════════════════════════════════════════════════════
              TAB 3: АРХИВ
          ══════════════════════════════════════════════════════════ */}
          {activeTab === "archive" && (
            <ArchiveList
              orders={paginatedArchiveOrders}
              total={archiveOrders.length}
              loading={ordersLoading}
              availableCities={availableArchiveCities}
              search={archiveSearch}
              onSearchChange={setArchiveSearch}
              statusFilter={archiveStatusFilter}
              onStatusChange={(v) => setArchiveStatusFilter(v as typeof archiveStatusFilter)}
              cityFilter={archiveCityFilter}
              onCityChange={(v) => setArchiveCityFilter(v)}
              dateFilter={archiveDateFilter}
              onDateChange={(v) => setArchiveDateFilter(v as typeof archiveDateFilter)}
              page={archivePage}
              limit={archiveLimit}
              onPageChange={setArchivePage}
              onOpenOrder={setOpenDispatchId}
            />
          )}

        </div>

        {/* ══════════════════════════════════════════════════════════
            LEAD DETAIL PANEL (right slide)
        ══════════════════════════════════════════════════════════ */}
        {selectedLead && (
          <LeadDetailPanel
            lead={selectedLead}
            timelineEvents={leadTimelineEvents}
            onClose={() => setSelectedLead(null)}
            onStatusChange={(id, status) => quickStatusMutation.mutate({ id, status })}
            onDelete={(id) => deleteLeadMutation.mutate(id)}
            onEdit={openEditModal}
            onSendToWork={(lead) => setConfirmSendLead(lead)}
            onOpenOrder={(orderId) => { setActiveTab("work"); setOpenDispatchId(orderId); }}
            onOpenReasonDialog={(targetStatus) => {
              setReasonDialog({ lead: selectedLead, targetStatus });
              setSelectedLead(null);
            }}
            statusPending={quickStatusMutation.isPending}
            deletePending={deleteLeadMutation.isPending}
          />
        )}

        {/* ORDER DETAIL PANEL */}
        {openDispatchId && (
          <OrderPanel
            key={openDispatchId}
            orderId={openDispatchId}
            order={openOrder ?? undefined}
            onClose={() => setOpenDispatchId(null)}
            onOpenMasterChat={(masterId) => setLocation(`/master-chat?masterId=${masterId}`)}
            onNavigateToTasks={(orderId) => setLocation(`/tasks?newOrder=${orderId}`)}
          />
        )}

        <CreateLeadModal
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          createLead={(input) => createMutation.mutate(input as any)}
          createPending={createMutation.isPending}
          cities={cities}
          services={services}
        />

        {editingLead && (
          <EditLeadModal
            lead={editingLead}
            onClose={closeEditModal}
            onSave={(id, body) => editMutation.mutate({ id, body })}
            savePending={editMutation.isPending}
            cities={cities}
            services={services}
          />
        )}

        {/* ══════════════════════════════════════════════════════════
            REASON DIALOG
        ══════════════════════════════════════════════════════════ */}
        {reasonDialog && (
          <ReasonDialog
            lead={reasonDialog.lead}
            targetStatus={reasonDialog.targetStatus}
            onClose={() => setReasonDialog(null)}
            onConfirm={(id, status, reason) => quickStatusMutation.mutate({ id, status, reason })}
            isPending={quickStatusMutation.isPending}
          />
        )}

        {/* ══════════════════════════════════════════════════════════
            CONFIRM SEND TO WORK
        ══════════════════════════════════════════════════════════ */}
        {confirmSendLead && (
          <ConfirmSendDialog
            lead={confirmSendLead}
            onClose={() => setConfirmSendLead(null)}
            onConfirm={(id) => sendToWorkMutation.mutate({ id })}
            isPending={sendToWorkMutation.isPending}
          />
        )}

      </Layout>
    </ProtectedRoute>
  );
}
