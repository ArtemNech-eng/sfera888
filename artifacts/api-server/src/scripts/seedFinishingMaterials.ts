/**
 * Сид каталога `finishing_materials` для AI_Design_Product (Requirement 11.1).
 *
 * Запускается вручную или из CI/CD после миграции
 * `2026-01-15-ai-design-product.sql`:
 *   `pnpm --filter @workspace/api-server tsx src/scripts/seedFinishingMaterials.ts`
 *
 * Что делает:
 *   • Заливает фиксированный набор SKU отделочных материалов в таблицу
 *     `finishing_materials` через `INSERT ... ON CONFLICT (sku) DO UPDATE`.
 *   • Идемпотентно: повторный запуск обновляет цены/доступность/тэги тех
 *     же SKU и не создаёт дубликатов (constraint `finishing_materials_sku_key`).
 *   • Покрывает все 7 поддерживаемых стилей × 4 категории
 *     (`walls`/`floor`/`ceiling`/`other`) — для каждой пары есть как
 *     минимум один доступный SKU с `room_types ⊃ {bedroom}`. Это
 *     гарантирует, что `Materials_Estimator` (lib/materialsEstimator.ts)
 *     находит хотя бы один кандидат на каждой `pickCheapestForCategory`
 *     при любой комбинации `(roomType=bedroom, style ∈ 7)`.
 *
 * Структура цен (см. Requirement 11.1, дизайн §Materials_Estimator):
 *   • Категории `walls`/`floor`/`ceiling` — `unit='sqm'`, цена в копейках
 *     за 1 м² поверхности.
 *   • Категория `other` — `unit='pcs'`, цена в копейках за единицу
 *     (плинтус, светильник, молдинг и т.п.).
 *
 * `style_tags` для каждого SKU — список совместимых стилей по таблице
 * совместимости из `lib/furnitureMatcher.ts` (`getCompatibleStyles`).
 * Для `Materials_Estimator` это означает, что один SKU может покрывать
 * сразу несколько стилей (например, краска Tikkurila Optiva подходит
 * для `modern` ∪ `minimalism` ∪ `scandinavian`).
 */

import { db, pool, finishingMaterialsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

type FinishingCategory = "walls" | "floor" | "ceiling" | "other";
type FinishingUnit = "sqm" | "pcs";

interface SeedRow {
  sku: string;
  name: string;
  brand: string | null;
  category: FinishingCategory;
  unit: FinishingUnit;
  /** Цена за единицу в копейках. */
  pricePerUnitKopeks: number;
  styleTags: string[];
  roomTypes: string[];
  partnerUrl: string | null;
  isAvailable: boolean;
}

/** Расширенный набор типов помещений для отделки (для будущих итераций). */
const ALL_LIVING_ROOMS = ["bedroom", "living_room", "kids_room"];
const FLOOR_WET_ROOMS = ["bedroom", "living_room", "kids_room", "kitchen", "hallway"];
const CEILING_UNIVERSAL = ["bedroom", "living_room", "kids_room", "kitchen", "hallway"];

/** Все room_types обязательно содержат `bedroom` (Requirement 11.1, MVP-гейт). */
const ROWS: SeedRow[] = [
  // ────────────────────────── WALLS (sqm) ──────────────────────────
  {
    sku: "WALL-TIK-OPTIVA-5-WHITE",
    name: "Краска интерьерная Optiva 5, матовая, белая",
    brand: "Tikkurila",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 60_000, // 600 ₽/м²
    styleTags: ["modern", "minimalism", "scandinavian"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.tikkurila.ru/optiva-5",
    isAvailable: true,
  },
  {
    sku: "WALL-TIK-JOKER-MATT",
    name: "Краска экологичная Joker, матовая, светлый беж",
    brand: "Tikkurila",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 75_000,
    styleTags: ["scandinavian", "japandi", "minimalism"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.tikkurila.ru/joker",
    isAvailable: true,
  },
  {
    sku: "WALL-TIK-HARMONY-BEIGE",
    name: "Краска бархатистая Harmony, оттенок бежевый",
    brand: "Tikkurila",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 78_000,
    styleTags: ["japandi", "scandinavian", "neoclassic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.tikkurila.ru/harmony",
    isAvailable: true,
  },
  {
    sku: "WALL-CAP-PREMIUM-COLOR",
    name: "Краска моющаяся Premium-Color, тёплый белый",
    brand: "Caparol",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 95_000,
    styleTags: ["modern", "minimalism", "neoclassic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.caparol.ru/premium-color",
    isAvailable: true,
  },
  {
    sku: "WALL-CAP-STUCCO-ELEGANZA",
    name: "Декоративная штукатурка Stucco Eleganza, серый бетон",
    brand: "Caparol",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 180_000,
    styleTags: ["loft", "modern"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.caparol.ru/stucco-eleganza",
    isAvailable: true,
  },
  {
    sku: "WALL-DUL-CERAMIC-MATT",
    name: "Краска керамическая Ceramic Matt, белая",
    brand: "Dulux",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 88_000,
    styleTags: ["modern", "minimalism"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.dulux.ru/ceramic-matt",
    isAvailable: true,
  },
  {
    sku: "WALL-BEC-DESIGNER-WHITE",
    name: "Краска Designer White, белоснежная глубокоматовая",
    brand: "Beckers",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 72_000,
    styleTags: ["scandinavian", "minimalism"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.beckers.ru/designer-white",
    isAvailable: true,
  },
  {
    sku: "WALL-ERIS-GLAMOUR-CLASSIC",
    name: "Обои текстурные Glamour, классический орнамент",
    brand: "Erismann",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 110_000,
    styleTags: ["classic", "neoclassic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.erismann.ru/glamour",
    isAvailable: true,
  },
  {
    sku: "WALL-MAR-LOFT-CONCRETE",
    name: "Обои под бетон Loft Concrete, серо-графитовые",
    brand: "Marburg",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 95_000,
    styleTags: ["loft", "modern"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.marburg.com/loft-concrete",
    isAvailable: true,
  },
  {
    sku: "WALL-EIJF-NATURAL-JAPANDI",
    name: "Обои Natural Japandi, бамбуковая фактура",
    brand: "Eijffinger",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 130_000,
    styleTags: ["japandi", "scandinavian"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.eijffinger.com/natural",
    isAvailable: true,
  },
  {
    sku: "WALL-AS-VINTAGE-CLASSIC",
    name: "Обои Vintage Classic, дамасский орнамент кремовый",
    brand: "AS Creation",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 105_000,
    styleTags: ["classic", "neoclassic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.as-creation.ru/vintage",
    isAvailable: true,
  },
  {
    sku: "WALL-LOY-CLASSIC-MOLDING",
    name: "Обои премиум Classic Molding, имитация лепнины",
    brand: "Loymina",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 145_000,
    styleTags: ["neoclassic", "classic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://loymina.com/classic-molding",
    isAvailable: true,
  },
  {
    sku: "WALL-CAP-AMPHISILAN-GREY",
    name: "Краска AmphiSilan, оттенок графитовый серый",
    brand: "Caparol",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 92_000,
    styleTags: ["loft", "modern"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.caparol.ru/amphisilan",
    isAvailable: true,
  },
  {
    sku: "WALL-TIK-LIITU-CHALK",
    name: "Краска грифельная Liitu, чёрная меловая",
    brand: "Tikkurila",
    category: "walls",
    unit: "sqm",
    pricePerUnitKopeks: 99_000,
    styleTags: ["loft", "modern", "minimalism"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.tikkurila.ru/liitu",
    isAvailable: true,
  },

  // ────────────────────────── FLOOR (sqm) ──────────────────────────
  {
    sku: "FLOOR-QS-ELIGNA-LIGHT-OAK",
    name: "Ламинат Eligna, дуб светлый, 32 класс",
    brand: "Quick-Step",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 150_000,
    styleTags: ["scandinavian", "minimalism", "japandi"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.quick-step.ru/eligna",
    isAvailable: true,
  },
  {
    sku: "FLOOR-QS-IMPRESSIVE-GREY-OAK",
    name: "Ламинат Impressive, дуб серый, 33 класс",
    brand: "Quick-Step",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 175_000,
    styleTags: ["modern", "minimalism", "loft"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.quick-step.ru/impressive",
    isAvailable: true,
  },
  {
    sku: "FLOOR-QS-CLASSIC-NATURAL-OAK",
    name: "Ламинат Classic, дуб натуральный, 32 класс",
    brand: "Quick-Step",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 140_000,
    styleTags: ["classic", "neoclassic"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.quick-step.ru/classic",
    isAvailable: true,
  },
  {
    sku: "FLOOR-TAR-ESTETICA-WHITE-OAK",
    name: "Ламинат Estetica, дуб экстрабелый",
    brand: "Tarkett",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 165_000,
    styleTags: ["scandinavian", "minimalism"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.tarkett.ru/estetica",
    isAvailable: true,
  },
  {
    sku: "FLOOR-TAR-SOUNDLOGIC-OAK",
    name: "Ламинат SoundLogic, дуб с интегрированной подложкой",
    brand: "Tarkett",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 180_000,
    styleTags: ["modern", "minimalism"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.tarkett.ru/soundlogic",
    isAvailable: true,
  },
  {
    sku: "FLOOR-TAR-SALSA-CLASSIC-OAK",
    name: "Паркетная доска Salsa, дуб классик",
    brand: "Tarkett",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 320_000,
    styleTags: ["classic", "neoclassic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.tarkett.ru/salsa",
    isAvailable: true,
  },
  {
    sku: "FLOOR-EGG-PRO-NATURAL-OAK",
    name: "Ламинат Pro, дуб натуральный с фаской",
    brand: "Egger",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 155_000,
    styleTags: ["japandi", "scandinavian", "modern"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.egger.com/pro-natural-oak",
    isAvailable: true,
  },
  {
    sku: "FLOOR-EGG-CLASSIC-LOFT",
    name: "Ламинат Classic Loft, имитация состаренного дерева",
    brand: "Egger",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 170_000,
    styleTags: ["loft", "modern"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.egger.com/classic-loft",
    isAvailable: true,
  },
  {
    sku: "FLOOR-GRL-ASH-PARQUET",
    name: "Паркетная доска, ясень натуральный, селект",
    brand: "Greenline",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 380_000,
    styleTags: ["neoclassic", "classic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://greenline.ru/ash-parquet",
    isAvailable: true,
  },
  {
    sku: "FLOOR-GRL-TATAMI-OAK",
    name: "Паркетная доска Tatami, дуб натуральный масло",
    brand: "Greenline",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 350_000,
    styleTags: ["japandi", "scandinavian"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://greenline.ru/tatami",
    isAvailable: true,
  },
  {
    sku: "FLOOR-KM-SKYLINE-LOFT",
    name: "Керамогранит Skyline, бетон серый, 600×600 мм",
    brand: "Kerama Marazzi",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 220_000,
    styleTags: ["loft", "modern", "minimalism"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.kerama-marazzi.com/skyline",
    isAvailable: true,
  },
  {
    sku: "FLOOR-KM-POMPEII-CLASSIC",
    name: "Керамогранит Pompei, мрамор беж, классический",
    brand: "Kerama Marazzi",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 230_000,
    styleTags: ["classic", "neoclassic"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.kerama-marazzi.com/pompei",
    isAvailable: true,
  },
  {
    sku: "FLOOR-TAR-PREMIUM-WHITE-OAK",
    name: "Ламинат Premium, белый дуб скандинавский",
    brand: "Tarkett",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 168_000,
    styleTags: ["scandinavian", "minimalism"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.tarkett.ru/premium",
    isAvailable: true,
  },
  {
    sku: "FLOOR-EGG-LOFT-CONCEPT-CONCRETE",
    name: "Ламинат Loft Concept, бетон лофтовый",
    brand: "Egger",
    category: "floor",
    unit: "sqm",
    pricePerUnitKopeks: 175_000,
    styleTags: ["loft", "modern"],
    roomTypes: FLOOR_WET_ROOMS,
    partnerUrl: "https://www.egger.com/loft-concept",
    isAvailable: true,
  },

  // ────────────────────────── CEILING (sqm) ──────────────────────────
  {
    sku: "CEIL-PONGS-MATTE-WHITE",
    name: "Натяжной потолок Германия, матовый белый",
    brand: "Pongs",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 120_000,
    styleTags: ["modern", "minimalism", "scandinavian"],
    roomTypes: CEILING_UNIVERSAL,
    partnerUrl: "https://pongs.de/matte-white",
    isAvailable: true,
  },
  {
    sku: "CEIL-PONGS-SATIN-LIGHT",
    name: "Натяжной потолок, сатин светло-кремовый",
    brand: "Pongs",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 135_000,
    styleTags: ["modern", "scandinavian", "japandi"],
    roomTypes: CEILING_UNIVERSAL,
    partnerUrl: "https://pongs.de/satin-light",
    isAvailable: true,
  },
  {
    sku: "CEIL-PONGS-GLOSS-WHITE",
    name: "Натяжной потолок, глянцевый белый",
    brand: "Pongs",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 145_000,
    styleTags: ["modern", "minimalism"],
    roomTypes: CEILING_UNIVERSAL,
    partnerUrl: "https://pongs.de/gloss-white",
    isAvailable: true,
  },
  {
    sku: "CEIL-MSD-PREMIUM-MATTE-WHITE",
    name: "Натяжной потолок Premium, матовый белый, Франция",
    brand: "MSD",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 110_000,
    styleTags: ["scandinavian", "minimalism"],
    roomTypes: CEILING_UNIVERSAL,
    partnerUrl: "https://msd-france.com/premium-matte",
    isAvailable: true,
  },
  {
    sku: "CEIL-MSD-CLASSIC-CREAM",
    name: "Натяжной потолок Classic, кремовый",
    brand: "MSD",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 115_000,
    styleTags: ["japandi", "neoclassic"],
    roomTypes: CEILING_UNIVERSAL,
    partnerUrl: "https://msd-france.com/classic-cream",
    isAvailable: true,
  },
  {
    sku: "CEIL-CAP-PREMIUMWEISS",
    name: "Краска для потолка PremiumWeiss, глубокоматовая",
    brand: "Caparol",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 70_000,
    styleTags: ["loft", "modern", "minimalism"],
    roomTypes: CEILING_UNIVERSAL,
    partnerUrl: "https://www.caparol.ru/premiumweiss",
    isAvailable: true,
  },
  {
    sku: "CEIL-TIK-ANTI-REFLEX",
    name: "Краска потолочная Anti-Reflex, ультраматовая",
    brand: "Tikkurila",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 75_000,
    styleTags: ["scandinavian", "minimalism", "japandi"],
    roomTypes: CEILING_UNIVERSAL,
    partnerUrl: "https://www.tikkurila.ru/anti-reflex",
    isAvailable: true,
  },
  {
    sku: "CEIL-KNAUF-PLAZA-NEOCLASSIC",
    name: "Гипсокартонный потолок Plaza с финишной шпатлёвкой",
    brand: "Knauf",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 95_000,
    styleTags: ["neoclassic", "classic"],
    roomTypes: CEILING_UNIVERSAL,
    partnerUrl: "https://www.knauf.ru/plaza",
    isAvailable: true,
  },
  {
    sku: "CEIL-ORAC-MOLDING-CLASSIC",
    name: "Потолок гипсокартонный с лепниной Orac под покраску",
    brand: "Orac Decor",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 280_000,
    styleTags: ["classic", "neoclassic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.oracdecor.com/molding-ceiling",
    isAvailable: true,
  },
  {
    sku: "CEIL-PONGS-SOFT-TOUCH-WARM",
    name: "Натяжной потолок Soft Touch, тёплый бежевый",
    brand: "Pongs",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 130_000,
    styleTags: ["japandi", "scandinavian"],
    roomTypes: CEILING_UNIVERSAL,
    partnerUrl: "https://pongs.de/soft-touch",
    isAvailable: true,
  },
  {
    sku: "CEIL-LOFT-OPEN-CONCRETE",
    name: "Окрашенная плита перекрытия под бетон",
    brand: null,
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 90_000,
    styleTags: ["loft", "modern"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: null,
    isAvailable: true,
  },
  {
    sku: "CEIL-PONGS-PREMIUM-BLACK",
    name: "Натяжной потолок, чёрный матовый",
    brand: "Pongs",
    category: "ceiling",
    unit: "sqm",
    pricePerUnitKopeks: 155_000,
    styleTags: ["loft", "modern"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://pongs.de/premium-black",
    isAvailable: true,
  },

  // ────────────────────────── OTHER (pcs) ──────────────────────────
  {
    sku: "OTHER-ORAC-SX173-FLOOR-MOLDING",
    name: "Плинтус напольный SX173, полиуретан, под покраску",
    brand: "Orac Decor",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 300_000, // 3000 ₽/шт
    styleTags: ["classic", "neoclassic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.oracdecor.com/sx173",
    isAvailable: true,
  },
  {
    sku: "OTHER-ORAC-C217-CEILING-MOLDING",
    name: "Молдинг потолочный C217, классический профиль",
    brand: "Orac Decor",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 280_000,
    styleTags: ["classic", "neoclassic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.oracdecor.com/c217",
    isAvailable: true,
  },
  {
    sku: "OTHER-ORAC-R12-CEILING-ROSE",
    name: "Розетка потолочная R12, лепная под люстру",
    brand: "Orac Decor",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 450_000,
    styleTags: ["classic", "neoclassic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.oracdecor.com/r12",
    isAvailable: true,
  },
  {
    sku: "OTHER-PEDROSS-OAK-70",
    name: "Плинтус деревянный, дуб шпонированный, 70 мм",
    brand: "Pedross",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 180_000,
    styleTags: ["scandinavian", "japandi"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.pedross.ru/oak-70",
    isAvailable: true,
  },
  {
    sku: "OTHER-PROFILPAS-METAL-LOFT",
    name: "Плинтус алюминиевый Metal Line, цвет графит",
    brand: "Profilpas",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 220_000,
    styleTags: ["loft", "modern"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://profilpas.com/metal-line",
    isAvailable: true,
  },
  {
    sku: "OTHER-DD-HIDDEN-MINIMAL",
    name: "Плинтус скрытого монтажа, алюминий, под покраску",
    brand: "Декор-Дизайн",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 210_000,
    styleTags: ["modern", "minimalism"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://decor-design.ru/hidden",
    isAvailable: true,
  },
  {
    sku: "OTHER-NMC-FT3-PVC-WHITE",
    name: "Плинтус ПВХ FT3, белый, под покраску",
    brand: "NMC",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 90_000,
    styleTags: ["modern", "minimalism", "scandinavian"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://nmc.eu/ft3",
    isAvailable: true,
  },
  {
    sku: "OTHER-CITILUX-MODERN-LED",
    name: "Светильник потолочный Modern LED, 36 Вт",
    brand: "Citilux",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 580_000,
    styleTags: ["modern", "minimalism"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://citilux.ru/modern-led",
    isAvailable: true,
  },
  {
    sku: "OTHER-IKEA-SKOGSTA-MIRROR",
    name: "Зеркало настенное Skogsta, акация",
    brand: "IKEA",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 320_000,
    styleTags: ["scandinavian", "japandi"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.ikea.com/skogsta",
    isAvailable: true,
  },
  {
    sku: "OTHER-LOFT-INDUSTRY-EDISON",
    name: "Бра настенное Edison, чёрный металл, лофт",
    brand: "Loft Industry",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 420_000,
    styleTags: ["loft", "modern"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://loft-industry.ru/edison",
    isAvailable: true,
  },
  {
    sku: "OTHER-DECORA-BAMBOO-BASE",
    name: "Плинтус бамбуковый Decora, натуральный",
    brand: "Decora",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 250_000,
    styleTags: ["japandi", "scandinavian"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://decora.ru/bamboo",
    isAvailable: true,
  },
  {
    sku: "OTHER-ORAC-CX190-CORNICE",
    name: "Карниз потолочный CX190, неоклассический профиль",
    brand: "Orac Decor",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 320_000,
    styleTags: ["neoclassic", "classic"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://www.oracdecor.com/cx190",
    isAvailable: true,
  },
  {
    sku: "OTHER-MAXIT-DESIGN-LINE",
    name: "Плинтус алюминиевый DesignLine, чёрный анодированный",
    brand: "Maxit",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 240_000,
    styleTags: ["minimalism", "modern"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://maxit.ru/design-line",
    isAvailable: true,
  },
  {
    sku: "OTHER-WOODLINE-JAPANDI-SLAT",
    name: "Декоративная рейка деревянная, дуб термо, 30 мм",
    brand: "WoodLine",
    category: "other",
    unit: "pcs",
    pricePerUnitKopeks: 190_000,
    styleTags: ["japandi", "scandinavian"],
    roomTypes: ALL_LIVING_ROOMS,
    partnerUrl: "https://woodline.ru/japandi-slat",
    isAvailable: true,
  },
];

/**
 * Сборка-проверка покрытия: для каждого из 7 стилей × 4 категорий должен
 * быть хотя бы один доступный SKU с `bedroom` в `room_types`. Падаем рано,
 * если кто-то случайно сломал инвариант — лучше упасть в скрипте сида,
 * чем тихо сломать `Materials_Estimator` в проде.
 */
function assertCoverage(rows: SeedRow[]): void {
  const styles = [
    "modern",
    "scandinavian",
    "loft",
    "minimalism",
    "neoclassic",
    "japandi",
    "classic",
  ] as const;
  const categories: FinishingCategory[] = ["walls", "floor", "ceiling", "other"];

  const missing: string[] = [];
  for (const style of styles) {
    for (const category of categories) {
      const found = rows.some(
        (r) =>
          r.isAvailable &&
          r.category === category &&
          r.roomTypes.includes("bedroom") &&
          r.styleTags.includes(style),
      );
      if (!found) missing.push(`${style} × ${category}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Coverage check failed: missing SKU for ${missing.join(", ")}`,
    );
  }
}

async function seedFinishingMaterials(): Promise<void> {
  assertCoverage(ROWS);

  const now = new Date();
  const insertValues = ROWS.map((r) => ({
    sku: r.sku,
    name: r.name,
    brand: r.brand,
    category: r.category,
    unit: r.unit,
    pricePerUnitKopeks: r.pricePerUnitKopeks,
    styleTags: r.styleTags,
    roomTypes: r.roomTypes,
    partnerUrl: r.partnerUrl,
    isAvailable: r.isAvailable,
    createdAt: now,
    updatedAt: now,
  }));

  // Bulk INSERT с ON CONFLICT (sku) DO UPDATE: при повторном запуске
  // обновляем все «изменяемые» поля по новым значениям из VALUES, а
  // `created_at` оставляем прежним (`excluded.created_at` в SET не пишем).
  await db
    .insert(finishingMaterialsTable)
    .values(insertValues)
    .onConflictDoUpdate({
      target: finishingMaterialsTable.sku,
      set: {
        name: sql`excluded.name`,
        brand: sql`excluded.brand`,
        category: sql`excluded.category`,
        unit: sql`excluded.unit`,
        pricePerUnitKopeks: sql`excluded.price_per_unit_kopeks`,
        styleTags: sql`excluded.style_tags`,
        roomTypes: sql`excluded.room_types`,
        partnerUrl: sql`excluded.partner_url`,
        isAvailable: sql`excluded.is_available`,
        updatedAt: sql`now()`,
      },
    });

  console.log(`[seedFinishingMaterials] upserted ${ROWS.length} SKUs`);
}

async function main(): Promise<void> {
  try {
    await seedFinishingMaterials();
  } catch (err) {
    console.error("[seedFinishingMaterials] failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
