/**
 * Property 5: Bug Condition — Адаптивная сборка инфографики.
 *
 * **Validates: Requirements 1.5, 2.5**
 *
 * Источник bug condition: `isBugCondition(state).infographic_distorted`
 *   infographic_distorted := assembledFromIncompleteInputs(state)
 *   (design.md §Bug Condition, A5)
 * плюс корневая причина A3 (design.md §Hypothesized Root Cause):
 *   `composeInfographic` имеет фиксированные слоты (4 ракурса + 1 изометрия +
 *   6 detail-кропов), а воркер вызывает `pickFourViews`, который ДУБЛИРУЕТ hero
 *   в незанятые слоты → «4 одинаковых верхних кадра» при `views < 4`, а нехватка
 *   изометрии/кропов оставляет пустые зоны.
 *
 * Expected Behavior (Property 5, design.md §Correctness Properties):
 *   _For any_ набора входов `composeInfographic` (реальных ракурсов 1..4,
 *   наличие/отсутствие изометрии, 0..6 кропов), композитор SHALL разложить
 *   ТОЛЬКО реально присутствующие ассеты без дублирования и без пустых зон
 *   (число занятых слотов == число реальных ассетов), либо корректно не
 *   собирать инфографику, не нарушая страницу.
 *
 * ─── Methodology (bugfix exploration test) ─────────────────────────────────
 * Этот тест — Bug Condition exploration. Он кодирует ОЖИДАЕМЫЙ инвариант
 * Property 5 и ДОЛЖЕН ПАДАТЬ на неисправленном коде (при `views < 4` hero
 * дублируется в пустые слоты; при `< 6` кропов / отсутствии изометрии
 * фиксированная раскладка оставляет пустые зоны), тем самым подтверждая
 * дефект 1.5. Чинить тест/код на этом шаге нельзя.
 *
 * Адаптивная раскладка слотов будет вынесена фиксом (задача 11.2) в
 * `infographicComposer.ts` как чистый планировщик слотов
 * `planInfographicSlots(assets)` (вычисление прямоугольников из ФАКТИЧЕСКИХ
 * длин: ровно `views.length` ячеек ROW1, middle-блок изометрии только при
 * `isometric != null`, ровно `detailCrops.length` crop-ячеек, без hero-дублей
 * из `pickFourViews`). До фикса этого экспорта ещё нет, поэтому тест аккуратно
 * деградирует к ТОЧНОЙ реплике текущей неисправленной фиксированной раскладки
 * (4 view-слота с hero-паддингом через `pickFourViews`, 1 фиксированный
 * iso-слот, 6 фиксированных crop-слотов).
 *
 * После фикса тот же тест импортирует реальный `planInfographicSlots` и
 * должен ПРОЙТИ (задача 12.1 — перепрогон без написания новых тестов).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ─── Domain ──────────────────────────────────────────────────────────────────

/**
 * Реальные ассеты, которые воркер передаёт композитору. Буферы моделируются
 * строковыми тегами идентичности, чтобы детектировать дублирование hero
 * (`pickFourViews` подставляет hero-тег в пустые слоты) и пустые зоны
 * (`null`-слоты фиксированной раскладки).
 *
 * `views[0]` — это hero (тот самый буфер, что `pickFourViews` дублирует).
 */
interface InfographicAssets {
  /** Реальные ракурсы (1..4); `views[0]` — hero. Уникальные теги. */
  views: string[];
  /** Реальная изометрия присутствует? */
  hasIsometric: boolean;
  /** Реальные detail-кропы (0..6). Уникальные теги. */
  detailCrops: string[];
}

/**
 * Слот итоговой инфографики. `content === null` означает пустую зону
 * (зарезервированный фиксированной раскладкой прямоугольник без реального
 * ассета). Несколько слотов с одинаковым `content` — дублирование.
 */
interface Slot {
  zone: "view" | "isometric" | "crop";
  index: number;
  content: string | null;
}

type SlotPlan = Slot[];

// ─── Unfixed fixed-slot layout constants (точная реплика) ────────────────────
//
// `composeInfographic` (infographicComposer.ts) собран под ПОЛНЫЙ набор:
//   - InfographicInput.views: [Buffer, Buffer, Buffer, Buffer]   → 4 слота
//   - InfographicInput.isometric: Buffer                          → 1 слот
//   - InfographicInput.detailCrops: [Buffer ×6]                   → 6 слотов
// Воркер (designWorker.ts, шаг 11) вызывает `pickFourViews`, который для
// незанятых ракурсов подставляет heroBuffer:
//   const slot = (i) => viewBuffers[i] ?? heroBuffer;
//   return [slot(0), slot(1), slot(2), slot(3)];
const FIXED_VIEW_SLOTS = 4;
const FIXED_CROP_SLOTS = 6;

// ─── Bridge to the (future) extracted pure planner ───────────────────────────
//
// Fix task 11.2 will make `infographicComposer.ts` adaptive and (для прямого
// property-тестирования) экспортировать чистый планировщик слотов:
//   export function planInfographicSlots(assets: InfographicAssets): SlotPlan
//
// Until then the dynamic import yields `undefined` and we fall back to a
// faithful replica of the CURRENT unfixed fixed-slot layout + hero padding.
type PlanInfographicSlotsFn = (assets: InfographicAssets) => SlotPlan;

let planInfographicSlots: PlanInfographicSlotsFn | undefined;
try {
  const mod = (await import("../../src/lib/infographicComposer.js")) as {
    planInfographicSlots?: PlanInfographicSlotsFn;
  };
  planInfographicSlots = mod.planInfographicSlots;
} catch {
  planInfographicSlots = undefined;
}

/**
 * ТОЧНАЯ реплика неисправленной фиксированной раскладки композитора + логики
 * `pickFourViews` из воркера.
 *
 * Дефект:
 *   - 4 view-слота всегда: незанятые заполняются hero (`views[0]`) → дубли при
 *     `views.length < 4` («4 одинаковых верхних кадра»);
 *   - 1 iso-слот всегда зарезервирован: пустая зона при отсутствии изометрии;
 *   - 6 crop-слотов всегда: незанятые остаются пустыми зонами при `< 6` кропов.
 */
function unfixedPlanInfographicSlots(assets: InfographicAssets): SlotPlan {
  const slots: SlotPlan = [];
  const hero = assets.views[0] ?? null;

  // ROW1: pickFourViews — фиксированные 4 слота с hero-паддингом.
  for (let i = 0; i < FIXED_VIEW_SLOTS; i++) {
    slots.push({
      zone: "view",
      index: i,
      content: assets.views[i] ?? hero, // hero-дубль для незанятых слотов
    });
  }

  // MIDDLE: изометрия — фиксированный слот всегда зарезервирован.
  slots.push({
    zone: "isometric",
    index: 0,
    content: assets.hasIsometric ? "iso" : null, // пустая зона без изометрии
  });

  // BOTTOM: фиксированные 6 crop-слотов; незанятые — пустые зоны.
  for (let i = 0; i < FIXED_CROP_SLOTS; i++) {
    slots.push({
      zone: "crop",
      index: i,
      content: assets.detailCrops[i] ?? null,
    });
  }

  return slots;
}

/** План слотов под фактический набор ассетов. */
function slotPlan(assets: InfographicAssets): SlotPlan {
  return planInfographicSlots
    ? planInfographicSlots(assets)
    : unfixedPlanInfographicSlots(assets);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Число реальных ассетов во входе (ракурсы + изометрия + кропы). */
function realAssetCount(assets: InfographicAssets): number {
  return assets.views.length + (assets.hasIsometric ? 1 : 0) + assets.detailCrops.length;
}

/** Занятые слоты (content != null). */
function occupiedSlots(plan: SlotPlan): Slot[] {
  return plan.filter((s) => s.content !== null);
}

/** Пустые зоны (зарезервированный слот без контента). */
function emptyZones(plan: SlotPlan): Slot[] {
  return plan.filter((s) => s.content === null);
}

/** Дублированные теги среди занятых слотов (например, hero в нескольких слотах). */
function duplicateContents(plan: SlotPlan): string[] {
  const seen = new Map<string, number>();
  for (const s of occupiedSlots(plan)) {
    seen.set(s.content!, (seen.get(s.content!) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([tag]) => tag);
}

/** Уникальные теги длиной n: ["v0", "v1", ...]. */
function tags(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

// ─── Generators ────────────────────────────────────────────────────────────

/**
 * Scoped-генератор входов композитора:
 *   - views.length ∈ {1,2,3,4}
 *   - наличие/отсутствие изометрии
 *   - detailCrops.length ∈ {0..6}
 * Теги уникальны внутри каждой группы — реальные ассеты различимы.
 */
const assetsArb: fc.Arbitrary<InfographicAssets> = fc.record({
  views: fc.integer({ min: 1, max: 4 }).map((n) => tags("v", n)),
  hasIsometric: fc.boolean(),
  detailCrops: fc.integer({ min: 0, max: 6 }).map((n) => tags("c", n)),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("composeInfographic Property 5 (Bug Condition): адаптивная сборка инфографики", () => {
  // ---------------------------------------------------------------------------
  // Property 5 — число занятых слотов == число реальных ассетов, без дублей и
  // без пустых зон. Bug condition: infographic_distorted + pickFourViews
  // дублирует hero.
  //
  // Scoped PBT: views.length ∈ {1..4}, isometric присутствует/нет,
  // detailCrops ∈ {0..6}; ассертим инвариант на плане слотов.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — при views.length < 4 hero
  // дублируется в 4 фиксированных слота; при < 6 кропов / без изометрии
  // фиксированная раскладка оставляет пустые зоны.
  // Validates: Requirements 1.5, 2.5
  // ---------------------------------------------------------------------------
  it("число занятых слотов == число реальных ассетов, без дублей и пустых зон", () => {
    fc.assert(
      fc.property(assetsArb, (assets) => {
        const plan = slotPlan(assets);

        const occupied = occupiedSlots(plan);
        const empties = emptyZones(plan);
        const dups = duplicateContents(plan);
        const realCount = realAssetCount(assets);

        assert.equal(
          empties.length,
          0,
          `Найдены пустые зоны: ${JSON.stringify(
            empties.map((s) => `${s.zone}#${s.index}`),
          )}. Вход=${JSON.stringify(assets)}. ` +
            `Ожидается: только реально присутствующие ассеты, без пустых зон.`,
        );

        assert.deepEqual(
          dups,
          [],
          `Найдено дублирование ассетов в слотах: ${JSON.stringify(dups)} ` +
            `(в т.ч. hero-дубли из pickFourViews). Вход=${JSON.stringify(assets)}. ` +
            `Ожидается: каждый ассет занимает ровно один слот.`,
        );

        assert.equal(
          occupied.length,
          realCount,
          `Занятых слотов ${occupied.length}, реальных ассетов ${realCount}. ` +
            `Вход=${JSON.stringify(assets)}. ` +
            `Ожидается: число занятых слотов == число реальных ассетов.`,
        );
      }),
      { numRuns: 300 },
    );
  });

  // ---------------------------------------------------------------------------
  // Прямая проверка известного контрпримера (design.md §Examples, Группа A):
  // `viewBuffers` < 4 → `pickFourViews` дублирует hero → 4 одинаковых верхних
  // кадра.
  // EXPECTED OUTCOME на неисправленном коде: FAIL.
  // Validates: Requirements 1.5, 2.5
  // ---------------------------------------------------------------------------
  it("один реальный ракурс не должен давать 4 одинаковых кадра (hero-дубли)", () => {
    const assets: InfographicAssets = {
      views: ["v0"], // только hero
      hasIsometric: true,
      detailCrops: tags("c", 6),
    };

    const plan = slotPlan(assets);
    const viewSlots = plan.filter((s) => s.zone === "view");
    const occupiedViewSlots = viewSlots.filter((s) => s.content !== null);
    const distinctViewContents = new Set(
      occupiedViewSlots.map((s) => s.content!),
    );

    // Реальных ракурсов 1 → в ROW1 должен быть ровно 1 занятый слот.
    // Неисправленный pickFourViews заполняет 4 слота (hero ×3 дубля) →
    // занятых слотов 4 != 1 → FAIL (демонстрирует «4 одинаковых кадра»).
    assert.equal(
      occupiedViewSlots.length,
      assets.views.length,
      `ROW1 занял ${occupiedViewSlots.length} слотов при ` +
        `${assets.views.length} реальном ракурсе ` +
        `(hero продублирован в незанятые слоты). ` +
        `Ожидается: ровно ${assets.views.length} занятый слот.`,
    );

    // И ни один кадр не должен повторяться.
    assert.equal(
      distinctViewContents.size,
      occupiedViewSlots.length,
      `ROW1 содержит дублированные кадры: ${occupiedViewSlots.length} слотов, ` +
        `но лишь ${distinctViewContents.size} уникальных. ` +
        `Ожидается: каждый кадр уникален (без hero-дублей).`,
    );
  });
});
