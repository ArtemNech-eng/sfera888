/**
 * Property test for pure Local_Feed topic input validation (Task 4.3).
 *
 * Property 5: тема Local_Feed с заголовком длиной 0 или > 200, либо телом
 *             > 5000 символов, либо без валидной категории — ВСЕГДА
 *             отклоняется, а введённые данные сохраняются (не мутируются);
 *             тема в допустимых границах (категория из перечня, заголовок
 *             1..200, тело ≤ 5000) — ВСЕГДА принимается.
 *
 * **Validates: Requirements 3.4 (Property 5)**
 *
 * Module under test (`src/lib/feedService.ts`):
 *   - `validateTopicInput(input): { ok, violations }` — чистая детерминированная
 *     проверка без обращения к БД.
 *   - `LOCAL_FEED_CATEGORIES` — перечень допустимых категорий (Requirement 3.1).
 *   - `TITLE_MIN_LEN = 1`, `TITLE_MAX_LEN = 200`, `BODY_MAX_LEN = 5000`.
 *
 * Задача 4.3 требует тестировать именно ЧИСТУЮ функцию `validateTopicInput` без
 * БД, зеркаля существующие community property-тесты. Часть Requirement 3.4 «ввод
 * сохраняется» проверяется на уровне чистой функции как отсутствие мутации
 * входного объекта (persistence в `community_thread_drafts` покрывается через
 * `createLocalTopic` в задаче 4.2/4.4, здесь БД не задействуется).
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/topic-validation.property.test.ts
 */

// `feedService.ts` статически импортирует `@workspace/db`, который бросает на
// этапе загрузки модуля, если `DATABASE_URL` не задан. `validateTopicInput` —
// чистая функция и не выполняет запросов, поэтому фиктивной строки достаточно.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки `@workspace/db`.
const feedService = await import("../../src/lib/feedService.js");
const {
  validateTopicInput,
  LOCAL_FEED_CATEGORIES,
  TITLE_MIN_LEN,
  TITLE_MAX_LEN,
  BODY_MAX_LEN,
} = feedService;

// ─── Arbitraries ──────────────────────────────────────────────────────────

/** Любая допустимая категория из перечня Local_Feed (Requirement 3.1). */
const validCategoryArb = fc.constantFrom(...LOCAL_FEED_CATEGORIES);

/**
 * Недопустимая категория: произвольная строка вне перечня, либо `null` /
 * `undefined`, либо не-строковое значение. Всё это должно давать
 * `invalid_category`.
 */
const invalidCategoryArb = fc.oneof(
  fc
    .string({ maxLength: 40 })
    .filter((s) => !(LOCAL_FEED_CATEGORIES as readonly string[]).includes(s)),
  fc.constantFrom("", " ", "spam_offer", "UTILITY_INCIDENT", "categories"),
  fc.constant(null),
  fc.constant(undefined),
);

/**
 * Заголовок ДОПУСТИМОЙ значимой длины после trim ∈ [1, 200]. Строится из
 * непробельных символов, чтобы `trim()` не менял длину, с опциональной
 * окружающей пробельной «обёрткой» (значимая длина от неё не зависит).
 */
const validTitleArb = fc
  .integer({ min: TITLE_MIN_LEN, max: TITLE_MAX_LEN })
  .chain((coreLen) =>
    fc.record({
      core: fc
        .array(fc.constantFrom("a", "б", "1", "X", ".", "!", "-"), {
          minLength: coreLen,
          maxLength: coreLen,
        })
        .map((xs) => xs.join("")),
      lead: fc.constantFrom("", " ", "  ", "\t", "\n "),
      trail: fc.constantFrom("", " ", "  ", "\t", " \n"),
    }),
  )
  .map(({ lead, core, trail }) => `${lead}${core}${trail}`);

/**
 * Заголовок НЕДОПУСТИМОЙ значимой длины: пустой / из одних пробелов (значимая
 * длина 0) либо строго длиннее 200 после trim. Должен давать `invalid_title`.
 */
const invalidTitleArb = fc.oneof(
  // Значимая длина 0: пусто или только пробелы.
  fc.constantFrom("", " ", "   ", "\t", "\n", "  \t \n "),
  // Значимая длина > 200 (непробельное ядро).
  fc
    .integer({ min: TITLE_MAX_LEN + 1, max: TITLE_MAX_LEN + 400 })
    .map((n) => "x".repeat(n)),
  // Не-строковые значения также недопустимы.
  fc.constant(null),
  fc.constant(undefined),
);

/** Тело ДОПУСТИМОЙ длины ∈ [0, 5000] (нижней границы нет). */
const validBodyArb = fc
  .integer({ min: 0, max: BODY_MAX_LEN })
  .map((n) => "y".repeat(n));

/** Тело НЕДОПУСТИМОЙ длины: строго > 5000. Должно давать `invalid_body`. */
const invalidBodyArb = fc
  .integer({ min: BODY_MAX_LEN + 1, max: BODY_MAX_LEN + 500 })
  .map((n) => "y".repeat(n));

// ─── Property 5.1 — валидный ввод в границах ВСЕГДА принимается ──────────────

describe("validateTopicInput — Property 5.1: ввод в границах всегда принимается", () => {
  // Validates: Requirements 3.4 (Property 5)

  it("категория ∈ перечень, заголовок 1..200, тело ≤ 5000 → ok=true, без нарушений", () => {
    fc.assert(
      fc.property(validCategoryArb, validTitleArb, validBodyArb, (category, title, body) => {
        const result = validateTopicInput({ category, title, body });
        assert.equal(
          result.ok,
          true,
          `ожидалось принятие для ${JSON.stringify({ category, titleLen: title.trim().length, bodyLen: body.length })}`,
        );
        assert.deepEqual(result.violations, []);
      }),
      { numRuns: 500 },
    );
  });
});

// ─── Property 5.2 — любой выход за границы ВСЕГДА отклоняется ────────────────

describe("validateTopicInput — Property 5.2: выход за границы всегда отклоняется", () => {
  // Validates: Requirements 3.4 (Property 5)

  it("недопустимая категория → ok=false и invalid_category (при валидных прочих)", () => {
    fc.assert(
      fc.property(invalidCategoryArb, validTitleArb, validBodyArb, (category, title, body) => {
        const result = validateTopicInput({ category: category as string, title, body });
        assert.equal(result.ok, false);
        assert.ok(
          result.violations.includes("invalid_category"),
          `ожидалось invalid_category для категории ${JSON.stringify(category)}`,
        );
      }),
      { numRuns: 400 },
    );
  });

  it("заголовок вне 1..200 → ok=false и invalid_title (при валидных прочих)", () => {
    fc.assert(
      fc.property(validCategoryArb, invalidTitleArb, validBodyArb, (category, title, body) => {
        const result = validateTopicInput({ category, title: title as string, body });
        assert.equal(result.ok, false);
        assert.ok(
          result.violations.includes("invalid_title"),
          `ожидалось invalid_title для заголовка ${JSON.stringify(title)}`,
        );
      }),
      { numRuns: 400 },
    );
  });

  it("тело > 5000 → ok=false и invalid_body (при валидных прочих)", () => {
    fc.assert(
      fc.property(validCategoryArb, validTitleArb, invalidBodyArb, (category, title, body) => {
        const result = validateTopicInput({ category, title, body });
        assert.equal(result.ok, false);
        assert.ok(
          result.violations.includes("invalid_body"),
          `ожидалось invalid_body для тела длиной ${body.length}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("любая комбинация с хотя бы одним нарушением → ok=false", () => {
    // Хотя бы одно поле недопустимо; остальные — произвольны (валидны или нет).
    const anyCategory = fc.oneof(validCategoryArb, invalidCategoryArb);
    const anyTitle = fc.oneof(validTitleArb, invalidTitleArb);
    const anyBody = fc.oneof(validBodyArb, invalidBodyArb);

    fc.assert(
      fc.property(
        fc.record({
          category: anyCategory,
          title: anyTitle,
          body: anyBody,
          // Гарантируем минимум одно нарушение, выбирая, какое поле «сломать».
          brokenField: fc.constantFrom("category", "title", "body"),
        }),
        ({ category, title, body, brokenField }) => {
          const input: Record<string, unknown> = { category, title, body };
          if (brokenField === "category") input.category = "definitely_not_a_category";
          if (brokenField === "title") input.title = "x".repeat(TITLE_MAX_LEN + 1);
          if (brokenField === "body") input.body = "y".repeat(BODY_MAX_LEN + 1);

          const result = validateTopicInput(input);
          assert.equal(result.ok, false, `ожидалось отклонение при сломанном поле ${brokenField}`);
          assert.ok(result.violations.length >= 1);
        },
      ),
      { numRuns: 400 },
    );
  });
});

// ─── Property 5.3 — введённые данные сохраняются (вход не мутируется) ────────

describe("validateTopicInput — Property 5.3: введённые данные сохраняются", () => {
  // Validates: Requirements 3.4 (Property 5)
  //
  // Requirement 3.4: при отклонении публикации введённые данные сохраняются,
  // чтобы ввод пользователя не был потерян. На уровне чистой функции это
  // означает: `validateTopicInput` НЕ мутирует переданный объект — исходные
  // значения остаются доступными вызывающему для сохранения в черновик.

  it("не мутирует входной объект ни при отклонении, ни при принятии", () => {
    const anyCategory = fc.oneof(validCategoryArb, invalidCategoryArb);
    const anyTitle = fc.oneof(validTitleArb, invalidTitleArb);
    const anyBody = fc.oneof(validBodyArb, invalidBodyArb);

    fc.assert(
      fc.property(anyCategory, anyTitle, anyBody, (category, title, body) => {
        const input = { category, title, body } as {
          category: unknown;
          title: unknown;
          body: unknown;
        };
        const snapshot = { category: input.category, title: input.title, body: input.body };

        validateTopicInput(input as never);

        assert.equal(input.category, snapshot.category, "категория не должна меняться");
        assert.equal(input.title, snapshot.title, "заголовок не должен меняться");
        assert.equal(input.body, snapshot.body, "тело не должно меняться");
      }),
      { numRuns: 400 },
    );
  });
});

// ─── Boundary examples — явные граничные значения (0/1/200/201, 5000/5001) ───

describe("validateTopicInput — граничные значения (Property 5 edge cases)", () => {
  // Validates: Requirements 3.4 (Property 5)

  const validCategory = LOCAL_FEED_CATEGORIES[0];

  it("заголовок длиной 0 → отклонён", () => {
    assert.equal(validateTopicInput({ category: validCategory, title: "", body: "b" }).ok, false);
  });

  it("заголовок длиной 1 → принят", () => {
    assert.equal(validateTopicInput({ category: validCategory, title: "A", body: "b" }).ok, true);
  });

  it("заголовок длиной 200 → принят", () => {
    assert.equal(
      validateTopicInput({ category: validCategory, title: "x".repeat(200), body: "b" }).ok,
      true,
    );
  });

  it("заголовок длиной 201 → отклонён", () => {
    assert.equal(
      validateTopicInput({ category: validCategory, title: "x".repeat(201), body: "b" }).ok,
      false,
    );
  });

  it("тело длиной 5000 → принято", () => {
    assert.equal(
      validateTopicInput({ category: validCategory, title: "A", body: "y".repeat(5000) }).ok,
      true,
    );
  });

  it("тело длиной 5001 → отклонено", () => {
    assert.equal(
      validateTopicInput({ category: validCategory, title: "A", body: "y".repeat(5001) }).ok,
      false,
    );
  });

  it("валидная категория → принята; невалидная → отклонена", () => {
    assert.equal(validateTopicInput({ category: validCategory, title: "A", body: "b" }).ok, true);
    assert.equal(validateTopicInput({ category: "nope", title: "A", body: "b" }).ok, false);
  });
});
