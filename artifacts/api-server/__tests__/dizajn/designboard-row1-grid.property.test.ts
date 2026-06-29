/**
 * Property 1: Bug Condition — Адаптивная сетка ракурсов под фактическое число кадров.
 *
 * **Validates: Requirements 1.1, 2.1**
 *
 * Источник bug condition: `isBugCondition(state).has_view_holes`
 *   has_view_holes := length(mainViews) < 4   (design.md §Bug Condition, A1)
 *
 * Expected Behavior (Property 1, design.md §Correctness Properties):
 *   _For any_ завершённого проекта, где `length(mainViews) ∈ {1,2,3,4}`,
 *   `DesignBoard` SHALL выбрать раскладку ROW1 строго по `length(mainViews)`,
 *   так что в сетке не остаётся ни одной пустой ячейки
 *   (число колонок сетки == число ракурсов).
 *
 * ─── Methodology (bugfix exploration test) ─────────────────────────────────
 * Этот тест — Bug Condition exploration. Он кодирует ОЖИДАЕМЫЙ инвариант
 * Property 1 и ДОЛЖЕН ПАДАТЬ на неисправленном коде (`n ∈ {1,2,3}`), тем самым
 * подтверждая дефект 1.1. Чинить тест/код на этом шаге нельзя.
 *
 * Чистая презентационная логика ROW1 будет вынесена фиксом (задача 11.1) в
 * локальный модуль `designBoardLayout.ts` как чистый хелпер `viewsGridClass(n)`.
 * До фикса модуля/хелпера ещё нет, поэтому тест аккуратно деградирует к
 * ТОЧНОЙ реплике текущего неисправленного контейнера ROW1 из `DesignBoard.tsx`:
 *
 *     <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"> … </div>
 *
 * После фикса тот же тест импортирует реальный `viewsGridClass` и должен ПРОЙТИ
 * (задача 12.1 — перепрогон без написания новых тестов).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ─── Bridge to the (future) extracted pure helper ────────────────────────────
//
// Fix task 11.1 will create:
//   artifacts/marketplace/components/dizajn/designBoardLayout.ts
//     export function viewsGridClass(n: number): string
//
// Until then the dynamic import throws and we fall back to a faithful replica
// of the CURRENT unfixed ROW1 grid container class.
type ViewsGridClassFn = (n: number) => string;

let viewsGridClass: ViewsGridClassFn | undefined;
try {
  const mod = (await import(
    "../../../marketplace/components/dizajn/designBoardLayout.js"
  )) as { viewsGridClass?: ViewsGridClassFn };
  viewsGridClass = mod.viewsGridClass;
} catch {
  viewsGridClass = undefined;
}

/**
 * Точная реплика неисправленного контейнера ROW1 в `DesignBoard.tsx`:
 *   `<div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">`
 * Класс фиксирован и НЕ зависит от числа ракурсов — в этом и есть дефект.
 */
const UNFIXED_ROW1_CLASS = "grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3";

/** Класс ROW1 под фактическое число основных ракурсов. */
function row1GridClass(n: number): string {
  return viewsGridClass ? viewsGridClass(n) : UNFIXED_ROW1_CLASS;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Эффективное число колонок (треков) ROW1 на десктопе из Tailwind-класса.
 *
 * Правила интерпретации (как их применяет Tailwind/CSS grid):
 *   - если присутствует `sm:grid-cols-N` — действует N (десктопный ряд);
 *   - иначе если есть базовый `grid-cols-N` — действует N;
 *   - если `grid-cols-*` отсутствует вовсе (например, одиночный блок во всю
 *     ширину `w-full` без grid) — это одна колонка.
 *
 * Число колонок == число треков сетки. «Пустые ячейки» появляются, когда
 * треков больше, чем элементов (n < число колонок).
 */
function gridColumnsAtDesktop(className: string): number {
  const sm = className.match(/(?:^|\s)sm:grid-cols-(\d+)/);
  if (sm) return Number(sm[1]);
  const base = className.match(/(?:^|\s)grid-cols-(\d+)/);
  if (base) return Number(base[1]);
  return 1;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DesignBoard Property 1 (Bug Condition): адаптивная сетка ракурсов ROW1", () => {
  // ---------------------------------------------------------------------------
  // Property 1 — число колонок ROW1 строго равно числу основных ракурсов,
  // пустых треков нет. Bug condition: has_view_holes (length(mainViews) < 4).
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL для n ∈ {1,2,3}
  // (контейнер всегда `sm:grid-cols-4` → лишние пустые ячейки).
  // Validates: Requirements 1.1, 2.1
  // ---------------------------------------------------------------------------
  it("число колонок ROW1 == число ракурсов для mainViews.length ∈ {1,2,3,4} (нет пустых ячеек)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (mainViewsLength) => {
        const cls = row1GridClass(mainViewsLength);
        const columns = gridColumnsAtDesktop(cls);
        const emptyTracks = columns - mainViewsLength;

        assert.equal(
          columns,
          mainViewsLength,
          `mainViews.length=${mainViewsLength}: ROW1 рисует ${columns} колонок ` +
            `(${emptyTracks} пустых ячеек) при классе "${cls}". ` +
            `Ожидается ${mainViewsLength} колонок без пустот.`,
        );
      }),
      { numRuns: 200 },
    );
  });
});
