import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import {
  Loader2, Search, Filter, MapPin, ChevronLeft, ChevronRight,
} from "lucide-react";

interface Order {
  id: number;
  status: string;
  city: string;
  district: string;
  serviceType: string;
  masterName: string | null;
  createdAt: string;
  clientName?: string;
  clientPhone?: string;
  orderAmount?: number | null;
  commission?: number | null;
  clientRating?: number;
  updatedAt?: string;
}

function fmtMoney(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

interface ArchiveListProps {
  orders: Order[];
  total: number;
  loading: boolean;
  availableCities: string[];
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  cityFilter: string;
  onCityChange: (v: string) => void;
  dateFilter: string;
  onDateChange: (v: string) => void;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onOpenOrder: (id: number) => void;
}

export default function ArchiveList({
  orders,
  total,
  loading,
  availableCities,
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  cityFilter,
  onCityChange,
  dateFilter,
  onDateChange,
  page,
  limit,
  onPageChange,
  onOpenOrder,
}: ArchiveListProps) {
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex-wrap">
        <div className="flex-1 min-w-[180px] relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Поиск по ID, городу, услуге..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm"
          />
        </div>
        <div className="w-full sm:w-44 relative">
          <Filter className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
          <select
            value={statusFilter}
            onChange={e => onStatusChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none appearance-none text-sm"
          >
            <option value="all">Все статусы</option>
            <option value="completed">Завершённые</option>
            <option value="cancelled">Отменённые</option>
          </select>
        </div>
        {availableCities.length > 1 && (
          <div className="w-full sm:w-40 relative">
            <MapPin className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
            <select
              value={cityFilter}
              onChange={e => onCityChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none appearance-none text-sm"
            >
              <option value="all">Все города</option>
              {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {(["all","today","yesterday","week","month"] as const).map(period => {
            const labels = { all: "Все", today: "Сегодня", yesterday: "Вчера", week: "7 дней", month: "Месяц" };
            return (
              <button
                key={period}
                onClick={() => onDateChange(period)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                  dateFilter === period ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/60 text-muted-foreground hover:bg-slate-100"
                }`}
              >
                {labels[period]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50 text-xs">
              <tr>
                <th className="px-3 py-2.5 pl-4">ID</th>
                <th className="px-3 py-2.5">Завершён</th>
                <th className="px-3 py-2.5">Город · Услуга</th>
                <th className="px-3 py-2.5">Клиент</th>
                <th className="px-3 py-2.5">Мастер</th>
                <th className="px-3 py-2.5">Сумма</th>
                <th className="px-3 py-2.5">Ком.</th>
                <th className="px-3 py-2.5">Статус</th>
                <th className="px-3 py-2.5 pr-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Архив пуст</td></tr>
              ) : orders.map(order => {
                const amount = order.orderAmount ? Number(order.orderAmount) : null;
                const commission = order.commission ? Number(order.commission) : null;
                const rating = order.clientRating;
                return (
                  <tr key={order.id} onClick={() => onOpenOrder(order.id)} className="cursor-pointer hover:bg-slate-50 transition-colors opacity-90">
                    <td className="px-3 py-2.5 pl-4 whitespace-nowrap">
                      <span className="font-semibold text-foreground">#{order.id}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p className="text-xs text-foreground">{formatDate(order.updatedAt ?? order.createdAt)}</p>
                      {order.updatedAt && order.updatedAt !== order.createdAt && (
                        <p className="text-[10px] text-muted-foreground/60">создан {formatDate(order.createdAt)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <p className="font-medium text-foreground truncate">{order.serviceType}</p>
                      <p className="text-xs text-muted-foreground">{order.city}{order.district ? `, ${order.district}` : ""}</p>
                    </td>
                    <td className="px-3 py-2.5 max-w-[140px]">
                      <p className="text-sm text-foreground truncate">{order.clientName ?? "—"}</p>
                      {order.clientPhone && <p className="text-xs text-muted-foreground">{order.clientPhone}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm text-foreground">{order.masterName ?? "—"}</p>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {amount ? <span className="font-semibold text-emerald-600 text-xs">{fmtMoney(amount)}</span> : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {commission ? <span className="text-xs text-muted-foreground">{fmtMoney(commission)}</span> : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={order.status} type="order" />
                      {rating && <div className="text-[10px] text-amber-500 mt-0.5">{"★".repeat(rating)}{"☆".repeat(5-rating)}</div>}
                    </td>
                    <td className="px-3 py-2.5 pr-4">
                      <button onClick={e => { e.stopPropagation(); onOpenOrder(order.id); }} className="text-xs text-primary hover:underline">Открыть</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between bg-card p-3 rounded-2xl border border-border/50 shadow-sm mt-2">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />Назад
          </button>
          <span className="text-sm text-muted-foreground">
            Страница <span className="font-semibold text-foreground">{page}</span> из {totalPages} <span className="text-muted-foreground/60">({total} всего)</span>
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Вперёд<ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
