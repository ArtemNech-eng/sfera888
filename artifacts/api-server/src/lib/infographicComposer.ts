/**
 * Композитор финальной инфографики дизайн-проекта.
 *
 * Берёт AI-сгенерированные фото-ассеты (4 ракурса + 3D-isometric с уже
 * наложенными выносками + 6 detail-кропов) и собирает из них одно большое
 * изображение в стиле ChatGPT-референса юзера: top-row 4 фото + middle
 * (план + 3D + текст) + bottom (решения + 6 кропов).
 *
 * Текст рисуется SVG'ом (через sharp/librsvg) — Russian кириллица должна
 * работать через системные DejaVu Sans на Linux/Railway.
 *
 * Output: JPEG buffer, размер 2048×1366 (3:2).
 *
 * Вид сверху и выноски на 3D-isometric более не зашиты в этом модуле
 * (см. task 8.2 в .kiro/specs/ai-design-product/tasks.md):
 *   • Top_Down_Plan программно отрисовывается в `lib/topDownPlan.ts` из
 *     `Layout_JSON` и приходит сюда уже как PNG-буфер
 *     (`topDownPlanPng`); если буфер не передан — слот занимает
 *     placeholder-SVG с подписью «вид сверху», как и раньше для
 *     не-bedroom типов помещений (Requirement 8.7).
 *   • Выноски на 3D-isometric накладываются на этапе Isometric_Render
 *     через `composeIsometricWithCallouts` из `lib/isometricCallouts.ts`,
 *     поэтому изображение `isometric` приходит сюда уже готовым
 *     (Requirement 9.3).
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

// Floor plan slot (Section A) — координаты сохраняются такими же, как до
// task 8.2, чтобы сама компоновка инфографики не менялась.
const PLAN_W = 480;
const PLAN_H = 400;
const PLAN_X = PAD;
const PLAN_Y = MID_Y + 28;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InfographicInput {
  /** 4 photo views (1024×1024 jpeg buffers from gpt-image-1.5). */
  views: [Buffer, Buffer, Buffer, Buffer];
  /**
   * 3D-isometric jpeg buffer (1024×1024). Приходит уже с наложенными
   * выносками (см. `composeIsometricWithCallouts` из
   * `lib/isometricCallouts.ts`) — этот модуль больше не дорисовывает
   * подписи поверх (Requirement 9.3).
   */
  isometric: Buffer;
  /** 6 detail-crop jpeg buffers (768×768). */
  detailCrops: [Buffer, Buffer, Buffer, Buffer, Buffer, Buffer];

  /** RU label под каждым из 4 фото. */
  viewLabels: [string, string, string, string];
  /** RU label под каждым из 6 кропов. */
  cropLabels: [string, string, string, string, string, string];

  /**
   * Программно отрисованный «вид сверху» в виде PNG-буфера, тот же
   * самый, который сохраняется в `designs.top_down_plan_url` через
   * `lib/topDownPlan.ts`. Если `null`/отсутствует — слот занимает
   * placeholder-SVG (Requirement 8.5, 8.7).
   *
   * Поле опциональное для обратной совместимости с уже существующими
   * вызовами composer'а: старые вызовы без поля продолжают работать
   * через placeholder.
   */
  topDownPlanPng?: Buffer | null;

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

// ─── Top-down floor plan placeholder SVG ────────────────────────────────────

/**
 * Placeholder для слота «вид сверху» — используется ТОЛЬКО когда готовый
 * PNG из `lib/topDownPlan.ts` не передан (например, тип помещения,
 * отличный от `bedroom`, или MVP-fallback при ошибке отрисовки —
 * Requirement 8.5).
 *
 * Размер совпадает с прямоугольником слота (`PLAN_W` × `PLAN_H`), чтобы
 * placeholder не «вылазил» за пределы и общая компоновка 2048×1366
 * оставалась прежней.
 */
function buildFloorPlanPlaceholderSvg(): string {
  return `<rect x="0" y="0" width="${PLAN_W}" height="${PLAN_H}" fill="#F4F1ED" stroke="#8A7B6A" stroke-width="3"/>
          <text x="${PLAN_W / 2}" y="${PLAN_H / 2}" text-anchor="middle" dominant-baseline="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#8A7B6A">Вид сверху</text>`;
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

  // 4. Подготовить «вид сверху»: если в input передан готовый PNG из
  //    `lib/topDownPlan.ts` — масштабируем под слот и кладём как полноценный
  //    composite-слой; если нет — слот заполняется placeholder-SVG в общем
  //    оверлее (см. `buildSvgOverlay`). Requirement 8.7.
  const planCell = input.topDownPlanPng
    ? await sharp(input.topDownPlanPng)
        .resize(PLAN_W, PLAN_H, { fit: "contain", background: "#FFFFFF" })
        .jpeg({ quality: 92 })
        .toBuffer()
    : null;

  // 5. Build SVG overlay for all text + (optional placeholder floor plan) +
  //    captions. Выноски на изометрию более не накладываются здесь —
  //    Requirement 9.3.
  const svg = buildSvgOverlay(input, planCell === null);
  const svgBuffer = Buffer.from(svg);

  // 6. Composite. Layers (bottom-up):
  //    a. White background canvas
  //    b. 4 photos in top row
  //    c. Top_Down_Plan PNG (если есть) в Section A
  //    d. 3D-isometric в middle-center
  //    e. 6 detail crops в bottom-right
  //    f. SVG overlay (текст, captions, table backgrounds, опц. placeholder
  //       плана)
  const composites: sharp.OverlayOptions[] = [];

  // 4 top photos
  for (let i = 0; i < 4; i++) {
    const x = PAD + i * (PHOTO_W + GAP);
    composites.push({ input: photoCells[i]!, left: x, top: TOP_Y });
  }

  // Top_Down_Plan PNG (если передан) в Section A
  if (planCell) {
    composites.push({ input: planCell, left: PLAN_X, top: PLAN_Y });
  }

  // 3D-isometric in middle-left section (right side of left half)
  const isoX = PAD + PLAN_W + GAP;
  const isoY = MID_Y + 20;
  composites.push({ input: isoCell, left: isoX, top: isoY });

  // 6 detail crops in bottom row
  const cropStartX = PAD + BOT_LEFT_W + GAP;
  for (let i = 0; i < 6; i++) {
    const x = cropStartX + i * (CROP_W + GAP);
    composites.push({ input: cropCells[i]!, left: x, top: BOT_Y });
  }

  // SVG overlay (text, captions, table backgrounds, placeholder при необх.).
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

/**
 * Сборка единого SVG-слоя поверх растровых ассетов.
 *
 * @param renderPlanPlaceholder если `true` — вставить placeholder-SVG в
 *   слот «вид сверху» (когда готовый PNG из `topDownPlan.ts` отсутствует);
 *   если `false` — слот уже занят PNG-композитом, поэтому placeholder не
 *   рисуется. Caption «5. Вид сверху...» рисуется в обоих случаях.
 */
function buildSvgOverlay(input: InfographicInput, renderPlanPlaceholder: boolean): string {
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

  // Placeholder для слота «вид сверху» — только когда готовый PNG отсутствует.
  const planPlaceholder = renderPlanPlaceholder
    ? `<g transform="translate(${PLAN_X}, ${PLAN_Y})">${buildFloorPlanPlaceholderSvg()}</g>`
    : "";
  const planCaption = `<text x="${PLAN_X}" y="${PLAN_Y + PLAN_H + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#3A4956">5. Вид сверху с расстановкой мебели</text>`;

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
  <!-- Top-down floor plan placeholder (только если готовый PNG не передан) -->
  ${planPlaceholder}
  ${planCaption}

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
