import { db, transactionsTable, mastersTable } from "@workspace/db";
import { eq, and, lte, ne } from "drizzle-orm";

export interface EligibilityResult {
  canAccept: boolean;
  reason: string | null;
  limit: number;
}

/**
 * Marks pending transactions older than `daysThreshold` days as overdue.
 * Only marks transactions with real commission > 0 (ignores placeholders).
 * Returns the number of transactions marked overdue.
 */
export async function checkOverdueTransactions(daysThreshold = 2): Promise<number> {
  const cutoff = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

  const pending = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.paymentStatus, "pending"), lte(transactionsTable.createdAt, cutoff)));

  const toMark = pending.filter((t) => Number(t.commission) > 0);
  if (toMark.length === 0) return 0;

  for (const t of toMark) {
    await db
      .update(transactionsTable)
      .set({ paymentStatus: "overdue" })
      .where(eq(transactionsTable.id, t.id));
  }

  console.log(`[overdue] Marked ${toMark.length} transaction(s) as overdue`);
  return toMark.length;
}

/**
 * Returns a Set of master IDs who have at least one overdue transaction.
 * Efficient: one DB query to load all overdue transactions.
 */
export async function getOverdueMasterIds(): Promise<Set<number>> {
  const overdue = await db
    .select({ masterId: transactionsTable.masterId })
    .from(transactionsTable)
    .where(eq(transactionsTable.paymentStatus, "overdue"));
  return new Set(overdue.map((r) => r.masterId));
}

/**
 * Determines if a master is eligible to take a new order.
 *
 * Rules:
 *  - BLOCK if master has any overdue transactions
 *  - BLOCK if master is still in test period (isTestMaster) AND has unpaid commission debt > 0
 *  - ALLOW within limit: test masters → 1, regular → 2
 */
export function getMasterEligibility(
  master: {
    id: number;
    isTestMaster: boolean;
    debt: string | number;
  },
  currentActiveCount: number,
  overdueMasterIds: Set<number>,
): EligibilityResult {
  const debt = Number(master.debt);
  const isOverdue = overdueMasterIds.has(master.id);

  if (isOverdue) {
    return {
      canAccept: false,
      reason: `Просроченная задолженность по комиссии (${debt.toLocaleString("ru")} ₽). Необходимо погасить долг для получения заказов.`,
      limit: 0,
    };
  }

  if (master.isTestMaster && debt > 0) {
    return {
      canAccept: false,
      reason: `Тестовый период: имеется неоплаченная комиссия (${debt.toLocaleString("ru")} ₽). Оплатите комиссию за первый заказ, чтобы продолжить работу.`,
      limit: 1,
    };
  }

  const limit = master.isTestMaster ? 1 : 2;

  if (currentActiveCount >= limit) {
    return {
      canAccept: false,
      reason: master.isTestMaster
        ? `Тестовый период: максимум 1 активный заказ одновременно.`
        : `Достигнут лимит активных заказов (${limit}).`,
      limit,
    };
  }

  return { canAccept: true, reason: null, limit };
}
