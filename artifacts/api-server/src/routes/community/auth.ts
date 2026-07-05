/**
 * Auth_Service HTTP-маршруты — уровень доступа 3: Community_Account через
 * Phone_Verification (Task 8.4).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "Auth_Service";
 * requirements.md → Requirement 11).
 *
 * Роутер монтируется под `/api/community/auth` (регистрация — Task 14.1, здесь
 * НЕ регистрируется). Он выставляет тонкий HTTP-слой поверх уже реализованных
 * доменных функций Phone_Verification из `src/lib/communityAuth.ts`:
 *
 *   • POST /request-code — выпуск и «отправка» одноразового кода на телефон
 *     (`requestPhoneCode`). Требование 11.1. Тело: `{ phone }`.
 *   • POST /confirm-code — подтверждение кода; при успехе создаёт/возвращает
 *     Community_Account с НЕМЕДЛЕННЫМИ полными правами публикации
 *     (`confirmPhoneCode`). Требования 11.1, 11.4. Тело: `{ phone, code }`.
 *   • POST /link-max     — ОПЦИОНАЛЬНАЯ привязка Max_Login к существующему
 *     верифицированному аккаунту (`linkMaxOptional`). Требование 11.2. Max —
 *     бонус, а НЕ гейт: привязка не влияет на права публикации (11.4).
 *
 * Ключевые инварианты, зафиксированные в коде:
 *   - Phone_Verification — первичный метод; Max нигде не является условием
 *     получения прав (Requirement 11.4). `/link-max` работает ТОЛЬКО поверх уже
 *     верифицированного аккаунта и не может «выдать» права.
 *   - Сам код подтверждения никогда не возвращается клиенту — только `expiresAt`;
 *     доставка идёт через инъектируемый sender (SMS в проде).
 *
 * Доменная логика (генерация/хеширование кода, TTL, немедленная выдача прав,
 * опциональность Max) живёт в `communityAuth.ts`. Роут-слой лишь транслирует
 * результаты в HTTP-коды, подключает rate limiting и (для `/link-max`) проверку
 * прав аккаунта. Слой инъектируется через фабрику `createAuthRouter(deps)`, а
 * хендлеры выделены в `makeHandlers(deps)` — это позволяет юнит-тестам прогонять
 * маршруты без БД, SMS и сети.
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { db, communityAccountsTable, type CommunityAccount } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  requestPhoneCode,
  confirmPhoneCode,
  linkMaxOptional,
  hasPublishingRights,
  registerAccount,
  loginAccount,
  toPublicAccount,
  type PhoneVerificationDeps,
  type CommunityAuthDeps,
  type RegisterRejectionReason,
} from "../../lib/communityAuth.js";
import { createRateLimiter } from "../../lib/rateLimit.js";

declare const console: { error: (...args: unknown[]) => void };

/** Заголовок, несущий идентификатор Community_Account (для `/link-max`). */
export const ACCOUNT_ID_HEADER = "x-community-account-id";

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting (переиспользуем паттерн из routes/community/geo.ts): скользящее
// окно по IP. Защищает публичные POST выпуска/подтверждения кода от перебора и
// злоупотреблений (Requirement 9.4 — операционные ограничения вправе отказать).
// ─────────────────────────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 минута
const RATE_LIMIT_MAX = 10; // не более 10 запросов за окно на IP

export function checkRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket?.remoteAddress;
  if (!ip) return next();
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  if (record && record.resetTime > now) {
    if (record.count >= RATE_LIMIT_MAX) {
      return res
        .status(429)
        .json({ error: "Too many requests, please try again later." });
    }
    record.count += 1;
  } else {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting password-потока (переиспользуем `createRateLimiter` из
// lib/rateLimit.ts — тот же паттерн, что в master-pwa.ts / auth.ts). Оба
// лимитера отвечают 429 автоматически при превышении окна (Requirements 7.1, 7.3).
// ─────────────────────────────────────────────────────────────────────────────
/** Registration_Rate_Limiter: 5 запросов / 60 минут на IP (Requirement 7.1). */
const registerRateLimit = createRateLimiter({ windowMs: 60 * 60_000, maxAttempts: 5 });
/** Login_Rate_Limiter: 10 запросов / 15 минут на IP (Requirement 7.3). */
const loginRateLimit = createRateLimiter({ windowMs: 15 * 60_000, maxAttempts: 10 });

/**
 * Срок действия Community_Session — не более 30 дней (Requirement 4.5). При
 * установке сессии community-маршруты выставляют `req.session.cookie.maxAge`
 * этим значением, переопределяя глобальный дефолт `app.ts` (1 день).
 */
const COMMUNITY_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Транслировать причину отказа `registerAccount` в HTTP-код и тело ответа
 * (см. таблицу Error Handling в design.md). Ответы с `retry: true` предлагают
 * повторить проверку Captcha (Requirements 2.5, 2.6, 2.7).
 */
function registerRejectionToHttp(
  reason: RegisterRejectionReason,
): { status: number; body: Record<string, unknown> } {
  switch (reason) {
    case "phone_missing":
    case "phone_invalid":
    case "password_missing":
    case "password_invalid":
      return { status: 400, body: { reason } };
    case "phone_taken":
      return { status: 409, body: { reason } };
    case "captcha_missing":
    case "captcha_failed":
      return { status: 400, body: { reason, retry: true } };
    case "captcha_unavailable":
      return { status: 503, body: { reason, retry: true } };
    default: {
      // Исчерпывающая проверка: новая причина обязана получить явный маппинг.
      const _exhaustive: never = reason;
      return { status: 400, body: { reason: _exhaustive } };
    }
  }
}

// ─── Разбор запроса ──────────────────────────────────────────────────────────

/**
 * Извлечь идентификатор Community_Account из запроса. Чистая функция —
 * тестируется без БД. Значение берётся из заголовка `X-Community-Account-Id`
 * (приоритет) либо из тела `accountId`; возвращает положительное целое либо
 * `null`, если идентификатор отсутствует/некорректен.
 */
export function resolveAccountId(req: {
  headers?: Record<string, unknown>;
  body?: unknown;
}): number | null {
  const headerRaw = req.headers?.[ACCOUNT_ID_HEADER];
  const headerValue = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  const bodyRaw =
    typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>)["accountId"]
      : undefined;

  const candidate = headerValue ?? bodyRaw;
  const num =
    typeof candidate === "number"
      ? candidate
      : typeof candidate === "string"
        ? Number(candidate.trim())
        : NaN;

  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

/**
 * Инъектируемые зависимости роутера. Все — с прод-дефолтами; тесты подставляют
 * фейки, чтобы прогонять маршруты без БД/SMS.
 */
export interface AuthRouterDeps {
  /**
   * Зависимости Phone_Verification (хранилище кодов, доставка, репозиторий
   * аккаунтов, источник времени/генератор). По умолчанию — прод-дефолты из
   * `communityAuth.ts` (in-memory стор + SMS-доставка + Drizzle-репозиторий).
   */
  verification: PhoneVerificationDeps;
  /** Загрузка Community_Account по id для `/link-max` и `/me` (по умолчанию — Drizzle). */
  loadAccount: (accountId: number) => Promise<CommunityAccount | null>;
  /**
   * Инъектируемые зависимости password-регистрации/входа (Requirements 1, 3, 6):
   * репозиторий аккаунтов, проверка Captcha, bcryptjs-хелперы. По умолчанию `{}`
   * — тогда `registerAccount` / `loginAccount` применяют прод-дефолты
   * (`communityAuthDefaults`). Тесты подставляют фейки, чтобы прогонять маршруты
   * без БД/сети/bcrypt.
   */
  auth: CommunityAuthDeps;
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
const defaultDeps: AuthRouterDeps = {
  verification: {},
  loadAccount: defaultLoadAccount,
  // Пустой объект → registerAccount/loginAccount применяют communityAuthDefaults.
  auth: {},
};

// ─── HTTP-хендлеры (тестируемы без сервера) ──────────────────────────────────

/**
 * Собрать набор async-хендлеров поверх инъектированных зависимостей.
 * Выделены отдельно, чтобы тесты вызывали их напрямую с mock req/res.
 */
export function makeHandlers(deps: AuthRouterDeps) {
  /**
   * POST /request-code — выпуск и отправка кода подтверждения (Requirement 11.1).
   *
   * Тело: `{ phone }`. Успех → 200 `{ ok: true, phone, expiresAt }` (сам код НЕ
   * возвращается). Некорректный телефон → 400 `{ error: "phone_invalid" }`.
   */
  async function requestCode(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as { phone?: unknown };
    const phone = typeof body.phone === "string" ? body.phone : "";
    try {
      const result = await requestPhoneCode(phone, deps.verification);
      if (!result.ok) {
        res.status(400).json({ error: result.reason });
        return;
      }
      res.status(200).json({ ok: true, phone: result.phone, expiresAt: result.expiresAt });
    } catch (e: unknown) {
      console.error("[community/auth/request-code]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * POST /confirm-code — подтверждение кода (Requirements 11.1, 11.4).
   *
   * Тело: `{ phone, code }`. Успех → 200 `{ ok: true, account }` с уже
   * проставленным `phoneVerifiedAt` (немедленные полные права публикации).
   * Отказ по коду/телефону → 400 с кодом причины.
   */
  async function confirmCode(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as { phone?: unknown; code?: unknown };
    const phone = typeof body.phone === "string" ? body.phone : "";
    const code = typeof body.code === "string" ? body.code : "";
    try {
      const result = await confirmPhoneCode(phone, code, deps.verification);
      if (!result.ok) {
        // Неверный телефон — 400; прочие причины (нет запроса/истёк/лимит/неверный
        // код) — 400: клиент повторяет запрос кода или ввод.
        res.status(400).json({ error: result.reason });
        return;
      }
      res.status(200).json({ ok: true, account: result.account });
    } catch (e: unknown) {
      console.error("[community/auth/confirm-code]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * POST /link-max — ОПЦИОНАЛЬНАЯ привязка Max_Login (Requirement 11.2).
   *
   * Max — бонус, а НЕ гейт: этот маршрут работает только поверх уже
   * верифицированного аккаунта (`hasPublishingRights`) и не выдаёт прав.
   * Идентификатор аккаунта — из заголовка `X-Community-Account-Id` или тела
   * `accountId`; `maxUserId` — из тела.
   *
   * Отсутствует id аккаунта → 401 `account_required`; аккаунт не найден или не
   * верифицирован → 403 `verification_required`; отсутствует maxUserId → 400
   * `max_user_id_required`; успех → 200 `{ ok: true, account }`.
   */
  async function linkMax(req: Request, res: Response): Promise<void> {
    const accountId = resolveAccountId(req);
    if (accountId === null) {
      res.status(401).json({ error: "account_required" });
      return;
    }

    const body = (req.body ?? {}) as { maxUserId?: unknown };
    const maxUserId = typeof body.maxUserId === "string" ? body.maxUserId.trim() : "";
    if (maxUserId.length === 0) {
      res.status(400).json({ error: "max_user_id_required" });
      return;
    }

    try {
      const account = await deps.loadAccount(accountId);
      // Привязка Max возможна только к верифицированному аккаунту: Max никогда
      // не заменяет Phone_Verification и не является путём получения прав (11.4).
      if (!hasPublishingRights(account)) {
        res.status(403).json({ error: "verification_required" });
        return;
      }

      const linked = await linkMaxOptional(account!.id, maxUserId, deps.verification);
      res.status(200).json({ ok: true, account: linked });
    } catch (e: unknown) {
      console.error("[community/auth/link-max]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  // ─── Password-поток: регистрация / вход / выход / текущий аккаунт ──────────

  /**
   * POST /register — форумная регистрация Community_Account по телефону и паролю
   * (Requirements 1.1–1.6). Тело: `{ phone, password, captchaToken }`.
   *
   * Доменная логика (нормализация, Password_Policy, Captcha, уникальность,
   * bcryptjs-хеш) — в `registerAccount`. Роут лишь транслирует результат в HTTP:
   *   • успех → 201, устанавливает Community_Session (`communityAccountId`) и
   *     срок cookie 30 дней (Requirement 4.5); аккаунт сериализуется ТОЛЬКО через
   *     `toPublicAccount` — без `password_hash` (Requirements 1.3, 1.4).
   *   • отказ → код/тело по таблице Error Handling (`registerRejectionToHttp`).
   */
  async function register(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as {
      phone?: unknown;
      password?: unknown;
      captchaToken?: unknown;
    };
    const phone = typeof body.phone === "string" ? body.phone : "";
    const password = typeof body.password === "string" ? body.password : "";
    const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken : "";
    try {
      const result = await registerAccount(
        { phone, password, captchaToken, remoteIp: req.ip ?? null },
        deps.auth,
      );
      if (!result.ok) {
        const { status, body: errBody } = registerRejectionToHttp(result.reason);
        res.status(status).json(errBody);
        return;
      }
      // Успех: устанавливаем Community_Session и срок cookie 30 дней (R1.3, R4.5).
      req.session.communityAccountId = result.account.id;
      if (req.session.cookie) {
        req.session.cookie.maxAge = COMMUNITY_SESSION_MAX_AGE_MS;
      }
      // Аккаунт наружу — ТОЛЬКО через toPublicAccount (без password_hash, R1.4).
      res.status(201).json({ ok: true, account: toPublicAccount(result.account) });
    } catch (e: unknown) {
      console.error("[community/auth/register]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * POST /login — вход по телефону и паролю (Requirements 3.1, 3.2, 3.7). Тело:
   * `{ phone, password }`.
   *
   *   • успех → 200, устанавливает Community_Session и срок cookie 30 дней; аккаунт
   *     сериализуется ТОЛЬКО через `toPublicAccount` (без `password_hash`, R3.2).
   *   • отказ → 401 единая ошибка `invalid_credentials`, не раскрывающая фактор
   *     (Requirement 3.7); сессия не устанавливается.
   */
  async function login(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as { phone?: unknown; password?: unknown };
    const phone = typeof body.phone === "string" ? body.phone : "";
    const password = typeof body.password === "string" ? body.password : "";
    try {
      const result = await loginAccount({ phone, password }, deps.auth);
      if (!result.ok) {
        // Единый отказ — без раскрытия несовпавшего фактора (R3.7).
        res.status(401).json({ error: "invalid_credentials" });
        return;
      }
      req.session.communityAccountId = result.account.id;
      if (req.session.cookie) {
        req.session.cookie.maxAge = COMMUNITY_SESSION_MAX_AGE_MS;
      }
      res.status(200).json({ ok: true, account: toPublicAccount(result.account) });
    } catch (e: unknown) {
      console.error("[community/auth/login]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * POST /logout — завершение Community_Session (Requirements 4.1, 4.3, 4.6).
   *
   *   • при действительной сессии → `session.destroy`, после которого
   *     идентификатор аккаунта недоступен, 200 `{ ok: true }` (R4.1).
   *   • без активной сессии → 200 `{ ok: true, noSession: true }` без ошибок и
   *     без изменения прочих сессий (R4.6).
   */
  async function logout(req: Request, res: Response): Promise<void> {
    if (typeof req.session?.communityAccountId !== "number") {
      // Нет активной community-сессии (R4.6): не аутентифицирован.
      res.status(200).json({ ok: true, noSession: true });
      return;
    }
    req.session.destroy((err) => {
      if (err) {
        console.error("[community/auth/logout]", err instanceof Error ? err.message : err);
        res.status(500).json({ error: "internal_error" });
        return;
      }
      res.status(200).json({ ok: true });
    });
  }

  /**
   * GET /me — данные текущего Community_Account (Requirements 4.4, 4.7).
   *
   *   • действительная сессия + аккаунт найден → 200 `{ account }`, сериализация
   *     ТОЛЬКО через `toPublicAccount` (без `password_hash`, R4.4).
   *   • нет сессии либо аккаунт не найден → 401 `{ error: "unauthorized" }`, не
   *     раскрывая данные аккаунта (R4.7).
   */
  async function me(req: Request, res: Response): Promise<void> {
    const accountId = req.session?.communityAccountId;
    if (typeof accountId !== "number" || !Number.isInteger(accountId) || accountId <= 0) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const account = await deps.loadAccount(accountId);
      if (!account) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      res.status(200).json({ account: toPublicAccount(account) });
    } catch (e: unknown) {
      console.error("[community/auth/me]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  return { requestCode, confirmCode, linkMax, register, login, logout, me };
}

/**
 * Собрать Express-роутер Auth_Service уровня 3 (Task 8.4).
 *
 * @param deps частичное переопределение зависимостей (для тестов); отсутствующие
 *             поля берутся из прод-дефолтов.
 */
export function createAuthRouter(deps: Partial<AuthRouterDeps> = {}): Router {
  const resolved: AuthRouterDeps = { ...defaultDeps, ...deps };
  const handlers = makeHandlers(resolved);

  const router = Router();
  // Публичные POST выпуска/подтверждения кода — под rate limiting по IP.
  router.post("/request-code", checkRateLimit, handlers.requestCode);
  router.post("/confirm-code", checkRateLimit, handlers.confirmCode);
  // Опциональная привязка Max — тоже под лимитом; работает поверх верифицированного аккаунта.
  router.post("/link-max", checkRateLimit, handlers.linkMax);

  // Password-поток форумной регистрации (community-phone-registration).
  // Регистрация и вход — под своими скользящими лимитерами (Requirements 7.1, 7.3),
  // которые сами отвечают 429 при превышении окна.
  router.post("/register", registerRateLimit, handlers.register);
  router.post("/login", loginRateLimit, handlers.login);
  router.post("/logout", handlers.logout);
  router.get("/me", handlers.me);
  return router;
}

/** Прод-роутер с дефолтными зависимостями (монтируется в 14.1). */
const authRouter = createAuthRouter();
export default authRouter;
