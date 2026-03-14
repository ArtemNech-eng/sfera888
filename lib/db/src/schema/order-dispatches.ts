import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { mastersTable } from "./masters";

export const dispatchStatusEnum = pgEnum("dispatch_status", [
  "sent",
  "responded",
  "assigned",
  "rejected",
]);

export const orderDispatchesTable = pgTable("order_dispatches", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  telegramChatId: text("telegram_chat_id").notNull(),
  telegramMessageId: text("telegram_message_id"),
  status: dispatchStatusEnum("status").notNull().default("sent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
});

export type OrderDispatch = typeof orderDispatchesTable.$inferSelect;
