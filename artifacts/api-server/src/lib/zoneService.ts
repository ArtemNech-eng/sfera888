/**
 * Zone_Service — изоляция и классификация контента двух публичных зон
 * «ХочуТакже» (Sosedi_Zone, PRO_Zone) и защищённого слоя (PRO_Protected_Layer),
 * обслуживаемых из одной таблицы `community_threads` через дискриминатор `zone`.
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design → «Zone_Service»).
 *
 * Этот модуль решает три задачи:
 *
 *   1. Построение zone-условий для запросов — изоляция зон реализована на
 *      уровне выборок: каждый endpoint фильтрует по `zone`, поэтому Sosedi
 *      никогда не показывает PRO-контент и наоборот
 *      (Requirements 5.1, 5.3, 6.1, 8.1, 8.3).
 *
 *   2. `classifyProContent(text)` — чистая эвристическая классификация
 *      чувствительного PRO-контента (чёрные списки клиентов, персональные
 *      данные, споры по объектам). Такой контент направляется в
 *      PRO_Protected_Layer, всё остальное — в публичный PRO_Public_Layer
 *      (Requirements 7.4, 7.5).
 *
 *   3. `isMasterAdInSosedi(post, account)` — детект рекламного предложения
 *      услуг мастера в зоне соседей. Это detection-часть Requirement 8.2;
 *      само действие блокировки/уведомления выполняет Moderation_Service.
 *
 * ЗАМЕЧАНИЕ ПО ГРАНИЦАМ: контроль доступа к закрытому слою
 * (`canAccessProtected`) реализуется отдельной задачей (6.1) и будет добавлен
 * в этот же сервис — см. плейсхолдер в конце файла.
 */

import { and, eq, inArray, ne, type SQL } from "drizzle-orm";
import {
  db,
  communityThreadsTable,
  proMembershipsTable,
  type CommunityThread,
  type CommunityAccount,
  type ProMembership,
} from "@workspace/db";

// ─── Zone-дискриминатор ──────────────────────────────────────────────────────

/** Зоны контента (дискриминатор `community_threads.zone`, Requirement 8.1). */
export type CommunityZone = "sosedi" | "pro_public" | "pro_protected";

/** Все зоны. */
export const COMMUNITY_ZONES = ["sosedi", "pro_public", "pro_protected"] as const;

/** Публичные, SEO-индексируемые зоны (Requirements 5.2, 6.7). */
export const PUBLIC_INDEXABLE_ZONES = ["sosedi", "pro_public"] as const;

/** Зоны профессионального сообщества мастеров (Requirement 6.1). */
export const PRO_ZONES = ["pro_public", "pro_protected"] as const;

/** Type-guard: строка является допустимой зоной. */
export function isCommunityZone(value: unknown): value is CommunityZone {
  return (
    typeof value === "string" &&
    (COMMUNITY_ZONES as readonly string[]).includes(value)
  );
}

// ─── Zone-условия для запросов (изоляция зон) ────────────────────────────────
//
// Изоляция зон обеспечивается тем, что КАЖДАЯ выборка фильтруется по `zone`.
// Хелперы ниже возвращают drizzle-условия, которые подставляются в `.where()`.
// Это гарантирует, что выборка Sosedi не содержит pro_*, а выборка PRO не
// содержит sosedi (Requirements 5.3, 8.3).

/** Условие «тема принадлежит ровно одной зоне». */
export function zoneCondition(zone: CommunityZone): SQL {
  return eq(communityThreadsTable.zone, zone);
}

/** Условие «тема принадлежит одной из перечисленных зон». */
export function zonesCondition(zones: readonly CommunityZone[]): SQL {
  return inArray(communityThreadsTable.zone, [...zones]);
}

/** Условие «тема НЕ принадлежит указанной зоне» (для явной изоляции). */
export function notZoneCondition(zone: CommunityZone): SQL {
  return ne(communityThreadsTable.zone, zone);
}

/**
 * Условие выборки для Sosedi_Zone (Requirements 5.1, 5.3, 8.3).
 * Строго `zone = 'sosedi'` — по построению исключает любой PRO-контент.
 */
export function sosediZoneCondition(): SQL {
  return zoneCondition("sosedi");
}

/**
 * Условие выборки публичного слоя PRO (Requirements 6.1, 8.3).
 * Строго `zone = 'pro_public'` — исключает sosedi и защищённый слой.
 */
export function proPublicZoneCondition(): SQL {
  return zoneCondition("pro_public");
}

/** Условие выборки защищённого слоя PRO (Requirement 7). */
export function proProtectedZoneCondition(): SQL {
  return zoneCondition("pro_protected");
}

/**
 * ЧИСТЫЙ предикат изоляции зон (Requirements 5.3, 8.3).
 *
 * Зеркалит семантику zone-условий на уровне значений: `zoneCondition`
 * (`eq(zone, target)`) и `zonesCondition` (`inArray(zone, targets)`)
 * пропускают строку тогда и только тогда, когда её `zone` совпадает с целевой
 * зоной (или входит в целевой набор зон). Эта функция не обращается к БД и
 * является исполняемым документом того же инварианта изоляции, что и SQL:
 * выборка Sosedi (`target = 'sosedi'`) никогда не пропускает `pro_*`, а любая
 * PRO-выборка (`target ∈ {pro_public, pro_protected}` или их набор) никогда не
 * пропускает `sosedi`.
 *
 * @param threadZone Зона темы (значение `community_threads.zone`).
 * @param target     Целевая зона выборки или набор зон.
 * @returns `true`, если тема попадёт в выборку по этой зоне/набору зон.
 */
export function threadInZone(
  threadZone: CommunityZone,
  target: CommunityZone | readonly CommunityZone[],
): boolean {
  return Array.isArray(target)
    ? (target as readonly CommunityZone[]).includes(threadZone)
    : threadZone === target;
}

// ─── Классификация чувствительного PRO-контента (Requirements 7.4, 7.5) ──────

/** Категория чувствительности PRO-контента. */
export type ProSensitiveCategory =
  | "client_blacklist"
  | "personal_data"
  | "object_dispute";

/** Результат классификации PRO-контента. */
export interface ProContentClassification {
  /** Куда должен быть размещён контент. */
  targetZone: Extract<CommunityZone, "pro_public" | "pro_protected">;
  /** Является ли контент чувствительным (→ закрытый слой). */
  sensitive: boolean;
  /** Сработавшие категории чувствительности (для аудита/модерации). */
  categories: ProSensitiveCategory[];
}

// ─── Unicode-aware границы слова ─────────────────────────────────────────────
//
// ВАЖНО: JavaScript `\b` — ASCII-only: он утверждает границу только между `\w`
// ([A-Za-z0-9_]) и не-`\w`. Кириллица в `\w` не входит, поэтому `\b` НИКОГДА
// не срабатывает рядом с русской буквой, а `/\bуслуг/` не матчит «услуги…».
// Аналогично `\w*` не захватывает кириллические окончания слов. Ниже вместо
// `\b`/`\w*` используются Unicode-осознанные конструкции под флагом `u`:
//   • `(?<![\p{L}\p{N}])` — левая граница (перед словом нет буквы/цифры);
//   • `(?![\p{L}\p{N}])`  — правая граница (после слова нет буквы/цифры);
//   • `[\p{L}]*`          — произвольный хвост слова (в т.ч. кириллица).
// Это чинит детект русского текста, оставаясь консервативным (границы слова
// не дают ложных срабатываний внутри других слов).

// Стоп-паттерны маркеров «чёрного списка клиентов».
const CLIENT_BLACKLIST_PATTERNS: RegExp[] = [
  /ч[её]рн[\p{L}]*\s+список/iu,
  /(?<![\p{L}\p{N}])ч\.?\s?с\.?(?![\p{L}\p{N}])/iu, // "ЧС", "ч.с."
  /(?<![\p{L}\p{N}])кидал[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])кинул[\p{L}]*\s+(?:на\s+деньги|с\s+оплат|заказчик|клиент)/iu,
  /(?:заказчик|клиент)[\p{L}]*\s+(?:кинул|не\s+заплат|не\s+оплат|мошенник)/iu,
  /(?<![\p{L}\p{N}])не\s+заплат[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])мошенник[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])аферист[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])не\s+рекоменду[\p{L}]*\s+(?:работать|связыва)/iu,
  /(?<![\p{L}\p{N}])опасн[\p{L}]*\s+клиент[\p{L}]*/iu,
];

// Стоп-паттерны персональных данных (ПД).
const PERSONAL_DATA_PATTERNS: RegExp[] = [
  // Телефон РФ (совпадает с логикой marketplaceModeration).
  /(?:\+?[78])?[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/u,
  /(?<![\p{L}\p{N}])паспорт[\p{L}]*\s+\d/iu,
  /(?<![\p{L}\p{N}])паспорт[\p{L}]*\s+(?:серия|данн)/iu,
  /(?<![\p{L}\p{N}])серия\s+и\s+номер/iu,
  /(?<![\p{L}\p{N}])прожива[\p{L}]*\s+по\s+адресу/iu,
  /(?<![\p{L}\p{N}])домашн[\p{L}]*\s+адрес[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])адрес[\p{L}]*\s+прожива[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])инн(?![\p{L}])\s*\d?/iu,
  /(?<![\p{L}\p{N}])снилс(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])персональн[\p{L}]*\s+данн[\p{L}]*/iu,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/iu, // email
];

// Стоп-паттерны споров по объектам.
const OBJECT_DISPUTE_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}])спор[\p{L}]*\s+по\s+объект[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])конфликт[\p{L}]*\s+(?:на|по)\s+объект[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])суд[\p{L}]*\s+(?:с|против)\s+(?:заказчик|клиент)[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])судим[\p{L}]*\s+(?:с|за)/iu,
  /(?<![\p{L}\p{N}])исков[\p{L}]*\s+заявлен[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])недоплат[\p{L}]*\s+за\s+(?:объект|работ)/iu,
  /(?<![\p{L}\p{N}])не\s+оплат[\p{L}]*\s+объект[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])претензи[\p{L}]*\s+по\s+(?:объект|работ)/iu,
  /(?<![\p{L}\p{N}])разбирательств[\p{L}]*/iu,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

/**
 * Классифицировать PRO-контент по чувствительности (Requirements 7.4, 7.5).
 *
 * Чистая функция: не обращается к БД и не имеет побочных эффектов, поэтому
 * легко покрывается unit- и property-тестами.
 *
 *   • контент с чёрными списками клиентов, персональными данными или спорами
 *     по объектам → `{ targetZone: 'pro_protected', sensitive: true }`;
 *   • всё остальное → `{ targetZone: 'pro_public', sensitive: false }`.
 */
export function classifyProContent(text: string | null | undefined): ProContentClassification {
  const value = (text ?? "").normalize("NFC");
  const categories: ProSensitiveCategory[] = [];

  if (matchesAny(value, CLIENT_BLACKLIST_PATTERNS)) categories.push("client_blacklist");
  if (matchesAny(value, PERSONAL_DATA_PATTERNS)) categories.push("personal_data");
  if (matchesAny(value, OBJECT_DISPUTE_PATTERNS)) categories.push("object_dispute");

  const sensitive = categories.length > 0;
  return {
    targetZone: sensitive ? "pro_protected" : "pro_public",
    sensitive,
    categories,
  };
}

// ─── Детект рекламы услуг мастера в зоне соседей (Requirement 8.2) ───────────

/**
 * Минимальная структурная форма темы для детекта. Совместима с Drizzle-строкой
 * `CommunityThread`, но не требует полного объекта — достаточно текстовых полей
 * и зоны, что упрощает unit-тестирование.
 */
export interface ZoneAdCheckThread {
  zone: string;
  title?: string | null;
  body?: string | null;
  category?: string | null;
}

/** Минимальная структурная форма аккаунта-автора. */
export interface ZoneAdCheckAccount {
  role?: string | null;
}

// Маркеры рекламного предложения услуг («выполню ремонт», «услуги плиточника»…).
// Кириллица-осознанные границы/хвосты (см. заметку про `\b`/`\w*` выше).
const MASTER_AD_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}])услуг[\p{L}]*\s+(?:мастер|плиточник|электрик|сантехник|маляр|отделочник|строител|ремонт)/iu,
  /(?<![\p{L}\p{N}])(?:выполн|сдела|окаж|предлага)[\p{L}]*\s+(?:любой\s+)?(?:ремонт|отделк|работ|услуг)/iu,
  /(?<![\p{L}\p{N}])ремонт[\p{L}]*\s+под\s+ключ/iu,
  /(?<![\p{L}\p{N}])мастер[\p{L}]*\s+на\s+все\s+руки/iu,
  /(?<![\p{L}\p{N}])любые\s+(?:виды\s+)?(?:ремонтн[\p{L}]*|отделочн[\p{L}]*)\s+работ/iu,
  /(?<![\p{L}\p{N}])прайс[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])расцен[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])недорог[\p{L}]*\s+(?:и\s+)?качествен[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])качествен[\p{L}]*\s+(?:и\s+)?недорог[\p{L}]*/iu,
  /(?<![\p{L}\p{N}])гаранти[\p{L}]*\s+на\s+(?:работ|ремонт)/iu,
  /(?<![\p{L}\p{N}])бригад[\p{L}]*\s+(?:выполн|сдела|бер[её]тся|ремонт)/iu,
  /(?<![\p{L}\p{N}])звоните(?![\p{L}])/iu,
  /(?<![\p{L}\p{N}])заказывайте(?![\p{L}])/iu,
  /(?<![\p{L}\p{N}])стаж[\p{L}]*\s+\d+\s+(?:лет|год)/iu,
  /(?<![\p{L}\p{N}])опыт[\p{L}]*\s+работ[\p{L}]*\s+\d+\s+(?:лет|год)/iu,
];

// Контактные маркеры (усиливают уверенность рекламного намерения).
const CONTACT_PATTERNS: RegExp[] = [
  /(?:\+?[78])?[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/u, // телефон
  /(@[a-z0-9_]{4,}|whatsapp|вотсап|телеграм|telegram|viber|вайбер)/iu,
];

/**
 * Детект рекламного предложения услуг мастера, размещаемого в зоне соседей
 * (detection-часть Requirement 8.2).
 *
 * Возвращает `true`, только если тема относится к зоне `sosedi` И текст несёт
 * признаки коммерческого предложения услуг ремонта/мастера. Роль автора
 * `master` усиливает сигнал, но не является обязательной: детект в первую
 * очередь текстовый, чтобы ловить рекламу независимо от типа аккаунта.
 *
 * Действие по факту детекта (блокировка публикации + уведомление автора о
 * нарушении границы зон) выполняет Moderation_Service, а не этот сервис.
 */
export function isMasterAdInSosedi(
  post: ZoneAdCheckThread,
  account?: ZoneAdCheckAccount | null,
): boolean {
  // Граница зон нарушается только в Sosedi (Requirement 8.2).
  if (post.zone !== "sosedi") return false;

  const text = `${post.title ?? ""}\n${post.body ?? ""}`.normalize("NFC");
  if (!text.trim()) return false;

  const hasAdLanguage = matchesAny(text, MASTER_AD_PATTERNS);
  if (!hasAdLanguage) return false;

  // Реклама услуг = коммерческая формулировка. Наличие контакта или роли
  // мастера повышает уверенность, но само рекламное предложение услуг уже
  // является нарушением чистоты соседского портала (Requirement 8, User Story).
  const hasContact = matchesAny(text, CONTACT_PATTERNS);
  const isMaster = account?.role === "master";

  // Достаточно рекламного языка; контакт/роль мастера — дополнительные
  // подтверждающие сигналы (учтены для явности и будущей настройки порога).
  void hasContact;
  void isMaster;
  return true;
}

// ─── Контроль доступа к закрытому слою PRO (Requirements 7.1, 7.2, 7.3) ──────
//
// PRO_Protected_Layer доступен ТОЛЬКО мастеру с подтверждённым членством
// (`pro_memberships.verified = true`). Подтверждённый мастер, запрашивающий
// контент, получает доступ автоматически (Requirement 7.2). Аноним (нет аккаунта)
// доступа не получает — вызывающий роут-слой отдаёт 403 и предлагает пройти
// подтверждение членства (Requirement 7.3).
//
// Логика решения — ЧИСТАЯ функция `canAccessProtected(account, membership?)`:
// она не обращается к БД и легко покрывается unit-тестами. Загрузку
// подтверждённого членства из БД выполняет отдельный async-хелпер
// `fetchVerifiedMembership(accountId)`; роут-слой сначала грузит членство, затем
// принимает решение чистой функцией.

/** Роль аккаунта сообщества, значимая для доступа к закрытому слою. */
export const MASTER_ROLE = "master" as const;

/** Причина отказа в доступе к PRO_Protected_Layer. */
export type ProtectedAccessDenialReason =
  /** Аноним: аккаунт отсутствует (Requirement 7.3). */
  | "anonymous"
  /** Аккаунт не является мастером (Requirement 7.1). */
  | "not_master"
  /** У мастера нет подтверждённого членства (Requirement 7.1). */
  | "membership_not_verified";

/** Решение о доступе к PRO_Protected_Layer. */
export interface ProtectedAccessDecision {
  /** Доступ разрешён. */
  allowed: boolean;
  /** Причина отказа (null при `allowed = true`). */
  reason: ProtectedAccessDenialReason | null;
  /**
   * Следует ли предложить пройти подтверждение членства (Requirement 7.3).
   * `true` для любого отказа: аноним и неподтверждённый мастер получают
   * предложение верифицироваться.
   */
  promptVerification: boolean;
}

/** Минимальная форма аккаунта для проверки доступа (совместима с `CommunityAccount`). */
export interface ProtectedAccessAccount {
  role?: string | null;
}

/** Минимальная форма членства для проверки доступа (совместима с `ProMembership`). */
export interface ProtectedAccessMembership {
  verified?: boolean | null;
}

/**
 * Есть ли среди переданных членств хотя бы одно подтверждённое (`verified`).
 * Принимает одиночное членство, массив членств, `null`/`undefined`.
 */
export function hasVerifiedMembership(
  membership?:
    | ProtectedAccessMembership
    | readonly ProtectedAccessMembership[]
    | null,
): boolean {
  if (!membership) return false;
  const list = Array.isArray(membership) ? membership : [membership];
  return list.some((m) => m?.verified === true);
}

/**
 * Разрешить/запретить доступ к PRO_Protected_Layer (Requirements 7.1, 7.2, 7.3).
 *
 * Чистая, детерминированная функция без обращения к БД:
 *
 *   • аккаунт отсутствует → отказ `anonymous`, предложить верификацию (7.3);
 *   • роль аккаунта ≠ `master` → отказ `not_master` (7.1);
 *   • нет подтверждённого членства → отказ `membership_not_verified` (7.1);
 *   • мастер с подтверждённым членством → доступ выдаётся автоматически (7.2).
 *
 * @param account    Аккаунт сообщества (или `null`/`undefined` для анонима).
 * @param membership Подтверждённое членство (одно, массив или отсутствует),
 *                   обычно результат `fetchVerifiedMembership(account.id)`.
 */
export function canAccessProtected(
  account?: ProtectedAccessAccount | null,
  membership?:
    | ProtectedAccessMembership
    | readonly ProtectedAccessMembership[]
    | null,
): ProtectedAccessDecision {
  // Аноним: нет аккаунта → отказ + предложение подтвердить членство (7.3).
  if (!account) {
    return { allowed: false, reason: "anonymous", promptVerification: true };
  }

  // Только мастер может получить доступ к закрытому слою (7.1).
  if (account.role !== MASTER_ROLE) {
    return { allowed: false, reason: "not_master", promptVerification: true };
  }

  // Мастеру нужен подтверждённый членский статус (7.1).
  if (!hasVerifiedMembership(membership)) {
    return {
      allowed: false,
      reason: "membership_not_verified",
      promptVerification: true,
    };
  }

  // Подтверждённый мастер → авто-выдача доступа (7.2).
  return { allowed: true, reason: null, promptVerification: false };
}

/**
 * Загрузить подтверждённые (`verified = true`) членства аккаунта из БД.
 *
 * Помощник для роут-слоя: сначала грузим членство, затем принимаем решение
 * чистой `canAccessProtected`. При указании `specialtyId` ограничиваем выборку
 * конкретной специальностью; иначе возвращаем все подтверждённые членства.
 *
 * @returns массив подтверждённых членств (пустой, если ни одного нет).
 */
export async function fetchVerifiedMembership(
  accountId: number,
  specialtyId?: number | null,
): Promise<ProMembership[]> {
  const conditions: SQL[] = [
    eq(proMembershipsTable.accountId, accountId),
    eq(proMembershipsTable.verified, true),
  ];
  if (specialtyId != null) {
    conditions.push(eq(proMembershipsTable.specialtyId, specialtyId));
  }

  return db
    .select()
    .from(proMembershipsTable)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));
}

// ─── Сервисная агрегация ─────────────────────────────────────────────────────

/**
 * Zone_Service — единая точка доступа к zone-логике. Группирует хелперы
 * изоляции, классификацию, детект рекламы и контроль доступа к закрытому слою.
 */
export const ZoneService = {
  // zone-условия
  zoneCondition,
  zonesCondition,
  notZoneCondition,
  sosediZoneCondition,
  proPublicZoneCondition,
  proProtectedZoneCondition,
  threadInZone,
  // классификация и детект
  classifyProContent,
  isMasterAdInSosedi,
  // доступ к закрытому слою (Requirements 7.1, 7.2, 7.3)
  canAccessProtected,
  hasVerifiedMembership,
  fetchVerifiedMembership,
  // type-guard
  isCommunityZone,
} as const;

// Ссылки на типы Drizzle-строк — используются в сигнатурах вызывающего кода
// (feed/moderation роуты передают строки `CommunityThread` / `CommunityAccount`).
export type { CommunityThread, CommunityAccount, ProMembership };
