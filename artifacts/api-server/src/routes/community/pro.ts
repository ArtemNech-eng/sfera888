/**
 * Community PRO API — HTTP-маршруты публичной зоны мастеров «Хочу также ПРО»
 * (Task 5.5).
 *
 * Mounted at /api/community/pro задачей 14.1 (здесь роутер НЕ регистрируется).
 *
 * Маршруты:
 *   • GET /:specialtySlug — PRO_Public_Layer лента выбранной Specialty
 *     (Requirements 6.1, 6.2, 6.4).
 *
 * ПОВЕДЕНИЕ ЛЕНТЫ (делегируется `FeedService.getProFeed`, Task 5.2):
 *   • По умолчанию — All_Russia_Feed: агрегирует профессиональные темы
 *     специальности по всей стране (Requirement 6.2). Пока My_City_Filter не
 *     применён явно, лента остаётся All_Russia и не пустеет из-за отсутствия
 *     локальных тем в текущем городе (Requirement 6.3).
 *   • My_City_Filter активируется ТОЛЬКО при явном запросе через query-параметр
 *     `?cityFilter=true&cityId=<id>` (Requirement 6.6). При активации лента
 *     ограничивается локальными рабочими темами текущего города; при отсутствии
 *     локальных тем — пустая лента без отката к All_Russia (Requirements 6.4,
 *     6.5). Значение по умолчанию (без параметра) — All_Russia.
 *
 * УРОВНИ ДОСТУПА:
 *   • GET публичен (уровень 1, Requirement 9.1): чтение PRO_Public_Layer
 *     доступно без аутентификации, чтобы контент индексировался и читался
 *     анонимами и поисковыми роботами (Requirement 6.7).
 *
 * Несуществующий slug специальности → 404 `{ error: "not_found" }`. Пустая
 * лента — не ошибка: `feed.emptyState = true` со статусом 200.
 *
 * Слой чистых сервисов (FeedService, резолвер специальности) инъектируется через
 * фабрику `createProRouter(deps)`, а хендлеры выделены в `makeHandlers(deps)` —
 * это позволяет юнит-тестам прогонять маршруты без БД и без поднятия сервера
 * (тот же паттерн, что и в `routes/community/feeds.ts`).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/
 */

import { Router, type Request, type Response } from "express";
import { db, specialtiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  feedService as defaultFeedService,
  type ProFeedQuery,
  type ProFeedResult,
  type FeedService,
} from "../../lib/feedService.js";

declare const console: { error: (...args: unknown[]) => void };

/**
 * Публичный DTO Specialty для страницы PRO-сообщества. Стабильный набор полей,
 * достаточный для рендера заголовка и SEO страницы `/pro/{specialtySlug}`.
 */
export interface SpecialtyView {
  id: number;
  slug: string;
  name: string;
}

/**
 * Инъектируемые зависимости роутера. Все — с прод-дефолтами; тесты подставляют
 * фейки, чтобы прогонять маршруты без БД.
 */
export interface ProRouterDeps {
  /** Сервис чтения PRO-ленты (по умолчанию — singleton поверх пула БД). */
  feedService: Pick<FeedService, "getProFeed">;
  /** Резолвер Specialty по публичному slug (по умолчанию — Drizzle). */
  getSpecialtyBySlug: (slug: string) => Promise<SpecialtyView | null>;
}

/**
 * Нормализовать входной slug специальности перед поиском. Публичные slug'и
 * хранятся в нижнем регистре (`^[a-z0-9-]{1,100}$`); приводим к нижнему регистру
 * и обрезаем пробелы. Пустой или заведомо длинный (> 100) slug не может
 * существовать — сразу `null`, чтобы не гонять промахивающийся запрос.
 */
function normalizeSlug(slug: string): string | null {
  if (typeof slug !== "string") return null;
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 100) return null;
  return normalized;
}

/** Резолвер специальности по умолчанию — Drizzle поверх `specialties`. */
async function defaultGetSpecialtyBySlug(slug: string): Promise<SpecialtyView | null> {
  const normalized = normalizeSlug(slug);
  if (normalized === null) return null;

  const [row] = await db
    .select({
      id: specialtiesTable.id,
      slug: specialtiesTable.slug,
      name: specialtiesTable.name,
    })
    .from(specialtiesTable)
    .where(eq(specialtiesTable.slug, normalized))
    .limit(1);

  return row ?? null;
}

/** Прод-дефолты зависимостей роутера. */
const defaultDeps: ProRouterDeps = {
  feedService: defaultFeedService,
  getSpecialtyBySlug: defaultGetSpecialtyBySlug,
};

// ─── Разбор запроса ──────────────────────────────────────────────────────────

/**
 * Извлечь параметры PRO-ленты из query-строки.
 *
 *   • `limit`      — размер страницы (положительное число; иначе игнорируется,
 *                    сервис применяет дефолт).
 *   • `cursor`     — непрозрачный курсор keyset-пагинации (непустая строка).
 *   • `cityFilter` — активирует My_City_Filter ТОЛЬКО при явном истинном
 *                    значении `"true"`/`"1"` (Requirement 6.6); любое иное
 *                    значение (в т.ч. отсутствие) означает All_Russia по
 *                    умолчанию (Requirements 6.2, 6.3).
 *   • `cityId`     — текущий город для My_City_Filter (положительное целое,
 *                    Requirement 6.4). Отображается в `currentCityId`.
 *
 * Функция чистая и детерминированная — тестируется без БД/сервера.
 */
export function parseProFeedQuery(query: Request["query"]): ProFeedQuery {
  const out: ProFeedQuery = {};

  const rawLimit = query["limit"];
  if (typeof rawLimit === "string" && rawLimit.trim().length > 0) {
    const n = Number(rawLimit);
    if (Number.isFinite(n)) out.limit = n;
  }

  const rawCursor = query["cursor"];
  if (typeof rawCursor === "string" && rawCursor.trim().length > 0) {
    out.cursor = rawCursor.trim();
  }

  // My_City_Filter активируется только явным истинным значением (Requirement 6.6).
  const rawFilter = query["cityFilter"];
  const filterValue = Array.isArray(rawFilter) ? rawFilter[0] : rawFilter;
  out.cityFilter = filterValue === "true" || filterValue === "1";

  const rawCity = query["cityId"];
  const cityValue = Array.isArray(rawCity) ? rawCity[0] : rawCity;
  if (typeof cityValue === "string" && cityValue.trim().length > 0) {
    const n = Number(cityValue);
    if (Number.isInteger(n) && n > 0) out.currentCityId = n;
  }

  return out;
}

// ─── HTTP-хендлеры (тестируемы без сервера) ──────────────────────────────────

/** Заголовки кэширования публичной read-only ленты (совместимо с feeds.ts). */
function setFeedCache(res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
}

/**
 * Собрать набор async-хендлеров поверх инъектированных зависимостей.
 * Выделены отдельно, чтобы тесты вызывали их напрямую с mock req/res.
 */
export function makeHandlers(deps: ProRouterDeps) {
  /**
   * GET /:specialtySlug — PRO_Public_Layer лента специальности (Requirements
   * 6.1, 6.2, 6.4). Несуществующая специальность → 404 (`not_found`). Режим
   * ленты (All_Russia по умолчанию либо My_City_Filter) определяет
   * `FeedService.getProFeed` по разобранным query-параметрам. Пустая лента →
   * 200 c `feed.emptyState = true`.
   */
  async function getProFeed(req: Request, res: Response): Promise<void> {
    const specialtySlug = (req.params as { specialtySlug?: string }).specialtySlug ?? "";
    try {
      const specialty = await deps.getSpecialtyBySlug(specialtySlug);
      if (!specialty) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const feed: ProFeedResult = await deps.feedService.getProFeed(
        specialty.id,
        parseProFeedQuery(req.query),
      );

      setFeedCache(res);
      res.json({ specialty, feed });
    } catch (e: unknown) {
      console.error("[community/pro]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  return { getProFeed };
}

/**
 * Собрать Express-роутер публичной зоны PRO (Task 5.5).
 *
 * @param deps частичное переопределение зависимостей (для тестов); отсутствующие
 *             поля берутся из прод-дефолтов.
 */
export function createProRouter(deps: Partial<ProRouterDeps> = {}): Router {
  const resolved: ProRouterDeps = { ...defaultDeps, ...deps };
  const handlers = makeHandlers(resolved);

  const router = Router();
  // Список специальностей для хаб-страницы сообщества (публичный, уровень 1).
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const specialties = await db
        .select({ slug: specialtiesTable.slug, name: specialtiesTable.name })
        .from(specialtiesTable)
        .where(eq(specialtiesTable.isActive, true))
        .orderBy(specialtiesTable.name);
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
      res.json({ specialties });
    } catch (e: unknown) {
      console.error("[community/pro] list", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  });
  // Публичное чтение PRO_Public_Layer (уровень 1, Requirement 9.1).
  router.get("/:specialtySlug", handlers.getProFeed);
  return router;
}

/** Прод-роутер с дефолтными зависимостями (монтируется в 14.1). */
const proRouter = createProRouter();
export default proRouter;
