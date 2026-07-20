/**
 * Real Price — backfill исторических смет в price_points (spec: .kiro/specs/real-price, задача 0.6).
 *
 * Читает ЗАВЕРШЁННЫЕ заказы и их сметы (receipts.line_items), сопоставляет
 * свободные описания позиций словарю work_types (matchWorkType/derivePricePoint)
 * и формирует нормализованные ценовые точки. По умолчанию — DRY-RUN (только
 * отчёт, без записи). С флагом --apply пишет price_points (идемпотентно по
 * receipt_id) и пересчитывает агрегаты.
 *
 * Запуск (там, где доступен DATABASE_URL):
 *   pnpm --filter @workspace/api-server run real-price:backfill          # dry-run
 *   pnpm --filter @workspace/api-server run real-price:backfill:apply    # запись
 */
import { db, ordersTable, receiptsTable, workTypesTable, pricePointsTable, type LineItem } from "@workspace/db";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { derivePricePoint, type WorkTypeLite } from "../lib/realPrice.js";
import { recomputePriceAggregates } from "../lib/priceAggregation.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`[real-price-backfill] режим: ${APPLY ? "APPLY (запись)" : "DRY-RUN (только отчёт)"}`);

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
  console.log(`[real-price-backfill] словарь: ${workTypes.length} видов работ`);

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
  console.log(`[real-price-backfill] завершённых заказов: ${orders.length}`);
  if (orders.length === 0) {
    console.log("[real-price-backfill] нет завершённых заказов — выходим");
    return;
  }

  const receipts = await db
    .select()
    .from(receiptsTable)
    .where(inArray(receiptsTable.orderId, orders.map((o) => o.id)));
  console.log(`[real-price-backfill] смет по этим заказам: ${receipts.length}`);

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
  let liTotal = 0;
  let liMatched = 0;
  const unmatched = new Map<string, number>();

  for (const r of receipts) {
    const order = ordersById.get(r.orderId);
    if (!order) continue;
    touchedReceiptIds.push(r.id);
    const lineItems = (r.lineItems ?? []) as LineItem[];
    for (const li of lineItems) {
      liTotal++;
      const dp = derivePricePoint(
        { description: li.description, unit: li.unit ?? null, quantity: li.quantity ?? null, price: Number(li.price) },
        workTypes,
      );
      if (!dp) {
        const key = (li.description ?? "").trim().slice(0, 60) || "(пусто)";
        unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
        continue;
      }
      liMatched++;
      points.push({
        orderId: r.orderId,
        receiptId: r.id,
        masterId: r.masterId ?? null,
        workTypeId: dp.workTypeId,
        unit: dp.unit,
        quantity: dp.quantity != null ? String(dp.quantity) : null,
        unitPrice: String(dp.unitPrice),
        total: dp.total != null ? String(dp.total) : null,
        city: (order.city ?? r.city ?? null),
        district: (order.district ?? r.district ?? null),
        zhk: (r as { zhk?: string | null }).zhk ?? null,
        source: (r as { source?: string | null }).source ?? "platform",
        closedAt: order.completedAt ?? order.createdAt ?? null,
      });
    }
  }

  console.log("");
  console.log(`[real-price-backfill] позиций всего: ${liTotal}, сопоставлено: ${liMatched}, не сопоставлено: ${liTotal - liMatched}`);
  console.log(`[real-price-backfill] будет создано ценовых точек: ${points.length}`);
  if (unmatched.size > 0) {
    console.log("[real-price-backfill] топ несопоставленных описаний (добавьте синонимы в work_types):");
    [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([d, n]) => console.log(`    ${n}× ${d}`));
  }

  if (!APPLY) {
    console.log("\n[real-price-backfill] DRY-RUN — ничего не записано. Для записи: --apply");
    return;
  }

  await db.transaction(async (tx) => {
    if (touchedReceiptIds.length > 0) {
      await tx.delete(pricePointsTable).where(inArray(pricePointsTable.receiptId, touchedReceiptIds));
    }
    if (points.length > 0) {
      await tx.insert(pricePointsTable).values(points);
    }
  });
  console.log(`[real-price-backfill] записано ценовых точек: ${points.length}`);

  const summary = await recomputePriceAggregates();
  console.log(`[real-price-backfill] пересчёт агрегатов: points=${summary.points}, aggregates=${summary.aggregates}, indexable=${summary.indexable}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[real-price-backfill] ОШИБКА:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
