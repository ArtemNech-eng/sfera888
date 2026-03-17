import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { usePushNotifications } from "@/lib/usePushNotifications";
import {
  Bell, CheckCircle2, XCircle, MapPin, Calendar, Ruler,
  ChevronRight, AlertTriangle, Star,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface AvailableOrder {
  id: number;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  scheduledAt: string | null;
  comment: string | null;
  dispatchedAt: string | null;
}

interface ActiveOrder {
  id: number;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  scheduledAt: string | null;
  status: string;
  masterWorkStatus: string | null;
  proposedAmount: number | null;
}

interface HomeData {
  master: any;
  availableOrders: AvailableOrder[];
  pendingOrders: any[];
  activeOrders: ActiveOrder[];
}

const statusLabels: Record<string, string> = {
  master_assigned: "Назначен",
  in_progress: "В работе",
  cancellation_requested: "Отмена запрошена",
  completed: "Завершён",
};

const workStatusLabels: Record<string, string> = {
  accepted: "Принят",
  on_way: "Еду на объект",
  on_site: "На объекте",
  work_done: "Работа выполнена",
  completed: "Завершён",
};

function AcceptModal({
  order,
  onAccept,
  onReject,
  onClose,
}: {
  order: AvailableOrder;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await api.orders.accept(order.id);
      toast.success("Заказ принят! Он появился в активных.");
      onAccept();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await api.orders.reject(order.id);
      toast.success("Заявка отклонена");
      onReject();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-0" onClick={onClose}>
      <div
        className="w-full max-w-[480px] bg-card rounded-t-2xl p-5 space-y-4 animate-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start">
          <h3 className="font-bold text-lg">Новая заявка</h3>
          <span className="text-xs text-muted-foreground">
            {order.dispatchedAt
              ? formatDistanceToNow(new Date(order.dispatchedAt), { addSuffix: true, locale: ru })
              : ""}
          </span>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-foreground">
            <MapPin size={16} className="text-primary shrink-0" />
            <span className="font-medium">{order.city}{order.district ? `, ${order.district}` : ""}</span>
          </div>
          <div className="flex items-center gap-2 text-foreground">
            <Ruler size={16} className="text-muted-foreground shrink-0" />
            <span>{order.serviceType} · {order.area} м²</span>
          </div>
          {order.scheduledAt && (
            <div className="flex items-center gap-2 text-foreground">
              <Calendar size={16} className="text-muted-foreground shrink-0" />
              <span>{new Date(order.scheduledAt).toLocaleString("ru-RU", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })}</span>
            </div>
          )}
          {order.comment && (
            <p className="text-muted-foreground pt-1 italic text-xs">{order.comment}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            onClick={handleReject}
            disabled={rejecting || accepting}
            className="flex items-center justify-center gap-2 h-12 rounded-xl border border-destructive text-destructive font-semibold text-sm active:opacity-80 disabled:opacity-50"
          >
            {rejecting
              ? <div className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
              : <XCircle size={18} />}
            Отказать
          </button>
          <button
            onClick={handleAccept}
            disabled={accepting || rejecting}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:opacity-80 disabled:opacity-50"
          >
            {accepting
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <CheckCircle2 size={18} />}
            Принять
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { master } = useAuth();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<AvailableOrder | null>(null);

  usePushNotifications(!!master);

  const load = async () => {
    try {
      const d = await api.home();
      setData(d);
    } catch (err: any) {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const available = data?.availableOrders ?? [];
  const active = data?.activeOrders ?? [];

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{master?.alias}</h1>
          <p className="text-sm text-muted-foreground">{master?.city}</p>
        </div>
        <div className="flex items-center gap-1 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1.5 rounded-xl">
          <Star size={14} fill="currentColor" />
          <span className="font-semibold text-sm">{master?.rating?.toFixed(1)}</span>
        </div>
      </div>

      {master && (master.debt ?? 0) > 0 && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <AlertTriangle size={20} className="text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Задолженность</p>
            <p className="text-xs text-red-600 dark:text-red-500">
              {(master.debt ?? 0).toLocaleString("ru-RU")} ₽ — свяжитесь с менеджером
            </p>
          </div>
        </div>
      )}

      {available.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-primary" />
            <h2 className="font-semibold text-sm text-foreground">
              Новые заявки ({available.length})
            </h2>
          </div>
          {available.map(order => (
            <button
              key={order.id}
              onClick={() => setSelectedOrder(order)}
              className="w-full bg-primary/10 dark:bg-primary/15 border border-primary/30 rounded-xl p-3.5 text-left space-y-1.5 active:opacity-80"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-primary">
                  {order.city}{order.district ? `, ${order.district}` : ""}
                </span>
                <span className="text-xs text-primary font-medium flex items-center gap-1">
                  Принять <ChevronRight size={14} />
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{order.serviceType}</span>
                <span>·</span>
                <span>{order.area} м²</span>
                {order.scheduledAt && (
                  <>
                    <span>·</span>
                    <span>{new Date(order.scheduledAt).toLocaleDateString("ru-RU", {
                      day: "numeric", month: "short",
                    })}</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold text-sm text-foreground">Активные заказы</h2>
        {active.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            Нет активных заказов
          </div>
        ) : (
          active.map(order => (
            <button
              key={order.id}
              onClick={() => setLocation("/orders")}
              className="w-full bg-card border border-border rounded-xl p-3.5 text-left space-y-1.5 active:opacity-80"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">
                  {order.city}{order.district ? `, ${order.district}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">#{order.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{order.serviceType} · {order.area} м²</span>
                <span className="text-xs font-medium text-primary">
                  {order.masterWorkStatus
                    ? workStatusLabels[order.masterWorkStatus] ?? order.masterWorkStatus
                    : statusLabels[order.status] ?? order.status}
                </span>
              </div>
            </button>
          ))
        )}
      </section>

      {selectedOrder && (
        <AcceptModal
          order={selectedOrder}
          onAccept={() => { setSelectedOrder(null); load(); }}
          onReject={() => { setSelectedOrder(null); load(); }}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  );
}
