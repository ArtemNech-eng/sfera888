/**
 * Подобранная под Layout_JSON позиция мебели — одна строка
 * `designs.picked_furniture[]` (см. `design.md` секция `Furniture_Matcher`,
 * Requirements 10.3, 10.5, 10.6).
 *
 * Чистый тип без зависимостей от Drizzle и без импортов из `api-server` /
 * `marketplace`, чтобы один и тот же объект сериализовался в jsonb-колонке
 * и читался во всех слоях без преобразований.
 */
export interface PickedFurnitureRow {
  /** `FurnitureItem.id` из Layout_JSON, по которому подбирался SKU. */
  layoutId: string;
  /** Тип мебели из Layout_JSON (`bed`, `wardrobe`, …). */
  type: string;
  /**
   * SKU из `furniture_products`, удовлетворяющий условиям отбора.
   * `null` означает, что подходящего SKU не нашлось (Requirement 10.5),
   * пайплайн в этом случае не блокируется.
   */
  sku: string | null;
  /** Название SKU (`null`, если sku=null). */
  name: string | null;
  /**
   * Фактически использованная цена SKU в копейках. `0`, если sku=null —
   * чтобы суммирование в `Real_Estimate` не падало на NaN.
   */
  pricePaidKopeks: number;
  /** Ссылка в магазин-партнёр (`null`, если sku=null). */
  partnerUrl: string | null;
  /** Миниатюра/превью SKU (`null`, если sku=null). */
  imageUrl: string | null;
}
