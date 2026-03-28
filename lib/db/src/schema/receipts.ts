import { pgTable, serial, integer, text, numeric, timestamp, varchar } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { mastersTable } from "./masters";

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
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Receipt = typeof receiptsTable.$inferSelect;
