import { pgTable, serial, integer, numeric, timestamp, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { mastersTable } from "./masters";

export const mlPricingDecisionsTable = pgTable("ml_pricing_decisions", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  masterId: integer("master_id").references(() => mastersTable.id),
  tokensCharged: numeric("tokens_charged", { precision: 10, scale: 2 }).notNull(),
  maxMasters: integer("max_masters").notNull(),
  assignedCount: integer("assigned_count").notNull(),
  serviceType: text("service_type"),
  city: text("city"),
  district: text("district"),
  area: numeric("area", { precision: 10, scale: 2 }),
  scheduledAt: timestamp("scheduled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  hourOfDay: integer("hour_of_day"),
  isWeekend: boolean("is_weekend"),
  masterRating: numeric("master_rating", { precision: 3, scale: 2 }),
  masterExperience: integer("master_experience"),
});

export const insertMlPricingDecisionSchema = createInsertSchema(mlPricingDecisionsTable).omit({ id: true, createdAt: true });
export type InsertMlPricingDecision = z.infer<typeof insertMlPricingDecisionSchema>;
export type MlPricingDecision = typeof mlPricingDecisionsTable.$inferSelect;
