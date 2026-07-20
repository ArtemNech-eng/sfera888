import { pgTable, serial, integer, text, numeric, timestamp, varchar, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { mastersTable } from "./masters";

export interface LineItem {
  description: string;
  unit?: string;
  quantity?: number;
  price: number;
}

/**
 * Позиция сметы внутри этапа Объекта (Real Price). Ссылается на словарь видов
 * работ (`workTypeId`) — без него позиция не идёт в агрегат цен.
 */
export interface ObjectStageLine {
  workTypeId?: number | null;
  name: string;
  unit?: string;
  quantity?: number;
  unitPrice: number;
  sum?: number;
}

/** Этап сметы Объекта (Демонтаж → Черновые → Плитка → Сантехника …). */
export interface ObjectStage {
  title: string;
  order: number;
  lineItems: ObjectStageLine[];
}

export const receiptsTable = pgTable("receipts", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique("receipts_token_key"),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  serviceType: text("service_type").notNull(),
  city: text("city").notNull(),
  district: text("district"),
  lineItems: jsonb("line_items").$type<LineItem[]>().notNull().default([]),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  prepaymentAmount: numeric("prepayment_amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Client confirmation fields
  clientSubmittedName: text("client_submitted_name"),
  prepaymentSubmittedAt: timestamp("prepayment_submitted_at"),
  prepaymentScreenshotUrl: text("prepayment_screenshot_url"),
  prepaymentSeenAt: timestamp("prepayment_seen_at"),

  // ── Real Price — эволюция сметы в «Объект» (spec: .kiro/specs/real-price) ───
  // Additive-поля. Всё nullable / safe-default: существующий receipt-флоу
  // (оплата/подтверждение, /receipt/:token, paymentState, CRM/PWA, 25+ модулей)
  // не затрагивается. Модель: 1 заказ = 1 Объект.
  objectType: varchar("object_type", { length: 16 }),            // project | task
  source: varchar("source", { length: 16 }).notNull().default("platform"), // platform | self_added
  area: numeric("area", { precision: 10, scale: 2 }),
  zhk: varchar("zhk", { length: 160 }),                          // ЖК (публично), без точного адреса
  stages: jsonb("stages").$type<ObjectStage[]>().notNull().default([]),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  isIndexable: boolean("is_indexable").notNull().default(false), // meetsContentThreshold(...)
  publishConsent: boolean("publish_consent").notNull().default(false), // согласие клиента на фото
  slug: varchar("slug", { length: 120 }).unique("receipts_slug_key"),
  seoTitle: varchar("seo_title", { length: 70 }),
  seoDescription: varchar("seo_description", { length: 180 }),
  publicTitle: varchar("public_title", { length: 150 }),
}, (t) => ({
  // Лента задач "подтвердить оплату сметы" и подсчёт непрочитанных
  pendingConfirmIdx: index("receipts_pending_confirm_idx").on(t.prepaymentSubmittedAt, t.prepaymentSeenAt),
  // Сметы по заказу (показ в карточке)
  orderIdx: index("receipts_order_id_idx").on(t.orderId),
}));

export type Receipt = typeof receiptsTable.$inferSelect;
