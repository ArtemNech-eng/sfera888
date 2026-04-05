import { pgTable, serial, integer, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { mastersTable } from "./masters";

export const botMemoryTable = pgTable("bot_memory", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").references(() => mastersTable.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 60 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BotMemory = typeof botMemoryTable.$inferSelect;
