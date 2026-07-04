/**
 * Unit tests for ZoneService.canAccessProtected (Task 6.1).
 *
 * **Validates: Requirements 7.1, 7.2, 7.3** — доступ к PRO_Protected_Layer
 * получает только Master с подтверждённым членством; подтверждённый мастер,
 * запрашивающий контент, получает доступ автоматически; аноним (нет аккаунта)
 * доступа не получает и получает предложение подтвердить членство.
 *
 * Тестируем ЧИСТУЮ функцию `canAccessProtected`, которая не обращается к БД.
 * Загрузка членства (`fetchVerifiedMembership`) требует реального Postgres и
 * покрывается интеграционным/роут-слоем.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// `@workspace/db` кидает при загрузке модуля, если не задан DATABASE_URL.
// Тест проверяет чистую функцию и не выполняет запросов, поэтому фиктивной
// строки достаточно (pg.Pool ленивый). Импорт — динамический, чтобы env успел
// выставиться до вычисления импортов модуля под тестом.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { canAccessProtected, hasVerifiedMembership } = await import(
  "../../src/lib/zoneService.js"
);

describe("zoneService.canAccessProtected (Requirements 7.1, 7.2, 7.3)", () => {
  it("подтверждённый мастер → доступ выдаётся автоматически (7.1, 7.2)", () => {
    const decision = canAccessProtected(
      { role: "master" },
      { verified: true },
    );
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, null);
    assert.equal(decision.promptVerification, false);
  });

  it("подтверждённый мастер (членство массивом) → доступ", () => {
    const decision = canAccessProtected({ role: "master" }, [
      { verified: false },
      { verified: true },
    ]);
    assert.equal(decision.allowed, true);
  });

  it("мастер без подтверждённого членства → отказ (7.1)", () => {
    const decision = canAccessProtected(
      { role: "master" },
      { verified: false },
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "membership_not_verified");
    assert.equal(decision.promptVerification, true);
  });

  it("мастер без данных о членстве → отказ", () => {
    const decision = canAccessProtected({ role: "master" });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "membership_not_verified");
  });

  it("житель (resident) → отказ, не мастер (7.1)", () => {
    const decision = canAccessProtected(
      { role: "resident" },
      { verified: true },
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "not_master");
    assert.equal(decision.promptVerification, true);
  });

  it("аноним (account = null) → отказ + предложение верификации (7.3)", () => {
    const decision = canAccessProtected(null);
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "anonymous");
    assert.equal(decision.promptVerification, true);
  });

  it("аноним (account = undefined) → отказ (7.3)", () => {
    const decision = canAccessProtected(undefined, { verified: true });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "anonymous");
  });
});

describe("zoneService.hasVerifiedMembership", () => {
  it("null/undefined → false", () => {
    assert.equal(hasVerifiedMembership(null), false);
    assert.equal(hasVerifiedMembership(undefined), false);
  });

  it("одиночное подтверждённое членство → true", () => {
    assert.equal(hasVerifiedMembership({ verified: true }), true);
  });

  it("одиночное неподтверждённое членство → false", () => {
    assert.equal(hasVerifiedMembership({ verified: false }), false);
  });

  it("массив с хотя бы одним подтверждённым → true", () => {
    assert.equal(
      hasVerifiedMembership([{ verified: false }, { verified: true }]),
      true,
    );
  });

  it("пустой массив → false", () => {
    assert.equal(hasVerifiedMembership([]), false);
  });
});
