/**
 * Property test P2 for `communityAuth.ts` → `validatePassword`.
 *
 * Property 2: Валидация пароля соответствует Password_Policy.
 *
 * **Validates: Requirements 2.2, 2.3**
 *
 * Module under test (`src/lib/communityAuth.ts`):
 *   - `validatePassword(raw: unknown): PasswordValidation`
 *       Контракт:
 *         - не-строка или пустая строка → `{ ok: false, reason: "password_missing" }`
 *           (Requirement 2.3 — отсутствует/пустое обязательное поле);
 *         - строка длиной < 8 или > 72 символов → `{ ok: false, reason: "password_invalid" }`
 *           (Requirement 2.2 — недопустимый пароль);
 *         - строка длиной 8..72 символов включительно → `{ ok: true }`
 *           (Requirement 2.2 — Password_Policy).
 *
 * Свойство P2 (design.md): `validatePassword` возвращает `ok: true` тогда и
 * только тогда, когда длина строки не меньше 8 и не больше 72 символов
 * включительно; иначе — отказ `password_invalid` (для непустой строки вне
 * диапазона) или `password_missing` (для пустой/отсутствующей строки).
 * Границы 7/8/72/73 ОБЯЗАНЫ присутствовать среди сгенерированных входов.
 *
 * Run via Node's built-in test runner:
 *   tsx --test ./__tests__/community/password-validation.property.test.ts
 */

// `communityAuth.ts` статически импортирует `@workspace/db`, который бросает на
// этапе загрузки модуля, если `DATABASE_URL` не задан. pg.Pool не подключается
// лениво, поэтому фиктивной строки достаточно — `validatePassword` чист и не
// выполняет никаких запросов к БД/сети.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки `@workspace/db`.
const communityAuth = await import("../../src/lib/communityAuth.js");
const { validatePassword, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } =
  communityAuth;

// Границы Password_Policy как заявлено в спеке/design.md.
const MIN = 8;
const MAX = 72;

// ─── Arbitraries ──────────────────────────────────────────────────────────

/**
 * Строка ЗАДАННОЙ длины символов. Используем `fc.string` с точным диапазоном
 * длины (в code units), затем добираем/подрезаем до точной длины, чтобы
 * контролировать граничные значения детерминированно и без суррогатных пар.
 * Символы берём из BMP-безопасного печатного диапазона, чтобы `str.length`
 * совпадала с числом символов.
 */
const charArb = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_-+= ".split(
    "",
  ),
);

function stringOfLength(len: number): fc.Arbitrary<string> {
  if (len === 0) return fc.constant("");
  return fc
    .array(charArb, { minLength: len, maxLength: len })
    .map((xs) => xs.join(""));
}

// Явные граничные длины: 7 (ниже нижней), 8 (нижняя), 72 (верхняя), 73 (выше).
const BOUNDARY_LENGTHS = [MIN - 1, MIN, MAX, MAX + 1]; // 7, 8, 72, 73

// ─── Property 2 — эквивалентность результата и Password_Policy ──────────────

describe("validatePassword — P2: результат соответствует Password_Policy", () => {
  // Feature: community-phone-registration, Property 2: валидация пароля
  // соответствует Password_Policy (длина 8..72 включительно).
  // Validates: Requirements 2.2, 2.3

  it("константы политики равны заявленным границам 8 и 72", () => {
    assert.equal(PASSWORD_MIN_LENGTH, MIN);
    assert.equal(PASSWORD_MAX_LENGTH, MAX);
  });

  it("ok:true ⟺ длина строки в [8, 72]; иначе — соответствующий отказ (произвольные длины)", () => {
    fc.assert(
      fc.property(
        // Длины от 0 до 90 покрывают пустую строку, весь валидный диапазон и
        // значения существенно выше верхней границы.
        fc.integer({ min: 0, max: 90 }).chain((len) => stringOfLength(len)),
        (pw) => {
          const result = validatePassword(pw);
          const len = pw.length;

          if (len >= MIN && len <= MAX) {
            assert.deepEqual(
              result,
              { ok: true },
              `длина ${len} должна быть валидной`,
            );
          } else if (len === 0) {
            assert.deepEqual(
              result,
              { ok: false, reason: "password_missing" },
              `пустая строка → password_missing`,
            );
          } else {
            assert.deepEqual(
              result,
              { ok: false, reason: "password_invalid" },
              `длина ${len} вне диапазона → password_invalid`,
            );
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("границы 7/8/72/73 присутствуют в генераторе и классифицируются корректно", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BOUNDARY_LENGTHS).chain((len) => stringOfLength(len)),
        (pw) => {
          const result = validatePassword(pw);
          if (pw.length === MIN || pw.length === MAX) {
            // 8 и 72 — валидны (включительно).
            assert.deepEqual(result, { ok: true }, `граница ${pw.length} валидна`);
          } else {
            // 7 и 73 — недопустимы (непустые строки вне диапазона).
            assert.deepEqual(
              result,
              { ok: false, reason: "password_invalid" },
              `граница ${pw.length} невалидна`,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("явные проверки каждой границы (7→invalid, 8→ok, 72→ok, 73→invalid)", () => {
    assert.deepEqual(validatePassword("a".repeat(MIN - 1)), {
      ok: false,
      reason: "password_invalid",
    });
    assert.deepEqual(validatePassword("a".repeat(MIN)), { ok: true });
    assert.deepEqual(validatePassword("a".repeat(MAX)), { ok: true });
    assert.deepEqual(validatePassword("a".repeat(MAX + 1)), {
      ok: false,
      reason: "password_invalid",
    });
  });
});

// ─── Property 2 — отсутствующее/пустое поле → password_missing ──────────────

describe("validatePassword — P2: пустое/отсутствующее значение → password_missing", () => {
  // Feature: community-phone-registration, Property 2: валидация пароля
  // соответствует Password_Policy (Requirement 2.3 — обязательное поле).
  // Validates: Requirements 2.2, 2.3

  it("пустая строка всегда → password_missing", () => {
    assert.deepEqual(validatePassword(""), {
      ok: false,
      reason: "password_missing",
    });
  });

  it("не-строковые значения → password_missing (тип неизвестен из тела запроса)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.integer(),
          fc.double(),
          fc.boolean(),
          fc.array(fc.string()),
          fc.object(),
        ),
        (raw) => {
          assert.deepEqual(
            validatePassword(raw as unknown),
            { ok: false, reason: "password_missing" },
            `не-строка ${JSON.stringify(raw)} → password_missing`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
