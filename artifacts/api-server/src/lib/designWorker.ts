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
import { falGenerate, falGenerateText, downloadImage } from "./falAi.js";
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
 * 4 ракурса проекта. Каждый = отдельная text2img-генерация (для seed) или
 * img2img от user-upload (когда есть фото клиента). Поскольку мы НЕ
 * используем общий init image для seed'а, добавляем в промпт жёсткие
 * указатели на КОМПОЗИЦИЮ — что должно быть в кадре, что не должно — иначе
 * FLUX уходит в типовое "interior shot" без целевых предметов.
 */
interface ViewSpec {
  position: number;
  /** RU label для UI. */
  label: string;
  /**
   * EN-функция, возвращающая тело промпта для конкретной комнаты.
   * Должна явно указывать предметы в кадре (visible: ..., featuring: ...)
   * чтобы FLUX не подменял мебель.
   */
  buildPrompt(room: string, style: string, area: number | null): string;
  aspect: "16:9" | "4:3" | "1:1";
}

/** Какие предметы должны быть видны на каждом ракурсе по типу комнаты. */
const ROOM_VIEW_SUBJECTS: Record<string, [string, string, string, string]> = {
  // [view_1 общий, view_2 акцент, view_3 хранение, view_4 окно]
  bedroom: [
    "queen size double bed centered with upholstered headboard, two bedside tables with table lamps, wardrobe partially visible to the side, soft area rug on the floor",
    "close-up of the bed area: upholstered headboard against the accent wall, twin bedside tables with warm table lamps, decorative pillows on the bed, framed wall art above the headboard",
    "side view of the wardrobe wall: full-height built-in wardrobe with natural wood door panels, integrated open shelving section with books and decorative objects, no bed in frame",
    "workspace corner near the tall window: compact desk with chair facing the window, floor lamp beside, sheer curtains, plant on the sill, soft daylight, no bed in frame",
  ],
  kitchen: [
    "L-shaped kitchen layout fully visible from doorway, base and wall cabinets, stone countertop with sink, range hood above induction stove, dining nook with wooden table and chairs, warm pendant light",
    "close-up of the kitchen counter: tiled backsplash detail, countertop with cooking utensils and a vase, range hood, brass faucet over the sink, warm under-cabinet lighting",
    "view of tall kitchen storage column: pantry cabinets with integrated appliances, glass-front upper cabinets, no dining table in frame",
    "dining area near the window: round wooden table with chairs, pendant light above, window with linen curtains, soft daylight, no kitchen counters in frame",
  ],
  bathroom: [
    "wide angle showing entire bathroom from doorway: walk-in shower behind glass partition, vanity with mirror and basin, toilet, towel rack on wall, warm sconce lighting",
    "close-up of the vanity: round mirror, basin with modern faucet, marble or quartz countertop, sconce lighting on either side, towel hooks below",
    "tall storage column with built-in cabinet, open shelves with rolled towels and a basket for laundry, no shower in frame",
    "shower zone: glass-walled walk-in shower with rainfall head, marble or porcelain tile, niche shelf with toiletries, no vanity in frame",
  ],
  living_room: [
    "wide angle of living room from doorway: large fabric sofa centered, low coffee table in front, TV unit on opposite wall, large window with curtains, soft area rug, warm floor lamp",
    "close-up of the seating area: sofa with decorative pillows and a throw, side table with table lamp and a stack of books, gallery wall behind sofa, no TV in frame",
    "media wall: TV mounted on wall, low TV console with drawers, decorative items on shelves, plant in pot, no sofa in frame",
    "reading nook by the window: lounge chair with throw, floor lamp, side table with book, sheer curtains, soft daylight, no TV in frame",
  ],
  hallway: [
    "wide angle of the hallway from the front door: full-height built-in wardrobe to one side, slim console table with mirror above on opposite wall, decorative ceiling lighting, runner rug",
    "close-up of the entryway console: console table with vase and tray for keys, large rectangular mirror above, warm sconce lighting on the side",
    "wardrobe wall: full-height built-in wardrobe with natural wood door panels, integrated shoe storage at the bottom, no console in frame",
    "end of the hallway opening into the apartment: small upholstered bench with cushion, hooks on the wall for jackets, framed art, ceiling light",
  ],
  nursery: [
    "wide angle of child room from doorway: child bed with safety rail, study desk with chair near the window, low toy storage cabinets, soft area rug, warm pendant light",
    "close-up of the bed area: bed with patterned bedding, decorative pillows, framed art on the wall, bedside small table with night light",
    "play and storage zone: low cabinets for toys with rounded edges, open shelving with books and toys, soft floor mat, no bed in frame",
    "study and window area: child desk facing the window, ergonomic chair, pin board on the wall, table lamp, soft daylight, no bed in frame",
  ],
  apartment: [
    "wide angle of the open-plan main room from the entrance: living area with sofa and coffee table, dining area with wooden table, kitchen counter visible at the back, warm pendant lights",
    "close-up of the living area: fabric sofa with cushions, coffee table with magazines, area rug, decorative shelves, gallery wall, no kitchen in frame",
    "kitchen and dining zone: kitchen island with bar stools, dining table with chairs, pendant lights above the dining table",
    "bedroom area near the window: queen size bed visible behind partition or sliding door, window with linen curtains, soft daylight, lounge chair",
  ],
};

const VIEW_SPECS: ViewSpec[] = [
  {
    position: 1,
    label: "Общий вид",
    aspect: "4:3",
    buildPrompt: (room, style, area) => {
      const subj = ROOM_VIEW_SUBJECTS[room]?.[0] ?? "wide angle of the entire room layout";
      const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
      const areaPart = area ? `, ${area} sqm` : "";
      return `${styleDesc} ${room.replace(/_/g, " ")}${areaPart}, wide angle from the doorway, ${subj}, ${RENDER_SUFFIX}`;
    },
  },
  {
    position: 2,
    label: "Акцентная стена",
    aspect: "4:3",
    buildPrompt: (room, style, area) => {
      const subj = ROOM_VIEW_SUBJECTS[room]?.[1] ?? "close-up of the main feature";
      const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
      const areaPart = area ? `, ${area} sqm` : "";
      return `${styleDesc} ${room.replace(/_/g, " ")}${areaPart}, ${subj}, intimate composition, ${RENDER_SUFFIX}`;
    },
  },
  {
    position: 3,
    label: "Зона хранения",
    aspect: "4:3",
    buildPrompt: (room, style, area) => {
      const subj = ROOM_VIEW_SUBJECTS[room]?.[2] ?? "side view of the storage area";
      const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
      const areaPart = area ? `, ${area} sqm` : "";
      return `${styleDesc} ${room.replace(/_/g, " ")}${areaPart}, side angle, ${subj}, ${RENDER_SUFFIX}`;
    },
  },
  {
    position: 4,
    label: "У окна",
    aspect: "4:3",
    buildPrompt: (room, style, area) => {
      const subj = ROOM_VIEW_SUBJECTS[room]?.[3] ?? "corner near the window";
      const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
      const areaPart = area ? `, ${area} sqm` : "";
      return `${styleDesc} ${room.replace(/_/g, " ")}${areaPart}, intimate angle, ${subj}, depth of field, ${RENDER_SUFFIX}`;
    },
  },
];

/**
 * Базовый «хвост» каждого view-промпта. Калибрует FLUX на:
 *  • Реалистичный фотографический look (не 3D-render, не глянец)
 *  • Контекст «доступный ремонт российской квартиры» (не luxury)
 *  • Тёплое мягкое освещение, натуральное дерево, светлые стены
 *  • 4K архитектурная визуализация
 *
 * Источник: ChatGPT-референс пользователя для создания концепта дизайн-проекта.
 */
const RENDER_SUFFIX = "ultra realistic photograph, architectural interior visualization, real Russian apartment, achievable affordable budget renovation, not luxury concept, warm soft lighting, natural wood textures, light walls, professional interior photography, magazine quality, 4K, photorealistic, no people, no text, no watermark";

/** 6 detail-crops: какие куски из каких ракурсов вырезать через sharp. */
interface CropSpec {
  fromView: number;     // 1..4 — позиция view-источника
  /** "left" | "center" | "right" — горизонтальная позиция квадратного кропа в кадре 1024×768. */
  position: "left" | "center" | "right";
  /** RU-метка для UI. */
  label: string;
}

const CROP_SPECS: CropSpec[] = [
  { fromView: 1, position: "center", label: "Общая зона" },
  { fromView: 2, position: "center", label: "Акцентная стена" },
  { fromView: 2, position: "right",  label: "Деталь стены" },
  { fromView: 3, position: "center", label: "Система хранения" },
  { fromView: 3, position: "left",   label: "Полки и аксессуары" },
  { fromView: 4, position: "center", label: "Зона у окна" },
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
 * Вырезает квадратный кроп 768×768 из 4:3 ракурса 1024×768 через sharp.
 * `position` управляет горизонтальным сдвигом окна.
 */
async function cropDetailFromView(viewBuffer: Buffer, position: "left" | "center" | "right"): Promise<Buffer> {
  // Проверяем размеры (на случай если Fal.ai вернул другой aspect).
  const meta = await sharp(viewBuffer).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 768;
  const cropSize = Math.min(w, h);

  let left = 0;
  if (w > cropSize) {
    if (position === "left") left = 0;
    else if (position === "right") left = w - cropSize;
    else left = Math.round((w - cropSize) / 2);
  }
  const top = h > cropSize ? Math.round((h - cropSize) / 2) : 0;

  return sharp(viewBuffer)
    .extract({ left, top, width: cropSize, height: cropSize })
    .resize(768, 768, { fit: "cover" })
    .jpeg({ quality: 86, progressive: true })
    .toBuffer();
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

  // ── 2. Параллельно: 4 ракурса + текстовый пакет. ────────────────────────
  // Если seed-проект уже принёс h1/description/etc — не вызываем AI, экономим.
  const hasSeedContent = !!design.h1 && !!design.description
    && Array.isArray(design.materials) && design.materials.length > 0
    && Array.isArray(design.estimate) && design.estimate.length > 0
    && Array.isArray(design.solutions) && design.solutions.length > 0;

  console.log(
    `[designWorker] design ${design.id}: generating 4 views (${isSeedMode ? "text2img" : "img2img"})`
    + (hasSeedContent ? " (seed content — skipping AI text gen)" : " + AI content"),
  );

  const renderViews = isSeedMode
    ? Promise.all(
        VIEW_SPECS.map((spec) =>
          falGenerateText({
            prompt: spec.buildPrompt(design.roomType, design.style, areaNum),
            aspectRatio: spec.aspect,
          }).then((result) => ({ ...result, spec })),
        ),
      )
    : signR2(bucketId, beforeKey).then((falInputUrl) =>
        Promise.all(
          VIEW_SPECS.map((spec) =>
            falGenerate({
              initImageUrl: falInputUrl,
              prompt: spec.buildPrompt(design.roomType, design.style, areaNum),
              aspectRatio: spec.aspect,
              strength: 0.78,
            }).then((result) => ({ ...result, spec })),
          ),
        ),
      );

  const [renderResults, content] = await Promise.all([
    renderViews,
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

  // ── 3. Скачиваем 4 ракурса, сохраняем в R2, ведём журналы. ──────────────
  const viewBuffers: Buffer[] = [];
  const views: DesignView[] = [];
  let mainResultPublicUrl: string | null = null;
  let mainImageBuffer: Buffer | null = null;

  for (let i = 0; i < renderResults.length; i++) {
    const result = renderResults[i]!;
    const buffer = await downloadImage(result.imageUrl);
    viewBuffers[i] = buffer;

    const filename = `${design.id}_view_${result.spec.position}.jpg`;
    const r2Key = `dizajn/results/${filename}`;
    const publicUrl = await uploadJpegToR2(bucketId, r2Key, buffer);

    views.push({
      url: publicUrl,
      label: result.spec.label,
      position: result.spec.position,
    });

    // Legacy `design_images` row — оставляем для backward-compat с старой
    // страницей. Type = "view_1" .. "view_4".
    await db.insert(designImagesTable).values({
      designId: design.id,
      type: `view_${result.spec.position}`,
      url: publicUrl,
      width: result.width,
      height: result.height,
      sortOrder: i,
    });

    await db.insert(designGenerationsTable).values({
      designId: design.id,
      provider: "fal-ai",
      model: isSeedMode
        ? (process.env.FAL_MODEL_TEXT ?? "fal-ai/flux/dev")
        : (process.env.FAL_MODEL ?? "fal-ai/flux/dev/image-to-image"),
      prompt: result.spec.buildPrompt(design.roomType, design.style, areaNum),
      roomType: design.roomType,
      style: design.style,
      status: "success",
      costKopeks: result.costKopeks,
      providerResponse: {
        generationMs: result.generationMs,
        view: `view_${result.spec.position}`,
        mode: isSeedMode ? "text2img" : "img2img",
      },
      completedAt: new Date(),
    });

    if (i === 0) {
      mainResultPublicUrl = publicUrl;
      mainImageBuffer = buffer;
    }
  }

  if (!mainResultPublicUrl || !mainImageBuffer) {
    throw new Error("Main render not produced");
  }

  // ── 4. 6 detail-crops через sharp (без AI-вызовов — режем из views). ────
  console.log(`[designWorker] design ${design.id}: generating 6 detail crops (sharp)`);
  const detailCrops: DesignDetailCrop[] = [];
  for (let i = 0; i < CROP_SPECS.length; i++) {
    const spec = CROP_SPECS[i]!;
    const sourceBuffer = viewBuffers[spec.fromView - 1];
    if (!sourceBuffer) continue;

    const cropBuffer = await cropDetailFromView(sourceBuffer, spec.position);
    const filename = `${design.id}_crop_${i + 1}.jpg`;
    const r2Key = `dizajn/crops/${filename}`;
    const publicUrl = await uploadJpegToR2(bucketId, r2Key, cropBuffer);

    detailCrops.push({
      url: publicUrl,
      label: spec.label,
      fromView: spec.fromView,
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
