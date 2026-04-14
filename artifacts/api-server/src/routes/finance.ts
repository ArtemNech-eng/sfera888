import { Router } from "express";
import { db, transactionsTable, mastersTable, ordersTable, receiptsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requirePermission } from "../middlewares/requireAuth.js";
import { sendPushToMaster } from "../lib/push.js";
import { checkOverdueTransactions, countActiveMasterOrders, getColumnIdForActiveCount } from "../lib/orderEligibility.js";
import { sendMaxMessage } from "../maxBot.js";

const router = Router();
const adminOnly   = requirePermission("finance");
const opsAndAdmin = requirePermission("finance");

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAdminMaxChatId(): Promise<string | null> {
  const row = await db.execute(sql`
    SELECT max_chat_id FROM masters
    WHERE role = 'admin' AND max_chat_id IS NOT NULL AND deleted_at IS NULL
    LIMIT 1
  `);
  return (row.rows[0] as any)?.max_chat_id ?? null;
}

async function sendAdminMax(text: string): Promise<void> {
  const chatId = await getAdminMaxChatId();
  if (chatId) await sendMaxMessage(chatId, text).catch(console.error);
}

async function sendMasterMax(masterId: number, text: string): Promise<void> {
  const rows = await db.select({ maxChatId: mastersTable.maxChatId })
    .from(mastersTable).where(eq(mastersTable.id, masterId));
  const chatId = rows[0]?.maxChatId;
  if (chatId) await sendMaxMessage(chatId, text).catch(console.error);
}

function computeDueDate(createdAt: Date): Date {
  return new Date(createdAt.getTime() + 3 * 24 * 3600_000);
}

function computeDaysOverdue(createdAt: Date, now = new Date()): number {
  const due = computeDueDate(createdAt);
  const ms = now.getTime() - due.getTime();
  return ms > 0 ? Math.floor(ms / 86400_000) : 0;
}

const REMIND_DEDUP_HOURS  = 24;
const REMIND_ALL_DEDUP_H  = 8;

async function wasFinanceReminded(
  scenario: string, orderId: number, masterId: number, hours: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  const r = await db.execute(sql`
    SELECT 1 FROM scenario_notifications
    WHERE scenario_id = ${scenario}
      AND order_id    = ${orderId}
      AND master_id   = ${masterId}
      AND sent_at    >= ${cutoff}
    LIMIT 1
  `);
  return r.rows.length > 0;
}

async function recordFinanceRemind(
  scenario: string, orderId: number, masterId: number
): Promise<void> {
  await db.execute(sql`
    INSERT INTO scenario_notifications (scenario_id, order_id, master_id, tier)
    VALUES (${scenario}, ${orderId}, ${masterId}, 'reminder')
  `).catch(console.error);
}

// ─── GET /api/finance/transactions ───────────────────────────────────────────

router.get("/transactions", opsAndAdmin, async (req, res) => {
  const { masterId, status, from, to } = req.query;
  const now = new Date();

  const rows = await db.execute(sql`
    SELECT t.id, t.order_id, t.master_id, t.order_amount, t.commission,
           t.prepayment_deducted, t.payment_status, t.source_type,
           t.created_at, t.paid_at,
           m.alias AS master_alias, m.city AS master_city,
           o.service_type, o.city AS order_city, o.area
    FROM transactions t
    LEFT JOIN masters m ON m.id = t.master_id
    LEFT JOIN orders  o ON o.id = t.order_id
    ORDER BY t.created_at DESC
  `);

  let list = rows.rows as any[];
  if (masterId) list = list.filter(t => t.master_id === parseInt(masterId as string));
  if (status)   list = list.filter(t => t.payment_status === status);
  if (from)     list = list.filter(t => new Date(t.created_at) >= new Date(from as string));
  if (to)       list = list.filter(t => new Date(t.created_at) <= new Date(to as string));

  res.json(list.map(t => {
    const prepaymentDeducted = Number(t.prepayment_deducted ?? 0);
    const commission         = Number(t.commission);
    const netPayable         = Math.max(0, commission - prepaymentDeducted);
    const createdAt          = new Date(t.created_at);
    const daysOverdue        = t.payment_status === "overdue" ? computeDaysOverdue(createdAt, now) : 0;
    return {
      id:                  t.id,
      orderId:             t.order_id,
      masterId:            t.master_id,
      masterAlias:         t.master_alias ?? "Неизвестен",
      city:                t.order_city ?? t.master_city ?? "—",
      serviceType:         t.service_type ?? "—",
      area:                t.area ? Number(t.area) : null,
      orderAmount:         Number(t.order_amount),
      commission,
      prepaymentDeducted,
      netPayable,
      paymentStatus:       t.payment_status,
      sourceType:          t.source_type ?? null,
      createdAt:           t.created_at,
      paidAt:              t.paid_at ?? null,
      dueDate:             computeDueDate(createdAt).toISOString(),
      daysOverdue,
    };
  }));
});

// ─── PATCH /api/finance/transactions/:id ─────────────────────────────────────

router.patch("/transactions/:id", opsAndAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { paymentStatus, commission } = req.body;
  const updates: any = {};
  if (paymentStatus !== undefined) {
    updates.paymentStatus = paymentStatus;
    if (paymentStatus === "paid") updates.paidAt = new Date();
  }
  if (commission !== undefined) updates.commission = String(commission);

  const result = await db.update(transactionsTable).set(updates)
    .where(eq(transactionsTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Transaction not found" });
  const t = result[0];

  if (paymentStatus === "paid") {
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, t.masterId));
    const master = masterRows[0];
    if (master) {
      const prepaymentDeducted = Number(t.prepaymentDeducted ?? 0);
      const netPayable = Math.max(0, Number(t.commission) - prepaymentDeducted);
      const newDebt    = Math.max(0, Number(master.debt) - netPayable);

      const activeCount  = await countActiveMasterOrders(t.masterId);
      const targetColId  = await getColumnIdForActiveCount(activeCount);

      await db.update(mastersTable).set({
        debt: String(newDebt),
        isTestMaster: false,
        ...(targetColId ? { voronkaColumnId: targetColId } : {}),
      }).where(eq(mastersTable.id, t.masterId));

      // Max notification to master
      const paidLabel = netPayable > 0
        ? `${netPayable.toLocaleString("ru-RU")} ₽`
        : `${Number(t.commission).toLocaleString("ru-RU")} ₽ (через предоплату)`;
      const maxText = newDebt > 0
        ? `✅ Комиссия по заказу #${t.orderId} оплачена.\n\nСумма: ${paidLabel}\nОстаток долга: ${newDebt.toLocaleString("ru-RU")} ₽\n\nПогасите оставшийся долг, чтобы получить полный доступ к заказам.`
        : `✅ Комиссия по заказу #${t.orderId} оплачена.\n\nСумма: ${paidLabel}\n\nДолг погашен. Вы снова можете принимать заказы! 🟢\n\nСпасибо за сотрудничество 👍`;
      await sendMasterMax(t.masterId, maxText).catch(console.error);

      // PWA push
      sendPushToMaster(t.masterId, {
        title: "✅ Оплата принята",
        body: newDebt > 0
          ? `Оплачено ${paidLabel}. Остаток: ${newDebt.toLocaleString("ru-RU")} ₽`
          : `Оплачено ${paidLabel}. Долг погашен!`,
        url: "/balance",
      }).catch(() => {});
    }
  }

  const prepaymentDeducted = Number(t.prepaymentDeducted ?? 0);
  res.json({
    id: t.id, orderId: t.orderId, masterId: t.masterId,
    orderAmount: Number(t.orderAmount), commission: Number(t.commission),
    prepaymentDeducted, netPayable: Math.max(0, Number(t.commission) - prepaymentDeducted),
    paymentStatus: t.paymentStatus, sourceType: t.sourceType ?? null,
    createdAt: t.createdAt, paidAt: t.paidAt ?? null,
  });
});

// ─── POST /api/finance/transactions/:id/remind ───────────────────────────────

router.post("/transactions/:id/remind", opsAndAdmin, async (req, res) => {
  const id = parseInt(req.params.id);

  const rows = await db.execute(sql`
    SELECT t.*, m.alias, m.max_chat_id, o.service_type
    FROM transactions t
    LEFT JOIN masters m ON m.id = t.master_id
    LEFT JOIN orders  o ON o.id = t.order_id
    WHERE t.id = ${id}
  `);
  const t = rows.rows[0] as any;
  if (!t) return res.status(404).json({ error: "Not found" });
  if (t.payment_status === "paid") return res.status(400).json({ error: "Already paid" });
  if (!t.max_chat_id) return res.status(400).json({ error: "Мастер не подключён к Max" });

  // ── Dedup: не слать чаще раза в 24ч по одной транзакции ────────────────────
  const alreadySent = await wasFinanceReminded(
    "finance-remind", t.order_id, t.master_id, REMIND_DEDUP_HOURS
  );
  if (alreadySent) {
    return res.status(429).json({
      error: `Напоминание уже отправлено в течение последних ${REMIND_DEDUP_HOURS}ч`,
      cooldownHours: REMIND_DEDUP_HOURS,
    });
  }

  const commission  = Number(t.commission);
  const dueDate     = computeDueDate(new Date(t.created_at));
  const dueDateStr  = dueDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const serviceType = t.service_type ?? "заказ";

  const text =
    `💰 Напоминание об оплате\n\n` +
    `По заказу #${t.order_id} (${serviceType}) ожидается оплата комиссии.\n\n` +
    `Сумма: ${commission.toLocaleString("ru-RU")} ₽\n` +
    `Срок: ${dueDateStr}\n\n` +
    `Оплатите на реквизиты в приложении → раздел Оплата.`;

  await sendMaxMessage(t.max_chat_id, text).catch(console.error);
  await recordFinanceRemind("finance-remind", t.order_id, t.master_id);
  res.json({ ok: true });
});

// ─── POST /api/finance/masters/:masterId/remind-all ──────────────────────────

router.post("/masters/:masterId/remind-all", opsAndAdmin, async (req, res) => {
  const masterId = parseInt(req.params.masterId);

  const rows = await db.execute(sql`
    SELECT t.id, t.order_id, t.commission, t.created_at, t.payment_status, o.service_type,
           m.alias, m.max_chat_id
    FROM transactions t
    LEFT JOIN orders  o ON o.id = t.order_id
    LEFT JOIN masters m ON m.id = t.master_id
    WHERE t.master_id = ${masterId} AND t.payment_status IN ('pending', 'overdue')
    ORDER BY t.created_at ASC
  `);

  const txList = rows.rows as any[];
  if (txList.length === 0) return res.status(400).json({ error: "Нет неоплаченных транзакций" });

  const master = txList[0];
  if (!master.max_chat_id) return res.status(400).json({ error: "Мастер не подключён к Max" });

  // ── Dedup: не слать сводку чаще раза в 8ч на одного мастера ───────────────
  // Используем orderId = 0 как "сводное" напоминание без привязки к конкретному заказу
  const alreadySent = await wasFinanceReminded(
    "finance-remind-all", 0, masterId, REMIND_ALL_DEDUP_H
  );
  if (alreadySent) {
    return res.status(429).json({
      error: `Сводка уже отправлена в течение последних ${REMIND_ALL_DEDUP_H}ч`,
      cooldownHours: REMIND_ALL_DEDUP_H,
    });
  }

  const total    = txList.reduce((s, t) => s + Number(t.commission), 0);
  const orderLines = txList.map(t =>
    `Заказ #${t.order_id}: ${Number(t.commission).toLocaleString("ru-RU")} ₽`
  ).join("\n");

  const text =
    `💰 Сводка задолженности\n\n` +
    `${master.alias}, у вас ${txList.length} неоплаченных комиссий:\n\n` +
    `${orderLines}\n\n` +
    `Итого: ${total.toLocaleString("ru-RU")} ₽\n\n` +
    `Оплатите на реквизиты в приложении → раздел Оплата.`;

  await sendMaxMessage(master.max_chat_id, text).catch(console.error);
  await recordFinanceRemind("finance-remind-all", 0, masterId);
  res.json({ ok: true, count: txList.length, total });
});

// ─── POST /api/finance/masters/:masterId/pay-all ─────────────────────────────

router.post("/masters/:masterId/pay-all", opsAndAdmin, async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  const now      = new Date();

  const txRows = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.masterId, masterId)));
  const unpaid = txRows.filter(t => t.paymentStatus !== "paid" && Number(t.commission) > 0);

  if (unpaid.length === 0) return res.status(400).json({ error: "Нет неоплаченных транзакций" });

  for (const t of unpaid) {
    await db.update(transactionsTable).set({ paymentStatus: "paid", paidAt: now })
      .where(eq(transactionsTable.id, t.id));
  }

  // Reset master debt to 0
  await db.update(mastersTable).set({ debt: "0" }).where(eq(mastersTable.id, masterId));

  const total = unpaid.reduce((s, t) => s + Math.max(0, Number(t.commission) - Number(t.prepaymentDeducted ?? 0)), 0);

  await sendMasterMax(masterId,
    `✅ Все комиссии оплачены!\n\n` +
    `Погашено ${unpaid.length} транзакций на сумму ${total.toLocaleString("ru-RU")} ₽.\n\n` +
    `Долг погашен. Вы снова можете принимать заказы! 🟢\n\nСпасибо за сотрудничество 👍`
  ).catch(console.error);

  res.json({ ok: true, count: unpaid.length, total });
});

// ─── GET /api/finance/summary ─────────────────────────────────────────────────

router.get("/summary", opsAndAdmin, async (req, res) => {
  const transactions = await db.select().from(transactionsTable);
  const paid    = transactions.filter(t => t.paymentStatus === "paid");
  const pending = transactions.filter(t => t.paymentStatus === "pending");
  const overdue = transactions.filter(t => t.paymentStatus === "overdue");

  const totalIncome  = paid.reduce((s, t) => s + Number(t.commission), 0);
  const totalDebt    = [...pending, ...overdue].reduce((s, t) =>
    s + Math.max(0, Number(t.commission) - Number(t.prepaymentDeducted ?? 0)), 0);
  const avgCommission = transactions.length > 0
    ? transactions.reduce((s, t) => s + Number(t.commission), 0) / transactions.length
    : 0;

  res.json({
    totalIncome, totalDebt, avgCommission,
    paidCount:    paid.length,
    pendingCount: pending.length,
    overdueCount: overdue.length,
    totalCount:   transactions.length,
    pendingAmount: pending.reduce((s, t) => s + Math.max(0, Number(t.commission) - Number(t.prepaymentDeducted ?? 0)), 0),
    overdueAmount: overdue.reduce((s, t) => s + Math.max(0, Number(t.commission) - Number(t.prepaymentDeducted ?? 0)), 0),
  });
});

// ─── POST /api/finance/check-overdue ─────────────────────────────────────────

router.post("/check-overdue", requirePermission("finance"), async (req, res) => {
  const daysParam = parseInt((req.query.days as string) ?? "3");
  const days      = isNaN(daysParam) || daysParam < 1 ? 3 : daysParam;
  const marked    = await checkOverdueTransactionsWithNotifications(days);
  res.json({ marked, message: `Отмечено просрочено: ${marked}` });
});

async function checkOverdueTransactionsWithNotifications(daysThreshold = 3): Promise<number> {
  const cutoff = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);
  const now    = new Date();

  const rows = await db.execute(sql`
    SELECT t.id, t.master_id, t.order_id, t.commission, t.created_at,
           m.max_chat_id, m.alias
    FROM transactions t
    LEFT JOIN masters m ON m.id = t.master_id
    WHERE t.payment_status = 'pending'
      AND t.created_at <= ${cutoff.toISOString()}
      AND CAST(t.commission AS NUMERIC) > 0
  `);

  const toMark = rows.rows as any[];
  if (toMark.length === 0) return 0;

  for (const t of toMark) {
    await db.update(transactionsTable)
      .set({ paymentStatus: "overdue" })
      .where(eq(transactionsTable.id, t.id));

    // Max notification to master
    if (t.max_chat_id) {
      const daysOver = Math.floor((now.getTime() - new Date(t.created_at).getTime()) / 86400_000) - daysThreshold;
      const commission = Number(t.commission);
      await sendMaxMessage(t.max_chat_id,
        `⚠️ Комиссия по заказу #${t.order_id} просрочена.\n\n` +
        `Срок прошёл: ${daysOver > 0 ? daysOver + " дн. назад" : "сегодня"}\n` +
        `Сумма: ${commission.toLocaleString("ru-RU")} ₽\n\n` +
        `Оплатите на реквизиты в приложении → раздел Оплата.`
      ).catch(console.error);
    }
  }

  // Admin alert for 7+ days overdue
  const cutoff7 = new Date(Date.now() - 7 * 24 * 3600_000);
  const overdue7Rows = await db.execute(sql`
    SELECT t.id, t.master_id, t.order_id, t.commission, t.created_at,
           m.alias
    FROM transactions t
    LEFT JOIN masters m ON m.id = t.master_id
    WHERE t.payment_status = 'overdue'
      AND t.created_at <= ${cutoff7.toISOString()}
      AND CAST(t.commission AS NUMERIC) > 0
  `);

  for (const t of overdue7Rows.rows as any[]) {
    const daysOver = Math.floor((now.getTime() - new Date(t.created_at).getTime()) / 86400_000);
    await sendAdminMax(
      `⚠️ Просроченная комиссия 7+ дней\n\n` +
      `Мастер: ${t.alias}\n` +
      `Заказ: #${t.order_id}\n` +
      `Сумма: ${Number(t.commission).toLocaleString("ru-RU")} ₽\n` +
      `Просрочено: ${daysOver} дней\n\n` +
      `Раздел Финансы → Транзакции`
    ).catch(console.error);
  }

  return toMark.length;
}

// ─── GET /api/finance/overdue-masters ────────────────────────────────────────

router.get("/overdue-masters", requirePermission("finance"), async (req, res) => {
  const rows = await db.execute(sql`
    SELECT t.master_id, m.alias,
           SUM(CAST(t.commission AS NUMERIC)) AS total_overdue,
           COUNT(*) AS tx_count
    FROM transactions t
    LEFT JOIN masters m ON m.id = t.master_id
    WHERE t.payment_status = 'overdue'
    GROUP BY t.master_id, m.alias
    ORDER BY total_overdue DESC
  `);
  res.json((rows.rows as any[]).map(r => ({
    masterId:     r.master_id,
    alias:        r.alias ?? "Неизвестен",
    totalOverdue: Number(r.total_overdue),
    count:        Number(r.tx_count),
  })));
});

// ─── GET /api/finance/master-stats ───────────────────────────────────────────

router.get("/master-stats", opsAndAdmin, async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from ? new Date(from as string) : null;
  const toDate   = to   ? new Date(to   as string) : null;

  let whereClause = sql`1=1`;
  if (fromDate) whereClause = sql`${whereClause} AND t.created_at >= ${fromDate.toISOString()}`;
  if (toDate)   whereClause = sql`${whereClause} AND t.created_at <= ${toDate.toISOString()}`;

  const rows = await db.execute(sql`
    SELECT t.master_id, t.commission, t.order_amount, t.prepayment_deducted,
           t.payment_status, t.paid_at,
           m.alias, m.city, m.phone
    FROM transactions t
    LEFT JOIN masters m ON m.id = t.master_id
    WHERE ${whereClause}
    ORDER BY t.created_at DESC
  `);

  type Agg = {
    masterId: number; alias: string; city: string; phone: string | null;
    orderCount: number; totalOrderAmount: number; totalCommission: number;
    paidCommission: number; pendingCommission: number; overdueCommission: number;
    paidCount: number; pendingCount: number; overdueCount: number;
    lastPaidAt: string | null; debtTotal: number;
  };

  const map = new Map<number, Agg>();
  for (const t of rows.rows as any[]) {
    const commission = Number(t.commission);
    const netPayable = Math.max(0, commission - Number(t.prepayment_deducted ?? 0));
    if (!map.has(t.master_id)) {
      map.set(t.master_id, {
        masterId: t.master_id, alias: t.alias ?? "Неизвестен",
        city: t.city ?? "—", phone: t.phone ?? null,
        orderCount: 0, totalOrderAmount: 0, totalCommission: 0,
        paidCommission: 0, pendingCommission: 0, overdueCommission: 0,
        paidCount: 0, pendingCount: 0, overdueCount: 0,
        lastPaidAt: null, debtTotal: 0,
      });
    }
    const a = map.get(t.master_id)!;
    a.orderCount++;
    a.totalOrderAmount += Number(t.order_amount);
    a.totalCommission  += commission;
    if (t.payment_status === "paid") {
      a.paidCommission += commission; a.paidCount++;
      if (!a.lastPaidAt || new Date(t.paid_at) > new Date(a.lastPaidAt)) a.lastPaidAt = t.paid_at;
    }
    if (t.payment_status === "pending") { a.pendingCommission += commission; a.pendingCount++; a.debtTotal += netPayable; }
    if (t.payment_status === "overdue") { a.overdueCommission += commission; a.overdueCount++; a.debtTotal += netPayable; }
  }

  const result = Array.from(map.values())
    .sort((a, b) => b.overdueCommission - a.overdueCommission || b.pendingCommission - a.pendingCommission);
  res.json(result);
});

// ─── GET /api/finance/estimates ──────────────────────────────────────────────

router.get("/estimates", opsAndAdmin, async (req, res) => {
  const { status, from, to, city, masterId, search } = req.query;
  const now = new Date();

  const rows = await db.execute(sql`
    SELECT r.id, r.token, r.order_id, r.master_id, r.client_name, r.client_phone,
           r.service_type, r.city, r.district, r.line_items, r.total_amount,
           r.prepayment_amount, r.notes, r.created_at,
           r.client_submitted_name, r.prepayment_submitted_at,
           r.prepayment_screenshot_url, r.prepayment_seen_at,
           m.alias AS master_alias
    FROM receipts r
    LEFT JOIN masters m ON m.id = r.master_id
    ORDER BY r.created_at DESC
  `);

  let list = rows.rows as any[];

  if (masterId) list = list.filter(r => r.master_id === parseInt(masterId as string));
  if (city)     list = list.filter(r => r.city === city);
  if (from)     list = list.filter(r => new Date(r.created_at) >= new Date(from as string));
  if (to)       list = list.filter(r => new Date(r.created_at) <= new Date(to as string));
  if (search) {
    const q = (search as string).toLowerCase();
    list = list.filter(r =>
      r.client_name?.toLowerCase().includes(q) ||
      r.client_phone?.includes(q) ||
      String(r.order_id).includes(q) ||
      String(r.id).includes(q)
    );
  }

  const mapped = list.map(r => {
    const totalAmount      = Number(r.total_amount);
    const prepaymentAmount = Number(r.prepayment_amount);
    const remainder        = Math.max(0, totalAmount - prepaymentAmount);
    const isPrepaymentPaid = !!r.prepayment_submitted_at;
    const hoursAgo         = r.created_at
      ? Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 3600_000)
      : 0;

    let estimateStatus: string;
    if (isPrepaymentPaid) estimateStatus = "paid";
    else if (hoursAgo > 72) estimateStatus = "unpaid";
    else estimateStatus = "pending";

    return {
      id:                     r.id,
      token:                  r.token,
      orderId:                r.order_id,
      masterId:               r.master_id,
      masterAlias:            r.master_alias ?? "Неизвестен",
      clientName:             r.client_name,
      clientPhone:            r.client_phone,
      serviceType:            r.service_type,
      city:                   r.city,
      district:               r.district ?? null,
      lineItems:              r.line_items ?? [],
      totalAmount,
      prepaymentAmount,
      remainder,
      notes:                  r.notes ?? null,
      createdAt:              r.created_at,
      clientSubmittedName:    r.client_submitted_name ?? null,
      prepaymentSubmittedAt:  r.prepayment_submitted_at ?? null,
      prepaymentScreenshotUrl: r.prepayment_screenshot_url ?? null,
      prepaymentSeenAt:       r.prepayment_seen_at ?? null,
      status:                 estimateStatus,
      hoursAgo,
    };
  });

  // Status filter after mapping (since status is derived)
  const finalList = status && status !== "all"
    ? mapped.filter(r => r.status === status)
    : mapped;

  res.json(finalList);
});

// ─── GET /api/finance/estimates/stats ────────────────────────────────────────

router.get("/estimates/stats", opsAndAdmin, async (req, res) => {
  const { from, to } = req.query;
  const now = new Date();

  const rows = await db.execute(sql`
    SELECT r.id, r.total_amount, r.prepayment_amount, r.service_type, r.city,
           r.created_at, r.prepayment_submitted_at
    FROM receipts r
    ORDER BY r.created_at ASC
  `);

  let list = rows.rows as any[];
  if (from) list = list.filter(r => new Date(r.created_at) >= new Date(from as string));
  if (to)   list = list.filter(r => new Date(r.created_at) <= new Date(to as string));

  const total     = list.length;
  const paid      = list.filter(r => !!r.prepayment_submitted_at);
  const pending   = list.filter(r => !r.prepayment_submitted_at && Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 3600_000) <= 72);
  const unpaid    = list.filter(r => !r.prepayment_submitted_at && Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 3600_000) > 72);
  const avgCheck  = total > 0 ? list.reduce((s, r) => s + Number(r.total_amount), 0) / total : 0;
  const paidSum   = paid.reduce((s, r) => s + Number(r.prepayment_amount), 0);
  const pendingSum = pending.reduce((s, r) => s + Number(r.prepayment_amount), 0);

  // Avg hours to payment for paid estimates
  const avgHours = paid.length > 0
    ? paid.reduce((s, r) => {
        const h = Math.floor((new Date(r.prepayment_submitted_at).getTime() - new Date(r.created_at).getTime()) / 3600_000);
        return s + h;
      }, 0) / paid.length
    : 0;

  // By service type
  const byService = new Map<string, { count: number; total: number }>();
  for (const r of list) {
    const key = r.service_type ?? "Прочее";
    const e = byService.get(key) ?? { count: 0, total: 0 };
    e.count++; e.total += Number(r.total_amount);
    byService.set(key, e);
  }

  // By city
  const byCity = new Map<string, number>();
  for (const r of list) {
    const city = r.city ?? "Не указан";
    const totals = list.filter(x => x.city === r.city).map(x => Number(x.total_amount));
    if (!byCity.has(city)) byCity.set(city, totals.reduce((s, v) => s + v, 0) / totals.length);
  }

  // Daily dynamics (last 30 days)
  const daily = new Map<string, { paid: number; unpaid: number }>();
  for (const r of list) {
    const day = new Date(r.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    const e = daily.get(day) ?? { paid: 0, unpaid: 0 };
    if (r.prepayment_submitted_at) e.paid++; else e.unpaid++;
    daily.set(day, e);
  }

  res.json({
    total, paidCount: paid.length, pendingCount: pending.length, unpaidCount: unpaid.length,
    paidSum, pendingSum, avgCheck, avgHours: Math.round(avgHours),
    conversionRate: total > 0 ? Math.round((paid.length / total) * 100) : 0,
    byService: Array.from(byService.entries()).map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total).slice(0, 8),
    byCity: Array.from(byCity.entries()).map(([city, avgAmount]) => ({ city, avgAmount: Math.round(avgAmount) }))
      .sort((a, b) => b.avgAmount - a.avgAmount),
    daily: Array.from(daily.entries()).map(([date, v]) => ({ date, ...v })),
  });
});

export default router;
