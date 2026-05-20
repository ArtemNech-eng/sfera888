import { db, masterWalletTable, walletTransactionsTable, serviceTokenPricesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";

// ─── Ensure wallet row exists ─────────────────────────────────────────────────

export async function ensureWallet(masterId: number) {
  const existing = await db
    .select()
    .from(masterWalletTable)
    .where(eq(masterWalletTable.masterId, masterId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [inserted] = await db
    .insert(masterWalletTable)
    .values({ masterId })
    .returning();
  return inserted;
}

// ─── Get token cost for an order by serviceType ───────────────────────────────

export async function getOrderTokenCost(serviceType: string): Promise<number> {
  const allPrices = await db
    .select()
    .from(serviceTokenPricesTable)
    .where(eq(serviceTokenPricesTable.isActive, true));

  if (allPrices.length === 0) return 1;

  // Normalize serviceType to match service_key
  const svcLower = serviceType.toLowerCase().trim();

  // Try exact match on service_key first
  let match = allPrices.find(p => p.serviceKey === svcLower);

  // Try partial match on service_name
  if (!match) {
    match = allPrices.find(p =>
      svcLower.includes(p.serviceKey) || p.serviceName.toLowerCase().includes(svcLower)
    );
  }

  // Mapping of common Russian service names to keys
  if (!match) {
    const keyMap: Record<string, string> = {
      обои: "oboi", обоев: "oboi", обоями: "oboi", поклейка: "oboi",
      шпаклёвка: "shpaklevka", шпаклевка: "shpaklevka", штукатурка: "shpaklevka",
      покраска: "pokraska", покраске: "pokraska", покрасить: "pokraska",
      плитка: "plitka", плиткой: "plitka", укладка: "plitka",
      санузел: "sanuzul", ванная: "sanuzul", туалет: "sanuzul",
      ремонт: "remont", квартиры: "remont", комплексный: "remont",
    };
    for (const [keyword, key] of Object.entries(keyMap)) {
      if (svcLower.includes(keyword)) {
        match = allPrices.find(p => p.serviceKey === key);
        if (match) break;
      }
    }
  }

  // Fallback to "other"
  if (!match) {
    match = allPrices.find(p => p.serviceKey === "other");
  }

  return match ? Number(match.tokensCost) : 1;
}

// ─── Check if master has enough tokens ───────────────────────────────────────

export async function checkTokenBalance(masterId: number, required: number): Promise<{
  ok: boolean;
  balance: number;
  shortfall: number;
}> {
  const wallet = await ensureWallet(masterId);
  const balance = Number(wallet.tokensBalance);
  const ok = balance >= required;
  return { ok, balance, shortfall: ok ? 0 : required - balance };
}

// ─── Deduct tokens atomically ─────────────────────────────────────────────────

export async function deductTokens(params: {
  masterId: number;
  orderId: number;
  tokensCost: number;
  serviceType: string;
}): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const { masterId, orderId, tokensCost, serviceType } = params;

  const wallet = await ensureWallet(masterId);
  const currentBalance = Number(wallet.tokensBalance);

  if (currentBalance < tokensCost) {
    return {
      success: false,
      newBalance: currentBalance,
      error: `Недостаточно токенов. Баланс: ${currentBalance} т., требуется: ${tokensCost} т.`,
    };
  }

  const newBalance = currentBalance - tokensCost;

  // Calculate how many credit tokens are being spent
  const creditTokensIssued = Number((wallet as any).creditTokensIssued ?? 0);
  const creditTokensSpent = Number((wallet as any).creditTokensSpent ?? 0);
  const creditSpent = Math.min(tokensCost, creditTokensIssued - creditTokensSpent);

  const updateFields: any = {
    tokensBalance: String(newBalance),
    totalTokensSpent: String(Number(wallet.totalTokensSpent) + tokensCost),
    updatedAt: new Date(),
  };

  if (creditSpent > 0) {
    updateFields.creditTokensSpent = String(creditTokensSpent + creditSpent);
  }

  const [updated] = await db
    .update(masterWalletTable)
    .set(updateFields)
    .where(eq(masterWalletTable.masterId, masterId))
    .returning();

  await db.insert(walletTransactionsTable).values({
    masterId,
    type: "spend",
    tokensAmount: String(-tokensCost),
    orderId,
    reason: `Оплата заказа #${orderId} (${serviceType})`,
    createdBy: "system",
    status: "completed",
  });

  return { success: true, newBalance: Number(updated.tokensBalance) };
}

// ─── Deduct tokens for a landing lead (no orderId) ───────────────────────────

export async function deductTokensForLead(params: {
  masterId: number;
  leadId: number;
  tokensCost: number;
  serviceType: string;
}): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const { masterId, leadId, tokensCost, serviceType } = params;

  const wallet = await ensureWallet(masterId);
  const currentBalance = Number(wallet.tokensBalance);

  if (currentBalance < tokensCost) {
    return {
      success: false,
      newBalance: currentBalance,
      error: `Недостаточно токенов. Баланс: ${currentBalance} т., требуется: ${tokensCost} т.`,
    };
  }

  const newBalance = currentBalance - tokensCost;

  const creditTokensIssued = Number((wallet as any).creditTokensIssued ?? 0);
  const creditTokensSpent = Number((wallet as any).creditTokensSpent ?? 0);
  const creditSpent = Math.min(tokensCost, creditTokensIssued - creditTokensSpent);

  const updateFields: any = {
    tokensBalance: String(newBalance),
    totalTokensSpent: String(Number(wallet.totalTokensSpent) + tokensCost),
    updatedAt: new Date(),
  };

  if (creditSpent > 0) {
    updateFields.creditTokensSpent = String(creditTokensSpent + creditSpent);
  }

  const [updated] = await db
    .update(masterWalletTable)
    .set(updateFields)
    .where(eq(masterWalletTable.masterId, masterId))
    .returning();

  await db.insert(walletTransactionsTable).values({
    masterId,
    type: "spend",
    tokensAmount: String(-tokensCost),
    orderId: null,
    reason: `Открытие контакта по заявке #${leadId} (${serviceType})`,
    createdBy: "system",
    status: "completed",
  });

  return { success: true, newBalance: Number(updated.tokensBalance) };
}

// ─── Refund tokens ────────────────────────────────────────────────────────────

export async function refundTokens(params: {
  masterId: number;
  orderId: number;
  tokensCost: number;
  reason: string;
  transactionId: number;
}): Promise<void> {
  const { masterId, orderId, tokensCost, reason, transactionId } = params;

  const wallet = await ensureWallet(masterId);

  await db
    .update(masterWalletTable)
    .set({
      tokensBalance: String(Number(wallet.tokensBalance) + tokensCost),
      totalTokensRefunded: String(Number(wallet.totalTokensRefunded) + tokensCost),
      updatedAt: new Date(),
    })
    .where(eq(masterWalletTable.masterId, masterId));

  await db
    .update(walletTransactionsTable)
    .set({ status: "completed" })
    .where(eq(walletTransactionsTable.id, transactionId));
}
