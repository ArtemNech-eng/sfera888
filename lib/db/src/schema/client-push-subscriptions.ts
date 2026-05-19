import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const clientPushSubscriptionsTable = pgTable("client_push_subscriptions", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  phoneIdx: index("client_push_phone_idx").on(t.phone),
}));
