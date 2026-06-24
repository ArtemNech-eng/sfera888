import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * `finishing_materials` — каталог отделочных материалов для подбора в
 * `Materials_Estimator` и расчёта Real_Estimate (AI_Design_Product,
 * Requirement 11.1). Таблица создаётся миграцией
 * `artifacts/api-server/migrations/2026-01-15-ai-design-product.sql`.
 *
 * Категории (CHECK constraint в миграции): walls / floor / ceiling / other.
 * Единицы измерения (CHECK constraint в миграции): sqm / pcs.
 *
 * Hot-path запрос (`lib/materialsEstimator.ts`):
 *   SELECT … FROM finishing_materials
 *   WHERE is_available = true
 *     AND category   = ?
 *     AND room_types @> ARRAY[?]
 *     AND style_tags && ARRAY[…]
 *   ORDER BY price_per_unit_kopeks ASC
 *
 * Индексы (см. миграцию):
 *   • `finishing_materials_picker_idx`  — partial B-tree (category, is_available,
 *     price_per_unit_kopeks) WHERE is_available = true.
 *   • `finishing_materials_styles_gin`  — GIN(style_tags).
 *   • `finishing_materials_rooms_gin`   — GIN(room_types).
 */
export const finishingMaterialsTable = pgTable(
  "finishing_materials",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 80 }).notNull().unique("finishing_materials_sku_key"),
    name: varchar("name", { length: 200 }).notNull(),
    brand: varchar("brand", { length: 100 }),
    /** Категория поверхности: 'walls' | 'floor' | 'ceiling' | 'other'. */
    category: varchar("category", { length: 20 }).notNull(),
    /** Единица измерения цены: 'sqm' | 'pcs'. */
    unit: varchar("unit", { length: 10 }).notNull(),
    /** Цена за единицу (м² или шт.) в копейках. CHECK >= 0 в миграции. */
    pricePerUnitKopeks: integer("price_per_unit_kopeks").notNull(),
    /** Совместимые стили. */
    styleTags: varchar("style_tags", { length: 40 }).array().notNull().default([]),
    /** Совместимые типы помещений. */
    roomTypes: varchar("room_types", { length: 40 }).array().notNull().default([]),
    /** Партнёрская ссылка на покупку. */
    partnerUrl: text("partner_url"),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    /** Picker — фильтр по категории + сортировка по цене. */
    pickerIdx: index("finishing_materials_picker_idx").on(
      t.category,
      t.isAvailable,
      t.pricePerUnitKopeks,
    ),
    /** GIN на массивы стилей. */
    stylesGin: index("finishing_materials_styles_gin").using("gin", t.styleTags),
    /** GIN на массивы типов помещений. */
    roomsGin: index("finishing_materials_rooms_gin").using("gin", t.roomTypes),
  }),
);

export type FinishingMaterial = typeof finishingMaterialsTable.$inferSelect;
export type InsertFinishingMaterial = typeof finishingMaterialsTable.$inferInsert;
