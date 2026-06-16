import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * user_design_limits — счётчик использований AI-дизайнера, чтобы не давать
 * бесконечную бесплатную генерацию.
 *
 * Ключ — пара (`identifier_hash`, `identifier_type`):
 *   • identifier_type='phone'  → SHA-256 от нормализованного телефона;
 *   • identifier_type='ip'     → SHA-256 от IP (best-effort, общий fallback);
 *   • identifier_type='cookie' → длинный random ID, сохраняемый в браузере.
 *
 * Все три типа считаются независимо и комбинируются в проверке: бот без
 * cookie-id ловится по IP, IP-смена ловится по телефону при отправке заявки.
 *
 * `reset_at` — момент, после которого счётчик `free_generations_used` можно
 * сбрасывать (например, раз в 30 дней). Логика reset реализуется в коде
 * приложения, не в БД (никаких CRON-триггеров на стороне Postgres).
 */
export const userDesignLimitsTable = pgTable(
  "user_design_limits",
  {
    id: serial("id").primaryKey(),
    identifierHash: varchar("identifier_hash", { length: 64 }).notNull(),
    // Identifier type convention (validated at application layer):
    //   phone / ip / cookie
    identifierType: varchar("identifier_type", { length: 30 }).notNull(),
    freeGenerationsUsed: integer("free_generations_used").notNull().default(0),
    paidGenerationsUsed: integer("paid_generations_used").notNull().default(0),
    resetAt: timestamp("reset_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Unique-index also acts as the lookup index for `WHERE identifier_hash=?
    // AND identifier_type=?` — no separate `index(...)` needed.
    identifierUniq: uniqueIndex("user_design_limits_identifier_uniq").on(
      t.identifierHash,
      t.identifierType,
    ),
  }),
);

export const insertUserDesignLimitSchema = createInsertSchema(userDesignLimitsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserDesignLimit = z.infer<typeof insertUserDesignLimitSchema>;
export type UserDesignLimit = typeof userDesignLimitsTable.$inferSelect;
