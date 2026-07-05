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
  DEFAULT_LOCALITY_KIND,
  LOCALITY_KINDS,
  type City,
  type LocalityKind,
  type Zhk,
  type ZhkBuilding,
  type ZhkStatus,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
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
 * Публичный DTO Locality — расширяет {@link ZhkView} полем `kind`
 * (Requirement 1.2). Для всех строк `zhk` любого Locality_Kind содержит тот же
 * набор заполненных атрибутов, что и {@link ZhkView}, плюс тип локальности.
 */
export interface LocalityView extends ZhkView {
  kind: LocalityKind;
  /**
   * Индексируемость страницы локации (Requirement 6.7). Проброшена в публичный
   * DTO, чтобы Locality_Page на фасаде мог эмитить директиву `noindex` тогда и
   * только тогда, когда `isIndexable === false`.
   */
  isIndexable: boolean;
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
 * Отобразить строку `zhk` (Locality_Record любого Locality_Kind) в публичный
 * DTO, включив **только заполненные** атрибуты локации (Requirement 1.7).
 *
 * Обобщение прежней `shapeZhkAttributes`: логика формы атрибутов одинакова для
 * ЖК, района и посёлка — тип локации (`kind`) на набор отображаемых атрибутов
 * не влияет. Пустая строка (в т.ч. из одних пробелов) для
 * `developer`/`completionDate` и пустой/отсутствующий массив `buildings`
 * считаются незаполненными и в DTO не попадают; заполненные строковые атрибуты
 * включаются в обрезанном (trim) виде.
 *
 * Чистая, детерминированная логика формы ответа — экспортируется отдельно,
 * чтобы её было удобно проверять юнит- и property-тестами без доступа к БД.
 */
export function shapeLocalityAttributes(row: Zhk): ZhkView {
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
 * Отобразить строку `zhk` в публичный DTO ЖК (Requirement 1.7).
 *
 * Сохранён для обратной совместимости существующих вызовов: тонкий делегат к
 * обобщённой {@link shapeLocalityAttributes}, работающей для любого
 * Locality_Kind.
 */
export function shapeZhkAttributes(row: Zhk): ZhkView {
  return shapeLocalityAttributes(row);
}

/**
 * Отобразить строку `zhk` в публичный DTO Locality с полем `kind`
 * (Requirement 1.2, 1.4). Расширяет {@link shapeLocalityAttributes}: набор
 * заполненных атрибутов идентичен, дополнительно проставляется Locality_Kind.
 *
 * Значение `kind` из БД валидируется; на случай отсутствия/повреждения (в т.ч.
 * дострадийных строк без явного типа на уровне хранения) применяется
 * `DEFAULT_LOCALITY_KIND` (`"zhk"`) — Requirement 9.6.
 */
export function shapeLocalityView(row: Zhk): LocalityView {
  const kind = validateLocalityKind(row.kind) ? row.kind : DEFAULT_LOCALITY_KIND;
  return { ...shapeLocalityAttributes(row), kind, isIndexable: row.isIndexable };
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

/**
 * Резолвит Locality_Record по публичному slug (Requirement 2.5, 3.5).
 *
 * Как {@link getZhkBySlug}, но возвращает публичный DTO {@link LocalityView} с
 * полем `kind` (через {@link shapeLocalityView}) для локации любого
 * Locality_Kind. Если Locality с таким slug нет — возвращает `null`; роут-слой
 * транслирует это в HTTP 404 / `{ notFound: true }` без предоставления
 * Local_Feed (Requirement 2.5, 3.5).
 */
export async function getLocalityBySlug(
  slug: string,
): Promise<LocalityView | null> {
  const normalized = normalizeSlug(slug);
  if (normalized === null) return null;

  const [row] = await db
    .select()
    .from(zhkTable)
    .where(eq(zhkTable.slug, normalized))
    .limit(1);

  return row ? shapeLocalityView(row) : null;
}

/**
 * Список всех Locality_Record города для City_Page (Requirement 2.4).
 *
 * Возвращает **все** локации города независимо от Locality_Kind (ЖК, районы и
 * посёлки вперемешку) единым списком, отсортированным по `name_normalized` в
 * порядке возрастания, **без группировки по kind**. Каждая строка отображается
 * в {@link LocalityView} (с полем `kind`) через {@link shapeLocalityView}.
 */
export async function listLocalitiesByCity(
  cityId: number,
): Promise<LocalityView[]> {
  const rows = await db
    .select()
    .from(zhkTable)
    .where(eq(zhkTable.cityId, cityId))
    .orderBy(asc(zhkTable.nameNormalized));

  return rows.map(shapeLocalityView);
}

// ─── Тип локальности (Locality_Kind) — валидация и резолвинг (Requirement 1) ─

/**
 * Type guard: принадлежит ли `kind` множеству Locality_Kind
 * (`zhk | district | settlement`) (Requirement 1.3, 1.5).
 *
 * Чистая, детерминированная функция без обращения к БД: возвращает `true`
 * тогда и только тогда, когда `kind` — строка, равная одному из допустимых
 * значений. Любое иное значение (не-строка, `null`, `undefined`, произвольная
 * строка вне множества) → `false`. Экспортируется для переиспользования на
 * роут-слое и в тестах.
 */
export function validateLocalityKind(kind: unknown): kind is LocalityKind {
  return (
    typeof kind === "string" &&
    (LOCALITY_KINDS as readonly string[]).includes(kind)
  );
}

/**
 * Разрешить (нормализовать) входной `kind` в Locality_Kind (Requirement 1.4,
 * 1.5, 9.6):
 *
 *   - `undefined` / `null` → `DEFAULT_LOCALITY_KIND` (`"zhk"`) — обратная
 *     совместимость: отсутствие типа трактуется как ЖК (Requirement 1.4, 9.6);
 *   - допустимое значение (`zhk` / `district` / `settlement`) → оно же
 *     (Requirement 1.3);
 *   - любое иное значение → `null` — сигнал недопустимого типа: вызывающий код
 *     отклоняет создание Locality_Record без сохранения записи (Requirement 1.5).
 *
 * Чистая функция без БД — покрывается юнит- и property-тестами.
 */
export function resolveLocalityKind(kind: unknown): LocalityKind | null {
  if (kind === undefined || kind === null) return DEFAULT_LOCALITY_KIND;
  return validateLocalityKind(kind) ? kind : null;
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
 * Вход для {@link createLocality} — обобщение {@link CreateZhkInput} полем
 * `kind` (Requirement 1.2–1.4, 4.x).
 */
export interface CreateLocalityInput {
  /** Название локации (2..100 символов после trim, Requirement 4.6). */
  name: string;
  /** Публичный slug существующего родительского City (Requirement 4.7). */
  citySlug: string;
  /** Тип локальности; отсутствует/`null` → `"zhk"` (Requirement 1.4). */
  kind?: LocalityKind | null;
  /** Автор-житель, создающий запись (Requirement 4.1). Необязателен для сида. */
  createdByAccountId?: number | null;
}

/**
 * Дискриминированный результат создания Locality (Requirement 1.5, 4.x, 5.x).
 *
 *   - `created`             — создан новый Locality_Record; `locality` — его
 *                             публичный DTO с `kind`, Local_Feed доступен сразу
 *                             (Requirement 4.2, 4.4).
 *   - `duplicate_suggested` — в этом городе уже есть Locality с эквивалентным
 *                             (`lower(trim(name))`) названием; возвращаем
 *                             существующий, дубликат НЕ создаём (Requirement
 *                             5.1–5.3), сравнение не зависит от `kind`.
 *   - `rejected`            — вход недопустим: `invalid_name` (Requirement 4.6),
 *                             `invalid_kind` (Requirement 1.5) либо
 *                             `city_not_found` (Requirement 4.7); запись не
 *                             создаётся, `message` поясняет причину.
 */
export type CreateLocalityResult =
  | { status: "created"; locality: LocalityView }
  | { status: "duplicate_suggested"; existing: LocalityView }
  | {
      status: "rejected";
      reason: "invalid_name" | "invalid_kind" | "city_not_found";
      message: string;
    };

/**
 * Создать новый Locality_Record жителем (Requirement 1.1–1.5, 4.x, 5.x).
 *
 * Порядок проверок:
 *   1. Валидация названия (2..100 после trim, Requirement 4.6). Провал →
 *      `rejected/invalid_name`, запись не создаётся.
 *   2. Резолвинг Locality_Kind (Requirement 1.3–1.5): отсутствует/`null` →
 *      `"zhk"`; значение вне множества → `rejected/invalid_kind` без записи.
 *   3. Существование родительского City по slug (Requirement 4.7). Отсутствует
 *      → `rejected/city_not_found`.
 *   4. Дедупликация по `(cityId, nameNormalized)` независимо от `kind`
 *      (Requirement 5.1–5.3): при совпадении возвращаем существующий как
 *      `duplicate_suggested`, дубликат не создаём.
 *   5. Иначе — генерируем глобально уникальный slug, вставляем запись с `kind`
 *      и `name_normalized = lower(trim(name))` (Requirement 4.8) и возвращаем её
 *      DTO (`created`). Запись доступна для Local_Feed сразу (Requirement 4.4).
 */
export async function createLocality(
  input: CreateLocalityInput,
): Promise<CreateLocalityResult> {
  const { name, citySlug, kind: rawKind, createdByAccountId = null } = input;

  // 1. Валидация названия (Requirement 4.6).
  if (!validateZhkName(name)) {
    return {
      status: "rejected",
      reason: "invalid_name",
      message: `Название места должно содержать от ${ZHK_NAME_MIN_LEN} до ${ZHK_NAME_MAX_LEN} символов.`,
    };
  }

  // 2. Резолвинг типа локальности (Requirement 1.3–1.5).
  const kind = resolveLocalityKind(rawKind);
  if (kind === null) {
    return {
      status: "rejected",
      reason: "invalid_kind",
      message: `Недопустимый тип места. Допустимо одно из: ${LOCALITY_KINDS.join(", ")}.`,
    };
  }

  // 3. Существование родительского City (Requirement 4.7).
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

  // 4. Дедупликация в пределах города, независимо от kind (Requirement 5.1–5.3).
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
    return { status: "duplicate_suggested", existing: shapeLocalityView(existing) };
  }

  // 5. Создание нового Locality_Record (Requirement 4.2, 4.4, 4.8).
  //
  // Гонка одновременных заявок (Requirement 5.4): дедуп на шаге 4 —
  // SELECT-then-INSERT без блокировки, а на `(city_id, name_normalized)` нет
  // уникального ограничения (см. schema/zhk.ts: индекс НЕ UNIQUE). Барьер от
  // гонки — только UNIQUE по `zhk.slug` (`zhk_slug_key`): эквивалентные имена
  // дают один и тот же slug, поэтому при параллельной вставке коммитится не
  // более одной строки, а проигравшие ловят unique-violation (23505). Ниже мы
  // перехватываем её и НЕ падаем (иначе нарушился бы Requirement 5.4 — «каждый
  // последующий запрос обрабатывается как совпадение и возвращает существующую
  // запись»):
  //   • если гонка была по тому же `(cityId, nameNormalized)` — повторный SELECT
  //     находит запись победителя → возвращаем её как `duplicate_suggested`;
  //   • если конфликт по slug пришёлся на РАЗНОЕ имя (два несовпадающих названия
  //     дали один базовый slug под гонкой `generateSlug`) — записи с нашим
  //     `nameNormalized` ещё нет, поэтому перегенерируем slug и повторяем вставку.
  const trimmedName = name.trim();

  const MAX_INSERT_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    const slug = await generateSlug(trimmedName, "zhk");
    try {
      const [inserted] = await db
        .insert(zhkTable)
        .values({
          slug,
          name: trimmedName,
          nameNormalized,
          cityId: cityRow.id,
          kind,
          isSeeded: false,
          createdByAccountId,
        })
        .returning();

      return { status: "created", locality: shapeLocalityView(inserted) };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;

      // Проиграли гонку. Проверяем, не создал ли конкурент запись с тем же
      // `(cityId, nameNormalized)` — тогда это дубликат (Requirement 5.4).
      const [raced] = await db
        .select()
        .from(zhkTable)
        .where(
          and(
            eq(zhkTable.cityId, cityRow.id),
            eq(zhkTable.nameNormalized, nameNormalized),
          ),
        )
        .limit(1);

      if (raced) {
        return {
          status: "duplicate_suggested",
          existing: shapeLocalityView(raced),
        };
      }

      // Конфликт был по slug для другого имени — перегенерируем и повторим.
      if (attempt >= MAX_INSERT_ATTEMPTS) throw err;
    }
  }
}

/**
 * Признак ошибки нарушения уникального ограничения Postgres (SQLSTATE 23505).
 * `pg` пробрасывает объект ошибки с полем `code`; drizzle сохраняет его как есть
 * (в т.ч. в поле `cause`). Используется в `createLocality` для безопасной
 * обработки гонки одновременного создания (Requirement 5.4).
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (value: unknown): string | undefined => {
    if (typeof value === "object" && value !== null && "code" in value) {
      const c = (value as { code?: unknown }).code;
      return typeof c === "string" ? c : undefined;
    }
    return undefined;
  };
  if (code(err) === "23505") return true;
  // drizzle оборачивает драйверную ошибку — проверяем и `cause`.
  if (typeof err === "object" && err !== null && "cause" in err) {
    return code((err as { cause?: unknown }).cause) === "23505";
  }
  return false;
}

/**
 * Создать новый ZhK_Record жителем (Requirement 4).
 *
 * Тонкий делегат к обобщённому {@link createLocality} с фиксированным
 * `kind = "zhk"` — сохраняет прежний внешний контракт {@link CreateZhkResult}
 * (`created.zhk` / `duplicate_suggested.existing`), чтобы существующие вызовы в
 * `routes/community/geo.ts` продолжали работать без изменений. Так как `kind`
 * задан явно допустимым значением, вариант `invalid_kind` здесь недостижим.
 */
export async function createZhk(input: CreateZhkInput): Promise<CreateZhkResult> {
  const result = await createLocality({ ...input, kind: DEFAULT_LOCALITY_KIND });

  switch (result.status) {
    case "created":
      // LocalityView расширяет ZhkView — совместимо с прежним полем `zhk`.
      return { status: "created", zhk: result.locality };
    case "duplicate_suggested":
      return { status: "duplicate_suggested", existing: result.existing };
    case "rejected": {
      // `invalid_kind` недостижим (kind фиксирован как "zhk"); сужаем reason до
      // исходного контракта CreateZhkResult ради обратной совместимости.
      const reason =
        result.reason === "invalid_kind" ? "invalid_name" : result.reason;
      return { status: "rejected", reason, message: result.message };
    }
  }
}

/**
 * Агрегирующий объект сервиса. Публичные методы монтируются здесь, чтобы
 * роут-слой и тесты обращались к единой точке. `createZhk` (Task 3.2)
 * добавлен в этот объект без изменения существующих сигнатур.
 */
export const GeoService = {
  getCityBySlug,
  getZhkBySlug,
  getLocalityBySlug,
  listLocalitiesByCity,
  shapeZhkAttributes,
  shapeLocalityView,
  createZhk,
  createLocality,
  validateZhkName,
  normalizeZhkName,
  validateLocalityKind,
  resolveLocalityKind,
};

export type GeoServiceApi = typeof GeoService;
