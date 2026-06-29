/**
 * repaintAll — оркестрация перекраски `Depth_Map` для пайплайна
 * AI_Design_3D_Blockout (подход B2).
 *
 * См. `.kiro/specs/ai-design-3d-blockout/design.md` секции
 * «5. Blockout_Pipeline orchestrator → step repaintAll» и «Error Handling»,
 * а также `requirements.md` Requirement 6.3/6.4, 12.5, 13.2/13.3/13.4.
 *
 * Что делает этот модуль (задача 11.1):
 *   • для каждой камеры `Camera_Rig` делает РОВНО один (логически — на камеру)
 *     вызов `falDepthControlNetRepaint` с единым `Shared_Style_Prompt`; число
 *     `Photoreal_Repaint` равно числу камер (Req 6.3, 6.4);
 *   • повторяет вызов в пределах фиксированного лимита попыток на `Depth_Map`
 *     при ошибке провайдера (Req 13.2);
 *   • при стойком сбое изометрической или ортографической камеры (после
 *     исчерпания попыток) ставит соответствующий слот в `null` и продолжает
 *     сборку; остальные камеры при этом обрабатываются немедленно (Req 13.3);
 *   • при стойком сбое ЛЮБОЙ из 4 фото-камер немедленно прекращает сборку и
 *     бросает ошибку, называющую сбойную камеру (Req 13.4);
 *   • интегрируется с `Cost_Budget`: перед каждым вызовом провайдера —
 *     `budget.ensureWithinBudget()` (отсечка по верхней границе, Req 12.5),
 *     после каждого — `budget.record(costKopeks)`, включая стоимость
 *     NSFW-отказа (`NsfwBlockedError.costKopeks`, Req 6.7).
 *
 * Результат — `BlockoutRepaints` (4 фото-перекраски + изометрия|null + вид
 * сверху|null), готовый к передаче в `buildInfographicInput`
 * (`composerAdapter.ts`), плюс карта URL перекрасок по `id` камеры и итоговая
 * стоимость в копейках для вывода пайплайна.
 */

import {
  falDepthControlNetRepaint,
  downloadImage,
  NsfwBlockedError,
  type FalGenerationResult,
} from "../falAi.js";
import {
  CostBudget,
  CostBudgetExceededError,
} from "../designCostGuard.js";
import type { CameraSpec } from "./sceneSpec.js";
import {
  EXPECTED_PHOTO_VIEW_COUNT,
  type BlockoutRepaints,
} from "./composerAdapter.js";

/**
 * Фиксированный лимит попыток на одну `Depth_Map` (Req 13.2). Гарантирует
 * верхнюю границу числа вызовов провайдера по карте и удержание бюджета
 * (Property 23). 1 первичная попытка + 2 ретрая.
 */
export const DEFAULT_MAX_REPAINT_ATTEMPTS = 3;

/**
 * Одна `Depth_Map`, привязанная к камере `Camera_Rig`. Перед перекраской
 * карты уже загружены в `Object_Storage` (`uploadDepthMaps`), поэтому здесь
 * передаётся публичный/signed URL.
 */
export interface CameraDepthMap {
  /** Камера `Camera_Rig`, чью `Depth_Map` перекрашиваем. */
  camera: CameraSpec;
  /** Публичный/signed URL `Depth_Map` в R2 — структурный управляющий сигнал. */
  depthMapUrl: string;
}

/**
 * Вход `repaintAll`. Внешние зависимости (`repaintFn`, `downloadFn`)
 * вынесены в опции для тестируемости без сетевых вызовов; в проде
 * используются реальные `falDepthControlNetRepaint` / `downloadImage`.
 */
export interface RepaintAllInput {
  /** `Depth_Map` всех камер `Camera_Rig` проекта. */
  depthMaps: CameraDepthMap[];
  /** Единый `Shared_Style_Prompt`, применяемый ко всем картам (Req 6.3). */
  sharedStylePrompt: string;
  /** Аккумулятор `Cost_Budget` (учёт стоимости и отсечка, Req 12.4, 12.5). */
  budget: CostBudget;
  /** Целевой aspect-ratio выходных перекрасок. */
  aspectRatio?: "16:9" | "4:3" | "1:1";
  /** Лимит попыток на `Depth_Map` (Req 13.2); по умолчанию 3. */
  maxAttempts?: number;
  /** Перекраска провайдером (инъекция для тестов). */
  repaintFn?: (input: {
    depthMapUrl: string;
    prompt: string;
    initImageUrl?: string;
    aspectRatio?: "16:9" | "4:3" | "1:1";
  }) => Promise<FalGenerationResult>;
  /** Загрузка готового изображения в буфер (инъекция для тестов). */
  downloadFn?: (imageUrl: string) => Promise<Buffer>;
}

/**
 * Перекраска одной камеры: буфер изображения и его публичный URL.
 */
export interface CameraRepaint {
  /** Буфер `Photoreal_Repaint` для слота композитора. */
  buffer: Buffer;
  /** URL перекраски (для повторной публикации / вывода пайплайна). */
  url: string;
  /** Стоимость успешного вызова, в копейках. */
  costKopeks: number;
}

/**
 * Результат `repaintAll`: перекраски по слотам композитора, карта URL по `id`
 * камеры (включая `null` для деградировавших iso/ortho) и итоговая стоимость
 * в копейках по всем вызовам провайдера (Req 12.4).
 */
export interface RepaintAllResult {
  /** Перекраски, готовые для `buildInfographicInput`. */
  repaints: BlockoutRepaints;
  /** URL перекрасок по `id` камеры; `null` — деградировавшая iso/ortho. */
  repaintUrls: Record<string, string | null>;
  /** Итоговая стоимость по всем вызовам провайдера, в копейках. */
  totalCostKopeks: number;
}

/**
 * Стойкий сбой перекраски одной из 4 фото-камер после исчерпания попыток
 * (Req 13.4). Несёт `cameraId` сбойной камеры, чтобы сообщение об ошибке
 * называло именно её, и `cause` — последнюю ошибку провайдера.
 */
export class PhotoCameraRepaintError extends Error {
  /** Идентификатор сбойной фото-камеры. */
  public readonly cameraId: string;
  /** Последняя ошибка провайдера по этой камере. */
  public readonly cause: unknown;

  constructor(cameraId: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `Перекраска фото-камеры "${cameraId}" не удалась после исчерпания ` +
        `попыток; сборка борда прекращена. Причина: ${reason}`,
    );
    this.name = "PhotoCameraRepaintError";
    this.cameraId = cameraId;
    this.cause = cause;
    // Восстанавливаем prototype chain после `extends Error` (TS issue #13965).
    Object.setPrototypeOf(this, PhotoCameraRepaintError.prototype);
  }
}

/**
 * Перекрашивает одну `Depth_Map` с ретраями в пределах фиксированного лимита
 * попыток (Req 13.2).
 *
 * Перед КАЖДЫМ вызовом провайдера проверяется `Cost_Budget`
 * (`ensureWithinBudget`): если бюджет уже превышен, бросается
 * `CostBudgetExceededError` и пробрасывается наверх — это прекращает все
 * дальнейшие вызовы провайдера (Req 12.5). После каждого завершившегося
 * вызова его стоимость учитывается в бюджете, включая NSFW-отказ
 * (`NsfwBlockedError.costKopeks`, Req 6.7).
 *
 * @returns успешную перекраску камеры.
 * @throws {CostBudgetExceededError} при срабатывании отсечки бюджета.
 * @throws последнюю ошибку провайдера, если все попытки исчерпаны.
 */
async function repaintCameraWithRetries(
  depthMap: CameraDepthMap,
  prompt: string,
  budget: CostBudget,
  maxAttempts: number,
  repaintFn: NonNullable<RepaintAllInput["repaintFn"]>,
  downloadFn: NonNullable<RepaintAllInput["downloadFn"]>,
  aspectRatio?: "16:9" | "4:3" | "1:1",
): Promise<CameraRepaint> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Отсечка ДО вызова провайдера (Req 12.5). Превышение бюджета —
    // не «ошибка камеры», а остановка всего пайплайна, поэтому пробрасываем.
    budget.ensureWithinBudget();

    try {
      const result = await repaintFn({
        depthMapUrl: depthMap.depthMapUrl,
        prompt,
        aspectRatio,
      });
      // Успешный вызов: учитываем стоимость (Req 12.4).
      budget.record(result.costKopeks);
      const buffer = await downloadFn(result.imageUrl);
      return { buffer, url: result.imageUrl, costKopeks: result.costKopeks };
    } catch (err) {
      // Отсечку бюджета не глушим ретраями — она останавливает пайплайн.
      if (err instanceof CostBudgetExceededError) {
        throw err;
      }
      // NSFW-отказ всё равно стоит денег — учитываем стоимость (Req 6.7),
      // затем трактуем как сбой попытки по этой карте (Req 13.2).
      if (err instanceof NsfwBlockedError) {
        budget.record(err.costKopeks);
      }
      lastError = err;
      // Иначе — обычная ошибка провайдера/загрузки: следующая попытка.
    }
  }

  // Попытки исчерпаны — фиксируем отказ по этой `Depth_Map` (Req 13.2).
  throw (
    lastError ??
    new Error(
      `Перекраска камеры "${depthMap.camera.id}" не удалась за ${maxAttempts} попыток`,
    )
  );
}

/**
 * Перекрашивает камеру, деградируя в `null` при стойком сбое (Req 13.3).
 * Отсечка бюджета (`CostBudgetExceededError`) пробрасывается наверх — она
 * прекращает весь пайплайн, а не только эту камеру.
 */
async function repaintOrNull(
  depthMap: CameraDepthMap,
  prompt: string,
  budget: CostBudget,
  maxAttempts: number,
  repaintFn: NonNullable<RepaintAllInput["repaintFn"]>,
  downloadFn: NonNullable<RepaintAllInput["downloadFn"]>,
  aspectRatio?: "16:9" | "4:3" | "1:1",
): Promise<CameraRepaint | null> {
  try {
    return await repaintCameraWithRetries(
      depthMap,
      prompt,
      budget,
      maxAttempts,
      repaintFn,
      downloadFn,
      aspectRatio,
    );
  } catch (err) {
    if (err instanceof CostBudgetExceededError) {
      throw err;
    }
    // Стойкий сбой iso/ortho → деградация в null, сборка продолжается.
    return null;
  }
}

/**
 * Оркестрирует перекраску всех `Depth_Map` проекта одним
 * `Shared_Style_Prompt`.
 *
 * Порядок обработки: сначала 4 фото-камеры (`perspective`), затем
 * изометрия (`isometric`) и вид сверху (`top_ortho`). Фото-камеры
 * сортируются по `id` (`cam_persp_1..4`), чтобы детерминированно лечь в
 * `views[0..3]` композитора (Req 8.1).
 *
 * Поведение при сбоях:
 *   • стойкий сбой фото-камеры → `PhotoCameraRepaintError` с её `id`
 *     (немедленная остановка, Req 13.4);
 *   • стойкий сбой iso/ortho → соответствующий слот `null`, сборка
 *     продолжается (Req 13.3);
 *   • превышение `Cost_Budget` → `CostBudgetExceededError` пробрасывается
 *     наверх, прекращая все вызовы (Req 12.5).
 *
 * @throws {Error} если состав камер не соответствует `Camera_Rig`
 *   (не 4 фото-камеры, нет iso/ortho).
 * @throws {PhotoCameraRepaintError} при стойком сбое фото-камеры (Req 13.4).
 * @throws {CostBudgetExceededError} при срабатывании отсечки бюджета (Req 12.5).
 */
export async function repaintAll(
  input: RepaintAllInput,
): Promise<RepaintAllResult> {
  const {
    depthMaps,
    sharedStylePrompt,
    budget,
    aspectRatio,
    maxAttempts = DEFAULT_MAX_REPAINT_ATTEMPTS,
    repaintFn = falDepthControlNetRepaint,
    downloadFn = downloadImage,
  } = input;

  if (!(budget instanceof CostBudget)) {
    throw new Error("repaintAll: требуется аккумулятор Cost_Budget (budget)");
  }
  if (typeof sharedStylePrompt !== "string" || sharedStylePrompt.length === 0) {
    throw new Error("repaintAll: Shared_Style_Prompt должен быть непустой строкой");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(
      `repaintAll: maxAttempts должно быть целым >= 1, получено ${maxAttempts}`,
    );
  }

  // Раскладываем камеры по ролям `Camera_Rig`.
  const perspective = depthMaps
    .filter((dm) => dm.camera.role === "perspective")
    .sort((a, b) => a.camera.id.localeCompare(b.camera.id));
  const isometric = depthMaps.find((dm) => dm.camera.role === "isometric") ?? null;
  const topDown = depthMaps.find((dm) => dm.camera.role === "top_ortho") ?? null;

  if (perspective.length !== EXPECTED_PHOTO_VIEW_COUNT) {
    throw new Error(
      `repaintAll: ожидается ровно ${EXPECTED_PHOTO_VIEW_COUNT} фото-камеры (perspective), получено ${perspective.length}`,
    );
  }
  if (isometric === null) {
    throw new Error("repaintAll: отсутствует isometric-камера в Camera_Rig");
  }
  if (topDown === null) {
    throw new Error("repaintAll: отсутствует top_ortho-камера в Camera_Rig");
  }

  const repaintUrls: Record<string, string | null> = {};

  // ── Фото-камеры: стойкий сбой любой из них немедленно останавливает сборку
  //    с указанием камеры (Req 13.4). ──────────────────────────────────────
  const photoViews: Buffer[] = [];
  for (const dm of perspective) {
    try {
      const repaint = await repaintCameraWithRetries(
        dm,
        sharedStylePrompt,
        budget,
        maxAttempts,
        repaintFn,
        downloadFn,
        aspectRatio,
      );
      photoViews.push(repaint.buffer);
      repaintUrls[dm.camera.id] = repaint.url;
    } catch (err) {
      // Отсечка бюджета прекращает весь пайплайн (Req 12.5).
      if (err instanceof CostBudgetExceededError) {
        throw err;
      }
      // Любой иной стойкий сбой фото-камеры → немедленная остановка (Req 13.4).
      throw new PhotoCameraRepaintError(dm.camera.id, err);
    }
  }

  // ── Изометрия и вид сверху: деградация в null при стойком сбое (Req 13.3),
  //    каждая обрабатывается немедленно после фото-камер. ───────────────────
  const isoRepaint = await repaintOrNull(
    isometric,
    sharedStylePrompt,
    budget,
    maxAttempts,
    repaintFn,
    downloadFn,
    aspectRatio,
  );
  repaintUrls[isometric.camera.id] = isoRepaint?.url ?? null;

  const topRepaint = await repaintOrNull(
    topDown,
    sharedStylePrompt,
    budget,
    maxAttempts,
    repaintFn,
    downloadFn,
    aspectRatio,
  );
  repaintUrls[topDown.camera.id] = topRepaint?.url ?? null;

  return {
    repaints: {
      photoViews,
      isometric: isoRepaint?.buffer ?? null,
      topDown: topRepaint?.buffer ?? null,
    },
    repaintUrls,
    totalCostKopeks: budget.totalKopeks,
  };
}
