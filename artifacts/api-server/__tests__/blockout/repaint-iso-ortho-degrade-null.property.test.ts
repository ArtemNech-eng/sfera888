/**
 * Property test for the repaintAll orchestrator: деградация изометрической и
 * ортографической (вид сверху) камер в `null` при стойком сбое перекраски,
 * с продолжением сборки борда и заполнением остальных (успешных) слотов.
 *
 * Feature: ai-design-3d-blockout, Property 24: Деградация изометрии/ортографии
 * в null.
 *
 * **Validates: Requirements 13.3**
 *
 * Module under test:
 *   - `repaintAll` from `artifacts/api-server/src/lib/blockout/repaint.ts`
 *
 * Property verified here:
 *   For any subset of {isometric, top_ortho} cameras whose repaint
 *   consistently fails (after exhausting the attempt limit), while all 4
 *   perspective (photo) cameras succeed, the orchestrator:
 *     • degrades the corresponding `BlockoutRepaints` slot to `null`
 *       (`isometric` for the iso camera, `topDown` for the top_ortho camera);
 *     • continues board assembly without throwing;
 *     • fills the 4 `photoViews` slots and the other (successful) iso/ortho
 *       slot with a `Buffer`.
 *
 *   The provider (`repaintFn`) and image download (`downloadFn`) are injected
 *   stubs: `repaintFn` succeeds for all perspective cameras and fails for the
 *   generated failing subset of {iso, top}; `downloadFn` returns a `Buffer`.
 *   `Cost_Budget` is created with a high limit so the budget cutoff never
 *   interferes — this isolates the iso/ortho → null degradation invariant.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { CameraDepthMap } from "../../src/lib/blockout/repaint.js";
import type { FalGenerationResult } from "../../src/lib/falAi.js";
import type { CameraSpec } from "../../src/lib/blockout/sceneSpec.js";

// `repaint.ts` → `designCostGuard.ts` imports `@workspace/db`, which **throws**
// at module-eval time when `DATABASE_URL` is missing (it constructs a pg.Pool).
// Static `import` declarations are hoisted above regular code, so set a fake
// DSN here and pull the modules in via dynamic `await import(...)` below. The
// pool is lazy — none of the properties here run a query.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

const { repaintAll } = await import("../../src/lib/blockout/repaint.ts");
const { createCostBudget } = await import("../../src/lib/designCostGuard.ts");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORIGIN = { x: 0, y: 0, z: 0 };
const CENTER = { x: 1, y: 1, z: 1 };

/** Камера `Camera_Rig` с заданными id/role и фиктивной (но валидной) геометрией. */
function makeCamera(id: string, role: CameraSpec["role"]): CameraSpec {
  return {
    id,
    role,
    position: { ...ORIGIN },
    target: { ...CENTER },
  };
}

// Стабильные id для iso/top, чтобы repaintFn умел распознать сбойную камеру
// по `depthMapUrl` (URL содержит id камеры).
const ISO_ID = "cam_iso";
const TOP_ID = "cam_top";

/**
 * Полный `Camera_Rig` из 6 камер (4 perspective + 1 top_ortho + 1 isometric).
 * Каждой камере сопоставлен `depthMapUrl`, содержащий её id, — это позволяет
 * стабу провайдера решать, провалить вызов или нет. Порядок намеренно
 * перемешан, чтобы свойство не зависело от порядка раскладки.
 */
function buildDepthMaps(): CameraDepthMap[] {
  const cameras: CameraSpec[] = [
    makeCamera(ISO_ID, "isometric"),
    makeCamera("cam_persp_1", "perspective"),
    makeCamera(TOP_ID, "top_ortho"),
    makeCamera("cam_persp_2", "perspective"),
    makeCamera("cam_persp_3", "perspective"),
    makeCamera("cam_persp_4", "perspective"),
  ];
  return cameras.map((camera) => ({
    camera,
    depthMapUrl: `https://r2.example/depth/${camera.id}.png`,
  }));
}

// ─── Generators ──────────────────────────────────────────────────────────────

// Непустой `Shared_Style_Prompt`.
const promptArb = fc.string({ minLength: 1, maxLength: 200 });

// Произвольное подмножество {isometric, top_ortho}, чья перекраска стойко
// проваливается. Каждый флаг независим — покрывает все 4 комбинации
// (никто/только iso/только top/оба).
const failingSubsetArb = fc.record({
  isoFails: fc.boolean(),
  topFails: fc.boolean(),
});

// Стоимость одного успешного вызова провайдера, в копейках (неотрицательная).
const costArb = fc.integer({ min: 0, max: 500 });

// ─── Test ──────────────────────────────────────────────────────────────────

describe("repaintAll Property 24: деградация изометрии/ортографии в null", () => {
  // ---------------------------------------------------------------------------
  // Property 24 — стойкий сбой подмножества {iso, top} → соответствующие слоты
  // null, сборка продолжается, остальные слоты заполнены. 4 photoViews всегда.
  // Validates: Requirements 13.3
  // ---------------------------------------------------------------------------
  it("ставит null для стойко сбойных iso/top, заполняет остальные слоты и не падает", async () => {
    await fc.assert(
      fc.asyncProperty(
        failingSubsetArb,
        promptArb,
        costArb,
        async ({ isoFails, topFails }, sharedStylePrompt, costKopeks) => {
          const depthMaps = buildDepthMaps();

          // Высокий лимит бюджета: отсечка по Cost_Budget не вмешивается,
          // чтобы изолировать инвариант деградации iso/ortho → null.
          const budget = createCostBudget(Number.MAX_SAFE_INTEGER);

          // Стаб провайдера: успешен для всех 4 фото-камер; стойко (на каждой
          // попытке) проваливается для сгенерированного подмножества {iso, top}.
          const repaintFn = async (callInput: {
            depthMapUrl: string;
            prompt: string;
            initImageUrl?: string;
            aspectRatio?: "16:9" | "4:3" | "1:1";
          }): Promise<FalGenerationResult> => {
            const isIso = callInput.depthMapUrl.includes(ISO_ID);
            const isTop = callInput.depthMapUrl.includes(TOP_ID);
            if ((isIso && isoFails) || (isTop && topFails)) {
              throw new Error(
                `провайдер стойко не смог перекрасить ${callInput.depthMapUrl}`,
              );
            }
            return {
              imageUrl: `${callInput.depthMapUrl}#repaint`,
              width: 1024,
              height: 1024,
              generationMs: 1,
              costKopeks,
            };
          };

          // Стаб загрузки изображения: возвращает буфер без сети.
          const downloadFn = async (_imageUrl: string): Promise<Buffer> =>
            Buffer.from("repaint");

          // (Req 13.3) Сборка продолжается и НЕ бросает, несмотря на сбой
          // iso/ortho.
          const result = await repaintAll({
            depthMaps,
            sharedStylePrompt,
            budget,
            repaintFn,
            downloadFn,
          });

          // 4 фото-камеры успешны → ровно 4 буфера в photoViews.
          assert.equal(
            result.repaints.photoViews.length,
            4,
            "ожидалось 4 буфера photoViews от успешных фото-камер",
          );
          for (const view of result.repaints.photoViews) {
            assert.ok(
              Buffer.isBuffer(view),
              "каждый photoView должен быть Buffer",
            );
          }

          // (Req 13.3) isometric === null тогда и только тогда, когда iso-камера
          // была в сбойном подмножестве; иначе — Buffer.
          if (isoFails) {
            assert.equal(
              result.repaints.isometric,
              null,
              "изометрия должна деградировать в null при стойком сбое",
            );
          } else {
            assert.ok(
              Buffer.isBuffer(result.repaints.isometric),
              "изометрия должна быть Buffer при успешной перекраске",
            );
          }

          // (Req 13.3) topDown === null тогда и только тогда, когда top_ortho
          // была в сбойном подмножестве; иначе — Buffer.
          if (topFails) {
            assert.equal(
              result.repaints.topDown,
              null,
              "вид сверху должен деградировать в null при стойком сбое",
            );
          } else {
            assert.ok(
              Buffer.isBuffer(result.repaints.topDown),
              "вид сверху должен быть Buffer при успешной перекраске",
            );
          }

          // Карта URL согласована со слотами: null для деградировавших,
          // непустая строка для успешных.
          assert.equal(
            result.repaintUrls[ISO_ID],
            isoFails ? null : `https://r2.example/depth/${ISO_ID}.png#repaint`,
          );
          assert.equal(
            result.repaintUrls[TOP_ID],
            topFails ? null : `https://r2.example/depth/${TOP_ID}.png#repaint`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
