import { pgTable, serial, integer, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { usersTable } from "./users";

/**
 * Audit-журнал изменений денежных полей заказа: `orderAmount`, `commission`,
 * `commissionPaid`. Каждое изменение через любой write-endpoint
 * (`POST /api/orders/:id/agreement`, `PATCH /api/orders/:id`) пишет сюда
 * запись в той же транзакции, что и само изменение.
 *
 * Используется:
 *   • Manager UI — `<AmountAuditHistory>` показывает ленту изменений в Closing_Drawer
 *   • Reconcile detection — поиск последнего `reconcile_*` события для закрытия
 *     задачи `reconcile_amount`
 *   • KPI — анализ источников финального `orderAmount` (Agreement_Path vs Receipt_Path)
 *
 * Подробности в `.kiro/specs/estimate-optional-flow/design.md`.
 */
export const orderAmountAuditTable = pgTable(
  "order_amount_audit",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id),
    // Кто инициировал изменение. Может быть null если изменение системное
    // (например, авто-recalc commission при изменении orderAmount).
    actorUserId: integer("actor_user_id").references(() => usersTable.id),
    // Роль актора на момент изменения: "operator" | "manager" | "master" | "system".
    actorRole: varchar("actor_role", { length: 32 }),
    // Denormalized snapshot имени актора — выживает удаление пользователя.
    actorAlias: text("actor_alias"),
    // Какое поле изменилось: "orderAmount" | "commission" | "commissionPaid".
    field: varchar("field", { length: 32 }).notNull(),
    // Сериализованные значения (text для универсальности — boolean/numeric/null).
    previousValue: text("previous_value"),
    newValue: text("new_value").notNull(),
    // Источник изменения — должен совпадать с `agreement_amount_source` на orders
    // плюс несколько системных значений: "system_recalc" | "operator_edit" |
    // "reconcile_use_receipt" | "reconcile_keep_agreement" | "manager_force_paid".
    source: varchar("source", { length: 32 }).notNull(),
    // Свободный комментарий — обязателен для `manager_correction`,
    // `manager_force_paid`, `reconcile_keep_agreement`.
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // Лента изменений по заказу (DESC по createdAt) — основной чтение для UI.
    orderIdx: index("order_amount_audit_order_idx").on(t.orderId, t.createdAt),
  }),
);

export type OrderAmountAudit = typeof orderAmountAuditTable.$inferSelect;
export type InsertOrderAmountAudit = typeof orderAmountAuditTable.$inferInsert;
