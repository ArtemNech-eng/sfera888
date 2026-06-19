import { pgTable, bigserial, integer, uuid, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { masterPortfolioTable } from "./master-portfolio";

/**
 * user_saves — анонимные/привязанные сохранения кейсов из марcкетплейса.
 *
 * Plan §22 Iteration 4. Pinterest-style «save», работает без логина:
 *   • До login — `anon_id` (UUID v4 в HTTP-only cookie `kiro_anon_id`)
 *   • После login клиента (когда подключим client-accounts) — `user_id`
 *   • Auto-claim flow на login: UPDATE user_saves SET user_id = X
 *     WHERE anon_id = current_anon_id (один раз)
 *
 * Хотя бы один из `anon_id` / `user_id` обязателен — но проверка на уровне
 * приложения, чтобы не блокировать INSERT'ы при race conditions. CHECK
 * constraint можно добавить отдельной миграцией позже, когда стабилизируем.
 *
 * Уникальность: один пользователь не может сохранить один кейс дважды.
 * Реализована через partial unique indexes (один по anon_id, другой по
 * user_id) — это надёжнее `NULLS NOT DISTINCT` (PG 15+) для миграций
 * существующих БД.
 *
 * `save_count` на `master_portfolio` инкрементится приложением в одной
 * транзакции с INSERT'ом — без триггеров, чтобы не привносить новой
 * зависимости в схему.
 */
export const userSavesTable = pgTable(
  "user_saves",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Cookie-id для анонимных пользователей. UUID v4. */
    anonId: uuid("anon_id"),
    /** Зарезервировано под client-accounts (когда подключим). FK добавим тогда же. */
    userId: integer("user_id"),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => masterPortfolioTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // Lookup-индексы на оба идентификатора (для GET /saves).
    anonIdIdx: index("user_saves_anon_id_idx").on(t.anonId),
    userIdIdx: index("user_saves_user_id_idx").on(t.userId),
    portfolioIdIdx: index("user_saves_portfolio_id_idx").on(t.portfolioId),
    // Уникальность сохранения. Partial unique indexes — каждый вариант
    // владельца уникален в своём измерении.
    anonPortfolioUniq: uniqueIndex("user_saves_anon_portfolio_uniq")
      .on(t.anonId, t.portfolioId)
      .where(sql`${t.anonId} IS NOT NULL`),
    userPortfolioUniq: uniqueIndex("user_saves_user_portfolio_uniq")
      .on(t.userId, t.portfolioId)
      .where(sql`${t.userId} IS NOT NULL`),
  }),
);

export type UserSave = typeof userSavesTable.$inferSelect;
export type InsertUserSave = typeof userSavesTable.$inferInsert;
