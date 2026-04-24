import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { mastersTable } from "./masters";
import { ordersTable } from "./orders";

export const taskStatusEnum = pgEnum("task_status", ["open", "in_progress", "done", "snoozed"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);
export const taskCategoryEnum = pgEnum("task_category", [
  "followup",
  "payment",
  "amount_check",
  "report_check",
  "quality_check",
  "rating",
  "general",
]);
export const taskTypeEnum = pgEnum("task_type", ["manual", "ai_auto"]);

export const systemTasksTable = pgTable("system_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: taskTypeEnum("type").notNull().default("manual"),
  status: taskStatusEnum("status").notNull().default("open"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  category: taskCategoryEnum("category").notNull().default("general"),
  assignedTo: text("assigned_to"),
  relatedMasterId: integer("related_master_id").references(() => mastersTable.id, { onDelete: "set null" }),
  relatedOrderId: integer("related_order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  completedBy: text("completed_by"),
  aiReason: text("ai_reason"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SystemTask = typeof systemTasksTable.$inferSelect;
