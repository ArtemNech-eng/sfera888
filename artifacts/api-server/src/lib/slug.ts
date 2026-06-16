/**
 * URL-slug helpers for the marketplace.
 *
 * Used for:
 *   - generating `masters.slug` on first publish (master-pwa self-service);
 *   - any future place where we need a stable Russian → latin slug.
 *
 * The transliteration table is intentionally kept in sync with
 * `scripts/src/backfill-marketplace-slugs.ts` (the same algorithm used to
 * backfill `cities.slug` and `service_types.slug`). Do NOT diverge: a slug
 * for the same `name` must be identical regardless of which code path
 * generated it.
 */

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

/**
 * Pick a slug that's unique according to the caller-supplied checker. If the
 * base is already taken, tries `${base}-2`, `${base}-3`, … up to `maxAttempts`.
 *
 * `isTaken` is async so the caller can run a DB query.
 *
 * Length is capped at `maxLen` (default 100, matching `masters.slug` varchar).
 */
export async function pickUniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
  maxLen = 100,
  maxAttempts = 9999,
): Promise<string> {
  const safeBase = base || "master";
  const trimBase = (extra: number) => safeBase.slice(0, Math.max(1, maxLen - extra));

  if (safeBase.length <= maxLen && !(await isTaken(safeBase))) {
    return safeBase;
  }

  for (let n = 2; n <= maxAttempts; n++) {
    const suffix = `-${n}`;
    const cand = trimBase(suffix.length) + suffix;
    if (!(await isTaken(cand))) return cand;
  }
  throw new Error(`[slug] could not find unique slug for base "${safeBase}" after ${maxAttempts} attempts`);
}
