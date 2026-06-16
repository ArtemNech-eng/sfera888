/**
 * Auto-moderation for marketplace-public text fields.
 *
 * Used by:
 *   - master-pwa: PATCH /profile (publicBio, publicTitle), POST /profile/publish
 *   - master-pwa: portfolio create/update (title, description) — Iteration 2
 *   - CRM: optional admin-side check before override-publish
 *
 * Rules (see MARKETPLACE_PRODUCTION_PLAN.md §11.5):
 *   1. No phone numbers (digits + word-form like "восемь сот")
 *   2. No emails
 *   3. No URLs / domains / messenger handles
 *   4. No HTML tags
 *   5. Not too much CAPS (>50% on text >30 chars)
 *   6. No profanity (English via `obscenity`, Russian via stem regex)
 *   7. Length within bounds
 *   8. Quality gates: minimum word count, cyrillic ratio
 *
 * Returns a typed result with field-level errors so the UI can show
 * specific reasons next to each field.
 */

import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";

// ─── English profanity matcher (built-in dataset) ────────────────────────────
const englishMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// ─── Russian profanity — stem-based regex ────────────────────────────────────
// Operators can extend this list without touching the validator code. Each
// regex matches the stem + arbitrary suffixes (\w*) so we catch declensions
// like "блядский", "сукины", etc. Latin look-alikes (а→a, у→y) are handled
// after a normalization pass below.
//
// We deliberately keep the list compact (15 stems) — wider lists generate
// false positives on legitimate words ("страхуйте" contained the "хуй" stem
// historically, etc.). Operators expand iteratively as real spam arrives.
const RUSSIAN_PROFANITY_STEMS: RegExp[] = [
  /\bбл[яa]+[дт]?[ьъ]?\w*/iu,
  /\bбляд\w*/iu,
  /\bсук[аиеу]\w*/iu,
  /\bсучк\w*/iu,
  /\bпид[ао]р\w*/iu,
  /\bпидр\w*/iu,
  /\bхуй?\w*/iu,
  /\bхуев\w*/iu,
  /\bхуёв\w*/iu,
  /\bпизд\w*/iu,
  /\bебан\w*/iu,
  /\b[еёе]бл\w*/iu,
  /\b[еёе]бат\w*/iu,
  /\bмудак\w*/iu,
  /\bдолбо[её]б\w*/iu,
  /\bзалуп\w*/iu,
  /\bмразь\w*/iu,
  /\bговн\w*/iu,
];

// Normalize common latin-cyrillic look-alikes (used by spammers to bypass).
//   a→а, c→с, e→е, o→о, p→р, x→х, y→у, и т.д.
const LATIN_TO_CYRILLIC_LOOKALIKES: Record<string, string> = {
  a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у",
  A: "А", C: "С", E: "Е", O: "О", P: "Р", X: "Х", Y: "У",
};

function normalizeLookalikes(s: string): string {
  return s.split("").map(ch => LATIN_TO_CYRILLIC_LOOKALIKES[ch] ?? ch).join("");
}

function hasRussianProfanity(text: string): boolean {
  // Run regex on both raw and normalized text — covers spammers who mix latin
  // letters that look like cyrillic (e.g. "блядь" with latin а).
  const normalized = normalizeLookalikes(text);
  return RUSSIAN_PROFANITY_STEMS.some(re => re.test(text) || re.test(normalized));
}

// ─── Contact-info regexes ────────────────────────────────────────────────────
const PHONE_DIGITS_RE = /(?:\+?[78])?[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/;
// Loose word-form phone: "восемь девятьсот" / "восемь сот" / "8 девятьсот".
// Intentionally narrow to avoid false positives on legitimate "восемь часов".
const PHONE_WORDS_RE = /(?:восем[ья]?|семь|девять)\s*(?:сот[ыь]?|тысяч)/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const URL_RE = /(https?:\/\/|www\.[a-z]|t\.me\/|wa\.me\/|vk\.com\/|instagram\.com\/|fb\.com\/)/i;
const HANDLE_RE = /(@[a-z0-9_]{4,}|telegram|whatsapp|viber|вотсап|вотсапп|телеграм|телеграмм|инстаграм|вконтакте)/i;
const HTML_TAG_RE = /<[a-z!\/][\s\S]*?>/i;

// ─── Public types ────────────────────────────────────────────────────────────
export interface ValidationError {
  /** Field name passed by the caller (e.g. "publicBio"). May be undefined for batch validation. */
  field?: string;
  /** Stable machine code (e.g. "CONTAINS_PHONE", "TOO_SHORT") */
  code: string;
  /** Russian human-readable message for the master to see in PWA */
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

export interface ModerationOpts {
  /** Field name to attach to every error (so the UI can map error→field) */
  fieldName?: string;
  /** Min length of trimmed text. Set to 0 / undefined to skip. */
  minLength?: number;
  /** Max length of trimmed text. */
  maxLength?: number;
  /** Min number of words longer than 2 chars (defends against "ааааа..."). */
  minWords?: number;
  /** Min ratio of cyrillic letters to total letters (0..1). Defaults skip. */
  minCyrillicRatio?: number;
  /** Threshold for excessive CAPS. Defaults to 0.5. */
  capsThreshold?: number;
  /** If true, length check is skipped (used for short fields where only stop-words matter). */
  skipLengthChecks?: boolean;
}

// ─── Core validator ──────────────────────────────────────────────────────────
export function validateText(rawText: string, opts: ModerationOpts = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const text = (rawText ?? "").trim();
  const field = opts.fieldName;
  const push = (code: string, message: string) =>
    errors.push(field ? { field, code, message } : { code, message });

  // 1. Length checks
  if (!opts.skipLengthChecks) {
    if (opts.minLength != null && text.length < opts.minLength) {
      push("TOO_SHORT", `Минимум ${opts.minLength} символов, у вас ${text.length}.`);
    }
    if (opts.maxLength != null && text.length > opts.maxLength) {
      push("TOO_LONG", `Максимум ${opts.maxLength} символов, у вас ${text.length}.`);
    }
  }

  // 2. Phones
  if (PHONE_DIGITS_RE.test(text) || PHONE_WORDS_RE.test(text)) {
    push("CONTAINS_PHONE", "Уберите номер телефона из текста — заявки идут через сайт.");
  }

  // 3. Emails
  if (EMAIL_RE.test(text)) {
    push("CONTAINS_EMAIL", "Уберите email из текста — связь только через сайт.");
  }

  // 4. URLs / domains
  if (URL_RE.test(text)) {
    push("CONTAINS_URL", "Уберите ссылку или адрес сайта.");
  }

  // 5. Messenger handles / brand mentions
  if (HANDLE_RE.test(text)) {
    push("CONTAINS_HANDLE", "Уберите упоминание мессенджеров или соцсетей.");
  }

  // 6. HTML
  if (HTML_TAG_RE.test(text)) {
    push("CONTAINS_HTML", "Уберите HTML-теги — пишите обычным текстом.");
  }

  // 7. Excessive CAPS (only on text long enough to matter)
  const capsThreshold = opts.capsThreshold ?? 0.5;
  if (text.length > 30) {
    const upper = (text.match(/[A-ZА-ЯЁ]/g) ?? []).length;
    const lower = (text.match(/[a-zа-яё]/g) ?? []).length;
    const total = upper + lower;
    if (total > 0 && upper / total > capsThreshold) {
      push("TOO_MUCH_CAPS", "Слишком много заглавных букв. Используйте обычный регистр.");
    }
  }

  // 8. Profanity
  if (englishMatcher.hasMatch(text) || hasRussianProfanity(text)) {
    push("PROFANITY", "В тексте обнаружена нецензурная лексика. Перефразируйте.");
  }

  // 9. Quality: minimum words longer than 2 chars
  if (opts.minWords != null) {
    const words = text.split(/\s+/).filter(w => w.length > 2);
    if (words.length < opts.minWords) {
      push(
        "TOO_FEW_WORDS",
        `Текст слишком короткий: ${words.length} осмысленных слов, нужно минимум ${opts.minWords}.`,
      );
    }
  }

  // 10. Quality: cyrillic ratio (defends against latin-spam, emoji floods)
  if (opts.minCyrillicRatio != null) {
    const cyrillic = (text.match(/[а-яё]/gi) ?? []).length;
    const letters = (text.match(/[a-zа-яё]/gi) ?? []).length;
    if (letters > 0 && cyrillic / letters < opts.minCyrillicRatio) {
      push("NOT_RUSSIAN", "Текст должен быть на русском языке.");
    }
  }

  return { ok: errors.length === 0, errors };
}

// ─── Convenience presets matching MARKETPLACE_PRODUCTION_PLAN.md §11.5 ───────

/** publicBio: 300–2000 chars, ≥5 words, mostly cyrillic. */
export function validatePublicBio(text: string): ValidationResult {
  return validateText(text, {
    fieldName: "publicBio",
    minLength: 300,
    maxLength: 2000,
    minWords: 5,
    minCyrillicRatio: 0.5,
  });
}

/** publicTitle: 5–150 chars (length only — content rules also apply via validateText). */
export function validatePublicTitle(text: string): ValidationResult {
  return validateText(text, {
    fieldName: "publicTitle",
    minLength: 5,
    maxLength: 150,
  });
}

/** Portfolio title (Iteration 2): 5–200 chars. */
export function validatePortfolioTitle(text: string): ValidationResult {
  return validateText(text, {
    fieldName: "title",
    minLength: 5,
    maxLength: 200,
  });
}

/** Portfolio description (Iteration 2): 50–2000 chars. */
export function validatePortfolioDescription(text: string): ValidationResult {
  return validateText(text, {
    fieldName: "description",
    minLength: 50,
    maxLength: 2000,
    minWords: 5,
    minCyrillicRatio: 0.5,
  });
}

/**
 * Compose multiple validation results into a single `ValidationResult`.
 * Useful when the publish endpoint validates several fields at once.
 */
export function combineResults(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap(r => r.errors);
  return { ok: errors.length === 0, errors };
}
