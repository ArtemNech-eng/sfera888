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

const ROOM_DESCRIPTORS: Record<string, string> = {
  bathroom: "bathroom interior",
  kitchen: "kitchen interior",
  living_room: "living room interior",
  bedroom: "bedroom interior",
  hallway: "hallway interior",
  apartment: "apartment interior overview",
  nursery: "child room interior",
};

/**
 * «Было» промпт — типовая русская комната до ремонта. Используется как init
 * image для img2img в seed-проектах: одна геометрия → 4 разных ракурса.
 */
const ROOM_BEFORE_PROMPTS: Record<string, string> = {
  bedroom: "typical russian panel apartment bedroom before renovation, plain white walls, basic 1990s furniture, tired interior, diffused window light, photo realistic, no people, wide angle from doorway",
  kitchen: "typical small soviet-era apartment kitchen 8 sqm before renovation, worn wooden cabinets, white tile backsplash, basic appliances, plain walls, daylight, photo realistic, no people, wide angle",
  bathroom: "typical small soviet apartment bathroom before renovation, white wall tile, basic fittings, plain ceiling, photo realistic, no people, wide angle",
  living_room: "typical russian apartment living room before renovation, plain walls, basic 1990s sofa and shelves, worn wooden floor, daylight, photo realistic, no people, wide angle",
  hallway: "typical narrow soviet apartment hallway before renovation, plain walls, basic shoe rack, worn floor, photo realistic, no people, wide angle",
  nursery: "typical russian apartment child room 10 sqm before renovation, plain pastel walls, basic furniture, daylight, photo realistic, no people, wide angle",
  apartment: "typical russian panel apartment interior before renovation, plain walls, basic furniture, daylight, photo realistic, no people, wide angle",
};

/** 4 ракурса — RU labels для UI и EN prompts для FLUX. */
interface ViewSpec {
  position: number;
  label: string;          // RU — для UI
  promptHint: string;     // EN — добавляется к base prompt
  aspect: "16:9" | "4:3" | "1:1";
}

const VIEW_SPECS: ViewSpec[] = [
  {
    position: 1,
    label: "Общий вид",
    promptHint: "wide angle from the doorway, full room visible, architectural digest composition",
    aspect: "4:3",
  },
  {
    position: 2,
    label: "Акцентная стена",
    promptHint: "mid-shot of the main feature wall, focal point composition, balanced framing",
    aspect: "4:3",
  },
  {
    position: 3,
    label: "Зона хранения",
    promptHint: "view of the storage area and built-in furniture, well-organized composition, side angle",
    aspect: "4:3",
  },
  {
    position: 4,
    label: "У окна",
    promptHint: "natural light corner near the window, soft daylight, depth of field, intimate angle",
    aspect: "4:3",
  },
];

function buildViewPrompt(room: string, style: string, area: number | null, hint: string): string {
  const styleAdjective = STYLE_DESCRIPTORS[style] ?? style;
  const roomNoun = ROOM_DESCRIPTORS[room] ?? room;
  const areaPart = area ? `, ${area} sqm` : "";
  return `${styleAdjective} ${roomNoun}${areaPart}, ${hint}, photo realistic, magazine quality, professional interior photography, natural lighting, 8k, no people`;
}

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

  // ── 1. Resolve "Before" image: либо user upload, либо генерим text2img. ──
  let beforeKey: string;        // ключ объекта в R2 (для signObjectURL)
  let beforePublicUrl: string;  // /api/marketplace/dizajn/img/...

  if (design.inputImageUrl) {
    // User uploaded — inputImageUrl содержит R2 key.
    beforeKey = design.inputImageUrl;
    // Public URL у user-upload'a уже есть в БД? Если нет — построим тот же
    // путь через proxy (inputImageUrl у нас хранится как R2-key, не URL).
    beforePublicUrl = beforeKey.startsWith("/")
      ? beforeKey
      : "/api/marketplace/dizajn/img/" + beforeKey.replace(/^dizajn\//, "");
  } else {
    // Seed-проект — генерируем «Было» text2img.
    const beforePrompt = ROOM_BEFORE_PROMPTS[design.roomType]
      ?? `typical russian apartment ${design.roomType} before renovation, plain walls, basic furniture, daylight, photo realistic, no people, wide angle`;

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

    // Сохраним ключ "Было" в `inputImageUrl` чтобы страница могла показать.
    await db
      .update(designsTable)
      .set({ inputImageUrl: beforeKey, updatedAt: new Date() })
      .where(eq(designsTable.id, design.id));
  }

  // ── 2. Параллельно: 4 img2img ракурса + текстовый пакет от AI. ──────────
  // Все ракурсы делаем img2img от «Было» — одна геометрия, разные углы.
  const falInputUrl = await signR2(bucketId, beforeKey);

  // Если seed-проект уже принёс h1/description/etc — не вызываем AI, экономим.
  // Это режим «hand-written content» (тексты от Claude Opus в чате).
  const hasSeedContent = !!design.h1 && !!design.description
    && Array.isArray(design.materials) && design.materials.length > 0
    && Array.isArray(design.estimate) && design.estimate.length > 0
    && Array.isArray(design.solutions) && design.solutions.length > 0;

  console.log(
    `[designWorker] design ${design.id}: generating 4 views (img2img)`
    + (hasSeedContent ? " (seed content — skipping AI text gen)" : " + AI content"),
  );
  const renderViews = Promise.all(
    VIEW_SPECS.map((spec) =>
      falGenerate({
        initImageUrl: falInputUrl,
        prompt: buildViewPrompt(design.roomType, design.style, areaNum, spec.promptHint),
        aspectRatio: spec.aspect,
        strength: 0.78, // чуть выше — даём больше свободы для смены ракурса
      }).then((result) => ({ ...result, spec })),
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
      model: process.env.FAL_MODEL ?? "fal-ai/flux/dev/image-to-image",
      prompt: buildViewPrompt(design.roomType, design.style, areaNum, result.spec.promptHint),
      roomType: design.roomType,
      style: design.style,
      status: "success",
      costKopeks: result.costKopeks,
      providerResponse: { generationMs: result.generationMs, view: `view_${result.spec.position}` },
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
