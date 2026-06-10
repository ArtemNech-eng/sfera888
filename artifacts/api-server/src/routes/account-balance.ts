import { Router } from "express";
import { db, masterWalletTable, serviceFeeTransactionsTable, balanceTopupRequestsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireMasterAuth } from "../middlewares/requireMaster.js";
import { getBalance } from "../lib/accountBalance.js";
import { getMasterById } from "../lib/masterQueries.js";

const router = Router();

// GET /api/account-balance/my — текущий баланс и кредитный лимит мастера
router.get("/my", requireMasterAuth, async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const balance = await getBalance(masterId);
  return res.json({
    balance: balance.balance,
    creditLimit: balance.creditLimit,
    available: balance.available,
    totalServiceFeesSpent: balance.totalServiceFeesSpent,
    totalTopups: balance.totalTopups,
  });
});

// GET /api/account-balance/my/service-fees — история сервисных сборов
router.get("/my/service-fees", requireMasterAuth, async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const rows = await db.select()
    .from(serviceFeeTransactionsTable)
    .where(eq(serviceFeeTransactionsTable.masterId, masterId))
    .orderBy(desc(serviceFeeTransactionsTable.createdAt))
    .limit(100);

  return res.json(rows.map(r => ({
    id: r.id,
    orderId: r.orderId,
    amount: Number(r.amount),
    type: r.type,
    reason: r.reason,
    createdAt: r.createdAt,
  })));
});

// GET /api/account-balance/my/topup-requests — история заявок на пополнение
router.get("/my/topup-requests", requireMasterAuth, async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const rows = await db.select()
    .from(balanceTopupRequestsTable)
    .where(eq(balanceTopupRequestsTable.masterId, masterId))
    .orderBy(desc(balanceTopupRequestsTable.createdAt))
    .limit(50);

  return res.json(rows.map(r => ({
    id: r.id,
    amount: Number(r.amount),
    status: r.status,
    note: r.note,
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
  })));
});

// POST /api/account-balance/my/topup-request — запрос на пополнение баланса (pending)
router.post("/my/topup-request", requireMasterAuth, async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const { amount, note } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Укажите сумму пополнения" });
  }

  const result = await db.insert(balanceTopupRequestsTable).values({
    masterId,
    amount: String(amount),
    status: "pending",
    note: note ? String(note).slice(0, 200) : null,
  }).returning();

  const requestRecord = result[0];

  // Notify admin via Max
  const master = await getMasterById(masterId);
  if (master?.maxChatId) {
    const { sendMaxMessage } = await import("../lib/maxBot.js");
    sendMaxMessage(master.maxChatId, `💰 Запрос пополнения баланса от ${master.alias}: ${Number(amount).toLocaleString("ru-RU")} ₽`).catch(() => {});
  }

  return res.json({ success: true, requestId: requestRecord.id, status: "pending" });
});

export default router;
