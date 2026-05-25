import { Router } from "express";
import { db, masterWalletTable, walletTransactionsTable, tokenPackagesTable, ordersTable, mastersTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { refundTokens } from "../lib/tokenWallet.js";
import multer from "multer";
import sharp from "sharp";
import { objectStorageClient, s3Client } from "../lib/objectStorage.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const router = Router();
const adminOnly = requireRole("admin");
const ops = requireRole("admin", "master_operator", "lead_operator");

function requireMasterAuth(req: any, res: any, next: any) {
  const masterId = (req.session as any).masterId as number | undefined;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });
  next();
}

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

// GET /api/wallet/my — баланс для самого мастера (PWA)
router.get("/my", requireMasterAuth, async (req: any, res: any) => {
  const masterId: number | undefined = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });
  const wallet = await ensureWallet(masterId);
  return res.json({
    tokens_balance: Number(wallet.tokensBalance),
    total_purchased: Number(wallet.totalTokensPurchased),
    total_spent: Number(wallet.totalTokensSpent),
    total_refunded: Number(wallet.totalTokensRefunded),
    total_rub_spent: wallet.totalRubSpent,
    credit_tokens_issued: Number((wallet as any).creditTokensIssued ?? 0),
    credit_tokens_spent: Number((wallet as any).creditTokensSpent ?? 0),
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

// GET /api/wallet/:masterId — баланс и статистика (CRM/admin)
router.get("/:masterId", ops, async (req: any, res: any) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Неверный masterId" });

  const wallet = await ensureWallet(masterId);
  return res.json({
    tokens_balance: Number(wallet.tokensBalance),
    total_purchased: Number(wallet.totalTokensPurchased),
    total_spent: Number(wallet.totalTokensSpent),
    total_refunded: Number(wallet.totalTokensRefunded),
    total_rub_spent: wallet.totalRubSpent,
    credit_tokens_issued: Number((wallet as any).creditTokensIssued ?? 0),
    credit_tokens_spent: Number((wallet as any).creditTokensSpent ?? 0),
  });
});

// GET /api/wallet/:masterId/transactions — история операций
router.get("/:masterId/transactions", ops, async (req: any, res: any) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Неверный masterId" });

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
router.post("/:masterId/purchase", ops, async (req: any, res: any) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Неверный masterId" });

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
  const creditTokensIssued = Number((wallet as any).creditTokensIssued ?? 0);
  const creditTokensSpent = newBalance < 0 ? Math.min(creditTokensIssued, -newBalance) : 0;

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
router.post("/:masterId/bonus", adminOnly, async (req: any, res: any) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Неверный masterId" });

  const { tokens, reason } = req.body;
  if (!tokens || isNaN(Number(tokens)) || Number(tokens) <= 0) {
    return res.status(400).json({ error: "tokens должен быть положительным числом" });
  }
  if (!reason) return res.status(400).json({ error: "reason обязателен" });

  const tokensNum = Number(tokens);
  const wallet = await ensureWallet(masterId);

  const newBalance = Number(wallet.tokensBalance) + tokensNum;
  const creditTokensIssued = Number((wallet as any).creditTokensIssued ?? 0);
  const creditTokensSpent = newBalance < 0 ? Math.min(creditTokensIssued, -newBalance) : 0;

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
router.post("/:masterId/adjustment", adminOnly, async (req: any, res: any) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Неверный masterId" });

  const { tokens, reason } = req.body;
  if (tokens === undefined || isNaN(Number(tokens))) {
    return res.status(400).json({ error: "tokens обязателен (может быть отрицательным)" });
  }
  if (!reason) return res.status(400).json({ error: "reason обязателен" });

  const tokensNum = Number(tokens);
  const wallet = await ensureWallet(masterId);
  const newBalance = Number(wallet.tokensBalance) + tokensNum;
  const creditTokensIssued = Number((wallet as any).creditTokensIssued ?? 0);

  // For negative adjustments, check credit limit
  if (newBalance < -creditTokensIssued) {
    return res.status(400).json({ error: "Баланс не может быть ниже кредитного лимита" });
  }

  const creditTokensSpent = newBalance < 0 ? Math.min(creditTokensIssued, -newBalance) : 0;

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

// POST /api/wallet/:masterId/credit — выдать тестовые токены в долг (только admin)
router.post("/:masterId/credit", adminOnly, async (req: any, res: any) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Неверный masterId" });

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

  const [updated] = await db
    .update(masterWalletTable)
    .set({
      creditTokensIssued: String(Number((wallet as any).creditTokensIssued ?? 0) + tokensNum),
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
    credit_tokens_issued: Number((updated as any).creditTokensIssued ?? tokensNum),
  });
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
  const transactionId = parseInt(req.params.transactionId);
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
  const transactionId = parseInt(req.params.transactionId);
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

// ─── Purchase requests: list all (admin/ops) ──────────────────────────────────
router.get("/purchases", ops, async (req: any, res: any) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;
  const masterIdFilter = req.query.master_id ? parseInt(req.query.master_id as string) : undefined;

  const conditions: any[] = [eq(walletTransactionsTable.type, "purchase")];
  if (statusFilter) conditions.push(eq(walletTransactionsTable.status, statusFilter));
  if (masterIdFilter) conditions.push(eq(walletTransactionsTable.masterId, masterIdFilter));

  const rows = await db
    .select({
      id: walletTransactionsTable.id,
      masterId: walletTransactionsTable.masterId,
      masterAlias: mastersTable.alias,
      masterCity: mastersTable.city,
      tokensAmount: walletTransactionsTable.tokensAmount,
      rubAmount: walletTransactionsTable.rubAmount,
      packageId: walletTransactionsTable.packageId,
      packageName: tokenPackagesTable.name,
      reason: walletTransactionsTable.reason,
      screenshotUrl: walletTransactionsTable.screenshotUrl,
      status: walletTransactionsTable.status,
      createdAt: walletTransactionsTable.createdAt,
    })
    .from(walletTransactionsTable)
    .leftJoin(mastersTable, eq(walletTransactionsTable.masterId, mastersTable.id))
    .leftJoin(tokenPackagesTable, eq(walletTransactionsTable.packageId, tokenPackagesTable.id))
    .where(and(...conditions))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  return res.json(rows.map(r => ({
    id: r.id,
    master_id: r.masterId,
    master_alias: r.masterAlias ?? "?",
    master_city: r.masterCity ?? "",
    package_id: r.packageId,
    package_name: r.packageName ?? "?",
    tokens_amount: Number(r.tokensAmount),
    rub_amount: r.rubAmount,
    reason: r.reason,
    screenshot_url: r.screenshotUrl,
    status: r.status,
    created_at: r.createdAt,
  })));
});

// ─── Confirm purchase (admin) ─────────────────────────────────────────────────
router.post("/:masterId/confirm-purchase", adminOnly, async (req: any, res: any) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Неверный masterId" });

  const { transaction_id } = req.body;
  if (!transaction_id) return res.status(400).json({ error: "transaction_id обязателен" });

  const txRows = await db.select().from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.id, transaction_id),
      eq(walletTransactionsTable.masterId, masterId),
      eq(walletTransactionsTable.type, "purchase"),
    ))
    .limit(1);
  if (!txRows.length) return res.status(404).json({ error: "Транзакция не найдена" });

  const tx = txRows[0];
  if (tx.status !== "pending") {
    return res.status(400).json({ error: `Статус уже ${tx.status}` });
  }

  const tokensToAdd = Number(tx.tokensAmount);
  const rubAmount = tx.rubAmount ?? 0;

  const wallet = await ensureWallet(masterId);
  const newBalance = Number(wallet.tokensBalance) + tokensToAdd;
  const creditTokensIssued = Number((wallet as any).creditTokensIssued ?? 0);
  const creditTokensSpent = newBalance < 0 ? Math.min(creditTokensIssued, -newBalance) : 0;

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

  await db.update(walletTransactionsTable)
    .set({ status: "completed" })
    .where(eq(walletTransactionsTable.id, transaction_id));

  return res.json({
    success: true,
    tokens_added: tokensToAdd,
    new_balance: Number(updated.tokensBalance),
  });
});

// ─── Cancel purchase (admin) ─────────────────────────────────────────────────
router.post("/:masterId/cancel-purchase", adminOnly, async (req: any, res: any) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Неверный masterId" });

  const { transaction_id, reason } = req.body;
  if (!transaction_id) return res.status(400).json({ error: "transaction_id обязателен" });

  const txRows = await db.select().from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.id, transaction_id),
      eq(walletTransactionsTable.masterId, masterId),
      eq(walletTransactionsTable.type, "purchase"),
    ))
    .limit(1);
  if (!txRows.length) return res.status(404).json({ error: "Транзакция не найдена" });

  const tx = txRows[0];
  if (tx.status !== "pending") {
    return res.status(400).json({ error: `Статус уже ${tx.status}` });
  }

  const finalReason = reason ? `Отклонено: ${reason}` : "Отклонено администратором";

  await db.update(walletTransactionsTable)
    .set({
      status: "cancelled",
      reason: `${tx.reason ?? ""} | ${finalReason}`,
    })
    .where(eq(walletTransactionsTable.id, transaction_id));

  // Notify master via Max if possible
  const masterRows = await db.select({ maxChatId: mastersTable.maxChatId, alias: mastersTable.alias })
    .from(mastersTable)
    .where(eq(mastersTable.id, masterId))
    .limit(1);
  if (masterRows[0]?.maxChatId) {
    const { sendMaxMessage } = await import("../maxBot.js");
    sendMaxMessage(
      masterRows[0].maxChatId,
      `❌ Пополнение баланса отклонено\n${finalReason}`
    ).catch(() => {});
  }

  return res.json({ success: true });
});

// ─── Payment screenshot proxy ─────────────────────────────────────────────────
router.get("/payment-screenshot/:path(*)", async (req, res) => {
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) return res.status(500).json({ error: "Storage not configured" });
    const key = `${GCS_PAYMENT_PREFIX}${String(req.params["path(*)"] ?? "")}`;
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
