/**
 * Генерация дизайн-борда (вариант 2: FLUX-ракурсы + код-композитор).
 *
 * Пайплайн на один проект (identity-preserving):
 *   1. HERO: FLUX Pro Ultra рисует главный широкий кадр комнаты (text2img).
 *   2. VIEWS 2-4: FLUX Kontext Pro делает edit-image от HERO (image_url=heroUrl)
 *      с разными angle-промптами — те же материалы / мебель / палитра, но
 *      другой ракурс. Это держит identity (одна комната), в отличие от
 *      нарезки 2×2 коллажа.
 *   3. TOP-DOWN: FLUX Pro Ultra рисует вид сверху (заполняет слот плана,
 *      раньше был пустой placeholder).
 *   4. ISOMETRIC: FLUX Pro Ultra рисует изометрический 3D-ракурс.
 *   5. composeInfographic собирает борд с ЧЁТКИМ текстом (смета, материалы,
 *      палитра, сроки) — текст рисует код, а не модель.
 *   6. Борд загружается в R2, печатается публичный URL для оценки.
 *
 * Фаза 1 (этот скрипт): только генерим борд и заливаем в R2 — БЕЗ записи в БД.
 * Сначала оцениваем качество композиции, потом добавим публикацию страниц.
 *
 * ENV (нужны для запуска): FAL_API_KEY, R2_ENDPOINT, R2_ACCESS_KEY_ID,
 *   R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL, DEFAULT_OBJECT_STORAGE_BUCKET_ID.
 *
 * Запуск (там, где есть env — Railway / локально с .env):
 *   npx tsx src/scripts/generate-design-board.ts
 */

import sharp from "sharp";
import { falGenerateNanoBanana2, falGeneratePanoramicPro, downloadImage } from "../lib/falAi.js";
import { composeInfographic, type InfographicInput } from "../lib/infographicComposer.js";
import { objectStorageClient } from "../lib/objectStorage.js";

// ── Тестовый проект (living room modern). Контент — как на странице. ─────────

const PROJECT = {
  slugKey: "living-room-modern-20m",
  roomType: "living_room",
  style: "modern",
  area: 20,
  budget: 450000,
  durationWeeks: 8,
  viewLabels: [
    "Общий вид от входа",
    "Диванная группа",
    "ТВ-зона",
    "Зона у окна",
  ],
  materials: [
    { category: "Стены", description: "Краска матовая, светло-серый и белый" },
    { category: "Пол", description: "Инженерная доска, дуб натуральный" },
    { category: "ТВ-стена", description: "Декоративные панели МДФ, шпон дуба" },
    { category: "Потолок", description: "Натяжной матовый с контурной подсветкой" },
    { category: "Текстиль", description: "Лён и хлопок, серо-бежевые тона" },
  ],
  estimate: [
    { category: "Отделочные материалы", amountKopeks: 12000000 },
    { category: "Мебель (диван, тумба, стеллаж)", amountKopeks: 20000000 },
    { category: "Освещение", amountKopeks: 5000000 },
    { category: "Текстиль и декор", amountKopeks: 5000000 },
    { category: "Прочее (доставка, монтаж)", amountKopeks: 3000000 },
  ],
  colorPalette: [
    { hex: "#EFEAE2", name: "Молочный" },
    { hex: "#CFC4B4", name: "Песочный" },
    { hex: "#9A9387", name: "Серо-бежевый" },
    { hex: "#B98A5E", name: "Тёплый дуб" },
    { hex: "#3A3A3A", name: "Графитовый" },
  ],
  solutions: [
    { text: "Большой угловой диван и кресло формируют единую зону отдыха." },
    { text: "ТВ-стена из деревянных панелей со скрытой подсветкой как акцент." },
    { text: "Контурная подсветка потолка + точечные светильники — мягкий тёплый свет." },
    { text: "Зона у окна с креслом для чтения и максимумом естественного света." },
    { text: "Светлые стены и натуральное дерево визуально расширяют комнату." },
  ],
};

// ── Общее описание комнаты (для консистентности всех промптов) ───────────────

const ROOM_DESC =
  "modern minimalist living room, 20 sqm, real Russian apartment: light grey and " +
  "white matte walls, natural oak engineered wood floor, large grey fabric corner " +
  "sofa, round wooden coffee table, TV media wall with oak veneer panels and hidden " +
  "LED backlight, soft area rug, warm cozy lighting, large window with light linen " +
  "curtains";

// ── Промпты ──────────────────────────────────────────────────────────────────

/**
 * Общая стилевая база — повторяется в КАЖДОМ из 4 промптов дословно, чтобы
 * независимые text2img рендеры читались как одна и та же комната (стиль,
 * палитра, материалы, мебель). Меняется только рамка кадра / ракурс камеры.
 */
const STYLE_BASE =
  "Modern minimalist living room, 20 sqm, real Russian apartment. Consistent design: " +
  "light grey and white matte walls, natural light oak engineered wood floor, a large " +
  "grey fabric modular corner sofa, a round light wood coffee table, a wooden TV accent " +
  "wall with vertical oak veneer panels, a wall-mounted flat TV and hidden warm LED " +
  "backlight, a soft beige area rug, large windows with light beige linen curtains. " +
  "Professionally styled and richly decorated like a premium design project: layered " +
  "lighting (a slim floor lamp, a warm table lamp, recessed ceiling spots and the LED " +
  "wall glow), framed abstract wall art, a tall leafy potted plant, books and ceramic " +
  "decor on the media console, a textured knit throw blanket and several cushions on the " +
  "sofa, a high-pile textured rug, subtle gold and matte-black accents. Rich premium " +
  "materials and finishes, layered depth, cinematic warm evening lighting with soft " +
  "contrast and gentle shadows. Luxury interior design magazine photography, professional, " +
  "ultra detailed, sharp focus, 8k. No text, no labels, no watermark, no people.";

/**
 * ЕДИНЫЙ ХОЛСТ — один вызов gpt-image-1.5 рисует ВЕСЬ мульти-ракурсный холст
 * за один проход: 2×2 сетка из 4 отдельных фото ОДНОЙ комнаты с мебелью на
 * ТЕХ ЖЕ местах, меняется только угол камеры. Ключ к консистентности — это
 * ОДНА генерация (как в ChatGPT: один запрос = один когерентный холст), а не
 * 4 отдельных вызова, между которыми расстановка плывёт. Текст глушим — подписи
 * рисует композитор. Холст потом режется на 4 ячейки.
 */
const GRID_PROMPT =
  "A single interior design presentation board on ONE canvas: a clean 2x2 grid of FOUR " +
  "SEPARATE rectangular photographs, divided by thin white gutters into four equal panels. " +
  "All four panels show ONE and the SAME room with the SAME furniture in the SAME fixed " +
  "positions — nothing moves or changes between panels — ONLY the camera angle differs. " +
  `${STYLE_BASE} ` +
  "Use strong architectural perspective and a wide-angle lens so the room looks three-" +
  "dimensional and volumetric. CRITICAL: each of the four panels is shot from a clearly " +
  "DIFFERENT camera position facing a DIFFERENT direction — they must NOT look similar or " +
  "repeat the same viewpoint. The four camera angles are: " +
  "top-left panel = standing at the entrance door looking straight toward the wooden TV accent " +
  "wall, the TV wall in front, sofa on the side; " +
  "top-right panel = REVERSE shot from in front of the TV wall looking BACK toward the entrance " +
  "and the large windows — the TV wall is behind the camera and NOT visible — showing the " +
  "opposite wall, the entrance and the windows; " +
  "bottom-left panel = side view from the window corner looking along the room, the grey corner " +
  "sofa seen from the side, the TV wall on the far left at a sharp angle; " +
  "bottom-right panel = elevated high-angle bird's-eye three-quarter view looking down into the " +
  "room, showing the full furniture layout (sofa, coffee table, rug, TV wall) from above. " +
  "Consistent lighting and identical interior across all four panels. Four distinct equal " +
  "photographs in a 2x2 layout. No text, no labels, no captions, no numbers, no watermark, no people.";

/** TOP-DOWN — вид сверху для слота плана. */
function buildTopDownPrompt(): string {
  return [
    `Architectural top-down floor plan of the ${ROOM_DESC},`,
    "seen from directly straight above at a 90 degree bird's eye angle.",
    "The room layout FILLS THE ENTIRE IMAGE edge to edge. Light oak wood floor,",
    "furniture seen from straight above: grey corner sofa, round coffee table, TV wall,",
    "area rug, window. Bright even daylight, light airy colors, soft shadows.",
    "Flat top-down 3D render, no ceiling.",
    "IMPORTANT: no black background, no dark borders, no picture frame, no matte border,",
    "no vignette — the floor plan must fill the whole frame completely.",
    "No text, no labels, no dimensions, no watermark, no people.",
  ].join(" ");
}

/** ISOMETRIC — 3D-планировка. */
function buildIsometricPrompt(): string {
  return [
    `Axonometric isometric 3D cutaway rendering of the ${ROOM_DESC}.`,
    "Walls cut away so the interior is visible from above at an angle. Furniture in 3D",
    "volume with shadows. Clean white background outside the room.",
    "Architectural visualization, soft warm lighting. No people, no text, no labels, no watermark.",
  ].join(" ");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function toView(buf: Buffer): Promise<Buffer> {
  return await sharp(buf).resize(1024, 768, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
}

async function uploadJpeg(key: string, buf: Buffer): Promise<string> {
  const bucket = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
  if (!bucket) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  await objectStorageClient.bucket(bucket).file(key).save(buf, { contentType: "image/jpeg" });
  const base = (process.env["R2_PUBLIC_URL"] || "").replace(/\/+$/, "");
  return base ? `${base}/${key}` : "/api/marketplace/dizajn/img/" + key.replace(/^dizajn\//, "");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. ЕДИНЫЙ ХОЛСТ: один вызов Nano Banana 2 рисует 2×2 сетку 4 ракурсов ─────
  console.log("[gen-board] 1/6 Nano Banana 2 single-canvas 2x2 multi-angle board (4K)…");
  const grid = await falGenerateNanoBanana2({
    prompt: GRID_PROMPT,
    aspectRatio: "1:1",
    resolution: "4K",
  });
  const gridBuf = await downloadImage(grid.imageUrl);

  // 2. SLICE 2×2 → 4 views (identity держится — это одна генерация) ───────────
  console.log("[gen-board] 2/6 slice canvas → 4 views…");
  const meta = await sharp(gridBuf).metadata();
  const GW = meta.width ?? 1024;
  const GH = meta.height ?? 1024;
  const hw = Math.floor(GW / 2);
  const hh = Math.floor(GH / 2);
  const quads = [
    { left: 0, top: 0, width: hw, height: hh },
    { left: hw, top: 0, width: GW - hw, height: hh },
    { left: 0, top: hh, width: hw, height: GH - hh },
    { left: hw, top: hh, width: GW - hw, height: GH - hh },
  ];
  const views: Buffer[] = [];
  for (const q of quads) {
    views.push(await toView(await sharp(gridBuf).extract(q).jpeg({ quality: 92 }).toBuffer()));
  }

  // 3. TOP-DOWN plan render ──────────────────────────────────────────────────
  console.log("[gen-board] 3/6 FLUX top-down plan…");
  let topDown: Buffer | null = null;
  try {
    const td = await falGeneratePanoramicPro({ prompt: buildTopDownPrompt(), aspectRatio: "4:3" });
    topDown = await downloadImage(td.imageUrl);
  } catch (e) {
    console.warn("[gen-board] top-down failed (non-fatal):", e instanceof Error ? e.message : e);
  }

  // 4. ISOMETRIC ──────────────────────────────────────────────────────────────
  console.log("[gen-board] 4/6 FLUX isometric…");
  let isometric: Buffer | null = null;
  try {
    const iso = await falGeneratePanoramicPro({ prompt: buildIsometricPrompt(), aspectRatio: "1:1" });
    isometric = await downloadImage(iso.imageUrl);
  } catch (e) {
    console.warn("[gen-board] isometric failed (non-fatal):", e instanceof Error ? e.message : e);
  }

  // 5. COMPOSE ──────────────────────────────────────────────────────────────
  console.log("[gen-board] 5/6 compose board…");
  const input: InfographicInput = {
    views,
    isometric,
    detailCrops: [],
    viewLabels: PROJECT.viewLabels,
    cropLabels: [],
    topDownPlanPng: topDown,
    design: {
      roomType: PROJECT.roomType,
      area: PROJECT.area,
      style: PROJECT.style,
      budget: PROJECT.budget,
      durationWeeks: PROJECT.durationWeeks,
      materials: PROJECT.materials,
      estimate: PROJECT.estimate,
      colorPalette: PROJECT.colorPalette,
      solutions: PROJECT.solutions,
    },
  };
  const board = await composeInfographic(input);

  // 6. UPLOAD ─────────────────────────────────────────────────────────────────
  console.log("[gen-board] 6/6 upload to R2…");
  const url = await uploadJpeg(`dizajn/results/board_${PROJECT.slugKey}_${Date.now()}.jpg`, board);
  console.log("\n[gen-board] DONE. Board URL:");
  console.log(url);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[gen-board] fatal:", e instanceof Error ? e.stack : e);
    process.exit(1);
  });
