/**
 * Seed `furniture_products` — каталог мебели для AI_Design_Product MVP.
 *
 * Spec:        .kiro/specs/ai-design-product/
 * Task:        23.1
 * Requirements: 10.1, 10.2
 *
 * Что делает:
 *   • Заливает 100–200 SKU мебели для типа помещения `bedroom` с покрытием
 *     всех 7 стилей (`modern`, `scandinavian`, `loft`, `minimalism`,
 *     `neoclassic`, `japandi`, `classic`) и всех 8 ключевых типов
 *     (`bed`, `wardrobe`, `nightstand`, `desk`, `chair`, `dresser`,
 *     `shelf`, `rug`).
 *   • Идемпотентен: повторный запуск делает `INSERT ... ON CONFLICT (sku)
 *     DO UPDATE`, поэтому правки SKU/цен/габаритов в массиве
 *     `FURNITURE_SEED` синхронизируются с БД ровно одним запуском.
 *   • Не падает, если запись уже есть в БД — апдейтит все поля и тыкает
 *     `updated_at = NOW()`.
 *
 * Использование (из корня репо):
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/seedFurniture.ts
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/seedFurniture.ts --dry-run
 *
 * Импорт из других модулей (например тестов):
 *   import { FURNITURE_SEED, seedFurnitureProducts } from "./seedFurniture.js";
 *   await seedFurnitureProducts({ dryRun: false });
 *
 * Цены — в копейках (₽ × 100). Габариты — в сантиметрах. Бренды —
 * российские/CIS-магазины (Hoff, Lazurit, Divan.ru, Asko, Mr.Doors,
 * Орматек, Аскона, Шатура, ТриЯ, Много Мебели). Картинки — стабильные
 * URL `loremflickr.com` с фиксированным `lock` seed'ом, чтобы между
 * запусками изображения не менялись. Партнёрские ссылки — на
 * существующие категории магазинов (для MVP это категория, не карточка
 * SKU; адрес меняется на конкретный товар при последующей интеграции
 * парсера каталогов из дизайна `Hardcoded_Catalog`).
 */

import { sql } from "drizzle-orm";

// `@workspace/db` экспортирует `db`, `furnitureProductsTable` и тип
// `InsertFurnitureProduct`, поэтому скрипт не лезет напрямую в схему.
const { db, pool, furnitureProductsTable } = await import("@workspace/db");
import type { InsertFurnitureProduct } from "@workspace/db";

// ──────────────────────────────────────────────────────────────────────────
// Domain types
// ──────────────────────────────────────────────────────────────────────────

type StyleTag =
  | "modern"
  | "scandinavian"
  | "loft"
  | "minimalism"
  | "neoclassic"
  | "japandi"
  | "classic";

type FurnitureType =
  | "bed"
  | "wardrobe"
  | "nightstand"
  | "desk"
  | "chair"
  | "dresser"
  | "shelf"
  | "rug";

interface SeedRow {
  sku: string;
  name: string;
  brand: string;
  /** Цена в рублях. Перед INSERT превращается в копейки `× 100`. */
  priceRub: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  type: FurnitureType;
  styleTags: StyleTag[];
  /** Партнёрская ссылка на категорию магазина (см. шапку файла). */
  partnerUrl: string;
  /** Стабильный seed для loremflickr `lock` параметра. */
  imageSeed: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Image URL helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * loremflickr возвращает одну и ту же картинку при одинаковом `lock`,
 * поэтому seed гарантирует стабильность ссылки между запусками сида.
 * Размер 640×480 — компромисс между трафиком на витрине и качеством для
 * детальных карточек в `DesignBoard.tsx`.
 */
function imageUrlFor(type: FurnitureType, seed: number): string {
  const themeByType: Record<FurnitureType, string> = {
    bed: "bed,bedroom,interior",
    wardrobe: "wardrobe,bedroom,interior",
    nightstand: "nightstand,bedroom,interior",
    desk: "desk,office,interior",
    chair: "chair,furniture,interior",
    dresser: "dresser,bedroom,interior",
    shelf: "shelf,bookshelf,interior",
    rug: "rug,carpet,interior",
  };
  return `https://loremflickr.com/640/480/${themeByType[type]}?lock=${seed}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Catalogue
// ──────────────────────────────────────────────────────────────────────────
//
// Распределение по типам (всего ≈130 SKU, в пределах целевых 100–200 из
// Requirement 10.2):
//   bed          : 20  (target 15–25)
//   wardrobe     : 20  (target 15–25)
//   nightstand   : 18  (target 15–20)
//   desk         : 14  (target 10–15)
//   chair        : 14  (target 10–15)
//   dresser      : 14  (target 10–15)
//   shelf        : 14  (target 10–15)
//   rug          : 14  (target 10–15)
//
// Для каждого из 7 стилей в каждом типе есть минимум один SKU. Многие
// SKU имеют несколько `style_tags`, чтобы матчер `Furniture_Matcher`
// находил их по таблице совместимости стилей (`design.md` § Furniture_Matcher).

const FURNITURE_SEED: SeedRow[] = [
  // ── BEDS (20) ─────────────────────────────────────────────────────────
  { sku: "BED-001", name: "Кровать Hoff Marselle 160×200", brand: "Hoff", priceRub: 38900, widthCm: 168, depthCm: 213, heightCm: 96, type: "bed", styleTags: ["modern", "scandinavian"], partnerUrl: "https://hoff.ru/catalog/krovati/", imageSeed: 1001 },
  { sku: "BED-002", name: "Кровать Hoff Concept 180×200 с подъёмным механизмом", brand: "Hoff", priceRub: 54990, widthCm: 188, depthCm: 215, heightCm: 100, type: "bed", styleTags: ["modern", "minimalism"], partnerUrl: "https://hoff.ru/catalog/krovati/", imageSeed: 1002 },
  { sku: "BED-003", name: "Кровать Аскона Mia 160×200", brand: "Аскона", priceRub: 32500, widthCm: 167, depthCm: 210, heightCm: 92, type: "bed", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://www.askona.ru/krovati/", imageSeed: 1003 },
  { sku: "BED-004", name: "Кровать Аскона Forest Oslo 180×200", brand: "Аскона", priceRub: 47800, widthCm: 187, depthCm: 211, heightCm: 100, type: "bed", styleTags: ["scandinavian", "japandi"], partnerUrl: "https://www.askona.ru/krovati/", imageSeed: 1004 },
  { sku: "BED-005", name: "Кровать Орматек Verona 160×200", brand: "Орматек", priceRub: 41200, widthCm: 168, depthCm: 215, heightCm: 105, type: "bed", styleTags: ["neoclassic", "classic"], partnerUrl: "https://ormatek.com/catalog/krovati", imageSeed: 1005 },
  { sku: "BED-006", name: "Кровать Орматек Soft Bali 140×200", brand: "Орматек", priceRub: 36400, widthCm: 148, depthCm: 211, heightCm: 95, type: "bed", styleTags: ["modern", "japandi"], partnerUrl: "https://ormatek.com/catalog/krovati", imageSeed: 1006 },
  { sku: "BED-007", name: "Кровать Lazurit Камилла 160×200", brand: "Lazurit", priceRub: 89900, widthCm: 175, depthCm: 218, heightCm: 120, type: "bed", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/krovati/", imageSeed: 1007 },
  { sku: "BED-008", name: "Кровать Lazurit Версаль 180×200 с каретной стяжкой", brand: "Lazurit", priceRub: 124900, widthCm: 195, depthCm: 220, heightCm: 130, type: "bed", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/krovati/", imageSeed: 1008 },
  { sku: "BED-009", name: "Кровать Divan.ru Loft Brick 160×200", brand: "Divan.ru", priceRub: 42900, widthCm: 168, depthCm: 212, heightCm: 90, type: "bed", styleTags: ["loft", "modern"], partnerUrl: "https://www.divan.ru/category/krovati", imageSeed: 1009 },
  { sku: "BED-010", name: "Кровать Divan.ru Mellow 160×200", brand: "Divan.ru", priceRub: 35500, widthCm: 166, depthCm: 210, heightCm: 88, type: "bed", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://www.divan.ru/category/krovati", imageSeed: 1010 },
  { sku: "BED-011", name: "Кровать Шатура Kioto 160×200", brand: "Шатура", priceRub: 48700, widthCm: 169, depthCm: 213, heightCm: 100, type: "bed", styleTags: ["japandi", "minimalism"], partnerUrl: "https://shatura.com/catalog/spalni/krovati/", imageSeed: 1011 },
  { sku: "BED-012", name: "Кровать Шатура Lucia 180×200", brand: "Шатура", priceRub: 52900, widthCm: 187, depthCm: 215, heightCm: 110, type: "bed", styleTags: ["modern", "scandinavian"], partnerUrl: "https://shatura.com/catalog/spalni/krovati/", imageSeed: 1012 },
  { sku: "BED-013", name: "Кровать ТриЯ Сканди 140×200", brand: "ТриЯ", priceRub: 28900, widthCm: 147, depthCm: 209, heightCm: 92, type: "bed", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://triya.ru/catalog/spalni/", imageSeed: 1013 },
  { sku: "BED-014", name: "Кровать Много Мебели Прованс 160×200", brand: "Много Мебели", priceRub: 27500, widthCm: 168, depthCm: 211, heightCm: 110, type: "bed", styleTags: ["classic", "neoclassic"], partnerUrl: "https://www.mnogomebeli.com/catalog/krovati/", imageSeed: 1014 },
  { sku: "BED-015", name: "Кровать Asko Industrial 160×200", brand: "Asko", priceRub: 56200, widthCm: 170, depthCm: 215, heightCm: 95, type: "bed", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/krovati/", imageSeed: 1015 },
  { sku: "BED-016", name: "Кровать Asko Tokyo Tatami 180×200", brand: "Asko", priceRub: 64900, widthCm: 188, depthCm: 213, heightCm: 70, type: "bed", styleTags: ["japandi", "minimalism"], partnerUrl: "https://www.asko.ru/krovati/", imageSeed: 1016 },
  { sku: "BED-017", name: "Кровать Mr.Doors Soho 160×200", brand: "Mr.Doors", priceRub: 78400, widthCm: 170, depthCm: 213, heightCm: 105, type: "bed", styleTags: ["loft", "modern"], partnerUrl: "https://www.mrdoors.ru/catalog/spalnya/krovati/", imageSeed: 1017 },
  { sku: "BED-018", name: "Кровать Орматек Como 160×200 с изголовьем", brand: "Орматек", priceRub: 51200, widthCm: 169, depthCm: 214, heightCm: 110, type: "bed", styleTags: ["modern", "neoclassic"], partnerUrl: "https://ormatek.com/catalog/krovati", imageSeed: 1018 },
  { sku: "BED-019", name: "Кровать Hoff Easy Sleep 140×200", brand: "Hoff", priceRub: 21900, widthCm: 147, depthCm: 209, heightCm: 85, type: "bed", styleTags: ["minimalism", "scandinavian"], partnerUrl: "https://hoff.ru/catalog/krovati/", imageSeed: 1019 },
  { sku: "BED-020", name: "Кровать Lazurit Доменико 200×200", brand: "Lazurit", priceRub: 142500, widthCm: 215, depthCm: 220, heightCm: 130, type: "bed", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/krovati/", imageSeed: 1020 },

  // ── WARDROBES (20) ────────────────────────────────────────────────────
  { sku: "WRD-001", name: "Шкаф-купе Hoff Smart 200×60×240", brand: "Hoff", priceRub: 39900, widthCm: 200, depthCm: 60, heightCm: 240, type: "wardrobe", styleTags: ["modern", "minimalism"], partnerUrl: "https://hoff.ru/catalog/shkafy_kupe/", imageSeed: 2001 },
  { sku: "WRD-002", name: "Шкаф-купе Hoff Concept 180×60×220 с зеркалом", brand: "Hoff", priceRub: 33900, widthCm: 180, depthCm: 60, heightCm: 220, type: "wardrobe", styleTags: ["modern", "scandinavian"], partnerUrl: "https://hoff.ru/catalog/shkafy_kupe/", imageSeed: 2002 },
  { sku: "WRD-003", name: "Шкаф Mr.Doors Loft 220×60×240", brand: "Mr.Doors", priceRub: 96500, widthCm: 220, depthCm: 60, heightCm: 240, type: "wardrobe", styleTags: ["loft", "modern"], partnerUrl: "https://www.mrdoors.ru/catalog/spalnya/shkafy/", imageSeed: 2003 },
  { sku: "WRD-004", name: "Шкаф Mr.Doors Verona 200×60×240", brand: "Mr.Doors", priceRub: 112800, widthCm: 200, depthCm: 60, heightCm: 240, type: "wardrobe", styleTags: ["neoclassic", "classic"], partnerUrl: "https://www.mrdoors.ru/catalog/spalnya/shkafy/", imageSeed: 2004 },
  { sku: "WRD-005", name: "Шкаф Lazurit Афина 240×65×240", brand: "Lazurit", priceRub: 158000, widthCm: 240, depthCm: 65, heightCm: 240, type: "wardrobe", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/shkafy-spalnya/", imageSeed: 2005 },
  { sku: "WRD-006", name: "Шкаф Lazurit Камилла 180×60×220", brand: "Lazurit", priceRub: 92900, widthCm: 180, depthCm: 60, heightCm: 220, type: "wardrobe", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/shkafy-spalnya/", imageSeed: 2006 },
  { sku: "WRD-007", name: "Шкаф Шатура Kioto 200×55×220", brand: "Шатура", priceRub: 49900, widthCm: 200, depthCm: 55, heightCm: 220, type: "wardrobe", styleTags: ["japandi", "minimalism"], partnerUrl: "https://shatura.com/catalog/spalni/shkafy/", imageSeed: 2007 },
  { sku: "WRD-008", name: "Шкаф Шатура Сканди 160×55×210", brand: "Шатура", priceRub: 38500, widthCm: 160, depthCm: 55, heightCm: 210, type: "wardrobe", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://shatura.com/catalog/spalni/shkafy/", imageSeed: 2008 },
  { sku: "WRD-009", name: "Шкаф ТриЯ Норд 180×55×220", brand: "ТриЯ", priceRub: 28900, widthCm: 180, depthCm: 55, heightCm: 220, type: "wardrobe", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://triya.ru/catalog/spalni/shkafy/", imageSeed: 2009 },
  { sku: "WRD-010", name: "Шкаф ТриЯ Прованс 200×60×220", brand: "ТриЯ", priceRub: 35900, widthCm: 200, depthCm: 60, heightCm: 220, type: "wardrobe", styleTags: ["classic", "neoclassic"], partnerUrl: "https://triya.ru/catalog/spalni/shkafy/", imageSeed: 2010 },
  { sku: "WRD-011", name: "Шкаф Много Мебели Эконом 160×55×210", brand: "Много Мебели", priceRub: 18900, widthCm: 160, depthCm: 55, heightCm: 210, type: "wardrobe", styleTags: ["minimalism", "scandinavian"], partnerUrl: "https://www.mnogomebeli.com/catalog/shkafy/", imageSeed: 2011 },
  { sku: "WRD-012", name: "Шкаф Asko Brooklyn 220×60×240", brand: "Asko", priceRub: 87900, widthCm: 220, depthCm: 60, heightCm: 240, type: "wardrobe", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/shkafy/", imageSeed: 2012 },
  { sku: "WRD-013", name: "Шкаф Divan.ru Stockholm 180×55×220", brand: "Divan.ru", priceRub: 44900, widthCm: 180, depthCm: 55, heightCm: 220, type: "wardrobe", styleTags: ["scandinavian", "modern"], partnerUrl: "https://www.divan.ru/category/shkafy", imageSeed: 2013 },
  { sku: "WRD-014", name: "Шкаф Hoff Trend 100×55×210", brand: "Hoff", priceRub: 16900, widthCm: 100, depthCm: 55, heightCm: 210, type: "wardrobe", styleTags: ["minimalism", "modern"], partnerUrl: "https://hoff.ru/catalog/shkafy_kupe/", imageSeed: 2014 },
  { sku: "WRD-015", name: "Шкаф Орматек Como 200×60×235", brand: "Орматек", priceRub: 71500, widthCm: 200, depthCm: 60, heightCm: 235, type: "wardrobe", styleTags: ["modern", "neoclassic"], partnerUrl: "https://ormatek.com/catalog/shkafy", imageSeed: 2015 },
  { sku: "WRD-016", name: "Шкаф Mr.Doors Tokyo 200×60×240", brand: "Mr.Doors", priceRub: 134900, widthCm: 200, depthCm: 60, heightCm: 240, type: "wardrobe", styleTags: ["japandi", "minimalism"], partnerUrl: "https://www.mrdoors.ru/catalog/spalnya/shkafy/", imageSeed: 2016 },
  { sku: "WRD-017", name: "Шкаф Hoff Brick Loft 180×60×220", brand: "Hoff", priceRub: 36500, widthCm: 180, depthCm: 60, heightCm: 220, type: "wardrobe", styleTags: ["loft", "modern"], partnerUrl: "https://hoff.ru/catalog/shkafy_kupe/", imageSeed: 2017 },
  { sku: "WRD-018", name: "Шкаф Lazurit Анжелика 160×60×220", brand: "Lazurit", priceRub: 78400, widthCm: 160, depthCm: 60, heightCm: 220, type: "wardrobe", styleTags: ["neoclassic", "classic"], partnerUrl: "https://lazurit.com/catalog/spalni/shkafy-spalnya/", imageSeed: 2018 },
  { sku: "WRD-019", name: "Шкаф Орматек Tatami 150×55×200", brand: "Орматек", priceRub: 48900, widthCm: 150, depthCm: 55, heightCm: 200, type: "wardrobe", styleTags: ["japandi", "minimalism"], partnerUrl: "https://ormatek.com/catalog/shkafy", imageSeed: 2019 },
  { sku: "WRD-020", name: "Шкаф Аскона Smart Storage 200×60×240", brand: "Аскона", priceRub: 65900, widthCm: 200, depthCm: 60, heightCm: 240, type: "wardrobe", styleTags: ["modern", "scandinavian"], partnerUrl: "https://www.askona.ru/shkafy/", imageSeed: 2020 },

  // ── NIGHTSTANDS (18) ──────────────────────────────────────────────────
  { sku: "NST-001", name: "Тумба прикроватная Hoff Smart 50×40×50", brand: "Hoff", priceRub: 5900, widthCm: 50, depthCm: 40, heightCm: 50, type: "nightstand", styleTags: ["modern", "minimalism"], partnerUrl: "https://hoff.ru/catalog/tumboshki_prikrovatnye/", imageSeed: 3001 },
  { sku: "NST-002", name: "Тумба прикроватная Hoff Concept 45×40×45", brand: "Hoff", priceRub: 7400, widthCm: 45, depthCm: 40, heightCm: 45, type: "nightstand", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://hoff.ru/catalog/tumboshki_prikrovatnye/", imageSeed: 3002 },
  { sku: "NST-003", name: "Тумба Аскона Mia 50×42×52", brand: "Аскона", priceRub: 6900, widthCm: 50, depthCm: 42, heightCm: 52, type: "nightstand", styleTags: ["scandinavian", "japandi"], partnerUrl: "https://www.askona.ru/tumby/", imageSeed: 3003 },
  { sku: "NST-004", name: "Тумба Орматек Como 55×42×55", brand: "Орматек", priceRub: 8900, widthCm: 55, depthCm: 42, heightCm: 55, type: "nightstand", styleTags: ["modern", "neoclassic"], partnerUrl: "https://ormatek.com/catalog/tumby", imageSeed: 3004 },
  { sku: "NST-005", name: "Тумба Орматек Verona 55×42×55", brand: "Орматек", priceRub: 11200, widthCm: 55, depthCm: 42, heightCm: 55, type: "nightstand", styleTags: ["neoclassic", "classic"], partnerUrl: "https://ormatek.com/catalog/tumby", imageSeed: 3005 },
  { sku: "NST-006", name: "Тумба Lazurit Камилла 55×45×60", brand: "Lazurit", priceRub: 24500, widthCm: 55, depthCm: 45, heightCm: 60, type: "nightstand", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/tumby-prikrovatnye/", imageSeed: 3006 },
  { sku: "NST-007", name: "Тумба Lazurit Версаль 60×45×60", brand: "Lazurit", priceRub: 32900, widthCm: 60, depthCm: 45, heightCm: 60, type: "nightstand", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/tumby-prikrovatnye/", imageSeed: 3007 },
  { sku: "NST-008", name: "Тумба Шатура Kioto 50×40×50", brand: "Шатура", priceRub: 9800, widthCm: 50, depthCm: 40, heightCm: 50, type: "nightstand", styleTags: ["japandi", "minimalism"], partnerUrl: "https://shatura.com/catalog/spalni/tumby-prikrovatnye/", imageSeed: 3008 },
  { sku: "NST-009", name: "Тумба Шатура Сканди 45×40×45", brand: "Шатура", priceRub: 7900, widthCm: 45, depthCm: 40, heightCm: 45, type: "nightstand", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://shatura.com/catalog/spalni/tumby-prikrovatnye/", imageSeed: 3009 },
  { sku: "NST-010", name: "Тумба ТриЯ Норд 50×40×52", brand: "ТриЯ", priceRub: 5500, widthCm: 50, depthCm: 40, heightCm: 52, type: "nightstand", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://triya.ru/catalog/spalni/tumby/", imageSeed: 3010 },
  { sku: "NST-011", name: "Тумба ТриЯ Прованс 55×40×55", brand: "ТриЯ", priceRub: 7200, widthCm: 55, depthCm: 40, heightCm: 55, type: "nightstand", styleTags: ["classic", "neoclassic"], partnerUrl: "https://triya.ru/catalog/spalni/tumby/", imageSeed: 3011 },
  { sku: "NST-012", name: "Тумба Asko Brooklyn 55×42×55", brand: "Asko", priceRub: 14900, widthCm: 55, depthCm: 42, heightCm: 55, type: "nightstand", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/tumby/", imageSeed: 3012 },
  { sku: "NST-013", name: "Тумба Asko Industrial 50×40×50", brand: "Asko", priceRub: 11900, widthCm: 50, depthCm: 40, heightCm: 50, type: "nightstand", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/tumby/", imageSeed: 3013 },
  { sku: "NST-014", name: "Тумба Mr.Doors Soho 50×40×52", brand: "Mr.Doors", priceRub: 16900, widthCm: 50, depthCm: 40, heightCm: 52, type: "nightstand", styleTags: ["loft", "modern"], partnerUrl: "https://www.mrdoors.ru/catalog/spalnya/tumby/", imageSeed: 3014 },
  { sku: "NST-015", name: "Тумба Divan.ru Mellow 45×40×45", brand: "Divan.ru", priceRub: 8400, widthCm: 45, depthCm: 40, heightCm: 45, type: "nightstand", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://www.divan.ru/category/tumby", imageSeed: 3015 },
  { sku: "NST-016", name: "Тумба Divan.ru Tokyo 50×42×50", brand: "Divan.ru", priceRub: 11200, widthCm: 50, depthCm: 42, heightCm: 50, type: "nightstand", styleTags: ["japandi", "modern"], partnerUrl: "https://www.divan.ru/category/tumby", imageSeed: 3016 },
  { sku: "NST-017", name: "Тумба Много Мебели Эко 50×40×50", brand: "Много Мебели", priceRub: 4200, widthCm: 50, depthCm: 40, heightCm: 50, type: "nightstand", styleTags: ["minimalism", "scandinavian"], partnerUrl: "https://www.mnogomebeli.com/catalog/tumby/", imageSeed: 3017 },
  { sku: "NST-018", name: "Тумба Hoff Trend Loft 50×40×50", brand: "Hoff", priceRub: 7900, widthCm: 50, depthCm: 40, heightCm: 50, type: "nightstand", styleTags: ["loft", "modern"], partnerUrl: "https://hoff.ru/catalog/tumboshki_prikrovatnye/", imageSeed: 3018 },

  // ── DESKS (14) ────────────────────────────────────────────────────────
  { sku: "DSK-001", name: "Стол письменный Hoff Smart 120×60×75", brand: "Hoff", priceRub: 9900, widthCm: 120, depthCm: 60, heightCm: 75, type: "desk", styleTags: ["modern", "minimalism"], partnerUrl: "https://hoff.ru/catalog/stoly_pismennye/", imageSeed: 4001 },
  { sku: "DSK-002", name: "Стол письменный Hoff Concept 140×60×75", brand: "Hoff", priceRub: 13500, widthCm: 140, depthCm: 60, heightCm: 75, type: "desk", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://hoff.ru/catalog/stoly_pismennye/", imageSeed: 4002 },
  { sku: "DSK-003", name: "Стол письменный Шатура Kioto 130×60×75", brand: "Шатура", priceRub: 14900, widthCm: 130, depthCm: 60, heightCm: 75, type: "desk", styleTags: ["japandi", "minimalism"], partnerUrl: "https://shatura.com/catalog/kabinet/stoly/", imageSeed: 4003 },
  { sku: "DSK-004", name: "Стол письменный Шатура Сканди 120×55×75", brand: "Шатура", priceRub: 11900, widthCm: 120, depthCm: 55, heightCm: 75, type: "desk", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://shatura.com/catalog/kabinet/stoly/", imageSeed: 4004 },
  { sku: "DSK-005", name: "Стол ТриЯ Норд 110×55×75", brand: "ТриЯ", priceRub: 8900, widthCm: 110, depthCm: 55, heightCm: 75, type: "desk", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://triya.ru/catalog/kabinet/stoly/", imageSeed: 4005 },
  { sku: "DSK-006", name: "Стол ТриЯ Прованс 130×60×76", brand: "ТриЯ", priceRub: 12500, widthCm: 130, depthCm: 60, heightCm: 76, type: "desk", styleTags: ["classic", "neoclassic"], partnerUrl: "https://triya.ru/catalog/kabinet/stoly/", imageSeed: 4006 },
  { sku: "DSK-007", name: "Стол Lazurit Анжелика 130×65×76", brand: "Lazurit", priceRub: 38900, widthCm: 130, depthCm: 65, heightCm: 76, type: "desk", styleTags: ["neoclassic", "classic"], partnerUrl: "https://lazurit.com/catalog/kabinet/stoly/", imageSeed: 4007 },
  { sku: "DSK-008", name: "Стол Lazurit Версаль 140×65×76", brand: "Lazurit", priceRub: 52900, widthCm: 140, depthCm: 65, heightCm: 76, type: "desk", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/kabinet/stoly/", imageSeed: 4008 },
  { sku: "DSK-009", name: "Стол Asko Brooklyn 140×65×75", brand: "Asko", priceRub: 27900, widthCm: 140, depthCm: 65, heightCm: 75, type: "desk", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/stoly/", imageSeed: 4009 },
  { sku: "DSK-010", name: "Стол Asko Industrial 120×60×75", brand: "Asko", priceRub: 22900, widthCm: 120, depthCm: 60, heightCm: 75, type: "desk", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/stoly/", imageSeed: 4010 },
  { sku: "DSK-011", name: "Стол Орматек Como 130×60×75", brand: "Орматек", priceRub: 18900, widthCm: 130, depthCm: 60, heightCm: 75, type: "desk", styleTags: ["modern", "neoclassic"], partnerUrl: "https://ormatek.com/catalog/stoly", imageSeed: 4011 },
  { sku: "DSK-012", name: "Стол Орматек Tatami 110×55×72", brand: "Орматек", priceRub: 16400, widthCm: 110, depthCm: 55, heightCm: 72, type: "desk", styleTags: ["japandi", "minimalism"], partnerUrl: "https://ormatek.com/catalog/stoly", imageSeed: 4012 },
  { sku: "DSK-013", name: "Стол Divan.ru Loft Brick 130×60×75", brand: "Divan.ru", priceRub: 19900, widthCm: 130, depthCm: 60, heightCm: 75, type: "desk", styleTags: ["loft", "modern"], partnerUrl: "https://www.divan.ru/category/stoly", imageSeed: 4013 },
  { sku: "DSK-014", name: "Стол Mr.Doors Tokyo 120×55×72", brand: "Mr.Doors", priceRub: 32900, widthCm: 120, depthCm: 55, heightCm: 72, type: "desk", styleTags: ["japandi", "minimalism"], partnerUrl: "https://www.mrdoors.ru/catalog/spalnya/stoly/", imageSeed: 4014 },

  // ── CHAIRS (14) ───────────────────────────────────────────────────────
  { sku: "CHR-001", name: "Стул Hoff Smart 50×55×85", brand: "Hoff", priceRub: 4900, widthCm: 50, depthCm: 55, heightCm: 85, type: "chair", styleTags: ["modern", "minimalism"], partnerUrl: "https://hoff.ru/catalog/stulya/", imageSeed: 5001 },
  { sku: "CHR-002", name: "Стул Hoff Concept 50×55×85", brand: "Hoff", priceRub: 6900, widthCm: 50, depthCm: 55, heightCm: 85, type: "chair", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://hoff.ru/catalog/stulya/", imageSeed: 5002 },
  { sku: "CHR-003", name: "Стул Шатура Kioto 45×52×88", brand: "Шатура", priceRub: 7900, widthCm: 45, depthCm: 52, heightCm: 88, type: "chair", styleTags: ["japandi", "minimalism"], partnerUrl: "https://shatura.com/catalog/stulya/", imageSeed: 5003 },
  { sku: "CHR-004", name: "Стул Шатура Сканди 45×50×85", brand: "Шатура", priceRub: 5400, widthCm: 45, depthCm: 50, heightCm: 85, type: "chair", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://shatura.com/catalog/stulya/", imageSeed: 5004 },
  { sku: "CHR-005", name: "Стул ТриЯ Норд 48×52×86", brand: "ТриЯ", priceRub: 4200, widthCm: 48, depthCm: 52, heightCm: 86, type: "chair", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://triya.ru/catalog/stulya/", imageSeed: 5005 },
  { sku: "CHR-006", name: "Стул ТриЯ Прованс 50×54×96", brand: "ТриЯ", priceRub: 6900, widthCm: 50, depthCm: 54, heightCm: 96, type: "chair", styleTags: ["classic", "neoclassic"], partnerUrl: "https://triya.ru/catalog/stulya/", imageSeed: 5006 },
  { sku: "CHR-007", name: "Стул Lazurit Анжелика 52×56×98", brand: "Lazurit", priceRub: 18900, widthCm: 52, depthCm: 56, heightCm: 98, type: "chair", styleTags: ["neoclassic", "classic"], partnerUrl: "https://lazurit.com/catalog/stulya/", imageSeed: 5007 },
  { sku: "CHR-008", name: "Стул Lazurit Версаль 55×58×100", brand: "Lazurit", priceRub: 24900, widthCm: 55, depthCm: 58, heightCm: 100, type: "chair", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/stulya/", imageSeed: 5008 },
  { sku: "CHR-009", name: "Стул Asko Brooklyn 50×55×85", brand: "Asko", priceRub: 11400, widthCm: 50, depthCm: 55, heightCm: 85, type: "chair", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/stulya/", imageSeed: 5009 },
  { sku: "CHR-010", name: "Стул Asko Industrial 48×52×84", brand: "Asko", priceRub: 9400, widthCm: 48, depthCm: 52, heightCm: 84, type: "chair", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/stulya/", imageSeed: 5010 },
  { sku: "CHR-011", name: "Стул Divan.ru Loft Bar 45×50×84", brand: "Divan.ru", priceRub: 8900, widthCm: 45, depthCm: 50, heightCm: 84, type: "chair", styleTags: ["loft", "modern"], partnerUrl: "https://www.divan.ru/category/stulya", imageSeed: 5011 },
  { sku: "CHR-012", name: "Стул Divan.ru Mellow 47×52×85", brand: "Divan.ru", priceRub: 7400, widthCm: 47, depthCm: 52, heightCm: 85, type: "chair", styleTags: ["scandinavian", "modern"], partnerUrl: "https://www.divan.ru/category/stulya", imageSeed: 5012 },
  { sku: "CHR-013", name: "Стул Орматек Tokyo 45×50×82", brand: "Орматек", priceRub: 8900, widthCm: 45, depthCm: 50, heightCm: 82, type: "chair", styleTags: ["japandi", "modern"], partnerUrl: "https://ormatek.com/catalog/stulya", imageSeed: 5013 },
  { sku: "CHR-014", name: "Стул Hoff Brick Loft 50×55×88", brand: "Hoff", priceRub: 7400, widthCm: 50, depthCm: 55, heightCm: 88, type: "chair", styleTags: ["loft", "modern"], partnerUrl: "https://hoff.ru/catalog/stulya/", imageSeed: 5014 },

  // ── DRESSERS (14) ─────────────────────────────────────────────────────
  { sku: "DRS-001", name: "Комод Hoff Smart 100×45×85", brand: "Hoff", priceRub: 13900, widthCm: 100, depthCm: 45, heightCm: 85, type: "dresser", styleTags: ["modern", "minimalism"], partnerUrl: "https://hoff.ru/catalog/komody/", imageSeed: 6001 },
  { sku: "DRS-002", name: "Комод Hoff Concept 120×50×90", brand: "Hoff", priceRub: 18900, widthCm: 120, depthCm: 50, heightCm: 90, type: "dresser", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://hoff.ru/catalog/komody/", imageSeed: 6002 },
  { sku: "DRS-003", name: "Комод Аскона Mia 110×45×85", brand: "Аскона", priceRub: 14500, widthCm: 110, depthCm: 45, heightCm: 85, type: "dresser", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://www.askona.ru/komody/", imageSeed: 6003 },
  { sku: "DRS-004", name: "Комод Орматек Como 130×50×95", brand: "Орматек", priceRub: 24900, widthCm: 130, depthCm: 50, heightCm: 95, type: "dresser", styleTags: ["modern", "neoclassic"], partnerUrl: "https://ormatek.com/catalog/komody", imageSeed: 6004 },
  { sku: "DRS-005", name: "Комод Орматек Verona 140×52×100", brand: "Орматек", priceRub: 32900, widthCm: 140, depthCm: 52, heightCm: 100, type: "dresser", styleTags: ["neoclassic", "classic"], partnerUrl: "https://ormatek.com/catalog/komody", imageSeed: 6005 },
  { sku: "DRS-006", name: "Комод Lazurit Камилла 140×55×105", brand: "Lazurit", priceRub: 56900, widthCm: 140, depthCm: 55, heightCm: 105, type: "dresser", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/komody/", imageSeed: 6006 },
  { sku: "DRS-007", name: "Комод Lazurit Версаль 150×55×110", brand: "Lazurit", priceRub: 72900, widthCm: 150, depthCm: 55, heightCm: 110, type: "dresser", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/komody/", imageSeed: 6007 },
  { sku: "DRS-008", name: "Комод Шатура Kioto 110×45×85", brand: "Шатура", priceRub: 18900, widthCm: 110, depthCm: 45, heightCm: 85, type: "dresser", styleTags: ["japandi", "minimalism"], partnerUrl: "https://shatura.com/catalog/spalni/komody/", imageSeed: 6008 },
  { sku: "DRS-009", name: "Комод Шатура Сканди 100×45×85", brand: "Шатура", priceRub: 15900, widthCm: 100, depthCm: 45, heightCm: 85, type: "dresser", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://shatura.com/catalog/spalni/komody/", imageSeed: 6009 },
  { sku: "DRS-010", name: "Комод ТриЯ Прованс 120×45×90", brand: "ТриЯ", priceRub: 13900, widthCm: 120, depthCm: 45, heightCm: 90, type: "dresser", styleTags: ["classic", "neoclassic"], partnerUrl: "https://triya.ru/catalog/spalni/komody/", imageSeed: 6010 },
  { sku: "DRS-011", name: "Комод ТриЯ Норд 110×45×85", brand: "ТриЯ", priceRub: 11900, widthCm: 110, depthCm: 45, heightCm: 85, type: "dresser", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://triya.ru/catalog/spalni/komody/", imageSeed: 6011 },
  { sku: "DRS-012", name: "Комод Asko Brooklyn 130×50×95", brand: "Asko", priceRub: 38900, widthCm: 130, depthCm: 50, heightCm: 95, type: "dresser", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/komody/", imageSeed: 6012 },
  { sku: "DRS-013", name: "Комод Mr.Doors Soho 120×45×90", brand: "Mr.Doors", priceRub: 44900, widthCm: 120, depthCm: 45, heightCm: 90, type: "dresser", styleTags: ["loft", "modern"], partnerUrl: "https://www.mrdoors.ru/catalog/spalnya/komody/", imageSeed: 6013 },
  { sku: "DRS-014", name: "Комод Divan.ru Tokyo 110×45×85", brand: "Divan.ru", priceRub: 21900, widthCm: 110, depthCm: 45, heightCm: 85, type: "dresser", styleTags: ["japandi", "modern"], partnerUrl: "https://www.divan.ru/category/komody", imageSeed: 6014 },

  // ── SHELVES (14) ──────────────────────────────────────────────────────
  { sku: "SHF-001", name: "Стеллаж Hoff Smart 80×30×180", brand: "Hoff", priceRub: 6900, widthCm: 80, depthCm: 30, heightCm: 180, type: "shelf", styleTags: ["modern", "minimalism"], partnerUrl: "https://hoff.ru/catalog/stellazhi/", imageSeed: 7001 },
  { sku: "SHF-002", name: "Стеллаж Hoff Concept 100×35×200", brand: "Hoff", priceRub: 11900, widthCm: 100, depthCm: 35, heightCm: 200, type: "shelf", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://hoff.ru/catalog/stellazhi/", imageSeed: 7002 },
  { sku: "SHF-003", name: "Стеллаж Шатура Kioto 90×30×190", brand: "Шатура", priceRub: 12900, widthCm: 90, depthCm: 30, heightCm: 190, type: "shelf", styleTags: ["japandi", "minimalism"], partnerUrl: "https://shatura.com/catalog/stellazhi/", imageSeed: 7003 },
  { sku: "SHF-004", name: "Стеллаж Шатура Сканди 80×30×180", brand: "Шатура", priceRub: 9900, widthCm: 80, depthCm: 30, heightCm: 180, type: "shelf", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://shatura.com/catalog/stellazhi/", imageSeed: 7004 },
  { sku: "SHF-005", name: "Стеллаж ТриЯ Норд 80×30×180", brand: "ТриЯ", priceRub: 6500, widthCm: 80, depthCm: 30, heightCm: 180, type: "shelf", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://triya.ru/catalog/stellazhi/", imageSeed: 7005 },
  { sku: "SHF-006", name: "Стеллаж ТриЯ Прованс 90×35×190", brand: "ТриЯ", priceRub: 9900, widthCm: 90, depthCm: 35, heightCm: 190, type: "shelf", styleTags: ["classic", "neoclassic"], partnerUrl: "https://triya.ru/catalog/stellazhi/", imageSeed: 7006 },
  { sku: "SHF-007", name: "Стеллаж Lazurit Камилла 100×35×200", brand: "Lazurit", priceRub: 38900, widthCm: 100, depthCm: 35, heightCm: 200, type: "shelf", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/stellazhi/", imageSeed: 7007 },
  { sku: "SHF-008", name: "Стеллаж Lazurit Версаль 110×40×210", brand: "Lazurit", priceRub: 52900, widthCm: 110, depthCm: 40, heightCm: 210, type: "shelf", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/spalni/stellazhi/", imageSeed: 7008 },
  { sku: "SHF-009", name: "Стеллаж Asko Brooklyn 100×35×200", brand: "Asko", priceRub: 24900, widthCm: 100, depthCm: 35, heightCm: 200, type: "shelf", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/stellazhi/", imageSeed: 7009 },
  { sku: "SHF-010", name: "Стеллаж Asko Industrial 120×35×210", brand: "Asko", priceRub: 32900, widthCm: 120, depthCm: 35, heightCm: 210, type: "shelf", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/stellazhi/", imageSeed: 7010 },
  { sku: "SHF-011", name: "Стеллаж Divan.ru Loft Brick 100×35×200", brand: "Divan.ru", priceRub: 18900, widthCm: 100, depthCm: 35, heightCm: 200, type: "shelf", styleTags: ["loft", "modern"], partnerUrl: "https://www.divan.ru/category/stellazhi", imageSeed: 7011 },
  { sku: "SHF-012", name: "Стеллаж Divan.ru Mellow 80×30×180", brand: "Divan.ru", priceRub: 12900, widthCm: 80, depthCm: 30, heightCm: 180, type: "shelf", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://www.divan.ru/category/stellazhi", imageSeed: 7012 },
  { sku: "SHF-013", name: "Стеллаж Орматек Como 90×30×190", brand: "Орматек", priceRub: 14900, widthCm: 90, depthCm: 30, heightCm: 190, type: "shelf", styleTags: ["modern", "neoclassic"], partnerUrl: "https://ormatek.com/catalog/stellazhi", imageSeed: 7013 },
  { sku: "SHF-014", name: "Стеллаж Орматек Tatami 100×30×180", brand: "Орматек", priceRub: 17900, widthCm: 100, depthCm: 30, heightCm: 180, type: "shelf", styleTags: ["japandi", "minimalism"], partnerUrl: "https://ormatek.com/catalog/stellazhi", imageSeed: 7014 },

  // ── RUGS (14) ─────────────────────────────────────────────────────────
  { sku: "RUG-001", name: "Ковёр Hoff Trend 160×230 однотонный", brand: "Hoff", priceRub: 6900, widthCm: 160, depthCm: 230, heightCm: 2, type: "rug", styleTags: ["modern", "minimalism"], partnerUrl: "https://hoff.ru/catalog/kovry/", imageSeed: 8001 },
  { sku: "RUG-002", name: "Ковёр Hoff Concept 200×290 нейтральный беж", brand: "Hoff", priceRub: 13900, widthCm: 200, depthCm: 290, heightCm: 2, type: "rug", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://hoff.ru/catalog/kovry/", imageSeed: 8002 },
  { sku: "RUG-003", name: "Ковёр Hoff Loft 160×230 джутовый", brand: "Hoff", priceRub: 10900, widthCm: 160, depthCm: 230, heightCm: 1, type: "rug", styleTags: ["loft", "modern"], partnerUrl: "https://hoff.ru/catalog/kovry/", imageSeed: 8003 },
  { sku: "RUG-004", name: "Ковёр Шатура Сканди 160×230 шерстяной", brand: "Шатура", priceRub: 14900, widthCm: 160, depthCm: 230, heightCm: 2, type: "rug", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://shatura.com/catalog/kovry/", imageSeed: 8004 },
  { sku: "RUG-005", name: "Ковёр Шатура Kioto 200×300 натуральный сизаль", brand: "Шатура", priceRub: 18900, widthCm: 200, depthCm: 300, heightCm: 1, type: "rug", styleTags: ["japandi", "minimalism"], partnerUrl: "https://shatura.com/catalog/kovry/", imageSeed: 8005 },
  { sku: "RUG-006", name: "Ковёр ТриЯ Прованс 200×290 с орнаментом", brand: "ТриЯ", priceRub: 11900, widthCm: 200, depthCm: 290, heightCm: 2, type: "rug", styleTags: ["classic", "neoclassic"], partnerUrl: "https://triya.ru/catalog/kovry/", imageSeed: 8006 },
  { sku: "RUG-007", name: "Ковёр ТриЯ Норд 160×230 геометрия", brand: "ТриЯ", priceRub: 8900, widthCm: 160, depthCm: 230, heightCm: 2, type: "rug", styleTags: ["scandinavian", "modern"], partnerUrl: "https://triya.ru/catalog/kovry/", imageSeed: 8007 },
  { sku: "RUG-008", name: "Ковёр Lazurit Версаль 200×300 классический", brand: "Lazurit", priceRub: 38900, widthCm: 200, depthCm: 300, heightCm: 2, type: "rug", styleTags: ["classic", "neoclassic"], partnerUrl: "https://lazurit.com/catalog/dekor/kovry/", imageSeed: 8008 },
  { sku: "RUG-009", name: "Ковёр Lazurit Анжелика 160×230 c вензелями", brand: "Lazurit", priceRub: 28900, widthCm: 160, depthCm: 230, heightCm: 2, type: "rug", styleTags: ["neoclassic", "classic"], partnerUrl: "https://lazurit.com/catalog/dekor/kovry/", imageSeed: 8009 },
  { sku: "RUG-010", name: "Ковёр Asko Brooklyn 200×290 винтажный", brand: "Asko", priceRub: 22900, widthCm: 200, depthCm: 290, heightCm: 2, type: "rug", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/kovry/", imageSeed: 8010 },
  { sku: "RUG-011", name: "Ковёр Asko Industrial 160×230 кожаный пэчворк", brand: "Asko", priceRub: 34900, widthCm: 160, depthCm: 230, heightCm: 2, type: "rug", styleTags: ["loft", "modern"], partnerUrl: "https://www.asko.ru/kovry/", imageSeed: 8011 },
  { sku: "RUG-012", name: "Ковёр Divan.ru Mellow 200×290 пастельный", brand: "Divan.ru", priceRub: 14900, widthCm: 200, depthCm: 290, heightCm: 2, type: "rug", styleTags: ["scandinavian", "minimalism"], partnerUrl: "https://www.divan.ru/category/kovry", imageSeed: 8012 },
  { sku: "RUG-013", name: "Ковёр Divan.ru Tokyo 160×230 шёлковый", brand: "Divan.ru", priceRub: 19900, widthCm: 160, depthCm: 230, heightCm: 2, type: "rug", styleTags: ["japandi", "modern"], partnerUrl: "https://www.divan.ru/category/kovry", imageSeed: 8013 },
  { sku: "RUG-014", name: "Ковёр Орматек Como 200×290 однотонный графит", brand: "Орматек", priceRub: 16900, widthCm: 200, depthCm: 290, heightCm: 2, type: "rug", styleTags: ["modern", "neoclassic"], partnerUrl: "https://ormatek.com/catalog/kovry", imageSeed: 8014 },
];

// Экспортируем массив, чтобы тесты или другие сиды могли проверить покрытие
// без обращения к БД.
export { FURNITURE_SEED };
export type { SeedRow, StyleTag, FurnitureType };

// ──────────────────────────────────────────────────────────────────────────
// Insert helpers
// ──────────────────────────────────────────────────────────────────────────

function toInsertRow(row: SeedRow): InsertFurnitureProduct {
  return {
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    priceKopeks: row.priceRub * 100,
    widthCm: row.widthCm,
    depthCm: row.depthCm,
    heightCm: row.heightCm,
    type: row.type,
    styleTags: row.styleTags,
    // Каталог MVP — только bedroom (Requirement 10.2). Если в будущем
    // SKU становится универсальным (например, ковёр для living_room),
    // достаточно дописать тип помещения в этот массив без миграции.
    roomTypes: ["bedroom"],
    imageUrl: imageUrlFor(row.type, row.imageSeed),
    partnerUrl: row.partnerUrl,
    isAvailable: true,
  };
}

export interface SeedResult {
  totalRows: number;
  inserted: number;
  updated: number;
  byType: Record<string, number>;
  byStyle: Record<string, number>;
}

/**
 * Идемпотентный сид. При повторном запуске обновляет все поля по `sku`.
 *
 * `count_kind` (`inserted`/`updated`) — это просто статистика для лога.
 * Postgres сам определяет, был ли row до этого, через `xmax = 0` —
 * стандартный приём для возврата INSERT vs UPDATE из `RETURNING`. Это
 * самое дешёвое решение, без отдельного `SELECT`.
 */
export async function seedFurnitureProducts(opts: {
  dryRun: boolean;
}): Promise<SeedResult> {
  const rows = FURNITURE_SEED.map(toInsertRow);

  // Sanity-check каталога: дубль SKU в массиве — это ошибка разработчика,
  // которую лучше поймать до запроса в БД, потому что `INSERT ... VALUES (...),(...)`
  // с одним sku кинет ошибку Postgres, и сообщение будет менее полезным.
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.sku)) {
      throw new Error(`[seedFurniture] duplicate SKU in seed array: ${r.sku}`);
    }
    seen.add(r.sku);
  }

  const byType: Record<string, number> = {};
  const byStyle: Record<string, number> = {};
  for (const r of FURNITURE_SEED) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    for (const s of r.styleTags) {
      byStyle[s] = (byStyle[s] ?? 0) + 1;
    }
  }

  if (opts.dryRun) {
    return {
      totalRows: rows.length,
      inserted: 0,
      updated: 0,
      byType,
      byStyle,
    };
  }

  // Drizzle поддерживает `onConflictDoUpdate` с `target` колонкой и `set`.
  // Используем `sql` с `excluded.<col>`, потому что Drizzle прокидывает
  // EXCLUDED как `excluded` без алиаса. `updated_at = NOW()` нужен, чтобы
  // апдейт всегда тыкал timestamp, даже если данные совпадают (Postgres
  // сам по себе DO UPDATE дёрнет write — поэтому мы и тыкаем).
  const inserted = await db
    .insert(furnitureProductsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: furnitureProductsTable.sku,
      set: {
        name: sql`excluded.name`,
        brand: sql`excluded.brand`,
        priceKopeks: sql`excluded.price_kopeks`,
        widthCm: sql`excluded.width_cm`,
        depthCm: sql`excluded.depth_cm`,
        heightCm: sql`excluded.height_cm`,
        type: sql`excluded.type`,
        styleTags: sql`excluded.style_tags`,
        roomTypes: sql`excluded.room_types`,
        imageUrl: sql`excluded.image_url`,
        partnerUrl: sql`excluded.partner_url`,
        isAvailable: sql`excluded.is_available`,
        updatedAt: sql`NOW()`,
      },
    })
    // `xmax = 0` означает «строка только что вставлена, не апдейтилась».
    // Используем для подсчёта inserted vs updated в одном запросе.
    .returning({ sku: furnitureProductsTable.sku, xmax: sql<string>`xmax::text` });

  let insertedCount = 0;
  let updatedCount = 0;
  for (const row of inserted) {
    if (row.xmax === "0") insertedCount++;
    else updatedCount++;
  }

  return {
    totalRows: rows.length,
    inserted: insertedCount,
    updated: updatedCount,
    byType,
    byStyle,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// CLI entry point
// ──────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  if (!process.env["DATABASE_URL"] && !dryRun) {
    console.error(
      "[seedFurniture] DATABASE_URL is not set. Re-run with --dry-run to preview only.",
    );
    process.exit(1);
  }

  console.log(
    `[seedFurniture] mode=${dryRun ? "DRY-RUN" : "APPLY"} rows=${FURNITURE_SEED.length}`,
  );

  const result = await seedFurnitureProducts({ dryRun });

  console.log(`  total rows: ${result.totalRows}`);
  console.log(`  by type:`);
  for (const [t, n] of Object.entries(result.byType).sort()) {
    console.log(`    ${t.padEnd(12)} ${n}`);
  }
  console.log(`  by style (a SKU may count in multiple styles):`);
  for (const [s, n] of Object.entries(result.byStyle).sort()) {
    console.log(`    ${s.padEnd(14)} ${n}`);
  }

  if (dryRun) {
    console.log("[seedFurniture] DRY-RUN complete; no DB writes performed.");
    return;
  }

  console.log(
    `[seedFurniture] applied: inserted=${result.inserted} updated=${result.updated}`,
  );
}

// Main guard — позволяет импортировать модуль (`FURNITURE_SEED`,
// `seedFurnitureProducts`) из тестов или других сидов, не запуская при этом
// CLI-эффекты вроде `process.exit`.
//
// На Windows `process.argv[1]` приходит как backslash-путь
// (`C:\…\seedFurniture.ts`), а `import.meta.url` — как URL
// (`file:///C:/…/seedFurniture.ts`). `pathToFileURL` нормализует обе
// формы и делает сравнение корректным на любом ОС.
const { pathToFileURL } = await import("node:url");
const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[seedFurniture] fatal:", err);
      try {
        await pool.end();
      } catch {
        // pool already closed — ignore
      }
      process.exit(1);
    });
}
