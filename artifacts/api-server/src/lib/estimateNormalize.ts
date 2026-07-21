/**
 * Real Price — pure normalization of an LLM-parsed estimate (spec:
 * `.kiro/specs/real-price`, task 3.4 / Req 7.4).
 *
 * This module has ZERO runtime dependencies (no `openai`, no DB) so the parsing
 * contract can be unit-tested fast under `node:test`, exactly like the
 * `priceIndex` / `realPrice` seams. The LLM plumbing that produces `raw` lives
 * in `estimateParser.ts`, which imports `normalizeParsedEstimate` from here.
 *
 * The output shape matches the manual checker rows the marketplace already
 * sends to `POST /real-price/check`: `{ description, unit, quantity, price }`
 * where `price` is the per-unit price (цена за единицу).
 */

/** Один разобранный ряд сметы, готовый заполнить форму проверятора. */
export interface ParsedEstimateItem {
  description: string;
  unit: string | null;
  quantity: number | null;
  /** Цена за единицу (₽). null, если модель не смогла её определить. */
  price: number | null;
}

/** Что принимаем на разбор (фото сметы или PDF). */
export const ACCEPTED_ESTIMATE_MIME: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/** Верхняя граница строк (форма проверятора всё равно шлёт максимум 60). */
export const MAX_PARSED_ITEMS = 40;

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  // "1 200,50 ₽" / "1200.5 руб" → 1200.5
  const cleaned = value
    .replace(/\u00A0/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (k in obj && obj[k] != null) return obj[k];
  }
  return undefined;
}

/** Coerce whatever the model returned into an array of row-like objects. */
function coerceArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    // Strip markdown code fences the model sometimes wraps JSON in.
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    if (!cleaned) return [];
    try {
      return coerceArray(JSON.parse(cleaned));
    } catch {
      return [];
    }
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const key of ["items", "positions", "rows", "lineItems", "позиции", "данные"]) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
  }
  return [];
}

/**
 * Normalize a raw LLM estimate payload into clean checker rows.
 *
 * Robust to: a bare array, a `{ items: [...] }` (or positions/rows/…) wrapper,
 * a JSON string (optionally fenced), messy numeric strings, and per-unit vs
 * total pricing (falls back to `total / quantity`). Rows without a usable
 * description are dropped; price/quantity are optional so the user can complete
 * them before checking.
 */
export function normalizeParsedEstimate(raw: unknown): ParsedEstimateItem[] {
  const arr = coerceArray(raw);
  const out: ParsedEstimateItem[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;

    const description = toStr(
      pick(o, ["description", "name", "work", "title", "наименование", "вид", "работа", "работы"]),
    );
    if (!description) continue;

    const unit = toStr(pick(o, ["unit", "ед", "единица", "units", "ед_изм", "edizm"]));
    const quantity = toNumber(pick(o, ["quantity", "qty", "count", "кол", "количество", "kol"]));

    let price = toNumber(
      pick(o, ["price", "unitPrice", "unit_price", "pricePerUnit", "ценаЗаЕдиницу", "цена", "cena"]),
    );
    if (price == null) {
      const total = toNumber(pick(o, ["total", "sum", "summa", "сумма", "итого", "amount"]));
      if (total != null && quantity != null && quantity > 0) {
        price = Math.round((total / quantity) * 100) / 100;
      }
    }

    out.push({
      description: description.slice(0, 200),
      unit: unit ? unit.slice(0, 24) : null,
      quantity,
      price,
    });
    if (out.length >= MAX_PARSED_ITEMS) break;
  }
  return out;
}
