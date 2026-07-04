/**
 * Comment_Service — форум-слой сообщества: тема + дерево комментариев.
 *
 * Дополняет Feed_Service (ленты тем) страницей отдельной темы и обсуждением под
 * ней (модель «тема → комментарии», с необязательной вложенностью через
 * `parent_comment_id`).
 *
 *   • `getThreadById(id)`   — публичная тема по id с контекстом (город/ЖК/
 *     специальность) для хлебных крошек и ссылки «назад к ленте».
 *   • `listComments(id)`    — плоский список публичных комментариев темы,
 *     отсортированный по дате; дерево строит фасад.
 *   • `createComment(...)`  — публикация комментария (уровень доступа 3 —
 *     подтверждённый Community_Account), с валидацией тела и проверкой, что
 *     родительский комментарий принадлежит той же теме. Бампает
 *     `last_activity_at` темы (лента «оживает»).
 *
 * Публичными считаются только `visibility='public'` строки (как в Feed_Service).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (расширение форум-слоя).
 */

import {
  db,
  communityThreadsTable,
  communityCommentsTable,
  citiesTable,
  zhkTable,
  specialtiesTable,
  type CommunityComment,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";

const PUBLIC_VISIBILITY = "public";

/** Публичный DTO темы с родительским контекстом. */
export interface ThreadView {
  id: number;
  zone: string;
  scope: string;
  category: string | null;
  title: string;
  body: string;
  cityId: number | null;
  citySlug: string | null;
  cityName: string | null;
  zhkId: number | null;
  zhkSlug: string | null;
  zhkName: string | null;
  specialtyId: number | null;
  specialtySlug: string | null;
  specialtyName: string | null;
  createdAt: Date;
  lastActivityAt: Date;
}

/** Публичный DTO комментария (плоский; дерево строит клиент). */
export interface CommentView {
  id: number;
  parentCommentId: number | null;
  body: string;
  authorAccountId: number | null;
  isSeeded: boolean;
  createdAt: Date;
}

/** Максимальная длина тела комментария. */
export const COMMENT_BODY_MAX = 5000;

/**
 * Валидация тела комментария (чистая, без БД): непустая строка после trim и не
 * длиннее COMMENT_BODY_MAX. Экспортируется для юнит-тестов и роут-слоя.
 */
export function validateCommentBody(body: unknown): body is string {
  if (typeof body !== "string") return false;
  const trimmed = body.trim();
  return trimmed.length >= 1 && body.length <= COMMENT_BODY_MAX;
}

/** Резолвит публичную тему по id вместе с контекстом. `null`, если нет/скрыта. */
export async function getThreadById(id: number): Promise<ThreadView | null> {
  if (!Number.isInteger(id) || id <= 0) return null;

  const [row] = await db
    .select({
      id: communityThreadsTable.id,
      zone: communityThreadsTable.zone,
      scope: communityThreadsTable.scope,
      category: communityThreadsTable.category,
      title: communityThreadsTable.title,
      body: communityThreadsTable.body,
      visibility: communityThreadsTable.visibility,
      cityId: communityThreadsTable.cityId,
      citySlug: citiesTable.slug,
      cityName: citiesTable.name,
      zhkId: communityThreadsTable.zhkId,
      zhkSlug: zhkTable.slug,
      zhkName: zhkTable.name,
      specialtyId: communityThreadsTable.specialtyId,
      specialtySlug: specialtiesTable.slug,
      specialtyName: specialtiesTable.name,
      createdAt: communityThreadsTable.createdAt,
      lastActivityAt: communityThreadsTable.lastActivityAt,
    })
    .from(communityThreadsTable)
    .leftJoin(citiesTable, eq(communityThreadsTable.cityId, citiesTable.id))
    .leftJoin(zhkTable, eq(communityThreadsTable.zhkId, zhkTable.id))
    .leftJoin(specialtiesTable, eq(communityThreadsTable.specialtyId, specialtiesTable.id))
    .where(and(eq(communityThreadsTable.id, id), eq(communityThreadsTable.visibility, PUBLIC_VISIBILITY)))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    zone: row.zone,
    scope: row.scope,
    category: row.category,
    title: row.title,
    body: row.body,
    cityId: row.cityId,
    citySlug: row.citySlug ?? null,
    cityName: row.cityName ?? null,
    zhkId: row.zhkId,
    zhkSlug: row.zhkSlug ?? null,
    zhkName: row.zhkName ?? null,
    specialtyId: row.specialtyId,
    specialtySlug: row.specialtySlug ?? null,
    specialtyName: row.specialtyName ?? null,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
  };
}

/** Плоский список публичных комментариев темы, по возрастанию даты. */
export async function listComments(threadId: number): Promise<CommentView[]> {
  if (!Number.isInteger(threadId) || threadId <= 0) return [];
  const rows = await db
    .select()
    .from(communityCommentsTable)
    .where(
      and(
        eq(communityCommentsTable.threadId, threadId),
        eq(communityCommentsTable.visibility, PUBLIC_VISIBILITY),
      ),
    )
    .orderBy(asc(communityCommentsTable.createdAt), asc(communityCommentsTable.id));

  return rows.map((r) => ({
    id: r.id,
    parentCommentId: r.parentCommentId,
    body: r.body,
    authorAccountId: r.authorAccountId,
    isSeeded: r.isSeeded,
    createdAt: r.createdAt,
  }));
}

/** Вход для создания комментария (уровень доступа 3). */
export interface CreateCommentInput {
  threadId: number;
  parentCommentId?: number | null;
  authorAccountId: number;
  body: string;
}

/** Результат создания комментария. */
export type CreateCommentResult =
  | { status: "created"; comment: CommunityComment }
  | { status: "rejected"; reason: "invalid_body" | "thread_not_found" | "parent_mismatch" };

/**
 * Создать комментарий к теме (Requirement 3-подобный поток, уровень доступа 3):
 *   1. Валидация тела (1..5000 после trim). Провал → `invalid_body`.
 *   2. Тема должна существовать и быть публичной. Иначе → `thread_not_found`.
 *   3. Если указан родитель — он должен принадлежать той же теме. Иначе →
 *      `parent_mismatch`.
 *   4. Вставка + бамп `last_activity_at` темы.
 */
export async function createComment(input: CreateCommentInput): Promise<CreateCommentResult> {
  if (!validateCommentBody(input.body)) {
    return { status: "rejected", reason: "invalid_body" };
  }

  const [thread] = await db
    .select({ id: communityThreadsTable.id })
    .from(communityThreadsTable)
    .where(
      and(
        eq(communityThreadsTable.id, input.threadId),
        eq(communityThreadsTable.visibility, PUBLIC_VISIBILITY),
      ),
    )
    .limit(1);
  if (!thread) return { status: "rejected", reason: "thread_not_found" };

  let parentId: number | null = null;
  if (input.parentCommentId != null) {
    const [parent] = await db
      .select({ id: communityCommentsTable.id, threadId: communityCommentsTable.threadId })
      .from(communityCommentsTable)
      .where(eq(communityCommentsTable.id, input.parentCommentId))
      .limit(1);
    if (!parent || parent.threadId !== input.threadId) {
      return { status: "rejected", reason: "parent_mismatch" };
    }
    parentId = parent.id;
  }

  const [comment] = await db
    .insert(communityCommentsTable)
    .values({
      threadId: input.threadId,
      parentCommentId: parentId,
      authorAccountId: input.authorAccountId,
      body: input.body.trim(),
      visibility: PUBLIC_VISIBILITY,
    })
    .returning();

  // Бамп активности темы — City_Feed/PRO сортируются по last_activity_at.
  await db
    .update(communityThreadsTable)
    .set({ lastActivityAt: new Date() })
    .where(eq(communityThreadsTable.id, input.threadId));

  return { status: "created", comment: comment! };
}

export const CommentService = {
  getThreadById,
  listComments,
  createComment,
  validateCommentBody,
};
