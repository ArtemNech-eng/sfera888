import { pgTable, serial, integer, varchar, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";
import { ordersTable } from "./orders";

export const tokenAuditLogTable = pgTable("token_audit_log", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  orderId: integer("order_id").references(() => ordersTable.id),
  type: varchar("type", { length: 50 }).notNull(), // deduct | refund | manual_add | manual_remove
  tokensAmount: numeric("tokens_amount", { precision: 10, scale: 2 }).notNull(),
  balanceBefore: numeric("balance_before", { precision: 10, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  createdBy: varchar("created_by", { length: 100 }).notNull().default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTokenAuditLogSchema = createInsertSchema(tokenAuditLogTable).omit({ id: true, createdAt: true });
export type InsertTokenAuditLog = z.infer<typeof insertTokenAuditLogSchema>;
export type TokenAuditLog = typeof tokenAuditLogTable.$inferSelect;
