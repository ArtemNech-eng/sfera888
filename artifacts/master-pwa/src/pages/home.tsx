import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { api, resolvePhotoUrl } from "@/lib/api";
import { toast } from "sonner";
import { usePushNotifications } from "@/lib/usePushNotifications";
import {
  Bell, CheckCircle2, XCircle, AlertTriangle, Star,
  MapPin, Calendar, MessageSquare, Clock,
  ChevronRight, X, Images, Wrench, Zap, PauseCircle,
  PlayCircle, Navigation, Users, Heart, ChevronDown, Briefcase,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceLine { type: string; area: number; pricePerM2?: number; }

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
  competitorCount: number;
  isRepeatClient: boolean;
}

interface PendingCard extends OrderCard { respondedAt: string | null; }

interface ActiveOrder {
  id: number; city: string; district: string | null;
  serviceType: string; area: number; status: string; masterWorkStatus: string | null;
}

// ─── Notification sound + vibration ──────────────────────────────────────────

function playNewOrderAlert() {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      const start = t + i * 0.13;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.35);
      osc.start(start); osc.stop(start + 0.35);
    });
  } catch {}
  try { navigator.vibrate?.([300, 100, 200, 100, 300]); } catch {}
}

// ─── Timer ────────────────────────────────────────────────────────────────────

function elapsedMinutes(d: string | null) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 60_000);
}

function DispatchTimer({ dispatchedAt }: { dispatchedAt: string | null }) {
  const mins = elapsedMinutes(dispatchedAt);
  if (mins < 2) return (
    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />Только что
    </span>
  );
  if (mins < 60) return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={11} />{mins} мин назад</span>
  );
  const hrs = Math.floor(mins / 60), rem = mins % 60;
  const label = rem > 0 ? `${hrs}ч ${rem}м` : `${hrs}ч`;
  if (hrs >= 2) return (
    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
      <Zap size={11} />{label} — истекает
    </span>
  );
  return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={11} />{label} назад</span>;
}

// ─── Swipeable card ───────────────────────────────────────────────────────────

const SWIPE_T = 80;

function SwipeableCard({ onSwipeRight, onSwipeLeft, children }: {
  onSwipeRight: () => void; onSwipeLeft: () => void; children: React.ReactNode;
}) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isH = useRef(false);
  const didSwipe = useRef(false);
  const [dx, setDx] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isH.current = false; didSwipe.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;
    const ddx = e.touches[0].clientX - startX.current;
    const ddy = e.touches[0].clientY - startY.current;
    if (!isH.current) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      if (Math.abs(ddx) > Math.abs(ddy)) isH.current = true;
      else { startX.current = null; return; }
    }
    if (isH.current) {
      e.preventDefault();
      setDx(Math.max(-SWIPE_T * 1.6, Math.min(SWIPE_T * 1.6, ddx)));
    }
  };
  const onTouchEnd = () => {
    if (isH.current) {
      if (dx > SWIPE_T) { didSwipe.current = true; onSwipeRight(); }
      else if (dx < -SWIPE_T) { didSwipe.current = true; onSwipeLeft(); }
    }
    setDx(0); startX.current = null; isH.current = false;
  };
  const prog = Math.min(Math.abs(dx) / SWIPE_T, 1);

  return (
    <div className="relative overflow-hidden rounded-2xl"
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="absolute inset-0 flex items-center justify-start pl-5 bg-emerald-500 rounded-2xl"
        style={{ opacity: dx > 8 ? prog : 0 }}>
        <div className="flex items-center gap-2 text-white font-bold text-sm"><CheckCircle2 size={20} /> Откликнуться</div>
      </div>
      <div className="absolute inset-0 flex items-center justify-end pr-5 bg-red-500 rounded-2xl"
        style={{ opacity: dx < -8 ? prog : 0 }}>
        <div className="flex items-center gap-2 text-white font-bold text-sm">Отказать <XCircle size={20} /></div>
      </div>
      <div style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 0.2s ease" : "none" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Photo Gallery ────────────────────────────────────────────────────────────

function PhotoGallery({ photos }: { photos: string[] }) {
  const [active, setActive] = useState(0);
  if (!photos.length) return null;
  return (
    <div className="relative bg-black">
      <img src={resolvePhotoUrl(photos[active])} alt={`Фото ${active + 1}`} className="w-full object-cover" style={{ maxHeight: 260 }} />
      {photos.length > 1 && (
        <>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {photos.map((_, i) => (
              <button key={i} onClick={() => setActive(i)}
                className={`w-2 h-2 rounded-full ${i === active ? "bg-white scale-110" : "bg-white/50"}`} />
            ))}
          </div>
          {active > 0 && (
            <button onClick={() => setActive(p => p - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white text-lg">‹</button>
          )}
          {active < photos.length - 1 && (
            <button onClick={() => setActive(p => p + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white text-lg">›</button>
          )}
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs rounded-full px-2 py-0.5">
            {active + 1}/{photos.length}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Detail Row ───────────────────────────────────────────────────────────────

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return "не указана";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

function parseServices(raw: string | null): ServiceLine[] | null {
  if (!raw) return null;
  try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) return a; } catch {}
  return null;
}

// ─── Map Preview (static image linking to Yandex Maps) ───────────────────────

function YandexMapEmbed({ city, district }: { city: string; district: string | null }) {
  const address = `${city}${district ? ` ${district}` : ""}`;
  const query = encodeURIComponent(address);
  const apiKey = import.meta.env.VITE_YANDEX_MAPS_KEY ?? "";
  const staticSrc = `https://static-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${query}&z=14&size=600,200&l=map&lang=ru_RU`;
  const mapsUrl = `https://yandex.ru/maps/?text=${query}`;
  const [imgError, setImgError] = useState(false);

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-border">
      {!imgError ? (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="block relative">
          <img
            src={staticSrc}
            alt="Карта"
            className="w-full object-cover block"
            style={{ height: 180 }}
            onError={() => setImgError(true)}
          />
          <div className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none">
            <span className="bg-black/50 text-white text-xs rounded-full px-3 py-1">
              Открыть в Яндекс Картах ↗
            </span>
          </div>
        </a>
      ) : (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 h-16 bg-muted text-muted-foreground text-sm hover:bg-accent transition-colors">
          <MapPin size={15} />
          {address} — открыть карту ↗
        </a>
      )}
    </div>
  );
}

// ─── Navigation Buttons ───────────────────────────────────────────────────────

function NavigationButtons({ city, district }: { city: string; district: string | null }) {
  const query = encodeURIComponent(`${city}${district ? ` ${district}` : ""}`);
  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground mb-2">Маршрут до объекта</p>
      <div className="flex gap-2">
        <a href={`https://2gis.ru/search/${query}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
          <Navigation size={13} /> 2ГИС
        </a>
        <a href={`https://yandex.ru/maps/?text=${query}&rtt=auto`} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-semibold">
          <Navigation size={13} /> Яндекс
        </a>
        <a href={`https://www.google.com/maps/search/?api=1&query=${query}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 text-xs font-semibold">
          <Navigation size={13} /> Google
        </a>
      </div>
    </div>
  );
}

// ─── Rejection Reason Sheet ───────────────────────────────────────────────────

const REJECT_REASONS = [
  "Слишком далеко",
  "Неудобные даты",
  "Не моя специализация",
  "Уже занят",
  "Слишком маленький объём",
  "Другая причина",
];

function RejectReasonSheet({ onConfirm, onCancel }: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/40" onClick={onCancel}>
      <div className="w-full bg-background rounded-t-2xl pt-4 pb-8 px-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-2" />
        <h3 className="font-bold text-base">Почему отказываете?</h3>
        <p className="text-xs text-muted-foreground">Это помогает нам подбирать более подходящие заявки</p>
        <div className="space-y-2 mt-2">
          {REJECT_REASONS.map(r => (
            <button key={r} onClick={() => setSelected(r)}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                selected === r
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border bg-card text-foreground"
              }`}>
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel}
            className="flex-1 h-12 rounded-xl border border-border text-muted-foreground text-sm font-medium">
            Отмена
          </button>
          <button
            disabled={!selected || loading}
            onClick={async () => {
              if (!selected) return;
              setLoading(true);
              onConfirm(selected);
            }}
            className="flex-1 h-12 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-50">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : "Отказать"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Detail Sheet ───────────────────────────────────────────────────────

function OrderDetailSheet({ order, onRespond, onReject, onClose }: {
  order: OrderCard; onRespond: () => void; onReject: () => void; onClose: () => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "rejecting">("idle");
  const [showRejectSheet, setShowRejectSheet] = useState(false);
  const [showPriceNote, setShowPriceNote] = useState(false);
  const [priceNote, setPriceNote] = useState("");
  const services = parseServices(order.services);

  const handleRespond = async () => {
    setState("loading");
    try {
      await api.orders.respond(order.id, priceNote.trim() || undefined);
      setState("success");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
      setState("idle");
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    setState("rejecting");
    setShowRejectSheet(false);
    try {
      await api.orders.reject(order.id, reason);
      toast.success("Заявка отклонена");
      onReject();
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
      setState("idle");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold">Заявка #{order.id}</span>
          <DispatchTimer dispatchedAt={order.dispatchedAt} />
          {order.isRepeatClient && (
            <span className="flex items-center gap-1 text-xs font-semibold text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 px-2 py-0.5 rounded-full">
              <Heart size={10} fill="currentColor" /> Ваш клиент
            </span>
          )}
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {state === "success" ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 size={44} className="text-green-500" />
            </div>
            <h2 className="text-xl font-bold">Отклик отправлен!</h2>
            <p className="text-sm text-muted-foreground">Ожидайте решения менеджера.</p>
            {priceNote && (
              <div className="bg-muted/60 rounded-xl px-4 py-3 max-w-xs">
                <p className="text-xs text-muted-foreground">Ваше предложение передано:</p>
                <p className="text-sm font-medium mt-1">{priceNote}</p>
              </div>
            )}
            <button onClick={onRespond}
              className="mt-2 w-full max-w-xs h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
              Готово
            </button>
          </div>
        ) : (
          <>
            {order.photos.length > 0
              ? <PhotoGallery photos={order.photos} />
              : <div className="flex items-center justify-center h-24 bg-muted/40 text-muted-foreground gap-2">
                  <Images size={18} /><span className="text-sm">Фото не прикреплено</span>
                </div>
            }
            <div className="px-4 pt-2 pb-4">
              {/* Competition + repeat client info */}
              <div className="flex items-center gap-3 py-2.5 border-b border-border mb-1">
                {order.competitorCount > 0 ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    <Users size={13} />
                    Уже откликнулись: {order.competitorCount} {order.competitorCount === 1 ? "мастер" : "мастера"}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 size={13} /> Первый отклик — у вас преимущество!
                  </div>
                )}
                {order.isRepeatClient && (
                  <div className="flex items-center gap-1 text-xs text-pink-600 dark:text-pink-400 font-medium ml-auto">
                    <Heart size={11} fill="currentColor" /> Ваш клиент
                  </div>
                )}
              </div>

              {/* Services */}
              <div className="py-3 border-b border-border">
                <p className="text-xs text-muted-foreground mb-2">Услуга / объём</p>
                {services ? (
                  <div className="space-y-1.5">
                    {services.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Wrench size={14} className="text-primary shrink-0" />
                        <span className="text-sm font-medium">{s.type} — {s.area} м²{s.pricePerM2 ? ` · ${s.pricePerM2.toLocaleString("ru-RU")} ₽/м²` : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Wrench size={14} className="text-primary shrink-0" />
                    <span className="text-sm font-medium">{order.serviceType} — {order.area} м²</span>
                  </div>
                )}
              </div>

              <Row icon={<MapPin size={16} />} label="Адрес" value={`${order.city}${order.district ? `, ${order.district}` : ""}`} />
              <YandexMapEmbed city={order.city} district={order.district} />
              <Row icon={<Calendar size={16} />} label="Дата выезда" value={formatDate(order.scheduledAt)} />
              {order.comment && <Row icon={<MessageSquare size={16} />} label="Комментарий" value={order.comment} />}

              {/* Navigation */}
              <NavigationButtons city={order.city} district={order.district} />

              {/* Price note (optional) */}
              <div className="mt-4">
                <button
                  onClick={() => setShowPriceNote(p => !p)}
                  className="flex items-center gap-2 text-xs text-primary font-medium"
                >
                  <ChevronDown size={14} className={`transition-transform ${showPriceNote ? "rotate-180" : ""}`} />
                  {showPriceNote ? "Скрыть предложение" : "Добавить ценовое предложение (необязательно)"}
                </button>
                {showPriceNote && (
                  <div className="mt-2">
                    <textarea
                      value={priceNote}
                      onChange={e => setPriceNote(e.target.value)}
                      placeholder="Например: готов выехать за 1 500 ₽/м², могу начать 20 марта"
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 bg-muted/60 rounded-xl px-4 py-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Телефон клиента будет передан после того, как менеджер выберет вас.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {state !== "success" && (
        <div className="shrink-0 bg-card border-t border-border px-4 py-4 space-y-2">
          <button onClick={handleRespond} disabled={state !== "idle"}
            className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
            {state === "loading"
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <CheckCircle2 size={22} />}
            Откликнуться{priceNote.trim() ? " с предложением" : ""}
          </button>
          <button onClick={() => setShowRejectSheet(true)} disabled={state !== "idle"}
            className="w-full h-11 rounded-xl text-destructive font-medium text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
            {state === "rejecting"
              ? <div className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
              : <XCircle size={16} />}
            Отказать от заявки
          </button>
        </div>
      )}

      {showRejectSheet && (
        <RejectReasonSheet
          onConfirm={handleRejectConfirm}
          onCancel={() => setShowRejectSheet(false)}
        />
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
        <span className="font-bold">Заявка #{order.id}</span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {order.photos.length > 0 && <PhotoGallery photos={order.photos} />}
        <div className="px-4 pt-2 pb-4">
          <div className="py-3 border-b border-border">
            <p className="text-xs text-muted-foreground mb-2">Услуга / объём</p>
            {services ? (
              <div className="space-y-1.5">
                {services.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Wrench size={14} className="text-primary shrink-0" />
                    <span className="text-sm font-medium">{s.type} — {s.area} м²</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Wrench size={14} className="text-primary shrink-0" />
                <span className="text-sm font-medium">{order.serviceType} — {order.area} м²</span>
              </div>
            )}
          </div>
          <Row icon={<MapPin size={16} />} label="Адрес" value={`${order.city}${order.district ? `, ${order.district}` : ""}`} />
          <YandexMapEmbed city={order.city} district={order.district} />
          <Row icon={<Calendar size={16} />} label="Дата выезда" value={formatDate(order.scheduledAt)} />
          {order.comment && <Row icon={<MessageSquare size={16} />} label="Комментарий" value={order.comment} />}
          <NavigationButtons city={order.city} district={order.district} />
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-4 space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-500 shrink-0" />
              <p className="font-semibold text-sm text-green-700 dark:text-green-400">Вы откликнулись</p>
            </div>
            <p className="text-xs text-green-600 dark:text-green-500 pl-7">Ожидайте подтверждения оператора</p>
            {order.respondedAt && (
              <p className="text-xs text-muted-foreground pl-7">
                {formatDistanceToNow(new Date(order.respondedAt), { addSuffix: true, locale: ru })}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 bg-card border-t border-border px-4 py-4">
        <button onClick={onClose} className="w-full h-12 rounded-xl border border-border text-muted-foreground font-medium text-sm">Закрыть</button>
      </div>
    </div>
  );
}

// ─── Availability Toggle ──────────────────────────────────────────────────────

function AvailabilityToggle({
  isAvailable,
  atLimit,
  onChange,
}: {
  isAvailable: boolean;
  atLimit: boolean;
  onChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const toggle = async () => {
    if (atLimit && !isAvailable) return; // already blocked by API, but prevent optimistic UI
    setLoading(true);
    try {
      await api.setAvailability(!isAvailable);
      onChange(!isAvailable);
      toast.success(isAvailable ? "Вы недоступны — заявки не будут приходить" : "Вы снова принимаете заявки");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally { setLoading(false); }
  };

  if (atLimit) {
    return (
      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
        <Briefcase size={13} />
        Лимит заказов
      </span>
    );
  }

  return (
    <button onClick={toggle} disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-60 ${
        isAvailable
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      }`}>
      {loading
        ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : isAvailable ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
      {isAvailable ? "Принимаю заявки" : "Недоступен"}
    </button>
  );
}

// ─── Swipe hint ───────────────────────────────────────────────────────────────

const SWIPE_HINT_KEY = "swipe_hint_shown_v2";

function SwipeHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-muted/80 border border-border rounded-xl px-3 py-2.5 text-xs text-muted-foreground">
      <span className="shrink-0"><span className="text-emerald-500 font-bold">→</span> Откликнуться &nbsp; <span className="text-red-500 font-bold">←</span> Отказать</span>
      <span className="flex-1 text-center opacity-60">Свайп для быстрого ответа</span>
      <button onClick={onDismiss}><X size={14} /></button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { master } = useAuth();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAvail, setSelectedAvail] = useState<OrderCard | null>(null);
  const [selectedPending, setSelectedPending] = useState<PendingCard | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [showSwipeHint, setShowSwipeHint] = useState(() => !localStorage.getItem(SWIPE_HINT_KEY));

  const prevOrderIds = useRef<Set<number>>(new Set());
  const firstLoad = useRef(true);

  usePushNotifications(!!master);

  const load = useCallback(async () => {
    try {
      const d = await api.home();
      setData(d);
      setIsAvailable(d.master?.isAvailable ?? true);
      const currentIds = new Set<number>((d.availableOrders ?? []).map((o: OrderCard) => o.id));
      if (!firstLoad.current) {
        const newOnes = [...currentIds].filter(id => !prevOrderIds.current.has(id));
        if (newOnes.length > 0) playNewOrderAlert();
      }
      firstLoad.current = false;
      prevOrderIds.current = currentIds;
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const dismissSwipeHint = () => { localStorage.setItem(SWIPE_HINT_KEY, "1"); setShowSwipeHint(false); };

  const handleSwipeRespond = async (order: OrderCard) => {
    try { await api.orders.respond(order.id); toast.success(`Отклик на заявку #${order.id} отправлен!`); load(); }
    catch (e: any) { toast.error(e.message ?? "Ошибка"); }
  };

  const handleSwipeReject = async (order: OrderCard) => {
    try { await api.orders.reject(order.id); toast.success("Заявка отклонена"); load(); }
    catch (e: any) { toast.error(e.message ?? "Ошибка"); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const available: OrderCard[] = data?.availableOrders ?? [];
  const pending: PendingCard[] = data?.pendingOrders ?? [];
  const active: ActiveOrder[] = data?.activeOrders ?? [];
  const orderLimit: number = data?.master?.orderLimit ?? 2;
  const atLimit = active.length >= orderLimit;

  const workStatusLabels: Record<string, string> = {
    accepted: "Принят", on_way: "Еду на объект", on_site: "На объекте",
    work_done: "Работа выполнена", completed: "Завершён",
  };
  const orderStatusLabels: Record<string, string> = {
    master_assigned: "Назначен", in_progress: "В работе", cancellation_requested: "Отмена",
  };

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{master?.alias}</h1>
          <p className="text-sm text-muted-foreground">{master?.city}</p>
        </div>
        <div className="flex items-center gap-2">
          <AvailabilityToggle isAvailable={isAvailable} atLimit={atLimit} onChange={setIsAvailable} />
          <div className="flex items-center gap-1 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2.5 py-1.5 rounded-xl">
            <Star size={13} fill="currentColor" />
            <span className="font-semibold text-sm">{master?.rating?.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* At order limit warning */}
      {atLimit && (
        <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3">
          <Briefcase size={18} className="text-orange-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">Максимум заказов ({active.length}/{orderLimit})</p>
            <p className="text-xs text-orange-600 dark:text-orange-500">Закройте текущие заказы, чтобы принимать новые.</p>
          </div>
        </div>
      )}

      {/* Unavailable warning */}
      {!atLimit && !isAvailable && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <PauseCircle size={18} className="text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Вы недоступны</p>
            <p className="text-xs text-red-600 dark:text-red-500">Новые заявки не поступают. Включите приём выше.</p>
          </div>
        </div>
      )}

      {/* Debt warning */}
      {master && (master.debt ?? 0) > 0 && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Задолженность</p>
            <p className="text-xs text-red-600 dark:text-red-500">{(master.debt ?? 0).toLocaleString("ru-RU")} ₽ — свяжитесь с менеджером</p>
          </div>
        </div>
      )}

      {/* New orders */}
      {available.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-primary" />
            <h2 className="font-semibold text-sm">Новые заявки ({available.length})</h2>
          </div>
          {showSwipeHint && <SwipeHint onDismiss={dismissSwipeHint} />}
          {available.map(order => (
            <SwipeableCard key={order.id}
              onSwipeRight={() => handleSwipeRespond(order)}
              onSwipeLeft={() => handleSwipeReject(order)}>
              <button onClick={() => setSelectedAvail(order)}
                className="w-full bg-primary/10 dark:bg-primary/15 border border-primary/30 rounded-2xl overflow-hidden text-left">
                {order.photos.length > 0 && (
                  <img src={resolvePhotoUrl(order.photos[0])} alt="фото" className="w-full object-cover" style={{ height: 130 }} />
                )}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-primary">Заявка #{order.id}</span>
                      {order.isRepeatClient && (
                        <span className="flex items-center gap-0.5 text-xs text-pink-500 font-semibold">
                          <Heart size={10} fill="currentColor" /> Ваш клиент
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <DispatchTimer dispatchedAt={order.dispatchedAt} />
                      <ChevronRight size={14} className="text-primary opacity-60" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Wrench size={13} className="text-primary shrink-0" />
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
                    {/* Competitor badge */}
                    {order.competitorCount > 0 ? (
                      <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <Users size={11} /> {order.competitorCount} {order.competitorCount === 1 ? "мастер откликнулся" : "мастера откликнулись"}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 size={11} /> Первый отклик
                      </div>
                    )}
                  </div>
                </div>
              </button>
            </SwipeableCard>
          ))}
        </section>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-amber-500" />
            <h2 className="font-semibold text-sm">Ожидаю решения ({pending.length})</h2>
          </div>
          {pending.map(order => (
            <button key={order.id} onClick={() => setSelectedPending(order)}
              className="w-full bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40 rounded-2xl overflow-hidden text-left">
              {order.photos.length > 0 && (
                <img src={resolvePhotoUrl(order.photos[0])} alt="фото" className="w-full object-cover" style={{ height: 90 }} />
              )}
              <div className="p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-amber-800 dark:text-amber-300">Заявка #{order.id}</span>
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <CheckCircle2 size={12} /> Отклик отправлен
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Wrench size={13} className="text-amber-500 shrink-0" />
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
        <h2 className="font-semibold text-sm">Активные заказы</h2>
        {active.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Нет активных заказов</div>
        ) : (
          active.map(order => (
            <button key={order.id} onClick={() => setLocation("/orders")}
              className="w-full bg-card border border-border rounded-2xl p-4 text-left space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">{order.city}{order.district ? `, ${order.district}` : ""}</span>
                <span className="text-xs text-muted-foreground">#{order.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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

      {/* Full-screen sheets */}
      {selectedAvail && (
        <OrderDetailSheet
          order={selectedAvail}
          onRespond={() => { setSelectedAvail(null); load(); }}
          onReject={() => { setSelectedAvail(null); load(); }}
          onClose={() => setSelectedAvail(null)}
        />
      )}
      {selectedPending && (
        <RespondedSheet order={selectedPending} onClose={() => setSelectedPending(null)} />
      )}
    </div>
  );
}
