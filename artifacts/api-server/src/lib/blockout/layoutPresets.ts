/**
 * Layout_Preset — захардкоженные вручную расстановки примитивной (box/простой
 * меш) мебели по типу помещения для AI_Design_3D_Blockout (подход B2).
 *
 * См. `.kiro/specs/ai-design-3d-blockout/design.md` секция
 * «Scene_Spec model & builder» и `requirements.md` Requirement 3
 * (Пресеты расстановки по типу помещения):
 *   • 3.1 — `Blockout_Builder` размещает мебель из `Layout_Preset`, выбранного
 *     по типу помещения;
 *   • 3.2 — каждый предмет задан примитивной геометрией без текстур/материалов;
 *   • 3.3 — у каждого предмета есть позиция, габариты и ориентация в мировых
 *     координатах `Room_Blockout`;
 *   • 3.5 — если для типа помещения нет пресета, `selectLayoutPreset`
 *     завершается ошибкой, называющей запрошенный тип.
 *
 * Координатное соглашение блокаута: начало координат в углу комнаты,
 * ось X — вдоль ширины (W), ось Y — вдоль длины (L), ось Z — вверх (H).
 * `position` — центр предмета в метрах, `dimensions` — габариты w×d×h (м),
 * `rotationDeg` — поворот вокруг вертикальной оси Z ∈ {0,90,180,270}.
 *
 * ВАЖНО: тип `FurnitureItem` намеренно НЕ содержит полей материалов/текстур —
 * предметы пресета остаются «серыми» примитивами (Requirement 3.2). Все
 * габариты строго положительны (Requirement 3.3).
 *
 * Примечание по интеграции: общая модель `Scene_Spec` (`sceneSpec.ts`)
 * создаётся параллельно (task 1.1). До её появления здесь определены
 * минимальные локальные типы, согласованные со схемой `Scene_Spec` из дизайна;
 * когда `sceneSpec.ts` появится, он должен импортировать `LayoutPreset` и
 * `selectLayoutPreset` отсюда, а общие типы (`RoomType`, `FurnitureItem`)
 * можно будет переэкспортировать из единого источника правды.
 */

// ─── Shared types (минимальные локальные, согласованы с Scene_Spec) ───────────

/**
 * Поддерживаемые типы помещений. Совпадает с набором, используемым в
 * `layoutPlanner.ts` (`AI_Design_Product`):
 * `bedroom | kitchen | bathroom | living_room | hallway | nursery | apartment`.
 */
export type RoomType =
  | "bedroom"
  | "kitchen"
  | "bathroom"
  | "living_room"
  | "hallway"
  | "nursery"
  | "apartment";

/** Поворот предмета вокруг вертикальной оси, градусы. */
export type RotationDeg = 0 | 90 | 180 | 270;

/**
 * Предмет мебели блокаута — примитив (box/простой меш) без материалов и
 * текстур. Поля материалов/текстур отсутствуют намеренно (Requirement 3.2).
 */
export interface FurnitureItem {
  /** Уникальный в пределах пресета идентификатор. */
  id: string;
  /** Тип примитива (`bed`, `sofa`, ...). Чисто семантическая метка. */
  kind: string;
  /** Центр предмета в мировых координатах блокаута, метры. */
  position: { x: number; y: number; z: number };
  /** Габариты w×d×h, метры. Все значения > 0 (Requirement 3.3). */
  dimensions: { w: number; d: number; h: number };
  /** Ориентация вокруг оси Z ∈ {0,90,180,270} (Requirement 3.3). */
  rotationDeg: RotationDeg;
}

/**
 * Расстановка примитивной мебели для одного типа помещения в мировых
 * координатах блокаута.
 */
export interface LayoutPreset {
  /** Идентификатор пресета (= `Scene_Spec.layoutPresetId`). */
  id: string;
  /** Тип помещения, которому соответствует пресет (Requirement 3.1). */
  roomType: RoomType;
  /** Непустой список предметов мебели (Requirement 3.1). */
  furniture: FurnitureItem[];
}

// ─── Hardcoded presets ────────────────────────────────────────────────────────
//
// Координаты подобраны компактно (центры в пределах ~3×3 м у начала координат),
// чтобы предметы помещались внутри границ `Room_Shell` даже для небольших
// комнат; строгая проверка вписывания в `[0..W]×[0..L]×[0..H]` выполняется
// позже в `buildSceneSpec` (task 3.1) / property-тесте (Property 8).

const BEDROOM_PRESET: LayoutPreset = {
  id: "bedroom_default_v1",
  roomType: "bedroom",
  furniture: [
    {
      id: "bed",
      kind: "bed",
      position: { x: 1.0, y: 1.2, z: 0.25 },
      dimensions: { w: 1.6, d: 2.0, h: 0.5 },
      rotationDeg: 0,
    },
    {
      id: "wardrobe",
      kind: "wardrobe",
      position: { x: 2.3, y: 0.3, z: 1.1 },
      dimensions: { w: 1.2, d: 0.6, h: 2.2 },
      rotationDeg: 0,
    },
    {
      id: "nightstand_left",
      kind: "nightstand",
      position: { x: 0.25, y: 0.3, z: 0.25 },
      dimensions: { w: 0.45, d: 0.4, h: 0.5 },
      rotationDeg: 0,
    },
    {
      id: "dresser",
      kind: "dresser",
      position: { x: 2.6, y: 2.2, z: 0.4 },
      dimensions: { w: 1.0, d: 0.5, h: 0.8 },
      rotationDeg: 90,
    },
  ],
};

const KITCHEN_PRESET: LayoutPreset = {
  id: "kitchen_default_v1",
  roomType: "kitchen",
  furniture: [
    {
      id: "counter_run",
      kind: "cabinet",
      position: { x: 1.5, y: 0.3, z: 0.45 },
      dimensions: { w: 3.0, d: 0.6, h: 0.9 },
      rotationDeg: 0,
    },
    {
      id: "kitchen_island",
      kind: "kitchen_island",
      position: { x: 1.5, y: 1.8, z: 0.45 },
      dimensions: { w: 1.8, d: 0.9, h: 0.9 },
      rotationDeg: 0,
    },
    {
      id: "fridge",
      kind: "cabinet",
      position: { x: 0.35, y: 2.4, z: 1.0 },
      dimensions: { w: 0.7, d: 0.7, h: 2.0 },
      rotationDeg: 0,
    },
    {
      id: "dining_table",
      kind: "dining_table",
      position: { x: 2.6, y: 2.4, z: 0.4 },
      dimensions: { w: 1.2, d: 0.8, h: 0.75 },
      rotationDeg: 0,
    },
  ],
};

const BATHROOM_PRESET: LayoutPreset = {
  id: "bathroom_default_v1",
  roomType: "bathroom",
  furniture: [
    {
      id: "bathtub",
      kind: "bathtub",
      position: { x: 0.85, y: 1.2, z: 0.3 },
      dimensions: { w: 0.75, d: 1.7, h: 0.6 },
      rotationDeg: 0,
    },
    {
      id: "sink",
      kind: "sink",
      position: { x: 1.8, y: 0.3, z: 0.45 },
      dimensions: { w: 0.6, d: 0.5, h: 0.9 },
      rotationDeg: 0,
    },
    {
      id: "toilet",
      kind: "toilet",
      position: { x: 1.7, y: 1.7, z: 0.2 },
      dimensions: { w: 0.4, d: 0.7, h: 0.4 },
      rotationDeg: 0,
    },
  ],
};

const LIVING_ROOM_PRESET: LayoutPreset = {
  id: "living_room_default_v1",
  roomType: "living_room",
  furniture: [
    {
      id: "sofa",
      kind: "sofa",
      position: { x: 1.5, y: 0.45, z: 0.4 },
      dimensions: { w: 2.2, d: 0.9, h: 0.8 },
      rotationDeg: 0,
    },
    {
      id: "coffee_table",
      kind: "coffee_table",
      position: { x: 1.5, y: 1.6, z: 0.2 },
      dimensions: { w: 1.1, d: 0.6, h: 0.4 },
      rotationDeg: 0,
    },
    {
      id: "tv_unit",
      kind: "tv_unit",
      position: { x: 1.5, y: 2.7, z: 0.25 },
      dimensions: { w: 1.8, d: 0.4, h: 0.5 },
      rotationDeg: 0,
    },
    {
      id: "armchair",
      kind: "armchair",
      position: { x: 3.0, y: 1.2, z: 0.4 },
      dimensions: { w: 0.8, d: 0.8, h: 0.8 },
      rotationDeg: 270,
    },
  ],
};

const HALLWAY_PRESET: LayoutPreset = {
  id: "hallway_default_v1",
  roomType: "hallway",
  furniture: [
    {
      id: "shoe_cabinet",
      kind: "cabinet",
      position: { x: 0.25, y: 1.0, z: 0.4 },
      dimensions: { w: 0.4, d: 1.0, h: 0.8 },
      rotationDeg: 0,
    },
    {
      id: "mirror",
      kind: "mirror",
      position: { x: 0.1, y: 2.2, z: 1.2 },
      dimensions: { w: 0.1, d: 0.6, h: 1.6 },
      rotationDeg: 0,
    },
    {
      id: "bench",
      kind: "bench",
      position: { x: 0.9, y: 2.2, z: 0.25 },
      dimensions: { w: 1.0, d: 0.4, h: 0.5 },
      rotationDeg: 0,
    },
  ],
};

const NURSERY_PRESET: LayoutPreset = {
  id: "nursery_default_v1",
  roomType: "nursery",
  furniture: [
    {
      id: "crib",
      kind: "crib",
      position: { x: 0.9, y: 1.0, z: 0.4 },
      dimensions: { w: 0.7, d: 1.3, h: 0.9 },
      rotationDeg: 0,
    },
    {
      id: "changing_table",
      kind: "dresser",
      position: { x: 2.2, y: 0.35, z: 0.45 },
      dimensions: { w: 0.9, d: 0.6, h: 0.9 },
      rotationDeg: 0,
    },
    {
      id: "wardrobe",
      kind: "wardrobe",
      position: { x: 2.4, y: 2.0, z: 1.05 },
      dimensions: { w: 1.0, d: 0.6, h: 2.1 },
      rotationDeg: 90,
    },
    {
      id: "rug",
      kind: "rug",
      position: { x: 1.2, y: 2.2, z: 0.01 },
      dimensions: { w: 1.5, d: 1.2, h: 0.02 },
      rotationDeg: 0,
    },
  ],
};

const APARTMENT_PRESET: LayoutPreset = {
  id: "apartment_default_v1",
  roomType: "apartment",
  furniture: [
    {
      id: "sofa",
      kind: "sofa",
      position: { x: 1.3, y: 0.45, z: 0.4 },
      dimensions: { w: 2.0, d: 0.9, h: 0.8 },
      rotationDeg: 0,
    },
    {
      id: "coffee_table",
      kind: "coffee_table",
      position: { x: 1.3, y: 1.5, z: 0.2 },
      dimensions: { w: 1.0, d: 0.6, h: 0.4 },
      rotationDeg: 0,
    },
    {
      id: "dining_table",
      kind: "dining_table",
      position: { x: 2.8, y: 1.6, z: 0.4 },
      dimensions: { w: 1.2, d: 0.8, h: 0.75 },
      rotationDeg: 0,
    },
    {
      id: "bed",
      kind: "bed",
      position: { x: 1.0, y: 2.7, z: 0.25 },
      dimensions: { w: 1.6, d: 2.0, h: 0.5 },
      rotationDeg: 0,
    },
  ],
};

/**
 * Реестр всех захардкоженных пресетов по типу помещения. Единственный источник
 * правды для `selectLayoutPreset`. `Partial`, чтобы тип допускал отсутствие
 * пресета для какого-либо `RoomType` (Requirement 3.5 / Property 9).
 */
export const LAYOUT_PRESETS: Partial<Record<RoomType, LayoutPreset>> = {
  bedroom: BEDROOM_PRESET,
  kitchen: KITCHEN_PRESET,
  bathroom: BATHROOM_PRESET,
  living_room: LIVING_ROOM_PRESET,
  hallway: HALLWAY_PRESET,
  nursery: NURSERY_PRESET,
  apartment: APARTMENT_PRESET,
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Выбирает `Layout_Preset` по типу помещения (Requirement 3.1).
 *
 * @throws Error если для запрошенного типа помещения пресет не определён;
 *   сообщение содержит имя запрошенного типа (Requirement 3.5 / Property 9).
 */
export function selectLayoutPreset(roomType: RoomType): LayoutPreset {
  // `Object.hasOwn` гарантирует, что мы не подхватим унаследованные члены
  // `Object.prototype` (например, при `roomType === "valueOf"`/"toString"),
  // которые иначе вернулись бы как truthy и обошли бросок ошибки (Req 3.5).
  const preset = Object.hasOwn(LAYOUT_PRESETS, roomType)
    ? LAYOUT_PRESETS[roomType]
    : undefined;
  if (!preset) {
    throw new Error(
      `No Layout_Preset defined for room type "${roomType}"`,
    );
  }
  return preset;
}
