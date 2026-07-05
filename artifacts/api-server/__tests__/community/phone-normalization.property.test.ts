/**
 * Property test P1 for `communityAuth.ts` → `normalizeRuPhone`.
 *
 * Property 1: Нормализация телефона канонична и идемпотентна.
 *
 * **Validates: Requirements 1.5, 2.1, 3.3**
 *
 * Module under test (`src/lib/communityAuth.ts`):
 *   - `normalizeRuPhone(raw: string): string | null`
 *       Правила: оставить только цифры → ведущая `8` при 11 цифрах → `7`;
 *       10 цифр → префикс `7`; результат обязан быть ровно 11 цифрами с кодом
 *       страны `7`, иначе `null`. Канонический вид — `+7XXXXXXXXXX`.
 *
 * Свойства, проверяемые здесь (единое P1 из design.md):
 *   1a (format)       — для ЛЮБОЙ строки: если `normalizeRuPhone` вернул не-null,
 *                       результат матчит `^\+7\d{10}$` (формат «+7» и ровно 11
 *                       цифр с кодом страны 7).
 *   1b (idempotence)  — для ЛЮБОЙ строки: если результат не-null, повторное
 *                       применение `normalizeRuPhone` к результату даёт тот же
 *                       результат.
 *   1c (canonicity)   — любые два представления ОДНОГО номера (10 цифр, `8`+10,
 *                       `7`+10, `+7`+10, с произвольными нецифровыми
 *                       разделителями) дают ОДИН И ТОТ ЖЕ канонический ключ,
 *                       равный `+7` + национальный 10-значный номер.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/phone-normalization.property.test.ts
 */

// `communityAuth.ts` статически импортирует `@workspace/db`, который бросает на
// этапе загрузки модуля, если `DATABASE_URL` не задан. pg.Pool не подключается
// лениво, поэтому фиктивной строки достаточно — `normalizeRuPhone` чист и не
// выполняет никаких запросов к БД/сети.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки `@workspace/db`.
const communityAuth = await import("../../src/lib/communityAuth.js");
const { normalizeRuPhone } = communityAuth;

// Канонический вид результата: «+7» и ровно 11 цифр (код страны 7 + 10 цифр).
const CANONICAL_RE = /^\+7\d{10}$/;

// ─── Arbitraries ────────────────────────────────────────────────────────────

/** Одна десятичная цифра. */
const digitArb = fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9");

/**
 * Национальный 10-значный номер (без кода страны) — строка ровно из 10 цифр.
 * Покрывает и «неудобные» первые цифры (7, 8), которые пересекаются с логикой
 * префиксов страны, чтобы поймать возможные коллизии нормализации.
 */
const national10Arb: fc.Arbitrary<string> = fc
  .array(digitArb, { minLength: 10, maxLength: 10 })
  .map((xs) => xs.join(""));

/**
 * Нецифровой разделитель (любой набор символов, отбрасываемых `\D+`).
 * Включает типичные телефонные разделители плюс «злые» символы: `+`, буквы,
 * неразрывный пробел — все они по контракту стираются.
 */
const separatorArb: fc.Arbitrary<string> = fc
  .array(
    fc.constantFrom(
      " ", "-", "(", ")", ".", "+", "\t", "\u00a0", "/", "_", "—",
      "a", "x", "Ы", "№",
    ),
    { minLength: 0, maxLength: 3 },
  )
  .map((xs) => xs.join(""));

/**
 * Вставляет произвольные нецифровые разделители между цифрами строки, а также
 * (опционально) в начало и конец. Результат при `\D+`-очистке даёт исходные
 * цифры без изменений.
 */
function interleaveSeparators(
  digits: string,
  seps: string[],
  lead: string,
  trail: string,
): string {
  let out = lead;
  for (let i = 0; i < digits.length; i++) {
    out += digits[i];
    if (i < digits.length - 1) out += seps[i % Math.max(seps.length, 1)] ?? "";
  }
  return out + trail;
}

/** Способ представить один и тот же номер разными способами (эквиваленты). */
type PhoneForm = "ten" | "eight" | "seven" | "plus7";
const formArb = fc.constantFrom<PhoneForm>("ten", "eight", "seven", "plus7");

/** Возвращает цифровое (или `+`-префиксное) представление номера для формы. */
function renderForm(national10: string, form: PhoneForm): string {
  switch (form) {
    case "ten":
      return national10; // 10 цифр без кода страны
    case "eight":
      return "8" + national10; // 8XXXXXXXXXX
    case "seven":
      return "7" + national10; // 7XXXXXXXXXX
    case "plus7":
      return "+7" + national10; // +7XXXXXXXXXX
  }
}

/**
 * Полное представление номера: выбранная форма + произвольные нецифровые
 * разделители внутри/вокруг. Все такие представления обязаны нормализоваться к
 * одному ключу `+7` + national10.
 */
const representationArb = (national10: string): fc.Arbitrary<string> =>
  fc
    .record({
      form: formArb,
      seps: fc.array(separatorArb, { minLength: 0, maxLength: 15 }),
      lead: separatorArb,
      trail: separatorArb,
    })
    .map(({ form, seps, lead, trail }) => {
      const rendered = renderForm(national10, form);
      // Для plus7 ведущий '+' уже часть представления; разделители всё равно
      // безопасны, т.к. '+' и прочие нецифры стираются нормализатором.
      return interleaveSeparators(rendered, seps, lead, trail);
    });

/** Мусорные/произвольные строки для проверки format- и idempotence-инвариантов. */
const junkStringArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: fc.string({ maxLength: 25 }) },
  {
    weight: 3,
    arbitrary: fc
      .array(digitArb, { minLength: 0, maxLength: 18 })
      .map((xs) => xs.join("")),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      "",
      "   ",
      "abc",
      "+7",
      "8",
      "8-800",
      "123",
      "9161234567",       // 10 цифр (валиден)
      "89161234567",      // 8 + 10 (валиден)
      "+7 (916) 123-45-67", // +7 с разделителями (валиден)
      "7916123456",       // 10 цифр (валиден, начинается на 7)
      "123456789012",     // 12 цифр (невалиден)
      "5551234567",       // 10 цифр
      "+1 202 555 0100",  // не РФ по длине (11 цифр, не начинается с 7 после нормализации)
    ),
  },
);

// ─── Property 1a — формат канонического результата ────────────────────────────

describe("normalizeRuPhone — P1a: не-null результат каноничен (+7 и 11 цифр)", () => {
  // Feature: community-phone-registration, Property 1: нормализация телефона
  // канонична и идемпотентна.
  // Validates: Requirements 1.5, 2.1, 3.3

  it("любой не-null результат матчит ^\\+7\\d{10}$ для ЛЮБОЙ строки", () => {
    fc.assert(
      fc.property(junkStringArb, (raw) => {
        const result = normalizeRuPhone(raw);
        if (result !== null) {
          assert.ok(
            CANONICAL_RE.test(result),
            `normalizeRuPhone(${JSON.stringify(raw)}) = ${JSON.stringify(result)} должен матчить ${CANONICAL_RE}`,
          );
          // Явная проверка «ровно 11 цифр с кодом страны 7».
          const digits = result.replace(/\D+/g, "");
          assert.equal(digits.length, 11, "ровно 11 цифр в каноническом виде");
          assert.ok(digits.startsWith("7"), "код страны 7");
        }
      }),
      { numRuns: 500 },
    );
  });

  it("для любого валидного представления результат каноничен", () => {
    fc.assert(
      fc.property(
        national10Arb.chain((n) => representationArb(n)),
        (repr) => {
          const result = normalizeRuPhone(repr);
          assert.notEqual(result, null, `представление ${JSON.stringify(repr)} должно нормализоваться`);
          assert.ok(CANONICAL_RE.test(result!), `${JSON.stringify(result)} должен матчить ${CANONICAL_RE}`);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ─── Property 1b — идемпотентность ────────────────────────────────────────────

describe("normalizeRuPhone — P1b: идемпотентность на не-null результате", () => {
  // Feature: community-phone-registration, Property 1: нормализация телефона
  // канонична и идемпотентна.
  // Validates: Requirements 1.5, 2.1, 3.3

  it("normalizeRuPhone(normalizeRuPhone(x)) === normalizeRuPhone(x) для ЛЮБОЙ строки", () => {
    fc.assert(
      fc.property(junkStringArb, (raw) => {
        const once = normalizeRuPhone(raw);
        if (once !== null) {
          const twice = normalizeRuPhone(once);
          assert.equal(
            twice,
            once,
            `идемпотентность нарушена: once=${JSON.stringify(once)} twice=${JSON.stringify(twice)}`,
          );
        }
      }),
      { numRuns: 500 },
    );
  });

  it("идемпотентность на валидных представлениях номера", () => {
    fc.assert(
      fc.property(
        national10Arb.chain((n) => representationArb(n)),
        (repr) => {
          const once = normalizeRuPhone(repr);
          assert.notEqual(once, null);
          assert.equal(normalizeRuPhone(once!), once);
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ─── Property 1c — каноничность: эквивалентные представления → один ключ ───────

describe("normalizeRuPhone — P1c: эквивалентные представления дают один ключ", () => {
  // Feature: community-phone-registration, Property 1: нормализация телефона
  // канонична и идемпотентна.
  // Validates: Requirements 1.5, 2.1, 3.3

  it("10-цифр / 8+10 / 7+10 / +7+10 с любыми разделителями → +7 + national10", () => {
    fc.assert(
      fc.property(
        national10Arb.chain((national10) =>
          fc.record({
            national10: fc.constant(national10),
            reprA: representationArb(national10),
            reprB: representationArb(national10),
          }),
        ),
        ({ national10, reprA, reprB }) => {
          const expected = "+7" + national10;
          const a = normalizeRuPhone(reprA);
          const b = normalizeRuPhone(reprB);

          assert.equal(
            a,
            expected,
            `normalizeRuPhone(${JSON.stringify(reprA)}) = ${JSON.stringify(a)}, ожидался ${expected}`,
          );
          assert.equal(
            b,
            expected,
            `normalizeRuPhone(${JSON.stringify(reprB)}) = ${JSON.stringify(b)}, ожидался ${expected}`,
          );
          // Прямое утверждение о равенстве канонических ключей двух эквивалентов.
          assert.equal(a, b, "два представления одного номера дают один канонический ключ");
        },
      ),
      { numRuns: 500 },
    );
  });

  it("все четыре формы одного номера одновременно совпадают", () => {
    fc.assert(
      fc.property(national10Arb, (national10) => {
        const expected = "+7" + national10;
        const forms: PhoneForm[] = ["ten", "eight", "seven", "plus7"];
        const keys = forms.map((f) => normalizeRuPhone(renderForm(national10, f)));
        for (let i = 0; i < forms.length; i++) {
          assert.equal(
            keys[i],
            expected,
            `форма ${forms[i]} → ${JSON.stringify(keys[i])}, ожидался ${expected}`,
          );
        }
      }),
      { numRuns: 300 },
    );
  });
});
