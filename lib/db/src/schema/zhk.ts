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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./settings";
import { communityAccountsTable } from "./community-accounts";

/** Статус живого сообщества ЖК (Requirement 17.2). */
export type ZhkStatus = "LIVING" | "NON_LIVING";

/** Тип локальной единицы сообщества (Requirement 1.2). */
export type LocalityKind = "zhk" | "district" | "settlement";

/** Допустимые значения Locality_Kind (Requirement 1.2, 1.5). */
export const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;

/** Значение по умолчанию — обратная совместимость (Requirement 1.4, 9.1, 9.6). */
export const DEFAULT_LOCALITY_KIND: LocalityKind = "zhk";

/** Один корпус ЖК (произвольная структура, отображается только при заполнении). */
export interface ZhkBuilding {
  name: string;
  completionDate?: string | null;
}

/**
 * `zhk` (ZhK_Record) — жилой комплекс, базовая единица контента, удержания и SEO
 * (Requirement 1.1). Каждый ZhK принадлежит ровно одному городу (`city_id`);
 * город содержит 0..∞ ЖК.
 *
 * Дедупликация в пределах города — по `name_normalized` = `lower(trim(name))`
 * (Requirement 4.5). Дедуп выполняется на уровне сервиса (возвращает
 * существующий ЖК вместо падения), поэтому индекс `(city_id, name_normalized)`
 * — поисковый, не жёстко-уникальный (см. design.md → Data Models).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (migration 2026-01-20-community-baseline)
 */
export const zhkTable = pgTable(
  "zhk",
  {
    id: serial("id").primaryKey(),
    /** Публичный URL-slug, глобально уникальный, `^[a-z0-9-]{1,100}$` (Requirement 1.6). */
    slug: varchar("slug", { length: 100 }).notNull().unique("zhk_slug_key"),
    /** Название ЖК, 2..100 символов (Requirement 4.2). */
    name: varchar("name", { length: 100 }).notNull(),
    /** `lower(trim(name))` для дедупликации в городе (Requirement 4.5). */
    nameNormalized: varchar("name_normalized", { length: 100 }).notNull(),
    /** Родительский City — ровно один (Requirement 1.1). */
    cityId: integer("city_id")
      .notNull()
      .references(() => citiesTable.id, { onDelete: "cascade" }),
    /**
     * Дискриминатор типа локальности: `zhk | district | settlement`
     * (Requirement 1.2, 1.4). DEFAULT `'zhk'` сохраняет все дострадийные строки
     * как ЖК без миграции данных (Requirement 9.1, 9.6).
     */
    kind: varchar("kind", { length: 16 }).notNull().default("zhk"),
    /** Атрибут: застройщик (Requirement 1.7). NULL = не отображать. */
    developer: varchar("developer", { length: 200 }),
    /** Атрибут: срок сдачи (Requirement 1.7). */
    completionDate: varchar("completion_date", { length: 40 }),
    /** Атрибут: список корпусов (Requirement 1.7). */
    buildings: jsonb("buildings").$type<ZhkBuilding[]>(),
    /** Статус живого сообщества (Requirement 17.2). */
    status: varchar("status", { length: 20 }).notNull().default("NON_LIVING"),
    /** Создан сидированием (true) или жителем (false) (Requirement 4, 16.2). */
    isSeeded: boolean("is_seeded").notNull().default(false),
    /** Оценка контента — гейт «тонких» страниц (Requirement 16.3). */
    contentScore: integer("content_score").notNull().default(0),
    /** Публикуется в sitemap только при прохождении порога контента (Requirement 16.3). */
    isIndexable: boolean("is_indexable").notNull().default(false),
    /** Автор-житель, создавший запись (Requirement 4.1). */
    createdByAccountId: integer("created_by_account_id").references(
      (): AnyPgColumn => communityAccountsTable.id,
      { onDelete: "set null" },
    ),
    /** SEO-метаданные (как в `cities`). */
    seoTitle: varchar("seo_title", { length: 70 }),
    seoDescription: varchar("seo_description", { length: 180 }),
    h1: varchar("h1", { length: 100 }),
    bodyMd: text("body_md"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    /**
     * Поисковый индекс дедупликации ЖК в пределах города (Requirement 4.5).
     * Не UNIQUE: дедуп на уровне сервиса возвращает существующий ЖК, а не падает.
     */
    cityNameNormalizedIdx: index("zhk_city_name_normalized_idx").on(t.cityId, t.nameNormalized),
    cityStatusIdx: index("zhk_city_status_idx").on(t.cityId, t.status),
    /** Листинг/фильтрация локаций города по типу (Requirement 2.4). */
    cityKindIdx: index("zhk_city_kind_idx").on(t.cityId, t.kind),
  }),
);

export const insertZhkSchema = createInsertSchema(zhkTable).omit({
  id: true,
  createdAt: true,
});
export type InsertZhk = z.infer<typeof insertZhkSchema>;
export type Zhk = typeof zhkTable.$inferSelect;
