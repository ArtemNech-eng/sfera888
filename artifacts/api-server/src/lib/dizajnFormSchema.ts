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
 * Используется HTTP-обработчиком `POST /generate` (задача 16.2). Сам Turnstile-токен
 * валидируется отдельно (`lib/turnstile.ts`), но включён в схему как опциональное поле,
 * чтобы клиентский payload проходил парсинг как единое целое.
 */

import { z } from "zod";

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
 * Список типов помещений, доступных на MVP (Requirement 1.3).
 * Все остальные валидные значения `roomType` блокируются с кодом `mvp_room_locked`.
 * Для расширения после MVP — добавлять сюда новые значения.
 */
export const MVP_ALLOWED_ROOM_TYPES: readonly RoomType[] = ["bedroom"] as const;

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
   * Cloudflare Turnstile token. Для удобства тестов и интеграции с локальным dev
   * (`lib/turnstile.ts` пропускает запрос, если `TURNSTILE_SECRET_KEY` не задан)
   * поле объявлено опциональным; обязательность форсится в HTTP-обработчике.
   */
  turnstileToken: z.string().min(1).optional(),
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
