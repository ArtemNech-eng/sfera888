import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { Send, MessageSquare, RefreshCw, Check, CheckCheck, Paperclip, X, Camera, DollarSign, AlertCircle, RotateCcw, Pencil, Loader2, UserCheck, MapPin, Smile, ChevronRight, User2, Trash2, Search, Phone, ChevronDown, ChevronUp, Filter, Megaphone, Zap, Users, Building2, ListChecks } from "lucide-react";
import { MasterDrawer, type DrawerMaster, type DrawerColumn } from "@/components/master-drawer";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function resolvePhotoUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}

interface Thread {
  masterId: number;
  alias: string;
  city: string;
  phone: string | null;
  telegramId: string | null;
  pwaLogin: string | null;
  lastSeenAt: string | null;
  avatarUrl: string | null;
  lastMessage: string;
  lastAt: string;
  unread: number;
  lastFromMaster: boolean;
}

interface Message {
  id: number;
  masterId: number;
  telegramChatId: string;
  text: string;
  photoUrl: string | null;
  fromMaster: boolean;
  senderName: string | null;
  isRead: boolean;
  editedAt: string | null;
  createdAt: string;
}

interface ConversationData {
  master: { id: number; alias: string; city: string; phone: string | null; telegramId: string | null; pwaLogin: string | null; avatarUrl: string | null };
  messages: Message[];
  pendingTransactions: PendingTransaction[];
  hasPaymentProof: boolean;
  paymentProofUrl: string | null;
}

// ─── Helper: is master online (seen within 5 min) ─────────────────────────────
function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
}

// ─── Helper: date separator label ─────────────────────────────────────────────
function dateSeparatorLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  if (d >= startOfToday) return "Сегодня";
  if (d >= startOfYesterday) return "Вчера";
  return format(d, "d MMMM yyyy", { locale: ru });
}

function msgDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface PendingOrder {
  id: number;
  leadId: number | null;
  serviceType: string;
  city: string;
  status: string;
  proposedAmount: number | null;
  orderAmount: number | null;
  cancelReason: string | null;
}

interface PendingTransaction {
  id: number;
  orderId: number;
  orderAmount: number;
  commission: number;
  netPayable: number;
  prepaymentDeducted: number;
  totalPartialPaid: number;
  partialPayments: { id: number; amount: number; note: string | null; paidAt: string }[];
  paymentStatus: string;
  createdAt: string;
}

// Inline avatar — falls back to coloured initials
function ChatAvatar({ name, id, avatarUrl, size = 32 }: { name: string; id: number; avatarUrl?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const PALLETE = ["#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316","#eab308","#22c55e","#14b8a6","#0ea5e9","#3b82f6"];
  const bg = PALLETE[id % PALLETE.length];
  const initials = name.split(" ").map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
  if (avatarUrl && !failed) {
    return (
      <img src={avatarUrl} alt={name} onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0" />
    );
  }
  return (
    <div style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

function timeAgo(dateStr: string) {
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru }); }
  catch { return ""; }
}

function timeStamp(dateStr: string) {
  try { return format(new Date(dateStr), "HH:mm", { locale: ru }); }
  catch { return ""; }
}

function fmt(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

export default function MasterChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [conv, setConv] = useState<ConversationData | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editAmountId, setEditAmountId] = useState<number | null>(null);
  const [editAmountValue, setEditAmountValue] = useState("");
  const [partialPayTx, setPartialPayTx]         = useState<PendingTransaction | null>(null);
  const [partialAmount, setPartialAmount]       = useState("");
  const [partialNote, setPartialNote]           = useState("");
  const [partialLoading, setPartialLoading]     = useState(false);
  const [collapsedTxIds, setCollapsedTxIds]     = useState<Set<number>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingDialog, setDeletingDialog] = useState(false);

  // Photo lightbox
  const [chatPhotoLightbox, setChatPhotoLightbox] = useState<string | null>(null);

  // Master drawer overlay
  const [drawerMaster, setDrawerMaster] = useState<DrawerMaster | null>(null);
  const [drawerColumns, setDrawerColumns] = useState<DrawerColumn[]>([]);

  // Thread list filters
  const [threadSearch, setThreadSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Scroll-to-bottom
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesAreaRef = useRef<HTMLDivElement>(null);

  // Emoji picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Message editing
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  interface RespondedOrder {
    orderId: number;
    serviceType: string;
    city: string;
    district: string | null;
    respondentCount: number;
    respondedAt: string | null;
    responseNote: string | null;
    score: number | null;
    segment: "platinum" | "gold" | "silver" | "starter" | "blocked" | null;
    isCold: boolean;
  }
  const [respondedOrders, setRespondedOrders] = useState<RespondedOrder[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const prevConvIdRef = useRef<number | null>(null);

  // ── Broadcast state ────────────────────────────────────────────────────────
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastFilter, setBroadcastFilter] = useState<"all" | "city" | "custom">("all");
  const [broadcastCity, setBroadcastCity] = useState("");
  const [broadcastSelectedIds, setBroadcastSelectedIds] = useState<number[]>([]);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<number | null>(null);

  // ── Quick reply templates ──────────────────────────────────────────────────
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const QUICK_REPLIES = [
    { label: "Приветствие", text: "Здравствуйте! Чем могу помочь?" },
    { label: "Новый заказ", text: "Вам назначен новый заказ. Проверьте раздел «Заказы» в приложении." },
    { label: "Оплата", text: "Пожалуйста, оплатите комиссию по последнему заказу и пришлите скриншот." },
    { label: "Позвоните нам", text: "Позвоните нам, пожалуйста, по вопросу вашего заказа." },
    { label: "Клиент ждёт", text: "Клиент ожидает вашего звонка. Свяжитесь с ним как можно скорее." },
    { label: "Завершите заказ", text: "Не забудьте отметить заказ как выполненный в приложении." },
    { label: "Спасибо", text: "Спасибо за хорошую работу! 👍" },
    { label: "Уточните сумму", text: "Уточните, пожалуйста, итоговую сумму по заказу." },
  ];

  const fetchThreads = useCallback(async () => {
    try {
      const r = await fetch("/api/master-chat", { credentials: "include" });
      if (r.ok) { setThreads(await r.json()); setLoading(false); }
    } catch {}
  }, []);

  const fetchConversation = useCallback(async (masterId: number) => {
    setConvLoading(true);
    setConvError(null);
    try {
      const r = await fetch(`/api/master-chat/${masterId}`, { credentials: "include" });
      if (r.ok) {
        const data = await r.json();
        setConv(data);
        setConvError(null);
        await fetch(`/api/master-chat/${masterId}/read`, { method: "PATCH", credentials: "include" });
        setThreads(p => p.map(t => t.masterId === masterId ? { ...t, unread: 0 } : t));
      } else {
        const err = await r.json().catch(() => ({}));
        setConvError(err.error ?? `Ошибка загрузки (${r.status})`);
        setConv(null);
      }
    } catch (e: any) {
      setConvError("Не удалось загрузить переписку");
      setConv(null);
    } finally {
      setConvLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreads();
    const t = setInterval(fetchThreads, 12000);
    return () => clearInterval(t);
  }, [fetchThreads]);

  useEffect(() => {
    if (selectedId) {
      fetchConversation(selectedId);
      const t = setInterval(() => fetchConversation(selectedId), 10000);
      return () => clearInterval(t);
    }
    return undefined;
  }, [selectedId, fetchConversation]);

  useEffect(() => {
    if (!conv) return;
    const isNewConv = prevConvIdRef.current !== conv.master.id;
    prevConvIdRef.current = conv.master.id;
    bottomRef.current?.scrollIntoView({ behavior: isNewConv ? "auto" : "smooth" });
  }, [conv?.master.id, conv?.messages.length]);

  // Auto-select master from URL ?masterId=X
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idStr = params.get("masterId");
    if (idStr) {
      const id = parseInt(idStr);
      if (!isNaN(id)) setSelectedId(id);
    }
  }, [location]);

  // Load responded dispatches for selected master
  const fetchRespondedOrders = useCallback(async (masterId: number) => {
    try {
      const r = await fetch("/api/dispatch/pending", { credentials: "include" });
      if (r.ok) {
        const all = await r.json();
        const mine = all
          .filter((item: any) => item.respondents.some((resp: any) => resp.masterId === masterId))
          .map((item: any) => {
            const myResp = item.respondents.find((resp: any) => resp.masterId === masterId);
            return {
              orderId: item.orderId,
              serviceType: item.serviceType,
              city: item.city,
              district: item.district,
              respondentCount: item.respondentCount,
              respondedAt: myResp?.respondedAt ?? null,
              responseNote: myResp?.responseNote ?? null,
              score: myResp?.score ?? null,
              segment: myResp?.segment ?? null,
              isCold: myResp?.isCold ?? false,
            };
          });
        setRespondedOrders(mine);
      }
    } catch {}
  }, []);

  // Load pending orders for selected master
  const fetchPendingOrders = useCallback(async (masterId: number) => {
    try {
      const r = await fetch(`/api/orders?masterId=${masterId}`, { credentials: "include" });
      if (r.ok) {
        const all = await r.json();
        const pending = all.filter((o: any) =>
          (o.status === "cancellation_requested") ||
          (o.status === "completed" && o.proposedAmount && !o.orderAmount)
        );
        setPendingOrders(pending);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchPendingOrders(selectedId);
      fetchRespondedOrders(selectedId);
      const t1 = setInterval(() => fetchPendingOrders(selectedId), 16000);
      const t2 = setInterval(() => fetchRespondedOrders(selectedId), 14000);
      return () => { clearInterval(t1); clearInterval(t2); };
    } else {
      setPendingOrders([]);
      setRespondedOrders([]);
    }
    return undefined;
  }, [selectedId, fetchPendingOrders, fetchRespondedOrders]);

  // Open master card overlay
  const openMasterDrawer = async (masterId: number) => {
    const [mRes, cRes] = await Promise.all([
      fetch(`/api/masters/${masterId}`, { credentials: "include" }),
      fetch("/api/voronka/columns", { credentials: "include" }),
    ]);
    if (mRes.ok) {
      const m = await mRes.json();
      setDrawerMaster({ ...m, activeOrders: [] });
    }
    if (cRes.ok) {
      const cols = await cRes.json();
      setDrawerColumns(Array.isArray(cols) ? cols : []);
    }
  };

  // Edit operator message
  const saveEditMessage = async () => {
    if (!editingMessageId || !editingText.trim()) return;
    const r = await fetch(`/api/master-chat/messages/${editingMessageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text: editingText.trim() }),
    });
    if (r.ok) {
      const updated = await r.json();
      setConv(prev => prev ? {
        ...prev,
        messages: prev.messages.map(m => m.id === updated.id ? { ...m, text: updated.text, editedAt: updated.editedAt } : m),
      } : prev);
    }
    setEditingMessageId(null);
    setEditingText("");
  };

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmojiPicker]);

  // Mutations for order actions in chat
  const approveCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ approveCancellation: true }),
      });
      if (!r.ok) throw new Error("Ошибка");
      return r.json();
    },
    onSuccess: () => selectedId && fetchPendingOrders(selectedId),
  });

  const rejectCancellationMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ rejectCancellation: true }),
      });
      if (!r.ok) throw new Error("Ошибка");
      return r.json();
    },
    onSuccess: () => selectedId && fetchPendingOrders(selectedId),
  });

  const acceptProposedMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ acceptProposed: true }),
      });
      if (!r.ok) throw new Error("Ошибка");
      return r.json();
    },
    onSuccess: () => {
      if (selectedId) {
        fetchPendingOrders(selectedId);
        // Refresh conversation to pick up the newly created transaction
        setTimeout(() => fetchConversation(selectedId), 700);
      }
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (txId: number) => {
      const r = await fetch(`/api/finance/transactions/${txId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ paymentStatus: "paid" }),
      });
      if (!r.ok) throw new Error("Ошибка подтверждения оплаты");
      return r.json();
    },
    onSuccess: () => {
      if (selectedId) {
        // Refresh conversation — pendingTransactions will be empty now
        fetchConversation(selectedId);
        fetchThreads();
      }
    },
  });

  const doPartialPay = async () => {
    if (!partialPayTx) return;
    const amt = parseFloat(partialAmount.replace(",", "."));
    if (isNaN(amt) || amt <= 0) { toast({ title: "Введите корректную сумму", variant: "destructive" }); return; }
    setPartialLoading(true);
    try {
      const r = await fetch(`/api/finance/transactions/${partialPayTx.id}/partial-payment`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, note: partialNote.trim() || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Ошибка");
      if (data.fullyPaid) {
        toast({ title: `✅ Комиссия по заказу #${partialPayTx.orderId} полностью погашена!` });
      } else {
        toast({ title: `✅ Принято ${amt.toLocaleString("ru-RU")} ₽. Остаток: ${data.remaining?.toLocaleString("ru-RU")} ₽` });
      }
      setPartialPayTx(null); setPartialAmount(""); setPartialNote("");
      if (selectedId) { fetchConversation(selectedId); fetchThreads(); }
    } catch (e: any) { toast({ title: e?.message ?? "Ошибка", variant: "destructive" }); }
    finally { setPartialLoading(false); }
  };

  const setAmountMutation = useMutation({
    mutationFn: async ({ orderId, amount }: { orderId: number; amount: number }) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ orderAmount: amount }),
      });
      if (!r.ok) throw new Error("Ошибка");
      return r.json();
    },
    onSuccess: () => { selectedId && fetchPendingOrders(selectedId); setEditAmountId(null); setEditAmountValue(""); },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ orderId, masterId }: { orderId: number; masterId: number }) => {
      const r = await fetch(`/api/dispatch/${orderId}/assign/${masterId}`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: () => { selectedId && fetchRespondedOrders(selectedId); },
  });

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Файл слишком большой", description: "Максимальный размер фото — 10 МБ", variant: "destructive" });
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearPhoto = () => { setPhotoFile(null); setPhotoPreview(null); };

  const handleDeleteDialog = async () => {
    if (!selectedId) return;
    const deletedId = selectedId;
    setDeletingDialog(true);
    try {
      const r = await fetch(`/api/master-chat/${deletedId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) return;
      // Immediately remove thread card from sidebar (optimistic update)
      setThreads(prev => prev.filter(t => t.masterId !== deletedId));
      setConv(null);
      setSelectedId(null);
      setShowDeleteDialog(false);
      // Refresh in background to sync with server
      fetchThreads();
    } finally {
      setDeletingDialog(false);
    }
  };

  const sendReply = async () => {
    if ((!reply.trim() && !photoFile) || !selectedId || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      if (reply.trim()) form.append("text", reply.trim());
      form.append("operatorName", user?.name ?? "Оператор");
      if (photoFile) form.append("photo", photoFile);

      const r = await fetch(`/api/master-chat/${selectedId}/reply`, {
        method: "POST",
        body: form,
      });
      if (r.ok) {
        setReply("");
        clearPhoto();
        await fetchConversation(selectedId);
      }
    } finally {
      setSending(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!selectedId) return;
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const r = await fetch(`/api/masters/${selectedId}/avatar`, { method: "POST", body: form });
      if (r.ok) {
        await Promise.all([fetchConversation(selectedId), fetchThreads()]);
      }
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── All active masters for broadcast ──────────────────────────────────────
  const [allMastersForBroadcast, setAllMastersForBroadcast] = useState<{ id: number; alias: string; city: string }[]>([]);
  useEffect(() => {
    fetch("/api/masters", { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAllMastersForBroadcast(Array.isArray(data) ? data.filter((m: any) => m.status === "active") : []))
      .catch(() => {});
  }, []);
  const broadcastCities = [...new Set(allMastersForBroadcast.map(m => m.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));

  // ── Broadcast send ────────────────────────────────────────────────────────
  const sendBroadcast = async () => {
    if (!broadcastText.trim() || broadcastSending) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const filter =
        broadcastFilter === "city" ? { type: "city", city: broadcastCity } :
        broadcastFilter === "custom" ? { type: "custom", masterIds: broadcastSelectedIds } :
        { type: "all" };
      const r = await fetch("/api/master-chat/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: broadcastText.trim(), filter }),
      });
      if (r.ok) {
        const { sent } = await r.json();
        setBroadcastResult(sent);
        setBroadcastText("");
        await fetchThreads();
      }
    } finally {
      setBroadcastSending(false);
    }
  };

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  const filteredThreads = threads.filter(t => {
    if (unreadOnly && t.unread === 0) return false;
    if (threadSearch) {
      const q = threadSearch.toLowerCase();
      return t.alias.toLowerCase().includes(q) || t.city.toLowerCase().includes(q) || (t.phone ?? "").includes(q);
    }
    return true;
  });

  // Scroll-to-bottom button visibility
  const handleMessagesScroll = () => {
    const el = messagesAreaRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="master-chat">
      <Layout>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div>
              <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                Чат с мастерами
                {totalUnread > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 ml-1">
                    {totalUnread}
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">Сообщения от мастеров через приложение</p>
            </div>
            <button onClick={fetchThreads} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Chat layout */}
          <div className="flex-1 flex gap-4 min-h-0">
            {/* Threads list */}
            <div className="w-72 flex-shrink-0 bg-white border border-gray-100 rounded-2xl overflow-hidden flex flex-col shadow-sm">
              {/* Sidebar header with search + filter */}
              <div className="px-3 py-2.5 border-b border-gray-50 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
                    {loading ? "Загрузка..." : `${filteredThreads.length} из ${threads.length}`}
                  </p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setUnreadOnly(v => !v)}
                      title="Только непрочитанные"
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                        unreadOnly ? "bg-blue-500 text-white" : "text-gray-400 hover:bg-gray-100"
                      }`}
                    >
                      <Filter className="w-3 h-3" />
                      {unreadOnly ? "Непрочит." : totalUnread > 0 ? `${totalUnread} новых` : "Все"}
                    </button>
                    <button
                      onClick={() => { setShowBroadcast(v => !v); setSelectedId(null); setBroadcastResult(null); }}
                      title="Рассылка"
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                        showBroadcast ? "bg-violet-500 text-white" : "text-gray-400 hover:bg-gray-100 hover:text-violet-600"
                      }`}
                    >
                      <Megaphone className="w-3 h-3" />
                      Рассылка
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={threadSearch}
                    onChange={e => setThreadSearch(e.target.value)}
                    placeholder="Поиск по имени..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-gray-50"
                  />
                  {threadSearch && (
                    <button onClick={() => setThreadSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {threads.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <MessageSquare className="w-10 h-10 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Пока нет сообщений</p>
                    <p className="text-xs text-gray-300 mt-1">Мастера пишут через приложение</p>
                  </div>
                )}
                {filteredThreads.length === 0 && threads.length > 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                    <p className="text-sm text-gray-300">Ничего не найдено</p>
                  </div>
                )}
                {filteredThreads.map(t => {
                  const online = isOnline(t.lastSeenAt);
                  const stripDispatcher = (text: string) => text.replace(/^\[ИИ-диспетчер\]:\s*/, "");
                  const lastMsgPreview = t.lastFromMaster
                    ? t.lastMessage
                    : t.lastMessage.startsWith("[ИИ-диспетчер]:")
                      ? `Диспетчер: ${stripDispatcher(t.lastMessage)}`
                      : `Вы: ${t.lastMessage}`;
                  return (
                    <div
                      key={t.masterId}
                      className={`group relative border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${
                        selectedId === t.masterId ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                      }`}
                      onClick={() => setSelectedId(t.masterId)}
                    >
                      <div className="flex items-center gap-2.5 px-3 py-2.5">
                        <div className="relative flex-shrink-0">
                          <ChatAvatar name={t.alias} id={t.masterId} avatarUrl={t.avatarUrl} size={36} />
                          {/* Online dot */}
                          {online && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full" />
                          )}
                          {/* Unread badge */}
                          {t.unread > 0 && !online && (
                            <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                              {t.unread > 9 ? "9+" : t.unread}
                            </span>
                          )}
                          {t.unread > 0 && online && (
                            <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                              {t.unread > 9 ? "9+" : t.unread}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`font-semibold text-sm truncate ${t.unread > 0 ? "text-gray-900" : "text-gray-700"}`}>{t.alias}</span>
                            <span className="text-[10px] text-gray-300 flex-shrink-0 group-hover:hidden">{timeAgo(t.lastAt)}</span>
                            {user?.role === "admin" && (
                              <button
                                onClick={e => { e.stopPropagation(); setSelectedId(t.masterId); setShowDeleteDialog(true); }}
                                className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                title="Удалить диалог"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate">{t.city}{online ? " · 🟢 онлайн" : ""}</p>
                          <p className={`text-xs mt-0.5 truncate ${t.unread > 0 ? "text-gray-700 font-medium" : "text-gray-400"}`}>{lastMsgPreview}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Conversation view */}
            <div className="flex-1 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col overflow-hidden min-w-0">
              {showBroadcast ? (
                /* ═══════ BROADCAST PANEL ═══════ */
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
                    <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <Megaphone className="w-4.5 h-4.5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800">Рассылка мастерам</p>
                      <p className="text-[11px] text-gray-400">Сообщение получат {allMastersForBroadcast.length} активных мастеров</p>
                    </div>
                    <button onClick={() => setShowBroadcast(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Success state */}
                    {broadcastResult !== null && (
                      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                        <CheckCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-700">Рассылка отправлена</p>
                          <p className="text-xs text-emerald-600 mt-0.5">Получили {broadcastResult} {broadcastResult === 1 ? "мастер" : broadcastResult < 5 ? "мастера" : "мастеров"}</p>
                        </div>
                        <button onClick={() => setBroadcastResult(null)} className="ml-auto p-1 hover:bg-emerald-100 rounded-lg">
                          <X className="w-3 h-3 text-emerald-500" />
                        </button>
                      </div>
                    )}

                    {/* Recipient filter */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Получатели</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { value: "all", label: "Все", icon: Users },
                          { value: "city", label: "По городу", icon: Building2 },
                          { value: "custom", label: "Выбрать", icon: ListChecks },
                        ] as const).map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => { setBroadcastFilter(opt.value); setBroadcastSelectedIds([]); }}
                            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-colors ${
                              broadcastFilter === opt.value
                                ? "bg-violet-500 border-violet-500 text-white"
                                : "bg-white border-gray-200 text-gray-500 hover:border-violet-200 hover:text-violet-600"
                            }`}
                          >
                            <opt.icon className="w-4 h-4" />
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* City selector */}
                      {broadcastFilter === "city" && (
                        <div className="space-y-1.5">
                          <select
                            value={broadcastCity}
                            onChange={e => setBroadcastCity(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-violet-100 bg-white"
                          >
                            <option value="">— Выберите город —</option>
                            {broadcastCities.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          {broadcastCity && (
                            <p className="text-xs text-violet-600 font-medium">
                              {allMastersForBroadcast.filter(m => m.city === broadcastCity).length} мастеров в {broadcastCity}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Custom master selector */}
                      {broadcastFilter === "custom" && (
                        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                          {allMastersForBroadcast.map(m => (
                            <label key={m.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                              <input
                                type="checkbox"
                                checked={broadcastSelectedIds.includes(m.id)}
                                onChange={e => {
                                  setBroadcastSelectedIds(prev =>
                                    e.target.checked ? [...prev, m.id] : prev.filter(id => id !== m.id)
                                  );
                                }}
                                className="rounded accent-violet-500"
                              />
                              <ChatAvatar name={m.alias} id={m.id} size={22} />
                              <span className="text-xs font-medium text-gray-700 truncate">{m.alias}</span>
                              <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{m.city}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* Recipient count badge */}
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Users className="w-3.5 h-3.5 text-violet-400" />
                        Будет отправлено:
                        <span className="font-bold text-violet-600">
                          {broadcastFilter === "all" ? allMastersForBroadcast.length :
                           broadcastFilter === "city" ? allMastersForBroadcast.filter(m => m.city === broadcastCity).length :
                           broadcastSelectedIds.length} чел.
                        </span>
                      </div>
                    </div>

                    {/* Templates */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Шаблоны сообщений</p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          "Напоминаем об оплате комиссии за выполненные заказы.",
                          "Уважаемые мастера! Обновите своё расписание в приложении.",
                          "Важно: проверьте раздел «Заказы» — есть новые назначения.",
                          "Спасибо за работу! Рады сотрудничеству с вами. 🤝",
                        ].map((tpl, i) => (
                          <button
                            key={i}
                            onClick={() => setBroadcastText(tpl)}
                            className="px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-600 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors text-left"
                          >
                            {tpl.length > 48 ? tpl.slice(0, 46) + "…" : tpl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Message input */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Текст сообщения</p>
                      <textarea
                        value={broadcastText}
                        onChange={e => setBroadcastText(e.target.value)}
                        placeholder="Введите текст рассылки..."
                        rows={5}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-violet-100 resize-none bg-gray-50"
                      />
                      <p className="text-[10px] text-gray-400 text-right">{broadcastText.length} симв.</p>
                    </div>
                  </div>

                  {/* Send button */}
                  <div className="px-4 py-3 border-t border-gray-50 flex-shrink-0">
                    <button
                      onClick={sendBroadcast}
                      disabled={
                        !broadcastText.trim() ||
                        broadcastSending ||
                        (broadcastFilter === "city" && !broadcastCity) ||
                        (broadcastFilter === "custom" && broadcastSelectedIds.length === 0)
                      }
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-medium text-sm hover:bg-violet-700 disabled:opacity-40 transition-colors"
                    >
                      {broadcastSending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Отправляем...</>
                      ) : (
                        <><Megaphone className="w-4 h-4" />
                          Отправить рассылку
                          {broadcastFilter === "all" && allMastersForBroadcast.length > 0 && (
                            <span className="bg-violet-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">
                              {allMastersForBroadcast.length}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : !selectedId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <MessageSquare className="w-14 h-14 text-gray-200 mb-4" />
                  <p className="text-gray-400 font-medium">Выберите диалог</p>
                  <p className="text-sm text-gray-300 mt-1">Выберите мастера из списка слева</p>
                  <button
                    onClick={() => { setShowBroadcast(true); setSelectedId(null); }}
                    className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-violet-50 text-violet-600 border border-violet-200 rounded-xl text-sm font-medium hover:bg-violet-100 transition-colors"
                  >
                    <Megaphone className="w-4 h-4" />
                    Создать рассылку
                  </button>
                </div>
              ) : (
                <>
                  {/* Loading / Error state */}
                  {convLoading && !conv && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                      <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-3" />
                      <p className="text-sm text-gray-400">Загрузка переписки...</p>
                    </div>
                  )}
                  {convError && !conv && !convLoading && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                      <AlertCircle className="w-10 h-10 text-red-300 mb-3" />
                      <p className="text-sm text-red-500 font-medium">{convError}</p>
                      <button onClick={() => selectedId && fetchConversation(selectedId)} className="mt-3 text-xs text-blue-500 hover:underline">Попробовать снова</button>
                    </div>
                  )}
                  {/* Conv header */}
                  {conv && (
                    <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3 flex-shrink-0">
                      {/* Clickable avatar — click to upload photo */}
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
                      />
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="relative group flex-shrink-0"
                        title="Загрузить фото мастера"
                        disabled={avatarUploading}
                      >
                        <ChatAvatar name={conv.master.alias} id={conv.master.id} avatarUrl={conv.master.avatarUrl} size={38} />
                        <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {avatarUploading
                            ? <RefreshCw className="w-4 h-4 text-white animate-spin" />
                            : <Camera className="w-4 h-4 text-white" />}
                        </span>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-gray-800">{conv.master.alias}</p>
                          {(() => {
                            const thread = threads.find(t => t.masterId === conv.master.id);
                            return isOnline(thread?.lastSeenAt ?? null) ? (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                                Онлайн
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <p className="text-[11px] text-gray-400">
                            {conv.master.city}
                            {conv.master.pwaLogin && <span className="ml-1 text-emerald-500">· Приложение</span>}
                          </p>
                          {conv.master.phone && (
                            <a
                              href={`tel:${conv.master.phone}`}
                              className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              <Phone className="w-2.5 h-2.5" />
                              {conv.master.phone}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Open master card button */}
                        <button
                          onClick={() => openMasterDrawer(conv.master.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                          title="Открыть карточку мастера"
                        >
                          <User2 className="w-3.5 h-3.5" />
                          Карточка
                          <ChevronRight className="w-3 h-3" />
                        </button>
                        {/* Delete dialog button (admin only) */}
                        {user?.role === "admin" && (
                          <button
                            onClick={() => setShowDeleteDialog(true)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                            title="Удалить диалог"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Partial payment modal */}
                  {partialPayTx && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-base font-semibold text-gray-800">Частичный платёж · заказ #{partialPayTx.orderId}</h3>
                          <button onClick={() => setPartialPayTx(null)} className="text-gray-400 hover:text-gray-700">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1.5">
                          <div className="flex justify-between text-xs"><span className="text-gray-500">Комиссия</span><span className="font-medium">{fmt(partialPayTx.commission)}</span></div>
                          {partialPayTx.prepaymentDeducted > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Предоплата</span><span className="text-emerald-600">−{fmt(partialPayTx.prepaymentDeducted)}</span></div>}
                          {partialPayTx.totalPartialPaid > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Оплачено частями</span><span className="text-blue-600">−{fmt(partialPayTx.totalPartialPaid)}</span></div>}
                          <div className="flex justify-between text-xs border-t border-gray-200 pt-1.5"><span className="font-medium">Остаток</span><span className="font-bold text-red-600">{fmt(partialPayTx.netPayable)}</span></div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, ((partialPayTx.prepaymentDeducted + partialPayTx.totalPartialPaid) / partialPayTx.commission) * 100)}%` }} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Сумма, ₽</label>
                            <input type="number" value={partialAmount} onChange={e => setPartialAmount(e.target.value)}
                              placeholder={`до ${partialPayTx.netPayable.toLocaleString("ru-RU")}`}
                              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Комментарий</label>
                            <input type="text" value={partialNote} onChange={e => setPartialNote(e.target.value)}
                              placeholder="Наличные, перевод..."
                              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setPartialPayTx(null)}
                            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                            Отмена
                          </button>
                          <button onClick={doPartialPay} disabled={partialLoading || !partialAmount}
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                            {partialLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Принять платёж"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Delete dialog confirmation modal */}
                  {showDeleteDialog && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                            <Trash2 className="w-5 h-5 text-red-500" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">Удалить диалог?</p>
                            <p className="text-xs text-gray-500 mt-0.5">Все сообщения с {conv?.master.alias ?? threads.find(t => t.masterId === selectedId)?.alias ?? "мастером"} будут удалены навсегда</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowDeleteDialog(false)}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Отмена
                          </button>
                          <button
                            onClick={handleDeleteDialog}
                            disabled={deletingDialog}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {deletingDialog ? "Удаление..." : "Удалить"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div
                    ref={messagesAreaRef}
                    onScroll={handleMessagesScroll}
                    className="flex-1 overflow-y-auto p-4 relative flex flex-col gap-2.5"
                  >
                    {/* Spacer — pushes messages to the bottom when few exist */}
                    <div className="flex-1" />

                    {/* Scroll to bottom button */}
                    {showScrollBtn && (
                      <button
                        onClick={scrollToBottom}
                        className="sticky bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg hover:bg-blue-600 transition-colors"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                        Вниз
                      </button>
                    )}
                    {conv?.messages.map((msg, idx) => {
                      const currentKey = msgDateKey(msg.createdAt);
                      const prevKey = idx > 0 ? msgDateKey(conv.messages[idx - 1].createdAt) : null;
                      const showDateSep = idx === 0 || currentKey !== prevKey;
                      const dateSepEl = showDateSep ? (
                        <div className="flex justify-center my-2">
                          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-3 py-1 font-medium">
                            {dateSeparatorLabel(msg.createdAt)}
                          </span>
                        </div>
                      ) : null;

                      if (msg.senderName === "system") {
                        return (
                          <div key={msg.id}>
                            {dateSepEl}
                            <div className="flex justify-center my-1">
                              <div className="flex items-center gap-1.5 bg-gray-100 text-gray-500 text-[11px] rounded-full px-3 py-1">
                                <span>{msg.text}</span>
                                <span className="text-gray-400 text-[10px]">{timeStamp(msg.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const isMaster = msg.fromMaster;
                      const senderLabel = msg.senderName ?? (isMaster ? conv.master.alias : "Оператор");
                      const isEditing = editingMessageId === msg.id;
                      return (
                        <div key={msg.id}>
                          {dateSepEl}
                          <div className={`flex items-end gap-2 group ${isMaster ? "justify-start" : "justify-end"}`}>
                            {isMaster && (
                              <ChatAvatar name={conv.master.alias} id={conv.master.id} avatarUrl={conv.master.avatarUrl} size={28} />
                            )}
                            {!isMaster && !isEditing && (
                              <button
                                onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.text); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded-lg flex-shrink-0 self-center"
                                title="Редактировать"
                              >
                                <Pencil className="w-3 h-3 text-gray-400" />
                              </button>
                            )}
                            <div className={`max-w-[70%] rounded-2xl px-3.5 py-2.5 ${isMaster ? "bg-gray-100 text-gray-800 rounded-bl-sm" : "bg-blue-500 text-white rounded-br-sm"}`}>
                              <p className={`text-[10px] font-semibold mb-1 ${isMaster ? "text-gray-500" : "text-blue-100"}`}>{senderLabel}</p>
                              {msg.photoUrl && (
                                <button
                                  type="button"
                                  onClick={() => msg.photoUrl && setChatPhotoLightbox(resolvePhotoUrl(msg.photoUrl))}
                                  className="block mb-2 w-full text-left p-0 bg-transparent border-none"
                                >
                                  <img src={resolvePhotoUrl(msg.photoUrl)} alt="фото" className="rounded-xl max-w-full max-h-52 object-cover cursor-zoom-in" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                </button>
                              )}
                              {isEditing ? (
                                <div className="space-y-1.5 mt-1">
                                  <textarea
                                    value={editingText}
                                    onChange={e => setEditingText(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEditMessage(); }
                                      if (e.key === "Escape") { setEditingMessageId(null); setEditingText(""); }
                                    }}
                                    autoFocus rows={2}
                                    className="w-full bg-white/20 text-white placeholder-blue-200 border border-blue-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-white resize-none"
                                    style={{ minWidth: 200 }}
                                  />
                                  <div className="flex gap-1.5">
                                    <button onClick={saveEditMessage} className="flex-1 py-1 bg-white text-blue-600 rounded-lg text-[10px] font-semibold hover:bg-blue-50 transition-colors">Сохранить</button>
                                    <button onClick={() => { setEditingMessageId(null); setEditingText(""); }} className="py-1 px-2 bg-white/20 text-white rounded-lg text-[10px] hover:bg-white/30 transition-colors">Отмена</button>
                                  </div>
                                </div>
                              ) : (
                                (() => { const t = (msg.text ?? "").replace(/^\[ИИ-диспетчер\]:\s*/, "").trim(); return t ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{t}</p> : null; })()
                              )}
                              <div className={`flex items-center gap-1 mt-1 ${isMaster ? "justify-start" : "justify-end"}`}>
                                <span className={`text-[10px] ${isMaster ? "text-gray-400" : "text-blue-100"}`}>{timeStamp(msg.createdAt)}</span>
                                {msg.editedAt && <span className={`text-[9px] italic ${isMaster ? "text-gray-400" : "text-blue-200"}`}>изм.</span>}
                                {!isMaster && (msg.isRead ? <CheckCheck className="w-3 h-3 text-blue-200" /> : <Check className="w-3 h-3 text-blue-200" />)}
                              </div>
                            </div>
                            {!isMaster && <ChatAvatar name={senderLabel} id={0} size={28} />}
                          </div>
                        </div>
                      );
                    })}
                    {conv?.messages.length === 0 && (
                      <div className="text-center text-sm text-gray-300 mt-8">Нет сообщений</div>
                    )}
                    <div ref={bottomRef} />
                  </div>

                  {/* Responded dispatch cards — assign master directly from chat */}
                  {respondedOrders.length > 0 && (
                    <div className="border-t border-gray-100 flex-shrink-0">
                      {/* Header */}
                      <div className="px-4 pt-2.5 pb-1.5 flex items-center gap-1.5">
                        <CheckCheck className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                        <span className="text-[11px] font-bold text-green-600 uppercase tracking-wide">
                          Откликнулся ({respondedOrders.length})
                        </span>
                      </div>
                      <div className="px-3 pb-3 space-y-2">
                        {respondedOrders.map(item => {
                          // Parse constraint tags from responseNote: "⚠️ Tag1, Tag2 | note"
                          const tags: string[] = [];
                          if (item.responseNote) {
                            const m = item.responseNote.match(/⚠️\s*([^|]+)/);
                            if (m) m[1].split(",").forEach(t => { const s = t.trim(); if (s) tags.push(s); });
                          }
                          const TAG_COLOR: Record<string, string> = {
                            "Лимит": "bg-blue-100 text-blue-700 border-blue-200",
                            "ФОМО": "bg-orange-100 text-orange-700 border-orange-200",
                            "Без договора": "bg-red-100 text-red-700 border-red-200",
                            "Долг": "bg-rose-100 text-rose-700 border-rose-200",
                            "Репутация": "bg-amber-100 text-amber-800 border-amber-300",
                            "Автоблок": "bg-red-200 text-red-900 border-red-400 font-bold",
                            "Ограничение": "bg-gray-100 text-gray-600 border-gray-200",
                          };
                          const TAG_HINT: Record<string, string> = {
                            "Лимит": "У мастера достигнут лимит активных заказов",
                            "ФОМО": "По текущему заказу нет сметы или предоплаты",
                            "Без договора": "Паспорт не верифицирован / договор не заключён",
                            "Долг": "Просроченная задолженность по комиссии",
                            "Репутация": "1 подряд отменённый заказ — приоритет ниже",
                            "Автоблок": "2+ подряд отменённых — назначать не рекомендуется",
                            "Ограничение": "Техническое ограничение — уточните у мастера",
                          };
                          return (
                            <div key={item.orderId} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-gray-800">Заявка #{item.orderId}</span>
                                    {item.score != null && (() => {
                                      const SEG_STYLE: Record<string, { bg: string; label: string; emoji: string }> = {
                                        platinum: { bg: "bg-violet-100 text-violet-800 border-violet-300", label: "Платина", emoji: "💎" },
                                        gold:     { bg: "bg-amber-100 text-amber-800 border-amber-300",   label: "Золото",  emoji: "🥇" },
                                        silver:   { bg: "bg-slate-100 text-slate-700 border-slate-300",   label: "Серебро", emoji: "🥈" },
                                        starter:  { bg: "bg-blue-50 text-blue-700 border-blue-200",       label: item.isCold ? "Новичок" : "Старт", emoji: item.isCold ? "🆕" : "🎯" },
                                        blocked:  { bg: "bg-red-100 text-red-800 border-red-300",         label: "Блок",    emoji: "🛑" },
                                      };
                                      const seg = SEG_STYLE[item.segment ?? "starter"] ?? SEG_STYLE.starter;
                                      return (
                                        <span
                                          title={`Score ${item.score}/100 — ${seg.label}${item.isCold ? " (новый мастер, статистики мало)" : ""}`}
                                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold border cursor-help ${seg.bg}`}
                                        >
                                          <span>{seg.emoji}</span>
                                          <span>{item.score}</span>
                                        </span>
                                      );
                                    })()}
                                    {item.respondedAt && (
                                      <span className="text-[10px] text-gray-400">{timeStamp(item.respondedAt)}</span>
                                    )}
                                    {item.respondentCount > 1 && (
                                      <span className="text-[10px] text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5 font-medium">
                                        +{item.respondentCount - 1} ещё
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                                    {item.serviceType}{item.city ? ` · ${item.city}` : ""}{item.district ? `, ${item.district}` : ""}
                                  </p>
                                  {tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {tags.map((tag, i) => (
                                        <span
                                          key={i}
                                          title={TAG_HINT[tag] ?? ""}
                                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border cursor-help ${TAG_COLOR[tag] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => selectedId && assignMutation.mutate({ orderId: item.orderId, masterId: selectedId })}
                                  disabled={assignMutation.isPending}
                                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white hover:bg-green-600 rounded-xl font-semibold text-xs transition-colors disabled:opacity-50 shadow-sm shadow-green-200"
                                >
                                  {assignMutation.isPending
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <UserCheck className="w-3.5 h-3.5" />}
                                  Назначить
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Commission payment receipt cards */}
                  {(conv?.pendingTransactions ?? []).length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-2 flex-shrink-0">
                      {(conv?.pendingTransactions ?? []).map(tx => (
                        <div key={tx.id} className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
                          {/* Header — click to collapse/expand */}
                          <button
                            onClick={() => setCollapsedTxIds(prev => {
                              const next = new Set(prev);
                              next.has(tx.id) ? next.delete(tx.id) : next.add(tx.id);
                              return next;
                            })}
                            className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-violet-100 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-violet-600 flex-shrink-0" />
                              <span className="text-xs font-semibold text-violet-800">Оплата комиссии по заказу #{tx.orderId}</span>
                              {collapsedTxIds.has(tx.id) && (
                                <span className="text-xs font-bold text-violet-700 ml-1">{fmt(tx.netPayable)}</span>
                              )}
                            </div>
                            {collapsedTxIds.has(tx.id)
                              ? <ChevronDown className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                              : <ChevronUp className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />}
                          </button>
                          {/* Collapsible body */}
                          {!collapsedTxIds.has(tx.id) && <div className="px-4 pb-3 space-y-3">
                          {/* Receipt body */}
                          <div className="bg-white rounded-lg border border-violet-100 px-3 py-2.5 space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-500">Стоимость работ</span>
                              <span className="font-semibold text-gray-800">{fmt(tx.orderAmount)}</span>
                            </div>
                            <div className="border-t border-dashed border-gray-100 my-1" />
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-500">Комиссия</span>
                              <span className="font-semibold text-gray-800">{fmt(tx.commission)}</span>
                            </div>
                            {tx.prepaymentDeducted > 0 && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500">Предоплата зачтена</span>
                                <span className="text-emerald-600">−{fmt(tx.prepaymentDeducted)}</span>
                              </div>
                            )}
                            {tx.totalPartialPaid > 0 && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500">Оплачено частями</span>
                                <span className="text-blue-600">−{fmt(tx.totalPartialPaid)}</span>
                              </div>
                            )}
                            <div className="border-t border-dashed border-gray-100 my-1" />
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-500 font-medium">К оплате</span>
                              <span className="font-bold text-violet-700 text-sm">{fmt(tx.netPayable)}</span>
                            </div>
                            {/* Progress bar */}
                            {tx.commission > 0 && (tx.prepaymentDeducted > 0 || tx.totalPartialPaid > 0) && (
                              <div className="w-full bg-gray-100 rounded-full h-1 mt-1">
                                <div className="bg-violet-500 h-1 rounded-full" style={{ width: `${Math.min(100, ((tx.prepaymentDeducted + tx.totalPartialPaid) / tx.commission) * 100)}%` }} />
                              </div>
                            )}
                            <div className="border-t border-dashed border-gray-100 my-1" />
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-500">Реквизиты</span>
                              <span className="font-mono font-semibold text-gray-800 select-all text-[10px]">89892860863 · Альфа Банк · Игорь К.</span>
                            </div>
                          </div>

                          {/* Partial payment history */}
                          {tx.partialPayments?.length > 0 && (
                            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 space-y-1">
                              <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Принятые платежи</p>
                              {tx.partialPayments.map((p, i) => (
                                <div key={p.id} className="flex items-center justify-between text-xs">
                                  <span className="text-blue-500">#{i + 1} · {new Date(p.paidAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
                                  <span className="font-semibold text-blue-800">{fmt(p.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setPartialPayTx(tx); setPartialAmount(""); setPartialNote(""); }}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg font-medium text-xs transition-colors"
                            >
                              <DollarSign className="w-3 h-3" /> Частично
                            </button>
                            {conv?.hasPaymentProof && conv.paymentProofUrl ? (
                              <button
                                onClick={() => confirmPaymentMutation.mutate(tx.id)}
                                disabled={confirmPaymentMutation.isPending}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600 text-white hover:bg-violet-700 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                              >
                                {confirmPaymentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Полностью
                              </button>
                            ) : (
                              <div className="flex-1 flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                                <Loader2 className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                <p className="text-[10px] text-amber-700">Ждём скриншот</p>
                              </div>
                            )}
                          </div>

                          {/* Payment proof screenshot */}
                          {conv?.hasPaymentProof && conv.paymentProofUrl && (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide flex items-center gap-1">
                                <Check className="w-3 h-3" /> Скриншот оплаты получен
                              </p>
                              <a href={conv.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="block">
                                <img
                                  src={conv.paymentProofUrl}
                                  alt="Скриншот оплаты"
                                  className="w-full rounded-lg border border-emerald-200 object-cover max-h-40 hover:opacity-90 transition-opacity cursor-zoom-in"
                                />
                              </a>
                            </div>
                          )}
                          </div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pending order action cards */}
                  {pendingOrders.length > 0 && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-2 flex-shrink-0">
                      {pendingOrders.map(order => {
                        const isCancelRequest = order.status === "cancellation_requested";
                        const isProposed = order.status === "completed" && order.proposedAmount && !order.orderAmount;
                        return (
                          <div key={order.id} className={`rounded-xl border px-4 py-3 space-y-2 ${isCancelRequest ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isCancelRequest
                                  ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                  : <DollarSign className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                                <span className={`text-xs font-semibold ${isCancelRequest ? "text-red-700" : "text-amber-700"}`}>
                                  {isCancelRequest ? `Запрос на отмену заказа #${order.id}` : `Предложена сумма по заказу #${order.id}`}
                                </span>
                                <span className="text-xs text-gray-400">{order.serviceType}</span>
                              </div>
                              {isProposed && (
                                <span className="text-sm font-bold text-amber-700">{fmt(order.proposedAmount!)}</span>
                              )}
                            </div>
                            {isCancelRequest && order.cancelReason && (
                              <p className="text-xs text-red-600 bg-white rounded-lg px-3 py-1.5">
                                <span className="font-medium">Причина: </span>{order.cancelReason}
                              </p>
                            )}
                            {isCancelRequest && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => approveCancellationMutation.mutate(order.id)}
                                  disabled={approveCancellationMutation.isPending}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500 text-white hover:bg-red-600 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                                >
                                  {approveCancellationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                  Подтвердить отмену
                                </button>
                                <button
                                  onClick={() => rejectCancellationMutation.mutate(order.id)}
                                  disabled={rejectCancellationMutation.isPending}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                                >
                                  {rejectCancellationMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                  Отклонить
                                </button>
                              </div>
                            )}
                            {isProposed && (
                              editAmountId === order.id ? (
                                <div className="flex gap-2 items-center">
                                  <input
                                    type="number"
                                    value={editAmountValue}
                                    onChange={e => setEditAmountValue(e.target.value)}
                                    className="flex-1 border border-amber-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                                    placeholder="Введите сумму"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => setAmountMutation.mutate({ orderId: order.id, amount: Number(editAmountValue) })}
                                    disabled={setAmountMutation.isPending || !editAmountValue}
                                    className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                                  >
                                    {setAmountMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Сохранить"}
                                  </button>
                                  <button onClick={() => { setEditAmountId(null); setEditAmountValue(""); }} className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50 transition-colors">
                                    Отмена
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => acceptProposedMutation.mutate(order.id)}
                                    disabled={acceptProposedMutation.isPending}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-500 text-white hover:bg-green-600 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                                  >
                                    {acceptProposedMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    Принять сумму
                                  </button>
                                  <button
                                    onClick={() => { setEditAmountId(order.id); setEditAmountValue(String(order.proposedAmount)); }}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-xs transition-colors"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    Изменить
                                  </button>
                                </div>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Photo preview bar */}
                  {photoPreview && (
                    <div className="px-4 pt-3 flex items-center gap-3 border-t border-gray-50">
                      <div className="relative inline-block">
                        <img src={photoPreview} alt="preview" className="h-16 w-16 rounded-xl object-cover border border-gray-200" />
                        <button
                          onClick={clearPhoto}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-900 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">{photoFile?.name}</p>
                    </div>
                  )}

                  {/* Reply input */}
                  <div className="px-4 py-3.5 border-t border-gray-50 flex-shrink-0">
                    {/* Quick replies panel */}
                    {showQuickReplies && (
                      <div className="mb-2 bg-white border border-gray-200 rounded-2xl shadow-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Шаблоны ответов</p>
                          <button onClick={() => setShowQuickReplies(false)} className="text-gray-300 hover:text-gray-500">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {QUICK_REPLIES.map((qr, i) => (
                            <button
                              key={i}
                              onClick={() => { setReply(qr.text); setShowQuickReplies(false); }}
                              className="text-left px-2.5 py-2 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-100 hover:border-blue-200 rounded-xl text-[11px] text-gray-600 transition-colors"
                            >
                              <span className="font-semibold block text-[10px] text-gray-400 mb-0.5">{qr.label}</span>
                              <span className="line-clamp-1">{qr.text}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Emoji picker panel */}
                    {showEmojiPicker && (
                      <div ref={emojiPickerRef}
                        className="mb-2 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 max-h-52 overflow-y-auto">
                        {[
                          { label: "Часто используемые", emojis: ["😊","😂","🔥","👍","❤️","💪","✅","👌","🙏","🎉","😎","🤝","💯","⚡","🚀"] },
                          { label: "Работа", emojis: ["🔧","🪛","🔩","🛠️","🏠","💧","⚡","🔌","🪟","🚪","🪣","🧰","📋","📞","💰"] },
                          { label: "Эмоции", emojis: ["😀","😁","😅","🤔","😤","😬","🤦","🫡","🫠","😏","🥹","🫶","💪","🤜","✊"] },
                          { label: "Символы", emojis: ["✅","❌","⚠️","ℹ️","🔔","📍","🗓️","💬","📩","✉️","📌","🔑","💡","⏰","📊"] },
                        ].map(cat => (
                          <div key={cat.label} className="mb-2">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{cat.label}</p>
                            <div className="flex flex-wrap gap-1">
                              {cat.emojis.map(e => (
                                <button key={e} onClick={() => { setReply(r => r + e); setShowEmojiPicker(false); }}
                                  className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
                                  style={{ fontSize: 20, fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif' }}>
                                  {e}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      {/* Photo attach button */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoSelect}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Прикрепить фото"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>

                      {/* Quick replies button */}
                      <button
                        onClick={() => { setShowQuickReplies(v => !v); setShowEmojiPicker(false); }}
                        className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border transition-colors ${showQuickReplies ? "border-blue-300 bg-blue-50 text-blue-500" : "border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600"}`}
                        title="Шаблоны ответов"
                      >
                        <Zap className="w-4 h-4" />
                      </button>

                      {/* Emoji button */}
                      <button
                        onClick={() => { setShowEmojiPicker(v => !v); setShowQuickReplies(false); }}
                        className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border transition-colors ${showEmojiPicker ? "border-yellow-300 bg-yellow-50 text-yellow-500" : "border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600"}`}
                        title="Добавить эмодзи"
                      >
                        <Smile className="w-4 h-4" />
                      </button>

                      <textarea
                        value={reply}
                        onChange={e => setReply(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                        placeholder="Напишите ответ мастеру..."
                        rows={1}
                        className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-100 resize-none"
                        style={{ minHeight: 42, maxHeight: 120 }}
                      />

                      <button
                        onClick={sendReply}
                        disabled={(!reply.trim() && !photoFile) || sending || (!conv?.master.pwaLogin && !conv?.master.telegramId)}
                        className="flex-shrink-0 w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 disabled:opacity-40 transition-colors"
                        title={(!conv?.master.pwaLogin && !conv?.master.telegramId) ? "Мастер не подключён к приложению" : "Отправить"}
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Master card overlay — opens on top of chat */}
        {drawerMaster && (
          <MasterDrawer
            master={drawerMaster}
            columns={drawerColumns}
            onClose={() => setDrawerMaster(null)}
            onMasterUpdate={(id, data) => setDrawerMaster(prev => prev ? { ...prev, ...data } : prev)}
          />
        )}
        {chatPhotoLightbox && (
          <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4" onClick={() => setChatPhotoLightbox(null)}>
            <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
              <button onClick={() => setChatPhotoLightbox(null)} className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300">✕ Закрыть</button>
              <img src={chatPhotoLightbox} alt="Фото" className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
