import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPriceIndex, type IndexInputPoint } from "../src/lib/priceIndex.js";

const NOW = new Date("2026-03-20T00:00:00Z");

test("buildPriceIndex: пустой вход → пустой результат", () => {
  const r = buildPriceIndex([], NOW);
  assert.equal(r.baseMonth, null);
  assert.equal(r.months.length, 0);
  assert.equal(r.totalDeals, 0);
});

test("buildPriceIndex: база = 100, рост цены отражается в уровне", () => {
  // wt=1: янв медиана 1000, фев 1100 (+10%). Один вид работ → индекс = его изменение.
  const points: IndexInputPoint[] = [
    { workTypeId: 1, unitPrice: 1000, closedAt: "2026-01-10" },
    { workTypeId: 1, unitPrice: 1000, closedAt: "2026-01-20" },
    { workTypeId: 1, unitPrice: 1100, closedAt: "2026-02-15" },
  ];
  const r = buildPriceIndex(points, NOW);
  assert.equal(r.baseMonth, "2026-01");
  const jan = r.months.find((m) => m.month === "2026-01")!;
  const feb = r.months.find((m) => m.month === "2026-02")!;
  assert.equal(jan.level, 100);
  assert.equal(feb.level, 110);
  assert.equal(feb.momPct, 10);
  assert.equal(jan.n, 2);
});

test("buildPriceIndex: геометрическое среднее по корзине (два вида работ)", () => {
  // wt1: 100→120 (×1.2), wt2: 200→180 (×0.9). geomean(1.2,0.9)=~1.03923 → 103.9
  const points: IndexInputPoint[] = [
    { workTypeId: 1, unitPrice: 100, closedAt: "2026-01-05" },
    { workTypeId: 2, unitPrice: 200, closedAt: "2026-01-06" },
    { workTypeId: 1, unitPrice: 120, closedAt: "2026-02-05" },
    { workTypeId: 2, unitPrice: 180, closedAt: "2026-02-06" },
  ];
  const r = buildPriceIndex(points, NOW);
  const feb = r.months.find((m) => m.month === "2026-02")!;
  assert.equal(feb.basket, 2);
  assert.equal(feb.level, 103.9);
});

test("buildPriceIndex: месяц без пересечения с базой → level null, но n виден", () => {
  const points: IndexInputPoint[] = [
    { workTypeId: 1, unitPrice: 100, closedAt: "2026-01-05" },
    { workTypeId: 2, unitPrice: 500, closedAt: "2026-02-05" }, // другой вид работ
  ];
  const r = buildPriceIndex(points, NOW);
  const feb = r.months.find((m) => m.month === "2026-02")!;
  assert.equal(feb.level, null);
  assert.equal(feb.n, 1);
  assert.equal(feb.basket, 0);
});

test("buildPriceIndex: пропущенные точки (без даты/цены) игнорируются", () => {
  const points: IndexInputPoint[] = [
    { workTypeId: 1, unitPrice: 100, closedAt: "2026-01-05" },
    { workTypeId: 1, unitPrice: 0, closedAt: "2026-01-06" }, // цена 0
    { workTypeId: 1, unitPrice: 100, closedAt: null }, // нет даты
  ];
  const r = buildPriceIndex(points, NOW);
  assert.equal(r.totalDeals, 1);
});

test("buildPriceIndex: квартальные срезы + qoq", () => {
  // Q1: янв 100, фев 110 → уровень квартала ~105. Q2: апр 120 → +14.3% qoq.
  const points: IndexInputPoint[] = [
    { workTypeId: 1, unitPrice: 1000, closedAt: "2026-01-10" },
    { workTypeId: 1, unitPrice: 1100, closedAt: "2026-02-10" },
    { workTypeId: 1, unitPrice: 1200, closedAt: "2026-04-10" },
  ];
  const r = buildPriceIndex(points, new Date("2026-04-20T00:00:00Z"));
  const q1 = r.quarters.find((q) => q.quarter === "2026-Q1")!;
  const q2 = r.quarters.find((q) => q.quarter === "2026-Q2")!;
  assert.equal(q1.level, 105); // (100+110)/2
  assert.equal(q2.level, 120);
  assert.equal(q2.qoqPct, 14.3); // (120-105)/105
});
