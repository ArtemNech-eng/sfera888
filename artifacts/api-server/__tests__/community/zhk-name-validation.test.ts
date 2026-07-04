/**
 * Unit tests for pure ZhK name validation/normalization (Task 3.2).
 *
 * **Validates: Requirements 4.2, 4.3, 4.5** — название ЖК допустимо при длине
 * 2..100 символов (после trim); дедупликация опирается на нормализацию
 * `lower(trim(name))`.
 *
 * Тестируем чистые, детерминированные функции `validateZhkName` и
 * `normalizeZhkName`, которые не обращаются к БД. Дедупликация с реальной
 * вставкой (`createZhk`) требует Postgres и покрывается property/интеграционным
 * слоем (Task 3.3).
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Тестируемые
// функции чистые и не выполняют запросов, поэтому фиктивной строки достаточно.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { validateZhkName, normalizeZhkName } = await import(
  "../../src/lib/geoService.js"
);

describe("geoService.validateZhkName (Requirements 4.2, 4.3)", () => {
  it("отклоняет пустое название", () => {
    assert.equal(validateZhkName(""), false);
  });

  it("отклоняет название из одних пробелов (0 значимых символов)", () => {
    assert.equal(validateZhkName("     "), false);
  });

  it("отклоняет название длиной 1 символ (ниже границы)", () => {
    assert.equal(validateZhkName("A"), false);
  });

  it("принимает название длиной ровно 2 символа (нижняя граница)", () => {
    assert.equal(validateZhkName("AB"), true);
  });

  it("принимает название длиной ровно 100 символов (верхняя граница)", () => {
    assert.equal(validateZhkName("x".repeat(100)), true);
  });

  it("отклоняет название длиной 101 символ (выше границы)", () => {
    assert.equal(validateZhkName("x".repeat(101)), false);
  });

  it("проверяет длину по обрезанному значению (2 символа + пробелы → валидно)", () => {
    assert.equal(validateZhkName("  AB  "), true);
  });

  it("проверяет длину по обрезанному значению (101 значимый символ → невалидно)", () => {
    assert.equal(validateZhkName(`  ${"x".repeat(101)}  `), false);
  });

  it("отклоняет не-строку", () => {
    // @ts-expect-error намеренно неверный тип для проверки защиты
    assert.equal(validateZhkName(null), false);
    // @ts-expect-error намеренно неверный тип для проверки защиты
    assert.equal(validateZhkName(undefined), false);
  });
});

describe("geoService.normalizeZhkName (Requirement 4.5)", () => {
  it("удаляет начальные/конечные пробелы", () => {
    assert.equal(normalizeZhkName("  ЖК Заря  "), "жк заря");
  });

  it("приводит к нижнему регистру", () => {
    assert.equal(normalizeZhkName("ЖК ЗАРЯ"), "жк заря");
  });

  it("эквивалентные по trim/lower названия нормализуются одинаково", () => {
    const a = normalizeZhkName("  ЖК Заря ");
    const b = normalizeZhkName("жк заря");
    const c = normalizeZhkName("ЖК ЗАРЯ");
    assert.equal(a, b);
    assert.equal(b, c);
  });

  it("различающиеся по значимым символам названия нормализуются по-разному", () => {
    assert.notEqual(normalizeZhkName("ЖК Заря"), normalizeZhkName("ЖК Восход"));
  });
});
