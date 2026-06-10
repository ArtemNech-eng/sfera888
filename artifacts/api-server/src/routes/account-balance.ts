import { Router } from "express";
import { db, masterWalletTable, serviceFeeTransactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireMasterAuth } from "../middlewares/requireMaster.js";
import { getBalance, topupBalance } from "../lib/accountBalance.js";

const router = Router();

// GET /api/account-balance/my — текущий баланс и кредитный лимит мастера
router.get("/my", requireMasterAuth, async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const balance = await getBalance(masterId);
  return res.json({
    balance: balance.balance,
    credit_limit: balance.creditLimit,
    available: balance.available,
    total_service_fees_spent: balance.totalServiceFeesSpent,
    total_topups: balance.totalTopups,
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

// POST /api/account-balance/my/topup-request — запрос на пополнение баланса
router.post("/my/topup-request", requireMasterAuth, async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const { amount } = req.body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Укажите сумму пополнения" });
  }

  // For now: auto-approve topup (admin can change to pending later)
  const result = await topupBalance(masterId, Number(amount), "Пополнение баланса");
  return res.json({ success: true, newBalance: result.newBalance });
});

export default router;
