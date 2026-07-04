import { pgTable, serial, integer, date, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { zhkTable } from "./zhk";

/**
 * `zhk_weekly_activity` — источник метрики Living_ZhK: число активных жителей ЖК
 * за неделю (Requirement 17.2, 17.3). Классификатор считает `active_residents`
 * за окно недели и присваивает ЖК статус `LIVING` при `>= N`, иначе `NON_LIVING`.
 *
 * Уникальность `(zhk_id, week_start)` гарантирует одну запись на ЖК/неделю
 * (идемпотентная агрегация через ON CONFLICT).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (migration 2026-01-20-community-baseline)
 */
export const zhkWeeklyActivityTable = pgTable(
  "zhk_weekly_activity",
  {
    id: serial("id").primaryKey(),
    zhkId: integer("zhk_id")
      .notNull()
      .references(() => zhkTable.id, { onDelete: "cascade" }),
    /** Начало недели (понедельник) агрегируемого окна. */
    weekStart: date("week_start").notNull(),
    activeResidents: integer("active_residents").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    zhkWeekKey: uniqueIndex("zhk_weekly_activity_zhk_week_key").on(t.zhkId, t.weekStart),
    zhkIdx: index("zhk_weekly_activity_zhk_idx").on(t.zhkId),
  }),
);

export const insertZhkWeeklyActivitySchema = createInsertSchema(zhkWeeklyActivityTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertZhkWeeklyActivity = z.infer<typeof insertZhkWeeklyActivitySchema>;
export type ZhkWeeklyActivity = typeof zhkWeeklyActivityTable.$inferSelect;
