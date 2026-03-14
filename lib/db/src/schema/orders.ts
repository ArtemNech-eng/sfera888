import { pgTable, serial, integer, text, timestamp, numeric, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leadsTable } from "./leads";
import { mastersTable } from "./masters";

export const orderStatusEnum = pgEnum("order_status", [
  "waiting_master",
  "master_assigned",
  "in_progress",
  "completed",
  "cancelled",
]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id),
  city: text("city").notNull(),
  district: text("district").notNull(),
  serviceType: text("service_type").notNull(),
  area: numeric("area", { precision: 10, scale: 2 }).notNull(),
  scheduledAt: timestamp("scheduled_at"),
  comment: text("comment"),
  status: orderStatusEnum("status").notNull().default("waiting_master"),
  masterId: integer("master_id").references(() => mastersTable.id),
  orderAmount: numeric("order_amount", { precision: 12, scale: 2 }),
  commission: numeric("commission", { precision: 12, scale: 2 }),
  clientRating: integer("client_rating"),
  dispatchStatus: text("dispatch_status").notNull().default("none"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
