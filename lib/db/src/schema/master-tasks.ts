import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { mastersTable } from "./masters";

export const masterTasksTable = pgTable("master_tasks", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  dueAt: timestamp("due_at"),
  isCompleted: boolean("is_completed").notNull().default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MasterTask = typeof masterTasksTable.$inferSelect;
