import { db, masterWalletTable, walletTransactionsTable, serviceTokenPricesTable, serviceTokenRulesTable, cityTokenMultipliersTable, masterActivePackagesTable } from "@workspace/db";
import { eq, or, and, sql, gte } from "drizzle-orm";

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

// ─── Resolve service key from raw serviceType string ──────────────────────────

function resolveServiceKey(serviceType: string): string {
  const svcLower = serviceType.toLowerCase().trim();

  const keyMap: Record<string, string> = {
    обои: "oboi", обоев: "oboi", обоями: "oboi", поклейка: "oboi",
    шпаклёвка: "shpaklevka", шпаклевка: "shpaklevka", штукатурка: "shpaklevka",
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

  // 5. Absolute fallback
  const { cost: fallbackCost, multiplier: fallbackMult } = await applyCityMultiplier(1, city);
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
}> {
  const wallet = await ensureWallet(masterId);
  const balance = Number(wallet.tokensBalance);
  const creditLimit = Number(wallet.creditLimitTokens ?? 0);
  const available = balance + creditLimit;
  const ok = available >= required;
  return { ok, balance, creditLimit, available, shortfall: ok ? 0 : required - available };
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
  const creditLimit = Number(wallet.creditLimitTokens ?? 0);

  const newBalance = currentBalance - tokensCost;

  // Check if balance would go below negative credit limit
  if (newBalance < -creditLimit) {
    return {
      success: false,
      newBalance: currentBalance,
      error: `Недостаточно токенов и кредитный лимит исчерпан. Баланс: ${currentBalance} т., кредитный лимит: ${creditLimit} т., требуется: ${tokensCost} т.`,
    };
  }

  // creditTokensSpent tracks how much of the balance is currently negative (debt)
  const creditTokensSpent = newBalance < 0 ? Math.min(creditLimit, -newBalance) : 0;

  const updateFields: any = {
    tokensBalance: String(newBalance),
    totalTokensSpent: String(Number(wallet.totalTokensSpent) + tokensCost),
    creditTokensSpent: String(creditTokensSpent),
    updatedAt: new Date(),
  };

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
  const creditLimit = Number(wallet.creditLimitTokens ?? 0);

  const newBalance = currentBalance - tokensCost;

  // Check if balance would go below negative credit limit
  if (newBalance < -creditLimit) {
    return {
      success: false,
      newBalance: currentBalance,
      error: `Недостаточно токенов и кредитный лимит исчерпан. Баланс: ${currentBalance} т., кредитный лимит: ${creditLimit} т., требуется: ${tokensCost} т.`,
    };
  }

  // creditTokensSpent tracks how much of the balance is currently negative (debt)
  const creditTokensSpent = newBalance < 0 ? Math.min(creditLimit, -newBalance) : 0;

  const updateFields: any = {
    tokensBalance: String(newBalance),
    totalTokensSpent: String(Number(wallet.totalTokensSpent) + tokensCost),
    creditTokensSpent: String(creditTokensSpent),
    updatedAt: new Date(),
  };

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
  const newBalance = Number(wallet.tokensBalance) + tokensCost;
  const creditLimit = Number(wallet.creditLimitTokens ?? 0);
  const creditTokensSpent = newBalance < 0 ? Math.min(creditLimit, -newBalance) : 0;

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
}

// ─── Expire overdue packages ────────────────────────────────────────────────

export async function expirePackages(masterId: number) {
  const now = new Date();
  await db
    .update(masterActivePackagesTable)
    .set({ status: "expired", updatedAt: now })
    .where(and(
      eq(masterActivePackagesTable.masterId, masterId),
      eq(masterActivePackagesTable.status, "active"),
      sql`${masterActivePackagesTable.expiresAt} < ${now}`,
    ));
}

// ─── Get active (non-expired) packages for a master ─────────────────────────

export async function getActivePackages(masterId: number) {
  await expirePackages(masterId);
  const rows = await db
    .select()
    .from(masterActivePackagesTable)
    .where(and(
      eq(masterActivePackagesTable.masterId, masterId),
      eq(masterActivePackagesTable.status, "active"),
      gte(masterActivePackagesTable.tokensRemaining, "0"),
    ))
    .orderBy(masterActivePackagesTable.createdAt);
  return rows;
}

// ─── Check if master is blocked by unpaid credit debt ─────────────────────────

export async function checkDebtBlock(masterId: number): Promise<{
  blocked: boolean;
  reason?: string;
}> {
  await expirePackages(masterId);
  const rows = await db
    .select()
    .from(masterActivePackagesTable)
    .where(and(
      eq(masterActivePackagesTable.masterId, masterId),
      eq(masterActivePackagesTable.packageType, "credit"),
      eq(masterActivePackagesTable.isDebtPaid, false),
      eq(masterActivePackagesTable.status, "expired"),
      sql`${masterActivePackagesTable.tokensRemaining} = 0`,
    ))
    .limit(1);

  if (rows.length > 0) {
    return {
      blocked: true,
      reason: "Оплатите тестовый заказ, купив любой стандартный пакет, чтобы продолжить работу",
    };
  }
  return { blocked: false };
}

// ─── Create a new active package ─────────────────────────────────────────────

export async function createActivePackage(params: {
  masterId: number;
  tokensTotal: number;
  packageType: "paid" | "credit" | "bonus";
  expiresAt: Date;
  transactionId?: number;
  isDebtPaid?: boolean;
}) {
  const { masterId, tokensTotal, packageType, expiresAt, transactionId, isDebtPaid } = params;
  const [row] = await db
    .insert(masterActivePackagesTable)
    .values({
      masterId,
      tokensTotal: String(tokensTotal),
      tokensRemaining: String(tokensTotal),
      packageType,
      expiresAt,
      transactionId,
      isDebtPaid: isDebtPaid ?? true,
    })
    .returning();
  return row;
}

// ─── Deduct tokens from active packages (FIFO, oldest first) ─────────────────

export async function deductFromPackages(params: {
  masterId: number;
  orderId: number;
  tokensCost: number;
  serviceType: string;
}): Promise<{ success: boolean; error?: string }> {
  const { masterId, orderId, tokensCost, serviceType } = params;

  await expirePackages(masterId);

  // Check debt block first
  const debt = await checkDebtBlock(masterId);
  if (debt.blocked) {
    return { success: false, error: debt.reason };
  }

  const packages = await getActivePackages(masterId);
  const totalAvailable = packages.reduce((s, p) => s + Number(p.tokensRemaining), 0);

  if (totalAvailable < tokensCost) {
    return { success: false, error: `Недостаточно токенов в активных пакетах. Доступно: ${totalAvailable} т., требуется: ${tokensCost} т.` };
  }

  let remaining = tokensCost;
  for (const pack of packages) {
    if (remaining <= 0) break;
    const packRem = Number(pack.tokensRemaining);
    const deduct = Math.min(remaining, packRem);
    const newRem = packRem - deduct;
    const newStatus = newRem <= 0 ? "exhausted" : pack.status;

    await db
      .update(masterActivePackagesTable)
      .set({
        tokensRemaining: String(newRem),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(masterActivePackagesTable.id, pack.id));

    remaining -= deduct;
  }

  // Insert spend transaction
  await db.insert(walletTransactionsTable).values({
    masterId,
    type: "spend",
    tokensAmount: String(-tokensCost),
    orderId,
    reason: `Оплата заказа #${orderId} (${serviceType})`,
    createdBy: "system",
    status: "completed",
  });

  return { success: true };
}

// ─── Pay off credit debt when master buys a paid package ────────────────────

export async function payOffDebt(masterId: number) {
  await db
    .update(masterActivePackagesTable)
    .set({ isDebtPaid: true, updatedAt: new Date() })
    .where(and(
      eq(masterActivePackagesTable.masterId, masterId),
      eq(masterActivePackagesTable.packageType, "credit"),
      eq(masterActivePackagesTable.isDebtPaid, false),
    ));
}
