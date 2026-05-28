import { pgTable, serial, varchar, numeric, boolean, timestamp } from "drizzle-orm/pg-core";

export const cityTokenMultipliersTable = pgTable("city_token_multipliers", {
  id: serial("id").primaryKey(),
  city: varchar("city", { length: 150 }).notNull().unique(),
  multiplier: numeric("multiplier", { precision: 6, scale: 4 }).notNull().default("1.0000"),
  notes: varchar("notes", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CityTokenMultiplier = typeof cityTokenMultipliersTable.$inferSelect;
