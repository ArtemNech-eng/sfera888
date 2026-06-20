import { Router } from "express";
import { db, voronkaColumnsTable, mastersTable, ordersTable, leadsTable, telegramChatsTable, transactionsTable, masterWalletTable } from "@workspace/db";
import { eq, inArray, and, isNull, isNotNull, ne, count, gte, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

const router = Router();

// GET all columns (all authenticated users)
router.get("/columns", requireAuth, async (_req, res) => {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  res.json(cols);
});

// POST create column
router.post("/columns", requireRole("admin"), async (req, res) => {
  const { name, receivesOrders = false, color = "blue" } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const existing = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  const maxPos = existing.length > 0 ? Math.max(...existing.map(c => c.position)) : 0;

  const result = await db.insert(voronkaColumnsTable).values({
    name, receivesOrders, color, position: maxPos + 1,
  }).returning();
  res.status(201).json(result[0]);
});

// PATCH update column
router.patch("/columns/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(String(req.params.id));
  const { name, receivesOrders, color, position } = req.body;
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (receivesOrders !== undefined) updates.receivesOrders = receivesOrders;
  if (color !== undefined) updates.color = color;
  if (position !== undefined) updates.position = position;

  const result = await db.update(voronkaColumnsTable).set(updates).where(eq(voronkaColumnsTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Column not found" });
  res.json(result[0]);
});

// POST reorder columns
router.post("/columns/reorder", requireRole("admin"), async (req, res) => {
  const { order } = req.body as { order: number[] };
  if (!Array.isArray(order)) return res.status(400).json({ error: "order array required" });

  for (let i = 0; i < order.length; i++) {
    await db.update(voronkaColumnsTable).set({ position: i + 1 }).where(eq(voronkaColumnsTable.id, order[i]));
  }

  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  res.json(cols);
});

// DELETE column
router.delete("/columns/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(String(req.params.id));
  // Move masters in this column to null
  await db.update(mastersTable).set({ voronkaColumnId: null }).where(eq(mastersTable.voronkaColumnId, id));
  await db.delete(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, id));
  res.json({ success: true });
});

// GET all masters for voronka with active orders info
router.get("/masters", requireAuth, async (_req, res) => {
  const t0 = Date.now();

  // ── Phase 1: independent queries in parallel ──────────────────────────────
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [
    masters,
    pendingTxs,
    paidTxRows,
    completedRows,
    cancelledRows,
    cancelRows30d,
    cancelRows7d,
    activeOrders,
  ] = await Promise.all([
    db.select().from(mastersTable).where(isNull(mastersTable.deletedAt)).orderBy(mastersTable.createdAt),
    db.select({ masterId: transactionsTable.masterId, id: transactionsTable.id })
      .from(transactionsTable)
      .where(inArray(transactionsTable.paymentStatus, ["pending", "overdue"])),
    db.select({ masterId: transactionsTable.masterId, cnt: count() })
      .from(transactionsTable)
      .where(eq(transactionsTable.paymentStatus, "paid"))
      .groupBy(transactionsTable.masterId),
    db.select({ masterId: ordersTable.masterId, cnt: count() })
      .from(ordersTable)
      .where(and(isNotNull(ordersTable.masterId), eq(ordersTable.status, "completed")))
      .groupBy(ordersTable.masterId),
    db.select({ masterId: ordersTable.masterId, cnt: count() })
      .from(ordersTable)
      .where(and(isNotNull(ordersTable.masterId), eq(ordersTable.status, "cancelled"), isNull(ordersTable.deletedAt)))
      .groupBy(ordersTable.masterId),
    db.select({ masterId: ordersTable.masterId, cnt: count() })
      .from(ordersTable)
      .where(and(isNotNull(ordersTable.masterId), isNotNull(ordersTable.cancelType), ne(ordersTable.cancelType, "client_refused"), gte(ordersTable.updatedAt, thirtyDaysAgo)))
      .groupBy(ordersTable.masterId),
    db.select({ masterId: ordersTable.masterId, cnt: count() })
      .from(ordersTable)
      .where(and(isNotNull(ordersTable.masterId), isNotNull(ordersTable.cancelType), ne(ordersTable.cancelType, "client_refused"), gte(ordersTable.updatedAt, sevenDaysAgo)))
      .groupBy(ordersTable.masterId),
    db.select().from(ordersTable)
      .where(inArray(ordersTable.status, ["master_assigned", "in_progress"])),
  ]);
  const t1 = Date.now();

  // ── Phase 2: dependent queries (need IDs from phase 1) ────────────────────
  const telegramIds = masters.filter(m => m.telegramId).map(m => m.telegramId!);
  const leadIds = [...new Set(activeOrders.map(o => o.leadId))];

  const [tgChats, leads] = await Promise.all([
    telegramIds.length > 0
      ? db.select({ telegramChatId: telegramChatsTable.telegramChatId, avatarUrl: telegramChatsTable.avatarUrl })
          .from(telegramChatsTable)
          .where(inArray(telegramChatsTable.telegramChatId, telegramIds))
      : Promise.resolve([]),
    leadIds.length > 0
      ? db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds))
      : Promise.resolve([]),
  ]);
  const t2 = Date.now();

  // ── Build lookup maps ──────────────────────────────────────────────────────
  const avatarMap = new Map(tgChats.map(c => [c.telegramChatId, c.avatarUrl ?? null]));
  const pendingTxMap = new Map<number, number>();
  for (const tx of pendingTxs) {
    if (!tx.masterId) continue;
    pendingTxMap.set(tx.masterId, (pendingTxMap.get(tx.masterId) ?? 0) + 1);
  }
  const paidTxMap = new Map(paidTxRows.map(r => [r.masterId, Number(r.cnt)]));
  const completedMap = new Map(completedRows.map(r => [r.masterId!, Number(r.cnt)]));
  const cancelledMap = new Map(cancelledRows.map(r => [r.masterId!, Number(r.cnt)]));
  const cancelMap30d = new Map(cancelRows30d.map(r => [r.masterId!, Number(r.cnt)]));
  const cancelMap7d = new Map(cancelRows7d.map(r => [r.masterId!, Number(r.cnt)]));
  const leadMap = new Map(leads.map(l => [l.id, l]));

  const masterActiveOrders = new Map<number, any[]>();
  for (const o of activeOrders) {
    if (!o.masterId) continue;
    const lead = leadMap.get(o.leadId);
    if (!masterActiveOrders.has(o.masterId)) masterActiveOrders.set(o.masterId, []);
    masterActiveOrders.get(o.masterId)!.push({
      orderId: o.id,
      district: o.district,
      city: o.city,
      serviceType: o.serviceType,
      status: o.status,
      clientPhone: lead?.clientPhone ?? null,
      clientName: lead?.clientName ?? null,
      scheduledAt: o.scheduledAt ?? null,
    });
  }
  const t3 = Date.now();

  const payload = masters.map(m => ({
    id: m.id,
    alias: m.alias,
    city: m.city,
    specialization: m.specialization,
    telegramId: m.telegramId ?? null,
    phone: m.phone ?? null,
    status: m.status,
    rating: Number(m.rating),
    totalOrders: m.totalOrders,
    acceptedOrders: m.acceptedOrders,
    debt: Number(m.debt),
    voronkaColumnId: m.voronkaColumnId ?? null,
    isTestMaster: m.isTestMaster,
    tags: m.tags ?? [],
    specializations: m.specializations ?? [],
    avatarUrl: (m.telegramId ? (avatarMap.get(m.telegramId) ?? null) : null) ?? m.customAvatarUrl ?? null,
    activeOrders: masterActiveOrders.get(m.id) ?? [],
    pendingTransactionsCount: pendingTxMap.get(m.id) ?? 0,
    paidOrdersCount: paidTxMap.get(m.id) ?? 0,
    contractLink: m.contractLink ?? null,
    workingHours: m.workingHours ?? null,
    preferredDistricts: m.preferredDistricts ?? [],
    minArea: m.minArea ?? 0,
    createdAt: m.createdAt,
    contractSignedAt: m.contractSignedAt ?? null,
    contractSignIp: m.contractSignIp ?? null,
    passportPhotoUrl: m.passportPhotoUrl ?? null,
    passportRegPhotoUrl: m.passportRegPhotoUrl ?? null,
    passportVerified: m.passportVerified ?? false,
    passportVerifyNote: m.passportVerifyNote ?? null,
    contractFullName: m.contractFullName ?? null,
    contractPassportNumber: m.contractPassportNumber ?? null,
    contractPassportDate: m.contractPassportDate ?? null,
    contractPassportIssuer: m.contractPassportIssuer ?? null,
    contractAddress: m.contractAddress ?? null,
    pwaLogin: m.pwaLogin ?? null,
    lastSeenAt: m.lastSeenAt ?? null,
    cancelCount30d: cancelMap30d.get(m.id) ?? 0,
    cancelCount7d: cancelMap7d.get(m.id) ?? 0,
    completedOrders: completedMap.get(m.id) ?? 0,
    cancelledOrders: cancelledMap.get(m.id) ?? 0,
    maxChatId: m.maxChatId ?? null,
    servicePrices: m.servicePrices ?? null,
    fomoDisabled: m.fomoDisabled ?? false,
    // Token model retired — wallet query removed. Legacy fields return 0.
    balance: 0,
    creditLimit: 0,
    totalServiceFeesSpent: 0,
    consecutiveCancellations: m.consecutiveCancellations ?? 0,
    blockedFromOrders: m.blockedFromOrders ?? false,
    blockedAt: m.blockedAt ?? null,
    blockedReason: m.blockedReason ?? null,
    manualUnblocksCount: m.manualUnblocksCount ?? 0,
  }));
  const t4 = Date.now();

  res.set("Server-Timing", `phase1;dur=${t1 - t0}, phase2;dur=${t2 - t1}, build;dur=${t3 - t2}, format;dur=${t4 - t3}, total;dur=${t4 - t0}`);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  console.log(`[voronka/masters] ${masters.length} masters: phase1=${t1 - t0}ms phase2=${t2 - t1}ms build=${t3 - t2}ms format=${t4 - t3}ms total=${t4 - t0}ms`);
  res.json(payload);
});

// PATCH move master to column
router.patch("/masters/:id/column", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const { voronkaColumnId } = req.body;

  const result = await db.update(mastersTable)
    .set({ voronkaColumnId: voronkaColumnId ?? null })
    .where(eq(mastersTable.id, id))
    .returning();

  if (!result[0]) return res.status(404).json({ error: "Master not found" });
  res.json({ success: true, master: result[0] });
});

export default router;
