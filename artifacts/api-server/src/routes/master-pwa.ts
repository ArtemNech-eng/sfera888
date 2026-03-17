import { Router } from "express";
import { db, mastersTable, ordersTable, orderDispatchesTable, transactionsTable, leadsTable, voronkaColumnsTable, masterMessagesTable, pushSubscriptionsTable } from "@workspace/db";
import { eq, and, inArray, isNull, ne, asc, desc } from "drizzle-orm";
import { verifyPassword, hashPassword } from "../lib/auth.js";
import multer from "multer";
import fs from "fs";
import { AVATAR_DIR } from "../config.js";

fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (_req, _file, cb) => cb(null, `pwa-master-${Date.now()}.jpg`),
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"));
  },
});

const router = Router();

function requireMasterPwa(req: any, res: any, next: any) {
  const masterId = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });
  next();
}

async function getMasterById(id: number) {
  const rows = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  return rows[0] ?? null;
}

async function getOnSiteColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  const nonReceiving = cols.filter(c => !c.receivesOrders);
  return nonReceiving.find(c => c.position > 1) ?? nonReceiving[0] ?? null;
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
  const { login, password } = req.body;
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

  (req.session as any).masterId = master.id;

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

router.post("/auth/logout", (req, res) => {
  (req.session as any).masterId = null;
  res.json({ success: true });
});

router.get("/auth/me", async (req, res) => {
  const masterId = (req.session as any).masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const master = await getMasterById(masterId);
  if (!master || master.deletedAt) return res.status(401).json({ error: "Мастер не найден" });

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

  // Available orders — "sent" dispatches, order still waiting
  let availableOrders: any[] = [];
  if (sentDispatches.length > 0) {
    const orderIds = sentDispatches.map(d => d.orderId);
    const orders = await db.select().from(ordersTable)
      .where(and(inArray(ordersTable.id, orderIds), eq(ordersTable.status, "waiting_master"), isNull(ordersTable.deletedAt)));
    // Fetch lead photos
    const leadIds = [...new Set(orders.map(o => o.leadId))];
    const leads = leadIds.length > 0 ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds)) : [];
    const leadMap = new Map(leads.map(l => [l.id, l]));
    const dispatchByOrder = new Map(sentDispatches.map(d => [d.orderId, d]));
    availableOrders = orders.map(o => ({
      id: o.id,
      city: o.city,
      district: o.district,
      serviceType: o.serviceType,
      services: o.services ?? null,
      area: Number(o.area),
      scheduledAt: o.scheduledAt ?? null,
      comment: o.comment ?? null,
      photos: parsePhotos(leadMap.get(o.leadId)?.photos),
      dispatchedAt: dispatchByOrder.get(o.id)?.createdAt ?? null,
    }));
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
    },
    availableOrders,
    pendingOrders,
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

  // Check active order limits
  const activeOrders = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.masterId, masterId), inArray(ordersTable.status, ["master_assigned", "in_progress"])));
  const limit = master.isTestMaster ? 1 : 2;
  if (activeOrders.length >= limit) {
    return res.status(400).json({ error: `Превышен лимит активных заказов (${limit})` });
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

  // Update master stats and move to "На объекте" column
  const onSiteCol = await getOnSiteColumn();
  await db.update(mastersTable).set({
    totalOrders: master.totalOrders + 1,
    acceptedOrders: master.acceptedOrders + 1,
    voronkaColumnId: onSiteCol?.id ?? master.voronkaColumnId,
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

  // Same active order limit check as Telegram bot
  const activeOrders = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      inArray(ordersTable.status, ["master_assigned", "in_progress"]),
    ));
  const limit = master.isTestMaster ? 1 : 2;
  if (activeOrders.length >= limit) {
    return res.status(400).json({
      error: `У вас уже ${activeOrders.length} из ${limit} активных заказов. Завершите текущие заказы, чтобы откликаться на новые.`,
    });
  }

  await db.update(orderDispatchesTable)
    .set({ status: "responded", respondedAt: new Date() })
    .where(eq(orderDispatchesTable.id, dispatches[0].id));

  // Notify operator — create a chat message so it appears in CRM master chat
  const chatId = master.telegramId ?? `pwa_${master.id}`;
  await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: chatId,
    text: `🙋 Откликнулся на заявку #${orderId} (${order.serviceType}, ${order.city}${order.district ? ", " + order.district : ""})`,
    fromMaster: true,
    senderName: master.alias,
    isRead: false,
  });

  res.json({ success: true });
});

// Reject order
router.post("/orders/:id/reject", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(req.params.id);

  await db.update(orderDispatchesTable).set({ status: "rejected", respondedAt: new Date() })
    .where(and(
      eq(orderDispatchesTable.masterId, masterId),
      eq(orderDispatchesTable.orderId, orderId),
      inArray(orderDispatchesTable.status, ["sent", "responded"]),
    ));

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

  const totalEarned = realTxs
    .filter(t => t.paymentStatus === "paid")
    .reduce((s, t) => s + Number(t.orderAmount), 0);
  const totalPaidCommission = realTxs
    .filter(t => t.paymentStatus === "paid")
    .reduce((s, t) => s + Number(t.commission), 0);

  res.json({
    debt: Number(master.debt),
    totalEarned,
    totalPaidCommission,
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
  const { reason } = req.body;

  if (!reason?.trim()) return res.status(400).json({ error: "Укажите причину отмены" });

  const orderRows = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId)));
  if (!orderRows[0]) return res.status(404).json({ error: "Заказ не найден" });

  const order = orderRows[0];
  if (!["master_assigned", "in_progress"].includes(order.status)) {
    return res.status(400).json({ error: "Нельзя отменить заказ в текущем статусе" });
  }

  await db.update(ordersTable).set({
    status: "cancellation_requested",
    cancelReason: reason.trim(),
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
  const { alias, city, phone, specializations } = req.body;

  const updates: any = { updatedAt: new Date() };
  if (alias?.trim()) updates.alias = alias.trim();
  if (city?.trim()) updates.city = city.trim();
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (Array.isArray(specializations) && specializations.length > 0) {
    updates.specializations = specializations;
    updates.specialization = specializations.join(", ");
  }

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
  const avatarUrl = `/api/uploads/avatars/${req.file.filename}`;
  const [updated] = await db.update(mastersTable)
    .set({ customAvatarUrl: avatarUrl })
    .where(eq(mastersTable.id, masterId))
    .returning();
  if (!updated) return res.status(404).json({ error: "Мастер не найден" });
  res.json({ customAvatarUrl: avatarUrl });
});

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

router.post("/auth/register", async (req, res) => {
  const { alias, phone, city, specialization, specializations: specsArr, login, password } = req.body;
  if (!alias || !city || !login || !password) {
    return res.status(400).json({ error: "Заполните все обязательные поля" });
  }
  const specs: string[] = Array.isArray(specsArr) && specsArr.length > 0
    ? specsArr
    : specialization ? [specialization] : [];
  if (specs.length === 0) {
    return res.status(400).json({ error: "Выберите хотя бы одну специальность" });
  }
  const specText = specialization || specs.join(", ");
  if (password.length < 6) return res.status(400).json({ error: "Пароль минимум 6 символов" });

  // Check login uniqueness
  const existing = await db.select().from(mastersTable).where(and(eq(mastersTable.pwaLogin, login), isNull(mastersTable.deletedAt)));
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
    pwaLogin: login,
    pwaPasswordHash: passwordHash,
    voronkaColumnId: firstCol?.id ?? null,
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
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Текст сообщения обязателен" });

  const master = await getMasterById(masterId);
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  // Use telegramId if available, otherwise use masterId as placeholder
  const chatId = master.telegramId ? master.telegramId : `pwa_${master.id}`;

  const [msg] = await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: chatId,
    text: text.trim(),
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
    photoUrl: null,
    createdAt: msg.createdAt,
  });
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
    targetCol = cols.find(c => c.receivesOrders);
  } else {
    // First non-receiving column at position > 1 (not the "Новые" onboarding column)
    targetCol = cols.find(c => !c.receivesOrders && c.position > 1);
    if (!targetCol) targetCol = cols.find(c => !c.receivesOrders);
  }

  if (!targetCol) return res.status(400).json({ error: "Подходящая колонка воронки не найдена" });

  await db.update(mastersTable).set({ voronkaColumnId: targetCol.id }).where(eq(mastersTable.id, masterId));
  res.json({ ok: true, isAvailable: targetCol.receivesOrders ?? false });
});

// ─── ADMIN: set master PWA credentials (from CRM) ────────────────────────────

router.post("/admin/set-credentials/:masterId", async (req: any, res: any) => {
  const userId = (req.session as any).userId;
  if (!userId) return res.status(401).json({ error: "Не авторизован" });

  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: "login и password обязательны" });

  const targetId = parseInt(req.params.masterId);
  const passwordHash = await hashPassword(password);

  // Check login uniqueness
  const existing = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.pwaLogin, login)));
  if (existing.length > 0 && existing[0].id !== targetId) {
    return res.status(400).json({ error: "Этот логин уже занят" });
  }

  await db.update(mastersTable).set({ pwaLogin: login, pwaPasswordHash: passwordHash })
    .where(eq(mastersTable.id, targetId));

  res.json({ success: true });
});

export default router;
