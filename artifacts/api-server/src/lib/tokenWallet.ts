// DEPRECATED: token system removed. This file is kept for reference only.
// Use lib/accountBalance.ts for the new ruble-based commission model.

import { db, masterWalletTable, walletTransactionsTable, serviceTokenPricesTable, serviceTokenRulesTable, cityTokenMultipliersTable, tokenAuditLogTable } from "@workspace/db";
import { eq, and, sql, isNull } from "drizzle-orm";

// ─── Typed errors for token-wallet operations ───────────────────────────────

export class TokenWalletError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "TokenWalletError";
  }
}

export const ERR_INSUFFICIENT_TOKENS = "INSUFFICIENT_TOKENS";
export const ERR_ORDER_ALREADY_TAKEN = "ORDER_ALREADY_TAKEN";

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
    .values({ masterId, creditLimitTokens: "5" })
    .returning();
  return inserted;
}

// ─── Resolve service key from raw serviceType string ──────────────────────────

function resolveServiceKey(serviceType: string): string {
  const svcLower = serviceType.toLowerCase().trim();

  const keyMap: Record<string, string> = {
    обои: "oboi", обоев: "oboi", обоями: "oboi", поклейка: "oboi",
    шпаклёвка: "shpaklevka", шпаклевка: "shpaklevka",
    штукатурка: "shtukaturka", штукатурки: "shtukaturka",
    покраска: "pokraska", покраске: "pokraska", покрасить: "pokraska",
    плитка: "plitka", плиткой: "plitka", укладка: "plitka",
    санузел: "sanuzul", ванная: "sanuzul", туалет: "sanuzul",
    ремонт: "remont", квартиры: "remont", комплексный: "remont",
  };

  for (const [keyword, key] of Object.entries(keyMap)) {
    if (svcLower.includes(keyword)) return key;
  }

  // Try exact or partial
  if (["oboi","shpaklevka","pokraska","plitka","sanuzul","remont","other"].includes(svcLower)) {
    return svcLower;
  }

  return "other";
}

// ─── Get token cost for an order with area-based pricing ──────────────────────

export async function getOrderTokenCost(order: {
  serviceType: string;
  area?: number | null;
  manualTokenCost?: number | null;
  city?: string | null;
}): Promise<{ cost: number; explanation: string }> {
  const { serviceType, area, manualTokenCost, city } = order;

  // 1. Manual override
  if (manualTokenCost != null && !isNaN(manualTokenCost)) {
    return { cost: manualTokenCost, explanation: "Стоимость установлена вручную" };
  }

  const serviceKey = resolveServiceKey(serviceType);

  // 2. Load all active rules for this service
  const rules = await db
    .select()
    .from(serviceTokenRulesTable)
    .where(and(
      eq(serviceTokenRulesTable.serviceKey, serviceKey),
      eq(serviceTokenRulesTable.isActive, true)
    ))
    .orderBy(serviceTokenRulesTable.sortOrder);

  if (rules.length === 0) {
    // 5. Fallback to legacy flat prices or 1
    const legacy = await db
      .select()
      .from(serviceTokenPricesTable)
      .where(eq(serviceTokenPricesTable.serviceKey, serviceKey))
      .limit(1);
    const baseCost = legacy.length ? Number(legacy[0].tokensCost) : 1;
    const { cost, multiplier } = await applyCityMultiplier(baseCost, city);
    const cityNote = multiplier !== 1 ? ` × ${multiplier} (город)` : "";
    return { cost, explanation: `${serviceType} → стандартная стоимость${cityNote}` };
  }

  // Separate area_range and fixed rules
  const areaRules = rules.filter(r => r.calcType === "area_range");
  const fixedRules = rules.filter(r => r.calcType === "fixed");

  // 3. Area-range match
  if (area != null && !isNaN(area) && areaRules.length > 0) {
    const match = areaRules.find(r => {
      const min = r.minArea != null ? Number(r.minArea) : -Infinity;
      const max = r.maxArea != null ? Number(r.maxArea) : Infinity;
      return area >= min && (max === Infinity || area < max);
    });
    if (match) {
      const minLabel = match.minArea != null ? `${match.minArea}` : "0";
      const maxLabel = match.maxArea != null ? `${match.maxArea}` : "∞";
      const base = Number(match.tokensCost);
      const { cost, multiplier } = await applyCityMultiplier(base, city);
      const cityNote = multiplier !== 1 ? ` × ${multiplier} (город)` : "";
      return {
        cost,
        explanation: `${serviceType}, ${area} м² → диапазон ${minLabel}–${maxLabel} м²${cityNote}`,
      };
    }
  }

  // 4. Fixed rule fallback for this service
  if (fixedRules.length > 0) {
    const base = Number(fixedRules[0].tokensCost);
    const { cost, multiplier } = await applyCityMultiplier(base, city);
    const cityNote = multiplier !== 1 ? ` × ${multiplier} (город)` : "";
    return {
      cost,
      explanation: `${serviceType} → фиксированная стоимость${cityNote}`,
    };
  }

  // 5. Absolute fallback — все заказы по умолчанию 2 токена
  const { cost: fallbackCost, multiplier: fallbackMult } = await applyCityMultiplier(2, city);
  const fallbackNote = fallbackMult !== 1 ? ` × ${fallbackMult} (город)` : "";
  return { cost: fallbackCost, explanation: `${serviceType} → стандартная стоимость${fallbackNote}` };
}

async function applyCityMultiplier(baseCost: number, city: string | null | undefined): Promise<{ cost: number; multiplier: number }> {
  if (!city) return { cost: baseCost, multiplier: 1 };
  const [row] = await db
    .select()
    .from(cityTokenMultipliersTable)
    .where(and(
      eq(cityTokenMultipliersTable.city, city),
      eq(cityTokenMultipliersTable.isActive, true)
    ))
    .limit(1);
  if (!row) return { cost: baseCost, multiplier: 1 };
  const multiplier = Number(row.multiplier);
  return { cost: Math.round(baseCost * multiplier * 100) / 100, multiplier };
}

// ─── Check if master has enough tokens ───────────────────────────────────────

export async function checkTokenBalance(masterId: number, required: number): Promise<{
  ok: boolean;
  balance: number;
  creditLimit: number;
  available: number;
  shortfall: number;
  error?: string;
}> {
  const wallet = await ensureWallet(masterId);
  const balance = Number(wallet.tokensBalance);
  const creditLimit = Math.max(
    Number(wallet.creditLimitTokens ?? 0),
    Number((wallet as any).creditTokensIssued ?? 0)
  );
  const available = balance + creditLimit;
  const ok = available >= required;
  const shortfall = ok ? 0 : required - available;
  const error = ok
    ? undefined
    : `Недостаточно токенов. Баланс: ${balance} т., доступно с кредитом: ${available} т., требуется: ${required} т.`;
  return { ok, balance, creditLimit, available, shortfall, error };
}

// ─── Deduct tokens atomically (balance-based, tx-safe) ────────────────────────

// Internal: tx-accepting version. Caller must wrap in db.transaction.
export async function deductTokensTx(
  tx: any,
  params: {
    masterId: number;
    orderId: number | null;
    tokensCost: number;
    serviceType: string;
  }
): Promise<{ success: true } | { success: false; error: TokenWalletError }> {
  const { masterId, orderId, tokensCost, serviceType } = params;

  // Read wallet with row lock via FOR UPDATE
  const walletRows = await tx.execute(sql`
    SELECT * FROM master_wallet WHERE master_id = ${masterId} FOR UPDATE
  `);
  const walletRow = walletRows.rows[0];
  if (!walletRow) {
    return {
      success: false,
      error: new TokenWalletError(
        ERR_INSUFFICIENT_TOKENS,
        "Кошелёк мастера не найден"
      ),
    };
  }

  const currentBalance = Number(walletRow.tokens_balance);
  const creditLimit = Math.max(
    Number(walletRow.credit_limit_tokens ?? 0),
    Number(walletRow.credit_tokens_issued ?? 0)
  );
  const newBalance = currentBalance - tokensCost;

  // Gate: balance must stay above negative credit limit
  if (newBalance < -creditLimit) {
    return {
      success: false,
      error: new TokenWalletError(
        ERR_INSUFFICIENT_TOKENS,
        `Недостаточно токенов. Баланс: ${currentBalance} т., требуется: ${tokensCost} т.`
      ),
    };
  }

  // creditTokensSpent tracks how much of the issued credit has been used
  const creditTokensIssued = Number(walletRow.credit_tokens_issued ?? 0);
  const creditTokensSpent = newBalance < 0 ? Math.min(creditTokensIssued, -newBalance) : 0;

  await tx.execute(sql`
    UPDATE master_wallet
    SET tokens_balance = ${String(newBalance)},
        total_tokens_spent = ${String(Number(walletRow.total_tokens_spent) + tokensCost)},
        credit_tokens_spent = ${String(creditTokensSpent)},
        updated_at = NOW()
    WHERE master_id = ${masterId}
  `);

  // Prevent duplicate spend record for same (master, order) — unique index guards this
  const existingSpend = await tx.select().from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.masterId, masterId),
      orderId != null ? eq(walletTransactionsTable.orderId, orderId) : isNull(walletTransactionsTable.orderId),
      eq(walletTransactionsTable.type, "spend"),
    ))
    .limit(1);

  if (existingSpend.length === 0) {
    await tx.insert(walletTransactionsTable).values({
    masterId,
    type: "spend",
    tokensAmount: String(-tokensCost),
    orderId,
    reason: orderId
      ? `Оплата заказа #${orderId} (${serviceType})`
      : `Открытие контакта по заявке (${serviceType})`,
    createdBy: "system",
    status: "completed",
  });
  }

  await tx.insert(tokenAuditLogTable).values({
    masterId,
    orderId,
    type: "deduct",
    tokensAmount: String(-tokensCost),
    balanceBefore: String(currentBalance),
    balanceAfter: String(newBalance),
    reason: orderId
      ? `Оплата заказа #${orderId} (${serviceType})`
      : `Открытие контакта по заявке (${serviceType})`,
    createdBy: "system",
  });

  return { success: true };
}

// Wrapper that opens its own transaction (for standalone / legacy use)
export async function deductTokens(params: {
  masterId: number;
  orderId: number;
  tokensCost: number;
  serviceType: string;
}): Promise<{ success: boolean; newBalance: number; error?: string | TokenWalletError }> {
  const { masterId, orderId, tokensCost, serviceType } = params;

  try {
    const result = await db.transaction(async (tx) =>
      deductTokensTx(tx, { masterId, orderId, tokensCost, serviceType })
    );
    if (!result.success) {
      return { success: false, newBalance: 0, error: result.error };
    }
    const wallet = await ensureWallet(masterId);
    return { success: true, newBalance: Number(wallet.tokensBalance) };
  } catch (e: any) {
    return { success: false, newBalance: 0, error: e.message ?? String(e) };
  }
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
  const newBalance = Number(wallet.tokensBalance) + tokensCost;
  const creditTokensIssued = Number((wallet as any).creditTokensIssued ?? 0);
  const creditTokensSpent = newBalance < 0 ? Math.min(creditTokensIssued, -newBalance) : 0;

  const balanceBefore = Number(wallet.tokensBalance);

  await db
    .update(masterWalletTable)
    .set({
      tokensBalance: String(newBalance),
      totalTokensRefunded: String(Number(wallet.totalTokensRefunded) + tokensCost),
      creditTokensSpent: String(creditTokensSpent),
      updatedAt: new Date(),
    })
    .where(eq(masterWalletTable.masterId, masterId));

  await db
    .update(walletTransactionsTable)
    .set({ status: "completed" })
    .where(eq(walletTransactionsTable.id, transactionId));

  await db.insert(tokenAuditLogTable).values({
    masterId,
    orderId,
    type: "refund",
    tokensAmount: String(tokensCost),
    balanceBefore: String(balanceBefore),
    balanceAfter: String(newBalance),
    reason,
    createdBy: "system",
  });
}
