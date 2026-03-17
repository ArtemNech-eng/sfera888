import { Router } from "express";
import fs from "fs";
import path from "path";
import { db, mastersTable, ordersTable, leadsTable, orderDispatchesTable, transactionsTable, masterReviewsTable } from "@workspace/db";
import { isNull, isNotNull, lt, and, eq } from "drizzle-orm";
import { requirePermission } from "../middlewares/requireAuth.js";
import { AVATAR_DIR } from "../config.js";

const router = Router();
const adminOnly = requirePermission("trash");

const TRASH_TTL_DAYS = 30;
const TRASH_TTL_MS = TRASH_TTL_DAYS * 24 * 60 * 60 * 1000;

function daysLeft(deletedAt: Date): number {
  const expiry = new Date(deletedAt.getTime() + TRASH_TTL_MS);
  return Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function deleteAvatarFile(customAvatarUrl: string | null) {
  if (!customAvatarUrl?.includes("/uploads/avatars/")) return;
  const filename = customAvatarUrl.split("/uploads/avatars/")[1];
  if (!filename) return;
  const filePath = path.join(AVATAR_DIR, filename);
  try { fs.unlinkSync(filePath); } catch {}
}

async function deleteOrderCascade(orderId: number) {
  // 1. Clean up order_dispatches (FK: order_id → orders.id, no cascade)
  await db.delete(orderDispatchesTable).where(eq(orderDispatchesTable.orderId, orderId));

  // 2. Handle transactions: if commission > 0 and not paid → refund debt, then delete
  const txRows = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, orderId));
  for (const tx of txRows) {
    if (Number(tx.commission) > 0 && tx.paymentStatus !== "paid") {
      const mRows = await db.select().from(mastersTable).where(eq(mastersTable.id, tx.masterId));
      const m = mRows[0];
      if (m) {
        const refundedDebt = Math.max(0, Number(m.debt) - Number(tx.commission));
        await db.update(mastersTable).set({ debt: String(refundedDebt) }).where(eq(mastersTable.id, tx.masterId));
      }
    }
  }
  await db.delete(transactionsTable).where(eq(transactionsTable.orderId, orderId));

  // 3. Null out reviews that reference this order (nullable FK, no cascade)
  await db.update(masterReviewsTable).set({ orderId: null }).where(eq(masterReviewsTable.orderId, orderId));

  // 4. Delete the order itself
  await db.delete(ordersTable).where(and(eq(ordersTable.id, orderId), isNotNull(ordersTable.deletedAt)));
}

// ─── GET /api/trash ──────────────────────────────────────────────────────────

router.get("/", adminOnly, async (_req, res) => {
  const [masters, orders, leads] = await Promise.all([
    db.select().from(mastersTable).where(isNotNull(mastersTable.deletedAt)),
    db.select().from(ordersTable).where(isNotNull(ordersTable.deletedAt)),
    db.select().from(leadsTable).where(isNotNull(leadsTable.deletedAt)),
  ]);

  res.json({
    masters: masters.map(m => ({
      id: m.id, type: "master",
      title: m.alias,
      subtitle: `${m.city} · ${m.specialization}`,
      deletedAt: m.deletedAt,
      daysLeft: daysLeft(m.deletedAt!),
    })),
    orders: orders.map(o => ({
      id: o.id, type: "order",
      title: `Заказ #${o.id} — ${o.serviceType}`,
      subtitle: `${o.city}, ${o.district}`,
      deletedAt: o.deletedAt,
      daysLeft: daysLeft(o.deletedAt!),
    })),
    leads: leads.map(l => ({
      id: l.id, type: "lead",
      title: `Заявка #${l.id} — ${l.clientName}`,
      subtitle: `${l.city} · ${l.clientPhone}`,
      deletedAt: l.deletedAt,
      daysLeft: daysLeft(l.deletedAt!),
    })),
  });
});

// ─── PATCH /api/trash/restore/:type/:id ──────────────────────────────────────

router.patch("/restore/:type/:id", adminOnly, async (req, res) => {
  const { type, id } = req.params;
  const numId = parseInt(id);

  if (type === "master") {
    await db.update(mastersTable).set({ deletedAt: null }).where(eq(mastersTable.id, numId));
  } else if (type === "order") {
    await db.update(ordersTable).set({ deletedAt: null }).where(eq(ordersTable.id, numId));
  } else if (type === "lead") {
    await db.update(leadsTable).set({ deletedAt: null }).where(eq(leadsTable.id, numId));
  } else {
    return res.status(400).json({ error: "Unknown type" });
  }

  res.json({ success: true });
});

// ─── DELETE /api/trash/:type/:id — permanent delete ──────────────────────────

router.delete("/:type/:id", adminOnly, async (req, res) => {
  const { type, id } = req.params;
  const numId = parseInt(id);

  if (type === "master") {
    const [master] = await db.select().from(mastersTable)
      .where(and(eq(mastersTable.id, numId), isNotNull(mastersTable.deletedAt)));
    if (master) deleteAvatarFile(master.customAvatarUrl ?? null);
    await db.delete(mastersTable).where(and(eq(mastersTable.id, numId), isNotNull(mastersTable.deletedAt)));
  } else if (type === "order") {
    await deleteOrderCascade(numId);
  } else if (type === "lead") {
    await db.delete(leadsTable).where(and(eq(leadsTable.id, numId), isNotNull(leadsTable.deletedAt)));
  } else {
    return res.status(400).json({ error: "Unknown type" });
  }

  res.json({ success: true });
});

// ─── Auto-cleanup: permanently delete items older than 30 days ───────────────

export async function runTrashCleanup() {
  const cutoff = new Date(Date.now() - TRASH_TTL_MS);

  const expiredMasters = await db.select().from(mastersTable)
    .where(and(isNotNull(mastersTable.deletedAt), lt(mastersTable.deletedAt, cutoff)));
  for (const m of expiredMasters) {
    deleteAvatarFile(m.customAvatarUrl ?? null);
  }

  const expiredOrders = await db.select().from(ordersTable)
    .where(and(isNotNull(ordersTable.deletedAt), lt(ordersTable.deletedAt, cutoff)));
  for (const o of expiredOrders) {
    await deleteOrderCascade(o.id);
  }

  await Promise.all([
    db.delete(mastersTable).where(and(isNotNull(mastersTable.deletedAt), lt(mastersTable.deletedAt, cutoff))),
    db.delete(leadsTable).where(and(isNotNull(leadsTable.deletedAt), lt(leadsTable.deletedAt, cutoff))),
  ]);
  console.log(`[trash cleanup] purged items older than ${TRASH_TTL_DAYS} days`);
}

export default router;
