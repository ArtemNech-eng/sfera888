import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure-логика дефолтов и парсинга флага из row.value.
 *
 * Семантика идентична `routes/system.ts:GET /feature-flags`:
 *   • row отсутствует (null/undefined) → default = true (token-model on)
 *   • row.value === "true" → true
 *   • любое другое значение ("false", "", "garbage") → false
 */

function parseFlagValue(rowValue: string | null | undefined): boolean {
  // Точная копия логики из tokenModelGuard.ts isTokenModelEnabled():
  //   const value = row?.value != null ? row.value === "true" : true;
  return rowValue != null ? rowValue === "true" : true;
}

// ─── Default = true (row missing) ────────────────────────────────────────────

test("undefined row.value → flag is true (default on, row missing)", () => {
  assert.equal(parseFlagValue(undefined), true);
});

test("null row.value → flag is true (default on, row missing)", () => {
  assert.equal(parseFlagValue(null), true);
});

// ─── Explicit values ─────────────────────────────────────────────────────────

test("'true' string → flag is true (explicit on)", () => {
  assert.equal(parseFlagValue("true"), true);
});

test("'false' string → flag is false (explicit off)", () => {
  assert.equal(parseFlagValue("false"), false);
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

test("empty string → flag is false (only literal 'true' enables)", () => {
  assert.equal(parseFlagValue(""), false);
});

test("'False' (uppercase) → flag is false (strict equality)", () => {
  assert.equal(parseFlagValue("False"), false);
});

test("'TRUE' (uppercase) → flag is false (strict equality)", () => {
  assert.equal(parseFlagValue("TRUE"), false);
});

test("'1' → flag is false (we don't accept truthy semantics)", () => {
  assert.equal(parseFlagValue("1"), false);
});

test("any garbage string → flag is false (admin must write exact 'true')", () => {
  assert.equal(parseFlagValue("garbage"), false);
});

// ─── Property: idempotent ────────────────────────────────────────────────────

test("parseFlagValue is deterministic (pure function)", () => {
  const inputs: (string | null | undefined)[] = [undefined, null, "false", "true", "", "garbage"];
  for (const v of inputs) {
    const a = parseFlagValue(v);
    const b = parseFlagValue(v);
    const c = parseFlagValue(v);
    assert.equal(a, b, `non-deterministic for ${JSON.stringify(v)}`);
    assert.equal(b, c, `non-deterministic for ${JSON.stringify(v)}`);
  }
});

// ─── Property: consistency with system.ts /feature-flags endpoint ────────────

test("parseFlagValue matches system.ts feature-flags semantics", () => {
  // routes/system.ts uses: stored != null ? stored === "true" : FLAG_DEFAULTS[key]
  // For token_model_enabled, FLAG_DEFAULTS[key] = true.
  // Our parseFlagValue inlines this — let's verify.
  const samples: { input: string | null | undefined; expected: boolean }[] = [
    { input: undefined, expected: true },     // missing → default true
    { input: null, expected: true },          // missing → default true
    { input: "true", expected: true },        // explicit on
    { input: "false", expected: false },      // explicit off
    { input: "", expected: false },           // empty → off (strict)
    { input: "yes", expected: false },        // garbage → off (strict)
    { input: "0", expected: false },
    { input: "1", expected: false },
  ];
  for (const { input, expected } of samples) {
    assert.equal(parseFlagValue(input), expected, `mismatch for ${JSON.stringify(input)}`);
  }
});
