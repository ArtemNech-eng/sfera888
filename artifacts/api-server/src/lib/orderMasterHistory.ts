/**
 * Records order-master relationship history.
 * Called whenever a master is assigned, completed, cancelled, or returned to pool.
 */
import { db, orderMasterHistoryTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type HistoryStatus = "completed" | "cancelled" | "returned_to_pool";

/**
 * Record that a master was removed from an order (completed / cancelled / returned to pool).
 * Reads current order data to snapshot serviceType, city, orderAmount.
 */
export async function recordOrderMasterHistory(
  masterId: number,
  orderId: number,
  status: HistoryStatus,
  cancelReason?: string,
) {
  try {
    // Snapshot current order data
    const [order] = await db.select({
      assignedAt: ordersTable.assignedAt,
      orderAmount: ordersTable.orderAmount,
      serviceType: ordersTable.serviceType,
      city: ordersTable.city,
    }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

    await db.insert(orderMasterHistoryTable).values({
      orderId,
      masterId,
      status,
      assignedAt: order?.assignedAt ?? null,
      removedAt: new Date(),
      cancelReason: cancelReason ?? null,
      orderAmount: order?.orderAmount ?? null,
      serviceType: order?.serviceType ?? null,
      city: order?.city ?? null,
    });
  } catch (e: any) {
    console.error("[orderMasterHistory] failed to record:", e);
  }
}
