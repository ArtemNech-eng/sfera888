/**
 * Geometric_Validator — детерминированная геометрическая проверка для
 * `AI_Design_Product` (см. `.kiro/specs/ai-design-product/design.md` секция
 * `Geometric_Validator` и Requirement 2 в `requirements.md`).
 *
 * Модуль работает в двух режимах:
 *
 *  1. **Pre-flight** — `checkMinArea(roomType, widthCm, lengthCm)`. Срабатывает
 *     в HTTP-обработчике `POST /generate` ДО `INSERT INTO designs`, чтобы не
 *     стартовать AI-пайплайн на заведомо невозможной комнате. Минимумы из
 *     Requirement 2.2.
 *
 *  2. **Post-Layout** — `validateLayout(room, furniture)`. Срабатывает в
 *     `Design_Worker` сразу после получения `Layout_JSON` от GPT и до
 *     первого вызова AI_Image_Provider. Делает три независимые проверки:
 *
 *       (а) AABB-containment — каждый предмет полностью внутри прямоугольника
 *           комнаты (Requirement 2.4);
 *       (б) попарная не-пересечённость с допуском ≤ 1 см (Requirement 2.5);
 *       (в) дверной 60×60 см коридор внутри комнаты свободен от мебели
 *           (`BLOCKS_DOOR`) и существует BFS-путь шириной 60 см от двери до
 *           каждого функционального предмета помещения — для `bedroom` это
 *           `bed` и `wardrobe` (Requirement 2.6).
 *
 * Алгоритм проверки прохода — BFS на сетке 5 см с морфологической дилатацией
 * препятствий радиусом 6 ячеек (= 30 см). Стены моделируются как обстракции
 * по краю сетки, дверной проём — как «дыра» в этой стене.
 *
 * Все размеры — целые сантиметры. Тип `FurnitureItem` приходит из общего
 * пакета `@workspace/db` (`lib/db/src/types/layout.ts`), чтобы избежать
 * дублирования между Drizzle-схемой, api-server и marketplace.
 */

import type {
  FurnitureItem,
  LayoutJson,
  Wall,
} from "@workspace/db";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Re-export `Wall` и `FurnitureItem`, чтобы не плодить параллельные типы. */
export type { FurnitureItem, Wall };

/**
 * Минимальная информация о комнате, необходимая `validateLayout`.
 *
 * Это срез `LayoutJson.room` ⊕ `LayoutJson.door` ⊕ `LayoutJson.window`.
 * Удобный helper `roomDimsFromLayout(layout)` ниже строит этот объект из
 * полноценного Layout_JSON.
 */
export interface RoomDims {
  /** Ширина комнаты по оси X, см (200..800). */
  widthCm: number;
  /** Длина комнаты по оси Y, см (200..800). */
  lengthCm: number;
  /** Высота потолка, см (220..350). Не участвует в 2D-проверках, но входит
   *  в RoomDims, чтобы не плодить параллельный тип. */
  heightCm: number;
  /** Тип помещения; используется только для выбора набора функциональных
   *  предметов в path-checking (см. `FUNCTIONAL_TYPES_BY_ROOM`). */
  roomType: string;

  doorWall: Wall;
  /** Смещение левого края дверного проёма от стартового угла стены, см. */
  doorOffsetCm: number;
  /** Ширина дверного проёма, см (≥ 70 по JSON-схеме Layout_JSON). */
  doorWidthCm: number;

  windowWall?: Wall | null;
  windowOffsetCm?: number | null;
  windowWidthCm?: number | null;
}

/** Коды нарушений `Geometric_Validator`. Используются `Layout_Planner` для
 *  построения подсказок при retry (Requirement 2.7) и `Design_Worker` для
 *  логирования в `design_generations.provider_response`. */
export type ViolationCode =
  | "OUT_OF_ROOM"
  | "INTERSECTS"
  | "BLOCKS_DOOR"
  | "PATH_TOO_NARROW"
  | "NO_PATH_TO_FUNCTIONAL_ITEM";

export interface ValidationViolation {
  code: ViolationCode;
  /** id предметов из Layout_JSON, к которым относится нарушение. Для
   *  PATH_TOO_NARROW (общий блок коридора) — пустой массив. */
  itemIds: string[];
  /** Человеко-читаемая формулировка для retry-prompt и аудита. */
  detailRu: string;
}

export interface ValidationResult {
  ok: boolean;
  violations: ValidationViolation[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Минимально допустимые площади помещений, м² (Requirement 2.2). */
export const MIN_AREA_SQM_BY_ROOM_TYPE: Readonly<Record<string, number>> = {
  bedroom: 6,
  kitchen: 4,
  bathroom: 2,
  living_room: 8,
  hallway: 1.5,
  nursery: 6,
  apartment: 18,
};

/** Допуск пересечения двух AABB (Requirement 2.5: «с допуском ≤ 1 см»).
 *  Перекрытие ≤ INTERSECTION_TOLERANCE_CM по любой оси не считается
 *  пересечением (это покрывает «приставленные» предметы). */
const INTERSECTION_TOLERANCE_CM = 1;

/** Шаг сетки BFS, см (см. design.md секция Geometric_Validator, шаг 1). */
const GRID_STEP_CM = 5;

/** Радиус морфологической дилатации в ячейках. 6×5 см = 30 см → проход 60 см. */
const DILATION_RADIUS_CELLS = 6;

/** Глубина дверного «коридора очистки» внутри комнаты, см. Любой AABB,
 *  пересекающий 60×60 см коридор, выдаёт `BLOCKS_DOOR` (Property 7). */
const DOOR_CLEARANCE_CM = 60;

/** Функциональные предметы по типу помещения (Requirement 2.6). На MVP
 *  заполнено только для `bedroom`; для остальных типов path-checking
 *  пропускается до их добавления в последующих итерациях. */
const FUNCTIONAL_TYPES_BY_ROOM: Readonly<Record<string, readonly string[]>> = {
  bedroom: ["bed", "wardrobe"],
};

// ---------------------------------------------------------------------------
// checkMinArea — pre-flight
// ---------------------------------------------------------------------------

/**
 * Сверяет введённую площадь с минимальной для типа помещения (Requirement 2.2).
 *
 * Для неизвестного `roomType` возвращает `ok: true, minSqm: 0` — валидация
 * перечня типов делается на уровне Zod-схемы формы (Requirement 1.2), здесь
 * мы лишь обеспечиваем, что площадь не падает ниже фиксированного минимума.
 */
export function checkMinArea(
  roomType: string,
  widthCm: number,
  lengthCm: number,
): { ok: boolean; areaSqm: number; minSqm: number } {
  const areaSqm = (widthCm * lengthCm) / 10_000;
  const minSqm = MIN_AREA_SQM_BY_ROOM_TYPE[roomType] ?? 0;
  return { ok: areaSqm >= minSqm, areaSqm, minSqm };
}

// ---------------------------------------------------------------------------
// AABB helpers
// ---------------------------------------------------------------------------

interface Aabb {
  id: string;
  type: string;
  /** Левый край, см (включительно). */
  x0: number;
  /** Верхний край, см (включительно). */
  y0: number;
  /** Правый край AABB, см. */
  x1: number;
  /** Нижний край AABB, см. */
  y1: number;
}

/**
 * Строит AABB предмета мебели. `xCm`/`yCm` — координата левого-верхнего угла
 * AABB после применения поворота (см. комментарий в `LayoutJson.FurnitureItem`).
 * Поворот 90/270 меняет местами `widthCm` и `depthCm` для AABB-экстента.
 */
function aabbForItem(item: FurnitureItem): Aabb {
  const swap = item.rotationDeg === 90 || item.rotationDeg === 270;
  const extentX = swap ? item.depthCm : item.widthCm;
  const extentY = swap ? item.widthCm : item.depthCm;
  return {
    id: item.id,
    type: item.type,
    x0: item.xCm,
    y0: item.yCm,
    x1: item.xCm + extentX,
    y1: item.yCm + extentY,
  };
}

/** Возвращает (dx, dy) — пересечение AABB по осям. Положительные значения
 *  означают перекрытие, отрицательные/нулевые — отсутствие пересечения. */
function overlap(a: Aabb, b: Aabb): { dx: number; dy: number } {
  const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return { dx, dy };
}

// ---------------------------------------------------------------------------
// Door geometry
// ---------------------------------------------------------------------------

interface DoorGeometry {
  /** 60×60 коридор очистки внутри комнаты для проверки `BLOCKS_DOOR`. */
  clearance: { x0: number; y0: number; x1: number; y1: number };
  /** Стартовая точка BFS — центр двери, отнесённый внутрь комнаты на
   *  `(R+1) × шаг сетки` см, чтобы гарантированно стоять вне зоны дилатации
   *  стен (для дверного проёма ≥ 70 см). */
  startXCm: number;
  startYCm: number;
}

function computeDoorGeometry(room: RoomDims): DoorGeometry {
  const center = room.doorOffsetCm + room.doorWidthCm / 2;
  const half = DOOR_CLEARANCE_CM / 2;
  const startInsetCm = (DILATION_RADIUS_CELLS + 1) * GRID_STEP_CM; // 35 см

  switch (room.doorWall) {
    case "north":
      return {
        clearance: {
          x0: center - half,
          y0: 0,
          x1: center + half,
          y1: DOOR_CLEARANCE_CM,
        },
        startXCm: center,
        startYCm: startInsetCm,
      };
    case "south":
      return {
        clearance: {
          x0: center - half,
          y0: room.lengthCm - DOOR_CLEARANCE_CM,
          x1: center + half,
          y1: room.lengthCm,
        },
        startXCm: center,
        startYCm: room.lengthCm - startInsetCm,
      };
    case "west":
      return {
        clearance: {
          x0: 0,
          y0: center - half,
          x1: DOOR_CLEARANCE_CM,
          y1: center + half,
        },
        startXCm: startInsetCm,
        startYCm: center,
      };
    case "east":
      return {
        clearance: {
          x0: room.widthCm - DOOR_CLEARANCE_CM,
          y0: center - half,
          x1: room.widthCm,
          y1: center + half,
        },
        startXCm: room.widthCm - startInsetCm,
        startYCm: center,
      };
  }
}

// ---------------------------------------------------------------------------
// validateLayout
// ---------------------------------------------------------------------------

/**
 * Полная пост-Layout проверка (Requirement 2.4–2.6).
 *
 * Возвращает `{ ok: false, violations }` со всеми найденными нарушениями;
 * нарушений может быть несколько разного типа в одном Layout_JSON. Этот
 * список затем сериализуется в подсказку повторной генерации `Layout_JSON`
 * (Requirement 2.7) и в аудит-поле `design_generations.provider_response`.
 */
export function validateLayout(
  room: RoomDims,
  furniture: FurnitureItem[],
): ValidationResult {
  const violations: ValidationViolation[] = [];
  const aabbs = furniture.map(aabbForItem);

  // 1. AABB-containment.
  for (const a of aabbs) {
    const out =
      a.x0 < 0 ||
      a.y0 < 0 ||
      a.x1 > room.widthCm + INTERSECTION_TOLERANCE_CM ||
      a.y1 > room.lengthCm + INTERSECTION_TOLERANCE_CM;
    if (out) {
      violations.push({
        code: "OUT_OF_ROOM",
        itemIds: [a.id],
        detailRu:
          `Предмет «${a.id}» (${a.type}) выходит за границы комнаты ` +
          `${room.widthCm}×${room.lengthCm} см.`,
      });
    }
  }

  // 2. Попарная не-пересечённость с допуском ≤ 1 см.
  for (let i = 0; i < aabbs.length; i++) {
    for (let j = i + 1; j < aabbs.length; j++) {
      const a = aabbs[i]!;
      const b = aabbs[j]!;
      const { dx, dy } = overlap(a, b);
      if (dx > INTERSECTION_TOLERANCE_CM && dy > INTERSECTION_TOLERANCE_CM) {
        violations.push({
          code: "INTERSECTS",
          itemIds: [a.id, b.id],
          detailRu:
            `Предметы «${a.id}» (${a.type}) и «${b.id}» (${b.type}) ` +
            `пересекаются.`,
        });
      }
    }
  }

  // 3. Door clearance: 60×60 коридор внутри комнаты должен быть свободен.
  const door = computeDoorGeometry(room);
  for (const a of aabbs) {
    const dx =
      Math.min(a.x1, door.clearance.x1) - Math.max(a.x0, door.clearance.x0);
    const dy =
      Math.min(a.y1, door.clearance.y1) - Math.max(a.y0, door.clearance.y0);
    if (dx > INTERSECTION_TOLERANCE_CM && dy > INTERSECTION_TOLERANCE_CM) {
      violations.push({
        code: "BLOCKS_DOOR",
        itemIds: [a.id],
        detailRu:
          `Предмет «${a.id}» (${a.type}) блокирует дверной проём ` +
          `(${room.doorWall}, ${room.doorOffsetCm}..` +
          `${room.doorOffsetCm + room.doorWidthCm} см).`,
      });
    }
  }

  // 4. BFS-проверка прохода 60 см от двери до функциональных предметов.
  const functionalTypes = FUNCTIONAL_TYPES_BY_ROOM[room.roomType] ?? [];
  if (functionalTypes.length > 0) {
    violations.push(
      ...checkPathToFunctionalItems(room, aabbs, door, functionalTypes),
    );
  }

  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// BFS-based 60-cm path check
// ---------------------------------------------------------------------------

function checkPathToFunctionalItems(
  room: RoomDims,
  aabbs: Aabb[],
  door: DoorGeometry,
  functionalTypes: readonly string[],
): ValidationViolation[] {
  const cols = Math.ceil(room.widthCm / GRID_STEP_CM);
  const rows = Math.ceil(room.lengthCm / GRID_STEP_CM);
  if (cols <= 0 || rows <= 0) return [];

  const idx = (c: number, r: number) => r * cols + c;
  const blocked = new Uint8Array(cols * rows);

  // (а) Ячейки внутри AABB предметов мебели.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * GRID_STEP_CM + GRID_STEP_CM / 2;
      const cy = r * GRID_STEP_CM + GRID_STEP_CM / 2;
      for (const a of aabbs) {
        if (cx >= a.x0 && cx <= a.x1 && cy >= a.y0 && cy <= a.y1) {
          blocked[idx(c, r)] = 1;
          break;
        }
      }
    }
  }

  // (б) Стены — однопиксельный обод по краю сетки. Дверной проём —
  // «дыра» в этом ободе (cells, центр которых попадает в [doorOffset,
  // doorOffset + doorWidth] вдоль соответствующей стены, не помечаются).
  const doorStart = room.doorOffsetCm;
  const doorEnd = room.doorOffsetCm + room.doorWidthCm;
  const inDoor = (coordCm: number) => coordCm >= doorStart && coordCm <= doorEnd;

  for (let c = 0; c < cols; c++) {
    const cx = c * GRID_STEP_CM + GRID_STEP_CM / 2;
    if (!(room.doorWall === "north" && inDoor(cx))) {
      blocked[idx(c, 0)] = 1;
    }
    if (!(room.doorWall === "south" && inDoor(cx))) {
      blocked[idx(c, rows - 1)] = 1;
    }
  }
  for (let r = 0; r < rows; r++) {
    const cy = r * GRID_STEP_CM + GRID_STEP_CM / 2;
    if (!(room.doorWall === "west" && inDoor(cy))) {
      blocked[idx(0, r)] = 1;
    }
    if (!(room.doorWall === "east" && inDoor(cy))) {
      blocked[idx(cols - 1, r)] = 1;
    }
  }

  // (в) Морфологическая дилатация Чебышёва радиусом R: cell (c, r) становится
  // dilated-blocked, если в радиусе R по обоим осям есть blocked-ячейка.
  // Реализуется как два прохода (max-filter по горизонтали → max-filter по
  // вертикали), сложность O(N · R), для 160×160 × R=6 — десятые доли мс.
  const dilated = dilateChebyshev(blocked, cols, rows, DILATION_RADIUS_CELLS);

  // (г) Стартовая ячейка BFS — центр двери, R+1 ячеек внутрь комнаты.
  const startC = clamp(Math.floor(door.startXCm / GRID_STEP_CM), 0, cols - 1);
  const startR = clamp(Math.floor(door.startYCm / GRID_STEP_CM), 0, rows - 1);

  if (dilated[idx(startC, startR)]) {
    return [
      {
        code: "PATH_TOO_NARROW",
        itemIds: [],
        detailRu:
          "Возле дверного проёма нет свободного коридора шириной 60 см: " +
          "проверьте отступ ближайших предметов от двери.",
      },
    ];
  }

  // (д) BFS по 4-связности через незалитые ячейки.
  const visited = new Uint8Array(cols * rows);
  const queue: number[] = [];
  visited[idx(startC, startR)] = 1;
  queue.push(idx(startC, startR));

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++]!;
    const c = cur % cols;
    const r = (cur - c) / cols;
    // Соседи (4-связность). Координаты вычисляются inline, чтобы не
    // аллоцировать массив на каждом шаге.
    if (c + 1 < cols) {
      const ni = idx(c + 1, r);
      if (!visited[ni] && !dilated[ni]) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
    if (c - 1 >= 0) {
      const ni = idx(c - 1, r);
      if (!visited[ni] && !dilated[ni]) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
    if (r + 1 < rows) {
      const ni = idx(c, r + 1);
      if (!visited[ni] && !dilated[ni]) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
    if (r - 1 >= 0) {
      const ni = idx(c, r - 1);
      if (!visited[ni] && !dilated[ni]) {
        visited[ni] = 1;
        queue.push(ni);
      }
    }
  }

  // (е) Проверяем достижимость каждого функционального предмета. Так как
  // ячейки внутри AABB и в радиусе R от него заблокированы дилатацией,
  // «достижимый» = существует visited-ячейка в радиусе R+1 ячеек от AABB.
  const violations: ValidationViolation[] = [];
  for (const a of aabbs) {
    if (!functionalTypes.includes(a.type)) continue;
    if (!isItemReached(a, cols, rows, visited, idx)) {
      violations.push({
        code: "NO_PATH_TO_FUNCTIONAL_ITEM",
        itemIds: [a.id],
        detailRu:
          `К предмету «${a.id}» (${a.type}) нет прохода шириной не менее ` +
          `60 см от двери.`,
      });
    }
  }

  return violations;
}

function dilateChebyshev(
  blocked: Uint8Array,
  cols: number,
  rows: number,
  radius: number,
): Uint8Array {
  const horiz = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let v = 0;
      const lo = Math.max(0, c - radius);
      const hi = Math.min(cols - 1, c + radius);
      for (let cc = lo; cc <= hi; cc++) {
        if (blocked[r * cols + cc]) {
          v = 1;
          break;
        }
      }
      horiz[r * cols + c] = v;
    }
  }
  const dilated = new Uint8Array(cols * rows);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      let v = 0;
      const lo = Math.max(0, r - radius);
      const hi = Math.min(rows - 1, r + radius);
      for (let rr = lo; rr <= hi; rr++) {
        if (horiz[rr * cols + c]) {
          v = 1;
          break;
        }
      }
      dilated[r * cols + c] = v;
    }
  }
  return dilated;
}

function isItemReached(
  a: Aabb,
  cols: number,
  rows: number,
  visited: Uint8Array,
  idx: (c: number, r: number) => number,
): boolean {
  // Доступ к предмету = visited-ячейка в Чебышёвском радиусе R+1 от его AABB.
  // R+1 ячеек ≈ 35 см: тело шириной 60 см (радиус 30 см) практически касается
  // предмета (5 см зазора достаточно, чтобы считать его «доступным»).
  const reach = DILATION_RADIUS_CELLS + 1;
  const c0 = clamp(Math.floor(a.x0 / GRID_STEP_CM) - reach, 0, cols - 1);
  const c1 = clamp(Math.ceil(a.x1 / GRID_STEP_CM) + reach - 1, 0, cols - 1);
  const r0 = clamp(Math.floor(a.y0 / GRID_STEP_CM) - reach, 0, rows - 1);
  const r1 = clamp(Math.ceil(a.y1 / GRID_STEP_CM) + reach - 1, 0, rows - 1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (visited[idx(c, r)]) return true;
    }
  }
  return false;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// ---------------------------------------------------------------------------
// Helper: build RoomDims from a full Layout_JSON
// ---------------------------------------------------------------------------

/**
 * Удобный helper для интеграции с `Layout_Planner` и `Design_Worker`:
 * выжимает из полного `LayoutJson` срез, нужный `validateLayout`.
 */
export function roomDimsFromLayout(layout: LayoutJson): RoomDims {
  return {
    widthCm: layout.room.widthCm,
    lengthCm: layout.room.lengthCm,
    heightCm: layout.room.heightCm,
    roomType: layout.room.roomType,
    doorWall: layout.door.wall,
    doorOffsetCm: layout.door.offsetCm,
    doorWidthCm: layout.door.widthCm,
    windowWall: layout.window?.wall ?? null,
    windowOffsetCm: layout.window?.offsetCm ?? null,
    windowWidthCm: layout.window?.widthCm ?? null,
  };
}
