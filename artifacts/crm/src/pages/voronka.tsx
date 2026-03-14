import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus, Settings, X, Check, ChevronUp, ChevronDown, Trash2,
  Star, Phone, MapPin, Briefcase, AlertTriangle, User,
  ArrowRight, Edit2, MessageSquare, Zap, Clock, Tag,
  CheckSquare, Square, Calendar, Send, Paperclip, Image,
  CheckCheck, RefreshCw, History, ChevronRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoronkaColumn { id: number; name: string; position: number; receivesOrders: boolean; color: string; }
interface ActiveOrder { orderId: number; district: string; city: string; serviceType: string; status: string; clientPhone: string | null; clientName: string | null; scheduledAt: string | null; }
interface VoronkaMaster { id: number; alias: string; city: string; specialization: string; specializations: string[]; tags: string[]; telegramId: string | null; phone: string | null; status: string; rating: number; totalOrders: number; acceptedOrders: number; debt: number; voronkaColumnId: number | null; isTestMaster: boolean; avatarUrl: string | null; activeOrders: ActiveOrder[]; createdAt: string; }

interface MasterTask { id: number; masterId: number; text: string; dueAt: string | null; isCompleted: boolean; createdBy: string | null; createdAt: string; }
interface HistoryOrder { id: number; status: string; serviceType: string; district: string; city: string; clientName: string | null; clientPhone: string | null; scheduledAt: string | null; completedAt: string | null; createdAt: string; }
interface ChatMessage { id: number; text: string; photoUrl: string | null; fromMaster: boolean; senderName: string | null; isRead: boolean; createdAt: string; }

// ─── Color map ────────────────────────────────────────────────────────────────

const COLORS: Record<string, { top: string; header: string; badge: string; dot: string; btn: string }> = {
  blue:   { top: "border-t-blue-400",   header: "from-blue-50 to-white",   badge: "bg-blue-500",   dot: "bg-blue-400",   btn: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
  green:  { top: "border-t-emerald-400",header: "from-emerald-50 to-white",badge: "bg-emerald-500",dot: "bg-emerald-400",btn: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  orange: { top: "border-t-orange-400", header: "from-orange-50 to-white", badge: "bg-orange-500", dot: "bg-orange-400", btn: "bg-orange-50 text-orange-700 hover:bg-orange-100" },
  red:    { top: "border-t-red-400",    header: "from-red-50 to-white",    badge: "bg-red-500",    dot: "bg-red-400",    btn: "bg-red-50 text-red-700 hover:bg-red-100" },
  purple: { top: "border-t-purple-400", header: "from-purple-50 to-white", badge: "bg-purple-500", dot: "bg-purple-400", btn: "bg-purple-50 text-purple-700 hover:bg-purple-100" },
  yellow: { top: "border-t-yellow-400", header: "from-yellow-50 to-white", badge: "bg-yellow-500", dot: "bg-yellow-400", btn: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100" },
  teal:   { top: "border-t-teal-400",   header: "from-teal-50 to-white",   badge: "bg-teal-500",   dot: "bg-teal-400",   btn: "bg-teal-50 text-teal-700 hover:bg-teal-100" },
  pink:   { top: "border-t-pink-400",   header: "from-pink-50 to-white",   badge: "bg-pink-500",   dot: "bg-pink-400",   btn: "bg-pink-50 text-pink-700 hover:bg-pink-100" },
};

const COLOR_OPTS = Object.keys(COLORS);
function clr(key: string) { return COLORS[key] ?? COLORS.blue; }

// ─── Avatar ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["bg-blue-500","bg-purple-500","bg-emerald-500","bg-orange-500","bg-pink-500","bg-teal-500","bg-amber-500","bg-indigo-500"];
function Avatar({ name, id, avatarUrl, size = 36 }: { name: string; id: number; avatarUrl?: string | null; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() || "?";
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

// ─── Order status badge ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-blue-100 text-blue-700",
    assigned: "bg-amber-100 text-amber-700",
    in_progress: "bg-purple-100 text-purple-700",
    completed: "bg-green-100 text-green-700",
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

function timeAgo(d: string) { try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ru }); } catch { return ""; } }
function ts(d: string) { try { return format(new Date(d), "HH:mm", { locale: ru }); } catch { return ""; } }
function dateShort(d: string | null) { if (!d) return "—"; try { return format(new Date(d), "d MMM yyyy", { locale: ru }); } catch { return "—"; } }

// ─── Master Drawer ────────────────────────────────────────────────────────────

type DrawerTab = "profile" | "chat" | "orders" | "tasks";

function MasterDrawer({ master, columns, onClose, onMasterUpdate }: {
  master: VoronkaMaster;
  columns: VoronkaColumn[];
  onClose: () => void;
  onMasterUpdate: (id: number, data: Partial<VoronkaMaster>) => void;
}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<DrawerTab>("profile");

  // Tags
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(master.tags ?? []);
  const [savingTags, setSavingTags] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState<MasterTask[]>([]);
  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  // Orders
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Load data when tabs activated
  useEffect(() => {
    if (tab === "tasks") {
      fetch(`/api/masters/${master.id}/tasks`).then(r => r.json()).then(setTasks);
    }
    if (tab === "orders" && !ordersLoaded) {
      fetch(`/api/masters/${master.id}/orders`).then(r => r.json()).then(d => { setOrders(d); setOrdersLoaded(true); });
    }
    if (tab === "chat" && !chatLoaded) {
      loadChat();
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
      setChatLoaded(true);
      await fetch(`/api/master-chat/${master.id}/read`, { method: "PATCH" });
    }
  };

  // Tags
  const addTag = async (tag: string) => {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    setTagInput("");
    setSavingTags(true);
    await fetch(`/api/masters/${master.id}/tags`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: next }) });
    setSavingTags(false);
    onMasterUpdate(master.id, { tags: next });
  };
  const removeTag = async (tag: string) => {
    const next = tags.filter(t => t !== tag);
    setTags(next);
    setSavingTags(true);
    await fetch(`/api/masters/${master.id}/tags`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: next }) });
    setSavingTags(false);
    onMasterUpdate(master.id, { tags: next });
  };

  // Tasks
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

  // Chat send
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
    { id: "profile", label: "Профиль", icon: User },
    { id: "chat",    label: "Чат",     icon: MessageSquare },
    { id: "orders",  label: "Заказы",  icon: History },
    { id: "tasks",   label: "Задачи",  icon: CheckSquare },
  ];

  const colName = columns.find(c => c.id === master.voronkaColumnId)?.name ?? "Без колонки";

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        className="w-[420px] bg-white flex flex-col shadow-2xl border-l border-gray-100 h-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <Avatar name={master.alias} id={master.id} avatarUrl={master.avatarUrl} size={44} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-gray-800">{master.alias}</p>
              {master.isTestMaster && <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-semibold">ТЕСТ</span>}
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
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                tab === t.id ? "text-blue-600 border-b-2 border-blue-500" : "text-gray-400 hover:text-gray-600"
              }`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── PROFILE TAB ── */}
          {tab === "profile" && (
            <div className="p-5 space-y-5">
              {/* Key info */}
              <div className="space-y-3">
                <Row icon={<Phone className="w-4 h-4 text-gray-400" />} label="Телефон">
                  {master.phone
                    ? <a href={`tel:${master.phone}`} className="text-blue-600 font-medium hover:underline">{master.phone}</a>
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

              {/* Specializations */}
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

              {/* Tags */}
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
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                    placeholder="Добавить тег..."
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-violet-100 bg-gray-50"
                  />
                  <button
                    onClick={() => addTag(tagInput)}
                    disabled={!tagInput.trim() || savingTags}
                    className="px-3 py-1.5 bg-violet-500 text-white rounded-lg text-xs font-medium hover:bg-violet-600 disabled:opacity-40 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Meta */}
              <div className="text-[11px] text-gray-300 pt-2 border-t border-gray-50">
                Зарегистрирован: {dateShort(master.createdAt)}
              </div>
            </div>
          )}

          {/* ── CHAT TAB ── */}
          {tab === "chat" && (
            <div className="flex flex-col h-full" style={{ height: "calc(100vh - 185px)" }}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {!chatLoaded && (
                  <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/></div>
                )}
                {chatLoaded && chatMessages.length === 0 && (
                  <div className="text-center text-sm text-gray-300 mt-8">Нет сообщений</div>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.fromMaster ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                      msg.fromMaster ? "bg-gray-100 text-gray-800 rounded-tl-sm" : "bg-blue-500 text-white rounded-tr-sm"
                    }`}>
                      <p className={`text-[10px] font-semibold mb-1 ${msg.fromMaster ? "text-gray-500" : "text-blue-100"}`}>
                        {msg.senderName ?? (msg.fromMaster ? "Мастер" : "Оператор")}
                      </p>
                      {msg.photoUrl && (
                        <a href={msg.photoUrl} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
                          <img src={msg.photoUrl} alt="фото" className="rounded-xl max-w-full max-h-40 object-cover" />
                        </a>
                      )}
                      {msg.text && <p className="text-xs leading-relaxed">{msg.text}</p>}
                      <div className={`flex items-center gap-1 mt-1 ${msg.fromMaster ? "justify-start" : "justify-end"}`}>
                        <span className={`text-[9px] ${msg.fromMaster ? "text-gray-400" : "text-blue-100"}`}>{ts(msg.createdAt)}</span>
                        {!msg.fromMaster && (msg.isRead ? <CheckCheck className="w-2.5 h-2.5 text-blue-200" /> : <Check className="w-2.5 h-2.5 text-blue-200" />)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>

              {/* Photo preview */}
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

              {/* Reply input */}
              <div className="px-3 py-3 border-t border-gray-100 flex items-end gap-2 flex-shrink-0">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 flex-shrink-0">
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder={master.telegramId ? "Ответить мастеру..." : "Мастер не в Telegram"}
                  disabled={!master.telegramId}
                  rows={1}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 outline-none focus:ring-2 focus:ring-blue-100 resize-none disabled:opacity-50"
                  style={{ minHeight: 36, maxHeight: 100 }}
                />
                <button onClick={sendReply}
                  disabled={(!reply.trim() && !photoFile) || sending || !master.telegramId}
                  className="w-8 h-8 bg-blue-500 text-white rounded-xl flex items-center justify-center hover:bg-blue-600 disabled:opacity-40 transition-colors flex-shrink-0">
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* ── ORDERS TAB ── */}
          {tab === "orders" && (
            <div className="p-4 space-y-3">
              {!ordersLoaded && <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/></div>}
              {ordersLoaded && orders.length === 0 && (
                <div className="text-center text-sm text-gray-300 py-10">Нет заказов</div>
              )}
              {orders.map(o => (
                <div key={o.id} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">#{o.id} · {o.serviceType}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{o.city}, {o.district}</p>
                    </div>
                    <StatusBadge status={o.status} />
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

          {/* ── TASKS TAB ── */}
          {tab === "tasks" && (
            <div className="p-4 space-y-4">
              {/* Add task */}
              <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 space-y-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Новая задача</p>
                <input
                  value={taskText}
                  onChange={e => setTaskText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createTask(); }}
                  placeholder="Описание задачи или напоминания..."
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                />
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={taskDue}
                    onChange={e => setTaskDue(e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-100 bg-white text-gray-600"
                  />
                  <button
                    onClick={createTask}
                    disabled={!taskText.trim() || addingTask}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-40 transition-colors"
                  >
                    Добавить
                  </button>
                </div>
              </div>

              {/* Task list */}
              {tasks.length === 0 && (
                <div className="text-center text-sm text-gray-300 py-6">Нет задач</div>
              )}
              {tasks.map(task => (
                <div key={task.id} className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
                  task.isCompleted ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-gray-100 shadow-sm"
                }`}>
                  <button onClick={() => toggleTask(task)} className="mt-0.5 flex-shrink-0">
                    {task.isCompleted
                      ? <CheckSquare className="w-4 h-4 text-emerald-500" />
                      : <Square className="w-4 h-4 text-gray-300 hover:text-blue-500 transition-colors" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed ${task.isCompleted ? "line-through text-gray-400" : "text-gray-700"}`}>
                      {task.text}
                    </p>
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
          )}

        </div>
      </div>
    </div>
  );
}

// Helper row component
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

// ─── Master Card ──────────────────────────────────────────────────────────────

function MasterCard({ master, columns, onMove, onOpenDrawer }: {
  master: VoronkaMaster;
  columns: VoronkaColumn[];
  onMove: (id: number, colId: number | null) => void;
  onOpenDrawer: (master: VoronkaMaster) => void;
}) {
  const [open, setOpen] = useState(false);
  const others = columns.filter(c => c.id !== master.voronkaColumnId);
  const hasActiveOrders = master.activeOrders.length > 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Card top bar */}
      <div className="px-3.5 pt-3.5 pb-2.5">
        <div className="flex items-start gap-3">
          <button onClick={() => onOpenDrawer(master)} className="flex-shrink-0 hover:opacity-80 transition-opacity">
            <Avatar name={master.alias} id={master.id} avatarUrl={master.avatarUrl} size={40} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => onOpenDrawer(master)}
                className="font-semibold text-[13px] text-gray-800 leading-tight hover:text-blue-600 transition-colors text-left"
              >
                {master.alias}
              </button>
              {master.isTestMaster && (
                <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-semibold">ТЕСТ</span>
              )}
              {master.telegramId && (
                <span className="text-[10px] bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
                  <MessageSquare className="w-2.5 h-2.5" />TG
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{master.city}</p>
            {(master.specializations?.length > 0 ? master.specializations : master.specialization ? [master.specialization] : []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {(master.specializations?.length > 0 ? master.specializations : [master.specialization]).slice(0,3).map(s => (
                  <span key={s} className="text-[9px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 font-medium leading-tight">{s}</span>
                ))}
                {master.specializations?.length > 3 && (
                  <span className="text-[9px] bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">+{master.specializations.length - 3}</span>
                )}
              </div>
            )}
            {/* Tags */}
            {master.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {master.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="text-[9px] bg-violet-50 text-violet-600 rounded px-1.5 py-0.5 font-medium leading-tight">#{tag}</span>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => onOpenDrawer(master)} className="flex-shrink-0 p-1 hover:bg-gray-50 rounded-lg transition-colors">
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          </button>
        </div>

        {/* Stars + stats */}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-0.5">
            {[1,2,3,4,5].map(i => (
              <Star key={i} className={`w-3 h-3 ${i <= Math.round(master.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
            ))}
            <span className="text-[11px] text-gray-500 ml-1">{master.rating.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            {master.phone && <span className="flex items-center gap-0.5 text-emerald-600"><Phone className="w-3 h-3" />{master.phone}</span>}
            <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{master.totalOrders}</span>
            {master.debt > 0 && (
              <span className="flex items-center gap-0.5 text-red-500 font-medium">
                <AlertTriangle className="w-3 h-3" />{(master.debt/1000).toFixed(0)}k₽
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Active orders */}
      {hasActiveOrders && (
        <div className="border-t border-gray-50 px-3.5 py-2 space-y-2 bg-blue-50/40">
          {master.activeOrders.map(o => (
            <div key={o.orderId} className="text-[11px]">
              <div className="flex items-center gap-1 font-semibold text-blue-700 mb-0.5">
                <Zap className="w-3 h-3" />
                <span>#{o.orderId} · {o.serviceType}</span>
              </div>
              <div className="flex items-center gap-1 text-gray-500">
                <MapPin className="w-3 h-3 text-orange-400 flex-shrink-0" />
                {o.city}, {o.district}
              </div>
              {o.clientName && (
                <div className="flex items-center gap-1 text-gray-500">
                  <User className="w-3 h-3 text-gray-400 flex-shrink-0" />{o.clientName}
                </div>
              )}
              {o.clientPhone && (
                <a href={`tel:${o.clientPhone}`} className="flex items-center gap-1 text-emerald-600 font-semibold hover:underline">
                  <Phone className="w-3 h-3 flex-shrink-0" />{o.clientPhone}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Move dropdown */}
      <div className="border-t border-gray-50 relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ArrowRight className="w-3 h-3" />Переместить
        </button>
        {open && (
          <div className="absolute bottom-full left-0 right-0 bg-white border border-gray-100 rounded-xl shadow-xl z-30 overflow-hidden">
            {others.map(col => {
              const c = clr(col.color);
              return (
                <button key={col.id} onClick={() => { onMove(master.id, col.id); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors">
                  <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                  {col.name}
                </button>
              );
            })}
            <button onClick={() => { onMove(master.id, null); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-gray-400 hover:bg-gray-50 transition-colors border-t border-gray-50">
              Без колонки
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({ col, masters, columns, onMove, onOpenDrawer }: {
  col: VoronkaColumn | null;
  masters: VoronkaMaster[];
  columns: VoronkaColumn[];
  onMove: (id: number, colId: number | null) => void;
  onOpenDrawer: (master: VoronkaMaster) => void;
}) {
  const c = col ? clr(col.color) : { top: "border-t-gray-300", header: "from-gray-50 to-white", badge: "bg-gray-400", dot: "bg-gray-300", btn: "" };
  const name = col?.name ?? "Без колонки";
  const receivesOrders = col?.receivesOrders ?? false;

  return (
    <div className="flex-shrink-0 w-[280px] flex flex-col">
      <div className={`rounded-t-2xl bg-gradient-to-b ${c.header} border border-b-0 border-gray-100 px-4 py-3 flex items-center justify-between border-t-4 ${c.top}`}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px] text-gray-700">{name}</span>
          {receivesOrders && (
            <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" />Заказы
            </span>
          )}
        </div>
        <span className={`${c.badge} text-white text-[11px] font-bold rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1.5`}>
          {masters.length}
        </span>
      </div>
      <div className="flex-1 bg-gray-50/60 border border-t-0 border-gray-100 rounded-b-2xl overflow-y-auto p-2.5 space-y-2.5" style={{ maxHeight: "calc(100vh - 195px)" }}>
        {masters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-300">
            <User className="w-8 h-8 mb-2" />
            <p className="text-[12px]">Пусто</p>
          </div>
        ) : masters.map(m => (
          <MasterCard key={m.id} master={m} columns={columns} onMove={onMove} onOpenDrawer={onOpenDrawer} />
        ))}
      </div>
    </div>
  );
}

// ─── Column Settings ──────────────────────────────────────────────────────────

function ColumnSettings({ columns, onClose, onUpdate, onDelete, onCreate, onReorder }: {
  columns: VoronkaColumn[];
  onClose: () => void;
  onUpdate: (id: number, data: Partial<VoronkaColumn>) => void;
  onDelete: (id: number) => void;
  onCreate: (name: string, receivesOrders: boolean, color: string) => void;
  onReorder: (order: number[]) => void;
}) {
  const [local, setLocal] = useState([...columns].sort((a,b) => a.position - b.position));
  const [editId, setEditId] = useState<number|null>(null);
  const [editName, setEditName] = useState("");
  const [editReceives, setEditReceives] = useState(false);
  const [editColor, setEditColor] = useState("blue");
  const [newName, setNewName] = useState("");
  const [newReceives, setNewReceives] = useState(false);
  const [newColor, setNewColor] = useState("blue");

  const startEdit = (col: VoronkaColumn) => { setEditId(col.id); setEditName(col.name); setEditReceives(col.receivesOrders); setEditColor(col.color); };
  const saveEdit = () => {
    if (!editId) return;
    onUpdate(editId, { name: editName, receivesOrders: editReceives, color: editColor });
    setLocal(p => p.map(c => c.id === editId ? { ...c, name: editName, receivesOrders: editReceives, color: editColor } : c));
    setEditId(null);
  };
  const move = (idx: number, dir: -1|1) => {
    const arr = [...local]; const t = idx+dir;
    if (t<0||t>=arr.length) return;
    [arr[idx],arr[t]]=[arr[t],arr[idx]];
    setLocal(arr); onReorder(arr.map(c=>c.id));
  };
  const del = (id: number) => { onDelete(id); setLocal(p=>p.filter(c=>c.id!==id)); };
  const create = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim(), newReceives, newColor);
    setNewName(""); setNewReceives(false); setNewColor("blue");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Настройка колонок</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {local.map((col, idx) => {
            const c = clr(col.color);
            return (
              <div key={col.id} className="rounded-xl border border-gray-100 overflow-hidden">
                {editId === col.id ? (
                  <div className="p-3 space-y-2.5 bg-gray-50">
                    <input value={editName} onChange={e=>setEditName(e.target.value)} autoFocus
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="Название колонки" />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {COLOR_OPTS.map(k=>(
                        <button key={k} onClick={()=>setEditColor(k)}
                          className={`w-5 h-5 rounded-full ${COLORS[k].dot} border-2 transition-all ${editColor===k?"border-gray-700 scale-110":"border-transparent"}`}/>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={editReceives} onChange={e=>setEditReceives(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                      <span className="text-gray-700">Принимает заказы от бота</span>
                    </label>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="flex items-center gap-1.5 bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-blue-600 transition-colors"><Check className="w-3 h-3"/>Сохранить</button>
                      <button onClick={()=>setEditId(null)} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-100 transition-colors">Отмена</button>
                    </div>
                  </div>
                ) : (
                  <div className={`flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r ${c.header}`}>
                    <span className={`w-3 h-3 rounded-full ${c.dot} flex-shrink-0`}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-700">{col.name}</p>
                      <p className="text-[11px] text-gray-400">{col.receivesOrders ? "✓ Получает заказы" : "✗ Не получает заказы"}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={()=>move(idx,-1)} disabled={idx===0} className="p-1 hover:bg-white rounded-lg disabled:opacity-30 transition-colors"><ChevronUp className="w-3.5 h-3.5 text-gray-400"/></button>
                      <button onClick={()=>move(idx,1)} disabled={idx===local.length-1} className="p-1 hover:bg-white rounded-lg disabled:opacity-30 transition-colors"><ChevronDown className="w-3.5 h-3.5 text-gray-400"/></button>
                      <button onClick={()=>startEdit(col)} className="p-1 hover:bg-white rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5 text-gray-400"/></button>
                      <button onClick={()=>del(col.id)} className="p-1 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400"/></button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="border border-dashed border-gray-200 rounded-xl p-3.5 space-y-2.5 mt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Новая колонка</p>
            <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&create()}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Название" />
            <div className="flex items-center gap-1.5 flex-wrap">
              {COLOR_OPTS.map(k=>(
                <button key={k} onClick={()=>setNewColor(k)}
                  className={`w-5 h-5 rounded-full ${COLORS[k].dot} border-2 transition-all ${newColor===k?"border-gray-700 scale-110":"border-transparent"}`}/>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={newReceives} onChange={e=>setNewReceives(e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-gray-700">Принимает заказы от бота</span>
            </label>
            <button onClick={create} disabled={!newName.trim()}
              className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-40 transition-colors">
              <Plus className="w-4 h-4"/>Добавить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Voronka() {
  const [columns, setColumns] = useState<VoronkaColumn[]>([]);
  const [masters, setMasters] = useState<VoronkaMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [drawerMaster, setDrawerMaster] = useState<VoronkaMaster | null>(null);

  const fetchAll = useCallback(async () => {
    const [cR, mR] = await Promise.all([fetch("/api/voronka/columns"), fetch("/api/voronka/masters")]);
    if (cR.ok) setColumns(await cR.json());
    if (mR.ok) setMasters(await mR.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 7000); return () => clearInterval(t); }, [fetchAll]);

  // Keep drawer data in sync with latest master data
  useEffect(() => {
    if (drawerMaster) {
      const fresh = masters.find(m => m.id === drawerMaster.id);
      if (fresh) setDrawerMaster(prev => prev ? { ...fresh, tags: prev.tags } : fresh);
    }
  }, [masters]);

  const moveMaster = async (masterId: number, colId: number | null) => {
    setMasters(p => p.map(m => m.id === masterId ? { ...m, voronkaColumnId: colId } : m));
    await fetch(`/api/voronka/masters/${masterId}/column`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voronkaColumnId: colId }),
    });
  };

  const updateMasterLocal = (id: number, data: Partial<VoronkaMaster>) => {
    setMasters(p => p.map(m => m.id === id ? { ...m, ...data } : m));
    setDrawerMaster(p => p && p.id === id ? { ...p, ...data } : p);
  };

  const updateColumn = async (id: number, data: Partial<VoronkaColumn>) => {
    const res = await fetch(`/api/voronka/columns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { const u = await res.json(); setColumns(p => p.map(c => c.id === id ? u : c)); }
  };

  const deleteColumn = async (id: number) => {
    await fetch(`/api/voronka/columns/${id}`, { method: "DELETE" });
    setColumns(p => p.filter(c => c.id !== id));
    setMasters(p => p.map(m => m.voronkaColumnId === id ? { ...m, voronkaColumnId: null } : m));
  };

  const createColumn = async (name: string, receivesOrders: boolean, color: string) => {
    const res = await fetch("/api/voronka/columns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, receivesOrders, color }) });
    if (res.ok) { const col = await res.json(); setColumns(p => [...p, col]); }
  };

  const reorderColumns = async (order: number[]) => {
    const res = await fetch("/api/voronka/columns/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) });
    if (res.ok) setColumns(await res.json());
  };

  const sorted = [...columns].sort((a, b) => a.position - b.position);
  const unassigned = masters.filter(m => !m.voronkaColumnId || !columns.find(c => c.id === m.voronkaColumnId));

  const totalDebt = masters.reduce((s, m) => s + m.debt, 0);
  const activeCount = masters.filter(m => m.activeOrders.length > 0).length;
  const tgCount = masters.filter(m => m.telegramId).length;

  return (
    <ProtectedRoute>
      <Layout>
        <div className="h-full flex flex-col">
          <div className="flex items-start justify-between mb-5 flex-shrink-0">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Воронка мастеров</h1>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                <span>{masters.length} мастеров</span>
                <span className="flex items-center gap-1 text-blue-500"><MessageSquare className="w-3 h-3"/>{tgCount} в Telegram</span>
                {activeCount > 0 && <span className="flex items-center gap-1 text-emerald-500"><Zap className="w-3 h-3"/>{activeCount} на объекте</span>}
                {totalDebt > 0 && <span className="flex items-center gap-1 text-red-400"><AlertTriangle className="w-3 h-3"/>{(totalDebt/1000).toFixed(0)}k₽ долг</span>}
              </div>
            </div>
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
              <Settings className="w-4 h-4"/>Колонки
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
              {sorted.map(col => (
                <KanbanColumn key={col.id} col={col}
                  masters={masters.filter(m => m.voronkaColumnId === col.id)}
                  columns={columns} onMove={moveMaster} onOpenDrawer={setDrawerMaster} />
              ))}
              {unassigned.length > 0 && (
                <KanbanColumn col={null} masters={unassigned} columns={columns} onMove={moveMaster} onOpenDrawer={setDrawerMaster} />
              )}
            </div>
          )}
        </div>

        {showSettings && (
          <ColumnSettings
            columns={sorted}
            onClose={() => { setShowSettings(false); fetchAll(); }}
            onUpdate={updateColumn} onDelete={deleteColumn}
            onCreate={createColumn} onReorder={reorderColumns}
          />
        )}

        {drawerMaster && (
          <MasterDrawer
            master={drawerMaster}
            columns={columns}
            onClose={() => setDrawerMaster(null)}
            onMasterUpdate={updateMasterLocal}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
}
