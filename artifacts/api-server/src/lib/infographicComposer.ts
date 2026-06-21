/**
 * Композитор финальной инфографики дизайн-проекта.
 *
 * Берёт AI-сгенерированные фото-ассеты (4 ракурса + 3D-isometric + 6
 * detail-кропов) и собирает из них одно большое изображение в стиле
 * ChatGPT-референса юзера: top-row 4 фото + middle (план + 3D + текст) +
 * bottom (решения + 6 кропов).
 *
 * Текст рисуется SVG'ом (через sharp/librsvg) — Russian кириллица должна
 * работать через системные DejaVu Sans на Linux/Railway.
 *
 * Output: JPEG buffer, размер 2048×1366 (3:2).
 */

import sharp from "sharp";

// ─── Layout constants ────────────────────────────────────────────────────────

const W = 2048;
const H = 1366;

const PAD = 32; // outer padding
const GAP = 16; // gap between cells

// Top row: 4 photos in horizontal strip (height ~30%)
const TOP_Y = PAD;
const TOP_H = 410; // ~30% of H
const PHOTO_W = Math.floor((W - PAD * 2 - GAP * 3) / 4); // ~485px each
const PHOTO_H = TOP_H - 36; // leave 36px for caption below

// Middle row: floor plan + 3D-isometric (left half) + text blocks (right half)
const MID_Y = TOP_Y + TOP_H + GAP;
const MID_H = 540;
const MID_LEFT_W = Math.floor((W - PAD * 2 - GAP) * 0.55); // 55% width
const MID_RIGHT_W = (W - PAD * 2 - GAP) - MID_LEFT_W;

// Bottom row: solutions list (left) + 6 detail crops (right)
const BOT_Y = MID_Y + MID_H + GAP;
const BOT_H = H - BOT_Y - PAD;
const BOT_LEFT_W = Math.floor((W - PAD * 2 - GAP) * 0.30); // 30% solutions
const BOT_RIGHT_W = (W - PAD * 2 - GAP) - BOT_LEFT_W;
const CROP_W = Math.floor((BOT_RIGHT_W - GAP * 5) / 6);
const CROP_H = BOT_H - 32; // leave 32px for caption

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InfographicInput {
  /** 4 photo views (1024×1024 jpeg buffers from gpt-image-1.5). */
  views: [Buffer, Buffer, Buffer, Buffer];
  /** 3D-isometric jpeg buffer (1024×1024). */
  isometric: Buffer;
  /** 6 detail-crop jpeg buffers (768×768). */
  detailCrops: [Buffer, Buffer, Buffer, Buffer, Buffer, Buffer];

  /** RU label под каждым из 4 фото. */
  viewLabels: [string, string, string, string];
  /** RU label под каждым из 6 кропов. */
  cropLabels: [string, string, string, string, string, string];

  design: {
    roomType: string;
    area: number | null;
    style: string;
    budget: number | null;
    durationWeeks: number | null;
    materials: Array<{ category: string; description: string }>;
    estimate: Array<{ category: string; amountKopeks: number }>;
    colorPalette: Array<{ hex: string; name?: string | null }>;
    solutions: Array<{ text: string }>;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STYLE_RU: Record<string, string> = {
  modern: "Современный",
  scandinavian: "Скандинавский",
  loft: "Лофт",
  minimalism: "Минимализм",
  neoclassic: "Неоклассика",
  japandi: "Современный минимализм с элементами Japandi",
  classic: "Классический",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRub(rub: number): string {
  return Math.round(rub).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

// ─── Top-down floor plan SVG (per roomType) ─────────────────────────────────

/**
 * Генерирует SVG-схему вида сверху для bedroom 14-16 м². Размер 480×400
 * (под Section A в middle-left). Простая иллюстрация с прямоугольниками
 * для мебели — не AI, а программная отрисовка.
 */
function buildFloorPlanSvg(roomType: string, _area: number | null): string {
  // Для теста — статичный bedroom layout. Для других room types можно
  // расширить (kitchen / bathroom / living_room).
  if (roomType !== "bedroom") {
    // Generic placeholder
    return `<rect x="0" y="0" width="480" height="400" fill="#F4F1ED" stroke="#8A7B6A" stroke-width="3"/>
            <text x="240" y="200" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#8A7B6A">Вид сверху</text>`;
  }

  // Bedroom 14-16 м² — simplified top-down with bed centered, wardrobe along
  // one wall, desk by window. Reference layout matches user's ChatGPT image.
  return `
    <!-- Room walls -->
    <rect x="20" y="20" width="440" height="360" fill="#F4F1ED" stroke="#3A4956" stroke-width="3"/>
    <!-- Door (left wall) -->
    <line x1="20" y1="60" x2="20" y2="140" stroke="#FFFFFF" stroke-width="6"/>
    <path d="M 20 60 Q 60 60 60 100" fill="none" stroke="#3A4956" stroke-width="1.5" stroke-dasharray="3,3"/>
    <!-- Window (top wall) -->
    <line x1="180" y1="20" x2="300" y2="20" stroke="#94B0C2" stroke-width="6"/>
    <!-- Bed (center) -->
    <rect x="170" y="120" width="140" height="180" fill="#E2D6C5" stroke="#8A7B6A" stroke-width="2"/>
    <rect x="180" y="135" width="50" height="40" fill="#FFFFFF" stroke="#8A7B6A" stroke-width="1"/>
    <rect x="250" y="135" width="50" height="40" fill="#FFFFFF" stroke="#8A7B6A" stroke-width="1"/>
    <!-- Bedside tables -->
    <rect x="125" y="125" width="35" height="50" fill="#C9B59A" stroke="#8A7B6A" stroke-width="1.5"/>
    <rect x="320" y="125" width="35" height="50" fill="#C9B59A" stroke="#8A7B6A" stroke-width="1.5"/>
    <!-- Built-in wardrobe (right wall) -->
    <rect x="380" y="40" width="80" height="200" fill="#A8927A" stroke="#8A7B6A" stroke-width="2"/>
    <line x1="420" y1="40" x2="420" y2="240" stroke="#FFFFFF" stroke-width="1"/>
    <!-- Desk (top, by window) -->
    <rect x="60" y="40" width="120" height="40" fill="#C9B59A" stroke="#8A7B6A" stroke-width="1.5"/>
    <!-- Chair -->
    <circle cx="100" cy="100" r="14" fill="#E2D6C5" stroke="#8A7B6A" stroke-width="1.5"/>
    <!-- Rug -->
    <rect x="140" y="280" width="200" height="80" fill="none" stroke="#C9B59A" stroke-width="2" stroke-dasharray="5,3"/>
  `;
}

// ─── 3D-isometric callouts SVG overlay ──────────────────────────────────────

/**
 * Выноски (callouts) к 3D-isometric: линии-стрелки от точек на изображении
 * до подписей мебели. Координаты hardcoded для bedroom — предполагаем что
 * AI поместит мебель в типичных местах. На референсе: «Рабочее место у
 * окна», «Прикроватные тумбы», «Двуспальная кровать», «Встроенный шкаф».
 */
function buildIsometricCalloutsSvg(roomType: string): string {
  if (roomType !== "bedroom") return "";

  // 3D-isometric image area: 560×420 (bedroom layout assumed)
  return `
    <!-- "Рабочее место у окна" — top-left of isometric -->
    <line x1="155" y1="80" x2="245" y2="80" stroke="#3A4956" stroke-width="1.2"/>
    <text x="148" y="76" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">Рабочее место</text>
    <text x="148" y="92" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">у окна</text>

    <!-- "Прикроватные тумбы" — middle-left -->
    <line x1="135" y1="220" x2="220" y2="220" stroke="#3A4956" stroke-width="1.2"/>
    <text x="128" y="216" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">Прикроватные</text>
    <text x="128" y="232" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">тумбы</text>

    <!-- "Двуспальная кровать" — middle-bottom -->
    <line x1="155" y1="320" x2="280" y2="280" stroke="#3A4956" stroke-width="1.2"/>
    <text x="148" y="316" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">Двуспальная</text>
    <text x="148" y="332" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">кровать</text>

    <!-- "Встроенный шкаф" — middle-right -->
    <line x1="430" y1="180" x2="370" y2="180" stroke="#3A4956" stroke-width="1.2"/>
    <text x="438" y="176" text-anchor="start" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">Встроенный</text>
    <text x="438" y="192" text-anchor="start" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">шкаф</text>
  `;
}

// ─── Text block builders ────────────────────────────────────────────────────

/** Format style label for display. */
function formatStyle(style: string): string {
  return STYLE_RU[style] ?? style;
}

function buildParamsSvg(input: InfographicInput, x: number, y: number, width: number): string {
  const d = input.design;
  const rows = [
    `Площадь помещения: ${d.area ?? "—"} м²`,
    `Стиль: ${formatStyle(d.style)}`,
    `Бюджет: до ${d.budget ? formatRub(d.budget) + " ₽" : "—"}`,
    `Сроки реализации: ${d.durationWeeks ?? "—"} недель`,
  ];
  let svg = `
    <text x="${x}" y="${y + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" letter-spacing="1.2" fill="#3A4956">ПАРАМЕТРЫ ПРОЕКТА</text>
  `;
  rows.forEach((row, i) => {
    svg += `<text x="${x}" y="${y + 50 + i * 24}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#5C6975">${escapeXml(row)}</text>`;
  });
  return svg;
}

function buildPaletteSvg(input: InfographicInput, x: number, y: number, _width: number): string {
  const swatches = input.design.colorPalette.slice(0, 5);
  let svg = `<text x="${x}" y="${y + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" letter-spacing="1.2" fill="#3A4956">ЦВЕТОВАЯ ПАЛИТРА</text>`;
  swatches.forEach((sw, i) => {
    const cx = x + 28 + i * 64;
    svg += `<circle cx="${cx}" cy="${y + 70}" r="24" fill="${escapeXml(sw.hex)}" stroke="#8A7B6A" stroke-width="1"/>`;
  });
  return svg;
}

function buildMaterialsTableSvg(input: InfographicInput, x: number, y: number, width: number): string {
  const rows = input.design.materials.slice(0, 6);
  let svg = `<text x="${x}" y="${y + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" letter-spacing="1.2" fill="#3A4956">РЕКОМЕНДУЕМЫЕ МАТЕРИАЛЫ</text>`;
  const col1W = Math.floor(width * 0.32);
  const rowH = 28;
  const startY = y + 36;
  rows.forEach((m, i) => {
    const ry = startY + i * rowH;
    if (i % 2 === 1) {
      svg += `<rect x="${x}" y="${ry}" width="${width}" height="${rowH}" fill="#FAF7F2"/>`;
    }
    svg += `<text x="${x + 8}" y="${ry + 19}" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#3A4956">${escapeXml(m.category)}</text>`;
    svg += `<text x="${x + col1W}" y="${ry + 19}" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#5C6975">${escapeXml(m.description.slice(0, 50))}</text>`;
  });
  return svg;
}

function buildEstimateTableSvg(input: InfographicInput, x: number, y: number, width: number): string {
  const rows = input.design.estimate.slice(0, 6);
  const total = rows.reduce((s, e) => s + e.amountKopeks, 0);
  const totalRub = Math.round(total / 100);
  const budget = input.design.budget;
  const headerSuffix = budget ? ` (до ${formatRub(budget)} ₽)` : "";
  let svg = `<text x="${x}" y="${y + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" letter-spacing="1.2" fill="#3A4956">СМЕТА РЕАЛИЗАЦИИ${escapeXml(headerSuffix)}</text>`;
  const rowH = 26;
  const startY = y + 36;
  rows.forEach((e, i) => {
    const ry = startY + i * rowH;
    if (i % 2 === 1) {
      svg += `<rect x="${x}" y="${ry}" width="${width}" height="${rowH}" fill="#FAF7F2"/>`;
    }
    svg += `<text x="${x + 8}" y="${ry + 18}" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#3A4956">${escapeXml(e.category)}</text>`;
    svg += `<text x="${x + width - 8}" y="${ry + 18}" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#5C6975">${formatRub(Math.round(e.amountKopeks / 100))} ₽</text>`;
  });
  // Total row
  const tryY = startY + rows.length * rowH + 4;
  svg += `<rect x="${x}" y="${tryY}" width="${width}" height="${rowH}" fill="#E8DFD0"/>`;
  svg += `<text x="${x + 8}" y="${tryY + 18}" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#3A4956">Итого:</text>`;
  svg += `<text x="${x + width - 8}" y="${tryY + 18}" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#3A4956">${formatRub(totalRub)} ₽</text>`;
  return svg;
}

function buildSolutionsSvg(input: InfographicInput, x: number, y: number, width: number): string {
  const rows = input.design.solutions.slice(0, 5);
  let svg = `<text x="${x}" y="${y + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" letter-spacing="1.2" fill="#3A4956">ОСНОВНЫЕ РЕШЕНИЯ</text>`;
  rows.forEach((s, i) => {
    const ry = y + 50 + i * 36;
    // bullet
    svg += `<circle cx="${x + 6}" cy="${ry - 6}" r="3" fill="#D9342B"/>`;
    // wrap text manually at ~50 chars
    const text = s.text.length > 80 ? s.text.slice(0, 78) + "…" : s.text;
    const lines = wrapText(text, Math.floor(width / 8));
    lines.slice(0, 2).forEach((line, li) => {
      svg += `<text x="${x + 18}" y="${ry + li * 18}" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#5C6975">${escapeXml(line)}</text>`;
    });
  });
  return svg;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Main composer ───────────────────────────────────────────────────────────

export async function composeInfographic(input: InfographicInput): Promise<Buffer> {
  // 1. Resize / crop photos to fit cells.
  const photoCells = await Promise.all(
    input.views.map((buf) =>
      sharp(buf).resize(PHOTO_W, PHOTO_H, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer(),
    ),
  );

  // 2. Resize 3D-isometric to fit center cell (560×420 within MID_LEFT).
  const ISO_W = 560;
  const ISO_H = 420;
  const isoCell = await sharp(input.isometric).resize(ISO_W, ISO_H, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();

  // 3. Resize 6 detail crops (square, fit cell width).
  const cropSizeW = CROP_W;
  const cropSizeH = CROP_H;
  const cropCells = await Promise.all(
    input.detailCrops.map((buf) =>
      sharp(buf).resize(cropSizeW, cropSizeH, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer(),
    ),
  );

  // 4. Build SVG overlay for all text + floor plan + callouts + captions.
  const svg = buildSvgOverlay(input);
  const svgBuffer = Buffer.from(svg);

  // 5. Composite. Layers (bottom-up):
  //    a. White background canvas
  //    b. 4 photos in top row
  //    c. 3D-isometric in middle-center
  //    d. 6 detail crops in bottom-right
  //    e. SVG overlay (floor plan, callouts, all text, captions, table backgrounds)
  const composites: sharp.OverlayOptions[] = [];

  // 4 top photos
  for (let i = 0; i < 4; i++) {
    const x = PAD + i * (PHOTO_W + GAP);
    composites.push({ input: photoCells[i]!, left: x, top: TOP_Y });
  }

  // 3D-isometric in middle-left section (right side of left half)
  const PLAN_W = 480;
  const isoX = PAD + PLAN_W + GAP;
  const isoY = MID_Y + 20;
  composites.push({ input: isoCell, left: isoX, top: isoY });

  // 6 detail crops in bottom row
  const cropStartX = PAD + BOT_LEFT_W + GAP;
  for (let i = 0; i < 6; i++) {
    const x = cropStartX + i * (CROP_W + GAP);
    composites.push({ input: cropCells[i]!, left: x, top: BOT_Y });
  }

  // SVG overlay (text, floor plan, captions, table backgrounds, callouts).
  composites.push({ input: svgBuffer, left: 0, top: 0 });

  return sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 92, progressive: true })
    .toBuffer();
}

function buildSvgOverlay(input: InfographicInput): string {
  // Photo captions (top row)
  let captions = "";
  for (let i = 0; i < 4; i++) {
    const cx = PAD + i * (PHOTO_W + GAP) + 16;
    const cy = TOP_Y + PHOTO_H + 24;
    captions += `<text x="${cx}" y="${cy}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">${escapeXml(`${i + 1}. ${input.viewLabels[i]}`)}</text>`;
  }

  // Detail crop captions (bottom row)
  let cropCaptions = "";
  const cropStartX = PAD + BOT_LEFT_W + GAP;
  for (let i = 0; i < 6; i++) {
    const cx = cropStartX + i * (CROP_W + GAP) + 4;
    const cy = BOT_Y + CROP_H + 22;
    const lines = wrapText(input.cropLabels[i]!, 14);
    lines.slice(0, 1).forEach((line) => {
      cropCaptions += `<text x="${cx}" y="${cy}" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#5C6975">${escapeXml(line)}</text>`;
    });
  }

  // Top-down floor plan (Section A)
  const PLAN_W = 480;
  const PLAN_X = PAD;
  const PLAN_Y = MID_Y + 28;
  const planSvg = buildFloorPlanSvg(input.design.roomType, input.design.area);
  const planCaption = `<text x="${PLAN_X}" y="${PLAN_Y + 420}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">5. Вид сверху с расстановкой мебели</text>`;

  // 3D-isometric callouts (overlay on top of isoCell)
  const ISO_X = PAD + PLAN_W + GAP;
  const ISO_Y = MID_Y + 20;
  const calloutsSvg = buildIsometricCalloutsSvg(input.design.roomType);
  const calloutsGroup = calloutsSvg
    ? `<g transform="translate(${ISO_X}, ${ISO_Y})">${calloutsSvg}</g>`
    : "";

  // Right-side text blocks (params + palette top, materials + estimate bottom)
  const textX = PAD + MID_LEFT_W + GAP;
  const textW = MID_RIGHT_W;
  const colW = Math.floor((textW - GAP) / 2);
  const params = buildParamsSvg(input, textX, MID_Y, colW);
  const palette = buildPaletteSvg(input, textX + colW + GAP, MID_Y, colW);
  const materials = buildMaterialsTableSvg(input, textX, MID_Y + 180, colW);
  const estimate = buildEstimateTableSvg(input, textX + colW + GAP, MID_Y + 180, colW);

  // Bottom-left solutions
  const solutions = buildSolutionsSvg(input, PAD, BOT_Y, BOT_LEFT_W);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Top-down floor plan -->
  <g transform="translate(${PLAN_X}, ${PLAN_Y})">
    ${planSvg}
  </g>
  ${planCaption}

  <!-- 3D-isometric callouts -->
  ${calloutsGroup}

  <!-- Photo captions -->
  ${captions}

  <!-- Right text blocks -->
  ${params}
  ${palette}
  ${materials}
  ${estimate}

  <!-- Solutions -->
  ${solutions}

  <!-- Detail crop captions -->
  ${cropCaptions}
</svg>
  `;
}
