import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, Star, MapPin, Wallet, Loader2, UserPlus } from "lucide-react";
import { PaymentStateBadge, type PaymentState } from "./PaymentStateBadge";

interface OrderRow {
  orderId: number;
  city?: string;
  serviceType?: string;
  master: string | null;
  masterId: number | null;
  paymentState?: PaymentState;
  agreementAmountSource?: string | null;
}

interface Master {
  id: number;
  alias: string;
  city: string | null;
  status: string;
  rating: number;
  debt: number;
  acceptedOrders: number;
  totalOrders: number;
  paidOrdersCount?: number;
  specialization?: string;
  specializations?: string[];
}

interface Props {
  order: OrderRow;
  onClose: () => void;
  onAssign: (masterId: number) => void;
  isPending: boolean;
}

const fmtMoney = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";

/**
 * Right-side drawer for picking a master to assign or replace on an order.
 *
 * Filters: city (defaults to the order's city), search by name, and a
 * smart sort that prioritizes masters with no active debt and matching
 * specialization.
 */
export default function MasterPickerPanel({ order, onClose, onAssign, isPending }: Props) {
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState<string>(order.city ?? "all");
  const [showAllCities, setShowAllCities] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  const { data: masters, isLoading } = useQuery<Master[]>({
    queryKey: ["/api/masters", "picker"],
    queryFn: async () => {
      const r = await fetch("/api/masters", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const cityList = useMemo(() => {
    const s = new Set<string>();
    for (const m of masters ?? []) if (m.city) s.add(m.city);
    return Array.from(s).sort();
  }, [masters]);

  const filtered = useMemo(() => {
    if (!masters) return [];
    let list = masters.filter(m => m.id !== order.masterId);
    if (onlyAvailable) {
      list = list.filter(m => m.status === "active");
    }
    if (cityFilter !== "all") {
      list = list.filter(m => m.city === cityFilter);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(m =>
        m.alias.toLowerCase().includes(q) ||
        (m.city ?? "").toLowerCase().includes(q) ||
        (m.specialization ?? "").toLowerCase().includes(q)
      );
    }
    // Sort: matching specialization (if known) → no debt → higher rating → more orders
    const orderService = order.serviceType?.toLowerCase() ?? "";
    return [...list].sort((a, b) => {
      const aSpec = matchesSpec(a, orderService) ? 1 : 0;
      const bSpec = matchesSpec(b, orderService) ? 1 : 0;
      if (aSpec !== bSpec) return bSpec - aSpec;
      const aDebt = a.debt > 0 ? 1 : 0;
      const bDebt = b.debt > 0 ? 1 : 0;
      if (aDebt !== bDebt) return aDebt - bDebt;
      const ratingDelta = (b.rating ?? 0) - (a.rating ?? 0);
      if (ratingDelta !== 0) return ratingDelta;
      return (b.paidOrdersCount ?? 0) - (a.paidOrdersCount ?? 0);
    });
  }, [masters, query, cityFilter, onlyAvailable, order.masterId, order.serviceType]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white h-full w-full max-w-lg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {order.masterId ? "Сменить мастера" : "Назначить мастера"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Заказ #{order.orderId} · {order.serviceType ?? "—"} · {order.city ?? "—"}
              </p>
              {order.paymentState && (
                <div className="mt-1.5">
                  <PaymentStateBadge state={order.paymentState} size="sm" />
                </div>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          {order.master && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
              Текущий мастер: <strong>{order.master}</strong>. После назначения нового он будет автоматически снят.
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск по имени, городу, специальности…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!showAllCities && order.city ? (
              <button
                onClick={() => { setShowAllCities(true); setCityFilter("all"); }}
                className="text-xs text-blue-600 hover:underline"
              >
                Показать всех мастеров (не только из {order.city})
              </button>
            ) : (
              <div className="relative">
                <select
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                  className="appearance-none pl-3 pr-7 py-1 text-xs font-medium border border-border/60 rounded-lg cursor-pointer focus:outline-none"
                >
                  <option value="all">Все города</option>
                  {cityList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={onlyAvailable} onChange={e => setOnlyAvailable(e.target.checked)} className="w-3.5 h-3.5 rounded border-border accent-primary" />
              Только активные
            </label>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              По выбранным фильтрам мастеров нет
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {filtered.map(m => (
                <li key={m.id} className="p-3 hover:bg-slate-50 transition-colors flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{m.alias}</span>
                      {m.rating > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                          <Star className="w-3 h-3 fill-amber-400 stroke-amber-500" />
                          {m.rating.toFixed(1)}
                        </span>
                      )}
                      {m.status !== "active" && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                          {m.status === "suspended" ? "отстранён" : m.status === "pending_contract" ? "ждёт договор" : m.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
                      {m.city && <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{m.city}</span>}
                      <span>· {m.paidOrdersCount ?? 0} оплачено</span>
                      {m.specialization && <span className="truncate max-w-[180px]">· {m.specialization}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] mt-1">
                      {m.debt > 0 ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                          <Wallet className="w-2.5 h-2.5" /> долг {fmtMoney(m.debt)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Wallet className="w-2.5 h-2.5" /> без долга
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Назначить мастера ${m.alias} на заказ #${order.orderId}?`)) {
                        onAssign(m.id);
                      }
                    }}
                    disabled={isPending}
                    className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                    Назначить
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function matchesSpec(m: Master, orderService: string): boolean {
  if (!orderService) return false;
  const tokens = orderService.split(/[\s,;]+/).filter(t => t.length >= 4);
  const all = [m.specialization ?? "", ...(m.specializations ?? [])].join(" ").toLowerCase();
  return tokens.some(t => all.includes(t));
}
