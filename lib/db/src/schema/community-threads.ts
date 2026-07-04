import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./settings";
import { zhkTable } from "./zhk";
import { specialtiesTable } from "./specialties";
import { communityAccountsTable } from "./community-accounts";

/**
 * `community_threads` — темы City_Feed / Local_Feed / PRO. Одна таблица
 * обслуживает обе публичные зоны и защищённый слой, различаясь дискриминатором
 * `zone` (Requirement 8.1). Изоляция зон — на уровне запросов (фильтр по `zone`).
 *
 *   • `zone`  : `sosedi` | `pro_public` | `pro_protected`
 *   • `scope` : `city` | `zhk` | `pro`
 *   • `visibility` : `public` | `protected` | `hidden` (Requirement 19.2)
 *   • `moderation_status` : `not_screened` | … — НЕ является гейтом видимости
 *     (Requirement 19.1)
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (migration 2026-01-20-community-baseline)
 */
export const communityThreadsTable = pgTable(
  "community_threads",
  {
    id: serial("id").primaryKey(),
    /** Дискриминатор зоны (Requirement 8.1). */
    zone: varchar("zone", { length: 20 }).notNull(),
    /** Уровень темы: город / ЖК / PRO. */
    scope: varchar("scope", { length: 10 }).notNull(),
    /** Для scope `city` / `pro`. */
    cityId: integer("city_id").references(() => citiesTable.id, { onDelete: "set null" }),
    /** Для scope `zhk` (Requirement 3.3). */
    zhkId: integer("zhk_id").references(() => zhkTable.id, { onDelete: "cascade" }),
    /** Для PRO-тем по специальности (Requirement 6.1). */
    specialtyId: integer("specialty_id").references(() => specialtiesTable.id, {
      onDelete: "set null",
    }),
    /** Локальная PRO-тема для My_City_Filter (Requirement 6.4). */
    isLocal: boolean("is_local").notNull().default(false),
    /** Категория Local_Feed (Requirement 3.1) / PRO (Requirement 6.8). */
    category: varchar("category", { length: 40 }),
    /** Заголовок, 1..200 символов (Requirement 3.4). */
    title: varchar("title", { length: 200 }).notNull(),
    /** Тело, ≤ 5000 символов (Requirement 3.4). */
    body: text("body").notNull(),
    /** Автор; NULL для сид-контента. */
    authorAccountId: integer("author_account_id").references(() => communityAccountsTable.id, {
      onDelete: "set null",
    }),
    /** Авто/сид-темы (Requirement 16.2). */
    isSeeded: boolean("is_seeded").notNull().default(false),
    /** `public` | `protected` | `hidden` (Requirement 19.2). */
    visibility: varchar("visibility", { length: 12 }).notNull().default("public"),
    /** Не гейт видимости (Requirement 19.1). */
    moderationStatus: varchar("moderation_status", { length: 16 }).notNull().default("not_screened"),
    /** Сортировка City_Feed по активности (Requirement 2.3). */
    lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
    /** Сортировка лент по дате создания (Requirement 1.2, 1.4). */
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    /** City_Feed: темы уровня города, сортировка по дате (Requirement 1.2). */
    scopeCityCreatedIdx: index("community_threads_scope_city_created_idx").on(
      t.scope,
      t.cityId,
      t.createdAt,
    ),
    /** Local_Feed: темы ЖК, сортировка по дате (Requirement 1.4, 3.3). */
    scopeZhkCreatedIdx: index("community_threads_scope_zhk_created_idx").on(
      t.scope,
      t.zhkId,
      t.createdAt,
    ),
    /** PRO: All_Russia / My_City_Filter по специальности (Requirement 6.2, 6.4). */
    zoneSpecialtyLocalCityIdx: index("community_threads_zone_specialty_local_city_idx").on(
      t.zone,
      t.specialtyId,
      t.isLocal,
      t.cityId,
    ),
    /** Изоляция зон + фильтрация по городу (Requirement 8.1). */
    zoneCityIdx: index("community_threads_zone_city_idx").on(t.zone, t.cityId),
    zhkIdx: index("community_threads_zhk_idx").on(t.zhkId),
    specialtyIdx: index("community_threads_specialty_idx").on(t.specialtyId),
  }),
);

/**
 * `community_thread_drafts` — сохранённый ввод при отклонённой публикации, чтобы
 * ввод пользователя не терялся даже если доставка сообщения об ошибке не удалась
 * (Requirement 3.4, 11.3).
 */
export const communityThreadDraftsTable = pgTable("community_thread_drafts", {
  id: serial("id").primaryKey(),
  authorAccountId: integer("author_account_id").references(() => communityAccountsTable.id, {
    onDelete: "set null",
  }),
  /** Исходные введённые данные темы/поста. */
  payload: jsonb("payload").notNull(),
  /** Код причины отклонения (напр. `INVALID_TITLE`, `NO_ZHK_BINDING`). */
  reason: varchar("reason", { length: 40 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCommunityThreadSchema = createInsertSchema(communityThreadsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCommunityThread = z.infer<typeof insertCommunityThreadSchema>;
export type CommunityThread = typeof communityThreadsTable.$inferSelect;

export const insertCommunityThreadDraftSchema = createInsertSchema(communityThreadDraftsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCommunityThreadDraft = z.infer<typeof insertCommunityThreadDraftSchema>;
export type CommunityThreadDraft = typeof communityThreadDraftsTable.$inferSelect;
