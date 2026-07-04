/**
 * Unit tests for pure Local_Feed topic input validation (Task 4.2).
 *
 * **Validates: Requirements 3.1, 3.4** — тема Local_Feed допустима только с
 * категорией из перечня `LOCAL_FEED_CATEGORIES`, заголовком 1..200 символов и
 * телом ≤ 5000 символов. Здесь проверяются границы чистого детерминированного
 * помощника `validateTopicInput`, который не обращается к БД. Свойство «за
 * границами → отклонение + сохранённый черновик; в границах → принятие»
 * покрывается отдельным property-тестом (Task 4.3).
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Тестируемая
// функция чистая и не выполняет запросов, поэтому фиктивной строки достаточно.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { validateTopicInput, LOCAL_FEED_CATEGORIES } = await import(
  "../../src/lib/feedService.js"
);

/** Базовый валидный ввод — переопределяем отдельные поля в тестах. */
function base(overrides: Record<string, unknown> = {}) {
  return { category: "utility_incident", title: "Заголовок", body: "Тело", ...overrides };
}

describe("validateTopicInput — категория (Requirement 3.1)", () => {
  it("принимает каждую категорию из перечня", () => {
    for (const category of LOCAL_FEED_CATEGORIES) {
      const result = validateTopicInput(base({ category }));
      assert.equal(result.ok, true, `категория ${category} должна быть допустима`);
      assert.deepEqual(result.violations, []);
    }
  });

  it("отклоняет неизвестную категорию", () => {
    const result = validateTopicInput(base({ category: "spam_offer" }));
    assert.equal(result.ok, false);
    assert.ok(result.violations.includes("invalid_category"));
  });

  it("отклоняет отсутствующую категорию (null / undefined)", () => {
    assert.equal(validateTopicInput(base({ category: null })).ok, false);
    assert.equal(validateTopicInput(base({ category: undefined })).ok, false);
  });

  it("отклоняет пустую строку категории", () => {
    const result = validateTopicInput(base({ category: "" }));
    assert.ok(result.violations.includes("invalid_category"));
  });
});

describe("validateTopicInput — заголовок 1..200 (Requirement 3.4)", () => {
  it("отклоняет заголовок длиной 0 (нижняя граница − 1)", () => {
    const result = validateTopicInput(base({ title: "" }));
    assert.equal(result.ok, false);
    assert.ok(result.violations.includes("invalid_title"));
  });

  it("отклоняет заголовок из одних пробелов (значимая длина 0)", () => {
    const result = validateTopicInput(base({ title: "     " }));
    assert.ok(result.violations.includes("invalid_title"));
  });

  it("принимает заголовок длиной ровно 1 символ (нижняя граница)", () => {
    const result = validateTopicInput(base({ title: "A" }));
    assert.equal(result.ok, true);
  });

  it("принимает заголовок длиной ровно 200 символов (верхняя граница)", () => {
    const result = validateTopicInput(base({ title: "x".repeat(200) }));
    assert.equal(result.ok, true);
  });

  it("отклоняет заголовок длиной 201 символ (верхняя граница + 1)", () => {
    const result = validateTopicInput(base({ title: "x".repeat(201) }));
    assert.equal(result.ok, false);
    assert.ok(result.violations.includes("invalid_title"));
  });
});

describe("validateTopicInput — тело ≤ 5000 (Requirement 3.4)", () => {
  it("принимает тело длиной ровно 5000 символов (верхняя граница)", () => {
    const result = validateTopicInput(base({ body: "x".repeat(5000) }));
    assert.equal(result.ok, true);
  });

  it("отклоняет тело длиной 5001 символ (верхняя граница + 1)", () => {
    const result = validateTopicInput(base({ body: "x".repeat(5001) }));
    assert.equal(result.ok, false);
    assert.ok(result.violations.includes("invalid_body"));
  });

  it("принимает пустое тело (нижней границы нет)", () => {
    const result = validateTopicInput(base({ body: "" }));
    assert.equal(result.ok, true);
  });
});

describe("validateTopicInput — комбинации нарушений", () => {
  it("возвращает все нарушения сразу при полностью недопустимом вводе", () => {
    const result = validateTopicInput({
      category: "nope",
      title: "",
      body: "x".repeat(5001),
    });
    assert.equal(result.ok, false);
    assert.ok(result.violations.includes("invalid_category"));
    assert.ok(result.violations.includes("invalid_title"));
    assert.ok(result.violations.includes("invalid_body"));
  });

  it("полностью валидный ввод не даёт нарушений", () => {
    const result = validateTopicInput(base());
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
  });
});
