import { pgTable, serial, integer, numeric, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";

export const balanceTopupRequestStatusEnum = ["pending", "approved", "rejected"] as const;

export const balanceTopupRequestsTable = pgTable("balance_topup_requests", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  approvedByUserId: integer("approved_by_user_id"),
});

export const insertBalanceTopupRequestSchema = createInsertSchema(balanceTopupRequestsTable).omit({ id: true, createdAt: true, approvedAt: true });
export type InsertBalanceTopupRequest = z.infer<typeof insertBalanceTopupRequestSchema>;
export type BalanceTopupRequest = typeof balanceTopupRequestsTable.$inferSelect;
