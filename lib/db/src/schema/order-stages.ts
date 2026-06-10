import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const orderStageStatusEnum = pgEnum("order_stage_status", ["pending", "paid"]);

export const orderStagesTable = pgTable("order_stages", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  stageName: text("stage_name").notNull(),
  stageAmount: numeric("stage_amount", { precision: 12, scale: 2 }).notNull(),
  commissionAmount: numeric("commission_amount", { precision: 12, scale: 2 }).notNull(),
  paymentStatus: orderStageStatusEnum("payment_status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderStageSchema = createInsertSchema(orderStagesTable).omit({ id: true, createdAt: true });
export type InsertOrderStage = z.infer<typeof insertOrderStageSchema>;
export type OrderStage = typeof orderStagesTable.$inferSelect;
