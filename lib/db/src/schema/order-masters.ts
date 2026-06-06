import { pgTable, serial, integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { mastersTable } from "./masters";

export const orderMastersTable = pgTable("order_masters", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  tokensCharged: integer("tokens_charged").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderMasterSchema = createInsertSchema(orderMastersTable).omit({ id: true, createdAt: true });
export type InsertOrderMaster = z.infer<typeof insertOrderMasterSchema>;
export type OrderMaster = typeof orderMastersTable.$inferSelect;
