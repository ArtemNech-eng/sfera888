import { pgTable, serial, integer, date, boolean, timestamp, text, unique } from "drizzle-orm/pg-core";
import { mastersTable } from "./masters";

export const masterCheckinsTable = pgTable("master_checkins", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  date: date("date").notNull(),
  isAvailable: boolean("is_available"),
  reason: text("reason"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  masterDateUnique: unique("master_checkins_master_id_date_key").on(table.masterId, table.date),
}));
