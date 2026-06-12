/**
 * Order amount audit helpers.
 *
 * Все изменения денежных полей заказа (orderAmount, commission, commissionPaid)
 * пишутся в `order_amount_audit` через эти функции. Используется в:
 *   - POST /api/orders/:id/agreement (Phase 2, T13)
 *   - PATCH /api/orders/:id (Phase 2, T14 — обёртка над существующими updates)
 *   - GET /api/orders/:id/audit (Phase 3, T31 — read-only лента истории)
 *
 * Семантика и список allowed `source` значений описаны в
 * .kiro/specs/estimate-optional-flow/design.md § Audit Trail.
 *
 * Принципы:
 *   - Запись audit и изменение поля идут в одной транзакции (`db.transaction`).
 *     Caller передаёт активную `tx` (DrizzlePgTransaction) в `recordAmountAudit`.
 *   - actorAlias — denormalized snapshot имени, выживает удаление user.
 *   - reason обязателен для source ∈ {manager_correction, manager_force_paid,
 *     reconcile_keep_agreement} — caller отвечает за валидацию (мы только
 *     пишем то что прислали).
 */

import { db, orderAmountAuditTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

/** Допустимые значения поля `source` в audit-журнале. */
export type AuditSource =
  | "agreement"                  // Operator зафиксировал Agreement_Amount через POST /agreement
  | "master_proposal"            // Operator принял proposedAmount мастера одним кликом
  | "receipt"                    // Сумма пришла из созданной мастером Receipt
  | "manager_correction"         // Manager изменил сумму после Payment_State = paid
  | "manager_force_paid"         // Manager принудительно поставил commissionPaid=true без транзакции
  | "reconcile_use_receipt"      // Operator выбрал "использовать сумму из сметы" (Phase 3)
  | "reconcile_keep_agreement"   // Operator выбрал "оставить согласованную сумму" (Phase 3)
  | "system_recalc"              // Авто-пересчёт commission после изменения orderAmount
  | "operator_edit"              // Прочее ручное редактирование оператором
  | "unknown";                   // Импортировано без явного source

/** Какое поле меняется. Поддерживаемые сейчас. */
export type AuditField = "orderAmount" | "commission" | "commissionPaid";

export interface RecordAuditParams {
  orderId: number;
  actorUserId: number | null;
  actorRole: string | null;        // "admin" | "lead_operator" | "master_operator" | "system"
  actorAlias: string | null;
  field: AuditField;
  previousValue: string | null | undefined;  // raw value snapshot (string for text/numeric/boolean)
  newValue: string | null | undefined;
  source: AuditSource;
  reason?: string | null;
}

/**
 * Записать audit-event в активной транзакции. Caller передаёт `tx`.
 *
 * Если previousValue === newValue (нет реального изменения) — функция
 * не пишет запись, чтобы не засорять журнал. Caller может полагаться
 * на этот сhort-circuit и не делать диффинг сам.
 */
export async function recordAmountAudit(
  tx: typeof db,
  params: RecordAuditParams,
): Promise<void> {
  // Skip no-op writes (same value before and after).
  const prev = params.previousValue ?? "";
  const next = params.newValue ?? "";
  if (String(prev) === String(next)) return;

  await tx.insert(orderAmountAuditTable).values({
    orderId: params.orderId,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    actorAlias: params.actorAlias,
    field: params.field,
    previousValue: params.previousValue == null ? null : String(params.previousValue),
    newValue: String(params.newValue ?? ""),
    source: params.source,
    reason: params.reason ?? null,
  });
}

/**
 * Получить ленту audit-событий по заказу (DESC по createdAt).
 * Используется в GET /api/orders/:id/audit (Phase 3, для Manager UI).
 */
export async function getAmountAudit(
  orderId: number,
  limit = 100,
): Promise<typeof orderAmountAuditTable.$inferSelect[]> {
  return db
    .select()
    .from(orderAmountAuditTable)
    .where(eq(orderAmountAuditTable.orderId, orderId))
    .orderBy(desc(orderAmountAuditTable.createdAt))
    .limit(limit);
}

/**
 * Достать актора (id/role/alias) для audit-записи из express-сессии.
 *
 * Если в сессии нет userId (например, system-инициированное изменение через
 * cron или backfill) — возвращает плейсхолдер actor с role="system".
 *
 * Если userId есть, но user не найден — возвращает actor с alias из id.
 */
export async function resolveAuditActor(
  sessionUserId: number | null | undefined,
  fallbackRole: string = "system",
): Promise<{ id: number | null; role: string | null; alias: string | null }> {
  if (!sessionUserId) {
    return { id: null, role: fallbackRole, alias: fallbackRole };
  }
  try {
    const [user] = await db
      .select({ id: usersTable.id, name: usersTable.name, login: usersTable.login, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId))
      .limit(1);
    if (!user) {
      return { id: sessionUserId, role: fallbackRole, alias: `user#${sessionUserId}` };
    }
    return {
      id: user.id,
      role: user.role,
      alias: user.name || user.login || `user#${user.id}`,
    };
  } catch {
    return { id: sessionUserId, role: fallbackRole, alias: `user#${sessionUserId}` };
  }
}

/**
 * Инвалидация cache в dashboard-action-items после изменения суммы.
 * Когда заказ переходит из `no_amount` → `agreed`/`paid`, существующая
 * задача `no_estimate` для оператора должна "закрыться" автоматически
 * на следующем cycle. Прямой кэш — TTL 30с в `routes/dashboard-action-items.ts`,
 * мы его сбрасываем чтобы оператор увидел изменение мгновенно.
 *
 * Реализация: кеш сбрасывается в `routes/dashboard-action-items.ts` через
 * экспорт `invalidateBuildItemsCache()`. Здесь делаем тонкую обёртку,
 * чтобы не плодить cross-imports из core-логики в routes.
 *
 * При сбое (модуль не загружен, кеш повреждён и т.д.) — fail-silent.
 * TTL 30с в любом случае спасёт через минуту.
 */
export async function closeOpenEstimateTasksForOrder(
  orderId: number,
  reason: string,
): Promise<void> {
  try {
    const mod = await import("../routes/dashboard-action-items.js");
    if (typeof mod.invalidateBuildItemsCache === "function") {
      mod.invalidateBuildItemsCache();
    }
  } catch (err) {
    // Best-effort. TTL 30s in dashboard-action-items will eventually flush.
    console.error("[orderAudit] closeOpenEstimateTasksForOrder cache invalidate failed:", err);
  }
  // Тут также можно было бы маркировать конкретные task-IDs в БД, но текущий
  // дизайн вычисляет tasks on-the-fly из orders/leads/receipts (см. operatorTasks.ts).
  // То есть достаточно дождаться следующего вызова getOperatorTasks() — он сам не
  // вернёт `no_estimate` для заказов с paymentState != no_amount (Phase 2 T16).
  void orderId; void reason; // params kept for future extensibility (audit log of closures)
}
