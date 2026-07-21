/**
 * Real Price 3.4 — unit tests for the pure estimate normalizer.
 *
 *   npx tsx --test ./__tests__/estimateNormalize.test.ts
 *
 * Covers the LLM-output → checker-rows contract without any network / SDK:
 * array vs {items} wrappers, fenced-JSON strings, messy numeric strings,
 * per-unit vs total pricing, description-required filtering, and the item cap.
 *
 * Validates: Requirement 7.4.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeParsedEstimate,
  MAX_PARSED_ITEMS,
} from "../src/lib/estimateNormalize.js";

test("normalizeParsedEstimate: bare array of rows", () => {
  const out = normalizeParsedEstimate([
    { description: "Укладка плитки", unit: "м²", quantity: 28, price: 1200 },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { description: "Укладка плитки", unit: "м²", quantity: 28, price: 1200 });
});

test("normalizeParsedEstimate: {items:[...]} wrapper + Russian/alt keys", () => {
  const out = normalizeParsedEstimate({
    items: [{ наименование: "Штукатурка стен", ед: "м2", количество: 50, цена: 450 }],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.description, "Штукатурка стен");
  assert.equal(out[0]?.unit, "m2".replace("m", "м")); // "м2"
  assert.equal(out[0]?.quantity, 50);
  assert.equal(out[0]?.price, 450);
});

test("normalizeParsedEstimate: fenced JSON string is parsed", () => {
  const raw = "```json\n{\"items\":[{\"description\":\"Демонтаж\",\"price\":\"1 000 ₽\"}]}\n```";
  const out = normalizeParsedEstimate(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.description, "Демонтаж");
  assert.equal(out[0]?.price, 1000); // "1 000 ₽" → 1000
});

test("normalizeParsedEstimate: messy numeric strings ('1 200,50 руб')", () => {
  const out = normalizeParsedEstimate([{ description: "Работа", price: "1 200,50 руб", quantity: "3,5" }]);
  assert.equal(out[0]?.price, 1200.5);
  assert.equal(out[0]?.quantity, 3.5);
});

test("normalizeParsedEstimate: per-unit derived from total / quantity", () => {
  const out = normalizeParsedEstimate([{ description: "Плитка", quantity: 10, total: 12000 }]);
  assert.equal(out[0]?.price, 1200);
});

test("normalizeParsedEstimate: rows without description dropped; missing price kept as null", () => {
  const out = normalizeParsedEstimate([
    { unit: "м²", price: 500 }, // no description → dropped
    { description: "   ", price: 500 }, // blank → dropped
    { description: "Грунтовка" }, // kept, price null
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { description: "Грунтовка", unit: null, quantity: null, price: null });
});

test("normalizeParsedEstimate: garbage / non-array → empty", () => {
  assert.deepEqual(normalizeParsedEstimate(null), []);
  assert.deepEqual(normalizeParsedEstimate("not json"), []);
  assert.deepEqual(normalizeParsedEstimate(42), []);
  assert.deepEqual(normalizeParsedEstimate({ nope: true }), []);
  assert.deepEqual(normalizeParsedEstimate([1, "x", null]), []);
});

test("normalizeParsedEstimate: caps at MAX_PARSED_ITEMS", () => {
  const many = Array.from({ length: MAX_PARSED_ITEMS + 15 }, (_, i) => ({
    description: `Работа ${i}`,
    price: 100 + i,
  }));
  const out = normalizeParsedEstimate(many);
  assert.equal(out.length, MAX_PARSED_ITEMS);
});
