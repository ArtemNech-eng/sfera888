import { pgTable, varchar, json, timestamp } from "drizzle-orm/pg-core";

export const userSessionsTable = pgTable("user_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});
