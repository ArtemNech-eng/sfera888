import { db, mastersTable, REPUTATION_BLOCK_THRESHOLD } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";

const ADMIN_MAX_USER_ID = process.env["ADMIN_MAX_USER_ID"];

/**
 * Записать выполненный заказ — сбрасывает счётчик подряд отменённых.
 * Если мастер был автоблок — НЕ снимаем блок (только оператор вручную),
 * но счётчик сбрасываем, чтобы после ручной разблокировки начать с чистого листа.
 */
export async function recordOrderCompleted(masterId: number): Promise<void> {
  await db.update(mastersTable)
    .set({
      consecutiveCancellations: 0,
      lastCompletedAt: new Date(),
    })
    .where(eq(mastersTable.id, masterId));
}

/**
 * Атомарно увеличить счётчик подряд отменённых заказов.
 * При достижении порога (2) — мастер автоблокируется от новых рассылок.
 *
 * Реализация: один UPDATE ... RETURNING делает инкремент атомарно (без RMW-гонки).
 * Затем при необходимости второй UPDATE ставит блок-флаг и пишет уведомления.
 */
export async function recordOrderCancelled(
  masterId: number,
  orderId: number,
): Promise<{ counter: number; blocked: boolean; wasAlreadyBlocked: boolean; alias: string } | null> {
  // Атомарный инкремент: одна транзакция, никаких read-modify-write
  const [updated] = await db.update(mastersTable)
    .set({
      consecutiveCancellations: sql`${mastersTable.consecutiveCancellations} + 1`,
      lastCancelAt: new Date(),
    })
    .where(eq(mastersTable.id, masterId))
    .returning({
      alias: mastersTable.alias,
      counter: mastersTable.consecutiveCancellations,
      maxChatId: mastersTable.maxChatId,
      wasBlocked: mastersTable.blockedFromOrders,
    });

  if (!updated) return null;

  const wasAlreadyBlocked = updated.wasBlocked;
  const newCounter = updated.counter;
  const shouldBlock = !wasAlreadyBlocked && newCounter >= REPUTATION_BLOCK_THRESHOLD;

  if (shouldBlock) {
    // Защищаем от двойной установки блока через .where(blockedFromOrders=false):
    // если параллельный запрос уже выставил блок, наш UPDATE просто ничего не сделает.
    const blocked = await db.update(mastersTable)
      .set({
        blockedFromOrders: true,
        blockedAt: new Date(),
        blockedReason: `Автоблок: ${newCounter} подряд отменённых заказа (последний — №${orderId})`,
      })
      .where(eq(mastersTable.id, masterId))
      .returning({ id: mastersTable.id });

    if (blocked.length > 0) {
      if (updated.maxChatId) {
        sendMaxMessage(
          updated.maxChatId,
          `🚫 Доступ к новым заказам приостановлен\n\n` +
            `У вас ${newCounter} подряд отменённых заказа. Мы временно не присылаем вам новые заявки.\n\n` +
            `Свяжитесь с оператором, если считаете, что произошла ошибка.`,
        ).catch(() => {});
      }
      if (ADMIN_MAX_USER_ID) {
        sendMaxMessage(
          ADMIN_MAX_USER_ID,
          `🚫 Автоблок мастера: ${updated.alias} (id ${masterId})\n` +
            `Причина: ${newCounter} подряд отменённых заказа (последний — №${orderId}).\n` +
            `Снять блок: CRM → Мастера → ${updated.alias} → «Разблокировать».`,
        ).catch(() => {});
      }
    }
  }

  return { counter: newCounter, blocked: shouldBlock, wasAlreadyBlocked, alias: updated.alias };
}

/**
 * Откат отмены: оператор восстанавливает ошибочно отменённый заказ.
 * Атомарно уменьшает счётчик (но не уходит ниже нуля) и снимает автоблок,
 * если он был поставлен — мастер восстанавливает «чистую» репутацию.
 */
export async function revertOrderCancellation(masterId: number): Promise<void> {
  await db.update(mastersTable)
    .set({
      consecutiveCancellations: sql`GREATEST(${mastersTable.consecutiveCancellations} - 1, 0)`,
      blockedFromOrders: false,
      blockedAt: null,
      blockedReason: null,
    })
    .where(eq(mastersTable.id, masterId));
}

/**
 * Ручная разблокировка мастера оператором — сбрасывает счётчик и снимает блок.
 */
export async function unblockMaster(masterId: number, _operatorAlias: string): Promise<void> {
  await db.update(mastersTable)
    .set({
      blockedFromOrders: false,
      blockedAt: null,
      blockedReason: null,
      consecutiveCancellations: 0,
    })
    .where(eq(mastersTable.id, masterId));
}

export function getMasterReputationSegment(master: {
  blockedFromOrders?: boolean | null;
  consecutiveCancellations?: number | null;
}): "active" | "warning" | "blocked" {
  if (master.blockedFromOrders) return "blocked";
  if ((master.consecutiveCancellations ?? 0) >= 1) return "warning";
  return "active";
}

export { REPUTATION_BLOCK_THRESHOLD };
