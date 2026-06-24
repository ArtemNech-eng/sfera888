import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * AI_Design_Product — дневной rate-limiter на Postgres.
 *
 * Решение: Postgres вместо Redis (в стэке Redis нет, нагрузка ничтожна,
 * атомарный `INSERT ... ON CONFLICT DO UPDATE` решает race condition без
 * явных локов). Подробности — design.md § Rate_Limiter.
 *
 * Фиксированное 24-часовое окно (fixed window):
 *   - первое попадание ключа создаёт строку с counter=1, window_start=NOW()
 *   - повторы в окне инкрементируют counter
 *   - повтор после истечения 24h сбрасывает counter=1 и window_start=NOW()
 *
 * Лимиты (Requirements 3.3, 3.4):
 *   - `anon = 3` запросов в сутки на `Anon_Id`
 *   - `ip = 5` запросов в сутки на IP-адрес
 *
 * Контракт `decrement` (Requirement 3.6): откатывает инкремент при
 * последующем отказе по schema-валидации формы или min-area pre-flight.
 * Намеренно НЕ вызывается при сбое в воркере по `Cost_Ceiling`
 * (Requirement 3.7) — пользователь уже потратил AI-вызовы, лимит должен
 * учитывать. Решение «когда вызывать decrement» — в task 16.2.
 */

export type RateLimitKind = "anon" | "ip";

export interface RateLimitResult {
  /** True, если запрос укладывается в лимит и счётчик был инкрементирован. */
  allowed: boolean;
  /** Сколько ещё успешных созданий разрешено в текущем окне. */
  remaining: number;
  /** Сколько секунд ждать до сброса окна. 0 если allowed. */
  retryAfterSeconds: number;
}

const LIMITS: Record<RateLimitKind, number> = {
  anon: 3, // Requirement 3.4
  ip: 5,   // Requirement 3.3
};

const WINDOW_SECONDS = 24 * 60 * 60;

/**
 * Bucket key = `${kind}:${rawKey}` — например, `anon:550e8400-e29b-...`
 * или `ip:1.2.3.4`. Шире 150 символов не получается, так что в varchar
 * `bucket_key` упирается с большим запасом.
 */
function bucketKeyFor(kind: RateLimitKind, rawKey: string): string {
  return `${kind}:${rawKey}`;
}

/**
 * `db.execute(sql\`...\`)` отдаёт node-postgres-подобный объект с `.rows`,
 * но в редких сборках возвращает плоский массив. Унифицируем.
 */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const wrapper = result as { rows?: Record<string, unknown>[] };
  return wrapper.rows ?? [];
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return new Date(); // unreachable in normal driver output
}

function computeRetryAfter(windowStart: Date): number {
  const elapsedMs = Date.now() - windowStart.getTime();
  const remainingMs = WINDOW_SECONDS * 1000 - elapsedMs;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/**
 * Атомарный инкремент счётчика и проверка лимита.
 *
 * SQL — `INSERT ... ON CONFLICT DO UPDATE` на `rate_limit_buckets`:
 *   - впервые: counter=1, window_start=NOW()
 *   - в окне: counter+=1, window_start без изменений
 *   - после окна: counter=1, window_start=NOW() (полный сброс)
 *
 * Если после инкремента counter > limit, мы считаем запрос отвергнутым
 * и откатываем counter обратно до limit, чтобы повторные отказанные
 * попытки в том же окне не раздували счётчик неограниченно (тогда даже
 * после явного `decrement` пользователь оставался бы заблокированным
 * до конца окна).
 */
export async function checkAndIncrement(
  kind: RateLimitKind,
  rawKey: string,
): Promise<RateLimitResult> {
  const key = bucketKeyFor(kind, rawKey);
  const limit = LIMITS[kind];

  const upsert = await db.execute(sql`
    INSERT INTO rate_limit_buckets (bucket_key, counter, window_start, updated_at)
    VALUES (${key}, 1, NOW(), NOW())
    ON CONFLICT (bucket_key) DO UPDATE
    SET counter = CASE
          WHEN NOW() - rate_limit_buckets.window_start > INTERVAL '24 hours' THEN 1
          ELSE rate_limit_buckets.counter + 1
        END,
        window_start = CASE
          WHEN NOW() - rate_limit_buckets.window_start > INTERVAL '24 hours' THEN NOW()
          ELSE rate_limit_buckets.window_start
        END,
        updated_at = NOW()
    RETURNING counter, window_start
  `);

  const row = rowsOf(upsert)[0];
  if (!row) {
    // Не должно случиться: INSERT либо UPDATE всегда возвращают строку.
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }

  const counter = Number(row.counter ?? row["counter"]);
  const windowStart = toDate(row.window_start ?? row["window_start"]);

  if (counter > limit) {
    // Откатываем избыточный инкремент, чтобы счётчик оставался зажатым
    // на limit в течение текущего окна. WHERE-условие защищает от гонок:
    // если другой запрос уже понизил counter, мы ничего не трогаем.
    await db.execute(sql`
      UPDATE rate_limit_buckets
      SET counter = ${limit}, updated_at = NOW()
      WHERE bucket_key = ${key} AND counter > ${limit}
    `);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: computeRetryAfter(windowStart),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - counter),
    retryAfterSeconds: 0,
  };
}

/**
 * Откат предыдущего `checkAndIncrement` (Requirement 3.6).
 * Уменьшает counter на 1, не опускаясь ниже 0; window_start не трогает,
 * чтобы дальнейшие запросы по тому же ключу попадали в то же окно.
 *
 * Идемпотентно безопасен: повторный вызов на нулевом счётчике — no-op.
 */
export async function decrement(
  kind: RateLimitKind,
  rawKey: string,
): Promise<void> {
  const key = bucketKeyFor(kind, rawKey);
  await db.execute(sql`
    UPDATE rate_limit_buckets
    SET counter = GREATEST(counter - 1, 0), updated_at = NOW()
    WHERE bucket_key = ${key}
  `);
}
