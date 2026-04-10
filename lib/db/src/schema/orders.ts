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
  "cancellation_requested",
]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id),
  city: text("city").notNull(),
  district: text("district").notNull(),
  serviceType: text("service_type").notNull(),
  area: numeric("area", { precision: 10, scale: 2 }).notNull(),
  services: text("services"),
  scheduledAt: timestamp("scheduled_at"),
  comment: text("comment"),
  status: orderStatusEnum("status").notNull().default("waiting_master"),
  masterId: integer("master_id").references(() => mastersTable.id),
  proposedAmount: numeric("proposed_amount", { precision: 12, scale: 2 }),
  orderAmount: numeric("order_amount", { precision: 12, scale: 2 }),
  commission: numeric("commission", { precision: 12, scale: 2 }),
  clientRating: integer("client_rating"),
  cancelReason: text("cancel_reason"),
  cancelType: text("cancel_type"), // "client_refused" | "price_disagreement" | "master_cant" | "other"
  dispatchStatus: text("dispatch_status").notNull().default("none"),
  masterWorkStatus: text("master_work_status"),
  operatorNote: text("operator_note"),
  assignedAt: timestamp("assigned_at"),
  completedAt: timestamp("completed_at"),
  photosBefore: text("photos_before").array().notNull().default([]),
  photosAfter: text("photos_after").array().notNull().default([]),
  photoAct: text("photo_act"),
  responseWindowCloseAt: timestamp("response_window_close_at"),
  dispatchWave: integer("dispatch_wave").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
