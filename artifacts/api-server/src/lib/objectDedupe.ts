/**
 * Real Price 0.4 — pure "1 заказ = 1 Объект" dedupe (spec: `.kiro/specs/real-price`).
 *
 * Dependency-free (no DB) so it can be unit-tested under `node:test`. The editor
 * (`getObjectForOrder`) already treats the latest receipt (max id) of an order
 * as THE Object; this module applies the same canonical rule to the objects
 * hub (`listObjectsForMaster`) so multiple receipts of one order never surface
 * as multiple Objects — enforcing the invariant at the read layer WITHOUT a
 * destructive migration on the fragile `receipts` table (25+ dependents).
 *
 * It also exposes a report helper for an admin dry-run (which orders still have
 * multiple object-bearing receipts, i.e. candidates for a future physical
 * merge, to be run manually on staging).
 */

/** Canonical = latest receipt (max id) per order; matches `getObjectForOrder`. */
export function canonicalReceiptIdsByOrder(
  rows: ReadonlyArray<{ id: number; orderId: number | null }>,
): Set<number> {
  const bestByOrder = new Map<number, number>();
  const keep = new Set<number>();
  for (const r of rows) {
    if (r.orderId == null) {
      // No order association → cannot dedupe; keep as its own object.
      keep.add(r.id);
      continue;
    }
    const cur = bestByOrder.get(r.orderId);
    if (cur == null || r.id > cur) bestByOrder.set(r.orderId, r.id);
  }
  for (const id of bestByOrder.values()) keep.add(id);
  return keep;
}

export interface DuplicateOrderObjects {
  orderId: number;
  receiptIds: number[]; // all object-bearing receipts of this order, ascending
  canonicalId: number; // the one kept as THE Object (max id)
}

/** Orders that still have more than one object-bearing receipt (dry-run report). */
export function findDuplicateObjectOrders(
  rows: ReadonlyArray<{ id: number; orderId: number | null }>,
): DuplicateOrderObjects[] {
  const byOrder = new Map<number, number[]>();
  for (const r of rows) {
    if (r.orderId == null) continue;
    const list = byOrder.get(r.orderId);
    if (list) list.push(r.id);
    else byOrder.set(r.orderId, [r.id]);
  }
  const out: DuplicateOrderObjects[] = [];
  for (const [orderId, ids] of byOrder) {
    if (ids.length > 1) {
      const sorted = ids.slice().sort((a, b) => a - b);
      out.push({ orderId, receiptIds: sorted, canonicalId: sorted[sorted.length - 1]! });
    }
  }
  return out.sort((a, b) => a.orderId - b.orderId);
}
