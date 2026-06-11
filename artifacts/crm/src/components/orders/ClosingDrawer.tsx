import { useState, useEffect } from "react";
import { X, DollarSign, Banknote, CheckCircle2, XCircle, Check, Loader2, ClipboardList } from "lucide-react";

interface OrderRow {
  orderId: number;
  commission?: { orderTotal: number; total: number; paid: number; left: number };
  commissionPaid?: boolean;
  status: string;
}

interface FormValues {
  amount: number;
  commission: number;
  isPaid: boolean;
  status: "completed" | "cancelled";
}

interface Props {
  order: OrderRow;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
  isPending: boolean;
}

const COMMISSION_THRESHOLD = 50_000;
const COMMISSION_FIXED = 5_000;
const COMMISSION_PERCENT = 0.15;

function calcCommission(total: number): number {
  if (total <= 0) return 0;
  return total <= COMMISSION_THRESHOLD ? COMMISSION_FIXED : Math.round(total * COMMISSION_PERCENT);
}

/**
 * Right-side drawer for "closing" an order — operator confirms the final
 * order amount, the commission, the success/refusal status, and the
 * payment flag in one pass.
 *
 * Auto-recalculates the suggested commission when the operator types a
 * new order amount (fixed 5k below 50k, 15% above). Operator can override.
 */
export default function ClosingDrawer({ order, onClose, onSubmit, isPending }: Props) {
  const initialAmount = order.commission?.orderTotal ?? 0;
  const initialCommission = order.commission?.total ?? calcCommission(initialAmount);
  const [amount, setAmount] = useState(String(initialAmount || ""));
  const [commission, setCommission] = useState(String(initialCommission || ""));
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [isPaid, setIsPaid] = useState(!!order.commissionPaid);
  const [status, setStatus] = useState<"completed" | "cancelled">(order.status === "cancelled" ? "cancelled" : "completed");

  // Recalculate commission when amount changes (unless operator typed it manually)
  useEffect(() => {
    if (commissionTouched) return;
    const a = parseFloat(amount.replace(/[^0-9.]/g, "")) || 0;
    setCommission(String(calcCommission(a)));
  }, [amount, commissionTouched]);

  const submit = () => {
    onSubmit({
      amount: parseFloat(amount.replace(/[^0-9.]/g, "")) || 0,
      commission: parseFloat(commission.replace(/[^0-9.]/g, "")) || 0,
      isPaid,
      status,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white h-full w-full max-w-md shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Закрытие заказа #{order.orderId}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Финальные данные сделки</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Сумма заказа, ₽" icon={<DollarSign className="w-4 h-4 text-slate-400" />}>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </Field>
            <Field label="Комиссия, ₽" icon={<Banknote className="w-4 h-4 text-slate-400" />}>
              <input
                type="number"
                value={commission}
                onChange={e => { setCommission(e.target.value); setCommissionTouched(true); }}
                placeholder="0.00"
                className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            до 50 000 ₽ — фикс 5 000 ₽; выше — 15%. Можно скорректировать вручную.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Статус заказа</label>
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton
                active={status === "completed"}
                color="emerald"
                onClick={() => setStatus("completed")}
                icon={<CheckCircle2 className="w-4 h-4" />}
                label="Успешно"
              />
              <ToggleButton
                active={status === "cancelled"}
                color="red"
                onClick={() => setStatus("cancelled")}
                icon={<XCircle className="w-4 h-4" />}
                label="Отказ"
              />
            </div>
          </div>

          <button
            onClick={() => setIsPaid(p => !p)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
              isPaid ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isPaid ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                <Banknote className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="font-bold text-sm">Комиссия оплачена</p>
                <p className="text-[10px] opacity-70 uppercase tracking-tight font-semibold">
                  {isPaid ? "Средства поступили" : "В ожидании оплаты"}
                </p>
              </div>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isPaid ? "bg-blue-500 border-blue-500" : "border-slate-300"}`}>
              {isPaid && <Check className="w-3 h-3 text-white" />}
            </div>
          </button>
        </div>

        <div className="p-4 border-t bg-slate-50">
          <button
            onClick={submit}
            disabled={isPending}
            className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <ClipboardList className="w-5 h-5" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
        {children}
      </div>
    </div>
  );
}

function ToggleButton({ active, color, onClick, icon, label }: { active: boolean; color: "emerald" | "red"; onClick: () => void; icon: React.ReactNode; label: string }) {
  const cls = active
    ? color === "emerald" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-red-500 bg-red-50 text-red-700"
    : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200";
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 transition-all ${cls}`}>
      {icon}
      <span className="font-semibold text-sm">{label}</span>
    </button>
  );
}
