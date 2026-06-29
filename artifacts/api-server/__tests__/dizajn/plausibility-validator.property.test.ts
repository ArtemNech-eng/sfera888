/**
 * Property 7: Bug Condition — Функциональное правдоподобие плана.
 *
 * **Validates: Requirements 1.7, 2.7**
 *
 * Источник bug condition: `isBugConditionB(genState).implausible_layout`
 *   implausible_layout := genState.layout != null AND NOT isPlausible(layout)
 *   (design.md §Bug Condition B7, §Hypothesized Root Cause 5, §Examples Группа B)
 *
 * Expected Behavior (Property 7, design.md §Correctness Properties):
 *   _For any_ `Layout_JSON`, прошедшего схему и базовую геометрию,
 *   `Geometric_Validator` SHALL дополнительно проверить функциональное
 *   правдоподобие (наличие ключевой мебели по типу комнаты, реалистичные
 *   габариты, отсутствие «плавающей» мебели вне стен) и при нарушениях
 *   вернуть их в retry-подсказку (`ok:false` с кодами
 *   `MISSING_FUNCTIONAL_ITEM` / `UNREALISTIC_DIMENSIONS` / `FLOATING_FURNITURE`),
 *   не допуская построения коллаж-промпта из неубедительного плана.
 *
 * ─── Methodology (bugfix exploration test) ─────────────────────────────────
 * Этот тест — Bug Condition exploration. Он кодирует ОЖИДАЕМЫЙ инвариант
 * Property 7 и ДОЛЖЕН ПАДАТЬ на неисправленном коде, тем самым подтверждая
 * дефект 1.7. Чинить тест/код на этом шаге нельзя.
 *
 * Неисправленный `validateLayout` (geometricValidator.ts) проверяет только
 * вмещение (OUT_OF_ROOM), пересечения (INTERSECTS), блокировку двери
 * (BLOCKS_DOOR) и проход к функциональным предметам (PATH_TOO_NARROW /
 * NO_PATH_TO_FUNCTIONAL_ITEM). Функциональное ПРАВДОПОДОБИЕ он не проверяет:
 *   - комната без ключевой мебели (bedroom без `bed`) проходит;
 *   - кровать нереалистичных габаритов (40×40 см) проходит;
 *   - кровать, «плавающая» по центру вне стен, проходит.
 * Все три каноничных плана геометрически валидны, поэтому неисправленный
 * валидатор возвращает `ok:true` — отсюда EXPECTED OUTCOME: FAIL.
 *
 * Фикс (задача 11.5) добавит коды `MISSING_FUNCTIONAL_ITEM`,
 * `UNREALISTIC_DIMENSIONS`, `FLOATING_FURNITURE` в `ViolationCode` и чистую
 * функцию `validatePlausibility(room, furniture)`, вызываемую из
 * `validateLayout`. После фикса тот же тест должен ПРОЙТИ (задача 12.1 —
 * перепрогон без новых тестов).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  validateLayout,
  type FurnitureItem,
  type RoomDims,
  type ValidationResult,
  type ValidationViolation,
} from "../../src/lib/geometricValidator.js";

// ---------------------------------------------------------------------------
// Plausibility violation codes (added by fix task 11.5)
// ---------------------------------------------------------------------------
//
// До фикса этих кодов нет в `ViolationCode`. Сравниваем коды как простые
// строки, чтобы тест компилировался и до, и после расширения union-типа.
const PLAUSIBILITY_CODES: readonly string[] = [
  "MISSING_FUNCTIONAL_ITEM",
  "UNREALISTIC_DIMENSIONS",
  "FLOATING_FURNITURE",
];

function violationCodes(violations: ValidationViolation[]): string[] {
  return violations.map((v) => v.code as string);
}

/** Валидатор отклонил план по правдоподобию = ok:false и есть хоть один
 *  plausibility-код среди нарушений. */
function rejectedForImplausibility(result: ValidationResult): boolean {
  if (result.ok !== false) return false;
  const codes = violationCodes(result.violations);
  return codes.some((c) => PLAUSIBILITY_CODES.includes(c));
}

function hasCode(result: ValidationResult, code: string): boolean {
  return violationCodes(result.violations).includes(code);
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Просторная спальня 600×600×270 с дверью на южной стене (проём 90 см,
 * центр x = 315 см → зона очистки x∈[285,345], y∈[540,600]). Простор выбран
 * намеренно: каноничные неубедительные планы остаются ГЕОМЕТРИЧЕСКИ
 * ВАЛИДНЫМИ (вмещение/пересечения/дверь/проход), чтобы неисправленный
 * `validateLayout` возвращал `ok:true`, и дефект 1.7 проявлялся чисто на
 * правдоподобии, а не на геометрии.
 */
function bedroom(): RoomDims {
  return {
    widthCm: 600,
    lengthCm: 600,
    heightCm: 270,
    roomType: "bedroom",
    doorWall: "south",
    doorOffsetCm: 270,
    doorWidthCm: 90,
    windowWall: "north",
    windowOffsetCm: 200,
    windowWidthCm: 200,
  };
}

function makeItem(
  overrides: Partial<FurnitureItem> & { id: string },
): FurnitureItem {
  return {
    type: "rug",
    widthCm: 100,
    depthCm: 100,
    heightCm: 5,
    xCm: 0,
    yCm: 0,
    rotationDeg: 0,
    ...overrides,
  } as FurnitureItem;
}

/** Реалистичная, примыкающая к стене кровать в северо-западном углу. */
function realisticBedNW(): FurnitureItem {
  return makeItem({
    id: "bed",
    type: "bed",
    widthCm: 160,
    depthCm: 200,
    heightCm: 50,
    xCm: 0,
    yCm: 0,
  });
}

/** Реалистичный шкаф, примыкающий к восточной стене. */
function realisticWardrobeE(): FurnitureItem {
  return makeItem({
    id: "wardrobe",
    type: "wardrobe",
    widthCm: 60,
    depthCm: 120,
    heightCm: 220,
    xCm: 540,
    yCm: 40,
  });
}

// ---------------------------------------------------------------------------
// Property 7 — Bug Condition: validator must reject implausible layouts
// ---------------------------------------------------------------------------

describe("validateLayout — Property 7 (Bug Condition): функциональное правдоподобие", () => {
  // -------------------------------------------------------------------------
  // Sanity floor — каноничный ПРАВДОПОДОБНЫЙ план (кровать у стены реалистичных
  // габаритов + шкаф у стены). Он НЕ должен отклоняться по правдоподобию.
  // Это защищает свойство от тривиального прохождения против «всегда
  // отклоняющей» реализации и проходит как на неисправленном, так и на
  // исправленном коде.
  // Validates: Requirements 1.7, 2.7
  // -------------------------------------------------------------------------
  it("правдоподобный план (кровать+шкаф у стен) НЕ отклоняется по правдоподобию", () => {
    const room = bedroom();
    const result = validateLayout(room, [realisticBedNW(), realisticWardrobeE()]);
    const codes = violationCodes(result.violations);
    for (const c of PLAUSIBILITY_CODES) {
      assert.ok(
        !codes.includes(c),
        `неожиданный plausibility-код ${c} на правдоподобном плане: ${JSON.stringify(
          result.violations,
        )}`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // B7.1 — MISSING_FUNCTIONAL_ITEM: спальня без кровати.
  // План геометрически валиден (шкаф у стены + ковёр, проход свободен), но
  // лишён ключевого предмета `bed` для bedroom.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — validateLayout возвращает
  // ok:true (нет проверки наличия ключевой мебели).
  // Validates: Requirements 1.7, 2.7
  // -------------------------------------------------------------------------
  it("спальня без кровати отклоняется с MISSING_FUNCTIONAL_ITEM", () => {
    const room = bedroom();
    const result = validateLayout(room, [
      realisticWardrobeE(),
      makeItem({
        id: "rug",
        type: "rug",
        widthCm: 200,
        depthCm: 200,
        heightCm: 2,
        xCm: 200,
        yCm: 200,
      }),
    ]);

    assert.equal(
      result.ok,
      false,
      `ожидался ok:false для спальни без кровати, получено ok:true ` +
        `(контрпример: bedroom без bed принят как правдоподобный)`,
    );
    assert.ok(
      hasCode(result, "MISSING_FUNCTIONAL_ITEM"),
      `ожидался код MISSING_FUNCTIONAL_ITEM, получено ${JSON.stringify(
        violationCodes(result.violations),
      )}`,
    );
  });

  // -------------------------------------------------------------------------
  // B7.2 — UNREALISTIC_DIMENSIONS: кровать нереалистичных габаритов 40×40 см.
  // Геометрически валидна (внутри комнаты, у стены, проход свободен), но
  // 40×40 см — не кровать.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — validateLayout возвращает
  // ok:true (нет проверки реалистичности габаритов).
  // Validates: Requirements 1.7, 2.7
  // -------------------------------------------------------------------------
  it("кровать нереалистичных габаритов (40×40) отклоняется с UNREALISTIC_DIMENSIONS", () => {
    const room = bedroom();
    const result = validateLayout(room, [
      makeItem({
        id: "bed",
        type: "bed",
        widthCm: 40,
        depthCm: 40,
        heightCm: 50,
        xCm: 0,
        yCm: 0,
      }),
      realisticWardrobeE(),
    ]);

    assert.equal(
      result.ok,
      false,
      `ожидался ok:false для кровати 40×40, получено ok:true ` +
        `(контрпример: нереалистичные габариты приняты как правдоподобные)`,
    );
    assert.ok(
      hasCode(result, "UNREALISTIC_DIMENSIONS"),
      `ожидался код UNREALISTIC_DIMENSIONS, получено ${JSON.stringify(
        violationCodes(result.violations),
      )}`,
    );
  });

  // -------------------------------------------------------------------------
  // B7.3 — FLOATING_FURNITURE: кровать «плавает» по центру комнаты вне стен.
  // Каноничный пример из bugfix.md/design.md (§Examples Группа B): «кровать
  // плавает в центре». Геометрически валидна (внутри комнаты, не пересекает,
  // не блокирует дверь, есть проход), но не примыкает ни к одной стене.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — validateLayout возвращает
  // ok:true (нет проверки примыкания к стене).
  // Validates: Requirements 1.7, 2.7
  // -------------------------------------------------------------------------
  it("«плавающая» по центру кровать отклоняется с FLOATING_FURNITURE", () => {
    const room = bedroom();
    // Кровать 160×200, AABB x∈[200,360], y∈[180,380] — со всех сторон отступ
    // ≥ 180 см от стен (плавает), южная зона очистки двери (y≥540) свободна.
    const result = validateLayout(room, [
      makeItem({
        id: "bed",
        type: "bed",
        widthCm: 160,
        depthCm: 200,
        heightCm: 50,
        xCm: 200,
        yCm: 180,
      }),
      realisticWardrobeE(),
    ]);

    assert.equal(
      result.ok,
      false,
      `ожидался ok:false для «плавающей» кровати, получено ok:true ` +
        `(контрпример: кровать в центре вне стен принята как правдоподобная)`,
    );
    assert.ok(
      hasCode(result, "FLOATING_FURNITURE"),
      `ожидался код FLOATING_FURNITURE, получено ${JSON.stringify(
        violationCodes(result.violations),
      )}`,
    );
  });

  // -------------------------------------------------------------------------
  // Scoped PBT — «плавающая» кровать в любой центральной позиции вне стен.
  // Генерируем положение левого-верхнего угла так, чтобы AABB 160×200 со всех
  // сторон отстоял от стен (плавал) и не залезал в южную зону очистки двери.
  // Для любого такого положения план геометрически валиден, но неубедителен —
  // валидатор обязан отклонить его с FLOATING_FURNITURE.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — ok:true для всех позиций.
  // Validates: Requirements 1.7, 2.7
  // -------------------------------------------------------------------------
  it("любая центральная «плавающая» кровать отклоняется с FLOATING_FURNITURE", () => {
    const BED_W = 160;
    const BED_D = 200;
    const WALL_GAP = 60; // минимальный отступ от стены, чтобы считать «плавающей»

    fc.assert(
      fc.property(
        fc.record({
          // x∈[60, 600-160-60] = [60, 380]; y∈[60, 600-200-60]=[60, 340],
          // но низ ограничим, чтобы не пересекать зону очистки двери (y≥540).
          xCm: fc.integer({ min: WALL_GAP, max: 600 - BED_W - WALL_GAP }),
          yCm: fc.integer({ min: WALL_GAP, max: 320 }),
        }),
        ({ xCm, yCm }) => {
          const room = bedroom();
          const result = validateLayout(room, [
            makeItem({
              id: "bed",
              type: "bed",
              widthCm: BED_W,
              depthCm: BED_D,
              heightCm: 50,
              xCm,
              yCm,
            }),
            realisticWardrobeE(),
          ]);

          assert.ok(
            rejectedForImplausibility(result),
            `«плавающая» кровать @(${xCm},${yCm}) принята валидатором ` +
              `(ok=${result.ok}, codes=${JSON.stringify(
                violationCodes(result.violations),
              )}); ожидалось отклонение с FLOATING_FURNITURE`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
