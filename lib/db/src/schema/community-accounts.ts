import { pgTable, serial, varchar, integer, timestamp, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { zhkTable } from "./zhk";

/**
 * `community_accounts` — облегчённая учётная запись для публикации в сообществе
 * (Community_Account, уровень доступа 3). Основной метод создания —
 * Phone_Verification; Max_Login опционален и никогда не обязателен (Requirement
 * 11.1, 11.2, 11.4).
 *
 * `zhk_id` фиксирует привязку жителя к ЖК; при публикации в Local_Feed тема
 * связывается с ЖК аккаунта на момент публикации (Requirement 3.2, 3.5).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (migration 2026-01-20-community-baseline)
 *
 * Циркулярная связь `zhk` ⇄ `community_accounts` (zhk.created_by_account_id и
 * community_accounts.zhk_id) разрывается lambda-референсом с типом AnyPgColumn.
 */
export const communityAccountsTable = pgTable(
  "community_accounts",
  {
    id: serial("id").primaryKey(),
    /** Основной метод аутентификации (Requirement 11.1). */
    phone: varchar("phone", { length: 30 }).notNull().unique("community_accounts_phone_key"),
    /** Момент завершения Phone_Verification; NULL = не подтверждён (Requirement 11.4). */
    phoneVerifiedAt: timestamp("phone_verified_at"),
    /**
     * bcryptjs-хеш Password (Password_Hash); NULL = пароль не задан.
     * Единственная хранимая форма Password (Requirement 1.2, 6.1).
     * Spec: .kiro/specs/community-phone-registration/ (migration 2026-06-11-community-password)
     */
    passwordHash: varchar("password_hash", { length: 100 }),
    /** `resident` | `master`. */
    role: varchar("role", { length: 20 }).notNull().default("resident"),
    /** Привязка жителя к ЖК на момент публикации (Requirement 3.2, 3.5). */
    zhkId: integer("zhk_id").references((): AnyPgColumn => zhkTable.id, { onDelete: "set null" }),
    /** Опциональный Max_Login (бонус, не гейт) (Requirement 11.2). */
    maxUserId: varchar("max_user_id", { length: 80 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    zhkIdx: index("community_accounts_zhk_idx").on(t.zhkId),
    maxUserIdx: index("community_accounts_max_user_idx").on(t.maxUserId),
  }),
);

export const insertCommunityAccountSchema = createInsertSchema(communityAccountsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCommunityAccount = z.infer<typeof insertCommunityAccountSchema>;
export type CommunityAccount = typeof communityAccountsTable.$inferSelect;
