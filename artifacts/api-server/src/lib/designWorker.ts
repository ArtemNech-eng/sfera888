/**
 * Background-воркер AI-дизайнера. Каждые 5 секунд вытаскивает 1 дизайн в
 * статусе `generating`, обрабатывает его (4 параллельных Fal.ai render'а +
 * GPT артефакты + извлечение палитры) и переводит в `completed` или
 * `failed`.
 *
 * Важные инварианты:
 *   • At-most-once семантика — UPDATE ... WHERE id=? AND status='generating'
 *     RETURNING * берёт лок через CAS-подобный приём.
 *   • Idempotent на restart — если воркер падает, при следующем тике
 *     pending row снова будет подобрана.
 *   • Watchdog — записи старше 10 минут в `generating` переводятся в
 *     `failed` (зомби-jobs от падений).
 *
 * Запускается из `index.ts` после старта сервера: `startDesignWorker()`.
 */

import {
  db,
  designsTable,
  designImagesTable,
  designGenerationsTable,
  citiesTable,
} from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { objectStorageClient, signObjectURL } from "./objectStorage.js";
import { falGenerate, downloadImage } from "./falAi.js";
import { generateDesignContent } from "./designContent.js";
import { extractPalette } from "./colorExtraction.js";

const TICK_INTERVAL_MS = 5000;
const STUCK_TIMEOUT_MIN = 10;

let timer: NodeJS.Timeout | null = null;
let processing = false;

export function startDesignWorker(): void {
  if (timer) return;
  console.log("[designWorker] Starting (tick every 5s)");
  timer = setInterval(() => {
    if (processing) return; // skip tick if previous still running
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
  // 0. Watchdog: переводим зомби-jobs в failed.
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

  // 1. Берём один pending дизайн (FIFO).
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

/**
 * Промпты для четырёх view-ракурсов. Все они используют ОДНО и то же
 * входное фото, но описывают разные section-фокусы. Фактически — четыре
 * стилистические вариации одной комнаты с разными точками зрения.
 */
function buildViewPrompts(room: string, style: string, area: number | null): Array<{
  view: string;
  prompt: string;
  aspect: "16:9" | "4:3" | "1:1";
}> {
  const styleAdjective = STYLE_DESCRIPTORS[style] ?? style;
  const roomNoun = ROOM_DESCRIPTORS[room] ?? room;
  const areaPart = area ? `, ${area} sqm` : "";
  const baseStyle = `${styleAdjective} ${roomNoun}${areaPart}, photo realistic, magazine quality, professional interior photography, natural lighting, 8k, no people`;

  return [
    {
      view: "view_1_entrance",
      prompt: `Wide angle view from the doorway, ${baseStyle}, full room visible, architectural digest style`,
      aspect: "4:3",
    },
    {
      view: "view_2_main",
      prompt: `Mid-shot of the main feature wall, ${baseStyle}, focal point composition, balanced framing`,
      aspect: "4:3",
    },
    {
      view: "view_3_storage",
      prompt: `View of the storage area and built-in furniture, ${baseStyle}, well-organized composition`,
      aspect: "4:3",
    },
    {
      view: "view_4_window",
      prompt: `Natural light corner near the window, ${baseStyle}, soft daylight, depth of field`,
      aspect: "4:3",
    },
  ];
}

const STYLE_DESCRIPTORS: Record<string, string> = {
  modern: "modern contemporary",
  scandinavian: "scandinavian minimalist",
  loft: "industrial loft",
  minimalism: "minimalist",
  neoclassic: "neoclassical elegant",
  japandi: "japandi serene",
};

const ROOM_DESCRIPTORS: Record<string, string> = {
  bathroom: "bathroom interior",
  kitchen: "kitchen interior",
  living_room: "living room interior",
  bedroom: "bedroom interior",
  hallway: "hallway interior",
  apartment: "apartment interior overview",
};

async function processDesign(designId: number): Promise<void> {
  // 1. Re-read design (могло измениться) + city name.
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

  if (!design.inputImageUrl) {
    throw new Error("inputImageUrl is missing");
  }
  const areaNum = design.area ? parseFloat(design.area) : null;
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  }

  // Подписать URL для Fal.ai — 10 минут TTL, достаточно для sync /run.
  // design.inputImageUrl содержит R2 key (а не full URL) — см. POST /generate.
  const inputKey = design.inputImageUrl;
  const falInputUrl = await signObjectURL({
    bucketName: bucketId,
    objectName: inputKey,
    method: "GET",
    ttlSec: 600,
  });

  // 2. Параллельно: 4 Fal.ai генерации + 1 GPT call.
  const prompts = buildViewPrompts(design.roomType, design.style, areaNum);

  const [renderResults, content] = await Promise.all([
    Promise.all(
      prompts.map((p) =>
        falGenerate({
          initImageUrl: falInputUrl,
          prompt: p.prompt,
          aspectRatio: p.aspect,
          strength: 0.72,
        }).then((result) => ({ ...result, view: p.view, prompt: p.prompt })),
      ),
    ),
    generateDesignContent({
      room: design.roomType,
      style: design.style,
      area: areaNum,
      budget: design.budget,
      durationWeeks: design.durationWeeks,
      cityName: job.city?.name ?? null,
    }),
  ]);

  // 3. Скачать каждый результат → загрузить в наш R2 → записать design_images.
  let mainResultPublicUrl: string | null = null;
  let mainImageBuffer: Buffer | null = null;

  for (let i = 0; i < renderResults.length; i++) {
    const result = renderResults[i]!;
    const buffer = await downloadImage(result.imageUrl);

    // Загружаем в R2: dizajn/results/{design_id}_{view}.jpg
    const resultFilename = `${design.id}_${result.view}.jpg`;
    await objectStorageClient
      .bucket(bucketId)
      .file(`dizajn/results/${resultFilename}`)
      .save(buffer, { contentType: "image/jpeg" });

    // Публичный URL через наш custom proxy.
    const publicUrl = `/api/marketplace/dizajn/img/results/${resultFilename}`;

    // Записываем design_images row.
    await db.insert(designImagesTable).values({
      designId: design.id,
      type: result.view,
      url: publicUrl,
      width: result.width,
      height: result.height,
      sortOrder: i,
    });

    // Лог провайдера для аудита/cost-tracking.
    await db.insert(designGenerationsTable).values({
      designId: design.id,
      provider: "fal-ai",
      model: process.env.FAL_MODEL ?? "fal-ai/flux/dev/image-to-image",
      prompt: result.prompt,
      roomType: design.roomType,
      style: design.style,
      status: "success",
      costKopeks: result.costKopeks,
      providerResponse: { generationMs: result.generationMs, view: result.view },
      completedAt: new Date(),
    });

    // Главный render — первый (entrance view).
    if (i === 0) {
      mainResultPublicUrl = publicUrl;
      mainImageBuffer = buffer;
    }
  }

  if (!mainResultPublicUrl || !mainImageBuffer) {
    throw new Error("Main render not produced");
  }

  // 4. Извлечь цветовую палитру из главного render'а.
  const colorPalette = await extractPalette(mainImageBuffer, 5);

  // 5. UPDATE designs row → completed.
  await db
    .update(designsTable)
    .set({
      status: "completed",
      resultImageUrl: mainResultPublicUrl,
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
}
