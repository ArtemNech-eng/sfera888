import {
  db,
  furnitureProductsTable,
  type LayoutJson,
  type FurnitureItem,
  type PickedFurnitureRow,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";

/**
 * Furniture_Matcher — подбор реальных SKU из `furniture_products` под
 * `Layout_JSON` для шага 7 `Generation_Pipeline`
 * (см. `.kiro/specs/ai-design-product/design.md` § Furniture_Matcher,
 * Requirements 10.1, 10.3, 10.4, 10.5, 10.6).
 *
 * Контракт:
 *   • Один `SELECT` из `furniture_products` на каждый `FurnitureItem` из
 *     `Layout_JSON.furniture` — никакого I/O помимо этого. Все условия
 *     отбора (тип помещения, стиль, габариты ±15 см) применяются внутри
 *     SQL, чтобы воркер не тащил сотни строк в Node.
 *   • Стиль подбирается по таблице совместимости: оператор `&&` (overlap),
 *     потому что у одного SKU может быть несколько `style_tags` и
 *     достаточно пересечения с любым из совместимых стилей.
 *   • Бюджет на мебель ≤ 45 % от `budget` в копейках (доля «Мебель» в
 *     Real_Estimate, Requirement 11.3). Если суммарная цена начально
 *     выбранных SKU превышает лимит, самые дорогие позиции заменяются
 *     на более дешёвые альтернативы из тех же SQL-результатов; если
 *     дешёвой альтернативы нет — позиция помечается `sku=null`.
 *   • Возвращаемый массив идёт в том же порядке, что и `layout.furniture[]`,
 *     один-к-одному. Это нужно `Materials_Estimator` и `DesignBoard.tsx`,
 *     которые пробегают `picked_furniture` в естественном порядке плана.
 *
 * Чистый pure-обвес поверх SQL: единственная внешняя зависимость — `db`.
 * Это делает функцию покрываемой property-тестом 11.2 без сети.
 */

// ──────────────────────────────────────────────────────────────────────────
// Style compatibility table
// ──────────────────────────────────────────────────────────────────────────

/**
 * Таблица совместимости стилей из `design.md` § Furniture_Matcher.
 *
 * Базовый стиль ВСЕГДА входит в свой собственный список совместимых —
 * это инвариант, удобный для SQL-фильтра (`style_tags && ARRAY[...]`).
 * Если оператор добавит новый стиль, он автоматически совместим только
 * сам с собой, пока запись не появится в этом объекте.
 */
const STYLE_COMPATIBILITY: Readonly<Record<string, readonly string[]>> = {
  modern: ["modern", "minimalism", "scandinavian"],
  scandinavian: ["scandinavian", "minimalism", "japandi"],
  minimalism: ["minimalism", "modern", "scandinavian", "japandi"],
  japandi: ["japandi", "scandinavian", "minimalism"],
  loft: ["loft", "modern"],
  neoclassic: ["neoclassic", "classic", "modern"],
  classic: ["classic", "neoclassic"],
};

/**
 * Возвращает список стилей, которые считаются совместимыми с заданным.
 * Для неизвестного стиля возвращается одиночный массив `[style]` —
 * так SQL-фильтр продолжает работать без ошибок и подбирает только
 * SKU с точным совпадением.
 */
export function getCompatibleStyles(style: string): readonly string[] {
  const explicit = STYLE_COMPATIBILITY[style];
  return explicit ?? [style];
}

// ──────────────────────────────────────────────────────────────────────────
// Budget cap
// ──────────────────────────────────────────────────────────────────────────

/** Доля бюджета, отведённая на мебель в Real_Estimate (Requirement 11.3). */
const FURNITURE_BUDGET_FRACTION = 0.45;

/**
 * Лимит на суммарную цену выбранных SKU в копейках.
 *
 * `budgetRub` — это число в рублях из формы `Design_Form` (поле `budget`,
 * валидированное Zod-схемой 50 000..5 000 000). Перемножение с 100 даёт
 * копейки, умножение на 0.45 — долю «Мебель». `Math.floor` гарантирует
 * целочисленный лимит, чтобы сравнение `total > cap` оставалось точным
 * на стыке разрядов (избегаем плавающую точку при последующем
 * суммировании `priceKopeks`).
 *
 * Отрицательные/NaN-значения превращаются в 0 — в этом случае любой не-null
 * SKU будет заменён на null постпроцессом, что соответствует контракту
 * «не блокировать пайплайн» при явно нулевом бюджете.
 */
function computeFurnitureBudgetCapKopeks(budgetRub: number): number {
  if (!Number.isFinite(budgetRub) || budgetRub <= 0) return 0;
  return Math.floor(budgetRub * 100 * FURNITURE_BUDGET_FRACTION);
}

// ──────────────────────────────────────────────────────────────────────────
// Internal types
// ──────────────────────────────────────────────────────────────────────────

/**
 * Подмножество полей `furniture_products`, которые нужны для подбора и
 * сборки `PickedFurnitureRow`. Селектим только их, чтобы не вытягивать
 * `created_at`/`updated_at`/`brand` без необходимости.
 */
interface FurnitureCandidate {
  id: number;
  sku: string;
  name: string;
  priceKopeks: number;
  partnerUrl: string | null;
  imageUrl: string | null;
}

/** Сигнатура входа `pickFurniture` (см. design.md § Furniture_Matcher). */
export interface PickFurnitureInput {
  /** Layout_JSON, для которого подбираем мебель. */
  layout: LayoutJson;
  /** Тип помещения (`bedroom`, `kitchen`, …). */
  roomType: string;
  /** Базовый стиль из формы (`modern`, `scandinavian`, …). */
  style: string;
  /** Бюджет проекта в рублях (поле `budget` из `Design_Form`). */
  budgetRub: number;
}

// ──────────────────────────────────────────────────────────────────────────
// SQL: один SELECT на FurnitureItem
// ──────────────────────────────────────────────────────────────────────────

/**
 * Хот-патх запроса описан в `lib/db/src/schema/furniture-products.ts` —
 * индексы `furniture_products_picker_idx`, `..._styles_gin`, `..._rooms_gin`
 * покрывают этот фильтр и сортировку.
 *
 * Замечания по типам массивов:
 *   • `room_types` и `style_tags` — `varchar(40)[]`. Постгрес жёстко
 *     требует совпадения типов в операторах `@>`/`&&`, поэтому новый
 *     массив каста к `varchar[]` (без длины — длина в varchar уже
 *     задана колонкой и совместима) — это убирает class of bugs вида
 *     «operator does not exist: character varying[] @> text[]».
 *   • Параметры `style` приходят как обычные текстовые значения через
 *     bind-плейсхолдеры; SQL-инъекции невозможны.
 */
async function fetchCandidatesForItem(
  item: FurnitureItem,
  roomType: string,
  compatibleStyles: readonly string[],
): Promise<FurnitureCandidate[]> {
  // sql.join разворачивает массив значений в `$1, $2, $3` плейсхолдеры —
  // это нужно для `ARRAY[…]` с произвольной длиной списка стилей.
  const stylesList = sql.join(
    compatibleStyles.map((s) => sql`${s}`),
    sql`, `,
  );

  const rows = await db
    .select({
      id: furnitureProductsTable.id,
      sku: furnitureProductsTable.sku,
      name: furnitureProductsTable.name,
      priceKopeks: furnitureProductsTable.priceKopeks,
      partnerUrl: furnitureProductsTable.partnerUrl,
      imageUrl: furnitureProductsTable.imageUrl,
    })
    .from(furnitureProductsTable)
    .where(
      and(
        eq(furnitureProductsTable.isAvailable, true),
        eq(furnitureProductsTable.type, item.type),
        sql`${furnitureProductsTable.roomTypes} @> ARRAY[${roomType}]::varchar[]`,
        sql`${furnitureProductsTable.styleTags} && ARRAY[${stylesList}]::varchar[]`,
        sql`ABS(${furnitureProductsTable.widthCm}  - ${item.widthCm})  <= 15`,
        sql`ABS(${furnitureProductsTable.depthCm}  - ${item.depthCm})  <= 15`,
        sql`ABS(${furnitureProductsTable.heightCm} - ${item.heightCm}) <= 15`,
      ),
    )
    // Вторичный sort по `id` делает порядок детерминированным при равных
    // ценах — иначе Postgres возвращает строки в произвольном порядке и
    // initial-pick «cheapest» становится недетерминированным.
    .orderBy(
      asc(furnitureProductsTable.priceKopeks),
      asc(furnitureProductsTable.id),
    );

  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    priceKopeks: r.priceKopeks,
    partnerUrl: r.partnerUrl,
    imageUrl: r.imageUrl,
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Postprocess: enforce 45% budget cap
// ──────────────────────────────────────────────────────────────────────────

/**
 * Текущая суммарная цена выбранных SKU. `null` слоты считаются за 0
 * (Requirement 10.5 — позиция «уточняется» не учитывается в бюджете).
 */
function totalKopeks(picks: ReadonlyArray<FurnitureCandidate | null>): number {
  let sum = 0;
  for (const p of picks) {
    if (p !== null) sum += p.priceKopeks;
  }
  return sum;
}

/**
 * Постпроцесс по бюджету (Requirement 10.4).
 *
 * Алгоритм:
 *   1. Стартовый pick для каждой позиции — самая дешёвая из подходящих
 *      (первая строка `ORDER BY price_kopeks ASC`). Это уже минимизирует
 *      суммарную цену.
 *   2. Если total > cap — итеративно ищем позицию с самой дорогой
 *      выбранной ценой. В её кандидатах ищем строго более дешёвую
 *      альтернативу. Если есть — заменяем; если нет (initial pick уже
 *      cheapest) — вычеркиваем позицию (`sku=null`, цена 0).
 *   3. Цикл сходится за ≤ N итераций (на каждой шагаем строго вниз по
 *      цене текущего pick'а — либо к более дешёвой альтернативе, либо к
 *      нулю), где N = `layout.furniture.length`. Запасной счётчик-предохра-
 *      нитель `MAX_ITERATIONS` защищает от любых угловых случаев с
 *      дубликатами по цене.
 *
 * Инвариант после: либо все pick=null, либо total ≤ cap.
 */
function enforceBudgetCap(
  picks: Array<FurnitureCandidate | null>,
  candidatesPerItem: ReadonlyArray<readonly FurnitureCandidate[]>,
  capKopeks: number,
): void {
  // У каждой позиции максимум один «спуск» на каждую уникальную цену в
  // её кандидатах + 1 переход в null. Эмпирический предел в 4× длины
  // массива — паранойя против бесконечного цикла на патологических данных.
  const MAX_ITERATIONS = picks.length * 4 + 8;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (totalKopeks(picks) <= capKopeks) return;

    // Находим позицию с максимальной ценой среди не-null pick'ов.
    let worstIdx = -1;
    let worstPrice = -1;
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      if (p !== null && p.priceKopeks > worstPrice) {
        worstPrice = p.priceKopeks;
        worstIdx = i;
      }
    }
    if (worstIdx === -1) return; // все позиции уже null

    const current = picks[worstIdx]!;
    const candidates = candidatesPerItem[worstIdx]!;

    // Ищем строго более дешёвую альтернативу из того же списка кандидатов
    // (возможно, у позиции в кандидатах был не один SKU с одинаковой ценой —
    // тогда строгий `<` исключает «замену на саму себя»).
    const cheaper = candidates.find((c) => c.priceKopeks < current.priceKopeks);
    if (cheaper) {
      picks[worstIdx] = cheaper;
    } else {
      // Initial pick уже cheapest — единственный способ снизить total
      // дальше — вычеркнуть позицию. Соответствует контракту Requirement
      // 10.4: «не блокировать пайплайн».
      picks[worstIdx] = null;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Подобрать SKU для каждого `FurnitureItem` из Layout_JSON.
 *
 * Возвращает массив `PickedFurnitureRow[]` в том же порядке, что и
 * `input.layout.furniture`. Каждый элемент:
 *   • либо реальный SKU с заполненными `name`/`pricePaidKopeks`/
 *     `partnerUrl`/`imageUrl`,
 *   • либо «не подобрано» (`sku=null`, `pricePaidKopeks=0`, остальные
 *     `null`) — если нет ни одного кандидата (Requirement 10.5) или
 *     позиция была вычеркнута бюджет-постпроцессом (Requirement 10.4).
 *
 * Функция намеренно не бросает исключений на штатные пути (нет SKU,
 * пустой `furniture[]`, бюджет=0): шаг 7 пайплайна — optional, его падение
 * не должно валить весь Generation_Pipeline (см. design.md § FSM,
 * Requirement 14.2).
 */
export async function pickFurniture(
  input: PickFurnitureInput,
): Promise<PickedFurnitureRow[]> {
  const { layout, roomType, style, budgetRub } = input;
  const items = layout.furniture;

  // Пустой Layout_JSON — пустой результат. Корректный edge case для
  // комнат с нулевой меблировкой (валидация Layout_Planner всё равно
  // требует `minItems=1`, но защита нелишняя).
  if (items.length === 0) {
    return [];
  }

  const compatibleStyles = getCompatibleStyles(style);

  // Шаг 1: один SELECT на каждый FurnitureItem. Можно было бы свернуть в
  // UNION ALL с window-functions, но N < 12 (maxItems Layout_JSON), оверхед
  // отдельных запросов незаметен на фоне AI-вызовов выше по пайплайну.
  const candidatesPerItem: FurnitureCandidate[][] = [];
  for (const item of items) {
    candidatesPerItem.push(
      await fetchCandidatesForItem(item, roomType, compatibleStyles),
    );
  }

  // Шаг 2: initial pick — самый дешёвый из подходящих (или null, если нет).
  const picks: Array<FurnitureCandidate | null> = candidatesPerItem.map(
    (cands) => cands[0] ?? null,
  );

  // Шаг 3: 45 %-бюджетный лимит и постпроцесс заменой/обнулением.
  const capKopeks = computeFurnitureBudgetCapKopeks(budgetRub);
  enforceBudgetCap(picks, candidatesPerItem, capKopeks);

  // Шаг 4: проекция в публичный тип `PickedFurnitureRow`. Порядок строго
  // совпадает с `layout.furniture[]` (Requirement 10.6).
  return projectPicks(items, picks);
}

/**
 * Чистая проекция параллельных массивов `items[]` и `picks[]` в публичный
 * тип `PickedFurnitureRow[]`. Вынесена из `pickFurniture` отдельной функцией,
 * чтобы её можно было покрыть property-тестом без мока SQL-слоя
 * (см. `__test__` ниже и task 11.2).
 *
 * Контракт совпадает с шагом 4 `pickFurniture`:
 *   • Длина результата = `items.length`.
 *   • На i-й позиции `layoutId === items[i].id` и `type === items[i].type`.
 *   • Если `picks[i] === null` — `sku/name/partnerUrl/imageUrl = null`,
 *     `pricePaidKopeks = 0`.
 *   • Иначе — поля копируются из `picks[i]` без изменений.
 */
function projectPicks(
  items: ReadonlyArray<FurnitureItem>,
  picks: ReadonlyArray<FurnitureCandidate | null>,
): PickedFurnitureRow[] {
  return items.map((item, idx): PickedFurnitureRow => {
    const pick = picks[idx] ?? null;
    if (!pick) {
      return {
        layoutId: item.id,
        type: item.type,
        sku: null,
        name: null,
        pricePaidKopeks: 0,
        partnerUrl: null,
        imageUrl: null,
      };
    }
    return {
      layoutId: item.id,
      type: item.type,
      sku: pick.sku,
      name: pick.name,
      pricePaidKopeks: pick.priceKopeks,
      partnerUrl: pick.partnerUrl,
      imageUrl: pick.imageUrl,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Test-only exports
// ──────────────────────────────────────────────────────────────────────────

/**
 * Внутренние помощники, экспортируемые исключительно для property-тестов
 * (`tests/dizajn/furniture-matcher.property.test.ts`, task 11.2,
 * Property 18). Эти функции — чистые и детерминированные, проверяемы
 * без обращения к БД и без сети. Не использовать в production-коде.
 */
export const __test__ = {
  STYLE_COMPATIBILITY,
  FURNITURE_BUDGET_FRACTION,
  computeFurnitureBudgetCapKopeks,
  enforceBudgetCap,
  totalKopeks,
  projectPicks,
};
export type { FurnitureCandidate as __FurnitureCandidate };
