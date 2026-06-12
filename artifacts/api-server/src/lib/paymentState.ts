/**
 * Payment_State engine — pure compute for derived order state.
 *
 * Payment_State не хранится в БД. Это derived value, вычисляемое из
 * (order, receipts) по формальным правилам (.kiro/specs/estimate-optional-flow
 * / requirements.md / Requirement 1.1).
 *
 * Вся фильтрация/подавление 5 каналов уведомлений в Phase 2 идёт через эту
 * функцию + feature-flag guard в `paymentStateGuard.ts`.
 *
 * Гарантии:
 *   • Pure: одинаковый вход → одинаковый выход. Без побочных эффектов.
 *   • Корректность переходов: cancelled побеждает всегда, paid побеждает
 *     agreed, agreed побеждает no_amount.
 *   • Без обращений к БД, fetch, console — только вычисление.
 *
 * Используется во всех read-endpoints (Phase 1) и в guard-логике (Phase 2).
 */

export type PaymentState = "no_amount" | "agreed" | "paid" | "cancelled";

/** Минимальный shape order, которого хватает для compute. */
export interface OrderForPaymentState {
  status: string;
  commissionPaid: boolean;
  orderAmount: string | number | null;
}

/** Минимальный shape receipt, которого хватает для compute. */
export interface ReceiptForPaymentState {
  prepaymentAmount: string | number | null;
  prepaymentSeenAt: Date | string | null;
  prepaymentSubmittedAt?: Date | string | null;
}

/**
 * Вычисляет Payment_State одного заказа.
 *
 * Алгоритм (порядок проверок важен):
 *   1. status = "cancelled"      → "cancelled"
 *   2. commissionPaid = true ИЛИ
 *      все receipts с prepaymentSeenAt → "paid"
 *   3. orderAmount > 0 ИЛИ
 *      есть receipt с prepaymentAmount > 0 → "agreed"
 *   4. иначе                       → "no_amount"
 *
 * Note: `prepaymentPaidAt` упоминается в requirements но в текущей схеме
 * receipts отсутствует — используем `prepaymentSeenAt` как прокси (оператор
 * увидел = подтвердил оплату). Это совместимо с existing logic в
 * routes/orders.ts:fullyPaidByPrepayment.
 */
export function computePaymentState(
  order: OrderForPaymentState,
  receipts: ReceiptForPaymentState[],
): PaymentState {
  if (order.status === "cancelled") return "cancelled";

  // Признак "оплачено":
  // (a) флаг commissionPaid установлен оператором/менеджером
  // (b) ИЛИ существует хотя бы одна receipt и ВСЕ они подтверждены оператором
  //     (prepaymentSeenAt не null). Если одна receipt подтверждена, а вторая
  //     ещё нет — order ещё в "agreed".
  const hasReceipts = receipts.length > 0;
  const allReceiptsConfirmed =
    hasReceipts && receipts.every((r) => r.prepaymentSeenAt != null);
  if (order.commissionPaid === true || allReceiptsConfirmed) return "paid";

  // Признак "сумма зафиксирована":
  // (a) Order.orderAmount > 0 (оператор ввёл явно или через POST /agreement)
  // (b) ИЛИ есть receipt с prepaymentAmount > 0 (мастер составил смету,
  //     даже если оператор ещё не подтвердил, сумма уже известна)
  const orderHasAmount = Number(order.orderAmount ?? 0) > 0;
  const receiptsHaveAmount = receipts.some(
    (r) => Number(r.prepaymentAmount ?? 0) > 0,
  );
  if (orderHasAmount || receiptsHaveAmount) return "agreed";

  return "no_amount";
}

/**
 * Batch-вариант для списочных endpoints (GET /api/orders, /work-board, etc.).
 * Принимает уже загруженные orders и map receipts по orderId — не делает
 * дополнительных DB-запросов.
 */
export function computePaymentStateBatch(
  orders: OrderForPaymentState[] & { id: number }[],
  receiptsByOrder: Map<number, ReceiptForPaymentState[]>,
): Map<number, PaymentState> {
  const out = new Map<number, PaymentState>();
  for (const o of orders) {
    out.set(o.id, computePaymentState(o, receiptsByOrder.get(o.id) ?? []));
  }
  return out;
}

/**
 * Утилита для группировки receipts из плоского списка в map по orderId.
 * Удобно вызывать прямо после `db.select().from(receiptsTable).where(...)`.
 */
export function groupReceiptsByOrder<R extends { orderId: number }>(
  receipts: R[],
): Map<number, R[]> {
  const out = new Map<number, R[]>();
  for (const r of receipts) {
    const arr = out.get(r.orderId) ?? [];
    arr.push(r);
    out.set(r.orderId, arr);
  }
  return out;
}
