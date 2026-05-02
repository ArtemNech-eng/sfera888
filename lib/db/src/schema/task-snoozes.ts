import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const taskSnoozesTable = pgTable("task_snoozes", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull().unique(),
  snoozedUntil: timestamp("snoozed_until").notNull(),
  snoozedBy: text("snoozed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
