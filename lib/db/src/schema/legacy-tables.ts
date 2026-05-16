// Legacy / external tables that exist in the database but are managed outside of Drizzle schema.
// Declared here to prevent drizzle-kit push from trying to drop them.

import { pgTable, varchar, json, text, timestamp, serial, integer, jsonb } from "drizzle-orm/pg-core";

export const sessionsTable = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

export const leadEventsTable = pgTable("lead_events", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id"),
  eventType: varchar("event_type", { length: 100 }),
  description: text("description"),
  userAlias: varchar("user_alias", { length: 255 }),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const browserAgentLogsTable = pgTable("browser_agent_logs", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id"),
  sessionId: varchar("session_id", { length: 255 }),
  actionType: varchar("action_type", { length: 100 }),
  description: text("description"),
  screenshotB64: text("screenshot_b64"),
  level: varchar("level", { length: 20 }),
  message: text("message"),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scenarioSettingsTable = pgTable("scenario_settings", {
  scenario: varchar("scenario", { length: 255 }).primaryKey(),
  autoEnabled: varchar("auto_enabled", { length: 10 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});
