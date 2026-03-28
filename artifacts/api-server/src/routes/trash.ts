import { Router } from "express";
import { db, mastersTable, ordersTable, leadsTable, orderDispatchesTable, transactionsTable, masterReviewsTable, masterMessagesTable } from "@workspace/db";
import { isNull, isNotNull, lt, and, eq, inArray } from "drizzle-orm";
import { requirePermission } from "../middlewares/requireAuth.js";
import { objectStorageClient } from "../lib/objectStorage.js";

const router = Router();
const adminOnly = requirePermission("trash");

const TRASH_TTL_DAYS = 30;
const TRASH_TTL_MS = TRASH_TTL_DAYS * 24 * 60 * 60 * 1000;

function daysLeft(deletedAt: Date): number {
  const expiry = new Date(deletedAt.getTime() + TRASH_TTL_MS);
  return Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

async function deleteAvatarFile(customAvatarUrl: string | null) {
  if (!customAvatarUrl) return;
  if (customAvatarUrl.includes("/api/masters/avatar/")) {
    try {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) return;
      const filename = customAvatarUrl.split("/api/masters/avatar/")[1];
      if (!filename) return;
      await objectStorageClient.bucket(bucketId).file(`avatars/${filename}`).delete({ ignoreNotFound: true });
    } catch {}
  }
}

// Permanently delete an order and all its FK-referenced rows
async function deleteOrderCascade(orderId: number) {
  // 1. Clean up order_dispatches
  await db.delete(orderDispatchesTable).where(eq(orderDispatchesTable.orderId, orderId));

  // 2. Handle transactions: refund unpaid commission to master debt
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

  // 4. Delete the order itself (must be soft-deleted)
  await db.delete(ordersTable).where(and(eq(ordersTable.id, orderId), isNotNull(ordersTable.deletedAt)));
}

// Permanently delete a lead and cascade to its orders
async function deleteLeadCascade(leadId: number) {
  // Find all orders belonging to this lead (must be soft-deleted)
  const orders = await db.select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.leadId, leadId), isNotNull(ordersTable.deletedAt)));

  for (const o of orders) {
    await deleteOrderCascade(o.id);
  }

  // If there are non-soft-deleted orders referencing this lead — block deletion
  const liveOrders = await db.select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.leadId, leadId), isNull(ordersTable.deletedAt)));

  if (liveOrders.length > 0) {
    throw new Error(`Невозможно удалить заявку: у неё есть ${liveOrders.length} активных заказов. Сначала удалите заказы.`);
  }

  await db.delete(leadsTable).where(and(eq(leadsTable.id, leadId), isNotNull(leadsTable.deletedAt)));
}

// Permanently delete a master and clean up all FK references
async function deleteMasterCascade(masterId: number, avatarUrl: string | null) {
  // 1. Null out orders.masterId (field is nullable → SET NULL)
  await db.update(ordersTable).set({ masterId: null }).where(eq(ordersTable.masterId, masterId));

  // 2. Delete dispatches that reference this master
  await db.delete(orderDispatchesTable).where(eq(orderDispatchesTable.masterId, masterId));

  // 3. Delete transactions referencing this master (no refund — master is permanently deleted)
  await db.delete(transactionsTable).where(eq(transactionsTable.masterId, masterId));

  // 4. Delete master messages
  await db.delete(masterMessagesTable).where(eq(masterMessagesTable.masterId, masterId));

  // 5. Delete avatar from storage
  await deleteAvatarFile(avatarUrl);

  // 6. Delete the master (reviews, push_subscriptions, master_tasks cascade automatically)
  await db.delete(mastersTable).where(and(eq(mastersTable.id, masterId), isNotNull(mastersTable.deletedAt)));
}

// ─── GET /api/trash ──────────────────────────────────────────────────────────

router.get("/", adminOnly, async (_req, res) => {
  const [masters, orders, leads] = await Promise.all([
    db.select().from(mastersTable).where(isNotNull(mastersTable.deletedAt)),
    db.select().from(ordersTable).where(isNotNull(ordersTable.deletedAt)),
    db.select().from(leadsTable).where(isNotNull(leadsTable.deletedAt)),
  ]);

  // Count active orders per lead to warn about blocked deletion
  const leadIds = leads.map(l => l.id);
  const liveOrdersByLead: Record<number, number> = {};
  if (leadIds.length > 0) {
    const liveOrders = await db.select({ leadId: ordersTable.leadId })
      .from(ordersTable)
      .where(and(inArray(ordersTable.leadId, leadIds), isNull(ordersTable.deletedAt)));
    for (const o of liveOrders) {
      liveOrdersByLead[o.leadId] = (liveOrdersByLead[o.leadId] ?? 0) + 1;
    }
  }

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
      subtitle: `${o.city}${o.district ? ", " + o.district : ""}`,
      deletedAt: o.deletedAt,
      daysLeft: daysLeft(o.deletedAt!),
    })),
    leads: leads.map(l => ({
      id: l.id, type: "lead",
      title: `Заявка #${l.id} — ${l.clientName}`,
      subtitle: `${l.city} · ${l.clientPhone}`,
      deletedAt: l.deletedAt,
      daysLeft: daysLeft(l.deletedAt!),
      blockedByOrders: liveOrdersByLead[l.id] ?? 0,
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

  try {
    if (type === "master") {
      const [master] = await db.select().from(mastersTable)
        .where(and(eq(mastersTable.id, numId), isNotNull(mastersTable.deletedAt)));
      if (!master) return res.status(404).json({ error: "Мастер не найден в корзине" });
      await deleteMasterCascade(numId, master.customAvatarUrl ?? null);
    } else if (type === "order") {
      const [order] = await db.select({ id: ordersTable.id }).from(ordersTable)
        .where(and(eq(ordersTable.id, numId), isNotNull(ordersTable.deletedAt)));
      if (!order) return res.status(404).json({ error: "Заказ не найден в корзине" });
      await deleteOrderCascade(numId);
    } else if (type === "lead") {
      const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable)
        .where(and(eq(leadsTable.id, numId), isNotNull(leadsTable.deletedAt)));
      if (!lead) return res.status(404).json({ error: "Заявка не найдена в корзине" });
      await deleteLeadCascade(numId);
    } else {
      return res.status(400).json({ error: "Unknown type" });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("[trash delete]", err);
    res.status(400).json({ error: err?.message ?? "Ошибка при удалении" });
  }
});

// ─── Auto-cleanup: permanently delete items older than 30 days ───────────────

export async function runTrashCleanup() {
  const cutoff = new Date(Date.now() - TRASH_TTL_MS);

  const expiredMasters = await db.select().from(mastersTable)
    .where(and(isNotNull(mastersTable.deletedAt), lt(mastersTable.deletedAt, cutoff)));
  for (const m of expiredMasters) {
    try {
      await deleteMasterCascade(m.id, m.customAvatarUrl ?? null);
    } catch (e) {
      console.error(`[trash cleanup] master ${m.id} delete failed:`, e);
    }
  }

  const expiredOrders = await db.select().from(ordersTable)
    .where(and(isNotNull(ordersTable.deletedAt), lt(ordersTable.deletedAt, cutoff)));
  for (const o of expiredOrders) {
    try {
      await deleteOrderCascade(o.id);
    } catch (e) {
      console.error(`[trash cleanup] order ${o.id} delete failed:`, e);
    }
  }

  const expiredLeads = await db.select().from(leadsTable)
    .where(and(isNotNull(leadsTable.deletedAt), lt(leadsTable.deletedAt, cutoff)));
  for (const l of expiredLeads) {
    try {
      await deleteLeadCascade(l.id);
    } catch (e) {
      console.error(`[trash cleanup] lead ${l.id} delete failed:`, e);
    }
  }

  console.log(`[trash cleanup] purged items older than ${TRASH_TTL_DAYS} days`);
}

export default router;
