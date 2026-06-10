import { db, masterWalletTable, serviceFeeTransactionsTable, masterTestOrdersTable } from "@workspace/db";
import { eq, and, sql, count } from "drizzle-orm";

const SERVICE_FEE_AMOUNT = 500;
const FREE_TEST_ORDERS_LIMIT = 2;

export interface BalanceInfo {
  balance: number;
  creditLimit: number;
  available: number;
  totalServiceFeesSpent: number;
  totalTopups: number;
}

export async function ensureAccountBalance(masterId: number) {
  const [existing] = await db.select().from(masterWalletTable).where(eq(masterWalletTable.masterId, masterId));
  if (existing) return existing;

  const [created] = await db.insert(masterWalletTable).values({
    masterId,
    balance: "0",
    creditLimit: "0",
    totalServiceFeesSpent: "0",
    totalTopups: "0",
  }).returning();
  return created;
}

export async function getBalance(masterId: number): Promise<BalanceInfo> {
  const wallet = await ensureAccountBalance(masterId);
  const balance = Number(wallet.balance ?? 0);
  const creditLimit = Number(wallet.creditLimit ?? 0);
  return {
    balance,
    creditLimit,
    available: balance + creditLimit,
    totalServiceFeesSpent: Number(wallet.totalServiceFeesSpent ?? 0),
    totalTopups: Number(wallet.totalTopups ?? 0),
  };
}

export async function countTestOrders(masterId: number): Promise<number> {
  const [result] = await db.select({ count: count() }).from(masterTestOrdersTable)
    .where(eq(masterTestOrdersTable.masterId, masterId));
  return result?.count ?? 0;
}

export async function isTestOrderEligible(masterId: number): Promise<boolean> {
  const testCount = await countTestOrders(masterId);
  return testCount < FREE_TEST_ORDERS_LIMIT;
}

export async function canAffordServiceFee(masterId: number): Promise<boolean> {
  const { available } = await getBalance(masterId);
  return available >= SERVICE_FEE_AMOUNT;
}

export interface DeductServiceFeeResult {
  success: boolean;
  waived: boolean;
  newBalance: number;
  transactionId?: number;
  error?: string;
}

export async function deductServiceFee(
  masterId: number,
  orderId: number,
  opts?: { isTest?: boolean; reason?: string },
): Promise<DeductServiceFeeResult> {
  // Check if test order (waived)
  const isTest = opts?.isTest ?? false;
  if (isTest) {
    const tx = await db.insert(serviceFeeTransactionsTable).values({
      masterId,
      orderId,
      amount: String(SERVICE_FEE_AMOUNT),
      type: "test_waived",
      reason: opts?.reason || "Free test order",
    }).returning();

    return {
      success: true,
      waived: true,
      newBalance: (await getBalance(masterId)).balance,
      transactionId: tx[0].id,
    };
  }

  // Check balance
  const { available, balance } = await getBalance(masterId);
  if (available < SERVICE_FEE_AMOUNT) {
    return {
      success: false,
      waived: false,
      newBalance: balance,
      error: `Недостаточно средств. Требуется ${SERVICE_FEE_AMOUNT} ₽ (баланс: ${balance} ₽)`,
    };
  }

  // Deduct from balance
  const newBalance = balance - SERVICE_FEE_AMOUNT;
  await db.update(masterWalletTable)
    .set({
      balance: String(newBalance),
      totalServiceFeesSpent: sql`${masterWalletTable.totalServiceFeesSpent} + ${SERVICE_FEE_AMOUNT}`,
      updatedAt: new Date(),
    })
    .where(eq(masterWalletTable.masterId, masterId));

  const tx = await db.insert(serviceFeeTransactionsTable).values({
    masterId,
    orderId,
    amount: String(SERVICE_FEE_AMOUNT),
    type: "deduct",
    reason: opts?.reason || "Сервисный сбор за заказ",
  }).returning();

  return {
    success: true,
    waived: false,
    newBalance,
    transactionId: tx[0].id,
  };
}

export async function refundServiceFee(
  masterId: number,
  orderId: number,
  reason?: string,
): Promise<{ success: boolean; newBalance: number }> {
  const { balance } = await getBalance(masterId);
  const newBalance = balance + SERVICE_FEE_AMOUNT;

  await db.update(masterWalletTable)
    .set({
      balance: String(newBalance),
      totalServiceFeesSpent: sql`${masterWalletTable.totalServiceFeesSpent} - ${SERVICE_FEE_AMOUNT}`,
      updatedAt: new Date(),
    })
    .where(eq(masterWalletTable.masterId, masterId));

  await db.insert(serviceFeeTransactionsTable).values({
    masterId,
    orderId,
    amount: String(SERVICE_FEE_AMOUNT),
    type: "refund",
    reason: reason || "Возврат сервисного сбора",
  });

  return { success: true, newBalance };
}

export async function topupBalance(
  masterId: number,
  amount: number,
  reason?: string,
): Promise<{ success: boolean; newBalance: number }> {
  const { balance } = await getBalance(masterId);
  const newBalance = balance + amount;

  await db.update(masterWalletTable)
    .set({
      balance: String(newBalance),
      totalTopups: sql`${masterWalletTable.totalTopups} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(masterWalletTable.masterId, masterId));

  return { success: true, newBalance };
}

export async function setCreditLimit(masterId: number, limit: number) {
  await db.update(masterWalletTable)
    .set({ creditLimit: String(limit), updatedAt: new Date() })
    .where(eq(masterWalletTable.masterId, masterId));
}
