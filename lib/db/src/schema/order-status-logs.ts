import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

export const orderStatusLogsTable = pgTable("order_status_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  oldStatus: text("old_status"),
  newStatus: text("new_status").notNull(),
  userId: integer("user_id"),
  userAlias: text("user_alias"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OrderStatusLog = typeof orderStatusLogsTable.$inferSelect;
