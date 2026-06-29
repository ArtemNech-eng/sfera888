/**
 * Property 8: Bug Condition — Разрешение и identity ракурсов.
 *
 * **Validates: Requirements 1.8, 2.8**
 *
 * Источник bug condition: `isBugConditionB(genState).low_res_views`
 *   low_res_views := genState.viewResolutionPx < NATIVE_VIEW_PX
 *                    OR NOT genState.viewsIdentityConsistent
 *   (design.md §Bug Condition B8, §Hypothesized Root Cause 6, §Examples Группа B)
 *
 * Expected Behavior (Property 8, design.md §Correctness Properties):
 *   _For any_ успешного `Hero_Render`, итоговые `views[1..4]` SHALL иметь
 *   нативное разрешение (1024×1024 БЕЗ апскейла из 512-px квадранта) и
 *   сохранённую identity (единый источник/референс), ЛИБО при недоступности
 *   identity-preserving генерации деградировать как optional-шаг без перевода
 *   проекта в `failed`.
 *
 * ─── Methodology (bugfix exploration test) ─────────────────────────────────
 * Этот тест — Bug Condition exploration. Он кодирует ОЖИДАЕМЫЙ инвариант
 * Property 8 и ДОЛЖЕН ПАДАТЬ на неисправленном коде, тем самым подтверждая
 * дефект 1.8. Чинить тест/код на этом шаге нельзя.
 *
 * Неисправленный `designWorker.ts` (шаги 2–3) генерирует ОДИН коллаж 2×2
 * 1024×1024 (`falGenerateGptImage`, text2img), затем `sharp` режет его на 4
 * квадранта 512×512 и АПСКЕЙЛИТ каждый до 1024×1024:
 *
 *     const halfW = Math.floor(W / 2);   // 1024 → 512
 *     const halfH = Math.floor(H / 2);   // 1024 → 512
 *     ...
 *     sharp(heroBuffer)
 *       .extract({ left, top, width: halfW, height: halfH })   // 512×512 пиксели
 *       .resize(1024, 1024, { fit: "cover" })                  // АПСКЕЙЛ 512 → 1024
 *
 * Итог: «нативное» разрешение каждого ракурса — 512 px (исходный квадрант),
 * раздутое до 1024 интерполяцией. Это и есть дефект B8:
 * `viewResolutionPx (512) < NATIVE_VIEW_PX (1024)`. Причём это НЕ optional-
 * деградация, а ЕДИНСТВЕННЫЙ (success) путь генерации ракурсов в текущем коде.
 *
 * Фикс (задача 11.6, design.md §F) заменит деструктивную нарезку на
 * identity-preserving edit-image нативного 1024: для ракурсов 2..4 — вызов
 * `getEditImageProvider()` → `falGenerateGptImageEdit` / `falGenerateFluxKontextPro`
 * с `image_urls=[heroUrl]`, `quality:"high"`, `input_fidelity:"high"`. Коллаж-
 * нарезка с апскейлом 512→1024 останется ТОЛЬКО в fallback-ветке (когда
 * edit-image недоступен), где angle renders деградируют как optional-шаг без
 * перевода проекта в `failed`.
 *
 * До фикса будущего экспортного контракта стратегии ракурсов ещё нет, поэтому
 * тест аккуратно деградирует к ТОЧНОЙ реплике текущей неисправленной логики
 * (коллаж 1024 → квадрант 512 → апскейл 1024, всегда как primary-путь). После
 * фикса тот же тест импортирует реальный `chooseViewStrategy` и должен ПРОЙТИ
 * (задача 12.1 — перепрогон без новых тестов).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ─── Native view resolution (design.md §Bug Condition B8: NATIVE_VIEW_PX) ────
//
// Целевое нативное разрешение каждого ракурса. Hero-коллаж — 1024×1024, и
// каждый ракурс ОБЯЗАН быть нативного 1024, а не раздутого из 512-px квадранта.
const NATIVE_VIEW_PX = 1024;

// Размер квадранта при нарезке коллажа 1024×1024 на 2×2 (Math.floor(1024/2)).
const COLLAGE_QUADRANT_PX = 512;

// ─── Future view-strategy contract (added by fix task 11.6 / design.md §F) ───
//
// Фикс §F вводит выбор стратегии генерации ракурсов 2..4. Контракт (чистый,
// без сетевых вызовов) описывает выбранную стратегию для одного ракурса:
//
//   kind                 — "primary" (identity-preserving success-путь) либо
//                          "fallback" (optional-деградация: коллаж-нарезка);
//   sourceResolutionPx   — нативное разрешение ИСХОДНЫХ пикселей до любого
//                          resize (для edit-image это 1024, для квадранта 512);
//   outputResolutionPx   — итоговое разрешение ракурса;
//   identityPreserving   — единый источник/референс (edit-image из hero).
//
// По образцу `getEditImageProvider()` / `getDesignModel()` чистый резолвер
// помещается в `designConfig.ts` и читается на момент вызова. До фикса экспорта
// нет → `mod.chooseViewStrategy` undefined → реплика неисправленной логики.
type ViewStrategy = {
  kind: "primary" | "fallback";
  mode: string;
  sourceResolutionPx: number;
  outputResolutionPx: number;
  identityPreserving: boolean;
};

type ChooseViewStrategyFn = (input: {
  editImageAvailable: boolean;
}) => ViewStrategy;

let chooseViewStrategy: ChooseViewStrategyFn | undefined;
try {
  const mod = (await import("../../src/lib/designConfig.js")) as {
    chooseViewStrategy?: ChooseViewStrategyFn;
  };
  chooseViewStrategy = mod.chooseViewStrategy;
} catch {
  chooseViewStrategy = undefined;
}

// ─── Faithful replica of the unfixed collage-slice-and-upscale path ──────────
//
// Зеркалит designWorker.ts шаги 2–3: коллаж 1024×1024 режется на квадранты
// 512×512 и каждый АПСКЕЙЛИТСЯ до 1024 (`.resize(1024,1024,{fit:"cover"})`).
// Это ЕДИНСТВЕННЫЙ путь генерации ракурсов в неисправленном коде, поэтому
// реплика всегда возвращает primary-стратегию с апскейлом, ИГНОРИРУЯ
// доступность edit-image (которого в текущем пути нет).
function unfixedCollageSliceStrategy(): ViewStrategy {
  const heroPx = NATIVE_VIEW_PX; // коллаж 1024×1024
  const quadrantPx = Math.floor(heroPx / 2); // 512×512 квадрант
  return {
    kind: "primary",
    mode: "collage_slice_upscale",
    sourceResolutionPx: quadrantPx, // 512 — нативные пиксели до апскейла
    outputResolutionPx: NATIVE_VIEW_PX, // 1024 — после .resize cover (апскейл)
    identityPreserving: false, // апскейл/рассинхрон → identity не сохранена
  };
}

/**
 * Resolve the per-view generation strategy for views 2..4.
 *   - Fixed code: delegates to the real `chooseViewStrategy()`.
 *   - Unfixed fallback: returns the collage-slice-and-upscale replica (primary
 *     path with a 512→1024 upscale), regardless of edit-image availability.
 */
function resolveViewStrategy(input: { editImageAvailable: boolean }): ViewStrategy {
  return chooseViewStrategy
    ? chooseViewStrategy(input)
    : unfixedCollageSliceStrategy();
}

// ─── Property 8 invariant (Expected Behavior) ────────────────────────────────
//
// Стратегия ракурса ПРИЕМЛЕМА, если выполнено ЛИБО:
//   (a) нативное разрешение без апскейла + сохранённая identity:
//         outputResolutionPx >= NATIVE_VIEW_PX
//         AND sourceResolutionPx >= NATIVE_VIEW_PX   (нет апскейла снизу)
//         AND identityPreserving;
//   ЛИБО
//   (b) optional-деградация (fallback-ветка), которая не переводит проект в
//       `failed` — допустима ТОЛЬКО когда edit-image недоступен.
function usedUpscale(s: ViewStrategy): boolean {
  return s.sourceResolutionPx < s.outputResolutionPx;
}

function isNativeIdentityPreserving(s: ViewStrategy): boolean {
  return (
    s.outputResolutionPx >= NATIVE_VIEW_PX &&
    s.sourceResolutionPx >= NATIVE_VIEW_PX &&
    !usedUpscale(s) &&
    s.identityPreserving
  );
}

function isOptionalDegradation(s: ViewStrategy): boolean {
  return s.kind === "fallback";
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Property 8 (Bug Condition): разрешение и identity ракурсов", () => {
  // ---------------------------------------------------------------------------
  // B8 (основной success-путь): когда identity-preserving edit-image ДОСТУПЕН,
  // выбранная стратегия ракурсов SHALL быть нативной 1024 без апскейла из
  // 512-px квадранта и с сохранённой identity (NOT low_res_views).
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — success-путь использует
  // нарезку коллажа с апскейлом 512→1024 (sourceResolutionPx=512<1024).
  // Validates: Requirements 1.8, 2.8
  // ---------------------------------------------------------------------------
  it("при доступном edit-image ракурсы нативного 1024 без апскейла из 512-px квадранта", () => {
    const s = resolveViewStrategy({ editImageAvailable: true });
    assert.ok(
      isNativeIdentityPreserving(s),
      `success-путь ракурсов неприемлем: mode="${s.mode}", kind="${s.kind}", ` +
        `source=${s.sourceResolutionPx}px, output=${s.outputResolutionPx}px, ` +
        `upscale=${usedUpscale(s)}, identity=${s.identityPreserving}. ` +
        `Ожидается нативное ${NATIVE_VIEW_PX}px без апскейла из ` +
        `${COLLAGE_QUADRANT_PX}-px квадранта (контрпример: коллаж 1024 → ` +
        `квадрант 512 → resize cover 1024 = видимый апскейл, потеря identity).`,
    );
  });

  // ---------------------------------------------------------------------------
  // Scoped PBT — выбор стратегии ракурсов: chosenViewResolution == NATIVE_VIEW_PX
  // (1024) без апскейла из 512-px квадранта, ЛИБО optional-деградация.
  //
  // Для любой доступности edit-image инвариант Property 8:
  //   editImageAvailable == true  → стратегия нативная (a);
  //   editImageAvailable == false → допустима fallback-деградация (b).
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — реплика всегда возвращает
  // primary collage-slice с апскейлом 512→1024 (не (a) и не (b)).
  // Validates: Requirements 1.8, 2.8
  // ---------------------------------------------------------------------------
  it("стратегия ракурсов: нативное 1024 без апскейла ЛИБО optional-деградация", () => {
    fc.assert(
      fc.property(fc.boolean(), (editImageAvailable) => {
        const s = resolveViewStrategy({ editImageAvailable });

        if (editImageAvailable) {
          // edit-image доступен → обязан быть нативный identity-preserving путь.
          assert.ok(
            isNativeIdentityPreserving(s),
            `edit-image доступен, но стратегия не нативная: mode="${s.mode}", ` +
              `kind="${s.kind}", source=${s.sourceResolutionPx}px, ` +
              `output=${s.outputResolutionPx}px, upscale=${usedUpscale(s)}, ` +
              `identity=${s.identityPreserving}. Ожидается ${NATIVE_VIEW_PX}px ` +
              `без апскейла из ${COLLAGE_QUADRANT_PX}-px квадранта.`,
          );
        } else {
          // edit-image недоступен → допустима нативная стратегия ИЛИ
          // optional-деградация (fallback коллаж-нарезка без `failed`).
          assert.ok(
            isNativeIdentityPreserving(s) || isOptionalDegradation(s),
            `edit-image недоступен: ожидалась нативная стратегия или ` +
              `optional-деградация (fallback), получено primary с апскейлом: ` +
              `mode="${s.mode}", source=${s.sourceResolutionPx}px → ` +
              `output=${s.outputResolutionPx}px.`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  // ---------------------------------------------------------------------------
  // Документированный контрпример (design.md §Examples Группа B):
  // «Hero-коллаж 1024×1024 → квадранты 512×512 → resize cover до 1024 → видимый
  // апскейл, ракурсы „плывут" относительно друг друга». Фиксируем, что текущий
  // success-путь нарушает Property 8 именно так: source 512 < NATIVE 1024.
  //
  // EXPECTED OUTCOME на неисправленном коде: FAIL — апскейл подтверждён.
  // Validates: Requirements 1.8, 2.8
  // ---------------------------------------------------------------------------
  it("контрпример: success-путь апскейлит квадрант 512 → 1024 (low_res_views)", () => {
    const s = resolveViewStrategy({ editImageAvailable: true });

    // low_res_views := viewResolutionPx < NATIVE_VIEW_PX OR NOT identity.
    const lowResViews =
      s.sourceResolutionPx < NATIVE_VIEW_PX || !s.identityPreserving;

    assert.equal(
      lowResViews,
      false,
      `low_res_views держится на success-пути: исходное разрешение ракурса ` +
        `${s.sourceResolutionPx}px < нативного ${NATIVE_VIEW_PX}px ` +
        `(апскейл ${COLLAGE_QUADRANT_PX}→${NATIVE_VIEW_PX}) ` +
        `или identity не сохранена (identity=${s.identityPreserving}). ` +
        `Ожидается нативная identity-preserving генерация (Property 8).`,
    );
  });
});
