/**
 * Zod-схема `Design_Form` для валидации тела `POST /api/marketplace/dizajn/generate`.
 *
 * Покрывает Requirement 1.1–1.6, 1.10 из `.kiro/specs/ai-design-product/requirements.md`:
 *   - 1.1  набор полей формы
 *   - 1.2  whitelist `roomType` (7 значений)
 *   - 1.3  MVP-гейт: на текущей фазе разрешён только `bedroom`,
 *          остальные значения отклоняются с кодом `mvp_room_locked`
 *   - 1.4  whitelist `style` (7 значений)
 *   - 1.5  диапазоны размеров: ширина/длина 200..800, высота 220..350 (см)
 *   - 1.6  диапазон бюджета 50_000..5_000_000 ₽
 *   - 1.10 при выходе за границы — 400 со списком всех нарушений (не только первого)
 *
 * Используется HTTP-обработчиком `POST /generate` (задача 16.2). Сам токен капчи
 * валидируется отдельно (`lib/smartCaptcha.ts`), но включён в схему как опциональное поле,
 * чтобы клиентский payload проходил парсинг как единое целое.
 */

import { z } from "zod";
import { checkMinArea } from "./geometricValidator.js";

// ── enums ───────────────────────────────────────────────────────────────────

/** Все 7 типов помещений из Requirement 1.2. */
export const ROOM_TYPES = [
  "bedroom",
  "kitchen",
  "bathroom",
  "living_room",
  "hallway",
  "nursery",
  "apartment",
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

/** Все 7 стилей из Requirement 1.4. */
export const STYLES = [
  "modern",
  "scandinavian",
  "loft",
  "minimalism",
  "neoclassic",
  "japandi",
  "classic",
] as const;

export type DesignStyle = (typeof STYLES)[number];

/**
 * Список типов помещений, доступных пользователю. Изначально на MVP был только
 * `bedroom`; теперь открыты все типы (продуктовое решение). Значения не из
 * `ROOM_TYPES` по-прежнему отклоняются как `invalid_enum_value`; гейт
 * `mvp_room_locked` фактически больше не срабатывает (оставлен для обратной
 * совместимости API/тестов на случай повторного сужения списка).
 */
export const MVP_ALLOWED_ROOM_TYPES: readonly RoomType[] = ROOM_TYPES;

// ── ranges ──────────────────────────────────────────────────────────────────

/** Границы инклюзивные (`min`/`max` в Zod включают концы). */
export const WIDTH_CM_MIN = 200;
export const WIDTH_CM_MAX = 800;
export const LENGTH_CM_MIN = 200;
export const LENGTH_CM_MAX = 800;
export const HEIGHT_CM_MIN = 220;
export const HEIGHT_CM_MAX = 350;
export const BUDGET_MIN_RUB = 50_000;
export const BUDGET_MAX_RUB = 5_000_000;

// ── schema ──────────────────────────────────────────────────────────────────

/**
 * Схема тела запроса `POST /api/marketplace/dizajn/generate`.
 *
 * MVP-гейт по `roomType` (Requirement 1.3) реализован отдельно в `validateDesignForm`,
 * чтобы Zod-парсинг сначала собрал все полевые нарушения (Requirement 1.10),
 * а гейт выдал отдельный код `mvp_room_locked` для UX-сообщения «скоро».
 */
export const designFormSchema = z.object({
  roomType: z.enum(ROOM_TYPES),
  style: z.enum(STYLES),
  widthCm: z
    .number()
    .int("widthCm должен быть целым числом")
    .min(WIDTH_CM_MIN, `widthCm не меньше ${WIDTH_CM_MIN}`)
    .max(WIDTH_CM_MAX, `widthCm не больше ${WIDTH_CM_MAX}`),
  lengthCm: z
    .number()
    .int("lengthCm должен быть целым числом")
    .min(LENGTH_CM_MIN, `lengthCm не меньше ${LENGTH_CM_MIN}`)
    .max(LENGTH_CM_MAX, `lengthCm не больше ${LENGTH_CM_MAX}`),
  heightCm: z
    .number()
    .int("heightCm должен быть целым числом")
    .min(HEIGHT_CM_MIN, `heightCm не меньше ${HEIGHT_CM_MIN}`)
    .max(HEIGHT_CM_MAX, `heightCm не больше ${HEIGHT_CM_MAX}`),
  budget: z
    .number()
    .int("budget должен быть целым числом (в рублях)")
    .min(BUDGET_MIN_RUB, `budget не меньше ${BUDGET_MIN_RUB} ₽`)
    .max(BUDGET_MAX_RUB, `budget не больше ${BUDGET_MAX_RUB} ₽`),
  features: z.array(z.string().min(1).max(64)).max(20).optional(),
  cityId: z.number().int().positive().optional(),
  /**
   * Yandex SmartCaptcha token (`smart-token`). Для удобства тестов и локального
   * dev (`lib/smartCaptcha.ts` пропускает запрос, если `SMARTCAPTCHA_SERVER_KEY`
   * не задан) поле объявлено опциональным; обязательность форсится в
   * HTTP-обработчике (`verifyCaptchaToken`).
   */
  smartToken: z.string().min(1).optional(),
});

export type DesignFormInput = z.infer<typeof designFormSchema>;

// ── validation result ──────────────────────────────────────────────────────

export interface DesignFormViolation {
  /** Точечный путь к полю в формате `roomType` или `features.0` (как у Zod). */
  path: string;
  /** Машино-читаемый код. Для Zod — его `issue.code`; для MVP-гейта — `mvp_room_locked`. */
  code: string;
  /** Локализованное сообщение для пользователя. */
  message: string;
}

export type DesignFormValidationResult =
  | { ok: true; data: DesignFormInput }
  | { ok: false; violations: DesignFormViolation[] };

/**
 * Уникальный код для MVP-гейта (Requirement 1.3). Экспортируется отдельно,
 * чтобы HTTP-обработчик мог подставить специальное сообщение «скоро»
 * без зависимости от текстовой подписи.
 */
export const MVP_ROOM_LOCKED_CODE = "mvp_room_locked" as const;

// ── helpers ─────────────────────────────────────────────────────────────────

function joinPath(path: ReadonlyArray<PropertyKey>): string {
  return path.map((segment) => String(segment)).join(".");
}

function isMvpLockedRoomType(rawRoomType: unknown): rawRoomType is RoomType {
  if (typeof rawRoomType !== "string") return false;
  if (!(ROOM_TYPES as readonly string[]).includes(rawRoomType)) return false;
  return !(MVP_ALLOWED_ROOM_TYPES as readonly string[]).includes(rawRoomType);
}

/**
 * Главный валидатор для HTTP-обработчика. Возвращает либо распарсенные данные,
 * либо полный список нарушений (Requirement 1.10).
 *
 * Сценарии:
 * 1. Все поля валидны и `roomType === "bedroom"` → `{ ok: true, data }`.
 * 2. Любое поле выходит за границы или имеет неверный тип → `{ ok: false, violations }`,
 *    где `violations` содержит ВСЕ полевые нарушения, найденные Zod.
 * 3. `roomType` — валидное значение из `ROOM_TYPES`, но не `bedroom` →
 *    в `violations` добавляется отдельное нарушение с `code: "mvp_room_locked"`.
 *    Этот случай суммируется с любыми Zod-нарушениями: если, например, `widthCm`
 *    тоже невалиден, в ответе будут оба нарушения.
 * 4. `roomType` — невалидное значение (например, `"garage"`) → Zod вернёт
 *    `invalid_enum_value`; MVP-гейт не срабатывает, потому что для неизвестного
 *    значения сообщение «временно недоступно» вводит в заблуждение.
 */
export function validateDesignForm(input: unknown): DesignFormValidationResult {
  const parsed = designFormSchema.safeParse(input);
  const violations: DesignFormViolation[] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      violations.push({
        path: joinPath(issue.path),
        code: issue.code,
        message: issue.message,
      });
    }
  }

  // MVP-гейт проверяем по сырому input, а не по `parsed.data`, чтобы
  // он срабатывал даже когда другие поля невалидны (Requirement 1.10:
  // вернуть ВСЕ нарушения, а не только первое).
  const rawRoomType =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>).roomType
      : undefined;

  if (isMvpLockedRoomType(rawRoomType)) {
    violations.push({
      path: "roomType",
      code: MVP_ROOM_LOCKED_CODE,
      message: `Тип помещения "${rawRoomType}" пока недоступен. На MVP работает только bedroom.`,
    });
  }

  if (parsed.success && violations.length === 0) {
    return { ok: true, data: parsed.data };
  }

  return { ok: false, violations };
}

// ── палитра (AI_Design_Flagship, Requirement 2.4) ────────────────────────────

/**
 * Допустимые цветовые палитры `Flagship_Form` (входной параметр пользователя).
 * Хранится отдельной nullable-колонкой `designs.palette` (см. design.md → Data
 * Models). Значение вне whitelist отклоняется с кодом `invalid_palette`.
 */
export const PALETTES = [
  "warm_neutral",
  "white_wood",
  "cool_gray",
  "beige_sand",
  "green_sage",
  "blue_calm",
] as const;

export type Palette = (typeof PALETTES)[number];

// ── фото (AI_Design_Flagship, Requirement 5.5 / 5.6) ─────────────────────────

/** MIME-типы, допустимые для `Room_Photo` (только JPG/PNG). */
export const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png"] as const;

/** Максимальный размер `Room_Photo` — 8 МБ (Requirement 5.6). */
export const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;

/**
 * Минимальные метаданные загруженного `Room_Photo`, достаточные для валидации.
 * На backend заполняется из `req.file` (`mimetype` → `mime`, `size` → `sizeBytes`).
 */
export interface PhotoMeta {
  mime: string;
  sizeBytes: number;
}

// ── машино-читаемые коды нарушений флагмана ──────────────────────────────────

/** Производная площадь комнаты меньше минимально допустимой (Requirement 5.4). */
export const ROOM_TOO_SMALL_CODE = "room_too_small" as const;
/** Тип фото отличен от JPG/PNG (Requirement 5.5). */
export const INVALID_PHOTO_TYPE_CODE = "invalid_photo_type" as const;
/** Размер фото превышает 8 МБ (Requirement 5.6). */
export const PHOTO_TOO_LARGE_CODE = "photo_too_large" as const;
/** Значение `palette` вне whitelist (Requirement 2.4). */
export const INVALID_PALETTE_CODE = "invalid_palette" as const;

// ── агрегирующий валидатор запроса генерации ─────────────────────────────────

export type GenerateRequestValidationResult =
  | { ok: true; data: DesignFormInput & { palette: Palette } }
  | { ok: false; violations: DesignFormViolation[] };

/** Числовые поля, приходящие из `multipart/form-data` строками. */
const NUMERIC_MULTIPART_FIELDS = [
  "widthCm",
  "lengthCm",
  "heightCm",
  "budget",
  "cityId",
] as const;

/**
 * Коэрсия одного multipart-строкового поля в число.
 * - пустую строку оставляем как есть (Zod сообщит `invalid_type`);
 * - нечисловую строку оставляем как есть (Zod сообщит `invalid_type`);
 * - корректное числовое представление → `number`.
 */
function coerceNumericField(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return value;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : value;
}

/**
 * Возвращает поверхностную копию тела с коэрсией числовых multipart-полей.
 * `cityId` опционален: пустую строку трактуем как отсутствие поля, чтобы
 * `z.number().optional()` не выдавал `invalid_type` на не выбранном городе.
 */
function coerceMultipartBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const key of NUMERIC_MULTIPART_FIELDS) {
    if (!(key in out)) continue;
    if (key === "cityId" && typeof out[key] === "string" && out[key].trim() === "") {
      delete out[key];
      continue;
    }
    out[key] = coerceNumericField(out[key]);
  }
  return out;
}

/**
 * Единый агрегирующий валидатор тела `POST /api/marketplace/dizajn/generate`
 * для AI_Design_Flagship. Собирает **все** нарушения формы, палитры и фото в
 * один список (Requirement 5.7), не останавливаясь на первом.
 *
 * Порядок и состав проверок (design.md → «Generation validation module»):
 *  1. коэрсия multipart-строк в числа (`widthCm/lengthCm/heightCm/budget/cityId`);
 *  2. `validateDesignForm` — whitelist `roomType`/`style`, диапазоны размеров и
 *     бюджета (50k..5M), MVP-замок (`mvp_room_locked`);
 *  3. валидация `palette` по whitelist (`invalid_palette`);
 *  4. валидация фото: MIME ∈ {image/jpeg, image/png} (`invalid_photo_type`),
 *     размер ≤ 8 МБ (`photo_too_large`);
 *  5. `checkMinArea(roomType, widthCm, lengthCm)` → `room_too_small`
 *     (только когда `roomType`/размеры уже корректны, иначе нарушение уже
 *     сообщено Zod как `invalid_enum_value`/`too_small`/`too_big`/`invalid_type`).
 *
 * @param body  тело запроса (после multer текстовые поля — строки)
 * @param photo метаданные загруженного `Room_Photo` либо `null`, если фото нет
 */
export function validateGenerateRequest(
  body: unknown,
  photo: PhotoMeta | null,
): GenerateRequestValidationResult {
  const isObject = typeof body === "object" && body !== null;
  const coerced: unknown = isObject
    ? coerceMultipartBody(body as Record<string, unknown>)
    : body;
  const coercedRecord: Record<string, unknown> = isObject
    ? (coerced as Record<string, unknown>)
    : {};

  const violations: DesignFormViolation[] = [];

  // 1–2. Полевая валидация формы (whitelist, диапазоны, MVP-замок).
  const formResult = validateDesignForm(coerced);
  if (!formResult.ok) {
    violations.push(...formResult.violations);
  }

  // 3. Палитра (Requirement 2.4).
  const rawPalette = coercedRecord.palette;
  const paletteValid =
    typeof rawPalette === "string" &&
    (PALETTES as readonly string[]).includes(rawPalette);
  if (!paletteValid) {
    violations.push({
      path: "palette",
      code: INVALID_PALETTE_CODE,
      message: "Палитра обязательна и должна быть из списка допустимых значений.",
    });
  }

  // 4. Фото (Requirement 5.5 / 5.6). Проверяем только при наличии фото —
  //    отсутствие фото допустимо (Text_To_Image_Mode, Requirement 4.7).
  if (photo) {
    if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(photo.mime)) {
      violations.push({
        path: "image",
        code: INVALID_PHOTO_TYPE_CODE,
        message: "Фото должно быть в формате JPG или PNG.",
      });
    }
    if (photo.sizeBytes > MAX_PHOTO_SIZE_BYTES) {
      violations.push({
        path: "image",
        code: PHOTO_TOO_LARGE_CODE,
        message: "Размер фото не должен превышать 8 МБ.",
      });
    }
  }

  // 5. Минимальная площадь (Requirement 5.4). Считаем только когда тип и
  //    размеры уже валидны как числа/enum — иначе нарушение уже в списке.
  const rawRoomType = coercedRecord.roomType;
  const rawWidthCm = coercedRecord.widthCm;
  const rawLengthCm = coercedRecord.lengthCm;
  if (
    typeof rawRoomType === "string" &&
    typeof rawWidthCm === "number" &&
    typeof rawLengthCm === "number"
  ) {
    const area = checkMinArea(rawRoomType, rawWidthCm, rawLengthCm);
    if (!area.ok) {
      violations.push({
        path: "area",
        code: ROOM_TOO_SMALL_CODE,
        message: `Площадь ${area.areaSqm} м² меньше минимально допустимой ${area.minSqm} м² для выбранного типа помещения.`,
      });
    }
  }

  if (formResult.ok && violations.length === 0) {
    return {
      ok: true,
      data: { ...formResult.data, palette: rawPalette as Palette },
    };
  }

  return { ok: false, violations };
}
