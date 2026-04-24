import { pgTable, serial, integer, text, timestamp, numeric, pgEnum, boolean, index } from "drizzle-orm/pg-core";
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
  cancelType: text("cancel_type"),
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
  broadcastCount: integer("broadcast_count").notNull().default(0),
  lastBroadcastAt: timestamp("last_broadcast_at"),
  avitoLeadId: text("avito_lead_id"),
  avitoChatId: text("avito_chat_id"),
  clientName: text("client_name"),
  clientPhone: text("client_phone"),
  roomsCount: integer("rooms_count"),
  prepaymentAmount: numeric("prepayment_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  prepaymentDeducted: boolean("prepayment_deducted").notNull().default(false),
  clientReview: text("client_review"),
  reviewedAt: timestamp("reviewed_at"),
  masterComment: text("master_comment"),
  photos: text("photos").array(),
  source: text("source").notNull().default("crm"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => ({
  // Индексы для частых запросов:
  // 1) Лента задач, мониторинг "ожидают мастера", фильтр по статусу
  statusActiveIdx: index("orders_status_active_idx").on(t.status, t.deletedAt, t.lastBroadcastAt),
  // 2) Поиск заказа по leadId (показ "перейти к заказу" в карточке заявки)
  leadIdx: index("orders_lead_id_idx").on(t.leadId),
  // 3) Активные заказы мастера (мобильное приложение, страница "Мои заказы")
  masterStatusIdx: index("orders_master_status_idx").on(t.masterId, t.status, t.deletedAt),
  // 4) Поиск завершённых для аналитики/комиссий
  completedAtIdx: index("orders_completed_at_idx").on(t.completedAt),
}));

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
