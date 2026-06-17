import "server-only";
import type {
  Master,
  MasterStats,
  MasterPortfolioItem,
  RabotyDetailResponse,
  RabotyListItem,
  Service,
  City,
  ServiceCityResponse,
} from "./types";

/**
 * Auto-generated SEO meta builders for all marketplace page types.
 *
 * Plan: see MARKETPLACE_PRODUCTION_PLAN.md §11.8.
 *
 * Strategy: high-cardinality template cascades (NOT AI-generation).
 * Each builder picks the FIRST template whose required fields are present,
 * falling back to safer simpler variants. Override via operator/master-set
 * `seoTitle`/`seoDescription` on the underlying entity always wins.
 *
 * All functions are pure — no DB calls, no I/O. Just data → string.
 *
 * Sizing rules (per §11.8.5):
 *   - title  : 30-70 chars; suffix " — Честные мастера" if too short;
 *              ellipsis-truncate if too long.
 *   - description: 120-180 chars; pad with fallback if too short;
 *              ellipsis-truncate at word boundary if too long.
 */

const SITE_NAME = "Честные мастера";
const TITLE_SUFFIX = ` — ${SITE_NAME}`;
const TITLE_MIN = 30;
const TITLE_MAX = 70;
const DESC_MIN = 120;
const DESC_MAX = 180;

// ─────────────────────────────────────────────────────────────────────────────
// Sanitisers and length helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strip markdown / HTML / collapse whitespace. Safe to embed in <title>/<meta>. */
export function sanitizeText(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/<[^>]+>/g, " ")               // strip HTML tags
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")  // strip markdown images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // unwrap markdown links
    .replace(/[*_`#>]+/g, " ")              // strip markdown formatting marks
    .replace(/\r\n|\r|\n/g, " ")            // newlines → space
    .replace(/\s+/g, " ")                   // collapse whitespace
    .trim();
}

/** Truncate `s` at the last word boundary ≤ max chars; appends "…" when cut. */
export function truncateAtWord(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  // If there's no space within the window (very long word), hard-cut.
  const cut = lastSpace > Math.floor(max * 0.6) ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[\s,.;:—\-–]+$/g, "") + "…";
}

/** Apply title rules: pad with site suffix when too short; truncate when too long. */
export function normalizeTitle(s: string): string {
  const clean = sanitizeText(s);
  if (clean.length === 0) return SITE_NAME;
  if (clean.length < TITLE_MIN) return clean + TITLE_SUFFIX;
  if (clean.length > TITLE_MAX) return truncateAtWord(clean, TITLE_MAX);
  return clean;
}

/** Apply description rules: pad if too short, truncate at word boundary if too long. */
export function normalizeDescription(s: string, padding: string = ""): string {
  const clean = sanitizeText(s);
  if (clean.length === 0) return padding ? sanitizeText(padding) : `${SITE_NAME} — мастера для ремонта в вашем городе. Заявка онлайн, без звонков.`;
  if (clean.length > DESC_MAX) return truncateAtWord(clean, DESC_MAX);
  if (clean.length < DESC_MIN && padding) {
    const padded = `${clean} ${sanitizeText(padding)}`.replace(/\s+/g, " ").trim();
    return padded.length > DESC_MAX ? truncateAtWord(padded, DESC_MAX) : padded;
  }
  return clean;
}

/** Extract first 1-2 sentences (or the head) of a longer body. */
export function extractFirstSentences(text: string, maxChars: number = 130): string {
  if (!text) return "";
  const clean = sanitizeText(text);
  // Try to break at the first period/question/exclamation followed by space.
  const m = clean.match(/^(.+?[.!?])\s/);
  if (m && m[1].length <= maxChars) return m[1];
  return truncateAtWord(clean, maxChars);
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric / rating formatters
// ─────────────────────────────────────────────────────────────────────────────

export function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

export function ratingValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatRating(value: string | null | undefined): string | null {
  const n = ratingValue(value);
  return n != null ? n.toFixed(1) : null;
}

export function pluralYears(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "лет";
  if (m10 === 1) return "год";
  if (m10 >= 2 && m10 <= 4) return "года";
  return "лет";
}

export function pluralReviews(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "отзывов";
  if (m10 === 1) return "отзыв";
  if (m10 >= 2 && m10 <= 4) return "отзыва";
  return "отзывов";
}

export function pluralOrders(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "заказов";
  if (m10 === 1) return "заказ";
  if (m10 >= 2 && m10 <= 4) return "заказа";
  return "заказов";
}

export function pluralWorks(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "работ";
  if (m10 === 1) return "работа";
  if (m10 >= 2 && m10 <= 4) return "работы";
  return "работ";
}

export function pickMasterDisplayName(m: { publicTitle: string | null; alias: string | null; id: number }): string {
  const publicTitle = m.publicTitle?.trim();
  if (publicTitle) return publicTitle;
  const alias = m.alias?.trim();
  if (alias) return alias;
  return `Мастер #${m.id}`;
}

/**
 * Pick the first specialization. Used in master meta when there's no
 * explicit single specialization field.
 */
function firstService(specs: string[] | null | undefined): string | null {
  if (!specs || specs.length === 0) return null;
  const first = specs[0]?.trim();
  return first || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Master profile meta
// ─────────────────────────────────────────────────────────────────────────────

export interface BuiltMeta {
  title: string;
  description: string;
}

/**
 * Build SEO meta for `/master/[slug]`.
 *
 * Override priority (per §11.8.4):
 *   1. master.seoTitle / master.seoDescription (operator-set via CRM, master-set via PWA)
 *   2. Auto-generated cascade
 *
 * Note: master.seoTitle/seoDescription is exposed on the public DTO since
 * the marketplace tab in CRM ships them. We treat empty strings as absent.
 */
export function buildMasterMeta(master: Master, stats: MasterStats): BuiltMeta {
  const overrideTitle = sanitizeText((master as any).seoTitle ?? null);
  const overrideDesc = sanitizeText((master as any).seoDescription ?? null);

  const name = pickMasterDisplayName(master);
  const city = master.city?.trim() ?? null;
  const service = firstService(master.specializations) ?? master.specialization?.trim() ?? null;
  const rating = formatRating(master.publicRating ?? master.rating);
  const ratingNum = ratingValue(master.publicRating ?? master.rating);
  const reviews = master.publicReviewsCount ?? 0;
  const years = master.yearsExperience ?? null;
  const completed = stats.completedOrders ?? 0;

  // ── Title cascade ──────────────────────────────────────────────────────
  let title: string;
  if (overrideTitle) {
    title = overrideTitle;
  } else if (service && city && rating && ratingNum && ratingNum >= 4.5 && reviews >= 3) {
    title = `${name} — ${service} в ${city}, ★${rating} (${reviews} ${pluralReviews(reviews)})`;
  } else if (service && city && years && years >= 5) {
    title = `${name} — ${service} в ${city}, ${years} ${pluralYears(years)} опыта`;
  } else if (service && city && completed >= 10) {
    title = `${name} — ${service} в ${city}, ${completed} ${pluralOrders(completed)}`;
  } else if (service && city) {
    title = `${name} — мастер по ${service.toLowerCase()} в ${city}`;
  } else if (city) {
    title = `${name} — мастер в ${city}`;
  } else {
    title = `${name} — мастер на платформе ${SITE_NAME}`;
  }

  // ── Description cascade ────────────────────────────────────────────────
  let description: string;
  if (overrideDesc) {
    description = overrideDesc;
  } else if (master.publicBio && sanitizeText(master.publicBio).length >= 100) {
    const head = extractFirstSentences(master.publicBio, 130);
    const tail = rating && reviews > 0
      ? ` ★${rating}, ${city ?? "мастер"}.`
      : city ? ` ${city}.` : "";
    description = `${head}${tail}`;
  } else if (master.servicePrices && master.servicePrices.length > 0) {
    const top = master.servicePrices.slice(0, 3).map((p) => p.service).join(", ");
    const minPrice = Math.min(...master.servicePrices.map((p) => p.priceFrom));
    const cityPart = city ? ` ${city}.` : "";
    const reviewsPart = reviews > 0 ? ` ${reviews} ${pluralReviews(reviews)}.` : "";
    description = `Услуги: ${top}.${cityPart} Цены от ${formatNumber(minPrice)} ₽.${reviewsPart}`;
  } else if (service && city) {
    const ratingPart = rating ? ` Рейтинг ${rating}.` : "";
    description = `${name}, мастер по ${service.toLowerCase()} в ${city}.${ratingPart} Заявка онлайн без звонков.`;
  } else {
    description = `${name} — мастер на платформе «${SITE_NAME}». ${city ? `Работает в ${city}. ` : ""}Заявка онлайн, перезвоним в течение часа.`;
  }

  return {
    title: normalizeTitle(title),
    description: normalizeDescription(
      description,
      `${SITE_NAME} — найдите мастера для ремонта.`,
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio case meta — /raboty/[slug]
// ─────────────────────────────────────────────────────────────────────────────

export function buildCaseMeta(
  portfolio: RabotyDetailResponse["portfolio"],
  master: Master,
): BuiltMeta {
  const overrideTitle = sanitizeText((portfolio as any).seoTitle ?? null);
  const overrideDesc = sanitizeText((portfolio as any).seoDescription ?? null);

  const masterName = pickMasterDisplayName(master);
  const masterShort = shortMasterName(masterName);
  const city = portfolio.city?.name ?? master.city ?? null;
  const priceFromNum = portfolio.priceFrom ? parseFloat(portfolio.priceFrom) : null;
  const priceFromOk = Number.isFinite(priceFromNum as number) && (priceFromNum as number) > 0;
  const priceStr = priceFromOk ? `${formatNumber(priceFromNum as number)} ₽` : null;
  const areaNum = portfolio.area ? parseFloat(portfolio.area) : null;
  const areaOk = Number.isFinite(areaNum as number) && (areaNum as number) > 0;

  // ── Title cascade ──────────────────────────────────────────────────────
  let title: string;
  if (overrideTitle) {
    title = overrideTitle;
  } else if (city && priceStr && areaOk) {
    title = `${portfolio.title} в ${city} — ${priceStr}, ${formatNumber(areaNum as number)} м²`;
  } else if (city && priceStr) {
    title = `${portfolio.title} в ${city} — ${priceStr} под ключ`;
  } else if (city && areaOk) {
    title = `${portfolio.title} в ${city} — ${formatNumber(areaNum as number)} м², фото и цена`;
  } else if (priceStr) {
    title = `${portfolio.title} — ${priceStr} от мастера ${masterShort}`;
  } else if (city) {
    title = `${portfolio.title} в ${city} — фото работы и стоимость`;
  } else {
    title = `${portfolio.title} — реальная работа от мастера ${masterShort}`;
  }

  // ── Description cascade ────────────────────────────────────────────────
  let description: string;
  if (overrideDesc) {
    description = overrideDesc;
  } else if (portfolio.description && sanitizeText(portfolio.description).length >= 60) {
    const head = extractFirstSentences(portfolio.description, 120);
    const tail: string[] = [];
    if (priceStr) tail.push(`Цена ${priceStr}`);
    if (areaOk) tail.push(`${formatNumber(areaNum as number)} м²`);
    tail.push(`мастер ${masterShort}`);
    description = `${head} ${tail.join(", ")}.`;
  } else if (priceStr || areaOk) {
    const parts: string[] = [
      `Реальный ремонт от мастера ${masterShort}`,
      city ? `в ${city}` : null,
    ].filter((s): s is string => !!s);
    const meta: string[] = [];
    if (priceStr) meta.push(`цена ${priceStr}`);
    if (areaOk) meta.push(`площадь ${formatNumber(areaNum as number)} м²`);
    description = `${parts.join(" ")}. ${meta.join(", ")}. Фото до и после.`;
  } else {
    description = `${portfolio.title} — фото и описание реальной работы от мастера ${masterShort}${city ? ` в ${city}` : ""}.`;
  }

  return {
    title: normalizeTitle(title),
    description: normalizeDescription(
      description,
      `Фото до и после, цена и сроки. ${SITE_NAME}.`,
    ),
  };
}

/** "Иван Петров" → "Иван П.", short form for meta tail. */
function shortMasterName(fullName: string): string {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 0) return trimmed;
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last[0]?.toUpperCase() ?? ""}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service-city meta — /[serviceSlug]/[citySlug]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds meta for the main service-city hub page. Override via service.seoTitle
 * (already used by api-server). This function adds the data-driven enrichments
 * (master count, min price, rating) when the service does not provide its own.
 */
export function buildServiceCityMeta(data: ServiceCityResponse): BuiltMeta {
  // Backend already returns `seo` block with title/description. We just
  // augment when stats are present and the seo block is generic.
  const baseTitle = data.seo.title;
  const baseDesc = data.seo.description;
  const stats = data.stats;
  const cityName = data.city.nameIn ?? data.city.name;

  // Only enrich the title if the operator has not set a custom one.
  const isCustomTitle = !!data.service.seoTitle && data.service.seoTitle.trim().length > 0;
  let title = baseTitle;
  if (!isCustomTitle && stats.mastersCount > 0) {
    const ratingPart = stats.avgRating != null && stats.avgRating > 0 ? ` ★${stats.avgRating.toFixed(1)}` : "";
    const pricePart = stats.minPrice != null && stats.minPrice > 0 ? `, от ${formatNumber(stats.minPrice)} ₽` : "";
    title = `${data.service.h1 ?? data.service.name} в ${cityName}${pricePart}${ratingPart}`;
  }

  // Description: only enrich if operator hasn't set custom.
  const isCustomDesc = !!data.service.seoDescription && data.service.seoDescription.trim().length > 0;
  let description = baseDesc;
  if (!isCustomDesc && stats.mastersCount > 0) {
    const reviewsPart = stats.reviewsCount > 0 ? `, ${stats.reviewsCount} ${pluralReviews(stats.reviewsCount)}` : "";
    const pricePart = stats.minPrice != null && stats.minPrice > 0 ? ` Цены от ${formatNumber(stats.minPrice)} ₽.` : "";
    description = `${stats.mastersCount} ${pluralMasters(stats.mastersCount)} услуги «${data.service.name}» в ${cityName}${reviewsPart}.${pricePart} Заявка онлайн без звонков.`;
  }

  return {
    title: normalizeTitle(title),
    description: normalizeDescription(description, `${SITE_NAME} — мастера в вашем городе.`),
  };
}

function pluralMasters(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "мастеров";
  if (m10 === 1) return "мастер выполняет";
  if (m10 >= 2 && m10 <= 4) return "мастера выполняют";
  return "мастеров выполняют";
}

// ─────────────────────────────────────────────────────────────────────────────
// /raboty hub (the global feed) and filtered hub variants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Title / description for the /raboty global feed (page=1) and pagination.
 */
export function buildRabotyIndexMeta(opts: { total: number; page: number; totalPages: number }): BuiltMeta {
  const { total, page, totalPages } = opts;
  const titleBase = total > 0
    ? `Работы мастеров — ${total} ${pluralWorks(total)} с фото и ценами`
    : `Работы мастеров — фото до и после, цены, сроки`;
  const title = page > 1 && totalPages > 1
    ? `${titleBase} — стр. ${page} из ${totalPages}`
    : titleBase;

  const description = total > 0
    ? `Реальные ремонты от мастеров с ценами и сроками. ${total} ${pluralWorks(total)} с фото до и после. Понравилась работа — оставьте заявку, она уйдёт автору первой.`
    : `Каталог реальных ремонтов от мастеров с ценами, сроками и фото до и после. Скоро здесь будут опубликованы первые работы.`;

  return {
    title: normalizeTitle(title),
    description: normalizeDescription(description, `Фото и цены реальных ремонтов на ${SITE_NAME}.`),
  };
}

/**
 * Title / description for filtered /raboty hubs:
 *   /raboty/[serviceSlug]
 *   /raboty/[serviceSlug]/[citySlug]
 *
 * `service` is required (we use the service name in copy); `city` is optional.
 */
export function buildRabotyHubMeta(opts: {
  service: { name: string; nameGenitive?: string | null };
  city: { name: string; nameIn?: string | null } | null;
  total: number;
  masterCount?: number;
  minPrice?: number | null;
}): BuiltMeta {
  const { service, city, total } = opts;
  const cityIn = city?.nameIn ?? city?.name ?? null;

  const masterPart = opts.masterCount && opts.masterCount > 0 ? ` от ${opts.masterCount} ${pluralMasters(opts.masterCount).replace(/выполня[ею]т/, "").trim()}` : "";
  const pricePart = opts.minPrice != null && opts.minPrice > 0 ? `, цены от ${formatNumber(opts.minPrice)} ₽` : "";

  const title = cityIn
    ? `${service.name} в ${cityIn} — ${total} ${pluralWorks(total)}${masterPart}${pricePart}`
    : `${service.name} — фото и цены реальных работ${masterPart}${pricePart}`;

  const serviceGenitive = service.nameGenitive ?? service.name.toLowerCase();
  const description = cityIn
    ? `Реальные работы по услуге «${serviceGenitive}» в ${cityIn}. Фото до и после, цены, сроки, контакт мастера. ${total} ${pluralWorks(total)} опубликовано.`
    : `Каталог работ по услуге «${serviceGenitive}» от мастеров «${SITE_NAME}». Фото до и после, цены, сроки. Понравилась работа — заявка уйдёт автору первой.`;

  return {
    title: normalizeTitle(title),
    description: normalizeDescription(description, `Фото и цены ремонтов на ${SITE_NAME}.`),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Image alt-text generators (§11.8.10)
// ─────────────────────────────────────────────────────────────────────────────

export function buildPortfolioImageAlt(
  portfolio: { title: string; city?: { name: string } | null },
  type: "before" | "after" | "progress",
  index: number,
): string {
  const typeLabel = type === "before" ? "до ремонта" : type === "after" ? "после ремонта" : "в процессе работы";
  const cityPart = portfolio.city?.name ? ` в ${portfolio.city.name}` : "";
  const indexPart = index > 0 ? ` ${index + 1}` : "";
  return `${portfolio.title}${cityPart} — фото${indexPart} ${typeLabel}`;
}

export function buildMasterAvatarAlt(master: { alias: string | null; publicTitle: string | null; id: number; city: string | null }): string {
  const name = pickMasterDisplayName(master);
  const cityPart = master.city ? ` в ${master.city}` : "";
  return `${name} — мастер${cityPart}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MasterPortfolioItem variant for cards inside master profile (no rich data)
// ─────────────────────────────────────────────────────────────────────────────

export function buildMasterCaseCardAlt(item: MasterPortfolioItem): string {
  const cityPart = item.city?.name ? ` в ${item.city.name}` : "";
  return `${item.title}${cityPart} — фото работы`;
}
