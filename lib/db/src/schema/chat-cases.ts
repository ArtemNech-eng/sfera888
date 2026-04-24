import { pgTable, serial, integer, text, timestamp, numeric, boolean, index } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { mastersTable } from "./masters";

export const chatCasesTable = pgTable("chat_cases", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  city: text("city").notNull().default(""),
  district: text("district").notNull().default(""),
  serviceType: text("service_type").notNull().default(""),
  orderStatus: text("order_status").notNull().default(""),
  currentStage: text("current_stage").notNull().default("assigned"),
  riskLevel: text("risk_level").notNull().default("green"),
  riskReason: text("risk_reason"),
  summary: text("summary"),
  nextAction: text("next_action").notNull().default("no_action"),
  nextActionDeadline: timestamp("next_action_deadline"),
  lastMasterMessageAt: timestamp("last_master_message_at"),
  lastAiMessageAt: timestamp("last_ai_message_at"),
  hoursWithoutContact: numeric("hours_without_contact", { precision: 10, scale: 2 }),
  hoursWithoutEstimate: numeric("hours_without_estimate", { precision: 10, scale: 2 }),
  hoursWithoutPayment: numeric("hours_without_payment", { precision: 10, scale: 2 }),
  expectedRevenue: numeric("expected_revenue", { precision: 12, scale: 2 }),
  expectedCommission: numeric("expected_commission", { precision: 12, scale: 2 }),
  tags: text("tags").array().notNull().default([]),
  confidence: text("confidence").notNull().default("high"),
  isResolved: boolean("is_resolved").notNull().default(false),
  resolvedUntil: timestamp("resolved_until"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("chat_cases_order_id_idx").on(t.orderId),
  index("chat_cases_master_id_idx").on(t.masterId),
  index("chat_cases_risk_level_idx").on(t.riskLevel),
  index("chat_cases_current_stage_idx").on(t.currentStage),
  index("chat_cases_updated_at_idx").on(t.updatedAt),
  index("chat_cases_deadline_idx").on(t.nextActionDeadline),
]);

export type ChatCase = typeof chatCasesTable.$inferSelect;
export type InsertChatCase = typeof chatCasesTable.$inferInsert;
