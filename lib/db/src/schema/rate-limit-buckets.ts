import {
  pgTable,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * `rate_limit_buckets` — Postgres-based rate limiter для дневных лимитов
 * AI_Design_Product (Requirements 3.3 — 5/IP/сутки, 3.4 — 3/anon/сутки).
 *
 * Решение: Postgres вместо Redis (в стэке Redis нет, нагрузка ничтожна,
 * атомарный `INSERT … ON CONFLICT DO UPDATE` решает race condition без
 * явных локов). Подробности — design.md § Rate_Limiter.
 *
 * Один счётчик на ключ `bucket_key` (формат `'anon:<UUID>'` или
 * `'ip:<dotted>'`) + начало текущего 24-часового fixed-window. Атомарный
 * upsert (см. `lib/designRateLimit.ts`):
 *
 *   INSERT INTO rate_limit_buckets (bucket_key, counter, window_start, updated_at)
 *   VALUES ($1, 1, NOW(), NOW())
 *   ON CONFLICT (bucket_key) DO UPDATE SET
 *     counter = CASE
 *       WHEN NOW() - rate_limit_buckets.window_start > INTERVAL '24 hours' THEN 1
 *       ELSE rate_limit_buckets.counter + 1
 *     END,
 *     window_start = CASE
 *       WHEN NOW() - rate_limit_buckets.window_start > INTERVAL '24 hours' THEN NOW()
 *       ELSE rate_limit_buckets.window_start
 *     END,
 *     updated_at = NOW()
 *   RETURNING counter, window_start;
 *
 * Чистка холодных бакетов (опционально, не блокирует работу) — фоновый cron
 * раз в сутки удаляет строки с `window_start < NOW() - INTERVAL '7 days'`.
 */
export const rateLimitBucketsTable = pgTable(
  "rate_limit_buckets",
  {
    /** Ключ бакета: `'anon:<UUID>'` или `'ip:<dotted>'`. */
    bucketKey: varchar("bucket_key", { length: 150 }).primaryKey(),
    /** Счётчик запросов в текущем 24-часовом окне. */
    counter: integer("counter").notNull().default(0),
    /** Начало текущего fixed-window. */
    windowStart: timestamp("window_start").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    /**
     * Индекс по `window_start` нужен только для опционального cron'а,
     * чистящего «холодные» бакеты — горячий путь идёт по PRIMARY KEY.
     */
    windowIdx: index("rate_limit_buckets_window_idx").on(t.windowStart),
  }),
);

export type RateLimitBucket = typeof rateLimitBucketsTable.$inferSelect;
export type InsertRateLimitBucket = typeof rateLimitBucketsTable.$inferInsert;
