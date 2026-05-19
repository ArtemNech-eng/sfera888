import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { TokenMasterDrawer } from "@/components/token-master-drawer";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Zap, Users, Wifi, Coins, TrendingUp, Clock, AlertTriangle,
  Search, X, ChevronLeft, ChevronRight, Star, ArrowUpDown,
  CheckCircle2, XCircle, BarChart3, ArrowUp, ArrowDown,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenMasterStats {
  activeToday: number;
  onlineNow: number;
  mastersWithBalance: number;
  totalTokensSold: number;
  avgConversion: number;
  avgResponseTime: number;
  churnRisk: number;
}

interface TokenMaster {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  specializations: string[];
  phone: string | null;
  status: string;
  rating: number;
  totalOrders: number;
  acceptedOrders: number;
  totalLeadsReceived: number;
  avgResponseTime: number | null;
  lastSeenAt: string | null;
  avatarUrl: string | null;
  createdAt: string;
  tokensBalance: number;
  totalTokensPurchased: number;
  totalTokensSpent: number;
  totalRubSpent: number;
  totalRevenue: number;
  conversion: number | null;
  roi: number | null;
}

interface TokenMastersResponse {
  data: TokenMaster[];
  total: number;
  page: number;
  limit: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString("ru-RU"); }
function fmtRelative(s: string) {
  return formatDistanceToNow(new Date(s), { addSuffix: true, locale: ru });
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:           { label: "Активен",          cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  suspended:        { label: "Приостановлен",    cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  inactive:         { label: "Неактивен",         cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  pending_contract: { label: "Ожидает договора", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

function MasterAvatar({ url, alias, size = 36 }: { url: string | null; alias: string; size?: number }) {
  if (url) {
    return <img src={url} alt={alias} style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />;
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0"
    >
      <span className="text-white font-bold" style={{ fontSize: size * 0.4 }}>{alias[0]?.toUpperCase()}</span>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color, pulse }: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  color: "green" | "blue" | "violet" | "orange" | "cyan" | "red" | "amber";
  pulse?: boolean;
}) {
  const configs = {
    green:  { bg: "from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20", border: "border-green-100 dark:border-green-800/30", icon: "text-green-600 dark:text-green-400", val: "text-green-700 dark:text-green-300" },
    blue:   { bg: "from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20",     border: "border-blue-100 dark:border-blue-800/30",   icon: "text-blue-600 dark:text-blue-400",   val: "text-blue-700 dark:text-blue-300" },
    violet: { bg: "from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20", border: "border-violet-100 dark:border-violet-800/30", icon: "text-violet-600 dark:text-violet-400", val: "text-violet-700 dark:text-violet-300" },
    orange: { bg: "from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20",   border: "border-orange-100 dark:border-orange-800/30", icon: "text-orange-500 dark:text-orange-400", val: "text-orange-700 dark:text-orange-300" },
    cyan:   { bg: "from-cyan-50 to-sky-50 dark:from-cyan-900/20 dark:to-sky-900/20",           border: "border-cyan-100 dark:border-cyan-800/30",     icon: "text-cyan-600 dark:text-cyan-400",   val: "text-cyan-700 dark:text-cyan-300" },
    red:    { bg: "from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20",           border: "border-red-100 dark:border-red-800/30",       icon: "text-red-500 dark:text-red-400",     val: "text-red-700 dark:text-red-300" },
    amber:  { bg: "from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20",   border: "border-amber-100 dark:border-amber-800/30",   icon: "text-amber-500 dark:text-amber-400", val: "text-amber-700 dark:text-amber-300" },
  };
  const c = configs[color];
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br p-4 flex flex-col gap-2", c.bg, c.border)}>
      <div className="flex items-center gap-2">
        <div className={cn("w-8 h-8 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center")}>
          <Icon className={cn("w-4 h-4", c.icon, pulse && "animate-pulse")} />
        </div>
        <span className="text-xs text-muted-foreground font-medium leading-tight">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold leading-none", c.val)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Sort config ──────────────────────────────────────────────────────────────

type SortKey = "activity" | "balance" | "orders" | "conversion" | "rating" | "revenue" | "roi" | "response";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "activity",   label: "По активности" },
  { key: "balance",    label: "По балансу токенов" },
  { key: "orders",     label: "По заказам" },
  { key: "conversion", label: "По конверсии" },
  { key: "rating",     label: "По рейтингу" },
  { key: "revenue",    label: "По выручке" },
  { key: "roi",        label: "По ROI" },
  { key: "response",   label: "По скорости ответа" },
];

// ─── Table columns ────────────────────────────────────────────────────────────

function SortIcon({ active, sort }: { active: boolean; sort: SortKey }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />;
  return <ArrowUp className="w-3 h-3 text-primary" />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TokenMastersPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <TokenMastersContent />
      </Layout>
    </ProtectedRoute>
  );
}

function TokenMastersContent() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<SortKey>("activity");
  const [selectedMasterId, setSelectedMasterId] = useState<number | null>(null);
  const LIMIT = 20;

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", String(LIMIT));
    if (search) p.set("search", search);
    if (city) p.set("city", city);
    if (specialization) p.set("specialization", specialization);
    if (status) p.set("status", status);
    if (sort) p.set("sort", sort);
    return p.toString();
  }, [page, search, city, specialization, status, sort]);

  const { data: stats, isLoading: statsLoading } = useQuery<TokenMasterStats>({
    queryKey: ["/api/token-masters/stats"],
    queryFn: () => fetch("/api/token-masters/stats", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: mastersData, isLoading: mastersLoading } = useQuery<TokenMastersResponse>({
    queryKey: ["/api/token-masters", params],
    queryFn: () => fetch(`/api/token-masters?${params}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
  });

  const totalPages = mastersData ? Math.ceil(mastersData.total / LIMIT) : 1;

  const handleSort = (key: SortKey) => {
    setSort(key);
    setPage(1);
  };

  const handleFilter = () => {
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Token Masters</h1>
          <p className="text-sm text-muted-foreground">Marketplace-дашборд мастеров на токен-модели</p>
        </div>
      </div>

      {/* KPI Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard
          icon={Users}
          label="Активны сегодня"
          value={statsLoading ? "…" : fmt(stats?.activeToday ?? 0)}
          color="green"
        />
        <KpiCard
          icon={Wifi}
          label="Онлайн сейчас"
          value={statsLoading ? "…" : fmt(stats?.onlineNow ?? 0)}
          sub="за 5 минут"
          color="cyan"
          pulse={!statsLoading && (stats?.onlineNow ?? 0) > 0}
        />
        <KpiCard
          icon={Zap}
          label="С балансом"
          value={statsLoading ? "…" : fmt(stats?.mastersWithBalance ?? 0)}
          sub="есть токены"
          color="violet"
        />
        <KpiCard
          icon={Coins}
          label="Продано токенов"
          value={statsLoading ? "…" : fmt(stats?.totalTokensSold ?? 0)}
          sub="всего"
          color="amber"
        />
        <KpiCard
          icon={TrendingUp}
          label="Ср. конверсия"
          value={statsLoading ? "…" : `${stats?.avgConversion ?? 0}%`}
          sub="принятых заявок"
          color="blue"
        />
        <KpiCard
          icon={Clock}
          label="Ср. скорость"
          value={statsLoading ? "…" : `${stats?.avgResponseTime ?? 0} мин`}
          sub="время ответа"
          color="orange"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Риск оттока"
          value={statsLoading ? "…" : fmt(stats?.churnRisk ?? 0)}
          sub="нет токенов 7д+"
          color="red"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="h-9 pl-9 pr-3 text-sm rounded-xl border bg-background w-56 focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Имя или телефон…"
            value={search}
            onChange={e => { setSearch(e.target.value); handleFilter(); }}
          />
          {search && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => { setSearch(""); handleFilter(); }}>
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* City */}
        <input
          className="h-9 px-3 text-sm rounded-xl border bg-background w-36 focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Город…"
          value={city}
          onChange={e => { setCity(e.target.value); handleFilter(); }}
        />

        {/* Specialization */}
        <input
          className="h-9 px-3 text-sm rounded-xl border bg-background w-40 focus:outline-none focus:ring-2 focus:ring-primary/20"
          placeholder="Специализация…"
          value={specialization}
          onChange={e => { setSpecialization(e.target.value); handleFilter(); }}
        />

        {/* Status */}
        <select
          className="h-9 px-3 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          value={status}
          onChange={e => { setStatus(e.target.value); handleFilter(); }}
        >
          <option value="">Все статусы</option>
          <option value="active">Активен</option>
          <option value="suspended">Приостановлен</option>
          <option value="inactive">Неактивен</option>
          <option value="pending_contract">Ожидает договора</option>
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1.5 ml-auto">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          <select
            className="h-9 px-3 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={sort}
            onChange={e => handleSort(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Count */}
        {mastersData && (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {fmt(mastersData.total)} мастеров
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">Мастер</th>
                <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Город</th>
                <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">Специализация</th>
                <th
                  className="text-right px-3 py-3 font-medium cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort("balance")}
                >
                  <span className="flex items-center justify-end gap-1">
                    <SortIcon active={sort === "balance"} sort="balance" />
                    Баланс
                  </span>
                </th>
                <th
                  className="text-right px-3 py-3 font-medium cursor-pointer hover:text-foreground select-none hidden sm:table-cell"
                  onClick={() => handleSort("orders")}
                >
                  <span className="flex items-center justify-end gap-1">
                    <SortIcon active={sort === "orders"} sort="orders" />
                    Заказы
                  </span>
                </th>
                <th
                  className="text-right px-3 py-3 font-medium cursor-pointer hover:text-foreground select-none hidden md:table-cell"
                  onClick={() => handleSort("conversion")}
                >
                  <span className="flex items-center justify-end gap-1">
                    <SortIcon active={sort === "conversion"} sort="conversion" />
                    Конверсия
                  </span>
                </th>
                <th
                  className="text-right px-3 py-3 font-medium cursor-pointer hover:text-foreground select-none hidden lg:table-cell"
                  onClick={() => handleSort("revenue")}
                >
                  <span className="flex items-center justify-end gap-1">
                    <SortIcon active={sort === "revenue"} sort="revenue" />
                    Заявил ₽
                  </span>
                </th>
                <th
                  className="text-right px-3 py-3 font-medium cursor-pointer hover:text-foreground select-none hidden lg:table-cell"
                  onClick={() => handleSort("roi")}
                >
                  <span className="flex items-center justify-end gap-1">
                    <SortIcon active={sort === "roi"} sort="roi" />
                    ROI
                  </span>
                </th>
                <th
                  className="text-right px-3 py-3 font-medium cursor-pointer hover:text-foreground select-none hidden sm:table-cell"
                  onClick={() => handleSort("rating")}
                >
                  <span className="flex items-center justify-end gap-1">
                    <SortIcon active={sort === "rating"} sort="rating" />
                    Рейтинг
                  </span>
                </th>
                <th
                  className="text-right px-3 py-3 font-medium cursor-pointer hover:text-foreground select-none hidden xl:table-cell"
                  onClick={() => handleSort("response")}
                >
                  <span className="flex items-center justify-end gap-1">
                    <SortIcon active={sort === "response"} sort="response" />
                    Ответ
                  </span>
                </th>
                <th className="text-center px-3 py-3 font-medium hidden sm:table-cell">Статус</th>
                <th
                  className="text-right px-3 py-3 font-medium cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort("activity")}
                >
                  <span className="flex items-center justify-end gap-1">
                    <SortIcon active={sort === "activity"} sort="activity" />
                    Активность
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mastersLoading && (
                <tr>
                  <td colSpan={12} className="text-center py-16 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                      Загрузка…
                    </div>
                  </td>
                </tr>
              )}
              {!mastersLoading && (!mastersData?.data.length) && (
                <tr>
                  <td colSpan={12} className="text-center py-16 text-muted-foreground">
                    <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p>Мастера не найдены</p>
                  </td>
                </tr>
              )}
              {mastersData?.data.map((m, idx) => {
                const statusInfo = STATUS_LABELS[m.status] ?? { label: m.status, cls: "bg-gray-100 text-gray-500" };
                const now = new Date();
                const lastSeen = m.lastSeenAt ? new Date(m.lastSeenAt) : null;
                const isOnline = lastSeen && (now.getTime() - lastSeen.getTime()) < 5 * 60 * 1000;

                return (
                  <tr
                    key={m.id}
                    className={cn(
                      "border-b last:border-0 cursor-pointer transition-colors",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                      "hover:bg-primary/5",
                    )}
                    onClick={() => setSelectedMasterId(m.id)}
                  >
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          <MasterAvatar url={m.avatarUrl} alias={m.alias} size={34} />
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
                          )}
                        </div>
                        <span className="font-medium truncate max-w-[120px]">{m.alias}</span>
                      </div>
                    </td>

                    {/* City */}
                    <td className="px-3 py-3 text-muted-foreground hidden md:table-cell">
                      <span className="truncate max-w-[80px] block">{m.city}</span>
                    </td>

                    {/* Specialization */}
                    <td className="px-3 py-3 text-muted-foreground hidden lg:table-cell">
                      <span className="truncate max-w-[100px] block text-xs">{m.specialization}</span>
                    </td>

                    {/* Token balance */}
                    <td className="px-3 py-3 text-right">
                      <span className={cn(
                        "inline-flex items-center gap-1 font-semibold tabular-nums text-sm",
                        m.tokensBalance > 0 ? "text-violet-600 dark:text-violet-400" : "text-red-500 dark:text-red-400"
                      )}>
                        <Zap className="w-3 h-3" />
                        {fmt(m.tokensBalance)}
                      </span>
                    </td>

                    {/* Orders */}
                    <td className="px-3 py-3 text-right text-muted-foreground tabular-nums hidden sm:table-cell">
                      {fmt(m.acceptedOrders)}
                    </td>

                    {/* Conversion */}
                    <td className="px-3 py-3 text-right hidden md:table-cell">
                      {m.conversion != null ? (
                        <span className={cn(
                          "font-medium tabular-nums text-sm",
                          m.conversion >= 60 ? "text-green-600 dark:text-green-400" :
                          m.conversion >= 30 ? "text-amber-600 dark:text-amber-400" :
                          "text-red-500 dark:text-red-400"
                        )}>
                          {m.conversion}%
                        </span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>

                    {/* Revenue */}
                    <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell">
                      {m.totalRevenue > 0
                        ? <span className="text-sm font-medium">{fmt(m.totalRevenue)} ₽</span>
                        : <span className="text-muted-foreground/40">—</span>
                      }
                    </td>

                    {/* ROI */}
                    <td className="px-3 py-3 text-right hidden lg:table-cell">
                      {m.roi != null ? (
                        <span className={cn(
                          "font-semibold text-sm tabular-nums",
                          m.roi >= 5 ? "text-green-600 dark:text-green-400" :
                          m.roi >= 2 ? "text-blue-600 dark:text-blue-400" :
                          "text-muted-foreground"
                        )}>
                          {m.roi}x
                        </span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </td>

                    {/* Rating */}
                    <td className="px-3 py-3 text-right hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span className="tabular-nums font-medium">{m.rating.toFixed(1)}</span>
                      </span>
                    </td>

                    {/* Response time */}
                    <td className="px-3 py-3 text-right text-muted-foreground text-xs tabular-nums hidden xl:table-cell">
                      {m.avgResponseTime != null ? `${Math.round(m.avgResponseTime)} мин` : <span className="text-muted-foreground/40">—</span>}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap", statusInfo.cls)}>
                        {statusInfo.label}
                      </span>
                    </td>

                    {/* Last activity */}
                    <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {m.lastSeenAt
                        ? fmtRelative(m.lastSeenAt)
                        : <span className="text-muted-foreground/40">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="h-9 w-9 rounded-xl border flex items-center justify-center disabled:opacity-40 hover:bg-muted transition-colors"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted-foreground px-2">
            Стр. {page} / {totalPages}
          </span>
          <button
            className="h-9 w-9 rounded-xl border flex items-center justify-center disabled:opacity-40 hover:bg-muted transition-colors"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Master Drawer */}
      <TokenMasterDrawer
        masterId={selectedMasterId}
        onClose={() => setSelectedMasterId(null)}
      />
    </div>
  );
}
