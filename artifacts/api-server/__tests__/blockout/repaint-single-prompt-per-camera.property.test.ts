/**
 * Property test for the repaintAll orchestrator: один единый
 * `Shared_Style_Prompt` и ровно одна перекраска на камеру `Camera_Rig`.
 *
 * Feature: ai-design-3d-blockout, Property 14: Единый промпт и одна
 * перекраска на камеру.
 *
 * **Validates: Requirements 6.3, 6.4**
 *
 * Module under test:
 *   - `repaintAll` from `artifacts/api-server/src/lib/blockout/repaint.ts`
 *
 * Property verified here:
 *   For any set of project `Depth_Maps` (a complete `Camera_Rig` of 6 cameras
 *   — 4 perspective + 1 top_ortho + 1 isometric — with arbitrary
 *   `depthMapUrl`s), the orchestrator makes EXACTLY one provider call per
 *   camera (the number of `Photoreal_Repaint` equals the number of cameras:
 *   6 calls → 4 `photoViews` + `isometric` + `topDown` produced, Req 6.4),
 *   and every call receives the SAME `Shared_Style_Prompt` (Req 6.3).
 *
 *   The provider (`repaintFn`) and image download (`downloadFn`) are injected
 *   stubs: `repaintFn` records each call's prompt and returns a successful
 *   `FalGenerationResult`; `downloadFn` returns a `Buffer`. `Cost_Budget` is
 *   created with a high limit so the budget cutoff never interferes — this
 *   isolates the "one call per camera, same prompt" invariant.
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

/**
 * Полный `Camera_Rig` из 6 камер (4 perspective + 1 top_ortho + 1 isometric),
 * каждой сопоставлен свой `depthMapUrl`. Порядок камер во входе намеренно
 * перемешан, чтобы свойство не зависело от порядка раскладки.
 */
function buildDepthMaps(urls: readonly string[]): CameraDepthMap[] {
  const cameras: CameraSpec[] = [
    makeCamera("cam_iso", "isometric"),
    makeCamera("cam_persp_1", "perspective"),
    makeCamera("cam_top", "top_ortho"),
    makeCamera("cam_persp_2", "perspective"),
    makeCamera("cam_persp_3", "perspective"),
    makeCamera("cam_persp_4", "perspective"),
  ];
  return cameras.map((camera, i) => ({ camera, depthMapUrl: urls[i] }));
}

// ─── Generators ──────────────────────────────────────────────────────────────

// Непустой `Shared_Style_Prompt` (Req 6.3 — единый промпт для всех карт).
const promptArb = fc.string({ minLength: 1, maxLength: 200 });

// Шесть произвольных URL для `Depth_Map` — по одному на камеру.
const urlsArb = fc.array(fc.webUrl(), { minLength: 6, maxLength: 6 });

// Стоимость одного успешного вызова провайдера, в копейках (неотрицательная).
const costArb = fc.integer({ min: 0, max: 500 });

// ─── Test ──────────────────────────────────────────────────────────────────

describe("repaintAll Property 14: единый промпт и одна перекраска на камеру", () => {
  // ---------------------------------------------------------------------------
  // Property 14 — ровно один вызов провайдера на камеру (6 = числу камер),
  // и все вызовы получают один и тот же Shared_Style_Prompt.
  // Validates: Requirements 6.3, 6.4
  // ---------------------------------------------------------------------------
  it("делает ровно один вызов на камеру и передаёт единый Shared_Style_Prompt во все вызовы", async () => {
    await fc.assert(
      fc.asyncProperty(
        urlsArb,
        promptArb,
        costArb,
        async (urls, sharedStylePrompt, costKopeks) => {
          const depthMaps = buildDepthMaps(urls);

          // Высокий лимит бюджета: отсечка по Cost_Budget не вмешивается,
          // чтобы изолировать инвариант «один вызов на камеру, единый промпт».
          const budget = createCostBudget(Number.MAX_SAFE_INTEGER);

          // Стаб провайдера: записывает промпт каждого вызова и возвращает
          // успешный FalGenerationResult.
          const capturedPrompts: string[] = [];
          const repaintFn = async (callInput: {
            depthMapUrl: string;
            prompt: string;
            initImageUrl?: string;
            aspectRatio?: "16:9" | "4:3" | "1:1";
          }): Promise<FalGenerationResult> => {
            capturedPrompts.push(callInput.prompt);
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

          const result = await repaintAll({
            depthMaps,
            sharedStylePrompt,
            budget,
            repaintFn,
            downloadFn,
          });

          // (Req 6.4) Ровно один вызов провайдера на камеру: 6 камер → 6 вызовов.
          assert.equal(
            capturedPrompts.length,
            depthMaps.length,
            `ожидалось по одному вызову на каждую из ${depthMaps.length} камер, получено ${capturedPrompts.length}`,
          );

          // (Req 6.4) Число Photoreal_Repaint = числу камер: 4 photoViews + iso + topDown.
          assert.equal(result.repaints.photoViews.length, 4);
          assert.notEqual(result.repaints.isometric, null);
          assert.notEqual(result.repaints.topDown, null);
          const producedCount =
            result.repaints.photoViews.length +
            (result.repaints.isometric === null ? 0 : 1) +
            (result.repaints.topDown === null ? 0 : 1);
          assert.equal(producedCount, depthMaps.length);

          // (Req 6.3) Каждый перехваченный промпт равен единому Shared_Style_Prompt.
          for (const prompt of capturedPrompts) {
            assert.equal(
              prompt,
              sharedStylePrompt,
              "все вызовы провайдера должны получать один и тот же Shared_Style_Prompt",
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
