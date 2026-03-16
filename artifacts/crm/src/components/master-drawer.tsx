import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  X, Phone, MapPin, MessageSquare, Star, Briefcase, AlertTriangle,
  User, Tag, Plus, CheckSquare, Square, Clock, Trash2, History,
  Send, Paperclip, Check, CheckCheck, Calendar, DollarSign, Loader2, CheckCircle2,
  ClipboardList, ExternalLink, ThumbsUp, ThumbsDown, Minus, Sparkles, MessageCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DrawerColumn { id: number; name: string; }
export interface DrawerMaster {
  id: number; alias: string; city: string;
  specialization: string; specializations: string[]; tags: string[];
  telegramId: string | null; phone: string | null; status: string;
  rating: number; totalOrders: number; acceptedOrders: number; debt: number;
  voronkaColumnId: number | null; isTestMaster: boolean;
  avatarUrl: string | null; activeOrders: any[]; createdAt: string;
}

interface MasterTask { id: number; masterId: number; text: string; dueAt: string | null; isCompleted: boolean; createdBy: string | null; createdAt: string; }
interface HistoryOrder { id: number; status: string; serviceType: string; district: string; city: string; clientName: string | null; clientPhone: string | null; scheduledAt: string | null; completedAt: string | null; createdAt: string; }
interface ChatMessage { id: number; text: string; photoUrl: string | null; fromMaster: boolean; senderName: string | null; isRead: boolean; createdAt: string; }
interface PendingTx { id: number; orderId: number; orderAmount: number; commission: number; }
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
    new: "bg-blue-100 text-blue-700", assigned: "bg-amber-100 text-amber-700",
    in_progress: "bg-purple-100 text-purple-700", completed: "bg-green-100 text-green-700",
    cancelled: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    new: "Новый", assigned: "Назначен", in_progress: "В работе",
    completed: "Завершён", cancelled: "Отменён",
  };
  return (
    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {labels[status] ?? status}
    </span>
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
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Reset when master changes
  useEffect(() => {
    setTags(master.tags ?? []);
    setTab("profile");
    setOrders([]); setOrdersLoaded(false);
    setChatMessages([]); setChatLoaded(false); setPendingTxs([]);
    setReviews([]); setReviewsLoaded(false); setAiRecommendation(null);
    setReviewText(""); setReviewSentiment("positive");
  }, [master.id]);

  useEffect(() => {
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
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30 backdrop-blur-[2px]" />
      <div className="w-[420px] bg-white flex flex-col shadow-2xl border-l border-gray-100 h-full overflow-hidden"
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
                    <div className="absolute left-0 top-6 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-2.5 w-44">
                      <button
                        onClick={activateManually}
                        disabled={activatingContract}
                        className="w-full flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-semibold rounded-md px-2 py-1 transition-colors disabled:opacity-60"
                      >
                        {activatingContract
                          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          : <CheckCircle2 className="w-2.5 h-2.5" />}
                        Активировать вручную
                      </button>
                      <button
                        onClick={() => setShowActivatePopover(false)}
                        className="w-full text-center text-[9px] text-gray-400 hover:text-gray-600 mt-0.5 py-0.5"
                      >
                        Отмена
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{colName} · {master.city}</p>
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
                  {master.phone
                    ? <a href={`tel:${master.phone}`} className="text-blue-600 font-medium hover:underline text-sm">{master.phone}</a>
                    : <span className="text-gray-300 text-sm">Не указан</span>}
                </Row>
                <Row icon={<MapPin className="w-4 h-4 text-gray-400" />} label="Город">
                  <span className="text-gray-700 text-sm">{master.city}</span>
                </Row>
                <Row icon={<MessageSquare className="w-4 h-4 text-gray-400" />} label="Telegram">
                  {master.telegramId
                    ? <span className="text-blue-500 text-sm font-medium">@{master.telegramId}</span>
                    : <span className="text-gray-300 text-sm">Не подключён</span>}
                </Row>
                <Row icon={<Star className="w-4 h-4 text-yellow-400" />} label="Рейтинг">
                  <div className="flex items-center gap-1.5">
                    <div className="flex">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(master.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
                      ))}
                    </div>
                    <span className="text-sm text-gray-600 font-medium">{master.rating.toFixed(1)}</span>
                  </div>
                </Row>
                <Row icon={<Briefcase className="w-4 h-4 text-gray-400" />} label="Заказы">
                  <span className="text-gray-700 text-sm">{master.totalOrders} всего · {master.acceptedOrders} принято</span>
                </Row>
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
                          <a href={msg.photoUrl} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
                            <img src={msg.photoUrl} alt="фото" className="rounded-xl max-w-full max-h-40 object-cover" />
                          </a>
                        )}
                        {msg.text && <p className="text-xs leading-relaxed">{msg.text}</p>}
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
                      <span className="text-gray-500">Комиссия (к оплате)</span>
                      <span className="font-bold text-violet-700">{tx.commission.toLocaleString("ru-RU")} ₽</span>
                    </div>
                    <div className="border-t border-dashed border-gray-100" />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500">Реквизиты</span>
                      <span className="font-mono font-semibold text-gray-800 select-all text-[11px]">89892860863 · Альфа Банк · Игорь К.</span>
                    </div>
                  </div>
                  <button
                    onClick={() => confirmPayment(tx.id)}
                    disabled={confirmingTx}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600 text-white hover:bg-violet-700 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
                  >
                    {confirmingTx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Подтвердить оплату
                  </button>
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
                  placeholder={master.telegramId ? "Ответить мастеру..." : "Мастер не в Telegram"}
                  disabled={!master.telegramId} rows={1}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 outline-none focus:ring-2 focus:ring-blue-100 resize-none disabled:opacity-50"
                  style={{ minHeight: 36, maxHeight: 100 }} />
                <button onClick={sendReply}
                  disabled={(!reply.trim() && !photoFile) || sending || !master.telegramId}
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
              {orders.map(o => (
                <div key={o.id} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">#{o.id} · {o.serviceType}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{o.city}, {o.district}</p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  {o.clientName && <p className="text-[11px] text-gray-500 flex items-center gap-1"><User className="w-3 h-3" />{o.clientName}</p>}
                  {o.clientPhone && (
                    <a href={`tel:${o.clientPhone}`} className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 hover:underline">
                      <Phone className="w-3 h-3" />{o.clientPhone}
                    </a>
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
  );
}
