import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import {
  Plus, Settings, X, Check, ChevronUp, ChevronDown, Trash2,
  Star, Phone, MapPin, Briefcase, AlertTriangle, User,
  ArrowRight, Edit2, MessageSquare, Zap, Clock
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoronkaColumn { id: number; name: string; position: number; receivesOrders: boolean; color: string; }
interface ActiveOrder { orderId: number; district: string; city: string; serviceType: string; status: string; clientPhone: string | null; clientName: string | null; scheduledAt: string | null; }
interface VoronkaMaster { id: number; alias: string; city: string; specialization: string; telegramId: string | null; phone: string | null; status: string; rating: number; totalOrders: number; acceptedOrders: number; debt: number; voronkaColumnId: number | null; isTestMaster: boolean; avatarUrl: string | null; activeOrders: ActiveOrder[]; createdAt: string; }

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
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover flex-shrink-0 border border-gray-100"
        style={{ width: size, height: size }}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className={`${bg} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}>
      {initials}
    </div>
  );
}

// ─── Master Card ──────────────────────────────────────────────────────────────

function MasterCard({ master, columns, onMove }: { master: VoronkaMaster; columns: VoronkaColumn[]; onMove: (id: number, colId: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const others = columns.filter(c => c.id !== master.voronkaColumnId);
  const hasActiveOrders = master.activeOrders.length > 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Card top bar */}
      <div className="px-3.5 pt-3.5 pb-2.5">
        <div className="flex items-start gap-3">
          <Avatar name={master.alias} id={master.id} avatarUrl={master.avatarUrl} size={40} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-semibold text-[13px] text-gray-800 leading-tight">{master.alias}</p>
              {master.isTestMaster && (
                <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-semibold">ТЕСТ</span>
              )}
              {master.telegramId && (
                <span className="text-[10px] bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
                  <MessageSquare className="w-2.5 h-2.5" />TG
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{master.city} · {master.specialization}</p>
          </div>
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

function KanbanColumn({ col, masters, columns, onMove }: { col: VoronkaColumn | null; masters: VoronkaMaster[]; columns: VoronkaColumn[]; onMove: (id: number, colId: number | null) => void }) {
  const c = col ? clr(col.color) : { top: "border-t-gray-300", header: "from-gray-50 to-white", badge: "bg-gray-400", dot: "bg-gray-300", btn: "" };
  const name = col?.name ?? "Без колонки";
  const receivesOrders = col?.receivesOrders ?? false;

  return (
    <div className="flex-shrink-0 w-[280px] flex flex-col">
      {/* Column header */}
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

      {/* Cards */}
      <div className="flex-1 bg-gray-50/60 border border-t-0 border-gray-100 rounded-b-2xl overflow-y-auto p-2.5 space-y-2.5" style={{ maxHeight: "calc(100vh - 195px)" }}>
        {masters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-300">
            <User className="w-8 h-8 mb-2" />
            <p className="text-[12px]">Пусто</p>
          </div>
        ) : masters.map(m => (
          <MasterCard key={m.id} master={m} columns={columns} onMove={onMove} />
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
              <div key={col.id} className={`rounded-xl border border-gray-100 overflow-hidden`}>
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

          {/* New column */}
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

  const fetchAll = useCallback(async () => {
    const [cR, mR] = await Promise.all([fetch("/api/voronka/columns"), fetch("/api/voronka/masters")]);
    if (cR.ok) setColumns(await cR.json());
    if (mR.ok) setMasters(await mR.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 7000); return () => clearInterval(t); }, [fetchAll]);

  const moveMaster = async (masterId: number, colId: number | null) => {
    setMasters(p => p.map(m => m.id === masterId ? { ...m, voronkaColumnId: colId } : m));
    await fetch(`/api/voronka/masters/${masterId}/column`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voronkaColumnId: colId }),
    });
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

  // Summary stats
  const totalDebt = masters.reduce((s, m) => s + m.debt, 0);
  const activeCount = masters.filter(m => m.activeOrders.length > 0).length;
  const tgCount = masters.filter(m => m.telegramId).length;

  return (
    <ProtectedRoute>
      <Layout>
        <div className="h-full flex flex-col">
          {/* Header */}
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
                  columns={columns} onMove={moveMaster} />
              ))}
              {unassigned.length > 0 && (
                <KanbanColumn col={null} masters={unassigned} columns={columns} onMove={moveMaster} />
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
      </Layout>
    </ProtectedRoute>
  );
}
