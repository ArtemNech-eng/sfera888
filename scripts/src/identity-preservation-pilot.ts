/**
 * Identity_Preservation pilot — оффлайн-скрипт для разработки (task 25.1).
 *
 * НЕ часть рантайма. Запускается вручную человеком на стадии разработки
 * AI_Design_Product, чтобы выбрать провайдера edit-image (`gpt_image_1_5_edit`
 * vs `flux_kontext_pro`) для шага Angle_Render — победителя фиксируем в env
 * `AI_DESIGN_EDIT_PROVIDER` перед релизом. Спека фиксации — в task 25.2:
 * `docs/ai-design/identity-preservation-pilot.md`.
 *
 * Протокол (Requirement 7.6, design.md §Identity_Preservation):
 *   • 14 фиксированных входов (по 2 на каждый из 7 стилей) с одинаковым
 *     `LayoutJson` для bedroom 16 м².
 *   • Hero_Render — text-to-image один раз на вход (`falGenerateGptImage`),
 *     один и тот же URL используется как референс для обоих провайдеров.
 *   • 5 Angle_Render через каждый из двух провайдеров edit-image.
 *   • Метрики на каждый Angle_Render:
 *     - CLIP image similarity между Hero_Render и Angle_Render (через
 *       локальную ONNX-модель `Xenova/clip-vit-base-patch32`), цель ≥ 0.85.
 *     - Δ E (CIELAB) на доминантном цвете (через `extractPalette` из
 *       `colorExtraction.ts`), цель ≤ 5.
 *     - Стоимость одного Angle_Render в копейках (`FalGenerationResult.costKopeks`).
 *
 * Итого 14 × 6 × 2 = 168 рендеров; ~$7 при текущих тарифах Fal.ai.
 *
 * Использование:
 *   pnpm --filter @workspace/scripts exec tsx ./src/identity-preservation-pilot.ts --max-rows 1
 *   pnpm --filter @workspace/scripts exec tsx ./src/identity-preservation-pilot.ts
 *
 * CLI:
 *   --max-rows N         ограничить количество входных строк (по умолчанию все 14)
 *   --inputs PATH        путь к CSV входов (по умолчанию scripts/data/identity-preservation-inputs.csv)
 *   --output PATH        путь к CSV результатов (по умолчанию scripts/data/identity-preservation-results.csv)
 *   --provider NAME      запустить только один провайдер: gpt_image_1_5_edit | flux_kontext_pro
 *   --dry-run            не вызывать FAL/CLIP, только распарсить CSV и проверить промпты
 *
 * Зависимости рантайма (запуск пилота):
 *   • FAL_API_KEY в окружении
 *   • sharp (тянется через ../../artifacts/api-server для colorExtraction)
 *   • @xenova/transformers — для CLIP. Если не установлен, скрипт пропустит
 *     CLIP и запишет в CSV пустое поле, но не упадёт. Установка:
 *       pnpm --filter @workspace/scripts add @xenova/transformers
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  falGenerateGptImage,
  falGenerateGptImageEdit,
  falGenerateFluxKontextPro,
  downloadImage,
  type FalGenerationResult,
} from "../../artifacts/api-server/src/lib/falAi.js";
import { extractPalette } from "../../artifacts/api-server/src/lib/colorExtraction.js";

// ─── Types ──────────────────────────────────────────────────────────────────

type ProviderId = "gpt_image_1_5_edit" | "flux_kontext_pro";

interface PilotInput {
  /** 0-based индекс строки в CSV; используется как `inputId` в результатах. */
  inputId: number;
  roomType: string;
  style: string;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  /** Сериализованный `LayoutJson` (произвольный объект; парсится только для prompt). */
  layoutJson: Record<string, unknown>;
}

interface ResultRow {
  inputId: number;
  style: string;
  provider: ProviderId;
  /** 1..5 для пяти Angle_Render. */
  angleIdx: number;
  /** Cosine similarity CLIP-эмбеддингов; null если @xenova/transformers недоступен. */
  clipSim: number | null;
  /** Δ E (CIELAB CIE76) на доминантном цвете; null при ошибке. */
  deltaE: number | null;
  /** Стоимость одного Angle_Render в копейках. */
  costKopeks: number;
  /** URL результата (Fal hostит ~24h). Сохраняется как trace для блинд-eval. */
  providerResponse: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

interface CliArgs {
  maxRows: number | null;
  inputsPath: string;
  outputPath: string;
  provider: ProviderId | null;
  dryRun: boolean;
}

function parseCli(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    maxRows: null,
    inputsPath: defaultPath("scripts/data/identity-preservation-inputs.csv"),
    outputPath: defaultPath("scripts/data/identity-preservation-results.csv"),
    provider: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      i++;
      return v;
    };
    if (a === "--") {
      // pnpm sometimes forwards `--` separator; ignore.
      continue;
    } else if (a === "--max-rows") {
      const n = Number.parseInt(next(), 10);
      if (!Number.isFinite(n) || n <= 0) throw new Error("--max-rows must be a positive integer");
      args.maxRows = n;
    } else if (a.startsWith("--max-rows=")) {
      const n = Number.parseInt(a.slice("--max-rows=".length), 10);
      if (!Number.isFinite(n) || n <= 0) throw new Error("--max-rows must be a positive integer");
      args.maxRows = n;
    } else if (a === "--inputs") {
      args.inputsPath = path.resolve(next());
    } else if (a === "--output") {
      args.outputPath = path.resolve(next());
    } else if (a === "--provider") {
      const v = next();
      if (v !== "gpt_image_1_5_edit" && v !== "flux_kontext_pro") {
        throw new Error(`--provider must be gpt_image_1_5_edit or flux_kontext_pro, got: ${v}`);
      }
      args.provider = v;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

function defaultPath(rel: string): string {
  // Скрипт лежит в scripts/src; корень workspace — на два уровня выше.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", rel);
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      "Usage: tsx scripts/src/identity-preservation-pilot.ts [options]",
      "",
      "Options:",
      "  --max-rows N         limit number of input rows",
      "  --inputs PATH        path to inputs CSV",
      "  --output PATH        path to results CSV",
      "  --provider NAME      only run one provider (gpt_image_1_5_edit | flux_kontext_pro)",
      "  --dry-run            parse inputs and build prompts, no FAL/CLIP calls",
      "  -h, --help           show this help",
    ].join("\n"),
  );
}

// ─── CSV ────────────────────────────────────────────────────────────────────

/**
 * Минимальный RFC-4180 парсер: поля разделены `,`; поля могут быть в `"..."`,
 * внутри которых `""` экранирует кавычку. Используется потому, что
 * `layoutJson` — это сериализованный JSON, содержащий запятые.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Нормализуем переводы строк: \r\n → \n, \r → \n.
  const src = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Финальное поле/строка (если файл не заканчивается \n).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Удаляем полностью пустые строки (например, из-за хвостовой пустой строки).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsv(header: string[], rows: Array<Record<string, string | number | null>>): string {
  const lines: string[] = [];
  lines.push(header.map(escapeCsvField).join(","));
  for (const row of rows) {
    const cells = header.map((key) => {
      const v = row[key];
      if (v === null || v === undefined) return "";
      return escapeCsvField(String(v));
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n") + "\n";
}

function parseInputs(csvText: string): PilotInput[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error("inputs CSV is empty");
  const [header, ...data] = rows;
  if (!header) throw new Error("inputs CSV has no header");

  const expected = ["roomType", "style", "widthCm", "lengthCm", "heightCm", "layoutJson"];
  for (const col of expected) {
    if (!header.includes(col)) {
      throw new Error(`inputs CSV missing column: ${col} (header: ${header.join(",")})`);
    }
  }
  const idx = (col: string): number => header.indexOf(col);

  return data.map((row, i): PilotInput => {
    const layoutRaw = row[idx("layoutJson")] ?? "";
    let layout: Record<string, unknown>;
    try {
      layout = JSON.parse(layoutRaw) as Record<string, unknown>;
    } catch (e) {
      throw new Error(
        `inputs row ${i + 1}: layoutJson is not valid JSON (${
          e instanceof Error ? e.message : String(e)
        })`,
      );
    }
    return {
      inputId: i,
      roomType: row[idx("roomType")] ?? "",
      style: row[idx("style")] ?? "",
      widthCm: parseIntStrict(row[idx("widthCm")] ?? "", `row ${i + 1} widthCm`),
      lengthCm: parseIntStrict(row[idx("lengthCm")] ?? "", `row ${i + 1} lengthCm`),
      heightCm: parseIntStrict(row[idx("heightCm")] ?? "", `row ${i + 1} heightCm`),
      layoutJson: layout,
    };
  });
}

function parseIntStrict(raw: string, label: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`${label}: not a number (got: ${JSON.stringify(raw)})`);
  return n;
}

// ─── Prompts ────────────────────────────────────────────────────────────────

/**
 * Hero_Render — общий вид от двери (Requirement 7.1, 7.2). Промпт упрощён,
 * без полной транскрипции `Layout_JSON` — задача пилота сравнить identity-
 * preservation между провайдерами при одинаковом prompt.
 */
function buildHeroPrompt(input: PilotInput): string {
  return [
    `Photorealistic interior render of a ${input.style} ${input.roomType},`,
    `${(input.widthCm / 100).toFixed(1)} m × ${(input.lengthCm / 100).toFixed(1)} m floor,`,
    `${(input.heightCm / 100).toFixed(1)} m ceiling height,`,
    `wide-angle view from the doorway showing the entire room,`,
    `daylight from a single window, neutral palette, no people, no text, no watermark.`,
  ].join(" ");
}

const ANGLE_DESCRIPTIONS: ReadonlyArray<string> = [
  "view of the main furniture area (bed and headboard)",
  "view of the storage zone (wardrobe and dresser)",
  "view from the window towards the room interior",
  "view of the accent wall behind the bed",
  "view of the ceiling and lighting fixtures from below",
];

/**
 * Angle_Render — Requirement 7.3: edit-image с reference=Hero_Render.
 * `angleIdx` 1..5.
 */
function buildAnglePrompt(input: PilotInput, angleIdx: number): string {
  const desc = ANGLE_DESCRIPTIONS[angleIdx - 1];
  if (!desc) throw new Error(`angleIdx must be 1..5, got: ${angleIdx}`);
  return [
    `Same ${input.style} ${input.roomType} as the reference image,`,
    `keep identical wall colors, materials, furniture, palette and lighting,`,
    `change only the camera angle to: ${desc}.`,
    `Photorealistic, no text, no watermark.`,
  ].join(" ");
}

// ─── CLIP (lazy via @xenova/transformers) ──────────────────────────────────

interface ClipExtractor {
  embed(buffer: Buffer): Promise<Float32Array>;
}

async function loadClipExtractor(): Promise<ClipExtractor | null> {
  try {
    // Indirect import via variable: bypasses TS static module resolution so
    // the script typechecks even when @xenova/transformers is not installed
    // (it's an optional dependency — see scripts/package.json).
    const moduleName = "@xenova/transformers";
    const xenova = (await import(moduleName)) as unknown as {
      AutoProcessor: {
        from_pretrained(id: string): Promise<{
          (image: unknown): Promise<unknown>;
        }>;
      };
      CLIPVisionModelWithProjection: {
        from_pretrained(id: string): Promise<{
          (inputs: unknown): Promise<{ image_embeds: { data: Float32Array } }>;
        }>;
      };
      RawImage: {
        fromBlob(blob: Blob): Promise<unknown>;
      };
    };
    const modelId = "Xenova/clip-vit-base-patch32";
    // eslint-disable-next-line no-console
    console.log(`[pilot] loading CLIP model ${modelId} (first run downloads ~150 MB)...`);
    const processor = await xenova.AutoProcessor.from_pretrained(modelId);
    const visionModel = await xenova.CLIPVisionModelWithProjection.from_pretrained(modelId);
    // eslint-disable-next-line no-console
    console.log("[pilot] CLIP model ready.");
    return {
      async embed(buffer: Buffer): Promise<Float32Array> {
        const blob = new Blob([new Uint8Array(buffer)]);
        const image = await xenova.RawImage.fromBlob(blob);
        const inputs = (await processor(image)) as unknown;
        const out = await visionModel(inputs);
        return out.image_embeds.data;
      },
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `[pilot] @xenova/transformers unavailable — CLIP similarity will be null. ` +
        `Install with: pnpm --filter @workspace/scripts add @xenova/transformers ` +
        `(reason: ${e instanceof Error ? e.message : String(e)})`,
    );
    return null;
  }
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSim: length mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Δ E (CIELAB CIE76) ─────────────────────────────────────────────────────

interface LabColor {
  L: number;
  a: number;
  b: number;
}

/**
 * Доминантный (top-1) цвет изображения через `extractPalette`. Возвращает
 * Lab-координаты, готовые для Δ E. Формат `extractPalette` — массив swatches
 * с полями `hex`, отсортированный по размеру кластера; первый = доминантный.
 */
async function dominantLab(buffer: Buffer): Promise<LabColor> {
  const palette = await extractPalette(buffer, 5);
  if (palette.length === 0) throw new Error("extractPalette returned empty palette");
  const dominant = palette[0]!;
  const rgb = hexToRgb(dominant.hex);
  return rgbToLab(rgb);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace(/^#/, "");
  if (m.length !== 6) throw new Error(`hexToRgb: invalid hex ${hex}`);
  const r = Number.parseInt(m.slice(0, 2), 16);
  const g = Number.parseInt(m.slice(2, 4), 16);
  const b = Number.parseInt(m.slice(4, 6), 16);
  return [r, g, b];
}

/** sRGB (0..255) → CIE XYZ (D65) → CIELAB. Константы из стандарта IEC 61966-2-1 / CIE 15. */
function rgbToLab([r8, g8, b8]: [number, number, number]): LabColor {
  // 1) sRGB → linear RGB
  const lin = (c: number): number => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const r = lin(r8);
  const g = lin(g8);
  const b = lin(b8);

  // 2) linear RGB → XYZ (D65)
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  // 3) XYZ → Lab (D65 reference white)
  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;
  const f = (t: number): number => {
    const delta = 6 / 29;
    return t > Math.pow(delta, 3) ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
  };
  const fx = f(x / Xn);
  const fy = f(y / Yn);
  const fz = f(z / Zn);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** CIE76 Δ E: евклидово расстояние в Lab. Простой и достаточный для пилота
 *  (CIE2000 точнее, но для порога 5 единиц разница несущественна). */
function deltaE76(a: LabColor, b: LabColor): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ─── Main pipeline ──────────────────────────────────────────────────────────

async function processInput(
  input: PilotInput,
  providers: ReadonlyArray<ProviderId>,
  clip: ClipExtractor | null,
  dryRun: boolean,
): Promise<ResultRow[]> {
  const out: ResultRow[] = [];

  // 1) Hero_Render — один раз на вход, общий между провайдерами.
  const heroPrompt = buildHeroPrompt(input);
  // eslint-disable-next-line no-console
  console.log(
    `[pilot] input=${input.inputId} style=${input.style} hero prompt: ${heroPrompt.slice(0, 80)}...`,
  );

  if (dryRun) {
    for (const provider of providers) {
      for (let angleIdx = 1; angleIdx <= 5; angleIdx++) {
        out.push({
          inputId: input.inputId,
          style: input.style,
          provider,
          angleIdx,
          clipSim: null,
          deltaE: null,
          costKopeks: 0,
          providerResponse: "",
        });
      }
    }
    return out;
  }

  const hero = await falGenerateGptImage({
    prompt: heroPrompt,
    imageSize: "1024x1024",
    quality: "medium",
  });
  const heroBuffer = await downloadImage(hero.imageUrl);
  const heroEmbedding = clip ? await clip.embed(heroBuffer) : null;
  const heroLab = await dominantLab(heroBuffer);

  // 2) 5 Angle_Render для каждого провайдера, sequentially (для предсказуемой
  //    стоимости и rate-limit'а; в проде они бы шли параллельно — Requirement 7.4,
  //    но в пилоте важна точность результатов, не latency).
  for (const provider of providers) {
    const editFn = provider === "gpt_image_1_5_edit" ? falGenerateGptImageEdit : falGenerateFluxKontextPro;
    for (let angleIdx = 1; angleIdx <= 5; angleIdx++) {
      const anglePrompt = buildAnglePrompt(input, angleIdx);
      let angle: FalGenerationResult;
      try {
        angle = await editFn({
          prompt: anglePrompt,
          imageUrls: [hero.imageUrl],
          imageSize: "1024x1024",
          quality: "medium",
          inputFidelity: "high",
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          `[pilot] input=${input.inputId} provider=${provider} angle=${angleIdx} FAILED: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        out.push({
          inputId: input.inputId,
          style: input.style,
          provider,
          angleIdx,
          clipSim: null,
          deltaE: null,
          costKopeks: 0,
          providerResponse: `error: ${e instanceof Error ? e.message : String(e)}`,
        });
        continue;
      }

      let clipSim: number | null = null;
      let deltaE: number | null = null;
      try {
        const angleBuffer = await downloadImage(angle.imageUrl);
        if (clip && heroEmbedding) {
          const angleEmbedding = await clip.embed(angleBuffer);
          clipSim = cosineSim(heroEmbedding, angleEmbedding);
        }
        const angleLab = await dominantLab(angleBuffer);
        deltaE = deltaE76(heroLab, angleLab);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          `[pilot] input=${input.inputId} provider=${provider} angle=${angleIdx} metrics failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }

      out.push({
        inputId: input.inputId,
        style: input.style,
        provider,
        angleIdx,
        clipSim,
        deltaE,
        costKopeks: angle.costKopeks,
        providerResponse: angle.imageUrl,
      });

      // eslint-disable-next-line no-console
      console.log(
        `[pilot] input=${input.inputId} provider=${provider} angle=${angleIdx} ` +
          `clipSim=${clipSim?.toFixed(3) ?? "null"} ΔE=${deltaE?.toFixed(2) ?? "null"} ` +
          `cost=${angle.costKopeks}`,
      );
    }
  }

  return out;
}

async function main(): Promise<void> {
  const args = parseCli();

  if (!args.dryRun && !process.env["FAL_API_KEY"]) {
    throw new Error("FAL_API_KEY is not set (use --dry-run to skip FAL/CLIP calls)");
  }

  // eslint-disable-next-line no-console
  console.log(`[pilot] reading inputs from ${args.inputsPath}`);
  const csvText = fs.readFileSync(args.inputsPath, "utf8");
  let inputs = parseInputs(csvText);
  if (args.maxRows !== null) {
    inputs = inputs.slice(0, args.maxRows);
  }
  // eslint-disable-next-line no-console
  console.log(`[pilot] processing ${inputs.length} input row(s)`);

  const providers: ProviderId[] = args.provider
    ? [args.provider]
    : ["gpt_image_1_5_edit", "flux_kontext_pro"];

  const clip = args.dryRun ? null : await loadClipExtractor();

  const allResults: ResultRow[] = [];
  for (const input of inputs) {
    try {
      const rows = await processInput(input, providers, clip, args.dryRun);
      allResults.push(...rows);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        `[pilot] input=${input.inputId} FAILED: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Write CSV
  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  const header = [
    "inputId",
    "style",
    "provider",
    "angleIdx",
    "clipSim",
    "deltaE",
    "costKopeks",
    "providerResponse",
  ];
  const csv = rowsToCsv(
    header,
    allResults.map((r) => ({
      inputId: r.inputId,
      style: r.style,
      provider: r.provider,
      angleIdx: r.angleIdx,
      clipSim: r.clipSim === null ? "" : r.clipSim.toFixed(4),
      deltaE: r.deltaE === null ? "" : r.deltaE.toFixed(2),
      costKopeks: r.costKopeks,
      providerResponse: r.providerResponse,
    })),
  );
  fs.writeFileSync(args.outputPath, csv, "utf8");
  // eslint-disable-next-line no-console
  console.log(`[pilot] wrote ${allResults.length} result row(s) to ${args.outputPath}`);

  // Summary by provider
  const byProvider = new Map<ProviderId, { n: number; clipSum: number; clipN: number; deN: number; deSum: number; cost: number }>();
  for (const r of allResults) {
    const acc = byProvider.get(r.provider) ?? { n: 0, clipSum: 0, clipN: 0, deN: 0, deSum: 0, cost: 0 };
    acc.n++;
    if (r.clipSim !== null) {
      acc.clipSum += r.clipSim;
      acc.clipN++;
    }
    if (r.deltaE !== null) {
      acc.deSum += r.deltaE;
      acc.deN++;
    }
    acc.cost += r.costKopeks;
    byProvider.set(r.provider, acc);
  }
  // eslint-disable-next-line no-console
  console.log("[pilot] summary:");
  for (const [provider, acc] of byProvider) {
    const meanClip = acc.clipN ? (acc.clipSum / acc.clipN).toFixed(3) : "n/a";
    const meanDe = acc.deN ? (acc.deSum / acc.deN).toFixed(2) : "n/a";
    // eslint-disable-next-line no-console
    console.log(
      `  ${provider}: n=${acc.n} meanCLIP=${meanClip} meanΔE=${meanDe} totalCostKopeks=${acc.cost}`,
    );
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

const isMain = import.meta.url === `file://${process.argv[1]}` ||
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");

if (isMain) {
  main().catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[pilot] fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    process.exit(1);
  });
}

// Экспорт для unit-тестов / повторного использования.
export const __test__ = {
  parseCsv,
  rowsToCsv,
  parseInputs,
  buildHeroPrompt,
  buildAnglePrompt,
  hexToRgb,
  rgbToLab,
  deltaE76,
  cosineSim,
};
