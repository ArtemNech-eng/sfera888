import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { usersTable } from "./users";

export const dispatchResendLogsTable = pgTable("dispatch_resend_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  resendNumber: integer("resend_number").notNull().default(1),
  scope: text("scope").notNull().default("non_responders"), // 'non_responders' | 'all'
  recipientCount: integer("recipient_count").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  createdBy: integer("created_by").references(() => usersTable.id),
  responseCount: integer("response_count").default(0),
});

export type DispatchResendLog = typeof dispatchResendLogsTable.$inferSelect;
