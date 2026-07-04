/**
 * Living-community layer — еженедельная агрегация активности ЖК и классификация
 * статуса Living_ZhK / NON_LIVING (Requirement 17.1, 17.2, 17.4).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "Living-community
 * layer", Data Models → `zhk` / `zhk_weekly_activity`).
 *
 * Что делает этот модуль:
 *
 *   1. `classifyZhkStatus(activeResidents, threshold)` — ЧИСТАЯ функция
 *      классификации: `activeResidents >= threshold` → `LIVING`, иначе явно
 *      `NON_LIVING` (Requirement 17.2). Не обращается к БД, детерминирована,
 *      юнит-тестируема.
 *
 *   2. `aggregateZhkWeeklyActivity(weekStart)` — агрегирует число активных
 *      жителей за неделю по каждому ЖК в `zhk_weekly_activity` и присваивает
 *      `zhk.status`. Логика отделена от расписания cron, чтобы её можно было
 *      запускать и тестировать независимо.
 *
 *   3. `getPrioritizedSeedingCandidates()` — query-хелпер, возвращающий
 *      ЖК-кандидатов для приоритетного сидирования: новостройки в стартовых
 *      городах (`cities.is_starter`), ещё не достигшие статуса Living_ZhK
 *      (Requirement 17.4).
 *
 *   4. `registerZhkActivityCron()` — обёртка над `node-cron`, регистрирующая
 *      еженедельный запуск агрегации. НЕ вызывается на этапе импорта модуля
 *      (чтобы cron не стартовал во время тестов); должна быть подключена явно из
 *      `src/index.ts` (аналогично прочим шедулерам), см. README ниже.
 *
 * ── Порог активности N (конфигурируемый) ────────────────────────────────────
 * Порог «активных жителей в неделю» для статуса Living_ZhK берётся из env
 * `LIVING_ZHK_MIN_WEEKLY_RESIDENTS`. По умолчанию — `DEFAULT_LIVING_ZHK_MIN_
 * WEEKLY_RESIDENTS = 5` (небольшое разумное значение для стартовой фазы; см.
 * Notes в tasks.md — N уточняется на этапе 12.1).
 *
 * ── Определение «активного жителя» ──────────────────────────────────────────
 * Активный житель ЖК за неделю — уникальный `community_accounts`, опубликовавший
 * тему в этом ЖК (`community_threads.scope='zhk'`) в пределах недельного окна.
 * Считаем `count(distinct author_account_id)` (сид-контент без автора не
 * учитывается — Requirement 17.2 требует реальной активности жителей).
 */

import {
  db,
  zhkTable,
  zhkWeeklyActivityTable,
  citiesTable,
  communityThreadsTable,
  type ZhkStatus,
} from "@workspace/db";
import { and, eq, gte, lt, isNotNull, sql } from "drizzle-orm";
import cron, { type ScheduledTask } from "node-cron";

/**
 * Значение порога N по умолчанию: минимальное число активных жителей в неделю
 * для присвоения ЖК статуса Living_ZhK (Requirement 17.2). Небольшое разумное
 * значение для стартовой фазы развития сообщества.
 */
export const DEFAULT_LIVING_ZHK_MIN_WEEKLY_RESIDENTS = 5;

/** Env-ключ для переопределения порога N. */
export const LIVING_ZHK_THRESHOLD_ENV = "LIVING_ZHK_MIN_WEEKLY_RESIDENTS";

/**
 * Cron-выражение по умолчанию: каждый понедельник в 03:00 (Europe/Moscow).
 * Агрегирует активность за ПРЕДЫДУЩУЮ полную неделю.
 */
export const ZHK_ACTIVITY_CRON_EXPRESSION = "0 3 * * 1";
export const ZHK_ACTIVITY_CRON_TIMEZONE = "Europe/Moscow";

/**
 * Разрешить порог N из окружения. Некорректное/неположительное значение →
 * возврат к дефолту `DEFAULT_LIVING_ZHK_MIN_WEEKLY_RESIDENTS`.
 */
export function getLivingZhkThreshold(): number {
  const raw = process.env[LIVING_ZHK_THRESHOLD_ENV];
  const parsed = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LIVING_ZHK_MIN_WEEKLY_RESIDENTS;
}

/**
 * ЧИСТАЯ функция классификации статуса ЖК (Requirement 17.2).
 *
 * `activeResidents >= threshold` → `'LIVING'`, иначе явно `'NON_LIVING'`.
 * Детерминирована, не обращается к БД — точка для юнит-тестов границы.
 */
export function classifyZhkStatus(
  activeResidents: number,
  threshold: number,
): ZhkStatus {
  return activeResidents >= threshold ? "LIVING" : "NON_LIVING";
}

/**
 * Начало недели (понедельник, 00:00 UTC) для переданной даты в формате
 * `YYYY-MM-DD`. Используется как ключ `zhk_weekly_activity.week_start` и как
 * нижняя граница недельного окна агрегации.
 */
export function getWeekStart(reference: Date = new Date()): string {
  const d = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
    ),
  );
  // getUTCDay(): 0 = воскресенье … 1 = понедельник. Сдвигаем к понедельнику.
  const dow = d.getUTCDay();
  const diffToMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

/** Прибавить `days` к дате-строке `YYYY-MM-DD`; вернуть `Date` (UTC). */
function addDaysUtc(dateStr: string, days: number): Date {
  const [y, m, day] = dateStr.split("-").map((n) => Number.parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, day + days));
}

export interface ZhkAggregationResult {
  weekStart: string;
  threshold: number;
  /** Всего ЖК обработано. */
  processed: number;
  /** Сколько ЖК классифицировано как LIVING. */
  living: number;
  /** Сколько ЖК классифицировано как NON_LIVING. */
  nonLiving: number;
  /** Сколько записей `zhk.status` фактически изменено. */
  statusChanged: number;
}

/**
 * Агрегировать активность жителей за неделю по всем ЖК и классифицировать
 * статус каждого ЖК (Requirement 17.2).
 *
 * Для каждого ЖК:
 *   1. считает уникальных авторов-жителей за окно `[weekStart, weekStart+7)`;
 *   2. идемпотентно апсертит строку `zhk_weekly_activity (zhk_id, week_start)`;
 *   3. присваивает `zhk.status` через `classifyZhkStatus` (обновляет только при
 *      фактическом изменении).
 *
 * Логика отделена от cron-расписания — вызывается напрямую в тестах/скриптах.
 *
 * @param weekStart начало недели `YYYY-MM-DD`; по умолчанию — текущая неделя.
 * @param threshold порог N; по умолчанию — `getLivingZhkThreshold()`.
 */
export async function aggregateZhkWeeklyActivity(
  weekStart: string = getWeekStart(),
  threshold: number = getLivingZhkThreshold(),
): Promise<ZhkAggregationResult> {
  const windowStart = addDaysUtc(weekStart, 0);
  const windowEnd = addDaysUtc(weekStart, 7);

  // Уникальные авторы-жители по ЖК за неделю (сид-контент без автора исключён).
  const counts = await db
    .select({
      zhkId: communityThreadsTable.zhkId,
      activeResidents: sql<number>`count(distinct ${communityThreadsTable.authorAccountId})`,
    })
    .from(communityThreadsTable)
    .where(
      and(
        eq(communityThreadsTable.scope, "zhk"),
        isNotNull(communityThreadsTable.zhkId),
        isNotNull(communityThreadsTable.authorAccountId),
        gte(communityThreadsTable.createdAt, windowStart),
        lt(communityThreadsTable.createdAt, windowEnd),
      ),
    )
    .groupBy(communityThreadsTable.zhkId);

  const countByZhk = new Map<number, number>();
  for (const row of counts) {
    if (row.zhkId != null) {
      countByZhk.set(row.zhkId, Number(row.activeResidents) || 0);
    }
  }

  // Все ЖК — включая те, у кого 0 активности (им явно присваивается NON_LIVING).
  const allZhk = await db
    .select({ id: zhkTable.id, status: zhkTable.status })
    .from(zhkTable);

  const result: ZhkAggregationResult = {
    weekStart,
    threshold,
    processed: 0,
    living: 0,
    nonLiving: 0,
    statusChanged: 0,
  };

  for (const z of allZhk) {
    const activeResidents = countByZhk.get(z.id) ?? 0;
    const status = classifyZhkStatus(activeResidents, threshold);

    // Идемпотентный апсерт недельной активности.
    await db
      .insert(zhkWeeklyActivityTable)
      .values({ zhkId: z.id, weekStart, activeResidents })
      .onConflictDoUpdate({
        target: [zhkWeeklyActivityTable.zhkId, zhkWeeklyActivityTable.weekStart],
        set: { activeResidents, updatedAt: new Date() },
      });

    if (z.status !== status) {
      await db
        .update(zhkTable)
        .set({ status })
        .where(eq(zhkTable.id, z.id));
      result.statusChanged += 1;
    }

    result.processed += 1;
    if (status === "LIVING") result.living += 1;
    else result.nonLiving += 1;
  }

  console.log(
    `[zhkActivityCron] week=${weekStart} threshold=${threshold} ` +
      `processed=${result.processed} living=${result.living} ` +
      `nonLiving=${result.nonLiving} statusChanged=${result.statusChanged}`,
  );
  return result;
}

export interface SeedingCandidate {
  zhkId: number;
  slug: string;
  name: string;
  cityId: number;
  cityName: string;
  citySlug: string | null;
  status: string;
  contentScore: number;
}

/**
 * Кандидаты для приоритетного сидирования (Requirement 17.4).
 *
 * Возвращает ЖК в стартовых городах (`cities.is_starter = true`), ещё НЕ
 * достигшие статуса Living_ZhK (`zhk.status <> 'LIVING'`) — именно новостройки
 * стартовых городов приоритизируются для доведения до статуса Living_ZhK.
 *
 * Порядок: сначала наименее наполненные (`content_score` по возрастанию), затем
 * более новые записи — чтобы усилия по сидированию шли туда, где контента меньше
 * всего. Это минимальный query-хелпер, потребляемый слоем сидирования/метрик.
 *
 * @param limit максимум кандидатов (по умолчанию 50).
 */
export async function getPrioritizedSeedingCandidates(
  limit = 50,
): Promise<SeedingCandidate[]> {
  const rows = await db
    .select({
      zhkId: zhkTable.id,
      slug: zhkTable.slug,
      name: zhkTable.name,
      cityId: zhkTable.cityId,
      cityName: citiesTable.name,
      citySlug: citiesTable.slug,
      status: zhkTable.status,
      contentScore: zhkTable.contentScore,
    })
    .from(zhkTable)
    .innerJoin(citiesTable, eq(zhkTable.cityId, citiesTable.id))
    .where(
      and(eq(citiesTable.isStarter, true), sql`${zhkTable.status} <> 'LIVING'`),
    )
    .orderBy(zhkTable.contentScore, zhkTable.createdAt)
    .limit(limit);

  return rows.map((r) => ({
    zhkId: r.zhkId,
    slug: r.slug,
    name: r.name,
    cityId: r.cityId,
    cityName: r.cityName,
    citySlug: r.citySlug ?? null,
    status: r.status,
    contentScore: r.contentScore,
  }));
}

/**
 * Зарегистрировать еженедельный cron агрегации активности ЖК.
 *
 * ВАЖНО: не вызывается на этапе импорта модуля — иначе шедулер стартовал бы во
 * время тестов. Подключается ЯВНО из `src/index.ts` (как прочие шедулеры),
 * например:
 *
 * ```ts
 * import { registerZhkActivityCron } from "./lib/zhkActivityCron.js";
 * registerZhkActivityCron();
 * ```
 *
 * Возвращает `ScheduledTask` node-cron (для остановки/тестов при необходимости).
 */
export function registerZhkActivityCron(): ScheduledTask {
  const task = cron.schedule(
    ZHK_ACTIVITY_CRON_EXPRESSION,
    () => {
      // Агрегируем ПРЕДЫДУЩУЮ полную неделю (запуск в понедельник 03:00).
      const previousWeek = getWeekStart(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
      aggregateZhkWeeklyActivity(previousWeek).catch((err) =>
        console.error("[zhkActivityCron] weekly aggregation failed:", err),
      );
    },
    { timezone: ZHK_ACTIVITY_CRON_TIMEZONE },
  );
  console.log(
    `[zhkActivityCron] Registered weekly aggregation ` +
      `(${ZHK_ACTIVITY_CRON_EXPRESSION} ${ZHK_ACTIVITY_CRON_TIMEZONE})`,
  );
  return task;
}
