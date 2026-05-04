import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  X, Phone, MapPin, MessageSquare, Star, Briefcase, AlertTriangle,
  User, Tag, Plus, CheckSquare, Square, Clock, Trash2, History,
  Send, Paperclip, Check, CheckCheck, Calendar, DollarSign, Loader2, CheckCircle2,
  ClipboardList, ExternalLink, ThumbsUp, ThumbsDown, Minus, Sparkles, MessageCircle,
  Smartphone, KeyRound, Eye, EyeOff, FlaskConical, ShieldCheck, ShieldAlert, FileSignature,
  ShieldBan, ShieldOff, CalendarCheck, XCircle, Pencil, Lock, Unlock,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

function resolvePhotoUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}

function PassportPhotoLink({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors cursor-pointer bg-transparent border-none p-0"
      >
        <Eye className="w-3 h-3" /> {label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-8 right-0 text-white text-sm font-medium hover:text-gray-300"
            >
              ✕ Закрыть
            </button>
            <p className="text-white text-xs mb-2 font-semibold">{label}</p>
            <img
              src={url}
              alt={label}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Checkin History Section ──────────────────────────────────────────────────

interface CheckinRecord {
  id: number;
  masterId: number;
  date: string;
  isAvailable: boolean | null;
  respondedAt: string | null;
}

function CheckinHistorySection({ masterId }: { masterId: number }) {
  const { data: checkins, isLoading } = useQuery<CheckinRecord[]>({
    queryKey: [`/api/masters/${masterId}/checkins`],
    queryFn: async () => {
      const res = await fetch(`/api/masters/${masterId}/checkins`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (isLoading) return null;
  if (!checkins || checkins.length === 0) return null;

  // Build last 30 days grid
  const today = new Date();
  const days: { date: string; status: "ready" | "not_ready" | "no_response" | "no_record" }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const record = checkins.find(c => c.date === dateStr);
    let status: (typeof days)[0]["status"] = "no_record";
    if (record) {
      if (record.respondedAt === null) status = "no_response";
      else if (record.isAvailable === true) status = "ready";
      else status = "not_ready";
    }
    days.push({ date: dateStr, status });
  }

  const counts = {
    ready:       days.filter(d => d.status === "ready").length,
    not_ready:   days.filter(d => d.status === "not_ready").length,
    no_response: days.filter(d => d.status === "no_response").length,
  };

  const colorMap: Record<string, string> = {
    ready:       "bg-green-500",
    not_ready:   "bg-red-400",
    no_response: "bg-amber-300",
    no_record:   "bg-gray-100",
  };

  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
        <CalendarCheck className="w-3 h-3" /> Готовность за 30 дней
      </p>

      {/* 30-day grid: 6 rows × 5 columns */}
      <div className="grid grid-cols-10 gap-0.5 mb-2">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.status === "ready" ? "Готов" : d.status === "not_ready" ? "Не готов" : d.status === "no_response" ? "Нет ответа" : "Нет рассылки"}`}
            className={`h-4 rounded-sm ${colorMap[d.status]}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 flex-shrink-0" /> Готов ({counts.ready})</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 flex-shrink-0" /> Не готов ({counts.not_ready})</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300 flex-shrink-0" /> Нет ответа ({counts.no_response})</span>
      </div>
    </div>
  );
}

// ─── Online status ─────────────────────────────────────────────────────────────
function getOnlineStatus(lastSeenAt?: string | null): { online: boolean; label: string } {
  if (!lastSeenAt) return { online: false, label: "Не заходил" };
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < 5 * 60_000) return { online: true, label: "Онлайн" };
  return {
    online: false,
    label: "Был " + formatDistanceToNow(new Date(lastSeenAt), { locale: ru, addSuffix: true }),
  };
}

export function OnlineBadge({ lastSeenAt, className = "" }: { lastSeenAt?: string | null; className?: string }) {
  const { online, label } = getOnlineStatus(lastSeenAt);
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${online ? "text-emerald-600" : "text-gray-400"} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${online ? "bg-emerald-500" : "bg-gray-300"}`} />
      {label}
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DrawerColumn { id: number; name: string; }
interface WorkingHours { start: string; end: string; days: number[]; }
const DAY_LABELS_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

export interface DrawerMaster {
  id: number; alias: string; city: string;
  specialization: string; specializations: string[]; tags: string[];
  telegramId: string | null; phone: string | null; status: string;
  rating: number; totalOrders: number; acceptedOrders: number; totalLeadsReceived?: number; paidOrdersCount?: number; debt: number;
  voronkaColumnId: number | null; isTestMaster: boolean;
  avatarUrl: string | null; activeOrders: any[]; createdAt: string;
  pwaLogin: string | null; contractLink: string | null;
  maxChatId?: string | null;
  workingHours?: WorkingHours | null;
  preferredDistricts?: string[];
  minArea?: number;
  contractSignedAt?: string | null;
  contractSignIp?: string | null;
  passportPhotoUrl?: string | null;
  passportRegPhotoUrl?: string | null;
  passportVerified?: boolean;
  passportVerifyNote?: string | null;
  contractFullName?: string | null;
  contractPassportNumber?: string | null;
  contractPassportDate?: string | null;
  contractPassportIssuer?: string | null;
  contractAddress?: string | null;
  lastSeenAt?: string | null;
  servicePrices?: { service: string; priceFrom: number }[] | null;
  fomoDisabled?: boolean;
  maxActiveOrders?: number;
}

interface MasterTask { id: number; masterId: number; text: string; dueAt: string | null; isCompleted: boolean; createdBy: string | null; createdAt: string; }
interface HistoryOrder { id: number; status: string; serviceType: string; district: string; city: string; leadId: number | null; clientName: string | null; clientPhone: string | null; scheduledAt: string | null; completedAt: string | null; createdAt: string; orderAmount: number | null; commission: number | null; paymentStatus: string | null; }
interface ChatMessage { id: number; text: string; photoUrl: string | null; fromMaster: boolean; senderName: string | null; isRead: boolean; createdAt: string; }
interface PendingTx { id: number; orderId: number; orderAmount: number; commission: number; prepaymentDeducted?: number; netPayable?: number; }
interface MasterReview { id: number; masterId: number; orderId: number | null; sentiment: string; text: string; createdBy: string | null; createdAt: string; }
type DrawerTab = "profile" | "chat" | "orders" | "tasks" | "reviews";

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["bg-blue-500","bg-purple-500","bg-emerald-500","bg-orange-500","bg-pink-500","bg-teal-500","bg-amber-500","bg-indigo-500"];

export function Avatar({ name, id, avatarUrl, size = 36 }: { name: string; id: number; avatarUrl?: string | null; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const bg = AVATAR_COLORS[id % AVATAR_COLORS.length];

  if (avatarUrl && !imgFailed) {
    return (
      <img src={avatarUrl} alt={name}
        className="rounded-full object-cover flex-shrink-0 border border-gray-100"
        style={{ width: size, height: size }}
        onError={() => setImgFailed(true)} />
    );
  }
  return (
    <div className={`${bg} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {initials}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(d: string) { try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ru }); } catch { return ""; } }
function ts(d: string) { try { return format(new Date(d), "HH:mm", { locale: ru }); } catch { return ""; } }
function dateShort(d: string | null) { if (!d) return "—"; try { return format(new Date(d), "d MMM yyyy", { locale: ru }); } catch { return "—"; } }

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    assigned: "bg-amber-100 text-amber-700",
    waiting_master: "bg-amber-100 text-amber-700",
    master_assigned: "bg-blue-100 text-blue-800",
    in_progress: "bg-indigo-100 text-indigo-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-gray-100 text-gray-500",
    cancellation_requested: "bg-orange-100 text-orange-700",
    on_site: "bg-yellow-100 text-yellow-700",
    awaiting_estimate: "bg-purple-100 text-purple-700",
    awaiting_payment: "bg-violet-100 text-violet-700",
  };
  const labels: Record<string, string> = {
    new: "Новый",
    assigned: "Назначен",
    waiting_master: "Ожидает мастера",
    master_assigned: "Назначен мастер",
    in_progress: "В работе",
    completed: "Завершён",
    cancelled: "Отменён",
    cancellation_requested: "Запрос на отмену",
    on_site: "На объекте",
    awaiting_estimate: "Ожидает смету",
    awaiting_payment: "Ожидает оплату",
  };
  return (
    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function RatingEditor({ masterId, rating, onSaved }: { masterId: number; rating: number; onSaved: (r: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const current = Math.round(rating);

  const save = async (val: number) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/masters/${masterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating: val }),
      });
      if (r.ok) onSaved(val);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {[1,2,3,4,5].map(i => (
          <button
            key={i}
            title={`Поставить ${i}`}
            disabled={saving}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => save(i)}
            className="p-0.5 transition-transform hover:scale-125 disabled:opacity-50"
          >
            <Star className={`w-3.5 h-3.5 ${i <= (hover ?? current) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
          </button>
        ))}
      </div>
      <span className="text-sm text-gray-600 font-medium">{rating.toFixed(1)}</span>
      {saving && <span className="text-xs text-muted-foreground">...</span>}
    </div>
  );
}

// ─── Master Drawer ────────────────────────────────────────────────────────────

export function MasterDrawer({ master, columns = [], onClose, onMasterUpdate }: {
  master: DrawerMaster;
  columns?: DrawerColumn[];
  onClose: () => void;
  onMasterUpdate: (id: number, data: Partial<DrawerMaster>) => void;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<DrawerTab>("profile");

  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(master.tags ?? []);
  const [savingTags, setSavingTags] = useState(false);

  const [tasks, setTasks] = useState<MasterTask[]>([]);
  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  interface SystemTask { id: number; title: string; status: string; priority: string; dueAt: string | null; assignedTo: string | null; }
  const [systemTasks, setSystemTasks] = useState<SystemTask[]>([]);

  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<PendingTx[]>([]);

  // Derived: has the master sent a payment proof screenshot?
  const paymentProofMsg = [...chatMessages].reverse().find(
    m => m.fromMaster && m.photoUrl && m.text?.includes("Скриншот оплаты")
  );
  const hasPaymentProof = !!paymentProofMsg;
  const paymentProofUrl = paymentProofMsg?.photoUrl ?? null;


  const [reviews, setReviews] = useState<MasterReview[]>([]);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [reviewSentiment, setReviewSentiment] = useState<"positive" | "negative" | "neutral">("positive");
  const [addingReview, setAddingReview] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [confirmingTx, setConfirmingTx] = useState(false);
  const [showActivatePopover, setShowActivatePopover] = useState(false);
  const [activatingContract, setActivatingContract] = useState(false);
  const [markingExternal, setMarkingExternal] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput]   = useState(master.phone ?? "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [verifyingPassport, setVerifyingPassport] = useState(false);
  const [verifyNote, setVerifyNote] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [pwaLogin, setPwaLogin] = useState(master.pwaLogin ?? "");
  const [pwaPassword, setPwaPassword] = useState("");

  const [editingPrices, setEditingPrices] = useState(false);
  const [priceRows, setPriceRows] = useState<{ service: string; priceFrom: string }[]>([]);
  const [savingPrices, setSavingPrices] = useState(false);
  const [showPwaPass, setShowPwaPass] = useState(false);
  const [savingPwa, setSavingPwa] = useState(false);
  const [resettingPwa, setResettingPwa] = useState(false);
  const [resettingPwaToPhone, setResettingPwaToPhone] = useState(false);

  interface MaxBotLog { id: number; maxUserId: string | null; event: string; note: string | null; createdAt: string; }
  const [maxLogs, setMaxLogs] = useState<MaxBotLog[]>([]);
  const [maxLogsLoaded, setMaxLogsLoaded] = useState(false);
  const [unlinkingMax, setUnlinkingMax] = useState(false);

  const loadMaxLogs = () => {
    fetch(`/api/masters/${master.id}/max-logs`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setMaxLogs(Array.isArray(d) ? d : []); setMaxLogsLoaded(true); });
  };

  const unlinkMax = async () => {
    if (!confirm("Отвязать аккаунт Max? Мастер перестанет получать уведомления через Max.")) return;
    setUnlinkingMax(true);
    try {
      const r = await fetch(`/api/masters/${master.id}/max-link`, { method: "DELETE", credentials: "include" });
      if (r.ok) {
        onMasterUpdate(master.id, { maxChatId: null });
        loadMaxLogs();
      }
    } finally {
      setUnlinkingMax(false);
    }
  };

  // ── Save phone ────────────────────────────────────────────────────────────
  const savePhone = async () => {
    const trimmed = phoneInput.trim();
    if (!trimmed) return;
    setSavingPhone(true);
    try {
      const r = await fetch(`/api/masters/${master.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Ошибка");
      onMasterUpdate(master.id, { phone: trimmed });
      setEditingPhone(false);
    } catch (e: any) {
      alert(e.message ?? "Не удалось сохранить номер");
    } finally {
      setSavingPhone(false);
    }
  };

  // ── Test order modal ──────────────────────────────────────────────────────
  const [showTestOrderModal, setShowTestOrderModal] = useState(false);
  const [testOrderForm, setTestOrderForm] = useState({
    serviceType: master.specializations[0] ?? "",
    area: "",
    district: "",
    scheduledAt: "",
    comment: "",
  });
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [sendingTestOrder, setSendingTestOrder] = useState(false);

  useEffect(() => {
    fetch("/api/settings/services")
      .then(r => r.ok ? r.json() : [])
      .then((d: { id: number; name: string }[]) => setAvailableServices(d.map(s => s.name)))
      .catch(() => {});
  }, []);

  const submitTestOrder = async () => {
    if (!testOrderForm.serviceType || !testOrderForm.area) return;
    setSendingTestOrder(true);
    try {
      const r = await fetch("/api/dispatch/test-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          masterId: master.id,
          serviceType: testOrderForm.serviceType,
          area: parseFloat(testOrderForm.area),
          city: master.city,
          district: testOrderForm.district || undefined,
          scheduledAt: testOrderForm.scheduledAt || undefined,
          comment: testOrderForm.comment || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Ошибка");
      setShowTestOrderModal(false);
      setTestOrderForm({ serviceType: master.specializations[0] ?? "", area: "", district: "", scheduledAt: "", comment: "" });
      alert(`Тестовый заказ #${data.orderId} отправлен мастеру ${master.alias}`);
    } catch (e: any) {
      alert(e.message ?? "Ошибка отправки");
    } finally {
      setSendingTestOrder(false);
    }
  };

  const resetPwaAccess = async () => {
    if (!confirm(`Сбросить PWA-доступ для ${master.alias}? Мастер сможет заново зарегистрироваться через приложение.`)) return;
    setResettingPwa(true);
    try {
      const r = await fetch(`/api/masters/${master.id}/reset-pwa`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Ошибка");
      onMasterUpdate(master.id, { pwaLogin: null });
      setPwaLogin("");
      setPwaPassword("");
    } catch (e: any) {
      alert(e.message ?? "Ошибка сброса");
    } finally {
      setResettingPwa(false);
    }
  };

  const savePwaCredentials = async () => {
    if (!pwaLogin.trim() || !pwaPassword.trim()) return;
    setSavingPwa(true);
    try {
      const r = await fetch(`/api/master-pwa/admin/set-credentials/${master.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login: pwaLogin.trim(), password: pwaPassword.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Ошибка");
      // Server normalizes the login (e.g. +7 (918)... → 79184...), use the actual stored value
      const savedLogin = data.login ?? pwaLogin.trim();
      onMasterUpdate(master.id, { pwaLogin: savedLogin });
      setPwaLogin(savedLogin);
      setPwaPassword("");
      alert(`Доступ к МастерApp сохранён.\nЛогин: ${savedLogin}`);
    } catch (e: any) {
      alert(e.message ?? "Ошибка");
    } finally {
      setSavingPwa(false);
    }
  };

  // Reset when master changes
  useEffect(() => {
    setTags(master.tags ?? []);
    setPwaLogin(master.pwaLogin ?? "");
    setPwaPassword("");
    setTab("profile");
    setOrders([]); setOrdersLoaded(false);
    setChatMessages([]); setChatLoaded(false); setPendingTxs([]);
    setReviews([]); setReviewsLoaded(false); setAiRecommendation(null);
    setReviewText(""); setReviewSentiment("positive");
    setMaxLogs([]); setMaxLogsLoaded(false);
  }, [master.id]);

  useEffect(() => {
    if (tab === "profile" && !maxLogsLoaded) loadMaxLogs();
    if (tab === "tasks") {
      fetch(`/api/masters/${master.id}/tasks`, { credentials: "include" }).then(r => r.json()).then(setTasks);
      fetch(`/api/tasks?relatedMasterId=${master.id}`, { credentials: "include" }).then(r => r.json()).then(d => setSystemTasks(Array.isArray(d) ? d : []));
    }
    if (tab === "orders" && !ordersLoaded) {
      fetch(`/api/masters/${master.id}/orders`).then(r => r.json()).then(d => { setOrders(d); setOrdersLoaded(true); });
    }
    if (tab === "chat" && !chatLoaded) loadChat();
    if (tab === "reviews" && !reviewsLoaded) {
      fetch(`/api/master-reviews/${master.id}`, { credentials: "include" })
        .then(r => r.json()).then(d => { setReviews(Array.isArray(d) ? d : []); setReviewsLoaded(true); });
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "chat") chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, tab]);

  const loadChat = async () => {
    const r = await fetch(`/api/master-chat/${master.id}`);
    if (r.ok) {
      const data = await r.json();
      setChatMessages(data.messages ?? []);
      setPendingTxs(data.pendingTransactions ?? []);
      setChatLoaded(true);
      await fetch(`/api/master-chat/${master.id}/read`, { method: "PATCH" });
    }
  };

  const confirmPayment = async (txId: number) => {
    setConfirmingTx(true);
    try {
      const r = await fetch(`/api/finance/transactions/${txId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ paymentStatus: "paid" }),
      });
      if (r.ok) {
        setPendingTxs(p => p.filter(t => t.id !== txId));
      }
    } finally {
      setConfirmingTx(false);
    }
  };

  const activateManually = async () => {
    setActivatingContract(true);
    try {
      const r = await fetch(`/api/masters/${master.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "active" }),
      });
      if (r.ok) {
        onMasterUpdate(master.id, { status: "active" });
        setShowActivatePopover(false);
      }
    } finally {
      setActivatingContract(false);
    }
  };

  const handleSuspend = async () => {
    const isSuspended = master.status === "suspended";
    const confirmMsg = isSuspended
      ? `Разблокировать мастера ${master.alias}? Он снова сможет получать заказы.`
      : `Заблокировать мастера ${master.alias}? Он потеряет доступ к приложению и не сможет получать заказы.`;
    if (!confirm(confirmMsg)) return;
    setSuspending(true);
    try {
      const newStatus = isSuspended ? "active" : "suspended";
      const r = await fetch(`/api/masters/${master.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (r.ok) {
        const updated = await r.json();
        onMasterUpdate(master.id, { status: newStatus, voronkaColumnId: updated.voronkaColumnId });
      }
    } finally {
      setSuspending(false);
    }
  };

  const [togglingFomo, setTogglingFomo] = useState(false);
  const handleToggleFomo = async () => {
    const isDisabled = master.fomoDisabled ?? false;
    const confirmMsg = isDisabled
      ? `Включить ФОМО-блокировку для ${master.alias}? Если есть просроченные условия — он снова будет заблокирован.`
      : `Снять ФОМО-блокировку для ${master.alias}? Он сможет откликаться на заказы независимо от просроченных смет.`;
    if (!confirm(confirmMsg)) return;
    setTogglingFomo(true);
    try {
      const r = await fetch(`/api/masters/${master.id}/toggle-fomo`, {
        method: "POST",
        credentials: "include",
      });
      if (r.ok) {
        const { fomoDisabled } = await r.json();
        onMasterUpdate(master.id, { fomoDisabled });
      }
    } finally {
      setTogglingFomo(false);
    }
  };

  const [togglingMaxOrders, setTogglingMaxOrders] = useState(false);
  const handleToggleMaxOrders = async () => {
    const current = master.maxActiveOrders ?? 1;
    const next = current >= 2 ? 1 : 2;
    const confirmMsg = next === 2
      ? `Разрешить ${master.alias} брать до 2 заказов одновременно?`
      : `Вернуть ${master.alias} стандартный лимит (1 заказ одновременно)?`;
    if (!confirm(confirmMsg)) return;
    setTogglingMaxOrders(true);
    try {
      const r = await fetch(`/api/masters/${master.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxActiveOrders: next }),
      });
      if (r.ok) {
        onMasterUpdate(master.id, { maxActiveOrders: next });
      }
    } finally {
      setTogglingMaxOrders(false);
    }
  };

  const markContractExternal = async (source: "okidoki" | "paper") => {
    setMarkingExternal(true);
    try {
      const r = await fetch(`/api/masters/${master.id}/mark-contract-external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ source }),
      });
      if (r.ok) {
        const updated = await r.json();
        onMasterUpdate(master.id, {
          status: "active",
          contractSignedAt: updated.contractSignedAt,
          passportVerified: updated.passportVerified,
          passportVerifyNote: updated.passportVerifyNote,
          voronkaColumnId: updated.voronkaColumnId,
        });
        setShowActivatePopover(false);
      }
    } finally {
      setMarkingExternal(false);
    }
  };

  const verifyPassportManually = async (verified: boolean) => {
    const note = verifyNote.trim();
    if (!verified && !note) {
      const reason = window.prompt("Причина отклонения (необязательно):");
      if (reason !== null) setVerifyNote(reason);
    }
    setVerifyingPassport(true);
    try {
      const r = await fetch(`/api/masters/${master.id}/verify-passport`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ verified, note: verifyNote.trim() || undefined }),
      });
      if (r.ok) {
        const updated = await r.json();
        onMasterUpdate(master.id, {
          passportVerified: updated.passportVerified,
          passportVerifyNote: updated.passportVerifyNote,
          status: updated.status,
          voronkaColumnId: updated.voronkaColumnId,
        });
        setVerifyNote("");
      }
    } finally {
      setVerifyingPassport(false);
    }
  };

  const addTag = async (tag: string) => {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next); setTagInput(""); setSavingTags(true);
    await fetch(`/api/masters/${master.id}/tags`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: next }) });
    setSavingTags(false);
    onMasterUpdate(master.id, { tags: next });
  };
  const removeTag = async (tag: string) => {
    const next = tags.filter(t => t !== tag);
    setTags(next); setSavingTags(true);
    await fetch(`/api/masters/${master.id}/tags`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: next }) });
    setSavingTags(false);
    onMasterUpdate(master.id, { tags: next });
  };

  const createTask = async () => {
    if (!taskText.trim()) return;
    setAddingTask(true);
    const r = await fetch(`/api/masters/${master.id}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: taskText.trim(), dueAt: taskDue || null }),
    });
    if (r.ok) { const t = await r.json(); setTasks(p => [...p, t]); setTaskText(""); setTaskDue(""); }
    setAddingTask(false);
  };
  const toggleTask = async (task: MasterTask) => {
    const r = await fetch(`/api/masters/${master.id}/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted: !task.isCompleted }),
    });
    if (r.ok) { const t = await r.json(); setTasks(p => p.map(x => x.id === t.id ? t : x)); }
  };
  const deleteTask = async (id: number) => {
    await fetch(`/api/masters/${master.id}/tasks/${id}`, { method: "DELETE" });
    setTasks(p => p.filter(t => t.id !== id));
  };

  const addReview = async () => {
    if (!reviewText.trim()) return;
    setAddingReview(true);
    const r = await fetch("/api/master-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ masterId: master.id, sentiment: reviewSentiment, text: reviewText.trim() }),
    });
    if (r.ok) {
      const rev = await r.json();
      setReviews(p => [rev, ...p]);
      setReviewText("");
      setAiRecommendation(null);
    }
    setAddingReview(false);
  };

  const deleteReview = async (id: number) => {
    await fetch(`/api/master-reviews/${id}`, { method: "DELETE", credentials: "include" });
    setReviews(p => p.filter(r => r.id !== id));
    setAiRecommendation(null);
  };

  const loadAiRecommendation = async () => {
    setLoadingAi(true);
    setAiRecommendation(null);
    const r = await fetch(`/api/master-reviews/${master.id}/ai-recommendation`, { credentials: "include" });
    if (r.ok) {
      const data = await r.json();
      setAiRecommendation(data.recommendation ?? "Нет данных.");
    } else {
      setAiRecommendation("Не удалось получить рекомендацию. Попробуйте позже.");
    }
    setLoadingAi(false);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const clearPhoto = () => { setPhotoFile(null); setPhotoPreview(null); };
  const sendReply = async () => {
    if ((!reply.trim() && !photoFile) || sending || !master.telegramId) return;
    setSending(true);
    const form = new FormData();
    if (reply.trim()) form.append("text", reply.trim());
    form.append("operatorName", user?.name ?? "Оператор");
    if (photoFile) form.append("photo", photoFile);
    const r = await fetch(`/api/master-chat/${master.id}/reply`, { method: "POST", body: form });
    if (r.ok) { setReply(""); clearPhoto(); await loadChat(); }
    setSending(false);
  };

  const TABS: { id: DrawerTab; label: string; icon: any }[] = [
    { id: "profile", label: "Профиль",   icon: User },
    { id: "chat",    label: "Чат",       icon: MessageSquare },
    { id: "orders",  label: "Заказы",    icon: History },
    { id: "tasks",   label: "Задачи",    icon: CheckSquare },
    { id: "reviews", label: "Отзывы",   icon: MessageCircle },
  ];

  const colName = columns.find(c => c.id === master.voronkaColumnId)?.name ?? (master.voronkaColumnId ? "Колонка" : "Без колонки");

  return (
    <>
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30 backdrop-blur-[2px]" />
      <div className="w-full sm:w-[420px] bg-white flex flex-col shadow-2xl border-l border-gray-100 h-full overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <Avatar name={master.alias} id={master.id} avatarUrl={master.avatarUrl} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-gray-800 text-[15px]">{master.alias}</p>
              {master.isTestMaster && <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-semibold">ТЕСТ</span>}
              {master.status === "suspended" && <span className="text-[10px] bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 font-semibold">Отстранён</span>}
              {master.status === "pending_contract" && (
                <div className="relative">
                  <button
                    onClick={() => setShowActivatePopover(v => !v)}
                    className="text-[10px] bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5 font-semibold hover:bg-amber-200 transition-colors cursor-pointer"
                  >
                    Ожидает договора ▾
                  </button>
                  {showActivatePopover && (
                    <div className="absolute left-0 top-6 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-2.5 w-56 space-y-1.5">
                      {master.contractSignedAt && (
                        <a
                          href={`/api/contract/view/${master.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-md px-2 py-1 transition-colors"
                        >
                          Открыть договор
                        </a>
                      )}
                      <p className="text-[9px] text-gray-400 uppercase tracking-wide px-0.5 pt-0.5">Договор подписан вне системы:</p>
                      <button
                        onClick={() => markContractExternal("okidoki")}
                        disabled={markingExternal}
                        className="w-full flex items-center justify-center gap-1 bg-violet-500 hover:bg-violet-600 text-white text-[10px] font-semibold rounded-md px-2 py-1.5 transition-colors disabled:opacity-60"
                      >
                        {markingExternal
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <FileSignature className="w-2.5 h-2.5" />}
                        Через ОкиДоки
                      </button>
                      <button
                        onClick={() => markContractExternal("paper")}
                        disabled={markingExternal}
                        className="w-full flex items-center justify-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-semibold rounded-md px-2 py-1.5 transition-colors disabled:opacity-60"
                      >
                        {markingExternal
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <FileSignature className="w-2.5 h-2.5" />}
                        На бумаге
                      </button>
                      <div className="border-t border-gray-100 pt-1">
                        <button
                          onClick={activateManually}
                          disabled={activatingContract}
                          className="w-full flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-semibold rounded-md px-2 py-1 transition-colors disabled:opacity-60"
                        >
                          {activatingContract
                            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            : <CheckCircle2 className="w-2.5 h-2.5" />}
                          Активировать (без договора)
                        </button>
                      </div>
                      <button
                        onClick={() => setShowActivatePopover(false)}
                        className="w-full text-center text-[9px] text-gray-400 hover:text-gray-600 py-0.5"
                      >
                        Отмена
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-400">{colName} · {master.city}</p>
              {master.pwaLogin && <OnlineBadge lastSeenAt={master.lastSeenAt} />}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors ${
                tab === t.id ? "text-blue-600 border-b-2 border-blue-500" : "text-gray-400 hover:text-gray-600"
              }`}>
              <t.icon className="w-3.5 h-3.5 flex-shrink-0" />{t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* PROFILE */}
          {tab === "profile" && (
            <div className="p-5 space-y-5">
              <div className="space-y-3">
                <Row icon={<Phone className="w-4 h-4 text-gray-400" />} label="Телефон">
                  {editingPhone ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="tel"
                        value={phoneInput}
                        onChange={e => setPhoneInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") savePhone(); if (e.key === "Escape") setEditingPhone(false); }}
                        autoFocus
                        placeholder="+7 (999) 999-99-99"
                        className="flex-1 text-sm border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button onClick={savePhone} disabled={savingPhone}
                        className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                        {savingPhone ? <Loader2 className="w-3 h-3 animate-spin" /> : "Сохранить"}
                      </button>
                      <button onClick={() => { setEditingPhone(false); setPhoneInput(master.phone ?? ""); }}
                        className="px-2 py-1 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50">
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {master.phone
                        ? <a href={`tel:${master.phone}`} className="text-blue-600 font-medium hover:underline text-sm">{master.phone}</a>
                        : <span className="text-gray-300 text-sm">Не указан</span>}
                      <button onClick={() => { setPhoneInput(master.phone ?? ""); setEditingPhone(true); }}
                        className="text-gray-400 hover:text-gray-700 transition-colors" title="Изменить номер">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </Row>
                <Row icon={<MapPin className="w-4 h-4 text-gray-400" />} label="Город">
                  <span className="text-gray-700 text-sm">{master.city}</span>
                </Row>
                <Row icon={<Smartphone className="w-4 h-4 text-gray-400" />} label="Приложение">
                  {master.pwaLogin
                    ? <span className="text-emerald-600 text-sm font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>Подключён</span>
                    : <span className="text-gray-300 text-sm">Не подключён</span>}
                </Row>
                <Row icon={<Star className="w-4 h-4 text-yellow-400" />} label="Рейтинг">
                  <RatingEditor masterId={master.id} rating={master.rating} onSaved={(r) => onMasterUpdate(master.id, { rating: r })} />
                </Row>
                <Row icon={<Briefcase className="w-4 h-4 text-gray-400" />} label="Заказы">
                  <span className="text-gray-700 text-sm">{master.totalOrders} всего · {master.acceptedOrders} принято</span>
                </Row>
                {(() => {
                  const taken = master.acceptedOrders ?? 0;
                  const paid = master.paidOrdersCount ?? 0;
                  const pct = taken >= 5 ? Math.round((paid / taken) * 100) : null;
                  const color = pct === null ? "text-gray-400" : pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-blue-600" : pct >= 30 ? "text-yellow-600" : "text-red-500";
                  const priority = pct === null ? "< 5 заказов" : pct >= 80 ? "Приоритет 1 🔥" : pct >= 60 ? "Приоритет 2" : pct >= 30 ? "Приоритет 3" : "Приоритет 4";
                  return (
                    <Row icon={<span className="text-sm">📊</span>} label="Конверсия">
                      <span className={`text-sm font-medium ${color}`}>
                        {pct !== null ? `${pct}%` : "—"}&nbsp;
                        <span className="text-gray-400 font-normal">({paid} из {taken} взятых) · {priority}</span>
                      </span>
                    </Row>
                  );
                })()}
                {master.debt > 0 && (
                  <Row icon={<AlertTriangle className="w-4 h-4 text-red-400" />} label="Долг">
                    <span className="text-red-600 font-semibold text-sm">{master.debt.toLocaleString("ru")} ₽</span>
                  </Row>
                )}
              </div>

              {master.specializations.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Специальности</p>
                  <div className="flex flex-wrap gap-1.5">
                    {master.specializations.map(s => (
                      <span key={s} className="text-xs bg-blue-50 text-blue-700 rounded-lg px-2.5 py-1 font-medium">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Цены на услуги</p>
                  {!editingPrices && (
                    <button
                      onClick={() => {
                        const rows = (master.servicePrices ?? []).map(p => ({ service: p.service, priceFrom: String(p.priceFrom) }));
                        setPriceRows(rows.length > 0 ? rows : [{ service: "", priceFrom: "" }]);
                        setEditingPrices(true);
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {(master.servicePrices ?? []).length > 0 ? "Изменить" : "+ Добавить цены"}
                    </button>
                  )}
                </div>

                {editingPrices ? (
                  <div className="space-y-2">
                    {priceRows.map((row, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          value={row.service}
                          onChange={e => setPriceRows(r => r.map((x, j) => j === i ? { ...x, service: e.target.value } : x))}
                          placeholder="Услуга"
                          className="flex-1 h-8 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <input
                          value={row.priceFrom}
                          onChange={e => setPriceRows(r => r.map((x, j) => j === i ? { ...x, priceFrom: e.target.value.replace(/\D/g, "") } : x))}
                          placeholder="от ₽"
                          className="w-24 h-8 px-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                          onClick={() => setPriceRows(r => r.filter((_, j) => j !== i))}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setPriceRows(r => [...r, { service: "", priceFrom: "" }])}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Добавить строку
                    </button>
                    <div className="flex gap-2 pt-1">
                      <button
                        disabled={savingPrices}
                        onClick={async () => {
                          setSavingPrices(true);
                          const servicePrices = priceRows
                            .filter(r => r.service.trim() && Number(r.priceFrom) > 0)
                            .map(r => ({ service: r.service.trim(), priceFrom: Number(r.priceFrom) }));
                          try {
                            const res = await fetch(`/api/masters/${master.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({ servicePrices }),
                            });
                            if (!res.ok) throw new Error();
                            onMasterUpdate(master.id, { servicePrices });
                            setEditingPrices(false);
                          } catch {
                            alert("Ошибка сохранения");
                          } finally {
                            setSavingPrices(false);
                          }
                        }}
                        className="h-7 px-3 bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 flex items-center gap-1"
                      >
                        {savingPrices ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Сохранить
                      </button>
                      <button
                        onClick={() => setEditingPrices(false)}
                        className="h-7 px-3 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (master.servicePrices ?? []).length > 0 ? (
                  <div className="space-y-1.5">
                    {(master.servicePrices ?? []).map(p => (
                      <div key={p.service} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg">
                        <span className="text-xs text-gray-700">{p.service}</span>
                        <span className="text-xs font-semibold text-gray-900">от {p.priceFrom.toLocaleString("ru")} ₽</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Цены не указаны</p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Теги
                </p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 rounded-lg px-2 py-0.5 font-medium">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors ml-0.5">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  {tags.length === 0 && <span className="text-xs text-gray-300">Нет тегов</span>}
                </div>
                <div className="flex gap-2">
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                    placeholder="Добавить тег..."
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-violet-100 bg-gray-50" />
                  <button onClick={() => addTag(tagInput)} disabled={!tagInput.trim() || savingTags}
                    className="px-3 py-1.5 bg-violet-500 text-white rounded-lg text-xs font-medium hover:bg-violet-600 disabled:opacity-40 transition-colors">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* App Preferences — shown only if master has configured them */}
              {((master.workingHours) || (master.preferredDistricts && master.preferredDistricts.length > 0) || (master.minArea && master.minArea > 0)) && (
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Настройки в приложении
                  </p>

                  {master.workingHours && (
                    <div className="bg-blue-50 rounded-xl px-3 py-2.5 space-y-1.5">
                      <p className="text-[10px] font-semibold text-blue-700 uppercase">Рабочие часы</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{master.workingHours.start} — {master.workingHours.end}</span>
                      </div>
                      <div className="flex gap-1">
                        {DAY_LABELS_SHORT.map((label, i) => {
                          const day = i + 1;
                          const active = master.workingHours!.days.includes(day);
                          return (
                            <span key={day} className={`text-[9px] font-bold rounded px-1 py-0.5 ${active ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-400"}`}>
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {master.preferredDistricts && master.preferredDistricts.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Предпочтительные районы</p>
                      <div className="flex flex-wrap gap-1">
                        {master.preferredDistricts.map(d => (
                          <span key={d} className="text-[10px] bg-emerald-50 text-emerald-700 rounded-md px-2 py-0.5 font-medium">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {master.minArea && master.minArea > 0 ? (
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-xs text-gray-500">Мин. площадь заявки</span>
                      <span className="text-sm font-bold text-gray-800">от {master.minArea} м²</span>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="border-t border-gray-100 pt-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Smartphone className="w-3 h-3" /> МастерApp (PWA доступ)
                </p>
                {master.pwaLogin ? (
                  <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-green-50 border border-green-100 rounded-lg">
                    <KeyRound className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs text-green-700 font-medium">Логин: </span>
                      <span className="text-xs text-green-800 font-mono select-all">{master.pwaLogin}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="text-xs text-amber-700 font-medium">Нет доступа к приложению</span>
                    {master.phone && (
                      <button
                        type="button"
                        onClick={() => {
                          const digits = master.phone!.replace(/\D/g, "");
                          const login = digits.length === 10 ? "7" + digits
                            : digits.length === 11 && digits[0] === "8" ? "7" + digits.slice(1)
                            : digits;
                          setPwaLogin(login);
                          setPwaPassword(login);
                        }}
                        className="ml-auto text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline whitespace-nowrap"
                      >
                        Автозаполнить
                      </button>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Логин"
                      value={pwaLogin}
                      onChange={e => setPwaLogin(e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-100 bg-gray-50"
                    />
                    {master.phone && (
                      <button
                        type="button"
                        title="Заполнить из номера телефона"
                        onClick={() => {
                          const digits = master.phone!.replace(/\D/g, "");
                          const login = digits.length === 10 ? "7" + digits
                            : digits.length === 11 && digits[0] === "8" ? "7" + digits.slice(1)
                            : digits;
                          setPwaLogin(login);
                          if (!pwaPassword) setPwaPassword(login);
                        }}
                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPwaPass ? "text" : "password"}
                      placeholder="Новый пароль"
                      value={pwaPassword}
                      onChange={e => setPwaPassword(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 pr-8 outline-none focus:ring-2 focus:ring-blue-100 bg-gray-50"
                    />
                    <button type="button" onClick={() => setShowPwaPass(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwaPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    onClick={savePwaCredentials}
                    disabled={!pwaLogin.trim() || !pwaPassword.trim() || savingPwa}
                    className="w-full py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                  >
                    {savingPwa ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                    {master.pwaLogin ? "Обновить доступ" : "Выдать доступ"}
                  </button>
                  {master.pwaLogin && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={async () => {
                          if (!confirm(`Сбросить пароль мастера "${master.alias}" к номеру телефона?\n\nЛогин и пароль станут = ${master.pwaLogin}\n\nМастер сможет войти: Логин = ${master.pwaLogin}, Пароль = ${master.pwaLogin}`)) return;
                          setResettingPwaToPhone(true);
                          try {
                            const r = await fetch(`/api/master-pwa/admin/reset-password-to-phone/${master.id}`, { method: "POST", credentials: "include" });
                            const d = await r.json();
                            if (!r.ok) throw new Error(d.error ?? "Ошибка");
                            alert(`✓ ${d.message}\n\nСообщите мастеру:\nЛогин: ${d.login}\nПароль: ${d.login}`);
                          } catch (e: any) { alert(e.message ?? "Ошибка"); }
                          finally { setResettingPwaToPhone(false); }
                        }}
                        disabled={resettingPwaToPhone}
                        className="flex-1 py-1.5 border border-amber-200 text-amber-600 rounded-lg text-xs font-medium hover:bg-amber-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                        title="Сбросить пароль — логин и пароль станут равны номеру телефона"
                      >
                        {resettingPwaToPhone ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                        Пароль → телефон
                      </button>
                      <button
                        onClick={resetPwaAccess}
                        disabled={resettingPwa}
                        className="flex-1 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                        title="Полностью удалить логин и пароль мастера"
                      >
                        {resettingPwa ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3" />}
                        Удалить доступ
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Max Bot section */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> Max Бот
                </p>
                {master.maxChatId ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-green-700 font-medium">Подключён</p>
                        <p className="text-[10px] text-green-600">ID: {master.maxChatId}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!confirm("Сменить Max-аккаунт? Текущая привязка будет удалена. Мастер должен будет написать боту с нового номера.")) return;
                          await unlinkMax();
                          setTab("profile");
                          setPhoneInput(master.phone ?? "");
                          setEditingPhone(true);
                        }}
                        disabled={unlinkingMax}
                        className="flex-1 py-1.5 border border-amber-200 text-amber-600 rounded-lg text-xs font-medium hover:bg-amber-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                      >
                        <Phone className="w-3 h-3" />
                        Сменить аккаунт
                      </button>
                      <button
                        onClick={unlinkMax}
                        disabled={unlinkingMax}
                        className="flex-1 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs font-medium hover:bg-red-50 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                      >
                        {unlinkingMax ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                        Отвязать Max
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                      <p className="text-xs text-gray-500">Не подключён — мастер должен написать боту с нужного номера</p>
                    </div>
                    <button
                      onClick={() => { setTab("profile"); setPhoneInput(master.phone ?? ""); setEditingPhone(true); }}
                      className="w-full py-1.5 border border-blue-200 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
                    >
                      <Pencil className="w-3 h-3" /> Сменить номер телефона
                    </button>
                  </div>
                )}
                {maxLogsLoaded && maxLogs.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">История действий</p>
                    <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-gray-100 p-1">
                      {maxLogs.map(log => {
                        const labels: Record<string, { label: string; color: string }> = {
                          linked:           { label: "Привязан",             color: "text-green-600" },
                          confirm_pending:  { label: "Ожидает подтверждения", color: "text-amber-600" },
                          confirm_rejected: { label: "Отклонил привязку",    color: "text-orange-600" },
                          unlinked_bot:     { label: "Отвязал сам (бот)",    color: "text-red-500" },
                          unlinked_crm:     { label: "Отвязан оператором",   color: "text-red-600" },
                          not_found:        { label: "Не найден по номеру",  color: "text-gray-500" },
                          already_linked:   { label: "Уже был привязан",     color: "text-blue-500" },
                        };
                        const meta = labels[log.event] ?? { label: log.event, color: "text-gray-500" };
                        return (
                          <div key={log.id} className="flex items-start gap-2 px-2 py-1 hover:bg-gray-50 rounded">
                            <span className={`text-[10px] font-medium flex-shrink-0 mt-0.5 ${meta.color}`}>{meta.label}</span>
                            <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                              {format(new Date(log.createdAt), "d MMM HH:mm", { locale: ru })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Checkin history — last 30 days */}
              <CheckinHistorySection masterId={master.id} />

              {/* Test order button — shown only for test masters */}
              {master.isTestMaster && (
                <div className="border-t border-amber-100 pt-3">
                  <p className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <FlaskConical className="w-3 h-3" /> Тестирование
                  </p>
                  <button
                    onClick={() => setShowTestOrderModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm shadow-amber-200"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    Отправить тестовый заказ
                  </button>
                </div>
              )}

              {/* Block / Unblock */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <ShieldBan className="w-3 h-3" /> Доступ
                </p>
                {master.status === "suspended" ? (
                  <button
                    onClick={handleSuspend}
                    disabled={suspending}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {suspending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
                    Разблокировать мастера
                  </button>
                ) : (
                  <button
                    onClick={handleSuspend}
                    disabled={suspending}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {suspending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldBan className="w-3.5 h-3.5" />}
                    Заблокировать мастера
                  </button>
                )}
              </div>

              {/* Max active orders toggle */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Лимит заказов
                </p>
                <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">
                      {(master.maxActiveOrders ?? 1) >= 2 ? "До 2 заказов одновременно" : "1 заказ одновременно"}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {(master.maxActiveOrders ?? 1) >= 2
                        ? "Мастер может взять второй заказ не дожидаясь завершения первого"
                        : "Новый заказ только после сдачи текущего"}
                    </p>
                  </div>
                  <button
                    onClick={handleToggleMaxOrders}
                    disabled={togglingMaxOrders}
                    className={`ml-3 flex-shrink-0 relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 focus:outline-none ${
                      (master.maxActiveOrders ?? 1) >= 2 ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      (master.maxActiveOrders ?? 1) >= 2 ? "translate-x-5" : "translate-x-0"
                    }`} />
                  </button>
                </div>
              </div>

              {/* FOMO toggle */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> ФОМО-блокировка
                </p>
                {master.fomoDisabled ? (
                  <button
                    onClick={handleToggleFomo}
                    disabled={togglingFomo}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {togglingFomo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                    Включить ФОМО-блокировку
                  </button>
                ) : (
                  <button
                    onClick={handleToggleFomo}
                    disabled={togglingFomo}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {togglingFomo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                    Снять ФОМО-блокировку
                  </button>
                )}
                {master.fomoDisabled && (
                  <p className="text-[10px] text-orange-500 mt-1.5 text-center">Блокировка отключена — мастер может откликаться свободно</p>
                )}
              </div>

              {/* Contract & passport block */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2.5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <FileSignature className="w-3 h-3" /> Договор
                </p>
                {master.contractSignedAt ? (
                  <div className="space-y-2">
                    {/* Verification status + manual controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {master.passportVerified
                        ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        : <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <span className={`text-xs font-medium ${master.passportVerified ? "text-emerald-700" : "text-amber-700"}`}>
                        {master.passportVerified ? "Паспорт подтверждён" : "Требует проверки"}
                      </span>
                      {/* Manual verify / reject buttons */}
                      {!master.passportVerified && (
                        <button
                          onClick={() => verifyPassportManually(true)}
                          disabled={verifyingPassport}
                          className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-md px-2 py-1 transition-colors disabled:opacity-60"
                        >
                          {verifyingPassport ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ShieldCheck className="w-2.5 h-2.5" />}
                          Подтвердить
                        </button>
                      )}
                      {master.passportVerified && (
                        <button
                          onClick={() => verifyPassportManually(false)}
                          disabled={verifyingPassport}
                          className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-semibold rounded-md px-2 py-1 transition-colors disabled:opacity-60"
                        >
                          {verifyingPassport ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ShieldBan className="w-2.5 h-2.5" />}
                          Отклонить
                        </button>
                      )}
                    </div>
                    {master.passportVerifyNote && (
                      <p className="text-[11px] text-gray-400 leading-relaxed">{master.passportVerifyNote}</p>
                    )}
                    {/* Passport details filled by master */}
                    {(master.contractFullName || master.contractPassportNumber) && (
                      <div className="rounded-lg bg-white border border-gray-100 px-3 py-2 space-y-1">
                        {master.contractFullName && (
                          <p className="text-[11px]"><span className="text-gray-400">ФИО:</span> <span className="text-gray-700 font-medium">{master.contractFullName}</span></p>
                        )}
                        {master.contractPassportNumber && (
                          <p className="text-[11px]"><span className="text-gray-400">Паспорт:</span> <span className="text-gray-700">{master.contractPassportNumber}</span></p>
                        )}
                        {master.contractPassportDate && (
                          <p className="text-[11px]"><span className="text-gray-400">Выдан:</span> <span className="text-gray-700">{master.contractPassportDate}{master.contractPassportIssuer ? `, ${master.contractPassportIssuer}` : ""}</span></p>
                        )}
                        {master.contractAddress && (
                          <p className="text-[11px]"><span className="text-gray-400">Адрес:</span> <span className="text-gray-700">{master.contractAddress}</span></p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-gray-400">
                        Подписан: {format(new Date(master.contractSignedAt), "d MMM yyyy HH:mm", { locale: ru })}
                      </span>
                      {master.contractSignIp && (
                        <span className="text-[11px] text-gray-300">IP: {master.contractSignIp}</span>
                      )}
                    </div>
                    {/* Links: view PDF contract + passport photos */}
                    <div className="flex flex-wrap gap-3 items-center">
                      <a
                        href={`/api/contract/view/${master.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold px-2.5 py-1 rounded-md transition-colors"
                      >
                        <FileSignature className="w-3 h-3" /> Открыть договор
                      </a>
                      {master.passportPhotoUrl && (
                        <PassportPhotoLink url={master.passportPhotoUrl} label="Разворот с фото" />
                      )}
                      {master.passportRegPhotoUrl && (
                        <PassportPhotoLink url={master.passportRegPhotoUrl} label="Страница прописки" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Договор не подписан
                    </span>
                    <p className="text-[11px] text-gray-400">Если договор уже подписан вне системы — отметьте здесь:</p>
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => markContractExternal("okidoki")}
                        disabled={markingExternal}
                        className="flex items-center gap-1 bg-violet-100 hover:bg-violet-200 text-violet-700 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-60"
                      >
                        {markingExternal ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSignature className="w-3 h-3" />}
                        Подписан через ОкиДоки
                      </button>
                      <button
                        onClick={() => markContractExternal("paper")}
                        disabled={markingExternal}
                        className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-60"
                      >
                        {markingExternal ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSignature className="w-3 h-3" />}
                        На бумаге
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-gray-300 pt-2 border-t border-gray-50">
                Зарегистрирован: {dateShort(master.createdAt)}
              </div>
            </div>
          )}

          {/* CHAT */}
          {tab === "chat" && (
            <div className="flex flex-col h-full" style={{ height: "calc(100vh - 185px)" }}>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {!chatLoaded && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/></div>}
                {chatLoaded && chatMessages.length === 0 && <div className="text-center text-sm text-gray-300 mt-8">Нет сообщений</div>}
                {chatMessages.map(msg => {
                  // System event — centered gray pill
                  if (msg.senderName === "system") {
                    return (
                      <div key={msg.id} className="flex justify-center my-1">
                        <div className="flex items-center gap-1.5 bg-gray-100 text-gray-500 text-[10px] rounded-full px-3 py-1">
                          <span>{msg.text}</span>
                          <span className="text-gray-400 text-[9px]">{ts(msg.createdAt)}</span>
                        </div>
                      </div>
                    );
                  }

                  const isMaster = msg.fromMaster;
                  const senderLabel = msg.senderName ?? (isMaster ? master.alias : "Оператор");
                  return (
                    <div key={msg.id} className={`flex items-end gap-2 ${isMaster ? "justify-start" : "justify-end"}`}>
                      {/* Master avatar — left side */}
                      {isMaster && (
                        <div className="flex-shrink-0 self-end">
                          <Avatar name={master.alias} id={master.id} avatarUrl={master.avatarUrl} size={26} />
                        </div>
                      )}
                      {/* Bubble */}
                      <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${isMaster ? "bg-gray-100 text-gray-800 rounded-bl-sm" : "bg-blue-500 text-white rounded-br-sm"}`}>
                        <p className={`text-[10px] font-semibold mb-1 ${isMaster ? "text-gray-500" : "text-blue-100"}`}>
                          {senderLabel}
                        </p>
                        {msg.photoUrl && (
                          <a href={resolvePhotoUrl(msg.photoUrl)} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
                            <img src={resolvePhotoUrl(msg.photoUrl)} alt="фото" className="rounded-xl max-w-full max-h-40 object-cover" />
                          </a>
                        )}
                        {(() => { const t = (msg.text ?? "").replace(/^\[ИИ-диспетчер\]:\s*/, "").trim(); return t ? <p className="text-xs leading-relaxed whitespace-pre-wrap">{t}</p> : null; })()}
                        <div className={`flex items-center gap-1 mt-1 ${isMaster ? "justify-start" : "justify-end"}`}>
                          <span className={`text-[9px] ${isMaster ? "text-gray-400" : "text-blue-100"}`}>{ts(msg.createdAt)}</span>
                          {!isMaster && (msg.isRead ? <CheckCheck className="w-2.5 h-2.5 text-blue-200" /> : <Check className="w-2.5 h-2.5 text-blue-200" />)}
                        </div>
                      </div>
                      {/* Operator avatar — right side */}
                      {!isMaster && (
                        <div className="flex-shrink-0 self-end">
                          <Avatar name={senderLabel} id={0} size={26} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>
              {/* Commission payment receipt cards */}
              {pendingTxs.map(tx => (
                <div key={tx.id} className="mx-3 mb-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 space-y-2.5 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    <span className="text-xs font-semibold text-violet-800">Оплата комиссии по заказу #{tx.orderId}</span>
                  </div>
                  <div className="bg-white rounded-lg border border-violet-100 px-3 py-2 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Стоимость работ</span>
                      <span className="font-semibold text-gray-800">{tx.orderAmount.toLocaleString("ru-RU")} ₽</span>
                    </div>
                    <div className="border-t border-dashed border-gray-100" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Комиссия</span>
                      <span className="font-bold text-violet-700">{tx.commission.toLocaleString("ru-RU")} ₽</span>
                    </div>
                    {(tx.prepaymentDeducted ?? 0) > 0 && (
                      <>
                        <div className="border-t border-dashed border-gray-100" />
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500">Зачтена предоплата</span>
                          <span className="font-semibold text-emerald-600">−{(tx.prepaymentDeducted ?? 0).toLocaleString("ru-RU")} ₽</span>
                        </div>
                        <div className="border-t border-dashed border-gray-100" />
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-500 font-semibold">К оплате мастером</span>
                          <span className="font-bold text-violet-900">{(tx.netPayable ?? tx.commission).toLocaleString("ru-RU")} ₽</span>
                        </div>
                      </>
                    )}
                    <div className="border-t border-dashed border-gray-100" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Реквизиты</span>
                      <span className="font-mono font-semibold text-gray-800 select-all text-[11px]">89892860863 · Альфа Банк · Игорь К.</span>
                    </div>
                  </div>
                  {hasPaymentProof && paymentProofUrl ? (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide flex items-center gap-1">
                        <Check className="w-3 h-3" /> Скриншот оплаты получен
                      </p>
                      <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer" className="block">
                        <img
                          src={paymentProofUrl}
                          alt="Скриншот оплаты"
                          className="w-full rounded-lg border border-emerald-200 object-cover max-h-36 hover:opacity-90 transition-opacity cursor-zoom-in"
                        />
                      </a>
                      <button
                        onClick={() => confirmPayment(tx.id)}
                        disabled={confirmingTx}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600 text-white hover:bg-violet-700 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                      >
                        {confirmingTx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Подтвердить оплату
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                      <Loader2 className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <p className="text-[11px] text-amber-700">Ожидаем скриншот оплаты от мастера</p>
                    </div>
                  )}
                </div>
              ))}

              {photoPreview && (
                <div className="px-4 pt-2 flex items-center gap-2 border-t border-gray-50">
                  <div className="relative">
                    <img src={photoPreview} className="h-12 w-12 rounded-lg object-cover border border-gray-200" />
                    <button onClick={clearPhoto} className="absolute -top-1 -right-1 w-4 h-4 bg-gray-700 text-white rounded-full flex items-center justify-center">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 truncate">{photoFile?.name}</p>
                </div>
              )}
              <div className="px-3 py-3 border-t border-gray-100 flex items-end gap-2 flex-shrink-0">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 flex-shrink-0">
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <textarea value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder={master.pwaLogin ? "Ответить мастеру..." : "Мастер не в приложении"}
                  disabled={!master.pwaLogin && !master.telegramId} rows={1}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 outline-none focus:ring-2 focus:ring-blue-100 resize-none disabled:opacity-50"
                  style={{ minHeight: 36, maxHeight: 100 }} />
                <button onClick={sendReply}
                  disabled={(!reply.trim() && !photoFile) || sending || (!master.pwaLogin && !master.telegramId)}
                  className="w-8 h-8 bg-blue-500 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 disabled:opacity-40 transition-colors flex-shrink-0">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ORDERS */}
          {tab === "orders" && (
            <div className="p-4 space-y-3">
              {!ordersLoaded && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/></div>}
              {ordersLoaded && orders.length === 0 && <div className="text-center text-sm text-gray-300 py-10">Нет заказов</div>}
              {ordersLoaded && orders.length > 0 && (
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[11px] text-gray-400 font-medium">{orders.length} заказ{orders.length === 1 ? "" : orders.length < 5 ? "а" : "ов"}</p>
                    {(() => {
                      const cancelledCount = orders.filter(o => o.status === "cancelled").length;
                      const activeCount = orders.filter(o => o.status !== "cancelled" && o.status !== "completed").length;
                      return (
                        <>
                          {cancelledCount > 0 && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-semibold">
                              {cancelledCount} отменён{cancelledCount === 1 ? "" : cancelledCount < 5 ? "о" : "о"}
                            </span>
                          )}
                          {activeCount > 0 && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 font-semibold">
                              {activeCount} активн{activeCount === 1 ? "ый" : activeCount < 5 ? "ых" : "ых"}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  {orders.filter(o => o.orderAmount).length > 0 && (
                    <p className="text-[11px] text-emerald-600 font-semibold">
                      Итого: {orders.reduce((s, o) => s + (o.orderAmount ?? 0), 0).toLocaleString("ru-RU")} ₽
                    </p>
                  )}
                </div>
              )}
              {orders.map(o => (
                <div key={o.id} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`/orders?openOrder=${o.id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                          title={`Заказ #${o.id}${o.leadId ? ` / Заявка #${o.leadId}` : ""}`}
                        >
                          #{o.id}
                        </a>
                        <span className="text-xs font-semibold text-gray-700">· {o.serviceType}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">{o.city}, {o.district}</p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  {(o.clientName || o.clientPhone) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {o.clientName && (
                        o.leadId ? (
                          <button
                            onClick={() => { onClose(); setTimeout(() => setLocation(`/leads?openLead=${o.leadId}`), 50); }}
                            className="text-[11px] text-blue-600 font-medium flex items-center gap-1 hover:underline"
                          >
                            <User className="w-3 h-3" />{o.clientName}
                          </button>
                        ) : (
                          <p className="text-[11px] text-gray-500 flex items-center gap-1"><User className="w-3 h-3" />{o.clientName}</p>
                        )
                      )}
                      {o.clientPhone && (
                        <a href={`tel:${o.clientPhone}`} className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 hover:underline">
                          <Phone className="w-3 h-3" />{o.clientPhone}
                        </a>
                      )}
                    </div>
                  )}
                  {/* Financial data */}
                  {o.orderAmount != null && (
                    <div className="mt-2 flex items-center gap-3 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                      <div className="text-[11px]">
                        <span className="text-gray-400">Сумма: </span>
                        <span className="font-semibold text-gray-700">{o.orderAmount.toLocaleString("ru-RU")} ₽</span>
                      </div>
                      {o.commission != null && (
                        <>
                          <div className="w-px h-3 bg-gray-200" />
                          <div className="text-[11px]">
                            <span className="text-gray-400">Комиссия: </span>
                            <span className={`font-semibold ${o.paymentStatus === "confirmed" ? "text-emerald-600" : "text-violet-600"}`}>
                              {o.commission.toLocaleString("ru-RU")} ₽
                            </span>
                          </div>
                          {o.paymentStatus === "confirmed" && (
                            <span className="text-[9px] bg-emerald-50 text-emerald-600 rounded-md px-1.5 py-0.5 font-semibold">Оплачено</span>
                          )}
                          {o.paymentStatus === "pending" && (
                            <span className="text-[9px] bg-amber-50 text-amber-600 rounded-md px-1.5 py-0.5 font-semibold">Ожидает</span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-300">
                    {o.scheduledAt && <span><Calendar className="w-3 h-3 inline mr-0.5" />{dateShort(o.scheduledAt)}</span>}
                    <span>{timeAgo(o.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TASKS */}
          {tab === "tasks" && (
            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 space-y-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Новая задача</p>
                <input value={taskText} onChange={e => setTaskText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createTask(); }}
                  placeholder="Описание задачи или напоминания..."
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-100 bg-white" />
                <div className="flex gap-2">
                  <input type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-100 bg-white text-gray-600" />
                  <button onClick={createTask} disabled={!taskText.trim() || addingTask}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-40 transition-colors">
                    Добавить
                  </button>
                </div>
              </div>
              {/* Personal checklist (master_tasks) */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Чеклист мастера</p>
                {tasks.length === 0 && <div className="text-center text-sm text-gray-300 py-3">Нет задач</div>}
                {tasks.map(task => (
                  <div key={task.id} className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors mb-2 ${task.isCompleted ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-gray-100 shadow-sm"}`}>
                    <button onClick={() => toggleTask(task)} className="mt-0.5 flex-shrink-0">
                      {task.isCompleted
                        ? <CheckSquare className="w-4 h-4 text-emerald-500" />
                        : <Square className="w-4 h-4 text-gray-300 hover:text-blue-500 transition-colors" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-relaxed ${task.isCompleted ? "line-through text-gray-400" : "text-gray-700"}`}>{task.text}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-300">
                        {task.dueAt && (
                          <span className={`flex items-center gap-0.5 ${new Date(task.dueAt) < new Date() && !task.isCompleted ? "text-red-400 font-medium" : ""}`}>
                            <Clock className="w-3 h-3" />{dateShort(task.dueAt)}
                          </span>
                        )}
                        {task.createdBy && <span>от {task.createdBy}</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteTask(task.id)} className="p-1 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5 text-gray-300 hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>

              {/* System tasks (system_tasks) */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                    <ClipboardList className="w-3 h-3" /> Системные задачи
                  </p>
                  <button
                    onClick={() => { onClose(); setLocation(`/tasks?newMaster=${master.id}`); }}
                    className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5 font-medium transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Создать
                  </button>
                </div>
                {systemTasks.length === 0 && (
                  <div className="text-center text-sm text-gray-300 py-3">Нет системных задач</div>
                )}
                {systemTasks.map(st => (
                  <div
                    key={st.id}
                    onClick={() => { onClose(); setLocation(`/tasks`); }}
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-100 bg-white shadow-sm mb-2 cursor-pointer hover:bg-blue-50/30 transition-colors"
                  >
                    <ClipboardList className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${st.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>{st.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-300">
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                          st.priority === "urgent" ? "bg-red-100 text-red-600" :
                          st.priority === "high"   ? "bg-orange-100 text-orange-600" :
                          st.priority === "medium" ? "bg-yellow-100 text-yellow-600" :
                          "bg-gray-100 text-gray-500"
                        }`}>{st.priority === "urgent" ? "Срочно" : st.priority === "high" ? "Высокий" : st.priority === "medium" ? "Средний" : "Низкий"}</span>
                        {st.dueAt && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{dateShort(st.dueAt)}</span>}
                        {st.assignedTo && <span>→ {st.assignedTo}</span>}
                      </div>
                    </div>
                    <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0 mt-0.5" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* REVIEWS */}
          {tab === "reviews" && (
            <div className="p-4 space-y-4">

              {/* Add review form */}
              <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 space-y-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Добавить комментарий</p>

                {/* Sentiment selector */}
                <div className="flex gap-2">
                  {(["positive", "neutral", "negative"] as const).map(s => {
                    const config = {
                      positive: { icon: ThumbsUp,   label: "Позитив",  active: "bg-emerald-500 text-white", inactive: "border-gray-200 text-gray-400 hover:border-emerald-400" },
                      neutral:  { icon: Minus,       label: "Нейтрально", active: "bg-gray-500 text-white",    inactive: "border-gray-200 text-gray-400 hover:border-gray-400" },
                      negative: { icon: ThumbsDown,  label: "Негатив",  active: "bg-red-500 text-white",      inactive: "border-gray-200 text-gray-400 hover:border-red-400" },
                    }[s];
                    const Icon = config.icon;
                    return (
                      <button key={s} onClick={() => setReviewSentiment(s)}
                        className={`flex-1 flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[11px] font-semibold transition-colors ${reviewSentiment === s ? config.active : config.inactive}`}>
                        <Icon className="w-3 h-3" />{config.label}
                      </button>
                    );
                  })}
                </div>

                <textarea value={reviewText} onChange={e => setReviewText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addReview(); } }}
                  placeholder="Комментарий о мастере (поведение, качество работы, надёжность)..."
                  rows={3}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-100 bg-white resize-none" />
                <button onClick={addReview} disabled={!reviewText.trim() || addingReview}
                  className="w-full py-2 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                  {addingReview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Добавить комментарий
                </button>
              </div>

              {/* AI Recommendation */}
              <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-xl border border-violet-100 p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> ИИ-рекомендация
                  </p>
                  <button onClick={loadAiRecommendation} disabled={loadingAi}
                    className="text-[10px] bg-violet-600 text-white rounded-lg px-2.5 py-1 hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-1">
                    {loadingAi ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                    {loadingAi ? "Анализирую..." : "Получить"}
                  </button>
                </div>
                {aiRecommendation
                  ? <p className="text-xs text-violet-900 leading-relaxed">{aiRecommendation}</p>
                  : <p className="text-[11px] text-violet-400">Нажмите «Получить», чтобы ИИ проанализировал комментарии и дал рекомендацию по мастеру.</p>
                }
              </div>

              {/* Reviews list */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Комментарии ({reviews.length})
                </p>
                {!reviewsLoaded && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/></div>}
                {reviewsLoaded && reviews.length === 0 && (
                  <div className="text-center text-sm text-gray-300 py-8">Нет комментариев</div>
                )}
                {reviews.map(rev => {
                  const sentimentConfig = {
                    positive: { border: "border-l-emerald-400", bg: "bg-emerald-50",   icon: ThumbsUp,  iconColor: "text-emerald-500" },
                    neutral:  { border: "border-l-gray-300",    bg: "bg-gray-50",      icon: Minus,     iconColor: "text-gray-400" },
                    negative: { border: "border-l-red-400",     bg: "bg-red-50",       icon: ThumbsDown, iconColor: "text-red-500" },
                  }[rev.sentiment as "positive" | "neutral" | "negative"] ?? { border: "border-l-gray-300", bg: "bg-gray-50", icon: Minus, iconColor: "text-gray-400" };
                  const Icon = sentimentConfig.icon;
                  return (
                    <div key={rev.id} className={`mb-2 rounded-xl border border-l-4 p-3.5 ${sentimentConfig.border} ${sentimentConfig.bg}`}>
                      <div className="flex items-start gap-2">
                        <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${sentimentConfig.iconColor}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 leading-relaxed">{rev.text}</p>
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
                            {rev.createdBy && <span>{rev.createdBy}</span>}
                            <span>{timeAgo(rev.createdAt)}</span>
                          </div>
                        </div>
                        <button onClick={() => deleteReview(rev.id)}
                          className="p-1 hover:bg-red-100 rounded-lg transition-colors flex-shrink-0">
                          <Trash2 className="w-3 h-3 text-gray-300 hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </div>
      </div>
    </div>

    {/* ── Test Order Modal ─────────────────────────────────────────────────── */}
    {showTestOrderModal && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center">
                <FlaskConical className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Тестовый заказ</p>
                <p className="text-amber-100 text-[11px]">{master.alias} · {master.city}</p>
              </div>
            </div>
            <button onClick={() => setShowTestOrderModal(false)} className="text-white/70 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-3.5">
            {/* Service type */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Тип услуги *</label>
              {availableServices.length > 0 ? (
                <select
                  value={testOrderForm.serviceType}
                  onChange={e => setTestOrderForm(f => ({ ...f, serviceType: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200 bg-gray-50"
                >
                  <option value="">Выберите услугу...</option>
                  {availableServices.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={testOrderForm.serviceType}
                  onChange={e => setTestOrderForm(f => ({ ...f, serviceType: e.target.value }))}
                  placeholder="Укладка плитки"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200 bg-gray-50"
                />
              )}
            </div>

            {/* Area */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Площадь (м²) *</label>
              <input
                type="number"
                min="1"
                value={testOrderForm.area}
                onChange={e => setTestOrderForm(f => ({ ...f, area: e.target.value }))}
                placeholder="50"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200 bg-gray-50"
              />
            </div>

            {/* District */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Район</label>
              <input
                type="text"
                value={testOrderForm.district}
                onChange={e => setTestOrderForm(f => ({ ...f, district: e.target.value }))}
                placeholder="Центральный"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200 bg-gray-50"
              />
            </div>

            {/* Scheduled at */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Дата и время</label>
              <input
                type="datetime-local"
                value={testOrderForm.scheduledAt}
                onChange={e => setTestOrderForm(f => ({ ...f, scheduledAt: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200 bg-gray-50"
              />
            </div>

            {/* Comment */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Комментарий</label>
              <textarea
                value={testOrderForm.comment}
                onChange={e => setTestOrderForm(f => ({ ...f, comment: e.target.value }))}
                placeholder="Дополнительные требования..."
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-200 bg-gray-50 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowTestOrderModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={submitTestOrder}
                disabled={sendingTestOrder || !testOrderForm.serviceType || !testOrderForm.area}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sendingTestOrder
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />}
                Отправить
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
