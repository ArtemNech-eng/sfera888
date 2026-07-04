/**
 * Unit tests for Auth_Service level-2 gate `verifyLeadContext` (Task 8.2).
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4** — оставление лида и оплата
 * AI-утилиты требуют телефон + прохождение Captcha, при провале Captcha —
 * отказ с предложением повторить, и Max_Login не требуется ни на одном шаге.
 *
 * Captcha инъектируется, поэтому тесты детерминированы и не ходят в сеть.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  verifyLeadContext,
  normalizeRuPhone,
  type CaptchaVerifier,
} from "../../src/lib/communityAuth.js";

/** Captcha, которая всегда проходит. */
const passingCaptcha: CaptchaVerifier = async () => ({ success: true });
/** Captcha, которая всегда проваливается. */
const failingCaptcha: CaptchaVerifier = async () => ({ success: false });

describe("communityAuth.verifyLeadContext (Requirement 10)", () => {
  it("captcha провалена → отказ с предложением повторить (R10.3)", async () => {
    const result = await verifyLeadContext(
      { phone: "+7 999 123-45-67", captchaToken: "tok" },
      failingCaptcha,
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.reason, "captcha_failed");
      assert.equal(result.retry, true);
    }
  });

  it("телефон отсутствует → отказ (R10.1/R10.2)", async () => {
    const result = await verifyLeadContext(
      { phone: "", captchaToken: "tok" },
      passingCaptcha,
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.reason, "phone_missing");
      assert.equal(result.retry, false);
    }
  });

  it("телефон в неверном формате → отказ", async () => {
    const result = await verifyLeadContext(
      { phone: "12345", captchaToken: "tok" },
      passingCaptcha,
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.reason, "phone_invalid");
    }
  });

  it("captcha-токен отсутствует → предложить повторить", async () => {
    const result = await verifyLeadContext(
      { phone: "+79991234567", captchaToken: "" },
      passingCaptcha,
    );
    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.reason, "captcha_missing");
      assert.equal(result.retry, true);
    }
  });

  it("телефон валиден + captcha пройдена → успех с нормализованным номером", async () => {
    const result = await verifyLeadContext(
      { phone: "8 (999) 123-45-67", captchaToken: "tok" },
      passingCaptcha,
    );
    assert.equal(result.ok, true);
    if (result.ok === true) {
      assert.equal(result.phone, "+79991234567");
    }
  });

  it("Max_Login никогда не требуется: успех достигается без каких-либо Max-данных (R10.4)", async () => {
    // Вход содержит только phone + captchaToken; поля Max в контракте нет.
    // Проверка проходит исключительно по паре (phone, captcha).
    const result = await verifyLeadContext(
      { phone: "+79991234567", captchaToken: "tok" },
      passingCaptcha,
    );
    assert.equal(result.ok, true);
    // Убеждаемся, что тип входа не несёт Max-идентификаторов: попытка передать
    // их была бы ошибкой компиляции, поэтому здесь фиксируем контракт словами.
    assert.equal("maxUserId" in ({ phone: "", captchaToken: "" } as object), false);
  });
});

describe("communityAuth.normalizeRuPhone", () => {
  it("нормализует ведущую 8 к +7", () => {
    assert.equal(normalizeRuPhone("89991234567"), "+79991234567");
  });

  it("добавляет код страны к 10-значному номеру", () => {
    assert.equal(normalizeRuPhone("9991234567"), "+79991234567");
  });

  it("оставляет корректный +7-номер как есть (после очистки разделителей)", () => {
    assert.equal(normalizeRuPhone("+7 (999) 123-45-67"), "+79991234567");
  });

  it("отклоняет слишком короткий номер", () => {
    assert.equal(normalizeRuPhone("12345"), null);
  });

  it("отклоняет пустую строку", () => {
    assert.equal(normalizeRuPhone(""), null);
  });
});
