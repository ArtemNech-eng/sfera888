import { Router } from "express";
import { db, mastersTable, ordersTable, orderDispatchesTable, transactionsTable, leadsTable, voronkaColumnsTable, masterMessagesTable, pushSubscriptionsTable, masterCheckinsTable } from "@workspace/db";
import { maybeEarlyAssign } from "../lib/priorityAssign.js";
import { eq, and, inArray, isNull, ne, asc, desc, gte } from "drizzle-orm";
import { verifyPassword, hashPassword } from "../lib/auth.js";
import { getMasterEligibility, getOverdueMasterIds, countActiveMasterOrders, getColumnIdForActiveCount } from "../lib/orderEligibility.js";
import multer from "multer";
import { objectStorageClient } from "../lib/objectStorage.js";
import { getBotLink, sendOnboardingMemo } from "../maxBot.js";
import { notifyManagerMasterResponse, notifyManagerNewMaster } from "../managerBot.js";

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
  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(`avatars/${filename}`).save(buffer, { contentType: mimetype, resumable: false });
  return `/api/masters/avatar/${filename}`;
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

router.post("/auth/login", async (req, res) => {
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
  let effectiveStatus = master.status;
  if (master.contractSignedAt && master.passportVerified && master.status === "pending_contract") {
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
router.post("/auth/forgot-password", async (req, res) => {
  const { phone, newPassword } = req.body;
  if (!phone) return res.status(400).json({ error: "Введите номер телефона" });

  const normalized = normalizeLoginInput(phone);
  if (normalized.length < 7) return res.status(400).json({ error: "Введите корректный номер телефона" });

  if (newPassword !== undefined && newPassword !== null && newPassword !== "") {
    if (typeof newPassword !== "string" || newPassword.length < 4) {
      return res.status(400).json({ error: "Пароль должен быть не короче 4 символов" });
    }
  }

  const allMasters = await db.select({
    id: mastersTable.id, alias: mastersTable.alias,
    status: mastersTable.status, phone: mastersTable.phone, pwaLogin: mastersTable.pwaLogin,
  }).from(mastersTable).where(isNull(mastersTable.deletedAt));

  const master = allMasters.find(m =>
    normalizeLoginInput(m.pwaLogin ?? "") === normalized ||
    (m.phone && normalizeLoginInput(m.phone) === normalized)
  ) ?? null;

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

  // Smart filter settings from master profile
  const minArea = master.minArea ?? 0;
  const preferredDistricts: string[] = (master.preferredDistricts as string[]) ?? [];

  // Available orders — "sent" dispatches, order still waiting
  let availableOrders: any[] = [];
  if (sentDispatches.length > 0) {
    const orderIds = sentDispatches.map(d => d.orderId);
    let orders = await db.select().from(ordersTable)
      .where(and(inArray(ordersTable.id, orderIds), eq(ordersTable.status, "waiting_master"), isNull(ordersTable.deletedAt)));

    // Apply smart filters
    if (minArea > 0) orders = orders.filter(o => Number(o.area) >= minArea);
    if (preferredDistricts.length > 0) {
      orders = orders.filter(o => !o.district || preferredDistricts.some(d => o.district?.toLowerCase().includes(d.toLowerCase())));
    }

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

  // Active orders (assigned to me)
  const activeOrders = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      inArray(ordersTable.status, ["master_assigned", "in_progress", "cancellation_requested"]),
      isNull(ordersTable.deletedAt)
    ));

  // Availability — based on voronka column receivesOrders flag
  let isAvailable = true;
  if (master.voronkaColumnId) {
    const colRows = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId));
    if (colRows[0]) isAvailable = colRows[0].receivesOrders ?? false;
  }

  const orderLimit = master.isTestMaster ? 1 : 2;

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
    availableOrders,
    pendingOrders,
    missedOrders,
    todayActivity,
    activeOrders: activeOrders.map(o => ({
      id: o.id,
      city: o.city,
      district: o.district,
      serviceType: o.serviceType,
      area: Number(o.area),
      scheduledAt: o.scheduledAt ?? null,
      status: o.status,
      masterWorkStatus: o.masterWorkStatus ?? null,
      proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
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
  const orders = await db.select().from(ordersTable)
    .where(and(inArray(ordersTable.id, orderIds), eq(ordersTable.status, "waiting_master"), isNull(ordersTable.deletedAt)));

  const dispatchByOrder = new Map(dispatches.map(d => [d.orderId, d]));

  res.json(orders.map(o => ({
    id: o.id,
    city: o.city,
    district: o.district,
    serviceType: o.serviceType,
    area: Number(o.area),
    scheduledAt: o.scheduledAt ?? null,
    comment: o.comment ?? null,
    dispatchedAt: dispatchByOrder.get(o.id)?.createdAt ?? null,
  })));
});

router.get("/orders/my", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const { filter } = req.query;

  let statusFilter: string[];
  if (filter === "active") {
    statusFilter = ["master_assigned", "in_progress", "cancellation_requested"];
  } else if (filter === "completed") {
    statusFilter = ["completed", "cancelled"];
  } else {
    statusFilter = ["master_assigned", "in_progress", "cancellation_requested", "completed", "cancelled"];
  }

  const orders = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      inArray(ordersTable.status, statusFilter as any),
      isNull(ordersTable.deletedAt)
    ));

  // Get lead info for client data
  const leadIds = [...new Set(orders.map(o => o.leadId))];
  const leads = leadIds.length > 0
    ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds))
    : [];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  res.json(orders.map(o => {
    const lead = leadMap.get(o.leadId);
    return {
      id: o.id,
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
    };
  }));
});

// Accept order
router.post("/orders/:id/accept", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(req.params.id);

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

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

  // Assign master to order
  await db.update(ordersTable).set({
    masterId,
    status: "master_assigned",
    dispatchStatus: "assigned",
    masterWorkStatus: "accepted",
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, orderId));

  // Update this dispatch to assigned
  await db.update(orderDispatchesTable).set({ status: "assigned", respondedAt: new Date() })
    .where(eq(orderDispatchesTable.id, dispatches[0].id));

  // Reject other dispatches for this order
  await db.update(orderDispatchesTable).set({ status: "rejected" })
    .where(and(eq(orderDispatchesTable.orderId, orderId), ne(orderDispatchesTable.id, dispatches[0].id)));

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
  const orderId = parseInt(req.params.id);

  const dispatches = await db.select().from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.masterId, masterId), eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.status, "sent")));
  if (!dispatches[0]) return res.status(404).json({ error: "Заявка не найдена или вы уже откликнулись" });

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order || order.status !== "waiting_master") {
    return res.status(400).json({ error: "Заявка больше недоступна" });
  }

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  // Check order eligibility (limit + debt + overdue)
  const allActive = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
  const myActiveCount = allActive.filter(o => o.masterId === masterId).length;
  const overdueMasterIds = await getOverdueMasterIds();
  const eligibility = getMasterEligibility(master, myActiveCount, overdueMasterIds);
  if (!eligibility.canAccept) {
    return res.status(400).json({ error: eligibility.reason });
  }

  const { responseNote } = req.body ?? {};

  await db.update(orderDispatchesTable)
    .set({
      status: "responded",
      respondedAt: new Date(),
      responseNote: responseNote ? String(responseNote).trim().slice(0, 500) : null,
    })
    .where(eq(orderDispatchesTable.id, dispatches[0].id));

  // Notify operator — create a chat message so it appears in CRM master chat
  const chatId = master.telegramId ?? `pwa_${master.id}`;
  const noteText = responseNote ? `\n💬 ${String(responseNote).trim()}` : "";
  await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: chatId,
    text: `🙋 Откликнулся на заявку #${orderId} (${order.serviceType}, ${order.city}${order.district ? ", " + order.district : ""})${noteText}`,
    fromMaster: true,
    senderName: master.alias,
    isRead: false,
  });

  // Notify manager bot
  notifyManagerMasterResponse(orderId, master.alias, true).catch(() => {});

  // Early assignment if 5+ masters have responded
  maybeEarlyAssign(orderId).catch(e => console.error("[respond] maybeEarlyAssign error:", e));

  res.json({ success: true });
});

// Reject order
router.post("/orders/:id/reject", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(req.params.id);
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
  const orderId = parseInt(req.params.id);
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
  const orderId = parseInt(req.params.id);
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
  const orderId = parseInt(req.params.id);
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

  const paidTxs = realTxs.filter(t => t.paymentStatus === "paid");
  const pendingTxs = realTxs.filter(t => t.paymentStatus === "pending" || t.paymentStatus === "debt");

  const totalEarned = paidTxs.reduce((s, t) => s + Number(t.orderAmount), 0);
  const totalPaidCommission = paidTxs.reduce((s, t) => s + Number(t.commission), 0);
  const pendingCommission = pendingTxs.reduce((s, t) => s + Number(t.commission), 0);
  const pendingEarnings = pendingTxs.reduce((s, t) => s + Number(t.orderAmount), 0);

  res.json({
    debt: Number(master.debt),
    totalEarned,
    totalPaidCommission,
    pendingCommission,
    pendingEarnings,
    transactions: realTxs.map(t => {
      const order = orderMap.get(t.orderId);
      return {
        id: t.id,
        orderId: t.orderId,
        orderServiceType: order?.serviceType ?? null,
        orderCity: order?.city ?? null,
        orderAmount: Number(t.orderAmount),
        commission: Number(t.commission),
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
  const orderId = parseInt(req.params.id);
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

// Update profile
router.patch("/profile", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const { alias, city, phone, specializations, workingHours, preferredDistricts, minArea, servicePrices } = req.body;

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

  await db.update(mastersTable).set(updates).where(eq(mastersTable.id, masterId));
  res.json({ success: true });
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

  res.json({
    id: master.id,
    alias: master.alias,
    city: master.city,
    specialization: master.specialization,
    specializations: master.specializations,
    phone: master.phone ?? null,
    rating: Number(master.rating),
    debt: Number(master.debt),
    totalOrders: master.totalOrders,
    acceptedOrders: master.acceptedOrders,
    isTestMaster: master.isTestMaster,
    customAvatarUrl: master.customAvatarUrl ?? null,
    contractLink: master.contractLink ?? null,
    tags: master.tags,
    workingHours: master.workingHours ?? null,
    preferredDistricts: master.preferredDistricts ?? [],
    minArea: master.minArea ?? 0,
    servicePrices: master.servicePrices ?? [],
    stats: {
      conversionRate,
      paymentRate,
    },
    createdAt: master.createdAt,
  });
});

// ─── AVATAR UPLOAD ────────────────────────────────────────────────────────────

router.post("/profile/avatar", requireMasterPwa, avatarUpload.single("avatar"), async (req, res) => {
  const masterId = (req.session as any).masterId;
  if (!req.file) return res.status(400).json({ error: "Файл не получен" });
  try {
    const avatarUrl = await uploadPwaAvatarToGCS(masterId, req.file.buffer, req.file.mimetype);
    const [updated] = await db.update(mastersTable)
      .set({ customAvatarUrl: avatarUrl })
      .where(eq(mastersTable.id, masterId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Мастер не найден" });
    res.json({ customAvatarUrl: avatarUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Upload failed" });
  }
});

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

router.post("/auth/register", async (req, res) => {
  const { alias, phone, city, specialization, specializations: specsArr, login, password, servicePrices: pricesRaw, maxChatId } = req.body;
  if (!alias || !city || !login || !password) {
    return res.status(400).json({ error: "Заполните все обязательные поля" });
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
    const m = existing[0];
    if (m.status === "pending_contract") {
      return res.status(400).json({ error: "Этот номер уже зарегистрирован и ожидает подписания договора. Войдите с этим номером и паролем." });
    }
    return res.status(400).json({ error: "Этот номер телефона уже зарегистрирован. Войдите через вкладку «Вход»." });
  }

  // Get "Новые" column (position 1)
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  const firstCol = cols[0] ?? null;

  const passwordHash = await hashPassword(password);

  const [master] = await db.insert(mastersTable).values({
    alias,
    phone: phone ?? null,
    city,
    specialization: specText,
    specializations: specs,
    servicePrices,
    pwaLogin: normalizedLogin,
    pwaPasswordHash: passwordHash,
    voronkaColumnId: firstCol?.id ?? null,
    maxChatId: maxChatId ? String(maxChatId) : null,
    status: "pending_contract",
    contractLink: "https://desktop.doki.online/contract/6916b2861ea1593f469a6786",
    telegramId: null,
    isTestMaster: false,
    rating: "3",
    debt: "0",
    totalOrders: 0,
    acceptedOrders: 0,
    tags: [],
  }).returning();

  (req.session as any).masterId = master.id;

  // Notify manager bot about new master (non-blocking)
  notifyManagerNewMaster({
    id: master.id,
    alias: master.alias,
    city: master.city,
    specialization: master.specialization,
    phone: master.phone ?? null,
  }).catch(() => {});

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

  const targetId = parseInt(req.params.masterId);

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

  const targetId = parseInt(req.params.masterId);
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

export default router;
