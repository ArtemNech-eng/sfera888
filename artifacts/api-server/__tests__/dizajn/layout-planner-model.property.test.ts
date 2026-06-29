/**
 * Property 6: Bug Condition — Надёжная модель Layout_Planner (read-fresh).
 *
 * **Validates: Requirements 1.6, 2.6**
 *
 * Источник bug condition: `isBugConditionB(genState).weak_model`
 *   weak_model := NOT isReliableStructuredModel(genState.designModel)
 *   (design.md §Bug Condition B6, §Hypothesized Root Cause 4)
 *
 * Expected Behavior (Property 6, design.md §Correctness Properties):
 *   _For any_ генерации `Layout_JSON`, `Layout_Planner` SHALL читать модель из
 *   `AI_INTEGRATIONS_DESIGN_MODEL` НА МОМЕНТ ВЫЗОВА (read-fresh) с НАДЁЖНЫМ
 *   дефолтом, поддерживающим JSON-schema structured output, так что на
 *   корректных входах план стабильно проходит схему и `Geometric_Validator`
 *   без скатывания в `failed`.
 *
 * ─── Methodology (bugfix exploration test) ─────────────────────────────────
 * Этот тест — Bug Condition exploration. Он кодирует ОЖИДАЕМЫЙ инвариант
 * Property 6 и ДОЛЖЕН ПАДАТЬ на неисправленном коде, тем самым подтверждая
 * дефект 1.6. Чинить тест/код на этом шаге нельзя.
 *
 * Неисправленный `layoutPlanner.ts` читает модель ОДИН РАЗ на module-load:
 *
 *     const model =
 *       process.env["AI_INTEGRATIONS_DESIGN_MODEL"]
 *       ?? process.env["AI_INTEGRATIONS_OPENAI_MODEL"]
 *       ?? "claude-opus-4-7";
 *
 * Две беды этого выражения:
 *   B6.1 (ненадёжный дефолт): когда env не задан, выбирается `claude-opus-4-7`
 *        — модель, не держащая JSON-schema structured output надёжно →
 *        `parseLayout` отбраковывает ответы → ≤2 повтора исчерпаны → `failed`.
 *   B6.2 (нет read-fresh): значение зафиксировано на module-load, поэтому смена
 *        `AI_INTEGRATIONS_DESIGN_MODEL` в рантайме НЕ влияет на выбор без
 *        рестарта очереди генерации.
 *
 * Фикс (задача 11.4) добавит в `designConfig.ts` чистый хелпер
 *   `export function getDesignModel(): string`
 * по образцу `getEditImageProvider()`: read-fresh из
 * `AI_INTEGRATIONS_DESIGN_MODEL` → fallback `AI_INTEGRATIONS_OPENAI_MODEL` →
 * НАДЁЖНЫЙ дефолт; пустые/мусорные значения → дефолт. `layoutPlanner.ts`
 * заменит module-load `const model` на вызов `getDesignModel()` внутри
 * `generateOnce`.
 *
 * До фикса экспорта `getDesignModel` ещё нет, поэтому тест аккуратно
 * деградирует к ТОЧНОЙ реплике текущей неисправленной module-load резолюции
 * (снимок env, снятый ОДИН РАЗ при загрузке тест-модуля, + ненадёжный дефолт
 * `claude-opus-4-7`). После фикса тот же тест импортирует реальный
 * `getDesignModel` и должен ПРОЙТИ (задача 12.1 — перепрогон без новых тестов).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ─── Bridge to the (future) read-fresh helper ────────────────────────────────
//
// Fix task 11.4 will add to artifacts/api-server/src/lib/designConfig.ts:
//   export function getDesignModel(): string
//
// designConfig.js already exists and imports cleanly, but `getDesignModel`
// is not yet exported — until the fix lands `mod.getDesignModel` is undefined
// and we fall back to a faithful replica of the current unfixed resolution.
type GetDesignModelFn = () => string;

let getDesignModel: GetDesignModelFn | undefined;
try {
  const mod = (await import("../../src/lib/designConfig.js")) as {
    getDesignModel?: GetDesignModelFn;
  };
  getDesignModel = mod.getDesignModel;
} catch {
  getDesignModel = undefined;
}

// ─── Faithful replica of the unfixed module-load resolution ──────────────────
//
// `layoutPlanner.ts` computes `const model = ...` exactly ONCE while the module
// is evaluated. We mirror that by capturing the env snapshot ONCE here, at
// test-module-load time. Later mutations of process.env have no effect on this
// value — precisely the read-fresh defect (B6.2).
const UNFIXED_DEFAULT_MODEL = "claude-opus-4-7";
const UNFIXED_MODULE_LOAD_MODEL: string =
  process.env["AI_INTEGRATIONS_DESIGN_MODEL"] ??
  process.env["AI_INTEGRATIONS_OPENAI_MODEL"] ??
  UNFIXED_DEFAULT_MODEL;

/**
 * Resolve the Layout_Planner model.
 *   - Fixed code: delegates to the real read-fresh `getDesignModel()`.
 *   - Unfixed fallback: returns the stale module-load snapshot (ignores any
 *     runtime env change) with the unreliable `claude-opus-4-7` default.
 */
function resolveDesignModel(): string {
  return getDesignModel ? getDesignModel() : UNFIXED_MODULE_LOAD_MODEL;
}

// ─── Reliability predicate (isReliableStructuredModel) ───────────────────────
//
// Operationalises `isReliableStructuredModel` from isBugConditionB(B6).
// A reliable model is a non-empty identifier that is NOT one of the known
// weak/unstable defaults. `claude-opus-4-7` is the documented unreliable
// default (design.md §Hypothesized Root Cause 4): a fabricated/unstable model
// routed through the OpenAI json_schema path that does not hold structured
// outputs reliably.
const UNRELIABLE_MODELS: ReadonlySet<string> = new Set<string>([
  "claude-opus-4-7",
]);

function isReliableStructuredModel(model: string): boolean {
  return (
    typeof model === "string" &&
    model.trim().length > 0 &&
    !UNRELIABLE_MODELS.has(model.trim())
  );
}

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Plausible reliable structured-output model identifiers an operator could
 * set in `AI_INTEGRATIONS_DESIGN_MODEL`. All are non-empty and distinct from
 * the unreliable default, so read-fresh resolution must return them verbatim.
 */
const RELIABLE_MODEL = fc.constantFrom(
  "gpt-4o-2024-08-06",
  "gpt-4o-mini-2024-07-18",
  "gpt-4.1-2025-04-14",
  "openai/gpt-4o-2024-08-06",
  "gpt-4o",
);

// ─── Env save / restore ──────────────────────────────────────────────────────

const DESIGN_KEY = "AI_INTEGRATIONS_DESIGN_MODEL";
const OPENAI_KEY = "AI_INTEGRATIONS_OPENAI_MODEL";

let savedDesign: string | undefined;
let savedOpenai: string | undefined;

beforeEach(() => {
  savedDesign = process.env[DESIGN_KEY];
  savedOpenai = process.env[OPENAI_KEY];
  delete process.env[DESIGN_KEY];
  delete process.env[OPENAI_KEY];
});

afterEach(() => {
  if (savedDesign === undefined) delete process.env[DESIGN_KEY];
  else process.env[DESIGN_KEY] = savedDesign;
  if (savedOpenai === undefined) delete process.env[OPENAI_KEY];
  else process.env[OPENAI_KEY] = savedOpenai;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Layout_Planner Property 6 (Bug Condition): надёжная read-fresh модель", () => {
  // ---------------------------------------------------------------------------
  // Property 6 (B6.1 — надёжный дефолт): когда env не задан, выбранная модель
  // SHALL быть надёжной (поддерживающей json_schema structured output), т.е.
  // NOT weak_model.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — дефолт `claude-opus-4-7`
  // классифицируется как ненадёжный (weak_model == true).
  // Validates: Requirements 1.6, 2.6
  // ---------------------------------------------------------------------------
  it("дефолт (env не задан) — надёжная structured-модель, не claude-opus-4-7", () => {
    // env очищен в beforeEach.
    const model = resolveDesignModel();
    assert.ok(
      isReliableStructuredModel(model),
      `Дефолтная модель Layout_Planner "${model}" ненадёжна (weak_model). ` +
        `Ожидается надёжный дефолт с поддержкой json_schema structured output, ` +
        `а не "${UNFIXED_DEFAULT_MODEL}".`,
    );
  });

  // ---------------------------------------------------------------------------
  // Property 6 (B6.2 — read-fresh): для любого надёжного значения, заданного в
  // AI_INTEGRATIONS_DESIGN_MODEL НА МОМЕНТ ВЫЗОВА, резолвер SHALL вернуть именно
  // это значение (read-fresh), а не зафиксированный на module-load снимок.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — module-load снимок
  // (`claude-opus-4-7`) не меняется при смене env в рантайме.
  // Validates: Requirements 1.6, 2.6
  // ---------------------------------------------------------------------------
  it("read-fresh: AI_INTEGRATIONS_DESIGN_MODEL, заданный на момент вызова, выбирается дословно", () => {
    fc.assert(
      fc.property(RELIABLE_MODEL, (chosen) => {
        process.env[DESIGN_KEY] = chosen;
        const model = resolveDesignModel();
        assert.equal(
          model,
          chosen,
          `AI_INTEGRATIONS_DESIGN_MODEL="${chosen}" задан на момент вызова, ` +
            `но резолвер вернул "${model}" (module-load снимок). ` +
            `Ожидается read-fresh выбор "${chosen}".`,
        );
        // И выбранная операторная модель обязана быть надёжной (NOT weak_model).
        assert.ok(
          isReliableStructuredModel(model),
          `Выбранная модель "${model}" не прошла проверку надёжности.`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // read-fresh: fallback на AI_INTEGRATIONS_OPENAI_MODEL, когда DESIGN_MODEL
  // не задан, тоже должен читаться на момент вызова.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL (module-load снимок).
  // Validates: Requirements 1.6, 2.6
  // ---------------------------------------------------------------------------
  it("read-fresh: fallback на AI_INTEGRATIONS_OPENAI_MODEL читается на момент вызова", () => {
    fc.assert(
      fc.property(RELIABLE_MODEL, (chosen) => {
        // DESIGN_MODEL не задан → действует OPENAI_MODEL.
        process.env[OPENAI_KEY] = chosen;
        const model = resolveDesignModel();
        assert.equal(
          model,
          chosen,
          `AI_INTEGRATIONS_OPENAI_MODEL="${chosen}" задан на момент вызова, ` +
            `но резолвер вернул "${model}". Ожидается read-fresh fallback "${chosen}".`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Документированный контрпример (design.md §Examples, Группа B):
  // «смена env не влияет без рестарта». Имитируем deploy с одной моделью, затем
  // рантайм-смену env на другую — read-fresh резолвер обязан подхватить новую.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — возвращается «старая»
  // (module-load) модель, рантайм-смена игнорируется.
  // Validates: Requirements 1.6, 2.6
  // ---------------------------------------------------------------------------
  it("смена AI_INTEGRATIONS_DESIGN_MODEL в рантайме влияет на выбор без рестарта", () => {
    // «Старое» значение, действовавшее на момент деплоя/загрузки.
    process.env[DESIGN_KEY] = "gpt-4o-2024-08-06";
    const before = resolveDesignModel();

    // Оператор меняет модель в рантайме (hot patch без рестарта очереди).
    const next = "gpt-4.1-2025-04-14";
    process.env[DESIGN_KEY] = next;
    const after = resolveDesignModel();

    assert.equal(
      after,
      next,
      `После смены AI_INTEGRATIONS_DESIGN_MODEL на "${next}" резолвер вернул ` +
        `"${after}" (было "${before}"). Ожидается read-fresh: смена env влияет ` +
        `на выбор модели без рестарта.`,
    );
  });
});
