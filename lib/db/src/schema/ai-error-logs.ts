import { pgTable, serial, timestamp, text, integer, boolean, varchar } from "drizzle-orm/pg-core";

export const aiErrorLogs = pgTable("ai_error_logs", {
  id: serial("id").primaryKey(),
  errorId: varchar("error_id", { length: 16 }).notNull().unique(),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  level: varchar("level", { length: 20 }).notNull(),
  source: varchar("source", { length: 100 }).notNull(),
  message: text("message").notNull(),
  count: integer("count").notNull().default(1),
  severity: varchar("severity", { length: 20 }).notNull(),
  sampleLine: integer("sample_line"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AIErrorLog = typeof aiErrorLogs.$inferSelect;
export type NewAIErrorLog = typeof aiErrorLogs.$inferInsert;
