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
const RENDER_SUFFIX = "interior design moodboard, AD Architectural Digest magazine quality, professional interior design rendering, polished design concept presentation, real Russian apartment, achievable affordable budget renovation, not luxury, warm soft lighting, natural wood textures, light walls, ultra realistic, 4K, photorealistic, no people, no text labels, no captions, no watermark, no graphics overlay";

/**
 * 5 камерных позиций per room — каждый view = свой POV в той же комнате.
 * Hero (view 1) = от двери, остальные генерятся с image_prompt=hero чтобы
 * Pro Ultra унаследовал стиль/палитру/материалы и выдал ТУ ЖЕ комнату с
 * другого ракурса. View 5 (3D-isometric) генерится отдельно через
 * `buildIsometricPrompt`.
 *
 * Структура: [from-doorway, from-window, from-headboard-or-feature-wall,
 *            from-far-corner-diagonal]. Описание включает где стоит камера
 * («from doorway looking inward»), что в foreground, mid-ground, background.
 */
const ROOM_CAMERA_PROMPTS: Record<string, [string, string, string, string]> = {
  bedroom: [
    // 1. От двери
    "interior photograph from the doorway looking inward into the bedroom, eye-level wide-angle 35mm view, queen size double bed centered in the middle ground with upholstered headboard against the far wall, two bedside tables with warm lamps, full-height built-in wardrobe running along the right wall, workspace desk visible by the window at the back of the room, soft area rug under the bed, deep room perspective",
    // 2. От окна (обратный ракурс — видны дверь и кровать сбоку)
    "interior photograph from the window facing back toward the doorway, eye-level wide-angle, sheer curtains and workspace desk in foreground at left edge of frame, queen size double bed with upholstered headboard at center mid-ground, doorway with hallway visible at the far end of the room, wardrobe wall stretching along right side",
    // 3. От изголовья кровати (низкий POV — foot of bed на переднем плане)
    "interior photograph from the headboard wall facing into the room, low POV at headboard height, foot of the queen double bed in foreground centered, full-height built-in wardrobe wall along the right side of frame, doorway visible in the distance at the far end, workspace area on left with window light",
    // 4. Из дальнего угла, диагональ
    "interior photograph from the far corner of the bedroom near the window, diagonal high-angle view across the entire room, queen double bed visible diagonally in the middle, wardrobe wall at right, doorway in the opposite corner of the frame, deep depth showing full room volume",
  ],
  kitchen: [
    "interior photograph from the kitchen doorway looking inward, eye-level wide-angle, L-shaped lower cabinets with stone countertop running along the left wall, induction stove with hood centered, glass-front upper cabinets on the right, dining nook with round wooden table and chairs near the window at the back of the room, warm pendant light",
    "interior photograph from the dining nook near the window facing the cabinets, dining table with chairs in foreground at left, kitchen counter and stove with hood at center mid-ground, doorway with hallway visible in the distance at the far end of the kitchen",
    "interior photograph at counter level from the cooking zone facing the dining nook, tile backsplash and pendant light overhead, dining table with chairs in mid-ground centered, window with linen curtains at the back of the frame",
    "interior photograph from the far corner of the kitchen, diagonal view across the room, all elements visible — counter and cabinets at right, dining table and window at left, doorway at the far corner, deep room perspective",
  ],
  bathroom: [
    "interior photograph from the bathroom doorway looking inward, eye-level wide-angle, vanity with basin and round mirror in foreground at left, walk-in shower behind glass partition at center mid-ground, toilet on the right, marble or porcelain tile floor and walls, warm sconce lighting",
    "interior photograph from inside the walk-in shower zone facing out toward the doorway, frosted shower glass at left edge of frame, vanity with mirror at center mid-ground, doorway visible in the distance at the back of the room",
    "interior photograph from behind the vanity facing across the bathroom, basin and faucet in foreground at right, towel hooks on the wall, walk-in shower visible at the far end of the room, soft natural daylight",
    "interior photograph from the far corner diagonally across the bathroom, all elements visible — vanity, shower, toilet, doorway in the opposite corner, deep depth showing full room volume",
  ],
  living_room: [
    "interior photograph from the living room doorway looking inward, eye-level wide-angle, large fabric sofa centered in mid-ground, low coffee table in front, TV unit on the opposite wall at the back of the frame, large window with sheer curtains on the right, soft area rug, warm floor lamp",
    "interior photograph from the window facing back toward the doorway, sheer curtains at right edge of frame, sofa with back to window in foreground centered, TV unit visible at the far end of the frame, doorway with hallway in the distance, lounge chair on the side",
    "interior photograph from the TV-wall side facing the seating area, low TV console in foreground at the bottom of frame, sofa and ottoman in mid-ground centered, window light coming from the left side",
    "interior photograph from the far corner of the living room, diagonal view across the entire room, all furniture visible — sofa at center, TV unit at right, window at left, doorway in the opposite corner, deep room perspective",
  ],
  hallway: [
    "interior photograph from the front door of the apartment looking inward down the hallway, eye-level wide-angle, full-height built-in wardrobe along the left wall, slim console table with rectangular mirror above on the right wall, decorative ceiling pendants, runner rug down the center, opening into the apartment at the far end of the frame",
    "interior photograph from the far end of the hallway facing back toward the front door, console with mirror reflecting the door at center mid-ground, full hallway visible, wardrobe wall stretching along the right side",
    "interior photograph at wardrobe level facing the opposite wall, mirror and console table centered, runner rug visible at the bottom of frame, ceiling pendants overhead, soft warm lighting",
    "interior photograph from the corner of the hallway, diagonal high-angle view, all elements visible — wardrobe, console, mirror, runner, ceiling lights, front door at the opposite corner of the frame, deep narrow perspective",
  ],
  nursery: [
    "interior photograph from the nursery doorway looking inward, eye-level wide-angle, child bed with safety rail at left mid-ground, study desk with chair near the window at the back of the room, low toy storage cabinets along the right wall, soft area rug centered on the floor, warm pendant light",
    "interior photograph from the window facing back toward the doorway, study desk and chair in foreground at right, child bed with safety rail at center mid-ground, doorway visible in the distance, low cabinets along the left wall",
    "interior photograph from the head of the child bed facing into the room, foot of the bed in foreground, low cabinets at right, doorway visible at the far end, window light coming from the left side",
    "interior photograph from the far corner of the nursery, diagonal view across the entire room, child bed at left, study desk at right, low cabinets in mid-ground, doorway in the opposite corner, deep room volume",
  ],
  apartment: [
    "interior photograph from the entrance to the open-plan apartment looking inward, eye-level wide-angle, living area with fabric sofa and coffee table in foreground at left, dining area with wooden table at center mid-ground, kitchen counter visible at the far end on the right, warm pendant lights overhead, deep room perspective",
    "interior photograph from the kitchen end facing back toward the entrance, kitchen counter and bar stools in foreground, dining area in mid-ground centered, living area with sofa visible in the distance, doorway at the far end of the frame",
    "interior photograph from the bedroom corner facing the open-plan area, partition or low divider in foreground, dining area in mid-ground, kitchen visible at the far right of the frame, soft daylight from window at left",
    "interior photograph from the far corner of the apartment, diagonal view across all zones, living area at left, dining at center, kitchen at right, entrance doorway in the opposite corner, deep depth showing full apartment volume",
  ],
};

/** RU labels для 5 ракурсов: 4 разных POV + 5-й 3D-isometric. */
const VIEW_LABELS: [string, string, string, string, string] = [
  "Общий вид от двери",
  "Вид от окна",
  "Вид от изголовья кровати",
  "Вид из дальнего угла",
  "3D-планировка сверху",
];

/** RU labels для 5 ракурсов per-room — labels[roomType][position-1]. */
const ROOM_VIEW_LABELS: Record<string, [string, string, string, string, string]> = {
  bedroom:     ["Общий вид от двери",  "Вид от окна",         "Вид от изголовья",     "Вид из дальнего угла", "3D-планировка"],
  kitchen:     ["Общий вид от двери",  "Вид от обеденной зоны", "Вид с кухонного стола", "Вид из дальнего угла", "3D-планировка"],
  bathroom:    ["Общий вид от двери",  "Вид из душевой зоны", "Вид от раковины",      "Вид из дальнего угла", "3D-планировка"],
  living_room: ["Общий вид от двери",  "Вид от окна",         "Вид от ТВ-стенки",     "Вид из дальнего угла", "3D-планировка"],
  hallway:     ["Общий вид от двери",  "Вид от прохода",      "Вид от шкафа",         "Вид из дальнего угла", "3D-планировка"],
  nursery:     ["Общий вид от двери",  "Вид от окна",         "Вид от изголовья кровати", "Вид из дальнего угла", "3D-планировка"],
  apartment:   ["Общий вид от входа",  "Вид с кухни",         "Вид от спальной зоны", "Вид из дальнего угла", "3D-планировка"],
};

/**
 * Промпт для 3D-isometric плана — отдельный FLUX Pro Ultra вызов после
 * основного moodboard'а. Воспроизводит стиль архитектурного аксонометри-
 * ческого рендера из ChatGPT-референса (вид сверху-сбоку с 3D-volume
 * мебелью, белый фон вокруг комнаты).
 */
function buildIsometricPrompt(room: string, style: string, area: number | null): string {
  const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
  const areaPart = area ? ` ${area} sqm` : "";
  const roomNoun = room.replace(/_/g, " ");
  const roomLayout: Record<string, string> = {
    bedroom: "queen size double bed centered with two bedside tables, full-height built-in wardrobe along one wall, workspace desk near the window, soft area rug on the floor",
    kitchen: "L-shaped kitchen counter with cabinets and stove, dining table with chairs near the window, tall pantry storage column",
    bathroom: "walk-in shower behind glass partition, vanity with basin and mirror, toilet, tile flooring",
    living_room: "large fabric sofa centered, low coffee table, TV unit on opposite wall, soft area rug",
    hallway: "full-height built-in wardrobe along one wall, slim console table with mirror above, runner rug",
    nursery: "child bed with safety rail, study desk near window, low toy storage cabinets, soft area rug",
    apartment: "open-plan living-dining-kitchen area, bedroom corner separated by partition",
  };
  const layout = roomLayout[room] ?? "main functional furniture arranged according to the room type";
  return [
    `Axonometric isometric 3D top-down architectural rendering of a ${styleDesc} ${roomNoun}${areaPart} layout.`,
    `View from 45-degree elevated angle showing the entire room from above and slightly to the side, axonometric perspective with no vanishing point.`,
    `Visible furniture: ${layout}.`,
    `Walls cut away on the front-facing sides so the entire room interior is visible from above.`,
    `Furniture rendered in 3D volume with tops, sides, and shadows. Clean white background outside the room walls.`,
    `Architectural visualization style, professional design presentation, soft warm lighting inside the room, no people, no text, no labels, no watermark.`,
  ].join(" ");
}

/**
 * Промпт для одного ракурса в seed-mode. Использует ROOM_CAMERA_PROMPTS
 * для описания где стоит камера и что в кадре. Hero (idx=0) рендерится
 * первым text2img'ом, views 1/2/3 рендерятся параллельно с image_prompt=hero
 * чтобы Pro Ultra унаследовал стиль/палитру/материалы и комната выглядела
 * как ОДНА И ТА ЖЕ с разных позиций.
 */
function buildCameraPrompt(room: string, style: string, area: number | null, idx: 0 | 1 | 2 | 3): string {
  const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
  const cameras = ROOM_CAMERA_PROMPTS[room] ?? ROOM_CAMERA_PROMPTS.bedroom!;
  const description = cameras[idx];
  const areaPart = area ? ` ${area} sqm` : "";
  const roomNoun = room.replace(/_/g, " ");
  return [
    `${styleDesc} ${roomNoun}${areaPart} apartment in Russia, ${description}.`,
    "Same room, identical materials, palette, and warm soft lighting throughout.",
    RENDER_SUFFIX,
  ].join(" ");
}

/**
 * 6 detail-crops: какие куски из конкретных views вырезать. Координаты
 * в относительных долях ширины/высоты source view (0-1), чтобы работало
 * для любого размера. Каждый crop ссылается на view-source через viewPos.
 */
interface CropSpec {
  /** Из какого view вырезать (1..4 — view 5 isometric не используется). */
  viewPos: 1 | 2 | 3 | 4;
  /** Центр crop'а в долях от ширины source (0=left, 1=right). */
  cx: number;
  /** Центр crop'а в долях от высоты source (0=top, 1=bottom). */
  cy: number;
  /** Размер crop'а в долях от высоты source (квадратный, 0.5 = половина высоты). */
  size: number;
}

// 6 crops из 4 разных views. Раскладка: основной объект из hero,
// детали мебели из других views, освещение и пол — zoom in hero.
const CROP_SPECS: CropSpec[] = [
  { viewPos: 1, cx: 0.50, cy: 0.55, size: 0.55 }, // главный объект из общего вида
  { viewPos: 3, cx: 0.45, cy: 0.55, size: 0.45 }, // деталь из view-«изголовье»
  { viewPos: 4, cx: 0.50, cy: 0.55, size: 0.50 }, // деталь из диагонального угла
  { viewPos: 2, cx: 0.40, cy: 0.60, size: 0.45 }, // foreground из view-«окно»
  { viewPos: 1, cx: 0.50, cy: 0.22, size: 0.32 }, // верх hero (свет/потолок)
  { viewPos: 1, cx: 0.50, cy: 0.85, size: 0.30 }, // низ hero (пол/ковер)
];

/**
 * Подписи к 6 кропам по типу комнаты. Соответствуют структуре CROP_SPECS:
 * [главный объект из hero, деталь из view-3, деталь из view-4, foreground
 * из view-2, освещение, пол/текстура].
 */
const ROOM_CROP_LABELS: Record<string, [string, string, string, string, string, string]> = {
  bedroom:     ["Кровать", "Изножье и шкаф", "Угол с хранением", "Зона у окна",  "Освещение",       "Пол и ковёр"],
  kitchen:     ["Гарнитур", "Фартук и плита", "Хранение",        "Обеденный стол", "Пендель и свет", "Пол"],
  bathroom:    ["Душевая",  "Раковина",       "Угол с туалетом",  "Зона у входа", "Освещение",      "Плитка пола"],
  living_room: ["Диван",    "Зона ТВ",        "Угол комнаты",     "У окна",       "Освещение",      "Пол и ковёр"],
  hallway:     ["Прихожая", "Зеркало и консоль", "Шкаф",          "Конец коридора", "Освещение",    "Пол и дорожка"],
  nursery:     ["Детская кровать", "Изножье и игрушки", "Угол с хранением", "Стол у окна", "Освещение", "Пол и коврик"],
  apartment:   ["Гостиная", "Спальная зона", "Угол с обеденной зоной", "Кухонная зона", "Освещение", "Пол"],
};

const FALLBACK_CROP_LABELS: [string, string, string, string, string, string] = [
  "Общий план", "Деталь интерьера", "Угол комнаты", "Зона у окна", "Освещение", "Пол",
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
 * Вырезает квадратный crop 768×768 из view-buffer'а по относительным
 * координатам (cx, cy, size). Используется для 6 detail-кропов из
 * конкретных views.
 */
async function cropDetailFromView(
  viewBuffer: Buffer,
  spec: CropSpec,
): Promise<Buffer> {
  const meta = await sharp(viewBuffer).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 768;
  const sizePx = Math.floor(spec.size * H);
  const left = clamp(Math.floor(spec.cx * W - sizePx / 2), 0, W - sizePx);
  const top = clamp(Math.floor(spec.cy * H - sizePx / 2), 0, H - sizePx);

  return sharp(viewBuffer)
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
    `[designWorker] design ${design.id}: ${isSeedMode ? "Pro Ultra hero + 3 image-prompted views + isometric" : "img2img × 4 from user upload"}`
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

  if (isSeedMode) {
    const labels = ROOM_VIEW_LABELS[design.roomType] ?? VIEW_LABELS;

    // ── 2.1. Hero (view 1) — wide-angle от двери, text2img Pro Ultra. ──
    // Это reference для остальных views: они генерятся с image_prompt=hero
    // (Fal CDN URL, ~24h TTL) — Pro Ultra наследует палитру, материалы,
    // освещение, и комната выглядит как ОДНА И ТА ЖЕ с разных позиций.
    console.log(`[designWorker] design ${design.id}: generating hero view 1 (FLUX Pro Ultra)`);
    const heroPrompt = buildCameraPrompt(design.roomType, design.style, areaNum, 0);
    const heroResult = await falGeneratePanoramicPro({
      prompt: heroPrompt,
      aspectRatio: "4:3",
    });
    const heroBuffer = await downloadImage(heroResult.imageUrl);
    viewBuffers[0] = heroBuffer;

    const heroFilename = `${design.id}_view_1.jpg`;
    const heroR2Key = `dizajn/results/${heroFilename}`;
    const heroPublicUrl = await uploadJpegToR2(bucketId, heroR2Key, heroBuffer);
    views.push({ url: heroPublicUrl, label: labels[0]!, position: 1 });
    mainResultPublicUrl = heroPublicUrl;
    mainImageBuffer = heroBuffer;

    await db.insert(designImagesTable).values({
      designId: design.id,
      type: "view_1",
      url: heroPublicUrl,
      width: heroResult.width,
      height: heroResult.height,
      sortOrder: 0,
    });
    await db.insert(designGenerationsTable).values({
      designId: design.id,
      provider: "fal-ai",
      model: process.env.FAL_MODEL_PANORAMIC ?? "fal-ai/flux-pro/v1.1-ultra",
      prompt: heroPrompt,
      roomType: design.roomType,
      style: design.style,
      status: "success",
      costKopeks: heroResult.costKopeks,
      providerResponse: {
        generationMs: heroResult.generationMs,
        view: "view_1_hero",
        mode: "text2img",
        imageSize: `${heroResult.width}x${heroResult.height}`,
      },
      completedAt: new Date(),
    });

    // ── 2.2. Views 2/3/4 параллельно через Pro Ultra с image_prompt=hero. ──
    // image_prompt_strength=0.55 — заметное наследование palette/style, но
    // композиция кадра определяется text-промптом (камера в другом месте).
    console.log(`[designWorker] design ${design.id}: generating views 2/3/4 in parallel (image_prompt=hero, strength=0.55)`);
    const followupResults = await Promise.all(
      [1, 2, 3].map(async (idx) => {
        const prompt = buildCameraPrompt(design.roomType, design.style, areaNum, idx as 1 | 2 | 3);
        const result = await falGeneratePanoramicPro({
          prompt,
          aspectRatio: "4:3",
          imagePromptUrl: heroResult.imageUrl,
          imagePromptStrength: 0.55,
        });
        const buffer = await downloadImage(result.imageUrl);
        return { idx, prompt, result, buffer };
      }),
    );

    for (const { idx, prompt, result, buffer } of followupResults) {
      viewBuffers[idx] = buffer;
      const position = idx + 1;
      const filename = `${design.id}_view_${position}.jpg`;
      const r2Key = `dizajn/results/${filename}`;
      const publicUrl = await uploadJpegToR2(bucketId, r2Key, buffer);
      views.push({ url: publicUrl, label: labels[idx]!, position });

      await db.insert(designImagesTable).values({
        designId: design.id,
        type: `view_${position}`,
        url: publicUrl,
        width: result.width,
        height: result.height,
        sortOrder: idx,
      });
      await db.insert(designGenerationsTable).values({
        designId: design.id,
        provider: "fal-ai",
        model: process.env.FAL_MODEL_PANORAMIC ?? "fal-ai/flux-pro/v1.1-ultra",
        prompt,
        roomType: design.roomType,
        style: design.style,
        status: "success",
        costKopeks: result.costKopeks,
        providerResponse: {
          generationMs: result.generationMs,
          view: `view_${position}`,
          mode: "text2img-image-prompt",
          imageSize: `${result.width}x${result.height}`,
        },
        completedAt: new Date(),
      });
    }

    // ── 2.3. View 5 — 3D-isometric план, отдельный Pro Ultra вызов. ──
    console.log(`[designWorker] design ${design.id}: generating view 5 — 3D isometric plan`);
    try {
      const isoPrompt = buildIsometricPrompt(design.roomType, design.style, areaNum);
      const isometricResult = await falGeneratePanoramicPro({
        prompt: isoPrompt,
        aspectRatio: "4:3",
      });
      const isoBuffer = await downloadImage(isometricResult.imageUrl);
      const isoFilename = `${design.id}_isometric.jpg`;
      const isoR2Key = `dizajn/isometric/${isoFilename}`;
      const isoPublicUrl = await uploadJpegToR2(bucketId, isoR2Key, isoBuffer);

      views.push({ url: isoPublicUrl, label: labels[4]!, position: 5 });

      await db.insert(designImagesTable).values({
        designId: design.id,
        type: "view_5_isometric",
        url: isoPublicUrl,
        width: isometricResult.width,
        height: isometricResult.height,
        sortOrder: 4,
      });
      await db.insert(designGenerationsTable).values({
        designId: design.id,
        provider: "fal-ai",
        model: process.env.FAL_MODEL_PANORAMIC ?? "fal-ai/flux-pro/v1.1-ultra",
        prompt: isoPrompt,
        roomType: design.roomType,
        style: design.style,
        status: "success",
        costKopeks: isometricResult.costKopeks,
        providerResponse: {
          generationMs: isometricResult.generationMs,
          view: "view_5_isometric",
          mode: "text2img-isometric",
          imageSize: `${isometricResult.width}x${isometricResult.height}`,
        },
        completedAt: new Date(),
      });
    } catch (e) {
      // Non-fatal: если isometric не удался — оставляем 4 view'а.
      console.error("[designWorker] isometric render failed (non-fatal):", e instanceof Error ? e.message : e);
    }
  } else {
    // ── User-upload: img2img × 4 от user-фото. Сохраняет геометрию
    //    реальной комнаты пользователя. View 5 (isometric) не генерится —
    //    оригинальной планировки не знаем точно.
    const falInputUrl = await signR2(bucketId, beforeKey);
    console.log(`[designWorker] design ${design.id}: generating 4 views (img2img × 4 from user upload)`);

    const labels = ROOM_VIEW_LABELS[design.roomType] ?? VIEW_LABELS;
    const styleDesc = STYLE_DESCRIPTORS[design.style] ?? design.style;
    const roomNoun = design.roomType.replace(/_/g, " ");
    const areaPart = areaNum ? ` ${areaNum} sqm` : "";
    const cameras = ROOM_CAMERA_PROMPTS[design.roomType] ?? ROOM_CAMERA_PROMPTS.bedroom!;

    const renderResults = await Promise.all(
      [0, 1, 2, 3].map((i) => {
        const prompt = `${styleDesc} ${roomNoun}${areaPart} interior. ${cameras[i]}. ${RENDER_SUFFIX}`;
        return falGenerate({
          initImageUrl: falInputUrl,
          prompt,
          aspectRatio: "4:3",
          strength: 0.78,
        }).then((result) => ({ ...result, position: i + 1, label: labels[i]!, prompt }));
      }),
    );

    for (let i = 0; i < renderResults.length; i++) {
      const r = renderResults[i]!;
      const buf = await downloadImage(r.imageUrl);
      viewBuffers[i] = buf;

      const filename = `${design.id}_view_${r.position}.jpg`;
      const r2Key = `dizajn/results/${filename}`;
      const publicUrl = await uploadJpegToR2(bucketId, r2Key, buf);

      views.push({ url: publicUrl, label: r.label, position: r.position });

      await db.insert(designImagesTable).values({
        designId: design.id,
        type: `view_${r.position}`,
        url: publicUrl,
        width: r.width,
        height: r.height,
        sortOrder: i,
      });

      await db.insert(designGenerationsTable).values({
        designId: design.id,
        provider: "fal-ai",
        model: process.env.FAL_MODEL ?? "fal-ai/flux/dev/image-to-image",
        prompt: r.prompt,
        roomType: design.roomType,
        style: design.style,
        status: "success",
        costKopeks: r.costKopeks,
        providerResponse: {
          generationMs: r.generationMs,
          view: `view_${r.position}`,
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

  // ── 4. 6 detail-crops через sharp из конкретных views ─────────────────
  // Каждый crop ссылается на конкретный view через viewPos в CROP_SPECS,
  // labels per-room соответствуют тому что РЕАЛЬНО на crop'е.
  console.log(`[designWorker] design ${design.id}: generating 6 detail crops (sharp from views)`);
  const detailCrops: DesignDetailCrop[] = [];
  const cropLabels = ROOM_CROP_LABELS[design.roomType] ?? FALLBACK_CROP_LABELS;

  for (let i = 0; i < CROP_SPECS.length; i++) {
    const spec = CROP_SPECS[i]!;
    // Если view-buffer недоступен (например isometric не сгенерился) —
    // fallback на hero (view 1).
    const sourceBuffer = viewBuffers[spec.viewPos - 1] ?? mainImageBuffer;
    const cropBuffer = await cropDetailFromView(sourceBuffer, spec);
    const filename = `${design.id}_crop_${i + 1}.jpg`;
    const r2Key = `dizajn/crops/${filename}`;
    const publicUrl = await uploadJpegToR2(bucketId, r2Key, cropBuffer);

    detailCrops.push({
      url: publicUrl,
      label: cropLabels[i]!,
      fromView: spec.viewPos,
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
