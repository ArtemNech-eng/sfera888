/**
 * Feature-flag guard для Payment_State engine.
 *
 * Когда `payment_state_engine_enabled = true` в system_settings — все 5
 * каналов уведомлений (см. .kiro/specs/estimate-optional-flow/design.md
 * § Architecture / Integration points) переключаются с проверки `!receipt`
 * на проверку `paymentState === "no_amount"`.
 *
 * Когда флаг = false (default) — старое поведение полностью сохраняется.
 * Это даёт безопасный rollback: выключили флаг → система ведёт себя как
 * до фичи, без перезапуска или редеплоя.
 *
 * Кеш TTL 60с — multi-instance setup (Railway) синхронизируется быстро
 * без дополнительных pubsub-механизмов.
 */

import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { PaymentState } from "./paymentState.js";

const FLAG_KEY = "payment_state_engine_enabled";
const TTL_MS = 60_000;

let cached: { value: boolean; ts: number } | null = null;

/**
 * Прочитать значение флага. Кешируется на 60 секунд per-process.
 * При ошибке БД (недоступна, timeout) — возвращает false (fail-closed).
 */
export async function isPaymentStateEngineEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.value;

  try {
    const [row] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, FLAG_KEY))
      .limit(1);
    const value = row?.value === "true";
    cached = { value, ts: Date.now() };
    return value;
  } catch (err) {
    console.error("[paymentStateGuard] Failed to read flag, fail-closed:", err);
    return false;
  }
}

/**
 * Главный guard helper. Возвращает true, если по этому заказу нужно
 * генерировать сигнал "нет сметы / напомни про смету / эскалируй".
 *
 * Логика:
 *   • флаг выключен → старое поведение: ругаться, если нет receipt
 *   • флаг включён  → ругаться, только если paymentState = "no_amount"
 *
 * Используется во всех 5 каналах уведомлений (Phase 2):
 *   1. routes/ai-office.ts:runOrdersWithoutReceipts
 *   2. routes/dashboard-action-items.ts:no_estimate
 *   3. routes/work-board.ts:no_estimate column + problem detection
 *   4. routes/work-board-table.ts:problem detection
 *   5. lib/fomoBlock.ts:priority 1 (no_estimate block)
 */
export async function shouldNagAboutEstimate(
  paymentState: PaymentState,
  hasReceipt: boolean,
): Promise<boolean> {
  const flagEnabled = await isPaymentStateEngineEnabled();
  if (!flagEnabled) return !hasReceipt;
  return paymentState === "no_amount";
}

/**
 * Сбросить in-memory кеш. Вызывается:
 *   • в тестах перед каждым кейсом (чтобы изменение БД сразу применялось)
 *   • после ручного toggle флага в admin UI (опционально, иначе ждём 60с)
 */
export function clearPaymentStateFlagCache(): void {
  cached = null;
}

/**
 * Утилита для админских настроек — установить флаг программно.
 * Используется в Phase 2 production toggle и в integration-тестах.
 */
export async function setPaymentStateEngineEnabled(value: boolean): Promise<void> {
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
  clearPaymentStateFlagCache();
}
