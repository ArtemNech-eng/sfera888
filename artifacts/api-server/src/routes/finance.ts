import { Router } from "express";
import { db, transactionsTable, mastersTable, voronkaColumnsTable } from "@workspace/db";
import { eq, and, gte, lte, sum, count } from "drizzle-orm";
import { requirePermission } from "../middlewares/requireAuth.js";
import { sendPushToMaster } from "../lib/push.js";
import { checkOverdueTransactions, countActiveMasterOrders, getColumnIdForActiveCount } from "../lib/orderEligibility.js";

const router = Router();
const adminOnly = requirePermission("finance");
const opsAndAdmin = requirePermission("finance");

router.get("/transactions", opsAndAdmin, async (req, res) => {
  const { masterId, status, from, to } = req.query;

  let rows = await db.select().from(transactionsTable).orderBy(transactionsTable.createdAt);
  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

  let filtered = rows;
  if (masterId) filtered = filtered.filter(t => t.masterId === parseInt(masterId as string));
  if (status) filtered = filtered.filter(t => t.paymentStatus === status);
  if (from) filtered = filtered.filter(t => t.createdAt >= new Date(from as string));
  if (to) filtered = filtered.filter(t => t.createdAt <= new Date(to as string));

  res.json(filtered.map(t => {
    const prepaymentDeducted = Number(t.prepaymentDeducted ?? 0);
    return {
      id: t.id,
      orderId: t.orderId,
      masterId: t.masterId,
      masterAlias: masterMap.get(t.masterId)?.alias ?? "Неизвестен",
      orderAmount: Number(t.orderAmount),
      commission: Number(t.commission),
      prepaymentDeducted,
      netPayable: Math.max(0, Number(t.commission) - prepaymentDeducted),
      paymentStatus: t.paymentStatus,
      createdAt: t.createdAt,
      paidAt: t.paidAt ?? null,
    };
  }));
});

router.patch("/transactions/:id", opsAndAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { paymentStatus, commission } = req.body;
  const updates: any = {};
  if (paymentStatus !== undefined) {
    updates.paymentStatus = paymentStatus;
    if (paymentStatus === "paid") updates.paidAt = new Date();
  }
  if (commission !== undefined) updates.commission = String(commission);

  const result = await db.update(transactionsTable).set(updates).where(eq(transactionsTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Transaction not found" });
  const t = result[0];

  // When paid: reduce debt by net payable (commission minus prepayment already applied)
  if (paymentStatus === "paid") {
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, t.masterId));
    const master = masterRows[0];
    if (master) {
      const prepaymentDeducted = Number(t.prepaymentDeducted ?? 0);
      const netPayable = Math.max(0, Number(t.commission) - prepaymentDeducted);
      const newDebt = Math.max(0, Number(master.debt) - netPayable);

      // Move master to correct column based on their remaining active orders
      const activeCount = await countActiveMasterOrders(t.masterId);
      const targetColId = await getColumnIdForActiveCount(activeCount);

      await db.update(mastersTable).set({
        debt: String(newDebt),
        isTestMaster: false,
        ...(targetColId ? { voronkaColumnId: targetColId } : {}),
      }).where(eq(mastersTable.id, t.masterId));

      // Push notification (PWA)
      const paidLabel = netPayable > 0
        ? `${netPayable.toLocaleString("ru-RU")} ₽`
        : `${Number(t.commission).toLocaleString("ru-RU")} ₽ (через предоплату)`;
      const pushMsg = newDebt > 0
        ? `Оплачено ${paidLabel}. Остаток долга: ${newDebt.toLocaleString("ru-RU")} ₽`
        : `Оплачено ${paidLabel}. Долг погашен, заказы снова доступны!`;
      sendPushToMaster(t.masterId, {
        title: "✅ Оплата принята",
        body: pushMsg,
        url: "/balance",
      }).catch(() => {});

      // Telegram notification
      if (master.telegramId) {
        const TELEGRAM_API = `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}`;
        const prepayLine = prepaymentDeducted > 0
          ? `✅ Зачтена предоплата: <b>${prepaymentDeducted.toLocaleString("ru-RU")} ₽</b>\n` : "";
        const msgText = newDebt > 0
          ? `✅ <b>Оплата принята!</b>\n\n` +
            (netPayable > 0 ? `💳 Оплачено: <b>${netPayable.toLocaleString("ru-RU")} ₽</b>\n` : "") +
            prepayLine +
            `⚠️ Остаток долга: <b>${newDebt.toLocaleString("ru-RU")} ₽</b>\n\n` +
            `Погасите оставшийся долг, чтобы получить полный доступ к заказам.`
          : `✅ <b>Оплата принята! Спасибо!</b>\n\n` +
            (netPayable > 0 ? `💳 Оплачено: <b>${netPayable.toLocaleString("ru-RU")} ₽</b>\n` : "") +
            prepayLine +
            `\n🟢 Долг погашен. Вы снова можете принимать заказы!`;
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: master.telegramId, text: msgText, parse_mode: "HTML" }),
        }).catch(() => {});
      }
    }
  }

  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

  const prepaymentDeducted = Number(t.prepaymentDeducted ?? 0);
  res.json({
    id: t.id,
    orderId: t.orderId,
    masterId: t.masterId,
    masterAlias: masterMap.get(t.masterId)?.alias ?? "Неизвестен",
    orderAmount: Number(t.orderAmount),
    commission: Number(t.commission),
    prepaymentDeducted,
    netPayable: Math.max(0, Number(t.commission) - prepaymentDeducted),
    paymentStatus: t.paymentStatus,
    createdAt: t.createdAt,
    paidAt: t.paidAt ?? null,
  });
});

router.get("/summary", opsAndAdmin, async (req, res) => {
  const transactions = await db.select().from(transactionsTable);
  const totalIncome = transactions.filter(t => t.paymentStatus === "paid").reduce((s, t) => s + Number(t.commission), 0);
  const totalDebt = transactions.filter(t => t.paymentStatus !== "paid").reduce((s, t) => {
    const netPayable = Math.max(0, Number(t.commission) - Number(t.prepaymentDeducted ?? 0));
    return s + netPayable;
  }, 0);
  const paidCount = transactions.filter(t => t.paymentStatus === "paid").length;
  const pendingCount = transactions.filter(t => t.paymentStatus === "pending").length;
  const overdueCount = transactions.filter(t => t.paymentStatus === "overdue").length;

  res.json({ totalIncome, totalDebt, paidCount, pendingCount, overdueCount });
});

// POST /api/finance/check-overdue — manually trigger overdue detection
router.post("/check-overdue", requirePermission("finance"), async (req, res) => {
  const daysParam = parseInt((req.query.days as string) ?? "7");
  const days = isNaN(daysParam) || daysParam < 1 ? 7 : daysParam;
  const marked = await checkOverdueTransactions(days);
  res.json({ marked, message: `Отмечено просрочено: ${marked}` });
});

// GET /api/finance/overdue-masters — list masters with overdue transactions
router.get("/overdue-masters", requirePermission("finance"), async (req, res) => {
  const overdue = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.paymentStatus, "overdue"));

  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

  const byMaster = new Map<number, { masterId: number; alias: string; totalOverdue: number; count: number }>();
  for (const t of overdue) {
    const existing = byMaster.get(t.masterId);
    if (existing) {
      existing.totalOverdue += Number(t.commission);
      existing.count++;
    } else {
      byMaster.set(t.masterId, {
        masterId: t.masterId,
        alias: masterMap.get(t.masterId)?.alias ?? "Неизвестен",
        totalOverdue: Number(t.commission),
        count: 1,
      });
    }
  }

  res.json(Array.from(byMaster.values()).sort((a, b) => b.totalOverdue - a.totalOverdue));
});

// GET /api/finance/master-stats?from=ISO&to=ISO
// Returns per-master revenue aggregation for the given date range.
// "from" and "to" are inclusive ISO datetime strings (optional).
router.get("/master-stats", opsAndAdmin, async (req, res) => {
  const { from, to } = req.query;

  const allTx = await db.select().from(transactionsTable);
  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

  const fromDate = from ? new Date(from as string) : null;
  const toDate   = to   ? new Date(to   as string) : null;

  const filtered = allTx.filter(t => {
    const ts = t.createdAt;
    if (fromDate && ts < fromDate) return false;
    if (toDate   && ts > toDate)   return false;
    return true;
  });

  type Agg = {
    masterId: number;
    alias: string;
    city: string;
    phone: string | null;
    orderCount: number;
    totalOrderAmount: number;
    totalCommission: number;
    paidCommission: number;
    pendingCommission: number;
    overdueCommission: number;
    paidCount: number;
    pendingCount: number;
    overdueCount: number;
  };

  const map = new Map<number, Agg>();
  for (const t of filtered) {
    const m = masterMap.get(t.masterId);
    if (!map.has(t.masterId)) {
      map.set(t.masterId, {
        masterId:         t.masterId,
        alias:            m?.alias ?? "Неизвестен",
        city:             m?.city  ?? "—",
        phone:            m?.phone ?? null,
        orderCount:       0,
        totalOrderAmount: 0,
        totalCommission:  0,
        paidCommission:   0,
        pendingCommission:0,
        overdueCommission:0,
        paidCount:        0,
        pendingCount:     0,
        overdueCount:     0,
      });
    }
    const a = map.get(t.masterId)!;
    a.orderCount++;
    a.totalOrderAmount += Number(t.orderAmount);
    a.totalCommission  += Number(t.commission);
    if (t.paymentStatus === "paid")    { a.paidCommission    += Number(t.commission); a.paidCount++;    }
    if (t.paymentStatus === "pending") { a.pendingCommission += Number(t.commission); a.pendingCount++; }
    if (t.paymentStatus === "overdue") { a.overdueCommission += Number(t.commission); a.overdueCount++; }
  }

  const result = Array.from(map.values()).sort((a, b) => b.paidCommission - a.paidCommission);
  res.json(result);
});

export default router;
