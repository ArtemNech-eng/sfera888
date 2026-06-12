/**
 * Feature-flag guard для постепенного удаления legacy token-модели.
 *
 * Когда `token_model_enabled = false` в `system_settings` — Phase A фичи
 * `.kiro/specs/remove-token-payment-model/`:
 *   • новые leads/orders создаются только как commission
 *   • `routes/wallet.ts` token-endpoints возвращают 404
 *   • `master-pwa.ts:respond` всегда списывает 500₽ через `deductServiceFee`
 *   • CRM скрывает `/token-*` страницы и UI с tokensCharged/paymentModel
 *   • dashboard task-loader пропускает 4 token-task типа
 *
 * Когда флаг = true (default) — старое поведение полностью сохраняется
 * (token-orders продолжают жить параллельно с commission).
 *
 * Default = `true` для backwards-compat: если ключа нет в БД, считаем что
 * token-model работает. Чтобы перейти на новое поведение — admin ставит
 * value = 'false' через SQL в Railway dashboard.
 *
 * TTL 60с — multi-instance setup (Railway) синхронизируется быстро без
 * pubsub-механизмов. Аналогично `paymentStateGuard.ts`.
 *
 * Fail-safe: при ошибке БД возвращаем `true` (token-model on). Это
 * безопаснее: лучше задержать раскатку нового поведения, чем массово
 * сломать write-paths (создание leads/orders) при недоступности БД.
 */

import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const FLAG_KEY = "token_model_enabled";
const TTL_MS = 60_000;

let cached: { value: boolean; ts: number } | null = null;

/**
 * Прочитать значение флага. Кешируется на 60 секунд per-process.
 *
 * Семантика идентична `routes/system.ts:GET /feature-flags` (default = true,
 * row.value === "true" → on, иначе — off). Это гарантирует что frontend
 * (через useFeatureFlags) и backend получают одинаковый ответ.
 */
export async function isTokenModelEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.value;

  try {
    const [row] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, FLAG_KEY))
      .limit(1);
    // Default = true: row отсутствует → token-model on.
    // Только явное value === "true" подтверждает on; всё остальное — off.
    // (Не делаем "value !== 'false'" чтобы быть консистентным с
    // routes/system.ts где такая же strict-проверка.)
    const value = row?.value != null ? row.value === "true" : true;
    cached = { value, ts: Date.now() };
    return value;
  } catch (err) {
    console.error("[tokenModelGuard] Failed to read flag, defaulting to true:", err);
    return true;
  }
}

/**
 * Сбросить in-memory кеш. Вызывается:
 *   • в тестах перед каждым кейсом (чтобы изменение БД сразу применялось)
 *   • после ручного toggle флага в admin UI (опционально, иначе ждём 60с)
 */
export function clearTokenModelFlagCache(): void {
  cached = null;
}

/**
 * Утилита для админских настроек — установить флаг программно.
 * Используется в Phase A toggle и в тестах.
 */
export async function setTokenModelEnabled(value: boolean): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values({
      key: FLAG_KEY,
      value: value ? "true" : "false",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: value ? "true" : "false", updatedAt: new Date() },
    });
  clearTokenModelFlagCache();
}
