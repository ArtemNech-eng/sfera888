/**
 * Background-воркер AI-дизайнера v2 (seed-grade pages, план §22).
 *
 * Каждые 5 секунд берёт 1 дизайн в статусе `generating` и собирает полный
 * пакет артефактов:
 *
 *   • 1 «Было» (input_image_url) — text2img «типовая комната до ремонта»
 *     генерируется сервером для seed-проектов; для user-upload — это фото
 *     пользователя, оставляем как есть.
 *   • 4 ракурса (views[]) — 1 коллаж 2×2 (1024×1024 text-to-image)
 *     + sharp нарезка на 4 квадранта → resize 1024×1024 каждый.
 *     Идеальная identity preservation — все ракурсы из одного коллажа,
 *     одна палитра, одна мебель, разные углы камеры.
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
 *
 * Pipeline v2.1 cost: 2 вызова Fal (Collage 2×2 + Isometric) ≈ 2000+340
 * = ~2340 копеек (high) вместо 7 вызовов ≈ 3550 копеек. Экономия ~34%.
 */

import {
  db,
  designsTable,
  designImagesTable,
  designGenerationsTable,
  citiesTable,
  type DesignView,
  type DesignDetailCrop,
  type LayoutJson,
  type PickedFurnitureRow,
} from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import sharp from "sharp";
import { objectStorageClient } from "./objectStorage.js";
import {
  falGenerateGptImage,
  downloadImage,
  type FalGenerationResult,
} from "./falAi.js";
import { generateDesignContent } from "./designContent.js";
import { extractPalette } from "./colorExtraction.js";
import { pingIndexNow } from "./indexNow.js";
import { composeInfographic, type InfographicInput } from "./infographicComposer.js";
import { generateLayoutJson } from "./layoutPlanner.js";
import {
  validateLayout,
  roomDimsFromLayout,
  type ValidationViolation,
} from "./geometricValidator.js";
import { enforceCostCeiling, BudgetExceededError } from "./designCostGuard.js";
import { renderTopDownPlanPng, uploadTopDownPlan } from "./topDownPlan.js";
import { composeIsometricWithCallouts } from "./isometricCallouts.js";
import { pickFurniture } from "./furnitureMatcher.js";
import { buildRealEstimate } from "./materialsEstimator.js";

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
  // Watchdog: any row stuck > STUCK_TIMEOUT_MIN flips to `failed` with
  // `is_public = false`, so a half-baked record can't end up listed in the
  // public catalog or sitemap (Requirement 14 — failed designs MUST NOT be
  // public). Same `is_public = false` semantics applied uniformly across
  // every fail path below (markFailed, tick-level catch).
  await db
    .update(designsTable)
    .set({
      status: "failed",
      isPublic: false,
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
    // Top-level safety net: even unknown errors must trip the same fail
    // shape (`is_public=false`, truncated message). Routes the design out
    // of the public catalog regardless of what threw upstream.
    await markFailed(job.id, errorMessage);
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
 * [LEGACY] Описания 4 ракурсов одной комнаты — сохранены для обратной
 * совместимости и возможного будущего user-upload режима. В pipeline v2.1
 * (collage 2×2) не используются напрямую — промпт строится в
 * `buildHeroCollagePrompt`.
 */
const ROOM_VIEW_SUBJECTS: Record<string, [string, string, string, string]> = {
  bedroom: [
    "wide angle from the doorway showing the entire bedroom layout: queen size double bed centered with upholstered headboard and twin bedside tables, full-height built-in wardrobe along one wall, workspace near the window, soft area rug",
    "front-on view of the bed area: queen size double bed with upholstered headboard, twin bedside tables with warm table lamps, decorative pillows, framed wall art above headboard, sconces on either side",
    "side angle of the wardrobe wall: full-height built-in wardrobe with natural wood door panels and integrated open shelving with books and decor objects",
    "view of the workspace at the window: compact desk with chair, floor lamp, sheer curtains, plant on the sill, soft daylight",
  ],
  kitchen: [
    "wide angle from doorway showing the entire kitchen: L-shaped layout with cabinets, stone countertop, range hood above induction stove, dining nook with table and chairs near window, warm pendant light",
    "front-on view of the kitchen counter: tiled backsplash, stone countertop with utensils and a vase, range hood, brass faucet over the sink",
    "side view of tall pantry storage column with integrated appliances and glass-front upper cabinets",
    "view of the dining area near the window: round wooden table with chairs, pendant light above, linen curtains, soft daylight",
  ],
  bathroom: [
    "wide angle from doorway showing the entire bathroom: walk-in shower behind glass partition, vanity with basin and round mirror, toilet, marble or porcelain tile, warm sconce lighting",
    "front-on view of the vanity: round mirror, basin with modern faucet, marble or quartz countertop, sconce lighting on either side, towel hooks",
    "side view of tall storage column: built-in cabinet with shelves and rolled towels, basket for laundry",
    "shower zone close-up: glass-walled walk-in shower with rainfall head, marble tile, niche shelf with toiletries",
  ],
  living_room: [
    "wide angle from doorway showing the entire living room: large fabric sofa centered, low coffee table, TV unit on opposite wall, large window with sheer curtains, soft area rug, warm floor lamp",
    "front-on view of the seating area: sofa with decorative pillows and throw, side table with table lamp and books, gallery wall behind",
    "media wall side view: TV mounted on wall, low TV console with drawers, decorative items on shelves, plant in pot",
    "view of the reading nook by the window: lounge chair with throw, floor lamp, side table with book, sheer curtains, soft daylight",
  ],
  hallway: [
    "wide angle from front door showing the entire hallway: full-height built-in wardrobe to one side, slim console table with mirror above, decorative ceiling lighting, runner rug",
    "front-on view of the entryway console: console table with vase and key tray, large rectangular mirror above, warm sconce lighting",
    "side view of the wardrobe wall: full-height built-in wardrobe with natural wood door panels, integrated shoe storage at bottom",
    "end of the hallway opening into the apartment: small upholstered bench with cushion, hooks on the wall for jackets, framed art, ceiling light",
  ],
  nursery: [
    "wide angle of the entire child room from doorway: child bed with safety rail, study desk with chair near window, low toy storage cabinets, soft area rug, warm pendant light",
    "front-on view of the bed area: bed with patterned bedding, decorative pillows, framed art on the wall, bedside small table with night light",
    "play and storage zone side view: low cabinets for toys with rounded edges, open shelving with books and toys, soft floor mat",
    "view of the study and window area: child desk facing the window, ergonomic chair, pin board on the wall, table lamp, soft daylight",
  ],
  apartment: [
    "wide angle of the open-plan main room from entrance: living area with sofa and coffee table, dining area with wooden table, kitchen counter visible at the back, warm pendant lights",
    "front-on view of the living area: fabric sofa with cushions, coffee table with magazines, area rug, decorative shelves, gallery wall",
    "kitchen and dining zone: kitchen island with bar stools, dining table with chairs, pendant lights above",
    "bedroom area near the window: queen size bed visible behind partition, window with linen curtains, soft daylight, lounge chair",
  ],
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
 * Промпт для коллажа 2×2 (4 ракурса одной комнаты в одном изображении 1024×1024).
 * GPT-Image-1.5 генерирует квадратный кадр с сеткой 2×2 — после чего sharp
 * режет его на 4 отдельных 512×512 картинки и ресайзит до 1024×1024.
 * Результат: 4 реально разных ракурса одной комнаты с идеальной identity
 * (одна палитра, одна мебель, один стиль).
 *
 * Строится из **Layout_JSON** чтобы мебель в кадре соответствовала плану.
 */
function buildHeroCollagePrompt(room: string, style: string, area: number | null, layout?: LayoutJson | null): string {
  const styleClause = STYLE_RU_CLAUSES[style] ?? `современный ${style}`;
  const areaPart = area ? `, площадь ${area} м²` : "";
  const roomNoun = roomLabel(room);

  // Подписи к 4 квадрантам зависят от типа комнаты
  const quadrantDescriptions = COLLAGE_QUADRANT_DESCRIPTIONS[room] ?? COLLAGE_QUADRANT_DESCRIPTIONS.bedroom!;

  // Если есть Layout_JSON — строим промпт из конкретной мебели
  if (layout && layout.furniture.length > 0) {
    const roomW = layout.room.widthCm;
    const roomL = layout.room.lengthCm;
    const doorWall = layout.door.wall;

    // Описываем каждый предмет мебели кратко
    const furnitureDescriptions = layout.furniture.map((f) => {
      const typeLabels: Record<string, string> = {
        bed: "двуспальная кровать",
        wardrobe: "встроенный шкаф",
        nightstand: "прикроватная тумба",
        desk: "рабочий стол",
        chair: "стул",
        rug: "ковёр",
        dresser: "комод",
        shelf: "полка",
        sofa: "диван",
        armchair: "кресло",
      };
      const label = typeLabels[f.type] ?? f.type;
      return `${label} ${f.widthCm}×${f.depthCm} см`;
    });

    const windowDesc = layout.window
      ? `Окно на ${wallLabel(layout.window.wall)} стене.`
      : "";
    const doorDesc = `Дверь на ${wallLabel(doorWall)} стене.`;

    return [
      `Коллаж-сетка 2×2 из четырёх интерьерных фотографий ОДНОЙ И ТОЙ ЖЕ ${roomNoun}${areaPart} в стиле «${styleClause}».`,
      `Все 4 кадра — одна комната с одинаковой отделкой, одной цветовой палитрой и одной мебелью.`,
      `Комната ${roomW}×${roomL} см. ${doorDesc} ${windowDesc}`,
      `Мебель в комнате: ${furnitureDescriptions.join(", ")}.`,
      ``,
      `Верхний-левый кадр: ${quadrantDescriptions[0]}.`,
      `Верхний-правый кадр: ${quadrantDescriptions[1]}.`,
      `Нижний-левый кадр: ${quadrantDescriptions[2]}.`,
      `Нижний-правый кадр: ${quadrantDescriptions[3]}.`,
      ``,
      `Стиль: фотореализм, интерьерная съёмка, тёплое мягкое освещение, натуральное дерево, светлые стены, без людей, без текста, без водяных знаков.`,
      `Между кадрами тонкий белый разделитель 2-3 пикселя.`,
    ].join("\n");
  }

  // Fallback: без layout (generic prompt без мебели)
  return [
    `Коллаж-сетка 2×2 из четырёх интерьерных фотографий ОДНОЙ И ТОЙ ЖЕ ${roomNoun}${areaPart} в стиле «${styleClause}».`,
    `Все 4 кадра — одна комната с одинаковой отделкой, одной цветовой палитрой и одной мебелью.`,
    ``,
    `Верхний-левый кадр: ${quadrantDescriptions[0]}.`,
    `Верхний-правый кадр: ${quadrantDescriptions[1]}.`,
    `Нижний-левый кадр: ${quadrantDescriptions[2]}.`,
    `Нижний-правый кадр: ${quadrantDescriptions[3]}.`,
    ``,
    `Стиль: фотореализм, интерьерная съёмка, тёплое мягкое освещение, натуральное дерево, светлые стены, без людей, без текста, без водяных знаков.`,
    `Между кадрами тонкий белый разделитель 2-3 пикселя.`,
  ].join("\n");
}

/**
 * Описания 4 квадрантов коллажа для каждого типа комнаты.
 * [top-left, top-right, bottom-left, bottom-right]
 */
const COLLAGE_QUADRANT_DESCRIPTIONS: Record<string, [string, string, string, string]> = {
  bedroom: [
    "общий вид от двери вглубь комнаты, широкоугольный, видна вся планировка",
    "вид на кровать и изголовье крупным планом, камера напротив кровати, декоративные подушки, бра по бокам",
    "вид на шкаф и систему хранения, камера развёрнута к стене со шкафом, видны двери и полки",
    "зона у окна — рабочий стол и кресло, естественный свет из окна, шторы",
  ],
  kitchen: [
    "общий вид от двери, видна вся кухня — гарнитур, обеденная зона, вытяжка",
    "вид на столешницу и фартук крупным планом, плита, смеситель, декор",
    "вид на высокий шкаф-пенал с техникой и хранением",
    "обеденная зона у окна — стол, стулья, подвесной светильник, дневной свет",
  ],
  bathroom: [
    "общий вид от двери — душ, раковина, унитаз, плитка",
    "вид на раковину с зеркалом крупным планом, бра по бокам, полотенца",
    "вид на шкаф-колонну для хранения полотенец и банных принадлежностей",
    "душевая зона — стеклянная перегородка, тропический душ, ниша с флаконами",
  ],
  living_room: [
    "общий вид от двери — диван, журнальный столик, ТВ-зона, ковёр",
    "вид на диванную группу крупным планом — подушки, плед, столик, настольная лампа",
    "медиа-стена — ТВ на стене, тумба с декором, полки, растение",
    "зона у окна — кресло для чтения, торшер, приставной столик, дневной свет",
  ],
  hallway: [
    "общий вид от входной двери — шкаф, консоль, зеркало, дорожка",
    "вид на консоль с зеркалом крупным планом — ваза, ключница, бра",
    "вид на встроенный шкаф — двери из натурального дерева, обувница внизу",
    "конец прихожей — скамья с подушкой, крючки для одежды, картина",
  ],
  nursery: [
    "общий вид от двери — кровать, стол, шкаф для игрушек, ковёр",
    "вид на кровать крупным планом — постельное бельё с рисунком, подушки, ночник",
    "зона игр и хранения — низкие шкафы с закруглёнными краями, полки с игрушками",
    "рабочий стол у окна — детский стол, стул, лампа, пинборд на стене, дневной свет",
  ],
  apartment: [
    "общий вид от входа — гостиная с диваном, обеденная зона, кухня на фоне",
    "гостиная крупным планом — диван, подушки, ковёр, полки с декором",
    "кухня и столовая — остров с барными стульями, обеденный стол, подвесы",
    "спальная зона у окна — кровать за перегородкой, шторы, кресло, дневной свет",
  ],
};

function wallLabel(wall: string): string {
  const labels: Record<string, string> = { north: "северной", south: "южной", east: "восточной", west: "западной" };
  return labels[wall] ?? wall;
}

function roomLabel(room: string): string {
  const labels: Record<string, string> = { bedroom: "спальни", kitchen: "кухни", bathroom: "ванной", living_room: "гостиной", hallway: "прихожей", nursery: "детской" };
  return labels[room] ?? room;
}

// (legacy 3-prompt array and buildAnglePrompt removed — pipeline v2 uses
// panoramic Hero + sharp crops instead of per-angle AI generation)

/** RU описания стилей для подстановки в промпт. */
const STYLE_RU_CLAUSES: Record<string, string> = {
  modern: "современный минимализм с элементами скандинавского",
  scandinavian: "скандинавский минимализм со светлыми тонами",
  loft: "индустриальный лофт с натуральным деревом и металлом",
  minimalism: "минимализм с акцентом на функциональность",
  neoclassic: "современная неоклассика с лепниной и натуральным деревом",
  japandi: "современный минимализм с элементами Japandi",
  classic: "современная классика с натуральными материалами",
};

/**
 * 6 detail-crops: координаты zoom-кропов из конкретных views (1024×1024).
 * Каждый указывает откуда (viewPos) и какой регион вырезать.
 */
interface CropSpec {
  /** Из какого view вырезать (1..4). */
  viewPos: 1 | 2 | 3 | 4;
  /** Центр crop'а в долях от ширины source (0=left, 1=right). */
  cx: number;
  /** Центр crop'а в долях от высоты source (0=top, 1=bottom). */
  cy: number;
  /** Размер crop'а в долях от высоты source. */
  size: number;
}

// 6 crops per bedroom — конкретные мебельные объекты:
// 1=кровать(view 2 центр), 2=тумба(view 2 right), 3=шкаф(view 3 центр),
// 4=стол(view 4 right), 5=бра(view 2 верх), 6=светильник(view 1 потолок).
const CROP_SPECS: CropSpec[] = [
  { viewPos: 2, cx: 0.50, cy: 0.55, size: 0.50 }, // кровать с изголовьем
  { viewPos: 2, cx: 0.20, cy: 0.65, size: 0.32 }, // прикроватная тумба
  { viewPos: 3, cx: 0.50, cy: 0.50, size: 0.55 }, // встроенный шкаф
  { viewPos: 4, cx: 0.55, cy: 0.55, size: 0.45 }, // рабочий стол
  { viewPos: 2, cx: 0.55, cy: 0.30, size: 0.25 }, // бра у кровати
  { viewPos: 1, cx: 0.50, cy: 0.18, size: 0.22 }, // потолочные светильники
];

/** Подписи к 6 кропам — для bedroom фиксированный набор. */
const ROOM_CROP_LABELS: Record<string, [string, string, string, string, string, string]> = {
  bedroom:     ["Кровать с мягким изголовьем", "Прикроватная тумба", "Встроенный шкаф", "Рабочий стол", "Бра у кровати", "Потолочные светильники"],
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
  // Return absolute R2 CDN URL so images work from any domain (marketplace
  // lives on chestnye-mastera.ru, api on sfera-master.ru). R2_PUBLIC_URL is
  // the Cloudflare R2 public bucket URL (e.g. https://pub-xxx.r2.dev).
  const r2PublicBase = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (r2PublicBase) {
    return `${r2PublicBase}/${pathInBucket}`;
  }
  // Fallback: relative path through api-server image proxy
  return "/api/marketplace/dizajn/img/" + pathInBucket.replace(/^dizajn\//, "");
}

/**
 * Вырезает квадратный crop 768×768 из view-buffer'а по относительным
 * координатам (cx, cy, size). Используется для 6 detail-кропов из
 * конкретных views (1024×1024).
 */
async function cropDetailFromView(
  viewBuffer: Buffer,
  spec: CropSpec,
): Promise<Buffer> {
  const meta = await sharp(viewBuffer).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;
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

// ─── Panoramic crop helpers (LEGACY — retained for reference) ────────────────
//
// Previously used for 5 crops from a panoramic 1536×1024 Hero. Now replaced
// by 2×2 collage slicing. Kept commented for potential future use.
// centerCrop, leftThird, rightThird, topStrip, bottomLeftQuarter — removed.

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

// ─── AI_Design_Product FSM (Generation_Pipeline) ────────────────────────────
//
// Эти константы и вспомогательные функции — отдельный детерминированный
// конечный автомат, описанный в `.kiro/specs/ai-design-product/design.md`
// секция «Generation_Pipeline и его прогресс». Pipeline v2.1 использует
// коллаж 2×2 (1024×1024) + 4 sharp-квадранта вместо 5 AI edit-image
// вызовов. `ANGLE_PROMPTS_BEDROOM_5` сохранены для обратной совместимости
// PBT-тестов и возможного будущего user-upload режима.
// ROOM_VIEW_SUBJECTS сохранены для будущего user-upload режима.

/**
 * [LEGACY] 5 промптов для Angle_Render — сохранены для обратной совместимости
 * с PBT тестами (Property 15.3) и для будущего user-upload режима, где
 * edit-image может быть снова актуален. В текущем pipeline v2 НЕ используются
 * — ракурсы 2..6 получаются crop'ами из панорамного Hero через sharp.
 *
 * Порядок: 1) главная мебель, 2) хранение, 3) у окна, 4) акцентная стена,
 * 5) потолок и освещение. Этот порядок задан Requirement 7.1 и используется
 * для позиций `views[].position = 2..6`.
 */
const ANGLE_PROMPTS_BEDROOM_5: readonly [string, string, string, string, string] = [
  // 1. Вид на главную мебель (фронтальный кадр кровати).
  "Та же спальня, та же палитра, те же материалы. Покажи её с другого ракурса: фронтальный вид на кровать с мягким изголовьем, прикроватные тумбы по бокам с тёплыми лампами, декоративные подушки, текстиль. Без людей, фотореализм, 4K.",
  // 2. Вид на хранение (шкаф).
  "Та же спальня, тот же стиль и материалы. Покажи её с другого ракурса: вид сбоку на встроенный шкаф вдоль стены — двери шкафа в натуральном дереве, открытые полки с книгами и декоративными объектами. Без людей, фотореализм, 4K.",
  // 3. Вид у окна (рабочая зона / зона у окна).
  "Та же спальня, идентичная палитра и материалы. Покажи её с другого ракурса: вид у окна с рабочим местом — компактный стол со стулом, тонкие шторы, мягкий дневной свет, растение на подоконнике. Без людей, фотореализм, 4K.",
  // 4. Вид на акцентную стену (декоративная отделка над изголовьем).
  "Та же спальня, та же палитра. Покажи её с другого ракурса: вид на акцентную стену с декоративной отделкой над изголовьем кровати — деревянные рейки, фактурная штукатурка или декоративные панели, бра по бокам, без людей, фотореализм, 4K.",
  // 5. Вид на потолок и освещение.
  "Та же спальня, тот же стиль и материалы. Покажи её с ракурса от пола снизу-вверх: видны потолок и система освещения — точечные светильники, основная люстра или потолочный светильник, угол схождения стен и потолка с молдингом. Без людей, фотореализм, 4K.",
];

/**
 * RU-подписи для 4 ракурсов AI_Design_Product (коллаж 2×2). Используются
 * как `label` в `designs.views[]` и в инфографике. Порядок: позиции 1..4.
 */
const VIEW_LABELS_4: readonly [string, string, string, string] = [
  "Общий вид от входа",
  "Вид на кровать и изголовье",
  "Шкаф и хранение",
  "Зона у окна",
];

/** Позиция изометрического ракурса в `designs.views[]` (после 4 фото). */
const ISOMETRIC_VIEW_POSITION = 5;
const ISOMETRIC_VIEW_LABEL = "3D-планировка";

// ─── Step name constants (наблюдаемые через designs.current_step) ───────────
//
// Property 13 (Worker FSM, design.md §Correctness Properties) требует, чтобы
// `current_step` принимал распознаваемые строковые значения по каждому шагу.
// Именованные константы — единственный источник правды; PBT-тесты импортируют
// этот модуль и сверяют переходы по этим же литералам.

const STEP_LAYOUT_JSON = "layout_json";
const STEP_HERO_RENDER = "hero_render";
const STEP_ANGLE_RENDERS = "angle_renders";
const STEP_TOP_DOWN_PLAN = "top_down_plan";
const STEP_ISOMETRIC_RENDER = "isometric_render";
const STEP_DETAIL_CROPS = "detail_crops";
const STEP_PICK_FURNITURE = "pick_furniture";
const STEP_REAL_ESTIMATE = "real_estimate";
const STEP_COLOR_PALETTE = "color_palette";
const STEP_AI_TEXT = "ai_text";
const STEP_INFOGRAPHIC = "infographic";

// ─── Progress milestones (Requirement 5.2, design.md FSM diagram) ───────────

const PROGRESS_LAYOUT_JSON = 5;
const PROGRESS_HERO_RENDER = 25;
const PROGRESS_ANGLE_RENDERS = 50;
const PROGRESS_TOP_DOWN_PLAN = 60;
const PROGRESS_ISOMETRIC_RENDER = 70;
const PROGRESS_DETAIL_CROPS = 75;
const PROGRESS_PICK_FURNITURE = 80;
const PROGRESS_REAL_ESTIMATE = 85;
const PROGRESS_COLOR_PALETTE = 88;
const PROGRESS_AI_TEXT = 92;
const PROGRESS_INFOGRAPHIC = 96;
const PROGRESS_COMPLETED = 100;

// ─── Retry policy (Requirement 6.5, 2.7, 7.7, 9.5) ──────────────────────────

/** 2 повтора (3 attempts) на ошибки `Geometric_Validator` при генерации Layout_JSON. */
const LAYOUT_GEOMETRIC_RETRIES = 2;
/** 1 повтор (2 attempts) на ошибки Angle_Render и Isometric_Render. */
const SINGLE_RETRY = 1;

// ─── Required-step error: переводит запись в `failed` с user-сообщением ─────

/**
 * Ошибка, бросаемая обёрткой обязательного шага (Requirement 14.1) после
 * исчерпания всех допустимых повторов. Поле `userMessage` идёт прямо в
 * `designs.error_message` — это единственная видимая для конечного
 * пользователя строка из всего пайплайна.
 *
 * `cause` сохраняется для логов в воркере; в `error_message` не попадает,
 * потому что часто содержит технические детали провайдера AI.
 */
class RequiredStepFailedError extends Error {
  public readonly userMessage: string;
  public readonly stepName: string;
  public readonly underlying?: unknown;
  constructor(stepName: string, userMessage: string, underlying?: unknown) {
    super(`[${stepName}] ${userMessage}`);
    this.name = "RequiredStepFailedError";
    this.userMessage = userMessage;
    this.stepName = stepName;
    this.underlying = underlying;
    Object.setPrototypeOf(this, RequiredStepFailedError.prototype);
  }
}

// ─── FSM utility helpers ────────────────────────────────────────────────────

/**
 * Атомарно фиксирует переход на следующий шаг: `current_step` и `progress`.
 * Каждый крупный шаг Generation_Pipeline вызывает её ровно один раз, после
 * успешного завершения шага (Requirement 5.2). Это даёт frontend'у monotonic
 * прогресс-индикатор и наблюдаемость FSM для PBT-тестов.
 */
async function setProgress(
  designId: number,
  step: string,
  progress: number,
): Promise<void> {
  await db
    .update(designsTable)
    .set({
      progress,
      currentStep: step,
      updatedAt: new Date(),
    })
    .where(eq(designsTable.id, designId));
}

/**
 * Финальный переход в `failed`. Сообщение усекается до 500 символов, чтобы
 * соответствовать `text` колонке без жёсткого ограничения, но не разносить
 * страницу ошибки технической трассой.
 *
 * `is_public = false` зафиксирован в SET-clause намеренно: failed-запись
 * не должна попадать в публичный каталог `/dizajn/{room}-{style}` или в
 * sitemap (см. `routes/dizajn.ts` и условный индекс
 * `designs_public_recent_idx WHERE is_public = true AND status='completed'`).
 * Это также инвариант spec: required artifact `layout_json` отсутствует →
 * design не публикуется. Test-прогон против Railway prod (id=18) показал
 * нарушение: до этого фикса fail на soft-fail (HTTP 200 + bad JSON) мог
 * оставить `is_public=true`, а success-path не очищал stale `error_message`
 * от ранних попыток.
 */
async function markFailed(designId: number, errorMessage: string): Promise<void> {
  await db
    .update(designsTable)
    .set({
      status: "failed",
      isPublic: false,
      errorMessage: errorMessage.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(designsTable.id, designId));
}

/**
 * Defense-in-depth pre-completion invariant. The 4 required-step blocks in
 * `processDesign` (Layout_JSON, Hero_Render, Real_Estimate, AI-текст) all
 * `throw RequiredStepFailedError` on irrecoverable failure, which the outer
 * catch routes to `markFailed`. If any of those `throw`s is silently lost
 * (caught and dropped, never reached, or refactored away), the FSM would
 * happily continue down the success path with `null` artifacts and write
 * `status=completed` — exactly the soft-fail bug observed on test design
 * id=18 (Layout_Planner returned HTTP 200 + invalid JSON, layout stayed
 * null, all subsequent optional steps degraded gracefully, and the row was
 * marked `completed` with `is_public=true` and `layout_json IS NULL`).
 *
 * This guard makes the bug class unrepresentable: if we reach the final
 * success UPDATE without one of the four required artifacts, throw a
 * `RequiredStepFailedError` so the row is routed through the standard
 * failure path (`is_public=false`, user-visible message) instead of being
 * marked `completed` with broken state.
 *
 * Pure: no I/O, no DB. Used both inline in `processDesign` and from the
 * worker-fsm property test (`__test__.assertCompletionInvariant`).
 *
 * @throws {RequiredStepFailedError} when any required artifact is missing.
 */
function assertCompletionInvariant(state: {
  designId: number;
  layout: LayoutJson | null;
  heroPublicUrl: string | null;
  content: { h1?: string } | null;
}): void {
  if (!state.layout) {
    throw new RequiredStepFailedError(
      STEP_LAYOUT_JSON,
      "не удалось получить план комнаты",
      new Error(
        `[design ${state.designId}] layout_json missing at completion `
        + "— invariant violated (required step failure was not propagated)",
      ),
    );
  }
  if (!state.heroPublicUrl) {
    throw new RequiredStepFailedError(
      STEP_HERO_RENDER,
      "не удалось сгенерировать ракурс",
      new Error(
        `[design ${state.designId}] hero render missing at completion `
        + "— invariant violated",
      ),
    );
  }
  if (!state.content) {
    throw new RequiredStepFailedError(
      STEP_AI_TEXT,
      "не удалось сгенерировать описание",
      new Error(
        `[design ${state.designId}] ai_text missing at completion `
        + "— invariant violated",
      ),
    );
  }
}

/**
 * Запись успешного AI-вызова в `design_generations` для:
 *   • аудита (provider/model/prompt/cost)
 *   • Cost_Guard'а — `enforceCostCeiling` суммирует `cost_kopeks` по designId.
 *
 * Хелпер выделен, чтобы все шаги пайплайна писали одинаковый набор полей
 * и Cost_Guard видел консистентную картинку.
 */
async function recordGenerationSuccess(
  designId: number,
  args: {
    model: string;
    prompt: string;
    roomType: string;
    style: string;
    costKopeks: number;
    providerResponse: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(designGenerationsTable).values({
    designId,
    provider: "fal-ai",
    model: args.model,
    prompt: args.prompt,
    roomType: args.roomType,
    style: args.style,
    status: "success",
    costKopeks: args.costKopeks,
    providerResponse: args.providerResponse,
    completedAt: new Date(),
  });
}

/**
 * Запускает один AI-вызов под защитой Cost_Guard:
 *   1. `enforceCostCeiling(designId)` — fail-fast перед вызовом
 *      (Requirement 14.5).
 *   2. сам AI-вызов через переданный `call`.
 *   3. `enforceCostCeiling(designId)` после записи стоимости — ловит случай,
 *      когда именно этот вызов перевалил через `Cost_Ceiling`.
 *
 * `BudgetExceededError` пробрасывается без изменений — внешний `try/catch`
 * в `processDesign` распознаёт его и переводит запись в `failed` с
 * `error_message = "превышен бюджет генерации"` (Requirement 14.7).
 */
async function withCostGuard<T extends { costKopeks: number }>(
  designId: number,
  call: () => Promise<T>,
  recordResult: (res: T) => Promise<void>,
): Promise<T> {
  await enforceCostCeiling(designId);
  const result = await call();
  await recordResult(result);
  await enforceCostCeiling(designId);
  return result;
}

// ─── Main pipeline ───────────────────────────────────────────────────────────

/**
 * Generation_Pipeline для одной записи `designs` со статусом `generating`.
 *
 * Поведение и поток шагов описаны в `.kiro/specs/ai-design-product/design.md`
 * секция «Generation_Pipeline и его прогресс» (диаграмма + псевдокод
 * `runStepRequired/runStepOptional`). Реализация дословно следует ему:
 *
 *   1. Layout_JSON   (required)            progress=5,  current_step=layout_json
 *   2. Hero_Render   (required, 1024×1024) progress=25, current_step=hero_render
 *   3. Collage 2×2 Slice (optional, sharp) progress=50, current_step=angle_renders
 *   4. Top_Down_Plan (optional, bedroom)   progress=60, current_step=top_down_plan
 *   5. Isometric_Render (optional)         progress=70, current_step=isometric_render
 *   6. detail crops  (optional)            progress=75, current_step=detail_crops
 *   7. pickFurniture (optional)            progress=80, current_step=pick_furniture
 *   8. Real_Estimate (required)            progress=85, current_step=real_estimate
 *   9. Color_Palette (optional)            progress=88, current_step=color_palette
 *  10. AI-текст      (required)            progress=92, current_step=ai_text
 *  11. Infographic   (optional)            progress=96, current_step=infographic
 *  →  designs.status=completed, progress=100
 *
 * Pipeline v2.1 (collage 2×2): одна AI-генерация коллажа 1024×1024 с
 * сеткой 2×2 (4 ракурса одной комнаты) + sharp нарезка на 4 views.
 * Плюс отдельная Isometric генерация. Итого: 2 вызова Fal вместо 7.
 *
 * Обязательные шаги (1, 2, 8, 10) — их сбой переводит запись в `failed` с
 * соответствующим `error_message`. Остальные шаги при сбое логируются и
 * пайплайн идёт дальше с пустым полем (Requirement 14.1, 14.2).
 *
 * Cost_Guard — `enforceCostCeiling(designId)` вызывается перед и после
 * каждого внешнего AI-вызова через `withCostGuard`. При превышении
 * `Cost_Ceiling` бросается `BudgetExceededError`, который ловится в
 * терминальном `catch` и переводит запись в `failed` с
 * `error_message = "превышен бюджет генерации"` (Requirement 14.5, 14.7).
 *
 * Watchdog 10 минут реализован выше, в `tick()`, и здесь не дублируется.
 */
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

  // Внутреннее состояние, накапливаемое по ходу пайплайна. То, что осталось
  // `null` к моменту финального `UPDATE`, попадает в DB как NULL/пустое
  // (Requirement 14.2 — опциональные шаги не блокируют завершение).
  let layout: LayoutJson | null = null;
  let heroBuffer: Buffer | null = null;
  let heroPublicUrl: string | null = null;
  let heroResult: FalGenerationResult | null = null;
  const views: DesignView[] = [];
  const viewBuffers: Buffer[] = []; // [hero, angle1..angle5] — может содержать undefined для упавших ракурсов
  let topDownPlanUrl: string | null = null;
  let topDownPlanPng: Buffer | null = null;
  let isometricBuffer: Buffer | null = null;
  let detailCrops: DesignDetailCrop[] = [];
  let cropBuffers: Buffer[] = [];
  let pickedFurniture: PickedFurnitureRow[] = [];
  let estimate: import("@workspace/db").DesignEstimateItem[] = [];
  let materials: import("@workspace/db").DesignMaterial[] = [];
  let colorPalette: import("@workspace/db").DesignColorSwatch[] | null = null;
  let content: Awaited<ReturnType<typeof generateDesignContent>> | null = null;
  let infographicUrl: string | null = null;

  try {
    // ── 1. Layout_JSON (required, до 2 повторов с violations). ───────────
    //
    // Внешний `try/catch` ниже превращает исчерпанные повторы в
    // `RequiredStepFailedError` с сообщением Requirement 2.8 («не удалось
    // разместить мебель в заданных размерах»). Внутри loop'а:
    //   • `generateLayoutJson` сам делает до 2 повторов на ошибки JSON-схемы;
    //   • если структурный JSON получили, но `validateLayout` нашёл
    //     нарушения — добавляем их в `previousViolations` и идём на
    //     следующую попытку (Requirement 2.7).
    let lastViolations: ValidationViolation[] | undefined;
    for (let attempt = 0; attempt <= LAYOUT_GEOMETRIC_RETRIES; attempt++) {
      await enforceCostCeiling(designId);
      try {
        const candidate = await generateLayoutJson({
          roomType: design.roomType,
          widthCm: layoutDim(design, "widthCm", 400),
          lengthCm: layoutDim(design, "lengthCm", 400),
          heightCm: layoutDim(design, "heightCm", 270),
          style: design.style,
          budget: design.budget ?? 0,
          previousViolations: lastViolations,
        });
        const validation = validateLayout(
          roomDimsFromLayout(candidate),
          candidate.furniture,
        );
        if (validation.ok) {
          layout = candidate;
          break;
        }
        lastViolations = validation.violations;
        console.warn(
          `[designWorker] design ${designId}: Layout_JSON attempt ${attempt + 1} `
          + `failed validation: ${validation.violations
            .map((v) => v.code)
            .join(", ")}`,
        );
      } catch (e) {
        if (e instanceof BudgetExceededError) throw e;
        // Defense in depth (soft-fail bug, test id=18): ANY other error
        // during Layout_Planner — `LayoutGenerationError`, raw SDK
        // throw, `TypeError: Cannot read properties of undefined`, a
        // misroute through OpenRouter that returns HTTP 200 with empty
        // body, network reset mid-stream — must classify as a required-
        // step failure with a user-readable message. Without this branch
        // the raw error would propagate to `tick()`'s catch and the row
        // would still be marked failed, but `error_message` would carry
        // a technical trace. Wrapping here keeps the error_message
        // contract stable (Requirement 14.1, "не удалось получить план
        // комнаты"). Internal cause is preserved for server logs.
        const cause = e instanceof Error ? e : new Error(String(e));
        throw new RequiredStepFailedError(
          STEP_LAYOUT_JSON,
          "не удалось получить план комнаты",
          cause,
        );
      }
      await enforceCostCeiling(designId);
    }
    if (!layout) {
      throw new RequiredStepFailedError(
        STEP_LAYOUT_JSON,
        "не удалось разместить мебель в заданных размерах",
        lastViolations,
      );
    }
    await db
      .update(designsTable)
      .set({ layoutJson: layout, updatedAt: new Date() })
      .where(eq(designsTable.id, designId));
    await setProgress(designId, STEP_LAYOUT_JSON, PROGRESS_LAYOUT_JSON);
    await enforceCostCeiling(designId);

    // ── 2. Collage 2×2 Hero_Render (required, 1024×1024, 1 повтор). ───
    //
    // Одна генерация квадратного коллажа 2×2 (1024×1024) через
    // `falGenerateGptImage`. Содержит 4 ракурса одной комнаты. Далее
    // sharp разрезает на 4 квадранта 512×512 → resize 1024×1024 каждый.
    // Идеальная identity preservation (одна палитра, одна мебель).
    // Hero также источник для `Color_Palette` (Requirement 12.1).
    {
      const heroPrompt = buildHeroCollagePrompt(
        design.roomType,
        design.style,
        areaNum,
        layout,
      );
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= SINGLE_RETRY; attempt++) {
        try {
          const res = await withCostGuard(
            designId,
            () =>
              falGenerateGptImage({
                prompt: heroPrompt,
                imageSize: "1024x1024",
                quality: "high",
              }),
            (r) =>
              recordGenerationSuccess(designId, {
                model: process.env.FAL_MODEL_GPT_IMAGE ?? "fal-ai/gpt-image-1.5",
                prompt: heroPrompt,
                roomType: design.roomType,
                style: design.style,
                costKopeks: r.costKopeks,
                providerResponse: {
                  generationMs: r.generationMs,
                  view: "view_collage_2x2",
                  mode: "text2img-high-collage-2x2",
                  imageSize: `${r.width}x${r.height}`,
                },
              }),
          );
          heroResult = res;
          heroBuffer = await downloadImage(res.imageUrl);
          // Сохраняем полный коллаж как view_1 (общий вид = top-left квадрант
          // будет отдельно нарезан ниже, но коллаж сохраняется для дебага).
          const heroR2Key = `dizajn/results/${designId}_collage.jpg`;
          heroPublicUrl = await uploadJpegToR2(bucketId, heroR2Key, heroBuffer);
          break;
        } catch (e) {
          if (e instanceof BudgetExceededError) throw e;
          lastError = e;
          if (attempt < SINGLE_RETRY) {
            console.warn(
              `[designWorker] design ${designId}: Hero_Render attempt ${attempt + 1} failed: `
              + `${e instanceof Error ? e.message : String(e)} — retrying`,
            );
            continue;
          }
        }
      }
      if (!heroBuffer || !heroPublicUrl || !heroResult) {
        throw new RequiredStepFailedError(
          STEP_HERO_RENDER,
          "не удалось сгенерировать ракурс",
          lastError,
        );
      }
    }
    await setProgress(designId, STEP_HERO_RENDER, PROGRESS_HERO_RENDER);
    await enforceCostCeiling(designId);

    // ── 3. Collage 2×2 → 4 views через sharp (replaces panoramic crops). ─
    //
    // Разрезаем коллаж 1024×1024 на 4 квадранта (512×512), каждый
    // ресайзим до 1024×1024. Результат: 4 views (позиции 1..4).
    // При сбое sharp (крайне маловероятно) — логируем и продолжаем
    // с тем что есть (optional step, Requirement 14.2).
    {
      try {
        const heroMeta = await sharp(heroBuffer).metadata();
        const W = heroMeta.width ?? 1024;
        const H = heroMeta.height ?? 1024;

        const halfW = Math.floor(W / 2);
        const halfH = Math.floor(H / 2);
        const quadrants = [
          { left: 0, top: 0, width: halfW, height: halfH },                 // top-left
          { left: halfW, top: 0, width: W - halfW, height: halfH },         // top-right
          { left: 0, top: halfH, width: halfW, height: H - halfH },         // bottom-left
          { left: halfW, top: halfH, width: W - halfW, height: H - halfH }, // bottom-right
        ];

        for (let i = 0; i < quadrants.length; i++) {
          const quadrant = quadrants[i]!;
          const position = i + 1; // позиции 1..4
          const cropBuffer = await sharp(heroBuffer)
            .extract(quadrant)
            .resize(1024, 1024, { fit: "cover" })
            .jpeg({ quality: 90, progressive: true })
            .toBuffer();
          const key = `dizajn/results/${designId}_view_${position}.jpg`;
          const cropPublicUrl = await uploadJpegToR2(bucketId, key, cropBuffer);
          await db.insert(designImagesTable).values({
            designId,
            type: `view_${position}`,
            url: cropPublicUrl,
            width: 1024,
            height: 1024,
            sortOrder: position - 1,
          });
          views.push({ url: cropPublicUrl, label: VIEW_LABELS_4[i]!, position });
          viewBuffers[i] = cropBuffer;
        }

        // Обновляем heroPublicUrl на view_1 (общий вид от входа — top-left)
        if (views.length > 0) {
          heroPublicUrl = views[0]!.url;
        }
      } catch (e) {
        console.error(
          `[designWorker] design ${designId}: Collage 2×2 slicing failed (non-fatal): `
          + `${e instanceof Error ? e.message : String(e)}`,
        );
        // Если нарезка не удалась — используем полный коллаж как единственный view
        views.push({ url: heroPublicUrl!, label: VIEW_LABELS_4[0]!, position: 1 });
        viewBuffers[0] = heroBuffer;
      }
    }
    await setProgress(designId, STEP_ANGLE_RENDERS, PROGRESS_ANGLE_RENDERS);
    await enforceCostCeiling(designId);

    // ── 4. Top_Down_Plan — программная отрисовка SVG→PNG (optional, bedroom). ──
    //
    // Requirement 8.5: AI-fallback запрещён. Для не-bedroom типов или при
    // ошибке `sharp.png()` поле `top_down_plan_url` остаётся NULL.
    if (design.roomType === "bedroom") {
      try {
        topDownPlanPng = await renderTopDownPlanPng(layout);
        // Defensive: if sharp produced an empty or near-empty buffer (e.g.,
        // librsvg missing on the platform), don't upload — the image proxy
        // would serve a blank/broken file (white block bug).
        if (topDownPlanPng.length < 1000) {
          console.warn(
            `[designWorker] design ${designId}: Top_Down_Plan PNG too small `
            + `(${topDownPlanPng.length} bytes) — likely broken render, skipping upload`,
          );
          topDownPlanPng = null;
          topDownPlanUrl = null;
        } else {
          topDownPlanUrl = await uploadTopDownPlan(designId, topDownPlanPng);
          await db
            .update(designsTable)
            .set({ topDownPlanUrl, updatedAt: new Date() })
            .where(eq(designsTable.id, designId));
        }
      } catch (e) {
        console.error(
          `[designWorker] design ${designId}: Top_Down_Plan render failed (non-fatal): `
          + `${e instanceof Error ? e.message : String(e)}`,
        );
        topDownPlanPng = null;
        topDownPlanUrl = null;
      }
    }
    await setProgress(designId, STEP_TOP_DOWN_PLAN, PROGRESS_TOP_DOWN_PLAN);

    // ── 5. Isometric_Render + программные выноски (optional, 1 повтор). ─
    //
    // AI-вызов `falGenerateGptImage` с `buildIsometricPrompt`, затем
    // `composeIsometricWithCallouts` накладывает SVG-выноски из Layout_JSON
    // (Requirement 9.3). При сбое после 1 повтора — продолжаем без
    // изометрического ракурса (Requirement 9.5, 14.2).
    {
      const isoPrompt = buildIsometricPrompt(
        design.roomType,
        design.style,
        areaNum,
      );
      for (let attempt = 0; attempt <= SINGLE_RETRY; attempt++) {
        try {
          const res = await withCostGuard(
            designId,
            () =>
              falGenerateGptImage({
                prompt: isoPrompt,
                imageSize: "1024x1024",
                quality: "medium",
              }),
            (r) =>
              recordGenerationSuccess(designId, {
                model: process.env.FAL_MODEL_GPT_IMAGE ?? "fal-ai/gpt-image-1.5",
                prompt: isoPrompt,
                roomType: design.roomType,
                style: design.style,
                costKopeks: r.costKopeks,
                providerResponse: {
                  generationMs: r.generationMs,
                  view: "view_isometric",
                  mode: "text2img-isometric",
                  imageSize: `${r.width}x${r.height}`,
                },
              }),
          );
          const baseBuffer = await downloadImage(res.imageUrl);
          const composited = await composeIsometricWithCallouts(
            baseBuffer,
            layout,
            design.roomType,
          );
          isometricBuffer = composited;
          const isoR2Key = `dizajn/isometric/${designId}_isometric.jpg`;
          const isoPublicUrl = await uploadJpegToR2(
            bucketId,
            isoR2Key,
            composited,
          );
          await db.insert(designImagesTable).values({
            designId,
            type: "view_isometric",
            url: isoPublicUrl,
            width: res.width,
            height: res.height,
            sortOrder: ISOMETRIC_VIEW_POSITION - 1,
          });
          views.push({
            url: isoPublicUrl,
            label: ISOMETRIC_VIEW_LABEL,
            position: ISOMETRIC_VIEW_POSITION,
          });
          break;
        } catch (e) {
          if (e instanceof BudgetExceededError) throw e;
          if (attempt < SINGLE_RETRY) {
            console.warn(
              `[designWorker] design ${designId}: Isometric_Render attempt ${attempt + 1} failed: `
              + `${e instanceof Error ? e.message : String(e)} — retrying`,
            );
            continue;
          }
          console.error(
            `[designWorker] design ${designId}: Isometric_Render failed after retry (non-fatal): `
            + `${e instanceof Error ? e.message : String(e)}`,
          );
          isometricBuffer = null;
        }
      }
    }
    await setProgress(designId, STEP_ISOMETRIC_RENDER, PROGRESS_ISOMETRIC_RENDER);
    await enforceCostCeiling(designId);

    // ── 6. detail crops через sharp (optional). ─────────────────────────
    //
    // Берём прямоугольники из `CROP_SPECS` и режем их из соответствующих
    // ракурсов в `viewBuffers`. Если нужного ракурса нет (упал
    // Angle_Render) — fallback на heroBuffer; если crops собрать не
    // удалось — пайплайн идёт дальше без них (Requirement 14.2).
    try {
      const localCropLabels =
        ROOM_CROP_LABELS[design.roomType] ?? FALLBACK_CROP_LABELS;
      const localCrops: DesignDetailCrop[] = [];
      const localCropBuffers: Buffer[] = [];
      for (let i = 0; i < CROP_SPECS.length; i++) {
        const spec = CROP_SPECS[i]!;
        const sourceBuffer = viewBuffers[spec.viewPos - 1] ?? heroBuffer;
        if (!sourceBuffer) continue;
        const cropBuffer = await cropDetailFromView(sourceBuffer, spec);
        localCropBuffers.push(cropBuffer);
        const cropR2Key = `dizajn/crops/${designId}_crop_${i + 1}.jpg`;
        const cropPublicUrl = await uploadJpegToR2(bucketId, cropR2Key, cropBuffer);
        localCrops.push({
          url: cropPublicUrl,
          label: localCropLabels[i]!,
          fromView: spec.viewPos,
        });
      }
      detailCrops = localCrops;
      cropBuffers = localCropBuffers;
    } catch (e) {
      console.error(
        `[designWorker] design ${designId}: detail crops failed (non-fatal): `
        + `${e instanceof Error ? e.message : String(e)}`,
      );
      detailCrops = [];
      cropBuffers = [];
    }
    await setProgress(designId, STEP_DETAIL_CROPS, PROGRESS_DETAIL_CROPS);

    // ── 7. Furniture_Matcher (optional). ────────────────────────────────
    try {
      pickedFurniture = await pickFurniture({
        layout,
        roomType: design.roomType,
        style: design.style,
        budgetRub: design.budget ?? 0,
      });
      await db
        .update(designsTable)
        .set({ pickedFurniture, updatedAt: new Date() })
        .where(eq(designsTable.id, designId));
    } catch (e) {
      console.error(
        `[designWorker] design ${designId}: pickFurniture failed (non-fatal): `
        + `${e instanceof Error ? e.message : String(e)}`,
      );
      pickedFurniture = [];
    }
    await setProgress(designId, STEP_PICK_FURNITURE, PROGRESS_PICK_FURNITURE);

    // ── 8. Real_Estimate (required). ────────────────────────────────────
    //
    // Любой сбой переводит запись в `failed` с Requirement 14.6 сообщением
    // «не удалось рассчитать смету».
    try {
      const realEstimate = await buildRealEstimate({
        layout,
        roomType: design.roomType,
        style: design.style,
        cityId: design.cityId ?? null,
        pickedFurniture,
      });
      estimate = realEstimate.estimate;
      materials = realEstimate.materials;
    } catch (e) {
      throw new RequiredStepFailedError(
        STEP_REAL_ESTIMATE,
        "не удалось рассчитать смету",
        e,
      );
    }
    await setProgress(designId, STEP_REAL_ESTIMATE, PROGRESS_REAL_ESTIMATE);

    // ── 9. Color_Palette (optional). ────────────────────────────────────
    try {
      colorPalette = await extractPalette(heroBuffer, 5);
    } catch (e) {
      console.error(
        `[designWorker] design ${designId}: extractPalette failed (non-fatal): `
        + `${e instanceof Error ? e.message : String(e)}`,
      );
      colorPalette = null;
    }
    await setProgress(designId, STEP_COLOR_PALETTE, PROGRESS_COLOR_PALETTE);

    // ── 10. AI-текст h1/seoTitle/description/solutions (required). ──────
    //
    // Если запись пришла из админки `Showcase_Project` с уже заполненными
    // полями (`hasSeedContent`) — не вызываем AI, а используем готовый
    // контент (поведение из старого пайплайна сохранено для совместимости
    // с Requirement 15.4).
    const hasSeedContent =
      !!design.h1
      && !!design.description
      && Array.isArray(design.materials)
      && design.materials.length > 0
      && Array.isArray(design.estimate)
      && design.estimate.length > 0
      && Array.isArray(design.solutions)
      && design.solutions.length > 0;

    try {
      if (hasSeedContent) {
        content = {
          h1: design.h1!,
          seoTitle: design.seoTitle ?? "",
          seoDescription: design.seoDescription ?? "",
          description: design.description!,
          materials: design.materials!,
          estimate: design.estimate!,
          solutions: design.solutions!,
        };
      } else {
        await enforceCostCeiling(designId);
        content = await generateDesignContent({
          room: design.roomType,
          style: design.style,
          area: areaNum,
          budget: design.budget,
          durationWeeks: design.durationWeeks,
          cityName: job.city?.name ?? null,
          district: design.district,
          seed: design.id,
        });
        await enforceCostCeiling(designId);
      }
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      throw new RequiredStepFailedError(
        STEP_AI_TEXT,
        "не удалось сгенерировать описание",
        e,
      );
    }
    await setProgress(designId, STEP_AI_TEXT, PROGRESS_AI_TEXT);

    // ── 11. Infographic 2048×1366 (optional). ───────────────────────────
    //
    // Использует первые 4 ракурса из `viewBuffers` (Hero + первые 3
    // успешных Angle), 6 detail crops, и `topDownPlanPng` (если был
    // отрисован). При недостатке ассетов слот не собираем — страница
    // отрендерится без этого блока (Requirement 14.4).
    try {
      // Берём ровно 4 ракурса для top-row composer'а: Hero + первые 3
      // успешно отрендеренных Angle. Если ракурсов меньше 4 — используем
      // hero как fallback (placeholder), чтобы composer не падал.
      const composerViews = pickFourViews(viewBuffers, heroBuffer);
      if (
        composerViews
        && isometricBuffer
        && cropBuffers.length === 6
        && content
      ) {
        const composerInput: InfographicInput = {
          views: composerViews,
          isometric: isometricBuffer,
          detailCrops: [
            cropBuffers[0]!,
            cropBuffers[1]!,
            cropBuffers[2]!,
            cropBuffers[3]!,
            cropBuffers[4]!,
            cropBuffers[5]!,
          ],
          viewLabels: [
            VIEW_LABELS_4[0]!,
            VIEW_LABELS_4[1]!,
            VIEW_LABELS_4[2]!,
            VIEW_LABELS_4[3]!,
          ],
          cropLabels: pickSixCropLabels(design.roomType),
          topDownPlanPng,
          design: {
            roomType: design.roomType,
            area: areaNum,
            style: design.style,
            budget: design.budget,
            durationWeeks: design.durationWeeks,
            materials: materials.length > 0 ? materials : content.materials,
            estimate: estimate.length > 0 ? estimate : content.estimate,
            colorPalette: colorPalette ?? [],
            solutions: content.solutions ?? [],
          },
        };
        const infographicBuffer = await composeInfographic(composerInput);
        const infographicR2Key = `dizajn/results/${designId}_infographic.jpg`;
        infographicUrl = await uploadJpegToR2(
          bucketId,
          infographicR2Key,
          infographicBuffer,
        );
        await db.insert(designImagesTable).values({
          designId,
          type: "infographic",
          url: infographicUrl,
          width: 2048,
          height: 1366,
          sortOrder: -1,
        });
      }
    } catch (e) {
      console.error(
        `[designWorker] design ${designId}: composeInfographic failed (non-fatal): `
        + `${e instanceof Error ? e.message : String(e)}`,
      );
      infographicUrl = null;
    }
    await setProgress(designId, STEP_INFOGRAPHIC, PROGRESS_INFOGRAPHIC);

    // ── Pre-completion invariant guard ───────────────────────────────────
    //
    // All four required-step writes (Layout_JSON, Hero_Render, AI-text via
    // `content`, Real_Estimate) must have produced their artifacts by this
    // point. If any are still null/undefined, the matching `throw` upstream
    // was somehow swallowed — that's always a bug (test-прогон id=18 showed
    // exactly this: `layout_json IS NULL` with `status=completed`,
    // `is_public=true`). Defense-in-depth: refuse to mark `completed` and
    // route the row through the standard fail path so it ends up
    // `is_public=false` and visible in audit, not in the public catalog.
    assertCompletionInvariant({
      designId,
      layout,
      heroPublicUrl,
      content,
    });

    // ── Финальный UPDATE: status=completed, result_image_url=Infographic ──
    //
    // Если `infographicUrl` отсутствует — fallback на `heroPublicUrl`,
    // чтобы карточка проекта в `My_Designs_List` (Requirement 4.7) и
    // og-image (`resultImageUrl`) не остались пустыми.
    //
    // `error_message: null` — запись только что прошла все required
    // шаги, поэтому stale-сообщение от предыдущих ретраев должно быть
    // очищено (иначе на public-странице остаётся «не удалось ...» при
    // status=completed, что путает пользователя и роняет аудит).
    const resultImageUrl = infographicUrl ?? heroPublicUrl;
    await db
      .update(designsTable)
      .set({
        status: "completed",
        progress: PROGRESS_COMPLETED,
        currentStep: null,
        errorMessage: null,
        resultImageUrl,
        views,
        detailCrops,
        h1: content!.h1,
        seoTitle: content!.seoTitle,
        seoDescription: content!.seoDescription,
        description: content!.description,
        materials,
        estimate,
        solutions: content!.solutions,
        colorPalette,
        // Анонимные пользовательские проекты: владение через `anon_id`,
        // публичность по знанию URL (Requirement 4.6) — поле `is_public`
        // разруливает админский `Showcase_Project` (там поле задаётся
        // оператором). Не перезаписываем `is_public` тут, чтобы не
        // менять семантику админских записей.
        publicConsentAt:
          design.publicConsentAt ?? (design.isPublic ? new Date() : null),
        updatedAt: new Date(),
      })
      .where(eq(designsTable.id, designId));

    void pingForDesign(design.slug ?? "", design.roomType, design.style);
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      console.error(
        `[designWorker] design ${designId}: budget exceeded `
        + `(spent=${e.spentKopeks}, limit=${e.limitKopeks}) — failing`,
      );
      await markFailed(designId, "превышен бюджет генерации");
      return;
    }
    if (e instanceof RequiredStepFailedError) {
      console.error(
        `[designWorker] design ${designId}: required step "${e.stepName}" failed: ${e.userMessage}`,
        e.underlying instanceof Error ? e.underlying.message : e.underlying,
      );
      await markFailed(designId, e.userMessage);
      return;
    }
    // Любая другая необработанная ошибка пробрасывается tick-обработчику —
    // он переводит запись в `failed` со своим `error_message` (raw error).
    throw e;
  }
}

// ─── Internal helpers used by processDesign ─────────────────────────────────

/**
 * Достаёт целочисленный размер комнаты из формы. На случай, если в БД
 * сохранён только `area` (м², дробное), считаем стороны как корень из
 * площади — чтобы `Layout_Planner` получил консистентные `widthCm`/`lengthCm`.
 *
 * Если ни одно поле не доступно — возвращаем `fallback` (для bedroom MVP
 * это 400 см / 270 см, что покрывает большинство комнат).
 */
function layoutDim(
  design: { area: string | null; roomType: string },
  field: "widthCm" | "lengthCm" | "heightCm",
  fallback: number,
): number {
  // На MVP `designs` не хранит отдельные `width_cm`/`length_cm` — форма
  // пишет квадратный корень площади в `area` (м²). Используем эту же
  // эвристику здесь, чтобы Layout_Planner получил «реалистичные» стороны:
  //   side = round(sqrt(areaSqm * 10000)) для `widthCm`/`lengthCm`,
  //   fallback (270 см) для `heightCm` пока в форме нет отдельного поля.
  if (field === "heightCm") return fallback;
  if (!design.area) return fallback;
  const areaSqm = parseFloat(design.area);
  if (!Number.isFinite(areaSqm) || areaSqm <= 0) return fallback;
  const side = Math.round(Math.sqrt(areaSqm * 10_000));
  return Math.max(200, Math.min(800, side));
}

/**
 * Берёт ровно 4 ракурса для composer'а инфографики. Composer ожидает
 * `[Buffer, Buffer, Buffer, Buffer]` (Hero + 3 angle); если каких-то
 * Angle_Render не хватило, дублируем Hero в незанятые слоты как
 * placeholder (страница покажет 4 одинаковых верхних кадра, но не упадёт).
 */
function pickFourViews(
  viewBuffers: Buffer[],
  heroBuffer: Buffer | null,
): [Buffer, Buffer, Buffer, Buffer] | null {
  if (!heroBuffer) return null;
  const slot = (i: number): Buffer => viewBuffers[i] ?? heroBuffer;
  return [slot(0), slot(1), slot(2), slot(3)];
}

/**
 * Подписи 6 detail-crops в зависимости от типа помещения. Дублирует логику
 * fallback'а из старого пайплайна, чтобы не вычитать `cropLabels` тяжёлым
 * `import.*` в нескольких местах.
 */
function pickSixCropLabels(
  roomType: string,
): [string, string, string, string, string, string] {
  return ROOM_CROP_LABELS[roomType] ?? FALLBACK_CROP_LABELS;
}

// ─── Test-only export ───────────────────────────────────────────────────────
//
// `__test__` makes the FSM's structural invariants observable to property
// tests (Requirement 5.1, 5.2, 5.7, 15.2 — design.md `Property 13`). The FSM
// body itself is private; this hatch exposes only the constants and step
// classification used by the watchdog, the progress reporter and the
// required-vs-optional fail policy. Production code MUST NOT depend on it.

/** All 11 step name constants, in the order they appear in `processDesign`. */
const ALL_STEPS = [
  STEP_LAYOUT_JSON,
  STEP_HERO_RENDER,
  STEP_ANGLE_RENDERS,
  STEP_TOP_DOWN_PLAN,
  STEP_ISOMETRIC_RENDER,
  STEP_DETAIL_CROPS,
  STEP_PICK_FURNITURE,
  STEP_REAL_ESTIMATE,
  STEP_COLOR_PALETTE,
  STEP_AI_TEXT,
  STEP_INFOGRAPHIC,
] as const;

/**
 * Required steps (Requirement 14.1, design.md FSM diagram). A failure on
 * any of these flips the design row to `status=failed` with a user-visible
 * `error_message`. The remaining 7 are optional — their failures degrade
 * the artifact but never abort the pipeline.
 */
const STEPS_REQUIRED = [
  STEP_LAYOUT_JSON,
  STEP_HERO_RENDER,
  STEP_REAL_ESTIMATE,
  STEP_AI_TEXT,
] as const;

const STEPS_OPTIONAL = [
  STEP_ANGLE_RENDERS,
  STEP_TOP_DOWN_PLAN,
  STEP_ISOMETRIC_RENDER,
  STEP_DETAIL_CROPS,
  STEP_PICK_FURNITURE,
  STEP_COLOR_PALETTE,
  STEP_INFOGRAPHIC,
] as const;

/**
 * Progress milestones, in the same order as `ALL_STEPS`, plus the terminal
 * 100% (set when `status` becomes `completed`).
 */
const PROGRESS_SEQUENCE = [
  PROGRESS_LAYOUT_JSON,
  PROGRESS_HERO_RENDER,
  PROGRESS_ANGLE_RENDERS,
  PROGRESS_TOP_DOWN_PLAN,
  PROGRESS_ISOMETRIC_RENDER,
  PROGRESS_DETAIL_CROPS,
  PROGRESS_PICK_FURNITURE,
  PROGRESS_REAL_ESTIMATE,
  PROGRESS_COLOR_PALETTE,
  PROGRESS_AI_TEXT,
  PROGRESS_INFOGRAPHIC,
  PROGRESS_COMPLETED,
] as const;

export const __test__ = {
  // Step name constants (Requirement 5.2 — observable through `current_step`).
  STEP_LAYOUT_JSON,
  STEP_HERO_RENDER,
  STEP_ANGLE_RENDERS,
  STEP_TOP_DOWN_PLAN,
  STEP_ISOMETRIC_RENDER,
  STEP_DETAIL_CROPS,
  STEP_PICK_FURNITURE,
  STEP_REAL_ESTIMATE,
  STEP_COLOR_PALETTE,
  STEP_AI_TEXT,
  STEP_INFOGRAPHIC,
  ALL_STEPS,
  STEPS_REQUIRED,
  STEPS_OPTIONAL,
  // Progress milestones (Requirement 5.2).
  PROGRESS_LAYOUT_JSON,
  PROGRESS_HERO_RENDER,
  PROGRESS_ANGLE_RENDERS,
  PROGRESS_TOP_DOWN_PLAN,
  PROGRESS_ISOMETRIC_RENDER,
  PROGRESS_DETAIL_CROPS,
  PROGRESS_PICK_FURNITURE,
  PROGRESS_REAL_ESTIMATE,
  PROGRESS_COLOR_PALETTE,
  PROGRESS_AI_TEXT,
  PROGRESS_INFOGRAPHIC,
  PROGRESS_COMPLETED,
  PROGRESS_SEQUENCE,
  // Watchdog / tick (Requirements 5.1, 5.7).
  STUCK_TIMEOUT_MIN,
  TICK_INTERVAL_MS,
  // Retry policy (Requirements 2.7, 6.5, 7.7, 9.5).
  LAYOUT_GEOMETRIC_RETRIES,
  SINGLE_RETRY,
  // 4-view composition (Requirements 7.1, 7.3, 7.8 — Property 15).
  VIEW_LABELS_4,
  ANGLE_PROMPTS_BEDROOM_5,
  ISOMETRIC_VIEW_POSITION,
  ISOMETRIC_VIEW_LABEL,
  // Soft-fail bug guard (Property 13.6 — completion invariant).
  // The class itself isn't useful in tests, but its `userMessage`/
  // `stepName` shape is — exposing the constructor lets the property test
  // assert that `assertCompletionInvariant` throws an instance of the
  // exact error type the worker's outer catch routes to `markFailed`.
  RequiredStepFailedError,
  assertCompletionInvariant,
} as const;
