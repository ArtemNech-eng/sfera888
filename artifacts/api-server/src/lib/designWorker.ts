/**
 * Background-воркер AI-дизайнера v2 (seed-grade pages, план §22).
 *
 * Каждые 5 секунд берёт 1 дизайн в статусе `generating` и собирает полный
 * пакет артефактов:
 *
 *   • 1 «Было» (input_image_url) — text2img «типовая комната до ремонта»
 *     генерируется сервером для seed-проектов; для user-upload — это фото
 *     пользователя, оставляем как есть.
 *   • 4 ракурса (views[]) — общий вид / акцент / хранение / окно. Для seed
 *     генерируется img2img от «Было» (одна геометрия, разные ракурсы и
 *     фокус); для user-upload — img2img от загруженного фото.
 *   • 6 кропов деталей (detail_crops[]) — sharp нарезает из 4 ракурсов
 *     стандартные квадраты 768×768. Без отдельной AI-генерации.
 *   • Текстовый пакет (designContent) — h1/seoTitle/seoDescription/
 *     description/materials/estimate/solutions через AI-шлюз (тот же что
 *     dispatcherAI). Ротация 8 narrative-стилей.
 *   • Цветовая палитра — из главного ракурса через colorExtraction.
 *
 * Инварианты:
 *   • At-most-once — одна tick'а обрабатывает один job. Watchdog вешает
 *     `failed` на jobs > 10 минут в `generating`.
 *   • Idempotent на restart — если падаем, watchdog или следующий tick
 *     перезаберут.
 */

import {
  db,
  designsTable,
  designImagesTable,
  designGenerationsTable,
  citiesTable,
  type DesignView,
  type DesignDetailCrop,
} from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import sharp from "sharp";
import { objectStorageClient, signObjectURL } from "./objectStorage.js";
import { falGenerate, falGenerateText, falGeneratePanoramicPro, downloadImage } from "./falAi.js";
import { generateDesignContent } from "./designContent.js";
import { extractPalette } from "./colorExtraction.js";
import { pingIndexNow } from "./indexNow.js";

const TICK_INTERVAL_MS = 5000;
const STUCK_TIMEOUT_MIN = 10;

let timer: NodeJS.Timeout | null = null;
let processing = false;

export function startDesignWorker(): void {
  if (timer) return;
  console.log("[designWorker] Starting (tick every 5s)");
  timer = setInterval(() => {
    if (processing) return;
    processing = true;
    tick().catch((e) => {
      console.error("[designWorker] tick error:", e);
    }).finally(() => {
      processing = false;
    });
  }, TICK_INTERVAL_MS);
}

export function stopDesignWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick(): Promise<void> {
  await db
    .update(designsTable)
    .set({
      status: "failed",
      errorMessage: "Stuck for over 10 minutes",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(designsTable.status, "generating"),
        lt(designsTable.updatedAt, new Date(Date.now() - STUCK_TIMEOUT_MIN * 60 * 1000)),
      ),
    );

  const [job] = await db
    .select()
    .from(designsTable)
    .where(eq(designsTable.status, "generating"))
    .orderBy(designsTable.createdAt)
    .limit(1);

  if (!job) return;

  console.log(`[designWorker] Processing design ${job.id} (slug=${job.slug})`);

  try {
    await processDesign(job.id);
    console.log(`[designWorker] Completed design ${job.id}`);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`[designWorker] Failed design ${job.id}:`, errorMessage);
    await db
      .update(designsTable)
      .set({
        status: "failed",
        errorMessage: errorMessage.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(designsTable.id, job.id));
  }
}

// ─── Prompts ────────────────────────────────────────────────────────────────

const STYLE_DESCRIPTORS: Record<string, string> = {
  modern: "modern contemporary",
  scandinavian: "scandinavian minimalist",
  loft: "industrial loft",
  minimalism: "minimalist",
  neoclassic: "neoclassical elegant",
  japandi: "japandi serene",
  classic: "classical elegant",
};

/**
 * «Было» промпт — типовая русская комната до ремонта. Намеренно УГЛОВАТАЯ
 * и убогая, чтобы контраст с «Стало» был очевиден. Используется
 * для seed-проектов (text2img). Для user-upload «Было» — фото клиента.
 */
const ROOM_BEFORE_PROMPTS: Record<string, string> = {
  bedroom: "small soviet apartment bedroom 12 sqm before renovation, single old bed with metal frame, peeling wallpaper, dingy white walls, harsh fluorescent ceiling light, dated wooden wardrobe with chipped veneer, no decor, depressing atmosphere, neglected interior, 1980s look, photo realistic, no people, wide angle from doorway",
  kitchen: "tiny soviet apartment kitchen 7 sqm before renovation, worn 1980s cabinets with chipped veneer, faded yellow tile backsplash, old gas stove, sticky linoleum floor, single bare bulb hanging from ceiling, plain dirty walls, neglected, photo realistic, no people, wide angle",
  bathroom: "small soviet apartment bathroom 4 sqm before renovation, dingy yellow tile from 1970s, rusty old bathtub, cracked sink, plain hanging mirror, single bare bulb, peeling paint, dated and neglected, photo realistic, no people, wide angle",
  living_room: "soviet apartment living room before renovation, old worn brown sofa, dated wooden cabinet wall unit with glass doors, faded carpet on floor, single ceiling chandelier, peeling wallpaper, no decor, neglected 1980s atmosphere, photo realistic, no people, wide angle",
  hallway: "narrow soviet apartment hallway before renovation, peeling wallpaper, worn linoleum floor, plain old wooden coat rack, single bare bulb on ceiling, no decor, dated, photo realistic, no people, wide angle",
  nursery: "soviet apartment child room 10 sqm before renovation, old metal-frame single bed, plain pastel wallpaper, dated wooden wardrobe, single ceiling light, basic furniture from 1980s, no toys or decor, neglected, photo realistic, no people, wide angle",
  apartment: "soviet apartment interior before renovation, peeling wallpaper, dated 1980s furniture, worn linoleum floor, harsh ceiling lighting, no decor, neglected atmosphere, photo realistic, no people, wide angle",
};

/**
 * Базовый «хвост» panoramic-промпта. Калибрует FLUX Pro Ultra на:
 *  • Стиль ДИЗАЙН-МОУДБОРДА (interior design board) — как у DALL-E/GPT-Image
 *  • Архитектурный рендер магазинного качества (Architectural Digest, AD)
 *  • Тёплое мягкое освещение, натуральное дерево, светлые стены
 *  • 4K photoreal — но не репортажная фотография, а полированный концепт
 *
 * Источник: ChatGPT-референс пользователя для создания концепта дизайн-проекта.
 */
const RENDER_SUFFIX = "interior design moodboard, AD Architectural Digest magazine quality, professional interior design rendering, polished design concept presentation, real Russian apartment, achievable affordable budget renovation, not luxury, warm soft lighting, natural wood textures, light walls, ultra realistic, 4K, photorealistic, no people, no text, no watermark, no graphics overlay";

/**
 * Композиция «слева → центр → справа» в одной панораме комнаты. Один кадр
 * показывает все основные функциональные зоны, благодаря этому 4 ракурса
 * (вырезаемые через sharp) гарантированно принадлежат одной комнате с
 * одной палитрой и одним светом.
 */
const ROOM_PANORAMIC_LAYOUT: Record<string, string> = {
  bedroom:
    "left side: workspace at the window with compact desk, chair, plant on the sill, floor lamp; center: queen size double bed with upholstered headboard, two bedside tables with warm table lamps, decorative pillows, framed art above; right side: full-height built-in wardrobe with natural wood door panels, integrated open shelving with books and decor",
  kitchen:
    "left side: dining nook with wooden table and chairs near a window, pendant light above; center: L-shaped kitchen counter with stone countertop, sink with brass faucet, range hood above induction stove, tiled backsplash; right side: tall pantry storage column with integrated appliances and glass-front upper cabinets",
  bathroom:
    "left side: toilet with shelf above; center: vanity with round mirror, basin, marble countertop, sconce lighting on either side, towel hooks below; right side: walk-in shower behind glass partition with rainfall head, marble tile, niche shelf with toiletries",
  living_room:
    "left side: reading nook with lounge chair, floor lamp, side table with book, sheer curtains by the window; center: large fabric sofa with decorative pillows and throw, low coffee table, soft area rug; right side: media wall with TV, low TV console with drawers, decorative shelves with plants",
  hallway:
    "left side: full-height built-in wardrobe with natural wood door panels, integrated shoe storage at the bottom; center: slim console table with vase and tray for keys, large rectangular mirror above, warm sconce lighting; right side: small upholstered bench with cushion, hooks on the wall, framed art",
  nursery:
    "left side: study desk with chair facing the window, ergonomic chair, table lamp, pin board on the wall; center: child bed with safety rail, patterned bedding, decorative pillows, framed art on the wall, bedside small table; right side: low toy storage cabinets with rounded edges, open shelving with books and toys, soft floor mat",
  apartment:
    "left side: bedroom area with queen size bed near the window, sheer curtains, lounge chair; center: living area with fabric sofa, coffee table, soft area rug, gallery wall behind sofa; right side: kitchen counter with bar stools, dining table with chairs, pendant light above",
};

function buildPanoramicPrompt(room: string, style: string, area: number | null): string {
  const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
  const layout = ROOM_PANORAMIC_LAYOUT[room]
    ?? "left side: window zone, center: main functional area, right side: storage";
  const areaPart = area ? ` ${area} sqm` : "";
  const roomNoun = room.replace(/_/g, " ");
  // FLUX 1.1 Pro Ultra хорошо понимает длинные структурированные промпты.
  // Composition prompt инспирирован ChatGPT/DALL-E moodboard-style.
  return [
    `Professional interior design rendering of a ${styleDesc} ${roomNoun}${areaPart} apartment interior.`,
    `Panoramic ultrawide single-frame composition (21:9 cinematic aspect) showing the entire room from left to right with all functional zones in one continuous shot:`,
    layout + ".",
    `One coherent space with consistent materials, palette, and warm soft lighting throughout. Eye-level camera, balanced composition.`,
    RENDER_SUFFIX,
  ].join(" ");
}

/**
 * 6 detail-crops: какие куски из panoramic-источника вырезать. Координаты
 * в относительных долях панорамы (0-1) от ширины/высоты, чтобы работало для
 * любого размера панорамы.
 */
interface CropSpec {
  /** RU-метка для UI. */
  label: string;
  /** Центр crop'а в долях от ширины (0=left, 1=right). */
  cx: number;
  /** Центр crop'а в долях от высоты (0=top, 1=bottom). */
  cy: number;
  /** Размер crop'а в долях от высоты (квадратный, 0.5 = половина высоты). */
  size: number;
}

const CROP_SPECS: CropSpec[] = [
  { label: "Общая зона",         cx: 0.50, cy: 0.55, size: 0.95 },
  { label: "Акцентная стена",    cx: 0.45, cy: 0.55, size: 0.65 },
  { label: "Деталь стены",       cx: 0.55, cy: 0.40, size: 0.45 },
  { label: "Система хранения",   cx: 0.80, cy: 0.55, size: 0.65 },
  { label: "Полки и аксессуары", cx: 0.85, cy: 0.45, size: 0.40 },
  { label: "Зона у окна",        cx: 0.15, cy: 0.55, size: 0.65 },
];

/**
 * 4 ракурса — какую часть панорамы каждый вырезает.
 *  view 1 (общий) = вся панорама scaled к 4:3
 *  view 2 (акцент) = центр-левая часть (где главный фокус: кровать/диван/раковина)
 *  view 3 (хранение) = правая часть (где шкаф/пантри)
 *  view 4 (окно) = левая часть (где окно/workspace/dining)
 */
interface ViewCropSpec {
  position: number;
  label: string;
  /** Левый край в долях от ширины. null = full width. */
  xStart: number | null;
  /** Ширина в долях от ширины. null = full width. */
  xWidth: number | null;
}

const VIEW_CROP_SPECS: ViewCropSpec[] = [
  { position: 1, label: "Общий вид",       xStart: null, xWidth: null }, // вся панорама
  { position: 2, label: "Акцентная стена", xStart: 0.30, xWidth: 0.40 }, // центр
  { position: 3, label: "Зона хранения",   xStart: 0.60, xWidth: 0.40 }, // правая
  { position: 4, label: "У окна",          xStart: 0.00, xWidth: 0.40 }, // левая
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Загрузка готового JPEG-буфера в R2 + возврат публичного URL через
 * наш custom proxy `/api/marketplace/dizajn/img/...`.
 */
async function uploadJpegToR2(
  bucketId: string,
  pathInBucket: string,
  buffer: Buffer,
): Promise<string> {
  await objectStorageClient
    .bucket(bucketId)
    .file(pathInBucket)
    .save(buffer, { contentType: "image/jpeg" });
  // Public URL routing pattern (см. routes/dizajn-images.ts)
  // pathInBucket = "dizajn/results/123_view_1.jpg"
  // public URL    = "/api/marketplace/dizajn/img/results/123_view_1.jpg"
  return "/api/marketplace/dizajn/img/" + pathInBucket.replace(/^dizajn\//, "");
}

/**
 * Генерирует подпись и URL для подписанного R2-объекта (для передачи в Fal.ai).
 */
async function signR2(bucketId: string, key: string, ttlSec = 600): Promise<string> {
  return signObjectURL({
    bucketName: bucketId,
    objectName: key,
    method: "GET",
    ttlSec,
  });
}

/**
 * Вырезает квадратный crop 768×768 из source-панорамы по относительным
 * координатам (cx, cy, size). Используется для 6 detail-кропов.
 */
async function cropDetailFromPanorama(
  panoramaBuffer: Buffer,
  spec: CropSpec,
): Promise<Buffer> {
  const meta = await sharp(panoramaBuffer).metadata();
  const W = meta.width ?? 2048;
  const H = meta.height ?? 768;
  const sizePx = Math.floor(spec.size * H);
  const left = clamp(Math.floor(spec.cx * W - sizePx / 2), 0, W - sizePx);
  const top = clamp(Math.floor(spec.cy * H - sizePx / 2), 0, H - sizePx);

  return sharp(panoramaBuffer)
    .extract({ left, top, width: sizePx, height: sizePx })
    .resize(768, 768, { fit: "cover" })
    .jpeg({ quality: 86, progressive: true })
    .toBuffer();
}

/**
 * Вырезает 4:3 ракурс из panoramic source. Если xStart/xWidth=null — вся
 * панорама scaled to 4:3 (с обрезкой при необходимости).
 */
async function cropViewFromPanorama(
  panoramaBuffer: Buffer,
  spec: ViewCropSpec,
): Promise<Buffer> {
  const meta = await sharp(panoramaBuffer).metadata();
  const W = meta.width ?? 2048;
  const H = meta.height ?? 768;

  let extractLeft: number;
  let extractWidth: number;
  if (spec.xStart == null || spec.xWidth == null) {
    extractLeft = 0;
    extractWidth = W;
  } else {
    extractLeft = clamp(Math.floor(spec.xStart * W), 0, W - 1);
    extractWidth = clamp(Math.floor(spec.xWidth * W), 1, W - extractLeft);
  }

  return sharp(panoramaBuffer)
    .extract({ left: extractLeft, top: 0, width: extractWidth, height: H })
    .resize(1024, 768, { fit: "cover" })
    .jpeg({ quality: 88, progressive: true })
    .toBuffer();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Ping IndexNow с URL'ами свеже-опубликованного дизайна. Fire-and-forget.
 */
async function pingForDesign(slug: string, room: string, style: string): Promise<void> {
  const roomSlug = room.replace(/_/g, "-");
  const urls = [
    `/dizajn/${slug}`,
    `/dizajn/${roomSlug}-${style}`,
    `/dizajn/${roomSlug}`,
    `/dizajn/${style}`,
  ];
  try {
    const sent = await pingIndexNow(urls);
    if (sent > 0) {
      console.log(`[designWorker] IndexNow pinged ${sent} URLs for design ${slug}`);
    }
  } catch (e) {
    console.error("[designWorker] IndexNow ping failed:", e instanceof Error ? e.message : e);
  }
}

// ─── Main pipeline ───────────────────────────────────────────────────────────

async function processDesign(designId: number): Promise<void> {
  const [job] = await db
    .select({
      design: designsTable,
      city: { name: citiesTable.name },
    })
    .from(designsTable)
    .leftJoin(citiesTable, eq(designsTable.cityId, citiesTable.id))
    .where(eq(designsTable.id, designId))
    .limit(1);

  if (!job) throw new Error("Design row vanished");
  const { design } = job;

  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  }

  const areaNum = design.area ? parseFloat(design.area) : null;

  // ── Mode detection: seed (text2img × 4) vs user-upload (img2img × 4). ──
  // Seed-проекты: inputImageUrl=null. Для разнообразия и чтобы избежать
  // «4 одинаковых ракурса от одной before» — каждый ракурс генерится как
  // самостоятельный text2img с детализированным prompt'ом (что в кадре).
  // User-upload: inputImageUrl содержит R2 key пользовательского фото —
  // делаем img2img × 4 от этого фото, сохраняем геометрию комнаты.
  const isSeedMode = !design.inputImageUrl;

  // ── 1. Resolve "Before" image. ──────────────────────────────────────────
  let beforeKey: string;
  let beforePublicUrl: string;

  if (!isSeedMode) {
    // User uploaded — inputImageUrl содержит R2 key.
    beforeKey = design.inputImageUrl!;
    beforePublicUrl = beforeKey.startsWith("/")
      ? beforeKey
      : "/api/marketplace/dizajn/img/" + beforeKey.replace(/^dizajn\//, "");
  } else {
    // Seed — генерируем «Было» text2img (намеренно убогая комната).
    const beforePrompt = ROOM_BEFORE_PROMPTS[design.roomType]
      ?? `typical neglected ${design.roomType} interior before renovation, plain walls, basic furniture, photo realistic, no people, wide angle`;

    console.log(`[designWorker] design ${design.id}: generating BEFORE (text2img)`);
    const beforeResult = await falGenerateText({
      prompt: beforePrompt,
      aspectRatio: "4:3",
    });
    const beforeBuffer = await downloadImage(beforeResult.imageUrl);
    beforeKey = `dizajn/before/${design.id}_before.jpg`;
    beforePublicUrl = await uploadJpegToR2(bucketId, beforeKey, beforeBuffer);

    await db.insert(designGenerationsTable).values({
      designId: design.id,
      provider: "fal-ai",
      model: process.env.FAL_MODEL_TEXT ?? "fal-ai/flux/dev",
      prompt: beforePrompt,
      roomType: design.roomType,
      style: design.style,
      status: "success",
      costKopeks: beforeResult.costKopeks,
      providerResponse: { generationMs: beforeResult.generationMs, view: "before", mode: "text2img" },
      completedAt: new Date(),
    });

    await db
      .update(designsTable)
      .set({ inputImageUrl: beforeKey, updatedAt: new Date() })
      .where(eq(designsTable.id, design.id));
  }

  // ── 2. Параллельно: panoramic + текстовый пакет от AI. ─────────────────
  // Если seed-проект уже принёс h1/description/etc — не вызываем AI, экономим.
  const hasSeedContent = !!design.h1 && !!design.description
    && Array.isArray(design.materials) && design.materials.length > 0
    && Array.isArray(design.estimate) && design.estimate.length > 0
    && Array.isArray(design.solutions) && design.solutions.length > 0;

  console.log(
    `[designWorker] design ${design.id}: ${isSeedMode ? "panoramic single-shot text2img" : "img2img × 4"}`
    + (hasSeedContent ? " (seed content — skipping AI text gen)" : " + AI content"),
  );

  // Seed-mode: ОДИН panoramic вызов через FLUX Pro Ultra (премиум модель,
  //            качество на уровне DALL-E 3). Затем sharp нарезает на 4
  //            ракурса + 6 кропов. Вся комната в одном кадре → одна
  //            палитра/материалы.
  // User-upload: 4 img2img от user-фото — keeps user's room geometry.
  // Оба режима параллельно с AI text generation.
  const renderPromise = isSeedMode
    ? falGeneratePanoramicPro({
        prompt: buildPanoramicPrompt(design.roomType, design.style, areaNum),
        aspectRatio: "21:9",
      })
    : signR2(bucketId, beforeKey).then((falInputUrl) =>
        Promise.all(
          VIEW_CROP_SPECS.map((spec) =>
            falGenerate({
              initImageUrl: falInputUrl,
              prompt: buildPanoramicPrompt(design.roomType, design.style, areaNum),
              aspectRatio: "4:3",
              strength: 0.78,
            }).then((result) => ({ ...result, spec })),
          ),
        ),
      );

  const [renderResult, content] = await Promise.all([
    renderPromise,
    hasSeedContent
      ? Promise.resolve({
          h1: design.h1!,
          seoTitle: design.seoTitle ?? "",
          seoDescription: design.seoDescription ?? "",
          description: design.description!,
          materials: design.materials!,
          estimate: design.estimate!,
          solutions: design.solutions!,
        })
      : generateDesignContent({
          room: design.roomType,
          style: design.style,
          area: areaNum,
          budget: design.budget,
          durationWeeks: design.durationWeeks,
          cityName: job.city?.name ?? null,
          district: design.district,
          seed: design.id,
        }),
  ]);

  // ── 3. Готовим 4 view-buffers через sharp (для seed) или из 4 img2img calls (user). ─
  const views: DesignView[] = [];
  const viewBuffers: Buffer[] = [];
  let mainResultPublicUrl: string | null = null;
  let mainImageBuffer: Buffer | null = null;
  let panoramaBuffer: Buffer | null = null;

  if (isSeedMode) {
    // Скачиваем panoramic один раз и режем sharp'ом.
    const r = renderResult as Awaited<ReturnType<typeof falGenerateText>>;
    panoramaBuffer = await downloadImage(r.imageUrl);

    await db.insert(designGenerationsTable).values({
      designId: design.id,
      provider: "fal-ai",
      model: process.env.FAL_MODEL_PANORAMIC ?? "fal-ai/flux-pro/v1.1-ultra",
      prompt: buildPanoramicPrompt(design.roomType, design.style, areaNum),
      roomType: design.roomType,
      style: design.style,
      status: "success",
      costKopeks: r.costKopeks,
      providerResponse: {
        generationMs: r.generationMs,
        view: "panorama",
        mode: "text2img-panoramic-pro",
        imageSize: `${r.width}x${r.height}`,
      },
      completedAt: new Date(),
    });

    for (let i = 0; i < VIEW_CROP_SPECS.length; i++) {
      const spec = VIEW_CROP_SPECS[i]!;
      const buf = await cropViewFromPanorama(panoramaBuffer, spec);
      viewBuffers[i] = buf;

      const filename = `${design.id}_view_${spec.position}.jpg`;
      const r2Key = `dizajn/results/${filename}`;
      const publicUrl = await uploadJpegToR2(bucketId, r2Key, buf);

      views.push({ url: publicUrl, label: spec.label, position: spec.position });

      await db.insert(designImagesTable).values({
        designId: design.id,
        type: `view_${spec.position}`,
        url: publicUrl,
        width: 1024,
        height: 768,
        sortOrder: i,
      });

      if (i === 0) {
        mainResultPublicUrl = publicUrl;
        mainImageBuffer = buf;
      }
    }
  } else {
    // User-upload img2img × 4 path.
    const renderResults = renderResult as Array<Awaited<ReturnType<typeof falGenerate>> & { spec: ViewCropSpec }>;
    for (let i = 0; i < renderResults.length; i++) {
      const r = renderResults[i]!;
      const buf = await downloadImage(r.imageUrl);
      viewBuffers[i] = buf;

      const filename = `${design.id}_view_${r.spec.position}.jpg`;
      const r2Key = `dizajn/results/${filename}`;
      const publicUrl = await uploadJpegToR2(bucketId, r2Key, buf);

      views.push({ url: publicUrl, label: r.spec.label, position: r.spec.position });

      await db.insert(designImagesTable).values({
        designId: design.id,
        type: `view_${r.spec.position}`,
        url: publicUrl,
        width: r.width,
        height: r.height,
        sortOrder: i,
      });

      await db.insert(designGenerationsTable).values({
        designId: design.id,
        provider: "fal-ai",
        model: process.env.FAL_MODEL ?? "fal-ai/flux/dev/image-to-image",
        prompt: buildPanoramicPrompt(design.roomType, design.style, areaNum),
        roomType: design.roomType,
        style: design.style,
        status: "success",
        costKopeks: r.costKopeks,
        providerResponse: {
          generationMs: r.generationMs,
          view: `view_${r.spec.position}`,
          mode: "img2img",
        },
        completedAt: new Date(),
      });

      if (i === 0) {
        mainResultPublicUrl = publicUrl;
        mainImageBuffer = buf;
      }
    }
  }

  if (!mainResultPublicUrl || !mainImageBuffer) {
    throw new Error("Main render not produced");
  }

  // ── 4. 6 detail-crops через sharp ──────────────────────────────────────
  // Источник: panoramic (для seed) или view_2 «акцент» (для user-upload).
  console.log(`[designWorker] design ${design.id}: generating 6 detail crops (sharp)`);
  const detailCrops: DesignDetailCrop[] = [];
  const cropSource = panoramaBuffer ?? viewBuffers[1] ?? mainImageBuffer;

  for (let i = 0; i < CROP_SPECS.length; i++) {
    const spec = CROP_SPECS[i]!;
    const cropBuffer = await cropDetailFromPanorama(cropSource, spec);
    const filename = `${design.id}_crop_${i + 1}.jpg`;
    const r2Key = `dizajn/crops/${filename}`;
    const publicUrl = await uploadJpegToR2(bucketId, r2Key, cropBuffer);

    detailCrops.push({
      url: publicUrl,
      label: spec.label,
      fromView: 1,
    });
  }

  // ── 5. Цветовая палитра из главного ракурса. ───────────────────────────
  const colorPalette = await extractPalette(mainImageBuffer, 5);

  // ── 6. Финальный UPDATE с full payload. ────────────────────────────────
  await db
    .update(designsTable)
    .set({
      status: "completed",
      resultImageUrl: mainResultPublicUrl,
      views,
      detailCrops,
      h1: content.h1,
      seoTitle: content.seoTitle,
      seoDescription: content.seoDescription,
      description: content.description,
      materials: content.materials,
      estimate: content.estimate,
      solutions: content.solutions,
      colorPalette: colorPalette,
      isPublic: true,
      publicConsentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(designsTable.id, design.id));

  // ── 7. IndexNow ping. ─────────────────────────────────────────────────
  void pingForDesign(design.slug ?? "", design.roomType, design.style);
}
