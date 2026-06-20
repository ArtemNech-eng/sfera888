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
    orderAggregates,
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
    // Single SQL for 4 aggregates (was 4 separate queries before).
    // Postgres scans orders once and computes all counts via FILTER WHERE.
    db.execute(sql`
      SELECT
        master_id AS "masterId",
        COUNT(*) FILTER (WHERE status = 'completed') AS "completed",
        COUNT(*) FILTER (WHERE status = 'cancelled' AND deleted_at IS NULL) AS "cancelled",
        COUNT(*) FILTER (
          WHERE cancel_type IS NOT NULL
            AND cancel_type <> 'client_refused'
            AND updated_at >= ${thirtyDaysAgo}
        ) AS "cancel30d",
        COUNT(*) FILTER (
          WHERE cancel_type IS NOT NULL
            AND cancel_type <> 'client_refused'
            AND updated_at >= ${sevenDaysAgo}
        ) AS "cancel7d"
      FROM orders
      WHERE master_id IS NOT NULL
      GROUP BY master_id
    `),
    db.select().from(ordersTable)
      .where(inArray(ordersTable.status, ["master_assigned", "in_progress"])),
  ]);
  const t1 = Date.now();

  // Build cancel/completed maps from the single aggregate result
  const completedMap = new Map<number, number>();
  const cancelledMap = new Map<number, number>();
  const cancelMap30d = new Map<number, number>();
  const cancelMap7d = new Map<number, number>();
  for (const row of (orderAggregates.rows as any[])) {
    const masterId = Number(row.masterId);
    completedMap.set(masterId, Number(row.completed));
    cancelledMap.set(masterId, Number(row.cancelled));
    cancelMap30d.set(masterId, Number(row.cancel30d));
    cancelMap7d.set(masterId, Number(row.cancel7d));
  }

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
  // completedMap, cancelledMap, cancelMap30d, cancelMap7d are built above
  // from the single orderAggregates query.
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
    createdAt: m.createdAt,
    contractSignedAt: m.contractSignedAt ?? null,
    passportVerified: m.passportVerified ?? false,
    pwaLogin: m.pwaLogin ?? null,
    lastSeenAt: m.lastSeenAt ?? null,
    cancelCount30d: cancelMap30d.get(m.id) ?? 0,
    cancelCount7d: cancelMap7d.get(m.id) ?? 0,
    completedOrders: completedMap.get(m.id) ?? 0,
    cancelledOrders: cancelledMap.get(m.id) ?? 0,
    fomoDisabled: m.fomoDisabled ?? false,
    consecutiveCancellations: m.consecutiveCancellations ?? 0,
    blockedFromOrders: m.blockedFromOrders ?? false,
    blockedAt: m.blockedAt ?? null,
    blockedReason: m.blockedReason ?? null,
    manualUnblocksCount: m.manualUnblocksCount ?? 0,
    // ── Heavy fields stripped from list response ────────────────────────────
    // These are loaded on-demand when MasterDrawer opens via GET /api/masters/:id.
    // Keeps list response small (~3-5 KB per master vs ~12 KB before).
    // Removed: passportPhotoUrl, passportRegPhotoUrl, passportVerifyNote,
    // contractFullName/PassportNumber/PassportDate/PassportIssuer/Address,
    // contractSignIp, contractLink, workingHours, preferredDistricts,
    // minArea, servicePrices, maxChatId, balance/creditLimit/totalServiceFeesSpent (legacy).
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
