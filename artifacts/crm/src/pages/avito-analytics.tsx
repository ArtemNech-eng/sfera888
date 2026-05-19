import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Eye, EyeOff, Phone, DollarSign, Wallet, RefreshCw,
  ArrowUpDown, ArrowUp, ArrowDown, Download, AlertCircle, Trophy, AlertTriangle,
  Minus, Loader2, Calendar, Info, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AvitoItemModal } from "./AvitoItemModal";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function apiFetch(path: string) {
  const r = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as any;
    throw new Error(j.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AvitoItem {
  id: number;
  title: string;
  status: string;
  url: string;
  address?: string;
  category?: { id: number; name: string };
  location?: { name?: string };
  stats?: {
    viewsDay?: number; viewsWeek?: number; viewsMonth?: number;
    contactsDay?: number; contactsWeek?: number; contactsMonth?: number;
    favsDay?: number; favsWeek?: number; favsMonth?: number;
    lastDataDate?: string | null;
    daily?: { date: string; uniqViews: number; uniqContacts: number; uniqFavorites: number }[];
  };
}

interface AnalyticsData {
  balance: { balanceRub: number; source: string; needsReauth: boolean };
  spending: {
    today: number; yesterday: number; month: number; prevMonth: number;
    daily: { date: string; amount: number }[];
    available: boolean;
  };
  crmByCity: { city: string; leads: number; orders: number; revenue: number }[];
  crmByCategory: { category: string; leads: number; orders: number; revenue: number }[];
  crmByItem: { itemId: string; leads: number; orders: number; revenue: number }[];
}

interface CrmStats {
  leads: { total: number; month: number; week: number; today: number };
  orders: { total: number; month: number; week: number };
  revenue: { total: number; month: number; avgOrder: number };
}

type Period = "today" | "week" | "month" | "custom";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, unit = "₽") {
  return `${n.toLocaleString("ru-RU")} ${unit}`;
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function roiColor(roi: number | null) {
  if (roi === null) return "text-muted-foreground";
  if (roi >= 3) return "text-green-600 dark:text-green-400";
  if (roi >= 1.5) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function roiBadge(roi: number | null) {
  if (roi === null) return "—";
  return `×${roi.toFixed(1)}`;
}

function cpcColor(cpc: number | null) {
  if (cpc === null) return "text-muted-foreground";
  if (cpc <= 150) return "text-green-600 dark:text-green-400";
  if (cpc <= 300) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function convColor(rate: number) {
  if (rate >= 5) return "text-green-600 dark:text-green-400";
  if (rate >= 2) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function exportCsv(headers: string[], rows: (string | number)[][], filename: string) {
  const bom = "\uFEFF";
  const lines = [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";")
  );
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

type SortDir = "asc" | "desc";
function useSortable<T>(items: T[], defaultKey: keyof T, defaultDir: SortDir = "desc") {
  const [key, setKey] = useState<keyof T>(defaultKey);
  const [dir, setDir] = useState<SortDir>(defaultDir);

  const toggle = useCallback((k: keyof T) => {
    if (k === key) setDir(d => d === "asc" ? "desc" : "asc");
    else { setKey(k); setDir("desc"); }
  }, [key]);

  const sorted = useMemo(() => [...items].sort((a, b) => {
    const av = a[key] as any, bv = b[key] as any;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  }), [items, key, dir]);

  return { sorted, key, dir, toggle };
}

function SortIcon({ field, active, dir }: { field: string; active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="w-3 h-3 ml-1 text-primary" /> : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
}

function Th({ label, field, sortKey, activeKey, dir, onSort }: {
  label: string; field: string; sortKey: string; activeKey: string; dir: SortDir; onSort: (k: any) => void;
}) {
  return (
    <th
      className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center">
        {label}
        <SortIcon field={field} active={activeKey === field} dir={dir} />
      </span>
    </th>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  items: AvitoItem[];
  itemsLoading: boolean;
  connected: boolean;
  onGoToSettings?: () => void;
}

export function AvitoAnalyticsTab({ items, itemsLoading, connected, onGoToSettings }: Props) {
  const [period, setPeriod] = useState<Period>("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<AvitoItem | null>(null);
  const [hideInactive, setHideInactive] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: analyticsData, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery<AnalyticsData>({
    queryKey: ["/api/avito/analytics"],
    queryFn: () => apiFetch("/api/avito/analytics"),
    enabled: connected,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: crmStats } = useQuery<CrmStats>({
    queryKey: ["/api/avito/crm-stats"],
    queryFn: () => apiFetch("/api/avito/crm-stats"),
    enabled: connected,
    staleTime: 5 * 60_000,
  });

  // Schedule — which items are on timed activation
  const { data: scheduleData } = useQuery<{ items: { itemId: string; enabled: boolean }[] }>({
    queryKey: ["/api/avito/schedules"],
    queryFn: () => apiFetch("/api/avito/schedules"),
    enabled: connected,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const scheduledIds = useMemo(() => new Set((scheduleData?.items ?? []).filter(i => i.enabled).map(i => i.itemId)), [scheduleData]);

  // Auto-refresh items every 30s
  useQuery({
    queryKey: ["/api/avito/items-with-stats", "__autorefresh"],
    queryFn: () => apiFetch("/api/avito/items-with-stats"),
    enabled: connected,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  // Custom period query — fires only when user selects custom + enters both dates
  const hasCustomDates = period === "custom" && !!dateFrom && !!dateTo;
  const { data: customData, isFetching: customFetching } = useQuery<{ resources: AvitoItem[] }>({
    queryKey: ["/api/avito/items-with-stats/custom", dateFrom, dateTo],
    queryFn: () => apiFetch(`/api/avito/items-with-stats?statsFrom=${dateFrom}&statsTo=${dateTo}`),
    enabled: connected && hasCustomDates,
    staleTime: 5 * 60_000,
  });

  // Map: itemId → {views, contacts} for the custom period
  const customStatsMap = useMemo(() => {
    const map: Record<number, { views: number; contacts: number }> = {};
    for (const item of (customData?.resources ?? [])) {
      map[item.id] = {
        views:    (item.stats as any)?.viewsDay    ?? 0,
        contacts: (item.stats as any)?.contactsDay ?? 0,
      };
    }
    return map;
  }, [customData]);

  // ── Derived values ───────────────────────────────────────────────────────

  const balance = analyticsData?.balance;
  const spending = analyticsData?.spending;

  // Today / yesterday views & contacts — from pre-computed backend stats
  const { viewsToday, viewsYesterday, contactsToday, contactsYesterday, statsLastDate } = useMemo(() => {
    let vT = 0, vY = 0, cT = 0, cY = 0;
    let lastDate: string | null = null;
    for (const item of items) {
      vT += (item.stats as any)?.viewsDay          ?? 0;
      cT += (item.stats as any)?.contactsDay       ?? 0;
      vY += (item.stats as any)?.viewsYesterday    ?? 0;
      cY += (item.stats as any)?.contactsYesterday ?? 0;
      const ld = item.stats?.lastDataDate;
      if (ld && (!lastDate || ld > lastDate)) lastDate = ld;
    }
    return { viewsToday: vT, viewsYesterday: vY, contactsToday: cT, contactsYesterday: cY, statsLastDate: lastDate };
  }, [items]);

  // Period-aware stats per item
  const itemsWithPeriodStats = useMemo(() => {
    return items.map(item => {
      let views = 0, contacts = 0;
      if (period === "custom") {
        const cs = customStatsMap[item.id];
        views    = cs?.views    ?? 0;
        contacts = cs?.contacts ?? 0;
      } else if (period === "today") {
        views    = (item.stats as any)?.viewsDay    ?? 0;
        contacts = (item.stats as any)?.contactsDay ?? 0;
      } else if (period === "week") {
        views    = (item.stats as any)?.viewsWeek    ?? 0;
        contacts = (item.stats as any)?.contactsWeek ?? 0;
      } else {
        views    = (item.stats as any)?.viewsMonth    ?? 0;
        contacts = (item.stats as any)?.contactsMonth ?? 0;
      }
      return { ...item, periodViews: views, periodContacts: contacts };
    });
  }, [items, period, customStatsMap]);

  const totalPeriodViews = useMemo(() => itemsWithPeriodStats.reduce((s, i) => s + i.periodViews, 0), [itemsWithPeriodStats]);

  // Compute per-item spending via view-proportional allocation
  const periodSpending = useMemo(() => {
    if (period === "today") return spending?.today ?? 0;
    if (period === "week") {
      const daily = spending?.daily ?? [];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      return daily.filter(d => d.date >= weekAgo).reduce((s, d) => s + d.amount, 0);
    }
    if (period === "custom" && dateFrom && dateTo) {
      const daily = spending?.daily ?? [];
      return daily.filter(d => d.date >= dateFrom && d.date <= dateTo).reduce((s, d) => s + d.amount, 0);
    }
    return spending?.month ?? 0;
  }, [spending, period]);

  // Per-item CRM map (from analytics API, grouped by avitoItemId)
  const crmItemMap = useMemo(() => {
    const map: Record<string, { leads: number; orders: number; revenue: number }> = {};
    (analyticsData?.crmByItem ?? []).forEach(r => { map[String(r.itemId)] = r; });
    return map;
  }, [analyticsData]);

  // Item rows with metrics
  const itemRows = useMemo(() => {
    return itemsWithPeriodStats.map(item => {
      const views = item.periodViews;
      const contacts = item.periodContacts;
      const conv = views > 0 ? (contacts / views * 100) : 0;
      const spendShare = totalPeriodViews > 0 ? views / totalPeriodViews : 0;
      const itemSpend = spending?.available ? Math.round(periodSpending * spendShare) : null;
      const cpc = itemSpend !== null && contacts > 0 ? Math.round(itemSpend / contacts) : null;
      const crm = crmItemMap[String(item.id)];
      const crmLeads = crm?.leads ?? 0;
      const crmOrders = crm?.orders ?? 0;
      const crmRevenue = crm?.revenue ?? 0;
      const cpo = itemSpend !== null && crmOrders > 0 ? Math.round(itemSpend / crmOrders) : null;
      const roi = itemSpend !== null && itemSpend > 0 && crmRevenue > 0 ? crmRevenue / itemSpend : null;
      const cityFromAddress = (() => {
        if (!item.address) return null;
        const regionKeywords = /край|область|республика|округ|oblast|district/i;
        const parts = item.address.split(",").map(s => s.trim()).filter(Boolean);
        // Skip leading region/oblast/krai parts, return first non-region part
        const cityPart = parts.find(p => !regionKeywords.test(p));
        return cityPart || parts[0] || null;
      })();
      const city = cityFromAddress || (item as any).location?.name || "—";
      const category = (item as any).category?.name || "—";
      return { ...item, views, contacts, conv, itemSpend, cpc, cpo, roi, crmLeads, crmOrders, crmRevenue, city, category };
    });
  }, [itemsWithPeriodStats, totalPeriodViews, periodSpending, spending, crmItemMap]);

  // Available cities — union of CRM order cities and Avito item location names (deduplicated by normalized key)
  const availableCities = useMemo(() => {
    const map = new Map<string, string>(); // normalized key → display value
    const add = (c: string) => { const k = c.trim().toLowerCase(); if (k) map.set(k, c.trim()); };
    (analyticsData?.crmByCity ?? []).forEach(r => { if (r.city) add(r.city); });
    itemRows.forEach(r => { if (r.city && r.city !== "—") add(r.city); });
    return Array.from(map.values()).sort();
  }, [analyticsData, itemRows]);

  // City table rows
  const cityRows = useMemo(() => {
    const rows = analyticsData?.crmByCity ?? [];
    const filtered = cityFilter === "all" ? rows : rows.filter(r => r.city === cityFilter);
    return filtered.map(row => {
      const totalSpend = spending?.month ?? 0;
      const totalLeads = (analyticsData?.crmByCity ?? []).reduce((s, r) => s + r.leads, 0);
      const citySpend = totalLeads > 0 && spending?.available ? Math.round(totalSpend * (row.leads / totalLeads)) : null;
      const cpo = citySpend !== null && row.orders > 0 ? Math.round(citySpend / row.orders) : null;
      const roi = citySpend !== null && citySpend > 0 && row.revenue > 0 ? row.revenue / citySpend : null;
      return { ...row, citySpend, cpo, roi };
    });
  }, [analyticsData, cityFilter, spending]);

  // Category table rows
  const categoryRows = useMemo(() => {
    const rows = analyticsData?.crmByCategory ?? [];
    return rows.map(row => {
      const totalSpend = spending?.month ?? 0;
      const totalLeads = (analyticsData?.crmByCategory ?? []).reduce((s, r) => s + r.leads, 0);
      const catSpend = totalLeads > 0 && spending?.available ? Math.round(totalSpend * (row.leads / totalLeads)) : null;
      const cpo = catSpend !== null && row.orders > 0 ? Math.round(catSpend / row.orders) : null;
      const avgCheck = row.orders > 0 ? Math.round(row.revenue / row.orders) : 0;
      const roi = catSpend !== null && catSpend > 0 && row.revenue > 0 ? row.revenue / catSpend : null;
      return { ...row, catSpend, cpo, avgCheck, roi };
    });
  }, [analyticsData, spending]);

  // Spending chart
  const chartData = useMemo(() => {
    const daily = spending?.daily ?? [];
    if (period === "today") {
      const todayStr = new Date().toISOString().split("T")[0];
      return daily.filter(d => d.date === todayStr);
    }
    if (period === "week") {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      return daily.filter(d => d.date >= weekAgo);
    }
    return daily;
  }, [spending, period]);

  const avgDailySpend = chartData.length > 0
    ? Math.round(chartData.reduce((s, d) => s + d.amount, 0) / chartData.length)
    : 0;
  const forecastMonth = Math.round(avgDailySpend * 30);
  const daysLeft = balance && avgDailySpend > 0 ? Math.floor(balance.balanceRub / avgDailySpend) : null;

  // Recommendations
  const recommendations = useMemo(() => {
    const recs: string[] = [];
    for (const item of itemRows) {
      if (item.cpc !== null && item.cpc > 300) {
        recs.push(`⚠️ ${item.title} — контакт дорогой (${item.cpc}₽). Рекомендуется изменить текст или фото объявления.`);
      }
      if (item.views > 0 && item.conv < 5) {
        recs.push(`⚠️ ${item.title} — мало кликают (${item.conv.toFixed(1)}%). Рекомендуется изменить заголовок.`);
      }
      if (item.roi !== null && item.roi < 1.5) {
        recs.push(`⚠️ ${item.title} — не окупается (ROI ${roiBadge(item.roi)}). Рекомендуется отключить или переделать.`);
      }
      if (item.roi !== null && item.roi > 5) {
        recs.push(`🔥 ${item.title} — суперэффективное! (ROI ${roiBadge(item.roi)}). Рекомендуется увеличить бюджет.`);
      }
    }
    return recs;
  }, [itemRows]);

  const { sorted: sortedItems, key: itemSortKey, dir: itemSortDir, toggle: toggleItemSort } =
    useSortable(itemRows, "roi" as any, "desc");

  const visibleItems = useMemo(() => {
    let result = sortedItems;
    if (hideInactive) result = result.filter(i => i.status === "active");
    if (cityFilter !== "all") result = result.filter(i => i.city === cityFilter);
    return result;
  }, [sortedItems, hideInactive, cityFilter]);
  const { sorted: sortedCities, key: citySortKey, dir: citySortDir, toggle: toggleCitySort } =
    useSortable(cityRows, "roi" as any, "desc");
  const { sorted: sortedCategories, key: catSortKey, dir: catSortDir, toggle: toggleCatSort } =
    useSortable(categoryRows, "roi" as any, "desc");

  if (!connected) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Подключите Авито для просмотра аналитики</p>
      </div>
    );
  }

  // ── Period helpers ───────────────────────────────────────────────────────

  const periodLabel: Record<Period, string> = {
    today: "Сегодня",
    week: "7 дней",
    month: "Тек. месяц",
    custom: "Период",
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
    <div className="space-y-5">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1.5">
          {(["today", "week", "month", "custom"] as Period[]).map(p => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setPeriod(p)}
            >
              {periodLabel[p]}
            </Button>
          ))}
          {period === "custom" && (
            <div className="flex items-center gap-1 ml-1">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 px-2 border rounded-md text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 px-2 border rounded-md text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {customFetching && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-1" />}
              {!customFetching && hasCustomDates && customData && (
                <span className="text-xs text-green-600 ml-1">✓</span>
              )}
              {period === "custom" && !dateFrom && !dateTo && (
                <span className="text-xs text-muted-foreground ml-1">выберите период</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {availableCities.length > 0 && (
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Все города</option>
              {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => refetchAnalytics()} disabled={analyticsLoading}>
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", analyticsLoading && "animate-spin")} />
            Обновить
          </Button>
        </div>
      </div>

      {/* Баннер: данные расходов недоступны */}
      {!analyticsLoading && analyticsData && !analyticsData.spending.available && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-950/20 px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-amber-800 dark:text-amber-300">Данные о расходах Авито недоступны</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
              API операций Авито не настроен или не выдал данные. Стоимость контакта, расход по объявлениям и график трат не отображаются.
              Для подключения нужны <b>Client ID</b>, <b>Client Secret</b> и авторизация по OAuth.
            </p>
          </div>
          {onGoToSettings && (
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 border-amber-300 text-amber-800 dark:text-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30" onClick={onGoToSettings}>
              Открыть настройки
            </Button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          БЛОК 1: СВОДКА
      ══════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

        {/* Баланс */}
        <Card className={cn(balance && balance.balanceRub < 1000 ? "border-red-300 bg-red-50/40 dark:bg-red-950/10" : "")}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">💰 Баланс Авито</p>
              <Wallet className={cn("w-4 h-4", balance && balance.balanceRub < 1000 ? "text-red-500" : "text-amber-500")} />
            </div>
            {analyticsLoading ? <div className="h-7 w-20 bg-muted animate-pulse rounded" /> : (
              <p className={cn("text-xl font-bold tabular-nums", balance && balance.balanceRub < 1000 ? "text-red-600" : "")}>
                {balance ? `${balance.balanceRub.toLocaleString("ru-RU")} ₽` : "—"}
              </p>
            )}
            {balance && balance.balanceRub < 1000 && (
              <p className="text-xs text-red-500 font-medium mt-0.5">Пополните!</p>
            )}
            {balance && balance.balanceRub >= 1000 && (
              <p className="text-xs text-green-600 mt-0.5">🟢 В норме</p>
            )}
          </CardContent>
        </Card>

        {/* Потрачено за сегодня */}
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">💸 Потрачено сегодня</p>
            {analyticsLoading ? <div className="h-7 w-20 bg-muted animate-pulse rounded" /> : (
              <p className="text-xl font-bold tabular-nums">
                {spending?.available ? `${(spending.today).toLocaleString("ru-RU")} ₽` : "—"}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {spending?.available ? `Вчера: ${spending.yesterday.toLocaleString("ru-RU")} ₽` : "Данные недоступны"}
            </p>
          </CardContent>
        </Card>

        {/* Потрачено за месяц */}
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1">💸 Потрачено за месяц</p>
            {analyticsLoading ? <div className="h-7 w-20 bg-muted animate-pulse rounded" /> : (
              <p className="text-xl font-bold tabular-nums">
                {spending?.available ? `${spending.month.toLocaleString("ru-RU")} ₽` : "—"}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {spending?.available ? `Прошлый: ${spending.prevMonth.toLocaleString("ru-RU")} ₽` : "Данные недоступны"}
            </p>
          </CardContent>
        </Card>

        {/* Просмотры сегодня */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">👁 Просмотров сегодня</p>
              <Eye className="w-4 h-4 text-blue-500" />
            </div>
            {itemsLoading ? <div className="h-7 w-16 bg-muted animate-pulse rounded" /> : (
              <p className="text-xl font-bold tabular-nums">{viewsToday.toLocaleString("ru-RU")}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Вчера: {viewsYesterday.toLocaleString("ru-RU")}</p>
          </CardContent>
        </Card>

        {/* Контакты сегодня */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">📞 Контактов сегодня</p>
              <Phone className="w-4 h-4 text-green-500" />
            </div>
            {itemsLoading ? <div className="h-7 w-16 bg-muted animate-pulse rounded" /> : (
              <p className="text-xl font-bold tabular-nums">{contactsToday.toLocaleString("ru-RU")}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Вчера: {contactsYesterday.toLocaleString("ru-RU")}</p>
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          БЛОК 2: ЭФФЕКТИВНОСТЬ ОБЪЯВЛЕНИЙ
      ══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="py-3 px-5 border-b">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
              <TrendingUp className="w-4 h-4 text-primary" />
              Эффективность объявлений
              {items.length > 0 && <Badge variant="secondary">{visibleItems.length}{hideInactive && visibleItems.length !== sortedItems.length ? `/${sortedItems.length}` : ""}</Badge>}
              {statsLastDate && (
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  ✓ данные за {new Date(statsLastDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHideInactive(h => !h)}
                className={cn(
                  "h-7 px-2.5 rounded-md border text-xs flex items-center gap-1.5 transition-colors",
                  hideInactive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input text-foreground hover:bg-muted/50"
                )}
              >
                {hideInactive ? <><Eye className="w-3 h-3" /> Показать все</> : <><EyeOff className="w-3 h-3" /> Скрыть неактивные</>}
              </button>
              <Button
                size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => exportCsv(
                  ["Название", "Статус", "Просмотры", "Контакты", "Конверсия %", "Стоимость контакта ₽", "Расход ₽"],
                  visibleItems.map(i => [
                    i.title, i.status, i.views, i.contacts,
                    i.views > 0 ? (i.contacts / i.views * 100).toFixed(1) : "0",
                    i.cpc ?? "—", i.itemSpend ?? "—",
                  ]),
                  "avito-items.csv"
                )}
              >
                <Download className="w-3.5 h-3.5" /> Выгрузить в Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {itemsLoading ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Загрузка...
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Нет объявлений</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground min-w-[180px]">Название</th>
                      <Th label="Статус" field="status" sortKey="status" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="Город" field="city" sortKey="city" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="Категория" field="category" sortKey="category" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="Просмотры" field="views" sortKey="views" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="Контакты" field="contacts" sortKey="contacts" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="Конверсия" field="conv" sortKey="conv" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="₽/контакт" field="cpc" sortKey="cpc" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="Расход ₽" field="itemSpend" sortKey="itemSpend" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="Заявок" field="crmLeads" sortKey="crmLeads" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="Заказов" field="crmOrders" sortKey="crmOrders" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="₽/заказ" field="cpo" sortKey="cpo" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <Th label="ROI" field="roi" sortKey="roi" activeKey={String(itemSortKey)} dir={itemSortDir} onSort={toggleItemSort} />
                      <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground">Детали</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map(item => {
                      const conv = item.views > 0 ? item.contacts / item.views * 100 : 0;
                      const statusColor = item.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : item.status === "blocked" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : item.status === "rejected" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                        : item.status === "old" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        : "bg-muted text-muted-foreground";
                      const statusLabel = item.status === "active" ? "Активно"
                        : item.status === "blocked" ? "Заблок."
                        : item.status === "rejected" ? "Отклонено"
                        : item.status === "old" ? "Истёк"
                        : item.status === "archived" ? "Архив"
                        : item.status === "removed" ? "Удалено"
                        : item.status;
                      return (
                        <tr
                          key={item.id}
                          className="border-b hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => setSelectedItem(item)}
                        >
                          <td className="px-3 py-2.5 max-w-[180px]">
                            <p className="font-medium text-xs leading-tight line-clamp-2 flex items-start gap-1">
                              {scheduledIds.has(String(item.id)) && (
                                <span title="По расписанию (08:00–20:00)">
                                  <Clock className="w-3 h-3 mt-0.5 shrink-0 text-blue-500" />
                                </span>
                              )}
                              {item.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">ID: {item.id}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", statusColor)}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{(item as any).city || "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[120px]">
                            <span className="line-clamp-1">{(item as any).category || "—"}</span>
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-center">{item.views.toLocaleString("ru-RU")}</td>
                          <td className="px-3 py-2.5 tabular-nums text-center">{item.contacts}</td>
                          <td className={cn("px-3 py-2.5 tabular-nums text-center font-medium", convColor(conv))}>
                            {item.views > 0 ? `${conv.toFixed(1)}%` : "—"}
                          </td>
                          <td className={cn("px-3 py-2.5 tabular-nums text-center font-medium", cpcColor(item.cpc))}>
                            {item.cpc !== null ? `${item.cpc.toLocaleString("ru-RU")} ₽` : "—"}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-center text-muted-foreground">
                            {item.itemSpend !== null ? `${item.itemSpend.toLocaleString("ru-RU")} ₽` : "—"}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-center font-medium">
                            {(item as any).crmLeads > 0 ? (item as any).crmLeads : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-center font-medium">
                            {(item as any).crmOrders > 0 ? (item as any).crmOrders : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-center text-muted-foreground">
                            {(item as any).cpo !== null ? `${(item as any).cpo.toLocaleString("ru-RU")} ₽` : "—"}
                          </td>
                          <td className={cn("px-3 py-2.5 tabular-nums text-center font-bold", roiColor(item.roi))}>
                            {roiBadge(item.roi)}
                          </td>
                          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <button
                              className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                              onClick={() => setSelectedItem(item)}
                              title="Подробнее"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div className="border-t px-5 py-4 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Рекомендации системы</p>
                  {recommendations.map((rec, i) => (
                    <p key={i} className="text-xs leading-snug">{rec}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════
          БЛОК 3: РАСХОД ПО ДНЯМ
      ══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="py-3 px-5 border-b">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              Расход по дням
            </CardTitle>
            <Button
              size="sm" variant="outline" className="h-7 text-xs gap-1.5"
              onClick={() => exportCsv(
                ["Дата", "Расход ₽"],
                chartData.map(d => [d.date, d.amount]),
                "avito-spending.csv"
              )}
              disabled={chartData.length === 0}
            >
              <Download className="w-3.5 h-3.5" /> Выгрузить в Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="py-4 px-4">
          {analyticsLoading ? (
            <div className="h-48 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !spending?.available || chartData.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <AlertCircle className="w-6 h-6 opacity-40" />
              <p className="text-sm">
                {!spending?.available
                  ? "Данные о расходах недоступны — нужен доступ к финансовым операциям Авито"
                  : "Нет данных за выбранный период"}
              </p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={fmtDate}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `${v}₽`}
                    width={48}
                  />
                  <Tooltip
                    formatter={(v: any) => [`${Number(v).toLocaleString("ru-RU")} ₽`, "Расход"]}
                    labelFormatter={fmtDate}
                    contentStyle={{
                      fontSize: 12, borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                    }}
                  />
                  {avgDailySpend > 0 && (
                    <ReferenceLine
                      y={avgDailySpend}
                      stroke="hsl(var(--primary))"
                      strokeDasharray="4 4"
                      label={{ value: `Среднее ${avgDailySpend}₽`, position: "insideTopRight", fontSize: 10, fill: "hsl(var(--primary))" }}
                    />
                  )}
                  <Bar dataKey="amount" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div className="bg-muted/30 rounded-xl py-2.5 px-3">
                  <p className="text-xs text-muted-foreground">Средний расход / день</p>
                  <p className="text-sm font-bold mt-0.5">{fmt(avgDailySpend)}</p>
                </div>
                <div className="bg-muted/30 rounded-xl py-2.5 px-3">
                  <p className="text-xs text-muted-foreground">Прогноз на месяц</p>
                  <p className="text-sm font-bold mt-0.5">{fmt(forecastMonth)}</p>
                </div>
                <div className={cn("rounded-xl py-2.5 px-3", daysLeft !== null && daysLeft < 3 ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/30")}>
                  <p className="text-xs text-muted-foreground">Хватит баланса</p>
                  {daysLeft !== null ? (
                    <p className={cn("text-sm font-bold mt-0.5", daysLeft < 3 ? "text-red-600" : "")}>
                      {daysLeft < 3
                        ? `🔴 ${daysLeft} дн. — скоро закончится!`
                        : `${daysLeft} дней`}
                    </p>
                  ) : (
                    <p className="text-sm font-bold mt-0.5 text-muted-foreground">—</p>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════
          БЛОК 4: СРАВНЕНИЕ ПО ГОРОДАМ
      ══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="py-3 px-5 border-b">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Сравнение по городам
            </CardTitle>
            <Button
              size="sm" variant="outline" className="h-7 text-xs gap-1.5"
              onClick={() => exportCsv(
                ["Город", "Заявок", "Заказов", "Расход ₽", "Доход ₽", "Стоимость заказа ₽", "ROI"],
                sortedCities.map(r => [
                  r.city, r.leads, r.orders,
                  r.citySpend ?? "—", r.revenue,
                  r.cpo ?? "—", r.roi !== null ? r.roi.toFixed(1) : "—",
                ]),
                "avito-cities.csv"
              )}
              disabled={cityRows.length === 0}
            >
              <Download className="w-3.5 h-3.5" /> Выгрузить в Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {analyticsLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : cityRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Нет данных по городам</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <Th label="Город" field="city" sortKey="city" activeKey={String(citySortKey)} dir={citySortDir} onSort={toggleCitySort} />
                      <Th label="Заявок" field="leads" sortKey="leads" activeKey={String(citySortKey)} dir={citySortDir} onSort={toggleCitySort} />
                      <Th label="Заказов" field="orders" sortKey="orders" activeKey={String(citySortKey)} dir={citySortDir} onSort={toggleCitySort} />
                      <Th label="Расход ₽" field="citySpend" sortKey="citySpend" activeKey={String(citySortKey)} dir={citySortDir} onSort={toggleCitySort} />
                      <Th label="Доход ₽" field="revenue" sortKey="revenue" activeKey={String(citySortKey)} dir={citySortDir} onSort={toggleCitySort} />
                      <Th label="Стоимость заказа" field="cpo" sortKey="cpo" activeKey={String(citySortKey)} dir={citySortDir} onSort={toggleCitySort} />
                      <Th label="ROI" field="roi" sortKey="roi" activeKey={String(citySortKey)} dir={citySortDir} onSort={toggleCitySort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCities.map(row => (
                      <tr key={row.city} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5 font-medium">{row.city}</td>
                        <td className="px-3 py-2.5 tabular-nums text-center">{row.leads}</td>
                        <td className="px-3 py-2.5 tabular-nums text-center">{row.orders}</td>
                        <td className="px-3 py-2.5 tabular-nums text-center text-muted-foreground">
                          {row.citySpend !== null ? `${row.citySpend.toLocaleString("ru-RU")} ₽` : "—"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-center text-green-700 dark:text-green-400 font-medium">
                          {row.revenue > 0 ? `${row.revenue.toLocaleString("ru-RU")} ₽` : "—"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-center">
                          {row.cpo !== null ? `${row.cpo.toLocaleString("ru-RU")} ₽` : "—"}
                        </td>
                        <td className={cn("px-3 py-2.5 tabular-nums text-center font-bold", roiColor(row.roi))}>
                          {roiBadge(row.roi)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sortedCities.length > 0 && (() => {
                const withRoi = sortedCities.filter(r => r.roi !== null);
                if (withRoi.length === 0) return null;
                const best = [...withRoi].sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))[0];
                const worst = [...withRoi].sort((a, b) => (a.roi ?? 0) - (b.roi ?? 0))[0];
                return (
                  <div className="border-t px-5 py-3 flex flex-wrap gap-4 text-xs">
                    <span>🏆 Лучший город: <strong>{best.city}</strong> (ROI {roiBadge(best.roi)})</span>
                    <span>⚠️ Худший город: <strong>{worst.city}</strong> (ROI {roiBadge(worst.roi)})</span>
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════
          БЛОК 5: СРАВНЕНИЕ ПО КАТЕГОРИЯМ
      ══════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="py-3 px-5 border-b">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-purple-500" />
              Сравнение по категориям
            </CardTitle>
            <Button
              size="sm" variant="outline" className="h-7 text-xs gap-1.5"
              onClick={() => exportCsv(
                ["Категория", "Заявок", "Заказов", "Расход ₽", "Доход ₽", "Средний чек ₽", "Стоимость заказа ₽", "ROI"],
                sortedCategories.map(r => [
                  r.category, r.leads, r.orders,
                  r.catSpend ?? "—", r.revenue, r.avgCheck,
                  r.cpo ?? "—", r.roi !== null ? r.roi.toFixed(1) : "—",
                ]),
                "avito-categories.csv"
              )}
              disabled={categoryRows.length === 0}
            >
              <Download className="w-3.5 h-3.5" /> Выгрузить в Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {analyticsLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : categoryRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Нет данных по категориям</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <Th label="Категория" field="category" sortKey="category" activeKey={String(catSortKey)} dir={catSortDir} onSort={toggleCatSort} />
                      <Th label="Заявок" field="leads" sortKey="leads" activeKey={String(catSortKey)} dir={catSortDir} onSort={toggleCatSort} />
                      <Th label="Заказов" field="orders" sortKey="orders" activeKey={String(catSortKey)} dir={catSortDir} onSort={toggleCatSort} />
                      <Th label="Расход ₽" field="catSpend" sortKey="catSpend" activeKey={String(catSortKey)} dir={catSortDir} onSort={toggleCatSort} />
                      <Th label="Доход ₽" field="revenue" sortKey="revenue" activeKey={String(catSortKey)} dir={catSortDir} onSort={toggleCatSort} />
                      <Th label="Средний чек" field="avgCheck" sortKey="avgCheck" activeKey={String(catSortKey)} dir={catSortDir} onSort={toggleCatSort} />
                      <Th label="Стоимость заказа" field="cpo" sortKey="cpo" activeKey={String(catSortKey)} dir={catSortDir} onSort={toggleCatSort} />
                      <Th label="ROI" field="roi" sortKey="roi" activeKey={String(catSortKey)} dir={catSortDir} onSort={toggleCatSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCategories.map(row => (
                      <tr key={row.category} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5 font-medium">{row.category}</td>
                        <td className="px-3 py-2.5 tabular-nums text-center">{row.leads}</td>
                        <td className="px-3 py-2.5 tabular-nums text-center">{row.orders}</td>
                        <td className="px-3 py-2.5 tabular-nums text-center text-muted-foreground">
                          {row.catSpend !== null ? `${row.catSpend.toLocaleString("ru-RU")} ₽` : "—"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-center text-green-700 dark:text-green-400 font-medium">
                          {row.revenue > 0 ? `${row.revenue.toLocaleString("ru-RU")} ₽` : "—"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-center">
                          {row.avgCheck > 0 ? `${row.avgCheck.toLocaleString("ru-RU")} ₽` : "—"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-center">
                          {row.cpo !== null ? `${row.cpo.toLocaleString("ru-RU")} ₽` : "—"}
                        </td>
                        <td className={cn("px-3 py-2.5 tabular-nums text-center font-bold", roiColor(row.roi))}>
                          {roiBadge(row.roi)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sortedCategories.length > 0 && (() => {
                const withRoi = sortedCategories.filter(r => r.roi !== null);
                if (withRoi.length === 0) return null;
                const best = [...withRoi].sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))[0];
                const worst = [...withRoi].sort((a, b) => (a.roi ?? 0) - (b.roi ?? 0))[0];
                return (
                  <div className="border-t px-5 py-3 flex flex-wrap gap-4 text-xs">
                    <span>🏆 Лучшая категория: <strong>{best.category}</strong> (ROI {roiBadge(best.roi)})</span>
                    <span>⚠️ Худшая категория: <strong>{worst.category}</strong> (ROI {roiBadge(worst.roi)})</span>
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

    </div>

    {/* Item detail modal */}
    {selectedItem && (
      <AvitoItemModal
        item={selectedItem}
        crmData={crmItemMap[String(selectedItem.id)]}
        itemSpend={itemRows.find(r => r.id === selectedItem.id)?.itemSpend}
        onClose={() => setSelectedItem(null)}
      />
    )}
    </>
  );
}
