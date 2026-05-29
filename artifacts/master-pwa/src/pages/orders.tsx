import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, uploadPhoto, resolvePhotoUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronDown, ChevronUp, MapPin, Phone, Ruler, Calendar,
  Camera, CheckCircle2, Image, FileText, Loader2, X, XCircle,
  ReceiptText, Copy, Check, Plus, Trash2, Printer, Coins, RotateCcw,
  ClipboardList, AlertTriangle,
} from "lucide-react";

function printEstimate(
  r: {
    id: number;
    createdAt: string;
    lineItems: { description: string; unit?: string; quantity?: number; price: number }[];
    totalAmount: number;
    prepaymentAmount: number;
    notes: string | null;
    clientName?: string | null;
    clientPhone?: string | null;
  },
  order: { city?: string; district?: string | null; serviceType?: string; area?: number },
  masterName: string,
  masterPhone: string | null,
) {
  const date = new Date(r.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const fmt = (n: number) => Number(n).toLocaleString("ru-RU");
  const rows = (r.lineItems ?? []).map((item, i) => {
    const qty = item.quantity ?? 1;
    return `<tr>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${i + 1}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;">${item.description}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:center;">${item.unit ?? "—"}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;">${qty}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;">${fmt(item.price)}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-weight:600;">${fmt(qty * item.price)}</td>
    </tr>`;
  }).join("");

  const orderInfo = `${order.serviceType ?? ""}${order.city ? `, ${order.city}` : ""}${order.district ? ` (${order.district})` : ""}${order.area ? `, ${order.area} м²` : ""}`;

  const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"/>
<title>Смета №${r.id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#000;background:#fff;padding:32px}
  h1{font-size:20px;font-weight:bold;text-align:center;margin-bottom:4px}
  .sub{text-align:center;font-size:12px;color:#444;margin-bottom:24px}
  table.meta td{padding:3px 0;font-size:13px}
  table.meta td:first-child{color:#555;width:180px}
  table.items{width:100%;border-collapse:collapse;margin-top:16px}
  table.items th{padding:7px 8px;border:1px solid #ccc;background:#f0f0f0;font-size:12px;text-align:left}
  .summary{margin-top:16px;text-align:right}
  .summary p{font-size:14px;margin-bottom:4px}
  .summary p.main{font-size:16px;font-weight:bold}
  .notes{margin-top:16px;padding:10px 12px;border:1px solid #ccc;border-radius:4px;font-size:12px;color:#333}
  .sig{margin-top:40px;display:flex;justify-content:space-between;font-size:12px;color:#333}
  .sig div{flex:1;padding-right:24px}
  .sig-line{margin-top:24px;border-top:1px solid #000}
  @media print{body{padding:16px}}
</style></head><body>
<h1>СМЕТА №${r.id}</h1>
<div class="sub">Честный мастер · sfera-master.ru</div>
<hr style="border:none;border-top:1px solid #ccc;margin-bottom:20px"/>
<table class="meta" style="width:100%;margin-bottom:8px">
  <tr><td>Дата составления:</td><td><strong>${date}</strong></td></tr>
  ${r.clientName ? `<tr><td>Клиент:</td><td><strong>${r.clientName}</strong></td></tr>` : ""}
  ${r.clientPhone ? `<tr><td>Телефон клиента:</td><td>${r.clientPhone}</td></tr>` : ""}
  ${orderInfo ? `<tr><td>Объект / услуга:</td><td>${orderInfo}</td></tr>` : ""}
  <tr><td>Исполнитель:</td><td><strong>${masterName}</strong>${masterPhone ? ` · ${masterPhone}` : ""}</td></tr>
</table>
<table class="items">
  <thead><tr>
    <th style="width:36px;text-align:center">№</th>
    <th>Наименование работ / материалов</th>
    <th style="width:70px;text-align:center">Ед.</th>
    <th style="width:60px;text-align:right">Кол-во</th>
    <th style="width:90px;text-align:right">Цена, ₽</th>
    <th style="width:100px;text-align:right">Сумма, ₽</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="summary">
  <p>Итого: <strong>${fmt(r.totalAmount)} ₽</strong></p>
  <p class="main">Предоплата (бронирование): <strong>${fmt(r.prepaymentAmount)} ₽</strong></p>
</div>
${r.notes ? `<div class="notes"><strong>Примечания:</strong> ${r.notes}</div>` : ""}
<div class="sig">
  <div>
    <p>Исполнитель: <strong>${masterName}</strong></p>
    <div class="sig-line"></div>
    <p style="margin-top:4px">подпись / дата</p>
  </div>
  <div>
    <p>Заказчик: ${r.clientName ? `<strong>${r.clientName}</strong>` : "______________________________"}</p>
    <div class="sig-line"></div>
    <p style="margin-top:4px">подпись / дата</p>
  </div>
</div>
<script>window.onload=function(){window.print()};<\/script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

interface Order {
  id: number;
  leadId: number | null;
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
  paymentModel?: string;
  tokensCharged?: number | null;
  assignedAt?: string | null;
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
  refund_requested: "Возврат токена",
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
  displayId,
  onDone,
  onClose,
}: {
  orderId: number;
  displayId?: number;
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

  return createPortal(
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
    </div>,
    document.body
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
  displayId,
  onDone,
  onClose,
}: {
  orderId: number;
  displayId?: number;
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

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card rounded-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg text-destructive">Отмена заказа #{displayId ?? orderId}</h3>
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
    </div>,
    document.body
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

const UNITS = ["", "шт", "м²", "м³", "м.п.", "м", "кг", "т", "л", "упак.", "компл.", "ч"];

interface LineItem { description: string; unit: string; quantity: string; price: string; }

interface ExistingReceipt {
  id: number;
  token: string;
  lineItems: Array<{ description: string; unit?: string; quantity?: number; price: number }>;
  totalAmount: number;
  prepaymentAmount: number;
  notes: string | null;
  publicUrl: string;
  createdAt: string;
  clientName: string | null;
  clientPhone: string | null;
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
  const { master } = useAuth();
  const isEdit = !!existingReceipt;
  const [lineItems, setLineItems] = useState<LineItem[]>(
    isEdit
      ? existingReceipt!.lineItems.map(i => ({ description: i.description, unit: i.unit ?? "", quantity: String(i.quantity ?? 1), price: String(i.price) }))
      : [{ description: "", unit: "", quantity: "1", price: "" }]
  );
  const [prepayment, setPrepayment] = useState(isEdit ? String(existingReceipt!.prepaymentAmount) : "5000");
  const [notes, setNotes] = useState(isEdit ? (existingReceipt!.notes ?? "") : "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExistingReceipt | null>(null);
  const [copied, setCopied] = useState(false);

  const addItem = () => setLineItems(prev => [...prev, { description: "", unit: "", quantity: "1", price: "" }]);
  const removeItem = (i: number) => setLineItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, val: string) =>
    setLineItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const lineTotal = (it: LineItem) => (parseFloat(it.quantity) || 1) * (parseFloat(it.price.replace(",", ".")) || 0);
  const totalCalc = lineItems.reduce((s, it) => s + lineTotal(it), 0);

  const handleSubmit = async () => {
    const valid = lineItems.filter(it => it.description.trim() && parseFloat(it.price.replace(",", ".")) > 0);
    if (valid.length === 0) { toast.error("Добавьте хотя бы одну позицию с ценой"); return; }
    const prepayNum = parseFloat(prepayment.replace(",", "."));
    if (!prepayNum || prepayNum <= 0) { toast.error("Введите сумму предоплаты"); return; }
    setLoading(true);
    try {
      const body = {
        orderId: order.id,
        lineItems: valid.map(it => ({
          description: it.description.trim(),
          unit: it.unit || undefined,
          quantity: parseFloat(it.quantity) > 0 ? parseFloat(it.quantity) : undefined,
          price: parseFloat(it.price.replace(",", ".")),
        })),
        prepaymentAmount: prepayNum,
        notes: notes.trim() || undefined,
      };
      const url = isEdit
        ? `/api/receipts/${existingReceipt!.id}`
        : `/api/receipts`;
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

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-card rounded-t-3xl flex flex-col"
        style={{ maxHeight: "92dvh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex justify-between items-center px-5 pt-2 pb-3 flex-shrink-0">
          <h3 className="font-bold text-base flex items-center gap-2">
            <ReceiptText size={18} className="text-primary" />
            {isEdit ? "Изменить смету" : `Смета — заказ #${order.leadId ?? order.id}`}
          </h3>
          <button onClick={onClose} className="text-muted-foreground p-1"><X size={20} /></button>
        </div>

        {/* Scrollable body — min-h-0 is critical for flex overflow to work */}
        <div className="overflow-y-auto flex-1 min-h-0 px-5 pb-3 space-y-4">
          {result ? (
            <>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 text-center space-y-1">
                <CheckCircle2 size={32} className="mx-auto text-green-500" />
                <p className="font-semibold text-green-700 dark:text-green-400">
                  {isEdit ? "Смета обновлена!" : "Смета создана!"}
                </p>
                <p className="text-sm text-muted-foreground">Отправьте ссылку клиенту</p>
              </div>
              <div className="bg-muted rounded-xl p-3 text-xs break-all font-mono text-muted-foreground">
                {result.publicUrl}
              </div>
            </>
          ) : (
            <>
              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Перечень работ</p>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs text-primary font-medium">
                    <Plus size={14} /> Добавить
                  </button>
                </div>
                <div className="space-y-2">
                  {lineItems.map((item, i) => {
                    const rowTotal = lineTotal(item);
                    return (
                      <div key={i} className="rounded-xl border border-border bg-background p-2.5 space-y-2">
                        {/* Row 1: Description + delete */}
                        <div className="flex gap-2 items-center">
                          <input
                            value={item.description}
                            onChange={e => updateItem(i, "description", e.target.value)}
                            placeholder="Перечень работ"
                            className="flex-1 h-9 rounded-lg border border-border bg-muted/40 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          {lineItems.length > 1 && (
                            <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                              <X size={15} />
                            </button>
                          )}
                        </div>
                        {/* Row 2: Qty | Unit | Price | = Total */}
                        <div className="grid grid-cols-4 gap-1.5 items-center">
                          <div>
                            <div className="text-[10px] text-muted-foreground text-center mb-0.5">Объём</div>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e => updateItem(i, "quantity", e.target.value)}
                              placeholder="1"
                              className="w-full h-8 rounded-lg border border-border bg-muted/40 px-2 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                              inputMode="decimal"
                              min="0"
                            />
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground text-center mb-0.5">Ед.</div>
                            <select
                              value={item.unit}
                              onChange={e => updateItem(i, "unit", e.target.value)}
                              className="w-full h-8 rounded-lg border border-border bg-muted/40 px-1 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none text-center"
                            >
                              {UNITS.map(u => (
                                <option key={u} value={u}>{u === "" ? "—" : u}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground text-center mb-0.5">Цена ₽</div>
                            <input
                              type="number"
                              value={item.price}
                              onChange={e => updateItem(i, "price", e.target.value)}
                              placeholder="0"
                              className="w-full h-8 rounded-lg border border-border bg-muted/40 px-2 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                              inputMode="decimal"
                              min="0"
                            />
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground text-center mb-0.5">Сумма</div>
                            <div className="h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary px-1">
                              {rowTotal > 0 ? rowTotal.toLocaleString("ru-RU") : "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {totalCalc > 0 && (
                  <div className="flex justify-between items-center bg-primary/5 rounded-xl px-3 py-2.5">
                    <span className="text-xs text-muted-foreground">Итого по смете</span>
                    <span className="text-sm font-bold text-primary">{totalCalc.toLocaleString("ru-RU")} ₽</span>
                  </div>
                )}
              </div>

              {/* Prepayment */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Сумма предоплаты</label>
                <div className="relative">
                  <input
                    type="number"
                    value={prepayment}
                    onChange={e => setPrepayment(e.target.value)}
                    className="w-full h-12 rounded-xl border-2 border-primary/40 bg-background px-4 pr-10 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="5000"
                    inputMode="decimal"
                    min="1"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">₽</span>
                </div>
                <p className="text-xs text-muted-foreground">Сумма, которую клиент перечислит как предоплату</p>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
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

        {/* Footer buttons — always visible */}
        <div className="px-5 pt-3 flex-shrink-0 space-y-2 border-t border-border"
          style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom, 20px))" }}>
          {result ? (
            <>
              <button
                onClick={() => handleCopy(result.publicUrl)}
                className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Скопировано!" : "Скопировать ссылку"}
              </button>
              <button
                onClick={() => printEstimate(result, order, master?.alias ?? "Мастер", master?.phone ?? null)}
                className="w-full h-11 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 text-muted-foreground"
              >
                <Printer size={15} /> Распечатать смету
              </button>
              {typeof navigator.share === "function" && (
                <button
                  onClick={() => navigator.share({ title: "Смета", url: result.publicUrl })}
                  className="w-full h-11 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 text-muted-foreground"
                >
                  Поделиться
                </button>
              )}
              <button onClick={onClose} className="w-full h-10 text-sm text-muted-foreground">
                Закрыть
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                {isEdit ? "Сохранить изменения" : "Создать смету"}
              </button>
              {isEdit && displayUrl && (
                <>
                  <button
                    onClick={() => handleCopy(displayUrl)}
                    className="w-full h-10 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 text-muted-foreground"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Скопировано!" : "Скопировать текущую ссылку"}
                  </button>
                  <button
                    onClick={() => printEstimate(existingReceipt!, order, master?.alias ?? "Мастер", master?.phone ?? null)}
                    className="w-full h-10 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 text-muted-foreground"
                  >
                    <Printer size={14} /> Распечатать смету
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function OrderCard({ order, onRefresh, initialExpanded }: { order: Order; onRefresh: () => void; initialExpanded?: boolean }) {
  const { master } = useAuth();
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [orderReceipts, setOrderReceipts] = useState<ExistingReceipt[]>([]);
  const [receiptsFetched, setReceiptsFetched] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<ExistingReceipt | null>(null);
  const [showNewReceipt, setShowNewReceipt] = useState(false);
  const isActive = ["master_assigned", "in_progress"].includes(order.status);
  const isCancelRequested = order.status === "cancellation_requested";
  const isRefundRequested = order.status === "refund_requested";

  const [showRefund, setShowRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundCustom, setRefundCustom] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const REFUND_REASONS = [
    "Клиент не берёт трубку",
    "Номер не существует",
    "Клиент отказался до замера",
    "Дубль / ошибочная заявка",
    "Другое",
  ];

  const canRequestRefund = order.paymentModel === "token" &&
    order.tokensCharged && order.tokensCharged > 0 &&
    !isRefundRequested &&
    order.status !== "completed" && order.status !== "cancelled" &&
    !!order.assignedAt &&
    (Date.now() - new Date(order.assignedAt).getTime()) < 48 * 60 * 60 * 1000;

  const handleRefundSubmit = async () => {
    const finalReason = refundReason === "Другое" && refundCustom.trim()
      ? `Другое: ${refundCustom.trim()}`
      : refundReason;
    if (!finalReason) return;
    setSubmittingRefund(true);
    try {
      const r = await fetch(`/api/master-pwa/orders/${order.id}/refund-request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: finalReason }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Ошибка");
      toast.success(`Заявка на возврат ${data.tokensRequested} токен(а) отправлена`);
      setShowRefund(false);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setSubmittingRefund(false);
    }
  };
  const currentStepIdx = workStatusSteps.findIndex(s => s.key === order.masterWorkStatus);

  const fetchReceipts = async (showNotification = false) => {
    try {
      const r = await fetch(`/api/receipts/my/${order.id}`, { credentials: "include" });
      if (!r.ok) return;
      const fresh: ExistingReceipt[] = await r.json();
      if (showNotification) {
        setOrderReceipts(prev => {
          fresh.forEach(fr => {
            const old = prev.find(p => p.id === fr.id);
            if (!old?.prepaymentSubmittedAt && fr.prepaymentSubmittedAt) {
              toast.success("🎉 Клиент подтвердил предоплату по смете!");
            }
          });
          return fresh;
        });
      } else {
        setOrderReceipts(fresh);
      }
      setReceiptsFetched(true);
    } catch {}
  };

  useEffect(() => {
    if (expanded && isActive) {
      fetchReceipts();
      const interval = setInterval(() => fetchReceipts(true), 30_000);
      return () => clearInterval(interval);
    }
    return undefined;
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
      <div className="bg-card rounded-2xl overflow-hidden shadow-sm">
        <button
          className="w-full p-4 text-left flex items-center justify-between gap-2 active:opacity-80"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[15px]">
                {order.city}{order.district ? `, ${order.district}` : ""}
              </span>
              <span className="text-xs text-muted-foreground">#{order.leadId ?? order.id}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                order.status === "completed"
                  ? "bg-success/10 text-success"
                  : order.status === "cancelled"
                  ? "bg-muted text-muted-foreground"
                  : isCancelRequested
                  ? "bg-warning/10 text-warning"
                  : "bg-primary/8 text-primary"
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

            {/* ── Alert: смета не создана ─────────────────────── */}
            {isActive && receiptsFetched && orderReceipts.length === 0 && (
              <div className="flex items-start gap-3 bg-card rounded-xl p-3 border-l-4 border-l-destructive shadow-sm">
                <AlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground mb-1">Смета не создана</p>
                  <p className="text-xs text-muted-foreground leading-snug mb-2">Клиент не может внести предоплату. Создайте смету прямо сейчас.</p>
                  <button
                    onClick={() => setShowNewReceipt(true)}
                    className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm"
                  >
                    <Plus size={14} /> Создать смету
                  </button>
                </div>
              </div>
            )}

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
              <div className="bg-card rounded-xl p-3 text-sm border-l-4 border-l-warning shadow-sm">
                <p className="font-medium text-foreground mb-0.5">Причина отмены</p>
                <p className="text-muted-foreground text-xs">{order.cancelReason}</p>
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
                      className="w-full h-11 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-60 text-sm"
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
                        <ReceiptText size={12} /> Сметы
                      </p>
                      {orderReceipts.map(r => (
                        <div key={r.id} className="bg-muted/40 rounded-xl px-3 py-2.5 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">{Number(r.totalAmount).toLocaleString("ru-RU")} ₽</p>
                              <p className="text-xs text-muted-foreground">Предоплата: {Number(r.prepaymentAmount).toLocaleString("ru-RU")} ₽</p>
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                              <button
                                onClick={() => { navigator.clipboard.writeText(r.publicUrl); toast.success("Ссылка скопирована!"); }}
                                className="h-8 px-2.5 rounded-lg border border-border bg-background text-xs font-medium flex items-center gap-1"
                              >
                                <Copy size={12} /> Ссылка
                              </button>
                              <button
                                onClick={() => printEstimate(r, order, master?.alias ?? "Мастер", master?.phone ?? null)}
                                className="h-8 px-2.5 rounded-lg border border-border bg-background text-xs font-medium flex items-center gap-1"
                              >
                                <Printer size={12} /> Печать
                              </button>
                              <button
                                onClick={() => setEditingReceipt(r)}
                                className="h-8 px-2.5 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-medium flex items-center gap-1"
                              >
                                Изменить
                              </button>
                              <button
                                onClick={async () => {
                                  if (!window.confirm("Удалить смету?")) return;
                                  const res = await fetch(`/api/receipts/${r.id}`, { method: "DELETE", credentials: "include" });
                                  if (res.ok) {
                                    setOrderReceipts(prev => prev.filter(x => x.id !== r.id));
                                    toast.success("Смета удалена");
                                  } else {
                                    toast.error("Не удалось удалить");
                                  }
                                }}
                                className="h-8 w-8 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive flex items-center justify-center flex-shrink-0"
                                title="Удалить смету"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          {r.prepaymentSubmittedAt ? (
                            <div className="space-y-1.5 mt-1">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
                                <CheckCircle2 size={13} className="flex-shrink-0" />
                                Бронь подтверждена · {new Date(r.prepaymentSubmittedAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </div>
                              {r.clientSubmittedName && <p className="text-xs text-muted-foreground pl-5">👤 {r.clientSubmittedName}</p>}
                              <div className="bg-muted/50 rounded-xl p-2.5 space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Бронь (комиссия платформы)</span>
                                  <span className="font-semibold text-destructive">{Number(r.prepaymentAmount).toLocaleString("ru-RU")} ₽</span>
                                </div>
                                <div className="flex justify-between border-t border-border pt-1 mt-0.5">
                                  <span className="font-medium text-foreground">
                                    {Number(r.totalAmount) > 50000 ? "Остаток (оплата отдельно)" : "Остаток от клиента"}
                                  </span>
                                  <span className="font-bold text-green-700 dark:text-green-400">
                                    {(Number(r.totalAmount) - Number(r.prepaymentAmount)).toLocaleString("ru-RU")} ₽
                                  </span>
                                </div>
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
                    {orderReceipts.length > 0 ? "Создать ещё смету" : "Создать смету клиенту"}
                  </button>
                </div>

                {/* Refund token button (token model, within 48h) */}
                {canRequestRefund && (
                  <div className="space-y-1">
                    <button
                      onClick={() => setShowRefund(true)}
                      className="w-full h-10 rounded-xl border border-amber-300 text-amber-700 dark:text-amber-400 text-sm font-medium flex items-center justify-center gap-2 active:opacity-80 bg-amber-50 dark:bg-amber-900/20"
                    >
                      <RotateCcw size={15} />
                      Запросить возврат токена ({order.tokensCharged} т.)
                    </button>
                    <p className="text-center text-[11px] text-muted-foreground">
                      Доступно в течение 48 часов после отклика
                    </p>
                  </div>
                )}
                {isRefundRequested && (
                  <div className="flex items-center gap-2 bg-card rounded-xl px-3 py-2.5 border-l-4 border-l-warning shadow-sm">
                    <Coins size={15} className="text-warning shrink-0" />
                    <p className="text-xs text-foreground font-medium">Заявка на возврат токена ожидает решения администратора</p>
                  </div>
                )}

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
          displayId={order.leadId ?? order.id}
          onDone={() => { setShowComplete(false); onRefresh(); }}
          onClose={() => setShowComplete(false)}
        />
      )}
      {showCancel && (
        <CancelModal
          orderId={order.id}
          displayId={order.leadId ?? order.id}
          onDone={() => { setShowCancel(false); onRefresh(); }}
          onClose={() => setShowCancel(false)}
        />
      )}

      {/* Refund token modal */}
      {showRefund && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end bg-black/40" onClick={() => setShowRefund(false)}>
          <div className="w-full bg-background rounded-t-2xl pt-4 pb-8 px-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto" />
            <div className="flex items-center gap-2">
              <Coins size={18} className="text-amber-500" />
              <h3 className="font-bold text-base">Запрос на возврат токена</h3>
            </div>
            <p className="text-xs text-muted-foreground">Укажите причину возврата. Администратор рассмотрит заявку и вернёт {order.tokensCharged} токен(a) при одобрении.</p>
            <div className="space-y-2">
              {REFUND_REASONS.map(r => (
                <button key={r} onClick={() => setRefundReason(r)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                    refundReason === r
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium"
                      : "border-border bg-card text-foreground"
                  }`}>
                  {r}
                </button>
              ))}
              {refundReason === "Другое" && (
                <textarea
                  rows={2}
                  placeholder="Опишите причину..."
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background resize-none outline-none focus:ring-2 focus:ring-amber-200"
                  value={refundCustom}
                  onChange={e => setRefundCustom(e.target.value)}
                />
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowRefund(false)}
                className="flex-1 h-12 rounded-xl border border-border text-muted-foreground text-sm font-medium">
                Отмена
              </button>
              <button
                disabled={!refundReason || (refundReason === "Другое" && !refundCustom.trim()) || submittingRefund}
                onClick={handleRefundSubmit}
                className="flex-1 h-12 rounded-xl bg-amber-500 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {submittingRefund ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                Отправить заявку
              </button>
            </div>
          </div>
        </div>,
        document.body
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
          <div key={d.dispatchId} className="bg-card rounded-2xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">#{d.orderId}</span>
              <span className={`text-xs font-semibold ${statusCfg.color}`}>{statusCfg.label}</span>
            </div>
            <h3 className="text-[15px] font-semibold text-foreground">{d.serviceType}</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin size={11} className="shrink-0" />
                {d.city}{d.district ? `, ${d.district}` : ""}
              </span>
              <span>·</span>
              <span>{d.area} м²</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
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
      const v = p.get("expand") ?? p.get("openOrder");
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
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-card rounded-2xl p-8 text-center">
          <ClipboardList size={32} className="text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">
            {filter === "active" ? "Нет активных заказов" : "Нет завершённых заказов"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {filter === "active" ? "Новые заявки появятся здесь" : "Завершённые заказы будут здесь"}
          </p>
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
