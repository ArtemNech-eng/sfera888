/**
 * URL-slug helpers for the marketplace and AI_Design_Product.
 *
 * Used for:
 *   - generating `masters.slug` on first publish (master-pwa self-service);
 *   - generating `designs.slug` for AI_Design_Product
 *     (`/dizajn/{slug}` — Requirements 1.8, 1.9);
 *   - any future place where we need a stable Russian → latin slug.
 *
 * The transliteration table is intentionally kept in sync with
 * `scripts/src/backfill-marketplace-slugs.ts` (the same algorithm used to
 * backfill `cities.slug` and `service_types.slug`). Do NOT diverge: a slug
 * for the same `name` must be identical regardless of which code path
 * generated it.
 */

import { db, designsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// GOST-7.79 system B (simplified) — same table as scripts/.
const TRANSLIT: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
  "е": "e", "ё": "yo", "ж": "zh", "з": "z", "и": "i",
  "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
  "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
  "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch",
  "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "",
  "э": "e", "ю": "yu", "я": "ya",
};

/**
 * Convert a free-form name to a URL-safe slug.
 *   "Иван Петров"      → "ivan-petrov"
 *   "Санкт-Петербург"  → "sankt-peterburg"
 *   "Сантехник"        → "santehnik"
 *   "living_room"      → "living-room"
 */
export function slugify(input: string): string {
  const lower = input.toLowerCase();
  let out = "";
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) {
      out += TRANSLIT[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else {
      out += "-";
    }
  }
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

// ─── Internal: uniqueness loop with caller-provided checker ────────────────

async function uniqueWithChecker(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  fallback: string,
  maxLen: number,
  maxAttempts: number,
): Promise<string> {
  const safeBase = base || fallback;
  const trimBase = (extra: number) => safeBase.slice(0, Math.max(1, maxLen - extra));

  if (safeBase.length <= maxLen && !(await isTaken(safeBase))) {
    return safeBase;
  }

  for (let n = 2; n <= maxAttempts; n++) {
    const suffix = `-${n}`;
    const cand = trimBase(suffix.length) + suffix;
    if (!(await isTaken(cand))) return cand;
  }
  throw new Error(
    `[slug] could not find unique slug for base "${safeBase}" after ${maxAttempts} attempts`,
  );
}

// ─── Public API: callback-based (masters, generic) ─────────────────────────

/**
 * Pick a slug that's unique according to the caller-supplied checker. If the
 * base is already taken, tries `${base}-2`, `${base}-3`, … up to `maxAttempts`.
 *
 * `isTaken` is async so the caller can run a DB query.
 *
 * Length is capped at `maxLen` (default 100, matching `masters.slug` varchar).
 *
 * Used by `master-pwa` and `masters` routes for `masters.slug`.
 */
export async function pickUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxLen?: number,
  maxAttempts?: number,
): Promise<string>;

/**
 * Pick a slug for a `Design_Project` that's guaranteed unique against
 * `designs.slug` (Requirements 1.8, 1.9).
 *
 *   `${roomType.replace('_','-')}-${style}-${...extraSegments}`
 *
 * - All segments pass through `slugify` for cyrillic transliteration and
 *   non-alphanumeric → `-` normalization.
 * - Final slug matches `^[a-z0-9-]+$` and is ≤ 160 chars
 *   (matches `designs.slug varchar(160)`).
 * - Collisions are resolved by appending `-2`, `-3`, …
 */
export async function pickUniqueSlug(input: DesignSlugInput): Promise<string>;

export async function pickUniqueSlug(
  baseOrInput: string | DesignSlugInput,
  isTaken?: (candidate: string) => Promise<boolean>,
  maxLen = 100,
  maxAttempts = 9999,
): Promise<string> {
  // ── Object overload: AI_Design_Product designs.slug ───────────────────────
  if (typeof baseOrInput !== "string") {
    return pickUniqueDesignSlug(baseOrInput);
  }
  // ── String overload: legacy callers (masters, etc.) ───────────────────────
  if (!isTaken) {
    throw new Error("[slug] pickUniqueSlug(base, …) requires an `isTaken` callback");
  }
  return uniqueWithChecker(baseOrInput, isTaken, "master", maxLen, maxAttempts);
}

// ─── Public API: design-slug overload ──────────────────────────────────────

/** Input для построения slug дизайн-проекта. */
export interface DesignSlugInput {
  /** Тип помещения (`bedroom`, `living_room`, …). */
  roomType: string;
  /** Дизайн-стиль (`modern`, `scandinavian`, …). */
  style: string;
  /**
   * Опциональные дополнительные сегменты, добавляемые после `style`
   * в порядке списка. Принимаются строки и числа; `null`/`undefined`/
   * пустые строки игнорируются.
   *
   * Пример: `extraSegments: [city, "16m2"]`.
   */
  extraSegments?: ReadonlyArray<string | number | null | undefined>;
}

/** Максимальная длина `designs.slug` (см. `lib/db/src/schema/designs.ts`). */
const DESIGN_SLUG_MAX_LEN = 160;
const DESIGN_SLUG_MAX_ATTEMPTS = 9999;
/** Гарантия `^[a-z0-9-]+$`. */
const DESIGN_SLUG_VALID_RE = /^[a-z0-9-]+$/;
/** Запасное имя при пустом базовом slug. */
const DESIGN_SLUG_FALLBACK = "design";

/** Нормализация одного сегмента: трансляция → slugify → пусто/строка. */
function normalizeSegment(raw: string | number | null | undefined): string {
  if (raw == null) return "";
  const asString = typeof raw === "number" ? String(raw) : raw;
  if (!asString.trim()) return "";
  return slugify(asString);
}

/**
 * Собрать базовый slug из `{ roomType, style, extraSegments[] }`.
 * Гарантирует совпадение с regex `^[a-z0-9-]+$` и длину ≤ `DESIGN_SLUG_MAX_LEN`.
 */
export function buildDesignSlugBase(input: DesignSlugInput): string {
  const segments = [
    // `roomType.replace('_','-')` — формат из tasks.md 13.1; slugify
    // дополнительно приводит регистр и обрабатывает любые иные символы.
    normalizeSegment(input.roomType.replace(/_/g, "-")),
    normalizeSegment(input.style),
    ...(input.extraSegments ?? []).map(normalizeSegment),
  ].filter((s) => s.length > 0);

  let base = segments.join("-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");

  // Жёсткая страховка на случай экзотических входов.
  if (base && !DESIGN_SLUG_VALID_RE.test(base)) {
    base = base.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  }

  // Длина ≤ 160 (минус запас под суффикс `-N` мы оставляем уже в loop).
  if (base.length > DESIGN_SLUG_MAX_LEN) {
    base = base.slice(0, DESIGN_SLUG_MAX_LEN).replace(/-+$/g, "");
  }

  return base;
}

/**
 * `pickUniqueSlug({ roomType, style, extraSegments })` — внутренняя реализация
 * для object-overload. Делает `SELECT slug FROM designs WHERE slug = ?` через
 * Drizzle и возвращает уникальный slug.
 */
async function pickUniqueDesignSlug(input: DesignSlugInput): Promise<string> {
  const base = buildDesignSlugBase(input);

  const isTaken = async (candidate: string): Promise<boolean> => {
    const rows = await db
      .select({ slug: designsTable.slug })
      .from(designsTable)
      .where(eq(designsTable.slug, candidate))
      .limit(1);
    return rows.length > 0;
  };

  const slug = await uniqueWithChecker(
    base,
    isTaken,
    DESIGN_SLUG_FALLBACK,
    DESIGN_SLUG_MAX_LEN,
    DESIGN_SLUG_MAX_ATTEMPTS,
  );

  // Финальный sanity-check: slug всегда удовлетворяет regex и длине.
  if (!DESIGN_SLUG_VALID_RE.test(slug) || slug.length > DESIGN_SLUG_MAX_LEN) {
    throw new Error(
      `[slug] generated design slug "${slug}" violates well-formedness contract`,
    );
  }

  return slug;
}
