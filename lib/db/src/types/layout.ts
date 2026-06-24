/**
 * Layout_JSON — промежуточный артефакт пайплайна AI_Design_Product.
 *
 * Эти типы описывают структуру JSON-плана комнаты, который GPT возвращает
 * через `response_format: { type: "json_schema", strict: true }` (см.
 * `design.md` секции `Layout_Planner` и `Geometric_Validator` спека
 * `.kiro/specs/ai-design-product`).
 *
 * Поля строго в camelCase, все размеры — целые сантиметры, чтобы один и тот
 * же объект гонять без преобразований через JSON-schema валидатор GPT,
 * `Geometric_Validator`, `Top_Down_Plan_Renderer`, `Isometric_Callout_Renderer`,
 * `Furniture_Matcher`, `Materials_Estimator` и колонку `designs.layout_json`
 * (jsonb).
 *
 * Файл намеренно живёт в `lib/db/src/types/` и не импортирует ничего из
 * `artifacts/api-server` или `artifacts/marketplace` — так типы могут
 * использоваться и в Drizzle-схеме (`designs.layoutJson.$type<LayoutJson>()`),
 * и в API-сервере, и в Next.js-маркетплейсе без циркулярных зависимостей.
 */

/** Стена комнаты, к которой может быть прикреплена дверь, окно, ориентация
 *  предмета и т.п. Перечисление совпадает с `enum` в JSON-схеме Layout_JSON. */
export type Wall = "north" | "east" | "south" | "west";

/**
 * Один предмет мебели в Layout_JSON.
 *
 * Координаты `xCm`/`yCm` — это положение левого-верхнего угла AABB предмета
 * относительно левого-верхнего угла комнаты (см. `Geometric_Validator`).
 * `rotationDeg` ограничен 0/90/180/270: это позволяет валидатору работать с
 * AABB вместо OBB и достаточно для bedroom MVP.
 */
export interface FurnitureItem {
  /** Стабильный id предмета внутри плана; `^[a-z0-9_-]{1,32}$`. */
  id: string;
  /** Тип мебели — соответствует enum'у из JSON-схемы Layout_JSON
   *  (`bed`, `wardrobe`, `desk`, `chair`, `nightstand`, `rug`, `dresser`,
   *  `shelf`, `sofa`, `armchair`, `tv_unit`, `coffee_table`, `dining_table`,
   *  `kitchen_island`, `sink`, `toilet`, `bathtub`, `shower`, `mirror`,
   *  `cabinet`). Хранится строкой, чтобы не ломать совместимость, если
   *  бэкенд или GPT добавят новый тип раньше, чем этот файл. */
  type: string;
  /** Габарит — ширина AABB предмета, см (20..400). */
  widthCm: number;
  /** Габарит — глубина AABB предмета, см (20..400). */
  depthCm: number;
  /** Габарит — высота, см (10..280). */
  heightCm: number;
  /** Координата X левого-верхнего угла AABB, см (0..800). */
  xCm: number;
  /** Координата Y левого-верхнего угла AABB, см (0..800). */
  yCm: number;
  /** Поворот вокруг центра AABB. Только 0/90/180/270 (Layout_Planner и
   *  валидатор полагаются на это, чтобы оставаться в AABB). */
  rotationDeg: 0 | 90 | 180 | 270;
}

/** Прямоугольное отверстие в стене (дверь). */
export interface LayoutDoor {
  wall: Wall;
  /** Смещение левого края проёма от левого угла соответствующей стены, см. */
  offsetCm: number;
  /** Ширина проёма, см (70..110 по JSON-схеме). */
  widthCm: number;
}

/** Прямоугольное отверстие в стене (окно); `null`, если окна нет. */
export interface LayoutWindow {
  wall: Wall;
  offsetCm: number;
  /** Ширина окна, см (60..400 по JSON-схеме). */
  widthCm: number;
}

/** Размеры комнаты в Layout_JSON. */
export interface LayoutRoom {
  /** Тип помещения; enum см. в JSON-схеме (`bedroom`, `kitchen`, `bathroom`,
   *  `living_room`, `hallway`, `nursery`, `apartment`). Строка, потому что
   *  серверный `roomType` свободно расширяется поверх этого типа. */
  roomType: string;
  /** Ширина комнаты, см (200..800). */
  widthCm: number;
  /** Длина комнаты, см (200..800). */
  lengthCm: number;
  /** Высота потолка, см (220..350). */
  heightCm: number;
}

/**
 * Корневой объект Layout_JSON.
 *
 * Совпадает 1-в-1 с JSON-схемой `RoomLayout` из `design.md` (см. секцию
 * `Layout_Planner`), включая `additionalProperties: false` на каждом уровне.
 */
export interface LayoutJson {
  room: LayoutRoom;
  door: LayoutDoor;
  /** Окно опционально: модель GPT обязана вернуть либо объект, либо `null`. */
  window: LayoutWindow | null;
  /** От 1 до 12 предметов мебели (см. `minItems`/`maxItems` JSON-схемы). */
  furniture: FurnitureItem[];
}
