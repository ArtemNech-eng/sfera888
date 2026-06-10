import { pgTable, serial, integer, numeric, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";
import { ordersTable } from "./orders";

export const serviceFeeTransactionsTable = pgTable("service_fee_transactions", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  orderId: integer("order_id").references(() => ordersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  type: text("type", { enum: ["deduct", "refund", "test_waived"] }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertServiceFeeTransactionSchema = createInsertSchema(serviceFeeTransactionsTable).omit({ id: true, createdAt: true });
export type InsertServiceFeeTransaction = z.infer<typeof insertServiceFeeTransactionSchema>;
export type ServiceFeeTransaction = typeof serviceFeeTransactionsTable.$inferSelect;
