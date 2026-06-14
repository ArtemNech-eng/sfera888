import { pgTable, serial, integer, text, varchar, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * seo_redirects — управляемые через CRM 301/302/308 редиректы для marketplace.
 *
 * Используется когда: переименовали slug мастера, объединили услуги, удалили
 * город — старый URL должен 301-редиректить на новый, иначе теряем SEO-вес.
 *
 * Будущий marketplace middleware (Next.js) кеширует эту таблицу в памяти
 * на 60 сек и применяет редирект ДО рендера страницы. На текущем
 * sfera-master.ru НЕ используется (там свои redirect-роуты в app.ts).
 */
export const seoRedirectsTable = pgTable("seo_redirects", {
  id: serial("id").primaryKey(),
  fromPath: varchar("from_path", { length: 500 }).notNull().unique("seo_redirects_from_path_key"),
  toPath: varchar("to_path", { length: 500 }).notNull(),
  // 301 (permanent) / 302 (temporary) / 308 (permanent + preserves method).
  // Без CHECK constraint в первой миграции, валидация на уровне CRM-формы.
  statusCode: integer("status_code").notNull().default(301),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
}, (t) => ({
  // Marketplace middleware при каждом запросе проверяет from_path === pathname.
  activeIdx: index("seo_redirects_active_idx").on(t.isActive, t.fromPath),
}));

export type SeoRedirect = typeof seoRedirectsTable.$inferSelect;
export type InsertSeoRedirect = typeof seoRedirectsTable.$inferInsert;
