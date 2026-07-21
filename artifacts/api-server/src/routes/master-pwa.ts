import { Router } from "express";
import { db, mastersTable, ordersTable, orderDispatchesTable, transactionsTable, leadsTable, voronkaColumnsTable, masterMessagesTable, pushSubscriptionsTable, masterCheckinsTable, transactionPaymentsTable, orderMastersTable, masterDepositsTable, masterDepositTransactionsTable, receiptsTable, masterPublicationLogTable, masterPortfolioTable } from "@workspace/db";
import { maybeEarlyAssign } from "../lib/priorityAssign.js";
import { eq, and, inArray, isNull, ne, asc, desc, gte, sql } from "drizzle-orm";
import { verifyPassword, hashPassword } from "../lib/auth.js";
import { getMasterEligibility, getOverdueMasterIds, countActiveMasterOrders, getColumnIdForActiveCount, checkServiceFeeRequirement } from "../lib/orderEligibility.js";
import { deductServiceFee, getBalance, ensureAccountBalance } from "../lib/accountBalance.js";
import { computePaymentStateBatch, groupReceiptsByOrder } from "../lib/paymentState.js";
import multer from "multer";
import sharp from "sharp";
import { Readable } from "stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { objectStorageClient, s3Client } from "../lib/objectStorage.js";
import { getBotLink, sendOnboardingMemo, sendMaxMessage } from "../maxBot.js";
import { notifyManagerMasterResponse } from "../managerBot.js";
import { getFomoBlock, logFomoEvent, checkFomoTransition } from "../lib/fomoBlock.js";
import { sendPushToMaster } from "../lib/push.js";
import { sendPushToClient } from "../lib/clientPush.js";
import { performBroadcast } from "../lib/broadcastOrder.js";
import { createRateLimiter } from "../lib/rateLimit.js";
import { slugify, pickUniqueSlug } from "../lib/slug.js";
import {
  validatePublicBio,
  validatePublicTitle,
  validatePortfolioTitle,
  validatePortfolioDescription,
  checkMasterPublishReadiness,
  type ValidationError,
} from "../lib/marketplaceModeration.js";
import { revalidateMarketplacePaths, masterPublicationPaths, casePublicationPaths } from "../lib/marketplaceRevalidate.js";
import {
  smoothPortfolioDescription,
  assemblePortfolioDescription,
  AiContentDisabledError,
  type AssembleInput,
} from "../lib/aiContent.js";
import { getPendingActionsForMaster } from "../lib/stuckOrders.js";
import {
  listActiveWorkTypes,
  listObjectsForMaster,
  getObjectForOrder,
  saveObject,
  publishObjectForMaster,
  autoPublishObjectOnCompletion,
} from "../lib/objectService.js";
const authRateLimit = createRateLimiter({ windowMs: 60_000, maxAttempts: 5 });
const registerRateLimit = createRateLimiter({ windowMs: 60_000, maxAttempts: 3 });
const forgotPasswordRateLimit = createRateLimiter({ windowMs: 60_000, maxAttempts: 3 });

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"));
  },
});

async function uploadPwaAvatarToGCS(masterId: number, buffer: Buffer, mimetype: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("Object storage not configured");
  const ts = Date.now();
  const filename = `pwa-master-${masterId}-${ts}.jpg`;
  const key = `avatars/${filename}`;

  // Convert any input format (HEIC/JPEG/PNG) to JPEG 400×400 for browser compatibility
  const jpegBuffer = await sharp(buffer)
    .rotate() // auto-rotate based on EXIF
    .resize(400, 400, { fit: "cover", position: "center" })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();

  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(key).save(jpegBuffer, { contentType: "image/jpeg", resumable: false });
  // Return server proxy URL (same pattern as CRM) for reliable loading
  return `/api/masters/avatar/${filename}`;
}

// ─── Portfolio photo storage ────────────────────────────────────────────────
// Photos go through this server (multer + sharp) so we can normalize EXIF,
// resize, recompress and re-encode to JPEG. This protects R2 / future CDN from
// huge phone-original files (40MP HEIC = 6MB+) and gives the master a
// predictable URL pattern.
//
// Stored under `portfolio/` prefix to keep the bucket organised. Served via
// public proxy GET /api/master-pwa/portfolio-photo/:filename below.

const PORTFOLIO_PHOTO_PREFIX = "portfolio/";
const PORTFOLIO_PHOTO_MAX_SIDE = 1600;
const PORTFOLIO_PHOTO_QUALITY = 82;

const portfolioPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // raw input up to 8MB; we re-encode after
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"));
  },
});

async function uploadPortfolioPhotoToGCS(
  masterId: number,
  buffer: Buffer,
  type: "before" | "after",
): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("Object storage not configured");
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  // WebP for better Core Web Vitals (LCP) — 25-35% smaller than JPEG at
  // equivalent visual quality. Supported by 97%+ of browsers in 2026
  // including Yandex.Bot / Yandex.Images. Old .jpg uploads continue to
  // work via the proxy (regex below accepts both extensions).
  const filename = `pwa-master-${masterId}-${type}-${ts}-${rand}.webp`;
  const key = `${PORTFOLIO_PHOTO_PREFIX}${filename}`;

  const webpBuffer = await sharp(buffer)
    .rotate()
    .resize(PORTFOLIO_PHOTO_MAX_SIDE, PORTFOLIO_PHOTO_MAX_SIDE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: PORTFOLIO_PHOTO_QUALITY, effort: 4 })
    .toBuffer();

  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(key).save(webpBuffer, { contentType: "image/webp", resumable: false });
  return `/api/master-pwa/portfolio-photo/${filename}`;
}

const router = Router();

// Throttle last_seen_at updates: at most once per 60 seconds per master
const lastSeenThrottle = new Map<number, number>();

function requireMasterPwa(req: any, res: any, next: any) {
  const masterId = (req.session as any).masterId as number | undefined;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  // Fire-and-forget: update last_seen_at at most once per minute
  const now = Date.now();
  const last = lastSeenThrottle.get(masterId) ?? 0;
  if (now - last > 60_000) {
    lastSeenThrottle.set(masterId, now);
    db.update(mastersTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(mastersTable.id, masterId))
      .catch(() => {});
  }

  next();
}

async function getMasterById(id: number) {
  const rows = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  return rows[0] ?? null;
}

async function getOnSiteColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  // Find by name "На объекте" for precision; fallback to second non-receiving column
  return cols.find(c => c.name === "На объекте") ?? cols.filter(c => !c.receivesOrders)[1] ?? cols.find(c => !c.receivesOrders) ?? null;
}

async function getBusyColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  // Find dedicated "Занят" column; fallback to first non-receiving column after position 1
  return cols.find(c => c.name === "Занят") ?? cols.find(c => !c.receivesOrders && c.position > 1) ?? cols.find(c => !c.receivesOrders) ?? null;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

function normalizeLoginInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // If it looks like a phone number (10 or 11 digits)
  if (digits.length === 10) return "7" + digits;
  if (digits.length === 11 && digits[0] === "8") return "7" + digits.slice(1);
  if (digits.length === 11 && digits[0] === "7") return digits;
  // Otherwise treat as text login (return as-is)
  return raw.trim();
}

router.post("/auth/register", registerRateLimit, async (req, res) => {
  const { alias, phone, city, specialization, specializations, login, password, servicePrices, maxChatId } = req.body;

  if (!alias?.trim() || !city?.trim() || !specialization?.trim() || !login || !password) {
    return res.status(400).json({ error: "Заполните все обязательные поля" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Пароль должен быть не короче 6 символов" });
  }

  const normalizedLogin = normalizeLoginInput(login);
  if (normalizedLogin.length < 7) {
    return res.status(400).json({ error: "Введите корректный номер телефона" });
  }

  // Check login uniqueness
  const existing = await db.select().from(mastersTable).where(eq(mastersTable.pwaLogin, normalizedLogin));
  if (existing.length > 0) {
    return res.status(409).json({ error: "Этот номер уже зарегистрирован" });
  }

  const passwordHash = await hashPassword(password);

  // Find the "Свободен" column for new masters
  const cols = await db.select().from(voronkaColumnsTable);
  const freeCol = cols.find(c => c.name === "Свободен") ?? cols.find(c => c.receivesOrders);

  const [inserted] = await db.insert(mastersTable).values({
    alias: alias.trim(),
    city: city.trim(),
    specialization: specialization.trim(),
    specializations: Array.isArray(specializations) ? specializations : [specialization.trim()],
    phone: phone ? normalizeLoginInput(phone) : normalizedLogin,
    status: "active",
    pwaLogin: normalizedLogin,
    pwaPasswordHash: passwordHash,
    voronkaColumnId: freeCol?.id ?? null,
    maxChatId: maxChatId ? String(maxChatId) : null,
    servicePrices: Array.isArray(servicePrices) ? servicePrices : null,
  }).returning();

  (req.session as any).masterId = inserted.id;
  await ensureAccountBalance(inserted.id);

  // Log new self-registered master
  console.log(`[auth] self-register: new master ${inserted.id} (${inserted.alias}, ${inserted.city})`);

  res.json({
    id: inserted.id,
    alias: inserted.alias,
    city: inserted.city,
    specialization: inserted.specialization,
    rating: Number(inserted.rating),
    debt: Number(inserted.debt),
    phone: inserted.phone ?? null,
    status: inserted.status,
  });
});

router.post("/auth/login", authRateLimit, async (req, res) => {
  const { login, password, maxChatId } = req.body;
  if (!login || !password) return res.status(400).json({ error: "Укажите логин и пароль" });

  const normalizedLogin = normalizeLoginInput(login);

  const rows = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.pwaLogin, normalizedLogin), isNull(mastersTable.deletedAt)));
  const master = rows[0];

  if (!master || !master.pwaPasswordHash) {
    return res.status(401).json({ error: "Неверный логин или пароль" });
  }

  const valid = await verifyPassword(password, master.pwaPasswordHash);
  if (!valid) return res.status(401).json({ error: "Неверный логин или пароль" });

  // Block suspended masters from logging in
  if (master.status === "suspended") {
    return res.status(403).json({ error: "suspended", message: "Ваш аккаунт заблокирован. Обратитесь к менеджеру." });
  }

  // Safety: if admin has already verified passport + contract is signed but
  // status is still pending_contract due to a race/bug — auto-activate now.
  // NOTE: contractSignedAt alone is NOT enough — passportVerified must be true
  // (set by admin in CRM), otherwise we'd auto-activate before admin review.
  // Contract is no longer required upfront — auto-activate any legacy
  // pending_contract masters on login. Contract gating now happens at /respond.
  let effectiveStatus = master.status;
  if (master.status === "pending_contract") {
    await db.update(mastersTable)
      .set({ status: "active" })
      .where(eq(mastersTable.id, master.id));
    effectiveStatus = "active";
  }

  (req.session as any).masterId = master.id;

  // Link Max bot if maxChatId provided and not already set
  if (maxChatId && !master.maxChatId) {
    await db.update(mastersTable)
      .set({ maxChatId: String(maxChatId) })
      .where(eq(mastersTable.id, master.id));
  }

  res.json({
    id: master.id,
    alias: master.alias,
    city: master.city,
    specialization: master.specialization,
    rating: Number(master.rating),
    debt: Number(master.debt),
    phone: master.phone ?? null,
    status: effectiveStatus,
  });
});

// POST /api/master-pwa/auth/forgot-password
// Self-service: master enters phone + new password → password updated
// If newPassword is omitted, resets to phone number (backwards compat)
router.post("/auth/forgot-password", forgotPasswordRateLimit, async (req, res) => {
  const { phone, newPassword } = req.body;
  if (!phone) return res.status(400).json({ error: "Введите номер телефона" });

  const normalized = normalizeLoginInput(phone);
  if (normalized.length < 7) return res.status(400).json({ error: "Введите корректный номер телефона" });

  if (newPassword !== undefined && newPassword !== null && newPassword !== "") {
    if (typeof newPassword !== "string" || newPassword.length < 4) {
      return res.status(400).json({ error: "Пароль должен быть не короче 4 символов" });
    }
  }

  // Search by pwaLogin (exact) or phone (exact) — avoids loading entire table
  const [byLogin, byPhone] = await Promise.all([
    db.select({
      id: mastersTable.id, alias: mastersTable.alias,
      status: mastersTable.status, phone: mastersTable.phone, pwaLogin: mastersTable.pwaLogin,
    }).from(mastersTable).where(and(
      eq(mastersTable.pwaLogin, normalized),
      isNull(mastersTable.deletedAt)
    )).limit(1),
    db.select({
      id: mastersTable.id, alias: mastersTable.alias,
      status: mastersTable.status, phone: mastersTable.phone, pwaLogin: mastersTable.pwaLogin,
    }).from(mastersTable).where(and(
      eq(mastersTable.phone, normalized),
      isNull(mastersTable.deletedAt)
    )).limit(1),
  ]);

  const master = byLogin[0] ?? byPhone[0] ?? null;

  // Always return "success" even if not found — prevents phone enumeration
  if (!master) {
    return res.json({ success: true, login: normalized });
  }

  if (master.status === "suspended") {
    return res.status(403).json({ error: "Аккаунт заблокирован. Обратитесь к менеджеру." });
  }

  const passwordToSet = (newPassword && newPassword.trim()) ? newPassword.trim() : normalized;
  const hash = await hashPassword(passwordToSet);
  await db.update(mastersTable)
    .set({ pwaLogin: normalized, pwaPasswordHash: hash })
    .where(eq(mastersTable.id, master.id));

  console.log(`[auth] forgot-password: master ${master.id} (${master.alias}) set new password (custom=${!!newPassword})`);
  res.json({ success: true, login: normalized });
});

router.post("/auth/logout", (req, res) => {
  (req.session as any).masterId = null;
  res.json({ success: true });
});

router.get("/auth/me", async (req, res) => {
  const masterId = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const master = await getMasterById(masterId);
  if (!master || master.deletedAt) return res.status(401).json({ error: "Мастер не найден" });

  const maxBotLink = await getBotLink();

  res.json({
    id: master.id,
    alias: master.alias,
    city: master.city,
    specialization: master.specialization,
    specializations: master.specializations,
    rating: Number(master.rating),
    debt: Number(master.debt),
    phone: master.phone ?? null,
    status: master.status,
    totalOrders: master.totalOrders,
    acceptedOrders: master.acceptedOrders,
    isTestMaster: master.isTestMaster,
    customAvatarUrl: master.customAvatarUrl ?? null,
    pwaLogin: master.pwaLogin ?? null,
    maxChatId: master.maxChatId ?? null,
    maxBotLink: maxBotLink ?? null,
    contractSignedAt: master.contractSignedAt ?? null,
    passportVerified: master.passportVerified ?? false,
  });
});

// ─── HOME ─────────────────────────────────────────────────────────────────────

router.get("/home", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  // All dispatches for this master (sent + responded)
  const allDispatches = await db.select().from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.masterId, masterId), inArray(orderDispatchesTable.status, ["sent", "responded"])));

  const sentDispatches = allDispatches.filter(d => d.status === "sent");
  const respondedDispatches = allDispatches.filter(d => d.status === "responded");

  // Helper — parse photos field from lead (JSON array or comma-separated)
  function parsePhotos(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr.filter(Boolean); } catch {}
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  }

  // Smart filter settings from master profile.
  // NB: эти настройки БОЛЬШЕ НЕ скрывают заявки из списка (раньше `minArea` и
  // `preferredDistricts` жёстко фильтровали availableOrders, из-за чего
  // уведомлённый мастер не видел заявку — особенно потому, что `order.district`
  // хранит свободный адрес, а не название района, и подстрочный матч почти
  // никогда не срабатывал). Теперь решение принимает оператор: мастер видит
  // все заявки, на которые ему пришла рассылка (есть `order_dispatches='sent'`),
  // и может откликнуться. Поля оставлены для возможной мягкой сортировки/меток.
  const minArea = master.minArea ?? 0;
  const preferredDistricts: string[] = (master.preferredDistricts as string[]) ?? [];
  void minArea; void preferredDistricts;

  // Available orders — "sent" dispatches, order still accepting masters
  let availableOrders: any[] = [];
  if (sentDispatches.length > 0) {
    const orderIds = sentDispatches.map(d => d.orderId);
    // Exclude orders where this master is already assigned
    const alreadyAssigned = await db.select({ orderId: orderMastersTable.orderId })
      .from(orderMastersTable)
      .where(and(eq(orderMastersTable.masterId, masterId), inArray(orderMastersTable.orderId, orderIds)));
    const assignedSet = new Set(alreadyAssigned.map(r => r.orderId));
    const filteredOrderIds = orderIds.filter(oid => !assignedSet.has(oid));

    let orders = filteredOrderIds.length > 0
      ? await db.select().from(ordersTable)
          .where(and(
            inArray(ordersTable.id, filteredOrderIds),
            eq(ordersTable.status, "waiting_master"),
            isNull(ordersTable.deletedAt),
            sql`${ordersTable.assignedMasterCount} < ${ordersTable.maxMasters}`,
          ))
      : [];

    // Smart filters (minArea / preferredDistricts) НЕ применяются: уведомлённый
    // мастер должен видеть заявку и иметь возможность откликнуться; оператор
    // решает, принять отклик или нет. См. комментарий выше.

    // Fetch lead photos + client phones
    const leadIds = [...new Set(orders.map(o => o.leadId))];
    const leads = leadIds.length > 0 ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds)) : [];
    const leadMap = new Map(leads.map(l => [l.id, l]));
    const dispatchByOrder = new Map(sentDispatches.map(d => [d.orderId, d]));

    // Competitor count — how many other masters already responded to each order
    const competitorDispatches = orders.length > 0
      ? await db.select().from(orderDispatchesTable)
          .where(and(
            inArray(orderDispatchesTable.orderId, orders.map(o => o.id)),
            inArray(orderDispatchesTable.status, ["responded", "assigned"]),
            ne(orderDispatchesTable.masterId, masterId),
          ))
      : [];
    const competitorsByOrder = new Map<number, number>();
    for (const d of competitorDispatches) {
      competitorsByOrder.set(d.orderId, (competitorsByOrder.get(d.orderId) ?? 0) + 1);
    }

    // Repeat client — check if this master has completed an order from the same client phone before
    const masterCompletedOrders = await db.select({ leadId: ordersTable.leadId }).from(ordersTable)
      .where(and(eq(ordersTable.masterId, masterId), eq(ordersTable.status, "completed")));
    const completedLeadIds = masterCompletedOrders.map(o => o.leadId);
    const completedLeads = completedLeadIds.length > 0
      ? await db.select({ clientPhone: leadsTable.clientPhone }).from(leadsTable).where(inArray(leadsTable.id, completedLeadIds))
      : [];
    const knownPhones = new Set(completedLeads.map(l => l.clientPhone));

    availableOrders = orders.map(o => {
      const lead = leadMap.get(o.leadId);
      const clientPhone = lead?.clientPhone ?? null;
      return {
        id: o.id,
        leadId: o.leadId ?? null,
        city: o.city,
        district: o.district,
        serviceType: o.serviceType,
        services: o.services ?? null,
        area: Number(o.area),
        scheduledAt: o.scheduledAt ?? null,
        comment: o.comment ?? null,
        photos: parsePhotos(lead?.photos),
        dispatchedAt: dispatchByOrder.get(o.id)?.createdAt ?? null,
        competitorCount: competitorsByOrder.get(o.id) ?? 0,
        isRepeatClient: clientPhone ? knownPhones.has(clientPhone) : false,
        paymentModel: (o as any).paymentModel ?? "commission",
      };
    });
  }

  // Pending orders — master responded, waiting for operator to assign
  let pendingOrders: any[] = [];
  if (respondedDispatches.length > 0) {
    const orderIds = respondedDispatches.map(d => d.orderId);
    const orders = await db.select().from(ordersTable)
      .where(and(inArray(ordersTable.id, orderIds), eq(ordersTable.status, "waiting_master"), isNull(ordersTable.deletedAt)));
    const leadIds = [...new Set(orders.map(o => o.leadId))];
    const leads = leadIds.length > 0 ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds)) : [];
    const leadMap = new Map(leads.map(l => [l.id, l]));
    const dispatchByOrder = new Map(respondedDispatches.map(d => [d.orderId, d]));
    pendingOrders = orders.map(o => ({
      id: o.id,
      leadId: o.leadId ?? null,
      city: o.city,
      district: o.district,
      serviceType: o.serviceType,
      services: o.services ?? null,
      area: Number(o.area),
      scheduledAt: o.scheduledAt ?? null,
      comment: o.comment ?? null,
      photos: parsePhotos(leadMap.get(o.leadId)?.photos),
      respondedAt: dispatchByOrder.get(o.id)?.respondedAt ?? null,
    }));
  }

  // Active orders (assigned to me — legacy + order_masters)
  const legacyActive = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      inArray(ordersTable.status, ["master_assigned", "in_progress", "cancellation_requested"]),
      isNull(ordersTable.deletedAt)
    ));
  const omActiveIds = await db.select({ orderId: orderMastersTable.orderId })
    .from(orderMastersTable)
    .innerJoin(ordersTable, eq(orderMastersTable.orderId, ordersTable.id))
    .where(and(
      eq(orderMastersTable.masterId, masterId),
      eq(orderMastersTable.status, "active"),
      inArray(ordersTable.status, ["master_assigned", "in_progress", "cancellation_requested", "waiting_master"]),
      isNull(ordersTable.deletedAt),
    ));
  const legacyIds = new Set(legacyActive.map(o => o.id));
  const missingOmIds = omActiveIds.map(r => r.orderId).filter(id => !legacyIds.has(id));
  let activeOrders = [...legacyActive];
  if (missingOmIds.length > 0) {
    const missing = await db.select().from(ordersTable)
      .where(and(inArray(ordersTable.id, missingOmIds), isNull(ordersTable.deletedAt)));
    activeOrders.push(...missing);
  }

  // Availability — based on voronka column receivesOrders flag
  let isAvailable = true;
  if (master.voronkaColumnId) {
    const colRows = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId));
    if (colRows[0]) isAvailable = colRows[0].receivesOrders ?? false;
  }

  const orderLimit = master.maxActiveOrders ?? 1;

  // ─── Missed orders & today's activity (FOMO feed) ────────────────────────
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activeOrderIds = new Set(activeOrders.map(o => o.id));

  // Orders in master's city that went to another master in the last 48h
  const recentlyTakenRaw = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.city, master.city),
      inArray(ordersTable.status, ["master_assigned", "in_progress", "completed"]),
      gte(ordersTable.updatedAt, since48h),
      isNull(ordersTable.deletedAt),
    ))
    .orderBy(desc(ordersTable.updatedAt))
    .limit(20);

  // Exclude master's own orders, pick the 5 most recent
  const missedOrdersRaw = recentlyTakenRaw
    .filter(o => !activeOrderIds.has(o.id) && o.masterId !== masterId)
    .slice(0, 5);

  const missedOrders = missedOrdersRaw.map(o => ({
    id: o.id,
    serviceType: o.serviceType,
    district: o.district ?? null,
    area: Number(o.area),
    takenAt: o.updatedAt ?? o.createdAt,
    wasDispatched: false, // will fill below
  }));

  // Mark which of those were dispatched to this master (so he actually saw them)
  if (missedOrders.length > 0) {
    const missedIds = missedOrders.map(o => o.id);
    const dispatchedToMe = await db.select({ orderId: orderDispatchesTable.orderId })
      .from(orderDispatchesTable)
      .where(and(
        inArray(orderDispatchesTable.orderId, missedIds),
        eq(orderDispatchesTable.masterId, masterId),
      ));
    const dispatchedSet = new Set(dispatchedToMe.map(d => d.orderId));
    for (const o of missedOrders) {
      o.wasDispatched = dispatchedSet.has(o.id);
    }
  }

  // Today's activity — how many orders appeared in master's city in last 24h
  const todayOrders = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.city, master.city),
      gte(ordersTable.createdAt, since24h),
      isNull(ordersTable.deletedAt),
    ));
  const todayActivity = {
    total: todayOrders.length,
    taken: todayOrders.filter(o => ["master_assigned", "in_progress", "completed"].includes(o.status)).length,
  };

  // FOMO block status
  const fomoBlock = await getFomoBlock(masterId, master.isTestMaster);
  // Background: check if status changed (for unblock notifications)
  checkFomoTransition(masterId, master.isTestMaster).catch(() => {});

  res.json({
    master: {
      id: master.id,
      alias: master.alias,
      city: master.city,
      specialization: master.specialization,
      rating: Number(master.rating),
      debt: Number(master.debt),
      isTestMaster: master.isTestMaster,
      isAvailable,
      orderLimit,
      activeOrdersCount: activeOrders.length,
    },
    fomoBlock,
    availableOrders,
    pendingOrders,
    missedOrders,
    todayActivity,
    activeOrders: activeOrders.map(o => ({
      id: o.id,
      leadId: o.leadId ?? null,
      city: o.city,
      district: o.district,
      serviceType: o.serviceType,
      area: Number(o.area),
      scheduledAt: o.scheduledAt ?? null,
      status: o.status,
      masterWorkStatus: o.masterWorkStatus ?? null,
      proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
      paymentModel: (o as any).paymentModel ?? "token",
      tokensCharged: (o as any).tokensCharged ? Number((o as any).tokensCharged) : null,
      assignedAt: (o as any).assignedAt ?? null,
    })),
  });
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────

router.get("/orders/available", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;

  const dispatches = await db.select().from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.masterId, masterId), eq(orderDispatchesTable.status, "sent")));

  if (dispatches.length === 0) return res.json([]);

  const orderIds = dispatches.map(d => d.orderId);
  const alreadyAssigned = await db.select({ orderId: orderMastersTable.orderId })
    .from(orderMastersTable)
    .where(and(eq(orderMastersTable.masterId, masterId), inArray(orderMastersTable.orderId, orderIds)));
  const assignedSet = new Set(alreadyAssigned.map(r => r.orderId));
  const filteredOrderIds = orderIds.filter(oid => !assignedSet.has(oid));

  const orders = filteredOrderIds.length > 0
    ? await db.select().from(ordersTable)
        .where(and(
          inArray(ordersTable.id, filteredOrderIds),
          eq(ordersTable.status, "waiting_master"),
          isNull(ordersTable.deletedAt),
          sql`${ordersTable.assignedMasterCount} < ${ordersTable.maxMasters}`,
        ))
    : [];

  const dispatchByOrder = new Map(dispatches.map(d => [d.orderId, d]));

  const result = orders.map(o => ({
    id: o.id,
    leadId: o.leadId ?? null,
    city: o.city,
    district: o.district,
    serviceType: o.serviceType,
    area: Number(o.area),
    scheduledAt: o.scheduledAt ?? null,
    comment: o.comment ?? null,
    dispatchedAt: dispatchByOrder.get(o.id)?.createdAt ?? null,
  }));

  // Newest dispatched orders first, so a freshly broadcast order appears at the
  // top of the master's feed (fall back to order id for a stable tiebreak).
  result.sort((a, b) => {
    const ta = a.dispatchedAt ? new Date(a.dispatchedAt).getTime() : 0;
    const tb = b.dispatchedAt ? new Date(b.dispatchedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return b.id - a.id;
  });

  res.json(result);
});

router.get("/orders/my", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const { filter } = req.query;

  let statusFilter: string[];
  if (filter === "active") {
    statusFilter = ["master_assigned", "in_progress", "cancellation_requested", "waiting_master"];
  } else if (filter === "completed") {
    statusFilter = ["completed", "cancelled"];
  } else {
    statusFilter = ["master_assigned", "in_progress", "cancellation_requested", "refund_requested", "completed", "cancelled", "waiting_master"];
  }

  // Legacy orders by masterId
  const legacyOrders = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      inArray(ordersTable.status, statusFilter as any),
      isNull(ordersTable.deletedAt)
    ));

  // Also include orders from order_masters where this master is active
  const omRows = await db.select({ orderId: orderMastersTable.orderId })
    .from(orderMastersTable)
    .where(and(eq(orderMastersTable.masterId, masterId), eq(orderMastersTable.status, "active")));
  const omOrderIds = omRows.map(r => r.orderId);
  const missingIds = omOrderIds.filter(oid => !legacyOrders.some(o => o.id === oid));

  let orders = [...legacyOrders];
  if (missingIds.length > 0) {
    const missing = await db.select().from(ordersTable)
      .where(and(inArray(ordersTable.id, missingIds), inArray(ordersTable.status, statusFilter as any), isNull(ordersTable.deletedAt)));
    orders.push(...missing);
  }

  // Get lead info for client data
  const leadIds = [...new Set(orders.map(o => o.leadId))];
  const leads = leadIds.length > 0
    ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds))
    : [];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  // Fetch transaction info for all orders
  const orderIds = orders.map(o => o.id);
  let txMap = new Map<number, any>();
  if (orderIds.length > 0) {
    const txRows = await db.select().from(transactionsTable).where(inArray(transactionsTable.orderId, orderIds));
    for (const t of txRows) {
      if (!txMap.has(t.orderId)) txMap.set(t.orderId, t);
    }
  }

  // Payment_State engine — Phase 2 of estimate-optional-flow.
  // Загружаем receipts ПО ВСЕМ orders (не только этого мастера) — чтобы не
  // упустить чужие receipts если они есть. На практике receipts привязаны
  // к одному мастеру, но это безопасный default для computePaymentState.
  const receiptsForState = orderIds.length > 0
    ? await db.select({
        orderId: receiptsTable.orderId,
        prepaymentAmount: receiptsTable.prepaymentAmount,
        prepaymentSeenAt: receiptsTable.prepaymentSeenAt,
        prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
        masterId: receiptsTable.masterId,
      }).from(receiptsTable).where(inArray(receiptsTable.orderId, orderIds))
    : [];
  const receiptsByOrder = groupReceiptsByOrder(receiptsForState);
  const paymentStateMap = computePaymentStateBatch(orders as any, receiptsByOrder);
  // Master видит свои собственные receipts, чтобы решить показывать ли ему
  // подсказку "оператор зафиксировал сумму, смета не нужна".
  const masterReceiptOrderIds = new Set(
    receiptsForState.filter(r => r.masterId === masterId).map(r => r.orderId)
  );

  res.json(orders.map(o => {
    const lead = leadMap.get(o.leadId);
    const tx = txMap.get(o.id);
    return {
      id: o.id,
      leadId: o.leadId ?? null,
      city: o.city,
      district: o.district,
      serviceType: o.serviceType,
      area: Number(o.area),
      scheduledAt: o.scheduledAt ?? null,
      comment: o.comment ?? null,
      status: o.status,
      masterWorkStatus: o.masterWorkStatus ?? null,
      proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
      orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
      commission: o.commission ? Number(o.commission) : null,
      photosBefore: o.photosBefore ?? [],
      photosAfter: o.photosAfter ?? [],
      photoAct: o.photoAct ?? null,
      clientName: lead?.clientName ?? null,
      clientPhone: lead?.clientPhone ?? null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      paymentModel: (o as any).paymentModel ?? "commission",
      tokensCharged: (o as any).tokensCharged ? Number((o as any).tokensCharged) : null,
      assignedAt: (o as any).assignedAt ?? null,
      // Payment_State engine fields — для подсказки "Оператор зафиксировал сумму".
      paymentState: paymentStateMap.get(o.id) ?? "no_amount",
      agreementAmountSource: (o as any).agreementAmountSource ?? null,
      hasOwnReceipt: masterReceiptOrderIds.has(o.id),
      transactionInfo: tx ? {
        orderAmount: Number(tx.orderAmount),
        commission: Number(tx.commission),
        prepaymentDeducted: Number(tx.prepaymentDeducted ?? 0),
        paymentStatus: tx.paymentStatus,
        paidAt: tx.paidAt ?? null,
      } : null,
    };
  }));
});

// Accept order
router.post("/orders/:id/accept", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(String(req.params.id));

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  // Contract gate — must have signed contract AND admin-verified passport
  if (!master.contractSignedAt || !master.passportVerified) {
    return res.json({
      needsContract: true,
      contractSigned: !!master.contractSignedAt,
      passportVerified: !!master.passportVerified,
    });
  }

  // Check the dispatch exists
  const dispatches = await db.select().from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.masterId, masterId), eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.status, "sent")));
  if (!dispatches[0]) return res.status(404).json({ error: "Заказ не найден или уже принят другим мастером" });

  // Check order is still available
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order || order.status !== "waiting_master") {
    return res.status(400).json({ error: "Заказ больше недоступен" });
  }

  // Check master column allows orders
  if (master.voronkaColumnId) {
    const colRows = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId));
    if (colRows[0] && !colRows[0].receivesOrders) {
      return res.status(400).json({ error: "Вы не можете принимать заказы в текущем статусе" });
    }
  }

  // Check order eligibility (limit + debt + overdue)
  const allActiveForAccept = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
  const myActiveForAccept = allActiveForAccept.filter(o => o.masterId === masterId).length;
  const overdueIdsForAccept = await getOverdueMasterIds();
  const acceptEligibility = getMasterEligibility(master, myActiveForAccept, overdueIdsForAccept);
  if (!acceptEligibility.canAccept) {
    return res.status(400).json({ error: acceptEligibility.reason });
  }

  // Check balance for service fee (or test order waiver)
  const feeCheck = await checkServiceFeeRequirement(masterId);
  if (!feeCheck.ok) {
    return res.status(400).json({ error: feeCheck.reason });
  }

  // Deduct service fee (waived for test orders)
  const { countTestOrders } = await import("../lib/accountBalance.js");
  const isTestEligible = await countTestOrders(masterId) < 2;
  const feeResult = await deductServiceFee(masterId, orderId, {
    isTest: master.isTestMaster && isTestEligible,
    reason: master.isTestMaster && isTestEligible ? "Тестовый заказ — сервисный сбор не списан" : undefined,
  });
  if (!feeResult.success) {
    return res.status(400).json({ error: feeResult.error });
  }

  // Check if master already assigned
  const existingAssignment = await db.select().from(orderMastersTable)
    .where(and(eq(orderMastersTable.orderId, orderId), eq(orderMastersTable.masterId, masterId)));
  if (existingAssignment.length > 0) {
    return res.status(400).json({ error: "Вы уже назначены на этот заказ" });
  }

  // Check order still has room
  const currentAssignedCount = (order as any).assignedMasterCount ?? 0;
  const maxMasters = (order as any).maxMasters ?? 3;
  if (currentAssignedCount >= maxMasters) {
    return res.status(400).json({ error: "Заказ уже занят максимальным числом мастеров" });
  }

  // Add to order_masters
  await db.insert(orderMastersTable).values({
    orderId,
    masterId,
    status: "active",
  });

  const newCount = currentAssignedCount + 1;
  const isFull = newCount >= maxMasters;

  const orderUpdates: any = {
    assignedMasterCount: newCount,
    updatedAt: new Date(),
    ...( !order.masterId ? { masterId } : {} ),
    masterWorkStatus: "accepted",
  };

  if (isFull) {
    orderUpdates.status = "master_assigned";
    orderUpdates.dispatchStatus = "assigned";
    await db.update(orderDispatchesTable)
      .set({ status: "rejected" })
      .where(and(
        eq(orderDispatchesTable.orderId, orderId),
        eq(orderDispatchesTable.status, "sent"),
      ));
  }

  await db.update(ordersTable).set(orderUpdates).where(eq(ordersTable.id, orderId));

  // Update this dispatch to assigned
  await db.update(orderDispatchesTable).set({ status: "assigned", respondedAt: new Date() })
    .where(eq(orderDispatchesTable.id, dispatches[0].id));

  // Update master stats and move to correct column based on active order count
  const activeAfterAccept = myActiveForAccept + 1;
  const targetColId = await getColumnIdForActiveCount(activeAfterAccept);
  await db.update(mastersTable).set({
    totalOrders: master.totalOrders + 1,
    acceptedOrders: master.acceptedOrders + 1,
    voronkaColumnId: targetColId ?? master.voronkaColumnId,
  }).where(eq(mastersTable.id, masterId));

  // Create placeholder transaction
  const existingTx = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, orderId));
  if (existingTx.length === 0) {
    await db.insert(transactionsTable).values({
      orderId,
      masterId,
      orderAmount: "0",
      commission: "0",
      serviceFee: "500",
      paymentStatus: "pending",
    });
  }

  // First order ever → send onboarding memo via Max after short delay
  if (master.acceptedOrders === 0 && master.maxChatId) {
    setTimeout(() => sendOnboardingMemo(master.maxChatId!).catch(() => {}), 10_000);
  }

  res.json({ success: true });
});

// Respond to order (express interest — operator will assign)
router.post("/orders/:id/respond", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(String(req.params.id));

  // Load master profile up-front — нужен для тегов и для `master.contractSignedAt`
  // (раньше переменная `master` использовалась без объявления → 500).
  const master = await getMasterById(masterId);
  if (!master) return res.status(401).json({ error: "Профиль мастера не найден" });

  const dispatches = await db.select().from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.masterId, masterId), eq(orderDispatchesTable.orderId, orderId), inArray(orderDispatchesTable.status, ["sent", "responded"])));
  if (!dispatches[0]) return res.status(404).json({ error: "Заявка не найдена или вы уже откликнулись" });

  // Idempotent: already responded → return success without re-processing
  if (dispatches[0].status === "responded") {
    const wasAtLimit = (dispatches[0].responseNote ?? "").includes("Лимит");
    if (wasAtLimit) {
      const allActive = await db.select().from(ordersTable)
        .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
      const myActive = allActive.filter(o => o.masterId === masterId);
      return res.json({ atLimit: true, activeOrderId: myActive[0]?.id ?? null });
    }
    return res.json({ success: true, alreadyResponded: true });
  }

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order || order.status !== "waiting_master") {
    return res.status(400).json({ error: "Заявка больше недоступна" });
  }

  // Collect constraint tags — master can always respond, but operator sees their status
  const constraintTags: string[] = [];

  // Contract / passport check → tag, don't block
  const noContract = !master.contractSignedAt || !master.passportVerified;
  if (noContract) {
    constraintTags.push("Без договора");
  }

  // ── Репутация: тег при отмене(ах) подряд, отклик принимаем всегда ─────────
  // 0 отменённых = нет тега. 1 = "Репутация" (soft warning, мастер ещё в обойме).
  // 2+ = "Автоблок" (приоритет нулевой, оператор разблокирует вручную).
  // Тег видит и мастер (с объяснением в UI), и оператор в CRM (в responseNote).
  if (master.blockedFromOrders) {
    constraintTags.push("Автоблок");
  } else if ((master.consecutiveCancellations ?? 0) >= 1) {
    constraintTags.push("Репутация");
  }

  // FOMO block check → tag, don't block (still log event)
  const fomoStatus = await getFomoBlock(masterId, master.isTestMaster);
  if (fomoStatus.isBlocked) {
    await logFomoEvent(masterId, "button_press", fomoStatus.reason, fomoStatus.orderId ?? undefined);
    constraintTags.push("ФОМО");
  }

  // Check order eligibility (limit + debt + overdue)
  const allActive = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
  const myActiveForRespond = allActive.filter(o => o.masterId === masterId);
  const myActiveCount = myActiveForRespond.length;
  const overdueMasterIds = await getOverdueMasterIds();
  const eligibility = getMasterEligibility(master, myActiveCount, overdueMasterIds);

  // Overdue debt → tag, don't block (operator sees the reason in CRM)
  if (overdueMasterIds.has(masterId)) {
    constraintTags.push("Долг");
  }

  // Лимит активных заказов — тег, отклик принимаем как обычно.
  // 0 отменённых = нет тега. Лимит виден оператору в CRM (responseNote)
  // и мастеру в PWA (constrained_success c подсказкой).
  if (myActiveCount >= (master.maxActiveOrders ?? 1)) {
    constraintTags.push("Лимит");
  }

  // Balance check for commission orders — tag, don't block yet.
  // Existing token-orders (paymentModel='token' rows from before token model
  // was removed) are skipped from balance check — their tokens were already
  // deducted at respond time, no rouble service fee applies.
  const isCommissionOrder = (order as any).paymentModel !== "token";
  if (isCommissionOrder) {
    const balanceCheck = await checkServiceFeeRequirement(masterId);
    if (!balanceCheck.ok) {
      constraintTags.push("Баланс");
    }
  }

  // Any remaining eligibility block (e.g. test-master unpaid debt) → tag, not block
  if (!eligibility.canAccept && constraintTags.length === 0) {
    constraintTags.push("Ограничение");
  }

  const { responseNote: bodyNote } = req.body ?? {};

  // Build final responseNote: constraint tags first, then master's own note
  const tagPrefix = constraintTags.length > 0 ? `⚠️ ${constraintTags.join(", ")}` : null;
  const masterNote = bodyNote ? String(bodyNote).trim().slice(0, 400) : null;
  const finalNote = [tagPrefix, masterNote].filter(Boolean).join(" | ") || null;

  await db.update(orderDispatchesTable)
    .set({
      status: "responded",
      respondedAt: new Date(),
      responseNote: finalNote,
    })
    .where(eq(orderDispatchesTable.id, dispatches[0].id));

  // Notify operator — create a chat message so it appears in CRM master chat
  const chatId = master.telegramId ?? `pwa_${master.id}`;
  const noteText = masterNote ? `\n💬 ${masterNote}` : "";
  const tagText = tagPrefix ? ` [${constraintTags.join(", ")}]` : "";
  await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: chatId,
    text: `🙋 Откликнулся на заявку #${orderId} (${order.serviceType}, ${order.city}${order.district ? ", " + order.district : ""})${tagText}${noteText}`,
    fromMaster: true,
    senderName: master.alias,
    isRead: false,
  });

  // Notify manager bot
  notifyManagerMasterResponse(orderId, master.alias, true).catch(() => {});

  // Early assignment if 5+ masters have responded
  maybeEarlyAssign(orderId).catch(e => console.error("[respond] maybeEarlyAssign error:", e));

  res.json({
    success: true,
    ...(constraintTags.length > 0 ? { constraintTags, constraintNote: tagPrefix } : {}),
  });
});

// Log FOMO button press
router.post("/fomo-block-press", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const { orderId, reason } = req.body ?? {};
  await logFomoEvent(masterId, "button_press", reason ?? null, orderId ?? null);
  res.json({ ok: true });
});

// Reject order
router.post("/orders/:id/reject", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(String(req.params.id));
  const { reason } = req.body ?? {};

  await db.update(orderDispatchesTable).set({
    status: "rejected",
    respondedAt: new Date(),
    rejectionReason: reason ? String(reason).trim().slice(0, 200) : null,
  })
    .where(and(
      eq(orderDispatchesTable.masterId, masterId),
      eq(orderDispatchesTable.orderId, orderId),
      inArray(orderDispatchesTable.status, ["sent", "responded"]),
    ));

  // Notify manager bot about rejection (non-blocking)
  getMasterById(masterId).then(m => {
    if (m) notifyManagerMasterResponse(orderId, m.alias, false).catch(() => {});
  }).catch(() => {});

  res.json({ success: true });
});

// Update master work status
router.patch("/orders/:id/status", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(String(req.params.id));
  const { masterWorkStatus } = req.body;

  if (!masterWorkStatus) return res.status(400).json({ error: "Статус обязателен" });

  const orderRows = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId)));
  if (!orderRows[0]) return res.status(404).json({ error: "Заказ не найден" });

  const updates: any = { masterWorkStatus, updatedAt: new Date() };
  if (masterWorkStatus === "on_site") updates.status = "in_progress";

  await db.update(ordersTable).set(updates).where(eq(ordersTable.id, orderId));
  res.json({ success: true, masterWorkStatus });
});

// Update photos
router.patch("/orders/:id/photos", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(String(req.params.id));
  const { type, url } = req.body;

  if (!type || !url) return res.status(400).json({ error: "type и url обязательны" });

  const orderRows = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId)));
  if (!orderRows[0]) return res.status(404).json({ error: "Заказ не найден" });

  const order = orderRows[0];

  if (type === "before") {
    await db.update(ordersTable).set({ photosBefore: [...(order.photosBefore ?? []), url], updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));
  } else if (type === "after") {
    await db.update(ordersTable).set({ photosAfter: [...(order.photosAfter ?? []), url], updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));
  } else if (type === "act") {
    await db.update(ordersTable).set({ photoAct: url, updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));
  } else {
    return res.status(400).json({ error: "Неверный тип: before | after | act" });
  }

  res.json({ success: true });
});

// Complete order
router.post("/orders/:id/complete", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(String(req.params.id));
  const { proposedAmount } = req.body;

  if (!proposedAmount || isNaN(Number(proposedAmount))) {
    return res.status(400).json({ error: "Укажите сумму заказа" });
  }

  const orderRows = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId)));
  if (!orderRows[0]) return res.status(404).json({ error: "Заказ не найден" });

  await db.update(ordersTable).set({
    proposedAmount: String(proposedAmount),
    status: "completed",
    masterWorkStatus: "completed",
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, orderId));

  // Репутация: завершение из мобильного приложения сбрасывает счётчик подряд отменённых
  const { recordOrderCompleted } = await import("../lib/masterReputation.js");
  await recordOrderCompleted(masterId).catch(e =>
    console.error("[master-pwa] recordOrderCompleted error:", e),
  );

  // Real Price: авто-публикация богатого проекта с согласием клиента (Req 6.2).
  autoPublishObjectOnCompletion(masterId, orderId)
    .then((published) => {
      if (published) console.log(`[master-pwa] Объект заказа ${orderId} авто-опубликован при завершении`);
    })
    .catch((e) => console.error("[master-pwa] autoPublishObjectOnCompletion error:", e instanceof Error ? e.message : e));

  res.json({ success: true });
});

// ─── BALANCE ──────────────────────────────────────────────────────────────────

router.get("/balance", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  const txRows = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.masterId, masterId));

  // Get orders for each transaction
  const orderIds = txRows.map(t => t.orderId);
  const orders = orderIds.length > 0
    ? await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds))
    : [];
  const orderMap = new Map(orders.map(o => [o.id, o]));

  const realTxs = txRows.filter(t => Number(t.commission) > 0);

  // Fetch partial payments for all transactions
  const txIds = realTxs.map(t => t.id);
  const partials = txIds.length > 0
    ? await db.select().from(transactionPaymentsTable)
        .where(inArray(transactionPaymentsTable.transactionId, txIds))
    : [];
  const partialsMap = new Map<number, typeof partials>();
  for (const p of partials) {
    const arr = partialsMap.get(p.transactionId) ?? [];
    arr.push(p);
    partialsMap.set(p.transactionId, arr);
  }

  const paidTxs = realTxs.filter(t => t.paymentStatus === "paid");
  const pendingTxs = realTxs.filter(t => t.paymentStatus === "pending" || t.paymentStatus === "overdue");

  const totalEarned = paidTxs.reduce((s, t) => s + Number(t.orderAmount), 0);
  const totalPaidCommission = paidTxs.reduce((s, t) => s + Number(t.commission), 0);
  const pendingCommission = pendingTxs.reduce((s, t) => s + Number(t.commission), 0);
  const pendingEarnings = pendingTxs.reduce((s, t) => s + Number(t.orderAmount), 0);

  const balanceInfo = await getBalance(masterId);

  res.json({
    debt: Number(master.debt),
    balance: balanceInfo.balance,
    creditLimit: balanceInfo.creditLimit,
    availableBalance: balanceInfo.available,
    totalServiceFeesSpent: balanceInfo.totalServiceFeesSpent,
    totalEarned,
    totalPaidCommission,
    pendingCommission,
    pendingEarnings,
    transactions: realTxs.map(t => {
      const order = orderMap.get(t.orderId);
      const txPartials = partialsMap.get(t.id) ?? [];
      const prepaymentDeducted = Number(t.prepaymentDeducted ?? 0);
      const totalPartialPaid = txPartials.reduce((s, p) => s + Number(p.amount), 0);
      const commission = Number(t.commission);
      return {
        id: t.id,
        orderId: t.orderId,
        orderServiceType: order?.serviceType ?? null,
        orderCity: order?.city ?? null,
        orderAmount: Number(t.orderAmount),
        commission,
        prepaymentDeducted,
        totalPartialPaid,
        netPayable: Math.max(0, commission - prepaymentDeducted - totalPartialPaid),
        partialPayments: txPartials.map(p => ({
          id: p.id,
          amount: Number(p.amount),
          note: p.note ?? null,
          paidAt: p.paidAt,
        })),
        paymentStatus: t.paymentStatus,
        createdAt: t.createdAt,
        paidAt: t.paidAt ?? null,
      };
    }),
  });
});

// Cancel order (request cancellation)
router.post("/orders/:id/cancel", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(String(req.params.id));
  const { cancelType, reason } = req.body as {
    cancelType?: "client_refused" | "price_disagreement" | "master_cant" | "other";
    reason?: string;
  };

  if (!cancelType) return res.status(400).json({ error: "Укажите причину отмены" });
  if (!reason?.trim() || reason.trim().length < 150) {
    return res.status(400).json({ error: "Комментарий должен содержать не менее 150 символов" });
  }

  const orderRows = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId)));
  if (!orderRows[0]) return res.status(404).json({ error: "Заказ не найден" });

  const order = orderRows[0];
  if (!["master_assigned", "in_progress"].includes(order.status)) {
    return res.status(400).json({ error: "Нельзя отменить заказ в текущем статусе" });
  }

  // ── Полуавто: client_site + token → сразу в эфир, токены не возвращаются ──
  if (order.source === "client_site" && (order as any).paymentModel === "token") {
    // Reset order for re-broadcast
    await db.update(ordersTable).set({
      status: "waiting_master",
      masterId: null,
      dispatchStatus: "none",
      cancelType: null,
      cancelReason: null,
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, orderId));

    // Decrement master order counters
    await db.update(mastersTable)
      .set({
        totalOrders: sql`${mastersTable.totalOrders} - 1`,
        acceptedOrders: sql`${mastersTable.acceptedOrders} - 1`,
      })
      .where(eq(mastersTable.id, masterId));

    // Delete old sent dispatches so other masters can see it again
    await db.delete(orderDispatchesTable)
      .where(and(
        eq(orderDispatchesTable.orderId, orderId),
        eq(orderDispatchesTable.status, "sent"),
      ));

    // Re-broadcast (force=true to clear previous state)
    const broadcastResult = await performBroadcast(orderId, true);

    // Notify client
    const clientPhone = order.clientPhone;
    if (clientPhone) {
      sendPushToClient(clientPhone, {
        type: "searching_new_master",
        title: "Ищем другого мастера",
        body: "Мастер отказался от заказа. Ищем замену...",
        orderId,
      }).catch(() => {});
    }

    return res.json({ success: true, rebroadcast: broadcastResult });
  }

  // ── Обычный flow: запрос на отмену → оператор решает ──────────────────────
  const typeLabels: Record<string, string> = {
    client_refused: "Клиент отказался",
    price_disagreement: "Не договорились по цене",
    master_cant: "Не могу выполнить",
    other: "Другая причина",
  };
  const fullReason = reason?.trim()
    ? `${typeLabels[cancelType]}: ${reason.trim()}`
    : typeLabels[cancelType];

  await db.update(ordersTable).set({
    status: "cancellation_requested",
    cancelType,
    cancelReason: fullReason,
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, orderId));

  res.json({ success: true });
});

// Submit payment proof (sent as chat message with photo)
router.post("/balance/payment-proof", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const { photoUrl } = req.body;

  if (!photoUrl) return res.status(400).json({ error: "Фото обязательно" });

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  const chatId = master.telegramId ?? `pwa_${master.id}`;

  await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: chatId,
    text: `📸 Скриншот оплаты комиссии`,
    photoUrl,
    fromMaster: true,
    senderName: master.alias,
    isRead: false,
  });

  res.json({ success: true });
});

// Update profile (PATCH)
//
// Single endpoint for everything master changes about themselves. Auto-publishes
// to chestnye-mastera.ru on the first save where all readiness conditions are
// met (see lib/marketplaceModeration.ts → checkMasterPublishReadiness).
// MARKETPLACE_PRODUCTION_PLAN.md §11.5: marketplace is a public portal, so a
// filled profile = a public profile. There is no master-side «hide» — that's
// reserved for operator override via CRM (later iteration).
//
// Behaviour summary:
//   • Always saves valid drafts. Max-length cap is enforced; full text
//     auto-moderation runs only on already-published profiles or before the
//     auto-publish moment (so masters can save partial bios).
//   • Already-published master + change to publicBio/publicTitle: re-runs
//     auto-moderation, blocks save on violation (atomic 400, nothing saved).
//   • Never-published master, all conditions met after this save: auto-publish
//     (slug-gen + log + revalidate). publishedAt is set once and stays.
//   • publishedAt set + isPublished=false (operator hid via CRM): just save,
//     no auto-republish — the operator's decision wins.
router.patch("/profile", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const {
    alias, city, phone, specializations, workingHours, preferredDistricts,
    minArea, servicePrices,
    publicTitle, publicBio, yearsExperience,
  } = req.body;

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  const updates: any = {};
  if (alias?.trim()) updates.alias = alias.trim();
  if (city?.trim()) updates.city = city.trim();
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (Array.isArray(specializations) && specializations.length > 0) {
    updates.specializations = specializations;
    updates.specialization = specializations.join(", ");
  }
  if (workingHours !== undefined) updates.workingHours = workingHours;
  if (Array.isArray(preferredDistricts)) updates.preferredDistricts = preferredDistricts;
  if (minArea !== undefined) updates.minArea = Math.max(0, parseInt(String(minArea)) || 0);
  if (servicePrices !== undefined) updates.servicePrices = Array.isArray(servicePrices)
    ? servicePrices.filter((p: any) => p.service && typeof p.priceFrom === "number" && p.priceFrom > 0)
    : null;

  // ── City change: reject open dispatches from orders in the OLD city ──────
  // When master moves cities, pending dispatches for orders in the old city
  // should be auto-rejected so they don't show in the feed anymore.
  if (city?.trim()) {
    const newCity = city.trim();
    const masterRow = await db.select({ city: mastersTable.city }).from(mastersTable).where(eq(mastersTable.id, masterId)).limit(1);
    const oldCity = masterRow[0]?.city;
    if (oldCity && oldCity !== newCity) {
      // Reject all 'sent' dispatches for orders NOT in the new city
      await db.execute(sql`
        UPDATE order_dispatches od
        SET status = 'rejected', updated_at = NOW()
        FROM orders o
        WHERE od.order_id = o.id
          AND od.master_id = ${masterId}
          AND od.status = 'sent'
          AND o.city != ${newCity}
      `);
      console.log(`[profile] master ${masterId} city changed ${oldCity} → ${newCity}: rejected stale dispatches`);
    }
  }

  // ── Marketplace draft fields ────────────────────────────────────────────
  // For published masters: re-run automoderation on each change to public text.
  // For unpublished masters: only enforce max-length so partial drafts are OK.
  const moderationErrors: ValidationError[] = [];

  if (publicTitle !== undefined) {
    const value = String(publicTitle ?? "").trim();
    if (value.length > 150) {
      moderationErrors.push({
        field: "publicTitle",
        code: "TOO_LONG",
        message: `Максимум 150 символов, у вас ${value.length}.`,
      });
    } else if (value.length > 0 && master.isPublished) {
      const r = validatePublicTitle(value);
      if (!r.ok) moderationErrors.push(...r.errors);
    }
    updates.publicTitle = value || null;
  }

  if (publicBio !== undefined) {
    const value = String(publicBio ?? "").trim();
    if (value.length > 2000) {
      moderationErrors.push({
        field: "publicBio",
        code: "TOO_LONG",
        message: `Максимум 2000 символов, у вас ${value.length}.`,
      });
    } else if (value.length > 0 && master.isPublished) {
      const r = validatePublicBio(value);
      if (!r.ok) moderationErrors.push(...r.errors);
    }
    updates.publicBio = value || null;
  }

  if (yearsExperience !== undefined) {
    const raw = yearsExperience;
    if (raw === null || raw === "") {
      updates.yearsExperience = null;
    } else {
      const n = parseInt(String(raw), 10);
      if (!Number.isFinite(n) || n < 0 || n > 70) {
        moderationErrors.push({
          field: "yearsExperience",
          code: "INVALID_YEARS_EXPERIENCE",
          message: "Опыт работы должен быть числом от 0 до 70.",
        });
      } else {
        updates.yearsExperience = n;
      }
    }
  }

  if (moderationErrors.length > 0) {
    if (master.isPublished) {
      await db.insert(masterPublicationLogTable).values({
        masterId,
        actor: "master",
        actorId: masterId,
        action: "automoderation_block",
        changes: { errors: moderationErrors, source: "patch_profile" },
        ip: req.ip ?? null,
      }).catch(() => {});
    }
    return res.status(400).json({ ok: false, errors: moderationErrors });
  }

  if (Object.keys(updates).length > 0) {
    await db.update(mastersTable).set(updates).where(eq(mastersTable.id, masterId));
  }

  // ── Auto-publish gate ──────────────────────────────────────────────────
  // Only on first publish. Operator-hidden state is respected — if publishedAt
  // is already set, master can't auto-republish themselves (CRM controls that).
  let autoPublishedSlug: string | null = null;
  let readinessErrors: ValidationError[] = [];

  if (!master.publishedAt) {
    // Build post-update master snapshot for readiness check.
    const merged = { ...master, ...updates };
    readinessErrors = checkMasterPublishReadiness(merged);

    if (readinessErrors.length === 0) {
      const base = slugify(String(merged.alias ?? "").trim());
      const isTaken = async (cand: string): Promise<boolean> => {
        const rows = await db.select({ id: mastersTable.id })
          .from(mastersTable)
          .where(and(eq(mastersTable.slug, cand), ne(mastersTable.id, masterId)))
          .limit(1);
        return rows.length > 0;
      };
      const slug = await pickUniqueSlug(base, isTaken);
      const now = new Date();

      await db.update(mastersTable).set({
        isPublished: true,
        slug,
        publishedAt: now,
      }).where(eq(mastersTable.id, masterId));

      await db.insert(masterPublicationLogTable).values({
        masterId,
        actor: "master",
        actorId: masterId,
        action: "publish",
        changes: { source: "auto_on_save" },
        ip: req.ip ?? null,
      }).catch(() => {});

      revalidateMarketplacePaths(masterPublicationPaths(slug)).catch(() => {});
      autoPublishedSlug = slug;
    }
  } else if (master.isPublished && master.slug && (
    "publicBio" in updates || "publicTitle" in updates || "yearsExperience" in updates
  )) {
    // Already published — refresh public page after content edit.
    revalidateMarketplacePaths(masterPublicationPaths(master.slug)).catch(() => {});
  }

  const baseUrl = process.env["MARKETPLACE_PUBLIC_URL"]?.replace(/\/$/, "") ?? "";
  const finalSlug = autoPublishedSlug ?? master.slug ?? null;
  const finalIsPublished = autoPublishedSlug !== null || master.isPublished;
  const profileUrl = finalIsPublished && finalSlug && baseUrl
    ? `${baseUrl}/master/${finalSlug}`
    : null;

  res.json({
    ok: true,
    success: true,
    autoPublished: autoPublishedSlug !== null,
    isPublished: finalIsPublished,
    slug: finalSlug,
    publishedAt: autoPublishedSlug ? new Date() : (master.publishedAt ?? null),
    profileUrl,
    readinessErrors,
  });
});

// ─── PROFILE ──────────────────────────────────────────────────────────────────

router.get("/profile", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  // Compute derived stats
  const totalOrders = master.totalOrders;
  const acceptedOrders = master.acceptedOrders;
  const conversionRate = totalOrders > 0 ? Math.round((acceptedOrders / totalOrders) * 100) : 0;

  const txRows = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.masterId, masterId)));
  const realTxs = txRows.filter(t => Number(t.commission) > 0);
  const paidOnTime = realTxs.filter(t => t.paymentStatus === "paid").length;
  const paymentRate = realTxs.length > 0 ? Math.round((paidOnTime / realTxs.length) * 100) : 100;

  // Dynamic order counts from actual orders table
  const activeCount = await db.select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      inArray(ordersTable.status, ["master_assigned", "in_progress", "cancellation_requested"]),
      isNull(ordersTable.deletedAt),
    ));

  const completedCount = await db.select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      eq(ordersTable.status, "completed"),
      isNull(ordersTable.deletedAt),
    ));

  const cancelledCount = await db.select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      eq(ordersTable.status, "cancelled"),
      isNull(ordersTable.deletedAt),
    ));

  const totalCount = await db.select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      isNull(ordersTable.deletedAt),
    ));

  const maxBotLink = await getBotLink();

  res.json({
    id: master.id,
    alias: master.alias,
    city: master.city,
    specialization: master.specialization,
    specializations: master.specializations,
    phone: master.phone ?? null,
    rating: Number(master.rating),
    debt: Number(master.debt),
    totalOrders: Number(totalCount[0]?.count ?? 0),
    acceptedOrders: master.acceptedOrders,
    isTestMaster: master.isTestMaster,
    customAvatarUrl: master.customAvatarUrl ?? null,
    contractSignedAt: master.contractSignedAt ?? null,
    tags: master.tags,
    workingHours: master.workingHours ?? null,
    preferredDistricts: master.preferredDistricts ?? [],
    minArea: master.minArea ?? 0,
    servicePrices: master.servicePrices ?? [],
    stats: {
      conversionRate,
      paymentRate,
    },
    activeCount: Number(activeCount[0]?.count ?? 0),
    completedCount: Number(completedCount[0]?.count ?? 0),
    cancelledCount: Number(cancelledCount[0]?.count ?? 0),
    maxChatId: master.maxChatId ?? null,
    maxBotLink: maxBotLink ?? null,
    createdAt: master.createdAt,
    // ── Marketplace publication state ──────────────────────────────────────
    slug: master.slug ?? null,
    isPublished: master.isPublished,
    publishedAt: master.publishedAt ?? null,
    publicTitle: master.publicTitle ?? null,
    publicBio: master.publicBio ?? null,
    yearsExperience: master.yearsExperience ?? null,
    profileUrl: master.isPublished && master.slug && process.env["MARKETPLACE_PUBLIC_URL"]
      ? `${process.env["MARKETPLACE_PUBLIC_URL"].replace(/\/$/, "")}/master/${master.slug}`
      : null,
  });
});

// ─── AVATAR UPLOAD ────────────────────────────────────────────────────────────

router.post("/profile/avatar", requireMasterPwa, avatarUpload.single("avatar"), async (req, res) => {
  const masterId = (req.session as any).masterId;
  if (!req.file) return res.status(400).json({ error: "Файл не получен" });
  console.log("[avatar upload] received file:", req.file.originalname, "size:", req.file.size, "mimetype:", req.file.mimetype);
  try {
    const avatarUrl = await uploadPwaAvatarToGCS(masterId, req.file.buffer, req.file.mimetype);
    console.log("[avatar upload] saved to:", avatarUrl);
    const [updated] = await db.update(mastersTable)
      .set({ customAvatarUrl: avatarUrl })
      .where(eq(mastersTable.id, masterId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Мастер не найден" });
    res.json({ customAvatarUrl: avatarUrl });
  } catch (err: any) {
    console.error("[avatar upload] failed:", err);
    res.status(500).json({ error: err.message ?? "Upload failed" });
  }
});

// ─── PORTFOLIO ────────────────────────────────────────────────────────────────
//
// Self-service portfolio for master-pwa (see MARKETPLACE_PRODUCTION_PLAN.md §11.5).
// Master adds before/after cases that appear on /master/[slug] on the marketplace.
//
//   GET    /portfolio                — list mine (drafts + published)
//   POST   /portfolio                — create new case (no photos yet)
//   PATCH  /portfolio/:id            — update case fields
//   DELETE /portfolio/:id            — hard-delete case (V1; soft-delete later)
//   POST   /portfolio/:id/photos     — upload one photo (type=before|after)
//   DELETE /portfolio/:id/photos     — remove one photo URL from arrays
//
// Auto-moderation rules:
//   - title    5–200 chars, full text moderation
//   - description 50–2000 chars, full text moderation
//   - case is published only if both texts pass moderation AND ≥1 photo present
//
// Limits:
//   - max 30 cases per master (count check on POST)
//   - max 10 photos per type per case

const PORTFOLIO_CASES_PER_MASTER_LIMIT = 30;
const PORTFOLIO_PHOTOS_PER_TYPE_LIMIT = 10;

// Public proxy for serving stored photos. Matches the avatar pattern in
// routes/masters.ts. No auth — these are publicly displayed on chestnye-mastera.ru.
const TRANSPARENT_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=",
  "base64",
);

router.get("/portfolio-photo/:filename", async (req, res) => {
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(TRANSPARENT_PIXEL_PNG);
    }
    // Defensive: only allow filenames matching our generated pattern.
    // Accepts .jpg (legacy uploads) and .webp (new uploads).
    if (!/^[a-zA-Z0-9._-]+\.(jpg|webp)$/i.test(req.params.filename)) {
      return res.status(400).json({ error: "Bad filename" });
    }
    const key = `${PORTFOLIO_PHOTO_PREFIX}${req.params.filename}`;
    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucketId, Key: key }));
    // Use S3 stored content-type (image/webp or image/jpeg) so browsers
    // decode correctly. Fall back to image/jpeg only if R2 didn't store one.
    res.setHeader("Content-Type", response.ContentType || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (response.Body) {
      const stream = response.Body as unknown as NodeJS.ReadableStream;
      stream.pipe(res);
    } else {
      res.end();
    }
  } catch (err: any) {
    if (err?.Code === "NoSuchKey" || err?.name === "NoSuchKey") {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(TRANSPARENT_PIXEL_PNG);
    }
    console.error("[portfolio photo proxy] error:", err);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.status(200).send(TRANSPARENT_PIXEL_PNG);
  }
});

// DTO mapper — mirrors the public marketplace DTO so the master sees what the
// public sees. Includes draft fields (isPublished=false) too.
function toPortfolioPwaDto(p: typeof masterPortfolioTable.$inferSelect) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    serviceTypeId: p.serviceTypeId,
    cityId: p.cityId,
    beforePhotos: p.beforePhotos ?? [],
    afterPhotos: p.afterPhotos ?? [],
    priceFrom: p.priceFrom,
    priceTo: p.priceTo,
    area: p.area,
    durationDays: p.durationDays,
    housingType: p.housingType,
    estimate: p.estimate,
    completedAt: p.completedAt,
    clientReviewText: p.clientReviewText,
    clientRating: p.clientRating,
    isPublished: p.isPublished,
    isFeatured: p.isFeatured,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * Validate text fields and decide whether the case can be auto-published.
 * Caller passes the merged "post-update" snapshot (existing record + incoming
 * patch) so we can check independently of order of saves.
 */
function evaluatePortfolioReadiness(input: {
  title: string | null;
  description: string | null;
  beforePhotos: string[];
  afterPhotos: string[];
}): { errors: ValidationError[]; canPublish: boolean } {
  const errors: ValidationError[] = [];
  const title = input.title?.trim() ?? "";
  if (title.length === 0) {
    errors.push({ field: "title", code: "MISSING_TITLE", message: "Заполните название кейса." });
  } else {
    const r = validatePortfolioTitle(title);
    if (!r.ok) errors.push(...r.errors);
  }
  const desc = input.description?.trim() ?? "";
  if (desc.length === 0) {
    errors.push({ field: "description", code: "MISSING_DESCRIPTION", message: "Опишите работу — что делали, что получилось." });
  } else {
    const r = validatePortfolioDescription(desc);
    if (!r.ok) errors.push(...r.errors);
  }
  const totalPhotos = input.beforePhotos.length + input.afterPhotos.length;
  if (totalPhotos === 0) {
    errors.push({ field: "photos", code: "MISSING_PHOTOS", message: "Загрузите хотя бы одно фото — до или после." });
  }
  return { errors, canPublish: errors.length === 0 };
}

/**
 * Build a stable, SEO-friendly slug for a portfolio case. Format:
 *   `{slugify(title)}-{caseId}` — e.g. "remont-vannoy-pod-klyuch-42".
 *
 * The numeric `caseId` suffix is what makes the slug deterministic and
 * guaranteed unique across the whole `master_portfolio` table (same id can
 * never repeat). It also keeps URLs short and humans-readable.
 *
 * Falls back to `case-{caseId}` if the title is empty/non-slugifiable.
 *
 * Length-capped at 150 chars (matching `master_portfolio.slug` varchar(150)).
 * Slug is generated ONCE when the case becomes ready and then preserved
 * forever — even if the master later renames the case, the URL stays stable
 * (SEO-critical: a changed slug breaks search engine ranking).
 */
function buildPortfolioSlug(title: string | null | undefined, caseId: number): string {
  const titlePart = (title ?? "").trim();
  const base = titlePart.length > 0 ? slugify(titlePart) : "";
  const idSuffix = `-${caseId}`;
  const maxLen = 150;
  const baseMax = maxLen - idSuffix.length;
  const trimmedBase = base.length > 0 ? base.slice(0, baseMax) : `case`;
  // Strip trailing hyphens after slice
  const cleaned = trimmedBase.replace(/-+$/g, "") || "case";
  return `${cleaned}${idSuffix}`;
}

/**
 * If the portfolio row has no slug yet, generate one from its title and
 * persist it. Idempotent — never overwrites an existing slug (URL stability).
 *
 * Best-effort: any DB error is swallowed (slug is a nice-to-have for /raboty
 * URLs, the case still works on the master profile page without it).
 */
async function ensurePortfolioSlug(
  caseId: number,
  currentSlug: string | null | undefined,
  title: string | null | undefined,
): Promise<string | null> {
  if (currentSlug && currentSlug.length > 0) return currentSlug;
  const slug = buildPortfolioSlug(title, caseId);
  try {
    await db.update(masterPortfolioTable)
      .set({ slug })
      .where(and(
        eq(masterPortfolioTable.id, caseId),
        isNull(masterPortfolioTable.slug),
      ));
    return slug;
  } catch {
    // Unique-violation on slug is highly unlikely (id suffix guarantees uniqueness)
    // but if some other code path inserted the same slug concurrently, we just
    // leave the row without a slug. Background backfill task can fix it later.
    return null;
  }
}

// GET /portfolio — list mine (master sees own drafts and published cases)
router.get("/portfolio", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const rows = await db
    .select()
    .from(masterPortfolioTable)
    .where(eq(masterPortfolioTable.masterId, masterId))
    .orderBy(
      desc(masterPortfolioTable.isFeatured),
      asc(masterPortfolioTable.sortOrder),
      desc(masterPortfolioTable.createdAt),
    );
  res.json({
    items: rows.map(toPortfolioPwaDto),
    limit: PORTFOLIO_CASES_PER_MASTER_LIMIT,
    used: rows.length,
  });
});

// POST /portfolio — create a new case (no photos yet, isPublished stays false
// until photos are added and texts pass moderation).
router.post("/portfolio", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const { title, description, serviceTypeId, cityId, priceFrom, priceTo, area, completedAt } = req.body ?? {};

  // Limit check
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(masterPortfolioTable)
    .where(eq(masterPortfolioTable.masterId, masterId));
  if (Number(count) >= PORTFOLIO_CASES_PER_MASTER_LIMIT) {
    return res.status(400).json({
      ok: false,
      errors: [{
        code: "LIMIT_REACHED",
        message: `Достигнут лимит ${PORTFOLIO_CASES_PER_MASTER_LIMIT} кейсов. Удалите старые перед добавлением новых.`,
      }],
    });
  }

  // Pre-flight moderation on incoming texts (caller can still save partial drafts —
  // empty title/description are accepted as "draft", but if filled they must pass).
  const moderationErrors: ValidationError[] = [];
  const titleStr = typeof title === "string" ? title.trim() : "";
  const descStr = typeof description === "string" ? description.trim() : "";
  if (titleStr.length > 0) {
    const r = validatePortfolioTitle(titleStr);
    if (!r.ok) moderationErrors.push(...r.errors);
  }
  if (descStr.length > 0) {
    const r = validatePortfolioDescription(descStr);
    if (!r.ok) moderationErrors.push(...r.errors);
  }
  if (moderationErrors.length > 0) {
    return res.status(400).json({ ok: false, errors: moderationErrors });
  }

  // Validate optional FK references
  let serviceTypeIdValue: number | null = null;
  if (serviceTypeId != null) {
    const id = parseInt(String(serviceTypeId), 10);
    if (Number.isFinite(id) && id > 0) serviceTypeIdValue = id;
  }
  let cityIdValue: number | null = null;
  if (cityId != null) {
    const id = parseInt(String(cityId), 10);
    if (Number.isFinite(id) && id > 0) cityIdValue = id;
  }

  const [created] = await db
    .insert(masterPortfolioTable)
    .values({
      masterId,
      title: titleStr || "Без названия",
      description: descStr || null,
      serviceTypeId: serviceTypeIdValue,
      cityId: cityIdValue,
      priceFrom: priceFrom != null && priceFrom !== "" ? String(priceFrom) : null,
      priceTo: priceTo != null && priceTo !== "" ? String(priceTo) : null,
      area: area != null && area !== "" ? String(area) : null,
      completedAt: completedAt ? new Date(completedAt) : null,
      isPublished: false, // can't publish without photos yet
    })
    .returning();
  // Eager slug generation if the master typed a real title up-front. Slug is
  // a stable URL handle (`/raboty/{slug}`) and is preserved forever once set.
  const finalSlug = await ensurePortfolioSlug(created.id, created.slug, created.title);
  res.json({ ok: true, item: toPortfolioPwaDto({ ...created, slug: finalSlug ?? created.slug }) });
});

// PATCH /portfolio/:id — update fields. Re-evaluates publishability on each
// save so adding the last required photo (or fixing bio) auto-publishes.
router.patch("/portfolio/:id", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Bad id" });

  const [existing] = await db
    .select()
    .from(masterPortfolioTable)
    .where(and(eq(masterPortfolioTable.id, id), eq(masterPortfolioTable.masterId, masterId)));
  if (!existing) return res.status(404).json({ error: "Кейс не найден" });

  const { title, description, serviceTypeId, cityId, priceFrom, priceTo, area, completedAt, durationDays, housingType, estimate } = req.body ?? {};

  const moderationErrors: ValidationError[] = [];
  const updates: Partial<typeof masterPortfolioTable.$inferInsert> = {};

  if (title !== undefined) {
    const value = String(title ?? "").trim();
    if (value.length > 200) {
      moderationErrors.push({ field: "title", code: "TOO_LONG", message: `Максимум 200 символов, у вас ${value.length}.` });
    } else if (value.length > 0) {
      const r = validatePortfolioTitle(value);
      if (!r.ok) moderationErrors.push(...r.errors);
    }
    updates.title = value || "Без названия";
  }
  if (description !== undefined) {
    const value = String(description ?? "").trim();
    if (value.length > 2000) {
      moderationErrors.push({ field: "description", code: "TOO_LONG", message: `Максимум 2000 символов, у вас ${value.length}.` });
    } else if (value.length > 0) {
      const r = validatePortfolioDescription(value);
      if (!r.ok) moderationErrors.push(...r.errors);
    }
    updates.description = value || null;
  }
  if (serviceTypeId !== undefined) {
    if (serviceTypeId === null || serviceTypeId === "") {
      updates.serviceTypeId = null;
    } else {
      const n = parseInt(String(serviceTypeId), 10);
      if (Number.isFinite(n) && n > 0) updates.serviceTypeId = n;
    }
  }
  if (cityId !== undefined) {
    if (cityId === null || cityId === "") {
      updates.cityId = null;
    } else {
      const n = parseInt(String(cityId), 10);
      if (Number.isFinite(n) && n > 0) updates.cityId = n;
    }
  }
  if (priceFrom !== undefined) {
    updates.priceFrom = priceFrom == null || priceFrom === "" ? null : String(priceFrom);
  }
  if (priceTo !== undefined) {
    updates.priceTo = priceTo == null || priceTo === "" ? null : String(priceTo);
  }
  if (area !== undefined) {
    updates.area = area == null || area === "" ? null : String(area);
  }
  if (completedAt !== undefined) {
    updates.completedAt = completedAt ? new Date(completedAt) : null;
  }
  // ── Iteration 2 fields (plan §22) ──────────────────────────────────────
  if (durationDays !== undefined) {
    if (durationDays == null || durationDays === "") {
      updates.durationDays = null;
    } else {
      const n = parseInt(String(durationDays), 10);
      if (!Number.isFinite(n) || n < 1 || n > 365) {
        moderationErrors.push({
          field: "durationDays",
          code: "OUT_OF_RANGE",
          message: "Срок должен быть от 1 до 365 дней.",
        });
      } else {
        updates.durationDays = n;
      }
    }
  }
  if (housingType !== undefined) {
    if (housingType == null || housingType === "") {
      updates.housingType = null;
    } else {
      const allowed = ["novostroyka", "vtorichka", "chastnyy_dom", "kommerciya"] as const;
      if (allowed.includes(housingType as (typeof allowed)[number])) {
        updates.housingType = housingType as (typeof allowed)[number];
      } else {
        moderationErrors.push({
          field: "housingType",
          code: "INVALID_VALUE",
          message: "Неизвестный тип жилья.",
        });
      }
    }
  }
  if (estimate !== undefined) {
    if (estimate == null) {
      updates.estimate = null;
    } else if (typeof estimate === "object" && estimate !== null) {
      const works = Number((estimate as { works?: unknown }).works);
      const materials = Number((estimate as { materials?: unknown }).materials);
      const totalRaw = (estimate as { total?: unknown }).total;
      const totalParsed = totalRaw == null ? undefined : Number(totalRaw);
      if (!Number.isFinite(works) || works < 0 || works > 10_000_000) {
        moderationErrors.push({
          field: "estimate.works",
          code: "OUT_OF_RANGE",
          message: "Стоимость работ должна быть от 0 до 10 000 000 ₽.",
        });
      } else if (!Number.isFinite(materials) || materials < 0 || materials > 10_000_000) {
        moderationErrors.push({
          field: "estimate.materials",
          code: "OUT_OF_RANGE",
          message: "Стоимость материалов должна быть от 0 до 10 000 000 ₽.",
        });
      } else if (totalParsed != null && (!Number.isFinite(totalParsed) || totalParsed < 0 || totalParsed > 20_000_000)) {
        moderationErrors.push({
          field: "estimate.total",
          code: "OUT_OF_RANGE",
          message: "Итог сметы должен быть от 0 до 20 000 000 ₽.",
        });
      } else {
        updates.estimate = {
          works: Math.round(works),
          materials: Math.round(materials),
          ...(totalParsed != null ? { total: Math.round(totalParsed) } : {}),
        };
      }
    } else {
      moderationErrors.push({
        field: "estimate",
        code: "INVALID_VALUE",
        message: "Смета должна быть объектом со стоимостью работ и материалов.",
      });
    }
  }

  if (moderationErrors.length > 0) {
    return res.status(400).json({ ok: false, errors: moderationErrors });
  }

  // Always recompute isPublished based on the merged state.
  const merged = { ...existing, ...updates };
  const readiness = evaluatePortfolioReadiness({
    title: merged.title ?? null,
    description: merged.description ?? null,
    beforePhotos: merged.beforePhotos ?? [],
    afterPhotos: merged.afterPhotos ?? [],
  });
  updates.isPublished = readiness.canPublish;
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(masterPortfolioTable)
    .set(updates)
    .where(eq(masterPortfolioTable.id, id))
    .returning();

  // Generate slug on first save with a real title. Idempotent — never
  // overwrites an existing slug, so updates here are safe even if the master
  // changes the title later.
  const finalSlug = await ensurePortfolioSlug(updated.id, updated.slug, updated.title);
  const slugForRevalidate = finalSlug ?? updated.slug;

  // Revalidate marketplace whenever a published (or formerly-published)
  // case is touched. We always revalidate the case page itself + the master
  // profile + the /raboty feed; the IndexNow ping inside revalidateMarketplacePaths
  // submits the URLs to Yandex/Bing for instant indexing.
  const wasOrIsPublished = existing.isPublished || updated.isPublished;
  if (wasOrIsPublished) {
    const [m] = await db.select({ slug: mastersTable.slug, isPublished: mastersTable.isPublished })
      .from(mastersTable)
      .where(eq(mastersTable.id, masterId))
      .limit(1);
    if (m?.isPublished && m.slug) {
      revalidateMarketplacePaths(casePublicationPaths(m.slug, slugForRevalidate)).catch(() => {});
    }
  }

  res.json({ ok: true, item: toPortfolioPwaDto({ ...updated, slug: slugForRevalidate }) });
});

// DELETE /portfolio/:id — hard-delete (V1; can switch to soft-delete later).
router.delete("/portfolio/:id", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Bad id" });

  const [existing] = await db
    .select({
      id: masterPortfolioTable.id,
      slug: masterPortfolioTable.slug,
      wasPublished: masterPortfolioTable.isPublished,
    })
    .from(masterPortfolioTable)
    .where(and(eq(masterPortfolioTable.id, id), eq(masterPortfolioTable.masterId, masterId)));
  if (!existing) return res.status(404).json({ error: "Кейс не найден" });

  await db
    .delete(masterPortfolioTable)
    .where(and(eq(masterPortfolioTable.id, id), eq(masterPortfolioTable.masterId, masterId)));

  if (existing.wasPublished) {
    const [m] = await db.select({ slug: mastersTable.slug, isPublished: mastersTable.isPublished })
      .from(mastersTable)
      .where(eq(mastersTable.id, masterId))
      .limit(1);
    if (m?.isPublished && m.slug) {
      // Revalidate the deleted case URL so it 404s instantly + master profile
      // + /raboty feed where the card disappears.
      revalidateMarketplacePaths(casePublicationPaths(m.slug, existing.slug)).catch(() => {});
    }
  }

  res.json({ ok: true });
});

// POST /portfolio/:id/photos?type=before|after — upload one photo
router.post("/portfolio/:id/photos", requireMasterPwa, portfolioPhotoUpload.single("photo"), async (req, res) => {
  const masterId = (req.session as any).masterId;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Bad id" });

  const type = String(req.query["type"] ?? req.body?.type ?? "").toLowerCase();
  if (type !== "before" && type !== "after") {
    return res.status(400).json({ error: "type=before|after is required" });
  }
  if (!req.file) return res.status(400).json({ error: "Файл не получен" });

  const [existing] = await db
    .select()
    .from(masterPortfolioTable)
    .where(and(eq(masterPortfolioTable.id, id), eq(masterPortfolioTable.masterId, masterId)));
  if (!existing) return res.status(404).json({ error: "Кейс не найден" });

  const currentPhotos = type === "before" ? (existing.beforePhotos ?? []) : (existing.afterPhotos ?? []);
  if (currentPhotos.length >= PORTFOLIO_PHOTOS_PER_TYPE_LIMIT) {
    return res.status(400).json({
      ok: false,
      errors: [{
        code: "PHOTO_LIMIT_REACHED",
        message: `Максимум ${PORTFOLIO_PHOTOS_PER_TYPE_LIMIT} фото на каждый тип (до/после).`,
      }],
    });
  }

  let url: string;
  try {
    url = await uploadPortfolioPhotoToGCS(masterId, req.file.buffer, type);
  } catch (err: any) {
    console.error("[portfolio upload]", err);
    return res.status(500).json({ error: err?.message ?? "Upload failed" });
  }

  const newPhotos = [...currentPhotos, url];
  const updates: Partial<typeof masterPortfolioTable.$inferInsert> = {
    [type === "before" ? "beforePhotos" : "afterPhotos"]: newPhotos,
    updatedAt: new Date(),
  };

  // Recompute isPublished
  const mergedBefore = type === "before" ? newPhotos : (existing.beforePhotos ?? []);
  const mergedAfter = type === "after" ? newPhotos : (existing.afterPhotos ?? []);
  const readiness = evaluatePortfolioReadiness({
    title: existing.title,
    description: existing.description,
    beforePhotos: mergedBefore,
    afterPhotos: mergedAfter,
  });
  updates.isPublished = readiness.canPublish;

  const [updated] = await db
    .update(masterPortfolioTable)
    .set(updates)
    .where(eq(masterPortfolioTable.id, id))
    .returning();

  // Adding a photo can flip canPublish to true; ensure we have a slug for
  // the case so /raboty/{slug} can be linked from the master profile.
  const finalSlug = await ensurePortfolioSlug(updated.id, updated.slug, updated.title);
  const slugForRevalidate = finalSlug ?? updated.slug;

  // Revalidate marketplace whenever a published (or formerly-published) case
  // is touched. Adding a new photo to a published case changes the gallery,
  // so we need to refresh ISR even when the publish state hasn't flipped.
  if (existing.isPublished || updated.isPublished) {
    const [m] = await db.select({ slug: mastersTable.slug, isPublished: mastersTable.isPublished })
      .from(mastersTable)
      .where(eq(mastersTable.id, masterId))
      .limit(1);
    if (m?.isPublished && m.slug) {
      revalidateMarketplacePaths(casePublicationPaths(m.slug, slugForRevalidate)).catch(() => {});
    }
  }

  res.json({ ok: true, url, item: toPortfolioPwaDto({ ...updated, slug: slugForRevalidate }) });
});

// DELETE /portfolio/:id/photos — remove one URL from before/after arrays.
// Body: { type: 'before' | 'after', url: string }
router.delete("/portfolio/:id/photos", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Bad id" });

  const type = String(req.body?.type ?? "").toLowerCase();
  const url = typeof req.body?.url === "string" ? req.body.url : "";
  if (type !== "before" && type !== "after") {
    return res.status(400).json({ error: "type=before|after is required" });
  }
  if (!url) return res.status(400).json({ error: "url is required" });

  const [existing] = await db
    .select()
    .from(masterPortfolioTable)
    .where(and(eq(masterPortfolioTable.id, id), eq(masterPortfolioTable.masterId, masterId)));
  if (!existing) return res.status(404).json({ error: "Кейс не найден" });

  const currentPhotos = type === "before" ? (existing.beforePhotos ?? []) : (existing.afterPhotos ?? []);
  const newPhotos = currentPhotos.filter((p) => p !== url);
  if (newPhotos.length === currentPhotos.length) {
    // Already gone — idempotent: 200 with current state.
    return res.json({ ok: true, item: toPortfolioPwaDto(existing) });
  }

  const updates: Partial<typeof masterPortfolioTable.$inferInsert> = {
    [type === "before" ? "beforePhotos" : "afterPhotos"]: newPhotos,
    updatedAt: new Date(),
  };

  const mergedBefore = type === "before" ? newPhotos : (existing.beforePhotos ?? []);
  const mergedAfter = type === "after" ? newPhotos : (existing.afterPhotos ?? []);
  const readiness = evaluatePortfolioReadiness({
    title: existing.title,
    description: existing.description,
    beforePhotos: mergedBefore,
    afterPhotos: mergedAfter,
  });
  updates.isPublished = readiness.canPublish;

  const [updated] = await db
    .update(masterPortfolioTable)
    .set(updates)
    .where(eq(masterPortfolioTable.id, id))
    .returning();

  if (existing.isPublished || updated.isPublished) {
    const [m] = await db.select({ slug: mastersTable.slug, isPublished: mastersTable.isPublished })
      .from(mastersTable)
      .where(eq(mastersTable.id, masterId))
      .limit(1);
    if (m?.isPublished && m.slug) {
      revalidateMarketplacePaths(casePublicationPaths(m.slug, updated.slug)).catch(() => {});
    }
  }

  res.json({ ok: true, item: toPortfolioPwaDto(updated) });
});

// ─── Portfolio description helpers (V1.7 — assemble + AI smooth) ────────────
//
// These two endpoints power the "Помощник" UI in the master-pwa portfolio
// editor (plan §11.7.6 / discussion in chat about SEO + AI safety):
//
//   POST /portfolio/assemble-description  — pure template, no AI. Takes
//        5 short structured fields and returns a coherent paragraph.
//   POST /portfolio/smooth-description    — AI light copy-edit. Takes one
//        text and returns the same text with grammar smoothed. Strictly
//        no fact additions (see lib/aiContent.ts SMOOTH_SYSTEM_PROMPT).
//
// Both endpoints are pure transformations — they do NOT touch the DB.
// The frontend takes the result, lets the master review/edit, and only
// then sends it to PATCH /portfolio/:id with `description`.

router.post("/portfolio/assemble-description", requireMasterPwa, async (req, res) => {
  const body = req.body ?? {};
  // We accept a 5-field object. Any extra fields are ignored (defensive
  // against the frontend sending stale form state).
  const input: AssembleInput = {
    before: typeof body.before === "string" ? body.before.slice(0, 500) : undefined,
    steps: typeof body.steps === "string" ? body.steps.slice(0, 1500) : undefined,
    materials: typeof body.materials === "string" ? body.materials.slice(0, 1000) : undefined,
    challenges: typeof body.challenges === "string" ? body.challenges.slice(0, 600) : undefined,
    otherDetails: typeof body.otherDetails === "string" ? body.otherDetails.slice(0, 600) : undefined,
  };
  const description = assemblePortfolioDescription(input);
  res.json({ ok: true, description });
});

router.post("/portfolio/smooth-description", requireMasterPwa, async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text : "";
  if (!text.trim()) {
    return res.status(400).json({ ok: false, error: "text is required" });
  }
  try {
    const result = await smoothPortfolioDescription(text);
    if (!result.text) {
      return res.json({
        ok: true,
        description: null,
        note: "Текст слишком короткий или пустой — добавьте больше тезисов.",
      });
    }
    res.json({
      ok: true,
      description: result.text,
      meta: { tokensUsed: result.tokensUsed, model: result.model },
    });
  } catch (e: unknown) {
    if (e instanceof AiContentDisabledError) {
      return res.status(503).json({
        ok: false,
        error: "AI-помощник временно недоступен. Опишите работу самостоятельно.",
      });
    }
    console.error("[portfolio/smooth-description]", e instanceof Error ? e.message : e);
    res.status(502).json({
      ok: false,
      error: "Не удалось обработать текст. Попробуйте ещё раз через минуту.",
    });
  }
});

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

router.post("/auth/register", async (req, res) => {
  const { alias, phone, city, specialization, specializations: specsArr, login, password, servicePrices: pricesRaw, maxChatId } = req.body;
  if (!alias || !city || !login || !password) {
    return res.status(400).json({ error: "Заполните все обязательные поля" });
  }
  // Валидация имени мастера
  if (typeof alias !== 'string' || alias.trim().length < 2) {
    return res.status(400).json({ error: "Имя должно содержать минимум 2 символа" });
  }
  if (/^Мастер\s*#\d+$/i.test(alias.trim())) {
    return res.status(400).json({ error: "Укажите ваше реальное имя (не 'Мастер #ID')" });
  }
  const specs: string[] = Array.isArray(specsArr) && specsArr.length > 0
    ? specsArr
    : specialization ? [specialization] : [];
  if (specs.length === 0) {
    return res.status(400).json({ error: "Выберите хотя бы одну специальность" });
  }
  // Validate service prices
  const servicePrices: { service: string; priceFrom: number }[] = [];
  if (Array.isArray(pricesRaw)) {
    for (const p of pricesRaw) {
      if (p.service && typeof p.priceFrom === "number" && p.priceFrom > 0) {
        servicePrices.push({ service: p.service, priceFrom: p.priceFrom });
      }
    }
  }
  if (servicePrices.length === 0) {
    return res.status(400).json({ error: "Укажите цены на услуги" });
  }
  const specText = specialization || specs.join(", ");
  if (password.length < 6) return res.status(400).json({ error: "Пароль минимум 6 символов" });

  // Normalize login before storing (same normalization used at login time)
  const normalizedLogin = normalizeLoginInput(login);

  // Check login uniqueness
  const existing = await db.select().from(mastersTable).where(and(eq(mastersTable.pwaLogin, normalizedLogin), isNull(mastersTable.deletedAt)));
  if (existing.length > 0) {
    return res.status(400).json({ error: "Этот номер телефона уже зарегистрирован. Войдите через вкладку «Вход»." });
  }

  // Get "Новые" column (position 1)
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  const firstCol = cols[0] ?? null;

  const passwordHash = await hashPassword(password);

  const [master] = await db.insert(mastersTable).values({
    alias: alias.trim(),
    phone: phone ?? null,
    city,
    specialization: specText,
    specializations: specs,
    servicePrices,
    pwaLogin: normalizedLogin,
    pwaPasswordHash: passwordHash,
    voronkaColumnId: firstCol?.id ?? null,
    maxChatId: maxChatId ? String(maxChatId) : null,
    status: "active",
    telegramId: null,
    isTestMaster: false,
    rating: "3",
    debt: "0",
    totalOrders: 0,
    acceptedOrders: 0,
    tags: [],
  }).returning();

  (req.session as any).masterId = master.id;

  // Log new master creation
  console.log(`[crm] new master created: ${master.id} (${master.alias}, ${master.city})`);

  res.json({
    id: master.id,
    alias: master.alias,
    city: master.city,
    specialization: master.specialization,
    rating: Number(master.rating),
    debt: Number(master.debt),
    phone: master.phone ?? null,
    status: master.status,
  });
});

// ─── CHAT ─────────────────────────────────────────────────────────────────────

router.get("/chat", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;

  const messages = await db.select().from(masterMessagesTable)
    .where(eq(masterMessagesTable.masterId, masterId))
    .orderBy(asc(masterMessagesTable.createdAt));

  // Mark operator messages as read
  await db.update(masterMessagesTable)
    .set({ isRead: true })
    .where(and(
      eq(masterMessagesTable.masterId, masterId),
      eq(masterMessagesTable.fromMaster, false),
      eq(masterMessagesTable.isRead, false)
    ));

  res.json(messages.map(m => ({
    id: m.id,
    text: m.text,
    photoUrl: m.photoUrl ?? null,
    fromMaster: m.fromMaster,
    senderName: m.senderName ?? null,
    isRead: m.isRead,
    editedAt: m.editedAt ?? null,
    createdAt: m.createdAt,
  })));
});

router.post("/chat", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const { text, photoUrl } = req.body;
  if (!text?.trim() && !photoUrl) return res.status(400).json({ error: "Текст или фото обязательны" });

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  const chatId = master.telegramId ? master.telegramId : `pwa_${master.id}`;

  const [msg] = await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: chatId,
    text: text?.trim() ?? (photoUrl ? "📷 Фото" : ""),
    photoUrl: photoUrl ?? null,
    fromMaster: true,
    senderName: master.alias,
    isRead: false,
  }).returning();

  res.json({
    id: msg.id,
    text: msg.text,
    fromMaster: true,
    senderName: msg.senderName,
    isRead: false,
    photoUrl: msg.photoUrl ?? null,
    createdAt: msg.createdAt,
  });

  // Let the AI dispatcher respond asynchronously (works for both Max and PWA masters)
  if (text?.trim()) {
    import("../lib/dispatcherAI.js")
      .then(({ handleMasterMessage }) =>
        handleMasterMessage(
          masterId,
          master.alias,
          master.maxChatId ?? null,
          text.trim(),
        )
      )
      .catch((e) => console.error("[pwa-chat] dispatcherAI error:", e));
  }
});

router.get("/chat/unread", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const unread = await db.select().from(masterMessagesTable)
    .where(and(
      eq(masterMessagesTable.masterId, masterId),
      eq(masterMessagesTable.fromMaster, false),
      eq(masterMessagesTable.isRead, false)
    ));
  res.json({ count: unread.length });
});

// ─── GET /api/master-pwa/push/vapid-public-key ───────────────────────────────

router.get("/push/vapid-public-key", (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: "Push not configured" });
  res.json({ key });
});

// ─── POST /api/master-pwa/push/subscribe ─────────────────────────────────────

router.post("/push/subscribe", requireMasterPwa, async (req: any, res: any) => {
  const masterId = (req.session as any).masterId as number;
  const { endpoint, keys } = req.body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Invalid subscription object" });
  }
  await db.insert(pushSubscriptionsTable).values({
    masterId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  }).onConflictDoUpdate({
    target: pushSubscriptionsTable.endpoint,
    set: { masterId, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.json({ ok: true });
});

// ─── DELETE /api/master-pwa/max-link — master self-unlinks Max ───────────────

router.delete("/max-link", requireMasterPwa, async (req: any, res: any) => {
  const masterId = (req.session as any).masterId;
  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!master) return res.status(404).json({ error: "Мастер не найден" });
  if (!master.maxChatId) return res.status(400).json({ error: "Max-аккаунт не привязан" });

  await db.update(mastersTable).set({ maxChatId: null }).where(eq(mastersTable.id, masterId));

  const { logMaxEvent } = await import("../maxBot.js");
  logMaxEvent(masterId, Number(master.maxChatId), "unlinked_self", `Мастер ${master.alias} отвязал Max из приложения`).catch(() => {});

  res.json({ ok: true });
});

// ─── DELETE /api/master-pwa/push/unsubscribe ─────────────────────────────────

router.delete("/push/unsubscribe", requireMasterPwa, async (req: any, res: any) => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
  res.json({ ok: true });
});

// ─── GET /analytics ──────────────────────────────────────────────────────────

router.get("/analytics", requireMasterPwa, async (req: any, res: any) => {
  const masterId = (req.session as any).masterId;

  // All dispatches for this master
  const allDispatches = await db.select().from(orderDispatchesTable)
    .where(eq(orderDispatchesTable.masterId, masterId));

  const totalDispatched = allDispatches.length;
  const totalResponded = allDispatches.filter(d => ["responded", "assigned"].includes(d.status)).length;
  const totalAssigned = allDispatches.filter(d => d.status === "assigned").length;
  const totalRejectedByMaster = allDispatches.filter(d => d.status === "rejected").length;

  // Rejection reasons breakdown
  const rejectionReasons: Record<string, number> = {};
  for (const d of allDispatches.filter(d => d.status === "rejected" && d.rejectionReason)) {
    const r = d.rejectionReason!;
    rejectionReasons[r] = (rejectionReasons[r] ?? 0) + 1;
  }

  // Response rate: responded / total dispatched
  const responseRate = totalDispatched > 0 ? Math.round((totalResponded / totalDispatched) * 100) : 0;
  // Win rate: assigned / responded
  const winRate = totalResponded > 0 ? Math.round((totalAssigned / totalResponded) * 100) : 0;

  // Completed orders & earnings
  const completedOrders = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.masterId, masterId), eq(ordersTable.status, "completed")));
  const totalEarnings = completedOrders.reduce((sum, o) => sum + (o.orderAmount ? Number(o.orderAmount) : 0), 0);
  const avgOrderAmount = completedOrders.length > 0 ? Math.round(totalEarnings / completedOrders.length) : 0;

  // Last 30 days activity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentDispatches = allDispatches.filter(d => d.createdAt && new Date(d.createdAt) > thirtyDaysAgo);
  const recentResponded = recentDispatches.filter(d => ["responded", "assigned"].includes(d.status)).length;
  const recentAssigned = recentDispatches.filter(d => d.status === "assigned").length;

  res.json({
    totalDispatched,
    totalResponded,
    totalAssigned,
    totalRejectedByMaster,
    responseRate,
    winRate,
    totalCompletedOrders: completedOrders.length,
    totalEarnings,
    avgOrderAmount,
    last30Days: {
      dispatched: recentDispatches.length,
      responded: recentResponded,
      assigned: recentAssigned,
    },
    rejectionReasons,
  });
});

// ─── GET /dispatches/history ─────────────────────────────────────────────────

router.get("/dispatches/history", requireMasterPwa, async (req: any, res: any) => {
  const masterId = (req.session as any).masterId;

  const dispatches = await db.select().from(orderDispatchesTable)
    .where(and(
      eq(orderDispatchesTable.masterId, masterId),
      ne(orderDispatchesTable.status, "sent"),
    ))
    .orderBy(desc(orderDispatchesTable.createdAt))
    .limit(60);

  if (dispatches.length === 0) return res.json([]);

  const orderIds = [...new Set(dispatches.map(d => d.orderId))];
  const orders = await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds));
  const orderMap = new Map(orders.map(o => [o.id, o]));

  res.json(dispatches.map(d => {
    const o = orderMap.get(d.orderId);
    return {
      dispatchId: d.id,
      orderId: d.orderId,
      status: d.status,
      respondedAt: d.respondedAt ?? null,
      dispatchedAt: d.createdAt ?? null,
      city: o?.city ?? "—",
      district: o?.district ?? null,
      serviceType: o?.serviceType ?? "—",
      area: o ? Number(o.area) : 0,
      orderStatus: o?.status ?? "—",
    };
  }));
});

// ─── PATCH /availability ──────────────────────────────────────────────────────

router.patch("/availability", requireMasterPwa, async (req: any, res: any) => {
  const masterId = (req.session as any).masterId;
  const { available } = req.body ?? {};
  if (typeof available !== "boolean") return res.status(400).json({ error: "available (boolean) required" });

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);

  let targetCol;
  if (available) {
    // If master has active orders → "На объекте" (working, still in dispatch pool)
    // If no active orders → "Свободен" (free, no work)
    const activeCount = await countActiveMasterOrders(masterId);
    if (activeCount > 0) {
      targetCol = cols.find(c => c.name === "На объекте") ?? cols.find(c => c.receivesOrders && c.name !== "Свободен");
    } else {
      targetCol = cols.find(c => c.name === "Свободен") ?? cols.find(c => c.receivesOrders);
    }
  } else {
    targetCol = await getBusyColumn();
  }

  if (!targetCol) return res.status(400).json({ error: "Подходящая колонка воронки не найдена" });

  await db.update(mastersTable).set({ voronkaColumnId: targetCol.id }).where(eq(mastersTable.id, masterId));
  res.json({ ok: true, isAvailable: targetCol.receivesOrders ?? false });
});

// ─── Checkin (daily readiness) ────────────────────────────────────────────────

// GET /api/master-pwa/checkin/today — returns today's checkin or null
router.get("/checkin/today", requireMasterPwa, async (req: any, res: any) => {
  const masterId = (req.session as any).masterId as number;
  const today = new Date().toISOString().split("T")[0];
  const rows = await db
    .select()
    .from(masterCheckinsTable)
    .where(and(eq(masterCheckinsTable.masterId, masterId), eq(masterCheckinsTable.date, today)));
  res.json(rows[0] ?? null);
});

// POST /api/master-pwa/checkin/today — submit / update today's checkin
router.post("/checkin/today", requireMasterPwa, async (req: any, res: any) => {
  const masterId = (req.session as any).masterId as number;
  const { isAvailable } = req.body as { isAvailable: boolean };
  if (typeof isAvailable !== "boolean") return res.status(400).json({ error: "isAvailable required" });

  const today = new Date().toISOString().split("T")[0];
  const now = new Date();

  await db
    .insert(masterCheckinsTable)
    .values({ masterId, date: today, isAvailable, respondedAt: now })
    .onConflictDoUpdate({
      target: [masterCheckinsTable.masterId, masterCheckinsTable.date],
      set: { isAvailable, respondedAt: now },
    });

  res.json({ ok: true });
});

// ─── ADMIN: set master PWA credentials (from CRM) ────────────────────────────

router.post("/admin/set-credentials/:masterId", async (req: any, res: any) => {
  const userId = (req.session as any).userId;
  if (!userId) return res.status(401).json({ error: "Не авторизован" });

  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: "login и password обязательны" });

  const targetId = parseInt(String(req.params.masterId));

  // Normalize login exactly as the login endpoint does — prevents mismatch between stored and queried login
  const normalizedLogin = normalizeLoginInput(login);

  const passwordHash = await hashPassword(password);

  // Check login uniqueness
  const existing = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.pwaLogin, normalizedLogin)));
  if (existing.length > 0 && existing[0].id !== targetId) {
    return res.status(400).json({ error: "Этот логин уже занят" });
  }

  await db.update(mastersTable).set({ pwaLogin: normalizedLogin, pwaPasswordHash: passwordHash })
    .where(eq(mastersTable.id, targetId));

  res.json({ success: true, login: normalizedLogin });
});

// POST /api/master-pwa/admin/reset-password-to-phone/:masterId
// One-click: sets password = phone number (so master can log in with phone/phone)
router.post("/admin/reset-password-to-phone/:masterId", async (req: any, res: any) => {
  const userId = (req.session as any).userId;
  if (!userId) return res.status(401).json({ error: "Не авторизован" });

  const targetId = parseInt(String(req.params.masterId));
  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, targetId));
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  const login = normalizeLoginInput(master.pwaLogin ?? master.phone ?? "");
  if (!login || login.length < 7) {
    return res.status(400).json({ error: "У мастера нет номера телефона — укажите логин вручную" });
  }

  const passwordHash = await hashPassword(login);
  await db.update(mastersTable)
    .set({ pwaLogin: login, pwaPasswordHash: passwordHash })
    .where(eq(mastersTable.id, targetId));

  console.log(`[admin] reset-password-to-phone: master ${targetId} (${master.alias}) → login=${login}`);
  res.json({ success: true, login, message: `Пароль сброшен. Логин и пароль = ${login}` });
});

// POST /api/master-pwa/contact-admin
// Мастер запрашивает тестовый токен или помощь по заявке
router.post("/contact-admin", requireMasterPwa, async (req: any, res: any) => {
  const masterId = (req.session as any).masterId;
  const { type, orderId, message } = req.body;

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  const msgText = message || `Мастер ${master.alias} запросил тестовый токен`;
  const tag = orderId ? `Заявка #${orderId}` : "Без заявки";

  // Send a message to Max chat so manager sees it
  if (master.maxChatId) {
    sendMaxMessage(master.maxChatId, `🪙 Запрос тестового токена\n${tag}\n${msgText}`).catch(() => {});
  }

  // Log in master messages for CRM visibility
  await db.insert(masterMessagesTable).values({
    masterId,
    direction: "in",
    text: `[SYSTEM] ${type === "token_request" ? "Запрос тестового токена" : "Запрос помощи"}: ${msgText}`,
    channel: "pwa",
    isRead: false,
  } as any).catch(() => {});

  return res.json({ success: true });
});

// ─── DEPOSIT ────────────────────────────────────────────────────────────────

// GET /api/master-pwa/deposit — current deposit balance and history
router.get("/deposit", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;

  const rows = await db.select().from(masterDepositsTable).where(eq(masterDepositsTable.masterId, masterId));
  const txRows = await db.select()
    .from(masterDepositTransactionsTable)
    .where(eq(masterDepositTransactionsTable.masterId, masterId))
    .orderBy(sql`${masterDepositTransactionsTable.createdAt} DESC`);

  const deposit = rows[0];
  res.json({
    depositBalance: deposit ? Number(deposit.depositBalance) : 0,
    recommendedAmount: deposit ? deposit.recommendedAmount : 10000,
    transactions: txRows.map(t => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      balanceBefore: Number(t.balanceBefore),
      balanceAfter: Number(t.balanceAfter),
      reason: t.reason,
      createdAt: t.createdAt,
    })),
  });
});

// POST /api/master-pwa/deposit-request — master requests deposit top-up
router.post("/deposit-request", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const { amount, note } = req.body as { amount?: number; note?: string };
  if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "Укажите сумму пополнения" });
  }

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  // Log request as a pending transaction (not yet credited)
  const depositRows = await db.select().from(masterDepositsTable).where(eq(masterDepositsTable.masterId, masterId));
  const balanceBefore = depositRows[0] ? Number(depositRows[0].depositBalance) : 0;

  await db.insert(masterDepositTransactionsTable).values({
    masterId,
    type: "deposit",
    amount: String(amount),
    balanceBefore: String(balanceBefore),
    balanceAfter: String(balanceBefore),
    reason: `Заявка на пополнение: ${note ? String(note).slice(0, 200) : "—"}`,
    createdBy: "master",
  });

  // Notify admin via Max
  if (master.maxChatId) {
    sendMaxMessage(master.maxChatId, `💰 Запрос пополнения депозита от ${master.alias}: ${Number(amount).toLocaleString("ru-RU")} ₽`).catch(() => {});
  }

  res.json({ success: true, requestedAmount: Number(amount) });
});

// ─── Stuck-orders flow (PWA banner + call-report) ────────────────────────────
// Spec: .kiro/specs/stuck-orders-and-master-banner

// GET /api/master-pwa/pending-actions
// Returns master-facing stuck orders (R0/R1/R3 only, snooze-respecting) for
// the PendingActionsBanner in PWA.
router.get("/pending-actions", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const items = await getPendingActionsForMaster(masterId);
  const now = new Date();
  const visible = items
    // Only categories that REQUIRE master action
    .filter(i => ["needs_call_report", "needs_result", "needs_commission_payment"].includes(i.category))
    // Drop snoozed
    .filter(i => !i.bannerSnoozedUntil || i.bannerSnoozedUntil < now);

  const TYPE_BY_CATEGORY: Record<string, "call_report" | "photos_and_amount" | "commission_payment"> = {
    needs_call_report:        "call_report",
    needs_result:             "photos_and_amount",
    needs_commission_payment: "commission_payment",
  };
  const TITLE_BY_CATEGORY: Record<string, (i: typeof items[0]) => string> = {
    needs_call_report:        (i) => `По заказу #${i.leadId ?? i.id} (${i.serviceType}, ${i.city}) — отчитайтесь о созвоне с клиентом`,
    needs_result:             (i) => `По заказу #${i.leadId ?? i.id} (${i.serviceType}, ${i.city}) — пришлите фото и итоговую сумму`,
    needs_commission_payment: (i) => `По заказу #${i.leadId ?? i.id} — оплатите комиссию${i.netPayable ? ` (${i.netPayable.toLocaleString("ru-RU")} ₽)` : ""}`,
  };
  const CTA_BY_CATEGORY: Record<string, string> = {
    needs_call_report:        "Отчитаться о созвоне",
    needs_result:             "Открыть заказ",
    needs_commission_payment: "Оплатить комиссию",
  };

  res.json(
    visible.map(i => ({
      orderId: i.id,
      leadId: i.leadId ?? null,
      type: TYPE_BY_CATEGORY[i.category],
      title: TITLE_BY_CATEGORY[i.category](i),
      ctaText: CTA_BY_CATEGORY[i.category],
      daysStuck: i.daysStuck,
      city: i.city,
      serviceType: i.serviceType,
      snoozedUntil: i.bannerSnoozedUntil ? i.bannerSnoozedUntil.toISOString() : null,
    }))
  );
});

// POST /api/master-pwa/orders/:id/snooze-banner
// Master clicked "Напомнить позже" — postpone banner for this order by 24h.
router.post("/orders/:id/snooze-banner", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(String(req.params.id));
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId), isNull(ordersTable.deletedAt)));
  if (!order) return res.status(404).json({ error: "Заказ не найден" });

  const snoozeUntil = new Date(Date.now() + 24 * 3600 * 1000);
  await db.update(ordersTable)
    .set({ bannerSnoozedUntil: snoozeUntil, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));
  res.json({ snoozedUntil: snoozeUntil.toISOString() });
});

// POST /api/master-pwa/orders/:id/call-report
// Master reports on the client call: either schedules the measurement or
// notes that contact failed. Closes the "needs_call_report" stuck state.
router.post("/orders/:id/call-report", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(String(req.params.id));
  if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

  const { scheduledAt, note } = req.body ?? {};

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId), isNull(ordersTable.deletedAt)));
  if (!order) return res.status(404).json({ error: "Заказ не найден" });

  let scheduledDate: Date | null = null;
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "Некорректная дата замера" });
    scheduledDate = d;
  }

  const noteTrimmed = typeof note === "string" ? note.trim().slice(0, 500) : "";

  const updates: Record<string, any> = {
    clientCallReportedAt: new Date(),
    updatedAt: new Date(),
  };
  if (scheduledDate) updates.scheduledAt = scheduledDate;

  await db.update(ordersTable).set(updates).where(eq(ordersTable.id, orderId));

  // Log a structured chat message so operator sees the report in master-chat.
  const formatDate = (d: Date) => new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(d);
  const messageText = scheduledDate
    ? `📅 Замер согласован: ${formatDate(scheduledDate)}${noteTrimmed ? `. ${noteTrimmed}` : ""}`
    : `📞 Отчёт о созвоне: ${noteTrimmed || "без комментария"}`;

  await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: `pwa_${masterId}`,
    text: messageText,
    fromMaster: true,
    senderName: "Мастер (отчёт о созвоне)",
    isRead: false,
    photoUrl: null,
    telegramMessageId: null,
  });

  res.json({ success: true, scheduledAt: scheduledDate ? scheduledDate.toISOString() : null });
});

// ─── Объект (Real Price): редактор карточки в кабинете мастера ─────────────────
// Кабинет на маркетплейсе ходит только через прокси /api/cabinet/* → /master-pwa/*,
// поэтому CRUD Объекта живёт здесь и делегирует в общий сервис (lib/objectService).

// Словарь видов работ — пикер позиций этапа.
router.get("/work-types", requireMasterPwa, async (_req, res) => {
  const items = await listActiveWorkTypes();
  res.json(items);
});

// Список Объектов мастера (хаб «Мои Объекты»).
router.get("/objects", requireMasterPwa, async (req: any, res) => {
  const masterId = req.session.masterId as number;
  const items = await listObjectsForMaster(masterId);
  res.json(items);
});

// Контекст заказа + Объект (если уже создан) — экран редактора.
router.get("/objects/:orderId", requireMasterPwa, async (req: any, res) => {
  const masterId = req.session.masterId as number;
  const orderId = parseInt(String(req.params.orderId), 10);
  if (!Number.isFinite(orderId)) return res.status(400).json({ error: "Неверный orderId" });
  const result = await getObjectForOrder(masterId, orderId);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result.data);
});

// Создать/сохранить Объект (upsert по заказу).
router.post("/objects", requireMasterPwa, async (req: any, res) => {
  const masterId = req.session.masterId as number;
  const result = await saveObject(masterId, req.body ?? {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result.data);
});

// Опубликовать Объект как кейс + подать ценовые точки.
router.post("/objects/:id/publish", requireMasterPwa, async (req: any, res) => {
  const masterId = req.session.masterId as number;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Неверный id" });
  const result = await publishObjectForMaster(masterId, id, { consent: req.body?.consent === true });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, ...result.data });
});

export default router;
