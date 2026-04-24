import { pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const maxBotLogsTable = pgTable("max_bot_logs", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id"),
  maxUserId: varchar("max_user_id", { length: 50 }),
  event: varchar("event", { length: 100 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
