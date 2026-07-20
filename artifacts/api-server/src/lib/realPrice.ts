/**
 * Real Price — чистые функции агрегации цен (spec: `.kiro/specs/real-price`).
 *
 * Здесь только детерминированная логика (без БД): нормализация свободного
 * описания позиции к словарю видов работ, робастная статистика (медиана +
 * P25/P75 с отсечением выбросов) и порог публикации. Используется backfill-
 * скриптом и пересчётом агрегатов; полностью покрыто юнит-тестами.
 */

export interface WorkTypeLite {
  id: number;
  slug: string;
  name: string;
  category: string; // work | project | task
  defaultUnit: string | null;
  synonyms: string[];
}

/**
 * Сопоставляет свободное описание позиции сметы виду работ по синонимам/имени.
 * Регистронезависимо; выигрывает самое ДЛИННОЕ совпавшее вхождение (стем).
 * Возвращает `null`, если ничего не совпало (такая позиция не идёт в агрегат).
 */
export function matchWorkType(description: string, workTypes: WorkTypeLite[]): WorkTypeLite | null {
  const d = (description ?? "").toLowerCase().trim();
  if (!d) return null;
  let best: WorkTypeLite | null = null;
  let bestLen = 0;
  for (const wt of workTypes) {
    const needles = [wt.name, ...(wt.synonyms ?? [])];
    for (const raw of needles) {
      const s = (raw ?? "").toLowerCase().trim();
      if (s.length >= 3 && d.includes(s) && s.length > bestLen) {
        bestLen = s.length;
        best = wt;
      }
    }
  }
  return best;
}

export interface PriceStats {
  n: number;
  p25: number;
  p50: number;
  p75: number;
}

/** Линейно-интерполированный перцентиль по отсортированному массиву. */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Робастная статистика: медиана + вилка P25–P75 с отсечением выбросов по
 * межквартильному размаху (фенсы P25−1.5·IQR … P75+1.5·IQR). Мелкие наборы
 * (после отсечения < 3) не «переусекаются» — считаем по исходному набору.
 * Отбрасывает не-положительные/нечисловые значения. Пустой набор → `null`.
 */
export function robustStats(values: number[]): PriceStats | null {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const p25r = quantile(clean, 0.25);
  const p75r = quantile(clean, 0.75);
  const iqr = p75r - p25r;
  const lo = p25r - 1.5 * iqr;
  const hi = p75r + 1.5 * iqr;
  const trimmed = clean.filter((v) => v >= lo && v <= hi);
  const base = trimmed.length >= 3 ? trimmed : clean;
  return {
    n: base.length,
    p25: round2(quantile(base, 0.25)),
    p50: round2(quantile(base, 0.5)),
    p75: round2(quantile(base, 0.75)),
  };
}

export type AggregateKind = "work_city" | "work_zhk";

export const DEFAULT_MIN_N_CITY = 5;
export const DEFAULT_MIN_N_ZHK = 10;
export const MIN_N_CITY_ENV = "REAL_PRICE_MIN_N_CITY";
export const MIN_N_ZHK_ENV = "REAL_PRICE_MIN_N_ZHK";

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Порог публикации/индексации агрегата (Req 4.4). Конфигурируется через env. */
export function meetsPriceThreshold(kind: AggregateKind, n: number): boolean {
  const min = kind === "work_zhk" ? envInt(MIN_N_ZHK_ENV, DEFAULT_MIN_N_ZHK) : envInt(MIN_N_CITY_ENV, DEFAULT_MIN_N_CITY);
  return n >= min;
}

export interface RawLineItem {
  description: string;
  unit?: string | null;
  quantity?: number | null;
  price: number; // ₽ за единицу, если есть quantity+unit; иначе — сумма позиции
}

export interface DerivedPricePoint {
  workTypeId: number;
  unit: string | null;
  quantity: number | null;
  unitPrice: number;
  total: number | null;
}

/**
 * Выводит нормализованную ценовую точку из свободной позиции сметы.
 * Возвращает `null`, если описание не сопоставилось словарю или цена невалидна.
 *
 * Эвристика: если заданы `quantity>0` и `unit` — трактуем `price` как цену за
 * единицу (`unitPrice = price`, `total = price·quantity`). Иначе — как сумму
 * позиции (`unitPrice = price`, `quantity = null`, `total = price`).
 */
export function derivePricePoint(li: RawLineItem, workTypes: WorkTypeLite[]): DerivedPricePoint | null {
  const price = Number(li.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const wt = matchWorkType(li.description, workTypes);
  if (!wt) return null;
  const qty = li.quantity != null && Number.isFinite(Number(li.quantity)) && Number(li.quantity) > 0 ? Number(li.quantity) : null;
  const unit = (li.unit && li.unit.trim()) || wt.defaultUnit || null;
  const hasUnitBasis = qty != null && !!(li.unit && li.unit.trim());
  return {
    workTypeId: wt.id,
    unit,
    quantity: hasUnitBasis ? qty : null,
    unitPrice: round2(price),
    total: hasUnitBasis ? round2(price * qty!) : round2(price),
  };
}
