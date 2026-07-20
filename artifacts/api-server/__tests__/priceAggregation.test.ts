import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAggregatesFromPoints, type PointForAgg } from "../src/lib/priceAggregation.js";

const NOW = new Date(Date.UTC(2026, 6, 15)); // 2026-07-15

function pt(over: Partial<PointForAgg> = {}): PointForAgg {
  return {
    workTypeId: 1,
    unit: "м²",
    unitPrice: 1000,
    city: "Краснодар",
    zhk: null,
    closedAt: new Date(Date.UTC(2026, 6, 10)),
    ...over,
  };
}

test("buildAggregatesFromPoints: work_city агрегат, медиана и порог индексации", () => {
  const points = [1000, 1100, 1200, 1300, 1400].map((v) => pt({ unitPrice: v }));
  const rows = buildAggregatesFromPoints(points, NOW);
  const city = rows.find((r) => r.keyType === "work_city");
  assert.ok(city, "должна быть строка work_city");
  assert.equal(city!.workTypeId, 1);
  assert.equal(city!.city, "Краснодар");
  assert.equal(city!.p50, 1200);
  assert.equal(city!.n, 5);
  assert.equal(city!.unit, "м²");
  assert.equal(city!.isIndexable, true, "n=5 ≥ порог города (5)");
});

test("buildAggregatesFromPoints: ниже порога → не индексируется", () => {
  const points = [1000, 1100, 1200].map((v) => pt({ unitPrice: v }));
  const rows = buildAggregatesFromPoints(points, NOW);
  const city = rows.find((r) => r.keyType === "work_city")!;
  assert.equal(city.n, 3);
  assert.equal(city.isIndexable, false, "n=3 < порог города (5)");
});

test("buildAggregatesFromPoints: группировка по ЖК даёт work_zhk", () => {
  const points = [
    pt({ unitPrice: 1000, zhk: "ЖК А" }),
    pt({ unitPrice: 1200, zhk: "ЖК А" }),
    pt({ unitPrice: 1400, zhk: "ЖК А" }),
    pt({ unitPrice: 900 }), // без ЖК
  ];
  const rows = buildAggregatesFromPoints(points, NOW);
  const zhk = rows.find((r) => r.keyType === "work_zhk");
  assert.ok(zhk, "должна быть строка work_zhk");
  assert.equal(zhk!.district, "ЖК А");
  assert.equal(zhk!.n, 3);
  assert.equal(zhk!.isIndexable, false, "n=3 < порог ЖК (10)");
  // work_city учитывает все 4 точки города
  assert.equal(rows.find((r) => r.keyType === "work_city")!.n, 4);
});

test("buildAggregatesFromPoints: точки без города пропускаются", () => {
  const rows = buildAggregatesFromPoints([pt({ city: null }), pt({ city: "  " })], NOW);
  assert.equal(rows.length, 0);
});

test("buildAggregatesFromPoints: series_12m содержит 12 месяцев, старые→новые", () => {
  const rows = buildAggregatesFromPoints([1000, 1100, 1200, 1300, 1400].map((v) => pt({ unitPrice: v })), NOW);
  const s = rows.find((r) => r.keyType === "work_city")!.series12m;
  assert.equal(s.length, 12);
  assert.equal(s[11]!.month, "2026-07"); // последний — текущий месяц
  assert.equal(s[0]!.month, "2025-08"); // 11 месяцев назад
  assert.equal(s[11]!.n, 5, "все точки в июле 2026");
  assert.equal(s[11]!.p50, 1200);
});

test("buildAggregatesFromPoints: разные виды работ — разные строки", () => {
  const points = [
    ...[1000, 1100, 1200, 1300, 1400].map((v) => pt({ workTypeId: 1, unitPrice: v })),
    ...[300, 320, 340, 360, 380].map((v) => pt({ workTypeId: 2, unitPrice: v })),
  ];
  const rows = buildAggregatesFromPoints(points, NOW).filter((r) => r.keyType === "work_city");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.workTypeId).sort(), [1, 2]);
});
