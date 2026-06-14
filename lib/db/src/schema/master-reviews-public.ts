import { pgTable, serial, integer, text, varchar, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { mastersTable } from "./masters";
import { ordersTable } from "./orders";
import { usersTable } from "./users";

/**
 * master_reviews_public — публичные отзывы клиентов о мастере.
 *
 * ОТДЕЛЬНАЯ от существующей master_reviews (которая хранит ВНУТРЕННИЕ отзывы
 * операторов о мастере с sentiment positive/negative/neutral). master_reviews
 * НИКОГДА не публикуется на marketplace без модерации.
 *
 * Источники:
 *   - В V1 — оператор вручную в CRM копирует orders.client_review в публичный
 *     отзыв (с явной модерацией approved/rejected).
 *   - Позже (фаза 9) — клиентская PWA отправит форму отзыва после завершения
 *     заказа, modeartion_status='pending' до approve.
 */
export const masterReviewsPublicTable = pgTable("master_reviews_public", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  // FK на orders nullable — оператор может создать отзыв без привязки к заказу
  // (например, импорт из старого CRM или отзыв с другого канала).
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  clientName: varchar("client_name", { length: 150 }).notNull(),
  // sha256(phone) для дедупликации без хранения phone в открытом виде.
  clientPhoneHash: varchar("client_phone_hash", { length: 64 }),
  clientCity: varchar("client_city", { length: 100 }),
  // 1..5 — без CHECK в первой миграции, валидация на уровне API.
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  photos: text("photos").array().notNull().default([]),
  // pending / approved / rejected — отзывы публикуются только если approved.
  moderationStatus: varchar("moderation_status", { length: 20 }).notNull().default("pending"),
  moderatedBy: integer("moderated_by").references(() => usersTable.id, { onDelete: "set null" }),
  moderatedAt: timestamp("moderated_at"),
  moderationNote: text("moderation_note"),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  masterApprovedIdx: index("master_reviews_public_master_approved_idx").on(t.masterId, t.moderationStatus),
  pendingIdx: index("master_reviews_public_pending_idx").on(t.moderationStatus, t.createdAt),
}));

export type MasterReviewPublic = typeof masterReviewsPublicTable.$inferSelect;
export type InsertMasterReviewPublic = typeof masterReviewsPublicTable.$inferInsert;
