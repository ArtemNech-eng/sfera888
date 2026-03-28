import { db, mastersTable, ordersTable, voronkaColumnsTable } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

const ACTIVE_STATUSES = ["master_assigned", "in_progress", "cancellation_requested"] as const;

/**
 * Recalculate and update a master's voronka column based on their active order count.
 * - Has active orders → "На объекте"
 * - No active orders  → "Свободен"
 */
export async function recalcMasterColumn(masterId: number): Promise<void> {
  const master = await db.select({ id: mastersTable.id, voronkaColumnId: mastersTable.voronkaColumnId })
    .from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!master[0]) return;

  const activeOrders = await db.select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      inArray(ordersTable.status, ACTIVE_STATUSES as any),
      isNull(ordersTable.deletedAt),
    ));

  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);

  let targetCol;
  if (activeOrders.length > 0) {
    targetCol = cols.find(c => c.name === "На объекте")
      ?? cols.find(c => !c.receivesOrders && c.name !== "Отстраненные");
  } else {
    targetCol = cols.find(c => c.name === "Свободен")
      ?? cols.find(c => c.receivesOrders);
  }

  if (targetCol && targetCol.id !== master[0].voronkaColumnId) {
    await db.update(mastersTable)
      .set({ voronkaColumnId: targetCol.id })
      .where(eq(mastersTable.id, masterId));
  }
}
