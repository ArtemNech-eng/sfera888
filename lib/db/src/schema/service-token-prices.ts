import { pgTable, serial, varchar, numeric, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serviceTokenPricesTable = pgTable("service_token_prices", {
  id: serial("id").primaryKey(),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  serviceKey: varchar("service_key", { length: 100 }).notNull().unique(),
  tokensCost: numeric("tokens_cost", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertServiceTokenPriceSchema = createInsertSchema(serviceTokenPricesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceTokenPrice = z.infer<typeof insertServiceTokenPriceSchema>;
export type ServiceTokenPrice = typeof serviceTokenPricesTable.$inferSelect;
