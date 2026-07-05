/**
 * Geo_Service HTTP-маршруты — гео-иерархия Город → ЖК (Task 3.4).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "Geo_Service").
 *
 * Роутер монтируется под `/api/community/geo` (регистрация — Task 14.1, здесь
 * НЕ регистрируется). Он выставляет тонкий HTTP-слой поверх уже реализованных
 * доменных сервисов:
 *
 *   • `GET /city/:citySlug`  — City + City_Feed по публичному slug; отсутствие
 *     города → 404 `{ notFound: true }` (Requirements 1.2, 1.5).
 *   • `GET /zhk/:zhkSlug`    — ZhK + Local_Feed по публичному slug; отсутствие
 *     ЖК → 404 (Requirements 1.4, 1.5). Незаполненные атрибуты ЖК в DTO не
 *     попадают (обеспечивает `GeoService.shapeZhkAttributes`, Requirement 1.7).
 *   • `POST /zhk`            — создание нового ZhK_Record (уровень доступа 3 —
 *     подтверждённый Community_Account); валидация/дедуп/резолвинг города —
 *     в `GeoService.createZhk` (Requirements 4.1–4.5). Rate limiting по IP.
 *
 * Доменная логика (валидация имени, дедупликация, 404-семантика, форма DTO)
 * живёт в `src/lib/geoService.ts` и `src/lib/feedService.ts`; роут-слой лишь
 * транслирует результаты в HTTP-коды и подключает уровень доступа + rate limit.
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { db, communityAccountsTable, citiesTable, zhkTable, type CommunityAccount } from "@workspace/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { GeoService } from "../../lib/geoService.js";
import type { CreateLocalityInput } from "../../lib/geoService.js";
import { feedService } from "../../lib/feedService.js";
import { hasPublishingRights } from "../../lib/communityAuth.js";

declare const console: { error: (...args: unknown[]) => void };

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting (переиспользуем паттерн из routes/leads.ts): скользящее окно по
// IP. Защищает публичный POST создания ЖК от злоупотреблений (Requirement 9.4 —
// операционные ограничения вправе отказать анониму/публичному клиенту).
// ─────────────────────────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 минута
const RATE_LIMIT_MAX = 10; // не более 10 запросов за окно на IP

function checkRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress;
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
// Уровень доступа 3 (Requirement 4.1, 11.1/11.4): создание ЖК требует
// подтверждённого Community_Account. Идентификатор аккаунта передаётся фасадом
// (который управляет community-сессией) через заголовок `X-Community-Account-Id`
// либо поле `accountId` в теле. Права публикации определяются ИСКЛЮЧИТЕЛЬНО
// завершённой Phone_Verification (`hasPublishingRights`) — Max_Login не является
// гейтом (Requirement 11.4).
// ─────────────────────────────────────────────────────────────────────────────

/** Расширяем Request полем с разрешённым публикующим аккаунтом. */
interface CommunityRequest extends Request {
  communityAccount?: CommunityAccount;
}

/**
 * Извлечь идентификатор Community_Account из запроса. Чистая функция —
 * тестируется без БД. Принимает значение из заголовка `X-Community-Account-Id`
 * (приоритет) либо из тела `accountId`; возвращает положительное целое либо
 * `null`, если идентификатор отсутствует/некорректен.
 */
export function resolveAccountId(req: {
  headers?: Record<string, unknown>;
  body?: unknown;
}): number | null {
  const headerRaw = req.headers?.["x-community-account-id"];
  const bodyRaw =
    typeof req.body === "object" && req.body !== null
      ? (req.body as Record<string, unknown>)["accountId"]
      : undefined;

  const candidate = headerRaw ?? bodyRaw;
  const num =
    typeof candidate === "number"
      ? candidate
      : typeof candidate === "string"
        ? Number(candidate.trim())
        : NaN;

  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

/** Загрузчик Community_Account по идентификатору (инъектируемый seam). */
export type LoadCommunityAccount = (
  accountId: number,
) => Promise<CommunityAccount | undefined>;

/** Результат разрешения публикующего аккаунта уровня 3 (Requirement 4.5). */
export type PublisherResolution =
  | { ok: true; account: CommunityAccount }
  | { ok: false; status: 401 | 403; body: { error: string } };

/**
 * Загрузчик по умолчанию: читает Community_Account из БД по первичному ключу.
 */
async function loadCommunityAccountFromDb(
  accountId: number,
): Promise<CommunityAccount | undefined> {
  const [account] = await db
    .select()
    .from(communityAccountsTable)
    .where(eq(communityAccountsTable.id, accountId))
    .limit(1);
  return account;
}

/**
 * Чистая (относительно инъектированного `loadAccount`) логика гейта уровня 3.
 * Тестируется без БД: `loadAccount` инъектируется.
 *
 *   • отсутствует идентификатор аккаунта → 401 `account_required`
 *     (`loadAccount` не вызывается — ничего не читается и не пишется);
 *   • аккаунт не найден или Phone_Verification не завершена → 403
 *     `verification_required` (Requirement 4.5 / 11.1 / 11.4).
 */
export async function resolveCommunityPublisher(
  req: { headers?: Record<string, unknown>; body?: unknown },
  loadAccount: LoadCommunityAccount,
): Promise<PublisherResolution> {
  const accountId = resolveAccountId(req);
  if (accountId === null) {
    return { ok: false, status: 401, body: { error: "account_required" } };
  }

  const account = await loadAccount(accountId);
  if (!hasPublishingRights(account)) {
    return { ok: false, status: 403, body: { error: "verification_required" } };
  }

  return { ok: true, account };
}

/**
 * Фабрика middleware уровня доступа 3: резолвит Community_Account через
 * инъектированный `loadAccount` и проверяет права публикации. Если гейт не
 * пройден, `next` НЕ вызывается — нижележащий обработчик создания (и, значит,
 * `GeoService.createLocality`) не выполняется, запись не сохраняется.
 *
 *   • отсутствует идентификатор аккаунта → 401 `account_required`;
 *   • аккаунт не найден или Phone_Verification не завершена → 403
 *     `verification_required` (публикация запрещена до подтверждения телефона,
 *     Requirement 4.5 / 11.1 / 11.4).
 */
export function makeRequireCommunityPublisher(loadAccount: LoadCommunityAccount) {
  return async function requireCommunityPublisher(
    req: CommunityRequest,
    res: Response,
    next: NextFunction,
  ) {
    let resolution: PublisherResolution;
    try {
      resolution = await resolveCommunityPublisher(req, loadAccount);
    } catch (err) {
      console.error("[community/geo] account lookup failed:", err);
      return res.status(500).json({ error: "internal_error" });
    }

    if (!resolution.ok) {
      return res.status(resolution.status).json(resolution.body);
    }

    req.communityAccount = resolution.account;
    next();
  };
}

/**
 * Middleware уровня доступа 3, привязанный к реальному загрузчику из БД.
 * Именно он навешивается на `POST /zhk`.
 */
const requireCommunityPublisher = makeRequireCommunityPublisher(
  loadCommunityAccountFromDb,
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /cities — список городов целевого SEO-набора для хаб-страницы сообщества.
// Публичный (уровень 1): отдаёт активные города с is_geo_covered=true
// (slug, name, region) для навигации по разделу «Соседи».
// ─────────────────────────────────────────────────────────────────────────────
router.get("/cities", async (_req: Request, res: Response) => {
  try {
    const cities = await db
      .select({ slug: citiesTable.slug, name: citiesTable.name, region: citiesTable.region })
      .from(citiesTable)
      .where(
        and(
          eq(citiesTable.isGeoCovered, true),
          eq(citiesTable.isActive, true),
          isNotNull(citiesTable.slug),
        ),
      )
      .orderBy(citiesTable.name);
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res.json({ cities });
  } catch (err) {
    console.error("[community/geo] GET cities failed:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /city/:citySlug — City + City_Feed (Requirements 1.2, 1.5).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/city/:citySlug", async (req: Request, res: Response) => {
  try {
    const city = await GeoService.getCityBySlug(String(req.params.citySlug));
    if (!city) {
      // Requirement 1.5 — «ресурс не найден», City_Feed не отображается.
      return res.status(404).json({ notFound: true });
    }

    // Requirement 1.2 — темы уровня города, сортировка по активности; пустой
    // фид — не ошибка (Requirement 1.3), это решает Feed_Service.
    const cityFeed = await feedService.getCityFeed(city.id, {
      limit: parseLimit(req.query.limit),
      cursor: parseCursor(req.query.cursor),
    });

    // Все локации города любого Locality_Kind (ЖК, районы, посёлки) единым
    // списком, отсортированным по name_normalized asc без группировки по kind
    // (Requirement 2.4). Поле ответа `zhk` сохранено ради совместимости фасада;
    // теперь каждый элемент включает поле `kind`.
    const zhk = await GeoService.listLocalitiesByCity(city.id);

    return res.json({ city, cityFeed, zhk });
  } catch (err) {
    console.error("[community/geo] GET city failed:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /zhk — список ЖК для блока «Популярные ЖК» на хаб-странице.
// Публичный (уровень 1): индексируемые ЖК (прошедшие порог контента), с именем
// города; сортировка по content_score. Параметр ?limit (по умолчанию 24, макс 60).
// Зарегистрирован ДО POST /zhk (разные методы) и до /zhk/:zhkSlug (GET /zhk без
// параметра — отдельный путь).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/zhk", async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), 60) : 24;
    const zhk = await db
      .select({
        slug: zhkTable.slug,
        name: zhkTable.name,
        cityName: citiesTable.name,
        citySlug: citiesTable.slug,
      })
      .from(zhkTable)
      .innerJoin(citiesTable, eq(zhkTable.cityId, citiesTable.id))
      .where(eq(zhkTable.isIndexable, true))
      .orderBy(desc(zhkTable.contentScore), zhkTable.name)
      .limit(limit);
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res.json({ zhk });
  } catch (err) {
    console.error("[community/geo] GET zhk list failed:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /zhk/:zhkSlug — Locality + Local_Feed (Requirements 2.5, 3.2, 3.5, 1.7).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/zhk/:zhkSlug", async (req: Request, res: Response) => {
  try {
    // Резолвим Locality любого Locality_Kind; DTO включает поле `kind`
    // (Requirement 3.2). Поле ответа `zhk` сохранено ради совместимости фасада.
    const zhk = await GeoService.getLocalityBySlug(String(req.params.zhkSlug));
    if (!zhk) {
      // Requirement 2.5 / 3.5 — «локация не найдена», Local_Feed не отображается.
      return res.status(404).json({ notFound: true });
    }

    // Requirement 1.4 / 3.3 — только темы данного ЖК, сортировка по дате; пустой
    // фид — не ошибка (Requirement 3.6).
    const localFeed = await feedService.getLocalFeed(zhk.id, {
      limit: parseLimit(req.query.limit),
      cursor: parseCursor(req.query.cursor),
    });

    return res.json({ zhk, localFeed });
  } catch (err) {
    console.error("[community/geo] GET zhk failed:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /zhk — создание нового ZhK_Record (уровень доступа 3, Requirement 4).
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/zhk",
  checkRateLimit,
  requireCommunityPublisher,
  async (req: CommunityRequest, res: Response) => {
    const body = (req.body ?? {}) as {
      name?: unknown;
      citySlug?: unknown;
      kind?: unknown;
    };
    const name = typeof body.name === "string" ? body.name : "";
    const citySlug = typeof body.citySlug === "string" ? body.citySlug : "";
    // `kind` опционален (Requirement 1.3–1.5): отсутствие/`null` → "zhk"
    // (Requirement 1.4), недопустимое значение отклоняется как invalid_kind.
    // Передаём как есть — доменный `createLocality` валидирует его.
    const kind = body.kind as CreateLocalityInput["kind"];

    try {
      const result = await GeoService.createLocality({
        name,
        citySlug,
        kind,
        createdByAccountId: req.communityAccount?.id ?? null,
      });

      switch (result.status) {
        case "created":
          // Requirement 4.2, 4.4 — новая локация создана, Local_Feed доступен
          // сразу. Поле `zhk` сохранено ради совместимости фасада (содержит
          // созданную локацию с полем `kind`).
          return res
            .status(201)
            .json({ status: "created", zhk: result.locality });
        case "duplicate_suggested":
          // Requirement 5.1 — предлагаем существующую локацию вместо дубликата.
          return res
            .status(200)
            .json({ status: "duplicate_suggested", existing: result.existing });
        case "rejected":
          // Requirement 1.5 (invalid_kind) / 4.6 (invalid_name) → 400;
          // 4.7 (city_not_found) → 404. Запись не создаётся, `message`
          // поясняет невыполненное условие.
          return res
            .status(result.reason === "city_not_found" ? 404 : 400)
            .json({
              status: "rejected",
              reason: result.reason,
              error: result.message,
            });
      }
    } catch (err) {
      console.error("[community/geo] POST zhk failed:", err);
      return res.status(500).json({ error: "internal_error" });
    }
  },
);

// ─── Внутренние помощники разбора query ──────────────────────────────────────

/** Разобрать `?limit=` в положительное целое либо `undefined` (дефолт сервиса). */
function parseLimit(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Разобрать `?cursor=` в непрозрачную строку курсора либо `null`. */
function parseCursor(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export default router;
