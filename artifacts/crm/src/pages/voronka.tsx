import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import {
  Plus, Settings, X, Check, ChevronUp, ChevronDown, Trash2,
  Star, Phone, MapPin, Briefcase, AlertTriangle, GripVertical,
  User, ArrowRight, Edit2
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VoronkaColumn {
  id: number;
  name: string;
  position: number;
  receivesOrders: boolean;
  color: string;
}

interface ActiveOrder {
  orderId: number;
  district: string;
  city: string;
  serviceType: string;
  status: string;
  clientPhone: string | null;
  clientName: string | null;
  scheduledAt: string | null;
}

interface VoronkaMaster {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  telegramId: string | null;
  phone: string | null;
  status: string;
  rating: number;
  totalOrders: number;
  acceptedOrders: number;
  debt: number;
  voronkaColumnId: number | null;
  isTestMaster: boolean;
  activeOrders: ActiveOrder[];
  createdAt: string;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

const COLOR_OPTIONS = [
  { key: "blue", top: "border-t-blue-500", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  { key: "green", top: "border-t-green-500", badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
  { key: "orange", top: "border-t-orange-500", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  { key: "red", top: "border-t-red-500", badge: "bg-red-100 text-red-700", dot: "bg-red-500" },
  { key: "purple", top: "border-t-purple-500", badge: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  { key: "yellow", top: "border-t-yellow-500", badge: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  { key: "teal", top: "border-t-teal-500", badge: "bg-teal-100 text-teal-700", dot: "bg-teal-500" },
  { key: "pink", top: "border-t-pink-500", badge: "bg-pink-100 text-pink-700", dot: "bg-pink-500" },
];

function getColor(key: string) {
  return COLOR_OPTIONS.find(c => c.key === key) ?? COLOR_OPTIONS[0];
}

// ─── Stars ────────────────────────────────────────────────────────────────────

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3 h-3 ${i <= Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

// ─── Master Card ─────────────────────────────────────────────────────────────

function MasterCard({
  master, columns, onMove,
}: {
  master: VoronkaMaster;
  columns: VoronkaColumn[];
  onMove: (masterId: number, colId: number | null) => void;
}) {
  const [showMove, setShowMove] = useState(false);

  const otherCols = columns.filter(c => c.id !== master.voronkaColumnId);

  return (
    <div className="bg-card border border-border rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-semibold text-sm text-foreground leading-tight">{master.alias}</p>
          <p className="text-xs text-muted-foreground">{master.city} · {master.specialization}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {master.isTestMaster && (
            <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">Тест</span>
          )}
          {master.debt > 0 && (
            <span className="text-xs bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 font-medium flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />
              {master.debt.toLocaleString("ru")}₽
            </span>
          )}
        </div>
      </div>

      {/* Rating */}
      <RatingStars rating={master.rating} />

      {/* Stats */}
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{master.totalOrders} заказов</span>
        {master.telegramId && (
          <span className="text-blue-500">TG</span>
        )}
      </div>

      {/* Active orders */}
      {master.activeOrders.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {master.activeOrders.map(o => (
            <div key={o.orderId} className="bg-primary/5 border border-primary/20 rounded-lg p-2 text-xs">
              <div className="flex items-center gap-1 font-medium text-foreground mb-1">
                <Briefcase className="w-3 h-3 text-primary" />
                <span>Заказ #{o.orderId} · {o.serviceType}</span>
              </div>
              <div className="space-y-0.5 text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-orange-500" />
                  <span>{o.city}, {o.district}</span>
                </div>
                {o.clientName && (
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3 text-blue-500" />
                    <span>{o.clientName}</span>
                  </div>
                )}
                {o.clientPhone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-green-500" />
                    <a href={`tel:${o.clientPhone}`} className="text-green-600 font-medium hover:underline">
                      {o.clientPhone}
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Move button */}
      <div className="mt-3 relative">
        <button
          onClick={() => setShowMove(!showMove)}
          className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1 rounded-lg hover:bg-muted transition-colors border border-dashed border-border"
        >
          <ArrowRight className="w-3 h-3" />
          Переместить
        </button>
        {showMove && (
          <div className="absolute bottom-full mb-1 left-0 right-0 bg-popover border border-border rounded-xl shadow-xl z-20 p-1">
            {otherCols.map(col => (
              <button
                key={col.id}
                onClick={() => { onMove(master.id, col.id); setShowMove(false); }}
                className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
              >
                <span className={`w-2 h-2 rounded-full ${getColor(col.color).dot}`} />
                {col.name}
              </button>
            ))}
            <button
              onClick={() => { onMove(master.id, null); setShowMove(false); }}
              className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              Без колонки
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Column Settings Modal ────────────────────────────────────────────────────

function ColumnSettingsModal({
  columns,
  onClose,
  onUpdate,
  onDelete,
  onCreate,
  onReorder,
}: {
  columns: VoronkaColumn[];
  onClose: () => void;
  onUpdate: (id: number, data: Partial<VoronkaColumn>) => void;
  onDelete: (id: number) => void;
  onCreate: (name: string, receivesOrders: boolean, color: string) => void;
  onReorder: (newOrder: number[]) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editReceives, setEditReceives] = useState(false);
  const [editColor, setEditColor] = useState("blue");
  const [newName, setNewName] = useState("");
  const [newReceives, setNewReceives] = useState(false);
  const [newColor, setNewColor] = useState("blue");
  const [localCols, setLocalCols] = useState(columns);

  const startEdit = (col: VoronkaColumn) => {
    setEditingId(col.id);
    setEditName(col.name);
    setEditReceives(col.receivesOrders);
    setEditColor(col.color);
  };

  const saveEdit = () => {
    if (!editingId) return;
    onUpdate(editingId, { name: editName, receivesOrders: editReceives, color: editColor });
    setLocalCols(prev => prev.map(c => c.id === editingId ? { ...c, name: editName, receivesOrders: editReceives, color: editColor } : c));
    setEditingId(null);
  };

  const moveCol = (idx: number, dir: -1 | 1) => {
    const newArr = [...localCols];
    const target = idx + dir;
    if (target < 0 || target >= newArr.length) return;
    [newArr[idx], newArr[target]] = [newArr[target], newArr[idx]];
    setLocalCols(newArr);
    onReorder(newArr.map(c => c.id));
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim(), newReceives, newColor);
    setNewName("");
    setNewReceives(false);
    setNewColor("blue");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg border border-border flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">Настройка колонок</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {/* Existing columns */}
          {localCols.map((col, idx) => {
            const c = getColor(col.color);
            return (
              <div key={col.id} className={`border-l-4 ${c.top.replace("border-t-", "border-l-")} bg-muted/30 rounded-xl`}>
                {editingId === col.id ? (
                  <div className="p-3 space-y-3">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Название колонки"
                      autoFocus
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      {COLOR_OPTIONS.map(co => (
                        <button
                          key={co.key}
                          onClick={() => setEditColor(co.key)}
                          className={`w-6 h-6 rounded-full ${co.dot} border-2 transition-all ${editColor === co.key ? "border-foreground scale-110" : "border-transparent"}`}
                        />
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editReceives}
                        onChange={e => setEditReceives(e.target.checked)}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-foreground">Принимает заказы</span>
                    </label>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm hover:bg-primary/90 transition-colors">
                        <Check className="w-3.5 h-3.5" /> Сохранить
                      </button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg text-sm hover:bg-muted transition-colors text-muted-foreground">
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${c.dot} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{col.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {col.receivesOrders ? "✓ Принимает заказы" : "✗ Не принимает заказы"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => moveCol(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-muted rounded-lg disabled:opacity-30 transition-colors">
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => moveCol(idx, 1)} disabled={idx === localCols.length - 1} className="p-1 hover:bg-muted rounded-lg disabled:opacity-30 transition-colors">
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => startEdit(col)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => { onDelete(col.id); setLocalCols(prev => prev.filter(c => c.id !== col.id)); }}
                        className="p-1 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Create new column */}
          <div className="border border-dashed border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Добавить колонку</p>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Название новой колонки"
            />
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_OPTIONS.map(co => (
                <button
                  key={co.key}
                  onClick={() => setNewColor(co.key)}
                  className={`w-6 h-6 rounded-full ${co.dot} border-2 transition-all ${newColor === co.key ? "border-foreground scale-110" : "border-transparent"}`}
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={newReceives}
                onChange={e => setNewReceives(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-foreground">Принимает заказы</span>
            </label>
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Создать колонку
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
    const [colsRes, mastersRes] = await Promise.all([
      fetch("/api/voronka/columns"),
      fetch("/api/voronka/masters"),
    ]);
    if (colsRes.ok) setColumns(await colsRes.json());
    if (mastersRes.ok) setMasters(await mastersRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 8000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const moveMaster = async (masterId: number, colId: number | null) => {
    setMasters(prev => prev.map(m => m.id === masterId ? { ...m, voronkaColumnId: colId } : m));
    await fetch(`/api/voronka/masters/${masterId}/column`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voronkaColumnId: colId }),
    });
  };

  const updateColumn = async (id: number, data: Partial<VoronkaColumn>) => {
    const res = await fetch(`/api/voronka/columns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setColumns(prev => prev.map(c => c.id === id ? updated : c));
    }
  };

  const deleteColumn = async (id: number) => {
    await fetch(`/api/voronka/columns/${id}`, { method: "DELETE" });
    setColumns(prev => prev.filter(c => c.id !== id));
    setMasters(prev => prev.map(m => m.voronkaColumnId === id ? { ...m, voronkaColumnId: null } : m));
  };

  const createColumn = async (name: string, receivesOrders: boolean, color: string) => {
    const res = await fetch("/api/voronka/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, receivesOrders, color }),
    });
    if (res.ok) {
      const col = await res.json();
      setColumns(prev => [...prev, col]);
    }
  };

  const reorderColumns = async (order: number[]) => {
    const res = await fetch("/api/voronka/columns/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    if (res.ok) {
      const cols = await res.json();
      setColumns(cols);
    }
  };

  // Unassigned masters (no column)
  const unassigned = masters.filter(m => !m.voronkaColumnId || !columns.find(c => c.id === m.voronkaColumnId));

  return (
    <ProtectedRoute>
      <Layout>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Воронка мастеров</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {masters.length} мастеров · {columns.length} колонок
              </p>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl text-sm font-medium transition-colors border border-border"
            >
              <Settings className="w-4 h-4" />
              Настройки колонок
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center flex-1 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
              {/* Sorted columns */}
              {[...columns].sort((a, b) => a.position - b.position).map(col => {
                const colMasters = masters.filter(m => m.voronkaColumnId === col.id);
                const c = getColor(col.color);
                return (
                  <div key={col.id} className="flex-shrink-0 w-72 flex flex-col">
                    <div className={`bg-card rounded-2xl border-t-4 ${c.top} border border-border shadow-sm flex flex-col`} style={{ maxHeight: "calc(100vh - 200px)" }}>
                      {/* Column header */}
                      <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-foreground">{col.name}</h3>
                          {col.receivesOrders && (
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                              ✓ Заказы
                            </span>
                          )}
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                          {colMasters.length}
                        </span>
                      </div>
                      {/* Masters list */}
                      <div className="p-3 space-y-2 overflow-y-auto flex-1">
                        {colMasters.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-8 italic">Пусто</p>
                        ) : (
                          colMasters.map(m => (
                            <MasterCard
                              key={m.id}
                              master={m}
                              columns={columns}
                              onMove={moveMaster}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Unassigned */}
              {unassigned.length > 0 && (
                <div className="flex-shrink-0 w-72 flex flex-col">
                  <div className="bg-card rounded-2xl border-t-4 border-t-muted-foreground/30 border border-border shadow-sm flex flex-col" style={{ maxHeight: "calc(100vh - 200px)" }}>
                    <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
                      <h3 className="font-semibold text-sm text-muted-foreground">Без колонки</h3>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {unassigned.length}
                      </span>
                    </div>
                    <div className="p-3 space-y-2 overflow-y-auto flex-1">
                      {unassigned.map(m => (
                        <MasterCard key={m.id} master={m} columns={columns} onMove={moveMaster} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {showSettings && (
          <ColumnSettingsModal
            columns={[...columns].sort((a, b) => a.position - b.position)}
            onClose={() => { setShowSettings(false); fetchAll(); }}
            onUpdate={updateColumn}
            onDelete={deleteColumn}
            onCreate={createColumn}
            onReorder={reorderColumns}
          />
        )}
      </Layout>
    </ProtectedRoute>
  );
}
