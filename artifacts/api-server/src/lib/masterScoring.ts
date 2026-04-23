import {
  db,
  mastersTable,
  ordersTable,
  orderDispatchesTable,
  receiptsTable,
  transactionsTable,
} from "@workspace/db";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getOverdueMasterIds } from "./orderEligibility.js";

/**
 * Скоринг мастера для приоритизации при назначении.
 *
 * Главный KPI — доходимость до оплаты комиссии. Самоотмены штрафуют сильно,
 * остальные сигналы корректируют итоговый score.
 *
 * v1: read-only, никакой записи в БД, никаких триггеров. Возвращает число и
 * компоненты — оператор видит цифру в CRM рядом с откликом и может валидировать.
 * После 1–2 недель наблюдения веса калибруются, затем подключается авто-логика.
 */

export interface ScoreComponents {
  /** Доля заказов, доведённых до предоплаты (0.5) или полной оплаты (1.0) комиссии за 90 дней */
  payRate: number;            // 0..1
  /** Средняя комиссия по оплаченным транзакциям за 90 дней, ₽ */
  avgCommission: number;
  /** Медианная скорость отклика на рассылку, секунды (null если нет данных) */
  responseSpeedSec: number | null;
  /** Доля самоотмен от всех назначений за 30 дней */
  selfCancelRate: number;     // 0..1
  /** Совпадение района заявки с предпочтениями мастера */
  districtMatch: 0 | 1;
  /** Текущая загрузка: активные заказы / лимит */
  loadRatio: number;          // 0..1+
  /** Подписан ли договор и верифицирован паспорт */
  hasContract: boolean;
  /** Есть ли просроченная задолженность по комиссии */
  hasOverdueDebt: boolean;
  /** Сколько заказов было назначено за 90 дней (для cold-start) */
  totalAssigned90d: number;
  /** Сколько заказов завершено за всё время (для cold-start и лидерборда) */
  totalCompletedAllTime: number;
}

export type MasterSegment = "platinum" | "gold" | "silver" | "starter" | "blocked";

export interface ScoreResult {
  masterId: number;
  /** Итоговый score 0..100 */
  total: number;
  segment: MasterSegment;
  /** Cold start: < 5 завершённых заказов за всё время — score не считается, мастер в стартовом тире */
  isCold: boolean;
  components: ScoreComponents;
}

const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;
const TARGET_COMMISSION = 5000;
const COLD_START_THRESHOLD = 5;

// Self-cancel cancelTypes — то, что мастер сам выбирает в форме отмены.
// См. artifacts/api-server/src/routes/master-pwa.ts:955.
const SELF_CANCEL_TYPES = ["client_refused", "price_disagreement", "master_cant", "other"];

/**
 * Считает score для группы мастеров. Бэтчевые SQL-запросы — эффективно для списка
 * откликов на одну заявку (5–20 мастеров).
 */
export async function scoreMasters(
  masterIds: number[],
  opts: { district?: string | null } = {},
): Promise<Map<number, ScoreResult>> {
  const result = new Map<number, ScoreResult>();
  if (masterIds.length === 0) return result;

  const now = new Date();
  const since90 = new Date(now.getTime() - NINETY_DAYS_MS);
  const since30 = new Date(now.getTime() - THIRTY_DAYS_MS);

  // 1. Профили мастеров
  const masters = await db.select().from(mastersTable)
    .where(inArray(mastersTable.id, masterIds));
  const masterMap = new Map(masters.map(m => [m.id, m]));

  // 2. Назначенные заказы за 90 дней (для знаменателя доходимости + selfCancelRate)
  const assignedOrders = await db.select({
    id: ordersTable.id,
    masterId: ordersTable.masterId,
    status: ordersTable.status,
    cancelType: ordersTable.cancelType,
    assignedAt: ordersTable.assignedAt,
    updatedAt: ordersTable.updatedAt,
  }).from(ordersTable).where(and(
    inArray(ordersTable.masterId, masterIds),
    isNotNull(ordersTable.assignedAt),
    gte(ordersTable.assignedAt, since90),
  ));

  // 3. Receipts c подтверждённой предоплатой по этим заказам
  const orderIds = assignedOrders.map(o => o.id);
  const prepayReceipts = orderIds.length > 0
    ? await db.select({
        orderId: receiptsTable.orderId,
        masterId: receiptsTable.masterId,
      }).from(receiptsTable).where(and(
        inArray(receiptsTable.orderId, orderIds),
        isNotNull(receiptsTable.prepaymentSubmittedAt),
      ))
    : [];
  const prepayOrderIds = new Set(prepayReceipts.map(r => r.orderId));

  // 4. Полностью оплаченные транзакции за 90 дней — для payRate=1.0 и avgCommission
  const paidTx = await db.select({
    masterId: transactionsTable.masterId,
    orderId: transactionsTable.orderId,
    commission: transactionsTable.commission,
    paidAt: transactionsTable.paidAt,
    createdAt: transactionsTable.createdAt,
  }).from(transactionsTable).where(and(
    inArray(transactionsTable.masterId, masterIds),
    eq(transactionsTable.paymentStatus, "paid"),
    gte(transactionsTable.createdAt, since90),
  ));
  const paidByMaster = new Map<number, typeof paidTx>();
  for (const tx of paidTx) {
    const arr = paidByMaster.get(tx.masterId) ?? [];
    arr.push(tx);
    paidByMaster.set(tx.masterId, arr);
  }
  const paidOrderIds = new Set(paidTx.map(t => t.orderId));

  // 5. Скорость отклика — медиана по dispatch'ам за 30 дней с заполненным respondedAt
  const speedRows = await db.execute<{ master_id: number; median_sec: number }>(sql`
    SELECT
      master_id,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (responded_at - created_at)))::float AS median_sec
    FROM ${orderDispatchesTable}
    WHERE master_id = ANY(${masterIds})
      AND responded_at IS NOT NULL
      AND created_at >= ${since30}
      AND status IN ('responded', 'assigned')
    GROUP BY master_id
  `);
  const speedMap = new Map<number, number>();
  for (const r of speedRows.rows ?? []) {
    speedMap.set(Number(r.master_id), Number(r.median_sec));
  }

  // 6. Активные заказы (для loadRatio)
  const activeOrders = await db.select({
    masterId: ordersTable.masterId,
    id: ordersTable.id,
  }).from(ordersTable).where(and(
    inArray(ordersTable.masterId, masterIds),
    inArray(ordersTable.status, ["master_assigned", "in_progress"]),
  ));
  const activeCountMap = new Map<number, number>();
  for (const o of activeOrders) {
    if (o.masterId == null) continue;
    activeCountMap.set(o.masterId, (activeCountMap.get(o.masterId) ?? 0) + 1);
  }

  // 7. Завершённые за всё время (для cold-start)
  const completedRows = await db.select({
    masterId: ordersTable.masterId,
    cnt: sql<number>`count(*)::int`,
  }).from(ordersTable).where(and(
    inArray(ordersTable.masterId, masterIds),
    eq(ordersTable.status, "completed"),
  )).groupBy(ordersTable.masterId);
  const completedAllTimeMap = new Map<number, number>();
  for (const r of completedRows) {
    if (r.masterId != null) completedAllTimeMap.set(r.masterId, Number(r.cnt));
  }

  // 8. Просроченный долг
  const overdueIds = await getOverdueMasterIds();

  // ── Считаем score для каждого мастера ────────────────────────────────────
  for (const masterId of masterIds) {
    const master = masterMap.get(masterId);
    if (!master) continue;

    const myAssigned = assignedOrders.filter(o => o.masterId === masterId);
    const totalAssigned90d = myAssigned.length;
    const totalCompletedAllTime = completedAllTimeMap.get(masterId) ?? 0;
    const isCold = totalCompletedAllTime < COLD_START_THRESHOLD;

    // payRate: для каждого назначенного — max(prepay 0.5, paid 1.0). Сумма / total.
    let paySum = 0;
    let selfCancels = 0;
    for (const o of myAssigned) {
      const reached =
        paidOrderIds.has(o.id) ? 1.0 :
        prepayOrderIds.has(o.id) ? 0.5 :
        0;
      paySum += reached;
      if (
        o.status === "cancelled" &&
        o.cancelType &&
        SELF_CANCEL_TYPES.includes(o.cancelType) &&
        o.updatedAt && o.updatedAt.getTime() >= since30.getTime()
      ) {
        selfCancels += 1;
      }
    }
    // Сырые ставки — для отображения и аналитики.
    const payRate = totalAssigned90d > 0 ? paySum / totalAssigned90d : 0;
    const selfCancelRate = totalAssigned90d > 0 ? selfCancels / totalAssigned90d : 0;

    // Байесовское сглаживание для скоринга: при малой выборке тянет к базовой линии.
    // Это убирает «2 заказа из 2 = платина» — у новичка эффективная ставка
    // приближена к среднему по платформе, и доминировать начинает только после
    // десятков заказов.
    const SMOOTH_N = 10;       // сила сглаживания (≈ количество «виртуальных» заказов)
    const PAY_PRIOR = 0.5;     // базовая доходимость (середина шкалы)
    const CANCEL_PRIOR = 0.05; // базовый процент самоотмен
    const payRateSmoothed =
      (paySum + PAY_PRIOR * SMOOTH_N) / (totalAssigned90d + SMOOTH_N);
    const selfCancelRateSmoothed =
      (selfCancels + CANCEL_PRIOR * SMOOTH_N) / (totalAssigned90d + SMOOTH_N);

    // avgCommission
    const myPaid = paidByMaster.get(masterId) ?? [];
    const avgCommission = myPaid.length > 0
      ? myPaid.reduce((s, t) => s + Number(t.commission), 0) / myPaid.length
      : 0;

    // districtMatch
    const districtMatch: 0 | 1 = (
      opts.district &&
      master.preferredDistricts &&
      master.preferredDistricts.includes(opts.district)
    ) ? 1 : 0;

    // loadRatio
    const activeCount = activeCountMap.get(masterId) ?? 0;
    const limit = master.maxActiveOrders ?? 1;
    const loadRatio = activeCount / Math.max(1, limit);

    const hasContract = !!(master.contractSignedAt && master.passportVerified);
    const hasOverdueDebt = overdueIds.has(masterId);
    const responseSpeedSec = speedMap.get(masterId) ?? null;

    const components: ScoreComponents = {
      payRate,
      avgCommission,
      responseSpeedSec,
      selfCancelRate,
      districtMatch,
      loadRatio,
      hasContract,
      hasOverdueDebt,
      totalAssigned90d,
      totalCompletedAllTime,
    };

    // ── Формула score ──────────────────────────────────────────────────────
    // Заблокированные — score=0, segment=blocked, остальные компоненты
    // считаются для отображения, но не влияют на тиры распределения.
    if (master.blockedFromOrders) {
      result.set(masterId, {
        masterId,
        total: 0,
        segment: "blocked",
        isCold,
        components,
      });
      continue;
    }

    // Cold start: новые мастера получают базовый score=50 (середина), чтобы
    // попадать в общий поток на равных, пока статистика не накопится.
    if (isCold) {
      result.set(masterId, {
        masterId,
        total: 50,
        segment: "starter",
        isCold,
        components,
      });
      continue;
    }

    // Положительные компоненты (макс +100)
    let raw = 0;
    raw += payRateSmoothed * 50;                            // макс +50, сглажено
    // avgCommission учитываем тем сильнее, чем больше оплаченных транзакций.
    // <5 транзакций — частичный вес, 5+ — полный.
    const commConfidence = Math.min(1, myPaid.length / 5);
    raw += Math.min(1, avgCommission / TARGET_COMMISSION) * 15 * commConfidence;
    if (responseSpeedSec != null) {
      // 0 сек = +10, 60 мин = 0, линейно
      const speedScore = Math.max(0, Math.min(1, 1 - responseSpeedSec / 3600));
      raw += speedScore * 10;
    }
    raw += districtMatch * 10;                              // 0 или +10
    if (hasContract) raw += 5;                              // +5

    // Штрафы (макс −55)
    raw -= selfCancelRateSmoothed * 30;                     // макс −30, сглажено
    raw -= Math.min(1, loadRatio) * 10;                     // макс −10
    if (hasOverdueDebt) raw -= 15;                          // −15

    const total = Math.round(Math.max(0, Math.min(100, raw)));

    let segment: MasterSegment;
    if (total >= 80) segment = "platinum";
    else if (total >= 60) segment = "gold";
    else if (total >= 40) segment = "silver";
    else segment = "starter";

    result.set(masterId, { masterId, total, segment, isCold, components });
  }

  return result;
}

/**
 * Удобный wrapper для одного мастера.
 */
export async function scoreMaster(
  masterId: number,
  opts: { district?: string | null } = {},
): Promise<ScoreResult | null> {
  const map = await scoreMasters([masterId], opts);
  return map.get(masterId) ?? null;
}
