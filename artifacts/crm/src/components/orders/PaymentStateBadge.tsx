import { cn } from "@/lib/utils";

/**
 * Payment_State badge — показывает derived состояние "денежной части" заказа.
 *
 * Значения и переходы определены в .kiro/specs/estimate-optional-flow:
 *   • no_amount → "Сумма не зафиксирована" (warn, требуется действие оператора)
 *   • agreed    → "Сумма согласована" (нейтрально, заказ в работе)
 *   • paid      → "Оплачено" (ok, комиссия закрыта)
 *   • cancelled → "Отменён" (нейтрально-серый, financial state мёртв)
 *
 * Phase 1: компонент-display, не имеет интерактивности. Подключается в
 * OrderPanel, OrdersWorkspace, work-board-table, MasterPickerPanel.
 */

export type PaymentState = "no_amount" | "agreed" | "paid" | "cancelled";

interface PaymentStateBadgeProps {
  state: PaymentState;
  /** "sm" — компактный (для строк таблицы), "md" — стандартный (для карточек). */
  size?: "sm" | "md";
  className?: string;
}

const STATE_CONFIG: Record<PaymentState, { label: string; class: string }> = {
  no_amount: {
    label: "Сумма не зафиксирована",
    class: "bg-amber-100 text-amber-800 border-amber-200",
  },
  agreed: {
    label: "Сумма согласована",
    class: "bg-blue-100 text-blue-800 border-blue-200",
  },
  paid: {
    label: "Оплачено",
    class: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  cancelled: {
    label: "Отменён",
    class: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

export function PaymentStateBadge({ state, size = "md", className }: PaymentStateBadgeProps) {
  const config = STATE_CONFIG[state] ?? STATE_CONFIG.no_amount;
  const sizeClass = size === "sm" ? "px-2 py-0 text-[10px]" : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border whitespace-nowrap",
        sizeClass,
        config.class,
        className,
      )}
    >
      {config.label}
    </span>
  );
}

export default PaymentStateBadge;
