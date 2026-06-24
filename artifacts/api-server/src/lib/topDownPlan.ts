/**
 * Top_Down_Plan_Renderer — программная отрисовка 2D-плана вида сверху для
 * AI_Design_Product (Requirement 8 в `.kiro/specs/ai-design-product/`).
 *
 * Зачем:
 *   AI-модели рисуют «художественные» планы с произвольной геометрией. На
 *   странице `/dizajn/{slug}` нужен точный технический план: стены ровно
 *   под габариты комнаты, дверь на той же стене и в том же месте, что и
 *   в `Layout_JSON`, мебель в правильных позициях с поворотом и подписями
 *   габаритов главной мебели в формате «Кровать 160×200» (Requirement 8.4).
 *
 * Как работает:
 *   1. `renderTopDownPlanPng(layout)` строит SVG-строку из `Layout_JSON`.
 *      Для шаблона `bedroom` рисует стены, дверь с дугой открывания, окно,
 *      прямоугольник на каждый предмет мебели с поворотом, подписи длин
 *      стен в см и габаритов главной мебели (`bed`, `wardrobe`).
 *   2. `sharp` детерминированно конвертирует SVG → PNG. Размер канвы
 *      фиксирован (1200×900), все координаты вычисляются только из
 *      `LayoutJson` — никаких `Date.now()`, `Math.random()` или иных
 *      источников недетерминизма (требование PBT 7.2).
 *   3. `uploadTopDownPlan(designId, png)` сохраняет PNG в R2 по ключу
 *      `dizajn/plans/{designId}.png` через существующий `objectStorage.ts`
 *      и возвращает прокси-URL (`/api/marketplace/dizajn/img/...`),
 *      который страница `DesignBoard.tsx` использует напрямую как
 *      `top_down_plan_url`.
 *
 * Чего НЕ делает (Requirement 8.5):
 *   • не вызывает AI-провайдер ни первым выбором, ни fallback'ом — для
 *     `bedroom` программная отрисовка единственный вариант, при ошибке
 *     `sharp.png()` исключение пробрасывается выше и `Design_Worker`
 *     оставляет `top_down_plan_url = null`;
 *   • не сохраняет SVG отдельно — `DesignBoard.tsx` потребляет один URL
 *     изображения и не различает форматы (см. design.md секция
 *     `Top_Down_Plan_Renderer`);
 *   • для типов помещения, отличных от `bedroom`, возвращает placeholder
 *     с подписью «вид сверху» (как делает существующий
 *     `infographicComposer.ts`); для строгих сценариев экспортируется
 *     `UnsupportedRoomTypeError`, который вызывающий код может бросить
 *     самостоятельно.
 */

import sharp from "sharp";
import type { FurnitureItem, LayoutJson } from "@workspace/db";
import { objectStorageClient } from "./objectStorage.js";

// ─── Canvas / Style constants ────────────────────────────────────────────────

/** Ширина PNG в пикселях. Канва фиксированная, чтобы вывод был
 *  детерминированным и одинаковым между запусками для одного `Layout_JSON`. */
const CANVAS_W = 1200;
/** Высота PNG в пикселях. */
const CANVAS_H = 900;
/** Внешний отступ вокруг комнаты — место для подписей длин стен (Requirement 8.4). */
const PADDING = 110;

const BG_COLOR = "#FFFFFF";
const ROOM_FILL = "#F4F1ED";
const WALL_STROKE = "#3A4956";
const WALL_STROKE_WIDTH = 4;
const DOOR_ARC_STROKE = "#3A4956";
const DOOR_LEAF_STROKE = "#3A4956";
const WINDOW_STROKE = "#94B0C2";
const WINDOW_STROKE_WIDTH = 8;
const FURNITURE_FILL = "#E2D6C5";
const FURNITURE_STROKE = "#8A7B6A";
const FURNITURE_STROKE_WIDTH = 2;
const TEXT_FILL = "#3A4956";
const TEXT_FONT = "DejaVu Sans, Arial, sans-serif";

/**
 * Русские подписи для типов мебели. Используются и для главной мебели
 * (`bed`, `wardrobe` для bedroom) и для остальных предметов как короткое
 * имя на плане. Список покрывает enum типов мебели из JSON-схемы
 * `Layout_JSON`.
 */
const FURNITURE_LABELS_RU: Readonly<Record<string, string>> = {
  bed: "Кровать",
  wardrobe: "Шкаф",
  desk: "Стол",
  chair: "Стул",
  nightstand: "Тумба",
  rug: "Ковёр",
  dresser: "Комод",
  shelf: "Полка",
  sofa: "Диван",
  armchair: "Кресло",
  tv_unit: "ТВ-зона",
  coffee_table: "Журн. столик",
  dining_table: "Стол",
  kitchen_island: "Остров",
  sink: "Раковина",
  toilet: "Унитаз",
  bathtub: "Ванна",
  shower: "Душ",
  mirror: "Зеркало",
  cabinet: "Шкаф",
};

/**
 * Главная мебель по типу помещения — для неё подпись содержит габариты в
 * формате «Кровать 160×200» (Requirement 8.4). Для bedroom MVP — только
 * кровать и шкаф; остальные типы помещения шаблонной отрисовки на MVP не
 * имеют (Requirement 8.5).
 */
const MAJOR_FURNITURE: Readonly<Record<string, ReadonlySet<string>>> = {
  bedroom: new Set(["bed", "wardrobe"]),
};

// ─── Errors ──────────────────────────────────────────────────────────────────

/**
 * Бросается, если вызывающий код хочет строгого режима для типов помещения
 * без шаблонной отрисовки. По умолчанию `renderTopDownPlanPng` возвращает
 * placeholder PNG (Requirement 8.5), но `Design_Worker` или сторонние
 * скрипты могут импортировать этот класс и бросить его сами.
 */
export class UnsupportedRoomTypeError extends Error {
  public readonly roomType: string;
  constructor(roomType: string) {
    super(`Top_Down_Plan: room type "${roomType}" is not supported`);
    this.name = "UnsupportedRoomTypeError";
    this.roomType = roomType;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Рисует SVG из Layout_JSON и конвертирует его в PNG детерминированно.
 *
 * Для `room.roomType === "bedroom"` — полноценный план. Для остальных
 * типов — placeholder с подписью «вид сверху» (Requirement 8.5).
 *
 * @throws всё, что бросает `sharp.png()` при невалидном SVG. Вызывающий
 *         код (Design_Worker) логирует ошибку и оставляет
 *         `top_down_plan_url = null`; AI-fallback запрещён.
 */
export async function renderTopDownPlanPng(
  layout: LayoutJson,
): Promise<Buffer> {
  const svg =
    layout.room.roomType === "bedroom"
      ? buildBedroomSvg(layout)
      : buildPlaceholderSvg();
  // sharp детерминирован для одного и того же входа: компрессия PNG
  // алгоритмическая, librsvg-рендер не использует случайных источников.
  return sharp(Buffer.from(svg, "utf8"))
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Загружает готовый PNG в R2 по ключу `dizajn/plans/{designId}.png` через
 * существующий `objectStorage.ts` (тот же паттерн, что `uploadJpegToR2` в
 * `designWorker.ts`, только с `Content-Type: image/png`).
 *
 * Возвращает прокси-URL `/api/marketplace/dizajn/img/plans/{designId}.png`,
 * который страница `DesignBoard.tsx` использует как `top_down_plan_url`.
 */
export async function uploadTopDownPlan(
  designId: number,
  png: Buffer,
): Promise<string> {
  const bucketId = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
  if (!bucketId) {
    throw new Error(
      "Top_Down_Plan: DEFAULT_OBJECT_STORAGE_BUCKET_ID is not configured",
    );
  }
  const key = `dizajn/plans/${designId}.png`;
  await objectStorageClient
    .bucket(bucketId)
    .file(key)
    .save(png, { contentType: "image/png" });
  // Тот же паттерн прокси-URL, что и `uploadJpegToR2` в designWorker.ts:
  // ключ `dizajn/plans/{id}.png` → URL `/api/marketplace/dizajn/img/plans/{id}.png`.
  return "/api/marketplace/dizajn/img/" + key.replace(/^dizajn\//, "");
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

interface RoomGeometry {
  /** Ширина комнаты в см (ось X в Layout_JSON). */
  widthCm: number;
  /** Длина комнаты в см (ось Y в Layout_JSON). */
  lengthCm: number;
  /** Пиксели на сантиметр — единый масштаб по обеим осям, чтобы
   *  пропорции комнаты сохранялись на плане. */
  scale: number;
  /** SVG-x левого-верхнего угла прямоугольника комнаты. */
  originX: number;
  /** SVG-y левого-верхнего угла прямоугольника комнаты. */
  originY: number;
  /** Ширина комнаты в пикселях. */
  roomPxW: number;
  /** Длина комнаты в пикселях. */
  roomPxL: number;
}

/**
 * Подгоняет прямоугольник комнаты под доступную область канвы с отступом
 * `PADDING` для подписей длин стен и центрирует его. Один и тот же масштаб
 * по X и Y → сохранение пропорций.
 */
function computeRoomGeometry(
  widthCm: number,
  lengthCm: number,
): RoomGeometry {
  const availW = CANVAS_W - 2 * PADDING;
  const availH = CANVAS_H - 2 * PADDING;
  const scale = Math.min(availW / widthCm, availH / lengthCm);
  const roomPxW = widthCm * scale;
  const roomPxL = lengthCm * scale;
  const originX = (CANVAS_W - roomPxW) / 2;
  const originY = (CANVAS_H - roomPxL) / 2;
  return { widthCm, lengthCm, scale, originX, originY, roomPxW, roomPxL };
}

/** Округление координат до 2 знаков — стабильное представление в SVG-строке
 *  (без длинных «хвостов» FP), даёт побайтово одинаковый SVG при одинаковом
 *  входе. Все координаты канвы — небольшие, потери точности не возникает. */
function n(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── SVG builders (bedroom template) ─────────────────────────────────────────

function buildBedroomSvg(layout: LayoutJson): string {
  const geom = computeRoomGeometry(
    layout.room.widthCm,
    layout.room.lengthCm,
  );
  // Слои — порядок важен:
  //  1. фон канвы
  //  2. контур комнаты с заливкой
  //  3. окно (поверх контура — должно перекрывать линию стены)
  //  4. дверь — белая «прорезь» в стене + дуга открывания + полотно двери
  //  5. мебель
  //  6. подписи длин стен (вне комнаты, поэтому рисуются последними, чтобы
  //     не накладываться на стены/окно/дверь)
  return [
    buildSvgHeader(),
    buildBackground(),
    buildWalls(geom),
    buildWindow(geom, layout.window),
    buildDoor(geom, layout.door),
    buildFurniture(geom, layout.furniture, layout.room.roomType),
    buildWallLabels(geom),
    buildSvgFooter(),
  ].join("\n");
}

function buildSvgHeader(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">`;
}

function buildSvgFooter(): string {
  return `</svg>`;
}

function buildBackground(): string {
  return `<rect x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="${BG_COLOR}"/>`;
}

function buildWalls(geom: RoomGeometry): string {
  const { originX, originY, roomPxW, roomPxL } = geom;
  return `<rect x="${n(originX)}" y="${n(originY)}" width="${n(roomPxW)}" height="${n(roomPxL)}" fill="${ROOM_FILL}" stroke="${WALL_STROKE}" stroke-width="${WALL_STROKE_WIDTH}"/>`;
}

// ─── Door ────────────────────────────────────────────────────────────────────

interface DoorPoints {
  /** Точка-петля (вокруг неё дверь раскрывается). */
  hingeX: number;
  hingeY: number;
  /** Свободный конец двери в закрытом положении (вдоль стены). */
  endX: number;
  endY: number;
  /** Свободный конец двери в полностью открытом положении (90° внутрь
   *  комнаты — по нему рисуется полотно двери и конец дуги). */
  openX: number;
  openY: number;
  /** SVG arc sweep flag (0 = против часовой, 1 = по часовой стрелке). */
  sweep: 0 | 1;
}

/**
 * Вычисляет позицию двери: петля в начальной точке отрезка двери (со
 * стороны меньшего смещения от угла), полотно открывается перпендикулярно
 * стене внутрь комнаты. Это стандартное архитектурное обозначение:
 * сектор-четверть круга.
 *
 * `Layout_JSON.door.offsetCm` — смещение от «начального» угла стены:
 *   • north: отсчёт с запада (с +X);
 *   • south: отсчёт с запада;
 *   • west:  отсчёт с севера (с +Y);
 *   • east:  отсчёт с севера.
 */
function computeDoorPoints(
  geom: RoomGeometry,
  door: LayoutJson["door"],
): DoorPoints {
  const { originX, originY, roomPxW, roomPxL, scale } = geom;
  const offset = door.offsetCm * scale;
  const dWidth = door.widthCm * scale;

  switch (door.wall) {
    case "north": {
      // Стена сверху (y = originY). Дверь раскрывается вниз (внутрь комнаты).
      const hingeX = originX + offset;
      const hingeY = originY;
      return {
        hingeX,
        hingeY,
        endX: hingeX + dWidth,
        endY: hingeY,
        openX: hingeX,
        openY: hingeY + dWidth,
        // От «3 часов» (правее петли) к «6 часам» (ниже петли) — по часовой.
        sweep: 1,
      };
    }
    case "south": {
      // Стена снизу. Раскрывается вверх (внутрь).
      const hingeX = originX + offset;
      const hingeY = originY + roomPxL;
      return {
        hingeX,
        hingeY,
        endX: hingeX + dWidth,
        endY: hingeY,
        openX: hingeX,
        openY: hingeY - dWidth,
        // От «3 часов» к «12 часам» — против часовой.
        sweep: 0,
      };
    }
    case "west": {
      // Стена слева. Раскрывается вправо (внутрь).
      const hingeX = originX;
      const hingeY = originY + offset;
      return {
        hingeX,
        hingeY,
        endX: hingeX,
        endY: hingeY + dWidth,
        openX: hingeX + dWidth,
        openY: hingeY,
        // От «6 часов» к «3 часам» — против часовой.
        sweep: 0,
      };
    }
    case "east": {
      // Стена справа. Раскрывается влево (внутрь).
      const hingeX = originX + roomPxW;
      const hingeY = originY + offset;
      return {
        hingeX,
        hingeY,
        endX: hingeX,
        endY: hingeY + dWidth,
        openX: hingeX - dWidth,
        openY: hingeY,
        // От «6 часов» к «9 часам» — по часовой.
        sweep: 1,
      };
    }
  }
  // Exhaustiveness guard for `Wall`. TS уже проверит, но runtime-fallback
  // на всякий случай.
  const _exhaustive: never = door.wall;
  throw new Error(`Top_Down_Plan: unknown wall "${_exhaustive}"`);
}

function buildDoor(
  geom: RoomGeometry,
  door: LayoutJson["door"],
): string {
  const dp = computeDoorPoints(geom, door);
  const r = Math.hypot(dp.endX - dp.hingeX, dp.endY - dp.hingeY);
  // 1) «Прорезь» в стене — белая линия поверх стены толщиной чуть больше
  //    толщины стены, чтобы полностью её перекрыть.
  const erase = `<line x1="${n(dp.hingeX)}" y1="${n(dp.hingeY)}" x2="${n(dp.endX)}" y2="${n(dp.endY)}" stroke="${BG_COLOR}" stroke-width="${WALL_STROKE_WIDTH + 2}" stroke-linecap="butt"/>`;
  // 2) Дуга открывания (90°, пунктир).
  const arc = `<path d="M ${n(dp.endX)} ${n(dp.endY)} A ${n(r)} ${n(r)} 0 0 ${dp.sweep} ${n(dp.openX)} ${n(dp.openY)}" fill="none" stroke="${DOOR_ARC_STROKE}" stroke-width="1.5" stroke-dasharray="4,4"/>`;
  // 3) Полотно двери — линия от петли к полностью открытой позиции.
  const leaf = `<line x1="${n(dp.hingeX)}" y1="${n(dp.hingeY)}" x2="${n(dp.openX)}" y2="${n(dp.openY)}" stroke="${DOOR_LEAF_STROKE}" stroke-width="2" stroke-linecap="round"/>`;
  return [erase, arc, leaf].join("\n");
}

// ─── Window ──────────────────────────────────────────────────────────────────

function buildWindow(
  geom: RoomGeometry,
  win: LayoutJson["window"],
): string {
  if (!win) return "";
  const { originX, originY, roomPxW, roomPxL, scale } = geom;
  const offset = win.offsetCm * scale;
  const wLen = win.widthCm * scale;

  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;
  switch (win.wall) {
    case "north":
      x1 = originX + offset;
      y1 = originY;
      x2 = x1 + wLen;
      y2 = y1;
      break;
    case "south":
      x1 = originX + offset;
      y1 = originY + roomPxL;
      x2 = x1 + wLen;
      y2 = y1;
      break;
    case "west":
      x1 = originX;
      y1 = originY + offset;
      x2 = x1;
      y2 = y1 + wLen;
      break;
    case "east":
      x1 = originX + roomPxW;
      y1 = originY + offset;
      x2 = x1;
      y2 = y1 + wLen;
      break;
    default: {
      const _exhaustive: never = win.wall;
      throw new Error(`Top_Down_Plan: unknown wall "${_exhaustive}"`);
    }
  }
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${WINDOW_STROKE}" stroke-width="${WINDOW_STROKE_WIDTH}" stroke-linecap="butt"/>`;
}

// ─── Furniture ───────────────────────────────────────────────────────────────

function buildFurniture(
  geom: RoomGeometry,
  furniture: FurnitureItem[],
  roomType: string,
): string {
  const major = MAJOR_FURNITURE[roomType] ?? new Set<string>();
  return furniture
    .map((item) => buildFurnitureItem(geom, item, major))
    .join("\n");
}

/**
 * Один предмет мебели: прямоугольник с поворотом плюс подпись.
 *
 * Координатная конвенция Layout_JSON: `xCm`/`yCm` — левый-верхний угол
 * AABB; при повороте 90/270 ширина и глубина AABB меняются местами
 * относительно «исходной» ориентации мебели (см. `lib/db/src/types/layout.ts`
 * и системную подсказку Layout_Planner). Чтобы и центр AABB, и видимый
 * прямоугольник на плане совпадали с тем, что использует `validateLayout`,
 * центрируем `<g>` в центре AABB и поворачиваем «исходный» прямоугольник
 * на `rotationDeg`. После поворота bounding box на экране совпадает с
 * AABB из Layout_JSON.
 */
function buildFurnitureItem(
  geom: RoomGeometry,
  item: FurnitureItem,
  major: ReadonlySet<string>,
): string {
  const { originX, originY, scale } = geom;
  const xPx = originX + item.xCm * scale;
  const yPx = originY + item.yCm * scale;
  const wPx = item.widthCm * scale;
  const dPx = item.depthCm * scale;
  const cxPx = xPx + wPx / 2;
  const cyPx = yPx + dPx / 2;

  // «Исходные» (до поворота) габариты в пикселях. Для 0/180 совпадают с
  // AABB; для 90/270 меняются местами, чтобы после <rotate> AABB совпал.
  const isPerpendicular = item.rotationDeg === 90 || item.rotationDeg === 270;
  const preW = isPerpendicular ? dPx : wPx;
  const preD = isPerpendicular ? wPx : dPx;

  const rect =
    `<g transform="translate(${n(cxPx)} ${n(cyPx)}) rotate(${item.rotationDeg})">` +
    `<rect x="${n(-preW / 2)}" y="${n(-preD / 2)}" width="${n(preW)}" height="${n(preD)}" ` +
    `fill="${FURNITURE_FILL}" stroke="${FURNITURE_STROKE}" stroke-width="${FURNITURE_STROKE_WIDTH}"/>` +
    `</g>`;

  // Подпись. Для главной мебели — с габаритами в формате «Кровать 160×200»
  // (Requirement 8.4). Для остальных — короткое имя типа.
  const ru = FURNITURE_LABELS_RU[item.type] ?? item.type;
  const dim1 = Math.min(item.widthCm, item.depthCm);
  const dim2 = Math.max(item.widthCm, item.depthCm);
  const label = major.has(item.type) ? `${ru} ${dim1}×${dim2}` : ru;

  // Если AABB слишком маленькая — пропускаем подпись, чтобы текст не
  // вылезал за пределы мебели. Порог 40 пикселей выбран по тому, чтобы
  // даже шрифт в 11 пунктов влезал по высоте.
  const minDim = Math.min(wPx, dPx);
  if (minDim < 40) {
    return rect;
  }

  const fontSize = Math.max(11, Math.min(16, Math.floor(minDim / 5)));
  const text =
    `<text x="${n(cxPx)}" y="${n(cyPx)}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="${TEXT_FONT}" font-size="${fontSize}" fill="${TEXT_FILL}">` +
    escapeXml(label) +
    `</text>`;

  return [rect, text].join("\n");
}

// ─── Wall length labels ──────────────────────────────────────────────────────

/**
 * Подписи длин стен в см — над, под и по бокам комнаты (Requirement 8.4).
 * Север/юг показывают `widthCm`, запад/восток — `lengthCm`. Дублирование
 * с двух сторон делает план читаемым независимо от того, на какой стене
 * расположены дверь и окно.
 */
function buildWallLabels(geom: RoomGeometry): string {
  const { originX, originY, roomPxW, roomPxL, widthCm, lengthCm } = geom;
  const fs = 18;

  const north = `<text x="${n(originX + roomPxW / 2)}" y="${n(originY - 30)}" text-anchor="middle" font-family="${TEXT_FONT}" font-size="${fs}" fill="${TEXT_FILL}">${widthCm} см</text>`;
  const south = `<text x="${n(originX + roomPxW / 2)}" y="${n(originY + roomPxL + 50)}" text-anchor="middle" font-family="${TEXT_FONT}" font-size="${fs}" fill="${TEXT_FILL}">${widthCm} см</text>`;
  // Текст вертикальный — повёрнут на -90°/+90° вокруг своей якорной точки.
  const west = `<text transform="translate(${n(originX - 36)} ${n(originY + roomPxL / 2)}) rotate(-90)" text-anchor="middle" font-family="${TEXT_FONT}" font-size="${fs}" fill="${TEXT_FILL}">${lengthCm} см</text>`;
  const east = `<text transform="translate(${n(originX + roomPxW + 50)} ${n(originY + roomPxL / 2)}) rotate(90)" text-anchor="middle" font-family="${TEXT_FONT}" font-size="${fs}" fill="${TEXT_FILL}">${lengthCm} см</text>`;
  return [north, south, west, east].join("\n");
}

// ─── Placeholder for non-bedroom rooms ───────────────────────────────────────

/**
 * Простой placeholder для типов помещения без шаблона (Requirement 8.5).
 * Тот же текст, что в существующем `infographicComposer.buildFloorPlanSvg`
 * для не-bedroom веток, чтобы поведение продукта оставалось согласованным.
 */
function buildPlaceholderSvg(): string {
  return [
    buildSvgHeader(),
    buildBackground(),
    `<rect x="${PADDING}" y="${PADDING}" width="${CANVAS_W - 2 * PADDING}" height="${CANVAS_H - 2 * PADDING}" fill="${ROOM_FILL}" stroke="${WALL_STROKE}" stroke-width="${WALL_STROKE_WIDTH}"/>`,
    `<text x="${CANVAS_W / 2}" y="${CANVAS_H / 2}" text-anchor="middle" dominant-baseline="middle" font-family="${TEXT_FONT}" font-size="48" fill="${TEXT_FILL}">Вид сверху</text>`,
    buildSvgFooter(),
  ].join("\n");
}

// ─── Test hooks (не часть публичного контракта) ──────────────────────────────

/**
 * Экспорт для unit/property-тестов и debug. Не используется в проде.
 * Property-test 7.2 опирается на `buildBedroomSvg` (структурная полнота
 * SVG) и на детерминизм `renderTopDownPlanPng` для одинаковых входов.
 */
export const __test__ = {
  CANVAS_W,
  CANVAS_H,
  PADDING,
  buildBedroomSvg,
  buildPlaceholderSvg,
  buildWalls,
  buildDoor,
  buildWindow,
  buildFurniture,
  buildWallLabels,
  computeRoomGeometry,
  computeDoorPoints,
  FURNITURE_LABELS_RU,
  MAJOR_FURNITURE,
};
