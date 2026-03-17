import { Router } from "express";
import { db, transactionsTable, mastersTable, voronkaColumnsTable } from "@workspace/db";
import { eq, and, gte, lte, sum, count } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const adminOnly = requireRole("admin");
const opsAndAdmin = requireRole("admin", "master_operator", "lead_operator");

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

  res.json(filtered.map(t => ({
    id: t.id,
    orderId: t.orderId,
    masterId: t.masterId,
    masterAlias: masterMap.get(t.masterId)?.alias ?? "Неизвестен",
    orderAmount: Number(t.orderAmount),
    commission: Number(t.commission),
    paymentStatus: t.paymentStatus,
    createdAt: t.createdAt,
    paidAt: t.paidAt ?? null,
  })));
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

  // When paid: reduce debt, move master to "Свободен", notify via Telegram
  if (paymentStatus === "paid") {
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, t.masterId));
    const master = masterRows[0];
    if (master) {
      const newDebt = Math.max(0, Number(master.debt) - Number(t.commission));

      // Find "Свободен" column (receivesOrders = true)
      const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
      const freeCol = cols.find(c => c.receivesOrders) ?? null;

      await db.update(mastersTable).set({
        debt: String(newDebt),
        isTestMaster: false,
        ...(freeCol ? { voronkaColumnId: freeCol.id } : {}),
      }).where(eq(mastersTable.id, t.masterId));

      // Telegram notification
      if (master.telegramId) {
        const TELEGRAM_API = `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}`;
        const msgText = newDebt > 0
          ? `✅ <b>Оплата принята!</b>\n\n` +
            `💳 Оплачено: <b>${Number(t.commission).toLocaleString("ru-RU")} ₽</b>\n` +
            `⚠️ Остаток долга: <b>${newDebt.toLocaleString("ru-RU")} ₽</b>\n\n` +
            `Погасите оставшийся долг, чтобы получить полный доступ к заказам.`
          : `✅ <b>Оплата принята! Спасибо!</b>\n\n` +
            `💳 Комиссия: <b>${Number(t.commission).toLocaleString("ru-RU")} ₽</b>\n\n` +
            `🟢 Долг погашен. Вы снова можете принимать заказы!`;
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

  res.json({
    id: t.id,
    orderId: t.orderId,
    masterId: t.masterId,
    masterAlias: masterMap.get(t.masterId)?.alias ?? "Неизвестен",
    orderAmount: Number(t.orderAmount),
    commission: Number(t.commission),
    paymentStatus: t.paymentStatus,
    createdAt: t.createdAt,
    paidAt: t.paidAt ?? null,
  });
});

router.get("/summary", opsAndAdmin, async (req, res) => {
  const transactions = await db.select().from(transactionsTable);
  const totalIncome = transactions.filter(t => t.paymentStatus === "paid").reduce((s, t) => s + Number(t.commission), 0);
  const totalDebt = transactions.filter(t => t.paymentStatus !== "paid").reduce((s, t) => s + Number(t.commission), 0);
  const paidCount = transactions.filter(t => t.paymentStatus === "paid").length;
  const pendingCount = transactions.filter(t => t.paymentStatus === "pending").length;
  const overdueCount = transactions.filter(t => t.paymentStatus === "overdue").length;

  res.json({ totalIncome, totalDebt, paidCount, pendingCount, overdueCount });
});

export default router;
