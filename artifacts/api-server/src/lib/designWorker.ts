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
 * 4 ракурса проекта. Hero (view 1) генерится первым text2img'ом, затем
 * views 2/3/4 параллельно генерятся с image_prompt=hero чтобы FLUX Pro
 * Ultra унаследовал стиль/палитру/материалы и выдал РАЗНЫЕ углы камеры
 * одной и той же по визуальной DNA комнаты.
 */
interface ViewSpec {
  position: number;
  /** RU label для UI. */
  label: string;
  /** EN-функция, возвращающая prompt для конкретной комнаты. */
  buildPrompt(room: string, style: string, area: number | null): string;
  /** Aspect для FLUX Pro Ultra. */
  aspect: "16:9" | "4:3" | "1:1" | "3:4";
  /** Сила влияния hero-референса. 0=полная свобода, 1=копия. */
  imagePromptStrength: number;
}

/** Что должно быть в кадре каждого ракурса по типу комнаты. */
const ROOM_VIEW_SUBJECTS: Record<string, [string, string, string, string]> = {
  // [view_1 общий, view_2 акцент-кровати/дивана, view_3 хранение, view_4 окно]
  bedroom: [
    "wide angle from the doorway showing the entire bedroom layout: queen size double bed centered with upholstered headboard and twin bedside tables with lamps, full-height built-in wardrobe along the right wall, workspace desk near the window on the left, soft area rug on light oak floor",
    "front-on close-up of the bed area: queen size double bed with upholstered headboard, twin bedside tables with warm table lamps, decorative pillows, framed wall art above the headboard, sconce lights on either side, no wardrobe in frame",
    "side angle of the wardrobe wall: full-height built-in wardrobe with natural wood door panels and integrated open shelving with books and decor objects, wood-and-textile composition, no bed in frame",
    "intimate corner shot of the workspace at the window: compact desk with chair, floor lamp beside, sheer curtains, plant on the sill, soft daylight, no bed in frame",
  ],
  kitchen: [
    "wide angle from the doorway showing the entire kitchen: L-shaped layout with base and wall cabinets, stone countertop, range hood above induction stove, dining nook with wooden table and chairs near the window, warm pendant light",
    "front-on view of the kitchen counter: tiled backsplash, stone countertop with cooking utensils and a vase, range hood centered, brass faucet over the sink, no dining table in frame",
    "side view of the tall pantry storage column with integrated appliances and glass-front upper cabinets, no counters in frame",
    "intimate corner shot of the dining area near the window: round wooden table with chairs, pendant light above, window with linen curtains, soft daylight, no kitchen counters in frame",
  ],
  bathroom: [
    "wide angle from the doorway showing the entire bathroom: walk-in shower behind glass partition on the right, vanity with basin and round mirror in center, toilet on the left, marble or porcelain tile, warm sconce lighting",
    "front-on close-up of the vanity: round mirror, basin with modern faucet, marble or quartz countertop, sconce lighting on either side, no shower in frame",
    "side view of tall storage column with built-in cabinet, open shelves with rolled towels and a basket, no shower in frame",
    "shower zone close-up: glass-walled walk-in shower with rainfall head, marble tile, niche shelf with toiletries, no vanity in frame",
  ],
  living_room: [
    "wide angle from the doorway showing the entire living room: large fabric sofa centered, low coffee table in front, TV unit on opposite wall, large window with sheer curtains, soft area rug, warm floor lamp",
    "front-on close-up of the seating area: sofa with decorative pillows and a throw, side table with table lamp and books, gallery wall behind sofa, no TV in frame",
    "media wall side view: TV mounted on wall, low TV console with drawers, decorative items on shelves, plant in pot, no sofa in frame",
    "intimate corner shot of the reading nook by the window: lounge chair with throw, floor lamp, side table with book, sheer curtains, soft daylight, no TV in frame",
  ],
  hallway: [
    "wide angle from the front door showing the entire hallway: full-height built-in wardrobe to one side, slim console table with mirror above on opposite wall, decorative ceiling lighting, runner rug",
    "front-on close-up of the entryway console: console table with vase and tray for keys, large rectangular mirror above, warm sconce lighting on the side",
    "side view of the wardrobe wall: full-height built-in wardrobe with natural wood door panels, integrated shoe storage at the bottom, no console in frame",
    "end of the hallway opening into the apartment: small upholstered bench with cushion, hooks on the wall for jackets, framed art, ceiling light",
  ],
  nursery: [
    "wide angle of the entire child room from doorway: child bed with safety rail, study desk with chair near the window, low toy storage cabinets, soft area rug, warm pendant light",
    "front-on close-up of the bed area: bed with patterned bedding, decorative pillows, framed art on the wall, bedside small table with night light, no desk in frame",
    "play and storage zone side view: low cabinets for toys with rounded edges, open shelving with books and toys, soft floor mat, no bed in frame",
    "intimate corner shot of the study and window area: child desk facing the window, ergonomic chair, pin board on the wall, table lamp, soft daylight, no bed in frame",
  ],
  apartment: [
    "wide angle of the open-plan main room from the entrance: living area with sofa and coffee table, dining area with wooden table, kitchen counter visible at the back, warm pendant lights",
    "front-on close-up of the living area: fabric sofa with cushions, coffee table with magazines, area rug, decorative shelves, gallery wall, no kitchen in frame",
    "kitchen and dining zone: kitchen island with bar stools, dining table with chairs, pendant lights above, no sofa in frame",
    "bedroom area near the window: queen size bed visible behind partition, window with linen curtains, soft daylight, lounge chair",
  ],
};

const VIEW_SPECS: ViewSpec[] = [
  {
    position: 1,
    label: "Общий вид",
    aspect: "16:9",
    imagePromptStrength: 0, // hero — без референса (генерим первым)
    buildPrompt: (room, style, area) => {
      const subj = ROOM_VIEW_SUBJECTS[room]?.[0] ?? "wide angle of the entire room layout";
      const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
      const areaPart = area ? ` ${area} sqm` : "";
      const roomNoun = room.replace(/_/g, " ");
      return [
        `Professional interior design rendering of a ${styleDesc} ${roomNoun}${areaPart} apartment.`,
        `Wide angle hero shot from the doorway showing the entire room layout in a single coherent composition.`,
        subj + ".",
        `Eye-level camera, balanced composition, depth of field, warm soft lighting throughout.`,
        RENDER_SUFFIX,
      ].join(" ");
    },
  },
  {
    position: 2,
    label: "Акцентная стена",
    aspect: "4:3",
    imagePromptStrength: 0.45,
    buildPrompt: (room, style, area) => {
      const subj = ROOM_VIEW_SUBJECTS[room]?.[1] ?? "close-up of the main feature";
      const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
      const areaPart = area ? ` ${area} sqm` : "";
      const roomNoun = room.replace(/_/g, " ");
      return [
        `Same ${styleDesc} ${roomNoun}${areaPart} apartment as the reference image, same materials, same palette, same lighting.`,
        `Different camera angle: ${subj}.`,
        `Centered framing, intimate close-up composition, soft natural light.`,
        RENDER_SUFFIX,
      ].join(" ");
    },
  },
  {
    position: 3,
    label: "Зона хранения",
    aspect: "4:3",
    imagePromptStrength: 0.45,
    buildPrompt: (room, style, area) => {
      const subj = ROOM_VIEW_SUBJECTS[room]?.[2] ?? "side view of the storage area";
      const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
      const areaPart = area ? ` ${area} sqm` : "";
      const roomNoun = room.replace(/_/g, " ");
      return [
        `Same ${styleDesc} ${roomNoun}${areaPart} apartment as the reference image, same materials and palette.`,
        `Different camera angle: ${subj}.`,
        `Side angle composition, balanced framing.`,
        RENDER_SUFFIX,
      ].join(" ");
    },
  },
  {
    position: 4,
    label: "У окна",
    aspect: "4:3",
    imagePromptStrength: 0.45,
    buildPrompt: (room, style, area) => {
      const subj = ROOM_VIEW_SUBJECTS[room]?.[3] ?? "corner near the window";
      const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
      const areaPart = area ? ` ${area} sqm` : "";
      const roomNoun = room.replace(/_/g, " ");
      return [
        `Same ${styleDesc} ${roomNoun}${areaPart} apartment as the reference image, same materials and palette.`,
        `Different camera angle: ${subj}.`,
        `Soft daylight, depth of field, intimate corner framing.`,
        RENDER_SUFFIX,
      ].join(" ");
    },
  },
];

function buildPanoramicPrompt(room: string, style: string, area: number | null): string {
  // Used for legacy img2img (user-upload) path. Returns wide-angle hero prompt.
  return VIEW_SPECS[0]!.buildPrompt(room, style, area);
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

  // ── 2. Параллельно: рендер ракурсов + текстовый пакет от AI. ──────────
  // Если seed-проект уже принёс h1/description/etc — не вызываем AI, экономим.
  const hasSeedContent = !!design.h1 && !!design.description
    && Array.isArray(design.materials) && design.materials.length > 0
    && Array.isArray(design.estimate) && design.estimate.length > 0
    && Array.isArray(design.solutions) && design.solutions.length > 0;

  console.log(
    `[designWorker] design ${design.id}: ${isSeedMode ? "FLUX Pro Ultra hero + 3 image-prompted views" : "img2img × 4"}`
    + (hasSeedContent ? " (seed content — skipping AI text gen)" : " + AI content"),
  );

  // Seed-mode: 4 разных text2img через FLUX Pro Ultra. Hero (view 1) —
  //   wide-angle 16:9 от двери, без image_prompt. Views 2/3/4 параллельно
  //   генерятся с image_prompt=hero (strength=0.45) — стиль/палитра/
  //   материалы наследуются от hero, а композиция и угол камеры РАЗНЫЕ.
  // User-upload: 4 img2img от user-фото — keeps user's room geometry.
  //
  // Параллельно с рендерами — AI генерация контента (если нет seed-текста).

  // Текст всегда параллельно с генерацией.
  const contentPromise: Promise<{
    h1: string;
    seoTitle: string;
    seoDescription: string;
    description: string;
    materials: typeof design.materials;
    estimate: typeof design.estimate;
    solutions: typeof design.solutions;
  }> = hasSeedContent
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
      });

  const views: DesignView[] = [];
  const viewBuffers: Buffer[] = [];
  let mainResultPublicUrl: string | null = null;
  let mainImageBuffer: Buffer | null = null;
  let heroBuffer: Buffer | null = null;

  if (isSeedMode) {
    // ── 2.1. Hero (view 1) — text2img Pro Ultra без image_prompt. ──────
    console.log(`[designWorker] design ${design.id}: generating hero (view 1, FLUX Pro Ultra)`);
    const heroSpec = VIEW_SPECS[0]!;
    const heroResult = await falGeneratePanoramicPro({
      prompt: heroSpec.buildPrompt(design.roomType, design.style, areaNum),
      aspectRatio: heroSpec.aspect,
    });
    heroBuffer = await downloadImage(heroResult.imageUrl);
    const heroR2Key = `dizajn/results/${design.id}_view_${heroSpec.position}.jpg`;
    const heroPublicUrl = await uploadJpegToR2(bucketId, heroR2Key, heroBuffer);
    viewBuffers[0] = heroBuffer;

    views.push({ url: heroPublicUrl, label: heroSpec.label, position: heroSpec.position });
    await db.insert(designImagesTable).values({
      designId: design.id,
      type: `view_${heroSpec.position}`,
      url: heroPublicUrl,
      width: heroResult.width,
      height: heroResult.height,
      sortOrder: 0,
    });
    await db.insert(designGenerationsTable).values({
      designId: design.id,
      provider: "fal-ai",
      model: process.env.FAL_MODEL_PANORAMIC ?? "fal-ai/flux-pro/v1.1-ultra",
      prompt: heroSpec.buildPrompt(design.roomType, design.style, areaNum),
      roomType: design.roomType,
      style: design.style,
      status: "success",
      costKopeks: heroResult.costKopeks,
      providerResponse: {
        generationMs: heroResult.generationMs,
        view: `view_${heroSpec.position}`,
        mode: "text2img-hero-pro",
        imageSize: `${heroResult.width}x${heroResult.height}`,
      },
      completedAt: new Date(),
    });

    mainResultPublicUrl = heroPublicUrl;
    mainImageBuffer = heroBuffer;

    // ── 2.2. Views 2/3/4 — text2img Pro Ultra с image_prompt=hero. ─────
    // Стиль/палитра/материалы наследуются от hero, угол камеры различный.
    const heroSignedUrl = await signR2(bucketId, heroR2Key);

    console.log(`[designWorker] design ${design.id}: generating 3 views (image_prompt=hero, parallel)`);
    const otherViewSpecs = VIEW_SPECS.slice(1);
    const otherResults = await Promise.all(
      otherViewSpecs.map((spec) =>
        falGeneratePanoramicPro({
          prompt: spec.buildPrompt(design.roomType, design.style, areaNum),
          aspectRatio: spec.aspect,
          imagePromptUrl: heroSignedUrl,
          imagePromptStrength: spec.imagePromptStrength,
        }).then((result) => ({ ...result, spec })),
      ),
    );

    for (let i = 0; i < otherResults.length; i++) {
      const r = otherResults[i]!;
      const buf = await downloadImage(r.imageUrl);
      viewBuffers[i + 1] = buf;
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
        sortOrder: r.spec.position - 1,
      });

      await db.insert(designGenerationsTable).values({
        designId: design.id,
        provider: "fal-ai",
        model: process.env.FAL_MODEL_PANORAMIC ?? "fal-ai/flux-pro/v1.1-ultra",
        prompt: r.spec.buildPrompt(design.roomType, design.style, areaNum),
        roomType: design.roomType,
        style: design.style,
        status: "success",
        costKopeks: r.costKopeks,
        providerResponse: {
          generationMs: r.generationMs,
          view: `view_${r.spec.position}`,
          mode: "text2img-imageprompt",
          imageSize: `${r.width}x${r.height}`,
        },
        completedAt: new Date(),
      });
    }
  } else {
    // ── User-upload: img2img × 4 от user-фото. Каждый view со своим
    //    промптом ракурса (но один и тот же init image — фото клиента).
    const falInputUrl = await signR2(bucketId, beforeKey);
    console.log(`[designWorker] design ${design.id}: generating 4 views (img2img × 4 from user upload)`);

    const renderResults = await Promise.all(
      VIEW_SPECS.map((spec) =>
        falGenerate({
          initImageUrl: falInputUrl,
          prompt: spec.buildPrompt(design.roomType, design.style, areaNum),
          aspectRatio: spec.aspect === "16:9" ? "16:9" : "4:3",
          strength: 0.78,
        }).then((result) => ({ ...result, spec })),
      ),
    );

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
        prompt: r.spec.buildPrompt(design.roomType, design.style, areaNum),
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

  // ── 3. Ждём AI-text generation. ─────────────────────────────────────────
  const content = await contentPromise;

  // ── 4. 6 detail-crops через sharp ──────────────────────────────────────
  // Источник: hero (view 1) — наиболее богатый кадр со всеми зонами.
  console.log(`[designWorker] design ${design.id}: generating 6 detail crops (sharp)`);
  const detailCrops: DesignDetailCrop[] = [];
  const cropSource = heroBuffer ?? mainImageBuffer;

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
