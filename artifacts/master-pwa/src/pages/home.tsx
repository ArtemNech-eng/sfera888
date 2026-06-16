import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { api, resolvePhotoUrl } from "@/lib/api";
import { toast } from "sonner";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bell, CheckCircle2, XCircle, AlertTriangle, Star,
  MapPin, Calendar, MessageSquare, Clock,
  ChevronRight, X, Images, Wrench, Zap, PauseCircle,
  PlayCircle, Navigation, Users, Heart, ChevronDown, Briefcase,
  Eye, EyeOff, Lock, FileText, Bot, Phone, Maximize, Wallet, DollarSign,
  Coins,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceLine { type: string; area: number; pricePerM2?: number; }

interface OrderCard {
  id: number;
  leadId: number | null;
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
  tokensCost?: number;
  tokensCostExplanation?: string;
  paymentModel?: string;
}

interface PendingCard extends OrderCard { respondedAt: string | null; }

interface ActiveOrder {
  id: number; leadId: number | null; city: string; district: string | null;
  serviceType: string; area: number; status: string; masterWorkStatus: string | null;
}

interface MissedOrder {
  id: number;
  serviceType: string;
  district: string | null;
  area: number;
  takenAt: string;
  wasDispatched: boolean;
}

interface FomoBlock {
  isBlocked: boolean;
  type: string | null;
  reason: string | null;
  orderId: number | null;
  hoursElapsed: number | null;
}

interface LandingLead {
  id: number;
  city: string;
  district: string;
  serviceType: string;
  services: string[];
  area: number;
  comment: string | null;
  createdAt: string;
  tokensCost: number;
  tokensCostExplanation?: string;
  photos: string[];
  scheduledAt: string | null;
}

// ─── FOMO modal ───────────────────────────────────────────────────────────────

function FomoModal({ fomoBlock, onClose }: { fomoBlock: FomoBlock; onClose: () => void }) {
  const typeMessages: Record<string, { title: string; body: string; icon: string }> = {
    no_estimate: {
      title: "Нужна смета",
      body: `По одному из заказов смета не отправлена уже более 48 часов.\nОтправьте смету менеджеру, чтобы разблокировать отклики.`,
      icon: "⏱️",
    },
    no_payment: {
      title: "Ожидается предоплата",
      body: `По одному из заказов предоплата не поступила уже более 72 часов.\nДождитесь оплаты или уточните статус у менеджера.`,
      icon: "💳",
    },
    limit_reached: {
      title: "Достигнут лимит заказов",
      body: `У вас уже максимальное количество активных заказов.\nЗавершите хотя бы один заказ, чтобы снова откликаться на новые.`,
      icon: "📦",
    },
    overdue_debt: {
      title: "Есть задолженность",
      body: `Оплатите задолженность, чтобы снова получить возможность откликаться на заявки.`,
      icon: "💸",
    },
  };
  const info = fomoBlock.type ? typeMessages[fomoBlock.type] : null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm px-4 pb-6" onClick={onClose}>
      <div className="w-full max-w-sm bg-background rounded-3xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-orange-50 dark:bg-orange-900/30 px-6 pt-7 pb-5 border-b border-orange-100 dark:border-orange-800 text-center">
          <div className="text-5xl mb-3">{info?.icon ?? "🔒"}</div>
          <h2 className="font-bold text-lg text-orange-800 dark:text-orange-300">
            {info?.title ?? "Отклик недоступен"}
          </h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground whitespace-pre-line text-center leading-relaxed">
            {info?.body ?? fomoBlock.reason ?? "Выполните условия, чтобы снова откликаться на заявки."}
          </p>
          {fomoBlock.hoursElapsed && (
            <div className="flex items-center justify-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl px-4 py-2">
              <Clock size={14} className="text-orange-500 shrink-0" />
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                Просрочено на {fomoBlock.hoursElapsed} ч
              </span>
            </div>
          )}
          {fomoBlock.orderId && (
            <p className="text-xs text-center text-muted-foreground">Заказ #{fomoBlock.orderId}</p>
          )}
          <button onClick={onClose}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm">
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}

interface TodayActivity {
  total: number;
  taken: number;
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
  const mapsUrl = `https://yandex.ru/maps/?text=${query}`;

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-border">
      <iframe
        src={`https://yandex.ru/map-widget/v1/?text=${query}&z=14&lang=ru_RU`}
        width="100%"
        height="180"
        frameBorder="0"
        allowFullScreen
        title={address}
        className="block"
        loading="lazy"
      />
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 h-10 bg-muted/50 text-muted-foreground text-xs hover:bg-accent transition-colors border-t border-border"
      >
        <MapPin size={12} />
        {address} — открыть в Яндекс Картах ↗
      </a>
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

// ─── Insufficient Tokens Screen ───────────────────────────────────────────────

function InsufficientTokensScreen({
  order,
  walletBalance,
  tokensBalance,
  creditLimitTokens,
  onClose,
}: {
  order: OrderCard;
  walletBalance: number;
  tokensBalance: number;
  creditLimitTokens: number;
  onClose: () => void;
}) {
  const topupNeeded = tokensBalance < 0 ? -tokensBalance : 0;
  const [, setLocation] = useLocation();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleContactAdmin = async () => {
    setSending(true);
    try {
      await fetch("/api/master-pwa/contact-admin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "token_request",
          orderId: order.id,
          message: `Мастер запросил тестовый токен / помощь по заявке #${order.leadId ?? order.id}`,
        }),
      });
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-5">
      <div className="text-6xl">🪙</div>
      <div>
        <h2 className="text-xl font-bold mb-2">Недостаточно токенов</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          У вас недостаточно токенов для отклика на этот заказ.
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl px-4 py-4 text-left w-full max-w-sm space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Нужно токенов</span>
          <span className="font-bold text-amber-600 flex items-center gap-1">
            <Coins size={13} /> {order.tokensCost ?? 1} т.
          </span>
        </div>
        <div className="border-t border-amber-200/60 pt-2 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Баланс</span>
            <span className="font-medium">{tokensBalance} т.</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Кредитный лимит</span>
            <span className="font-medium text-blue-600">+{creditLimitTokens} т.</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Доступно</span>
            <span className="font-bold text-emerald-600">{walletBalance} т.</span>
          </div>
          {topupNeeded > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Пополнить до 0</span>
              <span className="font-medium text-red-500">{topupNeeded} т.</span>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground px-2 leading-relaxed">
        Чтобы продолжить — пополните баланс или напишите администратору, если проходите тестовый период.
      </p>

      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={() => { onClose(); setLocation("/wallet"); }}
          className="w-full h-12 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Coins size={16} /> Перейти в Кошелёк
        </button>

        {sent ? (
          <div className="flex items-center justify-center gap-2 h-10 text-sm text-emerald-600 font-medium">
            <CheckCircle2 size={16} /> Сообщение отправлено
          </div>
        ) : (
          <button
            onClick={handleContactAdmin}
            disabled={sending}
            className="w-full h-12 rounded-xl border border-border text-sm font-medium text-foreground flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <MessageSquare size={16} />}
            Написать администратору
          </button>
        )}

        <button onClick={onClose} className="w-full h-10 text-sm text-muted-foreground font-medium">
          Закрыть
        </button>
      </div>
    </div>
  );
}

// ─── Landing Lead Sheet ───────────────────────────────────────────────────────

function LandingLeadSheet({ lead, walletBalance, onClose, onSuccess }: {
  lead: LandingLead;
  walletBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<"idle" | "loading" | "revealed" | "taken" | "no_tokens">("idle");
  const [contact, setContact] = useState<{ name: string; phone: string; orderId?: number } | null>(null);

  const handleReveal = async () => {
    if (lead.tokensCost > walletBalance) { setState("no_tokens"); return; }
    setState("loading");
    try {
      const result = await api.leads.respond(lead.id);
      if (result?.ok) {
        setContact({ name: result.clientName ?? "Клиент", phone: result.clientPhone, orderId: result.orderId });
        setState("revealed");
        onSuccess();
      }
    } catch (e: any) {
      if (e.data?.insufficientTokens) setState("no_tokens");
      else if (e.data?.alreadyTaken) setState("taken");
      else { toast.error(e.message ?? "Ошибка"); setState("idle"); }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <span className="font-bold">Прямая заявка #{lead.id}</span>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {state === "no_tokens" ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-5">
            <div className="text-6xl">🪙</div>
            <div>
              <h2 className="text-xl font-bold mb-2">Недостаточно токенов</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Пополните баланс, чтобы открыть контакт клиента.
              </p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl px-4 py-4 w-full max-w-sm space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Нужно токенов</span>
                <span className="font-bold text-amber-600 flex items-center gap-1"><Coins size={13} /> {lead.tokensCost} т.</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ваш баланс</span>
                <span className="font-bold">{walletBalance} т.</span>
              </div>
            </div>
            <div className="w-full max-w-sm space-y-3">
              <button onClick={() => { onClose(); setLocation("/wallet"); }}
                className="w-full h-12 rounded-xl bg-amber-500 text-white font-semibold text-sm flex items-center justify-center gap-2">
                <Coins size={16} /> Перейти в Кошелёк
              </button>
              <button onClick={() => setState("idle")} className="w-full h-10 text-sm text-muted-foreground font-medium">Назад</button>
            </div>
          </div>
        ) : state === "taken" ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-5">
            <div className="text-6xl">⚡</div>
            <div>
              <h2 className="text-xl font-bold mb-2">Заявка занята</h2>
              <p className="text-sm text-muted-foreground">Другой мастер только что открыл этот контакт. Смотрите другие заявки.</p>
            </div>
            <button onClick={onClose}
              className="w-full max-w-sm h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
              Закрыть
            </button>
          </div>
        ) : state === "revealed" && contact ? (
          <div className="px-4 py-6 space-y-5">
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold">{contact.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">Позвоните клиенту как можно скорее</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold tracking-wide">{contact.phone}</p>
            </div>
            <a href={`tel:${contact.phone}`}
              className="flex w-full items-center justify-center gap-2 h-14 rounded-2xl bg-emerald-500 text-white font-bold text-base">
              <Phone size={20} /> Позвонить
            </a>
            {contact.orderId && (
              <button onClick={() => { onClose(); setLocation(`/orders?expand=${contact.orderId}`); }}
                className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2">
                <Briefcase size={16} /> Перейти к заказу #{contact.orderId}
              </button>
            )}
            {lead.photos.length > 0 && <PhotoGallery photos={lead.photos} />}
            <div className="border border-border rounded-2xl p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Детали заявки</p>
              <div className="flex items-center gap-2 text-sm"><Wrench size={13} className="text-primary shrink-0" />{lead.serviceType}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin size={12} className="shrink-0" />{lead.city}{lead.district ? `, ${lead.district}` : ""}</div>
              {lead.area > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Maximize size={12} className="shrink-0" />{lead.area} м²</div>
              )}
              {lead.scheduledAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Calendar size={12} className="shrink-0" />{formatDate(lead.scheduledAt)}</div>
              )}
              {lead.comment && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <MessageSquare size={12} className="shrink-0 mt-0.5" />{lead.comment}
                </div>
              )}
            </div>
            <YandexMapEmbed city={lead.city} district={lead.district} />
            <NavigationButtons city={lead.city} district={lead.district} />
            <button onClick={onClose} className="w-full h-10 text-sm text-muted-foreground font-medium">Закрыть</button>
          </div>
        ) : (
          <div className="px-4 py-5 space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full">Прямая заявка</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true, locale: ru })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-base font-semibold">
                <Wrench size={16} className="text-primary shrink-0" />{lead.serviceType}
              </div>
              {lead.services.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {lead.services.map((s) => (
                    <span key={s} className="text-xs bg-muted px-2.5 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin size={14} className="shrink-0" />{lead.city}{lead.district ? `, ${lead.district}` : ""}
              </div>
              {lead.area > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Maximize size={14} className="shrink-0" />{lead.area} м²
                </div>
              )}
              {lead.comment && (
                <div className="bg-muted/50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground mb-1">Комментарий клиента</p>
                  <p className="text-sm">{lead.comment}</p>
                </div>
              )}
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 flex items-start gap-3">
              <Lock size={16} className="text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Контакт скрыт</p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">
                  Имя и телефон откроются после оплаты токена. Первый откликнувшийся забирает заявку.
                </p>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl px-4 py-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Стоимость отклика</span>
                <span className="font-bold text-amber-600 flex items-center gap-1"><Coins size={13} /> {lead.tokensCost} т.</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ваш баланс</span>
                <span className={`font-bold ${walletBalance < lead.tokensCost ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {walletBalance} т.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {(state === "idle" || state === "loading") && (
        <div className="px-4 py-4 border-t border-border bg-card shrink-0 space-y-2">
          <button
            disabled={state === "loading"}
            onClick={handleReveal}
            className="w-full h-14 rounded-2xl bg-emerald-500 text-white font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {state === "loading"
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Phone size={18} /> Открыть контакт · {lead.tokensCost} т.</>}
          </button>
          <button onClick={onClose} className="w-full h-10 text-sm text-muted-foreground font-medium">Отмена</button>
        </div>
      )}
    </div>
  );
}

// ─── Order Detail Sheet ───────────────────────────────────────────────────────

function OrderDetailSheet({ order, onRespond, onReject, onClose, fomoBlock, walletBalance, tokensBalance, creditLimitTokens }: {
  order: OrderCard; onRespond: () => void; onReject: () => void; onClose: () => void;
  fomoBlock?: FomoBlock | null; walletBalance?: number; tokensBalance?: number; creditLimitTokens?: number;
}) {
  const { flags } = useFeatureFlags();
  // Token model removed: all orders are commission. Variables retained for
  // existing code paths (legacy token-orders rendered as commission UI).
  const isTokenOrder = false;
  const [state, setState] = useState<"idle" | "loading" | "success" | "constrained_success" | "fomo_blocked" | "needs_contract" | "insufficient_tokens" | "rejecting">("idle");
  const [contractFlags, setContractFlags] = useState<{ contractSigned: boolean; passportVerified: boolean }>({ contractSigned: false, passportVerified: false });
  const [constraintTags, setConstraintTags] = useState<string[]>([]);
  const [, setSheetLocation] = useLocation();
  const [showRejectSheet, setShowRejectSheet] = useState(false);
  const [showPriceNote, setShowPriceNote] = useState(false);
  const [priceNote, setPriceNote] = useState("");
  const services = parseServices(order.services);
  const isFomoBlocked = fomoBlock?.isBlocked === true;

  const fomoTypeInfo: Record<string, { title: string; body: string; icon: string; action: string }> = {
    no_estimate: {
      title: "Нужна смета",
      body: "По одному из заказов смета не отправлена уже более 48 часов.\nОтправьте смету менеджеру, чтобы снова откликаться на заявки.",
      icon: "⏱️",
      action: "Отправить смету менеджеру",
    },
    no_payment: {
      title: "Ожидается предоплата",
      body: "По одному из заказов предоплата не поступила уже более 72 часов.\nДождитесь оплаты или уточните статус у менеджера.",
      icon: "💳",
      action: "Написать менеджеру",
    },
    limit_reached: {
      title: "Достигнут лимит заказов",
      body: "У вас уже максимальное количество активных заказов.\nЗавершите хотя бы один заказ, чтобы снова откликаться.",
      icon: "📦",
      action: "Понял, закрою текущий заказ",
    },
    overdue_debt: {
      title: "Есть задолженность",
      body: "Оплатите задолженность, чтобы снова получить возможность откликаться на заявки.",
      icon: "💸",
      action: "Написать менеджеру",
    },
  };

  const handleRespond = async () => {
    setState("loading");
    try {
      const result = await api.orders.respond(order.id, priceNote.trim() || undefined);
      if (result?.insufficientTokens) {
        setState("insufficient_tokens");
      } else if (result?.needsContract) {
        setContractFlags({ contractSigned: !!result.contractSigned, passportVerified: !!result.passportVerified });
        setState("needs_contract");
      } else if (result?.constraintTags?.length) {
        setConstraintTags(result.constraintTags);
        setState("constrained_success");
      } else {
        setState("success");
      }
    } catch (e: any) {
      if (e.status === 402 || (e.message ?? "").includes("токен")) setState("insufficient_tokens");
      else { toast.error(e.message ?? "Ошибка"); setState("idle"); }
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
          <span className="font-bold">Заявка #{order.leadId ?? order.id}</span>
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
        {state === "insufficient_tokens" ? (
          <InsufficientTokensScreen
            order={order}
            walletBalance={walletBalance ?? 0}
            tokensBalance={tokensBalance ?? 0}
            creditLimitTokens={creditLimitTokens ?? 0}
            onClose={onClose}
          />
        ) : state === "fomo_blocked" && fomoBlock ? (() => {
          const info = fomoBlock.type ? fomoTypeInfo[fomoBlock.type] : null;
          return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-5">
              <div className="text-6xl">{info?.icon ?? "🔒"}</div>
              <div>
                <h2 className="text-xl font-bold mb-1">{info?.title ?? "Отклик недоступен"}</h2>
                <p className="text-sm text-muted-foreground">Отклик на заявку #{order.leadId ?? order.id} временно ограничен</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-2xl px-4 py-4 text-left w-full max-w-sm space-y-3">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                  {info?.body ?? fomoBlock.reason ?? "Выполните условия, чтобы снова откликаться на заявки."}
                </p>
                {fomoBlock.hoursElapsed && (
                  <div className="flex items-center gap-2 bg-orange-100 dark:bg-orange-900/30 rounded-xl px-3 py-2">
                    <Clock size={14} className="text-orange-500 shrink-0" />
                    <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                      Просрочено на {fomoBlock.hoursElapsed} ч
                    </span>
                  </div>
                )}
                {fomoBlock.orderId && (
                  <p className="text-xs text-muted-foreground">Заказ #{fomoBlock.orderId}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground px-2">
                Как только устраните причину — заявка #{order.leadId ?? order.id} по-прежнему будет доступна в ленте.
              </p>
              <button onClick={onClose}
                className="w-full max-w-sm h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
                {info?.action ?? "Понятно"}
              </button>
            </div>
          );
        })() : state === "needs_contract" ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FileText size={40} className="text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1">Нужно заключить договор</h2>
              <p className="text-sm text-muted-foreground">Чтобы откликнуться на заявку #{order.leadId ?? order.id}, сначала заключите договор с платформой.</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl px-4 py-4 text-left w-full max-w-sm space-y-3">
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${contractFlags.contractSigned ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-gray-200 dark:bg-gray-700"}`}>
                  {contractFlags.contractSigned
                    ? <CheckCircle2 size={14} className="text-emerald-600" />
                    : <span className="text-xs font-bold text-gray-500">1</span>}
                </span>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Подписать договор</span> и загрузить паспорт
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${contractFlags.passportVerified ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-gray-200 dark:bg-gray-700"}`}>
                  {contractFlags.passportVerified
                    ? <CheckCircle2 size={14} className="text-emerald-600" />
                    : <span className="text-xs font-bold text-gray-500">2</span>}
                </span>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">Дождаться проверки</span> документов менеджером
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground px-2">Это разовая процедура. После проверки вы сможете откликаться на любые заявки.</p>
            <button
              onClick={() => { onClose(); setSheetLocation("/pending-contract"); }}
              className="w-full max-w-sm h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
              {contractFlags.contractSigned ? "Открыть статус договора" : "Заключить договор"}
            </button>
          </div>
        ) : state === "constrained_success" ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <CheckCircle2 size={44} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Отклик принят!</h2>
              <p className="text-sm text-muted-foreground mt-1">Заявка #{order.leadId ?? order.id} — менеджер рассмотрит вашу кандидатуру.</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl px-4 py-4 text-left w-full max-w-sm space-y-3">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Обратите внимание:</p>
              {constraintTags.map(tag => {
                const info: Record<string, { icon: string; text: string }> = {
                  "Лимит": { icon: "📦", text: "У вас активный заказ — закройте его, чтобы повысить шансы на назначение." },
                  "ФОМО": { icon: "⏱️", text: "По текущему заказу не отправлена смета или не поступила предоплата. Решите этот вопрос с менеджером." },
                  "Без договора": { icon: "📋", text: "Ваш паспорт ещё не верифицирован или договор не заключён. Оформите документы в профиле." },
                  "Долг": { icon: "💳", text: "Есть просроченная задолженность по комиссии. Оплатите долг, чтобы получать приоритет при назначении." },
                  "Репутация": { icon: "📉", text: "У вас 1 отменённый заказ подряд. Мастера с лучшей статистикой завершённости получают приоритет при назначении. Завершите следующий заказ — счётчик обнулится, и приоритет вернётся." },
                  "Автоблок": { icon: "🛑", text: "У вас 2 подряд отменённых заказа — приоритет при назначении сейчас минимальный. Свяжитесь с менеджером для разблокировки: после неё счётчик обнулится, и вы снова сможете брать заказы наравне со всеми." },
                  "Ограничение": { icon: "⚠️", text: "Есть техническое ограничение. Уточните у менеджера." },
                };
                const item = info[tag];
                return item ? (
                  <div key={tag} className="flex items-start gap-2.5">
                    <span className="text-lg shrink-0">{item.icon}</span>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{item.text}</p>
                  </div>
                ) : null;
              })}
            </div>
            <p className="text-xs text-muted-foreground px-2">
              Ваш отклик зафиксирован — менеджер его видит и примет решение.
            </p>
            <button onClick={onRespond}
              className="w-full max-w-sm h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
              Понял, спасибо
            </button>
          </div>
        ) : state === "success" ? (
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

      {state !== "success" && state !== "fomo_blocked" && state !== "needs_contract" && state !== "insufficient_tokens" && (
        <div className="shrink-0 bg-card border-t border-border px-4 py-4 space-y-2">
          {isTokenOrder && order.tokensCost != null && (
            <div className="flex items-center justify-between text-sm px-0.5 mb-0.5">
              <span className="text-muted-foreground">Стоимость заявки</span>
              <span className="flex items-center gap-1 font-semibold text-amber-600">
                <Coins size={14} /> {order.tokensCost} токен(а)
              </span>
            </div>
          )}
          {isFomoBlocked ? (
            <button onClick={handleRespond}
              className="w-full h-14 rounded-2xl bg-orange-500 text-white font-bold text-base flex items-center justify-center gap-2">
              <Lock size={20} />
              Отклик заблокирован
            </button>
          ) : isTokenOrder && (order.tokensCost ?? 1) > (walletBalance ?? 0) ? (
            <>
              <button disabled
                className="w-full h-14 rounded-2xl bg-slate-200 text-slate-400 font-bold text-base flex items-center justify-center gap-2 cursor-not-allowed">
                <Coins size={20} /> Недостаточно токенов
              </button>
              <a href="/balance"
                className="block text-center text-sm text-amber-600 font-medium hover:underline">
                Пополнить баланс →
              </a>
            </>
          ) : (
            <button onClick={handleRespond} disabled={state !== "idle"}
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
              {state === "loading"
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : isTokenOrder
                  ? <Coins size={22} />
                  : <CheckCircle2 size={22} />}
              {isTokenOrder
                ? `Откликнуться (${order.tokensCost ?? 1} т.)`
                : `Откликнуться${priceNote.trim() ? " с предложением" : ""}`}
            </button>
          )}
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
        <span className="font-bold">Заявка #{order.leadId ?? order.id}</span>
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
  className = "",
}: {
  isAvailable: boolean;
  atLimit: boolean;
  onChange: (v: boolean) => void;
  className?: string;
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
      <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 ${className}`}>
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
      } ${className}`}>
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

// ─── Missed Orders Section ────────────────────────────────────────────────────

function timeAgo(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60_000);
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  return `${Math.floor(hrs / 24)} д назад`;
}

function MissedOrdersSection({ orders, city }: { orders: MissedOrder[]; city: string }) {
  const [expanded, setExpanded] = useState(false);
  if (orders.length === 0) return null;

  return (
    <section className="space-y-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-slate-400" />
          <span className="font-semibold text-sm text-slate-600 dark:text-slate-400">
            Недавно разобрали в {city}
          </span>
          <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full px-2 py-0.5 font-medium">
            {orders.length}
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground px-1">
            Эти заявки появились в вашем городе, но уже ушли другим мастерам
          </p>
          {orders.map(order => (
            <div
              key={order.id}
              className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 flex items-center gap-3 opacity-80"
            >
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                <Wrench size={14} className="text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{order.serviceType}</span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500">{order.area} м²</span>
                  {order.district && (
                    <>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500">{order.district}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-400">{timeAgo(order.takenAt)}</span>
                  {order.wasDispatched && (
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                      Вам предлагали
                    </span>
                  )}
                </div>
              </div>
              <EyeOff size={14} className="text-slate-300 dark:text-slate-600 shrink-0" />
            </div>
          ))}
          <p className="text-xs text-center text-muted-foreground/60 pt-1">
            Заходите чаще — заявки разбирают быстро
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Daily Checkin Status Chip (read-only) ────────────────────────────────────

function DailyCheckinStatus() {
  const [status, setStatus] = useState<"ready" | "not_ready" | "pending" | null>(null);

  useEffect(() => {
    fetch("/api/master-pwa/checkin/today", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setStatus(null); return; }
        if (data.respondedAt == null) setStatus("pending");
        else if (data.isAvailable === true) setStatus("ready");
        else if (data.isAvailable === false) setStatus("not_ready");
        else setStatus(null);
      })
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  const styles = {
    ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    not_ready: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };

  const labels = {
    ready: "✓ Готов сегодня",
    not_ready: "✗ Не готов сегодня",
    pending: "⚡ Нужен ответ на чекин",
  };

  return (
    <div className={`flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function MaxBindPostRegPrompt({ botUrl, onClose }: { botUrl: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl p-6 space-y-5 animate-in slide-in-from-bottom duration-300">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Bot size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold">Подключите бот в Max</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Уведомления о новых заказах будут приходить мгновенно. Без привязки бота вы будете видеть заказы только в приложении.
          </p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <span className="text-xs text-gray-700 dark:text-gray-300">Новые заявки в вашем городе</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <span className="text-xs text-gray-700 dark:text-gray-300">Назначения и сообщения от менеджера</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <span className="text-xs text-gray-700 dark:text-gray-300">Подтверждения оплат</span>
          </div>
        </div>
        <div className="space-y-2">
          <a
            href={botUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="block w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
          >
            <Bot size={18} /> Привязать бот Max
          </a>
          <button
            onClick={onClose}
            className="w-full h-10 text-sm text-muted-foreground font-medium"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { master } = useAuth();
  const [, setLocation] = useLocation();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAvail, setSelectedAvail] = useState<OrderCard | null>(null);
  const [selectedPending, setSelectedPending] = useState<PendingCard | null>(null);
  const [selectedLanding, setSelectedLanding] = useState<LandingLead | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [showSwipeHint, setShowSwipeHint] = useState(() => !localStorage.getItem(SWIPE_HINT_KEY));
  const [showMaxPrompt, setShowMaxPrompt] = useState(() => {
    try { return localStorage.getItem("showMaxBindPrompt") === "1"; } catch { return false; }
  });
  const dismissMaxPrompt = () => {
    try { localStorage.removeItem("showMaxBindPrompt"); } catch {}
    setShowMaxPrompt(false);
  };

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

  const walletBalance: number = data?.walletBalance ?? 0;

  const handleSwipeRespond = async (order: OrderCard) => {
    const fomoBlock: FomoBlock | null = data?.fomoBlock ?? null;
    if (fomoBlock?.isBlocked) {
      api.fomoBlockPress(order.id, fomoBlock.reason ?? null).catch(() => {});
      toast.error("Отклик заблокирован. Откройте заявку для деталей.", { duration: 3000 });
      setSelectedAvail(order);
      return;
    }
    try {
      const result = await api.orders.respond(order.id);
      toast.success(`Отклик на заявку #${order.leadId ?? order.id} отправлен!`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка при отправке отклика");
    }
  };

  const handleSwipeReject = async (order: OrderCard) => {
    try { await api.orders.reject(order.id); toast.success("Заявка отклонена"); load(); }
    catch (e: any) { toast.error(e.message ?? "Ошибка"); }
  };


  if (loading) {
    return (
      <div className="px-4 pt-5 pb-4 space-y-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const available: OrderCard[] = data?.availableOrders ?? [];
  const landingLeads: LandingLead[] = data?.landingLeads ?? [];
  const pending: PendingCard[] = data?.pendingOrders ?? [];
  const active: ActiveOrder[] = data?.activeOrders ?? [];
  const missed: MissedOrder[] = data?.missedOrders ?? [];
  const todayActivity: TodayActivity = data?.todayActivity ?? { total: 0, taken: 0 };
  const orderLimit: number = data?.master?.orderLimit ?? 2;
  const hasActiveOrders = active.length > 0;
  const atLimit = active.length >= orderLimit;
  const fomoBlock: FomoBlock | null = data?.fomoBlock ?? null;

  const workStatusLabels: Record<string, string> = {
    accepted: "Принят", on_way: "Еду на объект", on_site: "На объекте",
    work_done: "Работа выполнена", completed: "Завершён",
  };
  const orderStatusLabels: Record<string, string> = {
    master_assigned: "Назначен", in_progress: "В работе", cancellation_requested: "Отмена",
  };

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">

      {showMaxPrompt && !master?.maxChatId && (
        <MaxBindPostRegPrompt
          botUrl={(master as any)?.maxBotLink ?? "https://max.ru"}
          onClose={dismissMaxPrompt}
        />
      )}

      {/* Header with gradient */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 shadow-lg">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="relative p-4 space-y-3">
          {/* Row 1: Name + Test badge | Rating */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg font-bold truncate text-white">{master?.alias}</h1>
            </div>
            <div className="flex items-center gap-1 bg-white/15 backdrop-blur-md border border-white/20 px-2.5 py-1.5 rounded-xl shrink-0">
              <Star size={13} className="text-amber-300" fill="currentColor" />
              <span className="font-semibold text-sm text-white">{master?.rating?.toFixed(1)}</span>
            </div>
          </div>

          {/* Row 2: City | Tokens */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-white/80">
              <MapPin size={14} />
              <span>{master?.city}</span>
            </div>
            <button
              type="button"
              onClick={() => setLocation("/wallet")}
              className="flex items-center gap-1 bg-white/15 backdrop-blur-md border border-white/20 px-2.5 py-1.5 rounded-xl hover:bg-white/25 transition-colors shrink-0"
            >
              <Wallet size={13} className="shrink-0 text-emerald-300" />
              <span className="font-semibold text-sm leading-none text-white">
                {master && (master.debt ?? 0) > 0 ? `${(master.debt).toLocaleString("ru-RU")} ₽` : "Баланс"}
              </span>
            </button>
          </div>

          {/* Row 3: Availability toggle full width */}
          <AvailabilityToggle
            isAvailable={isAvailable}
            atLimit={atLimit}
            onChange={setIsAvailable}
            className="w-full justify-center"
          />
        </div>
      </div>


      {/* Active orders info */}
      {hasActiveOrders && (
        <div className={`flex items-center gap-3 bg-card rounded-2xl p-4 shadow-sm ${
          atLimit ? "border-l-4 border-l-warning" : "border-l-4 border-l-primary"
        }`}>
          <Briefcase size={20} className={`shrink-0 ${atLimit ? "text-warning" : "text-primary"}`} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {atLimit ? `Лимит заказов (${active.length}/${orderLimit})` : `В работе (${active.length}/${orderLimit})`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {atLimit
                ? "Закройте текущие заказы, чтобы принимать новые"
                : "Вы можете принять ещё один заказ"}
            </p>
          </div>
        </div>
      )}

      {/* Unavailable warning */}
      {!hasActiveOrders && !isAvailable && (
        <div className="flex items-center gap-3 bg-card rounded-2xl p-4 shadow-sm border-l-4 border-l-destructive">
          <PauseCircle size={20} className="text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Вы недоступны</p>
            <p className="text-xs text-muted-foreground mt-0.5">Новые заявки не поступают</p>
          </div>
        </div>
      )}


      {/* Debt warning */}
      {master && (master.debt ?? 0) > 0 && (
        <div className="flex items-center gap-3 bg-card rounded-2xl p-4 shadow-sm border-l-4 border-l-destructive">
          <AlertTriangle size={20} className="text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Задолженность</p>
            <p className="text-xs text-muted-foreground mt-0.5">{(master.debt ?? 0).toLocaleString("ru-RU")} ₽ — свяжитесь с менеджером</p>
          </div>
        </div>
      )}

      {/* FOMO block banner */}
      {fomoBlock?.isBlocked && available.length > 0 && (
        <div className="flex items-start gap-3 bg-card rounded-2xl p-4 shadow-sm border-l-4 border-l-warning">
          <Lock size={20} className="text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Отклики заблокированы</p>
            <p className="text-xs text-muted-foreground mt-0.5">{fomoBlock.reason}</p>
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
              <div className="w-full bg-card rounded-2xl overflow-hidden text-left shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] border-l-4 border-l-primary">
                <button onClick={() => setSelectedAvail(order)} className="w-full text-left">
                  {order.photos.length > 0 && (
                    <img src={resolvePhotoUrl(order.photos[0])} alt="фото" className="w-full object-cover" style={{ height: 160 }} />
                  )}
                  <div className="p-4 space-y-3">
                  {/* Top row: ID + timer */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">#{order.leadId ?? order.id}</span>
                      {order.isRepeatClient && (
                        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-pink-500">
                          <Heart size={10} fill="currentColor" /> Ваш клиент
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <DispatchTimer dispatchedAt={order.dispatchedAt} />
                      <ChevronRight size={14} className="text-muted-foreground/40" />
                    </div>
                  </div>

                  {/* Service + area */}
                  <div>
                    <h3 className="text-[17px] font-semibold leading-tight text-foreground">
                      {order.serviceType}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{order.area} м²</p>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin size={12} className="shrink-0" />
                      {order.city}{order.district ? `, ${order.district}` : ""}
                    </span>
                    {order.scheduledAt && (
                      <span className="flex items-center gap-1">
                        <Calendar size={12} className="shrink-0" />
                        {formatDate(order.scheduledAt)}
                      </span>
                    )}
                  </div>

                  {/* Service fee info */}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-slate-50 dark:bg-slate-900 rounded-lg px-2 py-1">
                    <DollarSign size={12} className="text-emerald-500" />
                    <span>Сервисный сбор: 500 ₽. Комиссия с заказа — отдельно.</span>
                  </div>

                  {/* Bottom row: competition info */}
                  </div>
                </button>
                {/* Quick action buttons */}
                <div className="flex gap-2 px-4 pb-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSwipeRespond(order); }}
                    className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-sm font-semibold transition-colors"
                  >
                    <CheckCircle2 size={16} /> Принять
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSwipeReject(order); }}
                    className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold transition-colors"
                  >
                    <XCircle size={16} /> Отклонить
                  </button>
                </div>
              </div>
            </SwipeableCard>
          ))}
        </section>
      )}

      {/* Landing leads — direct from landing page */}
      {landingLeads.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Phone size={15} className="text-amber-500" />
            <h2 className="font-semibold text-sm text-amber-700 dark:text-amber-400">Прямые заявки ({landingLeads.length})</h2>
          </div>
          {landingLeads.map(lead => (
            <SwipeableCard key={lead.id}
              onSwipeRight={() => setSelectedLanding(lead)}
              onSwipeLeft={() => setSelectedLanding(lead)}>
              <div className="w-full bg-card rounded-2xl overflow-hidden text-left shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] border-l-4 border-l-amber-500">
                <button onClick={() => setSelectedLanding(lead)} className="w-full text-left">
                  {lead.photos.length > 0 && (
                    <img src={resolvePhotoUrl(lead.photos[0])} alt="фото" className="w-full object-cover" style={{ height: 160 }} />
                  )}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Прямая #{lead.id}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true, locale: ru })}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-[17px] font-semibold leading-tight">{lead.serviceType}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{lead.area} м²</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} className="shrink-0" />
                        {lead.city}{lead.district ? `, ${lead.district}` : ""}
                      </span>
                    </div>
                    {lead.comment && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{lead.comment}</p>
                    )}
                  </div>
                </button>
                {/* Quick action button */}
                <div className="px-4 pb-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedLanding(lead); }}
                    className="w-full flex items-center justify-center gap-1.5 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-sm font-semibold transition-colors"
                  >
                    <Eye size={16} /> Открыть
                  </button>
                </div>
              </div>
            </SwipeableCard>
          ))}
        </section>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-warning" />
            <h2 className="font-semibold text-sm">Ожидаю решения ({pending.length})</h2>
          </div>
          {pending.map(order => (
            <button key={order.id} onClick={() => setSelectedPending(order)}
              className="w-full bg-card rounded-2xl overflow-hidden text-left shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] border-l-4 border-l-warning">
              {order.photos.length > 0 && (
                <img src={resolvePhotoUrl(order.photos[0])} alt="фото" className="w-full object-cover" style={{ height: 120 }} />
              )}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">#{order.leadId ?? order.id}</span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-success">
                    <CheckCircle2 size={12} /> Отклик отправлен
                  </span>
                </div>
                <h3 className="text-[15px] font-semibold text-foreground">{order.serviceType}</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="shrink-0" />
                    {order.city}{order.district ? `, ${order.district}` : ""}
                  </span>
                  <span>·</span>
                  <span>{order.area} м²</span>
                </div>
              </div>
            </button>
          ))}
        </section>
      )}

      {/* Active orders */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Briefcase size={15} className="text-emerald-500" />
          <h2 className="font-semibold text-sm text-emerald-700 dark:text-emerald-400">Активные заказы</h2>
        </div>
        {active.length === 0 ? (
          <div className="bg-card rounded-2xl p-8 text-center">
            <Briefcase size={32} className="text-emerald-500/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Нет активных заказов</p>
            <p className="text-xs text-muted-foreground mt-1">Новые заявки появятся здесь</p>
          </div>
        ) : (
          active.map(order => (
            <button key={order.id} onClick={() => setLocation(`/orders?expand=${order.id}`)}
              className="w-full bg-card rounded-2xl p-4 text-left shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] border-l-4 border-l-emerald-500">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">#{order.leadId ?? order.id}</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  {order.masterWorkStatus
                    ? workStatusLabels[order.masterWorkStatus] ?? order.masterWorkStatus
                    : orderStatusLabels[order.status] ?? order.status}
                </span>
              </div>
              <h3 className="text-[15px] font-semibold text-foreground">{order.serviceType}</h3>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{order.city}{order.district ? `, ${order.district}` : ""}</span>
                <span>·</span>
                <span>{order.area} м²</span>
              </div>
            </button>
          ))
        )}
      </section>

      {/* Missed orders FOMO feed */}
      <MissedOrdersSection orders={missed} city={master?.city ?? ""} />

      {/* Full-screen sheets */}
      {selectedAvail && (
        <OrderDetailSheet
          order={selectedAvail}
          onRespond={() => { setSelectedAvail(null); load(); }}
          onReject={() => { setSelectedAvail(null); load(); }}
          onClose={() => setSelectedAvail(null)}
          fomoBlock={fomoBlock}
          walletBalance={walletBalance}
          tokensBalance={data?.tokensBalance ?? 0}
          creditLimitTokens={data?.creditLimitTokens ?? 0}
        />
      )}
      {selectedPending && (
        <RespondedSheet order={selectedPending} onClose={() => setSelectedPending(null)} />
      )}
      {selectedLanding && (
        <LandingLeadSheet
          lead={selectedLanding}
          walletBalance={walletBalance}
          onClose={() => setSelectedLanding(null)}
          onSuccess={() => { setSelectedLanding(null); load(); }}
        />
      )}
    </div>
  );
}
