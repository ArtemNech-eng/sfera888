import { pgTable, serial, integer, date, boolean, timestamp } from "drizzle-orm/pg-core";
import { mastersTable } from "./masters";

export const masterCheckinsTable = pgTable("master_checkins", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  date: date("date").notNull(),
  isAvailable: boolean("is_available"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
