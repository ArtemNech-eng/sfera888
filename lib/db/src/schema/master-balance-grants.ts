import { pgTable, serial, integer, numeric, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";

/**
 * One-shot migration table for the remove-token-payment-model feature.
 *
 * Admin вручную создаёт grant для каждого мастера с положительным
 * `master_wallet.tokensBalance` (D1 в .kiro/specs/remove-token-payment-model/
 * requirements.md). При запуске migration script (Phase B) каждая запись
 * с `appliedAt IS NULL` применяется как
 *   `master_wallet.balance += grant.amount`
 * после чего `appliedAt` ставится в NOW().
 *
 * Таблица будет удалена в Phase C через DROP TABLE — она одноразовая.
 */
export const masterBalanceGrantsTable = pgTable("master_balance_grants", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  appliedAt: timestamp("applied_at"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  masterIdx: index("master_balance_grants_master_idx").on(t.masterId),
  appliedIdx: index("master_balance_grants_applied_idx").on(t.appliedAt),
}));

export const insertMasterBalanceGrantSchema = createInsertSchema(masterBalanceGrantsTable).omit({
  id: true,
  appliedAt: true,
  createdAt: true,
});
export type InsertMasterBalanceGrant = z.infer<typeof insertMasterBalanceGrantSchema>;
export type MasterBalanceGrant = typeof masterBalanceGrantsTable.$inferSelect;
