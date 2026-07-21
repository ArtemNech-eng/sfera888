/**
 * Дорожка M — unit tests for the legacy→unified cabinet path mapping.
 *
 *   npx tsx --test ./__tests__/cabinetRedirect.test.ts
 *
 * Validates: Requirement 11.4 (диплинки из пушей → актуальные экраны) and 10.3.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapMasterPwaPathToCabinet } from "../src/lib/cabinetRedirect.js";

test("maps known screens 1:1 into /cabinet", () => {
  assert.equal(mapMasterPwaPathToCabinet("/orders"), "/cabinet/orders");
  assert.equal(mapMasterPwaPathToCabinet("/chat"), "/cabinet/chat");
  assert.equal(mapMasterPwaPathToCabinet("/balance"), "/cabinet/balance");
  assert.equal(mapMasterPwaPathToCabinet("/wallet"), "/cabinet/wallet");
  assert.equal(mapMasterPwaPathToCabinet("/profile"), "/cabinet/profile");
});

test("home ('' or '/') → /cabinet", () => {
  assert.equal(mapMasterPwaPathToCabinet(""), "/cabinet");
  assert.equal(mapMasterPwaPathToCabinet("/"), "/cabinet");
});

test("login stays at site root (/login)", () => {
  assert.equal(mapMasterPwaPathToCabinet("/login"), "/login");
});

test("unknown legacy routes fall back to /cabinet", () => {
  assert.equal(mapMasterPwaPathToCabinet("/work-rules"), "/cabinet");
  assert.equal(mapMasterPwaPathToCabinet("/pending-contract"), "/cabinet");
  assert.equal(mapMasterPwaPathToCabinet("/assets/index-abc.js"), "/cabinet");
});

test("ignores trailing slash, query and hash", () => {
  assert.equal(mapMasterPwaPathToCabinet("/orders/"), "/cabinet/orders");
  assert.equal(mapMasterPwaPathToCabinet("/orders?id=5"), "/cabinet/orders");
  assert.equal(mapMasterPwaPathToCabinet("/chat#thread"), "/cabinet/chat");
});
