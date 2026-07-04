/**
 * Geo_Service — гео-иерархия Город → ЖК (Requirement 1).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "Geo_Service").
 *
 * Этот модуль отвечает за **чтение/резолвинг** узлов гео-иерархии по публичному
 * slug и за формирование публичного DTO страницы ЖК:
 *
 *   - `getCityBySlug(slug)`  — резолвит City по slug; отсутствие → `null`
 *     (роут-слой транслирует в 404 / `{ notFound: true }`, Requirement 1.5).
 *   - `getZhkBySlug(slug)`   — резолвит ZhK_Record по slug; отсутствие → `null`.
 *   - `shapeZhkAttributes(z)` — DTO ЖК, в котором присутствуют **только
 *     заполненные** атрибуты (developer, completionDate, buildings); незаполненные
 *     атрибуты в ответ не включаются (Requirement 1.7).
 *
 * Ленты (City_Feed / Local_Feed) формирует отдельный Feed_Service (Task 4) —
 * здесь они не собираются. Создание ЖК (`createZhk`) добавляется в Task 3.2 в
 * этот же модуль и в объект `GeoService`; поэтому публичный API оформлен и как
 * набор standalone-функций, и как агрегирующий объект `GeoService`, чтобы новые
 * методы подключались без изменения сигнатур существующих.
 *
 * Доступ к БД — существующий клиент `@workspace/db`; запросы — через `drizzle-orm`
 * (те же соглашения, что и в остальных `src/lib/*`).
 */

import {
  db,
  citiesTable,
  zhkTable,
  type City,
  type Zhk,
  type ZhkBuilding,
  type ZhkStatus,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { generateSlug } from "./communitySlug.js";

/**
 * Публичный DTO City для страницы города. Возвращаем стабильный набор полей
 * (без внутренних флагов), достаточный для рендера публичной страницы и SEO.
 */
export interface CityView {
  id: number;
  slug: string;
  name: string;
  region: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  h1: string | null;
  bodyMd: string | null;
}

/**
 * Публичный DTO ZhK_Record для страницы ЖК.
 *
 * Базовые поля (id/slug/name/cityId/status) присутствуют всегда. Атрибуты
 * `developer`, `completionDate`, `buildings` — **опциональны**: они попадают в
 * DTO только когда заполнены, а незаполненные не отображаются (Requirement 1.7).
 */
export interface ZhkView {
  id: number;
  slug: string;
  name: string;
  cityId: number;
  status: ZhkStatus;
  /** Присутствует только если застройщик заполнен (непустая строка). */
  developer?: string;
  /** Присутствует только если срок сдачи заполнен (непустая строка). */
  completionDate?: string;
  /** Присутствует только если список корпусов непустой. */
  buildings?: ZhkBuilding[];
}

/**
 * Нормализовать входной slug перед поиском.
 *
 * Публичные slug'и хранятся в нижнем регистре (`^[a-z0-9-]{1,100}$`,
 * Requirement 1.6). Приводим ввод к нижнему регистру и обрезаем пробелы, чтобы
 * `/GOROD` и `gorod` резолвились одинаково. Пустой (после trim) или заведомо
 * слишком длинный (> 100) slug не может существовать в базе — сразу `null`,
 * чтобы не гонять заведомо промахивающийся запрос.
 */
function normalizeSlug(slug: string): string | null {
  if (typeof slug !== "string") return null;
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > 100) return null;
  return normalized;
}

/** Заполнена ли строковая величина (не null/undefined и непустая после trim). */
function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Отобразить строку `cities` в публичный DTO города. */
function shapeCity(row: City): CityView {
  return {
    id: row.id,
    slug: row.slug ?? "",
    name: row.name,
    region: row.region ?? null,
    seoTitle: row.seoTitle ?? null,
    seoDescription: row.seoDescription ?? null,
    h1: row.h1 ?? null,
    bodyMd: row.bodyMd ?? null,
  };
}

/**
 * Отобразить строку `zhk` в публичный DTO, включив **только заполненные**
 * атрибуты ЖК (Requirement 1.7).
 *
 * Пустая строка (в т.ч. из одних пробелов) для `developer`/`completionDate` и
 * пустой/отсутствующий массив `buildings` считаются незаполненными и в DTO не
 * попадают. Экспортируется отдельно, потому что это чистая, детерминированная
 * логика формы ответа — её удобно проверять юнит-тестами без доступа к БД.
 */
export function shapeZhkAttributes(row: Zhk): ZhkView {
  const view: ZhkView = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    cityId: row.cityId,
    status: row.status as ZhkStatus,
  };

  if (hasText(row.developer)) {
    view.developer = row.developer.trim();
  }
  if (hasText(row.completionDate)) {
    view.completionDate = row.completionDate.trim();
  }
  if (Array.isArray(row.buildings) && row.buildings.length > 0) {
    view.buildings = row.buildings;
  }

  return view;
}

/**
 * Резолвит City по публичному slug.
 *
 * Возвращает публичный DTO города либо `null`, если города с таким slug нет
 * (Requirement 1.5 — «ресурс не найден», без отображения City_Feed). Роут-слой
 * (Task 3.4) транслирует `null` в HTTP 404 / `{ notFound: true }`.
 */
export async function getCityBySlug(slug: string): Promise<CityView | null> {
  const normalized = normalizeSlug(slug);
  if (normalized === null) return null;

  const [row] = await db
    .select()
    .from(citiesTable)
    .where(eq(citiesTable.slug, normalized))
    .limit(1);

  return row ? shapeCity(row) : null;
}

/**
 * Резолвит ZhK_Record по публичному slug.
 *
 * Возвращает публичный DTO ЖК (с только заполненными атрибутами, Requirement
 * 1.7) либо `null`, если ЖК с таким slug нет (Requirement 1.5). Роут-слой
 * транслирует `null` в HTTP 404 / `{ notFound: true }`.
 */
export async function getZhkBySlug(slug: string): Promise<ZhkView | null> {
  const normalized = normalizeSlug(slug);
  if (normalized === null) return null;

  const [row] = await db
    .select()
    .from(zhkTable)
    .where(eq(zhkTable.slug, normalized))
    .limit(1);

  return row ? shapeZhkAttributes(row) : null;
}

// ─── Создание ЖК жителем (Task 3.2, Requirement 4) ──────────────────────────

/** Минимальная длина названия ЖК (Requirement 4.2). */
export const ZHK_NAME_MIN_LEN = 2;
/** Максимальная длина названия ЖК (Requirement 4.2, `zhk.name` varchar(100)). */
export const ZHK_NAME_MAX_LEN = 100;

/**
 * Нормализовать название ЖК для дедупликации в пределах города (Requirement 4.5):
 * удалить начальные/конечные пробелы и привести к нижнему регистру. Значение
 * записывается в колонку `zhk.name_normalized` и используется как ключ поиска
 * дубликата `(cityId, nameNormalized)`.
 *
 * Чистая, детерминированная функция без обращения к БД — экспортируется для
 * юнит-тестов и переиспользования на роут-слое.
 */
export function normalizeZhkName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Проверить, что название ЖК допустимо (Requirement 4.2, 4.3): длина названия
 * после удаления начальных/конечных пробелов — от 2 до 100 символов
 * включительно. Пустое название, короче 2 или длиннее 100 символов — недопустимо.
 *
 * Чистая функция без БД: возвращает `true`/`false`, чтобы её можно было
 * покрыть юнит-тестами границ (1/2/100/101) и переиспользовать на роут-слое до
 * обращения к базе.
 */
export function validateZhkName(name: string): boolean {
  if (typeof name !== "string") return false;
  const trimmedLen = name.trim().length;
  return trimmedLen >= ZHK_NAME_MIN_LEN && trimmedLen <= ZHK_NAME_MAX_LEN;
}

/** Вход для `createZhk` (уровень доступа 3 — публикующий Community_Account). */
export interface CreateZhkInput {
  /** Название ЖК (2..100 символов после trim, Requirement 4.2). */
  name: string;
  /** Публичный slug существующего родительского City (Requirement 4.1, 4.4). */
  citySlug: string;
  /** Автор-житель, создающий запись (Requirement 4.1). Необязателен для сида. */
  createdByAccountId?: number | null;
}

/**
 * Дискриминированный результат создания ЖК (Requirement 4).
 *
 *   - `created`            — создан новый ZhK_Record; `zhk` — его публичный DTO,
 *                            Local_Feed доступен сразу (Requirement 4.1, 4.6).
 *   - `duplicate_suggested`— в этом городе уже есть ЖК с эквивалентным
 *                            (trim+lower) названием; возвращаем существующий,
 *                            дубликат НЕ создаём (Requirement 4.5).
 *   - `rejected`           — вход недопустим: `invalid_name` (Requirement 4.3)
 *                            либо `city_not_found` (Requirement 4.4); запись не
 *                            создаётся, `message` поясняет невыполненное условие.
 */
export type CreateZhkResult =
  | { status: "created"; zhk: ZhkView }
  | { status: "duplicate_suggested"; existing: ZhkView }
  | {
      status: "rejected";
      reason: "invalid_name" | "city_not_found";
      message: string;
    };

/**
 * Создать новый ZhK_Record жителем (Requirement 4.1–4.6).
 *
 * Порядок проверок:
 *   1. Валидация названия (2..100 после trim). Провал → `rejected/invalid_name`,
 *      запись не создаётся (Requirement 4.2, 4.3).
 *   2. Существование родительского City по slug. Отсутствует → `rejected/
 *      city_not_found` (Requirement 4.1, 4.4).
 *   3. Дедупликация по `(cityId, nameNormalized)`: если ЖК с эквивалентным
 *      названием уже есть в этом городе — возвращаем существующий как
 *      `duplicate_suggested`, дубликат не создаём (Requirement 4.5).
 *   4. Иначе — генерируем глобально уникальный slug, вставляем запись и
 *      возвращаем её DTO (`created`). Запись доступна для Local_Feed сразу после
 *      вставки (Requirement 4.6).
 */
export async function createZhk(input: CreateZhkInput): Promise<CreateZhkResult> {
  const { name, citySlug, createdByAccountId = null } = input;

  // 1. Валидация названия (Requirement 4.2, 4.3).
  if (!validateZhkName(name)) {
    return {
      status: "rejected",
      reason: "invalid_name",
      message: `Название ЖК должно содержать от ${ZHK_NAME_MIN_LEN} до ${ZHK_NAME_MAX_LEN} символов.`,
    };
  }

  // 2. Существование родительского City (Requirement 4.1, 4.4).
  const normalizedCitySlug = normalizeSlug(citySlug);
  const cityRow = normalizedCitySlug
    ? (
        await db
          .select()
          .from(citiesTable)
          .where(eq(citiesTable.slug, normalizedCitySlug))
          .limit(1)
      )[0]
    : undefined;

  if (!cityRow) {
    return {
      status: "rejected",
      reason: "city_not_found",
      message: "Указанный город не найден.",
    };
  }

  // 3. Дедупликация в пределах города (Requirement 4.5).
  const nameNormalized = normalizeZhkName(name);
  const [existing] = await db
    .select()
    .from(zhkTable)
    .where(
      and(
        eq(zhkTable.cityId, cityRow.id),
        eq(zhkTable.nameNormalized, nameNormalized),
      ),
    )
    .limit(1);

  if (existing) {
    return { status: "duplicate_suggested", existing: shapeZhkAttributes(existing) };
  }

  // 4. Создание нового ZhK_Record (Requirement 4.1, 4.6).
  const trimmedName = name.trim();
  const slug = await generateSlug(trimmedName, "zhk");

  const [inserted] = await db
    .insert(zhkTable)
    .values({
      slug,
      name: trimmedName,
      nameNormalized,
      cityId: cityRow.id,
      isSeeded: false,
      createdByAccountId,
    })
    .returning();

  return { status: "created", zhk: shapeZhkAttributes(inserted) };
}

/**
 * Агрегирующий объект сервиса. Публичные методы монтируются здесь, чтобы
 * роут-слой и тесты обращались к единой точке. `createZhk` (Task 3.2)
 * добавлен в этот объект без изменения существующих сигнатур.
 */
export const GeoService = {
  getCityBySlug,
  getZhkBySlug,
  shapeZhkAttributes,
  createZhk,
  validateZhkName,
  normalizeZhkName,
};

export type GeoServiceApi = typeof GeoService;
