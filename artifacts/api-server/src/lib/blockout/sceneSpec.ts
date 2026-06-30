/**
 * Scene_Spec — модель, схема и сериализация спецификации сцены B2
 * (`AI_Design_3D_Blockout`).
 *
 * См. `.kiro/specs/ai-design-3d-blockout/design.md` секции «Components and
 * Interfaces → Scene_Spec model & builder» и «Data Models → Scene_Spec
 * (каноническая JSON-схема)», а также `requirements.md` Requirement 4
 * (сериализация round-trip).
 *
 * Что делает этот модуль (задача 1.1):
 *   • объявляет типы `SceneSpec`, `Wall`, `FurnitureItem`, `CameraSpec`,
 *     `RoomType`;
 *   • строит zod-схему `sceneSpecSchema` — ЕДИНСТВЕННЫЙ источник правды о
 *     форме `Scene_Spec` (по образцу `parseLayout` в `layoutPlanner.ts`).
 *     Схема запрещает `undefined`, `NaN`/`±Infinity`, даты и буферы: все
 *     числовые листья объявлены `z.number().finite()`, строки —
 *     `z.string()`, объекты — `.strict()` (никаких лишних ключей);
 *   • `serializeSceneSpec(spec)` — канонический JSON (детерминированный
 *     порядок ключей) валидной спецификации (Requirement 4.1);
 *   • `parseSceneSpec(json)` — строгий парс; при нарушении схемы бросает
 *     `SceneSpecValidationError`, чьё сообщение называет первое нарушенное
 *     поле (Requirement 4.2, 4.4).
 *
 * Что добавляет задача 2.1:
 *   • `computeRoomDimensions(roomType, areaM2)` — детерминированный вывод
 *     габаритов W×L×H из площади и типа помещения через табличное
 *     соотношение сторон + фиксированную высоту потолка (Requirement 2.1,
 *     2.4).
 *
 * Чего этот модуль НЕ делает (другие задачи):
 *   • `selectLayoutPreset` / `Layout_Preset` (задача 2.3),
 *     `buildSceneSpec` (задача 3.1), `buildPositionsExport` (задача 3.6) —
 *     добавляются позже.
 */

import { z } from "zod";
import { selectLayoutPreset, type LayoutPreset } from "./layoutPresets";

// ─── Enums / литералы ─────────────────────────────────────────────────────────

/**
 * Поддерживаемые типы помещений. Совпадают с `ROOM_TYPES` из
 * `dizajnFormSchema.ts`, чтобы 3D-путь и 2D-форма говорили об одних и тех
 * же типах помещений.
 */
export const ROOM_TYPES = [
  "bedroom",
  "kitchen",
  "bathroom",
  "living_room",
  "hallway",
  "nursery",
  "apartment",
] as const;

/** Стены прямоугольной оболочки комнаты. */
export const WALLS = ["north", "east", "south", "west"] as const;

/** Допустимые ортогональные повороты мебели (мировые координаты). */
export const ROTATIONS = [0, 90, 180, 270] as const;

/** Роли камер `Camera_Rig`. */
export const CAMERA_ROLES = ["perspective", "top_ortho", "isometric"] as const;

// ─── zod-схема (единственный источник правды) ─────────────────────────────────

/** Конечное число (запрещает `NaN`, `±Infinity`, а также не-числа). */
const finiteNumber = z.number().finite();

/** Строго положительное конечное число (метры, разрешения и т.п.). */
const positiveNumber = z.number().finite().positive();

/** Неотрицательное конечное число (offset/sill — могут быть 0). */
const nonNegativeNumber = z.number().finite().nonnegative();

const roomTypeSchema = z.enum(ROOM_TYPES);
const wallSchema = z.enum(WALLS);

/** rotationDeg ∈ {0,90,180,270}. */
const rotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

const cameraRoleSchema = z.enum(CAMERA_ROLES);

const vec3Schema = z
  .object({
    x: finiteNumber,
    y: finiteNumber,
    z: finiteNumber,
  })
  .strict();

const roomSchema = z
  .object({
    roomType: roomTypeSchema,
    areaM2: positiveNumber,
    dimensions: z
      .object({
        W: positiveNumber,
        L: positiveNumber,
        H: positiveNumber,
      })
      .strict(),
  })
  .strict();

const doorSchema = z
  .object({
    wall: wallSchema,
    offsetM: nonNegativeNumber,
    widthM: positiveNumber,
    heightM: positiveNumber,
  })
  .strict();

const windowSchema = z
  .object({
    wall: wallSchema,
    offsetM: nonNegativeNumber,
    widthM: positiveNumber,
    heightM: positiveNumber,
    sillM: nonNegativeNumber,
  })
  .strict();

const shellSchema = z
  .object({
    door: doorSchema,
    window: windowSchema,
  })
  .strict();

const furnitureItemSchema = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    position: vec3Schema,
    dimensions: z
      .object({
        w: positiveNumber,
        d: positiveNumber,
        h: positiveNumber,
      })
      .strict(),
    rotationDeg: rotationSchema,
  })
  .strict();

const cameraSpecSchema = z
  .object({
    id: z.string().min(1),
    role: cameraRoleSchema,
    position: vec3Schema,
    target: vec3Schema,
    fovDeg: positiveNumber.optional(),
    orthoScale: positiveNumber.optional(),
  })
  .strict();

const renderSchema = z
  .object({
    engine: z.literal("EEVEE_NEXT"),
    renderNormals: z.boolean(),
    resolution: z
      .object({
        width: positiveNumber.int(),
        height: positiveNumber.int(),
      })
      .strict(),
  })
  .strict();

const styleSchema = z
  .object({
    // Shared_Style_Prompt непустой (Req 6.3).
    sharedStylePrompt: z.string().min(1),
    // negativePrompt может быть пустой строкой.
    negativePrompt: z.string(),
  })
  .strict();

/**
 * Каноническая схема `Scene_Spec`. `.strict()` на каждом уровне запрещает
 * лишние ключи, `finite()` — `NaN`/`Infinity`; даты/буферы отсекаются, так
 * как не являются `number`/`string`/`boolean`. Это делает round-trip
 * тождественным (Requirement 4.3).
 */
export const sceneSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    room: roomSchema,
    shell: shellSchema,
    layoutPresetId: z.string().min(1),
    furniture: z
      .array(furnitureItemSchema)
      .min(1)
      // `id` уникален в пределах Scene_Spec (см. Data Models). При нарушении
      // путь указывает на конкретный дублирующий элемент массива, чтобы
      // сообщение об ошибке называло поле (Req 4.4).
      .superRefine((items, ctx) => {
        const seen = new Set<string>();
        items.forEach((item, index) => {
          if (seen.has(item.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `furniture id "${item.id}" не уникален`,
              path: [index, "id"],
            });
          }
          seen.add(item.id);
        });
      }),
    cameraRig: z
      .array(cameraSpecSchema)
      // Camera_Rig фиксирован: ровно 6 камер — 4 perspective + 1 top_ortho +
      // 1 isometric (Req 5.1, Data Models → Camera_Rig).
      .length(6)
      .superRefine((cameras, ctx) => {
        const count = (role: (typeof CAMERA_ROLES)[number]): number =>
          cameras.filter((c) => c.role === role).length;
        if (count("perspective") !== 4) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `cameraRig должен содержать ровно 4 perspective-камеры, найдено ${count(
              "perspective",
            )}`,
            path: [],
          });
        }
        if (count("top_ortho") !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `cameraRig должен содержать ровно 1 top_ortho-камеру, найдено ${count(
              "top_ortho",
            )}`,
            path: [],
          });
        }
        if (count("isometric") !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `cameraRig должен содержать ровно 1 isometric-камеру, найдено ${count(
              "isometric",
            )}`,
            path: [],
          });
        }
      }),
    render: renderSchema,
    style: styleSchema,
  })
  .strict();

// ─── Типы (выводятся из схемы — единый источник правды) ────────────────────────

export type RoomType = (typeof ROOM_TYPES)[number];
export type Wall = (typeof WALLS)[number];
export type CameraRole = (typeof CAMERA_ROLES)[number];
export type RotationDeg = (typeof ROTATIONS)[number];

export type SceneSpec = z.infer<typeof sceneSpecSchema>;
export type FurnitureItem = z.infer<typeof furnitureItemSchema>;
export type CameraSpec = z.infer<typeof cameraSpecSchema>;

// ─── Ошибка валидации ─────────────────────────────────────────────────────────

/**
 * Терминальная ошибка строгого парсинга `Scene_Spec`. Сообщение называет
 * первое нарушенное поле (Requirement 4.4); `field` — точечный путь к нему,
 * `issues` — полный список нарушений zod для отладки.
 */
export class SceneSpecValidationError extends Error {
  public readonly field: string;
  public readonly issues: z.ZodIssue[];
  constructor(field: string, message: string, issues: z.ZodIssue[]) {
    super(message);
    this.name = "SceneSpecValidationError";
    this.field = field;
    this.issues = issues;
  }
}

/** Точечный путь к полю (`furniture.0.id`, `room.dimensions.W`, ...). */
function joinPath(path: ReadonlyArray<PropertyKey>): string {
  return path.length === 0 ? "<root>" : path.map((p) => String(p)).join(".");
}

// ─── Сериализация / парсинг ────────────────────────────────────────────────────

/**
 * Канонический `JSON.stringify` с детерминированным порядком ключей: ключи
 * каждого объекта сортируются лексикографически, поэтому одинаковые по
 * значению спецификации дают побайтово одинаковый JSON независимо от порядка
 * вставки ключей. Массивы сохраняют порядок (он значим).
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys
    // undefined-листья не сериализуются (как и в обычном JSON.stringify),
    // но схема их и так не допускает в обязательных полях.
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Сериализует `Scene_Spec` в канонический JSON (Requirement 4.1).
 *
 * Спецификация сначала прогоняется через схему — так гарантируется, что на
 * вход `Blockout_Builder` уходит только валидная сцена, а результат всегда
 * каноничен и парсится обратно тождественно (Requirement 4.3).
 *
 * @throws {SceneSpecValidationError} если `spec` не соответствует схеме.
 */
export function serializeSceneSpec(spec: SceneSpec): string {
  const parsed = sceneSpecSchema.safeParse(spec);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue ? joinPath(issue.path) : "<root>";
    const message = issue?.message ?? "невалидный Scene_Spec";
    throw new SceneSpecValidationError(
      field,
      `Scene_Spec невалиден в поле "${field}": ${message}`,
      parsed.error.issues,
    );
  }
  return canonicalStringify(parsed.data);
}

/**
 * Строгий парсинг `Scene_Spec` (Requirement 4.2). Принимает либо JSON-строку,
 * либо уже распарсенный `unknown`.
 *
 * @throws {SceneSpecValidationError} с именем первого нарушенного поля, если
 *   вход не соответствует схеме (Requirement 4.4).
 */
export function parseSceneSpec(json: unknown): SceneSpec {
  let raw: unknown = json;
  if (typeof json === "string") {
    try {
      raw = JSON.parse(json);
    } catch (err) {
      throw new SceneSpecValidationError(
        "<root>",
        `Scene_Spec: невалидный JSON: ${
          err instanceof Error ? err.message : String(err)
        }`,
        [],
      );
    }
  }

  const parsed = sceneSpecSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue ? joinPath(issue.path) : "<root>";
    const message = issue?.message ?? "не соответствует схеме Scene_Spec";
    throw new SceneSpecValidationError(
      field,
      `Scene_Spec невалиден в поле "${field}": ${message}`,
      parsed.error.issues,
    );
  }
  return parsed.data;
}

// ─── Габариты комнаты (задача 2.1) ─────────────────────────────────────────────

/**
 * Фиксированная высота потолка (метры) для всех типов помещений. Делает
 * H детерминированной и независимой от площади (Requirement 2.1) и строго
 * положительной (Requirement 2.4).
 */
export const FIXED_CEILING_HEIGHT_M = 2.7;

/**
 * Табличные соотношения сторон W:L по типу помещения. Значение — отношение
 * ширины к длине (`W / L`), строго положительное. Таблица — единственный
 * источник «формы» комнаты: при фиксированной площади она однозначно задаёт
 * W и L, поэтому вывод габаритов детерминирован (Requirement 2.1).
 *
 * Прихожие/коридоры намеренно вытянутые, спальни/гостиные ближе к квадрату,
 * санузел компактный — пропорции подобраны под правдоподобную геометрию
 * блокаута, но любое положительное значение здесь сохраняет корректность.
 */
export const ROOM_ASPECT_RATIOS: Readonly<Record<RoomType, number>> = {
  bedroom: 1.2,
  kitchen: 1.3,
  bathroom: 1.25,
  living_room: 1.4,
  hallway: 2.5,
  nursery: 1.15,
  apartment: 1.5,
};

/**
 * Детерминированно выводит габариты комнаты `W × L × H` (метры) из типа
 * помещения и площади.
 *
 * Алгоритм: высота потолка фиксирована (`FIXED_CEILING_HEIGHT_M`); ширина и
 * длина берутся из площади и табличного соотношения сторон
 * `r = W / L = ROOM_ASPECT_RATIOS[roomType]`. Поскольку `W·L = areaM2` и
 * `W = r·L`, то `L = sqrt(areaM2 / r)` и `W = r·L = sqrt(areaM2·r)`. Для
 * одной и той же пары `(roomType, areaM2)` результат всегда один и тот же —
 * детерминизм (Requirement 2.1).
 *
 * Все три значения строго положительны: `areaM2 > 0` и `r > 0`, поэтому
 * корни строго положительны, а высота — положительная константа
 * (Requirement 2.4).
 *
 * @param roomType тип помещения (должен иметь соотношение в таблице).
 * @param areaM2   площадь, м² (строго положительная, конечная).
 * @throws {Error} если `areaM2` не является строго положительным конечным
 *   числом, либо для `roomType` нет соотношения сторон.
 */
export function computeRoomDimensions(
  roomType: RoomType,
  areaM2: number,
): { W: number; L: number; H: number } {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    throw new Error(
      `computeRoomDimensions: areaM2 должно быть строго положительным конечным числом, получено ${areaM2}`,
    );
  }

  const ratio = ROOM_ASPECT_RATIOS[roomType];
  if (ratio === undefined || !Number.isFinite(ratio) || ratio <= 0) {
    throw new Error(
      `computeRoomDimensions: нет валидного соотношения сторон для типа помещения "${roomType}"`,
    );
  }

  // Берём корень ДО деления/умножения на соотношение сторон. Математически
  // L = sqrt(areaM2 / ratio) = sqrt(areaM2) / sqrt(ratio), а
  // W = sqrt(areaM2 * ratio) = sqrt(areaM2) * sqrt(ratio). Но промежуточное
  // `areaM2 / ratio` для очень малых площадей (близких к Number.MIN_VALUE) при
  // ratio > 1 теряет точность вплоть до underflow в 0, из-за чего L обнулялся и
  // нарушал контракт строгой положительности (Requirement 2.4). Разложение через
  // sqrt(areaM2) сохраняет положительность для любой положительной конечной площади.
  const sqrtArea = Math.sqrt(areaM2);
  const sqrtRatio = Math.sqrt(ratio);
  const L = sqrtArea / sqrtRatio;
  const W = sqrtArea * sqrtRatio; // эквивалентно Math.sqrt(areaM2 * ratio)
  const H = FIXED_CEILING_HEIGHT_M;

  return { W, L, H };
}

// ─── Сборка Scene_Spec (задача 3.1) ───────────────────────────────────────────

/**
 * Минимально допустимая площадь (м²) по типу помещения. Если площадь меньше
 * минимума — `buildSceneSpec` завершается ошибкой, называющей тип помещения и
 * минимальную площадь (Requirement 2.5 / Property 4). Значения подобраны так,
 * чтобы оболочка и пресет мебели физически помещались в комнату.
 */
export const ROOM_MIN_AREA_M2: Readonly<Record<RoomType, number>> = {
  bathroom: 2,
  hallway: 2,
  kitchen: 5,
  bedroom: 6,
  nursery: 6,
  living_room: 8,
  apartment: 15,
};

/** Стилевые поля, задаваемые оператором при сборке `Scene_Spec`. */
export interface StyleInput {
  /** Единый стилевой промпт (Shared_Style_Prompt), непустой (Req 6.3). */
  sharedStylePrompt: string;
  /** Негативный промпт; по умолчанию пустая строка. */
  negativePrompt?: string;
}

/** Вход сборки `Scene_Spec`. */
export interface BuildSceneSpecInput {
  roomType: RoomType;
  areaM2: number;
  style: StyleInput;
}

/**
 * Ошибка сборки `Scene_Spec` при площади ниже минимума для типа помещения.
 * Сообщение содержит тип помещения и числовой минимум (Requirement 2.5 /
 * Property 4); поля `roomType`/`minAreaM2` доступны программно.
 */
export class SceneAreaTooSmallError extends Error {
  public readonly roomType: RoomType;
  public readonly areaM2: number;
  public readonly minAreaM2: number;
  constructor(roomType: RoomType, areaM2: number, minAreaM2: number) {
    super(
      `buildSceneSpec: площадь ${areaM2} м² меньше минимально допустимой для ` +
        `типа помещения "${roomType}" (минимум ${minAreaM2} м²)`,
    );
    this.name = "SceneAreaTooSmallError";
    this.roomType = roomType;
    this.areaM2 = areaM2;
    this.minAreaM2 = minAreaM2;
  }
}

/** Отступ (м) от стен при вписывании мебели и проёмов в оболочку. */
const FIT_MARGIN_M = 0.1;

/** Полугабариты предмета в плане (XY) с учётом ортогонального поворота. */
function rotatedHalfExtents(item: {
  dimensions: { w: number; d: number; h: number };
  rotationDeg: RotationDeg;
}): { hx: number; hy: number; hz: number } {
  const { w, d, h } = item.dimensions;
  // 90/270 меняют местами ширину и глубину в плане.
  const swapped = item.rotationDeg === 90 || item.rotationDeg === 270;
  return {
    hx: (swapped ? d : w) / 2,
    hy: (swapped ? w : d) / 2,
    hz: h / 2,
  };
}

/**
 * Габаритный параллелепипед (AABB) всей расстановки пресета в координатах
 * пресета (с учётом поворотов предметов в плане).
 */
function computeLayoutAabb(furniture: LayoutPreset["furniture"]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const item of furniture) {
    const { hx, hy, hz } = rotatedHalfExtents(item);
    minX = Math.min(minX, item.position.x - hx);
    maxX = Math.max(maxX, item.position.x + hx);
    minY = Math.min(minY, item.position.y - hy);
    maxY = Math.max(maxY, item.position.y + hy);
    minZ = Math.min(minZ, item.position.z - hz);
    maxZ = Math.max(maxZ, item.position.z + hz);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Вписывает мебель пресета в границы `Room_Shell` `[0..W]×[0..L]×[0..H]`.
 *
 * Применяет единый (равномерный) масштаб `s` к позициям и габаритам всех
 * предметов и сдвиг, так что габаритный параллелепипед всей расстановки —
 * с учётом ортогональных поворотов — целиком умещается внутри комнаты с
 * небольшим отступом от стен. Равномерный масштаб не искажает пропорции
 * предметов и сохраняет ортогональные повороты, поэтому AABB каждого предмета
 * остаётся внутри `[0..W]×[0..L]×[0..H]` (Requirement 3.4 / Property 8).
 */
function fitFurnitureToShell(
  furniture: LayoutPreset["furniture"],
  W: number,
  L: number,
  H: number,
): SceneSpec["furniture"] {
  const aabb = computeLayoutAabb(furniture);
  const extX = Math.max(aabb.maxX - aabb.minX, 1e-6);
  const extY = Math.max(aabb.maxY - aabb.minY, 1e-6);
  const extZ = Math.max(aabb.maxZ - aabb.minZ, 1e-6);

  // Отступ ограничен долей габарита, чтобы доступное пространство оставалось
  // строго положительным даже для очень маленьких комнат.
  const marginX = Math.min(FIT_MARGIN_M, W * 0.1);
  const marginY = Math.min(FIT_MARGIN_M, L * 0.1);
  const marginZTop = Math.min(FIT_MARGIN_M, H * 0.1);

  const availW = W - 2 * marginX;
  const availL = L - 2 * marginY;
  const availH = H - marginZTop; // пол на z=0, отступ только сверху

  // Масштаб не увеличивает расстановку (≤ 1), но ужимает её при необходимости.
  const s = Math.min(1, availW / extX, availL / extY, availH / extZ);

  // Сдвиг: центрируем расстановку по X/Y в доступном пространстве, ставим на
  // пол по Z. После масштабирования вокруг начала координат новый AABB равен
  // [s·min, s·max], поэтому сдвиг даёт гарантированное вписывание.
  const tx = marginX + (availW - s * extX) / 2 - s * aabb.minX;
  const ty = marginY + (availL - s * extY) / 2 - s * aabb.minY;
  const tz = -s * aabb.minZ;

  return furniture.map((item) => ({
    id: item.id,
    kind: item.kind,
    position: {
      x: s * item.position.x + tx,
      y: s * item.position.y + ty,
      z: s * item.position.z + tz,
    },
    dimensions: {
      w: s * item.dimensions.w,
      d: s * item.dimensions.d,
      h: s * item.dimensions.h,
    },
    rotationDeg: item.rotationDeg,
  }));
}

/** Протяжённость стены (м): north/south идут вдоль W, east/west — вдоль L. */
function wallLength(wall: Wall, W: number, L: number): number {
  return wall === "north" || wall === "south" ? W : L;
}

/**
 * Помещает проём (дверь/окно) заданной номинальной ширины по центру указанной
 * стены так, чтобы `offsetM + widthM` не выходил за протяжённость стены
 * (Requirement 2.2, 2.3 / Property 5). При необходимости ширина ужимается под
 * длину стены.
 */
function placeOpening(
  wall: Wall,
  nominalWidthM: number,
  W: number,
  L: number,
): { widthM: number; offsetM: number } {
  const len = wallLength(wall, W, L);
  const widthM = Math.min(nominalWidthM, len * 0.6);
  const offsetM = Math.max(0, (len - widthM) / 2);
  return { widthM, offsetM };
}

/**
 * Полная детерминированная сборка `Scene_Spec` из типа помещения, площади и
 * стиля.
 *
 * Шаги:
 *   1. Проверка площади: если меньше минимума для типа помещения —
 *      `SceneAreaTooSmallError` с типом и минимумом (Req 2.5 / Property 4).
 *   2. Габариты `W×L×H` через `computeRoomDimensions` (детерминизм, Req 2.1).
 *   3. Оболочка: ровно одна дверь и одно окно на указанных стенах в пределах
 *      их протяжённости (Req 2.2, 2.3 / Property 5).
 *   4. Выбор `Layout_Preset` по типу помещения (Req 3.1; бросает ошибку с
 *      именем типа, если пресета нет — Req 3.5).
 *   5. Вписывание мебели пресета в границы `Room_Shell` (Req 3.4 / Property 8).
 *   6. Фиксированный `Camera_Rig`: ровно 4 perspective + 1 top_ortho +
 *      1 isometric с детерминированными (переиспользуемыми) позициями
 *      (Req 5.1, 5.4 / Property 10).
 *
 * Результат прогоняется через `sceneSpecSchema` (через `parseSceneSpec`), что
 * гарантирует валидный round-trip-совместимый `Scene_Spec`.
 *
 * @throws {SceneAreaTooSmallError} если площадь меньше минимума для типа.
 * @throws {Error} если для типа помещения нет `Layout_Preset` (Req 3.5).
 * @throws {SceneSpecValidationError} если собранная сцена не прошла схему.
 */
export function buildSceneSpec(input: BuildSceneSpecInput): SceneSpec {
  const { roomType, areaM2, style } = input;

  // (1) Валидация площади относительно минимума для типа помещения.
  const minAreaM2 = ROOM_MIN_AREA_M2[roomType];
  if (minAreaM2 === undefined) {
    throw new Error(
      `buildSceneSpec: неизвестный тип помещения "${roomType}"`,
    );
  }
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    throw new Error(
      `buildSceneSpec: areaM2 должно быть строго положительным конечным числом, получено ${areaM2}`,
    );
  }
  if (areaM2 < minAreaM2) {
    throw new SceneAreaTooSmallError(roomType, areaM2, minAreaM2);
  }

  // (2) Детерминированные габариты.
  const { W, L, H } = computeRoomDimensions(roomType, areaM2);

  // (3) Оболочка: дверь и окно на противоположных стенах в пределах протяжённости.
  const doorWall: Wall = "south";
  const windowWall: Wall = "north";
  const door = placeOpening(doorWall, 0.9, W, L);
  const window = placeOpening(windowWall, 1.2, W, L);
  const doorHeightM = Math.min(2.1, H - 0.1);
  const sillM = Math.min(0.9, H * 0.3);
  const windowHeightM = Math.min(1.4, Math.max(0.3, H - sillM - 0.1));

  // (4) Пресет расстановки по типу помещения.
  const preset = selectLayoutPreset(roomType);

  // (5) Вписывание мебели в границы Room_Shell.
  const furniture = fitFurnitureToShell(preset.furniture, W, L, H);

  // (6) Фиксированный Camera_Rig (детерминирован по габаритам).
  const cameraRig = buildCameraRig(W, L, H);

  const spec: SceneSpec = {
    schemaVersion: 1,
    room: {
      roomType,
      areaM2,
      dimensions: { W, L, H },
    },
    shell: {
      door: {
        wall: doorWall,
        offsetM: door.offsetM,
        widthM: door.widthM,
        heightM: doorHeightM,
      },
      window: {
        wall: windowWall,
        offsetM: window.offsetM,
        widthM: window.widthM,
        heightM: windowHeightM,
        sillM,
      },
    },
    layoutPresetId: preset.id,
    furniture,
    cameraRig,
    render: {
      engine: "EEVEE_NEXT",
      renderNormals: false,
      resolution: { width: 1024, height: 1024 },
    },
    style: {
      sharedStylePrompt: style.sharedStylePrompt,
      negativePrompt: style.negativePrompt ?? "",
    },
  };

  // Прогон через схему гарантирует валидность собранной сцены и тождественный
  // round-trip (Requirement 4.x); при нарушении бросает SceneSpecValidationError.
  return parseSceneSpec(spec);
}

/**
 * Строит фиксированный `Camera_Rig`: ровно 4 perspective + 1 top_ortho +
 * 1 isometric (Requirement 5.1). Позиции детерминированы как чистая функция
 * габаритов `W×L×H`, поэтому для одинаковых габаритов одноимённые камеры
 * получают идентичные позиции — переиспользуемый риг (Requirement 5.4 /
 * Property 10).
 */
function buildCameraRig(W: number, L: number, H: number): SceneSpec["cameraRig"] {
  const cx = W / 2;
  const cy = L / 2;
  const eyeH = Math.min(1.5, H * 0.6);
  const maxDim = Math.max(W, L, H);
  const center = { x: cx, y: cy, z: eyeH };

  const perspective: SceneSpec["cameraRig"] = [
    {
      id: "cam_persp_1",
      role: "perspective",
      position: { x: W * 0.05, y: L * 0.05, z: eyeH },
      target: center,
      fovDeg: 60,
    },
    {
      id: "cam_persp_2",
      role: "perspective",
      position: { x: W * 0.95, y: L * 0.05, z: eyeH },
      target: center,
      fovDeg: 60,
    },
    {
      id: "cam_persp_3",
      role: "perspective",
      position: { x: W * 0.95, y: L * 0.95, z: eyeH },
      target: center,
      fovDeg: 60,
    },
    {
      id: "cam_persp_4",
      role: "perspective",
      position: { x: W * 0.05, y: L * 0.95, z: eyeH },
      target: center,
      fovDeg: 60,
    },
  ];

  const topOrtho: SceneSpec["cameraRig"][number] = {
    id: "cam_top",
    role: "top_ortho",
    position: { x: cx, y: cy, z: H + maxDim },
    target: { x: cx, y: cy, z: 0 },
    orthoScale: Math.max(W, L) * 1.1,
  };

  const isometric: SceneSpec["cameraRig"][number] = {
    id: "cam_iso",
    role: "isometric",
    position: { x: cx + maxDim, y: cy - maxDim, z: H + maxDim },
    target: { x: cx, y: cy, z: H / 2 },
    orthoScale: Math.max(W, L) * 1.6,
  };

  return [...perspective, topOrtho, isometric];
}

// ─── Test hooks (не часть публичного контракта) ───────────────────────────────

/** Экспорт для unit/property-тестов и отладки. В проде не используется. */
export const __test__ = {
  sceneSpecSchema,
  canonicalStringify,
  joinPath,
  rotatedHalfExtents,
  computeLayoutAabb,
  fitFurnitureToShell,
  wallLength,
  placeOpening,
  buildCameraRig,
};
