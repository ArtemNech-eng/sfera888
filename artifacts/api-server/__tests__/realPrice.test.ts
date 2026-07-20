import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchWorkType,
  robustStats,
  meetsPriceThreshold,
  derivePricePoint,
  DEFAULT_MIN_N_CITY,
  DEFAULT_MIN_N_ZHK,
  type WorkTypeLite,
} from "../src/lib/realPrice.js";

const WT: WorkTypeLite[] = [
  { id: 1, slug: "shtukaturka-sten", name: "Штукатурка стен", category: "work", defaultUnit: "м²", synonyms: ["штукатур"] },
  { id: 2, slug: "shpaklevka-sten", name: "Шпаклёвка стен", category: "work", defaultUnit: "м²", synonyms: ["шпакл", "шпаклёвк", "шпаклевк", "шпаклеван"] },
  { id: 3, slug: "ukladka-plitki-steny", name: "Укладка плитки на стены", category: "work", defaultUnit: "м²", synonyms: ["плитк", "настенн плитк", "укладка плитки"] },
  { id: 4, slug: "sanuzel-pod-klyuch", name: "Санузел под ключ", category: "project", defaultUnit: "объект", synonyms: ["санузел под ключ", "ванная под ключ"] },
  { id: 5, slug: "melkiy-remont", name: "Мелкий ремонт (муж на час)", category: "task", defaultUnit: "час", synonyms: ["муж на час", "мелкий ремонт"] },
];

// ─── matchWorkType ──────────────────────────────────────────────────────────

test("matchWorkType: базовое совпадение по синониму (регистронезависимо)", () => {
  assert.equal(matchWorkType("Штукатурка стен гипсовой", WT)?.slug, "shtukaturka-sten");
  assert.equal(matchWorkType("шпаклевание первый слой", WT)?.slug, "shpaklevka-sten");
  assert.equal(matchWorkType("Укладка плитки керамической", WT)?.slug, "ukladka-plitki-steny");
});

test("matchWorkType: выигрывает самое длинное совпадение", () => {
  // «санузел под ключ» (длинный) должен победить над коротким «плитк» и т.п.
  assert.equal(matchWorkType("Санузел под ключ, 6 м²", WT)?.slug, "sanuzel-pod-klyuch");
});

test("matchWorkType: нет совпадения → null", () => {
  assert.equal(matchWorkType("Астрологический прогноз", WT), null);
  assert.equal(matchWorkType("", WT), null);
});

// ─── robustStats ──────────────────────────────────────────────────────────

test("robustStats: медиана и вилка на простом наборе", () => {
  const s = robustStats([100, 200, 300, 400, 500])!;
  assert.equal(s.n, 5);
  assert.equal(s.p50, 300);
  assert.equal(s.p25, 200);
  assert.equal(s.p75, 400);
});

test("robustStats: единичное значение", () => {
  const s = robustStats([777])!;
  assert.deepEqual(s, { n: 1, p25: 777, p50: 777, p75: 777 });
});

test("robustStats: выброс отсекается на достаточном наборе", () => {
  // Пять близких значений + один гигантский выброс.
  const s = robustStats([100, 110, 120, 130, 140, 100000])!;
  assert.equal(s.n, 5, "выброс должен быть отброшен");
  assert.ok(s.p75 <= 140, "P75 без учёта выброса");
});

test("robustStats: не-положительные и нечисловые отбрасываются; пустой → null", () => {
  assert.equal(robustStats([]), null);
  assert.equal(robustStats([0, -5, Number.NaN]), null);
});

// ─── meetsPriceThreshold ──────────────────────────────────────────────────

test("meetsPriceThreshold: дефолтные пороги город/ЖК", () => {
  assert.equal(meetsPriceThreshold("work_city", DEFAULT_MIN_N_CITY), true);
  assert.equal(meetsPriceThreshold("work_city", DEFAULT_MIN_N_CITY - 1), false);
  assert.equal(meetsPriceThreshold("work_zhk", DEFAULT_MIN_N_ZHK), true);
  assert.equal(meetsPriceThreshold("work_zhk", DEFAULT_MIN_N_ZHK - 1), false);
});

// ─── derivePricePoint ─────────────────────────────────────────────────────

test("derivePricePoint: цена за единицу (есть unit+quantity)", () => {
  const p = derivePricePoint({ description: "Шпаклевка стен", unit: "м²", quantity: 89, price: 300 }, WT)!;
  assert.equal(p.workTypeId, 2);
  assert.equal(p.unit, "м²");
  assert.equal(p.quantity, 89);
  assert.equal(p.unitPrice, 300);
  assert.equal(p.total, 26700); // 300 × 89
});

test("derivePricePoint: сумма позиции (нет quantity/unit) → unit из словаря, quantity null", () => {
  const p = derivePricePoint({ description: "Штукатурка", price: 10000 }, WT)!;
  assert.equal(p.workTypeId, 1);
  assert.equal(p.unit, "м²"); // из defaultUnit словаря
  assert.equal(p.quantity, null);
  assert.equal(p.unitPrice, 10000);
  assert.equal(p.total, 10000);
});

test("derivePricePoint: не сопоставилось словарю или цена невалидна → null", () => {
  assert.equal(derivePricePoint({ description: "Ерунда какая-то", price: 500 }, WT), null);
  assert.equal(derivePricePoint({ description: "Штукатурка", price: 0 }, WT), null);
});
