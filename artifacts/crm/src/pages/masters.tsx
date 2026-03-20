import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { ProtectedRoute, useAuth } from "@/hooks/use-auth";
import {
  Loader2, Plus, Star, Phone, MessageSquare, Briefcase,
  AlertTriangle, MapPin, Search, X, Users, Zap, UserX, Filter,
  FileSignature, Trash2, Smartphone, ChevronDown, Tag, ArrowUpDown,
} from "lucide-react";
import { Avatar, MasterDrawer, OnlineBadge } from "@/components/master-drawer";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useCreateMaster, useGetCities } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveOrder {
  orderId: number;
  serviceType: string;
  city: string;
  district: string;
  clientName: string | null;
  clientPhone: string | null;
}

interface Master {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  specializations: string[];
  tags: string[];
  telegramId: string | null;
  phone: string | null;
  status: string;
  rating: number;
  totalOrders: number;
  acceptedOrders: number;
  debt: number;
  voronkaColumnId: number | null;
  isTestMaster: boolean;
  avatarUrl: string | null;
  activeOrders: ActiveOrder[];
  createdAt: string;
  pwaLogin?: string | null;
  lastSeenAt?: string | null;
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = "name" | "rating" | "orders" | "debt" | "date";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name",   label: "По алфавиту" },
  { key: "rating", label: "По рейтингу" },
  { key: "orders", label: "По заказам" },
  { key: "debt",   label: "По долгу" },
  { key: "date",   label: "По дате" },
];

function sortMasters(list: Master[], key: SortKey): Master[] {
  return [...list].sort((a, b) => {
    switch (key) {
      case "name":   return a.alias.localeCompare(b.alias, "ru");
      case "rating": return b.rating - a.rating;
      case "orders": return b.totalOrders - a.totalOrders;
      case "debt":   return b.debt - a.debt;
      case "date":   return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ master }: { master: Master }) {
  if (master.status === "suspended") {
    return <span className="text-[10px] bg-red-100 text-red-600 rounded-full px-2 py-0.5 font-semibold">Отстранён</span>;
  }
  if (master.status === "pending_contract") {
    return <span className="text-[10px] bg-amber-100 text-amber-600 rounded-full px-2 py-0.5 font-semibold">Ожидает договора</span>;
  }
  if (master.activeOrders.length > 0) {
    return <span className="text-[10px] bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-semibold flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />На объекте</span>;
  }
  return <span className="text-[10px] bg-emerald-100 text-emerald-600 rounded-full px-2 py-0.5 font-semibold">Свободен</span>;
}

// ─── Masters page ─────────────────────────────────────────────────────────────

export default function Masters() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") ?? "";
  });
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "free" | "onsite" | "suspended" | "pending_contract" | "debtors">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [specFilter, setSpecFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [drawerMaster, setDrawerMaster] = useState<Master | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMasterMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/masters/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: (_, id) => {
      setMasters(prev => prev.filter(m => m.id !== id));
      queryClient.invalidateQueries({ queryKey: ["/api/masters"] });
      toast({ title: "Перемещено в корзину", description: "Мастер будет удалён через 30 дней. Восстановите в разделе «Корзина»." });
    },
  });

  const [masters, setMasters] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/voronka/masters")
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list: Master[] = Array.isArray(data) ? data : [];
        setMasters(list);
        setLoading(false);
        const openId = parseInt(new URLSearchParams(window.location.search).get("openMaster") ?? "");
        if (openId) {
          const found = list.find(m => m.id === openId);
          if (found) setDrawerMaster(found);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const { data: cities } = useGetCities();

  const createMutation = useCreateMaster({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/masters"] });
        fetch("/api/voronka/masters").then(r => r.json()).then(setMasters);
        setIsCreateOpen(false);
      }
    }
  });

  const [formData, setFormData] = useState({
    alias: "", city: "", specialization: "", telegramId: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData });
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  const allCities = useMemo(() => {
    const set = new Set(masters.map(m => m.city).filter(Boolean));
    return [...set].sort();
  }, [masters]);

  const allTags = useMemo(() => {
    const set = new Set(masters.flatMap(m => m.tags ?? []));
    return [...set].sort();
  }, [masters]);

  const allSpecs = useMemo(() => {
    const set = new Set(masters.flatMap(m => m.specializations.length > 0 ? m.specializations : m.specialization ? [m.specialization] : []));
    return [...set].sort();
  }, [masters]);

  const totalDebt = useMemo(() => masters.reduce((s, m) => s + (m.debt ?? 0), 0), [masters]);

  const counts = useMemo(() => ({
    total: masters.length,
    free: masters.filter(m => m.status !== "suspended" && m.status !== "pending_contract" && m.activeOrders.length === 0).length,
    onsite: masters.filter(m => m.activeOrders.length > 0).length,
    suspended: masters.filter(m => m.status === "suspended").length,
    pending: masters.filter(m => m.status === "pending_contract").length,
    debtors: masters.filter(m => m.debt > 0).length,
  }), [masters]);

  const filtered = useMemo(() => {
    let list = masters.filter(m => {
      if (search) {
        const q = search.toLowerCase();
        const match = m.alias.toLowerCase().includes(q)
          || m.city.toLowerCase().includes(q)
          || (m.phone ?? "").includes(q)
          || m.specializations.some(s => s.toLowerCase().includes(q))
          || (m.tags ?? []).some(t => t.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (cityFilter !== "all" && m.city !== cityFilter) return false;
      if (statusFilter === "free" && (m.status === "suspended" || m.status === "pending_contract" || m.activeOrders.length > 0)) return false;
      if (statusFilter === "onsite" && m.activeOrders.length === 0) return false;
      if (statusFilter === "suspended" && m.status !== "suspended") return false;
      if (statusFilter === "pending_contract" && m.status !== "pending_contract") return false;
      if (statusFilter === "debtors" && m.debt <= 0) return false;
      if (tagFilter && !(m.tags ?? []).includes(tagFilter)) return false;
      if (specFilter !== "all" && !m.specializations.includes(specFilter) && m.specialization !== specFilter) return false;
      return true;
    });
    return sortMasters(list, sortKey);
  }, [masters, search, cityFilter, statusFilter, tagFilter, specFilter, sortKey]);

  const filteredDebt = useMemo(() => filtered.reduce((s, m) => s + (m.debt ?? 0), 0), [filtered]);

  const hasFilters = search || cityFilter !== "all" || statusFilter !== "all" || tagFilter || specFilter !== "all";

  const STAT_BUTTONS = [
    { key: "all"              as const, label: "Все",        value: counts.total,    icon: Users,         color: "text-gray-600 bg-gray-50 border-gray-100" },
    { key: "free"             as const, label: "Свободны",   value: counts.free,     icon: Users,         color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
    { key: "onsite"           as const, label: "На объекте", value: counts.onsite,   icon: Zap,           color: "text-blue-600 bg-blue-50 border-blue-100" },
    { key: "pending_contract" as const, label: "Договор",    value: counts.pending,  icon: FileSignature, color: "text-amber-600 bg-amber-50 border-amber-100" },
    { key: "debtors"          as const, label: "Должники",   value: counts.debtors,  icon: AlertTriangle, color: "text-red-500 bg-red-50 border-red-100" },
    { key: "suspended"        as const, label: "Блок",       value: counts.suspended,icon: UserX,         color: "text-gray-400 bg-gray-50 border-gray-100" },
  ];

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="masters">
      <Layout>
        <div className="h-full flex flex-col gap-3">

          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-xl font-bold text-gray-800">База мастеров</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Управление исполнителями
                {totalDebt > 0 && (
                  <span className="ml-2 text-red-400 font-semibold">
                    · Общий долг: {totalDebt.toLocaleString("ru-RU")} ₽
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-blue-600 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>

          {/* Stats row */}
          <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto pb-0.5">
            {STAT_BUTTONS.map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(statusFilter === s.key ? "all" : s.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-left transition-all ${s.color} ${statusFilter === s.key ? "ring-2 ring-offset-1 ring-current" : "hover:brightness-95"}`}
              >
                <s.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <div>
                  <div className="text-base font-bold leading-none">{s.value}</div>
                  <div className="text-[10px] opacity-70 font-medium leading-tight mt-0.5">{s.label}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Debt summary when debtors filter active */}
          {statusFilter === "debtors" && filteredDebt > 0 && (
            <div className="flex-shrink-0 flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-xs text-red-600 font-semibold">
                Суммарный долг {filtered.length} мастер{filtered.length === 1 ? "а" : "ов"}: {filteredDebt.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          )}

          {/* Filters row */}
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Имя, телефон, специализация, тег..."
                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* City filter */}
            <div className="relative">
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <select
                value={cityFilter}
                onChange={e => setCityFilter(e.target.value)}
                className="pl-7 pr-6 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 bg-white appearance-none"
              >
                <option value="all">Все города</option>
                {allCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Specialization filter */}
            {allSpecs.length > 0 && (
              <div className="relative">
                <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <select
                  value={specFilter}
                  onChange={e => setSpecFilter(e.target.value)}
                  className="pl-7 pr-6 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 bg-white appearance-none max-w-[160px]"
                >
                  <option value="all">Все специальности</option>
                  {allSpecs.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {/* Sort */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{SORT_OPTIONS.find(s => s.key === sortKey)?.label}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[160px]">
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setSortKey(opt.key); setShowSortMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${sortKey === opt.key ? "text-blue-600 font-semibold bg-blue-50" : "text-gray-700"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setCityFilter("all"); setStatusFilter("all"); setTagFilter(null); setSpecFilter("all"); }}
                className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 flex items-center gap-1.5"
              >
                <X className="w-3 h-3" /> Сбросить
              </button>
            )}
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto pb-0.5">
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5 shrink-0 font-medium">
                <Tag className="w-3 h-3" /> Теги:
              </span>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                    tagFilter === tag
                      ? "bg-violet-500 text-white"
                      : "bg-violet-50 text-violet-600 hover:bg-violet-100"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Count */}
          <div className="text-xs text-gray-400 flex-shrink-0 -mt-1">
            Показано: {filtered.length} из {masters.length}
            {sortKey !== "name" && (
              <span className="ml-2 text-blue-400">· Сортировка: {SORT_OPTIONS.find(s => s.key === sortKey)?.label}</span>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto voronka-scroll space-y-1.5" onClick={() => setShowSortMenu(false)}>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <Filter className="w-8 h-8 mb-2" />
                <p className="text-sm">Никого не найдено</p>
              </div>
            ) : filtered.map(m => (
              <MasterRow
                key={m.id}
                master={m}
                onOpenDrawer={setDrawerMaster}
                onDelete={isAdmin ? id => deleteMasterMutation.mutate(id) : undefined}
                onGoToChat={id => setLocation(`/master-chat?masterId=${id}`)}
              />
            ))}
          </div>
        </div>

        {/* Create Modal */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-md overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-800">Новый мастер</h2>
                <button onClick={() => setIsCreateOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
                {[
                  { label: "Имя / псевдоним", key: "alias", placeholder: "Иван Петров", required: true },
                  { label: "Специализация", key: "specialization", placeholder: "Плиточник, Сантехник", required: true },
                  { label: "Telegram ID", key: "telegramId", placeholder: "@username или ID", required: false },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">{f.label}</label>
                    <input
                      required={f.required}
                      value={(formData as any)[f.key]}
                      onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">Город</label>
                  <select
                    required
                    value={formData.city}
                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none bg-white"
                  >
                    <option value="">Выберите город</option>
                    {cities?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="pt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 text-sm rounded-xl text-gray-500 hover:bg-gray-100">
                    Отмена
                  </button>
                  <button type="submit" disabled={createMutation.isPending}
                    className="px-5 py-2 text-sm bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                    {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Добавить
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {drawerMaster && (
          <MasterDrawer
            master={drawerMaster}
            onClose={() => setDrawerMaster(null)}
            onMasterUpdate={(id, data) => {
              setMasters(prev => prev.map(m => m.id === id ? { ...m, ...data } : m));
              if (drawerMaster?.id === id) setDrawerMaster(prev => prev ? { ...prev, ...data } : prev);
            }}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
}

// ─── Compact master row ───────────────────────────────────────────────────────

function MasterRow({
  master,
  onOpenDrawer,
  onDelete,
  onGoToChat,
}: {
  master: Master;
  onOpenDrawer: (m: Master) => void;
  onDelete?: (id: number) => void;
  onGoToChat: (id: number) => void;
}) {
  const specs = master.specializations.length > 0 ? master.specializations : master.specialization ? [master.specialization] : [];
  const tags = master.tags ?? [];

  return (
    <div
      onClick={() => onOpenDrawer(master)}
      className="bg-white border border-gray-100 rounded-xl px-3.5 py-2.5 flex items-center gap-3 hover:shadow-md transition-all cursor-pointer group"
    >
      {/* Avatar */}
      <Avatar name={master.alias} id={master.id} avatarUrl={master.avatarUrl} size={36} />

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-[13px] text-gray-800 leading-tight">{master.alias}</span>
          <StatusPill master={master} />
          {master.isTestMaster && (
            <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-semibold">ТЕСТ</span>
          )}
          {master.pwaLogin && (
            <span className="text-[10px] bg-emerald-50 text-emerald-600 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
              <Smartphone className="w-2.5 h-2.5" />APP
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{master.city || "—"}</span>
          {master.phone && <span className="flex items-center gap-0.5 text-emerald-600"><Phone className="w-3 h-3" />{master.phone}</span>}
          {specs.length > 0 && (
            <span className="truncate max-w-[200px]">{specs.slice(0, 2).join(", ")}{specs.length > 2 ? ` +${specs.length - 2}` : ""}</span>
          )}
          {master.pwaLogin && <OnlineBadge lastSeenAt={master.lastSeenAt} />}
        </div>

        {/* Tags row */}
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-[10px] bg-violet-50 text-violet-600 rounded-md px-1.5 py-0.5 font-medium">
                {tag}
              </span>
            ))}
            {tags.length > 4 && (
              <span className="text-[10px] text-gray-300">+{tags.length - 4}</span>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-[12px] flex-shrink-0">
        <div className="text-center hidden sm:block">
          <div className="flex items-center gap-0.5 justify-center">
            {[1,2,3,4,5].map(i => (
              <Star key={i} className={`w-2.5 h-2.5 ${i <= Math.round(master.rating) ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
            ))}
          </div>
          <div className="text-[10px] text-gray-400">{master.rating.toFixed(1)}</div>
        </div>

        <div className="text-center hidden md:block">
          <div className="font-semibold text-gray-700 flex items-center gap-0.5">
            <Briefcase className="w-3 h-3 text-gray-400" />{master.totalOrders}
          </div>
          <div className="text-[10px] text-gray-400">заказов</div>
        </div>

        {master.debt > 0 ? (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-0.5 text-red-500 font-semibold text-[12px]">
              <AlertTriangle className="w-3 h-3" />
              <span>{master.debt.toLocaleString("ru-RU")} ₽</span>
            </div>
            <div className="text-[9px] text-red-300">долг</div>
          </div>
        ) : null}

        {/* Quick chat button */}
        <button
          onClick={e => { e.stopPropagation(); onGoToChat(master.id); }}
          title="Открыть чат"
          className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>

        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(master.id); }}
            title="В корзину"
            className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
