/**
 * Living-community layer — метрика успеха «Living_ZhK» и общероссийский доступ
 * мастеров к ленте «Вся Россия» (Requirements 17.3, 18.1, 18.2, 18.3).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → «Living-community
 * layer», Requirement 17 «Слой живого сообщества», Requirement 18
 * «Общероссийский рост базы мастеров через ленту "Вся Россия"»).
 *
 * Дополняет `zhkActivityCron.ts` (задача 12.1), который классифицирует статус
 * каждого ЖК (`LIVING` / `NON_LIVING`). Этот модуль отвечает за две вещи:
 *
 *   1. `countLivingZhk(opts?)` / `countLivingZhkByStarterCity()` — query-хелперы
 *      для ОСНОВНОЙ метрики развития сообщества: число ЖК со статусом `LIVING`.
 *      Метрика возвращается как обособленная структура `LivingZhkMetric`
 *      (дискриминатор `metric: 'living_zhk'`), НЕ смешанная с объёмом трафика —
 *      именно это требует Requirement 17.3 («…отдельно от общего объёма
 *      трафика»). Подсчёт трафика тут намеренно отсутствует.
 *
 *   2. `masterHasAllRussiaAccess(master)` — ЧИСТЫЙ предикат: любой мастер
 *      получает ПОЛНЫЙ доступ к All_Russia_Feed независимо от стартовых городов
 *      развития сообщества и локальной плотности жителей (Requirements 18.1,
 *      18.2). Привлечение мастеров ведётся как канал роста, параллельный
 *      развитию сообщества жителей (Requirement 18.3), — см.
 *      `MASTER_RECRUITMENT_CHANNEL`.
 *
 * DB-хелперы используют `@workspace/db` (`zhkTable.status`, `citiesTable.
 * isStarter`). Чистые части (`buildLivingZhkMetric`, `masterHasAllRussiaAccess`,
 * `describeMasterAllRussiaAccess`) не обращаются к БД и покрываются unit-тестами.
 */

import { db, zhkTable, citiesTable, type ZhkStatus } from "@workspace/db";
import { and, eq, sql, type SQL } from "drizzle-orm";

// ─── Метрика Living_ZhK (Requirement 17.3) ───────────────────────────────────

/** Статус ЖК, считающийся «живым сообществом» (Requirement 17.2). */
export const LIVING_ZHK_STATUS: ZhkStatus = "LIVING";

/**
 * Опции подсчёта Living_ZhK.
 *
 * Метрика может быть сужена до стартовых городов (`cities.is_starter = true`,
 * Requirement 17.1) и/или до конкретного города — это НЕ является гейтом, а лишь
 * срезом одной и той же метрики успеха сообщества.
 */
export interface CountLivingZhkOptions {
  /** Считать только ЖК в стартовых городах (`cities.is_starter = true`) (R17.1). */
  starterOnly?: boolean;
  /** Ограничить подсчёт конкретным городом. */
  cityId?: number | null;
}

/**
 * Обособленная метрика Living_ZhK (Requirement 17.3).
 *
 * Дискриминатор `metric: 'living_zhk'` подчёркивает, что это ОСНОВНАЯ метрика
 * успеха развития сообщества, отдельная от объёма трафика. Значение трафика в
 * эту структуру намеренно не входит.
 */
export interface LivingZhkMetric {
  /** Дискриминатор метрики — «число живых ЖК», не трафик (R17.3). */
  metric: "living_zhk";
  /** Число ЖК со статусом `LIVING` в заданном срезе. */
  livingZhkCount: number;
  /** Срез: только стартовые города. */
  starterOnly: boolean;
  /** Срез: конкретный город (или `null` — по всем городам). */
  cityId: number | null;
}

/**
 * ЧИСТЫЙ помощник: собрать структуру метрики Living_ZhK из посчитанного числа и
 * опций среза (Requirement 17.3). Не обращается к БД — точка для unit-тестов
 * формы метрики. Отрицательные/нечисловые значения нормализуются к 0.
 */
export function buildLivingZhkMetric(
  livingZhkCount: number,
  opts: CountLivingZhkOptions = {},
): LivingZhkMetric {
  const safeCount =
    Number.isFinite(livingZhkCount) && livingZhkCount > 0
      ? Math.floor(livingZhkCount)
      : 0;
  return {
    metric: "living_zhk",
    livingZhkCount: safeCount,
    starterOnly: opts.starterOnly === true,
    cityId: opts.cityId ?? null,
  };
}

/**
 * Подсчитать число Living_ZhK — основную метрику развития сообщества
 * (Requirement 17.3), возвращаемую отдельно от объёма трафика.
 *
 * Считает строки `zhk` со статусом `LIVING`. При `starterOnly` джойнит `cities`
 * и фильтрует по `is_starter = true` (Requirement 17.1); при `cityId` сужает до
 * одного города.
 *
 * @returns `LivingZhkMetric` — обособленная структура метрики (не трафик).
 */
export async function countLivingZhk(
  opts: CountLivingZhkOptions = {},
): Promise<LivingZhkMetric> {
  const statusCond = eq(zhkTable.status, LIVING_ZHK_STATUS);

  let n = 0;
  if (opts.starterOnly) {
    const conditions: SQL[] = [statusCond, eq(citiesTable.isStarter, true)];
    if (opts.cityId != null) conditions.push(eq(zhkTable.cityId, opts.cityId));
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(zhkTable)
      .innerJoin(citiesTable, eq(zhkTable.cityId, citiesTable.id))
      .where(and(...conditions));
    n = Number(row?.n) || 0;
  } else {
    const conditions: SQL[] = [statusCond];
    if (opts.cityId != null) conditions.push(eq(zhkTable.cityId, opts.cityId));
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(zhkTable)
      .where(and(...conditions));
    n = Number(row?.n) || 0;
  }

  return buildLivingZhkMetric(n, opts);
}

/** Разбивка числа Living_ZhK по одному стартовому городу (Requirements 17.1, 17.3). */
export interface LivingZhkCityBreakdown {
  cityId: number;
  cityName: string;
  citySlug: string | null;
  /** Всегда `true` (выборка ограничена стартовыми городами). */
  isStarter: boolean;
  /** Число ЖК со статусом `LIVING` в этом городе. */
  livingZhkCount: number;
}

/**
 * Разбивка метрики Living_ZhK по стартовым городам (Requirements 17.1, 17.3).
 *
 * Возвращает по строке на каждый стартовый город (`cities.is_starter = true`),
 * включая города с нулём живых ЖК (левое соединение + агрегат с `filter`), чтобы
 * метрика показывала полную картину приоритетных городов развития сообщества.
 */
export async function countLivingZhkByStarterCity(): Promise<
  LivingZhkCityBreakdown[]
> {
  const rows = await db
    .select({
      cityId: citiesTable.id,
      cityName: citiesTable.name,
      citySlug: citiesTable.slug,
      livingZhkCount: sql<number>`count(${zhkTable.id}) filter (where ${zhkTable.status} = ${LIVING_ZHK_STATUS})`,
    })
    .from(citiesTable)
    .leftJoin(zhkTable, eq(zhkTable.cityId, citiesTable.id))
    .where(eq(citiesTable.isStarter, true))
    .groupBy(citiesTable.id, citiesTable.name, citiesTable.slug)
    .orderBy(citiesTable.name);

  return rows.map((r) => ({
    cityId: r.cityId,
    cityName: r.cityName,
    citySlug: r.citySlug ?? null,
    isStarter: true,
    livingZhkCount: Number(r.livingZhkCount) || 0,
  }));
}

// ─── Общероссийский доступ мастеров к All_Russia_Feed (Requirement 18) ───────

/** Роль аккаунта-мастера (совместимо с `community_accounts.role`). */
export const MASTER_ROLE = "master" as const;

/**
 * Привлечение мастеров — канал роста, ПАРАЛЛЕЛЬНЫЙ развитию сообщества жителей
 * (Requirement 18.3). Именованная константа-документ: рост базы мастеров не
 * зависит от локальной плотности жителей и стартовых городов.
 */
export const MASTER_RECRUITMENT_CHANNEL = "all_russia_feed" as const;

/**
 * Минимальная форма мастера для проверки доступа к All_Russia_Feed.
 *
 * ВАЖНО: поля `cityId` / `inStarterCity` / `localResidentDensity` присутствуют
 * ЯВНО, чтобы задокументировать, что они НЕ влияют на доступ (Requirements 18.1,
 * 18.2). Предикат их игнорирует.
 */
export interface AllRussiaAccessMaster {
  /** Роль аккаунта; доступ рассчитан на мастеров PRO_Zone. */
  role?: string | null;
  /** Город мастера — НЕ гейтит доступ (R18.2). */
  cityId?: number | null;
  /** Slug города мастера — НЕ гейтит доступ (R18.2). */
  citySlug?: string | null;
  /** Мастер в стартовом городе? — НЕ гейтит доступ (R18.1). */
  inStarterCity?: boolean | null;
  /** Локальная плотность жителей — НЕ гейтит доступ (R18.2). */
  localResidentDensity?: number | null;
}

/**
 * ЧИСТЫЙ предикат: имеет ли мастер полный доступ к All_Russia_Feed
 * (Requirements 18.1, 18.2).
 *
 * Возвращает `true` для ЛЮБОГО мастера — независимо от города, принадлежности к
 * стартовому набору городов и локальной плотности жителей. Эти поля намеренно
 * НЕ участвуют в решении (нет гейтинга по плотности/городу — Requirement 18.2).
 *
 * Не-мастер (роль ≠ `master`) получает `false`: предикат отвечает именно за
 * доступ МАСТЕРА; публичное чтение `pro_public` анонимами регулируется
 * отдельным слоем доступа (Requirement 9.1). Роль `null`/`undefined`
 * трактуется как мастер (аргумент назван `master`).
 *
 * @param master Мастер (или `null`).
 */
export function masterHasAllRussiaAccess(
  master?: AllRussiaAccessMaster | null,
): boolean {
  if (!master) return false;
  // Только мастер (роль по умолчанию — мастер, т.к. аргумент — мастер).
  if (master.role != null && master.role !== MASTER_ROLE) return false;
  // Любой мастер → ПОЛНЫЙ доступ, БЕЗ гейтинга по городу/стартовости/плотности
  // (Requirements 18.1, 18.2). Поля city/starter/density намеренно не читаются.
  return true;
}

/** Причина решения о доступе мастера к All_Russia_Feed. */
export type AllRussiaAccessReason =
  /** Полный доступ выдан мастеру (R18.1, R18.2). */
  | "master_full_access"
  /** Не мастер — доступ мастера неприменим. */
  | "not_master"
  /** Аккаунт отсутствует. */
  | "anonymous";

/**
 * Разъяснённое решение о доступе мастера к All_Russia_Feed (Requirement 18).
 *
 * Явно фиксирует, что доступ мастера НЕ гейтится ни городом/стартовым набором
 * (`gatedByStarterCity: false`), ни локальной плотностью жителей
 * (`gatedByLocalDensity: false`) — исполняемая документация Requirement 18.2.
 */
export interface MasterAllRussiaAccessDecision {
  /** Есть ли доступ. */
  hasAccess: boolean;
  /** Полный ли доступ (для мастера — да). */
  fullAccess: boolean;
  /** Гейтится ли доступ локальной плотностью жителей — всегда `false` (R18.2). */
  gatedByLocalDensity: false;
  /** Гейтится ли доступ стартовым городом — всегда `false` (R18.1). */
  gatedByStarterCity: false;
  /** Канал роста мастеров, параллельный сообществу жителей (R18.3). */
  recruitmentChannel: typeof MASTER_RECRUITMENT_CHANNEL;
  /** Причина решения. */
  reason: AllRussiaAccessReason;
}

/**
 * Разъяснённое решение о доступе мастера к All_Russia_Feed (Requirement 18).
 *
 * Тонкая обёртка над `masterHasAllRussiaAccess`, дополнительно документирующая
 * ОТСУТСТВИЕ гейтинга по плотности/стартовому городу и параллельный канал роста
 * мастеров. Не обращается к БД.
 */
export function describeMasterAllRussiaAccess(
  master?: AllRussiaAccessMaster | null,
): MasterAllRussiaAccessDecision {
  const hasAccess = masterHasAllRussiaAccess(master);
  const reason: AllRussiaAccessReason = !master
    ? "anonymous"
    : hasAccess
      ? "master_full_access"
      : "not_master";
  return {
    hasAccess,
    fullAccess: hasAccess,
    gatedByLocalDensity: false,
    gatedByStarterCity: false,
    recruitmentChannel: MASTER_RECRUITMENT_CHANNEL,
    reason,
  };
}
