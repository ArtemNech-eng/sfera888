/**
 * Integration test: R&D-прототип удержания расстановки depth-ControlNet.
 *
 * Feature: ai-design-3d-blockout, Task 14.2
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * Что проверяется (по аналогии с CLI-прототипом `scripts/blockout/prototype.ts`,
 * задача 14.1) РЕАЛЬНЫМИ сетевыми вызовами для одной комнаты / 4 фото-камер
 * `Camera_Rig`:
 *   1.1/1.2 — для одной комнаты и одного `Shared_Style_Prompt` генерируется
 *            `Photoreal_Repaint` по каждой из ровно 4 фото-камер из
 *            подготовленных `Depth_Map`;
 *   1.3     — каждая входная `Depth_Map` и соответствующий `Photoreal_Repaint`
 *            сохраняются в `Object_Storage` (R2), а тест проверяет, что
 *            возвращены 4 непустых https-URL карт глубины и 4 непустых
 *            https-URL перекрасок.
 *
 * Это РЕАЛЬНЫЙ сетевой интеграционный тест: он обращается к fal и к R2.
 * Поэтому он выполняется только при полностью настроенном живом окружении:
 *   • `FAL_API_KEY` — ключ провайдера перекраски;
 *   • `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
 *     `R2_PUBLIC_URL`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — доступ к R2.
 * Если ОТСУТСТВУЕТ хотя бы одна переменная, тест аккуратно ПРОПУСКАЕТСЯ
 * (`node:test` skip) с понятным сообщением. В CI/локальной среде без живых
 * кредов это и есть ожидаемый корректный исход.
 *
 * Запуск через встроенный тест-раннер Node (tsx --test):
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

import {
  falDepthControlNetRepaint,
  downloadImage,
  NsfwBlockedError,
} from "../../src/lib/falAi.js";
import {
  uploadDepthMaps,
  uploadRepaints,
  type DepthMapUpload,
  type RepaintUpload,
} from "../../src/lib/blockout/storage.js";

// ─── Live-окружение ──────────────────────────────────────────────────────────

/** Число фото-камер `Camera_Rig`, перекрашиваемых прототипом (Req 1.2). */
const PHOTO_CAMERA_COUNT = 4;

/** Идентификаторы фото-камер `Camera_Rig` (стабильные, как в `sceneSpec`). */
const PHOTO_CAMERA_IDS = [
  "cam_persp_1",
  "cam_persp_2",
  "cam_persp_3",
  "cam_persp_4",
] as const;

/**
 * Все переменные окружения, необходимые для РЕАЛЬНОГО прогона:
 *   • `FAL_API_KEY` — для `falDepthControlNetRepaint` (перекраска на fal);
 *   • R2-переменные — для `uploadDepthMaps` / `uploadRepaints` (загрузка в R2).
 */
const REQUIRED_LIVE_ENV = [
  "FAL_API_KEY",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_URL",
  "DEFAULT_OBJECT_STORAGE_BUCKET_ID",
] as const;

/** Возвращает список отсутствующих (пустых) обязательных переменных. */
function missingLiveEnv(): string[] {
  return REQUIRED_LIVE_ENV.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === "";
  });
}

/**
 * Готовит небольшой PNG-буфер «карты глубины» через sharp.
 *
 * Это не настоящий рендер из Blender — для R&D-прототипа достаточно валидного
 * градиентного PNG нужного размера, который провайдер примет как структурный
 * управляющий сигнал. Содержимое детерминировано на основе `seed`, чтобы все
 * 4 камеры давали разные карты.
 */
async function makeDepthPng(seed: number): Promise<Buffer> {
  const width = 256;
  const height = 192;
  const channels = 3 as const;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Простой радиальный градиент со сдвигом по seed — имитация глубины.
      const cx = width / 2 + (seed * 17) % width;
      const cy = height / 2 + (seed * 11) % height;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const v = Math.max(0, 255 - Math.floor((dist / (width / 2)) * 255));
      const offset = (y * width + x) * channels;
      raw[offset] = v;
      raw[offset + 1] = v;
      raw[offset + 2] = v;
    }
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

/** Проверяет, что строка — непустой https-URL. */
function assertHttpsUrl(url: unknown, label: string): void {
  assert.equal(typeof url, "string", `${label}: URL должен быть строкой`);
  const value = url as string;
  assert.ok(value.length > 0, `${label}: URL не должен быть пустым`);
  assert.ok(
    value.startsWith("https://"),
    `${label}: ожидался https-URL, получено "${value}"`,
  );
}

// ─── Тест ────────────────────────────────────────────────────────────────────

describe("Prototype integration: одна комната / 4 камеры fal + R2 (Task 14.2, Req 1.1, 1.2, 1.3)", () => {
  it("uploads 4 Depth_Map and 4 Photoreal_Repaint to R2 and returns non-empty https URLs", async (t) => {
    const missing = missingLiveEnv();
    if (missing.length > 0) {
      // Real-network integration test: live env не настроено здесь — пропускаем.
      const message =
        `SKIP: интеграционный тест прототипа требует живого окружения. ` +
        `Отсутствуют переменные: ${missing.join(", ")}. ` +
        `Полный прогон выполняется при заданных FAL_API_KEY + R2 ` +
        `(${REQUIRED_LIVE_ENV.join(", ")}).`;
      // eslint-disable-next-line no-console
      console.log(message);
      t.skip(message);
      return;
    }

    // Уникальный projectId, чтобы прогоны не пересекались в бакете.
    const projectId = `proto-itest-${Date.now()}`;
    const sharedStylePrompt =
      "скандинавский минимализм, тёплый дневной свет, премиальный интерьер";

    // 1. Готовим 4 небольшие Depth_Map (по одной на фото-камеру).
    const depthBuffers = await Promise.all(
      Array.from({ length: PHOTO_CAMERA_COUNT }, (_unused, idx) =>
        makeDepthPng(idx + 1),
      ),
    );

    // 2. Грузим входные Depth_Map в R2 → публичные URL (Req 1.3).
    const depthUploads: DepthMapUpload[] = depthBuffers.map((png, idx) => ({
      cameraId: PHOTO_CAMERA_IDS[idx]!,
      png,
    }));
    const depthMapUrls = await uploadDepthMaps(depthUploads, { projectId });

    assert.equal(
      depthMapUrls.length,
      PHOTO_CAMERA_COUNT,
      "должно быть ровно 4 URL карт глубины (по одному на фото-камеру)",
    );
    depthMapUrls.forEach((url, idx) =>
      assertHttpsUrl(url, `Depth_Map[${idx}]`),
    );

    // 3. Прогоняем каждую камеру через depth-ControlNet с ЕДИНЫМ промптом
    //    (Req 1.1, 1.2), скачиваем результат и собираем для загрузки.
    let totalCostKopeks = 0;
    const repaintResults: RepaintUpload[] = [];
    for (let i = 0; i < depthMapUrls.length; i += 1) {
      const cameraId = PHOTO_CAMERA_IDS[i]!;
      try {
        const result = await falDepthControlNetRepaint({
          depthMapUrl: depthMapUrls[i]!,
          prompt: sharedStylePrompt,
          aspectRatio: "4:3",
        });
        totalCostKopeks += result.costKopeks;
        const png = await downloadImage(result.imageUrl);
        repaintResults.push({ cameraId, png });
      } catch (err: unknown) {
        if (err instanceof NsfwBlockedError) {
          totalCostKopeks += err.costKopeks;
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`перекраска камеры ${cameraId} не удалась: ${reason}`);
      }
    }

    assert.equal(
      repaintResults.length,
      PHOTO_CAMERA_COUNT,
      "должно быть ровно 4 Photoreal_Repaint (по одному на фото-камеру)",
    );

    // 4. Грузим каждый Photoreal_Repaint в R2 → публичные URL (Req 1.3).
    const repaintUrls = await uploadRepaints(repaintResults, { projectId });

    assert.equal(
      repaintUrls.length,
      PHOTO_CAMERA_COUNT,
      "должно быть ровно 4 URL перекрасок (по одному на фото-камеру)",
    );
    repaintUrls.forEach((url, idx) =>
      assertHttpsUrl(url, `Photoreal_Repaint[${idx}]`),
    );

    // Стоимость по всем вызовам провайдера должна быть неотрицательной.
    assert.ok(
      totalCostKopeks >= 0,
      "суммарная стоимость в копейках должна быть неотрицательной",
    );

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        { projectId, depthMapUrls, repaintUrls, totalCostKopeks },
        null,
        2,
      ),
    );
  });
});
