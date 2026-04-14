import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const scenarioNotificationsTable = pgTable("scenario_notifications", {
  id: serial("id").primaryKey(),
  scenarioId: varchar("scenario_id", { length: 64 }).notNull(),
  orderId: integer("order_id").notNull(),
  masterId: integer("master_id").notNull(),
  tier: varchar("tier", { length: 32 }).notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export type ScenarioNotification = typeof scenarioNotificationsTable.$inferSelect;
