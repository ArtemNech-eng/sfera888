/**
 * PDF_Renderer для AI_Design_Product (Requirement 13).
 *
 * Стратегия — lazy + R2 cache (Requirement 13.4–13.5):
 *   1. `getOrRenderPdf(designId)` сначала проверяет `designs.pdf_url`.
 *      Если оно непустое и файл лежит в R2 по ключу `dizajn/pdf/{designId}.pdf`,
 *      буфер возвращается без повторного рендера.
 *   2. Иначе — soft-lock через `designs.pdf_rendering_at` (atomic conditional
 *      UPDATE). При гонке проигравший запрос ждёт до 30 секунд, опрашивая
 *      `designs.pdf_url`; если за это время победитель завершил рендер —
 *      буфер скачивается из R2; иначе бросается `PdfRenderError`.
 *   3. Победитель собирает HTML через `buildDesignHtml(design)` (фиксированный
 *      порядок секций, см. Requirement 13.3), рендерит через Puppeteer A4
 *      portrait, грузит в R2, обновляет `designs.pdf_url`, очищает
 *      `pdf_rendering_at`.
 *
 * URL `chestnye-mastera.ru/dizajn/{slug}` показан на обложке и в footer
 * каждой страницы (Requirement 13.7).
 *
 * ── Зависимости рантайма ────────────────────────────────────────────────
 *
 * Модуль использует `puppeteer-core` + `@sparticuz/chromium-min` через
 * динамический import — оба пакета установлены в
 * `artifacts/api-server/package.json`, но загружаются лениво при первом
 * вызове `renderDesignPdf`, чтобы:
 *   • не тащить ~80 МБ Chromium-loader'а в server-bundle (см. build.ts —
 *     `bundleBlocklist` помечает их как external);
 *   • cтартовое время API-сервера не зависело от наличия Chromium-binary;
 *   • при отсутствии `CHROMIUM_REMOTE_PATH` в окружении (см. README
 *     `@sparticuz/chromium-min`) `getOrRenderPdf` бросал `PdfRenderError`
 *     с пояснением, а route `/dizajn/:slug/pdf` отдавал 503 (Requirement
 *     13.6, страница `/dizajn/{slug}` остаётся доступной).
 */

import {
  db,
  designsTable,
  type Design,
  type DesignView,
  type DesignMaterial,
  type DesignEstimateItem,
  type DesignSolution,
  type DesignColorSwatch,
} from "@workspace/db";
import { and, eq, isNull, or, lt, sql } from "drizzle-orm";
import {
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { s3Client } from "./objectStorage.js";
import type { PickedFurnitureRow } from "@workspace/db";

// ─── Constants ──────────────────────────────────────────────────────────

const SOFT_LOCK_TTL_MS = 30_000; // 30s ожидания/удержания (Requirement 13.5)
const SOFT_LOCK_POLL_INTERVAL_MS = 1_500;
const PDF_R2_PREFIX = "dizajn/pdf";
const PDF_CONTENT_TYPE = "application/pdf";

const PUBLIC_BASE_URL = (
  process.env.MARKETPLACE_PUBLIC_URL ??
  "https://chestnye-mastera.ru"
).replace(/\/+$/, "");

const PUBLIC_HOST_FOR_FOOTER = "chestnye-mastera.ru"; // фикс по Requirement 13.7

// ─── Public API ─────────────────────────────────────────────────────────

export class PdfRenderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "PdfRenderError";
    Object.setPrototypeOf(this, PdfRenderError.prototype);
  }
}

/** R2-ключ для PDF одного дизайна. */
export function pdfR2Key(designId: number): string {
  return `${PDF_R2_PREFIX}/${designId}.pdf`;
}

/**
 * Главная точка входа. Идемпотентна: повторный вызов после успешного
 * рендера отдаёт кэшированный буфер из R2.
 */
export async function getOrRenderPdf(designId: number): Promise<Buffer> {
  const bucketId = requireBucketId();
  const key = pdfR2Key(designId);

  // 1. Быстрый путь — есть ли уже PDF в R2.
  const cached = await tryDownloadFromR2(bucketId, key);
  if (cached) return cached;

  // 2. Захват soft-lock'а (atomic conditional UPDATE).
  const acquired = await acquireSoftLock(designId);

  if (!acquired) {
    // Другой запрос уже рендерит — ждём до SOFT_LOCK_TTL_MS, опрашивая R2.
    const waited = await waitForRenderCompletion(designId, bucketId, key);
    if (waited) return waited;
    // Истекло окно ожидания — попробуем перехватить lock у застрявшего.
    const stale = await acquireStaleSoftLock(designId);
    if (!stale) {
      throw new PdfRenderError(
        `pdf rendering busy for design ${designId} (soft-lock stuck)`,
      );
    }
  }

  // 3. Мы держим lock — рендерим, грузим, обновляем designs.pdf_url.
  try {
    const design = await loadDesign(designId);
    const html = buildDesignHtml(design);
    const buffer = await renderDesignPdf(designId, html);
    await uploadPdfToR2(bucketId, key, buffer);
    await db
      .update(designsTable)
      .set({
        pdfUrl: key,
        pdfRenderingAt: null,
        updatedAt: new Date(),
      })
      .where(eq(designsTable.id, designId));
    return buffer;
  } catch (err) {
    // Снимаем lock, чтобы запись не залипала (Requirement 13.6).
    await releaseSoftLock(designId).catch(() => {
      /* swallow — основная ошибка важнее */
    });
    if (err instanceof PdfRenderError) throw err;
    throw new PdfRenderError(
      `failed to render PDF for design ${designId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      err,
    );
  }
}

/**
 * Рендерит уже собранный HTML в PDF A4 portrait через Puppeteer.
 * Footer на каждой странице содержит публичный URL дизайна.
 */
export async function renderDesignPdf(
  designId: number,
  html: string,
): Promise<Buffer> {
  // Динамический импорт через Function-обёртку: TypeScript не пытается
  // резолвить эти модули статически, и сборка не падает, когда они не
  // установлены (см. комментарий в шапке файла).
  let puppeteerLaunch: (
    opts: Record<string, unknown>,
  ) => Promise<PuppeteerBrowser>;
  let chromium: ChromiumModule;
  try {
    const puppeteerMod = (await dynamicImport("puppeteer-core")) as {
      default?: { launch: typeof puppeteerLaunch };
      launch?: typeof puppeteerLaunch;
    };
    const launch = puppeteerMod.default?.launch ?? puppeteerMod.launch;
    if (!launch) throw new Error("puppeteer-core has no `launch` export");
    puppeteerLaunch = launch;

    const chromiumMod = (await dynamicImport("@sparticuz/chromium-min")) as {
      default?: ChromiumModule;
    } & Partial<ChromiumModule>;
    const candidate = chromiumMod.default ?? (chromiumMod as ChromiumModule);
    if (
      !candidate ||
      typeof candidate.executablePath !== "function" ||
      !Array.isArray(candidate.args)
    ) {
      throw new Error(
        "@sparticuz/chromium-min export shape does not match expected API",
      );
    }
    chromium = candidate;
  } catch (err) {
    throw new PdfRenderError(
      "puppeteer-core / @sparticuz/chromium-min not installed; cannot render PDF",
      err,
    );
  }

  const remoteChromium = process.env.CHROMIUM_REMOTE_PATH ?? undefined;

  const browser = await puppeteerLaunch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(remoteChromium),
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    // setContent: HTML собирается локально, image-src в `views[].url` —
    // абсолютные `https://chestnye-mastera.ru/...`, см. `absoluteUrl`.
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "16mm", right: "14mm", bottom: "20mm", left: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: pdfFooterTemplate(designId),
    });

    return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf as Uint8Array);
  } finally {
    await browser.close().catch(() => {
      /* ignore */
    });
  }
}

// ─── Минимальные типы для динамически импортируемых модулей ─────────────

interface ChromiumModule {
  args: string[];
  defaultViewport: unknown;
  headless: boolean | "new";
  executablePath: (path?: string) => Promise<string>;
}

interface PuppeteerPage {
  setContent: (html: string, opts: Record<string, unknown>) => Promise<void>;
  pdf: (opts: Record<string, unknown>) => Promise<Buffer | Uint8Array>;
}

interface PuppeteerBrowser {
  newPage: () => Promise<PuppeteerPage>;
  close: () => Promise<void>;
}

/**
 * Function-обёртка над `import()` — Function-конструктор скрывает строку
 * спецификатора от TypeScript-резолвера, поэтому модуль не должен быть
 * доступен в момент сборки. На рантайме это обычный ES-import.
 */
const dynamicImport: (specifier: string) => Promise<unknown> = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

/**
 * Собирает HTML-документ для PDF-рендера. Порядок секций фиксирован
 * (Requirement 13.3): Cover → Параметры → Top_Down_Plan → Isometric_Render
 * → 6 ракурсов → Color_Palette → Materials → Estimate → Solutions →
 * Furniture. Пустые опциональные секции пропускаются (Requirement 14.4).
 */
export function buildDesignHtml(design: Design): string {
  const slug = design.slug ?? `${design.id}`;
  const designUrl = `${PUBLIC_BASE_URL}/dizajn/${slug}`;
  const title = escape(design.h1 ?? `Дизайн-проект №${design.id}`);

  const views = sortedViews(design.views);
  const heroView = views.find((v) => v.position === 1) ?? views[0] ?? null;
  const isometricView =
    views.find((v) => v.position === 5) ?? null;
  // 6 ракурсов раздела «6 ракурсов» — это позиции 1..6 (исключая 5-й, он
  // отрисовывается отдельной секцией isometric).
  const sixViews = views.filter((v) => v.position !== 5).slice(0, 6);

  const sections: string[] = [];

  // 1. Cover (h1 + Hero_Render + URL дизайна).
  sections.push(coverSection(title, heroView, designUrl));

  // 2. Параметры (room/style/area/budget).
  sections.push(parametersSection(design));

  // 3. Top_Down_Plan.
  if (design.topDownPlanUrl) {
    sections.push(
      imageSection(
        "Вид сверху",
        absoluteUrl(design.topDownPlanUrl),
        "Программно отрисованный план комнаты",
      ),
    );
  }

  // 4. Isometric_Render.
  if (isometricView) {
    sections.push(
      imageSection(
        "Изометрический вид",
        absoluteUrl(isometricView.url),
        isometricView.label || "Isometric_Render",
      ),
    );
  }

  // 5. 6 ракурсов.
  if (sixViews.length > 0) {
    sections.push(viewsGridSection(sixViews));
  }

  // 6. Color_Palette.
  if (design.colorPalette && design.colorPalette.length > 0) {
    sections.push(paletteSection(design.colorPalette));
  }

  // 7. Materials.
  if (design.materials && design.materials.length > 0) {
    sections.push(materialsSection(design.materials));
  }

  // 8. Estimate.
  if (design.estimate && design.estimate.length > 0) {
    sections.push(estimateSection(design.estimate));
  }

  // 9. Solutions.
  if (design.solutions && design.solutions.length > 0) {
    sections.push(solutionsSection(design.solutions));
  }

  // 10. Furniture.
  if (design.pickedFurniture && design.pickedFurniture.length > 0) {
    sections.push(furnitureSection(design.pickedFurniture));
  }

  return wrapHtmlDocument(title, sections.join("\n"), designUrl);
}

// ─── Soft-lock & R2 helpers ─────────────────────────────────────────────

/**
 * Атомарно захватывает soft-lock: ставит pdf_rendering_at = NOW(), но
 * только если он сейчас NULL или старше SOFT_LOCK_TTL_MS.
 *
 * Возвращает true, если lock наш.
 */
async function acquireSoftLock(designId: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - SOFT_LOCK_TTL_MS);
  const updated = await db
    .update(designsTable)
    .set({ pdfRenderingAt: new Date() })
    .where(
      and(
        eq(designsTable.id, designId),
        or(
          isNull(designsTable.pdfRenderingAt),
          lt(designsTable.pdfRenderingAt, cutoff),
        ),
      ),
    )
    .returning({ id: designsTable.id });
  return updated.length > 0;
}

/** Перехват зависшего lock'а после истечения окна ожидания. */
async function acquireStaleSoftLock(designId: number): Promise<boolean> {
  return acquireSoftLock(designId);
}

async function releaseSoftLock(designId: number): Promise<void> {
  await db
    .update(designsTable)
    .set({ pdfRenderingAt: null })
    .where(eq(designsTable.id, designId));
}

/**
 * Опрос `designs.pdf_url` пока не появится результат либо не истечёт
 * SOFT_LOCK_TTL_MS. Возвращает буфер из R2 или null.
 */
async function waitForRenderCompletion(
  designId: number,
  bucketId: string,
  key: string,
): Promise<Buffer | null> {
  const deadline = Date.now() + SOFT_LOCK_TTL_MS;
  while (Date.now() < deadline) {
    await sleep(SOFT_LOCK_POLL_INTERVAL_MS);
    const buf = await tryDownloadFromR2(bucketId, key);
    if (buf) return buf;
    // Дополнительно проверим, что lock держится — если кто-то его снял
    // без записи pdf_url (то есть упал), нет смысла ждать дальше.
    const [row] = await db
      .select({ pdfRenderingAt: designsTable.pdfRenderingAt })
      .from(designsTable)
      .where(eq(designsTable.id, designId))
      .limit(1);
    if (!row?.pdfRenderingAt) return null;
  }
  return null;
}

async function loadDesign(designId: number): Promise<Design> {
  const [row] = await db
    .select()
    .from(designsTable)
    .where(eq(designsTable.id, designId))
    .limit(1);
  if (!row) {
    throw new PdfRenderError(`design ${designId} not found`);
  }
  return row;
}

async function tryDownloadFromR2(
  bucketId: string,
  key: string,
): Promise<Buffer | null> {
  try {
    // HEAD достаточно дёшев и проверяет наличие до загрузки тела.
    await s3Client.send(
      new HeadObjectCommand({ Bucket: bucketId, Key: key }),
    );
  } catch {
    return null;
  }
  try {
    const resp = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketId, Key: key }),
    );
    const body = resp.Body;
    if (!body) return null;
    return await streamToBuffer(body);
  } catch {
    return null;
  }
}

async function uploadPdfToR2(
  bucketId: string,
  key: string,
  buffer: Buffer,
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketId,
      Key: key,
      Body: buffer,
      ContentType: PDF_CONTENT_TYPE,
      CacheControl: "private, max-age=3600",
    }),
  );
}

function requireBucketId(): string {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new PdfRenderError(
      "DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set; cannot cache PDF in R2",
    );
  }
  return bucketId;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  // Smithy SDK stream wrapper
  if (
    body &&
    typeof (body as { transformToByteArray?: unknown })
      .transformToByteArray === "function"
  ) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }
  // Node Readable
  if (body && typeof (body as { pipe?: unknown }).pipe === "function") {
    const stream = body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  // Web ReadableStream
  if (
    body &&
    typeof (body as { getReader?: unknown }).getReader === "function"
  ) {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks.map((u) => Buffer.from(u)));
  }
  return Buffer.from([]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// Suppress unused-import warning in some build configs (sql is reserved
// for future ad-hoc queries; keep the import to ease iteration).
void sql;

// ─── HTML composition helpers ──────────────────────────────────────────

const ROOM_LABELS: Record<string, string> = {
  bedroom: "Спальня",
  kitchen: "Кухня",
  bathroom: "Ванная",
  living_room: "Гостиная",
  hallway: "Прихожая",
  apartment: "Квартира",
  nursery: "Детская",
};

const STYLE_LABELS: Record<string, string> = {
  modern: "Современный",
  scandinavian: "Скандинавский",
  loft: "Лофт",
  minimalism: "Минимализм",
  neoclassic: "Неоклассика",
  japandi: "Японди",
  classic: "Классический",
};

const ESTIMATE_CATEGORY_ORDER = [
  "Отделочные материалы",
  "Мебель",
  "Работы",
  "Прочие расходы",
];

function sortedViews(views: DesignView[] | null | undefined): DesignView[] {
  if (!views || views.length === 0) return [];
  return [...views].sort((a, b) => a.position - b.position);
}

/**
 * Преобразует относительный URL вида `/api/marketplace/dizajn/img/...`
 * в абсолютный `https://chestnye-mastera.ru/api/marketplace/dizajn/img/...`,
 * чтобы Puppeteer мог его загрузить при `page.setContent`.
 * Абсолютные URL и data: остаются как есть.
 */
function absoluteUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${PUBLIC_BASE_URL}${url}`;
  return `${PUBLIC_BASE_URL}/${url}`;
}

function escape(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRub(rub: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(rub)));
}

function kopeksToRub(kopeks: number): number {
  return Math.round(kopeks / 100);
}

function roomLabel(roomType: string): string {
  return ROOM_LABELS[roomType] ?? roomType;
}

function styleLabel(style: string): string {
  return STYLE_LABELS[style] ?? style;
}

// ── Sections ──────────────────────────────────────────────────────────

function coverSection(
  titleHtml: string,
  hero: DesignView | null,
  designUrl: string,
): string {
  const heroImg = hero
    ? `<img class="cover-hero" src="${escape(absoluteUrl(hero.url))}" alt="${escape(hero.label)}" />`
    : `<div class="cover-hero cover-hero-empty"></div>`;
  return `
<section class="page cover">
  <div class="cover-eyebrow">AI-дизайн-проект</div>
  <h1 class="cover-title">${titleHtml}</h1>
  ${heroImg}
  <div class="cover-url">${escape(designUrl)}</div>
</section>`;
}

function parametersSection(design: Design): string {
  const rows: Array<[string, string]> = [];
  rows.push(["Тип помещения", roomLabel(design.roomType)]);
  rows.push(["Стиль", styleLabel(design.style)]);
  if (design.area) {
    rows.push(["Площадь", `${escape(String(design.area))} м²`]);
  }
  if (design.budget) {
    rows.push(["Бюджет", `${formatRub(design.budget)} ₽`]);
  }
  if (design.durationWeeks) {
    rows.push(["Срок", `${design.durationWeeks} нед.`]);
  }

  const tbody = rows
    .map(
      ([k, v]) =>
        `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`,
    )
    .join("");

  return `
<section class="page section">
  <h2 class="section-title">Параметры проекта</h2>
  <table class="params"><tbody>${tbody}</tbody></table>
</section>`;
}

function imageSection(
  title: string,
  imgUrl: string,
  caption?: string,
): string {
  return `
<section class="page section">
  <h2 class="section-title">${escape(title)}</h2>
  <figure class="single-figure">
    <img src="${escape(imgUrl)}" alt="${escape(title)}" />
    ${caption ? `<figcaption>${escape(caption)}</figcaption>` : ""}
  </figure>
</section>`;
}

function viewsGridSection(views: DesignView[]): string {
  const cells = views
    .map(
      (v, idx) => `
    <figure class="view-cell">
      <img src="${escape(absoluteUrl(v.url))}" alt="${escape(v.label)}" />
      <figcaption>${idx + 1}. ${escape(v.label)}</figcaption>
    </figure>`,
    )
    .join("");

  return `
<section class="page section">
  <h2 class="section-title">Ракурсы</h2>
  <div class="views-grid">${cells}</div>
</section>`;
}

function paletteSection(palette: DesignColorSwatch[]): string {
  const cells = palette
    .map((c) => {
      const hex = escape(c.hex);
      const name = c.name ? escape(c.name) : hex;
      return `
    <div class="swatch">
      <div class="swatch-color" style="background:${hex}"></div>
      <div class="swatch-meta">
        <div class="swatch-hex">${hex}</div>
        <div class="swatch-name">${name}</div>
      </div>
    </div>`;
    })
    .join("");

  return `
<section class="page section">
  <h2 class="section-title">Цветовая палитра</h2>
  <div class="palette">${cells}</div>
</section>`;
}

function materialsSection(materials: DesignMaterial[]): string {
  const rows = materials
    .map(
      (m) =>
        `<tr><th>${escape(m.category)}</th><td>${escape(m.description)}</td></tr>`,
    )
    .join("");
  return `
<section class="page section">
  <h2 class="section-title">Отделочные материалы</h2>
  <table class="materials"><tbody>${rows}</tbody></table>
</section>`;
}

function estimateSection(estimate: DesignEstimateItem[]): string {
  const sortedKey = (cat: string): number => {
    const idx = ESTIMATE_CATEGORY_ORDER.indexOf(cat);
    return idx === -1 ? ESTIMATE_CATEGORY_ORDER.length : idx;
  };
  const sorted = [...estimate].sort(
    (a, b) => sortedKey(a.category) - sortedKey(b.category),
  );
  const rows = sorted
    .map(
      (e) =>
        `<tr><th>${escape(e.category)}</th><td>${formatRub(kopeksToRub(e.amountKopeks))} ₽</td></tr>`,
    )
    .join("");
  const total = sorted.reduce((s, e) => s + e.amountKopeks, 0);
  return `
<section class="page section">
  <h2 class="section-title">Смета</h2>
  <table class="estimate">
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><th>Итого</th><td>${formatRub(kopeksToRub(total))} ₽</td></tr>
    </tfoot>
  </table>
  <p class="estimate-note">Ориентир по средним ценам</p>
</section>`;
}

function solutionsSection(solutions: DesignSolution[]): string {
  const items = solutions
    .map((s) => `<li>${escape(s.text)}</li>`)
    .join("");
  return `
<section class="page section">
  <h2 class="section-title">Дизайн-решения</h2>
  <ol class="solutions">${items}</ol>
</section>`;
}

function furnitureSection(items: PickedFurnitureRow[]): string {
  const cards = items
    .map((f) => {
      const isMissing = !f.sku;
      const name = isMissing
        ? "Уточняется"
        : escape(f.name ?? "Без названия");
      const typeLabel = f.type ? escape(f.type) : "";
      const priceCell = isMissing
        ? "—"
        : `${formatRub(kopeksToRub(f.pricePaidKopeks ?? 0))} ₽`;
      const imgCell = f.imageUrl
        ? `<img src="${escape(absoluteUrl(f.imageUrl))}" alt="${name}" />`
        : `<div class="furniture-thumb-empty"></div>`;
      const partner = f.partnerUrl
        ? `<div class="furniture-link">${escape(f.partnerUrl)}</div>`
        : "";
      return `
    <div class="furniture-card${isMissing ? " furniture-card-missing" : ""}">
      <div class="furniture-thumb">${imgCell}</div>
      <div class="furniture-meta">
        <div class="furniture-name">${name}</div>
        ${typeLabel ? `<div class="furniture-brand">${typeLabel}</div>` : ""}
        <div class="furniture-price">${priceCell}</div>
        ${partner}
      </div>
    </div>`;
    })
    .join("");
  return `
<section class="page section">
  <h2 class="section-title">Подобранная мебель</h2>
  <div class="furniture-grid">${cards}</div>
</section>`;
}

// ── Document wrapper & footer ─────────────────────────────────────────

function wrapHtmlDocument(
  title: string,
  body: string,
  designUrl: string,
): string {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="design-url" content="${escape(designUrl)}" />
  <style>${PDF_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function pdfFooterTemplate(_designId: number): string {
  // page.pdf footerTemplate отрисовывается Puppeteer'ом отдельно от `body`.
  // Поддерживает inline CSS и спец-классы `pageNumber`/`totalPages`.
  return `
<div style="font-size:9px; width:100%; padding:0 14mm; color:#666; font-family: sans-serif; display:flex; justify-content:space-between;">
  <span>${PUBLIC_HOST_FOR_FOOTER}</span>
  <span>Стр. <span class="pageNumber"></span> из <span class="totalPages"></span></span>
</div>`;
}

// Минималистичный CSS, ориентированный на A4 portrait, без внешних шрифтов.
// Следует ритмике публичной страницы /dizajn/{slug}, но проще: одна колонка.
const PDF_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; color: #1a1a1a; font-family: "Helvetica", "Arial", sans-serif; font-size: 11pt; line-height: 1.45; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

.page { page-break-after: always; padding: 0; }
.page:last-of-type { page-break-after: auto; }

.cover { text-align: center; padding-top: 40mm; }
.cover-eyebrow { text-transform: uppercase; letter-spacing: 0.15em; font-size: 9pt; color: #888; margin-bottom: 8mm; }
.cover-title { font-size: 26pt; font-weight: 600; margin: 0 0 12mm; line-height: 1.15; }
.cover-hero { display: block; max-width: 160mm; max-height: 110mm; width: auto; height: auto; margin: 0 auto 12mm; border-radius: 4mm; object-fit: cover; }
.cover-hero-empty { width: 160mm; height: 110mm; background: #f0ece4; }
.cover-url { font-size: 11pt; color: #555; margin-top: 6mm; word-break: break-all; }

.section { padding-top: 6mm; }
.section-title { font-size: 16pt; font-weight: 600; margin: 0 0 6mm; border-bottom: 1px solid #e6e1d8; padding-bottom: 3mm; }

table { border-collapse: collapse; width: 100%; }
.params th, .materials th, .estimate th { text-align: left; font-weight: 600; padding: 2.5mm 3mm; border-bottom: 1px solid #efe9dd; width: 45mm; }
.params td, .materials td, .estimate td { padding: 2.5mm 3mm; border-bottom: 1px solid #efe9dd; }
.estimate tfoot th, .estimate tfoot td { font-weight: 700; border-top: 2px solid #b8a982; }
.estimate-note { font-size: 9pt; color: #888; margin-top: 3mm; }

.single-figure { margin: 0; text-align: center; }
.single-figure img { max-width: 100%; max-height: 200mm; object-fit: contain; border-radius: 3mm; }
.single-figure figcaption { margin-top: 3mm; font-size: 9pt; color: #666; }

.views-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.view-cell { margin: 0; }
.view-cell img { width: 100%; height: 60mm; object-fit: cover; border-radius: 3mm; display: block; }
.view-cell figcaption { font-size: 9pt; color: #555; margin-top: 1.5mm; }

.palette { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4mm; }
.swatch { text-align: center; }
.swatch-color { width: 100%; height: 28mm; border-radius: 2mm; border: 1px solid #e6e1d8; }
.swatch-meta { margin-top: 2mm; }
.swatch-hex { font-family: "Courier New", monospace; font-size: 9pt; color: #444; }
.swatch-name { font-size: 8.5pt; color: #777; margin-top: 0.5mm; }

.solutions { padding-left: 6mm; }
.solutions li { margin-bottom: 2mm; }

.furniture-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.furniture-card { display: flex; gap: 3mm; padding: 3mm; border: 1px solid #e6e1d8; border-radius: 2mm; page-break-inside: avoid; }
.furniture-card-missing { background: #fbfaf6; color: #888; }
.furniture-thumb { flex: 0 0 28mm; }
.furniture-thumb img { width: 28mm; height: 28mm; object-fit: cover; border-radius: 2mm; display: block; }
.furniture-thumb-empty { width: 28mm; height: 28mm; background: #f0ece4; border-radius: 2mm; }
.furniture-meta { flex: 1; min-width: 0; }
.furniture-name { font-weight: 600; font-size: 10.5pt; line-height: 1.25; }
.furniture-brand { font-size: 9pt; color: #777; margin-top: 0.5mm; }
.furniture-price { font-weight: 600; margin-top: 1.5mm; }
.furniture-link { font-size: 8.5pt; color: #555; margin-top: 1mm; word-break: break-all; }
`;
