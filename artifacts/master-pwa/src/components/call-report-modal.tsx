// CallReportModal — master fills out call-report after talking to client.
// Two paths:
//   - "Замер согласован"          → date+time picker → orders.scheduledAt
//   - "Не дозвонился / нужно ещё" → free-text note
// Either way, server sets clientCallReportedAt = NOW() and inserts a chat
// message visible to the operator.
//
// Spec: .kiro/specs/stuck-orders-and-master-banner (R0, R7.5)

import { useState } from "react";
import { Calendar, MessageSquare, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  orderId: number;
  displayId?: number;
  onClose: () => void;
  onSubmitted: () => void;
}

type Mode = "scheduled" | "no_contact";

export function CallReportModal({ orderId, displayId, onClose, onSubmitted }: Props) {
  const [mode, setMode] = useState<Mode>("scheduled");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = mode === "scheduled"
    ? scheduledAt.length > 0
    : note.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const body = mode === "scheduled"
        ? {
            scheduledAt: new Date(scheduledAt).toISOString(),
            note: note.trim() || null,
          }
        : { scheduledAt: null, note: note.trim() };
      await api.callReport(orderId, body);
      toast.success("Отчёт отправлен");
      onSubmitted();
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось отправить отчёт");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:items-center sm:pb-0"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-background rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-bold leading-tight">Отчёт о созвоне</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Заказ #{displayId ?? orderId}</p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="px-5 pb-3">
          <div className="flex bg-muted rounded-xl p-1">
            <button
              onClick={() => setMode("scheduled")}
              disabled={submitting}
              className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                mode === "scheduled"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar size={14} />
              Замер согласован
            </button>
            <button
              onClick={() => setMode("no_contact")}
              disabled={submitting}
              className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                mode === "no_contact"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare size={14} />
              Не дозвонился
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="px-5 pb-3 space-y-3">
          {mode === "scheduled" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Дата и время замера
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={submitting}
                className="w-full h-11 px-3 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              {mode === "scheduled"
                ? "Комментарий (необязательно)"
                : "Что сообщил клиент / почему не на связи"}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              maxLength={500}
              rows={3}
              placeholder={
                mode === "scheduled"
                  ? "например: «плитку выберем по фото»"
                  : "например: «телефон выключен, попробую завтра утром»"
              }
              className="w-full px-3 py-2.5 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50 resize-none"
            />
            <p className="text-[10px] text-muted-foreground text-right mt-1">{note.length}/500</p>
          </div>
        </div>

        {/* Submit */}
        <div className="px-5 pb-5 pt-2 border-t border-border">
          <button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="w-full h-11 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? "Отправляю…" : "Отправить отчёт"}
          </button>
        </div>
      </div>
    </div>
  );
}
