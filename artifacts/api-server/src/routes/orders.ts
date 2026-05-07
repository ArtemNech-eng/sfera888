import { Router } from "express";
import { db, ordersTable, mastersTable, transactionsTable, voronkaColumnsTable, orderDispatchesTable, leadsTable, masterMessagesTable, orderStatusLogsTable, usersTable, receiptsTable, fomoEventsTable } from "@workspace/db";
import { eq, inArray, and, ne, isNull, isNotNull, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { calculateCommission, getCommissionSettings } from "../lib/commission.js";
import { getMasterEligibility, getOverdueMasterIds, countActiveMasterOrders, getColumnIdForActiveCount } from "../lib/orderEligibility.js";
import { recalcMasterColumn } from "../lib/masterColumn.js";
import { performBroadcast } from "../lib/broadcastOrder.js";
import { sendPushToMaster } from "../lib/push.js";
import { sendMaxMessage } from "../maxBot.js";
import { analyseOrderCancellation, sendFeedbackRequest } from "../lib/dispatcherAI.js";
import { recordOrderCancelled, recordOrderCompleted, revertOrderCancellation } from "../lib/masterReputation.js";

// Telegram-бот удалён.

function buildOrderCard(order: any, orderId: number): string {
  const formatDate = (d: Date | null | undefined) => {
    if (!d) return "не указана";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
  };
  return (
    `📋 <b>Новая заявка #${orderId}</b>\n\n` +
    `🔧 Услуга: <b>${order.serviceType}</b>\n` +
    `📍 Район: <b>${order.city}${order.district ? ", " + order.district : ""}</b>\n` +
    `📐 Объём: <b>${order.area} м²</b>\n` +
    `📅 Дата: <b>${formatDate(order.scheduledAt)}</b>` +
    (order.comment ? `\n💬 Комментарий: ${order.comment}` : "") +
    `\n\n<i>Нажмите кнопку, чтобы откликнуться.</i>`
  );
}

const router = Router();
const allOrderRoles = requireRole("admin", "master_operator");

// ─── Column helpers ───────────────────────────────────────────────────────────

async function getOnSiteColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.name === "На объекте")
    ?? cols.find(c => c.receivesOrders && c.name !== "Свободен")
    ?? cols.find(c => c.receivesOrders)
    ?? null;
}

async function getFreeColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.receivesOrders) ?? null;
}

async function getAwaitingPaymentColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.name === "Ожидает оплаты") ?? null;
}

router.get("/", allOrderRoles, async (req, res) => {
  const { status, masterId } = req.query;
  const conditions: any[] = [];
  if (status) conditions.push(eq(ordersTable.status, status as any));
  if (masterId) conditions.push(eq(ordersTable.masterId, parseInt(masterId as string)));
  conditions.push(isNull(ordersTable.deletedAt));
  const orders = await db.select().from(ordersTable).where(and(...conditions)).orderBy(desc(ordersTable.createdAt));

  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

  const leads = await db.select().from(leadsTable);
  const leadMap = new Map(leads.map(l => [l.id, l]));

  // Fetch transaction info for all orders (orderAmount, commission, paymentStatus from finance)
  const orderIds = orders.map(o => o.id);
  let txMap = new Map<number, any>();
  if (orderIds.length > 0) {
    const txRows = await db.select().from(transactionsTable).where(inArray(transactionsTable.orderId, orderIds));
    for (const t of txRows) {
      if (!txMap.has(t.orderId)) txMap.set(t.orderId, t);
    }
  }

  res.json(orders.map(o => {
    const tx = txMap.get(o.id);
    return {
    id: o.id,
    leadId: o.leadId,
    city: o.city,
    district: o.district,
    serviceType: o.serviceType,
    area: Number(o.area),
    scheduledAt: o.scheduledAt ?? null,
    comment: o.comment ?? null,
    status: o.status,
    dispatchStatus: o.dispatchStatus,
    masterId: o.masterId ?? null,
    masterName: o.masterId ? (masterMap.get(o.masterId)?.alias ?? null) : null,
    clientPhone: leadMap.get(o.leadId)?.clientPhone ?? null,
    clientName: leadMap.get(o.leadId)?.clientName ?? null,
    proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    clientRating: o.clientRating ?? null,
    cancelReason: o.cancelReason ?? null,
    cancelType: (o as any).cancelType ?? null,
    operatorNote: (o as any).operatorNote ?? null,
    assignedAt: (o as any).assignedAt ?? null,
    completedAt: (o as any).completedAt ?? null,
    photosBefore: (o as any).photosBefore ?? [],
    photosAfter: (o as any).photosAfter ?? [],
    photoAct: (o as any).photoAct ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    // Transaction info from finance (may exist even if order fields are empty)
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

router.get("/:id", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!rows[0]) return res.status(404).json({ error: "Order not found" });
  const o = rows[0];
  let masterName: string | null = null;
  if (o.masterId) {
    const m = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    masterName = m[0]?.alias ?? null;
  }
  // Fetch transaction info for this order
  const txRows = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
  const tx = txRows[0] ?? null;
  res.json({
    id: o.id,
    leadId: o.leadId,
    city: o.city,
    district: o.district,
    serviceType: o.serviceType,
    area: Number(o.area),
    scheduledAt: o.scheduledAt ?? null,
    comment: o.comment ?? null,
    status: o.status,
    masterId: o.masterId ?? null,
    masterName,
    proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    clientRating: o.clientRating ?? null,
    cancelReason: o.cancelReason ?? null,
    cancelType: (o as any).cancelType ?? null,
    operatorNote: (o as any).operatorNote ?? null,
    assignedAt: (o as any).assignedAt ?? null,
    completedAt: (o as any).completedAt ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    // Transaction info from finance (may exist even if order fields are empty)
    transactionInfo: tx ? {
      orderAmount: Number(tx.orderAmount),
      commission: Number(tx.commission),
      prepaymentDeducted: Number(tx.prepaymentDeducted ?? 0),
      paymentStatus: tx.paymentStatus,
      paidAt: tx.paidAt ?? null,
    } : null,
  });
});

router.patch("/:id", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, orderAmount, commission, clientRating, proposedAmount, acceptProposed, approveCancellation, rejectCancellation, restoreOrder, operatorNote, clientCancelReason } = req.body;

  // Fetch current order to get masterId before update
  const currentRows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!currentRows[0]) return res.status(404).json({ error: "Order not found" });
  const current = currentRows[0];

  const updates: any = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (proposedAmount !== undefined) updates.proposedAmount = proposedAmount !== null ? String(proposedAmount) : null;
  if (operatorNote !== undefined) updates.operatorNote = operatorNote !== null ? operatorNote : null;
  if (clientCancelReason !== undefined) updates.operatorNote = clientCancelReason || null;

  // When operator directly cancels — close dispatches and reset dispatchStatus
  if (status === "cancelled" && current.status !== "cancelled") {
    updates.dispatchStatus = "none";
  }

  // Track status transition for timestamps and logging
  let newStatus: string | null = null;

  // Approve cancellation → set status cancelled
  if (approveCancellation) {
    updates.status = "cancelled";
    newStatus = "cancelled";
  }
  // Reject cancellation → detach master, reset order for re-broadcast, clear reason
  if (rejectCancellation) {
    updates.status = "waiting_master";
    newStatus = "waiting_master";
    updates.masterId = null;
    updates.cancelReason = null;
    updates.dispatchStatus = "none";
  }

  // Restore cancelled order — smart: keep master if was assigned, otherwise clear for re-broadcast
  if (restoreOrder && current.status === "cancelled") {
    updates.cancelReason = null;
    updates.cancelType = null;
    if (current.masterId) {
      // Master was assigned before cancellation — restore to assigned state, keep master
      updates.status = "master_assigned";
      newStatus = "master_assigned";
      updates.dispatchStatus = "assigned";
      updates.assignedAt = (current as any).assignedAt ?? new Date();
    } else {
      // No master — restore to waiting, ready for re-broadcast
      updates.status = "waiting_master";
      newStatus = "waiting_master";
      updates.dispatchStatus = "none";
    }
  }

  // Set timestamps on status transitions
  if (status === "master_assigned" && current.status !== "master_assigned") {
    updates.assignedAt = new Date();
    newStatus = "master_assigned";
  }
  if (status === "completed" && current.status !== "completed") {
    updates.completedAt = new Date();
    newStatus = "completed";
  }
  if (status && !newStatus) newStatus = status;

  // "Accept proposed" — copy proposedAmount → orderAmount and auto-calc commission
  if (acceptProposed && current.proposedAmount) {
    const amt = Number(current.proposedAmount);
    updates.orderAmount = String(amt);
    const commSettings = await getCommissionSettings();
    updates.commission = String(calculateCommission(amt, commSettings));
  } else if (orderAmount !== undefined) {
    updates.orderAmount = orderAmount !== null ? String(orderAmount) : null;
    if (commission !== undefined) {
      updates.commission = commission !== null ? String(commission) : null;
    } else if (orderAmount !== null) {
      const commSettings = await getCommissionSettings();
      updates.commission = String(calculateCommission(Number(orderAmount), commSettings));
    }
  } else if (commission !== undefined) {
    updates.commission = commission !== null ? String(commission) : null;
  }
  if (clientRating !== undefined) updates.clientRating = clientRating;

  const result = await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Order not found" });
  const o = result[0];

  // ── Репутация мастера: счётчик подряд отменённых заказов ───────────────────
  // Завершённый заказ сбрасывает счётчик. Отменённый — увеличивает; на 2-м подряд
  // мастер автоблокируется (см. lib/masterReputation.ts). rejectCancellation
  // не считается отменой — мастер сохраняет заказ.
  if (current.masterId && newStatus === "completed" && current.status !== "completed") {
    await recordOrderCompleted(current.masterId).catch(e =>
      console.error("[orders] recordOrderCompleted error:", e),
    );
  }
  if (
    current.masterId &&
    !rejectCancellation &&
    newStatus === "cancelled" &&
    current.status !== "cancelled"
  ) {
    await recordOrderCancelled(current.masterId, id).catch(e =>
      console.error("[orders] recordOrderCancelled error:", e),
    );
  }
  // Восстановление ошибочно отменённого заказа — откатываем штраф
  if (restoreOrder && current.status === "cancelled" && current.masterId) {
    await revertOrderCancellation(current.masterId).catch(e =>
      console.error("[orders] revertOrderCancellation error:", e),
    );
  }

  // ── Log status change ─────────────────────────────────────────────────────
  if (newStatus && newStatus !== current.status) {
    const sessionUser = (req as any).session?.userId ?? null;
    let userAlias = "система";
    if (sessionUser) {
      const userRows = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser));
      userAlias = userRows[0]?.name ?? userRows[0]?.login ?? "система";
    }
    await db.insert(orderStatusLogsTable).values({
      orderId: id,
      oldStatus: current.status,
      newStatus,
      userId: sessionUser,
      userAlias,
    }).catch(() => {});
  }

  // ── Update/create transaction when commission is confirmed ──────────────────
  const commissionConfirmed = (acceptProposed && current.proposedAmount) ||
    (orderAmount !== undefined && orderAmount !== null);
  let autoCompleteOrder = false;
  if (commissionConfirmed && o.masterId && o.orderAmount && o.commission) {
    const existingTxRows = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
    const existingTx = existingTxRows[0];
    const commissionValue = Number(o.commission);

    // Sum prepayments already confirmed by client for this order
    const paidReceiptRows = await db.select().from(receiptsTable).where(
      and(eq(receiptsTable.orderId, id), isNotNull(receiptsTable.prepaymentSubmittedAt))
    );
    const totalPrepaid = paidReceiptRows.reduce((sum, r) => sum + Number(r.prepaymentAmount), 0);
    const prepaymentDeducted = Math.min(totalPrepaid, commissionValue);
    const netPayable = Math.max(0, commissionValue - prepaymentDeducted);
    const fullyPaidByPrepayment = netPayable === 0;
    if (acceptProposed && fullyPaidByPrepayment) autoCompleteOrder = true;

    if (existingTx) {
      const wasPlaceholder = Number(existingTx.commission) === 0;
      const prevCommission = Number(existingTx.commission);
      const prevPrepaymentDeducted = Number(existingTx.prepaymentDeducted ?? 0);
      const prevNetPayable = Math.max(0, prevCommission - prevPrepaymentDeducted);

      // Update the transaction with real amounts and prepayment info
      await db.update(transactionsTable).set({
        orderAmount: o.orderAmount,
        commission: o.commission,
        prepaymentDeducted: String(prepaymentDeducted),
        paymentStatus: fullyPaidByPrepayment ? "paid" : "pending",
        paidAt: fullyPaidByPrepayment ? new Date() : existingTx.paidAt,
      }).where(eq(transactionsTable.id, existingTx.id));

      const mRows = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
      const m = mRows[0];
      if (m) {
        if (wasPlaceholder) {
          // First confirmation: add net payable (commission minus prepayment) to debt
          if (netPayable > 0) {
            const newDebt = Number(m.debt) + netPayable;
            await db.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, o.masterId));
          }
          // PWA push — primary notification channel
          {
            const pushBody = fullyPaidByPrepayment
              ? `Сумма ${Number(o.orderAmount).toLocaleString("ru-RU")} ₽. Комиссия ${commissionValue.toLocaleString("ru-RU")} ₽ покрыта предоплатой клиента.`
              : prepaymentDeducted > 0
                ? `Сумма ${Number(o.orderAmount).toLocaleString("ru-RU")} ₽. К оплате: ${netPayable.toLocaleString("ru-RU")} ₽ (предоплата ${prepaymentDeducted.toLocaleString("ru-RU")} ₽ зачтена).`
                : `Сумма ${Number(o.orderAmount).toLocaleString("ru-RU")} ₽. Комиссия к оплате: ${commissionValue.toLocaleString("ru-RU")} ₽.`;
            sendPushToMaster(o.masterId, {
              title: "✅ Сумма по заказу подтверждена",
              body: pushBody,
              url: "/balance",
            }).catch(() => {});
          }
          // Telegram удалён — мастер видит детали комиссии в PWA push + балансе.
        } else if (commissionValue !== prevCommission || prepaymentDeducted !== prevPrepaymentDeducted) {
          // Commission re-adjusted: recalculate delta based on net payable difference
          const delta = netPayable - prevNetPayable;
          const newDebt = Math.max(0, Number(m.debt) + delta);
          await db.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, o.masterId));
        }
      }
    } else {
      // No placeholder exists (legacy order) — create transaction
      await db.insert(transactionsTable).values({
        orderId: id,
        masterId: o.masterId,
        orderAmount: o.orderAmount,
        commission: o.commission,
        prepaymentDeducted: String(prepaymentDeducted),
        paymentStatus: fullyPaidByPrepayment ? "paid" : "pending",
        paidAt: fullyPaidByPrepayment ? new Date() : undefined,
      });
      const mRows = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
      const m = mRows[0];
      if (m) {
        if (netPayable > 0) {
          const newDebt = Number(m.debt) + netPayable;
          await db.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, o.masterId));
        }
        // PWA push — primary notification channel
        {
          const pushBody = fullyPaidByPrepayment
            ? `Сумма ${Number(o.orderAmount).toLocaleString("ru-RU")} ₽. Комиссия ${commissionValue.toLocaleString("ru-RU")} ₽ покрыта предоплатой клиента.`
            : prepaymentDeducted > 0
              ? `Сумма ${Number(o.orderAmount).toLocaleString("ru-RU")} ₽. К оплате: ${netPayable.toLocaleString("ru-RU")} ₽ (предоплата ${prepaymentDeducted.toLocaleString("ru-RU")} ₽ зачтена).`
              : `Сумма ${Number(o.orderAmount).toLocaleString("ru-RU")} ₽. Комиссия к оплате: ${commissionValue.toLocaleString("ru-RU")} ₽.`;
          sendPushToMaster(o.masterId, {
            title: "✅ Сумма по заказу подтверждена",
            body: pushBody,
            url: "/balance",
          }).catch(() => {});
        }
        // Telegram удалён — мастер видит детали комиссии в PWA push + балансе.
      }
    }
  }

  // ── Auto-complete order if commission fully covered by prepayment ─────────────
  if (autoCompleteOrder && o.status !== "completed") {
    await db.update(ordersTable)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(ordersTable.id, id));
    // Репутация: автозавершение тоже сбрасывает счётчик подряд отменённых
    if (current.masterId) {
      await recordOrderCompleted(current.masterId).catch(e =>
        console.error("[orders] recordOrderCompleted (auto) error:", e),
      );
    }
    const sessionUser = (req as any).session?.userId ?? null;
    let userAlias = "система";
    if (sessionUser) {
      const userRows = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser));
      userAlias = userRows[0]?.name ?? userRows[0]?.login ?? "система";
    }
    await db.insert(orderStatusLogsTable).values({
      orderId: id,
      oldStatus: o.status,
      newStatus: "completed",
      userId: sessionUser,
      userAlias,
    }).catch(() => {});
    // Also mark transaction as paid
    await db.update(transactionsTable)
      .set({ paymentStatus: "paid", paidAt: new Date() })
      .where(and(eq(transactionsTable.orderId, id), eq(transactionsTable.paymentStatus as any, "pending")))
      .catch(() => {});
  }

  // ── Delete placeholder transaction when order is cancelled ───────────────────
  const isBeingCancelled = approveCancellation || rejectCancellation || updates.status === "cancelled";
  if (isBeingCancelled && current.masterId) {
    const txRows = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
    const tx = txRows[0];
    if (tx && Number(tx.commission) === 0) {
      // Placeholder — safe to delete, no debt was added
      await db.delete(transactionsTable).where(eq(transactionsTable.id, tx.id));
    }
  }

  // ── Close dispatch records when operator directly cancels ────────────────────
  if (status === "cancelled" && current.status !== "cancelled") {
    await db.update(orderDispatchesTable)
      .set({ status: "cancelled" } as any)
      .where(eq(orderDispatchesTable.orderId, id))
      .catch(() => {});
  }

  // Auto-move master between voronka columns based on status change
  if ((status !== undefined || approveCancellation) && current.masterId) {
    const masterId = current.masterId;
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
    const master = masterRows[0];
    if (master) {
      if (status === "master_assigned" || status === "in_progress") {
        // Count all active orders for this master (including this one), move to correct column
        const activeCount = await countActiveMasterOrders(masterId);
        const colId = await getColumnIdForActiveCount(activeCount);
        if (colId) {
          await db.update(mastersTable).set({ voronkaColumnId: colId }).where(eq(mastersTable.id, masterId));
        }
      } else if (status === "completed") {
        // Count REMAINING active orders (excluding this order)
        const remainingCount = await countActiveMasterOrders(masterId, id);
        if (remainingCount > 0) {
          // Still has other active orders — keep them in the appropriate column
          const colId = await getColumnIdForActiveCount(remainingCount);
          if (colId) {
            await db.update(mastersTable).set({ voronkaColumnId: colId }).where(eq(mastersTable.id, masterId));
          }
        } else {
          // Last active order completed — move to "Ожидает оплаты"
          const awaitingCol = await getAwaitingPaymentColumn();
          if (awaitingCol) {
            await db.update(mastersTable).set({ voronkaColumnId: awaitingCol.id }).where(eq(mastersTable.id, masterId));
          }
        }

        // Send feedback request to master via Max if linked
        if (master.maxChatId) {
          sendFeedbackRequest(master.id, master.alias, master.maxChatId, id).catch(e =>
            console.error(`[orders] Failed to send feedback request for order #${id}:`, e),
          );
        }
      } else if (status === "cancelled" || approveCancellation) {
        // Count REMAINING active orders (excluding this order)
        const remainingCount = await countActiveMasterOrders(masterId, id);
        const colId = await getColumnIdForActiveCount(remainingCount);
        if (colId) {
          await db.update(mastersTable).set({ voronkaColumnId: colId }).where(eq(mastersTable.id, masterId));
        }
      } else if (rejectCancellation) {
        // Master stays in current voronka column (operator must free them manually)
        // Nothing to move — intentionally left empty
      }
    }
  }

  // ── Re-broadcast after rejection ─────────────────────────────────────────
  if (rejectCancellation && current.masterId) {
    const rejectedMasterId = current.masterId;

    const rejectedMasterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, rejectedMasterId));
    const rejectedMaster = rejectedMasterRows[0];
    const rejectionMsg =
      `⚠️ Запрос на отмену заказа #${id} отклонён оператором.\n\n` +
      `Заказ передан другим мастерам. Ваш статус в воронке остаётся прежним — оператор переведёт вас в «Свободен» вручную.`;
    if (rejectedMaster?.maxChatId) {
      await sendMaxMessage(rejectedMaster.maxChatId, rejectionMsg).catch(() => {});
    }
    if (rejectedMaster?.pwaLogin) {
      await sendPushToMaster(rejectedMasterId, {
        title: "Отмена заказа отклонена",
        body: `Заказ #${id} передан другим мастерам.`,
        orderId: id,
      } as any).catch(() => {});
    }

    // Delete old dispatch records so we can re-broadcast
    await db.delete(orderDispatchesTable).where(eq(orderDispatchesTable.orderId, id));

    // Permanently block the cancelling master from receiving this order again
    await db.insert(orderDispatchesTable).values({
      orderId: id,
      masterId: rejectedMasterId,
      telegramChatId: rejectedMaster?.maxChatId ?? `pwa_${rejectedMasterId}`,
      status: "rejected",
      rejectionReason: "Мастер запросил отмену — оператор отклонил и переназначил заказ",
    });
    void buildOrderCard;

    // Re-broadcast to all eligible masters via standard pipeline (PWA push + Max).
    await performBroadcast(id).catch(e => console.error("[orders] re-broadcast error:", e));
  }

  // Async analysis of suspicious cancellations — fire and forget
  if ((approveCancellation || updates.status === "cancelled") && current.masterId) {
    const cancelledMasterId = current.masterId;
    db.select({ alias: mastersTable.alias }).from(mastersTable)
      .where(eq(mastersTable.id, cancelledMasterId))
      .then(rows => {
        if (rows[0]) {
          analyseOrderCancellation(id, cancelledMasterId, rows[0].alias, (current as any).cancelType ?? null)
            .catch(e => console.error("[orders] analyseOrderCancellation error:", e));
        }
      }).catch(() => {});
  }

  // Notify master when admin approves a cancellation request
  if (approveCancellation && current.masterId) {
    const cancelNotifyText =
      `❌ Заказ #${id} отменён\n\n` +
      `Отмена подтверждена. Обратите внимание: частые отмены снижают ваш рейтинг и количество поступающих вам заявок. Берите только те заказы, в которых уверены.`;

    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, current.masterId));
    const cancelledMaster = masterRows[0];
    if (cancelledMaster) {
      // Save to CRM chat (visible in CRM and master's app)
      await db.insert(masterMessagesTable).values({
        masterId: cancelledMaster.id,
        telegramChatId: `pwa_${cancelledMaster.id}`,
        text: cancelNotifyText,
        fromMaster: false,
        senderName: "system",
        isRead: false,
      }).catch(e => console.error("[orders] Failed to insert cancellation message:", e));

      // Send via Max if connected
      if (cancelledMaster.maxChatId) {
        sendMaxMessage(cancelledMaster.maxChatId, cancelNotifyText)
          .catch(e => console.error("[orders] Failed to send Max cancellation message:", e));
      }
    }
  }

  let masterName: string | null = null;
  if (o.masterId) {
    const m = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    masterName = m[0]?.alias ?? null;
  }
  // Fetch transaction info for this order
  const patchTxRows = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
  const patchTx = patchTxRows[0] ?? null;
  res.json({
    id: o.id,
    leadId: o.leadId,
    city: o.city,
    district: o.district,
    serviceType: o.serviceType,
    area: Number(o.area),
    scheduledAt: o.scheduledAt ?? null,
    comment: o.comment ?? null,
    status: o.status,
    masterId: o.masterId ?? null,
    masterName,
    proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    clientRating: o.clientRating ?? null,
    cancelReason: o.cancelReason ?? null,
    cancelType: (o as any).cancelType ?? null,
    operatorNote: (o as any).operatorNote ?? null,
    assignedAt: (o as any).assignedAt ?? null,
    completedAt: (o as any).completedAt ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    // Transaction info from finance
    transactionInfo: patchTx ? {
      orderAmount: Number(patchTx.orderAmount),
      commission: Number(patchTx.commission),
      prepaymentDeducted: Number(patchTx.prepaymentDeducted ?? 0),
      paymentStatus: patchTx.paymentStatus,
      paidAt: patchTx.paidAt ?? null,
    } : null,
  });
});

router.post("/:id/assign-master", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { masterId } = req.body;
  if (!masterId) return res.status(400).json({ error: "masterId required" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!masterRows[0]) return res.status(404).json({ error: "Master not found" });
  const master = masterRows[0];

  // Check if master's column allows receiving orders
  if (master.voronkaColumnId) {
    const colRows = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId));
    if (colRows[0] && !colRows[0].receivesOrders) {
      return res.status(400).json({ error: "Мастер не может принимать заказы в текущем статусе" });
    }
  }

  // Check order eligibility (limit + debt + overdue)
  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
  const masterActiveCount = activeOrders.filter(o => o.masterId === masterId).length;
  const overdueMasterIds = await getOverdueMasterIds();
  const eligibility = getMasterEligibility(master, masterActiveCount, overdueMasterIds);
  if (!eligibility.canAccept) {
    return res.status(400).json({ error: eligibility.reason });
  }

  const result = await db.update(ordersTable).set({
    masterId,
    status: "master_assigned",
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, id)).returning();

  if (!result[0]) return res.status(404).json({ error: "Order not found" });
  const o = result[0];

  // Update master stats + move to "На объекте" column automatically
  const onSiteCol = await getOnSiteColumn();
  await db.update(mastersTable).set({
    totalOrders: master.totalOrders + 1,
    acceptedOrders: master.acceptedOrders + 1,
    voronkaColumnId: onSiteCol?.id ?? master.voronkaColumnId,
  }).where(eq(mastersTable.id, masterId));

  // Create placeholder transaction — commission amount unknown yet, will be updated when order completes
  const existingTx = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
  if (existingTx.length === 0) {
    await db.insert(transactionsTable).values({
      orderId: id,
      masterId,
      orderAmount: "0",
      commission: "0",
      paymentStatus: "pending",
    });
  }

  if (master.maxChatId) {
    const amLead = o.leadId ? await db.select().from(leadsTable).where(eq(leadsTable.id, o.leadId)) : [];
    const amLeadRow = amLead[0];
    const amDate = o.scheduledAt
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(o.scheduledAt))
      : "не указана";
    sendMaxMessage(
      master.maxChatId,
      `✅ Вам назначена заявка #${id}\n\n🔧 ${o.serviceType}\n📍 ${o.city}${o.district ? ", " + o.district : ""}\n📐 ${o.area} м²\n📅 ${amDate}${o.comment ? "\n💬 " + o.comment : ""}${amLeadRow ? `\n\n📞 ${amLeadRow.clientName}\n${amLeadRow.clientPhone}` : ""}\n\n👉 Подробности в приложении:\nhttps://sfera-master.ru/master-pwa/orders`
    ).catch(() => {});
  }

  res.json({
    id: o.id,
    leadId: o.leadId,
    city: o.city,
    district: o.district,
    serviceType: o.serviceType,
    area: Number(o.area),
    scheduledAt: o.scheduledAt ?? null,
    comment: o.comment ?? null,
    status: o.status,
    masterId: o.masterId ?? null,
    masterName: master.alias,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    clientRating: o.clientRating ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  });
});

// ─── POST /api/orders/:id/unassign-master — admin removes master from order ───
router.post("/:id/unassign-master", requireRole("admin", "master_operator"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order id" });

  const { reason, rebroadcast } = req.body as { reason?: string; rebroadcast?: boolean };
  if (!reason?.trim()) return res.status(400).json({ error: "Укажите причину снятия мастера" });

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!order.masterId) return res.status(400).json({ error: "Нет назначенного мастера" });

  const prevMasterId = order.masterId;

  // Remove master from order, reset to waiting, store reason
  await db.update(ordersTable).set({
    masterId: null,
    status: "waiting_master",
    dispatchStatus: "none",
    cancelReason: reason.trim(),
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, id));

  // Mark unassigned master's dispatch record as "rejected" so they're excluded from future re-broadcasts
  await db.update(orderDispatchesTable)
    .set({ status: "rejected" })
    .where(and(eq(orderDispatchesTable.orderId, id), eq(orderDispatchesTable.masterId, prevMasterId)));

  // Log the status change
  const sessionUser = (req as any).session?.userId ?? null;
  let unassignUserAlias = "система";
  if (sessionUser) {
    const userRows = await db.select().from(usersTable).where(eq(usersTable.id, sessionUser));
    unassignUserAlias = userRows[0]?.name ?? userRows[0]?.login ?? "система";
  }
  await db.insert(orderStatusLogsTable).values({
    orderId: id,
    oldStatus: order.status,
    newStatus: "waiting_master",
    userId: sessionUser,
    userAlias: unassignUserAlias,
    note: `Мастер снят. Причина: ${reason.trim()}`,
  }).catch(() => {});

  // Update master voronka column based on remaining active orders
  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, prevMasterId));
  const master = masterRows[0];
  if (master) {
    const remainingCount = await countActiveMasterOrders(prevMasterId, id);
    const colId = await getColumnIdForActiveCount(remainingCount);
    if (colId) {
      await db.update(mastersTable).set({ voronkaColumnId: colId }).where(eq(mastersTable.id, prevMasterId));
    }

    // Log to CRM chat (visible in PWA chat tab)
    await db.insert(masterMessagesTable).values({
      masterId: prevMasterId,
      telegramChatId: `pwa_${prevMasterId}`,
      text: `⚠️ Снят с заявки #${id} (${order.serviceType}, ${order.city}) администратором. Причина: ${reason.trim()}`,
      fromMaster: false,
      senderName: "system",
      isRead: false,
    }).catch(() => {});
  }

  // If rebroadcast requested — trigger broadcast to other eligible masters immediately
  let broadcastResult = null;
  if (rebroadcast) {
    broadcastResult = await performBroadcast(id).catch(() => null);
  }

  res.json({ ok: true, rebroadcast: broadcastResult });
});

// ─── POST /api/orders/:id/manual-assign/:masterId — admin force-assigns master ─
router.post("/:id/manual-assign/:masterId", requireRole("admin", "master_operator"), async (req, res) => {
  const orderId = parseInt(req.params.id);
  const masterId = parseInt(req.params.masterId);
  if (isNaN(orderId) || isNaN(masterId)) return res.status(400).json({ error: "Invalid ids" });

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (order.masterId === masterId) return res.status(400).json({ error: "Этот мастер уже назначен на заказ" });

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  if (!master) return res.status(404).json({ error: "Master not found" });
  if (master.status !== "active") return res.status(400).json({ error: "Мастер неактивен" });

  // If there was a previous master assigned, log it
  const prevMasterId = order.masterId;

  // Assign master to order
  await db.update(ordersTable).set({
    masterId,
    status: "master_assigned",
    dispatchStatus: "assigned",
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, orderId));

  // Update or create dispatch record for this master
  const existingDispatch = await db.select().from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.masterId, masterId)));

  if (existingDispatch.length > 0) {
    await db.update(orderDispatchesTable)
      .set({ status: "assigned" })
      .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.masterId, masterId)));
  } else {
    await db.insert(orderDispatchesTable).values({
      orderId,
      masterId,
      telegramChatId: `pwa_${masterId}`,
      status: "assigned",
    });
  }

  // Mark other dispatch records as rejected
  await db.update(orderDispatchesTable)
    .set({ status: "rejected" })
    .where(and(eq(orderDispatchesTable.orderId, orderId), ne(orderDispatchesTable.masterId, masterId)));

  // Move new master to "На объекте" column and update stats
  const onSiteCol = await getOnSiteColumn();
  await db.update(mastersTable).set({
    voronkaColumnId: onSiteCol?.id ?? master.voronkaColumnId,
    totalOrders: master.totalOrders + 1,
    acceptedOrders: master.acceptedOrders + 1,
  }).where(eq(mastersTable.id, masterId));

  // If there was a previous master, update their voronka column
  if (prevMasterId && prevMasterId !== masterId) {
    const remainingCount = await countActiveMasterOrders(prevMasterId, orderId);
    const colId = await getColumnIdForActiveCount(remainingCount);
    if (colId) {
      await db.update(mastersTable).set({ voronkaColumnId: colId }).where(eq(mastersTable.id, prevMasterId));
    }
  }

  // Set assignedAt timestamp on manual assign
  await db.update(ordersTable)
    .set({ assignedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  // Log the status change
  const maSessionUser = (req as any).session?.userId ?? null;
  let maUserAlias = "система";
  if (maSessionUser) {
    const userRows = await db.select().from(usersTable).where(eq(usersTable.id, maSessionUser));
    maUserAlias = userRows[0]?.name ?? userRows[0]?.login ?? "система";
  }
  await db.insert(orderStatusLogsTable).values({
    orderId,
    oldStatus: order.status,
    newStatus: "master_assigned",
    userId: maSessionUser,
    userAlias: maUserAlias,
    note: `Назначен вручную: ${master.alias}`,
  }).catch(() => {});

  // Log to CRM chat (visible in PWA chat tab)
  await db.insert(masterMessagesTable).values({
    masterId: master.id,
    telegramChatId: `pwa_${master.id}`,
    text: `✅ Назначен на заявку #${orderId} (вручную администратором)`,
    fromMaster: false,
    senderName: "system",
    isRead: false,
  }).catch(() => {});

  // Push notification to master's PWA
  const leadRows = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId));
  const lead = leadRows[0];
  sendPushToMaster(master.id, {
    title: "Вас назначили на заказ",
    body: `Заявка #${orderId}${order.serviceType ? ` · ${order.serviceType}` : ""}${lead?.clientName ? ` · ${lead.clientName}` : ""}`,
    url: `/master-pwa/orders`,
  }).catch(() => {});

  if (master.maxChatId) {
    const maDate = order.scheduledAt
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduledAt))
      : "не указана";
    sendMaxMessage(
      master.maxChatId,
      `✅ Вам назначена заявка #${orderId}\n\n🔧 ${order.serviceType}\n📍 ${order.city}${order.district ? ", " + order.district : ""}\n📐 ${order.area} м²\n📅 ${maDate}${order.comment ? "\n💬 " + order.comment : ""}${lead ? `\n\n📞 ${lead.clientName}\n${lead.clientPhone}` : ""}\n\n👉 Подробности в приложении:\nhttps://sfera-master.ru/master-pwa/orders`
    ).catch(() => {});
  }

  res.json({ ok: true });
});

// ─── GET /api/orders/:id/status-log ───────────────────────────────────────────
router.get("/:id/status-log", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order id" });

  const logs = await db.select().from(orderStatusLogsTable)
    .where(eq(orderStatusLogsTable.orderId, id))
    .orderBy(desc(orderStatusLogsTable.createdAt));

  res.json(logs);
});

// GET /api/orders/:id/fomo-presses — FOMO button press events for an order
router.get("/:id/fomo-presses", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid order id" });

  const events = await db
    .select({
      id: fomoEventsTable.id,
      masterId: fomoEventsTable.masterId,
      masterAlias: mastersTable.alias,
      reason: fomoEventsTable.reason,
      createdAt: fomoEventsTable.createdAt,
    })
    .from(fomoEventsTable)
    .leftJoin(mastersTable, eq(fomoEventsTable.masterId, mastersTable.id))
    .where(and(eq(fomoEventsTable.orderId, id), eq(fomoEventsTable.eventType, "button_press")))
    .orderBy(desc(fomoEventsTable.createdAt));

  res.json(events);
});

// DELETE /api/orders/:id — soft delete (move to trash)
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);

  // Read masterId before soft-delete so we can recalc the column after
  const [orderRow] = await db.select({ masterId: ordersTable.masterId })
    .from(ordersTable).where(eq(ordersTable.id, id));

  await db.update(ordersTable).set({ deletedAt: new Date() }).where(eq(ordersTable.id, id));

  // If order had a master, recalculate their voronka column
  if (orderRow?.masterId) {
    await recalcMasterColumn(orderRow.masterId).catch(() => {});
  }

  res.json({ success: true });
});

export default router;
