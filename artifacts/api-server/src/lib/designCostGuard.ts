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

// ───────────────────────────────────────────────────────────────────────────
// AI_Design_3D_Blockout (подход B2) — in-memory аккумулятор `Cost_Budget`.
//
// В отличие от `enforceCostCeiling()` выше (который работает по записям
// `design_generations` в БД для онлайн-пайплайна AI_Design_Product), offline
// B2-пайплайн запускается оператором через `npx tsx` и не пишет каждую
// перекраску в БД. Поэтому учёт бюджета ведётся в памяти процесса: оркестратор
// (`repaintAll`) накапливает `costKopeks` по всем вызовам
// `Depth_ControlNet_Provider` — включая вызовы, завершившиеся NSFW-отказом
// (`NsfwBlockedError` несёт `costKopeks`, см. falAi.ts) — и перед каждым
// следующим вызовом проверяет верхнюю границу `Cost_Budget`.
//
// Контракт описан в design.md § «6. Cost guard (TS)» и соответствует
// Requirement 12.4 (вывод итоговой стоимости в копейках по всем вызовам
// провайдера) и Requirement 12.5 (отсечка по верхней границе бюджета:
// прекратить дальнейшие вызовы и сообщить о превышении).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Верхняя граница `Cost_Budget` в копейках по умолчанию.
 *
 * Требования задают ориентир стоимости проекта B2 как $0.2–$0.6, а отсечка
 * (Req 12.5) идёт по верхней границе — $0.6. Кодовая база фиксирует курс
 * «1 цент ≈ 100 копеек» (см. `APPROX_COST_KOPEKS = 100 // $0.01` и
 * `FLUX_KONTEXT_PRO_COST_KOPEKS = 400 // $0.04` в falAi.ts), поэтому
 * $0.60 = 6000 копеек. Учёт ведётся в копейках, потому что именно в них
 * обёртки fal возвращают `costKopeks` — никакой конвертации на месте проверки.
 */
export const DEFAULT_COST_BUDGET_KOPEKS = 6000;

/**
 * Разрешает верхнюю границу `Cost_Budget` в копейках.
 *
 * Читает `DESIGN_COST_BUDGET_KOPEKS`. Принимает неотрицательное целое
 * (строкой); любая другая форма (отрицательное, дробное, NaN, пусто,
 * отсутствует) молча откатывается к `DEFAULT_COST_BUDGET_KOPEKS = 6000`.
 * Ноль допустим и означает «ни одного вызова провайдера не разрешено» —
 * удобно для сухих прогонов, которые должны упереться в guard сразу. Логика и
 * лёгкое поведение зеркалят `getCostCeilingKopeks()` в designConfig.ts: кривой
 * env не должен ронять прогон, оператор получает дефолт и предупреждение в
 * stderr.
 *
 * Читается на каждый вызов, чтобы оператор мог менять бюджет между прогонами
 * без перезапуска (по аналогии с другими env-ручками).
 */
export function getCostBudgetKopeks(): number {
  const raw = process.env["DESIGN_COST_BUDGET_KOPEKS"];
  if (typeof raw !== "string") {
    return DEFAULT_COST_BUDGET_KOPEKS;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || !/^-?\d+$/.test(trimmed)) {
    return DEFAULT_COST_BUDGET_KOPEKS;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_COST_BUDGET_KOPEKS;
  }
  return parsed;
}

/**
 * Ошибка, которую `CostBudget.ensureWithinBudget()` бросает, когда накопленная
 * стоимость уже превысила верхнюю границу `Cost_Budget`. Перехватывается
 * оркестратором перекраски (`repaintAll`), чтобы прекратить дальнейшие вызовы
 * `Depth_ControlNet_Provider` и сообщить о превышении (Req 12.5). Поля несут
 * фактически потраченное и лимит для лога/вывода.
 */
export class CostBudgetExceededError extends Error {
  /** Фактически потрачено по всем вызовам провайдера, в копейках. */
  public readonly spentKopeks: number;
  /** Верхняя граница `Cost_Budget` на момент проверки, в копейках. */
  public readonly limitKopeks: number;

  constructor(spentKopeks: number, limitKopeks: number) {
    super(
      `превышен бюджет генерации B2: потрачено ${spentKopeks} коп. ` +
        `при лимите ${limitKopeks} коп.`,
    );
    this.name = "CostBudgetExceededError";
    this.spentKopeks = spentKopeks;
    this.limitKopeks = limitKopeks;
    // Восстанавливаем prototype chain после `extends Error` (TS issue #13965),
    // иначе `instanceof CostBudgetExceededError` ломается в части рантаймов.
    Object.setPrototypeOf(this, CostBudgetExceededError.prototype);
  }
}

/**
 * In-memory аккумулятор `Cost_Budget` для одного прогона B2-пайплайна.
 *
 * Использование (в `repaintAll`):
 *
 * ```ts
 * const budget = createCostBudget();
 * for (const depthMap of depthMaps) {
 *   budget.ensureWithinBudget();           // отсечка ДО вызова (Req 12.5)
 *   try {
 *     const { costKopeks } = await falDepthControlNetRepaint(...);
 *     budget.record(costKopeks);           // учёт успешного вызова
 *   } catch (err) {
 *     if (err instanceof NsfwBlockedError) {
 *       budget.record(err.costKopeks);     // NSFW-отказ тоже стоит денег (Req 6.7)
 *     }
 *     throw err;
 *   }
 * }
 * console.log(budget.report());            // итоговая стоимость в копейках (Req 12.4)
 * ```
 *
 * Семантика отсечки строгая: `spent === limit` допустимо (лимит — потолок),
 * прекращение вызовов наступает только при `spent > limit`, что согласуется с
 * `enforceCostCeiling()` и Property 22.
 */
export class CostBudget {
  /** Верхняя граница, в копейках (зафиксирована на момент создания). */
  public readonly limitKopeks: number;

  /** Суммарная стоимость учтённых вызовов провайдера, в копейках. */
  private spentKopeks = 0;

  /** Число учтённых вызовов провайдера (включая NSFW-отказы). */
  private callCount = 0;

  constructor(limitKopeks: number = getCostBudgetKopeks()) {
    // Защищаемся от мусорного лимита (NaN/отрицательное/дробное): откат к
    // env-дефолту, чтобы guard не «сломался открытым» из-за кривого аргумента.
    this.limitKopeks =
      Number.isFinite(limitKopeks) && limitKopeks >= 0
        ? Math.floor(limitKopeks)
        : getCostBudgetKopeks();
  }

  /** Итоговая стоимость всех учтённых вызовов провайдера, в копейках. */
  get totalKopeks(): number {
    return this.spentKopeks;
  }

  /** Сколько вызовов провайдера учтено (включая NSFW-отказы). */
  get calls(): number {
    return this.callCount;
  }

  /** Превышена ли верхняя граница `Cost_Budget` прямо сейчас. */
  get exceeded(): boolean {
    return this.spentKopeks > this.limitKopeks;
  }

  /**
   * Проверка ПЕРЕД очередным вызовом `Depth_ControlNet_Provider`. Бросает
   * `CostBudgetExceededError`, если накопленная стоимость уже превысила верхнюю
   * границу `Cost_Budget`, тем самым прекращая дальнейшие вызовы (Req 12.5).
   */
  ensureWithinBudget(): void {
    if (this.spentKopeks > this.limitKopeks) {
      throw new CostBudgetExceededError(this.spentKopeks, this.limitKopeks);
    }
  }

  /**
   * Учитывает стоимость завершившегося вызова провайдера — включая вызовы,
   * закончившиеся NSFW-отказом (Req 6.7, 12.4). Возвращает новую суммарную
   * стоимость в копейках.
   *
   * Нефинитные/отрицательные стоимости трактуются как 0: цена не может быть
   * отрицательной, а `NaN` не должен «отравлять» накопитель и ломать сравнение
   * с лимитом. Сам вызов при этом всё равно учитывается в `calls`.
   */
  record(costKopeks: number): number {
    const safeCost =
      Number.isFinite(costKopeks) && costKopeks > 0 ? costKopeks : 0;
    this.spentKopeks += safeCost;
    this.callCount += 1;
    return this.spentKopeks;
  }

  /**
   * Человекочитаемая итоговая строка для вывода оператору по завершении прогона
   * (Req 12.4): суммарная стоимость в копейках, число вызовов и пометка о
   * превышении, если оно было.
   */
  report(): string {
    const base =
      `Cost_Budget: потрачено ${this.spentKopeks} коп. за ${this.callCount} ` +
      `вызов(ов) Depth_ControlNet_Provider при лимите ${this.limitKopeks} коп.`;
    return this.exceeded ? `${base} — ПРЕВЫШЕН` : base;
  }
}

/**
 * Фабрика аккумулятора `Cost_Budget`. По умолчанию берёт лимит из
 * `getCostBudgetKopeks()` (env `DESIGN_COST_BUDGET_KOPEKS`, иначе $0.6); тесты
 * и вызывающий код могут передать явный лимит.
 */
export function createCostBudget(limitKopeks?: number): CostBudget {
  return limitKopeks === undefined
    ? new CostBudget()
    : new CostBudget(limitKopeks);
}
