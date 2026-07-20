import { db, pricePointsTable, priceAggregatesTable } from "@workspace/db";
import { robustStats, meetsPriceThreshold, type AggregateKind } from "./realPrice.js";

/**
 * Real Price — пересчёт агрегатов цен (spec: `.kiro/specs/real-price`, Фаза 1).
 *
 * Читает `price_points`, группирует по (вид работ × город) и (вид работ × ЖК),
 * считает медиану + P25/P75 (`robustStats`, отсечение выбросов) + помесячный ряд,
 * ставит `is_indexable` по порогу и перезаписывает витрину `price_aggregates`.
 *
 * Объём данных мал (сотни точек), поэтому группировка — в JS: одна реализация
 * статистики (та же, что в юнит-тестах), без дублирования в SQL.
 */

export interface PointForAgg {
  workTypeId: number;
  unit: string | null;
  unitPrice: number;
  city: string | null;
  zhk: string | null;
  closedAt: Date | string | null;
}

export interface AggregateRow {
  keyType: AggregateKind;
  workTypeId: number;
  city: string;
  district: string; // ЖК/район для work_zhk; '' для work_city
  unit: string | null;
  p25: number;
  p50: number;
  p75: number;
  n: number;
  series12m: Array<{ month: string; p50: number; n: number }>;
  isIndexable: boolean;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Последние 12 месяцев (включая текущий) как ключи YYYY-MM, старые → новые. */
function last12Months(now: Date): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

function median(values: number[]): number {
  const s = robustStats(values);
  return s ? s.p50 : 0;
}

function mostCommonUnit(points: PointForAgg[]): string | null {
  const counts = new Map<string, number>();
  for (const p of points) {
    if (p.unit) counts.set(p.unit, (counts.get(p.unit) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [u, n] of counts) if (n > bestN) { bestN = n; best = u; }
  return best;
}

function buildSeries(points: PointForAgg[], now: Date): Array<{ month: string; p50: number; n: number }> {
  const byMonth = new Map<string, number[]>();
  for (const p of points) {
    if (!p.closedAt) continue;
    const d = p.closedAt instanceof Date ? p.closedAt : new Date(p.closedAt);
    if (Number.isNaN(d.getTime())) continue;
    const k = monthKey(d);
    (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(p.unitPrice);
  }
  return last12Months(now).map((m) => {
    const vals = byMonth.get(m) ?? [];
    return { month: m, p50: vals.length ? median(vals) : 0, n: vals.length };
  });
}

/**
 * Чистая функция: из массива ценовых точек строит строки витрины агрегатов.
 * Детерминирована (для теста передаётся `now`). Группы без валидной статистики
 * пропускаются.
 */
export function buildAggregatesFromPoints(points: PointForAgg[], now: Date = new Date()): AggregateRow[] {
  const cityGroups = new Map<string, PointForAgg[]>();
  const zhkGroups = new Map<string, PointForAgg[]>();

  for (const p of points) {
    const city = (p.city ?? "").trim();
    if (!city) continue;
    const ck = `${p.workTypeId}|${city}`;
    (cityGroups.get(ck) ?? cityGroups.set(ck, []).get(ck)!).push(p);
    const zhk = (p.zhk ?? "").trim();
    if (zhk) {
      const zk = `${p.workTypeId}|${city}|${zhk}`;
      (zhkGroups.get(zk) ?? zhkGroups.set(zk, []).get(zk)!).push(p);
    }
  }

  const rows: AggregateRow[] = [];

  const emit = (keyType: AggregateKind, workTypeId: number, city: string, district: string, group: PointForAgg[]) => {
    const stats = robustStats(group.map((g) => g.unitPrice));
    if (!stats) return;
    rows.push({
      keyType,
      workTypeId,
      city,
      district,
      unit: mostCommonUnit(group),
      p25: stats.p25,
      p50: stats.p50,
      p75: stats.p75,
      n: stats.n,
      series12m: buildSeries(group, now),
      isIndexable: meetsPriceThreshold(keyType, stats.n),
    });
  };

  for (const [key, group] of cityGroups) {
    const [wt, city] = key.split("|");
    emit("work_city", Number(wt), city!, "", group);
  }
  for (const [key, group] of zhkGroups) {
    const [wt, city, zhk] = key.split("|");
    emit("work_zhk", Number(wt), city!, zhk!, group);
  }

  return rows;
}

/**
 * Полный пересчёт витрины `price_aggregates` из `price_points`. Читает точки,
 * строит агрегаты и атомарно перезаписывает витрину. Возвращает сводку.
 */
export async function recomputePriceAggregates(): Promise<{ points: number; aggregates: number; indexable: number }> {
  const points = await db
    .select({
      workTypeId: pricePointsTable.workTypeId,
      unit: pricePointsTable.unit,
      unitPrice: pricePointsTable.unitPrice,
      city: pricePointsTable.city,
      zhk: pricePointsTable.zhk,
      closedAt: pricePointsTable.closedAt,
    })
    .from(pricePointsTable);

  const rows = buildAggregatesFromPoints(
    points.map((p) => ({
      workTypeId: p.workTypeId,
      unit: p.unit,
      unitPrice: Number(p.unitPrice),
      city: p.city,
      zhk: p.zhk,
      closedAt: p.closedAt,
    })),
  );

  await db.transaction(async (tx) => {
    await tx.delete(priceAggregatesTable);
    if (rows.length > 0) {
      await tx.insert(priceAggregatesTable).values(
        rows.map((r) => ({
          keyType: r.keyType,
          workTypeId: r.workTypeId,
          city: r.city,
          district: r.district,
          unit: r.unit,
          p25: String(r.p25),
          p50: String(r.p50),
          p75: String(r.p75),
          n: r.n,
          series12m: r.series12m,
          isIndexable: r.isIndexable,
        })),
      );
    }
  });

  return {
    points: points.length,
    aggregates: rows.length,
    indexable: rows.filter((r) => r.isIndexable).length,
  };
}
