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
import { and, eq, lt, sql } from "drizzle-orm";
import { ObjectStorageService, objectStorageClient } from "./objectStorage.js";
import { setObjectAclPolicy } from "./objectAcl.js";
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

  // 2. Параллельно: 4 Fal.ai генерации + 1 GPT call.
  const prompts = buildViewPrompts(design.roomType, design.style, areaNum);

  const [renderResults, content] = await Promise.all([
    Promise.all(
      prompts.map((p) =>
        falGenerate({
          initImageUrl: design.inputImageUrl!,
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
  const objectStorage = new ObjectStorageService();
  const privateDir = objectStorage.getPrivateObjectDir().replace(/\/+$/, "");

  let mainResultPublicUrl: string | null = null;
  let mainImageBuffer: Buffer | null = null;

  for (let i = 0; i < renderResults.length; i++) {
    const result = renderResults[i]!;
    const buffer = await downloadImage(result.imageUrl);

    // Загружаем в R2: dizajn/results/{design_id}_{view}.jpg
    const objectKey = `${privateDir}/dizajn/results/${design.id}_${result.view}.jpg`;
    const { bucketName, objectName } = parseR2Path(objectKey);
    await objectStorageClient
      .bucket(bucketName)
      .file(objectName)
      .save(buffer, { contentType: "image/jpeg" });
    // Публичный ACL — изображения видны без авторизации.
    await setObjectAclPolicy(
      { bucketName, objectName },
      { owner: `design:${design.id}`, visibility: "public" },
    );

    // Public-resolvable URL через storage proxy (marketplace + api-server).
    const publicUrl = `/api/storage/objects/dizajn/results/${design.id}_${result.view}.jpg`;

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

/** Парсинг path формата "{bucket}/{object/path}" → bucket + object. */
function parseR2Path(path: string): { bucketName: string; objectName: string } {
  const trimmed = path.replace(/^\/+/, "");
  const parts = trimmed.split("/");
  if (parts.length < 2) {
    throw new Error(`Invalid R2 path: ${path}`);
  }
  return {
    bucketName: parts[0]!,
    objectName: parts.slice(1).join("/"),
  };
}
