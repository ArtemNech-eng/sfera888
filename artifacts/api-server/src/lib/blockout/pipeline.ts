/**
 * Blockout_Pipeline orchestrator — детект окружения рендера и запуск
 * `Blockout_Builder` (Blender) для пайплайна AI_Design_3D_Blockout (подход B2).
 *
 * См. `.kiro/specs/ai-design-3d-blockout/design.md` секции
 * «5. Blockout_Pipeline orchestrator», «Environment & Degradation Strategy» и
 * «Error Handling», а также `requirements.md` Requirement 9.3, 13.1, 13.5.
 *
 * Что делает этот модуль (задача 13.1):
 *   • `assertRenderEnvironment()` — детектирует бинарь Blender (через env
 *     `BLENDER_BIN` либо поиск `blender` в `PATH`). Если `Render_Environment`
 *     недоступна — НЕ запускает 3D-путь, а бросает типизированную ошибку,
 *     чьё сообщение предлагает `Fallback_2D_Path` (Req 9.3, 13.1);
 *   • `runBlockoutBuilder()` — запускает Blender как дочерний процесс
 *     (`blender --background --python blockout_builder.py -- --scene … --out …`);
 *     при ненулевом коде возврата прекращает 3D-путь и бросает ошибку,
 *     предлагающую `Fallback_2D_Path` (Req 13.1);
 *   • `withStep()` / `BlockoutStepError` — общий хелпер логирования: каждый
 *     шаг логирует своё имя и, при сбое, причину; сбойный шаг всегда
 *     завершается ошибкой, называющей шаг и причину (Req 13.5, Property 27).
 *
 * Чего этот модуль ПОКА НЕ делает (другие задачи):
 *   • `runBlockoutPipeline` (соединение всех шагов) и CLI-вход
 *     `scripts/blockout/run-blockout.ts` — задача 13.2;
 *   • property/unit-тесты ветвления fallback — задачи 13.3, 13.4.
 *
 * Существующий `Fallback_2D_Path` (`generate-design-board.ts`) этим модулем
 * НЕ вызывается и НЕ изменяется: при недоступности окружения мы лишь сообщаем
 * о ней и предлагаем оператору запасной путь.
 */

import { spawn, spawnSync, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { DesignView } from "@workspace/db";
import { CostBudget, createCostBudget } from "../designCostGuard";
import {
  buildSceneSpec,
  serializeSceneSpec,
  type CameraSpec,
  type RoomType,
  type SceneSpec,
  type StyleInput,
} from "./sceneSpec";
import {
  uploadBoard,
  uploadDepthMaps,
  type DepthMapUpload,
} from "./storage";
import {
  repaintAll,
  type CameraDepthMap,
  type RepaintAllResult,
} from "./repaint";
import {
  composeBlockoutInfographic,
  type BlockoutRepaints,
  type InfographicBaseFields,
} from "./composerAdapter";
import {
  publishSeoPage,
  type PublishSeoPageResult,
  type SeoPageContent,
} from "./seoPublish";

// ─── Логирование шагов (Req 13.5) ─────────────────────────────────────────────

/** Статус шага пайплайна в журнале. */
export type StepStatus = "start" | "ok" | "fail";

/** Запись журнала одного шага `Blockout_Pipeline`. */
export interface StepLogEntry {
  /** Идентификатор шага (имя шага — Req 13.5). */
  step: string;
  /** Текущий статус шага. */
  status: StepStatus;
  /** Причина сбоя — заполняется только при `status === "fail"` (Req 13.5). */
  reason?: string;
}

/** Получатель журнала шагов (инъекция для тестов/перенаправления вывода). */
export type StepLogger = (entry: StepLogEntry) => void;

/**
 * Журналер по умолчанию: пишет в `stderr`, явно называя шаг и (при сбое)
 * причину. Успешные шаги логируются лаконично, чтобы не зашумлять вывод
 * оператора (Req 13.5).
 */
export const defaultStepLogger: StepLogger = (entry) => {
  const prefix = `[Blockout_Pipeline:${entry.step}]`;
  if (entry.status === "fail") {
    process.stderr.write(`${prefix} FAILED: ${entry.reason ?? "unknown"}\n`);
  } else {
    process.stderr.write(`${prefix} ${entry.status}\n`);
  }
};

/**
 * Ошибка сбоя шага `Blockout_Pipeline`. Несёт идентификатор шага и причину,
 * чтобы любое сообщение об ошибке называло сбойный шаг и причину
 * (Req 13.5, Property 27). Сохраняет исходную ошибку в `cause` для отладки.
 */
export class BlockoutStepError extends Error {
  /** Идентификатор сбойного шага. */
  public readonly step: string;
  /** Человекочитаемая причина сбоя. */
  public readonly reason: string;
  /** Исходная ошибка (если была). */
  public readonly cause: unknown;

  constructor(step: string, reason: string, cause?: unknown) {
    super(`Шаг "${step}" завершился сбоем: ${reason}`);
    this.name = "BlockoutStepError";
    this.step = step;
    this.reason = reason;
    this.cause = cause;
    // Восстанавливаем prototype chain после `extends Error` (TS issue #13965).
    Object.setPrototypeOf(this, BlockoutStepError.prototype);
  }
}

/**
 * Выполняет шаг пайплайна с журналированием: логирует старт, затем `ok` при
 * успехе либо `fail` с причиной при сбое. Любой сбой нормализуется в
 * `BlockoutStepError`, чьё сообщение называет шаг и причину (Req 13.5).
 *
 * `BlockoutStepError`, брошенный вложенной функцией, пробрасывается как есть
 * (он уже содержит имя шага и причину).
 */
export async function withStep<T>(
  step: string,
  logger: StepLogger,
  fn: () => Promise<T>,
): Promise<T> {
  logger({ step, status: "start" });
  try {
    const result = await fn();
    logger({ step, status: "ok" });
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger({ step, status: "fail", reason });
    if (err instanceof BlockoutStepError) {
      throw err;
    }
    throw new BlockoutStepError(step, reason, err);
  }
}

// ─── Общие константы окружения ────────────────────────────────────────────────

/** Имя шага детекта окружения рендера в журнале. */
export const STEP_ASSERT_RENDER_ENV = "assertRenderEnvironment";
/** Имя шага запуска `Blockout_Builder` в журнале. */
export const STEP_RUN_BLOCKOUT_BUILDER = "runBlockoutBuilder";

/**
 * Подсказка о запасном пути, добавляемая к сообщениям при недоступности
 * `Render_Environment` или сбое `Blockout_Builder` (Req 9.3, 13.1).
 */
export const FALLBACK_2D_PATH_HINT =
  "3D-путь недоступен — используйте Fallback_2D_Path " +
  "(artifacts/api-server/scripts/.../generate-design-board.ts).";

/**
 * Имя/путь бинаря Blender по умолчанию: берётся из env `BLENDER_BIN`, иначе
 * ищется как `blender` в `PATH`.
 */
function defaultBlenderBin(): string {
  const fromEnv = process.env.BLENDER_BIN;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  return "blender";
}

/** Путь к Python-скрипту `Blockout_Builder` по умолчанию (относительно модуля). */
function defaultBuilderScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/lib/blockout/pipeline.ts → scripts/blockout/blockout_builder.py
  return resolve(here, "../../../scripts/blockout/blockout_builder.py");
}

/** Похоже ли значение на путь к файлу (а не на имя в `PATH`). */
function looksLikePath(bin: string): boolean {
  return isAbsolute(bin) || bin.includes("/") || bin.includes(sep);
}

// ─── assertRenderEnvironment (Req 9.3, 13.1) ──────────────────────────────────

/** Разрешённое окружение рендера после успешного детекта. */
export interface RenderEnvironment {
  /** Путь/имя исполняемого бинаря Blender, прошедшего проверку. */
  blenderBin: string;
}

/** Результат пробы доступности бинаря Blender. */
export interface BlenderProbeResult {
  /** Удалось ли успешно запросить версию Blender. */
  ok: boolean;
  /** Причина недоступности (для сообщения об ошибке). */
  reason?: string;
}

/** Опции `assertRenderEnvironment`. */
export interface AssertRenderEnvironmentOptions {
  /** Переопределение бинаря Blender; по умолчанию env `BLENDER_BIN`/`blender`. */
  blenderBin?: string;
  /** Журналер шагов (инъекция для тестов). */
  logger?: StepLogger;
  /** Проба доступности (инъекция для тестов). По умолчанию `blender --version`. */
  probe?: (bin: string) => BlenderProbeResult;
}

/**
 * Ошибка недоступности `Render_Environment`: бинарь Blender не найден или не
 * запускается. Сообщение всегда предлагает `Fallback_2D_Path` (Req 9.3, 13.1).
 * Является `BlockoutStepError`, поэтому несёт имя шага и причину (Req 13.5).
 */
export class RenderEnvironmentUnavailableError extends BlockoutStepError {
  constructor(reason: string, cause?: unknown) {
    super(STEP_ASSERT_RENDER_ENV, `${reason} ${FALLBACK_2D_PATH_HINT}`, cause);
    this.name = "RenderEnvironmentUnavailableError";
    Object.setPrototypeOf(this, RenderEnvironmentUnavailableError.prototype);
  }
}

/** Проба по умолчанию: синхронный `<bin> --version`. */
function defaultProbe(bin: string): BlenderProbeResult {
  try {
    const res = spawnSync(bin, ["--version"], {
      stdio: "ignore",
      // На Windows .bat/.cmd-обёртки требуют shell; в иных случаях он не мешает.
      shell: false,
    });
    if (res.error) {
      const code = (res.error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return { ok: false, reason: `бинарь Blender "${bin}" не найден в PATH` };
      }
      return { ok: false, reason: `запуск "${bin}" не удался: ${res.error.message}` };
    }
    if (typeof res.status === "number" && res.status !== 0) {
      return {
        ok: false,
        reason: `"${bin} --version" вернул ненулевой код ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `проба "${bin}" завершилась ошибкой: ${message}` };
  }
}

/**
 * Детектирует `Render_Environment` (headless Blender) ДО запуска 3D-пути.
 *
 * Источник бинаря: `options.blenderBin` → env `BLENDER_BIN` → имя `blender`
 * в `PATH`. Если значение похоже на путь и файла нет — окружение считается
 * недоступным сразу, без запуска процесса. Иначе выполняется проба
 * (`blender --version`).
 *
 * При недоступности — НЕ запускает 3D-путь, а бросает
 * `RenderEnvironmentUnavailableError`, чьё сообщение предлагает
 * `Fallback_2D_Path` (Req 9.3, 13.1). Шаг логируется по имени и причине
 * (Req 13.5).
 *
 * @returns разрешённое окружение с проверенным путём к бинарю Blender.
 * @throws {RenderEnvironmentUnavailableError} если Blender недоступен.
 */
export async function assertRenderEnvironment(
  options: AssertRenderEnvironmentOptions = {},
): Promise<RenderEnvironment> {
  const logger = options.logger ?? defaultStepLogger;
  const probe = options.probe ?? defaultProbe;

  return withStep(STEP_ASSERT_RENDER_ENV, logger, async () => {
    const blenderBin = options.blenderBin?.trim() || defaultBlenderBin();

    // Явный путь, которого нет на диске → недоступно без запуска процесса.
    if (looksLikePath(blenderBin) && !existsSync(blenderBin)) {
      throw new RenderEnvironmentUnavailableError(
        `бинарь Blender не найден по пути "${blenderBin}".`,
      );
    }

    const result = probe(blenderBin);
    if (!result.ok) {
      throw new RenderEnvironmentUnavailableError(
        `${result.reason ?? `Blender "${blenderBin}" недоступен`}.`,
      );
    }

    return { blenderBin };
  });
}

// ─── runBlockoutBuilder (Req 13.1) ────────────────────────────────────────────

/** Минимальная форма дочернего процесса, используемая `runBlockoutBuilder`. */
type SpawnFn = typeof spawn;

/** Опции запуска `Blockout_Builder`. */
export interface RunBlockoutBuilderOptions {
  /** Путь к сериализованному `scene.json` (вход билдера). */
  scenePath: string;
  /** Рабочая директория для артефактов билдера (`Depth_Map`, `positions.json`). */
  outDir: string;
  /** Путь/имя бинаря Blender (обычно из `assertRenderEnvironment`). */
  blenderBin?: string;
  /** Путь к Python-скрипту билдера; по умолчанию `scripts/blockout/blockout_builder.py`. */
  builderScriptPath?: string;
  /** Дополнительные аргументы Blender (перед `--`), напр. `--factory-startup`. */
  blenderArgs?: string[];
  /** Журналер шагов (инъекция для тестов). */
  logger?: StepLogger;
  /** Фабрика дочернего процесса (инъекция для тестов). По умолчанию `spawn`. */
  spawnFn?: SpawnFn;
  /** Доп. опции `spawn` (например, `cwd`). `stdio` задаётся внутри. */
  spawnOptions?: Omit<SpawnOptions, "stdio">;
}

/** Результат успешного запуска `Blockout_Builder`. */
export interface BlockoutBuilderResult {
  /** Код возврата процесса Blender (0 при успехе). */
  exitCode: number;
  /** Собранный stdout процесса. */
  stdout: string;
  /** Собранный stderr процесса. */
  stderr: string;
}

/**
 * Ошибка сбоя `Blockout_Builder` (ненулевой код возврата или сбой запуска).
 * Сообщение предлагает `Fallback_2D_Path` (Req 13.1) и несёт имя шага/причину
 * (Req 13.5). Доступны `exitCode` и собранный `stderr` для диагностики.
 */
export class BlockoutBuilderError extends BlockoutStepError {
  /** Код возврата процесса (если процесс завершился), иначе `null`. */
  public readonly exitCode: number | null;
  /** Собранный stderr процесса Blender. */
  public readonly stderr: string;

  constructor(reason: string, exitCode: number | null, stderr: string, cause?: unknown) {
    super(STEP_RUN_BLOCKOUT_BUILDER, `${reason} ${FALLBACK_2D_PATH_HINT}`, cause);
    this.name = "BlockoutBuilderError";
    this.exitCode = exitCode;
    this.stderr = stderr;
    Object.setPrototypeOf(this, BlockoutBuilderError.prototype);
  }
}

/**
 * Запускает `Blockout_Builder` (Blender) как дочерний процесс:
 *
 * ```
 * blender --background --python <builderScriptPath> -- --scene <scenePath> --out <outDir>
 * ```
 *
 * При ненулевом коде возврата (или невозможности запустить процесс) прекращает
 * 3D-путь и бросает `BlockoutBuilderError`, чьё сообщение предлагает
 * `Fallback_2D_Path` (Req 13.1). Шаг логируется по имени и причине (Req 13.5).
 *
 * @returns результат с кодом возврата и собранным stdout/stderr при успехе.
 * @throws {BlockoutBuilderError} при ненулевом коде возврата или сбое запуска.
 */
export async function runBlockoutBuilder(
  options: RunBlockoutBuilderOptions,
): Promise<BlockoutBuilderResult> {
  const logger = options.logger ?? defaultStepLogger;
  const spawnFn = options.spawnFn ?? spawn;
  const blenderBin = options.blenderBin?.trim() || defaultBlenderBin();
  const builderScriptPath = options.builderScriptPath ?? defaultBuilderScriptPath();

  if (typeof options.scenePath !== "string" || options.scenePath.trim() === "") {
    throw new BlockoutStepError(
      STEP_RUN_BLOCKOUT_BUILDER,
      "не задан путь к scene.json (scenePath)",
    );
  }
  if (typeof options.outDir !== "string" || options.outDir.trim() === "") {
    throw new BlockoutStepError(
      STEP_RUN_BLOCKOUT_BUILDER,
      "не задана рабочая директория (outDir)",
    );
  }

  const args = [
    "--background",
    "--python",
    builderScriptPath,
    ...(options.blenderArgs ?? []),
    "--",
    "--scene",
    options.scenePath,
    "--out",
    options.outDir,
  ];

  return withStep(STEP_RUN_BLOCKOUT_BUILDER, logger, () =>
    new Promise<BlockoutBuilderResult>((resolvePromise, rejectPromise) => {
      let stdout = "";
      let stderr = "";

      const child = spawnFn(blenderBin, args, {
        ...options.spawnOptions,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      // Сбой самого запуска (например, бинарь Blender исчез) → остановка
      // 3D-пути с предложением fallback (Req 13.1).
      child.on("error", (err) => {
        rejectPromise(
          new BlockoutBuilderError(
            `не удалось запустить Blender "${blenderBin}": ${err.message}.`,
            null,
            stderr,
            err,
          ),
        );
      });

      child.on("close", (code) => {
        const exitCode = code ?? 1;
        // Ненулевой код → прекращаем 3D-путь и предлагаем fallback (Req 13.1).
        if (exitCode !== 0) {
          const tail = stderr.trim() ? ` Stderr: ${stderr.trim()}` : "";
          rejectPromise(
            new BlockoutBuilderError(
              `Blockout_Builder завершился с ненулевым кодом ${exitCode}.${tail}`,
              exitCode,
              stderr,
            ),
          );
          return;
        }
        resolvePromise({ exitCode, stdout, stderr });
      });
    }),
  );
}

// ─── runBlockoutPipeline (задача 13.2) ────────────────────────────────────────
//
// Соединяет все шаги пайплайна B2 в единый прогон (design §«5.
// Blockout_Pipeline orchestrator»):
//
//   1. assertRenderEnvironment()      — детект Blender (Req 9.3, 13.1)
//   2. buildSceneSpec → serializeSceneSpec → запись scene.json (Req 4.1)
//   3. runBlockoutBuilder()           — запуск Blender (Req 13.1)
//   4. uploadDepthMaps()              — Depth_Map в R2, URL для fal (Req 10.1)
//   5. repaintAll()                   — перекраска по камерам (Req 6.x, 13.x)
//   6. buildInfographicInput → composeInfographic (Req 8.x)
//   7. uploadBoard()                  — борд в R2 (Req 10.1, 10.2)
//   8. publishSeoPage()               — публикация SEO (Req 11.x)
//
// Каждый шаг обёрнут в `withStep`, поэтому при сбое сообщение называет шаг и
// причину (Req 13.5). Все внешние зависимости вынесены в `deps` для
// тестируемости без сети/Blender/БД (см. задачи 13.3, 13.4).

/** Имена шагов пайплайна в журнале (Req 13.5). */
export const STEP_BUILD_SCENE_SPEC = "buildSceneSpec";
export const STEP_WRITE_SCENE_JSON = "writeSceneJson";
export const STEP_UPLOAD_DEPTH_MAPS = "uploadDepthMaps";
export const STEP_REPAINT_ALL = "repaintAll";
export const STEP_COMPOSE_BOARD = "composeBoard";
export const STEP_UPLOAD_BOARD = "uploadBoard";
export const STEP_PUBLISH_SEO_PAGE = "publishSeoPage";

/** Имя файла сериализованного `Scene_Spec` в рабочей директории. */
export const SCENE_JSON_FILENAME = "scene.json";
/** Поддиректория рабочей папки, куда `Blockout_Builder` пишет `Depth_Map`. */
export const DEPTH_MAP_SUBDIR = "depth";

/**
 * Путь к `Depth_Map` камеры в выходной директории билдера по умолчанию:
 * `<outDir>/depth/<cameraId>.png` (зеркально ключам `uploadDepthMaps`).
 */
export function defaultDepthMapPath(outDir: string, cameraId: string): string {
  return join(outDir, DEPTH_MAP_SUBDIR, `${cameraId}.png`);
}

/**
 * Инъецируемые зависимости пайплайна. По умолчанию — реальные реализации;
 * тесты подменяют их, чтобы прогонять оркестрацию без Blender, сети и БД.
 */
export interface BlockoutPipelineDeps {
  /** Детект окружения рендера (Req 9.3, 13.1). */
  assertRenderEnvironmentFn?: typeof assertRenderEnvironment;
  /** Запуск `Blockout_Builder` (Req 13.1). */
  runBlockoutBuilderFn?: typeof runBlockoutBuilder;
  /** Чтение PNG-`Depth_Map` камеры из выходной директории билдера. */
  readDepthMap?: (outDir: string, cameraId: string) => Promise<Buffer>;
  /** Загрузка `Depth_Map` в R2 (Req 10.1). */
  uploadDepthMapsFn?: typeof uploadDepthMaps;
  /** Оркестрация перекраски (Req 6.x, 13.x). */
  repaintAllFn?: typeof repaintAll;
  /** Сборка `InfographicInput` + вызов композитора (Req 8.x). */
  composeFn?: (
    repaints: BlockoutRepaints,
    baseFields: InfographicBaseFields,
  ) => Promise<Buffer>;
  /** Загрузка борда в R2 (Req 10.1, 10.2). */
  uploadBoardFn?: typeof uploadBoard;
  /** Публикация `SEO_Page` (Req 11.x). */
  publishSeoPageFn?: typeof publishSeoPage;
  /** Создание директории (рекурсивно). */
  mkdirFn?: (path: string) => Promise<void>;
  /** Запись файла. */
  writeFileFn?: (path: string, data: string) => Promise<void>;
}

/** Опции запуска полного пайплайна B2. */
export interface RunBlockoutPipelineOptions {
  /** Тип помещения (вход `buildSceneSpec`). */
  roomType: RoomType;
  /** Площадь, м² (вход `buildSceneSpec`). */
  areaM2: number;
  /** Стиль: `Shared_Style_Prompt` (+ опц. negative). */
  style: StyleInput;
  /** Идентификатор проекта — сегмент ключей артефактов в R2. */
  projectId: string;
  /** Рабочая директория для `scene.json` и артефактов билдера. */
  workDir: string;
  /**
   * Прочие поля `InfographicInput` (design/метки/кропы), формируемые прежним
   * способом и передаваемые в композитор без изменений (Req 8.5).
   */
  baseFields: InfographicBaseFields;
  /** Публиковать ли `SEO_Page` (Req 11.x). По умолчанию `false`. */
  publish?: boolean;
  /** Контент SEO-страницы (обязателен при `publish=true`). */
  seoContent?: SeoPageContent;
  /** Метки ракурсов для `designs.views[]` (по позиции). */
  viewLabels?: string[];
  /** Целевой aspect-ratio перекрасок. */
  aspectRatio?: "16:9" | "4:3" | "1:1";
  /** Аккумулятор `Cost_Budget`; по умолчанию `createCostBudget()`. */
  budget?: CostBudget;
  /** Путь/имя бинаря Blender. */
  blenderBin?: string;
  /** Путь к Python-скрипту билдера. */
  builderScriptPath?: string;
  /** Доп. аргументы Blender (перед `--`). */
  blenderArgs?: string[];
  /** Журналер шагов (инъекция для тестов). */
  logger?: StepLogger;
  /** Инъецируемые зависимости (инфраструктура). */
  deps?: BlockoutPipelineDeps;
}

/**
 * Объект вывода пайплайна (design §«Pipeline output (для повторной
 * публикации)»). `boardPublicUrl` сохраняется всегда после загрузки в R2,
 * чтобы прерванную/пропущенную публикацию можно было повторить (Req 11.5).
 */
export interface BlockoutPipelineOutput {
  /** Публичный URL итогового борда в R2 (Req 10.2, 11.5). */
  boardPublicUrl: string;
  /** Публичные URL `Depth_Map` по камерам (в порядке `Camera_Rig`). */
  depthMapUrls: string[];
  /** URL перекрасок по `id` камеры; `null` — деградировавшая iso/ortho. */
  repaintUrls: Record<string, string | null>;
  /** Итоговая стоимость по всем вызовам провайдера, в копейках (Req 12.4). */
  totalCostKopeks: number;
  /** true — `SEO_Page` опубликована; false — публикация пропущена. */
  published: boolean;
  /** Причина пропуска публикации (только при `published=false`). */
  skippedPublishReason?: string;
}

/** Метка ракурса по умолчанию для позиции `views[]`. */
function defaultViewLabel(position: number): string {
  if (position === 5) {
    return "3D-изометрия";
  }
  return `Ракурс ${position}`;
}

/**
 * Строит `designs.views[]` из перекрасок камер: 4 фото-камеры
 * (`cam_persp_*`, отсортированы по `id`) занимают позиции 1..4, изометрия
 * (`cam_iso`) — позицию 5. Деградировавшие (`null`) перекраски пропускаются.
 */
function buildPublishViews(
  cameraRig: ReadonlyArray<CameraSpec>,
  repaintUrls: Record<string, string | null>,
  viewLabels?: string[],
): DesignView[] {
  const labelAt = (position: number): string =>
    viewLabels?.[position - 1] ?? defaultViewLabel(position);

  const views: DesignView[] = [];

  const photoCameras = cameraRig
    .filter((cam) => cam.role === "perspective")
    .sort((a, b) => a.id.localeCompare(b.id));
  photoCameras.forEach((cam, index) => {
    const url = repaintUrls[cam.id];
    if (typeof url === "string" && url.length > 0) {
      const position = index + 1;
      views.push({ url, label: labelAt(position), position });
    }
  });

  const iso = cameraRig.find((cam) => cam.role === "isometric");
  if (iso) {
    const url = repaintUrls[iso.id];
    if (typeof url === "string" && url.length > 0) {
      views.push({ url, label: labelAt(5), position: 5 });
    }
  }

  return views;
}

/** Чтение `Depth_Map` камеры из ФС по умолчанию. */
async function defaultReadDepthMap(
  outDir: string,
  cameraId: string,
): Promise<Buffer> {
  return readFile(defaultDepthMapPath(outDir, cameraId));
}

/**
 * Полный прогон пайплайна AI_Design_3D_Blockout (подход B2): от
 * `buildSceneSpec` до публикации `SEO_Page`.
 *
 * Последовательность шагов и их требования описаны в шапке этой секции и в
 * design §«5. Blockout_Pipeline orchestrator». Каждый шаг логируется по имени
 * через `withStep`, а сбой называет шаг и причину (Req 13.5).
 *
 * Возвращает объект вывода (design §«Pipeline output»): `boardPublicUrl`
 * сохраняется всегда после загрузки борда в R2, чтобы прерванную публикацию
 * можно было повторить (Req 11.5).
 *
 * @throws {BlockoutStepError} (включая `RenderEnvironmentUnavailableError`,
 *   `BlockoutBuilderError`) и иные ошибки шагов, нормализованные `withStep`.
 */
export async function runBlockoutPipeline(
  options: RunBlockoutPipelineOptions,
): Promise<BlockoutPipelineOutput> {
  const logger = options.logger ?? defaultStepLogger;
  const deps = options.deps ?? {};

  const assertEnv = deps.assertRenderEnvironmentFn ?? assertRenderEnvironment;
  const runBuilder = deps.runBlockoutBuilderFn ?? runBlockoutBuilder;
  const readDepthMap = deps.readDepthMap ?? defaultReadDepthMap;
  const uploadDepth = deps.uploadDepthMapsFn ?? uploadDepthMaps;
  const repaint = deps.repaintAllFn ?? repaintAll;
  const compose = deps.composeFn ?? composeBlockoutInfographic;
  const uploadBoardFn = deps.uploadBoardFn ?? uploadBoard;
  const publish = deps.publishSeoPageFn ?? publishSeoPage;
  const mkdirFn =
    deps.mkdirFn ??
    (async (path: string): Promise<void> => {
      await mkdir(path, { recursive: true });
    });
  const writeFileFn =
    deps.writeFileFn ??
    (async (path: string, data: string): Promise<void> => {
      await writeFile(path, data, "utf8");
    });

  const budget = options.budget ?? createCostBudget();

  // (1) Детект окружения рендера (Req 9.3, 13.1). Бросает с предложением
  //     Fallback_2D_Path, если Blender недоступен.
  const env = await assertEnv({
    blenderBin: options.blenderBin,
    logger,
  });

  // (2) Сборка Scene_Spec → канонический JSON → запись scene.json (Req 4.1).
  const spec: SceneSpec = await withStep(STEP_BUILD_SCENE_SPEC, logger, async () =>
    buildSceneSpec({
      roomType: options.roomType,
      areaM2: options.areaM2,
      style: options.style,
    }),
  );

  const scenePath = join(options.workDir, SCENE_JSON_FILENAME);
  await withStep(STEP_WRITE_SCENE_JSON, logger, async () => {
    const json = serializeSceneSpec(spec);
    await mkdirFn(options.workDir);
    await writeFileFn(scenePath, json);
  });

  // (3) Запуск Blockout_Builder (Req 13.1). При ненулевом коде — остановка
  //     3D-пути с предложением fallback.
  await runBuilder({
    scenePath,
    outDir: options.workDir,
    blenderBin: env.blenderBin,
    builderScriptPath: options.builderScriptPath,
    blenderArgs: options.blenderArgs,
    logger,
  });

  // (4) Чтение Depth_Map камер из рабочей директории и загрузка в R2 (Req 10.1).
  const depthMapUrls = await withStep(STEP_UPLOAD_DEPTH_MAPS, logger, async () => {
    const uploads: DepthMapUpload[] = [];
    for (const camera of spec.cameraRig) {
      const png = await readDepthMap(options.workDir, camera.id);
      uploads.push({ cameraId: camera.id, png });
    }
    return uploadDepth(uploads, { projectId: options.projectId });
  });

  // Пара «камера → URL её Depth_Map» в порядке Camera_Rig для перекраски.
  const cameraDepthMaps: CameraDepthMap[] = spec.cameraRig.map((camera, index) => ({
    camera,
    depthMapUrl: depthMapUrls[index] as string,
  }));

  // (5) Перекраска по камерам с единым Shared_Style_Prompt, ретраями,
  //     деградацией iso/ortho и учётом Cost_Budget (Req 6.x, 12.x, 13.x).
  const repaintResult: RepaintAllResult = await withStep(
    STEP_REPAINT_ALL,
    logger,
    async () =>
      repaint({
        depthMaps: cameraDepthMaps,
        sharedStylePrompt: spec.style.sharedStylePrompt,
        budget,
        aspectRatio: options.aspectRatio,
      }),
  );

  // (6) Сборка InfographicInput и вызов композитора без смены контракта (Req 8.x).
  const board = await withStep(STEP_COMPOSE_BOARD, logger, async () =>
    compose(repaintResult.repaints, options.baseFields),
  );

  // (7) Загрузка борда в R2 (Req 10.1, 10.2). После этого boardPublicUrl
  //     известен и сохраняется в выводе даже при сбое публикации (Req 11.5).
  const boardPublicUrl = await withStep(STEP_UPLOAD_BOARD, logger, async () =>
    uploadBoardFn(board, { projectId: options.projectId }),
  );

  // (8) Публикация SEO_Page — опционально, только Railway + доступная БД (Req 11.x).
  let publishResult: PublishSeoPageResult;
  if (options.publish) {
    if (options.seoContent === undefined) {
      throw new BlockoutStepError(
        STEP_PUBLISH_SEO_PAGE,
        "publish=true, но seoContent не задан",
      );
    }
    const seoContent = options.seoContent;
    publishResult = await withStep(STEP_PUBLISH_SEO_PAGE, logger, async () =>
      publish({
        boardPublicUrl,
        views: buildPublishViews(
          spec.cameraRig,
          repaintResult.repaintUrls,
          options.viewLabels,
        ),
        content: seoContent,
      }),
    );
  } else {
    // Публикация отключена флагом: пропуск без падения, URL борда сохранён
    // для повторной публикации (Req 11.5).
    publishResult = {
      published: false,
      boardPublicUrl,
      skippedPublishReason: "Публикация пропущена: флаг publish не задан",
    };
  }

  return {
    boardPublicUrl,
    depthMapUrls,
    repaintUrls: repaintResult.repaintUrls,
    totalCostKopeks: repaintResult.totalCostKopeks,
    published: publishResult.published,
    skippedPublishReason: publishResult.skippedPublishReason,
  };
}
