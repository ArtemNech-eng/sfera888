/**
 * Feed_Service — чтение лент гео-сообщества «ХочуТакже».
 *
 * Обслуживает две публичные ленты зоны «Соседи» (Sosedi_Zone) из одной таблицы
 * `community_threads`, различая их дискриминаторами `scope` / `zhk_id`:
 *
 *   • City_Feed  — темы уровня города (scope=`city`, zhk_id IS NULL),
 *     отсортированные по признаку активности `lastActivityAt` DESC
 *     (Requirements 2.1, 2.3).
 *   • Local_Feed — темы конкретного ЖК (scope=`zhk`, zhk_id=?),
 *     отсортированные по дате создания `createdAt` DESC (Requirement 1.4, 3.3).
 *
 * Пустая лента — не ошибка: возвращается `{ items: [], emptyState: true,
 * nextCursor: null }` (Requirements 1.3, 3.6).
 *
 * Пагинация — cursor-based (keyset), устойчивая к вставкам: курсор кодирует
 * пару (значение сортировки, id) и выбирает строго «следующую» страницу через
 * `lt` (см. `decodeCursor` / `encodeCursor`).
 *
 * ОБЛАСТЬ ЗАДАЧИ:
 *   • Task 4.1 — чтение лент (`getCityFeed`, `getLocalFeed`) и keyset-пагинация.
 *   • Task 4.2 — валидация и создание темы Local_Feed: чистый помощник
 *     `validateTopicInput` (границы категории/заголовка/тела, Requirements 3.1,
 *     3.4) и метод `createLocalTopic`, который либо создаёт тему, привязанную к
 *     ЖК аккаунта на момент публикации (Requirement 3.2), либо отклоняет
 *     публикацию, сохраняя введённые данные как черновик, чтобы ввод не был
 *     потерян даже при сбое доставки ошибки (Requirements 3.4, 3.5).
 *
 * HTTP-маршруты — задача 4.4 (здесь не реализуются).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/
 */

import {
  db,
  communityThreadsTable,
  communityThreadDraftsTable,
  communityAccountsTable,
  zhkTable,
  citiesTable,
  type CommunityThread,
} from "@workspace/db";
import { and, eq, isNull, desc, lt, or } from "drizzle-orm";

/** Зона «Соседи» — City_Feed и Local_Feed обслуживаются из неё (Requirement 5.1). */
const SOSEDI_ZONE = "sosedi";
/** Публичный слой PRO — All_Russia_Feed и My_City_Filter обслуживаются из него (Requirement 6.1). */
const PRO_PUBLIC_ZONE = "pro_public";
/** Публичная видимость — единственная, попадающая в публичные ленты (Requirement 19.2). */
const PUBLIC_VISIBILITY = "public";

/** Значение `scope` для тем уровня города. */
const SCOPE_CITY = "city";
/** Значение `scope` для тем уровня ЖК. */
const SCOPE_ZHK = "zhk";

/** Лимит страницы по умолчанию, если не задан вызывающим. */
export const DEFAULT_FEED_LIMIT = 20;
/** Максимально допустимый размер страницы (защита от чрезмерных выборок). */
export const MAX_FEED_LIMIT = 50;

// ─── Валидация создания темы Local_Feed (Task 4.2, Requirements 3.1, 3.4) ────

/**
 * Допустимые категории Local_Feed (Requirement 3.1). Соответствуют перечню:
 * аварии ЖКХ, дефекты застройщика, обмен инструментом, локальные рекомендации.
 * Значения зафиксированы в design.md (`LOCAL_FEED_CATEGORIES`).
 */
export const LOCAL_FEED_CATEGORIES = [
  "utility_incident",
  "developer_defect",
  "tool_sharing",
  "local_recommendation",
] as const;

/** Тип-объединение допустимых категорий Local_Feed. */
export type LocalFeedCategory = (typeof LOCAL_FEED_CATEGORIES)[number];

/** Минимальная длина заголовка темы (Requirement 3.4). */
export const TITLE_MIN_LEN = 1;
/** Максимальная длина заголовка темы (Requirement 3.4, `title` varchar(200)). */
export const TITLE_MAX_LEN = 200;
/** Максимальная длина тела темы (Requirement 3.4). */
export const BODY_MAX_LEN = 5000;

/** Сырой ввод темы Local_Feed, подлежащий валидации. */
export interface TopicInput {
  /** Категория темы; должна входить в `LOCAL_FEED_CATEGORIES` (Requirement 3.1). */
  category?: string | null;
  /** Заголовок; после trim — 1..200 символов (Requirement 3.4). */
  title?: string | null;
  /** Тело; ≤ 5000 символов (Requirement 3.4). */
  body?: string | null;
}

/** Код невыполненного условия валидации темы. */
export type TopicViolation = "invalid_category" | "invalid_title" | "invalid_body";

/** Результат чистой валидации ввода темы. */
export interface TopicValidation {
  /** `true`, если нарушений нет и тему можно публиковать. */
  ok: boolean;
  /** Перечень невыполненных условий (пусто при `ok`). */
  violations: TopicViolation[];
}

/**
 * Проверить ввод темы Local_Feed (Requirements 3.1, 3.4) — чистая,
 * детерминированная функция без обращения к БД.
 *
 * Правила:
 *   • `category` обязана входить в перечень `LOCAL_FEED_CATEGORIES`
 *     (Requirement 3.1) — иначе `invalid_category`.
 *   • `title` после удаления начальных/конечных пробелов — от 1 до 200 символов
 *     (Requirement 3.4) — иначе `invalid_title` (пустой/из одних пробелов
 *     заголовок трактуется как длина 0).
 *   • `body` — не длиннее 5000 символов (Requirement 3.4); нижней границы нет —
 *     иначе `invalid_body`.
 *
 * Возвращает все выявленные нарушения, чтобы вызывающий/тесты видели полную
 * картину; при отсутствии нарушений `ok === true`.
 */
export function validateTopicInput(input: TopicInput): TopicValidation {
  const violations: TopicViolation[] = [];

  const category = input?.category;
  if (
    typeof category !== "string" ||
    !LOCAL_FEED_CATEGORIES.includes(category as LocalFeedCategory)
  ) {
    violations.push("invalid_category");
  }

  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (title.length < TITLE_MIN_LEN || title.length > TITLE_MAX_LEN) {
    violations.push("invalid_title");
  }

  const body = typeof input?.body === "string" ? input.body : "";
  if (body.length > BODY_MAX_LEN) {
    violations.push("invalid_body");
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Ввод «народного вопроса» (Ask_Anything) — SEO/UGC-поток низкого трения.
 * В отличие от `TopicInput`, категория здесь НЕОБЯЗАТЕЛЬНА: пользователь может
 * задать любой вопрос без выбора рубрики (Reddit-подобный «спроси что угодно»).
 */
export interface PublicQuestionInput {
  /** Категория; необязательна. Если задана непустой строкой — должна быть валидной. */
  category?: string | null;
  /** Заголовок вопроса; после trim — 1..200 символов. */
  title?: string | null;
  /** Тело вопроса; ≤ 5000 символов (может быть пустым). */
  body?: string | null;
}

/**
 * Мягкая валидация «народного вопроса» (Ask_Anything). Отличается от
 * `validateTopicInput` тем, что категория ОПЦИОНАЛЬНА (отсутствие/пустая строка
 * допустимы). Если категория задана — она обязана входить в
 * `LOCAL_FEED_CATEGORIES`, иначе `invalid_category`. Заголовок/тело — те же
 * границы, что и у обычной темы.
 *
 * Смягчение сделано намеренно ради максимизации объёма UGC для SEO: любой
 * посетитель может задать вопрос, не выбирая рубрику и не проходя верификацию
 * (гейт публикации снят на уровне маршрута `/ask`).
 */
export function validatePublicQuestionInput(input: PublicQuestionInput): TopicValidation {
  const violations: TopicViolation[] = [];

  const category = input?.category;
  // Категория опциональна: null/undefined/пустая строка — допустимо.
  if (category != null && category !== "") {
    if (
      typeof category !== "string" ||
      !LOCAL_FEED_CATEGORIES.includes(category as LocalFeedCategory)
    ) {
      violations.push("invalid_category");
    }
  }

  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (title.length < TITLE_MIN_LEN || title.length > TITLE_MAX_LEN) {
    violations.push("invalid_title");
  }

  const body = typeof input?.body === "string" ? input.body : "";
  if (body.length > BODY_MAX_LEN) {
    violations.push("invalid_body");
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Свести перечень нарушений к единственному «первичному» коду причины для
 * дискриминированного результата и колонки `reason` черновика. Приоритет:
 * категория → заголовок → тело.
 */
function primaryViolation(violations: TopicViolation[]): TopicViolation {
  const order: TopicViolation[] = ["invalid_category", "invalid_title", "invalid_body"];
  for (const code of order) {
    if (violations.includes(code)) return code;
  }
  return violations[0]!;
}

// ─── PRO-ленты: All_Russia_Feed и My_City_Filter (Task 5.2, Requirements 6.2–6.6) ──
//
// PRO_Public_Layer выдаёт тематическую ленту специальности из зоны
// `pro_public`. Поведение по умолчанию — All_Russia_Feed: агрегируются
// профессиональные темы специальности по всей стране (Requirement 6.2). Пока
// My_City_Filter не применён явно, лента остаётся All_Russia, даже если в
// текущем городе нет локальных тем — лента не должна быть пустой (Requirement
// 6.3). Фильтр «Мой город» активируется ТОЛЬКО при явном применении мастером
// (Requirement 6.6), переопределяет дефолт и ограничивает выборку локальными
// рабочими вопросами текущего города (`is_local = true` И `city_id = <город>`),
// показывая только локальный контент (Requirement 6.4). Если локальных тем нет —
// лента пустая, БЕЗ возврата к All_Russia_Feed (Requirement 6.5).

/** Режим PRO-ленты: агрегированная «Вся Россия» либо локальный «Мой город». */
export type ProFeedMode = "all_russia" | "my_city";

/**
 * Разрешить режим PRO-ленты по признаку явного применения My_City_Filter
 * (Requirement 6.6). Фильтр активируется ТОЛЬКО при `cityFilterApplied === true`;
 * любое иное значение (в т.ч. `undefined`) означает дефолт All_Russia_Feed.
 */
export function resolveProFeedMode(cityFilterApplied: boolean): ProFeedMode {
  return cityFilterApplied === true ? "my_city" : "all_russia";
}

/** Минимальная форма PRO-темы для чистого предиката вхождения в ленту. */
export interface ProFeedThreadShape {
  /** Дискриминатор зоны (`pro_public` попадает в публичную PRO-ленту). */
  zone: string;
  /** Специальность темы (Requirement 6.1). */
  specialtyId: number | null;
  /** Локальная ли это PRO-тема (Requirement 6.4). */
  isLocal: boolean;
  /** Город темы (для My_City_Filter, Requirement 6.4). */
  cityId: number | null;
  /** Видимость; только `public` попадает в публичную ленту (Requirement 19.2). */
  visibility: string;
}

/** Параметры выбора PRO-ленты для конкретной специальности. */
export interface ProFeedFilter {
  /** Выбранная специальность (Requirement 6.2). */
  specialtyId: number;
  /** Явно ли применён My_City_Filter (Requirement 6.6). */
  cityFilterApplied: boolean;
  /** Текущий город (обязателен, когда фильтр применён, Requirement 6.4). */
  currentCityId?: number | null;
}

/**
 * ЧИСТЫЙ предикат вхождения PRO-темы в ленту (Requirements 6.2–6.6) — зеркалит
 * SQL-условия `getProFeed` на уровне значений и является исполнимым документом
 * инварианта My_City_Filter (используется property-тестом задачи 5.4).
 *
 * Общие условия (обе ветки): тема из публичного PRO-слоя (`zone = 'pro_public'`),
 * публично видимая (`visibility = 'public'`) и относится к выбранной
 * специальности.
 *
 *   • Дефолт (фильтр не применён, Requirements 6.2, 6.3): включаются ВСЕ темы
 *     специальности по стране независимо от локальности/города — лента
 *     All_Russia не пустеет из-за отсутствия локальных тем.
 *   • My_City_Filter применён (Requirements 6.4, 6.5): включаются ТОЛЬКО
 *     локальные темы (`is_local = true`) текущего города (`city_id = currentCityId`);
 *     без города совпадений нет (пустая лента), возврата к All_Russia не
 *     происходит.
 */
export function proFeedIncludesThread(
  thread: ProFeedThreadShape,
  filter: ProFeedFilter,
): boolean {
  // Общие условия публичной PRO-ленты специальности.
  if (thread.zone !== PRO_PUBLIC_ZONE) return false;
  if (thread.visibility !== PUBLIC_VISIBILITY) return false;
  if (thread.specialtyId !== filter.specialtyId) return false;

  if (filter.cityFilterApplied === true) {
    // My_City_Filter: только локальные темы текущего города (R6.4, R6.5).
    if (filter.currentCityId == null) return false;
    return thread.isLocal === true && thread.cityId === filter.currentCityId;
  }

  // Дефолт All_Russia: агрегируем темы специальности по всей стране (R6.2, R6.3).
  return true;
}

/**
 * Запрос ленты: размер страницы и опциональный курсор для следующей страницы.
 * `cursor` получают из `nextCursor` предыдущего ответа.
 */
export interface FeedQuery {
  /** Желаемый размер страницы (1..MAX_FEED_LIMIT). По умолчанию DEFAULT_FEED_LIMIT. */
  limit?: number;
  /** Непрозрачный курсор для keyset-пагинации; отсутствие = первая страница. */
  cursor?: string | null;
}

/**
 * Элемент ленты — проекция строки `community_threads`, безопасная для отдачи в
 * публичный DTO. Полный набор полей темы сохранён, чтобы фасад мог рендерить
 * карточку без дополнительных запросов.
 */
export interface FeedItem {
  id: number;
  title: string;
  body: string;
  category: string | null;
  cityId: number | null;
  zhkId: number | null;
  authorAccountId: number | null;
  isSeeded: boolean;
  lastActivityAt: Date;
  createdAt: Date;
}

/**
 * Ответ ленты. `emptyState` = `true`, когда на первой странице нет ни одной
 * темы (Requirements 1.3, 3.6). `nextCursor` = `null`, когда следующей страницы
 * нет.
 */
export interface FeedResult {
  items: FeedItem[];
  emptyState: boolean;
  nextCursor: string | null;
}

/**
 * Элемент PRO-ленты — расширяет `FeedItem` полями специальности и локальности,
 * необходимыми фасаду для рендера PRO_Public_Layer и переключателя My_City_Filter.
 */
export interface ProFeedItem extends FeedItem {
  /** Специальность темы (Requirement 6.1). */
  specialtyId: number | null;
  /** Локальная ли PRO-тема (Requirement 6.4). */
  isLocal: boolean;
}

/**
 * Ответ PRO-ленты. Помимо элементов и пагинации сообщает выбранный режим и
 * факт применения фильтра, чтобы фасад отражал состояние переключателя
 * «Мой город». `emptyState` при `feedMode = 'my_city'` означает отсутствие
 * локальных тем — БЕЗ возврата к All_Russia (Requirement 6.5).
 */
export interface ProFeedResult {
  items: ProFeedItem[];
  emptyState: boolean;
  nextCursor: string | null;
  /** Активный режим ленты (Requirements 6.2, 6.4). */
  feedMode: ProFeedMode;
  /** Применён ли My_City_Filter явно (Requirement 6.6). */
  cityFilterApplied: boolean;
}

/**
 * Запрос PRO-ленты. Наследует пагинацию `FeedQuery` и добавляет управление
 * My_City_Filter. Фильтр активируется ТОЛЬКО при `cityFilter === true`
 * (Requirement 6.6); `currentCityId` требуется для локальной выборки
 * (Requirement 6.4).
 */
export interface ProFeedQuery extends FeedQuery {
  /** Явное применение My_City_Filter (Requirement 6.6). По умолчанию `false`. */
  cityFilter?: boolean;
  /** Текущий город мастера (для My_City_Filter, Requirement 6.4). */
  currentCityId?: number | null;
}

/** Вход для создания темы Local_Feed (уровень доступа 3). */
export interface CreateLocalTopicInput {
  /** Публикующий Community_Account; его привязка к ЖК определяет тему (R3.2, R3.5). */
  authorAccountId: number;
  /** Категория темы (Requirement 3.1). */
  category?: string | null;
  /** Заголовок (Requirement 3.4). */
  title?: string | null;
  /** Тело (Requirement 3.4). */
  body?: string | null;
}

/** Код причины отклонённой публикации темы (Requirements 3.4, 3.5). */
export type CreateTopicRejectReason = TopicViolation | "no_zhk_binding";

/**
 * Дискриминированный результат создания темы Local_Feed (Requirement 3):
 *
 *   • `created`  — тема создана и привязана к ЖК аккаунта на момент публикации
 *     (Requirement 3.2); `thread` — вставленная строка.
 *   • `rejected` — публикация отклонена: недопустимый ввод (Requirement 3.4)
 *     либо отсутствие привязки к ЖК (`no_zhk_binding`, Requirement 3.5). Тема
 *     НЕ создаётся; введённые данные сохранены как черновик, `draftId` — его id
 *     (Requirement 3.4).
 */
export type CreateLocalTopicResult =
  | { status: "created"; thread: CommunityThread }
  | { status: "rejected"; reason: CreateTopicRejectReason; draftId?: number };

/** Вход анонимного «народного вопроса» (Ask_Anything, уровень доступа 1). */
export interface CreatePublicQuestionInput {
  /** ЖК-адресат вопроса (Local_Feed). Приоритетнее города, если задан. */
  zhkId?: number | null;
  /** Город-адресат вопроса (City_Feed), когда ЖК не выбран. */
  cityId?: number | null;
  /** Категория; необязательна (Ask_Anything). */
  category?: string | null;
  /** Заголовок вопроса. */
  title?: string | null;
  /** Тело вопроса (может быть пустым). */
  body?: string | null;
}

/** Причина отклонения анонимного вопроса. */
export type CreatePublicQuestionReason = TopicViolation | "no_target";

/** Результат создания анонимного «народного вопроса». */
export type CreatePublicQuestionResult =
  | { status: "created"; thread: CommunityThread }
  | { status: "rejected"; reason: CreatePublicQuestionReason };

/** Внутреннее представление курсора: значение сортировки + tie-breaker по id. */
interface CursorPayload {
  /** Эпоха в миллисекундах значения сортировки (lastActivityAt или createdAt). */
  ts: number;
  /** id последней отданной темы — устойчивый tie-breaker при равных ts. */
  id: number;
}

/** Тип столбца-сортировки, по которому строится keyset-пагинация. */
type SortColumn = typeof communityThreadsTable.lastActivityAt | typeof communityThreadsTable.createdAt;

/**
 * Сервис чтения лент. Не хранит состояния; `db` инъектируется для тестируемости,
 * по умолчанию — общий пул `@workspace/db`.
 */
export class FeedService {
  constructor(private readonly database: typeof db = db) {}

  /**
   * City_Feed — темы уровня города (Requirements 2.1, 2.3).
   *
   * Фильтр: zone=`sosedi`, scope=`city`, zhk_id IS NULL, visibility=`public`,
   * cityId=<город>. Сортировка — по активности `lastActivityAt` DESC
   * (Requirement 2.3). Пустая лента → `emptyState: true`, без ошибки
   * (Requirement 1.3).
   */
  async getCityFeed(cityId: number, query: FeedQuery = {}): Promise<FeedResult> {
    return this.readFeed({
      baseConditions: [
        eq(communityThreadsTable.zone, SOSEDI_ZONE),
        eq(communityThreadsTable.scope, SCOPE_CITY),
        eq(communityThreadsTable.cityId, cityId),
        isNull(communityThreadsTable.zhkId),
        eq(communityThreadsTable.visibility, PUBLIC_VISIBILITY),
      ],
      sortColumn: communityThreadsTable.lastActivityAt,
      query,
    });
  }

  /**
   * Local_Feed — локальная лента конкретной Locality (Requirements 1.4, 3.3, 3.6;
   * generalized-locality Requirements 2.1, 2.2, 2.6, 3.1, 8.2).
   *
   * Фильтр: zone=`sosedi`, scope=`zhk`, zhk_id=<Locality.id>, visibility=`public`.
   * Возвращаются ТОЛЬКО темы данной Locality — темы других локаций исключаются
   * (Requirement 3.3). Сортировка — по дате создания `createdAt` DESC, при
   * равенстве дат — по id темы DESC (tie-break через `readFeed`,
   * generalized-locality Requirement 2.1). Пустая лента → `emptyState: true`,
   * `items: []`, без ошибки (Requirement 3.6, generalized-locality Requirement 2.6).
   *
   * Kind-агностично (generalized-locality Requirements 2.2, 8.2): логика ленты
   * определяется исключительно привязкой к `zhk_id` + `scope = 'zhk'` и НЕ
   * ветвится по `Locality_Kind` (`zhk` | `district` | `settlement`). Поскольку
   * все локации любого типа живут в таблице `zhk` и их темы привязываются тем же
   * дискриминатором `scope = 'zhk'`, эта же логика единообразно обслуживает ЖК
   * (Requirement 3.1), районы и посёлки. `zhkId` здесь — идентификатор Locality
   * любого типа (физическое имя параметра сохранено ради обратной совместимости).
   */
  async getLocalFeed(zhkId: number, query: FeedQuery = {}): Promise<FeedResult> {
    return this.readFeed({
      baseConditions: [
        eq(communityThreadsTable.zone, SOSEDI_ZONE),
        eq(communityThreadsTable.scope, SCOPE_ZHK),
        eq(communityThreadsTable.zhkId, zhkId),
        eq(communityThreadsTable.visibility, PUBLIC_VISIBILITY),
      ],
      sortColumn: communityThreadsTable.createdAt,
      query,
    });
  }

  /**
   * PRO_Public_Layer — тематическая лента специальности (Requirements 6.2–6.6).
   *
   * Поведение по умолчанию — All_Russia_Feed: агрегирует темы специальности по
   * всей стране (Requirement 6.2); пока My_City_Filter не применён, лента не
   * пустеет из-за отсутствия локальных тем в текущем городе (Requirement 6.3).
   *
   * My_City_Filter активируется ТОЛЬКО при `query.cityFilter === true`
   * (Requirement 6.6). При активации он переопределяет дефолт и ограничивает
   * выборку локальными рабочими темами текущего города (`is_local = true` И
   * `city_id = currentCityId`), показывая только локальный контент (Requirement
   * 6.4). Если локальных тем нет — возвращается пустая лента БЕЗ возврата к
   * All_Russia_Feed (Requirement 6.5).
   *
   * Фильтр всегда работает внутри публичного PRO-слоя (`zone = 'pro_public'`,
   * `visibility = 'public'`), поэтому чувствительный контент закрытого слоя в
   * ленту не попадает. Сортировка — по активности `lastActivityAt` DESC.
   */
  async getProFeed(specialtyId: number, query: ProFeedQuery = {}): Promise<ProFeedResult> {
    // Фильтр активируется только явно (Requirement 6.6).
    const cityFilterApplied = query.cityFilter === true;
    const feedMode = resolveProFeedMode(cityFilterApplied);

    // My_City_Filter требует текущий город. Без города локального контента нет —
    // возвращаем пустую локальную ленту, НЕ откатываясь к All_Russia (R6.5).
    if (cityFilterApplied && query.currentCityId == null) {
      return {
        items: [],
        emptyState: true,
        nextCursor: null,
        feedMode,
        cityFilterApplied,
      };
    }

    // Общие условия публичной PRO-ленты специальности (Requirement 6.2).
    const baseConditions = [
      eq(communityThreadsTable.zone, PRO_PUBLIC_ZONE),
      eq(communityThreadsTable.specialtyId, specialtyId),
      eq(communityThreadsTable.visibility, PUBLIC_VISIBILITY),
    ];

    if (cityFilterApplied) {
      // My_City_Filter: только локальные темы текущего города (Requirement 6.4).
      baseConditions.push(eq(communityThreadsTable.isLocal, true));
      baseConditions.push(eq(communityThreadsTable.cityId, query.currentCityId as number));
    }

    const page = await this.readProFeed({
      baseConditions,
      sortColumn: communityThreadsTable.lastActivityAt,
      query,
    });

    return { ...page, feedMode, cityFilterApplied };
  }

  /**
   * Создать тему Local_Feed или отклонить публикацию, сохранив ввод
   * (Requirements 3.1, 3.2, 3.4, 3.5).
   *
   * Порядок:
   *   1. Валидация ввода (`validateTopicInput`). При нарушении — тема НЕ
   *      создаётся, введённые данные сохраняются в `community_thread_drafts`
   *      (payload + reason), возвращается `rejected` с первичной причиной и
   *      `draftId`. Черновик пишется в БД до возврата ошибки, поэтому ввод не
   *      теряется даже если доставка сообщения об ошибке не удастся
   *      (Requirement 3.4).
   *   2. Проверка привязки к ЖК: если у аккаунта нет `zhkId`, публикация
   *      отклоняется с `no_zhk_binding`; ввод так же сохраняется черновиком
   *      (Requirement 3.5).
   *   3. Иначе — тема вставляется в зону `sosedi`, scope `zhk`, привязанной к
   *      `zhkId` аккаунта на момент публикации (Requirement 3.2).
   */
  async createLocalTopic(input: CreateLocalTopicInput): Promise<CreateLocalTopicResult> {
    // 1. Валидация ввода (Requirements 3.1, 3.4).
    const validation = validateTopicInput(input);
    if (!validation.ok) {
      const reason = primaryViolation(validation.violations);
      const draftId = await this.saveDraft(input, reason);
      return { status: "rejected", reason, draftId };
    }

    // 2. Привязка автора к ЖК на момент публикации (Requirements 3.2, 3.5).
    const [account] = await this.database
      .select({ zhkId: communityAccountsTable.zhkId })
      .from(communityAccountsTable)
      .where(eq(communityAccountsTable.id, input.authorAccountId))
      .limit(1);

    const zhkId = account?.zhkId ?? null;
    if (zhkId == null) {
      const draftId = await this.saveDraft(input, "no_zhk_binding");
      return { status: "rejected", reason: "no_zhk_binding", draftId };
    }

    // 3. Создание темы, привязанной к ЖК аккаунта (Requirement 3.2).
    const [thread] = await this.database
      .insert(communityThreadsTable)
      .values({
        zone: SOSEDI_ZONE,
        scope: SCOPE_ZHK,
        zhkId,
        category: (input.category as string),
        title: (input.title as string).trim(),
        body: input.body as string,
        authorAccountId: input.authorAccountId,
        visibility: PUBLIC_VISIBILITY,
      })
      .returning();

    return { status: "created", thread: thread! };
  }

  /**
   * Создать анонимный «народный вопрос» (Ask_Anything) — поток низкого трения
   * для SEO/UGC. В отличие от `createLocalTopic`, здесь:
   *   • НЕ требуется подтверждённый аккаунт — `authorAccountId = null` (гейт
   *     публикации снят на уровне маршрута `/ask`, анти-спам — rate limit по IP);
   *   • категория ОПЦИОНАЛЬНА (`validatePublicQuestionInput`);
   *   • адресатом может быть ЖК (Local_Feed) ИЛИ город (City_Feed).
   *
   * При невалидном вводе или отсутствии адресата — `rejected` (черновик здесь не
   * пишется: анонимный поток без сессии, сохранять нечего под аккаунт).
   */
  async createPublicQuestion(
    input: CreatePublicQuestionInput,
  ): Promise<CreatePublicQuestionResult> {
    const validation = validatePublicQuestionInput(input);
    if (!validation.ok) {
      return { status: "rejected", reason: primaryViolation(validation.violations) };
    }

    const zhkId =
      input.zhkId != null && Number.isInteger(input.zhkId) && input.zhkId > 0
        ? input.zhkId
        : null;
    const cityId =
      input.cityId != null && Number.isInteger(input.cityId) && input.cityId > 0
        ? input.cityId
        : null;

    if (zhkId == null && cityId == null) {
      return { status: "rejected", reason: "no_target" };
    }

    // Валидация существования целевого места (generalized-locality Requirement 8.5):
    // публикация с указанием НЕсуществующей Locality/City отклоняется ДО вставки —
    // тема не создаётся, Locality/City не создаётся, возвращается индикация
    // отсутствия целевого места. Маршрут `/ask` резолвит адресата по slug (404 на
    // отсутствие) ещё до сервиса; эта проверка обеспечивает тот же инвариант на
    // уровне сервиса при обращении по id, возвращая чистый `no_target` вместо
    // нарушения внешнего ключа (community_threads.zhk_id / city_id).
    if (zhkId != null) {
      const [locality] = await this.database
        .select({ id: zhkTable.id })
        .from(zhkTable)
        .where(eq(zhkTable.id, zhkId))
        .limit(1);
      if (!locality) {
        return { status: "rejected", reason: "no_target" };
      }
    } else {
      const [city] = await this.database
        .select({ id: citiesTable.id })
        .from(citiesTable)
        .where(eq(citiesTable.id, cityId as number))
        .limit(1);
      if (!city) {
        return { status: "rejected", reason: "no_target" };
      }
    }

    const category =
      typeof input.category === "string" && input.category.trim().length > 0
        ? input.category.trim()
        : null;

    const [thread] = await this.database
      .insert(communityThreadsTable)
      .values({
        zone: SOSEDI_ZONE,
        // ЖК-вопрос → Local_Feed (scope=zhk); иначе городской → City_Feed (scope=city).
        scope: zhkId != null ? SCOPE_ZHK : SCOPE_CITY,
        zhkId: zhkId ?? undefined,
        cityId: zhkId != null ? undefined : cityId ?? undefined,
        category,
        title: (input.title as string).trim(),
        body: typeof input.body === "string" ? input.body : "",
        authorAccountId: null,
        isSeeded: false,
        visibility: PUBLIC_VISIBILITY,
      })
      .returning();

    return { status: "created", thread: thread! };
  }
  private async saveDraft(
    input: CreateLocalTopicInput,
    reason: CreateTopicRejectReason,
  ): Promise<number> {
    const [draft] = await this.database
      .insert(communityThreadDraftsTable)
      .values({
        authorAccountId: input.authorAccountId ?? null,
        payload: {
          zone: SOSEDI_ZONE,
          scope: SCOPE_ZHK,
          category: input.category ?? null,
          title: input.title ?? null,
          body: input.body ?? null,
        },
        reason,
      })
      .returning({ id: communityThreadDraftsTable.id });
    return draft!.id;
  }

  /**
   * Общая реализация keyset-пагинации, разделяемая City_Feed и Local_Feed.
   * Выбирает `limit + 1` строк, чтобы определить наличие следующей страницы,
   * и формирует `nextCursor` из последнего отданного элемента.
   */
  private async readFeed(params: {
    baseConditions: ReturnType<typeof eq>[];
    sortColumn: SortColumn;
    query: FeedQuery;
  }): Promise<FeedResult> {
    const { baseConditions, sortColumn, query } = params;
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const conditions = [...baseConditions];
    if (cursor) {
      // Строго «следующая» страница: (sortCol < ts) OR (sortCol = ts AND id < id).
      const cursorDate = new Date(cursor.ts);
      const keyset = or(
        lt(sortColumn, cursorDate),
        and(eq(sortColumn, cursorDate), lt(communityThreadsTable.id, cursor.id)),
      );
      if (keyset) conditions.push(keyset);
    }

    const rows = await this.database
      .select()
      .from(communityThreadsTable)
      .where(and(...conditions))
      // Сортировка + tie-breaker по id для детерминированного порядка.
      .orderBy(desc(sortColumn), desc(communityThreadsTable.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row) => toFeedItem(row));

    const nextCursor = hasMore
      ? encodeCursor(sortValue(pageRows[pageRows.length - 1]!, sortColumn))
      : null;

    return {
      items,
      // Пустое состояние — только на первой странице без курсора (Requirements 1.3, 3.6).
      emptyState: items.length === 0 && !cursor,
      nextCursor,
    };
  }

  /**
   * Keyset-пагинация PRO-ленты (Requirements 6.2–6.6). Аналогична `readFeed`, но
   * проецирует строки в `ProFeedItem` (со специальностью и локальностью). Режим
   * и факт применения фильтра добавляет вызывающий `getProFeed`.
   */
  private async readProFeed(params: {
    baseConditions: ReturnType<typeof eq>[];
    sortColumn: SortColumn;
    query: ProFeedQuery;
  }): Promise<Omit<ProFeedResult, "feedMode" | "cityFilterApplied">> {
    const { baseConditions, sortColumn, query } = params;
    const limit = normalizeLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const conditions = [...baseConditions];
    if (cursor) {
      const cursorDate = new Date(cursor.ts);
      const keyset = or(
        lt(sortColumn, cursorDate),
        and(eq(sortColumn, cursorDate), lt(communityThreadsTable.id, cursor.id)),
      );
      if (keyset) conditions.push(keyset);
    }

    const rows = await this.database
      .select()
      .from(communityThreadsTable)
      .where(and(...conditions))
      .orderBy(desc(sortColumn), desc(communityThreadsTable.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row) => toProFeedItem(row));

    const nextCursor = hasMore
      ? encodeCursor(sortValue(pageRows[pageRows.length - 1]!, sortColumn))
      : null;

    return {
      items,
      emptyState: items.length === 0 && !cursor,
      nextCursor,
    };
  }
}

/** Готовый к использованию singleton поверх общего пула БД. */
export const feedService = new FeedService();

// ─── Внутренние помощники ───────────────────────────────────────────────────

/** Приводит запрошенный лимит к диапазону [1, MAX_FEED_LIMIT]. */
function normalizeLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_FEED_LIMIT;
  const int = Math.floor(limit);
  if (int < 1) return 1;
  if (int > MAX_FEED_LIMIT) return MAX_FEED_LIMIT;
  return int;
}

/** Проекция строки таблицы в публичный элемент ленты. */
function toFeedItem(row: CommunityThread): FeedItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    cityId: row.cityId,
    zhkId: row.zhkId,
    authorAccountId: row.authorAccountId,
    isSeeded: row.isSeeded,
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
  };
}

/** Проекция строки таблицы в элемент PRO-ленты (со специальностью и локальностью). */
function toProFeedItem(row: CommunityThread): ProFeedItem {
  return {
    ...toFeedItem(row),
    specialtyId: row.specialtyId,
    isLocal: row.isLocal,
  };
}

/** Извлекает значение сортировки строки под выбранный столбец. */
function sortValue(row: CommunityThread, sortColumn: SortColumn): CursorPayload {
  const date =
    sortColumn === communityThreadsTable.lastActivityAt ? row.lastActivityAt : row.createdAt;
  return { ts: date.getTime(), id: row.id };
}

/** Кодирует курсор в непрозрачную base64url-строку. */
function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(`${payload.ts}:${payload.id}`, "utf8").toString("base64url");
}

/**
 * Декодирует курсор. Некорректный/пустой курсор трактуется как отсутствие
 * (первая страница), чтобы чтение оставалось устойчивым и без ошибок.
 */
function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep <= 0) return null;
    const ts = Number(decoded.slice(0, sep));
    const id = Number(decoded.slice(sep + 1));
    if (!Number.isFinite(ts) || !Number.isInteger(id) || id < 0) return null;
    return { ts, id };
  } catch {
    return null;
  }
}
