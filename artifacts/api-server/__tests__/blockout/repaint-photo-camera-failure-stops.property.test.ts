/**
 * Property test for the repaintAll orchestrator: стойкий сбой ЛЮБОЙ из 4
 * фото-камер немедленно прекращает сборку борда и называет сбойную камеру.
 *
 * Feature: ai-design-3d-blockout, Property 25: Сбой фото-камеры прекращает
 * сборку с указанием камеры.
 *
 * **Validates: Requirements 13.4**
 *
 * Module under test:
 *   - `repaintAll` / `PhotoCameraRepaintError`
 *     from `artifacts/api-server/src/lib/blockout/repaint.ts`
 *
 * Property verified here:
 *   For any one of the 4 photo cameras (`perspective`, `cam_persp_1..4`) whose
 *   `Photoreal_Repaint` keeps failing after exhausting the per-`Depth_Map`
 *   attempt limit (Req 13.2), the orchestrator STOPS board assembly and
 *   rejects with `PhotoCameraRepaintError` whose `cameraId` is EXACTLY that
 *   camera and whose message names it (Req 13.4). The other photo cameras
 *   succeed; the budget limit is set high so the cutoff never interferes,
 *   isolating the "photo-camera failure stops with named camera" invariant.
 *
 *   The provider (`repaintFn`) and image download (`downloadFn`) are injected
 *   stubs: `repaintFn` fails for the chosen camera's `depthMapUrl` (always,
 *   exhausting retries) and succeeds for every other camera; `downloadFn`
 *   returns a `Buffer`.
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

const { repaintAll, PhotoCameraRepaintError } = await import(
  "../../src/lib/blockout/repaint.ts"
);
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

/** `depthMapUrl`, в который вшит id камеры — стаб провайдера опознаёт по нему сбойную. */
function depthUrlFor(cameraId: string): string {
  return `https://depth.example/${cameraId}`;
}

/**
 * Полный `Camera_Rig` из 6 камер (4 perspective + 1 top_ortho + 1 isometric).
 * Порядок камер во входе намеренно перемешан — свойство не должно зависеть от
 * порядка раскладки.
 */
function buildDepthMaps(): CameraDepthMap[] {
  const cameras: CameraSpec[] = [
    makeCamera("cam_iso", "isometric"),
    makeCamera("cam_persp_1", "perspective"),
    makeCamera("cam_top", "top_ortho"),
    makeCamera("cam_persp_2", "perspective"),
    makeCamera("cam_persp_3", "perspective"),
    makeCamera("cam_persp_4", "perspective"),
  ];
  return cameras.map((camera) => ({
    camera,
    depthMapUrl: depthUrlFor(camera.id),
  }));
}

// ─── Generators ──────────────────────────────────────────────────────────────

// Непустой `Shared_Style_Prompt` (Req 6.3 — единый промпт для всех карт).
const promptArb = fc.string({ minLength: 1, maxLength: 200 });

// Произвольная из 4 фото-камер: cam_persp_1..4 — её перекраска будет стойко падать.
const failingPhotoCameraArb = fc
  .integer({ min: 1, max: 4 })
  .map((n) => `cam_persp_${n}`);

// Стоимость одного успешного вызова провайдера, в копейках (неотрицательная).
const costArb = fc.integer({ min: 0, max: 500 });

// ─── Test ──────────────────────────────────────────────────────────────────

describe("repaintAll Property 25: сбой фото-камеры прекращает сборку с указанием камеры", () => {
  // ---------------------------------------------------------------------------
  // Property 25 — стойкий сбой одной из 4 фото-камер → PhotoCameraRepaintError
  // с её id, сборка прекращается. Validates: Requirements 13.4
  // ---------------------------------------------------------------------------
  it("бросает PhotoCameraRepaintError, называющий именно сбойную фото-камеру", async () => {
    await fc.assert(
      fc.asyncProperty(
        failingPhotoCameraArb,
        promptArb,
        costArb,
        async (failingCameraId, sharedStylePrompt, costKopeks) => {
          const depthMaps = buildDepthMaps();
          const failingDepthUrl = depthUrlFor(failingCameraId);

          // Высокий лимит бюджета: отсечка Cost_Budget не вмешивается, чтобы
          // изолировать инвариант «сбой фото-камеры → остановка с её id».
          const budget = createCostBudget(Number.MAX_SAFE_INTEGER);

          // Стаб провайдера: для выбранной фото-камеры ВСЕГДА бросает ошибку
          // (исчерпывает лимит попыток на Depth_Map), для остальных — успех.
          const repaintFn = async (callInput: {
            depthMapUrl: string;
            prompt: string;
            initImageUrl?: string;
            aspectRatio?: "16:9" | "4:3" | "1:1";
          }): Promise<FalGenerationResult> => {
            if (callInput.depthMapUrl === failingDepthUrl) {
              throw new Error("provider 5xx: repaint failed");
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

          // (Req 13.4) Сборка прекращается с ошибкой, называющей сбойную камеру.
          await assert.rejects(
            () =>
              repaintAll({
                depthMaps,
                sharedStylePrompt,
                budget,
                repaintFn,
                downloadFn,
              }),
            (err: unknown) => {
              assert.ok(
                err instanceof PhotoCameraRepaintError,
                `ожидался PhotoCameraRepaintError, получено ${String(err)}`,
              );
              // cameraId указывает ровно на выбранную сбойную фото-камеру.
              assert.equal(err.cameraId, failingCameraId);
              // Сообщение об ошибке называет именно эту камеру.
              assert.ok(
                err.message.includes(failingCameraId),
                `сообщение об ошибке должно содержать id камеры "${failingCameraId}", получено: ${err.message}`,
              );
              return true;
            },
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
