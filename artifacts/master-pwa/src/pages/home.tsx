import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { usePushNotifications } from "@/lib/usePushNotifications";
import {
  Bell, CheckCircle2, XCircle, AlertTriangle, Star,
  MapPin, Calendar, Ruler, MessageSquare, ChevronRight,
  Clock, Package,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface ServiceLine {
  type: string;
  area: number;
  pricePerM2?: number;
}

interface OrderCard {
  id: number;
  city: string;
  district: string | null;
  serviceType: string;
  services: string | null;
  area: number;
  scheduledAt: string | null;
  comment: string | null;
  dispatchedAt: string | null;
}

interface PendingCard extends OrderCard {
  respondedAt: string | null;
}

interface ActiveOrder {
  id: number;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  status: string;
  masterWorkStatus: string | null;
}

interface HomeData {
  master: any;
  availableOrders: OrderCard[];
  pendingOrders: PendingCard[];
  activeOrders: ActiveOrder[];
}

const workStatusLabels: Record<string, string> = {
  accepted: "Принят",
  on_way: "Еду на объект",
  on_site: "На объекте",
  work_done: "Работа выполнена",
  completed: "Завершён",
};

const orderStatusLabels: Record<string, string> = {
  master_assigned: "Назначен",
  in_progress: "В работе",
  cancellation_requested: "Отмена запрошена",
};

function formatDate(d: string | null): string {
  if (!d) return "не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

function parseServices(raw: string | null): ServiceLine[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch {}
  return null;
}

function ServicesBlock({ order }: { order: OrderCard }) {
  const services = parseServices(order.services);
  if (services) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Package size={15} className="text-primary shrink-0" />
          <span>Услуги:</span>
        </div>
        <div className="pl-6 space-y-0.5">
          {services.map((s, i) => (
            <div key={i} className="text-sm text-foreground">
              {i + 1}. <span className="font-medium">{s.type}</span> — {s.area} м²
              {s.pricePerM2 ? ` × ${s.pricePerM2.toLocaleString("ru-RU")} ₽/м²` : ""}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Package size={15} className="text-primary shrink-0" />
        <span>Услуга: <span className="font-medium">{order.serviceType}</span></span>
      </div>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Ruler size={15} className="text-muted-foreground shrink-0" />
        <span>Объём: <span className="font-medium">{order.area} м²</span></span>
      </div>
    </>
  );
}

function OrderDetailSheet({
  order,
  onRespond,
  onReject,
  onClose,
}: {
  order: OrderCard;
  onRespond: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const [responding, setResponding] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleRespond = async () => {
    setResponding(true);
    try {
      await api.orders.respond(order.id);
      toast.success("Отклик отправлен! Ожидайте решения менеджера.");
      onRespond();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
    } finally {
      setResponding(false);
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
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-card rounded-t-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-primary/10 border-b border-primary/20 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-base text-primary">📋 Новая заявка #{order.id}</span>
            {order.dispatchedAt && (
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(order.dispatchedAt), { addSuffix: true, locale: ru })}
              </span>
            )}
          </div>
        </div>

        {/* Body — mirrors Telegram card format */}
        <div className="px-5 py-4 space-y-3">
          <ServicesBlock order={order} />

          <div className="flex items-center gap-2 text-sm text-foreground">
            <MapPin size={15} className="text-primary shrink-0" />
            <span>Район: <span className="font-medium">{order.city}{order.district ? `, ${order.district}` : ""}</span></span>
          </div>

          <div className="flex items-center gap-2 text-sm text-foreground">
            <Calendar size={15} className="text-muted-foreground shrink-0" />
            <span>Дата: <span className="font-medium">{formatDate(order.scheduledAt)}</span></span>
          </div>

          {order.comment && (
            <div className="flex items-start gap-2 text-sm text-foreground">
              <MessageSquare size={15} className="text-muted-foreground shrink-0 mt-0.5" />
              <span>Комментарий: <span className="italic text-muted-foreground">{order.comment}</span></span>
            </div>
          )}

          <p className="text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 leading-relaxed">
            Нажмите кнопку, чтобы откликнуться. Телефон клиента будет передан после подтверждения оператором.
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 grid grid-cols-2 gap-3">
          <button
            onClick={handleReject}
            disabled={rejecting || responding}
            className="flex items-center justify-center gap-2 h-12 rounded-xl border border-destructive text-destructive font-semibold text-sm active:opacity-80 disabled:opacity-50"
          >
            {rejecting
              ? <div className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
              : <XCircle size={18} />}
            Отказать
          </button>
          <button
            onClick={handleRespond}
            disabled={responding || rejecting}
            className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:opacity-80 disabled:opacity-50"
          >
            {responding
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <CheckCircle2 size={18} />}
            Откликнуться
          </button>
        </div>
      </div>
    </div>
  );
}

function RespondedSheet({
  order,
  onClose,
}: {
  order: PendingCard;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-card rounded-t-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-5 py-4">
          <span className="font-bold text-base text-amber-800 dark:text-amber-300">📋 Заявка #{order.id}</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          <ServicesBlock order={order} />
          <div className="flex items-center gap-2 text-sm text-foreground">
            <MapPin size={15} className="text-primary shrink-0" />
            <span>Район: <span className="font-medium">{order.city}{order.district ? `, ${order.district}` : ""}</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Calendar size={15} className="text-muted-foreground shrink-0" />
            <span>Дата: <span className="font-medium">{formatDate(order.scheduledAt)}</span></span>
          </div>
          {order.comment && (
            <div className="flex items-start gap-2 text-sm text-foreground">
              <MessageSquare size={15} className="text-muted-foreground shrink-0 mt-0.5" />
              <span>Комментарий: <span className="italic text-muted-foreground">{order.comment}</span></span>
            </div>
          )}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">✅ Вы откликнулись!</p>
            <p className="text-xs text-green-600 dark:text-green-500">Ожидайте подтверждения оператора.</p>
            <p className="text-xs text-muted-foreground">После подтверждения вы получите контакт клиента.</p>
          </div>
        </div>
        <div className="px-5 pb-6">
          <button
            onClick={onClose}
            className="w-full h-12 rounded-xl border border-border text-muted-foreground font-medium text-sm active:opacity-80"
          >
            Закрыть
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
  const [selectedAvail, setSelectedAvail] = useState<OrderCard | null>(null);
  const [selectedPending, setSelectedPending] = useState<PendingCard | null>(null);

  usePushNotifications(!!master);

  const load = async () => {
    try {
      const d = await api.home();
      setData(d);
    } catch {
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
  const pending = data?.pendingOrders ?? [];
  const active = data?.activeOrders ?? [];

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">

      {/* Header */}
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

      {/* Debt warning */}
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

      {/* New orders */}
      {available.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-primary" />
            <h2 className="font-semibold text-sm">Новые заявки ({available.length})</h2>
          </div>
          {available.map(order => {
            const services = parseServices(order.services);
            return (
              <button
                key={order.id}
                onClick={() => setSelectedAvail(order)}
                className="w-full bg-primary/10 dark:bg-primary/15 border border-primary/30 rounded-xl p-4 text-left space-y-2.5 active:opacity-80"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-primary">📋 Заявка #{order.id}</span>
                  <span className="text-xs text-primary font-medium flex items-center gap-0.5">
                    Откликнуться <ChevronRight size={14} />
                  </span>
                </div>
                <div className="space-y-1.5">
                  {services ? (
                    <div className="space-y-0.5">
                      {services.map((s, i) => (
                        <div key={i} className="text-xs text-foreground">
                          🔧 <span className="font-medium">{s.type}</span> — {s.area} м²
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-foreground">
                      🔧 <span className="font-medium">{order.serviceType}</span> — {order.area} м²
                    </div>
                  )}
                  <div className="text-xs text-foreground">
                    📍 {order.city}{order.district ? `, ${order.district}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    📅 {formatDate(order.scheduledAt)}
                  </div>
                  {order.comment && (
                    <div className="text-xs text-muted-foreground italic">
                      💬 {order.comment}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </section>
      )}

      {/* Pending — responded, waiting operator */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-500" />
            <h2 className="font-semibold text-sm">Ожидаю решения ({pending.length})</h2>
          </div>
          {pending.map(order => (
            <button
              key={order.id}
              onClick={() => setSelectedPending(order)}
              className="w-full bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 text-left space-y-2 active:opacity-80"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-amber-800 dark:text-amber-300">📋 Заявка #{order.id}</span>
                <span className="text-xs text-green-600 font-medium">✅ Отклик отправлен</span>
              </div>
              <div className="text-xs text-foreground">
                🔧 {order.serviceType} — {order.area} м²
              </div>
              <div className="text-xs text-foreground">
                📍 {order.city}{order.district ? `, ${order.district}` : ""}
              </div>
              {order.respondedAt && (
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(order.respondedAt), { addSuffix: true, locale: ru })}
                </div>
              )}
            </button>
          ))}
        </section>
      )}

      {/* Active orders */}
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
                    : orderStatusLabels[order.status] ?? order.status}
                </span>
              </div>
            </button>
          ))
        )}
      </section>

      {/* Modals */}
      {selectedAvail && (
        <OrderDetailSheet
          order={selectedAvail}
          onRespond={() => { setSelectedAvail(null); load(); }}
          onReject={() => { setSelectedAvail(null); load(); }}
          onClose={() => setSelectedAvail(null)}
        />
      )}
      {selectedPending && (
        <RespondedSheet
          order={selectedPending}
          onClose={() => setSelectedPending(null)}
        />
      )}
    </div>
  );
}
