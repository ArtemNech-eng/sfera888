/**
 * Real Price — backfill исторических смет в price_points (spec: .kiro/specs/real-price, 0.6).
 *
 * Тонкая CLI-обёртка над общей функцией runRealPriceBackfill (та же логика
 * использована admin-эндпойнтом POST /api/real-price/backfill). По умолчанию
 * DRY-RUN; с флагом --apply пишет и пересчитывает агрегаты.
 *
 * Запуск (где доступен DATABASE_URL):
 *   pnpm --filter @workspace/api-server run real-price:backfill          # dry-run
 *   pnpm --filter @workspace/api-server run real-price:backfill:apply    # запись
 */
import { runRealPriceBackfill } from "../lib/realPriceBackfill.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`[real-price-backfill] режим: ${APPLY ? "APPLY (запись)" : "DRY-RUN (только отчёт)"}`);
  const r = await runRealPriceBackfill({ apply: APPLY });
  console.log(`[real-price-backfill] завершённых заказов: ${r.completedOrders}, смет: ${r.receipts}`);
  console.log(`[real-price-backfill] позиций: ${r.lineItems}, сопоставлено: ${r.matched}, не сопоставлено: ${r.unmatched}`);
  console.log(`[real-price-backfill] ценовых точек построено: ${r.pointsBuilt}`);
  if (r.topUnmatched.length > 0) {
    console.log("[real-price-backfill] топ несопоставленных описаний (добавьте синонимы в work_types):");
    r.topUnmatched.forEach((u) => console.log(`    ${u.count}× ${u.description}`));
  }
  if (r.apply) {
    console.log(`[real-price-backfill] записано точек: ${r.pointsWritten}`);
    if (r.aggregates) {
      console.log(`[real-price-backfill] пересчёт агрегатов: points=${r.aggregates.points}, aggregates=${r.aggregates.aggregates}, indexable=${r.aggregates.indexable}`);
    }
  } else {
    console.log("[real-price-backfill] DRY-RUN — ничего не записано. Для записи: --apply");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[real-price-backfill] ОШИБКА:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
