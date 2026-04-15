import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const scenarioRunsTable = pgTable("scenario_runs", {
  id: serial("id").primaryKey(),
  scenario: text("scenario").notNull(),
  runType: text("run_type").notNull().default("manual"),
  status: text("status").notNull().default("running"),
  summary: jsonb("summary"),
  errorText: text("error_text"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
