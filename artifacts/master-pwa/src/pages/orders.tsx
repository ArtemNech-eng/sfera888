import { useEffect, useRef, useState } from "react";
import { api, uploadPhoto, resolvePhotoUrl } from "@/lib/api";
import { toast } from "sonner";
import {
  ChevronDown, ChevronUp, MapPin, Phone, Ruler, Calendar,
  Camera, CheckCircle2, Image, FileText, Loader2, X, XCircle,
  ReceiptText, Copy, Check, Plus, Trash2,
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

const CANCEL_OPTIONS = [
  { id: "client_refused",     label: "Клиент отказался" },
  { id: "price_disagreement", label: "Не договорились по цене" },
  { id: "master_cant",        label: "Не могу выполнить" },
  { id: "other",              label: "Другая причина" },
] as const;

function CancelModal({
  orderId,
  onDone,
  onClose,
}: {
  orderId: number;
  onDone: () => void;
  onClose: () => void;
}) {
  const [cancelType, setCancelType] = useState<string>("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [commentError, setCommentError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const MIN_COMMENT = 150;
  const commentLen = comment.trim().length;
  const commentOk = commentLen >= MIN_COMMENT;

  const handleSubmit = async () => {
    if (!cancelType) return;
    if (!commentOk) {
      setCommentError(true);
      textareaRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      await api.orders.cancel(orderId, cancelType, comment.trim());
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
          Выберите причину — менеджер примет решение.
        </p>
        <div className="space-y-2">
          {CANCEL_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setCancelType(opt.id)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                cancelType === opt.id
                  ? "border-destructive bg-destructive/5"
                  : "border-border bg-background"
              }`}
            >
              <div className="text-sm font-semibold text-foreground">{opt.label}</div>
            </button>
          ))}
        </div>
        {cancelType && (
          <div className="space-y-1">
            <textarea
              ref={textareaRef}
              value={comment}
              onChange={e => { setComment(e.target.value); if (commentError) setCommentError(false); }}
              placeholder="Что произошло? О чём говорили с клиентом? Почему не получается выполнить?"
              rows={4}
              className={`w-full px-4 py-3 rounded-xl border-2 bg-background text-foreground text-sm focus:outline-none resize-none transition-colors ${
                commentError
                  ? "border-destructive focus:border-destructive"
                  : "border-input focus:border-ring"
              }`}
              autoFocus
            />
            {commentError ? (
              <p className="text-xs font-medium text-destructive">
                Напишите причину отказа (ещё {MIN_COMMENT - commentLen} симв.)
              </p>
            ) : commentOk ? (
              <p className="text-right text-xs font-medium text-emerald-500">✓ Достаточно</p>
            ) : (
              <p className="text-right text-xs text-muted-foreground">ещё {MIN_COMMENT - commentLen} симв.</p>
            )}
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-border text-muted-foreground text-sm font-medium active:opacity-80"
          >
            Назад
          </button>
          <button
            type="button"
            disabled={!cancelType || loading}
            onClick={handleSubmit}
            className="flex-1 h-11 bg-destructive text-white font-semibold rounded-xl active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
          >
            {loading
              ? <Loader2 size={16} className="animate-spin" />
              : <XCircle size={16} />}
            Отправить
          </button>
        </div>
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

interface LineItem { description: string; price: string; }

interface ExistingReceipt {
  id: number;
  token: string;
  lineItems: Array<{ description: string; price: number }>;
  totalAmount: number;
  prepaymentAmount: number;
  notes: string | null;
  publicUrl: string;
  createdAt: string;
  clientSubmittedName: string | null;
  prepaymentSubmittedAt: string | null;
  prepaymentScreenshotUrl: string | null;
}

function ReceiptModal({
  order,
  existingReceipt,
  onSaved,
  onClose,
}: {
  order: Order;
  existingReceipt?: ExistingReceipt | null;
  onSaved: (receipt: ExistingReceipt) => void;
  onClose: () => void;
}) {
  const isEdit = !!existingReceipt;
  const [lineItems, setLineItems] = useState<LineItem[]>(
    isEdit
      ? existingReceipt!.lineItems.map(i => ({ description: i.description, price: String(i.price) }))
      : [{ description: "", price: "" }]
  );
  const [prepayment, setPrepayment] = useState(isEdit ? String(existingReceipt!.prepaymentAmount) : "5000");
  const [notes, setNotes] = useState(isEdit ? (existingReceipt!.notes ?? "") : "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExistingReceipt | null>(null);
  const [copied, setCopied] = useState(false);

  const addItem = () => setLineItems(prev => [...prev, { description: "", price: "" }]);
  const removeItem = (i: number) => setLineItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, val: string) =>
    setLineItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const totalCalc = lineItems.reduce((s, it) => s + (parseFloat(it.price.replace(",", ".")) || 0), 0);

  const handleSubmit = async () => {
    const valid = lineItems.filter(it => it.description.trim() && parseFloat(it.price.replace(",", ".")) > 0);
    if (valid.length === 0) { toast.error("Добавьте хотя бы одну позицию с ценой"); return; }
    const prepayNum = parseFloat(prepayment.replace(",", "."));
    if (!prepayNum || prepayNum <= 0) { toast.error("Введите сумму предоплаты"); return; }
    setLoading(true);
    try {
      const body = {
        orderId: order.id,
        lineItems: valid.map(it => ({ description: it.description.trim(), price: parseFloat(it.price.replace(",", ".")) })),
        prepaymentAmount: prepayNum,
        notes: notes.trim() || undefined,
      };
      const url = isEdit
        ? `${import.meta.env.BASE_URL}api/receipts/${existingReceipt!.id}`
        : `${import.meta.env.BASE_URL}api/receipts`;
      const method = isEdit ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Ошибка"); }
      const saved = await r.json();
      setResult(saved);
      onSaved(saved);
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Ссылка скопирована!");
    });
  };

  const displayUrl = result?.publicUrl ?? existingReceipt?.publicUrl;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-card rounded-t-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 pt-5 pb-3 flex-shrink-0">
          <h3 className="font-bold text-base flex items-center gap-2">
            <ReceiptText size={18} className="text-primary" />
            {isEdit ? "Изменить расписку" : `Расписка — заказ #${order.id}`}
          </h3>
          <button onClick={onClose} className="text-muted-foreground"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-4">
          {result ? (
            <>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center space-y-1">
                <CheckCircle2 size={32} className="mx-auto text-green-500" />
                <p className="font-semibold text-green-700 dark:text-green-400">
                  {isEdit ? "Расписка обновлена!" : "Расписка создана!"}
                </p>
                <p className="text-sm text-muted-foreground">Отправьте ссылку клиенту</p>
              </div>
              <div className="bg-muted rounded-xl p-3 text-xs break-all font-mono text-muted-foreground">
                {result.publicUrl}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Перечень работ</p>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs text-primary font-medium">
                    <Plus size={14} /> Добавить
                  </button>
                </div>
                <div className="space-y-2">
                  {lineItems.map((item, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <input
                          value={item.description}
                          onChange={e => updateItem(i, "description", e.target.value)}
                          placeholder="Описание работы"
                          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div className="w-24 flex-shrink-0">
                        <input
                          type="number"
                          value={item.price}
                          onChange={e => updateItem(i, "price", e.target.value)}
                          placeholder="₽"
                          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                          min="0"
                        />
                      </div>
                      {lineItems.length > 1 && (
                        <button onClick={() => removeItem(i)} className="mt-1 text-muted-foreground hover:text-destructive">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {totalCalc > 0 && (
                  <div className="flex justify-between items-center bg-muted/50 rounded-lg px-3 py-2 mt-1">
                    <span className="text-xs text-muted-foreground">Итого по смете</span>
                    <span className="text-sm font-bold">{totalCalc.toLocaleString("ru-RU")} ₽</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Сумма предоплаты (₽)</label>
                <input
                  type="number"
                  value={prepayment}
                  onChange={e => setPrepayment(e.target.value)}
                  className="w-full h-11 rounded-xl border-2 border-primary/40 bg-background px-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="5000"
                  min="1"
                />
                <p className="text-xs text-muted-foreground">Сумма, которую клиент уже оплатил</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Примечание</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Необязательно"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-5 pt-3 pb-8 flex-shrink-0 space-y-2 border-t border-border">
          {result ? (
            <>
              <button
                onClick={() => handleCopy(result.publicUrl)}
                className="w-full h-12 bg-primary text-white font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Скопировано!" : "Скопировать ссылку"}
              </button>
              {typeof navigator.share === "function" && (
                <button
                  onClick={() => navigator.share({ title: "Расписка об оплате", url: result.publicUrl })}
                  className="w-full h-10 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 text-muted-foreground"
                >
                  Поделиться
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full h-12 bg-primary text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                {isEdit ? "Сохранить изменения" : "Создать расписку"}
              </button>
              {isEdit && displayUrl && (
                <button
                  onClick={() => handleCopy(displayUrl)}
                  className="w-full h-10 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 text-muted-foreground"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Скопировано!" : "Скопировать текущую ссылку"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, onRefresh, initialExpanded }: { order: Order; onRefresh: () => void; initialExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [orderReceipts, setOrderReceipts] = useState<ExistingReceipt[]>([]);
  const [editingReceipt, setEditingReceipt] = useState<ExistingReceipt | null>(null);
  const [showNewReceipt, setShowNewReceipt] = useState(false);
  const isActive = ["master_assigned", "in_progress"].includes(order.status);
  const isCancelRequested = order.status === "cancellation_requested";
  const currentStepIdx = workStatusSteps.findIndex(s => s.key === order.masterWorkStatus);

  const fetchReceipts = async (showNotification = false) => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/receipts/my/${order.id}`, { credentials: "include" });
      if (!r.ok) return;
      const fresh: ExistingReceipt[] = await r.json();
      if (showNotification) {
        setOrderReceipts(prev => {
          fresh.forEach(fr => {
            const old = prev.find(p => p.id === fr.id);
            if (!old?.prepaymentSubmittedAt && fr.prepaymentSubmittedAt) {
              toast.success("🎉 Клиент подтвердил предоплату по расписке!");
            }
          });
          return fresh;
        });
      } else {
        setOrderReceipts(fresh);
      }
    } catch {}
  };

  useEffect(() => {
    if (expanded && isActive) {
      fetchReceipts();
      const interval = setInterval(() => fetchReceipts(true), 30_000);
      return () => clearInterval(interval);
    }
  }, [expanded, isActive]);

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
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Прогресс выполнения</p>
                  <div className="bg-muted/50 rounded-xl p-3">
                    <div className="flex items-start gap-0">
                      {workStatusSteps.map((step, idx) => {
                        const done = idx <= currentStepIdx;
                        const isLast = idx === workStatusSteps.length - 1;
                        return (
                          <div key={step.key} className="flex-1 flex flex-col items-center">
                            <div className="flex items-center w-full">
                              <div className={`flex-1 h-0.5 ${idx === 0 ? "invisible" : done ? "bg-green-500" : "bg-border"}`} />
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2 ${
                                done
                                  ? "bg-green-500 border-green-500 text-white"
                                  : "bg-background border-border text-muted-foreground"
                              }`}>
                                {done ? <CheckCircle2 size={14} /> : idx + 1}
                              </div>
                              <div className={`flex-1 h-0.5 ${isLast ? "invisible" : done && idx < currentStepIdx ? "bg-green-500" : "bg-border"}`} />
                            </div>
                            <span className={`text-[10px] mt-1 text-center leading-tight px-0.5 ${
                              done ? "text-green-600 dark:text-green-400 font-medium" : "text-muted-foreground"
                            }`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {currentStepIdx < workStatusSteps.length - 1 && (
                    <button
                      disabled={!!loadingStatus}
                      onClick={() => handleStatusStep(workStatusSteps[currentStepIdx + 1].key)}
                      className="w-full h-11 bg-primary text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-60 text-sm"
                    >
                      {loadingStatus ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      {workStatusSteps[currentStepIdx + 1].label}
                    </button>
                  )}
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

                <div className="space-y-2">
                  {orderReceipts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <ReceiptText size={12} /> Расписки
                      </p>
                      {orderReceipts.map(r => (
                        <div key={r.id} className="bg-muted/40 rounded-xl px-3 py-2.5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">{Number(r.totalAmount).toLocaleString("ru-RU")} ₽</p>
                              <p className="text-xs text-muted-foreground">Предоплата: {Number(r.prepaymentAmount).toLocaleString("ru-RU")} ₽</p>
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => { navigator.clipboard.writeText(r.publicUrl); toast.success("Ссылка скопирована!"); }}
                                className="h-8 px-2.5 rounded-lg border border-border bg-background text-xs font-medium flex items-center gap-1"
                              >
                                <Copy size={12} /> Ссылка
                              </button>
                              <button
                                onClick={() => setEditingReceipt(r)}
                                className="h-8 px-2.5 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-medium flex items-center gap-1"
                              >
                                Изменить
                              </button>
                            </div>
                          </div>
                          {r.prepaymentSubmittedAt ? (
                            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 rounded-lg px-2.5 py-1.5">
                              <CheckCircle2 size={13} className="text-green-600 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-green-700 dark:text-green-400">Бронь подтверждена клиентом</p>
                                {r.clientSubmittedName && <p className="text-xs text-green-600">👤 {r.clientSubmittedName}</p>}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                              Ожидание подтверждения от клиента
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setShowNewReceipt(true)}
                    className="w-full h-10 rounded-xl border border-border bg-muted/30 text-foreground text-sm font-medium flex items-center justify-center gap-2 active:opacity-80"
                  >
                    <ReceiptText size={15} />
                    {orderReceipts.length > 0 ? "Создать ещё расписку" : "Создать расписку клиенту"}
                  </button>
                </div>

                <div className="space-y-1">
                  <button
                    onClick={() => setShowCancel(true)}
                    className="w-full h-10 rounded-xl border border-destructive/50 text-destructive text-sm font-medium flex items-center justify-center gap-2 active:opacity-80"
                  >
                    <XCircle size={16} />
                    Запросить отмену
                  </button>
                  <p className="text-center text-[11px] text-muted-foreground">
                    Потребуется выбрать причину и написать подробный комментарий
                  </p>
                </div>
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
      {(showNewReceipt || editingReceipt) && (
        <ReceiptModal
          order={order}
          existingReceipt={editingReceipt ?? undefined}
          onSaved={saved => {
            setOrderReceipts(prev => {
              const idx = prev.findIndex(r => r.id === saved.id);
              if (idx >= 0) { const n = [...prev]; n[idx] = saved; return n; }
              return [...prev, saved];
            });
          }}
          onClose={() => { setShowNewReceipt(false); setEditingReceipt(null); }}
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

  const expandId = (() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const v = p.get("expand");
      return v ? parseInt(v) : null;
    } catch { return null; }
  })();

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
            <OrderCard key={order.id} order={order} onRefresh={load} initialExpanded={expandId === order.id} />
          ))}
        </div>
      )}
    </div>
  );
}
