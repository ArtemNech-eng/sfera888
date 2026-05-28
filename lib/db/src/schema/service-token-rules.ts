import { pgTable, serial, varchar, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serviceTokenRulesTable = pgTable("service_token_rules", {
  id: serial("id").primaryKey(),
  serviceKey: varchar("service_key", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  calcType: varchar("calc_type", { length: 50 }).notNull().default("fixed"),
  minArea: numeric("min_area", { precision: 10, scale: 2 }),
  maxArea: numeric("max_area", { precision: 10, scale: 2 }),
  tokensCost: numeric("tokens_cost", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertServiceTokenRuleSchema = createInsertSchema(serviceTokenRulesTable).omit({ id: true, createdAt: true });
export type InsertServiceTokenRule = z.infer<typeof insertServiceTokenRuleSchema>;
export type ServiceTokenRule = typeof serviceTokenRulesTable.$inferSelect;
