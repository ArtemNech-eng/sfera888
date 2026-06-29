/**
 * Property test for the repaintAll orchestrator: число попыток перекраски
 * одной `Depth_Map` ограничено фиксированным лимитом (Req 13.2).
 *
 * Feature: ai-design-3d-blockout, Property 23: Число попыток на Depth_Map
 * ограничено.
 *
 * **Validates: Requirements 13.2**
 *
 * Module under test:
 *   - `repaintAll` from `artifacts/api-server/src/lib/blockout/repaint.ts`
 *
 * Property verified here:
 *   For any `Depth_Map` for which the provider (`repaintFn`) CONSISTENTLY
 *   throws an error, the number of provider calls for THAT map does not
 *   exceed the fixed attempt limit `maxAttempts`, after which a failure for
 *   that map is recorded:
 *     • a failing PERSPECTIVE (photo) camera stops the board build with a
 *       `PhotoCameraRepaintError` naming that camera (Req 13.4), and the
 *       provider was called for its map EXACTLY `maxAttempts` times (Req 13.2);
 *     • a failing ISOMETRIC / TOP_ORTHO camera degrades to `null` without
 *       failing the build (Req 13.3), again after EXACTLY `maxAttempts`
 *       provider calls for its map (Req 13.2).
 *
 *   The provider (`repaintFn`) and image download (`downloadFn`) are injected
 *   stubs: `repaintFn` counts calls per `depthMapUrl`. The camera whose map is
 *   chosen to fail always throws; all other maps succeed. `Cost_Budget` is
 *   created with a high limit so the budget cutoff never interferes — this
 *   isolates the attempt-limit invariant from the budget cutoff (Req 12.5).
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

/**
 * Полный `Camera_Rig` из 6 камер (4 perspective + 1 top_ortho + 1 isometric),
 * каждой сопоставлен свой `depthMapUrl` (`map://<cameraId>`), чтобы счётчик
 * вызовов провайдера можно было разнести по картам.
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
    depthMapUrl: `map://${camera.id}`,
  }));
}

/** Ошибка провайдера, имитирующая стойкий сбой `Depth_ControlNet_Provider`. */
class FakeProviderError extends Error {
  constructor(cameraId: string) {
    super(`fake provider failure for ${cameraId}`);
    this.name = "FakeProviderError";
  }
}

/**
 * Строит стаб провайдера, который ВСЕГДА бросает для карты `failingUrl`, а для
 * остальных карт возвращает успешный `FalGenerationResult`. Счётчик вызовов по
 * каждому `depthMapUrl` пишется в переданную Map.
 */
function makeRepaintFn(
  failingUrl: string,
  callsByUrl: Map<string, number>,
): (input: {
  depthMapUrl: string;
  prompt: string;
  initImageUrl?: string;
  aspectRatio?: "16:9" | "4:3" | "1:1";
}) => Promise<FalGenerationResult> {
  return async (callInput) => {
    callsByUrl.set(
      callInput.depthMapUrl,
      (callsByUrl.get(callInput.depthMapUrl) ?? 0) + 1,
    );
    if (callInput.depthMapUrl === failingUrl) {
      throw new FakeProviderError(callInput.depthMapUrl);
    }
    return {
      imageUrl: `${callInput.depthMapUrl}#repaint`,
      width: 1024,
      height: 1024,
      generationMs: 1,
      costKopeks: 1,
    };
  };
}

/** Стаб загрузки изображения: буфер без сети. */
const downloadFn = async (_imageUrl: string): Promise<Buffer> =>
  Buffer.from("repaint");

// ─── Generators ──────────────────────────────────────────────────────────────

// Произвольный лимит попыток на `Depth_Map` (Req 13.2).
const maxAttemptsArb = fc.integer({ min: 1, max: 5 });
// Непустой `Shared_Style_Prompt`.
const promptArb = fc.string({ minLength: 1, maxLength: 50 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("repaintAll Property 23: число попыток на Depth_Map ограничено", () => {
  // ---------------------------------------------------------------------------
  // Property 23 (photo camera) — стойкий сбой фото-камеры: провайдер вызван по
  // её карте РОВНО maxAttempts раз, после чего сборка прекращается
  // PhotoCameraRepaintError с именем этой камеры (Req 13.2 + 13.4).
  // Validates: Requirements 13.2
  // ---------------------------------------------------------------------------
  it("ограничивает число вызовов по карте сбойной фото-камеры лимитом maxAttempts и бросает PhotoCameraRepaintError", async () => {
    await fc.assert(
      fc.asyncProperty(
        maxAttemptsArb,
        promptArb,
        // Какая из 4 фото-камер сбоит (по индексу сортировки cam_persp_1..4).
        fc.integer({ min: 1, max: 4 }),
        async (maxAttempts, sharedStylePrompt, perspIndex) => {
          const depthMaps = buildDepthMaps();
          const failingCameraId = `cam_persp_${perspIndex}`;
          const failingUrl = `map://${failingCameraId}`;

          // Высокий лимит бюджета: отсечка по Cost_Budget не вмешивается.
          const budget = createCostBudget(Number.MAX_SAFE_INTEGER);
          const callsByUrl = new Map<string, number>();
          const repaintFn = makeRepaintFn(failingUrl, callsByUrl);

          // Стойкий сбой фото-камеры → PhotoCameraRepaintError (Req 13.4).
          await assert.rejects(
            repaintAll({
              depthMaps,
              sharedStylePrompt,
              budget,
              maxAttempts,
              repaintFn,
              downloadFn,
            }),
            (err: unknown) => {
              assert.ok(
                err instanceof PhotoCameraRepaintError,
                `ожидался PhotoCameraRepaintError, получено ${String(err)}`,
              );
              assert.equal(
                (err as InstanceType<typeof PhotoCameraRepaintError>).cameraId,
                failingCameraId,
                "ошибка должна называть именно сбойную фото-камеру",
              );
              return true;
            },
          );

          // (Req 13.2) По карте сбойной камеры провайдер вызван РОВНО maxAttempts
          // раз — не больше лимита, и попытки исчерпаны до фиксации отказа.
          assert.equal(
            callsByUrl.get(failingUrl) ?? 0,
            maxAttempts,
            `по карте ${failingUrl} ожидалось ровно ${maxAttempts} вызовов, ` +
              `получено ${callsByUrl.get(failingUrl) ?? 0}`,
          );

          // Ни по одной карте число вызовов не превышает лимит.
          for (const [url, count] of callsByUrl) {
            assert.ok(
              count <= maxAttempts,
              `по карте ${url} число вызовов ${count} превысило лимит ${maxAttempts}`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Property 23 (iso/top camera) — стойкий сбой изометрической / ортографической
  // камеры: провайдер вызван по её карте РОВНО maxAttempts раз, после чего слот
  // деградирует в null, сборка продолжается (Req 13.2 + 13.3).
  // Validates: Requirements 13.2
  // ---------------------------------------------------------------------------
  it("ограничивает число вызовов по карте сбойной iso/top камеры лимитом maxAttempts и деградирует слот в null", async () => {
    await fc.assert(
      fc.asyncProperty(
        maxAttemptsArb,
        promptArb,
        fc.constantFrom("cam_iso", "cam_top"),
        async (maxAttempts, sharedStylePrompt, failingCameraId) => {
          const depthMaps = buildDepthMaps();
          const failingUrl = `map://${failingCameraId}`;

          const budget = createCostBudget(Number.MAX_SAFE_INTEGER);
          const callsByUrl = new Map<string, number>();
          const repaintFn = makeRepaintFn(failingUrl, callsByUrl);

          // Стойкий сбой iso/top → деградация в null, БЕЗ падения сборки (Req 13.3).
          const result = await repaintAll({
            depthMaps,
            sharedStylePrompt,
            budget,
            maxAttempts,
            repaintFn,
            downloadFn,
          });

          // Деградировавший слот == null; все 4 фото-камеры успешны.
          assert.equal(result.repaints.photoViews.length, 4);
          if (failingCameraId === "cam_iso") {
            assert.equal(result.repaints.isometric, null);
            assert.notEqual(result.repaints.topDown, null);
          } else {
            assert.equal(result.repaints.topDown, null);
            assert.notEqual(result.repaints.isometric, null);
          }
          assert.equal(result.repaintUrls[failingCameraId], null);

          // (Req 13.2) По карте сбойной камеры провайдер вызван РОВНО maxAttempts раз.
          assert.equal(
            callsByUrl.get(failingUrl) ?? 0,
            maxAttempts,
            `по карте ${failingUrl} ожидалось ровно ${maxAttempts} вызовов, ` +
              `получено ${callsByUrl.get(failingUrl) ?? 0}`,
          );

          // Ни по одной карте число вызовов не превышает лимит.
          for (const [url, count] of callsByUrl) {
            assert.ok(
              count <= maxAttempts,
              `по карте ${url} число вызовов ${count} превысило лимит ${maxAttempts}`,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
