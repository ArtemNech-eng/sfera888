import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const operatorPushSubscriptionsTable = pgTable("operator_push_subscriptions", {
  id: serial("id").primaryKey(),
  operatorId: text("operator_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
