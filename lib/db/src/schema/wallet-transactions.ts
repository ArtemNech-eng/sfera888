import { pgTable, serial, integer, varchar, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";
import { tokenPackagesTable } from "./token-packages";
import { ordersTable } from "./orders";

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  type: varchar("type", { length: 50 }).notNull(),
  tokensAmount: numeric("tokens_amount", { precision: 10, scale: 2 }).notNull(),
  rubAmount: integer("rub_amount"),
  packageId: integer("package_id").references(() => tokenPackagesTable.id),
  orderId: integer("order_id").references(() => ordersTable.id),
  reason: text("reason"),
  screenshotUrl: text("screenshot_url"),
  createdBy: varchar("created_by", { length: 100 }).notNull().default("system"),
  status: varchar("status", { length: 50 }).notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWalletTransactionSchema = createInsertSchema(walletTransactionsTable).omit({ id: true, createdAt: true });
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
