import { pgTable, serial, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { serviceTypesTable } from "./settings";

/**
 * Словарь видов работ (Real Price, spec: `.kiro/specs/real-price`).
 *
 * Нормализует позиции смет Объекта к сравнимым единицам. Без привязки позиции к
 * `work_type` она НЕ попадает в агрегат цен (иначе цены несравнимы — Req 2.3).
 *
 * `category`:
 *   - `project` — крупный вид работ (санузел под ключ, комплексная отделка):
 *     Объект-проект получает страницу-кейс `/raboty/{slug}` + идёт в агрегат;
 *   - `task` — мелкая задача (замена смесителя, навеска): только в агрегат.
 *
 * `category` / прочие enum-подобные поля хранятся как `varchar` (не `pgEnum`) —
 * так проще идемпотентная runtime-миграция (без `CREATE TYPE`). Валидация — на
 * уровне приложения.
 */
export const workTypesTable = pgTable("work_types", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique("work_types_slug_key"),
  name: text("name").notNull(),
  category: varchar("category", { length: 16 }).notNull().default("project"),
  defaultUnit: varchar("default_unit", { length: 24 }),
  synonyms: text("synonyms").array().notNull().default([]),
  serviceTypeId: integer("service_type_id").references(() => serviceTypesTable.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWorkTypeSchema = createInsertSchema(workTypesTable).omit({ id: true, createdAt: true });
export type InsertWorkType = z.infer<typeof insertWorkTypeSchema>;
export type WorkType = typeof workTypesTable.$inferSelect;
