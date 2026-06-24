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
 * `furniture_products` — каталог мебели для подбора SKU в `Furniture_Matcher`
 * (AI_Design_Product, Requirement 10.1). Таблица создаётся миграцией
 * `artifacts/api-server/migrations/2026-01-15-ai-design-product.sql`.
 *
 * Hot-path запрос (`lib/furnitureMatcher.ts`):
 *   SELECT … FROM furniture_products
 *   WHERE is_available = true
 *     AND type = ?
 *     AND room_types @> ARRAY[?]
 *     AND style_tags && ARRAY[…]
 *     AND ABS(width_cm  - ?) <= 15
 *     AND ABS(depth_cm  - ?) <= 15
 *     AND ABS(height_cm - ?) <= 15
 *   ORDER BY price_kopeks ASC
 *
 * Индексы (см. миграцию):
 *   • `furniture_products_picker_idx`  — partial B-tree (type, is_available,
 *     price_kopeks) WHERE is_available = true. Покрывает фильтр + сортировку.
 *   • `furniture_products_styles_gin`  — GIN(style_tags) для быстрого `@>`/`&&`.
 *   • `furniture_products_rooms_gin`   — GIN(room_types) для быстрого `@>`.
 *
 * SKU уникален (`UNIQUE`), что используется сидом
 * `seedFurniture.ts` через `INSERT ... ON CONFLICT (sku) DO UPDATE`.
 */
export const furnitureProductsTable = pgTable(
  "furniture_products",
  {
    id: serial("id").primaryKey(),
    sku: varchar("sku", { length: 80 }).notNull().unique("furniture_products_sku_key"),
    name: varchar("name", { length: 200 }).notNull(),
    brand: varchar("brand", { length: 100 }),
    /** Цена в копейках (₽ × 100). CHECK price_kopeks >= 0 в миграции. */
    priceKopeks: integer("price_kopeks").notNull(),
    /** Габариты в сантиметрах (CHECK > 0 в миграции). */
    widthCm: integer("width_cm").notNull(),
    depthCm: integer("depth_cm").notNull(),
    heightCm: integer("height_cm").notNull(),
    /** Тип мебели: bed, wardrobe, nightstand, desk, chair, dresser, shelf, rug, … */
    type: varchar("type", { length: 40 }).notNull(),
    /** Совместимые стили (`modern`, `scandinavian`, `loft`, …). */
    styleTags: varchar("style_tags", { length: 40 }).array().notNull().default([]),
    /** Совместимые типы помещений (`bedroom`, `kitchen`, …). */
    roomTypes: varchar("room_types", { length: 40 }).array().notNull().default([]),
    imageUrl: text("image_url"),
    /** Партнёрская ссылка на покупку SKU (показ в `DesignBoard.tsx`). */
    partnerUrl: text("partner_url"),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    /**
     * Picker — горячий путь Furniture_Matcher: фильтр по type + is_available,
     * сортировка по цене. Partial index покрывает только доступные SKU.
     * Имя/состав согласованы с миграцией 2026-01-15-ai-design-product.sql.
     */
    pickerIdx: index("furniture_products_picker_idx").on(
      t.type,
      t.isAvailable,
      t.priceKopeks,
    ),
    /** GIN на массивы стилей: оператор `@>` / `&&` для подбора по стилю. */
    stylesGin: index("furniture_products_styles_gin").using("gin", t.styleTags),
    /** GIN на массивы типов помещений. */
    roomsGin: index("furniture_products_rooms_gin").using("gin", t.roomTypes),
  }),
);

export type FurnitureProduct = typeof furnitureProductsTable.$inferSelect;
export type InsertFurnitureProduct = typeof furnitureProductsTable.$inferInsert;
