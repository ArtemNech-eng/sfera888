import { useState, useMemo, useEffect } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import {
  Loader2, Plus, Star, Phone, MessageSquare, Briefcase,
  AlertTriangle, MapPin, Search, X, Users, Zap, UserX, Filter,
} from "lucide-react";
import { Avatar, MasterDrawer } from "@/components/master-drawer";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateMaster, useGetCities } from "@workspace/api-client-react";

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
}


// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ master }: { master: Master }) {
  if (master.status === "suspended") {
    return <span className="text-[10px] bg-red-100 text-red-600 rounded-full px-2 py-0.5 font-semibold">Отстранён</span>;
  }
  if (master.activeOrders.length > 0) {
    return <span className="text-[10px] bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-semibold flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />На объекте</span>;
  }
  return <span className="text-[10px] bg-emerald-100 text-emerald-600 rounded-full px-2 py-0.5 font-semibold">Свободен</span>;
}

// ─── Masters page ─────────────────────────────────────────────────────────────

export default function Masters() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "free" | "onsite" | "suspended">("all");
  const [drawerMaster, setDrawerMaster] = useState<Master | null>(null);
  const queryClient = useQueryClient();

  const [masters, setMasters] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch enriched masters from voronka endpoint
  useEffect(() => {
    fetch("/api/voronka/masters")
      .then(r => r.ok ? r.json() : [])
      .then(data => { setMasters(Array.isArray(data) ? data : []); setLoading(false); })
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

  const counts = useMemo(() => ({
    total: masters.length,
    free: masters.filter(m => m.status !== "suspended" && m.activeOrders.length === 0).length,
    onsite: masters.filter(m => m.activeOrders.length > 0).length,
    suspended: masters.filter(m => m.status === "suspended").length,
  }), [masters]);

  const filtered = useMemo(() => {
    return masters.filter(m => {
      if (search) {
        const q = search.toLowerCase();
        const match = m.alias.toLowerCase().includes(q)
          || m.city.toLowerCase().includes(q)
          || (m.phone ?? "").includes(q)
          || m.specializations.some(s => s.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (cityFilter !== "all" && m.city !== cityFilter) return false;
      if (statusFilter === "free" && (m.status === "suspended" || m.activeOrders.length > 0)) return false;
      if (statusFilter === "onsite" && m.activeOrders.length === 0) return false;
      if (statusFilter === "suspended" && m.status !== "suspended") return false;
      return true;
    });
  }, [masters, search, cityFilter, statusFilter]);

  const hasFilters = search || cityFilter !== "all" || statusFilter !== "all";

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator"]}>
      <Layout>
        <div className="h-full flex flex-col gap-4">

          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-xl font-bold text-gray-800">База мастеров</h1>
              <p className="text-xs text-gray-400 mt-0.5">Управление исполнителями</p>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-blue-600 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>

          {/* Stats row */}
          <div className="flex gap-2 flex-shrink-0">
            {[
              { label: "Всего", value: counts.total, icon: Users, color: "text-gray-600 bg-gray-50 border-gray-100", active: statusFilter === "all", onClick: () => setStatusFilter("all") },
              { label: "Свободные", value: counts.free, icon: Users, color: "text-emerald-600 bg-emerald-50 border-emerald-100", active: statusFilter === "free", onClick: () => setStatusFilter(statusFilter === "free" ? "all" : "free") },
              { label: "На объекте", value: counts.onsite, icon: Zap, color: "text-blue-600 bg-blue-50 border-blue-100", active: statusFilter === "onsite", onClick: () => setStatusFilter(statusFilter === "onsite" ? "all" : "onsite") },
              { label: "Отстранённые", value: counts.suspended, icon: UserX, color: "text-red-500 bg-red-50 border-red-100", active: statusFilter === "suspended", onClick: () => setStatusFilter(statusFilter === "suspended" ? "all" : "suspended") },
            ].map(s => (
              <button
                key={s.label}
                onClick={s.onClick}
                className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${s.color} ${s.active ? "ring-2 ring-offset-1 ring-current" : "hover:brightness-95"}`}
              >
                <s.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-lg font-bold leading-none">{s.value}</div>
                  <div className="text-[10px] opacity-70 font-medium leading-tight mt-0.5 truncate">{s.label}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Filters row */}
          <div className="flex gap-2 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Поиск по имени, городу, специализации..."
                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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
            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setCityFilter("all"); setStatusFilter("all"); }}
                className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 flex items-center gap-1.5"
              >
                <X className="w-3 h-3" /> Сбросить
              </button>
            )}
          </div>

          {/* Count */}
          <div className="text-xs text-gray-400 flex-shrink-0 -mt-2">
            Показано: {filtered.length} из {masters.length}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto voronka-scroll space-y-1.5">
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
              <MasterRow key={m.id} master={m} onOpenDrawer={setDrawerMaster} />
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

function MasterRow({ master, onOpenDrawer }: { master: Master; onOpenDrawer: (m: Master) => void }) {
  const specs = master.specializations.length > 0 ? master.specializations : master.specialization ? [master.specialization] : [];

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
          {master.telegramId && (
            <span className="text-[10px] bg-blue-50 text-blue-500 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
              <MessageSquare className="w-2.5 h-2.5" />TG
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{master.city || "—"}</span>
          {master.phone && <span className="flex items-center gap-0.5 text-emerald-600"><Phone className="w-3 h-3" />{master.phone}</span>}
          {specs.length > 0 && (
            <span className="truncate max-w-[200px]">{specs.slice(0, 2).join(", ")}{specs.length > 2 ? ` +${specs.length - 2}` : ""}</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-[12px] flex-shrink-0">
        <div className="text-center hidden sm:block">
          <div className="flex items-center gap-0.5 justify-center">
            {[1,2,3,4,5].map(i => (
              <Star key={i} className={`w-2.5 h-2.5 ${i <= Math.round(master.rating) ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
            ))}
          </div>
          <div className="text-[10px] text-gray-400">{master.rating.toFixed(1)}</div>
        </div>
        <div className="text-center hidden md:block">
          <div className="font-semibold text-gray-700 flex items-center gap-0.5"><Briefcase className="w-3 h-3 text-gray-400" />{master.totalOrders}</div>
          <div className="text-[10px] text-gray-400">заказов</div>
        </div>
        {master.debt > 0 ? (
          <div className="flex items-center gap-0.5 text-red-500 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{(master.debt / 1000).toFixed(0)}k₽</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
