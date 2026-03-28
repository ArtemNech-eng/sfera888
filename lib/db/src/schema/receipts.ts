import { pgTable, serial, integer, text, numeric, timestamp, varchar, jsonb } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { mastersTable } from "./masters";

export interface LineItem {
  description: string;
  price: number;
}

export const receiptsTable = pgTable("receipts", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  serviceType: text("service_type").notNull(),
  city: text("city").notNull(),
  district: text("district"),
  lineItems: jsonb("line_items").$type<LineItem[]>().notNull().default([]),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  prepaymentAmount: numeric("prepayment_amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Client confirmation fields
  clientSubmittedName: text("client_submitted_name"),
  prepaymentSubmittedAt: timestamp("prepayment_submitted_at"),
  prepaymentScreenshotUrl: text("prepayment_screenshot_url"),
  prepaymentSeenAt: timestamp("prepayment_seen_at"),
});

export type Receipt = typeof receiptsTable.$inferSelect;
