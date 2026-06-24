import { db, designGenerationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getCostCeilingKopeks } from "./designConfig.js";

/**
 * AI_Design_Product — budget guard для одного `Design_Project`.
 *
 * Перед каждым следующим AI-вызовом `Design_Worker` через
 * `enforceCostCeiling(designId)` суммирует все уже записанные
 * `design_generations.cost_kopeks` для этого проекта и сверяет с лимитом
 * `Cost_Ceiling` (env `DESIGN_COST_CEILING_KOPEKS`, default 3000 коп. ≈ 30 ₽
 * ≈ $0.30). При превышении бросает `BudgetExceededError`, который ловит
 * `processDesign()` и переводит запись в `status = 'failed'` с
 * `error_message = "превышен бюджет генерации"`.
 *
 * Контракт описан в design.md § «Cost-guard и budget enforcement» и
 * соответствует Requirement 14.5 и Requirement 14.7 (логирование с
 * фактической стоимостью на момент сбоя).
 *
 * NULL-cost безопасно: `SUM(NULL) = NULL` оборачивается в `COALESCE(..., 0)`,
 * чтобы запись `design_generations` без указанной стоимости (например,
 * нативный `extractPalette`, который не вызывает внешний AI) не ломала
 * проверку.
 */

/**
 * Ошибка, которая прерывает Generation_Pipeline при превышении
 * `Cost_Ceiling`. Поля доступны на инстансе для логов воркера и для
 * `error_message` в `designs`.
 */
export class BudgetExceededError extends Error {
  /** ID `designs.id`, на котором сработал guard. */
  public readonly designId: number;
  /** Фактически потрачено на момент проверки, в копейках. */
  public readonly spentKopeks: number;
  /** Лимит из `getCostCeilingKopeks()` на момент проверки, в копейках. */
  public readonly limitKopeks: number;

  constructor(designId: number, spentKopeks: number, limitKopeks: number) {
    super(`превышен бюджет генерации (${spentKopeks} коп.)`);
    this.name = "BudgetExceededError";
    this.designId = designId;
    this.spentKopeks = spentKopeks;
    this.limitKopeks = limitKopeks;
    // Восстанавливаем prototype chain после `extends Error` в TS-компиляции
    // в ES2015+; без этого `instanceof BudgetExceededError` ломается в
    // некоторых рантаймах (см. TS issue #13965).
    Object.setPrototypeOf(this, BudgetExceededError.prototype);
  }
}

/**
 * Проверяет, что суммарная стоимость AI-вызовов для `designId` не
 * превысила `Cost_Ceiling`. Возвращает текущее значение `spentKopeks`,
 * чтобы воркер мог его залогировать (Requirement 14.7).
 *
 * Бросает `BudgetExceededError`, если `spent > limit`. Пограничный случай
 * `spent === limit` считается допустимым: лимит — потолок, а не строгая
 * граница.
 */
export async function enforceCostCeiling(designId: number): Promise<number> {
  const limitKopeks = getCostCeilingKopeks();

  // Drizzle-выражение `sum()` отдаёт строку (numeric → string) и `null` для
  // пустого набора, поэтому оборачиваем в `COALESCE(..., 0)::int` на стороне
  // SQL и парсим как целое число.
  const [row] = await db
    .select({
      spentKopeks: sql<number>`COALESCE(SUM(${designGenerationsTable.costKopeks}), 0)::int`,
    })
    .from(designGenerationsTable)
    .where(eq(designGenerationsTable.designId, designId));

  const spentKopeks = Number(row?.spentKopeks ?? 0);

  if (spentKopeks > limitKopeks) {
    throw new BudgetExceededError(designId, spentKopeks, limitKopeks);
  }

  return spentKopeks;
}
