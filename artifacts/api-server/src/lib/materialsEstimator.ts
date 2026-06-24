import {
  db,
  finishingMaterialsTable,
  citiesTable,
  type LayoutJson,
  type PickedFurnitureRow,
  type DesignEstimateItem,
  type DesignMaterial,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { getCompatibleStyles } from "./furnitureMatcher.js";

/**
 * Materials_Estimator — шаг 8 `Generation_Pipeline` для AI_Design_Product.
 *
 * Считает четыре компоненты `Real_Estimate`:
 *   1. **Отделочные материалы** — по одному SKU на каждую из четырёх категорий
 *      (`walls`/`floor`/`ceiling`/`other`) из `finishing_materials`. Берётся
 *      первый доступный (самый дешёвый) SKU; стоимость = площадь × цена за м²
 *      (для `unit='sqm'`) либо 1 × цена (для `unit='pcs'`; категория `other`
 *      по соглашению всегда `pcs`).
 *   2. **Мебель** — Σ `pricePaidKopeks` подобранных в шаге 7 SKU из
 *      `Furniture_Matcher` (`null` SKU не контрибутят, т.к. их `pricePaidKopeks`
 *      по контракту равен 0; см. `lib/db/src/types/furniture.ts`).
 *   3. **Работы** — `roomAreaSqm × workCoefficientKopeksPerSqm`, где коэффициент
 *      берётся из `cities.work_coefficient_kopeks_per_sqm` по `cityId`. При
 *      `cityId IS NULL` или `NULL`-значении в `cities` используется
 *      общероссийский дефолт `DEFAULT_WORK_COEFF_KOPEKS_PER_SQM = 800_000`
 *      копеек/м² (8000 ₽/м²).
 *   4. **Прочие расходы** — `round(0.1 × (материалы + мебель + работы))`.
 *
 * Площади в м² (см. `design.md` § Materials_Estimator):
 *   • пол = ceiling = `widthCm × lengthCm / 10000`,
 *   • стены = `(2 × (widthCm + lengthCm) × heightCm / 10000) - 4`
 *     (вычитаем 4 м² на дверь и окно как упрощение MVP); если результат
 *     получается отрицательным на патологическом входе — клампим в 0,
 *     чтобы стоимость материалов не стала отрицательной.
 *
 * Возвращает `RealEstimateResult` с тремя полями:
 *   • `estimate` — массив из ровно 4 `DesignEstimateItem` в фиксированном
 *     порядке `[Отделочные материалы, Мебель, Работы, Прочие расходы]`
 *     (Requirement 11.5);
 *   • `materials` — `DesignMaterial[]` из подобранных SKU для записи в
 *     `designs.materials` (Requirement 11.2). Категории SKU мапятся в
 *     русскоязычные подписи `Стены`/`Пол`/`Потолок`/`Прочее`, сохраняя
 *     совместимость с существующим UI `DesignBoard.tsx` и форматом
 *     материалов из `designContent.ts`.
 *   • `totalKopeks` — сумма всех четырёх компонент.
 *
 * Requirement 11.7: если все четыре компоненты получились нулевыми
 * (например, нулевая площадь и пустой подбор мебели), массив содержит
 * четыре нуля без подмены на минимум — ни `Math.max(default, …)`, ни
 * любых других замен. `Math.round(0)` остаётся `0`, что и попадает в UI
 * как `0 ₽`.
 *
 * Чистый pure-обвес поверх SQL: внешние зависимости — только `db` и
 * `getCompatibleStyles` (та же таблица совместимости стилей, что в
 * `Furniture_Matcher`, чтобы материалы и мебель шли по одной логике).
 * Это делает функцию покрываемой property-тестом 12.2 без сети.
 */

// ──────────────────────────────────────────────────────────────────────────
// Public types & constants
// ──────────────────────────────────────────────────────────────────────────

/**
 * Дефолтный коэффициент стоимости работ для городов без явно проставленного
 * значения в `cities.work_coefficient_kopeks_per_sqm` (Requirement 11.4).
 *
 * 800 000 копеек/м² = 8 000 ₽/м² — общероссийский ориентир для бюджетного
 * ремонта на 2026 год. Хранится в коде как именованная константа, чтобы
 * (а) тесты могли импортировать ровно то же значение и (б) при изменении
 * не приходилось ловить hard-coded `800000` по всему репо.
 */
export const DEFAULT_WORK_COEFF_KOPEKS_PER_SQM = 800_000;

/** Доля прочих расходов от суммы первых трёх компонент (Requirement 11.3). */
const OTHER_EXPENSES_FRACTION = 0.1;

/** Поправка площади стен на дверь и окно, м² (упрощение MVP). */
const WALL_OPENINGS_SQM = 4;

/**
 * Категории отделки в порядке, в котором они появятся в `designs.materials`.
 * Этот же порядок используется при `SELECT`-цикле, чтобы вывод был
 * детерминированным независимо от порядка обхода Map/Object.
 */
const FINISHING_CATEGORIES = ["walls", "floor", "ceiling", "other"] as const;
type FinishingCategory = (typeof FINISHING_CATEGORIES)[number];

/** Русскоязычные подписи категорий для `DesignMaterial.category`. */
const CATEGORY_LABELS: Readonly<Record<FinishingCategory, string>> = {
  walls: "Стены",
  floor: "Пол",
  ceiling: "Потолок",
  other: "Прочее",
};

/**
 * Подписи строк сметы (Requirement 11.5). Порядок и тексты совпадают с
 * тем, что ожидает существующий UI `DesignBoard.tsx`.
 */
const ESTIMATE_LABELS = {
  materials: "Отделочные материалы",
  furniture: "Мебель",
  works: "Работы",
  other: "Прочие расходы",
} as const;

/** Результат `buildRealEstimate`. */
export interface RealEstimateResult {
  /** Ровно 4 строки в фиксированном порядке. */
  estimate: DesignEstimateItem[];
  /** Подобранные SKU по категориям, для `designs.materials`. */
  materials: DesignMaterial[];
  /** Сумма всех четырёх компонент в копейках. */
  totalKopeks: number;
}

/** Сигнатура входа `buildRealEstimate`. */
export interface BuildRealEstimateInput {
  layout: LayoutJson;
  roomType: string;
  style: string;
  cityId: number | null;
  pickedFurniture: PickedFurnitureRow[];
}

/** Вход для чистого хелпера `assembleEstimate`. */
export interface AssembleEstimateInput {
  materialsKopeks: number;
  furnitureKopeks: number;
  worksKopeks: number;
}

/** Результат `assembleEstimate`. */
export interface AssembleEstimateResult {
  estimate: DesignEstimateItem[];
  otherKopeks: number;
  totalKopeks: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Internal types
// ──────────────────────────────────────────────────────────────────────────

/**
 * Подмножество полей `finishing_materials`, нужное для расчёта строки сметы
 * и сборки `DesignMaterial`. Селектим только их, чтобы не тащить
 * `created_at`/`updated_at`/`partner_url`.
 */
interface FinishingMaterialPick {
  sku: string;
  name: string;
  brand: string | null;
  unit: string; // "sqm" | "pcs" — DB enforces, но runtime читает строкой.
  pricePerUnitKopeks: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Геометрия: площади поверхностей
// ──────────────────────────────────────────────────────────────────────────

/**
 * Площадь пола (и потолка) в м² по габаритам комнаты из Layout_JSON.
 *
 * Формула: `widthCm × lengthCm / 10000`. Результат — дробное число; точные
 * копейки получаются после умножения на цену и одного `Math.round` на
 * каждый расчёт (см. `computeMaterialCostKopeks`).
 */
function floorAreaSqm(layout: LayoutJson): number {
  const w = Math.max(0, layout.room.widthCm);
  const l = Math.max(0, layout.room.lengthCm);
  return (w * l) / 10000;
}

/**
 * Площадь стен в м², с поправкой на дверь и окно.
 *
 * Формула: `(2 × (widthCm + lengthCm) × heightCm / 10000) - 4`. Минус 4 м² —
 * упрощённый учёт двух проёмов (дверь ~2 м², окно ~2 м²); конкретные размеры
 * проёмов из `Layout_JSON` не учитываются, чтобы не переусложнять MVP-смету.
 *
 * При патологических входах (очень маленькая комната, где поправка
 * превышает периметр) результат клампится в 0 — отрицательная площадь
 * не имеет физического смысла и приведёт к отрицательной стоимости
 * материалов.
 */
function wallAreaSqm(layout: LayoutJson): number {
  const w = Math.max(0, layout.room.widthCm);
  const l = Math.max(0, layout.room.lengthCm);
  const h = Math.max(0, layout.room.heightCm);
  const raw = (2 * (w + l) * h) / 10000 - WALL_OPENINGS_SQM;
  return raw > 0 ? raw : 0;
}

/**
 * Площадь, которая используется для умножения на `price_per_unit_kopeks`,
 * в зависимости от категории. Для `other` поверхность не считается —
 * стоимость берётся как 1 × цена (категория `other` по соглашению всегда
 * `unit='pcs'`, см. Requirement 11.1 и сид).
 */
function categorySqm(category: FinishingCategory, layout: LayoutJson): number | null {
  switch (category) {
    case "walls":
      return wallAreaSqm(layout);
    case "floor":
      return floorAreaSqm(layout);
    case "ceiling":
      return floorAreaSqm(layout); // ceiling = floor по площади
    case "other":
      return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// SQL: один SELECT на категорию материалов
// ──────────────────────────────────────────────────────────────────────────

/**
 * Подобрать самый дешёвый доступный SKU для одной категории отделки.
 *
 * Условия отбора (Requirement 11.2):
 *   • `is_available = true`,
 *   • `room_types @> ARRAY[roomType]`,
 *   • `style_tags && ARRAY[…compatibleStyles]` (overlap с любым из
 *     совместимых стилей по таблице `getCompatibleStyles` из `Furniture_Matcher`).
 *
 * Сортировка `ORDER BY price_per_unit_kopeks ASC` гарантирует, что первая
 * строка — самая дешёвая. Вторичный sort по `id` детерминирует порядок
 * при равных ценах.
 *
 * `LIMIT 1` — категория представлена ровно одним SKU в смете
 * (если кандидатов несколько, мы берём минимальный по цене; если ноль —
 * результат `null`, и категория не вносит вклад в стоимость).
 *
 * Замечания по типам массивов (как в `Furniture_Matcher`):
 *   • `room_types` и `style_tags` — `varchar(40)[]`. Каст `::varchar[]`
 *     убирает class of bugs «operator does not exist: character varying[] @> text[]».
 *   • `sql.join` разворачивает массив значений в bind-плейсхолдеры без
 *     риска SQL-инъекций.
 */
async function pickCheapestForCategory(
  category: FinishingCategory,
  roomType: string,
  compatibleStyles: readonly string[],
): Promise<FinishingMaterialPick | null> {
  const stylesList = sql.join(
    compatibleStyles.map((s) => sql`${s}`),
    sql`, `,
  );

  const rows = await db
    .select({
      sku: finishingMaterialsTable.sku,
      name: finishingMaterialsTable.name,
      brand: finishingMaterialsTable.brand,
      unit: finishingMaterialsTable.unit,
      pricePerUnitKopeks: finishingMaterialsTable.pricePerUnitKopeks,
    })
    .from(finishingMaterialsTable)
    .where(
      and(
        eq(finishingMaterialsTable.isAvailable, true),
        eq(finishingMaterialsTable.category, category),
        sql`${finishingMaterialsTable.roomTypes} @> ARRAY[${roomType}]::varchar[]`,
        sql`${finishingMaterialsTable.styleTags} && ARRAY[${stylesList}]::varchar[]`,
      ),
    )
    .orderBy(
      asc(finishingMaterialsTable.pricePerUnitKopeks),
      asc(finishingMaterialsTable.id),
    )
    .limit(1);

  return rows[0] ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// Стоимость одной строки материалов
// ──────────────────────────────────────────────────────────────────────────

/**
 * Стоимость одной категории материалов в копейках:
 *   • `unit === "sqm"` и площадь определена → `area × pricePerUnitKopeks`;
 *   • иначе (`pcs` или `other` без площади) → `1 × pricePerUnitKopeks`.
 *
 * Округление через `Math.round` гарантирует целое число копеек: исходные
 * `pricePerUnitKopeks` — integer, а площадь — дробное число (например,
 * `5.6088` м² при стенах 256×219×270 см), их произведение в общем случае
 * не целое.
 */
function computeMaterialCostKopeks(
  pick: FinishingMaterialPick,
  areaSqm: number | null,
): number {
  if (pick.unit === "sqm" && areaSqm !== null) {
    return Math.round(areaSqm * pick.pricePerUnitKopeks);
  }
  return pick.pricePerUnitKopeks;
}

// ──────────────────────────────────────────────────────────────────────────
// Чтение коэффициента стоимости работ для города
// ──────────────────────────────────────────────────────────────────────────

/**
 * Коэффициент стоимости работ в копейках/м² для заданного `cityId`.
 *
 * Возвращает `DEFAULT_WORK_COEFF_KOPEKS_PER_SQM`, если:
 *   • `cityId === null` — пользователь не указал город (Requirement 11.4);
 *   • `cityId` не найден в `cities` (например, был удалён);
 *   • `cities.work_coefficient_kopeks_per_sqm IS NULL` — город есть, но
 *     коэффициент не проставлен оператором.
 *
 * Это единственный SQL-вызов на чтение в этой функции; в `cities` всегда
 * читается ровно одна строка.
 */
async function getWorkCoefficientKopeksPerSqm(
  cityId: number | null,
): Promise<number> {
  if (cityId === null || cityId === undefined) {
    return DEFAULT_WORK_COEFF_KOPEKS_PER_SQM;
  }
  const rows = await db
    .select({ workCoeff: citiesTable.workCoefficientKopeksPerSqm })
    .from(citiesTable)
    .where(eq(citiesTable.id, cityId))
    .limit(1);
  const value = rows[0]?.workCoeff;
  if (value === null || value === undefined) {
    return DEFAULT_WORK_COEFF_KOPEKS_PER_SQM;
  }
  return value;
}

// ──────────────────────────────────────────────────────────────────────────
// Описание SKU для DesignMaterial
// ──────────────────────────────────────────────────────────────────────────

/**
 * Сборка `DesignMaterial.description` из подобранного SKU.
 *
 * Формат: `"<brand>, <name>"` или просто `"<name>"`, если бренд не задан.
 * Совпадает по духу с примером из существующего `designContent.ts`
 * («Краска интерьерная, матовая»), что важно для UI-совместимости с уже
 * существующими 50 редакторскими `Showcase_Project`.
 */
function buildMaterialDescription(pick: FinishingMaterialPick): string {
  if (pick.brand && pick.brand.trim().length > 0) {
    return `${pick.brand}, ${pick.name}`;
  }
  return pick.name;
}

// ──────────────────────────────────────────────────────────────────────────
// Чистая сборка 4-строчного `Real_Estimate` из посчитанных компонент
// ──────────────────────────────────────────────────────────────────────────

/**
 * Собрать `estimate` из уже посчитанных kopeks-компонент.
 *
 * Чистый хелпер без SQL/IO: получает `materialsKopeks`, `furnitureKopeks`,
 * `worksKopeks` и считает `otherKopeks = round(0.1 × Σ)` (Requirement 11.3),
 * затем формирует ровно 4 строки в фиксированном порядке (Requirement 11.5)
 * и `totalKopeks` как сумму всех четырёх компонент.
 *
 * Никаких подстановок в нули (Requirement 11.7): если все три входа равны
 * нулю, `otherKopeks === 0` и все четыре `amountKopeks === 0`.
 *
 * Эта функция вынесена ради property-теста (см.
 * `__tests__/dizajn/real-estimate.property.test.ts`), который проверяет
 * арифметическую идентичность и структуру сметы независимо от SQL-слоя.
 */
function assembleEstimate(
  input: AssembleEstimateInput,
): AssembleEstimateResult {
  const { materialsKopeks, furnitureKopeks, worksKopeks } = input;
  const otherKopeks = Math.round(
    OTHER_EXPENSES_FRACTION * (materialsKopeks + furnitureKopeks + worksKopeks),
  );
  const estimate: DesignEstimateItem[] = [
    { category: ESTIMATE_LABELS.materials, amountKopeks: materialsKopeks },
    { category: ESTIMATE_LABELS.furniture, amountKopeks: furnitureKopeks },
    { category: ESTIMATE_LABELS.works, amountKopeks: worksKopeks },
    { category: ESTIMATE_LABELS.other, amountKopeks: otherKopeks },
  ];
  const totalKopeks =
    materialsKopeks + furnitureKopeks + worksKopeks + otherKopeks;
  return { estimate, otherKopeks, totalKopeks };
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Построить смету `Real_Estimate` для дизайн-проекта.
 *
 * Возвращает 4 компоненты в фиксированном порядке для записи в
 * `designs.estimate`, плюс массив `DesignMaterial[]` для записи в
 * `designs.materials`, плюс суммарный `totalKopeks`.
 *
 * Функция намеренно не бросает исключений на штатные пути (нет SKU для
 * категории, пустой подбор мебели, нулевая площадь, неизвестный город):
 * шаг 8 пайплайна — required, но «отсутствие данных» — это валидный
 * результат с нулём в соответствующей строке (Requirement 11.7).
 */
export async function buildRealEstimate(
  input: BuildRealEstimateInput,
): Promise<RealEstimateResult> {
  const { layout, roomType, style, cityId, pickedFurniture } = input;
  const compatibleStyles = getCompatibleStyles(style);

  // Шаг 1. Подбираем по одному SKU на каждую из четырёх категорий и
  // считаем стоимость. SELECT'ы запускаются параллельно — порядок
  // результата восстанавливается по `FINISHING_CATEGORIES`.
  const picks = await Promise.all(
    FINISHING_CATEGORIES.map((cat) =>
      pickCheapestForCategory(cat, roomType, compatibleStyles),
    ),
  );

  let materialsKopeks = 0;
  const materials: DesignMaterial[] = [];

  for (let i = 0; i < FINISHING_CATEGORIES.length; i++) {
    const category = FINISHING_CATEGORIES[i]!;
    const pick = picks[i];
    if (!pick) continue; // Категория без подходящего SKU — 0, без записи.

    const areaSqm = categorySqm(category, layout);
    const costKopeks = computeMaterialCostKopeks(pick, areaSqm);
    materialsKopeks += costKopeks;

    materials.push({
      category: CATEGORY_LABELS[category],
      description: buildMaterialDescription(pick),
    });
  }

  // Шаг 2. Стоимость мебели — сумма уже посчитанных `pricePaidKopeks`.
  // `null` SKU имеют `pricePaidKopeks = 0` по контракту PickedFurnitureRow.
  let furnitureKopeks = 0;
  for (const row of pickedFurniture) {
    furnitureKopeks += row.pricePaidKopeks;
  }

  // Шаг 3. Стоимость работ — площадь пола × коэффициент города.
  const workCoeff = await getWorkCoefficientKopeksPerSqm(cityId);
  const roomAreaSqm = floorAreaSqm(layout);
  const worksKopeks = Math.round(roomAreaSqm * workCoeff);

  // Шаг 4. Прочие расходы — 10 % от первых трёх (Requirement 11.3) и
  // финальная 4-строчная смета (Requirement 11.5). Делегируем чистому
  // хелперу `assembleEstimate`, чтобы арифметика и порядок строк были
  // покрыты property-тестом без SQL-слоя.
  const { estimate, totalKopeks } = assembleEstimate({
    materialsKopeks,
    furnitureKopeks,
    worksKopeks,
  });

  return { estimate, materials, totalKopeks };
}

// ──────────────────────────────────────────────────────────────────────────
// Test-only export
// ──────────────────────────────────────────────────────────────────────────

/**
 * Экспорт чистых внутренних хелперов и констант для unit/property-тестов
 * (`tests/dizajn/real-estimate.property.test.ts`). Не используется в проде.
 *
 * Отделено от публичного API `buildRealEstimate`, чтобы тесты могли проверять
 * арифметические инварианты (Properties 19.1..19.9) без подъёма SQL-слоя.
 */
export const __test__ = {
  floorAreaSqm,
  wallAreaSqm,
  categorySqm,
  computeMaterialCostKopeks,
  getWorkCoefficientKopeksPerSqm,
  assembleEstimate,
  OTHER_EXPENSES_FRACTION,
  WALL_OPENINGS_SQM,
  FINISHING_CATEGORIES,
  CATEGORY_LABELS,
  ESTIMATE_LABELS,
};
