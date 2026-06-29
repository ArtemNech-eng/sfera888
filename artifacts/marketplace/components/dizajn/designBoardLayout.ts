/**
 * Чистая презентационная логика раскладки страницы результата `DesignBoard`.
 *
 * Вынесена из `DesignBoard.tsx` (фикс §A, задача 11.1), чтобы адаптивные
 * сетки ROW1/ROW2/ROW3 и логика опциональных секций тестировались напрямую
 * property-тестами (`__tests__/dizajn/designboard-*.property.test.ts`),
 * без рендера React-дерева.
 *
 * Все функции — ЧИСТЫЕ: вход — булевы/числа из `DesignFullDTO`, выход —
 * строка Tailwind-класса либо список маркеров секций. Никаких сайд-эффектов и
 * импортов React, чтобы модуль свободно загружался Node/tsx в тестах.
 *
 * Принцип адаптивности: число grid-треков строго равно числу непустых блоков,
 * пустые секции не порождают ни заголовка, ни плейсхолдера. Для ПОЛНОГО набора
 * артефактов хелперы редуцируются к текущей (базовой) сетке — preservation
 * (Property 10): ROW1 `sm:grid-cols-4`, ROW2 `lg:grid-cols-[1fr_2fr_auto]`,
 * ROW3 `lg:grid-cols-[1fr_3fr]`.
 */

// ─── Опциональные секции ─────────────────────────────────────────────────────

/** Ключи опциональных секций страницы результата (ROW2/ROW3). */
export type SectionKey =
  | "palette"
  | "materials"
  | "estimate"
  | "solutions"
  | "detailCrops";

/**
 * Наличие данных для каждой опциональной секции — то, что `DesignBoard`
 * получает из `DesignFullDTO` (длины массивов > 0).
 */
export interface OptionalSectionState {
  hasPalette: boolean;
  hasMaterials: boolean;
  hasEstimate: boolean;
  hasSolutions: boolean;
  hasCrops: boolean;
}

/**
 * Маркер, попадающий в выходную разметку секции. Только заголовок секции —
 * пустые секции не рендерятся вовсе, висящий плейсхолдер палитры удалён.
 */
export type SectionMarker =
  | { section: SectionKey; kind: "header"; text: string }
  | { section: "palette"; kind: "placeholder"; text: string };

/** Точные строки заголовков секций (используются и компонентом, и тестами). */
export const PALETTE_HEADER = "Цветовая палитра";
export const MATERIALS_HEADER = "Рекомендуемые материалы";
export const ESTIMATE_HEADER = "Смета реализации";
export const SOLUTIONS_HEADER = "Основные решения";

// ─── ROW1: адаптивная сетка ракурсов ─────────────────────────────────────────

/**
 * Класс контейнера ROW1 под фактическое число основных ракурсов `n`.
 *
 * Инвариант (Property 1): число grid-колонок на десктопе == `n`, пустых
 * ячеек нет. Для `n = 4` редуцируется к текущему baseline (preservation 3.5):
 *   `grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3`.
 *
 *   n ≤ 1 → одна ячейка во всю ширину (без grid-cols → 1 колонка);
 *   n = 2 → `grid-cols-2`;
 *   n = 3 → `grid-cols-3` (без дыр);
 *   n ≥ 4 → baseline `grid-cols-2 sm:grid-cols-4`.
 */
export function viewsGridClass(n: number): string {
  if (n <= 1) return "grid gap-2 sm:gap-3";
  if (n === 2) return "grid grid-cols-2 gap-2 sm:gap-3";
  if (n === 3) return "grid grid-cols-3 gap-2 sm:gap-3";
  // n >= 4 — текущий baseline (редукция к существующей сетке).
  return "grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3";
}

// ─── ROW2: адаптивный grid-template (изометрия/план + центр + палитра) ────────

/**
 * Класс контейнера ROW2 под фактический состав колонок.
 *
 * Колонки: left (изометрия/план) — только при `hasLeft`; center (параметры) —
 * всегда; palette — только при `hasPalette`. Инвариант (Property 2): число
 * треков == число непустых колонок = (hasLeft?1:0) + 1 + (hasPalette?1:0).
 *
 *   left + center + palette → `lg:grid-cols-[1fr_2fr_auto]` (baseline 3.5);
 *   left + center           → `lg:grid-cols-[1fr_2fr]`;
 *   center + palette        → `lg:grid-cols-[2fr_auto]`;
 *   только center           → один трек во всю ширину (без `lg:grid-cols-*`).
 */
export function row2TemplateClass(opts: {
  hasLeft: boolean;
  hasPalette: boolean;
}): string {
  const { hasLeft, hasPalette } = opts;
  const base = "mt-5 grid gap-4";
  if (hasLeft && hasPalette) return `${base} lg:grid-cols-[1fr_2fr_auto]`;
  if (hasLeft && !hasPalette) return `${base} lg:grid-cols-[1fr_2fr]`;
  if (!hasLeft && hasPalette) return `${base} lg:grid-cols-[2fr_auto]`;
  // только центр — один трек во всю ширину.
  return base;
}

// ─── ROW3: адаптивный grid-template (решения + detail-кропы) ──────────────────

/**
 * Класс контейнера ROW3 под фактический состав блоков.
 *
 * Блоки: solutions (основные решения), crops (detail-кропы). Инвариант:
 *   solutions + crops → `lg:grid-cols-[1fr_3fr]` (baseline 3.5, 2 трека);
 *   ровно один блок   → один трек во всю ширину (без `lg:grid-cols-*`);
 *   ни одного          → один трек (ROW3 не рендерится компонентом вовсе).
 */
export function row3TemplateClass(opts: {
  hasSolutions: boolean;
  hasCrops: boolean;
}): string {
  const { hasSolutions, hasCrops } = opts;
  const base = "mt-5 grid gap-5";
  if (hasSolutions && hasCrops) return `${base} lg:grid-cols-[1fr_3fr]`;
  // один блок (или ни одного) — во всю ширину.
  return base;
}

/** Нужно ли вообще рендерить ROW3 (есть хотя бы один блок). */
export function shouldRenderRow3(opts: {
  hasSolutions: boolean;
  hasCrops: boolean;
}): boolean {
  return opts.hasSolutions || opts.hasCrops;
}

// ─── Опциональные секции: только непустые, без плейсхолдеров ──────────────────

/**
 * Маркеры опциональных секций под фактический состав данных.
 *
 * Инвариант (Property 3): пустая секция НЕ порождает ни заголовка, ни
 * плейсхолдера. Висящий плейсхолдер палитры («Палитра уточняется.») удалён —
 * блок палитры рендерится только при наличии данных. Detail-кропы не имеют
 * собственного заголовка (как и в текущей реализации).
 */
export function optionalSectionMarkers(
  state: OptionalSectionState,
): SectionMarker[] {
  const markers: SectionMarker[] = [];
  if (state.hasPalette) {
    markers.push({ section: "palette", kind: "header", text: PALETTE_HEADER });
  }
  if (state.hasMaterials) {
    markers.push({
      section: "materials",
      kind: "header",
      text: MATERIALS_HEADER,
    });
  }
  if (state.hasEstimate) {
    markers.push({ section: "estimate", kind: "header", text: ESTIMATE_HEADER });
  }
  if (state.hasSolutions) {
    markers.push({
      section: "solutions",
      kind: "header",
      text: SOLUTIONS_HEADER,
    });
  }
  return markers;
}
