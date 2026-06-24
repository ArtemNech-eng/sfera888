/**
 * Isometric_Callout_Renderer — программное наложение SVG-выносок на
 * AI-сгенерированный 3D-isometric ракурс комнаты для `AI_Design_Product`.
 *
 * Спека: `.kiro/specs/ai-design-product/design.md` секция
 * `Isometric_Callout_Renderer`, `requirements.md` Requirement 9 (9.1–9.5).
 *
 * Что делает
 * ──────────
 *   • принимает baseImage (PNG/JPEG-буфер AI-рендера 3D-isometric комнаты)
 *     и Layout_JSON (план комнаты с координатами мебели);
 *   • для каждого функционального предмета мебели (для `bedroom` это
 *     `bed`, `wardrobe`, `nightstand`, `desk` — Requirement 9.2) считает
 *     screen-координаты через калибровочную изометрическую проекцию 30°
 *     (см. формулы ниже) и рисует выноску с подписью на русском;
 *   • композитит SVG поверх baseImage через `sharp(...).composite([...]).jpeg()`
 *     и возвращает готовый JPEG-буфер.
 *
 * Чего не делает
 * ──────────────
 *   • не вызывает AI_Image_Provider — только программный композитинг;
 *   • не сохраняет результат в R2 — это делает воркер (`designWorker.ts`,
 *     задача 15.1), записывая буфер в `dizajn/isometric/{designId}.jpg`;
 *   • не подписывает не-функциональные предметы (стулья, коврики, …) —
 *     чтобы не перегружать кадр.
 *
 * Калибровочная изометрическая проекция (Requirement 9.3)
 * ───────────────────────────────────────────────────────
 *   У AI-сгенерированного `Isometric_Render` нет точных параметров камеры —
 *   это пиксельный рендер, а не 3D-сцена. Поэтому делаем калибровочную
 *   проекцию: считаем, что комната нарисована стандартной изометрией под
 *   углом 30° с равномерным масштабом, центрированная в середине кадра:
 *
 *     screen_x = (xCm - yCm) · cos(30°) · scale + cx
 *     screen_y = (xCm + yCm) · sin(30°) · scale - zCm · scale + cy
 *
 *   Единый `scale` подбирается так, чтобы комната целиком (все 8 углов
 *   3D-короба width × length × height) поместилась в кадр с отступом 10 %.
 *   Центр проекции комнаты совмещается с серединой изображения.
 *
 *   Аппроксимация неидеальна: если AI нарисовал комнату не строго
 *   изометрически, выноски могут «съезжать» на 10–15 px. Для MVP это
 *   допустимо — `buildIsometricPrompt` явно требует от модели «axonometric
 *   isometric view».
 *
 * Все размеры в Layout_JSON — целые сантиметры, в screen-пространстве —
 * пиксели. Тип `LayoutJson` приходит из общего пакета `@workspace/db`
 * (`lib/db/src/types/layout.ts`).
 */

import sharp from "sharp";
import type { FurnitureItem, LayoutJson } from "@workspace/db";

// ─── Константы проекции ─────────────────────────────────────────────────────

/** cos(30°) ≈ 0.8660254, точное значение √3/2. */
const COS30 = Math.cos(Math.PI / 6);
/** sin(30°) = 0.5. */
const SIN30 = Math.sin(Math.PI / 6);
/** Доля отступа с каждой стороны кадра (Requirement 9.3 — «отступ 10 %»). */
const ROOM_PADDING_RATIO = 0.10;

// ─── Какие типы мебели подписывать (Requirement 9.2) ────────────────────────

/**
 * Множество функциональных типов мебели, для которых нужна выноска. На MVP
 * заполнен только `bedroom`. Для прочих типов помещения возвращается пустое
 * множество, и `composeIsometricWithCallouts` отдаёт baseImage без выносок.
 */
const FUNCTIONAL_TYPES_BY_ROOM: Readonly<Record<string, ReadonlySet<string>>> = {
  bedroom: new Set<string>(["bed", "wardrobe", "nightstand", "desk"]),
};

/**
 * Подписи на русском. Совпадают с визуальным стилем «Прикроватные тумбы /
 * Двуспальная кровать / Встроенный шкаф / Рабочее место у окна» из
 * `infographicComposer.buildIsometricCalloutsSvg` (который удаляется в задаче
 * 8.2). Подписи теперь привязаны к типу, координаты — к Layout_JSON.
 */
const TYPE_LABEL_RU: Readonly<Record<string, string>> = {
  bed: "Кровать",
  wardrobe: "Шкаф",
  nightstand: "Прикроватная тумба",
  desk: "Рабочая зона",
};

// ─── Внутренние типы ────────────────────────────────────────────────────────

/** Точка в пиксельных координатах изображения. */
interface Point {
  x: number;
  y: number;
}

/** Параметры калибровочной проекции для конкретного кадра. */
interface ProjectionCalibration {
  /** Пикселей на сантиметр (одинаковый по обеим осям). */
  scale: number;
  /** Сдвиг проекции по X в пикселях. */
  cx: number;
  /** Сдвиг проекции по Y в пикселях. */
  cy: number;
}

/** Размещение одной выноски — якорь на мебели + позиция подписи. */
interface CalloutPlacement {
  /** Точка на изображении, на которую указывает стрелка выноски. */
  anchor: Point;
  /** Точка, в которой выводится текст подписи. */
  label: Point;
  /** На какой стороне (левой/правой) рендерится подпись. */
  side: "left" | "right";
  /** Текст подписи (русский). */
  text: string;
}

// ─── Геометрия ──────────────────────────────────────────────────────────────

/** Спроецировать точку (xCm, yCm, zCm) в screen-координаты при заданной
 *  калибровке. Чистая функция — пишем её отдельно, чтобы её свойства можно
 *  было покрыть property-тестами (задача 8.3, Property 17). */
function projectPoint(
  xCm: number,
  yCm: number,
  zCm: number,
  cal: ProjectionCalibration,
): Point {
  return {
    x: (xCm - yCm) * COS30 * cal.scale + cal.cx,
    y: (xCm + yCm) * SIN30 * cal.scale - zCm * cal.scale + cal.cy,
  };
}

/**
 * Подобрать `scale`, `cx`, `cy` так, чтобы все 8 углов 3D-короба комнаты
 * (width × length × height) помещались в кадр с отступом 10 % с каждой
 * стороны, а центр ограничивающего прямоугольника проекции совмещался с
 * центром изображения.
 *
 * Берём 8 углов, потому что спроецированная комната — это шестиугольник,
 * а не прямоугольник: фитим именно проекцию, чтобы и пол, и потолок не
 * вылезли за пределы кадра.
 */
function calibrateProjection(
  layout: LayoutJson,
  imgWidth: number,
  imgHeight: number,
): ProjectionCalibration {
  const W = layout.room.widthCm;
  const L = layout.room.lengthCm;
  const H = layout.room.heightCm;

  // 8 углов короба; считаем при scale = 1 и cx = cy = 0, потом масштабируем.
  const corners: Array<readonly [number, number, number]> = [
    [0, 0, 0], [W, 0, 0], [0, L, 0], [W, L, 0],
    [0, 0, H], [W, 0, H], [0, L, H], [W, L, H],
  ];

  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;

  for (const [x, y, z] of corners) {
    const sx = (x - y) * COS30;
    const sy = (x + y) * SIN30 - z;
    if (sx < xMin) xMin = sx;
    if (sx > xMax) xMax = sx;
    if (sy < yMin) yMin = sy;
    if (sy > yMax) yMax = sy;
  }

  const projWidth = xMax - xMin;
  const projHeight = yMax - yMin;

  // Полезная площадь кадра после отступов 10 % с каждой стороны.
  const usableWidth = imgWidth * (1 - 2 * ROOM_PADDING_RATIO);
  const usableHeight = imgHeight * (1 - 2 * ROOM_PADDING_RATIO);

  // Защищаемся от деления на ноль для вырожденных layout (теоретически
  // невозможно по JSON-схеме, но валидаторы на этапе фитинга мягче).
  const safeProjWidth = projWidth > 0 ? projWidth : 1;
  const safeProjHeight = projHeight > 0 ? projHeight : 1;

  const scale = Math.min(usableWidth / safeProjWidth, usableHeight / safeProjHeight);

  // Совместить центр bbox проекции с центром изображения.
  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;
  const cx = imgWidth / 2 - xMid * scale;
  const cy = imgHeight / 2 - yMid * scale;

  return { scale, cx, cy };
}

// ─── Сборка выносок ─────────────────────────────────────────────────────────

/** Отобрать функциональные предметы заданного типа помещения. */
function functionalItemsFromLayout(
  layout: LayoutJson,
  roomType: string,
): FurnitureItem[] {
  const fnSet = FUNCTIONAL_TYPES_BY_ROOM[roomType];
  if (!fnSet) return [];
  return layout.furniture.filter((f) => fnSet.has(f.type));
}

/**
 * Якорь выноски — верхняя точка центра AABB предмета: `(xCm + width/2,
 * yCm + depth/2, heightCm)`. Это естественная точка, на которую «смотрит»
 * взгляд: верхушка предмета видна на изометрии лучше всего.
 */
function anchorPointOf(item: FurnitureItem, cal: ProjectionCalibration): Point {
  return projectPoint(
    item.xCm + item.widthCm / 2,
    item.yCm + item.depthCm / 2,
    item.heightCm,
    cal,
  );
}

/**
 * Распределить подписи по краям кадра, чтобы они не накладывались друг на
 * друга. Стратегия:
 *   1. Каждая выноска тяготеет к ближайшему вертикальному краю кадра (так
 *      стрелка пересекает меньше мебели).
 *   2. Внутри одного края подписи выстраиваются по anchor.y и распределяются
 *      равномерно по вертикали с отступами от верха/низа.
 *
 * Anchor-координаты остаются производными от Layout_JSON (Property 17): для
 * двух layout, отличающихся положением функционального предмета, anchor
 * соответствующей выноски тоже отличается. Позиция самой подписи может
 * сдвинуться при перераспределении по краю — это отдельная характеристика.
 */
function buildCallouts(
  items: FurnitureItem[],
  imgWidth: number,
  imgHeight: number,
  cal: ProjectionCalibration,
): CalloutPlacement[] {
  if (items.length === 0) return [];

  const horizontalMargin = Math.max(8, Math.round(imgWidth * 0.04));
  const verticalMargin = Math.max(28, Math.round(imgHeight * 0.05));

  const projected = items.map((item) => ({
    item,
    anchor: anchorPointOf(item, cal),
  }));

  const midX = imgWidth / 2;

  const left = projected
    .filter((p) => p.anchor.x < midX)
    .sort((a, b) => a.anchor.y - b.anchor.y);
  const right = projected
    .filter((p) => p.anchor.x >= midX)
    .sort((a, b) => a.anchor.y - b.anchor.y);

  const callouts: CalloutPlacement[] = [];

  for (const group of [
    { list: left, side: "left" as const, x: horizontalMargin },
    { list: right, side: "right" as const, x: imgWidth - horizontalMargin },
  ]) {
    const n = group.list.length;
    if (n === 0) continue;

    const usableTop = verticalMargin;
    const usableBottom = imgHeight - verticalMargin;
    const usableHeight = Math.max(0, usableBottom - usableTop);

    for (let i = 0; i < n; i++) {
      const p = group.list[i]!;
      // Один предмет в группе — подпись на уровне якоря, иначе равномерно.
      const idealY = n === 1
        ? p.anchor.y
        : usableTop + (usableHeight * i) / (n - 1);
      const labelY = clamp(idealY, usableTop, usableBottom);
      callouts.push({
        anchor: p.anchor,
        label: { x: group.x, y: labelY },
        side: group.side,
        text: TYPE_LABEL_RU[p.item.type] ?? p.item.type,
      });
    }
  }

  return callouts;
}

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

// ─── SVG ────────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Округление до 1 знака — стабильный SVG-вывод и компактные числа. */
function r1(n: number): string {
  return n.toFixed(1);
}

/**
 * Построить SVG со всеми выносками. Размер совпадает с baseImage, чтобы
 * `sharp(...).composite([{ input: svgBuffer, top: 0, left: 0 }])` накладывал
 * выноски пиксель-в-пиксель.
 *
 * Стиль (тёмно-синяя линия #3A4956 + текст с белой обводкой) сохраняет
 * визуальный язык удаляемого `infographicComposer.buildIsometricCalloutsSvg`,
 * только координаты теперь computed, а не зашиты.
 */
function buildSvg(
  imgWidth: number,
  imgHeight: number,
  callouts: CalloutPlacement[],
): string {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${imgWidth}" height="${imgHeight}" viewBox="0 0 ${imgWidth} ${imgHeight}">`,
  );

  for (const c of callouts) {
    // «Изгиб» линии: от якоря к промежуточной точке у самой подписи, затем
    // короткая горизонтальная подсечка под текстом.
    const inset = c.side === "left" ? 14 : -14;
    const elbowX = c.label.x + inset;
    const elbowY = c.label.y;

    // Точки текста: для left — anchor=start, текст справа от линии-подсечки;
    //               для right — anchor=end,  текст слева от линии-подсечки.
    const textAnchor = c.side === "left" ? "start" : "end";
    const textX = c.side === "left" ? c.label.x + 4 : c.label.x - 4;
    const textY = c.label.y - 6;

    parts.push("<g>");
    // Якорная точка на мебели.
    parts.push(
      `<circle cx="${r1(c.anchor.x)}" cy="${r1(c.anchor.y)}" r="4" fill="#3A4956" stroke="#FFFFFF" stroke-width="1.5"/>`,
    );
    // Линия от якоря к «локтю» возле подписи.
    parts.push(
      `<line x1="${r1(c.anchor.x)}" y1="${r1(c.anchor.y)}" x2="${r1(elbowX)}" y2="${r1(elbowY)}" stroke="#3A4956" stroke-width="1.4"/>`,
    );
    // Горизонтальная подсечка под подписью.
    parts.push(
      `<line x1="${r1(elbowX)}" y1="${r1(elbowY)}" x2="${r1(c.label.x)}" y2="${r1(elbowY)}" stroke="#3A4956" stroke-width="1.4"/>`,
    );
    // Текст подписи (белая обводка для читабельности на фотореалистичном фоне).
    parts.push(
      `<text x="${r1(textX)}" y="${r1(textY)}" text-anchor="${textAnchor}" `
      + `font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="600" `
      + `fill="#3A4956" paint-order="stroke" stroke="#FFFFFF" stroke-width="3">`
      + `${escapeXml(c.text)}</text>`,
    );
    parts.push("</g>");
  }

  parts.push("</svg>");
  return parts.join("");
}

// ─── Публичная функция ──────────────────────────────────────────────────────

/**
 * Программно наложить SVG-выноски на AI-сгенерированный `Isometric_Render`.
 *
 * @param baseImage  PNG/JPEG-буфер AI-рендера 3D-isometric комнаты.
 * @param layout     Layout_JSON, содержащий координаты мебели в см.
 * @param roomType   Тип помещения (`bedroom` и т. д.). Определяет, какие
 *                   типы мебели считать функциональными (Requirement 9.2).
 *
 * @returns          JPEG-буфер: baseImage + наложенные выноски. Размер кадра
 *                   совпадает с входным изображением.
 *
 * Для типа помещения, у которого нет функциональных типов в
 * `FUNCTIONAL_TYPES_BY_ROOM`, или когда в `Layout_JSON` нет ни одного
 * подходящего предмета, функция всё равно возвращает корректный JPEG —
 * просто без выносок. Это упрощает воркер: он не должен ветвиться на «есть
 * ли смысл вызывать рендер выносок».
 */
export async function composeIsometricWithCallouts(
  baseImage: Buffer,
  layout: LayoutJson,
  roomType: string,
): Promise<Buffer> {
  // Размеры реального изображения определяем через sharp metadata —
  // это гарантирует, что SVG-оверлей будет того же размера и совмещается
  // пиксель-в-пиксель.
  const meta = await sharp(baseImage).metadata();
  const imgWidth = meta.width ?? 1024;
  const imgHeight = meta.height ?? 1024;

  const items = functionalItemsFromLayout(layout, roomType);
  if (items.length === 0) {
    // Нет функциональных предметов — отдаём конвертированный в JPEG ракурс
    // без оверлея. Контракт `Promise<Buffer>` сохраняется.
    return sharp(baseImage).jpeg({ quality: 92, progressive: true }).toBuffer();
  }

  const cal = calibrateProjection(layout, imgWidth, imgHeight);
  const callouts = buildCallouts(items, imgWidth, imgHeight, cal);
  const svg = buildSvg(imgWidth, imgHeight, callouts);
  const svgBuffer = Buffer.from(svg, "utf8");

  return sharp(baseImage)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 92, progressive: true })
    .toBuffer();
}

// ─── Test-only export ───────────────────────────────────────────────────────

/**
 * Внутренние чистые помощники, экспортированные для property-тестов
 * (`__tests__/dizajn/isometric-callouts.property.test.ts`, задача 8.3,
 * Property 17). НЕ использовать вне тестов: они не входят в публичный
 * контракт модуля и могут меняться без предупреждения.
 */
export const __test__ = {
  projectPoint,
  calibrateProjection,
  anchorPointOf,
  buildCallouts,
  functionalItemsFromLayout,
  FUNCTIONAL_TYPES_BY_ROOM,
};
