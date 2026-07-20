import { pgTable, serial, integer, numeric, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { receiptsTable } from "./receipts";
import { mastersTable } from "./masters";
import { workTypesTable } from "./work-types";

/**
 * Нормализованная ценовая точка (Real Price, spec: `.kiro/specs/real-price`).
 *
 * Формируется при завершении заказа из позиций сметы Объекта — только позиции с
 * `work_type_id` (Req 3.1–3.3). Источник агрегатов цен (`percentile_cont`, как в
 * `/raboty/market-stats`). Публичные страницы используют агрегаты, а не эти
 * строки напрямую.
 *
 * `source` = `platform` (подтверждённая комиссионная сделка) | `self_added`
 * (мастер добавил прошлую работу — помечается отдельно, не «подтверждено»).
 */
export const pricePointsTable = pgTable("price_points", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  receiptId: integer("receipt_id").references(() => receiptsTable.id, { onDelete: "set null" }),
  masterId: integer("master_id").references(() => mastersTable.id),
  workTypeId: integer("work_type_id").notNull().references(() => workTypesTable.id),
  unit: varchar("unit", { length: 24 }),
  quantity: numeric("quantity", { precision: 12, scale: 2 }),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  total: numeric("total", { precision: 12, scale: 2 }),
  city: text("city"),
  district: text("district"),
  zhk: varchar("zhk", { length: 160 }),
  source: varchar("source", { length: 16 }).notNull().default("platform"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  // Агрегация по (вид работ × город) с временны́м окном для ряда 12 мес.
  workCityIdx: index("price_points_work_city_idx").on(t.workTypeId, t.city, t.closedAt),
  // Агрегация по (вид работ × район/ЖК).
  workDistrictIdx: index("price_points_work_district_idx").on(t.workTypeId, t.district),
}));

export const insertPricePointSchema = createInsertSchema(pricePointsTable).omit({ id: true, createdAt: true });
export type InsertPricePoint = z.infer<typeof insertPricePointSchema>;
export type PricePoint = typeof pricePointsTable.$inferSelect;
