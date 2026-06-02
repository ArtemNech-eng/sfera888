import { Router } from "express";
import { db, masterWalletTable, walletTransactionsTable, tokenPackagesTable, ordersTable, mastersTable, systemSettingsTable } from "@workspace/db";
import { eq, desc, and, inArray, sql, count, gt, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { requireMasterAuth } from "../middlewares/requireMaster.js";
import { refundTokens, checkTokenBalance } from "../lib/tokenWallet.js";
import multer from "multer";
import sharp from "sharp";
import { objectStorageClient, s3Client } from "../lib/objectStorage.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const router = Router();
const adminOnly = requireRole("admin");
const ops = requireRole("admin", "master_operator", "lead_operator");

const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Только изображения"));
  },
});

const GCS_PAYMENT_PREFIX = "payment-screenshots/";

async function uploadPaymentScreenshot(masterId: number, buffer: Buffer, mimetype: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("Object storage not configured");
  const filename = `${masterId}/${randomUUID()}.jpg`;
  const key = `${GCS_PAYMENT_PREFIX}${filename}`;

  const jpegBuffer = await sharp(buffer)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside" })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();

  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(key).save(jpegBuffer, { contentType: "image/jpeg", resumable: false });
  return `/api/wallet/payment-screenshot/${filename}`;
}

// Ensure wallet row exists for a master (upsert)
async function ensureWallet(masterId: number) {
  const existing = await db
    .select()
    .from(masterWalletTable)
    .where(eq(masterWalletTable.masterId, masterId))
    .limit(1);

  if (existing.length === 0) {
    const inserted = await db
      .insert(masterWalletTable)
      .values({ masterId })
      .returning();
    return inserted[0];
  }
  return existing[0];
}

// ─── GET /api/wallet/master-revenue — помесячная выручка от продажи токенов ──
router.get("/master-revenue", ops, async (req: any, res: any) => {
  try {
    const revenueRows = await db.execute(sql`
      SELECT
        w.master_id,
        m.alias,
        m.city,
        TO_CHAR(w.created_at, 'YYYY-MM') AS month,
        COALESCE(SUM(w.rub_amount), 0)::numeric AS revenue
      FROM wallet_transactions w
      LEFT JOIN masters m ON w.master_id = m.id
      WHERE w.type = 'purchase'
        AND w.status = 'completed'
        AND w.rub_amount > 0
        AND w.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY w.master_id, m.alias, m.city, TO_CHAR(w.created_at, 'YYYY-MM')
      ORDER BY w.master_id, TO_CHAR(w.created_at, 'YYYY-MM')
    `);

    const spentRows = await db.execute(sql`
      SELECT
        w.master_id,
        TO_CHAR(w.created_at, 'YYYY-MM') AS month,
        COALESCE(SUM(w.tokens_amount), 0)::numeric AS spent
      FROM wallet_transactions w
      WHERE w.type = 'spend'
        AND w.status = 'completed'
        AND w.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY w.master_id, TO_CHAR(w.created_at, 'YYYY-MM')
      ORDER BY w.master_id, TO_CHAR(w.created_at, 'YYYY-MM')
    `);

    const masterMap = new Map<number, {
      masterId: number; alias: string; city: string;
      months: { month: string; revenue: number; spentTokens: number }[];
    }>();

    // Process revenue
    for (const r of revenueRows.rows as any[]) {
      const masterId = Number(r.master_id);
      if (!masterMap.has(masterId)) {
        masterMap.set(masterId, { masterId, alias: r.alias ?? "—", city: r.city ?? "—", months: [] });
      }
      masterMap.get(masterId)!.months.push({ month: r.month, revenue: Number(r.revenue), spentTokens: 0 });
    }

    // Process spent tokens
    for (const r of spentRows.rows as any[]) {
      const masterId = Number(r.master_id);
      if (!masterMap.has(masterId)) {
        masterMap.set(masterId, { masterId, alias: "—", city: "—", months: [] });
      }
      const entry = masterMap.get(masterId)!;
      const existing = entry.months.find(m => m.month === r.month);
      if (existing) {
        existing.spentTokens = Number(r.spent);
      } else {
        entry.months.push({ month: r.month, revenue: 0, spentTokens: Number(r.spent) });
      }
    }

    const now = new Date();
    const fmtMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const currentMonth = fmtMonth(now);
    const prevMonth = fmtMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const result = [...masterMap.values()].map(m => {
      const monthMap: Record<string, { revenue: number; spentTokens: number }> = {};
      for (const x of m.months) monthMap[x.month] = { revenue: x.revenue, spentTokens: x.spentTokens };

      const curRev  = monthMap[currentMonth]?.revenue ?? 0;
      const prevRev = monthMap[prevMonth]?.revenue ?? 0;
      const last3 = [0, 1, 2].reduce((sum, i) => {
        const key = fmtMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
        return sum + (monthMap[key]?.revenue ?? 0);
      }, 0);
      const lastYear = m.months.reduce((s, x) => s + x.revenue, 0);
      const trend = curRev > prevRev ? "up" : curRev < prevRev ? "down" : "stable";

      const curSpent  = monthMap[currentMonth]?.spentTokens ?? 0;
      const last3Spent = [0, 1, 2].reduce((sum, i) => {
        const key = fmtMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
        return sum + (monthMap[key]?.spentTokens ?? 0);
      }, 0);
      const lastYearSpent = m.months.reduce((s, x) => s + x.spentTokens, 0);

      return {
        masterId: m.masterId, alias: m.alias, city: m.city,
        months: m.months,
        currentMonth: curRev, prevMonth: prevRev, last3Months: last3, lastYear, trend,
        currentMonthSpent: curSpent, last3MonthsSpent: last3Spent, lastYearSpent
      };
    }).sort((a, b) => b.currentMonth - a.currentMonth || b.lastYear - a.lastYear);

    return res.json(result);
  } catch (err: any) {
    console.error("[wallet/master-revenue]", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// GET /api/wallet/my — баланс для самого мастера (PWA)
router.get("/my", requireMasterAuth, async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });
  const wallet = await ensureWallet(masterId);
  const balance = Number(wallet.tokensBalance);
  const creditLimit = Number(wallet.creditLimitTokens ?? 0);
  const available = balance + creditLimit;
  const topupNeeded = balance < 0 ? -balance : 0;
  return res.json({
    tokens_balance: balance,
    total_purchased: Number(wallet.totalTokensPurchased),
    total_spent: Number(wallet.totalTokensSpent),
    total_refunded: Number(wallet.totalTokensRefunded),
    total_rub_spent: wallet.totalRubSpent,
    credit_limit_tokens: creditLimit,
    credit_tokens_issued: Number((wallet as any).creditTokensIssued ?? 0),
    credit_tokens_spent: Number((wallet as any).creditTokensSpent ?? 0),
    available_tokens: available,
    topup_needed: topupNeeded,
  });
});

// GET /api/wallet/my/transactions — история для PWA мастера
router.get("/my/transactions", requireMasterAuth, async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: walletTransactionsTable.id,
      type: walletTransactionsTable.type,
      tokensAmount: walletTransactionsTable.tokensAmount,
      rubAmount: walletTransactionsTable.rubAmount,
      packageName: tokenPackagesTable.name,
      orderId: walletTransactionsTable.orderId,
      reason: walletTransactionsTable.reason,
      status: walletTransactionsTable.status,
      createdAt: walletTransactionsTable.createdAt,
    })
    .from(walletTransactionsTable)
    .leftJoin(tokenPackagesTable, eq(walletTransactionsTable.packageId, tokenPackagesTable.id))
    .where(eq(walletTransactionsTable.masterId, masterId))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  return res.json(rows.map(r => ({
    id: r.id,
    type: r.type,
    tokens_amount: Number(r.tokensAmount),
    rub_amount: r.rubAmount,
    package_name: r.packageName ?? null,
    order_id: r.orderId,
    reason: r.reason,
    status: r.status,
    created_at: r.createdAt,
  })));
});

// POST /api/wallet/my/purchase-request — «Я оплатил» (создаёт pending-транзакцию)
router.post("/my/purchase-request", requireMasterAuth, screenshotUpload.single("screenshot"), async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const package_id = req.body?.package_id;
  if (!package_id) return res.status(400).json({ error: "package_id обязателен" });

  if (!req.file) {
    return res.status(400).json({ error: "Прикрепите скриншот оплаты" });
  }

  const pkg = await db.select().from(tokenPackagesTable)
    .where(eq(tokenPackagesTable.id, Number(package_id))).limit(1);
  if (!pkg.length || !pkg[0].isActive) {
    return res.status(404).json({ error: "Пакет не найден или неактивен" });
  }
  const pack = pkg[0];

  // Check no pending request already exists for this master+package
  const existing = await db.select().from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.masterId, masterId),
      eq(walletTransactionsTable.packageId, pack.id),
      eq(walletTransactionsTable.status, "pending"),
    )).limit(1);
  if (existing.length) {
    return res.status(409).json({ error: "Заявка на пополнение уже создана — ожидайте подтверждения" });
  }

  let screenshotUrl: string | null = null;
  try {
    screenshotUrl = await uploadPaymentScreenshot(masterId, req.file.buffer, req.file.mimetype);
  } catch (err: any) {
    console.error("[purchase-request] screenshot upload failed:", err);
    return res.status(500).json({ error: "Ошибка загрузки скриншота" });
  }

  await db.insert(walletTransactionsTable).values({
    masterId,
    type: "purchase",
    tokensAmount: String(Number(pack.tokensCount)),
    rubAmount: pack.priceRub,
    packageId: pack.id,
    reason: `Запрос на покупку пакета «${pack.name}»`,
    screenshotUrl,
    createdBy: "master",
    status: "pending",
  });

  return res.json({ success: true, message: "Заявка создана. После подтверждения оплаты токены будут зачислены." });
});

// ─── Purchase approval / rejection (admin/ops) ────────────────────────────────
// GET /api/wallet/purchases — list purchase requests with filters
router.get("/purchases", ops, async (req: any, res: any) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 30);
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;
  const masterFilter = req.query.master_id ? Number(req.query.master_id) : undefined;

  const conditions = [eq(walletTransactionsTable.type, "purchase")];
  if (statusFilter) {
    conditions.push(eq(walletTransactionsTable.status, statusFilter));
  }
  if (masterFilter !== undefined && !isNaN(masterFilter)) {
    conditions.push(eq(walletTransactionsTable.masterId, masterFilter));
  }

  const rows = await db
    .select({
      id: walletTransactionsTable.id,
      masterId: walletTransactionsTable.masterId,
      masterAlias: mastersTable.alias,
      masterCity: mastersTable.city,
      packageId: walletTransactionsTable.packageId,
      packageName: tokenPackagesTable.name,
      tokensAmount: walletTransactionsTable.tokensAmount,
      rubAmount: walletTransactionsTable.rubAmount,
      reason: walletTransactionsTable.reason,
      screenshotUrl: walletTransactionsTable.screenshotUrl,
      status: walletTransactionsTable.status,
      createdAt: walletTransactionsTable.createdAt,
    })
    .from(walletTransactionsTable)
    .leftJoin(tokenPackagesTable, eq(walletTransactionsTable.packageId, tokenPackagesTable.id))
    .leftJoin(mastersTable, eq(walletTransactionsTable.masterId, mastersTable.id))
    .where(and(...conditions))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  return res.json(rows.map(r => ({
    id: r.id,
    master_id: r.masterId,
    master_alias: r.masterAlias ?? "—",
    master_city: r.masterCity ?? "—",
    package_id: r.packageId,
    package_name: r.packageName ?? "—",
    tokens_amount: Number(r.tokensAmount),
    rub_amount: r.rubAmount,
    reason: r.reason,
    screenshot_url: r.screenshotUrl,
    status: r.status,
    created_at: r.createdAt,
  })));
});

// GET /api/wallet/:masterId — баланс и статистика (CRM/admin)
router.get("/:masterId", ops, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const wallet = await ensureWallet(masterId);
  const balance = Number(wallet.tokensBalance);
  const creditLimit = Math.max(
    Number(wallet.creditLimitTokens ?? 0),
    Number((wallet as any).creditTokensIssued ?? 0)
  );
  const available = balance + creditLimit;
  const topupNeeded = balance < 0 ? -balance : 0;
  return res.json({
    tokens_balance: balance,
    total_purchased: Number(wallet.totalTokensPurchased),
    total_spent: Number(wallet.totalTokensSpent),
    total_refunded: Number(wallet.totalTokensRefunded),
    total_rub_spent: wallet.totalRubSpent,
    credit_limit_tokens: Number(wallet.creditLimitTokens ?? 0),
    credit_tokens_issued: Number((wallet as any).creditTokensIssued ?? 0),
    credit_tokens_spent: Number((wallet as any).creditTokensSpent ?? 0),
    available_tokens: available,
    topup_needed: topupNeeded,
  });
});

// GET /api/wallet/:masterId/transactions — история операций
router.get("/:masterId/transactions", ops, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;
  const typeFilter = req.query.type as string | undefined;

  const conditions = [eq(walletTransactionsTable.masterId, masterId)];
  if (typeFilter) {
    conditions.push(eq(walletTransactionsTable.type, typeFilter));
  }

  const rows = await db
    .select({
      id: walletTransactionsTable.id,
      type: walletTransactionsTable.type,
      tokensAmount: walletTransactionsTable.tokensAmount,
      rubAmount: walletTransactionsTable.rubAmount,
      packageId: walletTransactionsTable.packageId,
      packageName: tokenPackagesTable.name,
      orderId: walletTransactionsTable.orderId,
      reason: walletTransactionsTable.reason,
      createdBy: walletTransactionsTable.createdBy,
      status: walletTransactionsTable.status,
      createdAt: walletTransactionsTable.createdAt,
    })
    .from(walletTransactionsTable)
    .leftJoin(tokenPackagesTable, eq(walletTransactionsTable.packageId, tokenPackagesTable.id))
    .where(and(...conditions))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  return res.json(rows.map(r => ({
    id: r.id,
    type: r.type,
    tokens_amount: Number(r.tokensAmount),
    rub_amount: r.rubAmount,
    package_name: r.packageName ?? null,
    order_id: r.orderId,
    reason: r.reason,
    created_by: r.createdBy,
    status: r.status,
    created_at: r.createdAt,
  })));
});

// POST /api/wallet/:masterId/purchase — начисление за покупку пакета
router.post("/:masterId/purchase", ops, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const { package_id } = req.body;
  if (!package_id) return res.status(400).json({ error: "package_id обязателен" });

  const pkg = await db
    .select()
    .from(tokenPackagesTable)
    .where(eq(tokenPackagesTable.id, Number(package_id)))
    .limit(1);

  if (!pkg.length || !pkg[0].isActive) {
    return res.status(404).json({ error: "Пакет не найден или неактивен" });
  }

  const pack = pkg[0];
  const tokensToAdd = Number(pack.tokensCount);
  const rubAmount = pack.priceRub;

  const wallet = await ensureWallet(masterId);
  const newBalance = Number(wallet.tokensBalance) + tokensToAdd;
  const effectiveLimit = Math.max(
    Number(wallet.creditLimitTokens ?? 0),
    Number((wallet as any).creditTokensIssued ?? 0)
  );
  const creditTokensSpent = newBalance < 0 ? Math.min(effectiveLimit, -newBalance) : 0;

  const [updated] = await db
    .update(masterWalletTable)
    .set({
      tokensBalance: String(newBalance),
      totalTokensPurchased: String(Number(wallet.totalTokensPurchased) + tokensToAdd),
      totalRubSpent: wallet.totalRubSpent + rubAmount,
      creditTokensSpent: String(creditTokensSpent),
      updatedAt: new Date(),
    })
    .where(eq(masterWalletTable.masterId, masterId))
    .returning();

  await db.insert(walletTransactionsTable).values({
    masterId,
    type: "purchase",
    tokensAmount: String(tokensToAdd),
    rubAmount,
    packageId: pack.id,
    reason: `Покупка пакета «${pack.name}»`,
    createdBy: "admin",
    status: "completed",
  });

  return res.json({ success: true, new_balance: Number(updated.tokensBalance) });
});

// POST /api/wallet/:masterId/bonus — бонусное начисление
router.post("/:masterId/bonus", adminOnly, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const { tokens, reason } = req.body;
  if (!tokens || isNaN(Number(tokens)) || Number(tokens) <= 0) {
    return res.status(400).json({ error: "tokens должен быть положительным числом" });
  }
  if (!reason) return res.status(400).json({ error: "reason обязателен" });

  const tokensNum = Number(tokens);
  const wallet = await ensureWallet(masterId);

  const newBalance = Number(wallet.tokensBalance) + tokensNum;
  const effectiveLimit = Math.max(
    Number(wallet.creditLimitTokens ?? 0),
    Number((wallet as any).creditTokensIssued ?? 0)
  );
  const creditTokensSpent = newBalance < 0 ? Math.min(effectiveLimit, -newBalance) : 0;

  const [updated] = await db
    .update(masterWalletTable)
    .set({
      tokensBalance: String(newBalance),
      totalTokensPurchased: String(Number(wallet.totalTokensPurchased) + tokensNum),
      creditTokensSpent: String(creditTokensSpent),
      updatedAt: new Date(),
    })
    .where(eq(masterWalletTable.masterId, masterId))
    .returning();

  const adminAlias = (req as any).user?.name ?? "admin";
  await db.insert(walletTransactionsTable).values({
    masterId,
    type: "bonus",
    tokensAmount: String(tokensNum),
    reason,
    createdBy: adminAlias,
    status: "completed",
  });

  return res.json({ success: true, new_balance: Number(updated.tokensBalance) });
});

// POST /api/wallet/:masterId/adjustment — ручная корректировка (+ или -)
router.post("/:masterId/adjustment", adminOnly, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const { tokens, reason } = req.body;
  if (tokens === undefined || isNaN(Number(tokens))) {
    return res.status(400).json({ error: "tokens обязателен (может быть отрицательным)" });
  }
  if (!reason) return res.status(400).json({ error: "reason обязателен" });

  const tokensNum = Number(tokens);
  const wallet = await ensureWallet(masterId);
  const newBalance = Number(wallet.tokensBalance) + tokensNum;
  const effectiveLimit = Math.max(
    Number(wallet.creditLimitTokens ?? 0),
    Number((wallet as any).creditTokensIssued ?? 0)
  );

  // For negative adjustments, check credit limit
  if (newBalance < -effectiveLimit) {
    return res.status(400).json({ error: "Баланс не может быть ниже кредитного лимита" });
  }

  const creditTokensSpent = newBalance < 0 ? Math.min(effectiveLimit, -newBalance) : 0;

  const updateFields: any = {
    tokensBalance: String(newBalance),
    creditTokensSpent: String(creditTokensSpent),
    updatedAt: new Date(),
  };

  if (tokensNum > 0) {
    updateFields.totalTokensPurchased = String(Number(wallet.totalTokensPurchased) + tokensNum);
  } else if (tokensNum < 0) {
    updateFields.totalTokensSpent = String(Number(wallet.totalTokensSpent) + Math.abs(tokensNum));
  }

  const [updated] = await db
    .update(masterWalletTable)
    .set(updateFields)
    .where(eq(masterWalletTable.masterId, masterId))
    .returning();

  const adminAlias = (req as any).user?.name ?? "admin";
  await db.insert(walletTransactionsTable).values({
    masterId,
    type: "adjustment",
    tokensAmount: String(tokensNum),
    reason,
    createdBy: adminAlias,
    status: "completed",
  });

  return res.json({ success: true, new_balance: Number(updated.tokensBalance) });
});

// POST /api/wallet/:masterId/set-credit-limit — установить кредитный лимит (admin)
router.post("/:masterId/set-credit-limit", adminOnly, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const { credit_limit } = req.body;
  if (credit_limit === undefined || isNaN(Number(credit_limit)) || Number(credit_limit) < 0) {
    return res.status(400).json({ error: "credit_limit должен быть неотрицательным числом" });
  }

  const wallet = await ensureWallet(masterId);
  const [updated] = await db
    .update(masterWalletTable)
    .set({
      creditLimitTokens: String(Number(credit_limit)),
      updatedAt: new Date(),
    })
    .where(eq(masterWalletTable.masterId, masterId))
    .returning();

  return res.json({
    success: true,
    credit_limit_tokens: Number(updated.creditLimitTokens),
    available_tokens: Number(updated.tokensBalance) + Number(updated.creditLimitTokens),
  });
});

// POST /api/wallet/:masterId/credit — выдать тестовые токены в долг (только admin)
router.post("/:masterId/credit", adminOnly, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const { tokens, reason } = req.body;
  const tokensNum = Number(tokens);
  if (!tokens || isNaN(tokensNum) || tokensNum <= 0 || tokensNum > 10) {
    return res.status(400).json({ error: "tokens должен быть от 1 до 10" });
  }
  const finalReason = (reason as string)?.trim() || "Тестовый заказ";

  const masterRows = await db.select({ contractSignedAt: mastersTable.contractSignedAt, passportVerified: mastersTable.passportVerified, alias: mastersTable.alias })
    .from(mastersTable).where(eq(mastersTable.id, masterId)).limit(1);
  if (!masterRows.length) return res.status(404).json({ error: "Мастер не найден" });
  if (!masterRows[0].contractSignedAt) {
    return res.status(403).json({ error: `У мастера ${masterRows[0].alias} не подписан договор — токен в долг выдать нельзя` });
  }
  if (!masterRows[0].passportVerified) {
    return res.status(403).json({ error: `У мастера ${masterRows[0].alias} договор не подтверждён администратором — сначала проверьте паспорт` });
  }

  const wallet = await ensureWallet(masterId);
  const adminAlias = (req as any).user?.name ?? "admin";

  const balance = Number(wallet.tokensBalance);
  const oldLimit = Number(wallet.creditLimitTokens ?? 0);
  const newLimit = oldLimit + tokensNum;
  const newSpent = balance < 0 ? Math.min(newLimit, -balance) : 0;

  const [updated] = await db
    .update(masterWalletTable)
    .set({
      creditLimitTokens: String(newLimit),
      creditTokensIssued: String(Number((wallet as any).creditTokensIssued ?? 0) + tokensNum),
      creditTokensSpent: String(newSpent),
      updatedAt: new Date(),
    } as any)
    .where(eq(masterWalletTable.masterId, masterId))
    .returning();

  await db.insert(walletTransactionsTable).values({
    masterId,
    type: "credit",
    tokensAmount: String(tokensNum),
    reason: finalReason,
    createdBy: adminAlias,
    status: "completed",
  });

  return res.json({
    success: true,
    new_balance: Number(updated.tokensBalance),
    credit_limit_tokens: newLimit,
    credit_tokens_issued: Number((updated as any).creditTokensIssued ?? tokensNum),
  });
});

// POST /api/wallet/:masterId/confirm-purchase — approve a pending purchase
router.post("/:masterId/confirm-purchase", ops, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const { transaction_id } = req.body;
  if (!transaction_id) return res.status(400).json({ error: "transaction_id обязателен" });

  const txRows = await db.select().from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.id, Number(transaction_id)),
      eq(walletTransactionsTable.masterId, masterId),
      eq(walletTransactionsTable.type, "purchase"),
      eq(walletTransactionsTable.status, "pending"),
    ))
    .limit(1);
  if (!txRows.length) return res.status(404).json({ error: "Заявка не найдена или уже обработана" });

  const tx = txRows[0];
  const tokensToAdd = Number(tx.tokensAmount);
  const rubAmount = tx.rubAmount ?? 0;

  // Update wallet balance
  const wallet = await ensureWallet(masterId);
  const newBalance = Number(wallet.tokensBalance) + tokensToAdd;
  const effectiveLimit = Math.max(
    Number(wallet.creditLimitTokens ?? 0),
    Number((wallet as any).creditTokensIssued ?? 0)
  );
  const creditTokensSpent = newBalance < 0 ? Math.min(effectiveLimit, -newBalance) : 0;

  await db.update(masterWalletTable)
    .set({
      tokensBalance: String(newBalance),
      totalTokensPurchased: String(Number(wallet.totalTokensPurchased) + tokensToAdd),
      totalRubSpent: (wallet.totalRubSpent ?? 0) + rubAmount,
      creditTokensSpent: String(creditTokensSpent),
      updatedAt: new Date(),
    })
    .where(eq(masterWalletTable.masterId, masterId));

  // Mark transaction completed
  await db.update(walletTransactionsTable)
    .set({ status: "completed", reason: `${tx.reason ?? ""} | Подтверждено администратором` })
    .where(eq(walletTransactionsTable.id, tx.id));

  return res.json({ success: true, tokens_added: tokensToAdd, new_balance: newBalance });
});

// POST /api/wallet/:masterId/cancel-purchase — reject a pending purchase
router.post("/:masterId/cancel-purchase", ops, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const { transaction_id, reason } = req.body;
  if (!transaction_id) return res.status(400).json({ error: "transaction_id обязателен" });
  if (!reason || !reason.trim()) return res.status(400).json({ error: "reason обязателен" });

  const txRows = await db.select().from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.id, Number(transaction_id)),
      eq(walletTransactionsTable.masterId, masterId),
      eq(walletTransactionsTable.type, "purchase"),
      eq(walletTransactionsTable.status, "pending"),
    ))
    .limit(1);
  if (!txRows.length) return res.status(404).json({ error: "Заявка не найдена или уже обработана" });

  const tx = txRows[0];

  await db.update(walletTransactionsTable)
    .set({
      status: "cancelled",
      reason: `${tx.reason ?? ""} | Отклонено: ${reason.trim()}`,
    })
    .where(eq(walletTransactionsTable.id, tx.id));

  return res.json({ success: true });
});

// ─── Arbitrage: request refund ───────────────────────────────────────────────
// Called from master PWA when master wants a token back
router.post("/refund-request", requireAuth, async (req: any, res: any) => {
  const { master_id, order_id, reason } = req.body;
  if (!master_id || !order_id || !reason) {
    return res.status(400).json({ error: "master_id, order_id, reason обязательны" });
  }

  const masterId = Number(master_id);
  const orderId = Number(order_id);

  // Find the spend transaction for this order
  const spendTx = await db
    .select()
    .from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.masterId, masterId),
      eq(walletTransactionsTable.orderId, orderId),
      eq(walletTransactionsTable.type, "spend"),
      eq(walletTransactionsTable.status, "completed"),
    ))
    .limit(1);

  if (!spendTx.length) {
    return res.status(404).json({ error: "Транзакция списания не найдена" });
  }

  // Check 48-hour window from spend transaction
  const spentAt = new Date(spendTx[0].createdAt!);
  const hours48 = new Date(Date.now() - 48 * 60 * 60 * 1000);
  if (spentAt < hours48) {
    return res.status(400).json({ error: "Срок подачи заявки на возврат истёк (48 часов)" });
  }

  // Check no pending refund already exists
  const existing = await db
    .select()
    .from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.masterId, masterId),
      eq(walletTransactionsTable.orderId, orderId),
      eq(walletTransactionsTable.type, "refund"),
    ))
    .limit(1);
  if (existing.length) {
    return res.status(409).json({ error: "Заявка на возврат уже существует" });
  }

  const tokensCost = Math.abs(Number(spendTx[0].tokensAmount));

  // Create pending refund transaction
  const [tx] = await db.insert(walletTransactionsTable).values({
    masterId,
    type: "refund",
    tokensAmount: String(tokensCost),
    orderId,
    reason,
    createdBy: "master",
    status: "pending",
  }).returning();

  // Set order to refund_requested
  await db.update(ordersTable)
    .set({ status: "refund_requested" as any, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  return res.json({ success: true, transactionId: tx.id, tokensRequested: tokensCost });
});

// ─── Arbitrage: approve refund (admin) ────────────────────────────────────────
router.post("/refund/:transactionId/approve", adminOnly, async (req: any, res: any) => {
  const transactionId = parseInt(String(req.params.transactionId));
  if (isNaN(transactionId)) return res.status(400).json({ error: "Неверный transactionId" });

  const txRows = await db.select().from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.id, transactionId),
      eq(walletTransactionsTable.type, "refund"),
      eq(walletTransactionsTable.status, "pending"),
    ))
    .limit(1);
  if (!txRows.length) return res.status(404).json({ error: "Заявка не найдена или уже обработана" });

  const tx = txRows[0];
  const tokensCost = Number(tx.tokensAmount);

  await refundTokens({
    masterId: tx.masterId,
    orderId: tx.orderId!,
    tokensCost,
    reason: tx.reason ?? "",
    transactionId,
  });

  // Return order to pool
  await db.update(ordersTable)
    .set({
      masterId: null,
      status: "waiting_master" as any,
      dispatchStatus: "none",
      assignedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, tx.orderId!));

  return res.json({ success: true, tokensRefunded: tokensCost });
});

// ─── Arbitrage: reject refund (admin) ─────────────────────────────────────────
router.post("/refund/:transactionId/reject", adminOnly, async (req: any, res: any) => {
  const transactionId = parseInt(String(req.params.transactionId));
  if (isNaN(transactionId)) return res.status(400).json({ error: "Неверный transactionId" });

  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: "reason обязателен" });

  const txRows = await db.select().from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.id, transactionId),
      eq(walletTransactionsTable.type, "refund"),
      eq(walletTransactionsTable.status, "pending"),
    ))
    .limit(1);
  if (!txRows.length) return res.status(404).json({ error: "Заявка не найдена или уже обработана" });

  const tx = txRows[0];

  await db.update(walletTransactionsTable)
    .set({ status: "cancelled", reason: `${tx.reason ?? ""} | Отклонено: ${reason}` })
    .where(eq(walletTransactionsTable.id, transactionId));

  // Revert order to master_assigned
  await db.update(ordersTable)
    .set({ status: "master_assigned" as any, updatedAt: new Date() })
    .where(eq(ordersTable.id, tx.orderId!));

  return res.json({ success: true });
});

// ─── Arbitrage: list all refund requests (admin) ──────────────────────────────
router.get("/refunds", ops, async (req: any, res: any) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;
  const masterIdFilter = req.query.master_id ? parseInt(req.query.master_id as string) : undefined;

  const conditions: any[] = [eq(walletTransactionsTable.type, "refund")];
  if (statusFilter) conditions.push(eq(walletTransactionsTable.status, statusFilter));
  if (masterIdFilter) conditions.push(eq(walletTransactionsTable.masterId, masterIdFilter));

  const rows = await db
    .select({
      id: walletTransactionsTable.id,
      masterId: walletTransactionsTable.masterId,
      masterAlias: mastersTable.alias,
      orderId: walletTransactionsTable.orderId,
      tokensAmount: walletTransactionsTable.tokensAmount,
      reason: walletTransactionsTable.reason,
      status: walletTransactionsTable.status,
      createdAt: walletTransactionsTable.createdAt,
    })
    .from(walletTransactionsTable)
    .leftJoin(mastersTable, eq(walletTransactionsTable.masterId, mastersTable.id))
    .where(and(...conditions))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  return res.json(rows.map(r => ({
    id: r.id,
    master_id: r.masterId,
    master_alias: r.masterAlias ?? "?",
    order_id: r.orderId,
    tokens_amount: Number(r.tokensAmount),
    reason: r.reason,
    status: r.status,
    created_at: r.createdAt,
  })));
});

// ─── Token analytics (admin/ops) ────────────────────────────────────────────────
router.get("/analytics", ops, async (req: any, res: any) => {
  try {
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const dateConditions: any[] = [eq(walletTransactionsTable.type, "purchase")];
    if (from) dateConditions.push(sql`${walletTransactionsTable.createdAt} >= ${from}`);
    if (to) dateConditions.push(sql`${walletTransactionsTable.createdAt} <= ${to}`);

    const completedConditions = [...dateConditions, eq(walletTransactionsTable.status, "completed")];
    const pendingConditions = [...dateConditions, eq(walletTransactionsTable.status, "pending")];

    // Total revenue & count (completed)
    const revenueRows = await db
      .select({
        total: sql<number>`COALESCE(SUM(${walletTransactionsTable.rubAmount}), 0)`,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(walletTransactionsTable)
      .where(and(...completedConditions));

    // Pending revenue
    const pendingRows = await db
      .select({
        total: sql<number>`COALESCE(SUM(${walletTransactionsTable.rubAmount}), 0)`,
      })
      .from(walletTransactionsTable)
      .where(and(...pendingConditions));

    // Daily chart data
    const chartRows = await db
      .select({
        date: sql<string>`DATE(${walletTransactionsTable.createdAt})`,
        revenue: sql<number>`COALESCE(SUM(${walletTransactionsTable.rubAmount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(walletTransactionsTable)
      .where(and(...completedConditions))
      .groupBy(sql`DATE(${walletTransactionsTable.createdAt})`)
      .orderBy(sql`DATE(${walletTransactionsTable.createdAt})`);

    // By package
    const packageRows = await db
      .select({
        packageName: tokenPackagesTable.name,
        revenue: sql<number>`COALESCE(SUM(${walletTransactionsTable.rubAmount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(walletTransactionsTable)
      .leftJoin(tokenPackagesTable, eq(walletTransactionsTable.packageId, tokenPackagesTable.id))
      .where(and(...completedConditions))
      .groupBy(tokenPackagesTable.name);

    // Top masters
    const topMasterRows = await db
      .select({
        alias: mastersTable.alias,
        city: mastersTable.city,
        revenue: sql<number>`COALESCE(SUM(${walletTransactionsTable.rubAmount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(walletTransactionsTable)
      .leftJoin(mastersTable, eq(walletTransactionsTable.masterId, mastersTable.id))
      .where(and(...completedConditions))
      .groupBy(mastersTable.alias, mastersTable.city)
      .orderBy(sql`SUM(${walletTransactionsTable.rubAmount}) DESC`)
      .limit(20);

    // By city
    const cityRows = await db
      .select({
        city: mastersTable.city,
        revenue: sql<number>`COALESCE(SUM(${walletTransactionsTable.rubAmount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(walletTransactionsTable)
      .leftJoin(mastersTable, eq(walletTransactionsTable.masterId, mastersTable.id))
      .where(and(...completedConditions))
      .groupBy(mastersTable.city)
      .orderBy(sql`SUM(${walletTransactionsTable.rubAmount}) DESC`);

    const totalRevenue = Number(revenueRows[0]?.total ?? 0);
    const totalPurchases = Number(revenueRows[0]?.cnt ?? 0);
    const pendingRevenue = Number(pendingRows[0]?.total ?? 0);

    return res.json({
      totalRevenue,
      totalPurchases,
      avgOrderValue: totalPurchases > 0 ? Math.round(totalRevenue / totalPurchases) : 0,
      pendingRevenue,
      chartData: chartRows.map(r => ({
        date: r.date,
        revenue: Number(r.revenue),
        count: Number(r.count),
      })),
      byPackage: packageRows.map(r => ({
        package_name: r.packageName ?? "—",
        revenue: Number(r.revenue),
        count: Number(r.count),
      })),
      topMasters: topMasterRows.map(r => ({
        alias: r.alias ?? "—",
        city: r.city ?? "—",
        revenue: Number(r.revenue),
        count: Number(r.count),
      })),
      byCity: cityRows.map(r => ({
        city: r.city ?? "—",
        revenue: Number(r.revenue),
        count: Number(r.count),
      })),
    });
  } catch (err: any) {
    console.error("[wallet/analytics]", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ─── Migration: move remaining tokens from active packages to balance ───────
router.post("/migrate-active-packages", adminOnly, async (req: any, res: any) => {
  const [flag] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "active_packages_migrated"));
  if (flag?.value === "true") {
    return res.status(409).json({ done: true, message: "Миграция уже выполнена. Флаг active_packages_migrated установлен." });
  }

  const unmigrated = await db.execute(sql`
    SELECT master_id, SUM(tokens_remaining::numeric) as total
    FROM master_active_packages
    WHERE status NOT IN ('migrated', 'expired')
    GROUP BY master_id
  `);

  if (!unmigrated.rows.length) {
    return res.json({ done: true, message: "Миграция уже выполнена или не требуется" });
  }

  const results: any[] = [];
  for (const row of unmigrated.rows) {
    const masterId = Number(row.master_id);
    const amount = Number(row.total);
    if (!amount || amount <= 0) continue;

    await db.execute(sql`
      UPDATE master_wallet
      SET tokens_balance = (tokens_balance::numeric + ${String(amount)})::text,
          updated_at = NOW()
      WHERE master_id = ${masterId}
    `);

    results.push({ masterId, amountMigrated: amount });
  }

  await db.execute(sql`
    UPDATE master_active_packages
    SET status = 'migrated', updated_at = NOW()
    WHERE status NOT IN ('migrated', 'expired')
  `);

  await db.insert(systemSettingsTable)
    .values({ key: "active_packages_migrated", value: "true", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value: "true", updatedAt: new Date() },
    });

  return res.json({ done: true, migratedCount: results.length, details: results });
});

// ─── Credit analytics (admin/ops) ───────────────────────────────────────────
router.get("/credit-analytics", ops, async (req: any, res: any) => {
  try {
    const rows = await db
      .select({
        masterId: mastersTable.id,
        alias: mastersTable.alias,
        city: mastersTable.city,
        tokensBalance: masterWalletTable.tokensBalance,
        creditLimitTokens: masterWalletTable.creditLimitTokens,
        creditTokensIssued: masterWalletTable.creditTokensIssued,
        creditTokensSpent: masterWalletTable.creditTokensSpent,
      })
      .from(mastersTable)
      .leftJoin(masterWalletTable, eq(mastersTable.id, masterWalletTable.masterId))
      .where(and(isNull(mastersTable.deletedAt), eq(mastersTable.status, "active")));

    const masters = rows.map(r => {
      const balance = Number(r.tokensBalance ?? 0);
      const creditLimit = Number(r.creditLimitTokens ?? 0);
      const creditIssued = Number(r.creditTokensIssued ?? 0);
      const creditSpent = Number(r.creditTokensSpent ?? 0);
      return {
        masterId: r.masterId,
        alias: r.alias ?? "—",
        city: r.city ?? "—",
        tokensBalance: balance,
        creditLimitTokens: creditLimit,
        creditTokensIssued: creditIssued,
        creditTokensSpent: creditSpent,
        debtAmount: balance < 0 ? -balance : 0,
      };
    });

    const debtors = masters.filter(m => m.debtAmount > 0);
    const totalDebtTokens = debtors.reduce((s, m) => s + m.debtAmount, 0);
    const totalCreditSpent = masters.reduce((s, m) => s + m.creditTokensSpent, 0);

    return res.json({
      totalDebtTokens,
      totalCreditSpent,
      debtorCount: debtors.length,
      masters,
    });
  } catch (err: any) {
    console.error("[wallet/credit-analytics]", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// POST /api/wallet/repair-credit-limits — sync creditLimitTokens with creditTokensIssued
router.post("/repair-credit-limits", adminOnly, async (req: any, res: any) => {
  const fixBalances = req.query.fixBalances === "true";
  try {
    const rows = await db
      .select({
        masterId: masterWalletTable.masterId,
        creditTokensIssued: masterWalletTable.creditTokensIssued,
        creditLimitTokens: masterWalletTable.creditLimitTokens,
        tokensBalance: masterWalletTable.tokensBalance,
        totalTokensPurchased: masterWalletTable.totalTokensPurchased,
        totalTokensSpent: masterWalletTable.totalTokensSpent,
        totalTokensRefunded: masterWalletTable.totalTokensRefunded,
      })
      .from(masterWalletTable)
      .where(
        fixBalances
          ? sql`${masterWalletTable.creditTokensIssued} > ${sql.raw('0')}`
          : gt(masterWalletTable.creditTokensIssued, masterWalletTable.creditLimitTokens)
      );

    const repaired: { masterId: number; oldLimit: number; newLimit: number; balance: number }[] = [];
    const fixed: { masterId: number; oldBalance: number; newBalance: number }[] = [];
    for (const row of rows) {
      const issued = Number(row.creditTokensIssued ?? 0);
      const balance = Number(row.tokensBalance ?? 0);
      const oldLimit = Number(row.creditLimitTokens ?? 0);
      const newLimit = issued;

      let newBalance = balance;
      let newSpent = balance < 0 ? Math.min(issued, -balance) : 0;

      if (fixBalances) {
        const purchased = Number(row.totalTokensPurchased ?? 0);
        const spent = Number(row.totalTokensSpent ?? 0);
        const refunded = Number(row.totalTokensRefunded ?? 0);
        const expectedBalance = purchased + refunded - spent;
        if (expectedBalance < 0 && balance > expectedBalance) {
          newBalance = expectedBalance;
          newSpent = Math.min(issued, -expectedBalance);
          fixed.push({ masterId: row.masterId, oldBalance: balance, newBalance });
        }
      }

      await db
        .update(masterWalletTable)
        .set({
          creditLimitTokens: String(newLimit),
          creditTokensSpent: String(newSpent),
          ...(fixBalances && newBalance !== balance ? { tokensBalance: String(newBalance) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(masterWalletTable.masterId, row.masterId));
      repaired.push({
        masterId: row.masterId,
        oldLimit,
        newLimit,
        balance: newBalance,
      });
    }

    return res.json({
      success: true,
      repairedCount: repaired.length,
      fixedBalancesCount: fixed.length,
      fixed,
      repaired,
    });
  } catch (err: any) {
    console.error("[wallet/repair-credit-limits]", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// POST /api/wallet/repair-missing-wallets — create wallet rows for masters without one
router.post("/repair-missing-wallets", adminOnly, async (req: any, res: any) => {
  try {
    const allMasters = await db.select({ id: mastersTable.id }).from(mastersTable).where(isNull(mastersTable.deletedAt));
    const existingWallets = await db.select({ masterId: masterWalletTable.masterId }).from(masterWalletTable);
    const existingIds = new Set(existingWallets.map(w => w.masterId));

    const created: number[] = [];
    for (const m of allMasters) {
      if (!existingIds.has(m.id)) {
        await db.insert(masterWalletTable).values({ masterId: m.id });
        created.push(m.id);
      }
    }

    return res.json({
      success: true,
      createdCount: created.length,
      created,
    });
  } catch (err: any) {
    console.error("[wallet/repair-missing-wallets]", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// GET /api/wallet/:masterId/debug — raw wallet + transactions for diagnostics
router.get("/:masterId/debug", adminOnly, async (req: any, res: any, next: any) => {
  const masterId = parseInt(String(req.params.masterId));
  if (isNaN(masterId)) return next();

  const walletRows = await db.select().from(masterWalletTable).where(eq(masterWalletTable.masterId, masterId));
  const txRows = await db
    .select()
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.masterId, masterId))
    .orderBy(desc(walletTransactionsTable.createdAt));

  return res.json({
    wallet: walletRows[0] ?? null,
    transactions: txRows,
  });
});

// ─── Payment screenshot proxy ─────────────────────────────────────────────────
router.get("/payment-screenshot/:masterId/:filename", async (req, res) => {
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) return res.status(500).json({ error: "Storage not configured" });
    const key = `${GCS_PAYMENT_PREFIX}${req.params.masterId}/${req.params.filename}`;
    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucketId, Key: key }));
    res.setHeader("Content-Type", response.ContentType || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (response.Body) {
      const stream = response.Body as unknown as NodeJS.ReadableStream;
      stream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error("[payment-screenshot proxy] error:", err);
    res.status(404).json({ error: "Not found" });
  }
});

export default router;
