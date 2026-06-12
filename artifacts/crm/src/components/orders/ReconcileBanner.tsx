import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ReceiptText, Banknote, Loader2 } from "lucide-react";

/**
 * ReconcileBanner — баннер для разрешения конфликта между Agreement_Amount
 * (зафиксированной оператором суммой) и Receipt_Amount (суммой в смете
 * мастера). Показывается на карточке заказа когда оба значения известны
 * и они не совпадают (см. operatorTasks.ts type `reconcile_amount`).
 *
 * Phase 3 of estimate-optional-flow.
 *
 * Действия:
 *   • "Использовать сумму из сметы" → PATCH /api/orders/:id
 *     { acceptReceiptAmount: true } — orderAmount пересчитывается, audit
 *     с source=reconcile_use_receipt, задача закрывается.
 *   • "Оставить согласованную сумму" → PATCH /api/orders/:id
 *     { keepAgreementAmount: true, reason: "..." } — audit-only
 *     с source=reconcile_keep_agreement. Reason обязателен.
 */

interface Props {
  orderId: number;
  /** Текущая зафиксированная сумма (Agreement_Amount). */
  agreementAmount: number;
  /** Сумма из последней receipt мастера. */
  receiptAmount: number;
  /** Callback после успешного разрешения — родитель закрывает баннер. */
  onResolved?: () => void;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}

export function ReconcileBanner({
  orderId,
  agreementAmount,
  receiptAmount,
  onResolved,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showKeepDialog, setShowKeepDialog] = useState(false);
  const [reason, setReason] = useState("");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/work-board"] });
    queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
    queryClient.invalidateQueries({ queryKey: ["/api/operator-tasks"] });
  };

  const acceptReceipt = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ acceptReceiptAmount: true }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Сумма из сметы принята", description: `Новая сумма: ${fmtMoney(receiptAmount)}` });
      onResolved?.();
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const keepAgreement = useMutation({
    mutationFn: async (reasonText: string) => {
      const r = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ keepAgreementAmount: true, reason: reasonText }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Ошибка");
      }
      return r.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Согласованная сумма сохранена", description: "Решение записано в audit" });
      setShowKeepDialog(false);
      setReason("");
      onResolved?.();
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const isPending = acceptReceipt.isPending || keepAgreement.isPending;

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-amber-900 text-sm">
            Расхождение сумм по заказу
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Мастер составил смету с другой суммой. Решите, какую сумму использовать.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-amber-200 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Banknote className="w-3.5 h-3.5" />
            Согласованная (текущая)
          </div>
          <p className="font-bold text-foreground mt-1">{fmtMoney(agreementAmount)}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ReceiptText className="w-3.5 h-3.5" />
            В смете мастера
          </div>
          <p className="font-bold text-foreground mt-1">{fmtMoney(receiptAmount)}</p>
        </div>
      </div>

      {!showKeepDialog && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => acceptReceipt.mutate()}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
          >
            {acceptReceipt.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />}
            Использовать сумму из сметы
          </button>
          <button
            onClick={() => setShowKeepDialog(true)}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-amber-300 text-amber-800 text-sm font-medium rounded-xl disabled:opacity-50 transition-colors"
          >
            <Banknote className="w-4 h-4" />
            Оставить согласованную
          </button>
        </div>
      )}

      {showKeepDialog && (
        <div className="bg-white rounded-xl border border-amber-200 p-3 space-y-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Причина (обязательно)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Например: клиент подтвердил по чату; смета мастера ошибочна"
              rows={2}
              maxLength={500}
              autoFocus
              className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none resize-none"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => keepAgreement.mutate(reason.trim())}
              disabled={!reason.trim() || keepAgreement.isPending}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {keepAgreement.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Сохранить решение
            </button>
            <button
              onClick={() => { setShowKeepDialog(false); setReason(""); }}
              disabled={keepAgreement.isPending}
              className="px-3 py-2 bg-white border border-border text-sm text-muted-foreground rounded-lg disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReconcileBanner;
