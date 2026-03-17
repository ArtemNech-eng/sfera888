import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { usePushNotifications } from "@/lib/usePushNotifications";
import {
  Bell, CheckCircle2, XCircle, AlertTriangle, Star,
  MapPin, Calendar, Ruler, MessageSquare, Clock,
  ChevronRight, X, Images, Wrench,
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
  photos: string[];
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

// ─── Photo Gallery ────────────────────────────────────────────────────────────
function PhotoGallery({ photos }: { photos: string[] }) {
  const [active, setActive] = useState(0);
  if (!photos.length) return null;

  return (
    <div className="relative bg-black">
      <img
        src={photos[active]}
        alt={`Фото ${active + 1}`}
        className="w-full object-cover"
        style={{ maxHeight: 260 }}
      />
      {photos.length > 1 && (
        <>
          {/* Dot indicators */}
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === active ? "bg-white scale-110" : "bg-white/50"}`}
              />
            ))}
          </div>
          {/* Arrow buttons */}
          {active > 0 && (
            <button
              onClick={() => setActive(p => p - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white"
            >‹</button>
          )}
          {active < photos.length - 1 && (
            <button
              onClick={() => setActive(p => p + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white"
            >›</button>
          )}
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs rounded-full px-2 py-0.5">
            {active + 1}/{photos.length}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Order Detail Row ─────────────────────────────────────────────────────────
function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-none mb-1">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── Order Detail Bottom Sheet ────────────────────────────────────────────────
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
  const [state, setState] = useState<"idle" | "loading" | "success" | "rejecting">("idle");

  const handleRespond = async () => {
    setState("loading");
    try {
      await api.orders.respond(order.id);
      setState("success");
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
      setState("idle");
    }
  };

  const handleReject = async () => {
    setState("rejecting");
    try {
      await api.orders.reject(order.id);
      toast.success("Заявка отклонена");
      onReject();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
      setState("idle");
    }
  };

  const handleSuccessClose = () => {
    onRespond();
  };

  const services = parseServices(order.services);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <span className="font-bold text-base">Заявка #{order.id}</span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
          <X size={20} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

        {/* SUCCESS STATE */}
        {state === "success" ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 size={44} className="text-green-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Отклик отправлен!</h2>
              <p className="text-sm text-muted-foreground">Ожидайте решения менеджера.</p>
              <p className="text-xs text-muted-foreground">После подтверждения вы получите контакт клиента.</p>
            </div>
            <button
              onClick={handleSuccessClose}
              className="mt-4 w-full max-w-xs h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
            >
              Готово
            </button>
          </div>
        ) : (
          <>
            {/* Photos */}
            {order.photos.length > 0 ? (
              <PhotoGallery photos={order.photos} />
            ) : (
              <div className="flex items-center justify-center h-28 bg-muted/40 text-muted-foreground gap-2">
                <Images size={20} />
                <span className="text-sm">Фото не прикреплено</span>
              </div>
            )}

            {/* Details */}
            <div className="px-4 pt-2 pb-4">
              {/* Services block */}
              <div className="py-3 border-b border-border">
                <p className="text-xs text-muted-foreground mb-2">Услуга / объём</p>
                {services ? (
                  <div className="space-y-1.5">
                    {services.map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Wrench size={15} className="text-primary mt-0.5 shrink-0" />
                        <span className="text-sm font-medium">
                          {s.type} — {s.area} м²
                          {s.pricePerM2 ? ` · ${s.pricePerM2.toLocaleString("ru-RU")} ₽/м²` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Wrench size={15} className="text-primary shrink-0" />
                    <span className="text-sm font-medium">{order.serviceType} — {order.area} м²</span>
                  </div>
                )}
              </div>

              <Row icon={<MapPin size={16} />} label="Адрес" value={`${order.city}${order.district ? `, ${order.district}` : ""}`} />
              <Row icon={<Calendar size={16} />} label="Дата выезда" value={formatDate(order.scheduledAt)} />
              {order.comment && (
                <Row icon={<MessageSquare size={16} />} label="Комментарий" value={order.comment} />
              )}

              {/* Info note */}
              <div className="mt-4 bg-muted/60 rounded-xl px-4 py-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Телефон клиента будет передан после того, как менеджер выберет вас для этого заказа.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom action bar — only shown in idle/loading */}
      {state !== "success" && (
        <div className="shrink-0 bg-card border-t border-border px-4 py-4 space-y-2">
          <button
            onClick={handleRespond}
            disabled={state === "loading" || state === "rejecting"}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {state === "loading"
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <CheckCircle2 size={22} />}
            Откликнуться
          </button>
          <button
            onClick={handleReject}
            disabled={state === "loading" || state === "rejecting"}
            className="w-full h-11 rounded-xl text-destructive font-medium text-sm flex items-center justify-center gap-1.5 active:opacity-80 disabled:opacity-50"
          >
            {state === "rejecting"
              ? <div className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
              : <XCircle size={16} />}
            Отказать от заявки
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Responded Sheet ──────────────────────────────────────────────────────────
function RespondedSheet({ order, onClose }: { order: PendingCard; onClose: () => void }) {
  const services = parseServices(order.services);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <span className="font-bold text-base">Заявка #{order.id}</span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {order.photos.length > 0 && <PhotoGallery photos={order.photos} />}

        <div className="px-4 pt-2 pb-4">
          {/* Services */}
          <div className="py-3 border-b border-border">
            <p className="text-xs text-muted-foreground mb-2">Услуга / объём</p>
            {services ? (
              <div className="space-y-1.5">
                {services.map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Wrench size={15} className="text-primary mt-0.5 shrink-0" />
                    <span className="text-sm font-medium">{s.type} — {s.area} м²</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Wrench size={15} className="text-primary shrink-0" />
                <span className="text-sm font-medium">{order.serviceType} — {order.area} м²</span>
              </div>
            )}
          </div>

          <Row icon={<MapPin size={16} />} label="Адрес" value={`${order.city}${order.district ? `, ${order.district}` : ""}`} />
          <Row icon={<Calendar size={16} />} label="Дата выезда" value={formatDate(order.scheduledAt)} />
          {order.comment && (
            <Row icon={<MessageSquare size={16} />} label="Комментарий" value={order.comment} />
          )}

          {/* Responded status */}
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-green-500 shrink-0" />
              <p className="font-semibold text-sm text-green-700 dark:text-green-400">Вы откликнулись на эту заявку</p>
            </div>
            <p className="text-xs text-green-600 dark:text-green-500 pl-7">Ожидайте подтверждения оператора.</p>
            <p className="text-xs text-muted-foreground pl-7">После подтверждения вы получите контакт клиента.</p>
            {order.respondedAt && (
              <p className="text-xs text-muted-foreground pl-7">
                {formatDistanceToNow(new Date(order.respondedAt), { addSuffix: true, locale: ru })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 bg-card border-t border-border px-4 py-4">
        <button
          onClick={onClose}
          className="w-full h-12 rounded-xl border border-border text-muted-foreground font-medium text-sm"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
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
          {available.map(order => (
            <button
              key={order.id}
              onClick={() => setSelectedAvail(order)}
              className="w-full bg-primary/10 dark:bg-primary/15 border border-primary/30 rounded-2xl overflow-hidden text-left active:opacity-80"
            >
              {/* Thumbnail */}
              {order.photos.length > 0 && (
                <img
                  src={order.photos[0]}
                  alt="фото"
                  className="w-full object-cover"
                  style={{ height: 140 }}
                />
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-primary">Заявка #{order.id}</span>
                  <span className="text-xs text-primary font-medium flex items-center gap-0.5">
                    Открыть <ChevronRight size={14} />
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Wrench size={14} className="text-primary shrink-0" />
                    {order.serviceType} · {order.area} м²
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin size={12} className="shrink-0" />
                    {order.city}{order.district ? `, ${order.district}` : ""}
                  </div>
                  {order.scheduledAt && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar size={12} className="shrink-0" />
                      {formatDate(order.scheduledAt)}
                    </div>
                  )}
                  {order.photos.length > 1 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Images size={12} className="shrink-0" />
                      {order.photos.length} фото
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </section>
      )}

      {/* Pending */}
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
              className="w-full bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40 rounded-2xl overflow-hidden text-left active:opacity-80"
            >
              {order.photos.length > 0 && (
                <img src={order.photos[0]} alt="фото" className="w-full object-cover" style={{ height: 100 }} />
              )}
              <div className="p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-amber-800 dark:text-amber-300">Заявка #{order.id}</span>
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <CheckCircle2 size={12} /> Отклик отправлен
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Wrench size={14} className="text-amber-500 shrink-0" />
                  {order.serviceType} · {order.area} м²
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin size={12} className="shrink-0" />
                  {order.city}{order.district ? `, ${order.district}` : ""}
                </div>
              </div>
            </button>
          ))}
        </section>
      )}

      {/* Active orders */}
      <section className="space-y-2">
        <h2 className="font-semibold text-sm text-foreground">Активные заказы</h2>
        {active.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Нет активных заказов</div>
        ) : (
          active.map(order => (
            <button
              key={order.id}
              onClick={() => setLocation("/orders")}
              className="w-full bg-card border border-border rounded-2xl p-4 text-left space-y-2 active:opacity-80"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{order.city}{order.district ? `, ${order.district}` : ""}</span>
                <span className="text-xs text-muted-foreground">#{order.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Ruler size={12} />
                  {order.serviceType} · {order.area} м²
                </div>
                <span className="text-xs font-semibold text-primary">
                  {order.masterWorkStatus
                    ? workStatusLabels[order.masterWorkStatus] ?? order.masterWorkStatus
                    : orderStatusLabels[order.status] ?? order.status}
                </span>
              </div>
            </button>
          ))
        )}
      </section>

      {/* Full-screen modals */}
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
