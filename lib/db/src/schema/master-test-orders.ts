import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";
import { ordersTable } from "./orders";

export const masterTestOrdersTable = pgTable("master_test_orders", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  isTest: boolean("is_test").notNull().default(true),
  usedAt: timestamp("used_at").notNull().defaultNow(),
});

export const insertMasterTestOrderSchema = createInsertSchema(masterTestOrdersTable).omit({ id: true, usedAt: true });
export type InsertMasterTestOrder = z.infer<typeof insertMasterTestOrderSchema>;
export type MasterTestOrder = typeof masterTestOrdersTable.$inferSelect;
