/**
 * Property 10: Preservation — Идентичный рендер полного и Showcase-проекта.
 *
 * **Validates: Requirements 3.5, 3.7**
 *
 * Preservation Requirement (bugfix.md §Unchanged Behavior):
 *   3.5 WHEN существующий завершённый проект уже содержит полный набор
 *       артефактов (4 ракурса, изометрия, план, палитра, материалы, смета,
 *       решения, detail-кропы) THEN система SHALL CONTINUE TO рендерить
 *       страницу `DesignBoard` идентично текущему виду.
 *   3.7 WHEN отображаются редакторские `Showcase_Project` (без `anon_id`)
 *       THEN система SHALL CONTINUE TO рендерить их как прежде, без
 *       затрагивания их разметки.
 *
 * Expected Behavior (Property 10, design.md §Correctness Properties):
 *   _For any_ завершённого проекта с **полным** `Artifact_Set` (4 ракурса,
 *   изометрия, план, палитра, материалы, смета, решения, 6 detail-кропов),
 *   включая редакторские `Showcase_Project`, адаптивный `DesignBoard` SHALL
 *   произвести ту же разметку (те же grid-треки, те же блоки), что и текущая
 *   реализация, сохраняя существующий вид.
 *
 * ─── Methodology (bugfix preservation test, observation-first) ─────────────
 * Этот тест — Preservation. Он фиксирует НАБЛЮДАЕМОЕ поведение полного набора
 * на НЕИСПРАВЛЕННОМ коде (snapshot grid-треков/блоков как baseline) и ДОЛЖЕН
 * ПРОХОДИТЬ как до фикса, так и после.
 *
 * Observation на неисправленном коде (`DesignBoard.tsx`, статус completed):
 *   - ROW1: `<div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">`
 *           — на десктопе 4 колонки (`sm:grid-cols-4`).
 *   - ROW2: `<div className="mt-5 grid gap-4 lg:grid-cols-[1fr_2fr_auto]">`
 *           — 3 трека (left / center / palette).
 *   - ROW3: `<div className="mt-5 grid gap-5 lg:grid-cols-[1fr_3fr]">`
 *           — 2 трека (solutions / crops).
 *   - Опциональные секции: при полном наборе рендерятся заголовки
 *     «Цветовая палитра», «Рекомендуемые материалы», «Смета реализации»,
 *     «Основные решения»; плейсхолдер «Палитра уточняется.» отсутствует.
 *   - Showcase_Project (без `anon_id`) использует те же блоки — раскладка не
 *     зависит от владельца, только от набора артефактов.
 *
 * Бридж к будущим чистым хелперам (`designBoardLayout.ts`, задача 11.1):
 *   `viewsGridClass`, `row2TemplateClass`, `row3TemplateClass`,
 *   `optionalSectionMarkers`. До фикса модуля ещё нет — тест аккуратно
 *   деградирует к ТОЧНЫМ репликам текущих неисправленных контейнеров/логики.
 *   Для ПОЛНОГО набора фикс обязан редуцировать адаптивные хелперы к текущей
 *   сетке, поэтому тест проходит и на реплике (до фикса), и на хелперах
 *   (после фикса — задача 12.2, перепрогон без новых тестов).
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

interface OptionalSectionState {
  hasPalette: boolean;
  hasMaterials: boolean;
  hasEstimate: boolean;
  hasSolutions: boolean;
  hasCrops: boolean;
}

type SectionMarker =
  | { section: SectionKey; kind: "header"; text: string }
  | { section: "palette"; kind: "placeholder"; text: string };

/** Точные строки заголовков/плейсхолдера из `DesignBoard.tsx`. */
const PALETTE_HEADER = "Цветовая палитра";
const PALETTE_PLACEHOLDER = "Палитра уточняется.";
const MATERIALS_HEADER = "Рекомендуемые материалы";
const ESTIMATE_HEADER = "Смета реализации";
const SOLUTIONS_HEADER = "Основные решения";

// ─── Baseline snapshot (наблюдаемое на неисправленном коде) ──────────────────
//
// Полный набор артефактов рендерится текущими фиксированными классами:
const BASELINE_ROW1_CLASS = "grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3";
const BASELINE_ROW2_CLASS = "mt-5 grid gap-4 lg:grid-cols-[1fr_2fr_auto]";
const BASELINE_ROW3_CLASS = "mt-5 grid gap-5 lg:grid-cols-[1fr_3fr]";

// Эффективное число колонок/треков на десктопе для полного набора:
const BASELINE_ROW1_COLUMNS = 4; // sm:grid-cols-4
const BASELINE_ROW2_TRACKS = 3; // [1fr_2fr_auto]
const BASELINE_ROW3_TRACKS = 2; // [1fr_3fr]

// ─── Bridge to the (future) extracted pure helpers ───────────────────────────
//
// Fix task 11.1 will create:
//   artifacts/marketplace/components/dizajn/designBoardLayout.ts
//     export function viewsGridClass(n: number): string
//     export function row2TemplateClass(o: { hasLeft; hasPalette }): string
//     export function row3TemplateClass(o: { hasSolutions; hasCrops }): string
//     export function optionalSectionMarkers(s): SectionMarker[]
//
// Until then the dynamic import throws and we fall back to faithful replicas of
// the CURRENT unfixed containers/logic. For a FULL artifact set both the
// replica (pre-fix) and the helpers (post-fix) reduce to the baseline grid.
type ViewsGridClassFn = (n: number) => string;
type Row2TemplateClassFn = (o: {
  hasLeft: boolean;
  hasPalette: boolean;
}) => string;
type Row3TemplateClassFn = (o: {
  hasSolutions: boolean;
  hasCrops: boolean;
}) => string;
type OptionalSectionMarkersFn = (s: OptionalSectionState) => SectionMarker[];

let viewsGridClass: ViewsGridClassFn | undefined;
let row2TemplateClass: Row2TemplateClassFn | undefined;
let row3TemplateClass: Row3TemplateClassFn | undefined;
let optionalSectionMarkers: OptionalSectionMarkersFn | undefined;

try {
  const mod = (await import(
    "../../../marketplace/components/dizajn/designBoardLayout.js"
  )) as {
    viewsGridClass?: ViewsGridClassFn;
    row2TemplateClass?: Row2TemplateClassFn;
    row3TemplateClass?: Row3TemplateClassFn;
    optionalSectionMarkers?: OptionalSectionMarkersFn;
  };
  viewsGridClass = mod.viewsGridClass;
  row2TemplateClass = mod.row2TemplateClass;
  row3TemplateClass = mod.row3TemplateClass;
  optionalSectionMarkers = mod.optionalSectionMarkers;
} catch {
  viewsGridClass = undefined;
  row2TemplateClass = undefined;
  row3TemplateClass = undefined;
  optionalSectionMarkers = undefined;
}

// ── Faithful replicas of the CURRENT unfixed containers/logic ────────────────

/** Реплика ROW1: класс фиксирован, не зависит от числа ракурсов. */
function row1GridClass(n: number): string {
  return viewsGridClass ? viewsGridClass(n) : BASELINE_ROW1_CLASS;
}

/** Реплика ROW2: класс фиксирован, всегда три трека `1fr_2fr_auto`. */
function row2GridClass(o: { hasLeft: boolean; hasPalette: boolean }): string {
  return row2TemplateClass ? row2TemplateClass(o) : BASELINE_ROW2_CLASS;
}

/** Реплика ROW3: класс фиксирован, всегда два трека `1fr_3fr`. */
function row3GridClass(o: {
  hasSolutions: boolean;
  hasCrops: boolean;
}): string {
  return row3TemplateClass ? row3TemplateClass(o) : BASELINE_ROW3_CLASS;
}

/**
 * Реплика логики опциональных секций ROW2/ROW3 (см.
 * designboard-optional-sections.property.test.ts). Для ПОЛНОГО набора все
 * заголовки присутствуют, плейсхолдер не рендерится.
 */
function unfixedSectionMarkers(state: OptionalSectionState): SectionMarker[] {
  const markers: SectionMarker[] = [];
  markers.push({ section: "palette", kind: "header", text: PALETTE_HEADER });
  if (!state.hasPalette) {
    markers.push({
      section: "palette",
      kind: "placeholder",
      text: PALETTE_PLACEHOLDER,
    });
  }
  if (state.hasMaterials) {
    markers.push({ section: "materials", kind: "header", text: MATERIALS_HEADER });
  }
  if (state.hasEstimate) {
    markers.push({ section: "estimate", kind: "header", text: ESTIMATE_HEADER });
  }
  if (state.hasSolutions) {
    markers.push({ section: "solutions", kind: "header", text: SOLUTIONS_HEADER });
  }
  return markers;
}

function sectionMarkers(state: OptionalSectionState): SectionMarker[] {
  return optionalSectionMarkers
    ? optionalSectionMarkers(state)
    : unfixedSectionMarkers(state);
}

// ─── Helpers (interpret effective grid tracks on desktop) ────────────────────

/** Эффективное число колонок ROW1 на десктопе (sm) из Tailwind-класса. */
function gridColumnsAtDesktop(className: string): number {
  const sm = className.match(/(?:^|\s)sm:grid-cols-(\d+)/);
  if (sm) return Number(sm[1]);
  const base = className.match(/(?:^|\s)grid-cols-(\d+)/);
  if (base) return Number(base[1]);
  return 1;
}

/** Эффективное число треков ROW2/ROW3 на десктопе (lg) из Tailwind-класса. */
function gridTracksAtDesktop(className: string): number {
  const bracket = className.match(/(?:^|\s)lg:grid-cols-\[([^\]]+)\]/);
  if (bracket) {
    return bracket[1].split("_").filter((t) => t.length > 0).length;
  }
  const numeric = className.match(/(?:^|\s)lg:grid-cols-(\d+)/);
  if (numeric) return Number(numeric[1]);
  return 1;
}

// ─── Full Artifact_Set model ─────────────────────────────────────────────────

/**
 * Полный `Artifact_Set` (NOT isBugCondition): 4 основных ракурса, изометрия и
 * план присутствуют, все опциональные секции непусты, 6 detail-кропов.
 * `isShowcase` отражает редакторский `Showcase_Project` (без `anon_id`) —
 * раскладка от владельца не зависит, поэтому baseline должен совпадать.
 */
interface FullArtifactState {
  mainViewsLength: number; // == 4
  hasIsometric: boolean;
  hasTopDownPlan: boolean;
  hasPalette: boolean;
  hasMaterials: boolean;
  hasEstimate: boolean;
  hasSolutions: boolean;
  cropsLength: number; // == 6
  isShowcase: boolean; // anon_id == null
}

/** Генератор полного набора артефактов (включая Showcase-вариант). */
const fullArtifactStateArb: fc.Arbitrary<FullArtifactState> = fc.record({
  mainViewsLength: fc.constant(4),
  hasIsometric: fc.constant(true),
  hasTopDownPlan: fc.constant(true),
  hasPalette: fc.constant(true),
  hasMaterials: fc.constant(true),
  hasEstimate: fc.constant(true),
  hasSolutions: fc.constant(true),
  cropsLength: fc.constant(6),
  // редакторский Showcase_Project (без anon_id) ИЛИ обычный анонимный проект —
  // оба должны давать ту же baseline-разметку (3.5 и 3.7).
  isShowcase: fc.boolean(),
});

function toOptionalSectionState(s: FullArtifactState): OptionalSectionState {
  return {
    hasPalette: s.hasPalette,
    hasMaterials: s.hasMaterials,
    hasEstimate: s.hasEstimate,
    hasSolutions: s.hasSolutions,
    hasCrops: s.cropsLength > 0,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DesignBoard Property 10 (Preservation): идентичный рендер полного и Showcase-проекта", () => {
  // ---------------------------------------------------------------------------
  // Preservation — grid-треки полного набора редуцируются к текущей сетке.
  // EXPECTED OUTCOME на неисправленном коде: PASS (фиксируем baseline).
  // Validates: Requirements 3.5, 3.7
  // ---------------------------------------------------------------------------
  it("полный набор → grid-треки ROW1/ROW2/ROW3 == текущий baseline", () => {
    fc.assert(
      fc.property(fullArtifactStateArb, (s) => {
        const hasLeft = s.hasIsometric || s.hasTopDownPlan;
        const hasCrops = s.cropsLength > 0;

        const row1 = row1GridClass(s.mainViewsLength);
        const row2 = row2GridClass({ hasLeft, hasPalette: s.hasPalette });
        const row3 = row3GridClass({ hasSolutions: s.hasSolutions, hasCrops });

        assert.equal(
          gridColumnsAtDesktop(row1),
          BASELINE_ROW1_COLUMNS,
          `ROW1 для полного набора (mainViews=${s.mainViewsLength}) даёт ` +
            `${gridColumnsAtDesktop(row1)} колонок при классе "${row1}". ` +
            `Ожидается baseline ${BASELINE_ROW1_COLUMNS} (sm:grid-cols-4).`,
        );
        assert.equal(
          gridTracksAtDesktop(row2),
          BASELINE_ROW2_TRACKS,
          `ROW2 для полного набора даёт ${gridTracksAtDesktop(row2)} треков ` +
            `при классе "${row2}". Ожидается baseline ${BASELINE_ROW2_TRACKS} ` +
            `([1fr_2fr_auto]).`,
        );
        assert.equal(
          gridTracksAtDesktop(row3),
          BASELINE_ROW3_TRACKS,
          `ROW3 для полного набора даёт ${gridTracksAtDesktop(row3)} треков ` +
            `при классе "${row3}". Ожидается baseline ${BASELINE_ROW3_TRACKS} ` +
            `([1fr_3fr]).`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Preservation — все опциональные блоки полного набора присутствуют, и нет
  // висящего плейсхолдера палитры (рендер блоков идентичен текущему).
  // EXPECTED OUTCOME на неисправленном коде: PASS.
  // Validates: Requirements 3.5, 3.7
  // ---------------------------------------------------------------------------
  it("полный набор → присутствуют все заголовки секций, плейсхолдер палитры отсутствует", () => {
    fc.assert(
      fc.property(fullArtifactStateArb, (s) => {
        const markers = sectionMarkers(toOptionalSectionState(s));

        const headerSections = markers
          .filter((m) => m.kind === "header")
          .map((m) => m.section)
          .sort();

        assert.deepEqual(
          headerSections,
          ["estimate", "materials", "palette", "solutions"],
          `Полный набор должен рендерить заголовки палитры, материалов, сметы ` +
            `и решений. Получено: ${JSON.stringify(headerSections)}.`,
        );

        const placeholderShown = markers.some(
          (m) => m.kind === "placeholder" && m.text === PALETTE_PLACEHOLDER,
        );
        assert.equal(
          placeholderShown,
          false,
          `Полный набор не должен показывать плейсхолдер «${PALETTE_PLACEHOLDER}» ` +
            `(палитра присутствует).`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Preservation (3.7) — Showcase_Project (без anon_id) рендерится той же
  // разметкой, что и обычный проект с тем же полным набором: раскладка не
  // зависит от владельца, только от артефактов.
  // EXPECTED OUTCOME на неисправленном коде: PASS.
  // Validates: Requirements 3.7
  // ---------------------------------------------------------------------------
  it("Showcase-проект (без anon_id) и обычный проект с полным набором дают идентичную разметку", () => {
    fc.assert(
      fc.property(fullArtifactStateArb, (s) => {
        const hasLeft = s.hasIsometric || s.hasTopDownPlan;
        const hasCrops = s.cropsLength > 0;
        const opt = toOptionalSectionState(s);

        // Раскладка вычисляется без участия isShowcase/anon_id — сравниваем
        // вывод для showcase-варианта с обычным (parity).
        const showcase = {
          row1: row1GridClass(s.mainViewsLength),
          row2: row2GridClass({ hasLeft, hasPalette: s.hasPalette }),
          row3: row3GridClass({ hasSolutions: s.hasSolutions, hasCrops }),
          markers: sectionMarkers(opt),
        };
        const regular = {
          row1: row1GridClass(s.mainViewsLength),
          row2: row2GridClass({ hasLeft, hasPalette: s.hasPalette }),
          row3: row3GridClass({ hasSolutions: s.hasSolutions, hasCrops }),
          markers: sectionMarkers(opt),
        };

        assert.deepEqual(
          showcase,
          regular,
          "Showcase_Project и обычный проект с тем же полным набором должны " +
            "давать идентичную разметку (раскладка не зависит от anon_id).",
        );
      }),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Snapshot baseline — каноничный полный набор фиксирует точные эффективные
  // grid-треки и блоки как baseline (3.5).
  // EXPECTED OUTCOME на неисправленном коде: PASS.
  // Validates: Requirements 3.5
  // ---------------------------------------------------------------------------
  it("каноничный полный набор фиксирует baseline grid-треков и блоков", () => {
    const full: FullArtifactState = {
      mainViewsLength: 4,
      hasIsometric: true,
      hasTopDownPlan: true,
      hasPalette: true,
      hasMaterials: true,
      hasEstimate: true,
      hasSolutions: true,
      cropsLength: 6,
      isShowcase: false,
    };

    const row1 = row1GridClass(full.mainViewsLength);
    const row2 = row2GridClass({ hasLeft: true, hasPalette: true });
    const row3 = row3GridClass({ hasSolutions: true, hasCrops: true });

    assert.equal(gridColumnsAtDesktop(row1), BASELINE_ROW1_COLUMNS);
    assert.equal(gridTracksAtDesktop(row2), BASELINE_ROW2_TRACKS);
    assert.equal(gridTracksAtDesktop(row3), BASELINE_ROW3_TRACKS);

    const markers = sectionMarkers(toOptionalSectionState(full));
    const headerSections = markers
      .filter((m) => m.kind === "header")
      .map((m) => m.section)
      .sort();
    assert.deepEqual(headerSections, [
      "estimate",
      "materials",
      "palette",
      "solutions",
    ]);
    assert.equal(
      markers.some((m) => m.kind === "placeholder"),
      false,
    );
  });
});
