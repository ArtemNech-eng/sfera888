import { pgTable, serial, integer, numeric, varchar, text, timestamp, jsonb, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { workTypesTable } from "./work-types";

/**
 * Денормализованная витрина агрегатов цен (Real Price, spec: `.kiro/specs/real-price`).
 *
 * Считается из `price_points` (медиана + P25/P75 + отсечение выбросов) по ключам:
 *   - `work_city` — (вид работ × город); `district = ''`;
 *   - `work_zhk`  — (вид работ × ЖК/район); `district` = ЖК/район.
 *
 * Публикуется/индексируется только при `n ≥ порог` (`is_indexable`), иначе
 * страница `noindex` или склейка до города (Req 4.4). `series12m` — помесячный
 * ряд для графика и индекса.
 */
export const priceAggregatesTable = pgTable("price_aggregates", {
  id: serial("id").primaryKey(),
  keyType: varchar("key_type", { length: 16 }).notNull(), // work_city | work_zhk
  workTypeId: integer("work_type_id").notNull().references(() => workTypesTable.id, { onDelete: "cascade" }),
  city: text("city").notNull().default(""),
  district: text("district").notNull().default(""), // ЖК/район для work_zhk; '' для work_city
  unit: varchar("unit", { length: 24 }),
  p25: numeric("p25", { precision: 12, scale: 2 }),
  p50: numeric("p50", { precision: 12, scale: 2 }),
  p75: numeric("p75", { precision: 12, scale: 2 }),
  n: integer("n").notNull().default(0),
  series12m: jsonb("series_12m").$type<Array<{ month: string; p50: number; n: number }>>().notNull().default([]),
  isIndexable: boolean("is_indexable").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  keyUnique: uniqueIndex("price_aggregates_key_uidx").on(t.keyType, t.workTypeId, t.city, t.district),
}));

export const insertPriceAggregateSchema = createInsertSchema(priceAggregatesTable).omit({ id: true, updatedAt: true });
export type InsertPriceAggregate = z.infer<typeof insertPriceAggregateSchema>;
export type PriceAggregate = typeof priceAggregatesTable.$inferSelect;
