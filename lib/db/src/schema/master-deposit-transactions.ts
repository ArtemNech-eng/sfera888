import { pgTable, serial, integer, numeric, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";

export const masterDepositTransactionsTable = pgTable("master_deposit_transactions", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  balanceBefore: numeric("balance_before", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason"),
  createdBy: varchar("created_by", { length: 100 }).notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMasterDepositTransactionSchema = createInsertSchema(masterDepositTransactionsTable).omit({ id: true, createdAt: true });
export type InsertMasterDepositTransaction = z.infer<typeof insertMasterDepositTransactionSchema>;
export type MasterDepositTransaction = typeof masterDepositTransactionsTable.$inferSelect;
