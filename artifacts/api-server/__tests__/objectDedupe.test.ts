/**
 * Real Price 0.4 — unit tests for the "1 order = 1 Object" pure dedupe.
 *
 *   npx tsx --test ./__tests__/objectDedupe.test.ts
 *
 * Validates: Requirement 1.3 (1 заказ = 1 Объект).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalReceiptIdsByOrder,
  findDuplicateObjectOrders,
} from "../src/lib/objectDedupe.js";

test("canonicalReceiptIdsByOrder: keeps only the max receipt id per order", () => {
  const keep = canonicalReceiptIdsByOrder([
    { id: 1, orderId: 100 },
    { id: 5, orderId: 100 }, // canonical for order 100
    { id: 3, orderId: 200 }, // canonical for order 200
  ]);
  assert.deepEqual([...keep].sort((a, b) => a - b), [3, 5]);
});

test("canonicalReceiptIdsByOrder: receipts without an order are all kept", () => {
  const keep = canonicalReceiptIdsByOrder([
    { id: 7, orderId: null },
    { id: 8, orderId: null },
    { id: 9, orderId: 300 },
  ]);
  assert.deepEqual([...keep].sort((a, b) => a - b), [7, 8, 9]);
});

test("canonicalReceiptIdsByOrder: empty input → empty set", () => {
  assert.equal(canonicalReceiptIdsByOrder([]).size, 0);
});

test("findDuplicateObjectOrders: reports only orders with >1 receipt, canonical = max", () => {
  const dupes = findDuplicateObjectOrders([
    { id: 1, orderId: 100 },
    { id: 5, orderId: 100 },
    { id: 4, orderId: 100 },
    { id: 3, orderId: 200 }, // single → not a duplicate
  ]);
  assert.equal(dupes.length, 1);
  assert.deepEqual(dupes[0], { orderId: 100, receiptIds: [1, 4, 5], canonicalId: 5 });
});

test("findDuplicateObjectOrders: none when every order has one receipt", () => {
  assert.deepEqual(
    findDuplicateObjectOrders([
      { id: 1, orderId: 1 },
      { id: 2, orderId: 2 },
    ]),
    [],
  );
});
