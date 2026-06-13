import { useEffect, useMemo, useState, useCallback, useRef, type ChangeEvent, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Search, Users, List, X, BellRing, Keyboard, TrendingUp, TrendingDown, Minus, Download, Bell, AlertTriangle, Clock, BarChart3, GripVertical, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ActionItemModal } from "./ActionItemModal";
import { ActionItemCard } from "./ActionItemCard";
import { useAuth } from "@/hooks/use-auth";
import { type ActionItem, type ActionItemCardData, isBurning, pluralRu, TYPE_LABEL } from "./types";

type Item = ActionItem;

const SCOPE_TABS = [
  { key: "all", label: "Все" },
  { key: "orders", label: "Заказы" },
  { key: "masters", label: "Мастера" },
  { key: "finance", label: "Финансы" },
  { key: "system", label: "Системные" },
] as const;

async function fetcher(period: string, city?: string) {
  const q = new URLSearchParams();
  if (period && period !== "all") q.set("period", period);
  if (city && city !== "all" && city !== "Все города") q.set("city", city);
  const r = await fetch(`/api/dashboard/action-items${q.toString() ? `?${q.toString()}` : ""}`, { credentials: "include" });
  if (!r.ok) throw new Error("load");
  return r.json();
}

async function fetchDebugInfo(): Promise<any> {
  try {
    const r = await fetch("/api/dashboard/action-items/debug", { credentials: "include" });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

async function fetchSnoozesCount(): Promise<number> {
  try {
    const r = await fetch("/api/dashboard/action-items/snoozes", { credentials: "include" });
    if (!r.ok) return 0;
    const data = await r.json();
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

async function clearAllSnoozes(): Promise<number> {
  const r = await fetch("/api/dashboard/action-items/snoozes", {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) throw new Error("Ошибка сброса");
  const data = await r.json();
  return data.cleared ?? 0;
}

/** Мини-спарклайн (SVG) */
function Sparkline({ data, width = 80, height = 20, color = "#ef4444" }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" points={points} />
    </svg>
  );
}

// ─── Пустое состояние с кнопкой восстановления задач ────────────────────────
function EmptyTasksState({
  priorityFilter,
  summary,
  onRefetch,
}: {
  priorityFilter: string;
  summary: { critical: number; doneToday: number };
  onRefetch: () => void;
}) {
  const [snoozesCount, setSnoozesCount] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    fetchSnoozesCount().then(setSnoozesCount);
  }, []);

  const handleLoadDebug = async () => {
    setDebugLoading(true);
    setShowDebug(true);
    const info = await fetchDebugInfo();
    setDebugInfo(info);
    setDebugLoading(false);
  };

  const handleClearSnoozes = async () => {
    setClearing(true);
    try {
      const count = await clearAllSnoozes();
      setCleared(count);
      onRefetch();
    } catch {
      setCleared(0);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="py-8 text-center text-sm text-muted-foreground space-y-3">
      <CheckCircle2 className="w-8 h-8 mx-auto text-green-500" />
      <div className="font-medium text-base text-foreground">
        {priorityFilter === "critical" ? "Нет критичных задач" : "Нет задач"}
      </div>
      <div className="text-xs text-muted-foreground">
        {summary.critical === 0 ? "Все критичные задачи выполнены" : "Попробуйте изменить фильтры"}
      </div>

      {/* Блок восстановления задач — показываем если есть активные snooze */}
      {snoozesCount !== null && snoozesCount > 0 && (
        <div className="mt-4 mx-auto max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-4 text-left space-y-2">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
            <BellRing className="w-4 h-4 shrink-0" />
            {snoozesCount} {snoozesCount === 1 ? "задача скрыта" : snoozesCount < 5 ? "задачи скрыты" : "задач скрыто"} (отложены)
          </div>
          <p className="text-xs text-amber-700">
            Задачи были отложены через «Отложить» или «Пометить выполненными». Если задачи пропали неожиданно — нажмите кнопку ниже, чтобы восстановить их.
          </p>
          {cleared !== null ? (
            <div className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Восстановлено {cleared} задач. Обновляем список…
            </div>
          ) : (
            <button
              onClick={handleClearSnoozes}
              disabled={clearing}
              className="w-full mt-1 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold transition flex items-center justify-center gap-2"
            >
              {clearing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Восстанавливаем…
                </>
              ) : (
                <>
                  <BellRing className="w-3.5 h-3.5" />
                  Восстановить все задачи
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Если snooze нет — просто кнопка обновить */}
      {snoozesCount === 0 && (
        <button
          onClick={onRefetch}
          className="mt-2 text-xs text-violet-600 hover:text-violet-800 underline underline-offset-2 transition"
        >
          Обновить
        </button>
      )}

      {/* Кнопка диагностики — всегда доступна */}
      <div className="mt-4">
        {!showDebug ? (
          <button
            onClick={handleLoadDebug}
            className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 transition"
          >
            🔍 Диагностика — почему нет задач?
          </button>
        ) : (
          <div className="mx-auto max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-4 text-left space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">🔍 Диагностика</span>
              <button onClick={() => setShowDebug(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
            </div>
            {debugLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                Загружаем данные из БД…
              </div>
            ) : debugInfo ? (
              <div className="space-y-2 text-xs">
                {/* Диагноз */}
                {debugInfo.diagnosis?.length > 0 && (
                  <div className="space-y-1">
                    {debugInfo.diagnosis.map((d: string, i: number) => (
                      <div key={i} className="text-slate-700 font-medium">{d}</div>
                    ))}
                  </div>
                )}
                {/* Сводка */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-600 pt-1 border-t border-slate-200">
                  <div>Активных заказов: <b>{debugInfo.summary?.activeOrders ?? 0}</b></div>
                  <div>Завершено/отменено: <b>{debugInfo.summary?.completedOrCancelled ?? 0}</b></div>
                  <div>Активных snooze: <b>{debugInfo.summary?.activeSnoozesCount ?? 0}</b></div>
                  <div>Заблок. мастеров: <b>{debugInfo.summary?.blockedMastersCount ?? 0}</b></div>
                  <div>Ручных задач: <b>{debugInfo.summary?.openManualTasks ?? 0}</b></div>
                  <div>Ожид. оплат: <b>{debugInfo.summary?.pendingReceipts ?? 0}</b></div>
                  <div>Без сметы &gt;24ч: <b>{debugInfo.summary?.noEstimateOrdersOlderThan24h ?? 0}</b></div>
                </div>
                {/* Возраст заказов */}
                {debugInfo.activeOrderAgeBreakdown && (
                  <div className="text-slate-500 pt-1 border-t border-slate-200">
                    Возраст активных: &lt;24ч: {debugInfo.activeOrderAgeBreakdown.lt24h}, 24-48ч: {debugInfo.activeOrderAgeBreakdown.h24_48}, 2-7дн: {debugInfo.activeOrderAgeBreakdown.h48_168}, &gt;7дн: {debugInfo.activeOrderAgeBreakdown.gt168h}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-red-600">Не удалось загрузить данные</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActionItemsBlock({ period: externalPeriod, city }: { period?: string; city?: string }) {
  const [period, setPeriod] = useState<string>(externalPeriod ?? "all");
  const [scopeTab, setScopeTab] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  // myOnly временно скрыт — assigneeId не заполняется на сервере
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionBusy, setBulkActionBusy] = useState<string | null>(null);
  const [bulkToast, setBulkToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [aiHints, setAiHints] = useState<Record<string, string>>({});
  const [aiHintLoadingId, setAiHintLoadingId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  // currentUserId не используется пока assigneeId не заполняется на сервере
  useAuth(); // держим хук для будущего фильтра «Только мои»

  useEffect(() => {
    if (externalPeriod) setPeriod(externalPeriod);
  }, [externalPeriod]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["action-items", period, city],
    queryFn: () => fetcher(period, city),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const onChanged = () => refetch();
    window.addEventListener("dashboard-action-items:changed", onChanged);
    return () => window.removeEventListener("dashboard-action-items:changed", onChanged);
  }, [refetch]);

  const items: Item[] = data?.items ?? [];
  const summary = data?.summary ?? { critical: 0, high: 0, medium: 0, low: 0, doneToday: 0 };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("taskId");
    if (id) setOpenId(id);
  }, []);

  // UX-2: Progressive loading — показываем по PAGE_SIZE, кнопка «Ещё»
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => { setVisibleCount(PAGE_SIZE); setSelectedIds(new Set()); setFocusedIndex(-1); }, [scopeTab, priorityFilter, search, period]);

  const filtered = useMemo(() => {
    return items
      .filter((i) => {
        // Фильтр по типу (scopeTab)
        if (scopeTab === "all") {
          // pass
        } else if (scopeTab === "orders") {
          if (!(i.orderId != null || i.entityType === "order")) return false;
        } else if (scopeTab === "masters") {
          if (!(i.masterId != null || i.entityType === "master")) return false;
        } else if (scopeTab === "finance") {
          if (!(i.entityType === "finance" || i.type.includes("payment"))) return false;
        } else if (scopeTab === "system") {
          if (i.entityType !== "system") return false;
        } else {
          if (i.entityType !== scopeTab) return false;
        }
        // Фильтр по приоритету (priorityFilter)
        if (priorityFilter !== "all" && i.priority !== priorityFilter) return false;
        return true;
      })
      // Фильтр по городу: системные задачи (city=null) всегда показываем,
      // чтобы custom_manual не пропадали при выборе города
      .filter((i) => !city || city === "Все города" || city === "all" || i.city === null || i.city === city)
      .filter((i) => {
        if (search.trim() === "") return true;
        const s = search.toLowerCase();
        const typeLabel = TYPE_LABEL[i.type]?.toLowerCase() ?? "";
        return `${i.title} ${i.shortDescription} ${i.orderId ?? ""} ${i.masterId ?? ""} ${i.masterName ?? ""} ${i.entityId ?? ""} ${i.type} ${typeLabel}`.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        // 1. Горящие задачи (burning) всегда наверх
        const aBurning = isBurning(a) ? 0 : 1;
        const bBurning = isBurning(b) ? 0 : 1;
        if (aBurning !== bBurning) return aBurning - bBurning;
        // 2. По приоритету
        const p: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        const pDiff = p[a.priority] - p[b.priority];
        if (pDiff !== 0) return pDiff;
        // 3. По дедлайну
        const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDeadline !== bDeadline) return aDeadline - bDeadline;
        // 4. По свежести
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [items, scopeTab, priorityFilter, search, city]);

  // Группировка по мастеру
  const grouped = useMemo(() => {
    if (viewMode !== "grouped") return null;
    const groups = new Map<string, { masterLabel: string; items: Item[] }>();
    for (const item of filtered) {
      const key = item.masterId != null ? String(item.masterId) : "__no_master__";
      const label = item.masterName ?? (item.masterId != null ? `Мастер #${item.masterId}` : "Без мастера");
      if (!groups.has(key)) groups.set(key, { masterLabel: label, items: [] });
      groups.get(key)!.items.push(item);
    }
    return [...groups.entries()].sort((a, b) => {
      const aCritical = a[1].items.filter(i => i.priority === "critical").length;
      const bCritical = b[1].items.filter(i => i.priority === "critical").length;
      if (bCritical !== aCritical) return bCritical - aCritical;
      return b[1].items.length - a[1].items.length;
    });
  }, [filtered, viewMode]);

  // Мини-график тренда (из filtered — учитывает текущие фильтры)
  const trendData = useMemo(() => {
    const days: Record<string, { critical: number; high: number }> = {};
    const now = Date.now();
    for (let d = 6; d >= 0; d--) {
      const key = new Date(now - d * 86400000).toISOString().slice(0, 10);
      days[key] = { critical: 0, high: 0 };
    }
    for (const item of filtered) {
      const key = new Date(item.createdAt).toISOString().slice(0, 10);
      if (days[key]) {
        if (item.priority === "critical") days[key].critical++;
        else if (item.priority === "high") days[key].high++;
      }
    }
    return Object.values(days);
  }, [filtered]);

  const trendCritical = trendData.map(d => d.critical);
  const trendDirection = trendCritical.length >= 2
    ? trendCritical[trendCritical.length - 1] > trendCritical[0] ? "up" : trendCritical[trendCritical.length - 1] < trendCritical[0] ? "down" : "flat"
    : "flat";

  // Количество горящих задач
  const burningCount = useMemo(() => filtered.filter(i => isBurning(i)).length, [filtered]);

  // Авто-эскалация: есть ли критичные >24ч (из filtered — учитывает текущие фильтры)
  const hasStaleCritical = useMemo(() => {
    return filtered.some(i => i.priority === "critical" && (Date.now() - new Date(i.createdAt).getTime()) > 24 * 3600000);
  }, [filtered]);

  // ─── Фаза 3: KPI-метрики ─────────────────────────────────────────
  const kpi = useMemo(() => {
    // Дедупликация по orderId: один заказ может породить несколько задач (no_estimate + no_progress + case-*),
    // каждая со своей суммой. Берём максимальную сумму по каждому уникальному заказу, не складываем дубли.
    const totalAtRisk = (() => {
      const byOrder = new Map<string, number>();
      for (const i of filtered) {
        const key = i.orderId != null ? `order-${i.orderId}` : `item-${i.id}`;
        const cur = byOrder.get(key) ?? 0;
        byOrder.set(key, Math.max(cur, Number(i.amountAtRisk) || 0));
      }
      return [...byOrder.values()].reduce((s, v) => s + v, 0);
    })();
    const ages = filtered.map(i => (Date.now() - new Date(i.createdAt).getTime()) / 3600000);
    const avgAgeH = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
    const total = filtered.length;
    const oldestH = ages.length > 0 ? Math.max(...ages) : 0;
    return { totalAtRisk, avgAgeH, oldestH, total };
  }, [filtered]);

  // Счётчики по приоритету из filtered (учитывают текущие фильтры)
  const filteredCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const i of filtered) counts[i.priority]++;
    return counts;
  }, [filtered]);

  // ─── Фаза 3: Drag-and-drop состояние ─────────────────────────────
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [pinnedOrder, setPinnedOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("action-items-pinned-order") || "[]"); } catch { return []; }
  });

  // Очистка pinnedOrder от ID задач, которых больше нет в filtered
  useEffect(() => {
    if (pinnedOrder.length === 0) return;
    const currentIds = new Set(filtered.map(i => i.id));
    const cleaned = pinnedOrder.filter(id => currentIds.has(id));
    if (cleaned.length !== pinnedOrder.length) {
      setPinnedOrder(cleaned);
      localStorage.setItem("action-items-pinned-order", JSON.stringify(cleaned));
    }
  }, [filtered, pinnedOrder]);

  // Применяем pinned порядок к filtered
  const displayItems = useMemo(() => {
    if (pinnedOrder.length === 0) return filtered;
    const pinned = new Set(pinnedOrder);
    const ordered: Item[] = [];
    for (const id of pinnedOrder) {
      const item = filtered.find(i => i.id === id);
      if (item) ordered.push(item);
    }
    for (const item of filtered) {
      if (!pinned.has(item.id)) ordered.push(item);
    }
    return ordered;
  }, [filtered, pinnedOrder]);

  // showAll — производная переменная (не отдельный state)
  const showAll = visibleCount >= displayItems.length;

  const handleDragStart = (e: DragEvent, id: string) => {
    setDragItemId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragItemId && targetId !== dragItemId) {
      setDragOverId(targetId);
    }
  };

  const handleDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragItemId || dragItemId === targetId) { setDragOverId(null); setDragItemId(null); return; }
    // Переставляем в pinnedOrder
    const currentOrder = displayItems.map(i => i.id);
    const fromIdx = currentOrder.indexOf(dragItemId);
    const toIdx = currentOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) { setDragOverId(null); setDragItemId(null); return; }
    const newOrder = [...currentOrder];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragItemId);
    setPinnedOrder(newOrder);
    localStorage.setItem("action-items-pinned-order", JSON.stringify(newOrder));
    setDragOverId(null);
    setDragItemId(null);
  };

  const handleDragEnd = () => { setDragOverId(null); setDragItemId(null); };

  // ─── Snooze ──────────────────────────────────────────────────────
  const handleSnooze = useCallback(async (id: string, days: number) => {
    try {
      await fetch(`/api/dashboard/action-items/${id}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", payload: { days } }),
      });
      window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
    } catch { /* ignore */ }
  }, []);

  // ─── Фаза 3: Экспорт CSV ─────────────────────────────────────────
  const csvEscape = (v: string) => `"${v.replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;

  const handleExportCSV = useCallback(() => {
    const rows = [
      ["Приоритет", "Тип", "Заголовок", "Описание", "Город", "Мастер", "Заказ", "Сумма под риском", "Возраст (ч)", "Дедлайн", "Создана"],
      ...displayItems.map(i => {
        const ageH = Math.round((Date.now() - new Date(i.createdAt).getTime()) / 3600000);
        return [
          i.priority, i.type, csvEscape(i.title), csvEscape(i.shortDescription),
          i.city ?? "", i.masterName ?? (i.masterId ? `#${i.masterId}` : ""), i.orderId ?? "",
          i.amountAtRisk != null ? `"${i.amountAtRisk}"` : "", ageH, i.deadline ?? "", i.createdAt,
        ];
      }),
    ];
    const csv = rows.map(r => r.join(";")).join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayItems]);

  // ─── Фаза 3: Браузерные уведомления при новых критичных ──────────
  const dataLoadedRef = useRef(false);
  const prevCriticalCountRef = useRef(-1);
  useEffect(() => {
    if (isLoading) return;
    if (!dataLoadedRef.current) { dataLoadedRef.current = true; prevCriticalCountRef.current = summary.critical; return; }
    const prev = prevCriticalCountRef.current;
    if (summary.critical > prev && prev >= 0) {
      // UX-8: Звук при новых критичных (исправлена утечка AudioContext)
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.value = 0.15;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
        osc.onended = () => { ctx.close(); };
      } catch { /* AudioContext not available */ }
      // Браузерное уведомление (убран авто-запрос permission — только если уже granted)
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("🔥 Новые критичные задачи", {
          body: `Критичных задач: ${summary.critical} (+${summary.critical - prev})`,
          tag: "action-items-critical",
        });
      }
    }
    prevCriticalCountRef.current = summary.critical;
  }, [summary.critical, isLoading]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => {
    const visibleIds = (showAll ? displayItems : displayItems.slice(0, visibleCount)).map(i => i.id);
    setSelectedIds(new Set(visibleIds));
  };

  const deselectAll = () => setSelectedIds(new Set());

  // UX-1: AlertDialog state вместо window.confirm
  const [confirmDialog, setConfirmDialog] = useState<{ action: string; label: string; count: number } | null>(null);

  const bulkAction = (action: string) => {
    if (selectedIds.size === 0) return;
    const actionLabel = action === "dismiss" ? "отложить на 30 дней" : "пометить выполненными";
    setConfirmDialog({ action, label: actionLabel, count: selectedIds.size });
  };

  const bulkActionConfirmed = async () => {
    if (!confirmDialog) return;
    const action = confirmDialog.action;
    setConfirmDialog(null);
    setBulkActionBusy(action);
    let ok = 0;
    let fail = 0;
    // Поддержка одиночного dismiss с шортката E
    const pendingId = (window as any).__pendingDismissId;
    const ids = pendingId ? [pendingId] : [...selectedIds];
    if (pendingId) delete (window as any).__pendingDismissId;
    for (const id of ids) {
      try {
        const r = await fetch(`/api/dashboard/action-items/${id}/action`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, payload: {} }),
        });
        if (r.ok) ok++; else fail++;
      } catch { fail++; }
    }
    window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
    setSelectedIds(new Set());
    setBulkActionBusy(null);
    const msg = action === "dismiss"
      ? `Отложено ${ok} задач${fail > 0 ? `, ${fail} ош.` : ""}`
      : `Выполнено ${ok} из ${ok + fail}${fail > 0 ? ` (${fail} ошибок)` : ""}`;
    setBulkToast({ msg, ok: fail === 0 });
    setTimeout(() => setBulkToast(null), 3000);
  };

  const handleQuickCall = (id: string) => setOpenId(id);
  const handleQuickMessage = (id: string) => setOpenId(id);

  // UX-7: Анимация при выполнении задачи
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const handleQuickResolve = useCallback(async (id: string) => {
    setResolvingIds(prev => new Set(prev).add(id));
    setTimeout(async () => {
      try {
        const r = await fetch(`/api/dashboard/action-items/${id}/action`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resolve", payload: {} }),
        });
        if (r.ok) window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
      } catch { /* ignore */ }
      setResolvingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 600); // задержка для анимации
  }, []);

  // UX-4: Быстрый snooze из карточки
  const handleQuickSnooze = useCallback(async (id: string) => {
    try {
      await fetch(`/api/dashboard/action-items/${id}/action`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", payload: { days: 1 } }),
      });
      window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
    } catch { /* ignore */ }
  }, []);

  // UX-9: Взять задачу на себя
  const handleAssignSelf = useCallback(async (id: string) => {
    try {
      await fetch(`/api/dashboard/action-items/${id}/action`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_self", payload: {} }),
      });
      window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
    } catch { /* ignore */ }
  }, []);

  const handlePriorityClick = (p: string) => {
    if (priorityFilter === p) { setPriorityFilter("all"); } else { setPriorityFilter(p); }
  };

  // AI-подсказка
  const handleAiHint = useCallback(async (id: string) => {
    // Кеш в localStorage на 30 мин
    const cacheKey = `ai-hint-${id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { text, ts } = JSON.parse(cached);
      if (Date.now() - ts < 30 * 60 * 1000) {
        setAiHints(prev => ({ ...prev, [id]: text }));
        return;
      }
    }
    setAiHintLoadingId(id);
    try {
      const r = await fetch(`/api/dashboard/action-items/${id}/ai-hint`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Ошибка");
      const { hint } = await r.json();
      setAiHints(prev => ({ ...prev, [id]: hint }));
      localStorage.setItem(cacheKey, JSON.stringify({ text: hint, ts: Date.now() }));
    } catch {
      setAiHints(prev => ({ ...prev, [id]: "Не удалось получить подсказку. Попробуйте позже." }));
    } finally {
      setAiHintLoadingId(null);
    }
  }, []);

  // ─── Клавиатурные шорткаты ──────────────────────────────────────
  const visibleItems = useMemo(() => showAll ? displayItems : displayItems.slice(0, visibleCount), [showAll, displayItems, visibleCount]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Не перехватываем если фокус в input/textarea
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    switch (e.key.toLowerCase()) {
      case "j":
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, visibleItems.length - 1));
        break;
      case "k":
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case "enter":
        if (focusedIndex >= 0 && focusedIndex < visibleItems.length) {
          e.preventDefault();
          setOpenId(visibleItems[focusedIndex].id);
        }
        break;
      case "x":
        if (focusedIndex >= 0 && focusedIndex < visibleItems.length) {
          e.preventDefault();
          toggleSelect(visibleItems[focusedIndex].id);
        }
        break;
      case "e":
        if (focusedIndex >= 0 && focusedIndex < visibleItems.length) {
          e.preventDefault();
          const itemId = visibleItems[focusedIndex].id;
          // Подтверждение перед откладыванием (dismiss = 30 дней)
          setConfirmDialog({ action: "dismiss", label: "отложить на 30 дней", count: 1 });
          // Сохраняем itemId для подтверждения
          (window as any).__pendingDismissId = itemId;
        }
        break;
      case "r":
        if (focusedIndex >= 0 && focusedIndex < visibleItems.length) {
          e.preventDefault();
          const itemId = visibleItems[focusedIndex].id;
          fetch(`/api/dashboard/action-items/${itemId}/action`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "resolve", payload: {} }),
          }).then(() => {
            window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
          });
        }
        break;
      case "?":
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        break;
      case "escape":
        setShowShortcuts(false);
        setFocusedIndex(-1);
        break;
    }
  }, [focusedIndex, visibleItems, toggleSelect]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Прокрутка к сфокусированной карточке
  useEffect(() => {
    if (focusedIndex >= 0 && sectionRef.current) {
      const cards = sectionRef.current.querySelectorAll("[data-item-id]");
      if (cards[focusedIndex]) {
        cards[focusedIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [focusedIndex]);

  // Snooze dropdown state
  const [snoozeMenuId, setSnoozeMenuId] = useState<string | null>(null);
  const [snoozeOpenUp, setSnoozeOpenUp] = useState(false);
  // Закрытие snooze dropdown при клике вне
  useEffect(() => {
    if (!snoozeMenuId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-snooze-menu]")) setSnoozeMenuId(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [snoozeMenuId]);

  // Рендер карточки с учётом выбора + фокуса + drag
  // showDragAndSnooze: false в групповом виде (drag/snooze не нужны)
  const renderCard = (item: Item, idx?: number, showDragAndSnooze = true) => (
    <div
      key={item.id}
      data-item-id={item.id}
      className={`relative flex items-stretch gap-1 transition-all ${
        dragOverId === item.id ? "ring-2 ring-violet-400 ring-offset-1 rounded-xl" : ""
      } ${dragItemId === item.id ? "opacity-50" : ""}`}
    >
      {/* Drag handle — только в списочном виде */}
      {showDragAndSnooze && (
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragOver={(e) => handleDragOver(e, item.id)}
          onDrop={(e) => handleDrop(e, item.id)}
          onDragEnd={handleDragEnd}
          className="flex items-center px-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition shrink-0"
          title="Перетащите для изменения порядка"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <ActionItemCard
          item={{
            ...item,
            selected: selectedIds.has(item.id),
            focused: idx !== undefined && idx === focusedIndex,
            createdAt: item.createdAt,
          }}
          onOpen={setOpenId}
          onToggleSelect={toggleSelect}
          onQuickCall={handleQuickCall}
          onQuickMessage={handleQuickMessage}
          onAiHint={handleAiHint}
          aiHintLoading={aiHintLoadingId === item.id}
          aiHintText={aiHints[item.id] ?? null}
          compact={viewMode === "grouped"}
          onQuickResolve={handleQuickResolve}
          onQuickSnooze={handleQuickSnooze}
          onAssignSelf={handleAssignSelf}
        />
        {/* UX-7: Анимация при выполнении */}
        {resolvingIds.has(item.id) && (
          <div className="absolute inset-0 bg-green-50/60 rounded-xl flex items-center justify-center z-10 pointer-events-none">
            <div className="flex items-center gap-1.5 text-green-700 font-bold text-sm animate-pulse">
              <CheckCircle2 className="w-5 h-5" /> Выполнено!
            </div>
          </div>
        )}
      </div>
      {/* Snooze кнопка-триггер — только в списочном виде */}
      {showDragAndSnooze && (
        <div className="flex flex-col items-center justify-start pt-2 shrink-0 gap-1" data-snooze-menu>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const newOpen = snoozeMenuId === item.id ? null : item.id;
              if (newOpen) {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setSnoozeOpenUp(rect.bottom + 160 > window.innerHeight);
              }
              setSnoozeMenuId(newOpen);
            }}
            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 border flex items-center justify-center transition"
            title="Отложить задачу"
          >
            <Timer className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      )}
      {/* Snooze dropdown — умное позиционирование (вверх/вниз) */}
      {snoozeMenuId === item.id && (
        <div className={`absolute right-0 z-50 bg-white border rounded-xl shadow-lg p-2 min-w-[140px] ${snoozeOpenUp ? "bottom-full mb-1" : "top-full mt-1"}`} data-snooze-menu>
          <div className="text-[10px] font-bold text-muted-foreground mb-1.5 px-1">Отложить на:</div>
          {[1, 2, 3, 7].map(d => (
            <button
              key={d}
              onClick={() => { handleSnooze(item.id, d); setSnoozeMenuId(null); }}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-100 rounded-lg transition"
            >
              {d} {pluralRu(d, "день", "дня", "дней")}
            </button>
          ))}
          <button
            onClick={() => setSnoozeMenuId(null)}
            className="w-full text-left px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition mt-1"
          >
            Отмена
          </button>
        </div>
      )}
    </div>
  );

  return (
    <section
      ref={sectionRef}
      className={`rounded-2xl border shadow-sm p-5 transition-colors ${
        hasStaleCritical
          ? "bg-red-50/40 border-red-300"
          : "bg-white"
      }`}
    >
      {/* Шапка: заголовок + кликабельные счётчики + тренд */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">Что делать сейчас</h2>
            {burningCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                🔥 {burningCount} горящ.
              </span>
            )}
            {hasStaleCritical && (
              <span className="text-xs font-semibold text-red-600 animate-pulse">⚠ Требует внимания</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Задачи, требующие вашего действия</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Мини-график тренда */}
          <div className="flex items-center gap-1 mr-1" title="Тренд критичных задач за 7 дней">
            {trendDirection === "up" && <TrendingUp className="w-3.5 h-3.5 text-red-500" />}
            {trendDirection === "down" && <TrendingDown className="w-3.5 h-3.5 text-green-500" />}
            {trendDirection === "flat" && <Minus className="w-3.5 h-3.5 text-slate-400" />}
            <Sparkline data={trendCritical} width={50} height={16} color={trendDirection === "up" ? "#ef4444" : trendDirection === "down" ? "#22c55e" : "#94a3b8"} />
          </div>
          <button
            onClick={() => handlePriorityClick("critical")}
            className={`px-2.5 py-1 text-xs rounded-full font-semibold cursor-pointer transition ${priorityFilter === "critical" ? "bg-red-500 text-white ring-2 ring-red-300" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
          >
            Критичные {filteredCounts.critical}
          </button>
          <button
            onClick={() => handlePriorityClick("high")}
            className={`px-2.5 py-1 text-xs rounded-full font-semibold cursor-pointer transition ${priorityFilter === "high" ? "bg-orange-500 text-white ring-2 ring-orange-300" : "bg-orange-100 text-orange-700 hover:bg-orange-200"}`}
          >
            Высокий {filteredCounts.high}
          </button>
          <button
            onClick={() => handlePriorityClick("medium")}
            className={`px-2.5 py-1 text-xs rounded-full font-semibold cursor-pointer transition ${priorityFilter === "medium" ? "bg-blue-500 text-white ring-2 ring-blue-300" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
          >
            Средние {filteredCounts.medium}
          </button>
          {filteredCounts.low > 0 && (
            <button
              onClick={() => handlePriorityClick("low")}
            className={`px-2.5 py-1 text-xs rounded-full font-semibold cursor-pointer transition ${priorityFilter === "low" ? "bg-slate-500 text-white ring-2 ring-slate-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              Низкие {filteredCounts.low}
            </button>
          )}
          <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-50 text-emerald-700 font-semibold">
            Выполнено сегодня {summary.doneToday}
          </span>
        </div>
      </div>

      {/* ─── Фаза 3: KPI-панель ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl border bg-white p-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-medium">Средний возраст</div>
            <div className="text-sm font-bold text-amber-700">{kpi.avgAgeH >= 24 ? `${Math.round(kpi.avgAgeH / 24)} дн.` : `${Math.round(kpi.avgAgeH)} ч`}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-medium">Самая старая</div>
            <div className="text-sm font-bold text-violet-700">{kpi.oldestH >= 24 ? `${Math.round(kpi.oldestH / 24)} дн.` : `${Math.round(kpi.oldestH)} ч`}</div>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-medium">Выполнено сегодня</div>
            {/* Знаменатель = активные + выполненные сегодня = все задачи за день */}
            <div className="text-sm font-bold text-emerald-700">
              {summary.doneToday}
              <span className="text-[10px] font-normal text-muted-foreground"> из {summary.doneToday + kpi.total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Поиск + Табы фильтров */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="relative md:col-span-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Поиск по названию, заказу или мастеру" className="pl-9" />
        </div>
        <div className="md:col-span-2">
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5 overflow-x-auto">
            {SCOPE_TABS.map((f) => (
              <button
                key={f.key}
                onClick={() => setScopeTab(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  scopeTab === f.key
                    ? "bg-white shadow-sm text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Период + Только мои + Переключатель вида + Шорткаты */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {[{ k: "all", l: "Все" }, { k: "today", l: "Сегодня" }, { k: "week", l: "Неделя" }, { k: "month", l: "Месяц" }, { k: "quarter", l: "Квартал" }].map(p => (
            <button key={p.k} onClick={() => setPeriod(p.k)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${period === p.k ? "bg-white shadow-sm text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}>{p.l}</button>
          ))}
        </div>
        {/* «Только мои» скрыт: assigneeId не заполняется на сервере, фильтр не работает */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 ml-auto">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition ${viewMode === "list" ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            title="Список"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("grouped")}
            className={`p-1.5 rounded-md transition ${viewMode === "grouped" ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            title="По мастерам"
          >
            <Users className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => setShowShortcuts(prev => !prev)}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 transition"
          title="Клавиатурные шорткаты (?)"
        >
          <Keyboard className="w-4 h-4" />
        </button>
        {/* Фаза 3: Export CSV */}
        <button
          onClick={handleExportCSV}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 transition"
          title="Экспорт CSV"
          disabled={displayItems.length === 0}
        >
          <Download className="w-4 h-4" />
        </button>
        {/* Фаза 3: Включить уведомления — показываем всегда если API доступен */}
        {"Notification" in window && (() => {
          const perm = Notification.permission;
          if (perm === "granted") {
            return (
              <button
                disabled
                className="p-1.5 rounded-md text-emerald-600 bg-emerald-50 border border-emerald-200 cursor-default transition"
                title="Уведомления браузера включены"
              >
                <Bell className="w-4 h-4" />
              </button>
            );
          }
          if (perm === "denied") {
            return (
              <button
                disabled
                className="p-1.5 rounded-md text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed transition"
                title="Уведомления заблокированы браузером. Разрешите их в настройках браузера (значок замка в адресной строке)"
              >
                <BellRing className="w-4 h-4" />
              </button>
            );
          }
          // "default" — ещё не запрашивали
          return (
            <button
              onClick={() => Notification.requestPermission()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-100 transition"
              title="Включить уведомления браузера о новых критичных задачах"
            >
              <Bell className="w-4 h-4" />
            </button>
          );
        })()}
      </div>

      {/* Подсказка по шорткатам */}
      {showShortcuts && (
        <div className="mb-3 p-3 rounded-xl bg-slate-50 border text-xs space-y-1.5">
          <div className="font-bold text-sm mb-2">⌨️ Клавиатурные шорткаты</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div><kbd className="px-1.5 py-0.5 bg-white rounded border font-mono text-[11px]">J</kbd> Вниз</div>
            <div><kbd className="px-1.5 py-0.5 bg-white rounded border font-mono text-[11px]">K</kbd> Вверх</div>
            <div><kbd className="px-1.5 py-0.5 bg-white rounded border font-mono text-[11px]">Enter</kbd> Открыть задачу</div>
            <div><kbd className="px-1.5 py-0.5 bg-white rounded border font-mono text-[11px]">X</kbd> Выбрать / снять</div>
            <div><kbd className="px-1.5 py-0.5 bg-white rounded border font-mono text-[11px]">E</kbd> Отложить задачу</div>
            <div><kbd className="px-1.5 py-0.5 bg-white rounded border font-mono text-[11px]">R</kbd> Пометить выполненной</div>
            <div><kbd className="px-1.5 py-0.5 bg-white rounded border font-mono text-[11px]">?</kbd> Эта подсказка</div>
            <div><kbd className="px-1.5 py-0.5 bg-white rounded border font-mono text-[11px]">Esc</kbd> Снять фокус</div>
          </div>
        </div>
      )}

      {/* Панель массовых действий */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-2 p-2.5 rounded-xl bg-violet-50 border border-violet-200 flex-wrap">
          <span className="text-xs font-semibold text-violet-700">
            Выбрано: {selectedIds.size}
          </span>
          <Button size="sm" variant="outline" onClick={selectAll} className="text-xs h-7">
            Все
          </Button>
          <Button size="sm" variant="outline" onClick={deselectAll} className="text-xs h-7">
            <X className="w-3 h-3" /> Сброс
          </Button>
          <div className="h-4 w-px bg-violet-200 mx-1" />
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-violet-300 text-violet-700 hover:bg-violet-100"
            disabled={bulkActionBusy === "dismiss"}
            onClick={() => bulkAction("dismiss")}
          >
            <BellRing className="w-3 h-3" /> Отложить все
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
            disabled={bulkActionBusy === "resolve"}
            onClick={() => bulkAction("resolve")}
          >
            <CheckCircle2 className="w-3 h-3" /> Пометить выполненными
          </Button>
          {/* UX-6: Быстрые массовые действия по типу */}
          {(() => {
            const selectedItems = displayItems.filter(i => selectedIds.has(i.id));
            const types = [...new Set(selectedItems.map(i => i.type))];
            if (types.length > 0 && selectedIds.size > 1) {
              return (
                <>
                  <div className="h-4 w-px bg-violet-200 mx-1" />
                  <span className="text-[10px] text-violet-600 font-medium">По типу:</span>
                  {types.slice(0, 4).map(t => (
                    <Button
                      key={t}
                      size="sm"
                      variant="outline"
                      className="text-[10px] h-6 border-slate-200 text-slate-600 hover:bg-slate-50"
                      onClick={() => {
                        const idsOfType = selectedItems.filter(i => i.type === t).map(i => i.id);
                        setSelectedIds(new Set(idsOfType));
                      }}
                    >
                      {TYPE_LABEL[t] ?? t}
                    </Button>
                  ))}
                </>
              );
            }
            return null;
          })()}
        </div>
      )}

      {/* Toast массового действия */}
      {bulkToast && (
        <div className={`mb-3 text-xs font-semibold px-3 py-2 rounded-lg ${bulkToast.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {bulkToast.msg}
        </div>
      )}

      {/* Контент: список / группировка */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyTasksState
          priorityFilter={priorityFilter}
          summary={summary}
          onRefetch={refetch}
        />
      ) : viewMode === "grouped" && grouped ? (
        <div className="space-y-3">
          {grouped.map(([masterKey, group]) => {
            const criticalCount = group.items.filter(i => i.priority === "critical").length;
            const highCount = group.items.filter(i => i.priority === "high").length;
            return (
              <div key={masterKey} className="rounded-xl border bg-slate-50/50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-white border-b">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-violet-600" />
                    <span className="text-sm font-semibold text-foreground">{group.masterLabel}</span>
                    <span className="text-xs text-muted-foreground">({group.items.length} задач)</span>
                  </div>
                  <div className="flex gap-1.5">
                    {criticalCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        {criticalCount} критичн.
                      </span>
                    )}
                    {highCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                        {highCount} высок.
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-2 space-y-2">
                  {group.items.map((item, gIdx) => renderCard(item, gIdx, false))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── Обычный список (с учётом drag-and-drop порядка) ─── */
        <div className="space-y-2">
          {(showAll ? displayItems : displayItems.slice(0, visibleCount)).map((item, idx) => renderCard(item, idx))}
          {/* UX-2: Progressive loading — кнопка «Ещё» вместо «Показать все» */}
          {!showAll && displayItems.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
              className="w-full py-2.5 text-xs font-semibold text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <List className="w-3.5 h-3.5" />
              Показать ещё {Math.min(PAGE_SIZE, displayItems.length - visibleCount)}
            </button>
          )}
          {!showAll && displayItems.length > visibleCount + PAGE_SIZE && (
            <button
              onClick={() => setVisibleCount(displayItems.length)}
              className="w-full py-1.5 text-[10px] font-medium text-slate-500 hover:text-slate-700 transition"
            >
              Показать все {displayItems.length} задач
            </button>
          )}
        </div>
      )}

      {/* Кнопка обновить */}
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs text-muted-foreground">
          Обновить
        </Button>
      </div>

      {/* UX-1: AlertDialog для подтверждения массовых действий */}
      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите действие</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите {confirmDialog?.label} {confirmDialog?.count} задач? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={bulkActionConfirmed} className="bg-violet-600 hover:bg-violet-700">
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Модалка задачи */}
      <ActionItemModal
        id={openId}
        open={!!openId}
        onOpenChange={(open) => { if (!open) { setOpenId(null); refetch(); } }}
      />
    </section>
  );
}
