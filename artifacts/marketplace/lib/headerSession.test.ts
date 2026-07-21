/**
 * Feature: real-price, Task 5.5 — unit tests for the public header session seam.
 *
 * Runner / convention. The marketplace (Next.js 15) package has no test runner
 * of its own, so — mirroring the sibling community tests — this reuses Node's
 * built-in test runner (`node:test`) driven by `tsx`:
 *
 *   npx tsx --test ./lib/headerSession.test.ts
 *
 * We test the PURE seam of the header (no DOM): given the raw
 * `/api/cabinet/auth/me` payload, `deriveHeaderSession` must decide
 * anonymous-vs-master robustly, and the avatar initial + menu model must be
 * stable. The React wiring in `Header.tsx` consumes only these functions, so
 * covering them proves the header shows owner controls for a valid master and
 * degrades to «Войти» for everything else.
 *
 * Validates: Requirement 10.1.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveHeaderSession,
  headerAvatarInitial,
  MASTER_MENU_ITEMS,
  CREATE_OBJECT_HREF,
} from "./headerSession";

test("deriveHeaderSession: valid master payload → master with normalized fields", () => {
  const session = deriveHeaderSession({
    id: 42,
    alias: "  Артём  ",
    city: "Краснодар",
    phone: "+7 900 000-00-00",
    pwaLogin: "artem",
    customAvatarUrl: "https://cdn/av.png",
    status: "active",
  });
  assert.equal(session.status, "master");
  if (session.status !== "master") return; // narrow for TS
  assert.equal(session.master.id, 42);
  assert.equal(session.master.alias, "Артём"); // trimmed
  assert.equal(session.master.avatarUrl, "https://cdn/av.png");
  assert.equal(session.master.contact, "+7 900 000-00-00"); // phone wins over pwaLogin
});

test("deriveHeaderSession: contact falls back to pwaLogin when phone missing", () => {
  const session = deriveHeaderSession({ id: 7, alias: "Мастер", pwaLogin: "m7" });
  assert.equal(session.status, "master");
  if (session.status !== "master") return;
  assert.equal(session.master.contact, "m7");
  assert.equal(session.master.avatarUrl, null);
});

test("deriveHeaderSession: null / 401-ish / malformed → anonymous", () => {
  for (const raw of [
    null,
    undefined,
    "not-an-object",
    42,
    {},
    { alias: "no id" },
    { id: 1 }, // no alias
    { id: "1", alias: "string id" }, // id not a number
    { id: Number.NaN, alias: "nan id" },
    { id: 5, alias: "   " }, // blank alias
    { error: "unauthorized" },
  ]) {
    assert.equal(deriveHeaderSession(raw).status, "anonymous", `payload: ${JSON.stringify(raw)}`);
  }
});

test("headerAvatarInitial: first letter uppercased, safe fallback", () => {
  assert.equal(headerAvatarInitial("артём"), "А");
  assert.equal(headerAvatarInitial("  bob"), "B");
  assert.equal(headerAvatarInitial(""), "М");
  assert.equal(headerAvatarInitial("   "), "М");
});

test("menu model: create-object CTA hub + non-empty, well-formed cabinet links", () => {
  assert.equal(CREATE_OBJECT_HREF, "/cabinet/objects");
  assert.ok(MASTER_MENU_ITEMS.length >= 3);
  for (const item of MASTER_MENU_ITEMS) {
    assert.ok(item.href.startsWith("/cabinet/"), `href under /cabinet: ${item.href}`);
    assert.ok(item.label.trim().length > 0, "non-empty label");
  }
});
