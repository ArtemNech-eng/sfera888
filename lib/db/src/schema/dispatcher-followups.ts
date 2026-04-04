import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const dispatcherFollowupsTable = pgTable("dispatcher_followups", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull(),
  orderId: integer("order_id"),
  followupAt: timestamp("followup_at").notNull(),
  question: text("question").notNull(),
  context: text("context"),
  sent: boolean("sent").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DispatcherFollowup = typeof dispatcherFollowupsTable.$inferSelect;
