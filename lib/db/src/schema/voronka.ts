import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const voronkaColumnsTable = pgTable("voronka_columns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  receivesOrders: boolean("receives_orders").notNull().default(false),
  color: text("color").notNull().default("blue"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type VoronkaColumn = typeof voronkaColumnsTable.$inferSelect;
