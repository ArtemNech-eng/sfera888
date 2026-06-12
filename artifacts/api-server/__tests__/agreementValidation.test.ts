import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAgreementBody,
  composeNoteText,
} from "../src/lib/agreementValidation.js";

// ─── Validates: Requirements 2.1 (amount > 0) ─────────────────────────────────

test("valid amount + no source → defaults to source='agreement'", () => {
  const result = validateAgreementBody({ amount: 5000 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.amount, 5000);
    assert.equal(result.source, "agreement");
    assert.equal(result.noteText, null);
    assert.equal(result.softWarning, false);
  }
});

test("amount = 0 returns error", () => {
  const result = validateAgreementBody({ amount: 0 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /больше 0/);
  }
});

test("amount = negative returns error", () => {
  const result = validateAgreementBody({ amount: -500 });
  assert.equal(result.ok, false);
});

test("amount = NaN returns error", () => {
  const result = validateAgreementBody({ amount: NaN });
  assert.equal(result.ok, false);
});

test("amount = Infinity returns error", () => {
  const result = validateAgreementBody({ amount: Infinity });
  assert.equal(result.ok, false);
});

test("amount missing entirely returns error", () => {
  const result = validateAgreementBody({});
  assert.equal(result.ok, false);
});

test("amount as string '8000' is coerced to number and accepted", () => {
  const result = validateAgreementBody({ amount: "8000" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.amount, 8000);
});

test("body = null is treated as empty body and rejected (no amount)", () => {
  const result = validateAgreementBody(null);
  assert.equal(result.ok, false);
});

// ─── Validates: Requirements 13 (Q13 master_proposal source) ─────────────────

test("source='master_proposal' is preserved", () => {
  const result = validateAgreementBody({ amount: 8000, source: "master_proposal" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.source, "master_proposal");
});

test("source='agreement' is preserved (explicit)", () => {
  const result = validateAgreementBody({ amount: 8000, source: "agreement" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.source, "agreement");
});

test("source='manager_correction' (not whitelisted) silently falls back to 'agreement'", () => {
  const result = validateAgreementBody({ amount: 8000, source: "manager_correction" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.source, "agreement");
});

test("source as non-string falls back to 'agreement'", () => {
  const result = validateAgreementBody({ amount: 8000, source: 42 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.source, "agreement");
});

// ─── Validates: Q2 (soft warning above 1М₽) ──────────────────────────────────

test("amount = 999_999 → softWarning = false", () => {
  const result = validateAgreementBody({ amount: 999_999 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.softWarning, false);
});

test("amount = 1_000_000 → softWarning = true", () => {
  const result = validateAgreementBody({ amount: 1_000_000 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.softWarning, true);
});

test("amount = 5_000_000 → softWarning = true", () => {
  const result = validateAgreementBody({ amount: 5_000_000 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.softWarning, true);
});

// ─── Validates: Q12 (optional note + composition) ────────────────────────────

test("composeNoteText: noteSource='from_master', no note → 'со слов мастера'", () => {
  assert.equal(composeNoteText("from_master", null), "со слов мастера");
});

test("composeNoteText: noteSource='from_chat' + note='80м²' → 'по чату с клиентом: 80м²'", () => {
  assert.equal(
    composeNoteText("from_chat", "80м²"),
    "по чату с клиентом: 80м²",
  );
});

test("composeNoteText: noteSource='other' + note='уточнили лично' → 'другое: уточнили лично'", () => {
  assert.equal(
    composeNoteText("other", "уточнили лично"),
    "другое: уточнили лично",
  );
});

test("composeNoteText: only note, no noteSource → returns just note", () => {
  assert.equal(composeNoteText(undefined, "хочу сразу 5000"), "хочу сразу 5000");
});

test("composeNoteText: empty note + no noteSource → null", () => {
  assert.equal(composeNoteText(undefined, undefined), null);
  assert.equal(composeNoteText(undefined, ""), null);
  assert.equal(composeNoteText(undefined, "   "), null);
});

test("composeNoteText: unknown noteSource value used as-is", () => {
  // For forward-compatibility with new noteSource values added by the FE
  // before backend whitelist update — we don't drop them silently.
  assert.equal(composeNoteText("custom_source", "details"), "custom_source: details");
});

test("composeNoteText: very long note is truncated to 1000 chars", () => {
  const longNote = "а".repeat(2000);
  const result = composeNoteText(undefined, longNote);
  assert.notEqual(result, null);
  assert.equal(result!.length, 1000);
});

test("composeNoteText: trims leading/trailing whitespace from note", () => {
  assert.equal(composeNoteText(undefined, "  hello  "), "hello");
});

// ─── Integrated: validate + note composition ─────────────────────────────────

test("validateAgreementBody preserves composed noteText", () => {
  const result = validateAgreementBody({
    amount: 8000,
    noteSource: "from_master",
    note: "договорились",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.noteText, "со слов мастера: договорились");
  }
});

test("validateAgreementBody: master_proposal one-click path (no note)", () => {
  const result = validateAgreementBody({
    amount: 12_000,
    source: "master_proposal",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.amount, 12_000);
    assert.equal(result.source, "master_proposal");
    assert.equal(result.noteText, null);
    assert.equal(result.softWarning, false);
  }
});

// ─── Validates: Property 1 (determinism) ─────────────────────────────────────

test("validateAgreementBody is deterministic", () => {
  const inputs = [
    { amount: 5000 },
    { amount: 5000, source: "master_proposal" },
    { amount: 1_500_000, noteSource: "from_master", note: "квартира 100м²" },
    { amount: 0 },
    {},
  ];
  for (const body of inputs) {
    const a = validateAgreementBody(body);
    const b = validateAgreementBody(body);
    assert.deepEqual(a, b, `non-deterministic for input ${JSON.stringify(body)}`);
  }
});
