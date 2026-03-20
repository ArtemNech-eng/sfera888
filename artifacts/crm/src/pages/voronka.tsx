import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import {
  Plus, Settings, X, ChevronUp, ChevronDown, Trash2,
  Star, Phone, MapPin, Briefcase, AlertTriangle, User,
  ArrowRight, Edit2, MessageSquare, Zap, Smartphone,
  RefreshCw, ChevronRight, UserX, Banknote, Check,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Avatar, MasterDrawer } from "@/components/master-drawer";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoronkaColumn { id: number; name: string; position: number; receivesOrders: boolean; color: string; }
interface ActiveOrder { orderId: number; district: string; city: string; serviceType: string; status: string; clientPhone: string | null; clientName: string | null; scheduledAt: string | null; }
interface VoronkaMaster { id: number; alias: string; city: string; specialization: string; specializations: string[]; tags: string[]; telegramId: string | null; pwaLogin: string | null; phone: string | null; status: string; rating: number; totalOrders: number; acceptedOrders: number; debt: number; voronkaColumnId: number | null; isTestMaster: boolean; avatarUrl: string | null; activeOrders: ActiveOrder[]; contractLink: string | null; createdAt: string; }

interface MasterTask { id: number; masterId: number; text: string; dueAt: string | null; isCompleted: boolean; createdBy: string | null; createdAt: string; }
interface HistoryOrder { id: number; status: string; serviceType: string; district: string; city: string; clientName: string | null; clientPhone: string | null; scheduledAt: string | null; completedAt: string | null; createdAt: string; }
interface ChatMessage { id: number; text: string; photoUrl: string | null; fromMaster: boolean; senderName: string | null; isRead: boolean; createdAt: string; }

// ─── Color map ────────────────────────────────────────────────────────────────

const COLORS: Record<string, { accent: string; badgeBg: string; badgeText: string; headerBg: string; dot: string; btn: string }> = {
  blue:   { accent: "#60a5fa", badgeBg: "rgba(59,130,246,0.13)",  badgeText: "#1d4ed8", headerBg: "rgba(219,234,254,0.45)", dot: "bg-blue-400",    btn: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
  green:  { accent: "#34d399", badgeBg: "rgba(52,211,153,0.13)",  badgeText: "#065f46", headerBg: "rgba(209,250,229,0.45)", dot: "bg-emerald-400", btn: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  orange: { accent: "#fb923c", badgeBg: "rgba(251,146,60,0.13)",  badgeText: "#c2410c", headerBg: "rgba(255,237,213,0.45)", dot: "bg-orange-400",  btn: "bg-orange-50 text-orange-700 hover:bg-orange-100" },
  red:    { accent: "#f87171", badgeBg: "rgba(248,113,113,0.13)", badgeText: "#b91c1c", headerBg: "rgba(254,226,226,0.45)", dot: "bg-red-400",     btn: "bg-red-50 text-red-700 hover:bg-red-100" },
  purple: { accent: "#a78bfa", badgeBg: "rgba(167,139,250,0.13)", badgeText: "#5b21b6", headerBg: "rgba(237,233,254,0.45)", dot: "bg-purple-400",  btn: "bg-purple-50 text-purple-700 hover:bg-purple-100" },
  yellow: { accent: "#fbbf24", badgeBg: "rgba(251,191,36,0.13)",  badgeText: "#92400e", headerBg: "rgba(254,243,199,0.45)", dot: "bg-yellow-400",  btn: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100" },
  teal:   { accent: "#2dd4bf", badgeBg: "rgba(45,212,191,0.13)",  badgeText: "#0f766e", headerBg: "rgba(204,251,241,0.45)", dot: "bg-teal-400",    btn: "bg-teal-50 text-teal-700 hover:bg-teal-100" },
  pink:   { accent: "#f472b6", badgeBg: "rgba(244,114,182,0.13)", badgeText: "#9d174d", headerBg: "rgba(252,231,243,0.45)", dot: "bg-pink-400",    btn: "bg-pink-50 text-pink-700 hover:bg-pink-100" },
  grey:   { accent: "#94a3b8", badgeBg: "rgba(148,163,184,0.13)", badgeText: "#475569", headerBg: "rgba(241,245,249,0.45)", dot: "bg-slate-400",   btn: "bg-slate-50 text-slate-700 hover:bg-slate-100" },
};

const COLOR_OPTS = Object.keys(COLORS);
function clr(key: string) { return COLORS[key] ?? COLORS.blue; }


function timeAgo(d: string) { try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ru }); } catch { return ""; } }
function ts(d: string) { try { return format(new Date(d), "HH:mm", { locale: ru }); } catch { return ""; } }
function dateShort(d: string | null) { if (!d) return "—"; try { return format(new Date(d), "d MMM yyyy", { locale: ru }); } catch { return "—"; } }

// ─── Master Card ──────────────────────────────────────────────────────────────

function MasterCard({ master, columns, onMove, onOpenDrawer, onDragStart, onDragEnd, isDragging, anyDragging }: {
  master: VoronkaMaster;
  columns: VoronkaColumn[];
  onMove: (id: number, colId: number | null) => void;
  onOpenDrawer: (master: VoronkaMaster) => void;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  anyDragging: boolean;
}) {
  const [open, setOpen] = useState(false);
  const others = columns.filter(c => c.id !== master.voronkaColumnId);
  const hasActiveOrders = master.activeOrders.length > 0;

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(master.id); }}
      onDragEnd={onDragEnd}
      className={`rounded-xl overflow-hidden transition-all duration-200 ${
        isDragging ? "opacity-40 scale-95 cursor-grabbing" : "cursor-grab"
      }`}
      style={{
        background: "rgba(255,255,255,0.82)",
        border: "1px solid rgba(255,255,255,0.95)",
        boxShadow: isDragging ? "none" : "0 2px 10px rgba(120,80,220,0.06), 0 1px 3px rgba(0,0,0,0.04)",
        pointerEvents: anyDragging && !isDragging ? "none" : "auto",
      }}
    >
      {/* Clickable card body */}
      <div className="cursor-pointer" onClick={() => { if (!isDragging) onOpenDrawer(master); }}>
        <div className="px-3 pt-2.5 pb-2">
          <div className="flex items-center gap-2">
            <Avatar name={master.alias} id={master.id} avatarUrl={master.avatarUrl} size={28} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-semibold text-[12px] text-gray-800 leading-tight truncate">{master.alias}</span>
                {master.pwaLogin && <Smartphone className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" />}
                {master.isTestMaster && <span className="text-[9px] bg-amber-100 text-amber-700 rounded-md px-1 font-semibold flex-shrink-0">ТЕСТ</span>}
              </div>
              <p className="text-[10px] text-gray-400 truncate leading-tight">{master.city}</p>
            </div>
            <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
          </div>

          {/* Specs */}
          {(master.specializations?.length > 0 || master.specialization) && (
            <div className="flex flex-wrap gap-0.5 mt-1.5">
              {(master.specializations?.length > 0 ? master.specializations : [master.specialization]).slice(0, 2).map(s => (
                <span key={s} className="text-[9px] bg-gray-100/80 text-gray-500 rounded-md px-1.5 py-0.5 font-medium leading-tight truncate max-w-[90px]">{s}</span>
              ))}
              {(master.specializations?.length ?? 0) > 2 && (
                <span className="text-[9px] bg-gray-100/80 text-gray-400 rounded-md px-1.5 py-0.5">+{master.specializations.length - 2}</span>
              )}
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(i => (
                <Star key={i} className={`w-2.5 h-2.5 ${i <= Math.round(master.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <span className="flex items-center gap-0.5"><Briefcase className="w-2.5 h-2.5" />{master.totalOrders}</span>
              {master.debt > 0 && (
                <span className="flex items-center gap-0.5 text-red-400 font-medium">
                  <AlertTriangle className="w-2.5 h-2.5" />{(master.debt/1000).toFixed(0)}k
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Active orders */}
        {hasActiveOrders && (
          <div className="px-3 py-1.5 space-y-1" style={{ borderTop: "1px solid rgba(0,0,0,0.04)", background: "rgba(239,246,255,0.5)" }}>
            {master.activeOrders.map(o => (
              <div key={o.orderId} className="flex items-center gap-1 text-[10px]">
                <Zap className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />
                <span className="font-semibold text-blue-600 flex-shrink-0">#{o.orderId}</span>
                <span className="text-gray-400 truncate">{o.serviceType}</span>
                {o.clientPhone && (
                  <a href={`tel:${o.clientPhone}`} onClick={e => e.stopPropagation()}
                    className="ml-auto text-emerald-500 font-medium hover:underline flex-shrink-0 flex items-center gap-0.5">
                    <Phone className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Move dropdown */}
      <div className="relative" style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-black/[0.03] transition-colors"
        >
          <ArrowRight className="w-2.5 h-2.5" />Переместить
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute bottom-full left-0 right-0 rounded-xl shadow-xl z-30 overflow-hidden"
                 style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.9)", boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
              {others.map(col => {
                const c = clr(col.color);
                return (
                  <button key={col.id} onClick={() => { onMove(master.id, col.id); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-gray-700 hover:bg-black/[0.03] transition-colors">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.accent }} />
                    {col.name}
                  </button>
                );
              })}
              <button onClick={() => { onMove(master.id, null); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-gray-400 hover:bg-black/[0.03] transition-colors"
                style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                Без колонки
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Suspended Column ─────────────────────────────────────────────────────────

function SuspendedColumn({ masters, onOpenDrawer }: {
  masters: VoronkaMaster[];
  onOpenDrawer: (m: VoronkaMaster) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const ACCENT = "#f87171";
  return (
    <div className="flex-shrink-0 w-[230px] flex flex-col rounded-2xl overflow-hidden"
         style={{ background: "rgba(255,255,255,0.60)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", border: "1px solid rgba(255,255,255,0.82)", boxShadow: "0 4px 20px rgba(120,80,220,0.07), 0 1px 3px rgba(0,0,0,0.04)", borderTop: `2px solid ${ACCENT}` }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(254,226,226,0.35)", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
        <UserX className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ACCENT }} />
        <span className="font-semibold text-gray-700 text-[13px] flex-1 truncate">Отстранённые</span>
        <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 flex-shrink-0"
              style={{ background: "rgba(248,113,113,0.14)", color: "#b91c1c" }}>{masters.length}</span>
        <button onClick={() => setCollapsed(c => !c)} className="p-0.5 rounded-lg transition-colors hover:bg-black/[0.05]">
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronUp className="w-3.5 h-3.5 text-gray-400" />}
        </button>
      </div>

      {/* Cards */}
      {!collapsed && (
        <div className="voronka-scroll flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
          {masters.map(m => (
            <div key={m.id} onClick={() => onOpenDrawer(m)}
              className="rounded-xl px-2.5 py-2 cursor-pointer transition-all duration-150 flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <Avatar name={m.alias} id={m.id} avatarUrl={m.avatarUrl} size={26} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-gray-700 truncate">{m.alias}</p>
                <p className="text-[10px] text-gray-400 truncate">{m.city}</p>
              </div>
              {m.pwaLogin && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Debtor Column ────────────────────────────────────────────────────────────

function DebtorColumn({ masters, onOpenDrawer }: {
  masters: VoronkaMaster[];
  onOpenDrawer: (m: VoronkaMaster) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totalDebt = masters.reduce((s, m) => s + m.debt, 0);

  const ACCENT = "#fb923c";
  return (
    <div className="flex-shrink-0 w-[230px] flex flex-col rounded-2xl overflow-hidden"
         style={{ background: "rgba(255,255,255,0.60)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", border: "1px solid rgba(255,255,255,0.82)", boxShadow: "0 4px 20px rgba(120,80,220,0.07), 0 1px 3px rgba(0,0,0,0.04)", borderTop: `2px solid ${ACCENT}` }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(255,237,213,0.35)", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
        <Banknote className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ACCENT }} />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-gray-700 text-[13px]">Должники</span>
          {totalDebt > 0 && (
            <p className="text-[9px] text-orange-400 leading-none">{(totalDebt / 1000).toFixed(0)}k ₽</p>
          )}
        </div>
        <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 flex-shrink-0"
              style={{ background: "rgba(251,146,60,0.14)", color: "#c2410c" }}>{masters.length}</span>
        <button onClick={() => setCollapsed(c => !c)} className="p-0.5 rounded-lg transition-colors hover:bg-black/[0.05]">
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronUp className="w-3.5 h-3.5 text-gray-400" />}
        </button>
      </div>
      {!collapsed && (
        <div className="voronka-scroll flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
          {masters.map(m => (
            <div key={m.id} onClick={() => onOpenDrawer(m)}
              className="rounded-xl px-2.5 py-2 cursor-pointer transition-all duration-150"
              style={{ background: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-2">
                <Avatar name={m.alias} id={m.id} avatarUrl={m.avatarUrl} size={26} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-700 truncate">{m.alias}</p>
                  <p className="text-[10px] text-gray-400 truncate">{m.city}</p>
                </div>
                {m.pwaLogin && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
              </div>
              <div className="flex items-center gap-1 mt-1.5 text-[10px] font-semibold" style={{ color: ACCENT }}>
                <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                {m.debt.toLocaleString("ru")} ₽
                {m.activeOrders.length > 0 && (
                  <span className="ml-auto text-gray-400 font-normal">{m.activeOrders.length} зак.</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({ col, masters, columns, onMove, onOpenDrawer, draggingId, onDragStartMaster, onDragEndMaster, onDropMaster }: {
  col: VoronkaColumn | null;
  masters: VoronkaMaster[];
  columns: VoronkaColumn[];
  onMove: (id: number, colId: number | null) => void;
  onOpenDrawer: (master: VoronkaMaster) => void;
  draggingId: number | null;
  onDragStartMaster: (id: number) => void;
  onDragEndMaster: () => void;
  onDropMaster: (masterId: number, colId: number | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const c = col ? clr(col.color) : { top: "border-t-gray-300", header: "from-gray-50 to-white", badge: "bg-gray-400", dot: "bg-gray-300", btn: "", accent: "#94a3b8", badgeBg: "rgba(148,163,184,0.13)", badgeText: "#475569", headerBg: "rgba(248,250,252,0.45)" };
  const name = col?.name ?? "Без колонки";
  const receivesOrders = col?.receivesOrders ?? false;

  const isActiveDrop = dragOver && draggingId !== null;
  const accent = c.accent;

  // Fix: handle drag on the OUTER column div so hovering over child cards doesn't break drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragOver) setDragOver(true);
  };
  // Fix: only clear dragOver when leaving the entire column, not child elements
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (draggingId !== null) onDropMaster(draggingId, col?.id ?? null);
  };

  return (
    <div
      className="flex-shrink-0 w-[230px] flex flex-col rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.60)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", border: isActiveDrop ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.82)", boxShadow: isActiveDrop ? `0 0 0 2px ${accent}33, 0 4px 20px rgba(120,80,220,0.10)` : "0 4px 20px rgba(120,80,220,0.07), 0 1px 3px rgba(0,0,0,0.04)", borderTop: `2px solid ${accent}`, transition: "border 0.15s, box-shadow 0.15s" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-3 py-2.5 flex items-center justify-between"
           style={{ background: isActiveDrop ? `${accent}15` : c.headerBg, borderBottom: "1px solid rgba(0,0,0,0.04)", transition: "background 0.15s" }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-[13px] text-gray-700 truncate">{name}</span>
          {receivesOrders && (
            <Zap className="w-3 h-3 text-emerald-500 flex-shrink-0" title="Принимает заказы" />
          )}
        </div>
        <span className="text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0 ml-1"
              style={{ background: c.badgeBg, color: c.badgeText }}>
          {masters.length}
        </span>
      </div>
      <div
        className="voronka-scroll flex-1 overflow-y-auto p-2 space-y-1.5"
        style={{ maxHeight: "calc(100vh - 185px)", background: isActiveDrop ? `${accent}08` : "transparent", transition: "background 0.15s" }}
      >
        {masters.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-6 transition-colors duration-150 ${isActiveDrop ? "text-indigo-300" : "text-gray-300"}`}>
            {isActiveDrop
              ? <><div className="w-8 h-8 rounded-xl border-2 border-dashed border-indigo-300 mb-1" /><p className="text-[11px]">Сюда</p></>
              : <><User className="w-5 h-5 mb-1" /><p className="text-[11px]">Пусто</p></>
            }
          </div>
        ) : masters.map(m => (
          <MasterCard
            key={m.id} master={m} columns={columns} onMove={onMove} onOpenDrawer={onOpenDrawer}
            onDragStart={onDragStartMaster}
            onDragEnd={onDragEndMaster}
            isDragging={m.id === draggingId}
            anyDragging={draggingId !== null}
          />
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
                  <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: c.headerBg }}>
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
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    const [cR, mR] = await Promise.all([
      fetch("/api/voronka/columns", { credentials: "include" }),
      fetch("/api/voronka/masters", { credentials: "include" }),
    ]);
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
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voronkaColumnId: colId }),
    });
  };

  const updateMasterLocal = (id: number, data: Partial<VoronkaMaster>) => {
    setMasters(p => p.map(m => m.id === id ? { ...m, ...data } : m));
    setDrawerMaster(p => p && p.id === id ? { ...p, ...data } : p);
  };

  const updateColumn = async (id: number, data: Partial<VoronkaColumn>) => {
    const res = await fetch(`/api/voronka/columns/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { const u = await res.json(); setColumns(p => p.map(c => c.id === id ? u : c)); }
  };

  const deleteColumn = async (id: number) => {
    await fetch(`/api/voronka/columns/${id}`, { method: "DELETE", credentials: "include" });
    setColumns(p => p.filter(c => c.id !== id));
    setMasters(p => p.map(m => m.voronkaColumnId === id ? { ...m, voronkaColumnId: null } : m));
  };

  const createColumn = async (name: string, receivesOrders: boolean, color: string) => {
    const res = await fetch("/api/voronka/columns", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, receivesOrders, color }) });
    if (res.ok) { const col = await res.json(); setColumns(p => [...p, col]); }
  };

  const reorderColumns = async (order: number[]) => {
    const res = await fetch("/api/voronka/columns/reorder", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) });
    if (res.ok) setColumns(await res.json());
  };

  const sorted = [...columns].sort((a, b) => a.position - b.position);
  // Suspended → always in SuspendedColumn (highest priority, never in regular columns)
  const suspended = masters.filter(m => m.status === "suspended");
  // Debtors (not suspended) → always in DebtorColumn (never in regular columns)
  const debtors = masters.filter(m => m.status !== "suspended" && m.debt > 0);
  // Active non-debtor masters without a column → "Без колонки" section
  const unassigned = masters.filter(m => m.status !== "suspended" && m.debt <= 0 && (!m.voronkaColumnId || !columns.find(c => c.id === m.voronkaColumnId)));

  const totalDebt = masters.reduce((s, m) => s + m.debt, 0);
  const activeCount = masters.filter(m => m.activeOrders.length > 0).length;
  const tgCount = masters.filter(m => m.pwaLogin).length;

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="voronka">
      <Layout>
        <div className="h-full flex flex-col">
          <div className="flex items-start justify-between mb-5 flex-shrink-0">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Воронка мастеров</h1>
              <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                <span>{masters.length} мастеров</span>
                <span className="flex items-center gap-1 text-emerald-500"><Smartphone className="w-3 h-3"/>{tgCount} в приложении</span>
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
            <div className="voronka-scroll flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
              {sorted.map(col => (
                <KanbanColumn key={col.id} col={col}
                  masters={masters.filter(m => m.status !== "suspended" && m.debt <= 0 && m.voronkaColumnId === col.id)}
                  columns={columns} onMove={moveMaster} onOpenDrawer={setDrawerMaster}
                  draggingId={draggingId}
                  onDragStartMaster={setDraggingId}
                  onDragEndMaster={() => setDraggingId(null)}
                  onDropMaster={(mid, colId) => { moveMaster(mid, colId); setDraggingId(null); }}
                />
              ))}
              {unassigned.length > 0 && (
                <KanbanColumn col={null} masters={unassigned} columns={columns} onMove={moveMaster} onOpenDrawer={setDrawerMaster}
                  draggingId={draggingId}
                  onDragStartMaster={setDraggingId}
                  onDragEndMaster={() => setDraggingId(null)}
                  onDropMaster={(mid, colId) => { moveMaster(mid, colId); setDraggingId(null); }}
                />
              )}
              {/* ── Debtors (debt > 0, not suspended) ── */}
              {debtors.length > 0 && (
                <DebtorColumn masters={debtors} onOpenDrawer={setDrawerMaster} />
              )}
              {/* ── Suspended masters ── */}
              {suspended.length > 0 && (
                <SuspendedColumn masters={suspended} onOpenDrawer={setDrawerMaster} />
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
