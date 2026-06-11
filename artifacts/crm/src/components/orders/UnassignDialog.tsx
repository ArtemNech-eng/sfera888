import { useState } from "react";
import { X, UserMinus, Loader2 } from "lucide-react";

interface OrderRow {
  orderId: number;
  master: string | null;
}

interface Props {
  order: OrderRow;
  onClose: () => void;
  onConfirm: (reason: string, rebroadcast: boolean) => void;
  isPending: boolean;
}

const PRESET_REASONS = [
  "Клиент отказался от мастера",
  "Мастер не выходит на связь",
  "Не подходит по специализации",
  "Мастер сам отказался от заказа",
];

/**
 * Modal dialog: confirm removing a master from an order.
 *
 * Operator picks a preset reason or types a custom one. The optional
 * "rebroadcast" toggle re-puts the order into the dispatch pool right
 * after the master is detached.
 */
export default function UnassignDialog({ order, onClose, onConfirm, isPending }: Props) {
  const [preset, setPreset] = useState<string | null>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [rebroadcast, setRebroadcast] = useState(true);

  const finalReason = (preset ?? "").trim() || customReason.trim();
  const canSubmit = finalReason.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Снять мастера с заказа</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              #{order.orderId} · {order.master ?? "—"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Причина снятия</label>
            <div className="space-y-1.5">
              {PRESET_REASONS.map(p => (
                <label
                  key={p}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                    preset === p ? "border-primary bg-primary/5 text-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="preset"
                    checked={preset === p}
                    onChange={() => { setPreset(p); setCustomReason(""); }}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm">{p}</span>
                </label>
              ))}
              <label
                className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  preset === null ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/30"
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  checked={preset === null}
                  onChange={() => setPreset(null)}
                  className="w-4 h-4 accent-primary mt-1"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm">Своя причина</span>
                  {preset === null && (
                    <textarea
                      autoFocus
                      value={customReason}
                      onChange={e => setCustomReason(e.target.value)}
                      placeholder="Опишите причину…"
                      rows={2}
                      className="mt-1.5 w-full px-2.5 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                  )}
                </div>
              </label>
            </div>
          </div>

          <label className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={rebroadcast}
              onChange={e => setRebroadcast(e.target.checked)}
              className="w-4 h-4 accent-primary mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">Запустить рассылку другим мастерам</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Заказ вернётся в пул и будет разослан подходящим мастерам в этом городе.
              </div>
            </div>
          </label>
        </div>

        <div className="p-4 border-t bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Отмена
          </button>
          <button
            onClick={() => onConfirm(finalReason, rebroadcast)}
            disabled={!canSubmit || isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
            Снять мастера
          </button>
        </div>
      </div>
    </div>
  );
}
