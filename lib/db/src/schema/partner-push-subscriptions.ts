import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { trafficPartnersTable } from "./traffic-partners";

export const partnerPushSubscriptionsTable = pgTable("partner_push_subscriptions", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => trafficPartnersTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  partnerIdx: index("partner_push_partner_idx").on(t.partnerId),
}));
