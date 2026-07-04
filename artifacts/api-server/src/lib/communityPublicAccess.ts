/**
 * Auth_Service — уровень доступа 1: публичное чтение без аутентификации
 * (Requirement 9).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "Auth_Service",
 * трёхуровневая модель доступа; "Zone_Service").
 *
 * Этот модуль — тонкий политический/guard-слой уровня 1. Он НЕ реализует сами
 * маршруты лент/галереи/PRO_Public (это задачи 3.4 / 4.4 / 5.5), а предоставляет
 * переиспользуемые примитивы, которые эти маршруты позже подключат:
 *
 *   1. `communityPublicRead` — Express-middleware, ЯВНО помечающий community
 *      GET-эндпоинт как публичный и НЕ требующий ни сессии, ни Max_Login
 *      (Requirements 9.1, 9.2). Это passthrough: он ничего не блокирует и не
 *      навешивает никаких auth-проверок, а лишь документирует и фиксирует в
 *      `res.locals`, что контент доступен анониму и поисковым роботам без
 *      аутентификации (Requirement 9.3).
 *
 *   2. `checkOperationalAccess(ctx)` — ЧИСТАЯ, тестируемая функция, реализующая
 *      Requirement 9.4: несмотря на отсутствие требования аутентификации,
 *      платформа ВПРАВЕ отказать анониму при действующих операционных
 *      ограничениях — ограничение частоты запросов (`rate_limited`), режим
 *      обслуживания (`maintenance`) или решение модерации (`moderation_block`).
 *
 *   3. `enforceOperationalAccess(options?)` — фабрика Express-middleware,
 *      связывающая `checkOperationalAccess` с существующим паттерном
 *      rate-limit (`./rateLimit`) и флагом обслуживания из окружения
 *      (`COMMUNITY_MAINTENANCE_MODE`). Готова к монтированию community-роутерами.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * R9.2 / R9.3 ASSERTION (документирующая):
 *
 * Публичное чтение НЕ зависит от Max_Bot. Ни один примитив этого модуля не
 * читает, не требует и не проверяет Max-идентификаторы или сессию для доступа
 * на чтение. Единственные основания отказать анониму — операционные
 * ограничения из Requirement 9.4, реализованные в `checkOperationalAccess`.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Request, Response, NextFunction } from "express";
import { createRateLimiter, type RateLimitOptions } from "./rateLimit.js";

// ─────────────────────────────────────────────────────────────────────────────
// Часть 1. Маркер публичного чтения (уровень доступа 1)
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      /**
       * Признак того, что текущий ответ обслуживает публичное community-чтение
       * без аутентификации (Requirements 9.1–9.3). Выставляется
       * `communityPublicRead`. Нижележащие слои (SEO, логирование) могут на него
       * опираться, но он НИКОГДА не влияет на разрешение доступа.
       */
      communityPublicRead?: boolean;
    }
  }
}

/**
 * Express-middleware, помечающий community GET-эндпоинт как публичный
 * (уровень доступа 1).
 *
 * Поведение: passthrough — вызывает `next()` безусловно, не навешивая ни
 * session-, ни Max-проверок (Requirements 9.1, 9.2). Дополнительно фиксирует
 * `res.locals.communityPublicRead = true`, чтобы факт «этот ответ доступен
 * анониму и роботам без auth» был явным и самодокументируемым (Requirement 9.3).
 *
 * Важно: этот middleware НЕ выполняет операционные проверки. Для отказа по
 * причинам из Requirement 9.4 применяйте `enforceOperationalAccess` ПОСЛЕ него.
 */
export function communityPublicRead(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.locals.communityPublicRead = true;
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Часть 2. Операционный отказ (Requirement 9.4) — чистая логика
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Причина операционного отказа анониму в публичном чтении (Requirement 9.4).
 * Отсутствие аутентификации само по себе НЕ является причиной отказа — это
 * исключительно операционные ограничения.
 */
export type OperationalDenyReason =
  /** Ограничение частоты запросов (rate limit) сработало для клиента. */
  | "rate_limited"
  /** Платформа/сообщество переведены в режим обслуживания. */
  | "maintenance"
  /** Решение модерации закрыло доступ к конкретному публичному контенту. */
  | "moderation_block";

/**
 * Результат операционной проверки — дискриминированное объединение по `allow`.
 *
 * - Разрешено: `{ allow: true }` — анониму отдаётся публичный контент на чтение.
 * - Отказ: `{ allow: false, reason, status, retryable }`, где:
 *     - `status`  — рекомендованный HTTP-код (429 / 503 / 403);
 *     - `retryable` — имеет ли смысл повторить запрос позже (rate limit,
 *       обслуживание — да; решение модерации — нет).
 */
export type OperationalAccessResult =
  | { allow: true }
  | {
      allow: false;
      reason: OperationalDenyReason;
      status: number;
      retryable: boolean;
    };

/**
 * Контекст операционной проверки. Все поля опциональны; отсутствующее поле
 * трактуется как «ограничение не действует» (для `maintenanceMode` — читается
 * из окружения, см. ниже).
 */
export interface OperationalAccessContext {
  /**
   * Режим обслуживания. Если не задан явно (`undefined`), берётся из окружения
   * через `isMaintenanceModeEnabled()` (`COMMUNITY_MAINTENANCE_MODE`).
   */
  maintenanceMode?: boolean;
  /** Сработало ли ограничение частоты запросов для текущего клиента. */
  rateLimited?: boolean;
  /** Закрыт ли доступ к запрошенному контенту решением модерации. */
  moderationBlocked?: boolean;
}

/** HTTP-код и признак повторяемости для каждой причины отказа. */
const DENY_META: Record<
  OperationalDenyReason,
  { status: number; retryable: boolean }
> = {
  // Режим обслуживания — временная недоступность всего сервиса.
  maintenance: { status: 503, retryable: true },
  // Решение модерации — не повторяемо простым retry (нужно снятие блокировки).
  moderation_block: { status: 403, retryable: false },
  // Rate limit — временно; клиент может повторить позже.
  rate_limited: { status: 429, retryable: true },
};

/**
 * Распарсить флаг режима обслуживания из окружения.
 *
 * Truthy-значения (регистр не важен): `1`, `true`, `yes`, `on`. Всё остальное —
 * включая отсутствие переменной — трактуется как «обслуживание выключено».
 */
export function isMaintenanceModeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.COMMUNITY_MAINTENANCE_MODE;
  if (typeof raw !== "string") return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * Операционный guard уровня 1 (Requirement 9.4).
 *
 * По умолчанию доступ РАЗРЕШЁН: анонимное публичное чтение не требует
 * аутентификации (Requirements 9.1–9.3). Отказ возможен ТОЛЬКО при действующем
 * операционном ограничении, и никогда — из-за отсутствия аутентификации/Max.
 *
 * Детерминированный приоритет причин (при одновременном срабатывании):
 *   1. `maintenance`       — глобальная недоступность важнее частных причин;
 *   2. `moderation_block`  — решение по конкретному контенту;
 *   3. `rate_limited`      — троттлинг конкретного клиента.
 *
 * Приоритет фиксирован, чтобы результат был воспроизводим и тестируем.
 *
 * @param ctx контекст ограничений; `maintenanceMode === undefined` → читается
 *            из окружения (`COMMUNITY_MAINTENANCE_MODE`).
 */
export function checkOperationalAccess(
  ctx: OperationalAccessContext = {},
): OperationalAccessResult {
  const maintenance =
    ctx.maintenanceMode ?? isMaintenanceModeEnabled();

  if (maintenance) {
    return deny("maintenance");
  }
  if (ctx.moderationBlocked === true) {
    return deny("moderation_block");
  }
  if (ctx.rateLimited === true) {
    return deny("rate_limited");
  }

  return { allow: true };
}

function deny(reason: OperationalDenyReason): OperationalAccessResult {
  const meta = DENY_META[reason];
  return { allow: false, reason, status: meta.status, retryable: meta.retryable };
}

// ─────────────────────────────────────────────────────────────────────────────
// Часть 3. Готовый Express-middleware, связывающий guard с rate-limit + env
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Предикат «сработало ли ограничение частоты запросов» для текущего запроса.
 * Инъектируется, чтобы логику можно было тестировать без сети/таймеров.
 */
export type RateLimitProbe = (req: Request) => boolean;

/**
 * Резолвер решения модерации для запрошенного публичного пути. По умолчанию —
 * `false` (модерация не закрывает контент). Moderation_Service (Task 7)
 * позднее подставит реальный резолвер.
 */
export type ModerationBlockResolver = (req: Request) => boolean;

export interface EnforceOperationalAccessOptions {
  /**
   * Опции rate-limit; при передаче создаётся лимитер через `createRateLimiter`
   * (тот же паттерн, что и в остальных публичных эндпоинтах). Взаимоисключимо
   * с `rateLimitProbe`.
   */
  rateLimit?: RateLimitOptions;
  /** Кастомный предикат rate-limit (для тестов/специфичных источников). */
  rateLimitProbe?: RateLimitProbe;
  /** Резолвер решения модерации; по умолчанию всегда `false`. */
  moderationBlock?: ModerationBlockResolver;
  /** Переопределение флага обслуживания (по умолчанию — из окружения). */
  maintenanceMode?: () => boolean;
}

/**
 * Построить предикат rate-limit поверх существующего `createRateLimiter`.
 *
 * `createRateLimiter` возвращает middleware, который сам отвечает 429. Здесь он
 * используется как «зонд»: перехватываем, вызвал ли он ветку отказа, не
 * отправляя ответ клиенту, — чтобы решение об HTTP-ответе принимал единый
 * операционный guard (`enforceOperationalAccess`).
 */
function rateLimiterAsProbe(options: RateLimitOptions): RateLimitProbe {
  const limiter = createRateLimiter(options);
  return (req: Request): boolean => {
    let limited = false;
    // Мини-заглушка Response: фиксируем только факт ответа 429.
    const probeRes = {
      status(code: number) {
        if (code === 429) limited = true;
        return { json: () => undefined };
      },
    } as unknown as Response;
    limiter(req, probeRes, () => {
      /* allowed → limited остаётся false */
    });
    return limited;
  };
}

/**
 * Express-middleware уровня 1, применяющий операционный guard (Requirement 9.4)
 * к публичному community-чтению.
 *
 * Порядок применения в маршруте: `communityPublicRead` → `enforceOperationalAccess`
 * → обработчик. Middleware НЕ вводит никаких требований аутентификации — он лишь
 * отклоняет запрос при действующем операционном ограничении, отдавая корректный
 * HTTP-код (429/503/403) и машиночитаемую причину.
 */
export function enforceOperationalAccess(
  options: EnforceOperationalAccessOptions = {},
) {
  const probe: RateLimitProbe | null = options.rateLimitProbe
    ? options.rateLimitProbe
    : options.rateLimit
      ? rateLimiterAsProbe(options.rateLimit)
      : null;

  const moderationBlock = options.moderationBlock ?? (() => false);
  const maintenance = options.maintenanceMode ?? isMaintenanceModeEnabled;

  return function operationalAccessMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const result = checkOperationalAccess({
      maintenanceMode: maintenance(),
      rateLimited: probe ? probe(req) : false,
      moderationBlocked: moderationBlock(req),
    });

    if (result.allow) {
      next();
      return;
    }

    res
      .status(result.status)
      .set("Cache-Control", "no-store")
      .json({
        error: result.reason,
        retryable: result.retryable,
      });
  };
}

/**
 * Агрегирующий объект — единая точка для роут-слоя (Tasks 3.4 / 4.4 / 5.5) и тестов.
 */
export const CommunityPublicAccess = {
  communityPublicRead,
  checkOperationalAccess,
  isMaintenanceModeEnabled,
  enforceOperationalAccess,
};

export type CommunityPublicAccessApi = typeof CommunityPublicAccess;
