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
  type PhoneVerificationDeps,
} from "../../lib/communityAuth.js";

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
  /** Загрузка Community_Account по id для `/link-max` (по умолчанию — Drizzle). */
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
const defaultDeps: AuthRouterDeps = {
  verification: {},
  loadAccount: defaultLoadAccount,
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

  return { requestCode, confirmCode, linkMax };
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
  return router;
}

/** Прод-роутер с дефолтными зависимостями (монтируется в 14.1). */
const authRouter = createAuthRouter();
export default authRouter;
