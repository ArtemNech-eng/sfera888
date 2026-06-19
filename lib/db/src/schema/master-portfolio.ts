import { pgTable, serial, integer, text, varchar, numeric, timestamp, boolean, index, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { mastersTable } from "./masters";
import { serviceTypesTable, citiesTable } from "./settings";

/**
 * Portfolio housing type — what kind of property the case was on.
 * Used as a chip on /raboty/[slug] and (later) as a filter facet on the
 * catalog. Plan §22 Iteration 2.
 */
export const housingTypeEnum = pgEnum("housing_type", [
  "novostroyka",
  "vtorichka",
  "chastnyy_dom",
  "kommerciya",
]);

/**
 * Structured estimate for a portfolio case (works / materials / total +
 * optional breakdown). Stored as JSONB so we can extend with line items
 * later without a migration. Plan §22 Iteration 2 (D-2 = JSONB).
 */
export interface PortfolioEstimate {
  /** Стоимость работ, ₽. */
  works: number;
  /** Стоимость материалов, ₽. */
  materials: number;
  /** Итого, ₽. Если отсутствует, фронт считает = works + materials. */
  total?: number;
  /** Резерв на будущее: «электрика 12000, штукатурка 18000» — для SEO long-tail. */
  breakdown?: { label: string; cost: number }[];
}

/**
 * master_portfolio — публичные кейсы мастера для маркетплейса.
 *
 * Заполняется через CRM ("опубликовать заказ как кейс"): оператор выбирает
 * completed-заказ → ставит галочку → создаётся запись с фото "до/после",
 * описанием, ценой, отзывом клиента. Только записи с is_published=true
 * показываются на публичной карточке мастера и попадают в /sitemap.
 *
 * Внутренние orders.photos_before/after НЕ публикуются автоматически —
 * только через явный отбор оператором в этой таблице.
 */
export const masterPortfolioTable = pgTable("master_portfolio", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  serviceTypeId: integer("service_type_id").references(() => serviceTypesTable.id, { onDelete: "set null" }),
  cityId: integer("city_id").references(() => citiesTable.id, { onDelete: "set null" }),
  title: varchar("title", { length: 150 }).notNull(),
  // slug — для публичного URL /kejsy/[slug]. Nullable, потому что черновики
  // кейсов в CRM могут существовать до публикации.
  slug: varchar("slug", { length: 150 }).unique("master_portfolio_slug_key"),
  description: text("description"),
  beforePhotos: text("before_photos").array().notNull().default([]),
  afterPhotos: text("after_photos").array().notNull().default([]),
  priceFrom: numeric("price_from", { precision: 10, scale: 2 }),
  priceTo: numeric("price_to", { precision: 10, scale: 2 }),
  area: numeric("area", { precision: 10, scale: 2 }),
  /**
   * Iteration 2 (plan §22 Req 2.4): срок выполнения работ в днях.
   * Целое 1..365 (валидация на уровне приложения; CHECK constraint можно
   * добавить позже отдельной миграцией).
   */
  durationDays: integer("duration_days"),
  /**
   * Iteration 2 (plan §22 Req 2.5): тип жилья объекта. Enum из 4 значений.
   */
  housingType: housingTypeEnum("housing_type"),
  /**
   * Iteration 2 (plan §22 Req 3): структурированная смета.
   * JSONB позволяет добавить `breakdown` без миграции (plan D-2).
   */
  estimate: jsonb("estimate").$type<PortfolioEstimate>(),
  completedAt: timestamp("completed_at"),
  clientReviewText: text("client_review_text"),
  // 1..5 — без CHECK constraint в первой миграции, проверка на уровне приложения.
  // Можно добавить CHECK constraint в отдельной миграции после стабилизации UI.
  clientRating: integer("client_rating"),
  isPublished: boolean("is_published").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  /**
   * Iteration 4 (plan §22): счётчик сохранений в избранное. Инкрементится
   * приложением в одной транзакции с INSERT в `user_saves`.
   */
  saveCount: integer("save_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  masterPublishedIdx: index("master_portfolio_master_published_idx").on(t.masterId, t.isPublished),
  publishedFeaturedIdx: index("master_portfolio_published_featured_idx").on(t.isPublished, t.isFeatured, t.sortOrder),
}));

export type MasterPortfolio = typeof masterPortfolioTable.$inferSelect;
export type InsertMasterPortfolio = typeof masterPortfolioTable.$inferInsert;
export type HousingType = (typeof housingTypeEnum.enumValues)[number];
