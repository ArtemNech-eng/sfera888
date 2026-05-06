import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { History, CheckCircle2, XCircle, RotateCcw, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type HistoryRecord = {
  id: number;
  orderId: number;
  status: "completed" | "cancelled" | "returned_to_pool";
  assignedAt: string | null;
  removedAt: string;
  cancelReason: string | null;
  orderAmount: string | null;
  serviceType: string | null;
  city: string | null;
};

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  completed: { label: "Завершён", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  cancelled: { label: "Отменён", icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
  returned_to_pool: { label: "Возвращён в пул", icon: RotateCcw, color: "text-amber-600", bg: "bg-amber-50" },
};

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}

export function OrderHistorySection({ masterId }: { masterId: number }) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/masters/${masterId}/order-history`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setRecords(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [masterId]);

  const filtered = filter === "all" ? records : records.filter((r) => r.status === filter);
  const counts = {
    completed: records.filter((r) => r.status === "completed").length,
    cancelled: records.filter((r) => r.status === "cancelled").length,
    returned_to_pool: records.filter((r) => r.status === "returned_to_pool").length,
  };

  if (loading) {
    return (
      <div className="border-t border-gray-100 pt-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <History className="w-3 h-3" /> История заказов
        </p>
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="border-t border-gray-100 pt-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <History className="w-3 h-3" /> История заказов
        </p>
        <p className="text-[11px] text-gray-400">Нет записей</p>
      </div>
    );
  }

  const displayRecords = expanded ? filtered : filtered.slice(0, 5);

  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
        <History className="w-3 h-3" /> История заказов
      </p>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-2 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
            filter === "all" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Все ({records.length})
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors flex items-center gap-0.5 ${
            filter === "completed" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          <CheckCircle2 className="w-2.5 h-2.5" /> {counts.completed}
        </button>
        <button
          onClick={() => setFilter("cancelled")}
          className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors flex items-center gap-0.5 ${
            filter === "cancelled" ? "bg-red-600 text-white" : "bg-red-50 text-red-700 hover:bg-red-100"
          }`}
        >
          <XCircle className="w-2.5 h-2.5" /> {counts.cancelled}
        </button>
        <button
          onClick={() => setFilter("returned_to_pool")}
          className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors flex items-center gap-0.5 ${
            filter === "returned_to_pool" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
          }`}
        >
          <RotateCcw className="w-2.5 h-2.5" /> {counts.returned_to_pool}
        </button>
      </div>

      {/* Records list */}
      <div className="space-y-1.5">
        {displayRecords.map((rec) => {
          const cfg = statusConfig[rec.status] ?? statusConfig.cancelled;
          const Icon = cfg.icon;
          return (
            <div key={rec.id} className={`rounded-lg ${cfg.bg} px-2.5 py-2 border border-opacity-50`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-3 h-3 ${cfg.color} shrink-0`} />
                  <span className="text-[11px] font-semibold text-gray-800">#{rec.orderId}</span>
                  {rec.serviceType && (
                    <span className="text-[10px] text-gray-500 truncate max-w-[100px]">{rec.serviceType}</span>
                  )}
                </div>
                {rec.orderAmount && Number(rec.orderAmount) > 0 && (
                  <span className="text-[10px] font-semibold text-gray-700">{formatMoney(Number(rec.orderAmount))}</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                  {rec.city && <span className="text-[10px] text-gray-400">{rec.city}</span>}
                </div>
                <span className="text-[10px] text-gray-400">
                  {format(new Date(rec.removedAt), "d MMM yyyy", { locale: ru })}
                </span>
              </div>
              {rec.cancelReason && (
                <p className="text-[10px] text-gray-500 mt-0.5 truncate" title={rec.cancelReason}>
                  {rec.cancelReason}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {filtered.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 mt-2 text-[10px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          {expanded ? (
            <>Свернуть <ChevronUp className="w-3 h-3" /></>
          ) : (
            <>Показать ещё ({filtered.length - 5}) <ChevronDown className="w-3 h-3" /></>
          )}
        </button>
      )}
    </div>
  );
}
