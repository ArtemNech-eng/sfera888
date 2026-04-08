import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { ProtectedRoute, useAuth } from "@/hooks/use-auth";
import {
  Loader2, Plus, Star, Phone, MessageSquare, Briefcase,
  AlertTriangle, MapPin, Search, X, Users, Zap, UserX, Filter,
  FileSignature, Trash2, Smartphone, ChevronDown, Tag, ArrowUpDown, XCircle,
  LayoutList, Columns, Settings, ArrowRight, Edit2, Banknote, User,
  ChevronUp, RefreshCw, AlertCircle, Clock, Check, UserCheck, SlidersHorizontal, CheckCircle2,
  Bot, KeyRound,
} from "lucide-react";
import { Avatar, MasterDrawer, OnlineBadge } from "@/components/master-drawer";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useCreateMaster, useGetCities } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveOrder {
  orderId: number; serviceType: string; city: string; district: string;
  clientName: string | null; clientPhone: string | null;
  status?: string; scheduledAt?: string | null;
}

interface Master {
  id: number; alias: string; city: string; specialization: string;
  specializations: string[]; tags: string[]; telegramId: string | null;
  phone: string | null; status: string; rating: number; totalOrders: number;
  acceptedOrders: number; debt: number; voronkaColumnId: number | null;
  isTestMaster: boolean; avatarUrl: string | null; activeOrders: ActiveOrder[];
  createdAt: string; pwaLogin?: string | null; lastSeenAt?: string | null;
  cancelCount30d?: number; cancelCount7d?: number;
  completedOrders?: number; cancelledOrders?: number;
  pendingTransactionsCount?: number; contractLink?: string | null;
  maxChatId?: string | null;
  servicePrices?: { service: string; priceFrom: number }[] | null;
}

interface VoronkaColumn {
  id: number; name: string; position: number; receivesOrders: boolean; color: string;
}

// ─── View persistence ─────────────────────────────────────────────────────────

type ViewMode = "list" | "kanban";
function getInitialView(): ViewMode {
  try {
    const v = localStorage.getItem("masters_view");
    if (v === "kanban" || v === "list") return v;
  } catch { /* */ }
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "kanban") return "kanban";
  return "list";
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = "name" | "rating" | "orders" | "debt" | "date" | "cancels";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name",    label: "По алфавиту" },
  { key: "rating",  label: "По рейтингу" },
  { key: "orders",  label: "По заказам" },
  { key: "debt",    label: "По долгу" },
  { key: "date",    label: "По дате" },
  { key: "cancels", label: "По отменам" },
];
function sortMasters(list: Master[], key: SortKey): Master[] {
  return [...list].sort((a, b) => {
    switch (key) {
      case "name":    return a.alias.localeCompare(b.alias, "ru");
      case "rating":  return b.rating - a.rating;
      case "orders":  return b.totalOrders - a.totalOrders;
      case "debt":    return b.debt - a.debt;
      case "date":    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "cancels": return (b.cancelCount30d ?? 0) - (a.cancelCount30d ?? 0);
    }
  });
}

// ─── Kanban color map ─────────────────────────────────────────────────────────

const COLORS: Record<string, { accent: string; badgeBg: string; badgeText: string; headerBg: string; dot: string }> = {
  blue:   { accent: "#60a5fa", badgeBg: "rgba(59,130,246,0.13)",  badgeText: "#1d4ed8", headerBg: "rgba(219,234,254,0.45)", dot: "bg-blue-400" },
  green:  { accent: "#34d399", badgeBg: "rgba(52,211,153,0.13)",  badgeText: "#065f46", headerBg: "rgba(209,250,229,0.45)", dot: "bg-emerald-400" },
  orange: { accent: "#fb923c", badgeBg: "rgba(251,146,60,0.13)",  badgeText: "#c2410c", headerBg: "rgba(255,237,213,0.45)", dot: "bg-orange-400" },
  red:    { accent: "#f87171", badgeBg: "rgba(248,113,113,0.13)", badgeText: "#b91c1c", headerBg: "rgba(254,226,226,0.45)", dot: "bg-red-400" },
  purple: { accent: "#a78bfa", badgeBg: "rgba(167,139,250,0.13)", badgeText: "#5b21b6", headerBg: "rgba(237,233,254,0.45)", dot: "bg-purple-400" },
  yellow: { accent: "#fbbf24", badgeBg: "rgba(251,191,36,0.13)",  badgeText: "#92400e", headerBg: "rgba(254,243,199,0.45)", dot: "bg-yellow-400" },
  teal:   { accent: "#2dd4bf", badgeBg: "rgba(45,212,191,0.13)",  badgeText: "#0f766e", headerBg: "rgba(204,251,241,0.45)", dot: "bg-teal-400" },
  pink:   { accent: "#f472b6", badgeBg: "rgba(244,114,182,0.13)", badgeText: "#9d174d", headerBg: "rgba(252,231,243,0.45)", dot: "bg-pink-400" },
  grey:   { accent: "#94a3b8", badgeBg: "rgba(148,163,184,0.13)", badgeText: "#475569", headerBg: "rgba(241,245,249,0.45)", dot: "bg-slate-400" },
};
const COLOR_OPTS = Object.keys(COLORS);
function clr(key: string) { return COLORS[key] ?? COLORS.blue; }

function timeAgo(d: string) { try { return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ru }); } catch { return ""; } }

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ master }: { master: Master }) {
  if (master.status === "suspended")
    return <span className="text-[10px] bg-red-100 text-red-600 rounded-full px-2 py-0.5 font-semibold">Отстранён</span>;
  if (master.status === "pending_contract")
    return <span className="text-[10px] bg-amber-100 text-amber-600 rounded-full px-2 py-0.5 font-semibold">Ожидает договора</span>;
  if (master.activeOrders.length > 0)
    return <span className="text-[10px] bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 font-semibold flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />На объекте</span>;
  return <span className="text-[10px] bg-emerald-100 text-emerald-600 rounded-full px-2 py-0.5 font-semibold">Свободен</span>;
}

// ─── Compact list row ─────────────────────────────────────────────────────────

function MasterRow({ master, onOpenDrawer, onDelete, onGoToChat }: {
  master: Master; onOpenDrawer: (m: Master) => void;
  onDelete?: (id: number) => void; onGoToChat: (id: number) => void;
}) {
  const specs = master.specializations.length > 0 ? master.specializations : master.specialization ? [master.specialization] : [];
  const tags = master.tags ?? [];

  return (
    <div
      onClick={() => onOpenDrawer(master)}
      className="bg-white border border-gray-100 rounded-xl px-3.5 py-2.5 flex items-center gap-3 hover:shadow-md transition-all cursor-pointer group"
    >
      <Avatar name={master.alias} id={master.id} avatarUrl={master.avatarUrl} size={36} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-[13px] text-gray-800 leading-tight">{master.alias}</span>
          <StatusPill master={master} />
          {master.isTestMaster && <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-semibold">ТЕСТ</span>}
          {master.pwaLogin && (
            <span className="text-[10px] bg-emerald-50 text-emerald-600 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
              <Smartphone className="w-2.5 h-2.5" />APP
            </span>
          )}
          {master.maxChatId && (
            <span className="text-[10px] bg-blue-50 text-blue-600 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
              <Bot className="w-2.5 h-2.5" />MAX
            </span>
          )}
          {(master.cancelCount30d ?? 0) >= 3 && (
            <span className="text-[10px] bg-red-50 text-red-500 rounded-full px-1.5 py-0.5 font-semibold flex items-center gap-0.5">
              <XCircle className="w-2.5 h-2.5" />{master.cancelCount30d} отмен
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 flex-wrap">
          <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{master.city || "—"}</span>
          {master.phone && <span className="flex items-center gap-0.5 text-emerald-600"><Phone className="w-3 h-3" />{master.phone}</span>}
          {specs.length > 0 && <span className="truncate max-w-[200px]">{specs.slice(0, 2).join(", ")}{specs.length > 2 ? ` +${specs.length - 2}` : ""}</span>}
          {master.pwaLogin && <OnlineBadge lastSeenAt={master.lastSeenAt} />}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-[10px] bg-violet-50 text-violet-600 rounded-md px-1.5 py-0.5 font-medium">{tag}</span>
            ))}
            {tags.length > 4 && <span className="text-[10px] text-gray-300">+{tags.length - 4}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-[12px] flex-shrink-0">
        <div className="text-center hidden sm:block">
          <div className="flex items-center gap-0.5 justify-center">
            {[1,2,3,4,5].map(i => (
              <Star key={i} className={`w-2.5 h-2.5 ${i <= Math.round(master.rating) ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
            ))}
          </div>
          <div className="text-[10px] text-gray-400">{master.rating.toFixed(1)}</div>
        </div>
        <div className="hidden md:flex items-center gap-1.5">
          {master.activeOrders.length > 0 && (
            <span title={`Активных заказов: ${master.activeOrders.length}`}
              className="flex items-center gap-0.5 text-[10px] font-semibold bg-blue-50 text-blue-600 rounded-lg px-1.5 py-0.5">
              <Clock className="w-2.5 h-2.5" />{master.activeOrders.length}
            </span>
          )}
          {(master.completedOrders ?? 0) > 0 && (
            <span title={`Завершённых заказов: ${master.completedOrders}`}
              className="flex items-center gap-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600 rounded-lg px-1.5 py-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" />{master.completedOrders}
            </span>
          )}
          {(master.cancelledOrders ?? 0) > 0 && (
            <span title={`Отменённых заказов: ${master.cancelledOrders}`}
              className="flex items-center gap-0.5 text-[10px] font-semibold bg-gray-100 text-gray-400 rounded-lg px-1.5 py-0.5">
              <XCircle className="w-2.5 h-2.5" />{master.cancelledOrders}
            </span>
          )}
          {master.activeOrders.length === 0 && (master.completedOrders ?? 0) === 0 && (master.cancelledOrders ?? 0) === 0 && (
            <span className="text-[10px] text-gray-300 font-medium">0 зак.</span>
          )}
        </div>
        {master.debt > 0 && (
          <div className="text-center hidden md:block">
            <div className="font-semibold text-red-500">{master.debt.toLocaleString("ru")} ₽</div>
            <div className="text-[10px] text-gray-400">долг</div>
          </div>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onGoToChat(master.id); }}
            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-500 rounded-lg transition-colors"
            title="Открыть чат"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); if (confirm(`Удалить мастера ${master.alias}?`)) onDelete(master.id); }}
              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-400 rounded-lg transition-colors"
              title="Удалить"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Kanban master card ───────────────────────────────────────────────────────

function MasterCard({ master, columns, onMove, onOpenDrawer, onDragStart, onDragEnd, isDragging, anyDragging }: {
  master: Master; columns: VoronkaColumn[]; onMove: (id: number, colId: number | null) => void;
  onOpenDrawer: (master: Master) => void; onDragStart: (id: number) => void;
  onDragEnd: () => void; isDragging: boolean; anyDragging: boolean;
}) {
  const [open, setOpen] = useState(false);
  const others = columns.filter(c => c.id !== master.voronkaColumnId);
  const hasActiveOrders = master.activeOrders.length > 0;

  return (
    <div
      draggable onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(master.id); }} onDragEnd={onDragEnd}
      className={`rounded-xl overflow-hidden transition-all duration-200 ${isDragging ? "opacity-40 scale-95 cursor-grabbing" : "cursor-grab"}`}
      style={{ background: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: isDragging ? "none" : "0 2px 10px rgba(120,80,220,0.06), 0 1px 3px rgba(0,0,0,0.04)", pointerEvents: anyDragging && !isDragging ? "none" : "auto" }}
    >
      <div className="cursor-pointer" onClick={() => { if (!isDragging) onOpenDrawer(master); }}>
        <div className="px-3 pt-2.5 pb-2">
          <div className="flex items-center gap-2">
            <Avatar name={master.alias} id={master.id} avatarUrl={master.avatarUrl} size={28} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-semibold text-[12px] text-gray-800 leading-tight truncate">{master.alias}</span>
                {master.pwaLogin && <Smartphone className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" />}
                {master.maxChatId && <Bot className="w-2.5 h-2.5 text-blue-500 flex-shrink-0" />}
                {master.isTestMaster && <span className="text-[9px] bg-amber-100 text-amber-700 rounded-md px-1 font-semibold flex-shrink-0">ТЕСТ</span>}
              </div>
              <p className="text-[10px] text-gray-400 truncate leading-tight">{master.city}</p>
            </div>
            <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
          </div>

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

          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map(i => (
                <Star key={i} className={`w-2.5 h-2.5 ${i <= Math.round(master.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`} />
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <span className="flex items-center gap-0.5"><Briefcase className="w-2.5 h-2.5" />{master.totalOrders}</span>
              {(master.pendingTransactionsCount ?? 0) > 0 && (
                <span title={`Неоплаченных: ${master.pendingTransactionsCount}`} className="flex items-center gap-0.5 text-amber-500 font-medium">
                  <Clock className="w-2.5 h-2.5" />{master.pendingTransactionsCount}
                </span>
              )}
              {master.debt > 0 && (
                <span className="flex items-center gap-0.5 text-red-400 font-medium">
                  <AlertTriangle className="w-2.5 h-2.5" />{(master.debt/1000).toFixed(0)}k
                </span>
              )}
              {(master.cancelCount30d ?? 0) > 0 && (
                <span title={`Отмен за 30 дней: ${master.cancelCount30d}`}
                  className={`flex items-center gap-0.5 font-semibold ${(master.cancelCount30d ?? 0) >= 3 ? "text-red-500" : "text-orange-400"}`}>
                  <XCircle className="w-2.5 h-2.5" />{master.cancelCount30d}
                </span>
              )}
            </div>
          </div>
        </div>

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

      <div className="relative" style={{ borderTop: "1px solid rgba(0,0,0,0.04)" }} onClick={e => e.stopPropagation()}>
        <button onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-gray-400 hover:text-gray-600 hover:bg-black/[0.03] transition-colors">
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
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.accent }} />{col.name}
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

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({ col, masters, columns, onMove, onOpenDrawer, draggingId, onDragStartMaster, onDragEndMaster, onDropMaster }: {
  col: VoronkaColumn | null; masters: Master[]; columns: VoronkaColumn[];
  onMove: (id: number, colId: number | null) => void; onOpenDrawer: (master: Master) => void;
  draggingId: number | null; onDragStartMaster: (id: number) => void;
  onDragEndMaster: () => void; onDropMaster: (masterId: number, colId: number | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const c = col ? clr(col.color) : { accent: "#94a3b8", badgeBg: "rgba(148,163,184,0.13)", badgeText: "#475569", headerBg: "rgba(248,250,252,0.45)", dot: "bg-slate-400" };
  const name = col?.name ?? "Без колонки";
  const isActiveDrop = dragOver && draggingId !== null;
  const accent = c.accent;

  return (
    <div className="flex-shrink-0 w-[230px] flex flex-col rounded-2xl overflow-hidden"
         style={{ background: "rgba(255,255,255,0.60)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", border: isActiveDrop ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.82)", boxShadow: isActiveDrop ? `0 0 0 2px ${accent}33, 0 4px 20px rgba(120,80,220,0.10)` : "0 4px 20px rgba(120,80,220,0.07), 0 1px 3px rgba(0,0,0,0.04)", borderTop: `2px solid ${accent}`, transition: "border 0.15s, box-shadow 0.15s" }}
         onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!dragOver) setDragOver(true); }}
         onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
         onDrop={e => { e.preventDefault(); setDragOver(false); if (draggingId !== null) onDropMaster(draggingId, col?.id ?? null); }}
    >
      <div className="px-3 py-2.5 flex items-center justify-between"
           style={{ background: isActiveDrop ? `${accent}15` : c.headerBg, borderBottom: "1px solid rgba(0,0,0,0.04)", transition: "background 0.15s" }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-[13px] text-gray-700 truncate">{name}</span>
          {col?.receivesOrders && <Zap className="w-3 h-3 text-emerald-500 flex-shrink-0" title="Принимает заказы" />}
        </div>
        <span className="text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0 ml-1"
              style={{ background: c.badgeBg, color: c.badgeText }}>{masters.length}</span>
      </div>
      <div className="voronka-scroll flex-1 overflow-y-auto p-2 space-y-1.5"
           style={{ maxHeight: "calc(100vh - 185px)", background: isActiveDrop ? `${accent}08` : "transparent", transition: "background 0.15s" }}>
        {masters.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-6 transition-colors duration-150 ${isActiveDrop ? "text-indigo-300" : "text-gray-300"}`}>
            {isActiveDrop
              ? <><div className="w-8 h-8 rounded-xl border-2 border-dashed border-indigo-300 mb-1" /><p className="text-[11px]">Сюда</p></>
              : <><User className="w-5 h-5 mb-1" /><p className="text-[11px]">Пусто</p></>}
          </div>
        ) : masters.map(m => (
          <MasterCard key={m.id} master={m} columns={columns} onMove={onMove} onOpenDrawer={onOpenDrawer}
            onDragStart={onDragStartMaster} onDragEnd={onDragEndMaster}
            isDragging={m.id === draggingId} anyDragging={draggingId !== null} />
        ))}
      </div>
    </div>
  );
}

// ─── Suspended column ─────────────────────────────────────────────────────────

function SuspendedColumn({ masters, onOpenDrawer }: { masters: Master[]; onOpenDrawer: (m: Master) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const ACCENT = "#f87171";
  return (
    <div className="flex-shrink-0 w-[230px] flex flex-col rounded-2xl overflow-hidden"
         style={{ background: "rgba(255,255,255,0.60)", backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)", border: "1px solid rgba(255,255,255,0.82)", boxShadow: "0 4px 20px rgba(120,80,220,0.07), 0 1px 3px rgba(0,0,0,0.04)", borderTop: `2px solid ${ACCENT}` }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: "rgba(254,226,226,0.35)", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
        <UserX className="w-3.5 h-3.5 flex-shrink-0" style={{ color: ACCENT }} />
        <span className="font-semibold text-gray-700 text-[13px] flex-1 truncate">Отстранённые</span>
        <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ background: "rgba(248,113,113,0.14)", color: "#b91c1c" }}>{masters.length}</span>
        <button onClick={() => setCollapsed(c => !c)} className="p-0.5 rounded-lg hover:bg-black/[0.05]">
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronUp className="w-3.5 h-3.5 text-gray-400" />}
        </button>
      </div>
      {!collapsed && (
        <div className="voronka-scroll flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
          {masters.map(m => (
            <div key={m.id} onClick={() => onOpenDrawer(m)}
              className="rounded-xl px-2.5 py-2 cursor-pointer transition-all flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <Avatar name={m.alias} id={m.id} avatarUrl={m.avatarUrl} size={26} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-gray-700 truncate">{m.alias}</p>
                <p className="text-[10px] text-gray-400 truncate">{m.city}</p>
              </div>
              <div className="flex items-center gap-0.5">
                {m.pwaLogin && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                {m.maxChatId && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Debtor column ────────────────────────────────────────────────────────────

function DebtorColumn({ masters, onOpenDrawer }: { masters: Master[]; onOpenDrawer: (m: Master) => void }) {
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
          {totalDebt > 0 && <p className="text-[9px] text-orange-400 leading-none">{(totalDebt / 1000).toFixed(0)}k ₽</p>}
        </div>
        <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ background: "rgba(251,146,60,0.14)", color: "#c2410c" }}>{masters.length}</span>
        <button onClick={() => setCollapsed(c => !c)} className="p-0.5 rounded-lg hover:bg-black/[0.05]">
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronUp className="w-3.5 h-3.5 text-gray-400" />}
        </button>
      </div>
      {!collapsed && (
        <div className="voronka-scroll flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
          {masters.map(m => (
            <div key={m.id} onClick={() => onOpenDrawer(m)}
              className="rounded-xl px-2.5 py-2 cursor-pointer transition-all"
              style={{ background: "rgba(255,255,255,0.82)", border: "1px solid rgba(255,255,255,0.95)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div className="flex items-center gap-2">
                <Avatar name={m.alias} id={m.id} avatarUrl={m.avatarUrl} size={26} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-gray-700 truncate">{m.alias}</p>
                  <p className="text-[10px] text-gray-400 truncate">{m.city}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  {m.pwaLogin && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
                  {m.maxChatId && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1.5 text-[10px] font-semibold" style={{ color: ACCENT }}>
                <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />{m.debt.toLocaleString("ru")} ₽
                {m.activeOrders.length > 0 && <span className="ml-auto text-gray-400 font-normal">{m.activeOrders.length} зак.</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Column settings modal ────────────────────────────────────────────────────

function ColumnSettings({ columns, onClose, onUpdate, onDelete, onCreate, onReorder }: {
  columns: VoronkaColumn[]; onClose: () => void;
  onUpdate: (id: number, data: Partial<VoronkaColumn>) => void;
  onDelete: (id: number) => void;
  onCreate: (name: string, receivesOrders: boolean, color: string) => void;
  onReorder: (order: number[]) => void;
}) {
  const [local, setLocal] = useState([...columns].sort((a, b) => a.position - b.position));
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState(""); const [editReceives, setEditReceives] = useState(false); const [editColor, setEditColor] = useState("blue");
  const [newName, setNewName] = useState(""); const [newReceives, setNewReceives] = useState(false); const [newColor, setNewColor] = useState("blue");

  const startEdit = (col: VoronkaColumn) => { setEditId(col.id); setEditName(col.name); setEditReceives(col.receivesOrders); setEditColor(col.color); };
  const saveEdit = () => {
    if (!editId) return;
    onUpdate(editId, { name: editName, receivesOrders: editReceives, color: editColor });
    setLocal(p => p.map(c => c.id === editId ? { ...c, name: editName, receivesOrders: editReceives, color: editColor } : c));
    setEditId(null);
  };
  const del = (id: number) => { if (!confirm("Удалить колонку?")) return; onDelete(id); setLocal(p => p.filter(c => c.id !== id)); };
  const move = (idx: number, dir: -1 | 1) => {
    const arr = [...local]; const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    setLocal(arr); onReorder(arr.map(c => c.id));
  };
  const create = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim(), newReceives, newColor);
    setNewName(""); setNewReceives(false); setNewColor("blue");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-bold text-gray-800">Настройка колонок</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {local.map((col, idx) => {
            const c = clr(col.color);
            return (
              <div key={col.id} className="rounded-xl border border-gray-100 overflow-hidden">
                {editId === col.id ? (
                  <div className="p-3 space-y-2.5">
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-100" placeholder="Название" />
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {COLOR_OPTS.map(k => (
                        <button key={k} onClick={() => setEditColor(k)}
                          className={`w-5 h-5 rounded-full ${COLORS[k].dot} border-2 transition-all ${editColor === k ? "border-gray-700 scale-110" : "border-transparent"}`} />
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={editReceives} onChange={e => setEditReceives(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                      <span className="text-gray-700">Принимает заказы от бота</span>
                    </label>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="flex items-center gap-1.5 bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-600 transition-colors">
                        <Check className="w-3.5 h-3.5" />Сохранить
                      </button>
                      <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition-colors">Отмена</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <span className={`w-3 h-3 rounded-full ${c.dot} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-700">{col.name}</p>
                      <p className="text-[11px] text-gray-400">{col.receivesOrders ? "✓ Получает заказы" : "✗ Не получает заказы"}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-white rounded-lg disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={() => move(idx, 1)} disabled={idx === local.length - 1} className="p-1 hover:bg-white rounded-lg disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={() => startEdit(col)} className="p-1 hover:bg-white rounded-lg"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                      <button onClick={() => del(col.id)} className="p-1 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="border border-dashed border-gray-200 rounded-xl p-3.5 space-y-2.5 mt-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Новая колонка</p>
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && create()}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-100" placeholder="Название" />
            <div className="flex items-center gap-1.5 flex-wrap">
              {COLOR_OPTS.map(k => (
                <button key={k} onClick={() => setNewColor(k)}
                  className={`w-5 h-5 rounded-full ${COLORS[k].dot} border-2 transition-all ${newColor === k ? "border-gray-700 scale-110" : "border-transparent"}`} />
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={newReceives} onChange={e => setNewReceives(e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-gray-700">Принимает заказы от бота</span>
            </label>
            <button onClick={create} disabled={!newName.trim()}
              className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-40 transition-colors">
              <Plus className="w-4 h-4" />Добавить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter badge ─────────────────────────────────────────────────────────────

function FilterBadge({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isActive = value !== options[0]?.value;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${isActive ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
        <span>{label}: {current?.label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[160px]">
          {options.map(opt => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${opt.value === value ? "text-blue-600 font-semibold bg-blue-50" : "text-gray-700"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Masters() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";
  const [issuingCredentials, setIssuingCredentials] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── View mode ────────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>(getInitialView);
  const switchView = (v: ViewMode) => {
    setView(v);
    try { localStorage.setItem("masters_view", v); } catch { /* */ }
  };

  const [filtersCollapsed, setFiltersCollapsed] = useState(() => {
    try { return localStorage.getItem("masters_filters_collapsed") === "1"; } catch { return false; }
  });
  const toggleFilters = () => setFiltersCollapsed(v => {
    try { localStorage.setItem("masters_filters_collapsed", v ? "0" : "1"); } catch { /* */ }
    return !v;
  });

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [masters, setMasters] = useState<Master[]>([]);
  const [columns, setColumns] = useState<VoronkaColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerMaster, setDrawerMaster] = useState<Master | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: cities } = useGetCities();

  const fetchAll = useCallback(async (initial = false) => {
    const [mR, cR] = await Promise.all([
      fetch("/api/voronka/masters", { credentials: "include" }),
      fetch("/api/voronka/columns", { credentials: "include" }),
    ]);
    if (mR.ok) {
      const list: Master[] = await mR.json();
      setMasters(list);
      if (initial) {
        setLoading(false);
        const openId = parseInt(new URLSearchParams(window.location.search).get("openMaster") ?? "");
        if (openId) { const found = list.find(m => m.id === openId); if (found) setDrawerMaster(found); }
      }
    } else if (initial) setLoading(false);
    if (cR.ok) setColumns(await cR.json());
  }, []);

  useEffect(() => { fetchAll(true); const t = setInterval(() => fetchAll(), 8000); return () => clearInterval(t); }, [fetchAll]);

  // Sync drawer with latest data
  useEffect(() => {
    if (drawerMaster) {
      const fresh = masters.find(m => m.id === drawerMaster.id);
      if (fresh) setDrawerMaster(prev => prev ? { ...fresh, tags: prev.tags } : fresh);
    }
  }, [masters]);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const deleteMasterMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/masters/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: (_, id) => {
      setMasters(prev => prev.filter(m => m.id !== id));
      queryClient.invalidateQueries({ queryKey: ["/api/masters"] });
      toast({ title: "Перемещено в корзину", description: "Восстановите в разделе «Корзина»." });
    },
  });

  const createMutation = useCreateMaster({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/masters"] });
        fetchAll();
        setIsCreateOpen(false);
        setFormData({ alias: "", city: "", specialization: "", telegramId: "" });
      }
    }
  });
  const [formData, setFormData] = useState({ alias: "", city: "", specialization: "", telegramId: "" });

  // ── Kanban ops ───────────────────────────────────────────────────────────────
  const moveMaster = async (masterId: number, colId: number | null) => {
    setMasters(p => p.map(m => m.id === masterId ? { ...m, voronkaColumnId: colId } : m));
    await fetch(`/api/voronka/masters/${masterId}/column`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voronkaColumnId: colId }),
    });
  };
  const updateMasterLocal = (id: number, data: Partial<Master>) => {
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

  // ── Filters & sort ───────────────────────────────────────────────────────────
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "free" | "onsite" | "suspended" | "pending_contract" | "debtors">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [specFilter, setSpecFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced filters
  const [pwaFilter, setPwaFilter] = useState<"all" | "yes" | "no">("all");
  const [minRating, setMinRating] = useState(0);
  const [cancelFilter, setCancelFilter] = useState<"all" | "one_plus" | "three_plus">("all");
  const [testFilter, setTestFilter] = useState<"all" | "real" | "test">("all");
  const [activeOrdersFilter, setActiveOrdersFilter] = useState<"all" | "yes" | "no">("all");
  const [debtFilter, setDebtFilter] = useState<"all" | "yes" | "no">("all");
  const [maxFilter, setMaxFilter] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const allCities = useMemo(() => [...new Set(masters.map(m => m.city).filter(Boolean))].sort(), [masters]);
  const allTags = useMemo(() => [...new Set(masters.flatMap(m => m.tags ?? []))].sort(), [masters]);
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
    withApp: masters.filter(m => m.pwaLogin).length,
  }), [masters]);

  const filtered = useMemo(() => {
    let list = masters.filter(m => {
      // Text search
      if (search) {
        const q = search.toLowerCase();
        const match = m.alias.toLowerCase().includes(q)
          || m.city.toLowerCase().includes(q)
          || (m.phone ?? "").includes(q)
          || m.specializations.some(s => s.toLowerCase().includes(q))
          || (m.tags ?? []).some(t => t.toLowerCase().includes(q));
        if (!match) return false;
      }
      // City
      if (cityFilter !== "all" && m.city !== cityFilter) return false;
      // Status quick filter
      if (statusFilter === "free" && (m.status === "suspended" || m.status === "pending_contract" || m.activeOrders.length > 0)) return false;
      if (statusFilter === "onsite" && m.activeOrders.length === 0) return false;
      if (statusFilter === "suspended" && m.status !== "suspended") return false;
      if (statusFilter === "pending_contract" && m.status !== "pending_contract") return false;
      if (statusFilter === "debtors" && m.debt <= 0) return false;
      // Tag
      if (tagFilter && !(m.tags ?? []).includes(tagFilter)) return false;
      // Spec
      if (specFilter !== "all" && !m.specializations.includes(specFilter) && m.specialization !== specFilter) return false;
      // Advanced
      if (pwaFilter === "yes" && !m.pwaLogin) return false;
      if (pwaFilter === "no" && m.pwaLogin) return false;
      if (minRating > 0 && m.rating < minRating) return false;
      if (cancelFilter === "one_plus" && (m.cancelCount30d ?? 0) < 1) return false;
      if (cancelFilter === "three_plus" && (m.cancelCount30d ?? 0) < 3) return false;
      if (testFilter === "real" && m.isTestMaster) return false;
      if (testFilter === "test" && !m.isTestMaster) return false;
      if (activeOrdersFilter === "yes" && m.activeOrders.length === 0) return false;
      if (activeOrdersFilter === "no" && m.activeOrders.length > 0) return false;
      if (debtFilter === "yes" && m.debt <= 0) return false;
      if (debtFilter === "no" && m.debt > 0) return false;
      if (maxFilter && !m.maxChatId) return false;
      return true;
    });
    return sortMasters(list, sortKey);
  }, [masters, search, cityFilter, statusFilter, tagFilter, specFilter, sortKey,
      pwaFilter, minRating, cancelFilter, testFilter, activeOrdersFilter, debtFilter, maxFilter]);

  const filteredDebt = useMemo(() => filtered.reduce((s, m) => s + (m.debt ?? 0), 0), [filtered]);

  const hasBasicFilters = search || cityFilter !== "all" || statusFilter !== "all" || tagFilter || specFilter !== "all" || maxFilter;
  const hasAdvancedFilters = pwaFilter !== "all" || minRating > 0 || cancelFilter !== "all" || testFilter !== "all" || activeOrdersFilter !== "all" || debtFilter !== "all";
  const hasAnyFilters = hasBasicFilters || hasAdvancedFilters;

  const resetAll = () => {
    setSearch(""); setCityFilter("all"); setStatusFilter("all"); setTagFilter(null); setSpecFilter("all");
    setPwaFilter("all"); setMinRating(0); setCancelFilter("all"); setTestFilter("all"); setActiveOrdersFilter("all"); setDebtFilter("all"); setMaxFilter(false);
  };

  const STAT_BUTTONS = [
    { key: "all"              as const, label: "Все",        value: counts.total,    icon: Users,         color: "text-gray-600 bg-gray-50 border-gray-100" },
    { key: "free"             as const, label: "Свободны",   value: counts.free,     icon: UserCheck,     color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
    { key: "onsite"           as const, label: "На объекте", value: counts.onsite,   icon: Zap,           color: "text-blue-600 bg-blue-50 border-blue-100" },
    { key: "pending_contract" as const, label: "Договор",    value: counts.pending,  icon: FileSignature, color: "text-amber-600 bg-amber-50 border-amber-100" },
    { key: "debtors"          as const, label: "Должники",   value: counts.debtors,  icon: AlertTriangle, color: "text-red-500 bg-red-50 border-red-100" },
    { key: "suspended"        as const, label: "Блок",       value: counts.suspended,icon: UserX,         color: "text-gray-400 bg-gray-50 border-gray-100" },
  ];

  const sorted = [...columns].sort((a, b) => a.position - b.position);
  const suspended = filtered.filter(m => m.status === "suspended");
  const debtors = filtered.filter(m => m.status !== "suspended" && m.debt > 0);
  const kanbanMasters = filtered.filter(m => m.status !== "suspended" && m.debt <= 0);
  const unassigned = kanbanMasters.filter(m => !m.voronkaColumnId || !columns.find(c => c.id === m.voronkaColumnId));
  const tgCount = masters.filter(m => m.pwaLogin).length;
  const maxCount = masters.filter(m => m.maxChatId).length;
  const activeCount = masters.filter(m => m.activeOrders.length > 0).length;
  const problemMasters = masters.filter(m => (m.cancelCount7d ?? 0) >= 2);

  return (
    <ProtectedRoute allowedRoles={["admin", "master_operator", "lead_operator"]} permissionKey="masters">
      <Layout>
        <div className="h-full flex flex-col gap-3" onClick={() => setShowSortMenu(false)}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between flex-shrink-0 gap-2">
            <div>
              <h1 className="text-xl font-bold text-gray-800">База мастеров</h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                <span>{masters.length} мастеров</span>
                <span className="flex items-center gap-1 text-emerald-500"><Smartphone className="w-3 h-3" />{tgCount} с приложением</span>
                {maxCount > 0 && (
                  <button
                    onClick={() => setMaxFilter(v => !v)}
                    className={`flex items-center gap-1 transition-colors ${maxFilter ? "text-blue-600 font-semibold" : "text-blue-500 hover:text-blue-600"}`}
                    title={maxFilter ? "Сбросить фильтр Max" : "Показать только мастеров с Max"}
                  >
                    <Bot className="w-3 h-3" />{maxCount} в Max
                  </button>
                )}
                {activeCount > 0 && <span className="flex items-center gap-1 text-blue-500"><Zap className="w-3 h-3" />{activeCount} на объекте</span>}
                {totalDebt > 0 && <span className="text-red-400 font-semibold">· Долг: {totalDebt.toLocaleString("ru-RU")} ₽</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Collapse filters toggle */}
              <button
                onClick={e => { e.stopPropagation(); toggleFilters(); }}
                title={filtersCollapsed ? "Развернуть панель фильтров" : "Свернуть панель фильтров"}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-sm font-medium transition-all ${filtersCollapsed ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
              >
                {filtersCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                <span className="hidden sm:inline">{filtersCollapsed ? "Панель" : "Свернуть"}</span>
              </button>

              {/* View toggle */}
              <div className="flex items-center bg-gray-100 rounded-xl p-0.5">
                <button
                  onClick={() => switchView("list")}
                  title="Список"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === "list" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <LayoutList className="w-4 h-4" />
                  <span className="hidden sm:inline">Список</span>
                </button>
                <button
                  onClick={() => switchView("kanban")}
                  title="Воронка"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === "kanban" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  <Columns className="w-4 h-4" />
                  <span className="hidden sm:inline">Воронка</span>
                </button>
              </div>
              {/* Column settings (kanban only) */}
              {view === "kanban" && (
                <button onClick={e => { e.stopPropagation(); setShowSettings(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Колонки</span>
                </button>
              )}
              {isAdmin && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={async () => {
                      const noAccess = masters.filter(m => !m.pwaLogin);
                      if (noAccess.length === 0) { alert("Все активные мастера уже имеют доступ к приложению."); return; }
                      if (!confirm(`Выдать доступ к приложению ${noAccess.length} мастерам без учётных данных?\nЛогин и пароль = номер телефона мастера.`)) return;
                      setIssuingCredentials(true);
                      try {
                        const r = await fetch("/api/masters/auto-issue-credentials", { method: "POST", credentials: "include" });
                        const d = await r.json();
                        if (!r.ok) throw new Error(d.error ?? "Ошибка");
                        alert(`Готово! Выдан доступ: ${d.issued} мастерам.\nПропущено (нет телефона): ${d.skipped}`);
                        queryClient.invalidateQueries({ queryKey: ["masters"] });
                      } catch (e: any) {
                        alert(e.message ?? "Ошибка");
                      } finally {
                        setIssuingCredentials(false);
                      }
                    }}
                    disabled={issuingCredentials}
                    title="Выдать доступ к МастерApp всем мастерам без учётных данных (логин = телефон)"
                    className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-amber-100 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {issuingCredentials ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    <span className="hidden sm:inline">Выдать доступ</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Сбросить пароли ВСЕХ мастеров (${masters.length}) к номеру телефона?\n\nЭто поможет мастерам, которые не могут войти.\nПосле сброса: логин = телефон, пароль = телефон.`)) return;
                      setIssuingCredentials(true);
                      try {
                        const r = await fetch("/api/masters/bulk-reset-passwords", { method: "POST", credentials: "include" });
                        const d = await r.json();
                        if (!r.ok) throw new Error(d.error ?? "Ошибка");
                        alert(`Готово! Пароли сброшены у ${d.reset} мастеров.\nПропущено: ${d.skipped}\n\nТеперь каждый мастер может войти:\nЛогин = свой номер телефона\nПароль = свой номер телефона`);
                        queryClient.invalidateQueries({ queryKey: ["masters"] });
                      } catch (e: any) {
                        alert(e.message ?? "Ошибка");
                      } finally {
                        setIssuingCredentials(false);
                      }
                    }}
                    disabled={issuingCredentials}
                    title="Сбросить пароли всех мастеров к номеру телефона"
                    className="px-3 py-2 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-orange-100 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {issuingCredentials ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    <span className="hidden sm:inline">Сбросить пароли</span>
                  </button>
                </div>
              )}
              <button onClick={() => setIsCreateOpen(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-blue-600 transition-colors shadow-sm">
                <Plus className="w-4 h-4" /> Добавить
              </button>
            </div>
          </div>

          {/* ── Collapsible panel ─────────────────────────────────────────── */}
          {!filtersCollapsed && (
            <>
              {/* Stats badges */}
              <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto pb-0.5">
                {STAT_BUTTONS.map(s => (
                  <button key={s.key}
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
                {maxCount > 0 && (
                  <button
                    onClick={() => setMaxFilter(v => !v)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-left transition-all text-blue-600 border-blue-100 ${maxFilter ? "bg-blue-100 ring-2 ring-offset-1 ring-blue-400" : "bg-blue-50 hover:brightness-95"}`}
                  >
                    <Bot className="w-3.5 h-3.5 flex-shrink-0" />
                    <div>
                      <div className="text-base font-bold leading-none">{maxCount}</div>
                      <div className="text-[10px] opacity-70 font-medium leading-tight mt-0.5">в Max</div>
                    </div>
                  </button>
                )}
              </div>

              {/* Problem alert */}
              {problemMasters.length > 0 && (
                <div className="flex-shrink-0 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-orange-800">Много отмен за 7 дней: </span>
                    <span className="text-sm text-orange-700">
                      {problemMasters.map((m, i) => (
                        <span key={m.id}>{i > 0 && ", "}
                          <button onClick={() => setDrawerMaster(m)} className="font-semibold hover:underline">{m.alias}</button> ({m.cancelCount7d})
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              )}

              {/* Debt banner */}
              {statusFilter === "debtors" && filteredDebt > 0 && (
                <div className="flex-shrink-0 flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="text-xs text-red-600 font-semibold">
                    Суммарный долг {filtered.length} мастер{filtered.length === 1 ? "а" : "ов"}: {filteredDebt.toLocaleString("ru-RU")} ₽
                  </span>
                </div>
              )}

              {/* Filter row */}
              <div className="flex gap-2 flex-shrink-0 flex-wrap" onClick={e => e.stopPropagation()}>
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Имя, телефон, специализация, тег..."
                    className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 bg-white" />
                  {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
                </div>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
                    className="pl-7 pr-6 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 bg-white appearance-none">
                    <option value="all">Все города</option>
                    {allCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {allSpecs.length > 0 && (
                  <div className="relative">
                    <Briefcase className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <select value={specFilter} onChange={e => setSpecFilter(e.target.value)}
                      className="pl-7 pr-6 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 bg-white appearance-none max-w-[160px]">
                      <option value="all">Все специальности</option>
                      {allSpecs.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {view === "list" && (
                  <div className="relative">
                    <button onClick={e => { e.stopPropagation(); setShowSortMenu(v => !v); }}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 bg-white hover:bg-gray-50 transition-colors">
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{SORT_OPTIONS.find(s => s.key === sortKey)?.label}</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showSortMenu && (
                      <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[160px]">
                        {SORT_OPTIONS.map(opt => (
                          <button key={opt.key} onClick={() => { setSortKey(opt.key); setShowSortMenu(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${sortKey === opt.key ? "text-blue-600 font-semibold bg-blue-50" : "text-gray-700"}`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button onClick={() => setShowAdvanced(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-xl transition-colors ${hasAdvancedFilters ? "bg-indigo-500 text-white border-indigo-500" : "border-gray-200 text-gray-500 bg-white hover:bg-gray-50"}`}>
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Фильтры</span>
                  {hasAdvancedFilters && <span className="bg-indigo-400 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">!</span>}
                </button>
                {hasAnyFilters && (
                  <button onClick={resetAll}
                    className="px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 flex items-center gap-1.5 bg-white">
                    <X className="w-3 h-3" /> Сбросить
                  </button>
                )}
              </div>

              {/* Advanced filter panel */}
              {showAdvanced && (
                <div className="flex-shrink-0 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex flex-wrap gap-2.5 items-center" onClick={e => e.stopPropagation()}>
                  <FilterBadge label="Приложение" value={pwaFilter} onChange={v => setPwaFilter(v as any)}
                    options={[{ value: "all", label: "Все" }, { value: "yes", label: "Есть" }, { value: "no", label: "Нет" }]} />
                  <FilterBadge label="Активные заказы" value={activeOrdersFilter} onChange={v => setActiveOrdersFilter(v as any)}
                    options={[{ value: "all", label: "Все" }, { value: "yes", label: "Есть" }, { value: "no", label: "Нет" }]} />
                  <FilterBadge label="Долг" value={debtFilter} onChange={v => setDebtFilter(v as any)}
                    options={[{ value: "all", label: "Любой" }, { value: "yes", label: "Есть долг" }, { value: "no", label: "Нет долга" }]} />
                  <FilterBadge label="Тест" value={testFilter} onChange={v => setTestFilter(v as any)}
                    options={[{ value: "all", label: "Все" }, { value: "real", label: "Реальные" }, { value: "test", label: "Тестовые" }]} />
                  <FilterBadge label="Отмены 30д" value={cancelFilter} onChange={v => setCancelFilter(v as any)}
                    options={[{ value: "all", label: "Любые" }, { value: "one_plus", label: "1+" }, { value: "three_plus", label: "3+" }]} />
                  <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl">
                    <span className="text-sm text-gray-600 flex-shrink-0">Рейтинг ≥</span>
                    <div className="flex items-center gap-0.5">
                      {[0,1,2,3,4,5].map(r => (
                        <button key={r} onClick={() => setMinRating(r)}
                          className={`w-6 h-6 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${r === minRating ? "bg-amber-400 text-white" : "text-gray-400 hover:bg-amber-50 hover:text-amber-500"}`}>
                          {r === 0 ? "—" : r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tag chips */}
              {allTags.length > 0 && (
                <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto pb-0.5">
                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5 shrink-0 font-medium"><Tag className="w-3 h-3" /> Теги:</span>
                  {allTags.map(tag => (
                    <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                      className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${tagFilter === tag ? "bg-violet-500 text-white" : "bg-violet-50 text-violet-600 hover:bg-violet-100"}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              {/* Counter row */}
              <div className="text-xs text-gray-400 flex-shrink-0 -mt-1 flex items-center gap-3">
                <span>Показано: {filtered.length} из {masters.length}</span>
                {view === "list" && sortKey !== "name" && (
                  <span className="text-blue-400">· Сортировка: {SORT_OPTIONS.find(s => s.key === sortKey)?.label}</span>
                )}
                {hasAnyFilters && view === "kanban" && (
                  <span className="text-indigo-400 font-medium">· Фильтры активны</span>
                )}
              </div>
            </>
          )}

          {/* Collapsed hint row */}
          {filtersCollapsed && hasAnyFilters && (
            <div className="flex-shrink-0 flex items-center gap-2 text-xs">
              <span className="text-indigo-500 font-medium bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <Filter className="w-3 h-3" />
                Фильтры активны · {filtered.length} из {masters.length}
                <button onClick={resetAll} className="ml-1 text-indigo-400 hover:text-indigo-600"><X className="w-3 h-3" /></button>
              </span>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── LIST VIEW ─────────────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {view === "list" && (
            <div className="flex-1 overflow-y-auto voronka-scroll space-y-1.5">
              {loading ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                  <Filter className="w-8 h-8 mb-2" />
                  <p className="text-sm">Никого не найдено</p>
                  {hasAnyFilters && <button onClick={resetAll} className="mt-3 text-xs text-blue-400 hover:underline">Сбросить фильтры</button>}
                </div>
              ) : filtered.map(m => (
                <MasterRow key={m.id} master={m}
                  onOpenDrawer={setDrawerMaster}
                  onDelete={isAdmin ? id => deleteMasterMutation.mutate(id) : undefined}
                  onGoToChat={id => setLocation(`/master-chat?masterId=${id}`)}
                />
              ))}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── KANBAN VIEW ───────────────────────────────────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {view === "kanban" && (
            loading ? (
              <div className="flex items-center justify-center flex-1">
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="voronka-scroll flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
                {sorted.map(col => (
                  <KanbanColumn key={col.id} col={col}
                    masters={kanbanMasters.filter(m => m.voronkaColumnId === col.id)}
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
                {debtors.length > 0 && <DebtorColumn masters={debtors} onOpenDrawer={setDrawerMaster} />}
                {suspended.length > 0 && <SuspendedColumn masters={suspended} onOpenDrawer={setDrawerMaster} />}
              </div>
            )
          )}
        </div>

        {/* ── Create modal ───────────────────────────────────────────────── */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-md overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-800">Новый мастер</h2>
                <button onClick={() => setIsCreateOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={e => { e.preventDefault(); createMutation.mutate({ data: formData }); }} className="p-5 space-y-3.5">
                {[
                  { label: "Имя / псевдоним", key: "alias", placeholder: "Иван Петров", required: true },
                  { label: "Специализация", key: "specialization", placeholder: "Плиточник, Сантехник", required: true },
                  { label: "Telegram ID", key: "telegramId", placeholder: "@username или ID", required: false },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">{f.label}</label>
                    <input required={f.required} value={(formData as any)[f.key]}
                      onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none" />
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">Город</label>
                  <select required value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none bg-white">
                    <option value="">Выберите город</option>
                    {cities?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="pt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 text-sm rounded-xl text-gray-500 hover:bg-gray-100">Отмена</button>
                  <button type="submit" disabled={createMutation.isPending}
                    className="px-5 py-2 text-sm bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                    {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Добавить
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Column settings ─────────────────────────────────────────────── */}
        {showSettings && (
          <ColumnSettings columns={sorted} onClose={() => { setShowSettings(false); fetchAll(); }}
            onUpdate={updateColumn} onDelete={deleteColumn}
            onCreate={createColumn} onReorder={reorderColumns} />
        )}

        {/* ── Master drawer ──────────────────────────────────────────────── */}
        {drawerMaster && (
          <MasterDrawer
            master={drawerMaster}
            columns={columns}
            onClose={() => setDrawerMaster(null)}
            onMasterUpdate={(id, data) => {
              updateMasterLocal(id, data);
            }}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
}
