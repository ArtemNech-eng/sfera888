/**
 * Community Feeds API — HTTP-маршруты чтения лент и публикации тем сообщества
 * «ХочуТакже» (Task 4.4).
 *
 * Mounted at /api/community/feeds задачей 14.1 (здесь роутер НЕ регистрируется).
 *
 * Маршруты:
 *   • GET  /city/:citySlug  — City_Feed по slug города (Requirements 1.2, 2.1).
 *   • GET  /zhk/:zhkSlug     — Local_Feed по slug ЖК (Requirements 1.4, 3.3).
 *   • POST /zhk              — публикация темы Local_Feed, уровень доступа 3
 *                              (Requirements 3.1, 3.2, 3.4, 3.5, 11.x).
 *
 * УРОВНИ ДОСТУПА:
 *   • GET — публичны (уровень 1, Requirement 9.1): чтение лент доступно без
 *     аутентификации, чтобы контент индексировался и читался анонимами.
 *   • POST — уровень 3 (Requirement 11): публиковать может только владелец
 *     подтверждённого Community_Account (`phoneVerifiedAt != null`,
 *     `hasPublishingRights`). Идентификатор публикующего аккаунта берётся из
 *     заголовка `X-Community-Account-Id` (в 14.1 источником станет сессия);
 *     права проверяются по БД — заголовок сам по себе прав не даёт.
 *
 * Пустая лента — не ошибка: возвращается `feed.emptyState = true` со статусом
 * 200 (Requirements 1.3, 3.6). Несуществующий slug — 404 `{ error: "not_found" }`
 * (Requirement 1.5).
 *
 * Слой чистых сервисов (FeedService, GeoService, Auth) инъектируется через
 * фабрику `createFeedsRouter(deps)`, а хендлеры выделены в `makeHandlers(deps)` —
 * это позволяет юнит-тестам прогонять маршруты без БД и без поднятия сервера.
 *
 * Spec: .kiro/specs/hochu-takzhe-community/
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { db, communityAccountsTable, type CommunityAccount } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  feedService as defaultFeedService,
  type FeedQuery,
  type FeedResult,
  type ProFeedResult,
  type CreateLocalTopicResult,
  type CreatePublicQuestionResult,
  type FeedService,
} from "../../lib/feedService.js";
import {
  getCityBySlug as defaultGetCityBySlug,
  getZhkBySlug as defaultGetZhkBySlug,
  type CityView,
  type ZhkView,
} from "../../lib/geoService.js";
import { hasPublishingRights } from "../../lib/communityAuth.js";

declare const console: { error: (...args: unknown[]) => void };

/** Заголовок, несущий идентификатор публикующего Community_Account (уровень 3). */
export const ACCOUNT_ID_HEADER = "x-community-account-id";

// ── Rate limiting по IP для анонимного «народного вопроса» (Ask_Anything) ────
// Анти-спам заменяет снятый гейт верификации: не более N вопросов с одного IP
// в скользящем окне. Не блокирует публичное чтение (GET).
const askRateStore = new Map<string, { count: number; resetTime: number }>();
const ASK_RATE_WINDOW_MS = 60 * 1000;
const ASK_RATE_MAX = 8;

export function askRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress;
  if (!ip) return next();
  const now = Date.now();
  const record = askRateStore.get(ip);
  if (record && record.resetTime > now) {
    if (record.count >= ASK_RATE_MAX) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    record.count += 1;
  } else {
    askRateStore.set(ip, { count: 1, resetTime: now + ASK_RATE_WINDOW_MS });
  }
  next();
}

/**
 * Инъектируемые зависимости роутера. Все — с прод-дефолтами; тесты подставляют
 * фейки, чтобы прогонять маршруты без БД.
 */
export interface FeedsRouterDeps {
  /** Сервис чтения/создания лент (по умолчанию — singleton поверх пула БД). */
  feedService: Pick<
    FeedService,
    "getCityFeed" | "getLocalFeed" | "createLocalTopic" | "createPublicQuestion"
  >;
  /** Резолвер City по slug (по умолчанию — GeoService). */
  getCityBySlug: (slug: string) => Promise<CityView | null>;
  /** Резолвер ZhK по slug (по умолчанию — GeoService). */
  getZhkBySlug: (slug: string) => Promise<ZhkView | null>;
  /** Загрузка Community_Account по id для проверки прав публикации (уровень 3). */
  loadAccount: (accountId: number) => Promise<CommunityAccount | null>;
}

/** Загрузка аккаунта по умолчанию — Drizzle поверх `community_accounts`. */
async function defaultLoadAccount(accountId: number): Promise<CommunityAccount | null> {
  const [row] = await db
    .select()
    .from(communityAccountsTable)
    .where(eq(communityAccountsTable.id, accountId))
    .limit(1);
  return row ?? null;
}

/** Прод-дефолты зависимостей роутера. */
const defaultDeps: FeedsRouterDeps = {
  feedService: defaultFeedService,
  getCityBySlug: defaultGetCityBySlug,
  getZhkBySlug: defaultGetZhkBySlug,
  loadAccount: defaultLoadAccount,
};

// ─── Разбор запроса ──────────────────────────────────────────────────────────

/**
 * Извлечь параметры пагинации ленты из query-строки (`limit`, `cursor`).
 * Нечисловой/отрицательный `limit` и пустой `cursor` игнорируются — сервис сам
 * нормализует значения и трактует отсутствие курсора как первую страницу.
 */
export function parseFeedQuery(query: Request["query"]): FeedQuery {
  const out: FeedQuery = {};

  const rawLimit = query["limit"];
  if (typeof rawLimit === "string" && rawLimit.trim().length > 0) {
    const n = Number(rawLimit);
    if (Number.isFinite(n)) out.limit = n;
  }

  const rawCursor = query["cursor"];
  if (typeof rawCursor === "string" && rawCursor.trim().length > 0) {
    out.cursor = rawCursor.trim();
  }

  return out;
}

/** Результат разрешения публикующего аккаунта уровня 3. */
export type PublisherResolution =
  | { ok: true; account: CommunityAccount }
  | { ok: false; status: 401 | 403; body: { error: string; reason?: string } };

/**
 * Разрешить публикующий Community_Account и проверить права уровня 3
 * (Requirement 11).
 *
 * Порядок:
 *   1. Заголовок `X-Community-Account-Id` обязателен и должен быть
 *      положительным целым — иначе 401 (неаутентифицированный запрос).
 *   2. Аккаунт должен существовать и иметь права публикации
 *      (`hasPublishingRights`, т.е. завершённую Phone_Verification) — иначе 403
 *      с предложением подтвердить телефон (Requirement 11.3, 11.4).
 *
 * Max_Login в проверку не входит и не может быть обязательным (Requirement 11.4).
 */
export async function resolvePublisher(
  req: Request,
  loadAccount: FeedsRouterDeps["loadAccount"],
): Promise<PublisherResolution> {
  const raw = req.headers[ACCOUNT_ID_HEADER];
  const headerValue = Array.isArray(raw) ? raw[0] : raw;
  const accountId = Number(headerValue);

  if (!headerValue || !Number.isInteger(accountId) || accountId <= 0) {
    return { ok: false, status: 401, body: { error: "unauthorized" } };
  }

  const account = await loadAccount(accountId);
  if (!hasPublishingRights(account)) {
    // Уровень 3 не пройден: нет подтверждённой Phone_Verification (R11.3, R11.4).
    return {
      ok: false,
      status: 403,
      body: { error: "forbidden", reason: "phone_verification_required" },
    };
  }

  return { ok: true, account: account! };
}

// ─── HTTP-хендлеры (тестируемы без сервера) ──────────────────────────────────

/** Заголовки кэширования публичной read-only ленты (совместимо с marketplace). */
function setFeedCache(res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
}

/** Проекция результата ленты в публичный DTO ответа. */
function toFeedDto(feed: FeedResult | ProFeedResult) {
  return feed;
}

/**
 * Собрать набор async-хендлеров поверх инъектированных зависимостей.
 * Выделены отдельно, чтобы тесты вызывали их напрямую с mock req/res.
 */
export function makeHandlers(deps: FeedsRouterDeps) {
  /**
   * GET /city/:citySlug — City_Feed по slug города (Requirements 1.2, 2.1).
   * Несуществующий город → 404 (Requirement 1.5). Пустая лента → 200 c
   * `emptyState: true` (Requirement 1.3).
   */
  async function getCityFeed(req: Request, res: Response): Promise<void> {
    const citySlug = (req.params as { citySlug?: string }).citySlug ?? "";
    try {
      const city = await deps.getCityBySlug(citySlug);
      if (!city) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const feed = await deps.feedService.getCityFeed(city.id, parseFeedQuery(req.query));
      setFeedCache(res);
      res.json({ city, feed: toFeedDto(feed) });
    } catch (e: unknown) {
      console.error("[community/feeds/city]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * GET /zhk/:zhkSlug — Local_Feed по slug ЖК (Requirements 1.4, 3.3).
   * Возвращаются только темы этого ЖК; несуществующий ЖК → 404 (Requirement
   * 1.5); пустая лента → 200 c `emptyState: true` (Requirement 3.6).
   */
  async function getLocalFeed(req: Request, res: Response): Promise<void> {
    const zhkSlug = (req.params as { zhkSlug?: string }).zhkSlug ?? "";
    try {
      const zhk = await deps.getZhkBySlug(zhkSlug);
      if (!zhk) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const feed = await deps.feedService.getLocalFeed(zhk.id, parseFeedQuery(req.query));
      setFeedCache(res);
      res.json({ zhk, feed: toFeedDto(feed) });
    } catch (e: unknown) {
      console.error("[community/feeds/zhk]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * POST /zhk — публикация темы Local_Feed (уровень доступа 3, Requirement 11).
   *
   * Гейт уровня 3 (`resolvePublisher`) → при отказе 401/403. Иначе создаётся
   * тема, привязанная к ЖК аккаунта на момент публикации (Requirement 3.2).
   * Недопустимый ввод/отсутствие привязки к ЖК → 400 с кодом причины и
   * `draftId`: введённые данные сохранены как черновик, чтобы ввод не был
   * потерян (Requirements 3.4, 3.5).
   */
  async function createLocalTopic(req: Request, res: Response): Promise<void> {
    try {
      const publisher = await resolvePublisher(req, deps.loadAccount);
      if (!publisher.ok) {
        res.status(publisher.status).json(publisher.body);
        return;
      }

      const body = (req.body ?? {}) as {
        category?: unknown;
        title?: unknown;
        body?: unknown;
      };

      const result: CreateLocalTopicResult = await deps.feedService.createLocalTopic({
        authorAccountId: publisher.account.id,
        category: typeof body.category === "string" ? body.category : null,
        title: typeof body.title === "string" ? body.title : null,
        body: typeof body.body === "string" ? body.body : null,
      });

      if (result.status === "created") {
        res.status(201).json({ status: "created", thread: result.thread });
        return;
      }

      // Отклонение с сохранённым черновиком (Requirements 3.4, 3.5).
      res.status(400).json({
        status: "rejected",
        reason: result.reason,
        draftId: result.draftId ?? null,
      });
    } catch (e: unknown) {
      console.error("[community/feeds/zhk:create]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  return { getCityFeed, getLocalFeed, createLocalTopic, askQuestion };

  /**
   * POST /ask — анонимный «народный вопрос» (Ask_Anything, уровень доступа 1).
   *
   * SEO/UGC-поток низкого трения: любой посетитель задаёт вопрос без выбора
   * категории и БЕЗ подтверждения телефона. Тело `{ zhkSlug | citySlug,
   * category?, title, body? }`. Адресат резолвится по slug (ЖК приоритетнее
   * города). Тема пишется с `authorAccountId = null`, `visibility = public`.
   * Анти-спам — rate limit по IP (`askRateLimit`, применяется в роутере).
   */
  async function askQuestion(req: Request, res: Response): Promise<void> {
    try {
      const body = (req.body ?? {}) as {
        zhkSlug?: unknown;
        citySlug?: unknown;
        category?: unknown;
        title?: unknown;
        body?: unknown;
      };
      const zhkSlug = typeof body.zhkSlug === "string" ? body.zhkSlug.trim() : "";
      const citySlug = typeof body.citySlug === "string" ? body.citySlug.trim() : "";

      let zhkId: number | null = null;
      let cityId: number | null = null;
      if (zhkSlug) {
        const zhk = await deps.getZhkBySlug(zhkSlug);
        if (!zhk) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        zhkId = zhk.id;
      } else if (citySlug) {
        const city = await deps.getCityBySlug(citySlug);
        if (!city) {
          res.status(404).json({ error: "not_found" });
          return;
        }
        cityId = city.id;
      } else {
        res.status(400).json({ status: "rejected", reason: "no_target" });
        return;
      }

      const result: CreatePublicQuestionResult = await deps.feedService.createPublicQuestion({
        zhkId,
        cityId,
        category: typeof body.category === "string" ? body.category : null,
        title: typeof body.title === "string" ? body.title : null,
        body: typeof body.body === "string" ? body.body : null,
      });

      if (result.status === "created") {
        res.status(201).json({ status: "created", thread: result.thread });
        return;
      }
      res.status(400).json({ status: "rejected", reason: result.reason });
    } catch (e: unknown) {
      console.error("[community/feeds/ask]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }
}

/**
 * Собрать Express-роутер лент сообщества (Task 4.4).
 *
 * @param deps частичное переопределение зависимостей (для тестов); отсутствующие
 *             поля берутся из прод-дефолтов.
 */
export function createFeedsRouter(deps: Partial<FeedsRouterDeps> = {}): Router {
  const resolved: FeedsRouterDeps = { ...defaultDeps, ...deps };
  const handlers = makeHandlers(resolved);

  const router = Router();
  // Публичное чтение (уровень 1).
  router.get("/city/:citySlug", handlers.getCityFeed);
  router.get("/zhk/:zhkSlug", handlers.getLocalFeed);
  // Публикация темы Local_Feed (уровень 3).
  router.post("/zhk", handlers.createLocalTopic);
  // Анонимный «народный вопрос» (уровень 1, rate limit по IP).
  router.post("/ask", askRateLimit, handlers.askQuestion);
  return router;
}

/** Прод-роутер с дефолтными зависимостями (монтируется в 14.1). */
const feedsRouter = createFeedsRouter();
export default feedsRouter;
