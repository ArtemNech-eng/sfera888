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
 * Описания 4 ракурсов для panel'ов moodboard'а. Один кадр FLUX Pro Ultra
 * содержит 2×2 сетку с этими ракурсами одной комнаты — sharp потом
 * разрезает на 4 отдельных view'а.
 */
const ROOM_VIEW_SUBJECTS: Record<string, [string, string, string, string]> = {
  // [top-left общий, top-right акцент, bottom-left хранение, bottom-right окно]
  bedroom: [
    "wide angle from the doorway showing the entire bedroom layout: queen size double bed centered with upholstered headboard and twin bedside tables, full-height built-in wardrobe along one wall, workspace near the window, soft area rug",
    "front-on close-up of the bed area: queen size double bed with upholstered headboard, twin bedside tables with warm table lamps, decorative pillows, framed wall art above headboard, sconces on either side",
    "side angle of the wardrobe wall: full-height built-in wardrobe with natural wood door panels and integrated open shelving with books and decor objects",
    "intimate corner shot of the workspace at the window: compact desk with chair, floor lamp, sheer curtains, plant on the sill, soft daylight",
  ],
  kitchen: [
    "wide angle from doorway showing the entire kitchen: L-shaped layout with cabinets, stone countertop, range hood above induction stove, dining nook with table and chairs near window, warm pendant light",
    "front-on close-up of the kitchen counter: tiled backsplash, stone countertop with utensils and a vase, range hood, brass faucet over the sink",
    "side view of tall pantry storage column with integrated appliances and glass-front upper cabinets",
    "intimate corner shot of the dining area near the window: round wooden table with chairs, pendant light above, linen curtains, soft daylight",
  ],
  bathroom: [
    "wide angle from doorway showing the entire bathroom: walk-in shower behind glass partition, vanity with basin and round mirror, toilet, marble or porcelain tile, warm sconce lighting",
    "front-on close-up of the vanity: round mirror, basin with modern faucet, marble or quartz countertop, sconce lighting on either side, towel hooks",
    "side view of tall storage column: built-in cabinet with shelves and rolled towels, basket for laundry",
    "shower zone close-up: glass-walled walk-in shower with rainfall head, marble tile, niche shelf with toiletries",
  ],
  living_room: [
    "wide angle from doorway showing the entire living room: large fabric sofa centered, low coffee table, TV unit on opposite wall, large window with sheer curtains, soft area rug, warm floor lamp",
    "front-on close-up of the seating area: sofa with decorative pillows and throw, side table with table lamp and books, gallery wall behind",
    "media wall side view: TV mounted on wall, low TV console with drawers, decorative items on shelves, plant in pot",
    "intimate corner shot of the reading nook by the window: lounge chair with throw, floor lamp, side table with book, sheer curtains, soft daylight",
  ],
  hallway: [
    "wide angle from front door showing the entire hallway: full-height built-in wardrobe to one side, slim console table with mirror above, decorative ceiling lighting, runner rug",
    "front-on close-up of the entryway console: console table with vase and key tray, large rectangular mirror above, warm sconce lighting",
    "side view of the wardrobe wall: full-height built-in wardrobe with natural wood door panels, integrated shoe storage at bottom",
    "end of the hallway opening into the apartment: small upholstered bench with cushion, hooks on the wall for jackets, framed art, ceiling light",
  ],
  nursery: [
    "wide angle of the entire child room from doorway: child bed with safety rail, study desk with chair near window, low toy storage cabinets, soft area rug, warm pendant light",
    "front-on close-up of the bed area: bed with patterned bedding, decorative pillows, framed art on the wall, bedside small table with night light",
    "play and storage zone side view: low cabinets for toys with rounded edges, open shelving with books and toys, soft floor mat",
    "intimate corner shot of the study and window area: child desk facing the window, ergonomic chair, pin board on the wall, table lamp, soft daylight",
  ],
  apartment: [
    "wide angle of the open-plan main room from entrance: living area with sofa and coffee table, dining area with wooden table, kitchen counter visible at the back, warm pendant lights",
    "front-on close-up of the living area: fabric sofa with cushions, coffee table with magazines, area rug, decorative shelves, gallery wall",
    "kitchen and dining zone: kitchen island with bar stools, dining table with chairs, pendant lights above",
    "bedroom area near the window: queen size bed visible behind partition, window with linen curtains, soft daylight, lounge chair",
  ],
};

/** RU labels для 5 ракурсов в порядке UI [общий, кровать-акцент, шкаф, окно, 3D-план]. */
const VIEW_LABELS: [string, string, string, string, string] = [
  "Общий вид от входа",
  "Вид на кровать и акцент",
  "Шкаф и хранение",
  "Зона у окна",
  "3D-планировка",
];

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
 * Промпт для одного moodboard-кадра 2×2 grid. Один FLUX Pro Ultra вызов
 * генерит весь коллаж — это гарантирует что все 4 ракурса показывают ОДНУ
 * И ТУ ЖЕ комнату с одинаковой палитрой/материалами/освещением. Затем
 * sharp разрезает на 4 квадранта.
 *
 * Этот подход воспроизводит то что DALL-E 3 / ChatGPT делают своими
 * moodboard-композициями.
 */
function buildMoodboardPrompt(room: string, style: string, area: number | null): string {
  const styleDesc = STYLE_DESCRIPTORS[style] ?? style;
  const subjects = ROOM_VIEW_SUBJECTS[room] ?? ROOM_VIEW_SUBJECTS.bedroom!;
  const areaPart = area ? ` ${area} sqm` : "";
  const roomNoun = room.replace(/_/g, " ");
  return [
    `Interior design moodboard with 2x2 grid layout showing the SAME ${styleDesc} ${roomNoun}${areaPart} apartment from 4 different camera angles in one image.`,
    `Top-left panel: ${subjects[0]}.`,
    `Top-right panel: ${subjects[1]}.`,
    `Bottom-left panel: ${subjects[2]}.`,
    `Bottom-right panel: ${subjects[3]}.`,
    `Same room throughout, identical materials, palette, and warm soft lighting in every panel.`,
    `Subtle thin white border separating each panel.`,
    RENDER_SUFFIX,
  ].join(" ");
}

/**
 * 4 ракурса проекта. Hero (view 1) генерится первым text2img'ом, затем
 * views 2/3/4 параллельно генерятся с image_prompt=hero чтобы FLUX Pro
 * Ultra унаследовал стиль/палитру/материалы и выдал РАЗНЫЕ углы камеры
 * одной и той же по визуальной DNA комнаты.
 */

/**
 * 6 detail-crops: какие куски из panoramic-источника вырезать. Координаты
 * в относительных долях панорамы (0-1) от ширины/высоты, чтобы работало для
 * любого размера панорамы.
 */
interface CropSpec {
  /** Центр crop'а в долях от ширины (0=left, 1=right). */
  cx: number;
  /** Центр crop'а в долях от высоты (0=top, 1=bottom). */
  cy: number;
  /** Размер crop'а в долях от высоты (квадратный, 0.5 = половина высоты). */
  size: number;
}

// 6 crops по разным частям 2×2 moodboard'а — center каждого panel + 2 zoom'а
// в самые «детальные» области (изголовье + полки шкафа).
const CROP_SPECS: CropSpec[] = [
  { cx: 0.25, cy: 0.25, size: 0.40 }, // top-left center (общий план)
  { cx: 0.75, cy: 0.25, size: 0.40 }, // top-right center (детали кровати)
  { cx: 0.25, cy: 0.75, size: 0.40 }, // bottom-left center (шкаф)
  { cx: 0.75, cy: 0.75, size: 0.40 }, // bottom-right center (рабочее место)
  { cx: 0.65, cy: 0.20, size: 0.25 }, // zoom: акцентная деталь
  { cx: 0.30, cy: 0.80, size: 0.25 }, // zoom: текстура хранения
];

/**
 * Подписи к 6 кропам по типу комнаты — конкретные объекты мебели вместо
 * generic «Деталь». Соответствует визуальной структуре 2×2 moodboard:
 * top-left=общий, top-right=кровать/диван/раковина, bottom-left=шкаф/гарнитур,
 * bottom-right=окно/workspace.
 */
const ROOM_CROP_LABELS: Record<string, [string, string, string, string, string, string]> = {
  bedroom:     ["Кровать", "Прикроватная тумба", "Встроенный шкаф", "Рабочий стол", "Бра у кровати", "Полки шкафа"],
  kitchen:     ["Гарнитур", "Фартук и плита", "Хранение", "Обеденный стол", "Декор стены", "Светильник"],
  bathroom:    ["Ванна", "Раковина", "Шкаф для полотенец", "Душ", "Зеркало и сантехника", "Текстура плитки"],
  living_room: ["Диван", "Журнальный столик", "Зона ТВ", "Кресло у окна", "Декор стены", "Освещение"],
  hallway:     ["Прихожая", "Зеркало", "Шкаф-купе", "Скамья и крючки", "Освещение", "Текстура пола"],
  nursery:     ["Детская кровать", "Постель и декор", "Шкаф для игрушек", "Стол у окна", "Свет и текстиль", "Полки и игрушки"],
  apartment:   ["Гостиная", "Спальня", "Кухня", "Ванная", "Освещение", "Декор"],
};

const FALLBACK_CROP_LABELS: [string, string, string, string, string, string] = [
  "Общая зона", "Акцентная стена", "Зона хранения", "Зона у окна", "Деталь декора", "Текстура",
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
 * Вырезает один из 4 квадрантов 2×2 grid moodboard'а через sharp. Indexing:
 *   0 = top-left (общий вид)
 *   1 = top-right (акцентная стена)
 *   2 = bottom-left (зона хранения)
 *   3 = bottom-right (у окна)
 *
 * Source — moodboard от FLUX Pro Ultra. Output 1024×768 (4:3) с cover-fit.
 * Внутренний крошечный inset (~3% от размера квадранта) — чтобы не зацепить
 * белую границу между панелями.
 */
async function cropQuadrant(moodboardBuffer: Buffer, index: 0 | 1 | 2 | 3): Promise<Buffer> {
  const meta = await sharp(moodboardBuffer).metadata();
  const W = meta.width ?? 2304;
  const H = meta.height ?? 1728;
  const halfW = Math.floor(W / 2);
  const halfH = Math.floor(H / 2);
  const insetW = Math.floor(halfW * 0.03);
  const insetH = Math.floor(halfH * 0.03);

  const left = (index % 2) === 0 ? insetW : halfW + insetW;
  const top = index < 2 ? insetH : halfH + insetH;
  const cellW = halfW - insetW * 2;
  const cellH = halfH - insetH * 2;

  return sharp(moodboardBuffer)
    .extract({ left, top, width: cellW, height: cellH })
    .resize(1024, 768, { fit: "cover" })
    .jpeg({ quality: 88, progressive: true })
    .toBuffer();
}

/**
 * Возвращает полный moodboard, scaled to 4:3 1024×768. Используется как
 * «Общий вид» (view 1) — показывает все 4 panel'а коллажа сразу.
 */
async function scaleMoodboardToView(moodboardBuffer: Buffer): Promise<Buffer> {
  return sharp(moodboardBuffer)
    .resize(1024, 768, { fit: "cover" })
    .jpeg({ quality: 88, progressive: true })
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

  // ── 2. Параллельно: рендер ракурсов + текстовый пакет от AI. ──────────
  // Если seed-проект уже принёс h1/description/etc — не вызываем AI, экономим.
  const hasSeedContent = !!design.h1 && !!design.description
    && Array.isArray(design.materials) && design.materials.length > 0
    && Array.isArray(design.estimate) && design.estimate.length > 0
    && Array.isArray(design.solutions) && design.solutions.length > 0;

  console.log(
    `[designWorker] design ${design.id}: ${isSeedMode ? "FLUX Pro Ultra moodboard 2x2 + sharp slicing" : "img2img × 4"}`
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
  let moodboardBuffer: Buffer | null = null;

  if (isSeedMode) {
    // ── 2.1. Single moodboard call: 2×2 grid layout от FLUX Pro Ultra. ─
    // Один кадр содержит 4 разных ракурса ОДНОЙ комнаты — гарантирует
    // одинаковую палитру, материалы, освещение во всех 4 ракурсах.
    console.log(`[designWorker] design ${design.id}: generating 2x2 moodboard (FLUX Pro Ultra, 4:3)`);
    const moodboardResult = await falGeneratePanoramicPro({
      prompt: buildMoodboardPrompt(design.roomType, design.style, areaNum),
      aspectRatio: "4:3",
    });
    moodboardBuffer = await downloadImage(moodboardResult.imageUrl);

    await db.insert(designGenerationsTable).values({
      designId: design.id,
      provider: "fal-ai",
      model: process.env.FAL_MODEL_PANORAMIC ?? "fal-ai/flux-pro/v1.1-ultra",
      prompt: buildMoodboardPrompt(design.roomType, design.style, areaNum),
      roomType: design.roomType,
      style: design.style,
      status: "success",
      costKopeks: moodboardResult.costKopeks,
      providerResponse: {
        generationMs: moodboardResult.generationMs,
        view: "moodboard-2x2",
        mode: "text2img-moodboard",
        imageSize: `${moodboardResult.width}x${moodboardResult.height}`,
      },
      completedAt: new Date(),
    });

    // ── 2.2. Sharp нарезает: view 1 = full moodboard, views 2/3/4 =
    //         3 квадранта одной комнаты. FLUX часто дублирует кровать в
    //         top-row (top-left + top-right оба показывают кровать), а
    //         wardrobe и workspace в bottom-row. Skip top-right (дубль).
    //
    // Mapping:
    //   view 1 «Общий вид от входа» = full moodboard (все 4 panels)
    //   view 2 «Кровать/акцент»     = quadrant top-left  (главный объект — кровать)
    //   view 3 «Шкаф и хранение»    = quadrant bottom-left (шкаф)
    //   view 4 «Зона у окна»        = quadrant bottom-right (рабочее место/окно)
    //   view 5 «3D-планировка»      = отдельный isometric render (см. ниже)
    //   (top-right skipped)         = обычно дубль главного объекта, не нужен
    const quadrantIndices: Array<0 | 1 | 2 | 3> = [0, 2, 3]; // skip top-right (1)
    for (let i = 0; i < 4; i++) {
      const buf = i === 0
        ? await scaleMoodboardToView(moodboardBuffer)
        : await cropQuadrant(moodboardBuffer, quadrantIndices[i - 1]!);
      viewBuffers[i] = buf;

      const position = i + 1;
      const filename = `${design.id}_view_${position}.jpg`;
      const r2Key = `dizajn/results/${filename}`;
      const publicUrl = await uploadJpegToR2(bucketId, r2Key, buf);

      views.push({ url: publicUrl, label: VIEW_LABELS[i]!, position });

      await db.insert(designImagesTable).values({
        designId: design.id,
        type: `view_${position}`,
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

    // ── 2.3. 3D-isometric план — отдельный FLUX Pro Ultra вызов. ─────────
    // Это «вау-фишка» из ChatGPT-референса: аксонометрический рендер
    // комнаты с 3D-мебелью видно сверху-сбоку.
    console.log(`[designWorker] design ${design.id}: generating 3D isometric plan (FLUX Pro Ultra, 4:3)`);
    try {
      const isometricResult = await falGeneratePanoramicPro({
        prompt: buildIsometricPrompt(design.roomType, design.style, areaNum),
        aspectRatio: "4:3",
      });
      const isoBuffer = await downloadImage(isometricResult.imageUrl);
      const isoFilename = `${design.id}_isometric.jpg`;
      const isoR2Key = `dizajn/isometric/${isoFilename}`;
      const isoPublicUrl = await uploadJpegToR2(bucketId, isoR2Key, isoBuffer);

      views.push({ url: isoPublicUrl, label: VIEW_LABELS[4]!, position: 5 });

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
        prompt: buildIsometricPrompt(design.roomType, design.style, areaNum),
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
    // ── User-upload: img2img × 4 от user-фото. Используем moodboard prompt
    // для всех 4 (с разными strength чтобы получить разные стилизации).
    const falInputUrl = await signR2(bucketId, beforeKey);
    console.log(`[designWorker] design ${design.id}: generating 4 views (img2img × 4 from user upload)`);

    // Для img2img — каждый view с разным «фокусом»: общий, акцент, хранение, окно.
    // Используем подсказки из ROOM_VIEW_SUBJECTS для разнообразия.
    const subjects = ROOM_VIEW_SUBJECTS[design.roomType] ?? ROOM_VIEW_SUBJECTS.bedroom!;
    const styleDesc = STYLE_DESCRIPTORS[design.style] ?? design.style;
    const roomNoun = design.roomType.replace(/_/g, " ");
    const areaPart = areaNum ? ` ${areaNum} sqm` : "";

    const renderResults = await Promise.all(
      [0, 1, 2, 3].map((i) => {
        const prompt = `${styleDesc} ${roomNoun}${areaPart} interior. ${subjects[i]}. ${RENDER_SUFFIX}`;
        return falGenerate({
          initImageUrl: falInputUrl,
          prompt,
          aspectRatio: "4:3",
          strength: 0.78,
        }).then((result) => ({ ...result, position: i + 1, label: VIEW_LABELS[i]!, prompt }));
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

  // ── 4. 6 detail-crops через sharp ──────────────────────────────────────
  // Источник: full moodboard (для seed) — crops из всего коллажа дают
  // разнообразные детали; для user-upload — view 1 (hero crop).
  console.log(`[designWorker] design ${design.id}: generating 6 detail crops (sharp)`);
  const detailCrops: DesignDetailCrop[] = [];
  const cropSource = moodboardBuffer ?? mainImageBuffer;
  const cropLabels = ROOM_CROP_LABELS[design.roomType] ?? FALLBACK_CROP_LABELS;

  for (let i = 0; i < CROP_SPECS.length; i++) {
    const spec = CROP_SPECS[i]!;
    const cropBuffer = await cropDetailFromPanorama(cropSource, spec);
    const filename = `${design.id}_crop_${i + 1}.jpg`;
    const r2Key = `dizajn/crops/${filename}`;
    const publicUrl = await uploadJpegToR2(bucketId, r2Key, cropBuffer);

    detailCrops.push({
      url: publicUrl,
      label: cropLabels[i]!,
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
