import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  boolean,
  timestamp,
  numeric,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./settings";
import { leadsTable } from "./leads";

/**
 * designs — публичные / приватные AI-дизайны интерьеров клиентов маркетплейса.
 *
 * Хранит:
 *   • входное фото комнаты + сгенерированный AI-вариант,
 *   • тип помещения и стиль (для фасетного поиска и SEO),
 *   • статус генерации (`draft`, `generating`, `completed`, `failed`, `private`),
 *   • привязку к городу (для агрегаций /dizajn/[city]) и к лиду заказчика.
 *
 * Phase-1 storage and provider integration are intentionally NOT wired up —
 * `input_image_url` / `result_image_url` will be filled by the future
 * Recraft/Fal.ai pipeline. До этого момента таблица существует, но никакой
 * код её не пишет.
 *
 * Все новые поля nullable / с safe default, чтобы существующая логика
 * marketplace + CRM продолжала работать после применения миграции.
 */
export const designsTable = pgTable(
  "designs",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 160 }).unique("designs_slug_key"),
    clientPhoneHash: varchar("client_phone_hash", { length: 64 }),
    roomType: varchar("room_type", { length: 50 }).notNull(),
    style: varchar("style", { length: 50 }).notNull(),
    cityId: integer("city_id").references(() => citiesTable.id, { onDelete: "set null" }),
    district: varchar("district", { length: 100 }),
    area: numeric("area", { precision: 10, scale: 2 }),
    inputImageUrl: text("input_image_url"),
    resultImageUrl: text("result_image_url"),
    // Status convention (validated at the application layer, no PG enum):
    //   draft / generating / completed / failed / private
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    isPublic: boolean("is_public").notNull().default(false),
    publicConsentAt: timestamp("public_consent_at"),
    seoTitle: varchar("seo_title", { length: 120 }),
    seoDescription: varchar("seo_description", { length: 220 }),
    h1: varchar("h1", { length: 160 }),
    description: text("description"),
    estimatedPriceFrom: numeric("estimated_price_from", { precision: 10, scale: 2 }),
    estimatedPriceTo: numeric("estimated_price_to", { precision: 10, scale: 2 }),
    viewCount: integer("view_count").notNull().default(0),
    // Lambda-form `references` breaks the leads ⇄ designs import cycle:
    // both files import each other for FK targets, the closure resolves at
    // runtime when the module graph is fully loaded.
    leadId: integer("lead_id").references((): AnyPgColumn => leadsTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    publicStatusIdx: index("designs_public_status_idx").on(t.isPublic, t.status),
    cityRoomStyleIdx: index("designs_city_room_style_idx").on(t.cityId, t.roomType, t.style),
  }),
);

export const insertDesignSchema = createInsertSchema(designsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDesign = z.infer<typeof insertDesignSchema>;
export type Design = typeof designsTable.$inferSelect;
