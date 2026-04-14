import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const orderBroadcastWavesTable = pgTable("order_broadcast_waves", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  currentWave: integer("current_wave").notNull().default(1),
  wave1SentAt: timestamp("wave_1_sent_at"),
  wave2SentAt: timestamp("wave_2_sent_at"),
  wave3SentAt: timestamp("wave_3_sent_at"),
  wave4SentAt: timestamp("wave_4_sent_at"),
  adminAlertedAt: timestamp("admin_alerted_at"),
  wave1Count: integer("wave_1_count").notNull().default(0),
  wave2Count: integer("wave_2_count").notNull().default(0),
  wave3Count: integer("wave_3_count").notNull().default(0),
  wave4Count: integer("wave_4_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type OrderBroadcastWave = typeof orderBroadcastWavesTable.$inferSelect;
