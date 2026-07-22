import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  PhoneCall, ImagePlus, CheckCircle2, CreditCard, Skull, AlertTriangle,
  Bell, MapPin, ExternalLink, XCircle, RefreshCw, ArrowLeft, Loader2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { MasterDrawer, type DrawerMaster, type DrawerColumn } from "@/components/master-drawer";

// ─── Types (mirror server-side StuckOrderItem) ────────────────────────────────

type StuckCategory =
  | "needs_call_report"
  | "needs_result"
  | "needs_amount_confirmation"
  | "needs_commission_payment"
  | "zombie";

interface StuckItem {
  id: number;
  category: StuckCategory;
  masterId: number | null;
  masterAlias: string | null;
  clientName: string | null;
  clientPhone: string | null;
  city: string;
  serviceType: string;
  status: string;
  daysStuck: number;
  assignedAt: string | null;
  callReportedAt: string | null;
  scheduledAt: string | null;
  proposedAmount: number | null;
  orderAmount: number | null;
  commission: number | null;
  netPayable: number | null;
  bannerSnoozedUntil: string | null;
}

interface StuckResponse {
  counts: Record<StuckCategory, number>;
  items: Record<StuckCategory, StuckItem[]>;
}

// ─── Category meta (must match StuckOrdersBlock) ──────────────────────────────

const TABS: Array<{ key: StuckCategory; label: string; icon: typeof PhoneCall; color: string }> = [
  { key: "needs_call_report",          label: "Нет отчёта о созвоне", icon: PhoneCall,    color: "#D97706" },
  { key: "needs_result",               label: "Ждут результата",      icon: ImagePlus,    color: "#EA580C" },
  { key: "needs_amount_confirmation",  label: "Подтвердите сумму",    icon: CheckCircle2, color: "#7C3AED" },
  { key: "needs_commission_payment",   label: "Не оплачена комиссия", icon: CreditCard,   color: "#DC2626" },
  { key: "zombie",                     label: "Зомби (14+ дн.)",      icon: Skull,        color: "#4B5563" },
];

// ─── URL helpers ──────────────────────────────────────────────────────────────

function useQueryParam(name: string): [string | null, (v: string | null) => void] {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  const setter = (v: string | null) => {
    const next = new URLSearchParams(window.location.search);
    if (v == null) next.delete(name);
    else next.set(name, v);
    const qs = next.toString();
    setLocation(`/orders/stuck${qs ? `?${qs}` : ""}`);
  };
  return [value, setter];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrdersStuckPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <OrdersStuckContent />
      </Layout>
    </ProtectedRoute>
  );
}

function OrdersStuckContent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [categoryParam, setCategoryParam] = useQueryParam("category");
  const activeCategory: StuckCategory = (
    TABS.find(t => t.key === categoryParam)?.key ?? "needs_call_report"
  );

  const [filterMaster, setFilterMaster] = useState<string>("");
  const [filterCity, setFilterCity] = useState<string>("");
  const [drawerMaster, setDrawerMaster] = useState<DrawerMaster | null>(null);
  const [loadingMasterId, setLoadingMasterId] = useState<number | null>(null);
  const [voronkaColumns, setVoronkaColumns] = useState<DrawerColumn[]>([]);

  const { data, isLoading, refetch, isFetching } = useQuery<StuckResponse>({
    queryKey: ["/api/orders/stuck"],
    queryFn: async () => {
      const r = await fetch("/api/orders/stuck", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const items = data?.items[activeCategory] ?? [];
  const counts = data?.counts;

  // Filter options from current bucket
  const allCities = useMemo(
    () => [...new Set(items.map(i => i.city).filter(Boolean))].sort(),
    [items]
  );
  const allMasters = useMemo(
    () => [...new Set(items.map(i => i.masterAlias).filter((x): x is string => !!x))].sort(),
    [items]
  );

  const filtered = useMemo(() => items.filter(i => {
    if (filterMaster && i.masterAlias !== filterMaster) return false;
    if (filterCity && i.city !== filterCity) return false;
    return true;
  }), [items, filterMaster, filterCity]);

  // Open master drawer (mirrors checkins.tsx logic)
  async function openMasterCard(id: number) {
    if (loadingMasterId !== null) return;
    setLoadingMasterId(id);
    try {
      const r = await fetch(`/api/masters/${id}`, { credentials: "include" });
      if (!r.ok) {
        toast({ title: "Не удалось загрузить мастера", variant: "destructive" });
        return;
      }
      const m = await r.json();
      setDrawerMaster({
        ...m,
        avatarUrl: m.avatarUrl ?? m.customAvatarUrl ?? null,
        activeOrders: m.activeOrders ?? [],
        specializations: m.specializations ?? [],
        tags: m.tags ?? [],
      } as DrawerMaster);
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    } finally {
      setLoadingMasterId(null);
    }
  }

  useEffect(() => {
    if (drawerMaster && voronkaColumns.length === 0) {
      fetch("/api/voronka/columns", { credentials: "include" })
        .then(r => (r.ok ? r.json() : []))
        .then(cols => Array.isArray(cols) && setVoronkaColumns(cols))
        .catch(() => {});
    }
  }, [drawerMaster, voronkaColumns.length]);

  // Mutations
  const remindMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/orders/${orderId}/remind-master`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => toast({ title: "Push отправлен мастеру" }),
    onError: (e: any) => toast({ title: e?.message ?? "Ошибка отправки", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: number; reason: string }) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "cancelled", operatorNote: reason }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Заказ отменён" });
      refetch();
    },
    onError: (e: any) => toast({ title: e?.message ?? "Ошибка", variant: "destructive" }),
  });

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return format(parseISO(iso), "d MMM HH:mm", { locale: ru });
    } catch {
      return "—";
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/dashboard")}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="К дашборду"
          >
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Зависшие заказы</h1>
            <p className="text-sm text-gray-500 mt-0.5">Заказы, которым нужны действия — мастера или оператора</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap border-b border-gray-100 -mb-px">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const count = counts?.[tab.key] ?? 0;
          const active = activeCategory === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setCategoryParam(tab.key);
                setFilterMaster("");
                setFilterCity("");
              }}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? "border-current"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              style={active ? { color: tab.color } : undefined}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${
                active ? "bg-current/10" : "bg-gray-100 text-gray-500"
              }`} style={active ? { color: tab.color, backgroundColor: `${tab.color}15` } : undefined}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      {filtered.length > 0 || filterMaster || filterCity ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Фильтры:</span>
          {allMasters.length > 1 && (
            <select
              value={filterMaster}
              onChange={(e) => setFilterMaster(e.target.value)}
              className="h-8 px-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Все мастера ({allMasters.length})</option>
              {allMasters.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {allCities.length > 1 && (
            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="h-8 px-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Все города</option>
              {allCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {(filterMaster || filterCity) && (
            <button
              onClick={() => { setFilterMaster(""); setFilterCity(""); }}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              сбросить
            </button>
          )}
        </div>
      ) : null}

      {/* Empty / Loading / Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{(counts?.[activeCategory] ?? 0) === 0 ? "В этой категории всё чисто 🎉" : "По текущим фильтрам ничего не найдено"}</p>
        </div>
      ) : (
        <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">Мастер</th>
                <th className="text-left px-4 py-2.5">Клиент</th>
                <th className="text-left px-4 py-2.5">Город</th>
                <th className="text-left px-4 py-2.5">Услуга</th>
                <th className="text-left px-4 py-2.5">Висит</th>
                <th className="text-left px-4 py-2.5 hidden lg:table-cell">Доп.</th>
                <th className="text-right px-4 py-2.5">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const isMasterFacing = ["needs_call_report", "needs_result", "needs_commission_payment"].includes(item.category);
                return (
                  <tr key={item.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                    <td className="px-4 py-2.5 font-mono font-semibold text-blue-600">#{item.id}</td>
                    <td className="px-4 py-2.5">
                      {item.masterAlias ? (
                        <button
                          onClick={() => item.masterId && openMasterCard(item.masterId)}
                          className="flex items-center gap-1.5 text-blue-600 hover:underline font-medium"
                        >
                          {item.masterAlias}
                          {loadingMasterId === item.masterId && <Loader2 className="w-3 h-3 animate-spin" />}
                        </button>
                      ) : (
                        <span className="text-gray-400 italic">без мастера</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {item.clientName ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{item.city}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[160px] truncate" title={item.serviceType}>
                      {item.serviceType}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-sm font-semibold ${
                        item.daysStuck >= 14 ? "text-red-600" : item.daysStuck >= 7 ? "text-orange-600" : "text-gray-800"
                      }`}>{item.daysStuck} дн.</span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-gray-500 hidden lg:table-cell max-w-[220px]">
                      {item.category === "needs_call_report" && (
                        <span>Ожидает отчёта о созвоне</span>
                      )}
                      {item.category === "needs_result" && (
                        <span>{item.proposedAmount ? "Сумма есть, нет фото" : "Нет фото и суммы"}</span>
                      )}
                      {item.category === "needs_amount_confirmation" && (
                        <span>Мастер: <b>{item.proposedAmount ? item.proposedAmount.toLocaleString("ru-RU") : "—"} ₽</b> · подтвердите</span>
                      )}
                      {item.category === "needs_commission_payment" && item.netPayable != null && (
                        <span>К оплате: <b className="text-red-600">{item.netPayable.toLocaleString("ru-RU")} ₽</b></span>
                      )}
                      {item.category === "zombie" && (
                        <span>Нет активности {item.daysStuck} дн.</span>
                      )}
                      {item.scheduledAt && (
                        <span className="block">Замер {formatDateTime(item.scheduledAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        {isMasterFacing && item.masterId && (
                          <button
                            onClick={() => remindMutation.mutate(item.id)}
                            disabled={remindMutation.isPending}
                            title="Отправить push мастеру"
                            className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40"
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setLocation(`/leads?tab=work&highlight=${item.id}`)}
                          title="Открыть заказ"
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        {item.category === "zombie" && (
                          <button
                            onClick={() => {
                              const reason = window.prompt(`Причина отмены заказа #${item.id}:`);
                              if (!reason || !reason.trim()) return;
                              cancelMutation.mutate({ orderId: item.id, reason: reason.trim() });
                            }}
                            disabled={cancelMutation.isPending}
                            title="Отменить заказ"
                            className="p-1.5 rounded-md text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Master drawer */}
      {drawerMaster && (
        <MasterDrawer
          master={drawerMaster}
          columns={voronkaColumns}
          onClose={() => setDrawerMaster(null)}
          onMasterUpdate={(id, partial) => {
            setDrawerMaster(prev => (prev && prev.id === id ? { ...prev, ...partial } : prev));
            refetch();
          }}
        />
      )}
    </div>
  );
}
