import { pgTable, serial, text, timestamp, varchar, integer, boolean, numeric, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── cities ───────────────────────────────────────────────────────────────────
// Existing minimal table (id, name) used by master-pwa city picker and CRM
// settings → extended with marketplace SEO fields. All new columns are nullable
// (or have safe defaults) so the existing CRM/PWA code keeps working unchanged.
export const citiesTable = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // ── Marketplace fields (added in 0005_marketplace_baseline) ────────────────
  slug: varchar("slug", { length: 100 }).unique("cities_slug_key"),
  nameIn: varchar("name_in", { length: 100 }),
  region: varchar("region", { length: 100 }),
  timezone: varchar("timezone", { length: 50 }).default("Europe/Moscow"),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  population: integer("population"),
  seoTitle: varchar("seo_title", { length: 70 }),
  seoDescription: varchar("seo_description", { length: 180 }),
  h1: varchar("h1", { length: 100 }),
  bodyMd: text("body_md"),
  isActive: boolean("is_active").notNull().default(true),
  // ── AI_Design_Product (migration 2026-01-15-ai-design-product) ─────────────
  /**
   * Стоимость работ ₽ × 100 за 1 м² помещения для Real_Estimate (Requirement
   * 11.4). NULL = использовать общероссийское значение по умолчанию
   * (`DEFAULT_WORK_COEFF_KOPEKS_PER_SQM = 800000`).
   */
  workCoefficientKopeksPerSqm: integer("work_coefficient_kopeks_per_sqm"),

  // ── hochu-takzhe-community (migration 2026-01-20-community-baseline) ────────
  /**
   * Стартовый город приоритетного развития сообщества (1..3 города). Новостройки
   * в стартовых городах приоритизируются для сидирования до статуса Living_ZhK
   * (Requirement 17.1, 17.4). Additive, safe default.
   */
  isStarter: boolean("is_starter").notNull().default(false),
  /**
   * Город входит в целевой набор SEO-покрытия (~40 городов РФ с населением
   * ≥ 400 000) для программной генерации публичных страниц (Requirement 16.1).
   */
  isGeoCovered: boolean("is_geo_covered").notNull().default(false),
});

// ── service_types ────────────────────────────────────────────────────────────
// Existing minimal table (id, name) → extended with marketplace SEO fields and
// optional self-referencing parent_id for category tree (e.g. Electrics →
// Sockets and switches). All new columns are nullable / safe-default.
export const serviceTypesTable = pgTable("service_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // ── Marketplace fields (added in 0005_marketplace_baseline) ────────────────
  slug: varchar("slug", { length: 100 }).unique("service_types_slug_key"),
  nameGenitive: varchar("name_genitive", { length: 255 }),
  parentId: integer("parent_id").references((): AnyPgColumn => serviceTypesTable.id, { onDelete: "set null" }),
  icon: varchar("icon", { length: 50 }),
  description: text("description"),
  bodyMd: text("body_md"),
  seoTitle: varchar("seo_title", { length: 70 }),
  seoDescription: varchar("seo_description", { length: 180 }),
  h1: varchar("h1", { length: 100 }),
  priceFrom: integer("price_from"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertCitySchema = createInsertSchema(citiesTable).omit({ id: true });
export type InsertCity = z.infer<typeof insertCitySchema>;
export type City = typeof citiesTable.$inferSelect;

export const insertServiceTypeSchema = createInsertSchema(serviceTypesTable).omit({ id: true });
export type InsertServiceType = z.infer<typeof insertServiceTypeSchema>;
export type ServiceType = typeof serviceTypesTable.$inferSelect;

export const systemSettingsTable = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
