import { pgTable, bigserial, integer, uuid, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { masterPortfolioTable } from "./master-portfolio";
import { designsTable } from "./designs";

/**
 * user_saves — анонимные/привязанные сохранения объектов из marketplace'а.
 *
 * Plan §22 Iteration 4 + AI-designer Iter 3. Pinterest-style «save» работает
 * без логина:
 *   • До login — `anon_id` (UUID v4 в HTTP-only cookie `kiro_anon_id`)
 *   • После login клиента (когда подключим client-accounts) — `user_id`
 *
 * Polymorphic targets: либо `portfolio_id` (мастерский кейс из master_portfolio),
 * либо `ai_design_id` (AI-сгенерированный дизайн из designs). CHECK-инвариант
 * гарантирует что задан **ровно один** target (XOR).
 *
 * Хотя бы один из `anon_id` / `user_id` обязателен — но проверка на уровне
 * приложения, чтобы не блокировать INSERT'ы при race conditions.
 *
 * Уникальность: один пользователь не может сохранить один объект дважды.
 * Реализована через partial unique indexes по target_type × owner_type.
 *
 * Counter (`save_count`) на target таблице инкрементится приложением в одной
 * транзакции с INSERT'ом — без триггеров, чтобы не привносить новой
 * зависимости в схему.
 */
export const userSavesTable = pgTable(
  "user_saves",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Cookie-id для анонимных пользователей. UUID v4. */
    anonId: uuid("anon_id"),
    /** Зарезервировано под client-accounts. */
    userId: integer("user_id"),
    /** Target #1: мастерский кейс. Либо это либо `aiDesignId` (XOR). */
    portfolioId: integer("portfolio_id").references(() => masterPortfolioTable.id, {
      onDelete: "cascade",
    }),
    /** Target #2: AI-сгенерированный дизайн. */
    aiDesignId: integer("ai_design_id").references(() => designsTable.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // Lookup-индексы.
    anonIdIdx: index("user_saves_anon_id_idx").on(t.anonId),
    userIdIdx: index("user_saves_user_id_idx").on(t.userId),
    portfolioIdIdx: index("user_saves_portfolio_id_idx").on(t.portfolioId),
    aiDesignIdIdx: index("user_saves_ai_design_id_idx")
      .on(t.aiDesignId)
      .where(sql`${t.aiDesignId} IS NOT NULL`),

    // Уникальность сохранения per-owner × per-target.
    anonPortfolioUniq: uniqueIndex("user_saves_anon_portfolio_uniq")
      .on(t.anonId, t.portfolioId)
      .where(sql`${t.anonId} IS NOT NULL`),
    userPortfolioUniq: uniqueIndex("user_saves_user_portfolio_uniq")
      .on(t.userId, t.portfolioId)
      .where(sql`${t.userId} IS NOT NULL`),
    anonDesignUniq: uniqueIndex("user_saves_anon_ai_design_uniq")
      .on(t.anonId, t.aiDesignId)
      .where(sql`${t.anonId} IS NOT NULL AND ${t.aiDesignId} IS NOT NULL`),
    userDesignUniq: uniqueIndex("user_saves_user_ai_design_uniq")
      .on(t.userId, t.aiDesignId)
      .where(sql`${t.userId} IS NOT NULL AND ${t.aiDesignId} IS NOT NULL`),

    // XOR target: ровно один из (portfolio_id, ai_design_id) задан.
    targetRequired: check(
      "user_saves_target_required",
      sql`(${t.portfolioId} IS NOT NULL AND ${t.aiDesignId} IS NULL) OR (${t.portfolioId} IS NULL AND ${t.aiDesignId} IS NOT NULL)`,
    ),
  }),
);

export type UserSave = typeof userSavesTable.$inferSelect;
export type InsertUserSave = typeof userSavesTable.$inferInsert;
