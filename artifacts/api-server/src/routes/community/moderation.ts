/**
 * Moderation_Service HTTP-маршруты — панель оператора/модератора (Task 7.3).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "Moderation_Service").
 *
 * Роутер монтируется под `/api/community/moderation` (регистрация — Task 14.1,
 * здесь НЕ регистрируется). В отличие от публичных community-роутеров
 * (`geo.ts`, `feeds.ts`), эти эндпоинты предназначены ТОЛЬКО для сотрудников
 * CRM (операторов/модераторов) и защищены ролевым middleware `requireRole`
 * (см. `routes/leads.ts`), а НЕ уровнем доступа сообщества.
 *
 * Эндпоинты:
 *   • GET  /queue           — очередь тем на рассмотрение (Requirement 19.3).
 *                             Очередь материализована через существующую схему:
 *                             `community_threads.moderation_status = 'queued'`
 *                             (отдельной таблицы `moderation_queue` в БД нет —
 *                             см. замечание в `lib/moderationService.ts`).
 *   • POST /threads/:id/action — применить модерационное действие к теме
 *                             (`allow` | `restrict` | `unpublish` | `block`).
 *                             Каждое действие пишется в журнал с `moderatorId`
 *                             и `reason` (Requirement 19.4).
 *   • GET  /log             — чтение журнала модерационных действий
 *                             (Requirement 19.4). Опциональные фильтры
 *                             `targetType` / `targetId`.
 *
 * Доменные эффекты (обновление темы + запись журнала) переиспользуют уже
 * реализованный `ModerationService.logAction` (Task 7.2). Чистая логика
 * (валидация действия, отображение действия → состояние темы, извлечение
 * идентификатора модератора) вынесена в тестируемые без БД функции, а сами
 * зависимости инъектируются через фабрику `createModerationRouter(deps)` /
 * `makeHandlers(deps)` — по образцу `routes/community/feeds.ts`.
 */

import { Router, type Request, type Response } from "express";
import { eq, and, desc, type SQL } from "drizzle-orm";
import {
  db,
  communityThreadsTable,
  communityModerationLogTable,
  type CommunityThread,
  type CommunityModerationLog,
} from "@workspace/db";
import { requireRole } from "../../middlewares/requireAuth.js";
import { logAction } from "../../lib/moderationService.js";

declare const console: { error: (...args: unknown[]) => void };

/**
 * Роли, которым разрешена модерация сообщества. Отдельной роли «moderator» в
 * системе нет — модерацией занимаются сотрудники CRM (см. `routes/leads.ts`,
 * `routes/orders.ts`). `admin` — полный доступ, операторы — рабочая модерация.
 */
export const MODERATOR_ROLES = ["admin", "lead_operator", "master_operator"] as const;

/** Маркер очереди в существующей схеме (`community_threads.moderation_status`). */
export const QUEUED_STATUS = "queued";

/** Действия, которые модератор может применить к теме через API. */
export type ModerationApplyAction = "allow" | "restrict" | "unpublish" | "block";

const APPLY_ACTIONS: readonly ModerationApplyAction[] = [
  "allow",
  "restrict",
  "unpublish",
  "block",
];

/** Итоговое состояние темы + действие журнала для применяемого действия. */
export interface ThreadStateTransition {
  /** Новое значение `community_threads.visibility`. */
  visibility: "public" | "protected" | "hidden";
  /** Новое значение `community_threads.moderation_status`. */
  moderationStatus: "allowed" | "restricted" | "unpublished" | "blocked";
  /** Значение `community_moderation_log.action` (совместимо с дизайном). */
  logAction: "allow" | "move_protected" | "hide" | "block";
}

/**
 * Отобразить модераторское действие в целевое состояние темы и действие
 * журнала. Чистая функция — основа тестов без БД.
 *
 *   • `allow`     → публичная видимость, журнал `allow`.
 *   • `restrict`  → перенос в PRO_Protected_Layer (`protected`), журнал
 *                   `move_protected` (Requirement 19.2).
 *   • `unpublish` → снятие с публикации (`hidden`), журнал `hide`
 *                   (Requirement 19.2).
 *   • `block`     → блокировка (`hidden` + `blocked`), журнал `block`
 *                   (Requirement 19.5).
 */
export function mapActionToThreadState(
  action: ModerationApplyAction,
): ThreadStateTransition {
  switch (action) {
    case "allow":
      return { visibility: "public", moderationStatus: "allowed", logAction: "allow" };
    case "restrict":
      return {
        visibility: "protected",
        moderationStatus: "restricted",
        logAction: "move_protected",
      };
    case "unpublish":
      return { visibility: "hidden", moderationStatus: "unpublished", logAction: "hide" };
    case "block":
      return { visibility: "hidden", moderationStatus: "blocked", logAction: "block" };
  }
}

/**
 * Проверить и нормализовать строку действия. Возвращает валидное
 * {@link ModerationApplyAction} либо `null`. Чистая функция.
 */
export function parseModerationAction(raw: unknown): ModerationApplyAction | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return (APPLY_ACTIONS as readonly string[]).includes(value)
    ? (value as ModerationApplyAction)
    : null;
}

/**
 * Извлечь идентификатор модератора из аутентифицированного запроса. Роль уже
 * проверена `requireRole`, который кладёт запись пользователя в `req.user`.
 * Возвращает положительное целое либо `null`. Чистая функция.
 */
export function resolveModeratorId(req: {
  user?: unknown;
}): number | null {
  const user = req.user;
  if (typeof user !== "object" || user === null) return null;
  const id = (user as Record<string, unknown>).id;
  const num = typeof id === "number" ? id : typeof id === "string" ? Number(id) : NaN;
  return Number.isInteger(num) && num > 0 ? num : null;
}

/** Результат применения действия к теме. */
export type ApplyActionResult =
  | { status: "applied"; thread: CommunityThread; log: CommunityModerationLog }
  | { status: "not_found" };

/** Вход для применения модераторского действия. */
export interface ApplyActionInput {
  threadId: number;
  action: ModerationApplyAction;
  reason: string;
  moderatorId: number;
}

/** Параметры чтения журнала модерации. */
export interface ListLogQuery {
  limit?: number;
  targetType?: string;
  targetId?: number;
}

/**
 * Инъектируемые зависимости роутера. Прод-дефолты обращаются к БД; тесты
 * подставляют фейки, чтобы прогонять маршруты без БД.
 */
export interface ModerationRouterDeps {
  /** Пункты очереди модерации (Requirement 19.3). */
  listQueue: (limit: number) => Promise<CommunityThread[]>;
  /** Применить действие к теме + записать журнал (Requirement 19.4). */
  applyAction: (input: ApplyActionInput) => Promise<ApplyActionResult>;
  /** Чтение журнала модерационных действий (Requirement 19.4). */
  listLog: (query: ListLogQuery) => Promise<CommunityModerationLog[]>;
}

// ─── Прод-дефолты зависимостей (Drizzle) ─────────────────────────────────────

const DEFAULT_QUEUE_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_LOG_LIMIT = 100;

/**
 * Очередь модерации по умолчанию: темы с `moderation_status = 'queued'`,
 * новые сверху (Requirement 19.3).
 */
async function defaultListQueue(limit: number): Promise<CommunityThread[]> {
  return db
    .select()
    .from(communityThreadsTable)
    .where(eq(communityThreadsTable.moderationStatus, QUEUED_STATUS))
    .orderBy(desc(communityThreadsTable.createdAt))
    .limit(limit);
}

/**
 * Применение действия по умолчанию: обновляет видимость/статус темы и пишет
 * запись в `community_moderation_log` с `moderatorId` и `reason`
 * (Requirement 19.4). Несуществующая тема → `{ status: "not_found" }`.
 */
async function defaultApplyAction(input: ApplyActionInput): Promise<ApplyActionResult> {
  const state = mapActionToThreadState(input.action);
  const [updated] = await db
    .update(communityThreadsTable)
    .set({ visibility: state.visibility, moderationStatus: state.moderationStatus })
    .where(eq(communityThreadsTable.id, input.threadId))
    .returning();

  if (!updated) return { status: "not_found" };

  const log = await logAction({
    targetType: "thread",
    targetId: input.threadId,
    action: state.logAction,
    reason: input.reason,
    moderatorId: input.moderatorId,
  });

  return { status: "applied", thread: updated, log };
}

/** Чтение журнала по умолчанию с опциональными фильтрами (Requirement 19.4). */
async function defaultListLog(query: ListLogQuery): Promise<CommunityModerationLog[]> {
  const conditions: SQL[] = [];
  if (query.targetType) {
    conditions.push(eq(communityModerationLogTable.targetType, query.targetType));
  }
  if (query.targetId != null) {
    conditions.push(eq(communityModerationLogTable.targetId, query.targetId));
  }

  const base = db.select().from(communityModerationLogTable);
  const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;

  return filtered
    .orderBy(desc(communityModerationLogTable.createdAt))
    .limit(query.limit ?? DEFAULT_LOG_LIMIT);
}

/** Прод-дефолты зависимостей роутера. */
const defaultDeps: ModerationRouterDeps = {
  listQueue: defaultListQueue,
  applyAction: defaultApplyAction,
  listLog: defaultListLog,
};

// ─── Разбор запроса ──────────────────────────────────────────────────────────

/** Разобрать `?limit=` в положительное целое в диапазоне [1, MAX_LIMIT]. */
export function parseLimit(raw: unknown, fallback: number): number {
  const num = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), MAX_LIMIT);
}

/** Разобрать целочисленный path/query-параметр в положительное целое либо null. */
export function parsePositiveInt(raw: unknown): number | null {
  const num = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isInteger(num) && num > 0 ? num : null;
}

// ─── HTTP-хендлеры (тестируемы без сервера) ──────────────────────────────────

/**
 * Собрать набор async-хендлеров поверх инъектированных зависимостей. Выделены
 * отдельно, чтобы тесты вызывали их напрямую с mock req/res (без БД/сервера).
 */
export function makeHandlers(deps: ModerationRouterDeps) {
  /**
   * GET /queue — очередь тем на рассмотрение (Requirement 19.3). Пустая очередь
   * — не ошибка: возвращается `{ items: [] }` со статусом 200.
   */
  async function getQueue(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseLimit(req.query["limit"], DEFAULT_QUEUE_LIMIT);
      const items = await deps.listQueue(limit);
      res.json({ items });
    } catch (e: unknown) {
      console.error("[community/moderation/queue]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * POST /threads/:id/action — применить модерационное действие к теме
   * (Requirement 19.2, 19.4, 19.5).
   *
   *   • невалидный id темы → 400 `invalid_thread_id`;
   *   • невалидное/отсутствующее действие → 400 `invalid_action`;
   *   • пустой `reason` → 400 `reason_required` (журнал обязан содержать
   *     причину, Requirement 19.4);
   *   • не удалось определить модератора → 401 `unauthorized`;
   *   • тема не найдена → 404 `not_found`;
   *   • успех → 200 с обновлённой темой и записью журнала.
   */
  async function applyThreadAction(req: Request, res: Response): Promise<void> {
    try {
      const threadId = parsePositiveInt((req.params as { id?: string }).id);
      if (threadId === null) {
        res.status(400).json({ error: "invalid_thread_id" });
        return;
      }

      const body = (req.body ?? {}) as { action?: unknown; reason?: unknown };
      const action = parseModerationAction(body.action);
      if (action === null) {
        res.status(400).json({ error: "invalid_action" });
        return;
      }

      // Журнал обязан фиксировать причину действия (Requirement 19.4).
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length === 0) {
        res.status(400).json({ error: "reason_required" });
        return;
      }

      const moderatorId = resolveModeratorId(req as { user?: unknown });
      if (moderatorId === null) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }

      const result = await deps.applyAction({ threadId, action, reason, moderatorId });
      if (result.status === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json({ status: "applied", thread: result.thread, log: result.log });
    } catch (e: unknown) {
      console.error("[community/moderation/action]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * GET /log — чтение журнала модерационных действий (Requirement 19.4).
   * Опциональные фильтры `targetType` / `targetId`.
   */
  async function getLog(req: Request, res: Response): Promise<void> {
    try {
      const query: ListLogQuery = {
        limit: parseLimit(req.query["limit"], DEFAULT_LOG_LIMIT),
      };
      const targetType = req.query["targetType"];
      if (typeof targetType === "string" && targetType.trim().length > 0) {
        query.targetType = targetType.trim();
      }
      const targetId = parsePositiveInt(req.query["targetId"]);
      if (targetId !== null) query.targetId = targetId;

      const items = await deps.listLog(query);
      res.json({ items });
    } catch (e: unknown) {
      console.error("[community/moderation/log]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  return { getQueue, applyThreadAction, getLog };
}

/**
 * Собрать Express-роутер модерации (Task 7.3).
 *
 * Все маршруты защищены ролевым middleware (`requireRole`) — доступ только
 * сотрудникам CRM (операторам/модераторам), в отличие от публичного доступа
 * сообщества.
 *
 * @param deps частичное переопределение зависимостей (для тестов); отсутствующие
 *             поля берутся из прод-дефолтов.
 */
export function createModerationRouter(
  deps: Partial<ModerationRouterDeps> = {},
): Router {
  const resolved: ModerationRouterDeps = { ...defaultDeps, ...deps };
  const handlers = makeHandlers(resolved);
  const moderators = requireRole(...MODERATOR_ROLES);

  const router = Router();
  router.get("/queue", moderators, handlers.getQueue);
  router.post("/threads/:id/action", moderators, handlers.applyThreadAction);
  router.get("/log", moderators, handlers.getLog);
  return router;
}

/** Прод-роутер с дефолтными зависимостями (монтируется в 14.1). */
const moderationRouter = createModerationRouter();
export default moderationRouter;
