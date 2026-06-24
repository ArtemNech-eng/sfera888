/**
 * Layout_Planner — обёртка над AI_Content_Provider для AI_Design_Product.
 *
 * См. `.kiro/specs/ai-design-product/design.md` секция «Layout_Planner»
 * и `requirements.md` Requirement 6 (Layout_JSON), Requirement 2.7–2.8
 * (повторные генерации с `previousViolations`), Requirement 6.5
 * (≤ 2 повторов при невалидной JSON-схеме).
 *
 * Что делает:
 *   • строит Layout_JSON для одной комнаты через JSON-schema structured
 *     output OpenAI (`response_format: { type: "json_schema", strict: true }`);
 *   • при ошибке парсинга или несоответствии возвращённого объекта схеме
 *     повторяет запрос ≤ 2 раз (всего до 3 попыток), затем бросает
 *     `LayoutGenerationError`;
 *   • при наличии `previousViolations` из `Geometric_Validator` (см.
 *     `geometricValidator.ts`) включает их в подсказку для модели — так
 *     повторная генерация знает, что именно поправить.
 *
 * Чего не делает:
 *   • не вызывает `validateLayout` — это задача воркера (`designWorker.ts`
 *     → task 15.1); геометрический retry-цикл организуется на уровне FSM
 *     воркера, а этот модуль лишь принимает `previousViolations` для
 *     prompt'а;
 *   • не пишет в `design_generations` — учёт стоимости делает воркер по
 *     своему обычному паттерну (см. `designContent.ts` / `designWorker.ts`).
 *
 * Конфигурация полностью совпадает с `designContent.ts`:
 *   AI_INTEGRATIONS_OPENAI_API_KEY  — обязательный
 *   AI_INTEGRATIONS_OPENAI_BASE_URL — OpenRouter / прокси
 *   AI_INTEGRATIONS_DESIGN_MODEL    → AI_INTEGRATIONS_OPENAI_MODEL → claude-opus-4-7
 */

import OpenAI from "openai";
import type { FurnitureItem, LayoutJson, Wall } from "@workspace/db";
import type { ValidationViolation } from "./geometricValidator.js";

// ─── OpenAI client (тот же шлюз, что и designContent.ts) ──────────────────────

const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const model =
  process.env["AI_INTEGRATIONS_DESIGN_MODEL"]
  ?? process.env["AI_INTEGRATIONS_OPENAI_MODEL"]
  ?? "claude-opus-4-7";

let openai: OpenAI | null = null;
function client(): OpenAI {
  if (!openai) {
    if (!apiKey) {
      throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY is not configured");
    }
    openai = new OpenAI({ apiKey, baseURL });
  }
  return openai;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface LayoutPlannerInput {
  /** `bedroom` | `kitchen` | `bathroom` | `living_room` | `hallway` |
   *  `nursery` | `apartment` (Requirement 1.2). */
  roomType: string;
  /** Ширина помещения, см (200..800). */
  widthCm: number;
  /** Длина помещения, см (200..800). */
  lengthCm: number;
  /** Высота потолка, см (220..350). */
  heightCm: number;
  /** Стиль (Requirement 1.4). */
  style: string;
  /** Бюджет, ₽ (Requirement 1.6). */
  budget: number;
  /** Опциональные флаги доп. функций — рабочая зона, акцентная стена и т.п. */
  features?: string[];
  /**
   * Конкретные нарушения предыдущей попытки `validateLayout` (Requirement 2.7).
   * Передаются воркером после неудачной геометрической проверки. Если
   * непустой — включается в системную подсказку, чтобы GPT знал, что именно
   * поправить.
   */
  previousViolations?: ValidationViolation[];
}

/**
 * Терминальная ошибка генерации Layout_JSON. Бросается:
 *   • при исчерпании ≤ 2 повторов на JSON-схеме / парсинге;
 *   • при ошибке конфигурации (нет API-ключа);
 *   • при сетевой/протокольной ошибке OpenAI (повторы здесь не помогут —
 *     решение о ретрае выше по стеку принимает воркер).
 *
 * Поле `cause` содержит последнюю обёрнутую ошибку (оригинальный JSON.parse,
 * структурный mismatch или ошибка SDK).
 */
export class LayoutGenerationError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "LayoutGenerationError";
    this.cause = cause;
  }
}

/**
 * Просит AI_Content_Provider построить Layout_JSON под параметры комнаты.
 *
 * @throws {LayoutGenerationError} если все ≤ 3 попытки вернули невалидный
 *   JSON или ответ не соответствует JSON-схеме Layout_JSON, а также при
 *   ошибках транспорта/конфигурации.
 */
export async function generateLayoutJson(
  input: LayoutPlannerInput,
): Promise<LayoutJson> {
  let lastSchemaError: LayoutGenerationError | null = null;

  for (let attempt = 0; attempt <= MAX_SCHEMA_RETRIES; attempt++) {
    try {
      return await generateOnce(input);
    } catch (err) {
      if (err instanceof LayoutGenerationError && err.cause !== undefined) {
        // Это ошибка JSON-схемы или парсинга (cause всегда выставляется в
        // `generateOnce` для таких случаев). Можно повторить.
        lastSchemaError = err;
        continue;
      }
      // Сетевые/конфигурационные ошибки — повторами их не починишь, бросаем
      // сразу. Воркер сам решит, делать ли пайплайн `failed` или ждать
      // следующий тик.
      if (err instanceof LayoutGenerationError) throw err;
      throw err instanceof Error
        ? new LayoutGenerationError(`Layout_Planner: ${err.message}`, err)
        : new LayoutGenerationError("Layout_Planner: неизвестная ошибка", err);
    }
  }

  // После исчерпания retry-цикла всегда должна быть собрана
  // `lastSchemaError` (хотя бы одна попытка прошла через catch). Если
  // её нет — массив попыток фактически пуст: например, цикл с
  // `MAX_SCHEMA_RETRIES < 0` или иная аномалия. Защищаемся явно, чтобы
  // никогда не дойти до `[0]`-доступа к недозаполненной структуре
  // (исторический TypeError, маскировавший «retries exhausted»).
  if (!lastSchemaError) {
    throw new LayoutGenerationError(
      "Layout_Planner: no successful layout produced",
    );
  }
  throw new LayoutGenerationError(
    `Layout_Planner: all ${MAX_SCHEMA_RETRIES} retries exhausted, last error: ${lastSchemaError.message}`,
    lastSchemaError.cause,
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** ≤ 2 повторов на ошибки JSON-схемы / парсинга (Requirement 6.5).
 *  Итого до 3 попыток (1 первичная + 2 повтора). */
const MAX_SCHEMA_RETRIES = 2;

/**
 * Полная JSON-схема Layout_JSON — verbatim из `design.md` секция
 * `Layout_Planner`. `additionalProperties: false` на каждом уровне
 * принципиален: без него strict-режим OpenAI всё равно пропускает поля,
 * добавленные моделью (например, `comments`), и `JSON.parse` начинает
 * получать «лишнее».
 */
const LAYOUT_JSON_SCHEMA = {
  name: "RoomLayout",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["room", "door", "window", "furniture"],
    properties: {
      room: {
        type: "object",
        additionalProperties: false,
        required: ["roomType", "widthCm", "lengthCm", "heightCm"],
        properties: {
          roomType: {
            type: "string",
            enum: [
              "bedroom",
              "kitchen",
              "bathroom",
              "living_room",
              "hallway",
              "nursery",
              "apartment",
            ],
          },
          widthCm: { type: "integer", minimum: 200, maximum: 800 },
          lengthCm: { type: "integer", minimum: 200, maximum: 800 },
          heightCm: { type: "integer", minimum: 220, maximum: 350 },
        },
      },
      door: {
        type: "object",
        additionalProperties: false,
        required: ["wall", "offsetCm", "widthCm"],
        properties: {
          wall: {
            type: "string",
            enum: ["north", "east", "south", "west"],
          },
          offsetCm: { type: "integer", minimum: 0, maximum: 800 },
          widthCm: { type: "integer", minimum: 70, maximum: 110 },
        },
      },
      window: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["wall", "offsetCm", "widthCm"],
        properties: {
          wall: {
            type: "string",
            enum: ["north", "east", "south", "west"],
          },
          offsetCm: { type: "integer", minimum: 0, maximum: 800 },
          widthCm: { type: "integer", minimum: 60, maximum: 400 },
        },
      },
      furniture: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "type",
            "widthCm",
            "depthCm",
            "heightCm",
            "xCm",
            "yCm",
            "rotationDeg",
          ],
          properties: {
            id: { type: "string", pattern: "^[a-z0-9_-]{1,32}$" },
            type: {
              type: "string",
              enum: [
                "bed",
                "wardrobe",
                "desk",
                "chair",
                "nightstand",
                "rug",
                "dresser",
                "shelf",
                "sofa",
                "armchair",
                "tv_unit",
                "coffee_table",
                "dining_table",
                "kitchen_island",
                "sink",
                "toilet",
                "bathtub",
                "shower",
                "mirror",
                "cabinet",
              ],
            },
            widthCm: { type: "integer", minimum: 20, maximum: 400 },
            depthCm: { type: "integer", minimum: 20, maximum: 400 },
            heightCm: { type: "integer", minimum: 10, maximum: 280 },
            xCm: { type: "integer", minimum: 0, maximum: 800 },
            yCm: { type: "integer", minimum: 0, maximum: 800 },
            rotationDeg: { type: "integer", enum: [0, 90, 180, 270] },
          },
        },
      },
    },
  },
} as const;

// ─── Prompts ─────────────────────────────────────────────────────────────────

const ROOM_LABELS_RU: Record<string, string> = {
  bedroom: "спальня",
  kitchen: "кухня",
  bathroom: "ванная",
  living_room: "гостиная",
  hallway: "прихожая",
  nursery: "детская",
  apartment: "квартира",
};

const STYLE_LABELS_RU: Record<string, string> = {
  modern: "современный",
  scandinavian: "скандинавский",
  loft: "лофт",
  minimalism: "минимализм",
  neoclassic: "неоклассика",
  japandi: "японди",
  classic: "классика",
};

function buildSystemPrompt(): string {
  return [
    "Ты опытный дизайнер интерьеров и планировщик мебели.",
    "Твоя задача — выдать строго валидный Layout_JSON по приведённой JSON-схеме.",
    "",
    "ПРАВИЛА:",
    "1. Все размеры — целые числа в сантиметрах.",
    "2. Координаты xCm/yCm — левый-верхний угол AABB предмета относительно",
    "   левого-верхнего угла комнаты. rotationDeg ∈ {0, 90, 180, 270}.",
    "   При повороте 90/270 ширина и глубина AABB меняются местами.",
    "3. Каждый предмет должен полностью лежать внутри прямоугольника комнаты.",
    "4. Предметы не должны пересекаться между собой.",
    "5. 60×60 см коридор от двери внутрь комнаты должен оставаться свободным.",
    "6. От двери до функциональной мебели (для спальни — кровати и шкафа)",
    "   должен оставаться сквозной проход шириной не менее 60 см.",
    "7. Бюджет — ориентир: размеры мебели должны быть реалистичными для",
    "   жилого интерьера, не выбирай заведомо нестандартные габариты.",
    "8. Возвращай только JSON по схеме. Никаких комментариев и пояснений.",
  ].join("\n");
}

function buildUserPrompt(input: LayoutPlannerInput): string {
  const roomLabel = ROOM_LABELS_RU[input.roomType] ?? input.roomType;
  const styleLabel = STYLE_LABELS_RU[input.style] ?? input.style;
  const lines: string[] = [
    "Спланируй размещение мебели для следующего помещения:",
    `- Тип: ${roomLabel} (roomType="${input.roomType}")`,
    `- Размеры: ${input.widthCm} см × ${input.lengthCm} см, потолок ${input.heightCm} см`,
    `- Стиль: ${styleLabel} (style="${input.style}")`,
    `- Бюджет: ${input.budget.toLocaleString("ru-RU")} ₽`,
  ];
  if (input.features && input.features.length > 0) {
    lines.push(`- Доп. функции: ${input.features.join(", ")}`);
  }

  // Requirement 2.7: при повторе передаём конкретные нарушения, чтобы
  // модель понимала, что именно нужно исправить.
  if (input.previousViolations && input.previousViolations.length > 0) {
    lines.push(
      "",
      "ВАЖНО: предыдущая попытка не прошла геометрическую проверку.",
      "Нарушения предыдущего плана:",
      ...input.previousViolations.map(
        (v, i) => `  ${i + 1}. [${v.code}] ${v.detailRu}`,
      ),
      "",
      "Сделай новый план так, чтобы все эти нарушения были устранены.",
    );
  }

  lines.push(
    "",
    "Верни Layout_JSON, соответствующий заданной JSON-схеме.",
  );
  return lines.join("\n");
}

// ─── Single attempt ──────────────────────────────────────────────────────────

async function generateOnce(input: LayoutPlannerInput): Promise<LayoutJson> {
  const completion = await client().chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(input) },
    ],
    response_format: { type: "json_schema", json_schema: LAYOUT_JSON_SCHEMA },
    // Низкая температура для повторяемости: для планировки разнообразие
    // не нужно, нужен валидный и обоснованный результат.
    temperature: 0.4,
  });

  // Guard: некоторые провайдеры (особенно через OpenRouter) возвращают
  // ответ без поля `choices` или с пустым массивом — например, при
  // временной 5xx у апстрима, отбраковке модерацией или несовместимом
  // ответе модели. Без guard `completion.choices[0]` валит TypeError
  // «Cannot read properties of undefined (reading '0')», который не
  // ловится retry-циклом как schema error и маскирует нормальную
  // «retries exhausted» терминальную ошибку.
  if (!completion?.choices || completion.choices.length === 0) {
    throw new LayoutGenerationError(
      "Layout_Planner: AI_Content_Provider не вернул choices",
      { reason: "no_choices" },
    );
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new LayoutGenerationError(
      "Layout_Planner: пустой ответ от AI_Content_Provider",
      // cause выставлен → попадает в retry-цикл
      { reason: "empty_response" },
    );
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch (err) {
    throw new LayoutGenerationError(
      "Layout_Planner: невалидный JSON в ответе AI",
      err,
    );
  }

  const layout = parseLayout(parsedRaw);
  if (!layout) {
    throw new LayoutGenerationError(
      "Layout_Planner: ответ AI не соответствует JSON-схеме Layout_JSON",
      { reason: "schema_mismatch", raw: parsedRaw },
    );
  }
  return layout;
}

// ─── Runtime structural validation ───────────────────────────────────────────

const WALLS: ReadonlySet<Wall> = new Set<Wall>([
  "north",
  "east",
  "south",
  "west",
]);

const ROOM_TYPES_ENUM: ReadonlySet<string> = new Set([
  "bedroom",
  "kitchen",
  "bathroom",
  "living_room",
  "hallway",
  "nursery",
  "apartment",
]);

const FURNITURE_TYPES_ENUM: ReadonlySet<string> = new Set([
  "bed",
  "wardrobe",
  "desk",
  "chair",
  "nightstand",
  "rug",
  "dresser",
  "shelf",
  "sofa",
  "armchair",
  "tv_unit",
  "coffee_table",
  "dining_table",
  "kitchen_island",
  "sink",
  "toilet",
  "bathtub",
  "shower",
  "mirror",
  "cabinet",
]);

const ROTATIONS_ENUM: ReadonlySet<number> = new Set([0, 90, 180, 270]);

const FURNITURE_ID_RE = /^[a-z0-9_-]{1,32}$/;

function isInt(x: unknown, min: number, max: number): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
}

function asWall(x: unknown): Wall | null {
  return typeof x === "string" && WALLS.has(x as Wall) ? (x as Wall) : null;
}

/**
 * Проверяет, что распаршенный объект соответствует структуре LayoutJson,
 * и возвращает его как typed value. При любом несоответствии — `null`.
 *
 * Дублирует JSON-схему вручную, потому что `response_format: json_schema`
 * не всегда строго соблюдается (особенно через OpenRouter с моделями,
 * которые формально не поддерживают structured outputs). Лучше иметь
 * server-side валидацию и спокойный retry, чем класть в БД мусор.
 */
function parseLayout(raw: unknown): LayoutJson | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  // JSON-схема Layout_JSON объявляет `window` в `required`, поэтому ключ
  // должен присутствовать (с явным `null` или объектом). Strict-режим
  // OpenAI это соблюдает, но через OpenRouter иногда роутит к моделям
  // послабее — здесь ловим и отклоняем.
  if (!("window" in o)) return null;

  const roomRaw = o["room"];
  const doorRaw = o["door"];
  const windowRaw = o["window"];
  const furnitureRaw = o["furniture"];

  if (!roomRaw || typeof roomRaw !== "object") return null;
  if (!doorRaw || typeof doorRaw !== "object") return null;
  if (!Array.isArray(furnitureRaw)) return null;

  // room
  const room = roomRaw as Record<string, unknown>;
  if (typeof room["roomType"] !== "string"
      || !ROOM_TYPES_ENUM.has(room["roomType"])) return null;
  if (!isInt(room["widthCm"], 200, 800)) return null;
  if (!isInt(room["lengthCm"], 200, 800)) return null;
  if (!isInt(room["heightCm"], 220, 350)) return null;

  // door
  const door = doorRaw as Record<string, unknown>;
  const doorWall = asWall(door["wall"]);
  if (!doorWall) return null;
  if (!isInt(door["offsetCm"], 0, 800)) return null;
  if (!isInt(door["widthCm"], 70, 110)) return null;

  // window (nullable)
  let win: LayoutJson["window"] = null;
  if (windowRaw !== null && windowRaw !== undefined) {
    if (typeof windowRaw !== "object") return null;
    const w = windowRaw as Record<string, unknown>;
    const wWall = asWall(w["wall"]);
    if (!wWall) return null;
    if (!isInt(w["offsetCm"], 0, 800)) return null;
    if (!isInt(w["widthCm"], 60, 400)) return null;
    win = {
      wall: wWall,
      offsetCm: w["offsetCm"],
      widthCm: w["widthCm"],
    };
  }

  // furniture
  if (furnitureRaw.length < 1 || furnitureRaw.length > 12) return null;
  const furniture: FurnitureItem[] = [];
  for (const itemRaw of furnitureRaw) {
    if (!itemRaw || typeof itemRaw !== "object") return null;
    const it = itemRaw as Record<string, unknown>;
    if (typeof it["id"] !== "string" || !FURNITURE_ID_RE.test(it["id"])) return null;
    if (typeof it["type"] !== "string" || !FURNITURE_TYPES_ENUM.has(it["type"])) return null;
    if (!isInt(it["widthCm"], 20, 400)) return null;
    if (!isInt(it["depthCm"], 20, 400)) return null;
    if (!isInt(it["heightCm"], 10, 280)) return null;
    if (!isInt(it["xCm"], 0, 800)) return null;
    if (!isInt(it["yCm"], 0, 800)) return null;
    if (typeof it["rotationDeg"] !== "number"
        || !ROTATIONS_ENUM.has(it["rotationDeg"])) return null;
    furniture.push({
      id: it["id"],
      type: it["type"],
      widthCm: it["widthCm"],
      depthCm: it["depthCm"],
      heightCm: it["heightCm"],
      xCm: it["xCm"],
      yCm: it["yCm"],
      rotationDeg: it["rotationDeg"] as 0 | 90 | 180 | 270,
    });
  }

  return {
    room: {
      roomType: room["roomType"],
      widthCm: room["widthCm"],
      lengthCm: room["lengthCm"],
      heightCm: room["heightCm"],
    },
    door: {
      wall: doorWall,
      offsetCm: door["offsetCm"],
      widthCm: door["widthCm"],
    },
    window: win,
    furniture,
  };
}

// ─── Test hooks (не часть публичного контракта) ──────────────────────────────

/**
 * Test-only: подменяет lazy OpenAI singleton фейковым клиентом для unit/
 * property-тестов. Передавайте `null`, чтобы сбросить и вернуться к ленивой
 * инициализации (полезно в `afterEach`).
 *
 * Принимаем `unknown`, чтобы тестам не приходилось импортировать тяжёлый
 * тип `OpenAI` ради одного `chat.completions.create` mock'а.
 */
function setOpenAIClient(c: unknown): void {
  openai = c as OpenAI | null;
}

/** Экспорт для unit/property-тестов и debug. Не используется в проде. */
export const __test__ = {
  LAYOUT_JSON_SCHEMA,
  MAX_SCHEMA_RETRIES,
  parseLayout,
  buildSystemPrompt,
  buildUserPrompt,
  setOpenAIClient,
};
