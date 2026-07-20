import { db, ordersTable, receiptsTable, workTypesTable, pricePointsTable, mastersTable, type LineItem } from "@workspace/db";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { derivePricePoint, type WorkTypeLite } from "./realPrice.js";
import { recomputePriceAggregates } from "./priceAggregation.js";

/**
 * Real Price — backfill исторических смет в price_points (spec: .kiro/specs/real-price, 0.6).
 *
 * Общая логика для CLI-скрипта и admin-endpoint. Читает ЗАВЕРШЁННЫЕ заказы и их
 * сметы, сопоставляет позиции словарю (matchWorkType/derivePricePoint) и строит
 * нормализованные ценовые точки. dry-run (apply=false) — только отчёт; apply=true
 * — идемпотентная запись (по receipt_id) + пересчёт агрегатов.
 */

export interface BackfillReport {
  apply: boolean;
  completedOrders: number;
  receipts: number;
  lineItems: number;
  matched: number;
  unmatched: number;
  topUnmatched: Array<{ description: string; count: number }>;
  pointsBuilt: number;
  pointsWritten?: number;
  aggregates?: { points: number; aggregates: number; indexable: number };
}

export async function runRealPriceBackfill(opts: { apply: boolean }): Promise<BackfillReport> {
  const apply = opts.apply;

  const workTypes: WorkTypeLite[] = (
    await db
      .select({
        id: workTypesTable.id,
        slug: workTypesTable.slug,
        name: workTypesTable.name,
        category: workTypesTable.category,
        defaultUnit: workTypesTable.defaultUnit,
        synonyms: workTypesTable.synonyms,
      })
      .from(workTypesTable)
      .where(eq(workTypesTable.isActive, true))
  ).map((w) => ({ ...w, synonyms: w.synonyms ?? [] }));

  const orders = await db
    .select({
      id: ordersTable.id,
      city: ordersTable.city,
      district: ordersTable.district,
      completedAt: ordersTable.completedAt,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), isNull(ordersTable.deletedAt)));
  const ordersById = new Map(orders.map((o) => [o.id, o]));

  // Валидные мастера — чтобы «осиротевший» master_id (мастер удалён) не ронял
  // вставку по FK price_points_master_id_fkey. Отсутствующий → master_id = NULL.
  const validMasterIds = new Set((await db.select({ id: mastersTable.id }).from(mastersTable)).map((m) => m.id));

  if (orders.length === 0) {
    return { apply, completedOrders: 0, receipts: 0, lineItems: 0, matched: 0, unmatched: 0, topUnmatched: [], pointsBuilt: 0 };
  }

  const receipts = await db
    .select()
    .from(receiptsTable)
    .where(inArray(receiptsTable.orderId, orders.map((o) => o.id)));

  interface NewPoint {
    orderId: number;
    receiptId: number;
    masterId: number | null;
    workTypeId: number;
    unit: string | null;
    quantity: string | null;
    unitPrice: string;
    total: string | null;
    city: string | null;
    district: string | null;
    zhk: string | null;
    source: string;
    closedAt: Date | null;
  }

  const points: NewPoint[] = [];
  const touchedReceiptIds: number[] = [];
  let lineItems = 0;
  let matched = 0;
  const unmatched = new Map<string, number>();

  for (const r of receipts) {
    const order = ordersById.get(r.orderId);
    if (!order) continue;
    touchedReceiptIds.push(r.id);
    const items = (r.lineItems ?? []) as LineItem[];
    for (const li of items) {
      lineItems++;
      const dp = derivePricePoint(
        { description: li.description, unit: li.unit ?? null, quantity: li.quantity ?? null, price: Number(li.price) },
        workTypes,
      );
      if (!dp) {
        const key = (li.description ?? "").trim().slice(0, 60) || "(пусто)";
        unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
        continue;
      }
      matched++;
      points.push({
        orderId: r.orderId,
        receiptId: r.id,
        masterId: r.masterId != null && validMasterIds.has(r.masterId) ? r.masterId : null,
        workTypeId: dp.workTypeId,
        unit: dp.unit,
        quantity: dp.quantity != null ? String(dp.quantity) : null,
        unitPrice: String(dp.unitPrice),
        total: dp.total != null ? String(dp.total) : null,
        city: order.city ?? r.city ?? null,
        district: order.district ?? r.district ?? null,
        zhk: (r as { zhk?: string | null }).zhk ?? null,
        source: (r as { source?: string | null }).source ?? "platform",
        closedAt: order.completedAt ?? order.createdAt ?? null,
      });
    }
  }

  const topUnmatched = [...unmatched.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([description, count]) => ({ description, count }));

  const report: BackfillReport = {
    apply,
    completedOrders: orders.length,
    receipts: receipts.length,
    lineItems,
    matched,
    unmatched: lineItems - matched,
    topUnmatched,
    pointsBuilt: points.length,
  };

  if (!apply) return report;

  try {
    await db.transaction(async (tx) => {
      if (touchedReceiptIds.length > 0) {
        await tx.delete(pricePointsTable).where(inArray(pricePointsTable.receiptId, touchedReceiptIds));
      }
      if (points.length > 0) {
        await tx.insert(pricePointsTable).values(points);
      }
    });
    report.pointsWritten = points.length;
  } catch (e) {
    throw new Error(`запись price_points: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    report.aggregates = await recomputePriceAggregates();
  } catch (e) {
    throw new Error(`пересчёт агрегатов: ${e instanceof Error ? e.message : String(e)}`);
  }

  return report;
}
