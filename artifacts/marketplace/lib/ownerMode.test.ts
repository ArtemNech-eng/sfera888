/**
 * Feature: real-price, Task 5.4 — unit tests for the Owner_Mode ownership seam.
 *
 *   npx tsx --test ./lib/ownerMode.test.ts
 *
 * Covers the pure decision functions the client owner bars depend on:
 * id-based match (profile / legacy portfolio) and slug-membership match
 * (object case), plus the edit deep-link. DOM-free, node:test — mirrors the
 * project convention.
 *
 * Validates: Requirement 10.2.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesMaster, findOwnedObjectBySlug, caseEditHref } from "./ownerMode";

test("matchesMaster: equal finite numbers → true", () => {
  assert.equal(matchesMaster(42, 42), true);
});

test("matchesMaster: different / non-numeric / null → false", () => {
  assert.equal(matchesMaster(42, 43), false);
  assert.equal(matchesMaster(undefined, 42), false);
  assert.equal(matchesMaster(42, null), false);
  assert.equal(matchesMaster("42", 42), false); // string id must not match
  assert.equal(matchesMaster(Number.NaN, Number.NaN), false);
});

test("findOwnedObjectBySlug: returns the matching item (with orderId)", () => {
  const items = [
    { slug: "vannaya-krasnodar", orderId: 10, isPublished: true },
    { slug: "kuhnya-sochi", orderId: 11, isPublished: false },
  ];
  const hit = findOwnedObjectBySlug(items, "kuhnya-sochi");
  assert.ok(hit);
  assert.equal(hit?.orderId, 11);
  assert.equal(hit?.isPublished, false);
});

test("findOwnedObjectBySlug: null items / blank slug / no match / null slug → null", () => {
  assert.equal(findOwnedObjectBySlug(null, "x"), null);
  assert.equal(findOwnedObjectBySlug([], "x"), null);
  assert.equal(findOwnedObjectBySlug([{ slug: "a", orderId: 1, isPublished: false }], "   "), null);
  assert.equal(findOwnedObjectBySlug([{ slug: "a", orderId: 1, isPublished: false }], "b"), null);
  assert.equal(findOwnedObjectBySlug([{ slug: null, orderId: 1, isPublished: false }], "a"), null);
});

test("findOwnedObjectBySlug: trims both sides before comparing", () => {
  const hit = findOwnedObjectBySlug([{ slug: " a ", orderId: 9, isPublished: true }], "a");
  assert.equal(hit?.orderId, 9);
});

test("caseEditHref: builds the order-scoped object editor path", () => {
  assert.equal(caseEditHref(123), "/cabinet/orders/123/object");
});
