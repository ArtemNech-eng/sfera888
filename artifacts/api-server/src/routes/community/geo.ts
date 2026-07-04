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

/**
 * Middleware уровня доступа 3: резолвит Community_Account и проверяет права
 * публикации.
 *
 *   • отсутствует идентификатор аккаунта → 401 `account_required`;
 *   • аккаунт не найден или Phone_Verification не завершена → 403
 *     `verification_required` (публикация запрещена до подтверждения телефона,
 *     Requirement 11.1/11.4).
 */
async function requireCommunityPublisher(
  req: CommunityRequest,
  res: Response,
  next: NextFunction,
) {
  const accountId = resolveAccountId(req);
  if (accountId === null) {
    return res.status(401).json({ error: "account_required" });
  }

  let account: CommunityAccount | undefined;
  try {
    [account] = await db
      .select()
      .from(communityAccountsTable)
      .where(eq(communityAccountsTable.id, accountId))
      .limit(1);
  } catch (err) {
    console.error("[community/geo] account lookup failed:", err);
    return res.status(500).json({ error: "internal_error" });
  }

  if (!hasPublishingRights(account)) {
    return res.status(403).json({ error: "verification_required" });
  }

  req.communityAccount = account;
  next();
}

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

    // ЖК города — для навигации по локальным сообществам (Requirement 1.1).
    const zhk = await db
      .select({ slug: zhkTable.slug, name: zhkTable.name, status: zhkTable.status })
      .from(zhkTable)
      .where(eq(zhkTable.cityId, city.id))
      .orderBy(desc(zhkTable.contentScore), zhkTable.name);

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
// GET /zhk/:zhkSlug — ZhK + Local_Feed (Requirements 1.4, 1.5, 1.7).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/zhk/:zhkSlug", async (req: Request, res: Response) => {
  try {
    const zhk = await GeoService.getZhkBySlug(String(req.params.zhkSlug));
    if (!zhk) {
      // Requirement 1.5 — «ресурс не найден», Local_Feed не отображается.
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
    const body = (req.body ?? {}) as { name?: unknown; citySlug?: unknown };
    const name = typeof body.name === "string" ? body.name : "";
    const citySlug = typeof body.citySlug === "string" ? body.citySlug : "";

    try {
      const result = await GeoService.createZhk({
        name,
        citySlug,
        createdByAccountId: req.communityAccount?.id ?? null,
      });

      switch (result.status) {
        case "created":
          // Requirement 4.1, 4.6 — новый ЖК создан, Local_Feed доступен сразу.
          return res.status(201).json({ status: "created", zhk: result.zhk });
        case "duplicate_suggested":
          // Requirement 4.5 — предлагаем существующий ЖК вместо дубликата.
          return res
            .status(200)
            .json({ status: "duplicate_suggested", existing: result.existing });
        case "rejected":
          // Requirement 4.3 (invalid_name) / 4.4 (city_not_found) — запись не
          // создаётся, сообщение поясняет невыполненное условие.
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
