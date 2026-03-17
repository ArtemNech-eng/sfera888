import { useEffect, useRef, useState } from "react";
import { api, uploadPhoto, resolvePhotoUrl } from "@/lib/api";
import { toast } from "sonner";
import {
  ChevronDown, ChevronUp, MapPin, Phone, Ruler, Calendar,
  Camera, CheckCircle2, Image, FileText, Loader2, X, XCircle,
} from "lucide-react";

interface Order {
  id: number;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  scheduledAt: string | null;
  comment: string | null;
  status: string;
  masterWorkStatus: string | null;
  proposedAmount: number | null;
  orderAmount: number | null;
  commission: number | null;
  photosBefore: string[];
  photosAfter: string[];
  photoAct: string | null;
  clientName: string | null;
  clientPhone: string | null;
  createdAt: string;
  cancelReason?: string | null;
}

const workStatusSteps = [
  { key: "accepted", label: "Принят" },
  { key: "on_way", label: "Еду на объект" },
  { key: "on_site", label: "На объекте" },
  { key: "work_done", label: "Работа выполнена" },
];

const statusLabel: Record<string, string> = {
  master_assigned: "Назначен",
  in_progress: "В работе",
  cancellation_requested: "Отмена запрошена",
  completed: "Завершён",
  cancelled: "Отменён",
};

function UploadButton({
  label,
  icon: Icon,
  onUpload,
  loading,
}: {
  label: string;
  icon: React.ElementType;
  onUpload: (f: File) => void;
  loading: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => ref.current?.click()}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-primary/50 text-primary text-sm font-medium active:opacity-80 disabled:opacity-50 bg-primary/5"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
        {label}
      </button>
    </>
  );
}

function CompleteModal({
  orderId,
  onDone,
  onClose,
}: {
  orderId: number;
  onDone: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount.replace(/\s/g, ""));
    if (!n || n <= 0) {
      toast.error("Введите корректную сумму");
      return;
    }
    setLoading(true);
    try {
      await api.orders.complete(orderId, n);
      toast.success("Заказ завершён! Менеджер подтвердит сумму.");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg">Завершить заказ</h3>
          <button onClick={onClose} className="text-muted-foreground"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Сумма заказа (₽)</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full h-12 px-4 rounded-xl border border-input bg-background text-foreground text-xl font-bold focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Менеджер подтвердит и рассчитает комиссию</p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-green-600 text-white font-semibold rounded-xl active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <Loader2 size={18} className="animate-spin" />
              : <CheckCircle2 size={18} />}
            Подтвердить
          </button>
        </form>
      </div>
    </div>
  );
}

function CancelModal({
  orderId,
  onDone,
  onClose,
}: {
  orderId: number;
  onDone: () => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { toast.error("Укажите причину отмены"); return; }
    setLoading(true);
    try {
      await api.orders.cancel(orderId, reason.trim());
      toast.success("Запрос на отмену отправлен менеджеру");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg text-destructive">Отмена заказа #{orderId}</h3>
          <button onClick={onClose} className="text-muted-foreground"><X size={20} /></button>
        </div>
        <p className="text-sm text-muted-foreground">
          Укажите причину — менеджер рассмотрит запрос и подтвердит отмену.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Причина отмены..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            autoFocus
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-border text-muted-foreground text-sm font-medium active:opacity-80"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="flex-1 h-11 bg-destructive text-white font-semibold rounded-xl active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {loading
                ? <Loader2 size={16} className="animate-spin" />
                : <XCircle size={16} />}
              Отправить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PhotoGrid({ urls, label }: { urls: string[]; label: string }) {
  if (urls.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {urls.map((url, i) => {
          const src = resolvePhotoUrl(url);
          return (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img
                src={src}
                alt={`${label} ${i + 1}`}
                className="w-16 h-16 rounded-lg object-cover border border-border"
                onError={e => (e.currentTarget.style.display = "none")}
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function OrderCard({ order, onRefresh }: { order: Order; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const isActive = ["master_assigned", "in_progress"].includes(order.status);
  const isCancelRequested = order.status === "cancellation_requested";
  const currentStepIdx = workStatusSteps.findIndex(s => s.key === order.masterWorkStatus);

  const handleStatusStep = async (key: string) => {
    setLoadingStatus(key);
    try {
      await api.orders.updateStatus(order.id, key);
      toast.success("Статус обновлён");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
    } finally {
      setLoadingStatus(null);
    }
  };

  const handlePhoto = async (file: File, type: string) => {
    setLoadingPhoto(type);
    try {
      const url = await uploadPhoto(file);
      await api.orders.addPhoto(order.id, type, url);
      toast.success("Фото загружено");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка загрузки фото");
    } finally {
      setLoadingPhoto(null);
    }
  };

  return (
    <>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          className="w-full p-3.5 text-left flex items-center justify-between gap-2 active:opacity-80"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="space-y-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">
                {order.city}{order.district ? `, ${order.district}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">#{order.id}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                order.status === "completed"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : order.status === "cancelled"
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-500"
                  : isCancelRequested
                  ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                  : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
              }`}>
                {statusLabel[order.status] ?? order.status}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Ruler size={12} />
              <span>{order.serviceType} · {order.area} м²</span>
              {order.masterWorkStatus && !isCancelRequested && (
                <>
                  <span>·</span>
                  <span className="font-medium text-foreground">
                    {workStatusSteps.find(s => s.key === order.masterWorkStatus)?.label ?? order.masterWorkStatus}
                  </span>
                </>
              )}
            </div>
          </div>
          {expanded ? <ChevronUp size={18} className="text-muted-foreground shrink-0" />
            : <ChevronDown size={18} className="text-muted-foreground shrink-0" />}
        </button>

        {expanded && (
          <div className="border-t border-border p-3.5 space-y-4">
            <div className="space-y-1.5 text-sm">
              {order.clientName && (
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-muted-foreground shrink-0" />
                  <span>{order.clientName}</span>
                </div>
              )}
              {order.clientPhone && (
                <a href={`tel:${order.clientPhone}`} className="flex items-center gap-2 text-primary">
                  <Phone size={14} className="shrink-0" />
                  <span>{order.clientPhone}</span>
                </a>
              )}
              {order.scheduledAt && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar size={14} className="shrink-0" />
                  <span>{new Date(order.scheduledAt).toLocaleString("ru-RU", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}</span>
                </div>
              )}
              {order.comment && (
                <p className="text-muted-foreground italic text-xs bg-muted rounded-lg p-2">{order.comment}</p>
              )}
            </div>

            {isCancelRequested && order.cancelReason && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-0.5">Причина отмены</p>
                <p className="text-amber-600 dark:text-amber-500 text-xs">{order.cancelReason}</p>
              </div>
            )}

            {(order.orderAmount || order.commission || order.proposedAmount) && (
              <div className="bg-muted rounded-xl p-3 space-y-1 text-sm">
                {order.orderAmount ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Сумма заказа</span>
                      <span className="font-semibold">{order.orderAmount.toLocaleString("ru-RU")} ₽</span>
                    </div>
                    {order.commission !== null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Комиссия</span>
                        <span className="font-semibold text-destructive">{order.commission.toLocaleString("ru-RU")} ₽</span>
                      </div>
                    )}
                  </>
                ) : order.proposedAmount ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Предложено</span>
                    <span className="font-semibold">{order.proposedAmount.toLocaleString("ru-RU")} ₽</span>
                  </div>
                ) : null}
              </div>
            )}

            <PhotoGrid urls={order.photosBefore ?? []} label="Фото ДО" />
            <PhotoGrid urls={order.photosAfter ?? []} label="Фото ПОСЛЕ" />
            {order.photoAct && (
              <PhotoGrid urls={[order.photoAct]} label="Акт" />
            )}

            {isActive && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Обновить статус</p>
                  <div className="flex flex-col gap-1.5">
                    {workStatusSteps.map((step, idx) => {
                      const done = idx <= currentStepIdx;
                      const isNext = idx === currentStepIdx + 1;
                      return (
                        <button
                          key={step.key}
                          disabled={!isNext || !!loadingStatus}
                          onClick={() => isNext && handleStatusStep(step.key)}
                          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                            done
                              ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                              : isNext
                              ? "bg-primary text-white active:opacity-80"
                              : "bg-muted text-muted-foreground opacity-50"
                          } disabled:cursor-not-allowed`}
                        >
                          {loadingStatus === step.key
                            ? <Loader2 size={14} className="animate-spin shrink-0" />
                            : done
                            ? <CheckCircle2 size={14} className="shrink-0" />
                            : <div className="w-3.5 h-3.5 rounded-full border-2 border-current shrink-0" />}
                          {step.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Фотоотчёт</p>
                  <div className="flex flex-wrap gap-2">
                    <UploadButton
                      label="ДО"
                      icon={Camera}
                      loading={loadingPhoto === "before"}
                      onUpload={f => handlePhoto(f, "before")}
                    />
                    <UploadButton
                      label="ПОСЛЕ"
                      icon={Image}
                      loading={loadingPhoto === "after"}
                      onUpload={f => handlePhoto(f, "after")}
                    />
                    <UploadButton
                      label="Акт"
                      icon={FileText}
                      loading={loadingPhoto === "act"}
                      onUpload={f => handlePhoto(f, "act")}
                    />
                  </div>
                </div>

                {order.masterWorkStatus === "work_done" && (
                  <button
                    onClick={() => setShowComplete(true)}
                    className="w-full h-12 bg-green-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:opacity-80"
                  >
                    <CheckCircle2 size={18} />
                    Завершить заказ
                  </button>
                )}

                <button
                  onClick={() => setShowCancel(true)}
                  className="w-full h-10 rounded-xl border border-destructive/50 text-destructive text-sm font-medium flex items-center justify-center gap-2 active:opacity-80"
                >
                  <XCircle size={16} />
                  Запросить отмену
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showComplete && (
        <CompleteModal
          orderId={order.id}
          onDone={() => { setShowComplete(false); onRefresh(); }}
          onClose={() => setShowComplete(false)}
        />
      )}
      {showCancel && (
        <CancelModal
          orderId={order.id}
          onDone={() => { setShowCancel(false); onRefresh(); }}
          onClose={() => setShowCancel(false)}
        />
      )}
    </>
  );
}

// ─── Dispatch History ─────────────────────────────────────────────────────────

interface DispatchRecord {
  dispatchId: number;
  orderId: number;
  status: string;
  respondedAt: string | null;
  dispatchedAt: string | null;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  orderStatus: string;
}

const dispatchStatusConfig: Record<string, { label: string; color: string }> = {
  responded: { label: "Ожидает назначения", color: "text-amber-600 dark:text-amber-400" },
  assigned: { label: "Вас выбрали", color: "text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Не выбрали", color: "text-muted-foreground" },
  rejected_by_master: { label: "Вы отказали", color: "text-red-500" },
};

const orderStatusConfig: Record<string, string> = {
  completed: "Завершён",
  cancelled: "Отменён",
  waiting_master: "Ожидает мастера",
  master_assigned: "Назначен",
  in_progress: "В работе",
};

function DispatchHistoryList() {
  const [history, setHistory] = useState<DispatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dispatchHistory()
      .then(setHistory)
      .catch(() => toast.error("Ошибка загрузки истории"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        История откликов пуста
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {history.map(d => {
        const statusCfg = dispatchStatusConfig[d.status] ?? { label: d.status, color: "text-muted-foreground" };
        const finalStatus = orderStatusConfig[d.orderStatus] ?? d.orderStatus;
        return (
          <div key={d.dispatchId} className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Заявка #{d.orderId}</span>
              <span className={`text-xs font-semibold ${statusCfg.color}`}>{statusCfg.label}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-foreground">
              <span>{d.serviceType}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{d.area} м²</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin size={11} className="shrink-0" />
              {d.city}{d.district ? `, ${d.district}` : ""}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
              <span>Итог: {finalStatus}</span>
              {d.dispatchedAt && (
                <span>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(d.dispatchedAt))}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"active" | "completed" | "history">("active");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (filter === "history") return;
    setLoading(true);
    try {
      const data = await api.orders.my(filter);
      setOrders(data);
    } catch {
      toast.error("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <h1 className="text-xl font-bold">Мои заказы</h1>

      <div className="flex rounded-xl bg-muted p-1 gap-1">
        {(["active", "completed", "history"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              filter === f ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            }`}
          >
            {f === "active" ? "Активные" : f === "completed" ? "Завершённые" : "История"}
          </button>
        ))}
      </div>

      {filter === "history" ? (
        <DispatchHistoryList />
      ) : loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {filter === "active" ? "Нет активных заказов" : "Нет завершённых заказов"}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <OrderCard key={order.id} order={order} onRefresh={load} />
          ))}
        </div>
      )}
    </div>
  );
}
