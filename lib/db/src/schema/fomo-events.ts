import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

export const fomoEventsTable = pgTable("fomo_events", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull(),
  eventType: text("event_type").notNull(), // "blocked" | "unblocked" | "button_press"
  reason: text("reason"),
  orderId: integer("order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("fomo_events_master_id_idx").on(t.masterId),
  index("fomo_events_event_type_idx").on(t.eventType),
  index("fomo_events_created_at_idx").on(t.createdAt),
]);

export type FomoEvent = typeof fomoEventsTable.$inferSelect;
