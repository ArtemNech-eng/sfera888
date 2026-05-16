import { pgTable, serial, varchar, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokenPackagesTable = pgTable("token_packages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  tokensCount: numeric("tokens_count", { precision: 10, scale: 2 }).notNull(),
  priceRub: integer("price_rub").notNull(),
  pricePerToken: numeric("price_per_token", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTokenPackageSchema = createInsertSchema(tokenPackagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTokenPackage = z.infer<typeof insertTokenPackageSchema>;
export type TokenPackage = typeof tokenPackagesTable.$inferSelect;
