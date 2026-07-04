/**
 * SEO_Service — порог контента и планирование сид-наполнения для страниц
 * City / ZhK гео-сообщества «ХочуТакже».
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "SEO_Service",
 * Data Models → `zhk.content_score` / `zhk.is_indexable`).
 *
 * Requirement 16.2: если страница ЖК/города не содержит достаточного контента,
 * SEO_Service наполняет её сид-данными (застройщик, срок сдачи, корпуса),
 * авто-темами, агрегированными ценами и AI-сид-контентом ДО публикации.
 *
 * Requirement 16.3: SEO_Service НЕ публикует для индексации страницу, не
 * удовлетворяющую минимальному порогу контента, чтобы исключить риск «тонких»
 * (дорвейных) страниц.
 *
 * ─── Область ответственности этого модуля ───────────────────────────────────
 * Модуль содержит ТОЛЬКО чистую, детерминированную и юнит-тестируемую логику:
 *
 *   1. `computeContentScore(input)` — считает «богатство» контента страницы из
 *      её сигналов (сид-данные ЖК, число авто/реальных тем, наличие
 *      агрегированных цен, наличие AI-сид-текста). Requirement 16.2.
 *
 *   2. `meetsContentThreshold(score, threshold?)` — гейт индексируемости: страница
 *      индексируема только если её оценка достигает минимального порога.
 *      Requirement 16.3. Порог конфигурируется через env `SEO_MIN_CONTENT_SCORE`.
 *
 *   3. `enrichZhkSeedData(zhk)` — ЧИСТЫЙ планировщик: описывает, какие поля
 *      сид-наполнения нужно заполнить перед публикацией (застройщик, срок,
 *      корпуса, авто-темы, агрегированные цены, AI-сид). Requirement 16.2.
 *      Планировщик НЕ вызывает AI-пайплайн и не пишет в БД — это интеграция
 *      (Task 11.2 на фасаде Next.js и слой сидирования).
 *
 * Фактическая пометка `is_indexable` / включение в sitemap на фасаде — Task 11.2.
 */

import type { Zhk } from "@workspace/db";

// ─────────────────────────────────────────────────────────────────────────────
// Порог контента (конфигурируемый)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Значение минимального порога контента по умолчанию (Requirement 16.3).
 *
 * Подобрано под шкалу баллов `computeContentScore` (см. веса ниже): страница
 * считается «не тонкой», когда у неё есть содержательный набор сигналов —
 * например, полные сид-данные ЖК (застройщик + срок + корпуса = 6) плюс хотя бы
 * пара тем (2×2 = 4) уже даёт 10. Значение намеренно скромное для стартовой
 * фазы и переопределяется через env.
 */
export const DEFAULT_MIN_CONTENT_SCORE = 10;

/** Env-ключ для переопределения минимального порога контента. */
export const SEO_MIN_CONTENT_SCORE_ENV = "SEO_MIN_CONTENT_SCORE";

/**
 * Разрешить минимальный порог контента из окружения.
 * Некорректное/отрицательное значение → возврат к
 * `DEFAULT_MIN_CONTENT_SCORE`. Ноль допускается (осознанное «индексировать всё»).
 */
export function getMinContentScore(): number {
  const raw = process.env[SEO_MIN_CONTENT_SCORE_ENV];
  const parsed = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MIN_CONTENT_SCORE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Веса сигналов контента
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Веса вклада каждого сигнала в общую оценку контента (Requirement 16.2).
 * Экспортируются, чтобы тесты и слой сидирования опирались на единый источник
 * истины, а не на «магические числа».
 */
export const CONTENT_SCORE_WEIGHTS = {
  /** Заполнен застройщик ЖК. */
  developer: 2,
  /** Заполнен срок сдачи ЖК. */
  completionDate: 2,
  /** Указан хотя бы один корпус ЖК. */
  buildings: 2,
  /** Балл за каждую тему (авто/сид или реальную), с ограничением сверху. */
  perThread: 2,
  /** Присутствуют агрегированные цены на странице. */
  aggregatedPrices: 3,
  /** Присутствует AI-сид-текст (вспомогательный, не основной слой доверия). */
  aiSeedBody: 3,
} as const;

/**
 * Верхняя граница вклада тем в оценку, чтобы «тонкая» страница нельзя было
 * протолкнуть, накрутив только счётчик тем. Максимум `THREAD_SCORE_CAP` тем
 * учитывается в оценке.
 */
export const THREAD_SCORE_CAP = 5;

// ─────────────────────────────────────────────────────────────────────────────
// computeContentScore — Requirement 16.2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Сигналы «богатства» контента страницы City/ZhK.
 *
 * Структура DB-независима (простые примитивы), чтобы функция оставалась чистой и
 * юнит-тестируемой. Вызывающий слой (сервис/сидирование) извлекает сигналы из
 * `zhkTable`/`citiesTable` и связанных `community_threads`.
 */
export interface ContentScoreInput {
  /** Заполнен ли застройщик (сид-данные, Requirement 16.2). */
  hasDeveloper?: boolean;
  /** Заполнен ли срок сдачи (сид-данные). */
  hasCompletionDate?: boolean;
  /** Число корпусов ЖК (сид-данные); >0 засчитывается. */
  buildingsCount?: number;
  /** Число авто-тем (сид/авто-сгенерированных) на странице. */
  autoThreadCount?: number;
  /** Число реальных тем, созданных жителями/мастерами. */
  realThreadCount?: number;
  /** Присутствуют ли агрегированные цены. */
  hasAggregatedPrices?: boolean;
  /** Присутствует ли AI-сид-текст (body). */
  hasAiSeedBody?: boolean;
}

/** Нормализовать значение к неотрицательному целому. */
function toCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * Посчитать оценку контента страницы (Requirement 16.2).
 *
 * ЧИСТАЯ детерминированная функция: одинаковый вход → одинаковый выход, без
 * обращения к БД, времени или случайности. Оценка складывается из взвешенных
 * сигналов; вклад тем ограничен сверху `THREAD_SCORE_CAP`, чтобы нельзя было
 * «накрутить» индексируемость одними пустыми темами.
 *
 * @returns неотрицательное целое — чем выше, тем «богаче» страница.
 */
export function computeContentScore(input: ContentScoreInput): number {
  const w = CONTENT_SCORE_WEIGHTS;
  let score = 0;

  if (input.hasDeveloper) score += w.developer;
  if (input.hasCompletionDate) score += w.completionDate;
  if (toCount(input.buildingsCount) > 0) score += w.buildings;

  const threads = toCount(input.autoThreadCount) + toCount(input.realThreadCount);
  score += Math.min(threads, THREAD_SCORE_CAP) * w.perThread;

  if (input.hasAggregatedPrices) score += w.aggregatedPrices;
  if (input.hasAiSeedBody) score += w.aiSeedBody;

  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// meetsContentThreshold — Requirement 16.3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Гейт индексируемости (Requirement 16.3).
 *
 * Страница индексируема ТОЛЬКО если её оценка контента достигает минимального
 * порога. ЧИСТАЯ функция: `score >= threshold`.
 *
 * @param score     оценка из `computeContentScore`.
 * @param threshold порог; по умолчанию — `getMinContentScore()` (env-конфиг).
 * @returns `true`, если страницу можно публиковать для индексации.
 */
export function meetsContentThreshold(
  score: number,
  threshold: number = getMinContentScore(),
): boolean {
  return score >= threshold;
}

// ─────────────────────────────────────────────────────────────────────────────
// enrichZhkSeedData — Requirement 16.2 (чистый планировщик)
// ─────────────────────────────────────────────────────────────────────────────

/** Категория сид-наполнения, требующая заполнения перед публикацией. */
export type SeedEnrichmentField =
  | "developer"
  | "completionDate"
  | "buildings"
  | "autoTopics"
  | "aggregatedPrices"
  | "aiSeedBody";

/** Дополнительные сигналы страницы ЖК, которых нет в `zhkTable`. */
export interface ZhkEnrichmentSignals {
  /** Число уже существующих (авто + реальных) тем страницы. */
  threadCount?: number;
  /** Есть ли уже агрегированные цены. */
  hasAggregatedPrices?: boolean;
}

/**
 * План сид-наполнения страницы ЖК до публикации (Requirement 16.2).
 */
export interface ZhkSeedEnrichmentPlan {
  /** Текущая оценка контента (по имеющимся сигналам). */
  currentScore: number;
  /** Применяемый минимальный порог. */
  threshold: number;
  /** Достигнут ли порог уже сейчас (без дополнительного наполнения). */
  meetsThreshold: boolean;
  /**
   * Поля, которые следует заполнить перед публикацией (то, чего не хватает).
   * Пустой массив ⇔ страница уже достаточно наполнена по всем сигналам.
   */
  missing: SeedEnrichmentField[];
}

/**
 * Минимально ожидаемое число тем на «живой» странице — ниже этого значения
 * планировщик рекомендует досидировать авто-темы (Requirement 16.2).
 */
export const MIN_SEEDED_TOPICS = 3;

/**
 * Чистый планировщик сид-наполнения ЖК (Requirement 16.2).
 *
 * Возвращает, какие поля сид-данных нужно заполнить перед публикацией
 * (застройщик, срок, корпуса, авто-темы, агрегированные цены, AI-сид), и текущую
 * оценку/статус порога. НЕ вызывает AI-пайплайн, НЕ пишет в БД и не имеет
 * побочных эффектов — это ответственность интеграционного слоя (Task 11.2 и
 * сидирование). Функция лишь описывает, что нужно наполнить.
 *
 * @param zhk     запись ЖК (`zhkTable.$inferSelect`) или её частичная форма.
 * @param signals дополнительные сигналы (число тем, наличие цен), которых нет в
 *                самой строке `zhk`.
 * @param threshold порог; по умолчанию — `getMinContentScore()`.
 */
export function enrichZhkSeedData(
  zhk: Partial<Zhk>,
  signals: ZhkEnrichmentSignals = {},
  threshold: number = getMinContentScore(),
): ZhkSeedEnrichmentPlan {
  const hasDeveloper = !!(zhk.developer && zhk.developer.trim().length > 0);
  const hasCompletionDate = !!(zhk.completionDate && zhk.completionDate.trim().length > 0);
  const buildingsCount = Array.isArray(zhk.buildings) ? zhk.buildings.length : 0;
  const hasBuildings = buildingsCount > 0;
  const threadCount = toCount(signals.threadCount);
  const hasAggregatedPrices = !!signals.hasAggregatedPrices;
  const hasAiSeedBody = !!(zhk.bodyMd && zhk.bodyMd.trim().length > 0);

  const currentScore = computeContentScore({
    hasDeveloper,
    hasCompletionDate,
    buildingsCount,
    realThreadCount: threadCount,
    hasAggregatedPrices,
    hasAiSeedBody,
  });

  const missing: SeedEnrichmentField[] = [];
  if (!hasDeveloper) missing.push("developer");
  if (!hasCompletionDate) missing.push("completionDate");
  if (!hasBuildings) missing.push("buildings");
  if (threadCount < MIN_SEEDED_TOPICS) missing.push("autoTopics");
  if (!hasAggregatedPrices) missing.push("aggregatedPrices");
  if (!hasAiSeedBody) missing.push("aiSeedBody");

  return {
    currentScore,
    threshold,
    meetsThreshold: meetsContentThreshold(currentScore, threshold),
    missing,
  };
}
