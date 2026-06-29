/**
 * Property 3: Bug Condition — Опциональные секции без пустых блоков.
 *
 * **Validates: Requirements 1.3, 2.3**
 *
 * Источник bug condition: `isBugCondition(state).empty_section_rendered`
 *   empty_section_rendered :=
 *        (state.colorPalette is empty)            // плейсхолдер «Палитра уточняется.»
 *     OR (ROW2/ROW3 трек присутствует без контента)
 *   (design.md §Bug Condition, A3)
 *
 * Expected Behavior (Property 3, design.md §Correctness Properties):
 *   _For any_ опциональной секции (палитра, материалы, смета, решения,
 *   detail-кропы), если её данные пусты, `DesignBoard` SHALL не рендерить ни
 *   заголовок, ни плейсхолдер этой секции (в частности, не показывать
 *   «Палитра уточняется.»), не оставляя висящих блоков.
 *
 * ─── Methodology (bugfix exploration test) ─────────────────────────────────
 * Этот тест — Bug Condition exploration. Он кодирует ОЖИДАЕМЫЙ инвариант
 * Property 3 и ДОЛЖЕН ПАДАТЬ на неисправленном коде (пустая палитра рендерит
 * заголовок «Цветовая палитра» + плейсхолдер «Палитра уточняется.»), тем самым
 * подтверждая дефект 1.3. Чинить тест/код на этом шаге нельзя.
 *
 * Чистая презентационная логика опциональных секций будет вынесена фиксом
 * (задача 11.1) в локальный модуль `designBoardLayout.ts` как чистый хелпер
 * `optionalSectionMarkers(state)` (фикс §A.3/§A.4: удалить ветку
 * «Палитра уточняется.», рендерить блок палитры только при наличии данных,
 * не рендерить пустую ROW3). До фикса модуля/хелпера ещё нет, поэтому тест
 * аккуратно деградирует к ТОЧНОЙ реплике текущей неисправленной логики
 * секций ROW2/ROW3 из `DesignBoard.tsx`:
 *
 *   - палитра:   заголовок «Цветовая палитра» рендерится ВСЕГДА; при пустых
 *                данных дополнительно — плейсхолдер «Палитра уточняется.»;
 *   - материалы: `design.materials && design.materials.length > 0 && (…)`;
 *   - смета:     `design.estimate && design.estimate.length > 0 && (…)`;
 *   - решения:   `design.solutions && design.solutions.length > 0 && (…)`;
 *   - кропы:     `detailCrops.length > 0 && (…)`.
 *
 * После фикса тот же тест импортирует реальный `optionalSectionMarkers` и
 * должен ПРОЙТИ (задача 12.1 — перепрогон без написания новых тестов).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ─── Domain ──────────────────────────────────────────────────────────────────

/** Опциональные секции страницы результата (ROW2/ROW3). */
type SectionKey =
  | "palette"
  | "materials"
  | "estimate"
  | "solutions"
  | "detailCrops";

/**
 * Наличие данных для каждой опциональной секции — то, что `DesignBoard`
 * получает из `DesignFullDTO` (длины массивов > 0).
 */
interface OptionalSectionState {
  hasPalette: boolean;
  hasMaterials: boolean;
  hasEstimate: boolean;
  hasSolutions: boolean;
  hasCrops: boolean;
}

/**
 * Маркер, попадающий в выходную разметку секции. Заголовок секции либо
 * (для палитры) висящий плейсхолдер. Тест ассертит, что пустая секция НЕ
 * порождает ни заголовка, ни плейсхолдера.
 */
type SectionMarker =
  | { section: SectionKey; kind: "header"; text: string }
  | { section: "palette"; kind: "placeholder"; text: string };

/** Точные строки заголовков/плейсхолдера из `DesignBoard.tsx`. */
const PALETTE_HEADER = "Цветовая палитра";
const PALETTE_PLACEHOLDER = "Палитра уточняется.";
const MATERIALS_HEADER = "Рекомендуемые материалы";
const ESTIMATE_HEADER = "Смета реализации";
const SOLUTIONS_HEADER = "Основные решения";

// ─── Bridge to the (future) extracted pure helper ────────────────────────────
//
// Fix task 11.1 will create:
//   artifacts/marketplace/components/dizajn/designBoardLayout.ts
//     export function optionalSectionMarkers(
//       state: OptionalSectionState,
//     ): SectionMarker[]
//
// Until then the dynamic import throws and we fall back to a faithful replica
// of the CURRENT unfixed ROW2/ROW3 section-rendering logic.
type OptionalSectionMarkersFn = (
  state: OptionalSectionState,
) => SectionMarker[];

let optionalSectionMarkers: OptionalSectionMarkersFn | undefined;
try {
  const mod = (await import(
    "../../../marketplace/components/dizajn/designBoardLayout.js"
  )) as { optionalSectionMarkers?: OptionalSectionMarkersFn };
  optionalSectionMarkers = mod.optionalSectionMarkers;
} catch {
  optionalSectionMarkers = undefined;
}

/**
 * ТОЧНАЯ реплика неисправленной логики секций ROW2/ROW3 в `DesignBoard.tsx`.
 *
 * Дефект: заголовок «Цветовая палитра» рендерится безусловно, а при пустой
 * палитре дополнительно рендерится плейсхолдер «Палитра уточняется.» — то есть
 * пустая секция оставляет висящий блок. Остальные секции уже условны.
 */
function unfixedSectionMarkers(state: OptionalSectionState): SectionMarker[] {
  const markers: SectionMarker[] = [];

  // RIGHT: palette — заголовок ВСЕГДА, плюс плейсхолдер при пустых данных.
  markers.push({ section: "palette", kind: "header", text: PALETTE_HEADER });
  if (!state.hasPalette) {
    markers.push({
      section: "palette",
      kind: "placeholder",
      text: PALETTE_PLACEHOLDER,
    });
  }

  // CENTER: материалы / смета — только при наличии данных.
  if (state.hasMaterials) {
    markers.push({
      section: "materials",
      kind: "header",
      text: MATERIALS_HEADER,
    });
  }
  if (state.hasEstimate) {
    markers.push({
      section: "estimate",
      kind: "header",
      text: ESTIMATE_HEADER,
    });
  }

  // ROW3: решения — только при наличии данных; кропы не имеют заголовка.
  if (state.hasSolutions) {
    markers.push({
      section: "solutions",
      kind: "header",
      text: SOLUTIONS_HEADER,
    });
  }

  return markers;
}

/** Маркеры опциональных секций под фактический состав данных. */
function sectionMarkers(state: OptionalSectionState): SectionMarker[] {
  return optionalSectionMarkers
    ? optionalSectionMarkers(state)
    : unfixedSectionMarkers(state);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Присутствие данных секции по её ключу. */
function sectionHasData(state: OptionalSectionState, key: SectionKey): boolean {
  switch (key) {
    case "palette":
      return state.hasPalette;
    case "materials":
      return state.hasMaterials;
    case "estimate":
      return state.hasEstimate;
    case "solutions":
      return state.hasSolutions;
    case "detailCrops":
      return state.hasCrops;
  }
}

const ALL_SECTIONS: SectionKey[] = [
  "palette",
  "materials",
  "estimate",
  "solutions",
  "detailCrops",
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DesignBoard Property 3 (Bug Condition): опциональные секции без пустых блоков", () => {
  // ---------------------------------------------------------------------------
  // Property 3 — пустая опциональная секция НЕ порождает ни заголовка, ни
  // плейсхолдера. Bug condition: empty_section_rendered (в частности, пустая
  // палитра рендерит «Цветовая палитра» + «Палитра уточняется.»).
  //
  // Scoped PBT: генерируем наличие/отсутствие данных для каждой из 5 секций;
  // для каждой ПУСТОЙ секции ассертим, что среди отрисованных маркеров нет ни
  // её заголовка, ни (для палитры) плейсхолдера.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL при пустой палитре
  // (рендерятся «Цветовая палитра» + «Палитра уточняется.»).
  // Validates: Requirements 1.3, 2.3
  // ---------------------------------------------------------------------------
  it("пустая опциональная секция не рендерит ни заголовок, ни плейсхолдер", () => {
    fc.assert(
      fc.property(
        fc.boolean(), // hasPalette
        fc.boolean(), // hasMaterials
        fc.boolean(), // hasEstimate
        fc.boolean(), // hasSolutions
        fc.boolean(), // hasCrops
        (hasPalette, hasMaterials, hasEstimate, hasSolutions, hasCrops) => {
          const state: OptionalSectionState = {
            hasPalette,
            hasMaterials,
            hasEstimate,
            hasSolutions,
            hasCrops,
          };

          const markers = sectionMarkers(state);

          for (const key of ALL_SECTIONS) {
            if (sectionHasData(state, key)) continue; // секция с контентом — ок

            const leaked = markers.filter((m) => m.section === key);
            assert.equal(
              leaked.length,
              0,
              `Пустая секция "${key}" оставила висящие маркеры: ` +
                `${JSON.stringify(leaked.map((m) => `${m.kind}:${m.text}`))}. ` +
                `Состояние=${JSON.stringify(state)}. ` +
                `Ожидается: ни заголовка, ни плейсхолдера для пустой секции.`,
            );
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  // ---------------------------------------------------------------------------
  // Прямая проверка известного контрпримера: пустая палитра не должна
  // показывать висящий плейсхолдер «Палитра уточняется.».
  // EXPECTED OUTCOME на неисправленном коде: FAIL.
  // Validates: Requirements 1.3, 2.3
  // ---------------------------------------------------------------------------
  it("пустая палитра не показывает плейсхолдер «Палитра уточняется.»", () => {
    const state: OptionalSectionState = {
      hasPalette: false,
      hasMaterials: false,
      hasEstimate: false,
      hasSolutions: false,
      hasCrops: false,
    };

    const markers = sectionMarkers(state);
    const placeholderShown = markers.some(
      (m) => m.kind === "placeholder" && m.text === PALETTE_PLACEHOLDER,
    );
    const paletteHeaderShown = markers.some(
      (m) => m.section === "palette" && m.kind === "header",
    );

    assert.equal(
      placeholderShown,
      false,
      `Пустая палитра рендерит висящий плейсхолдер «${PALETTE_PLACEHOLDER}». ` +
        `Ожидается: блок палитры не рендерится.`,
    );
    assert.equal(
      paletteHeaderShown,
      false,
      `Пустая палитра рендерит заголовок «${PALETTE_HEADER}» без контента. ` +
        `Ожидается: заголовок не рендерится.`,
    );
  });
});
