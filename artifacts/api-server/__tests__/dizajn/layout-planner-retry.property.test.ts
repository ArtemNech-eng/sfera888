/**
 * Property test для retry-цикла Layout_Planner.
 *
 * Spec:
 *   - .kiro/specs/ai-design-product/tasks.md → task 6.2
 *   - .kiro/specs/ai-design-product/design.md → Property 9
 *
 * Property 9: Layout_Planner retries at most twice on validation failure
 * **Validates: Requirements 2.7, 2.8, 6.5**
 *
 * Инварианты для `generateLayoutJson` из
 * `artifacts/api-server/src/lib/layoutPlanner.ts`:
 *
 *   9.1 Retry cap: при постоянно невалидном ответе AI клиент дёргается
 *       ровно `MAX_SCHEMA_RETRIES + 1 = 3` раза, после чего бросается
 *       `LayoutGenerationError` (Requirement 6.5, 2.8).
 *
 *   9.2 Success on attempt N (N ∈ {1..MAX_SCHEMA_RETRIES + 1}):
 *       если N-й ответ валиден, делается ровно N вызовов клиента и
 *       возвращается распарсенный Layout_JSON (Requirement 6.5, 2.7).
 *
 *   9.3 Failure surfaces as LayoutGenerationError: после исчерпания
 *       повторов throw — это `instanceof LayoutGenerationError` и
 *       `error.cause !== undefined` (Requirement 2.8, 6.5).
 *
 *   9.4 `previousViolations` propagation: при непустом
 *       `previousViolations` пользовательский prompt
 *       (`__test__.buildUserPrompt`) содержит каждый `detailRu`
 *       и каждый `code` нарушения verbatim (Requirement 2.7).
 *
 * Mock-стратегия: `__test__.setOpenAIClient(...)` подменяет lazy
 * singleton клиента. Реальные вызовы к OpenAI/OpenRouter не делаются.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import fc from "fast-check";

import {
  generateLayoutJson,
  LayoutGenerationError,
  __test__,
} from "../../src/lib/layoutPlanner.js";

const { MAX_SCHEMA_RETRIES, buildUserPrompt, setOpenAIClient } = __test__;

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Валидный Layout_JSON в виде строки — достаточно для prop 9.2 (успех на
 * N-й попытке). Простая bedroom-планировка с одной кроватью, проходящая
 * `parseLayout`.
 */
const VALID_LAYOUT_JSON_STRING = JSON.stringify({
  room: { roomType: "bedroom", widthCm: 400, lengthCm: 350, heightCm: 270 },
  door: { wall: "south", offsetCm: 100, widthCm: 80 },
  window: { wall: "north", offsetCm: 150, widthCm: 120 },
  furniture: [
    {
      id: "bed_main",
      type: "bed",
      widthCm: 160,
      depthCm: 200,
      heightCm: 50,
      xCm: 100,
      yCm: 80,
      rotationDeg: 0,
    },
  ],
});

/** Базовый input для `generateLayoutJson` — общая часть всех тестов. */
const BASE_INPUT = {
  roomType: "bedroom",
  widthCm: 400,
  lengthCm: 350,
  heightCm: 270,
  style: "modern",
  budget: 500_000,
} as const;

/**
 * Категории «невалидных» ответов. Каждая категория провоцирует ту или
 * иную ветку retry-кода в `generateOnce`:
 *   • `not json` — JSON.parse падает → cause = SyntaxError;
 *   • `{` — обрезанный JSON, тоже SyntaxError;
 *   • `{"foo": 1}` — валидный JSON, но `parseLayout` возвращает null
 *     (отсутствуют обязательные поля) → cause = `{ reason: "schema_mismatch" }`;
 *   • `{"room": {}}` — частичная корректность, тот же mismatch.
 * Все эти случаи выставляют `cause`, поэтому попадают в retry-цикл
 * (см. условие `err.cause !== undefined` в `generateLayoutJson`).
 */
const INVALID_RESPONSE = fc.constantFrom(
  "not json",
  "{",
  '{"foo":1}',
  '{"room":{}}',
  '{"room":{"roomType":"bedroom"}}',
);

// ─── Fake OpenAI client ──────────────────────────────────────────────────────

interface FakeClient {
  /** Объект, совместимый по форме с `client().chat.completions.create`. */
  client: unknown;
  /** Сколько раз был вызван `create`. */
  callCount: () => number;
}

/**
 * Конструирует фейковый OpenAI client, чьи `chat.completions.create`
 * последовательно возвращают строки из `responses`. После исчерпания
 * массива возвращается последний элемент — это нужно, чтобы поймать
 * чрезмерный retry: если реализация вызовет `create` больше, чем
 * предполагалось, `callCount` это зафиксирует и assert упадёт.
 */
function makeFakeClient(responses: string[]): FakeClient {
  let count = 0;
  const create = async (_args: unknown): Promise<unknown> => {
    const idx = count;
    count += 1;
    const content =
      responses[idx] ?? responses[responses.length - 1] ?? "not json";
    return { choices: [{ message: { content } }] };
  };
  return {
    client: { chat: { completions: { create } } },
    callCount: () => count,
  };
}

// ─── Property 9.1: retry cap ─────────────────────────────────────────────────

test("Property 9.1: при постоянно невалидном JSON клиент дёргается ровно MAX_SCHEMA_RETRIES + 1 раз", async () => {
  await fc.assert(
    fc.asyncProperty(INVALID_RESPONSE, async (badResponse) => {
      // Заполняем массив с запасом на случай over-retry — assert на
      // callCount поймает любое отклонение от MAX_SCHEMA_RETRIES + 1.
      const fake = makeFakeClient([
        badResponse,
        badResponse,
        badResponse,
        badResponse,
        badResponse,
      ]);
      setOpenAIClient(fake.client);
      try {
        await assert.rejects(
          generateLayoutJson(BASE_INPUT),
          (err: unknown) => err instanceof LayoutGenerationError,
          "должен throw LayoutGenerationError после исчерпания повторов",
        );
        assert.equal(
          fake.callCount(),
          MAX_SCHEMA_RETRIES + 1,
          `expected ${MAX_SCHEMA_RETRIES + 1} attempts, got ${fake.callCount()}`,
        );
      } finally {
        setOpenAIClient(null);
      }
    }),
    { numRuns: 10 },
  );
});

// ─── Property 9.2: success on attempt N ──────────────────────────────────────

test("Property 9.2: успех на N-й попытке → ровно N вызовов и распарсенный Layout_JSON", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: MAX_SCHEMA_RETRIES + 1 }),
      INVALID_RESPONSE,
      async (successAttempt, badResponse) => {
        const responses: string[] = [];
        for (let i = 1; i < successAttempt; i += 1) {
          responses.push(badResponse);
        }
        responses.push(VALID_LAYOUT_JSON_STRING);

        const fake = makeFakeClient(responses);
        setOpenAIClient(fake.client);
        try {
          const layout = await generateLayoutJson(BASE_INPUT);
          assert.equal(
            fake.callCount(),
            successAttempt,
            `expected ${successAttempt} attempts before success, got ${fake.callCount()}`,
          );
          // Sanity-проверка распарсенного payload'а.
          assert.equal(layout.room.roomType, "bedroom");
          assert.equal(layout.furniture.length, 1);
          assert.equal(layout.furniture[0]!.id, "bed_main");
          assert.equal(layout.furniture[0]!.type, "bed");
        } finally {
          setOpenAIClient(null);
        }
      },
    ),
    { numRuns: 10 },
  );
});

// ─── Property 9.3: failure surfaces as LayoutGenerationError with cause ─────

test("Property 9.3: после исчерпания повторов throws LayoutGenerationError с непустым cause", async () => {
  const fake = makeFakeClient(["not json", "not json", "not json"]);
  setOpenAIClient(fake.client);
  try {
    let captured: unknown = undefined;
    try {
      await generateLayoutJson(BASE_INPUT);
      assert.fail("должен был бросить LayoutGenerationError");
    } catch (err) {
      captured = err;
    }
    assert.ok(
      captured instanceof LayoutGenerationError,
      "throw must be instance of LayoutGenerationError",
    );
    assert.notEqual(
      (captured as LayoutGenerationError).cause,
      undefined,
      "cause must be defined (last schema/parse error)",
    );
  } finally {
    setOpenAIClient(null);
  }
});

// ─── Property 9.4: previousViolations propagation ────────────────────────────

const VIOLATION_CODES = [
  "OUT_OF_ROOM",
  "INTERSECTS",
  "BLOCKS_DOOR",
  "PATH_TOO_NARROW",
  "NO_PATH_TO_FUNCTIONAL_ITEM",
] as const;

test("Property 9.4: previousViolations.detailRu и code попадают в user prompt verbatim", () => {
  const violationGen = fc.record({
    code: fc.constantFrom(...VIOLATION_CODES),
    itemIds: fc.array(
      fc.string({ minLength: 1, maxLength: 8 }),
      { maxLength: 3 },
    ),
    // Без переводов строк, чтобы тривиальный includes() не путался с
    // искусственными разрывами; сами prompt-строки строятся через
    // массив + join("\n"), так что vetbatim-вхождение гарантировано.
    detailRu: fc
      .string({ minLength: 1, maxLength: 80 })
      .filter((s) => !s.includes("\n") && !s.includes("\r")),
  });

  fc.assert(
    fc.property(
      fc.array(violationGen, { minLength: 1, maxLength: 5 }),
      (violations) => {
        const prompt = buildUserPrompt({
          ...BASE_INPUT,
          previousViolations: violations,
        });
        for (const v of violations) {
          assert.ok(
            prompt.includes(v.detailRu),
            `prompt missing detailRu="${v.detailRu}"`,
          );
          assert.ok(
            prompt.includes(`[${v.code}]`),
            `prompt missing code marker [${v.code}]`,
          );
        }
        // И negative-control: без previousViolations промпт не упоминает
        // «ВАЖНО»-блок повторной попытки.
        const promptWithoutViolations = buildUserPrompt(BASE_INPUT);
        assert.equal(
          promptWithoutViolations.includes("предыдущая попытка"),
          false,
          "без previousViolations не должно быть retry-блока",
        );
      },
    ),
    { numRuns: 100 },
  );
});
