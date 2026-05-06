import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { mastersTable } from "./masters";

export const orderMasterHistoryTable = pgTable("order_master_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  /** Status of the order when it was with this master: assigned, completed, cancelled, returned_to_pool */
  status: text("status").notNull(),
  /** When the master was assigned to this order */
  assignedAt: timestamp("assigned_at"),
  /** When the master was removed from this order (completed / cancelled / returned) */
  removedAt: timestamp("removed_at").notNull().defaultNow(),
  /** Reason for removal (cancel reason, "no_estimate", etc.) */
  cancelReason: text("cancel_reason"),
  /** Order amount at the time of removal (snapshot) */
  orderAmount: numeric("order_amount"),
  /** Service type snapshot */
  serviceType: text("service_type"),
  /** City snapshot */
  city: text("city"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OrderMasterHistory = typeof orderMasterHistoryTable.$inferSelect;
