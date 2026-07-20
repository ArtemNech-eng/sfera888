/**
 * Индекс цен на ремонт (Real Price, Фаза 4, Req 8). Чистая логика без БД.
 *
 * Методика (честная для разреженных данных): элементарный индекс Жевонса с
 * фиксированной базой. Для каждого месяца берём медиану цены за единицу по
 * каждому виду работ; уровень месяца = 100 × среднее геометрическое отношений
 * (медиана_месяца / медиана_базы) по видам работ, встречающимся И в базе, И в
 * месяце. Так разнородные работы (₽/м² vs ₽/шт) сравниваются корректно —
 * складываются относительные изменения, а не абсолютные цены.
 *
 * База — самый ранний месяц с данными (уровень = 100). Месяцы без пересечения с
 * базовой корзиной получают level=null (но их объём сделок `n` всё равно виден).
 */

export interface IndexInputPoint {
  workTypeId: number;
  unitPrice: number;
  closedAt: string | Date | null;
}

export interface IndexMonth {
  month: string; // YYYY-MM
  level: number | null; // индекс, база=100
  n: number; // число ценовых точек за месяц
  basket: number; // размер пересечения с базовой корзиной
  momPct: number | null; // % к предыдущему месяцу с уровнем
}

export interface IndexQuarter {
  quarter: string; // напр. "2026-Q2"
  level: number | null;
  n: number;
  qoqPct: number | null; // % к предыдущему кварталу с уровнем
}

export interface PriceIndexResult {
  baseMonth: string | null;
  months: IndexMonth[];
  quarters: IndexQuarter[];
  totalDeals: number;
}

const MAX_MONTHS = 24;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseDate(v: string | Date | null): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function median(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1]! + xs[mid]!) / 2 : xs[mid]!;
}

function geomean(ratios: number[]): number {
  const xs = ratios.filter((r) => Number.isFinite(r) && r > 0);
  if (xs.length === 0) return 0;
  const sumLn = xs.reduce((s, r) => s + Math.log(r), 0);
  return Math.exp(sumLn / xs.length);
}

/** Все месяцы (YYYY-MM) от `from` до `to` включительно, но не более MAX_MONTHS с конца. */
function enumerateMonths(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy!;
  let m = fm!;
  while (y < ty! || (y === ty! && m <= tm!)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.length > MAX_MONTHS ? out.slice(out.length - MAX_MONTHS) : out;
}

function quarterKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}-Q${Math.floor((m! - 1) / 3) + 1}`;
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function buildPriceIndex(points: IndexInputPoint[], now: Date = new Date()): PriceIndexResult {
  // 1. Раскладываем точки по (месяц → вид работ → цены).
  const byMonth = new Map<string, Map<number, number[]>>();
  let totalDeals = 0;
  for (const p of points) {
    const d = parseDate(p.closedAt);
    const price = Number(p.unitPrice);
    if (!d || !Number.isFinite(price) || price <= 0 || !p.workTypeId) continue;
    const mk = monthKey(d);
    totalDeals += 1;
    let wt = byMonth.get(mk);
    if (!wt) {
      wt = new Map();
      byMonth.set(mk, wt);
    }
    const arr = wt.get(p.workTypeId) ?? [];
    arr.push(price);
    wt.set(p.workTypeId, arr);
  }

  const presentMonths = [...byMonth.keys()].sort();
  if (presentMonths.length === 0) {
    return { baseMonth: null, months: [], quarters: [], totalDeals: 0 };
  }

  // 2. Медианы по видам работ в каждом месяце.
  const medians = new Map<string, Map<number, number>>();
  for (const [mk, wtMap] of byMonth) {
    const mm = new Map<number, number>();
    for (const [wtId, prices] of wtMap) mm.set(wtId, median(prices));
    medians.set(mk, mm);
  }

  const baseMonth = presentMonths[0]!;
  const baseMedians = medians.get(baseMonth)!;

  // 3. Непрерывный ряд месяцев от базы до текущего (capped).
  const nowKey = monthKey(now);
  const lastMonth = presentMonths[presentMonths.length - 1]!;
  const rangeEnd = nowKey >= lastMonth ? nowKey : lastMonth;
  const monthRange = enumerateMonths(baseMonth, rangeEnd);

  const months: IndexMonth[] = [];
  let prevLevel: number | null = null;
  for (const mk of monthRange) {
    const wtMap = byMonth.get(mk);
    const n = wtMap ? [...wtMap.values()].reduce((s, arr) => s + arr.length, 0) : 0;
    const mm = medians.get(mk);
    let level: number | null = null;
    let basket = 0;
    if (mm) {
      const ratios: number[] = [];
      for (const [wtId, med] of mm) {
        const baseMed = baseMedians.get(wtId);
        if (baseMed && baseMed > 0 && med > 0) ratios.push(med / baseMed);
      }
      basket = ratios.length;
      if (basket > 0) level = round(100 * geomean(ratios));
    }
    const momPct = level != null && prevLevel != null && prevLevel > 0 ? round(((level - prevLevel) / prevLevel) * 100) : null;
    if (level != null) prevLevel = level;
    months.push({ month: mk, level, n, basket, momPct });
  }

  // 4. Квартальные срезы (уровень = среднее месячных уровней квартала).
  const quarters = buildQuarters(months);

  return { baseMonth, months, quarters, totalDeals };
}

function buildQuarters(months: IndexMonth[]): IndexQuarter[] {
  const byQuarter = new Map<string, { levels: number[]; n: number }>();
  const order: string[] = [];
  for (const m of months) {
    const q = quarterKey(m.month);
    let bucket = byQuarter.get(q);
    if (!bucket) {
      bucket = { levels: [], n: 0 };
      byQuarter.set(q, bucket);
      order.push(q);
    }
    if (m.level != null) bucket.levels.push(m.level);
    bucket.n += m.n;
  }
  const out: IndexQuarter[] = [];
  let prevLevel: number | null = null;
  for (const q of order) {
    const b = byQuarter.get(q)!;
    const level = b.levels.length > 0 ? round(b.levels.reduce((s, x) => s + x, 0) / b.levels.length) : null;
    const qoqPct = level != null && prevLevel != null && prevLevel > 0 ? round(((level - prevLevel) / prevLevel) * 100) : null;
    if (level != null) prevLevel = level;
    out.push({ quarter: q, level, n: b.n, qoqPct });
  }
  return out;
}
