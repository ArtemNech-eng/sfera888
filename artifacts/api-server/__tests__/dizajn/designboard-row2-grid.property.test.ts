/**
 * Property 2: Bug Condition — Устойчивость ROW2 к отсутствию изометрии/плана.
 *
 * **Validates: Requirements 1.2, 2.2**
 *
 * Источник bug condition: `isBugCondition(state).left_col_empty`
 *   left_col_empty := isometricView == null AND topDownPlanUrl == null
 *   (design.md §Bug Condition, A2)
 *
 * Expected Behavior (Property 2, design.md §Correctness Properties):
 *   _For any_ комбинации присутствия `isometricView` и `topDownPlanUrl`,
 *   `DesignBoard` SHALL сформировать grid-template ROW2 только из непустых
 *   колонок (left включается тогда и только тогда, когда есть изометрия или
 *   план), так что ни один трек сетки не остаётся без контента.
 *
 * ─── Methodology (bugfix exploration test) ─────────────────────────────────
 * Этот тест — Bug Condition exploration. Он кодирует ОЖИДАЕМЫЙ инвариант
 * Property 2 и ДОЛЖЕН ПАДАТЬ на неисправленном коде (комбинации без left),
 * тем самым подтверждая дефект 1.2. Чинить тест/код на этом шаге нельзя.
 *
 * Чистая презентационная логика ROW2 будет вынесена фиксом (задача 11.1) в
 * локальный модуль `designBoardLayout.ts` как чистый хелпер
 * `row2TemplateClass({ hasLeft, hasPalette })`. До фикса модуля/хелпера ещё
 * нет, поэтому тест аккуратно деградирует к ТОЧНОЙ реплике текущего
 * неисправленного контейнера ROW2 из `DesignBoard.tsx`:
 *
 *     <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_2fr_auto]"> … </div>
 *
 * После фикса тот же тест импортирует реальный `row2TemplateClass` и должен
 * ПРОЙТИ (задача 12.1 — перепрогон без написания новых тестов).
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
//     export function row2TemplateClass(opts: {
//       hasLeft: boolean; hasPalette: boolean;
//     }): string
//
// Until then the dynamic import throws and we fall back to a faithful replica
// of the CURRENT unfixed ROW2 grid container class.
type Row2TemplateClassFn = (opts: {
  hasLeft: boolean;
  hasPalette: boolean;
}) => string;

let row2TemplateClass: Row2TemplateClassFn | undefined;
try {
  const mod = (await import(
    "../../../marketplace/components/dizajn/designBoardLayout.js"
  )) as { row2TemplateClass?: Row2TemplateClassFn };
  row2TemplateClass = mod.row2TemplateClass;
} catch {
  row2TemplateClass = undefined;
}

/**
 * Точная реплика неисправленного контейнера ROW2 в `DesignBoard.tsx`:
 *   `<div className="mt-5 grid gap-4 lg:grid-cols-[1fr_2fr_auto]">`
 * Класс фиксирован: всегда три трека `1fr_2fr_auto` (left / center / palette)
 * вне зависимости от наличия изометрии/плана и палитры — в этом и есть дефект.
 */
const UNFIXED_ROW2_CLASS = "mt-5 grid gap-4 lg:grid-cols-[1fr_2fr_auto]";

/** Класс ROW2 под фактический состав колонок. */
function row2GridClass(opts: { hasLeft: boolean; hasPalette: boolean }): string {
  return row2TemplateClass ? row2TemplateClass(opts) : UNFIXED_ROW2_CLASS;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Эффективное число колонок (треков) ROW2 на десктопе (lg) из Tailwind-класса.
 *
 * Поддерживаемые формы:
 *   - произвольное значение `lg:grid-cols-[1fr_2fr_auto]` — число треков ==
 *     число `_`-разделённых токенов внутри скобок;
 *   - числовая форма `lg:grid-cols-N` — N треков;
 *   - отсутствие `lg:grid-cols-*` — одиночная колонка во всю ширину (1 трек).
 *
 * Число треков == число колонок сетки. «Пустой трек» возникает, когда сетка
 * резервирует колонку, для которой нет контента.
 */
function gridTracksAtDesktop(className: string): number {
  const bracket = className.match(/(?:^|\s)lg:grid-cols-\[([^\]]+)\]/);
  if (bracket) {
    return bracket[1].split("_").filter((t) => t.length > 0).length;
  }
  const numeric = className.match(/(?:^|\s)lg:grid-cols-(\d+)/);
  if (numeric) return Number(numeric[1]);
  return 1;
}

/**
 * Ожидаемое число непустых колонок ROW2 по фактическому составу:
 *   left (изометрия/план) — только при hasLeft;
 *   center (параметры) — присутствует всегда;
 *   palette — только при hasPalette.
 */
function expectedTracks(hasLeft: boolean, hasPalette: boolean): number {
  return (hasLeft ? 1 : 0) + 1 + (hasPalette ? 1 : 0);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DesignBoard Property 2 (Bug Condition): устойчивость ROW2 к отсутствию изометрии/плана", () => {
  // ---------------------------------------------------------------------------
  // Property 2 — grid-template ROW2 состоит только из непустых колонок.
  // left включается ⟺ есть изометрия ИЛИ план; ни один трек не пуст.
  // Bug condition: left_col_empty (isometricView == null AND topDownPlanUrl == null).
  //
  // Scoped PBT: перебираем все 4 комбинации присутствия isometricView/topDownPlanUrl
  // (плюс варьируем наличие палитры), ассертим, что число треков ROW2 == число
  // реально присутствующих колонок.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL для комбинаций без left
  // (и/или без палитры) — контейнер всегда `lg:grid-cols-[1fr_2fr_auto]`
  // (3 трека) → зарезервированная пустая левая колонка `1fr`.
  // Validates: Requirements 1.2, 2.2
  // ---------------------------------------------------------------------------
  it("число треков ROW2 == число непустых колонок для всех комбинаций изометрии/плана (нет пустого left)", () => {
    fc.assert(
      fc.property(
        fc.boolean(), // hasIsometric
        fc.boolean(), // hasTopDownPlan
        fc.boolean(), // hasPalette
        (hasIsometric, hasTopDownPlan, hasPalette) => {
          const hasLeft = hasIsometric || hasTopDownPlan;

          const cls = row2GridClass({ hasLeft, hasPalette });
          const tracks = gridTracksAtDesktop(cls);
          const expected = expectedTracks(hasLeft, hasPalette);
          const emptyTracks = tracks - expected;

          assert.equal(
            tracks,
            expected,
            `isometric=${hasIsometric}, plan=${hasTopDownPlan} (hasLeft=${hasLeft}), ` +
              `palette=${hasPalette}: ROW2 рисует ${tracks} треков ` +
              `(${emptyTracks} пустых, в т.ч. зарезервированная левая колонка) ` +
              `при классе "${cls}". Ожидается ${expected} непустых колонок ` +
              `(left включён ⟺ есть изометрия или план).`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
