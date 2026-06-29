#!/usr/bin/env -S npx tsx
/**
 * R&D-прототип удержания расстановки depth-ControlNet — задача 14.1
 * (`Prototype_Milestone`, Requirement 1).
 *
 * Цель прототипа — ДО постройки полного 3D-пайплайна доказать, что
 * `Depth_ControlNet_Provider` на fal удерживает расстановку мебели по заранее
 * подготовленной карте глубины. Прототип НЕ строит блокаут и не запускает
 * Blender: он работает от уже отрендеренных `Depth_Map` (PNG на диске),
 * прогоняет каждую из 4 фото-камер через `falDepthControlNetRepaint` с ЕДИНЫМ
 * `Shared_Style_Prompt`, сохраняет вход и результат в R2 и печатает публичные
 * URL.
 *
 * Запуск оператором через `npx tsx`:
 *
 *   npx tsx artifacts/api-server/scripts/blockout/prototype.ts \
 *     --project-id proto-001 \
 *     --style "скандинавский минимализм, тёплый дневной свет" \
 *     --depth ./depth/cam1.png --depth ./depth/cam2.png \
 *     --depth ./depth/cam3.png --depth ./depth/cam4.png \
 *     [--negative "люди, текст, артефакты"] [--aspect 4:3] [--compare]
 *
 * Поведение по Requirement 1:
 *   1.1/1.2 — генерирует `Photoreal_Repaint` для одной комнаты/одного стиля по
 *            каждой из ровно 4 фото-камер `Camera_Rig` с единым промптом;
 *   1.3     — сохраняет каждую входную `Depth_Map` и соответствующий
 *            `Photoreal_Repaint` в `Object_Storage` и печатает публичные URL;
 *   1.4     — при `--compare` дополнительно генерирует и сохраняет 2D-артефакт
 *            (`Fallback_2D_Path`) тем же `Shared_Style_Prompt` без управления
 *            глубиной — для визуального сопоставления удержания геометрии;
 *   1.5     — при ошибке/пустом результате провайдера завершается ненулевым
 *            кодом возврата с сообщением, содержащим HTTP-статус и текст ответа
 *            провайдера (сообщение прокидывается из `falDepthControlNetRepaint`,
 *            паттерн `Fal.ai HTTP {status}: {text}`).
 *
 * Переиспользует существующие функции без изменения их контракта:
 *   • `uploadDepthMaps` / `uploadRepaints` / `uploadFallback2D` из
 *     `src/lib/blockout/storage.ts` (загрузка в R2 + публичные URL);
 *   • `falDepthControlNetRepaint`, `falGenerateText`, `downloadImage`,
 *     `NsfwBlockedError` из `src/lib/falAi.ts`.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  falDepthControlNetRepaint,
  falGenerateText,
  downloadImage,
  NsfwBlockedError,
} from "../../src/lib/falAi";
import {
  uploadDepthMaps,
  uploadRepaints,
  uploadFallback2D,
  type RepaintUpload,
} from "../../src/lib/blockout/storage";

/** Число фото-камер `Camera_Rig`, перекрашиваемых прототипом (Req 1.2). */
const PHOTO_CAMERA_COUNT = 4;

/** Идентификаторы фото-камер `Camera_Rig` (стабильные, как в `sceneSpec`). */
const PHOTO_CAMERA_IDS = ["cam_persp_1", "cam_persp_2", "cam_persp_3", "cam_persp_4"] as const;

type AspectRatio = "16:9" | "4:3" | "1:1";

/** Разобранные аргументы CLI. */
interface CliArgs {
  projectId: string;
  sharedStylePrompt: string;
  negativePrompt: string;
  depthPaths: string[];
  aspectRatio: AspectRatio;
  compare: boolean;
}

const USAGE = `
R&D-прототип удержания расстановки depth-ControlNet (задача 14.1).

Использование:
  npx tsx artifacts/api-server/scripts/blockout/prototype.ts [опции]

Обязательные опции:
  --project-id <id>    идентификатор проекта (сегмент ключей в R2)
  --style <prompt>     Shared_Style_Prompt (единый стилевой промпт)
  --depth <path>       путь к подготовленной Depth_Map (PNG); указать РОВНО ${PHOTO_CAMERA_COUNT}
                       раза (по одной карте на фото-камеру Camera_Rig)

Необязательные опции:
  --negative <prompt>  негативный промпт (по умолчанию пустой)
  --aspect <ratio>     16:9 | 4:3 | 1:1 (по умолчанию 4:3)
  --compare            дополнительно сгенерировать и сохранить Fallback_2D_Path
                       (2D без управления глубиной) для визуального сравнения
  -h, --help           показать эту справку
`.trim();

/** Достаёт значение опции вида `--key value`. */
function takeValue(argv: string[], index: number, key: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`опция ${key} требует значение`);
  }
  return value;
}

/** Парсит аргументы CLI; бросает ошибку с понятным сообщением при проблеме. */
function parseArgs(argv: string[]): CliArgs {
  let projectId: string | undefined;
  let style: string | undefined;
  let negativePrompt = "";
  const depthPaths: string[] = [];
  let aspectRatio: AspectRatio = "4:3";
  let compare = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case "--project-id":
        projectId = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--style":
        style = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--negative":
        negativePrompt = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--depth":
        depthPaths.push(resolve(takeValue(argv, i, arg)));
        i += 1;
        break;
      case "--aspect": {
        const value = takeValue(argv, i, arg);
        if (value !== "16:9" && value !== "4:3" && value !== "1:1") {
          throw new Error(`--aspect должен быть 16:9 | 4:3 | 1:1, получено "${value}"`);
        }
        aspectRatio = value;
        i += 1;
        break;
      }
      case "--compare":
        compare = true;
        break;
      case "-h":
      case "--help":
        // eslint-disable-next-line no-console
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`неизвестная опция "${arg}"`);
    }
  }

  if (projectId === undefined || projectId.trim() === "") {
    throw new Error("не задан --project-id");
  }
  if (style === undefined || style.trim() === "") {
    throw new Error("не задан --style (Shared_Style_Prompt)");
  }
  if (depthPaths.length !== PHOTO_CAMERA_COUNT) {
    throw new Error(
      `требуется ровно ${PHOTO_CAMERA_COUNT} карты глубины (--depth), получено ${depthPaths.length}`,
    );
  }

  return {
    projectId,
    sharedStylePrompt: style,
    negativePrompt,
    depthPaths,
    aspectRatio,
    compare,
  };
}

/** Итоговый объект вывода прототипа (печатается как JSON в stdout). */
interface PrototypeOutput {
  projectId: string;
  sharedStylePrompt: string;
  cameraIds: string[];
  depthMapUrls: string[];
  repaintUrls: string[];
  /** Присутствует только при `--compare` (Req 1.4). */
  fallback2dUrls?: string[];
  totalCostKopeks: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // 1. Читаем подготовленные Depth_Map с диска (по одной на фото-камеру).
  const depthBuffers = await Promise.all(
    args.depthPaths.map((path) => readFile(path)),
  );

  // 2. Загружаем входные Depth_Map в R2 и получаем публичные URL — они же
  //    передаются провайдеру как структурный управляющий сигнал (Req 1.3, 6.2).
  const depthUploads: RepaintUpload[] = depthBuffers.map((png, idx) => ({
    cameraId: PHOTO_CAMERA_IDS[idx]!,
    png,
  }));
  const depthMapUrls = await uploadDepthMaps(depthUploads, {
    projectId: args.projectId,
  });

  // 3. Прогоняем каждую из 4 фото-камер через depth-ControlNet с ЕДИНЫМ
  //    Shared_Style_Prompt (Req 1.1, 1.2, 6.3). Последовательно, чтобы при
  //    сбое немедленно остановиться с указанием конкретной камеры (Req 1.5).
  let totalCostKopeks = 0;
  const repaintResults: RepaintUpload[] = [];
  for (let i = 0; i < depthMapUrls.length; i += 1) {
    const cameraId = PHOTO_CAMERA_IDS[i]!;
    try {
      const result = await falDepthControlNetRepaint({
        depthMapUrl: depthMapUrls[i]!,
        prompt: args.sharedStylePrompt,
        aspectRatio: args.aspectRatio,
      });
      totalCostKopeks += result.costKopeks;
      const png = await downloadImage(result.imageUrl);
      repaintResults.push({ cameraId, png });
    } catch (err: unknown) {
      // Стоимость NSFW-отказа всё равно учитывается в бюджете (Req 6.7);
      // при HTTP/пустом результате сообщение уже несёт статус и текст (Req 1.5).
      if (err instanceof NsfwBlockedError) {
        totalCostKopeks += err.costKopeks;
      }
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`перекраска камеры ${cameraId} не удалась: ${reason}`);
    }
  }

  // 4. Загружаем каждый Photoreal_Repaint в R2 (Req 1.3).
  const repaintUrls = await uploadRepaints(repaintResults, {
    projectId: args.projectId,
  });

  const output: PrototypeOutput = {
    projectId: args.projectId,
    sharedStylePrompt: args.sharedStylePrompt,
    cameraIds: [...PHOTO_CAMERA_IDS],
    depthMapUrls,
    repaintUrls,
    totalCostKopeks,
  };

  // 5. WHERE задан флаг сравнения — дополнительно генерируем 2D-артефакт тем же
  //    Shared_Style_Prompt без управления глубиной (Fallback_2D_Path) и грузим
  //    в R2 для визуального сопоставления удержания геометрии (Req 1.4).
  if (args.compare) {
    const fallbackResults: RepaintUpload[] = [];
    for (let i = 0; i < PHOTO_CAMERA_COUNT; i += 1) {
      const cameraId = PHOTO_CAMERA_IDS[i]!;
      try {
        const result = await falGenerateText({
          prompt: args.sharedStylePrompt,
          aspectRatio: args.aspectRatio,
        });
        totalCostKopeks += result.costKopeks;
        const png = await downloadImage(result.imageUrl);
        fallbackResults.push({ cameraId, png });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Fallback_2D_Path для камеры ${cameraId} не удался: ${reason}`);
      }
    }
    output.fallback2dUrls = await uploadFallback2D(fallbackResults, {
      projectId: args.projectId,
    });
  }

  output.totalCostKopeks = totalCostKopeks;

  // Печатаем публичные URL входов и результатов (Req 1.3) как JSON в stdout.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`prototype: ${message}\n`);
  // Ненулевой код возврата при любой ошибке/пустом результате (Req 1.5).
  process.exit(1);
});
