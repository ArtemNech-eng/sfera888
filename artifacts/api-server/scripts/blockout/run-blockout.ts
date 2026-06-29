#!/usr/bin/env -S npx tsx
/**
 * CLI-вход пайплайна AI_Design_3D_Blockout (подход B2) — задача 13.2.
 *
 * Запускается оператором через `npx tsx`:
 *
 *   npx tsx artifacts/api-server/scripts/blockout/run-blockout.ts \
 *     --room-type living_room --area 24 \
 *     --style "скандинавский минимализм, тёплый дневной свет" \
 *     --project-id demo-001 --out ./.work/blockout/demo-001 [--publish]
 *
 * Соединяет все шаги через `runBlockoutPipeline` (см.
 * `src/lib/blockout/pipeline.ts`) и печатает объект вывода
 * (`boardPublicUrl`, `depthMapUrls`, `repaintUrls`, `totalCostKopeks`,
 * `published`, `skippedPublishReason`) в stdout как JSON.
 *
 * Внешнее окружение (Blender, R2, fal, БД) должно быть настроено через env;
 * при недоступности Blender пайплайн остановится с предложением
 * `Fallback_2D_Path` (Req 9.3, 13.1). При сбое любого шага сообщение называет
 * шаг и причину (Req 13.5), а процесс завершается ненулевым кодом.
 */

import { resolve } from "node:path";

import { ROOM_TYPES, type RoomType } from "../../src/lib/blockout/sceneSpec";
import {
  runBlockoutPipeline,
  type RunBlockoutPipelineOptions,
} from "../../src/lib/blockout/pipeline";
import type { InfographicBaseFields } from "../../src/lib/blockout/composerAdapter";
import type { SeoPageContent } from "../../src/lib/blockout/seoPublish";

/** Разобранные аргументы CLI. */
interface CliArgs {
  roomType: RoomType;
  areaM2: number;
  sharedStylePrompt: string;
  negativePrompt: string;
  styleName: string;
  projectId: string;
  outDir: string;
  publish: boolean;
  aspectRatio: "16:9" | "4:3" | "1:1";
}

const USAGE = `
Использование:
  npx tsx artifacts/api-server/scripts/blockout/run-blockout.ts [опции]

Обязательные опции:
  --room-type <type>   тип помещения (${ROOM_TYPES.join(" | ")})
  --area <m2>          площадь, м² (число > 0)
  --style <prompt>     Shared_Style_Prompt (единый стилевой промпт)
  --project-id <id>    идентификатор проекта (сегмент ключей в R2)
  --out <dir>          рабочая директория для scene.json и артефактов

Необязательные опции:
  --negative <prompt>  негативный промпт (по умолчанию пустой)
  --style-name <name>  человекочитаемое имя стиля для SEO (по умолчанию = --style)
  --aspect <ratio>     16:9 | 4:3 | 1:1 (по умолчанию 4:3)
  --publish            публиковать SEO_Page (только Railway + доступная БД)
  -h, --help           показать эту справку
`.trim();

/** Достаёт значение опции вида `--key value`. */
function takeValue(
  argv: string[],
  index: number,
  key: string,
): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`опция ${key} требует значение`);
  }
  return value;
}

/** Парсит аргументы CLI; бросает ошибку с понятным сообщением при проблеме. */
function parseArgs(argv: string[]): CliArgs {
  let roomTypeRaw: string | undefined;
  let areaRaw: string | undefined;
  let style: string | undefined;
  let negativePrompt = "";
  let styleName: string | undefined;
  let projectId: string | undefined;
  let outDir: string | undefined;
  let publish = false;
  let aspectRatio: "16:9" | "4:3" | "1:1" = "4:3";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case "--room-type":
        roomTypeRaw = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--area":
        areaRaw = takeValue(argv, i, arg);
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
      case "--style-name":
        styleName = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--project-id":
        projectId = takeValue(argv, i, arg);
        i += 1;
        break;
      case "--out":
        outDir = takeValue(argv, i, arg);
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
      case "--publish":
        publish = true;
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

  if (roomTypeRaw === undefined) throw new Error("не задан --room-type");
  if (!ROOM_TYPES.includes(roomTypeRaw as RoomType)) {
    throw new Error(
      `--room-type должен быть одним из: ${ROOM_TYPES.join(", ")}; получено "${roomTypeRaw}"`,
    );
  }
  if (areaRaw === undefined) throw new Error("не задан --area");
  const areaM2 = Number(areaRaw);
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    throw new Error(`--area должен быть числом > 0, получено "${areaRaw}"`);
  }
  if (style === undefined || style.trim() === "") {
    throw new Error("не задан --style (Shared_Style_Prompt)");
  }
  if (projectId === undefined || projectId.trim() === "") {
    throw new Error("не задан --project-id");
  }
  if (outDir === undefined || outDir.trim() === "") {
    throw new Error("не задан --out");
  }

  return {
    roomType: roomTypeRaw as RoomType,
    areaM2,
    sharedStylePrompt: style,
    negativePrompt,
    styleName: styleName ?? style,
    projectId,
    outDir: resolve(outDir),
    publish,
    aspectRatio,
  };
}

/**
 * Минимальные базовые поля композитора для CLI-прогона. Тексты/кропы/смета
 * формируются прежним способом в онлайн-пути; здесь — пустые заготовки, чтобы
 * 3D-путь собрал борд из перекрасок (Req 8.5: прочие поля передаются как есть).
 */
function buildBaseFields(args: CliArgs): InfographicBaseFields {
  return {
    detailCrops: [],
    viewLabels: ["Ракурс 1", "Ракурс 2", "Ракурс 3", "Ракурс 4"],
    cropLabels: [],
    design: {
      roomType: args.roomType,
      area: args.areaM2,
      style: args.styleName,
      budget: null,
      durationWeeks: null,
      materials: [],
      estimate: [],
      colorPalette: [],
      solutions: [],
    },
  };
}

/** Контент SEO-страницы для публикации (только при --publish). */
function buildSeoContent(args: CliArgs): SeoPageContent {
  return {
    roomType: args.roomType,
    style: args.styleName,
    area: args.areaM2,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const options: RunBlockoutPipelineOptions = {
    roomType: args.roomType,
    areaM2: args.areaM2,
    style: {
      sharedStylePrompt: args.sharedStylePrompt,
      negativePrompt: args.negativePrompt,
    },
    projectId: args.projectId,
    workDir: args.outDir,
    baseFields: buildBaseFields(args),
    publish: args.publish,
    seoContent: args.publish ? buildSeoContent(args) : undefined,
    aspectRatio: args.aspectRatio,
  };

  const output = await runBlockoutPipeline(options);

  // Объект вывода для повторной публикации/инспекции (design §«Pipeline output»).
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`run-blockout: ${message}\n`);
  process.exit(1);
});
