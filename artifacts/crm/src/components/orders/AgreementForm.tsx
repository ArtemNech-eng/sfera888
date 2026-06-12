import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Banknote, Loader2, AlertTriangle, FileText } from "lucide-react";

/**
 * AgreementForm — фиксация согласованной суммы по заказу через
 * Agreement_Path (.kiro/specs/estimate-optional-flow Phase 2).
 *
 * Operator вводит сумму "со слов мастера" (или принимает proposedAmount
 * мастера через одну кнопку — см. <AcceptMasterProposalButton>). После
 * submit вызывается POST /api/orders/:id/agreement, который пишет
 * orderAmount, agreementAmountSource, agreementNote, audit-row, и
 * запускает push/MAX мастеру.
 *
 * Используется в:
 *   • ClosingDrawer — primary action когда paymentState=no_amount.
 *   • OrderPanel inline edit — кнопка "Изменить сумму" когда paymentState=agreed.
 */

const SOFT_WARNING_THRESHOLD = 1_000_000;

interface Props {
  orderId: number;
  /** Начальное значение для поля "Сумма" (например, текущий orderAmount или proposedAmount). */
  defaultAmount?: number;
  /** Вызывается после успешного фикса — родитель обычно закрывает drawer. */
  onSuccess?: () => void;
  /** Опциональный label заголовка (по умолчанию "Зафиксировать сумму"). */
  title?: string;
  /** Дополнительные классы вокруг формы. */
  className?: string;
}

const NOTE_SOURCE_OPTIONS = [
  { value: "from_master", label: "Со слов мастера" },
  { value: "from_chat", label: "По чату с клиентом" },
  { value: "other", label: "Другое" },
] as const;

type NoteSource = (typeof NOTE_SOURCE_OPTIONS)[number]["value"];

export function AgreementForm({
  orderId,
  defaultAmount,
  onSuccess,
  title = "Зафиксировать сумму",
  className = "",
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<string>(
    defaultAmount && defaultAmount > 0 ? String(defaultAmount) : "",
  );
  const [noteSource, setNoteSource] = useState<NoteSource | "">("");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async (body: {
      amount: number;
      noteSource?: NoteSource;
      note?: string;
    }) => {
      const r = await fetch(`/api/orders/${orderId}/agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: body.amount,
          source: "agreement",
          ...(body.noteSource ? { noteSource: body.noteSource } : {}),
          ...(body.note ? { note: body.note } : {}),
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Не удалось зафиксировать сумму");
      }
      return r.json();
    },
    onSuccess: () => {
      // Inactive lists: orders, work-board (kanban + table), dashboard tasks
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board/table"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Сумма зафиксирована" });
      onSuccess?.();
    },
    onError: (e: Error) => {
      toast({
        title: "Ошибка",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const amountNum = Number(amount.replace(/[^0-9.]/g, "")) || 0;
  const showSoftWarning = amountNum >= SOFT_WARNING_THRESHOLD;
  const canSubmit = amountNum > 0 && !mutation.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({
      amount: amountNum,
      ...(noteSource ? { noteSource } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  }

  return (
    <form onSubmit={submit} className={`space-y-3 ${className}`} aria-label="Фиксация согласованной суммы">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </div>

      <label className="block">
        <span className="text-xs text-muted-foreground">Сумма заказа, ₽</span>
        <div className="relative mt-1">
          <Banknote className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="number"
            min="0"
            step="100"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            autoFocus
            className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>
        {showSoftWarning && (
          <div className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Сумма больше 1 000 000 ₽ — проверь ещё раз перед фиксацией.</span>
          </div>
        )}
      </label>

      <label className="block">
        <span className="text-xs text-muted-foreground">Откуда сумма (необязательно)</span>
        <select
          value={noteSource}
          onChange={(e) => setNoteSource(e.target.value as NoteSource | "")}
          className="mt-1 w-full px-3 py-2.5 border border-border rounded-xl bg-white focus:ring-2 focus:ring-primary/20 outline-none"
        >
          <option value="">— не указано —</option>
          {NOTE_SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs text-muted-foreground">Комментарий (необязательно)</span>
        <div className="relative mt-1">
          <FileText className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: квартира 80 м², черновая отделка"
            rows={2}
            maxLength={500}
            className="w-full pl-9 pr-3 py-2 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none resize-none text-sm"
          />
        </div>
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Сохраняю…
          </>
        ) : (
          "Зафиксировать"
        )}
      </button>
    </form>
  );
}

export default AgreementForm;
