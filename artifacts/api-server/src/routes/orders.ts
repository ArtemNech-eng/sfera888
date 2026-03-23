import { Router } from "express";
import { db, ordersTable, mastersTable, transactionsTable, voronkaColumnsTable, orderDispatchesTable, leadsTable, masterMessagesTable, orderStatusLogsTable, usersTable } from "@workspace/db";
import { eq, inArray, and, ne, isNull, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { calculateCommission, getCommissionSettings } from "../lib/commission.js";
import { getMasterEligibility, getOverdueMasterIds, countActiveMasterOrders, getColumnIdForActiveCount } from "../lib/orderEligibility.js";
import { performBroadcast } from "../lib/broadcastOrder.js";
import { sendPushToMaster } from "../lib/push.js";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}`;

async function sendTg(chatId: string, text: string) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {}
}

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

  res.json(orders.map(o => ({
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
    clientPhone: leadMap.get(o.leadId)?.phone ?? null,
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
  })));
});

router.get("/:id", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!rows[0]) return res.status(404).json({ error: "Order not found" });
  const o = rows[0];
  let masterName: string | null = null;
  if (o.masterId) {
    const m = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    masterName = m[0]?.alias ?? null;
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
  });
});

router.patch("/:id", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, orderAmount, commission, clientRating, proposedAmount, acceptProposed, approveCancellation, rejectCancellation, operatorNote, clientCancelReason } = req.body;

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
  if (commissionConfirmed && o.masterId && o.orderAmount && o.commission) {
    const existingTxRows = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
    const existingTx = existingTxRows[0];
    const commissionValue = Number(o.commission);

    if (existingTx) {
      const wasPlaceholder = Number(existingTx.commission) === 0;
      const prevCommission = Number(existingTx.commission);
      // Update the transaction (placeholder → real, or re-adjust amount)
      await db.update(transactionsTable).set({
        orderAmount: o.orderAmount,
        commission: o.commission,
        paymentStatus: "pending",
      }).where(eq(transactionsTable.id, existingTx.id));

      const mRows = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
      const m = mRows[0];
      if (m) {
        if (wasPlaceholder) {
          // First confirmation: add full commission to debt and notify master
          const newDebt = Number(m.debt) + commissionValue;
          await db.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, o.masterId));
          if (m.telegramId) {
            await fetch(`${TELEGRAM_API}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: m.telegramId,
                text:
                  `✅ <b>Сумма по заказу #${id} подтверждена</b>\n\n` +
                  `💰 Стоимость работ: <b>${Number(o.orderAmount).toLocaleString("ru-RU")} ₽</b>\n` +
                  `🔸 Комиссия: <b>${commissionValue.toLocaleString("ru-RU")} ₽</b>\n\n` +
                  `📲 Реквизиты для перевода:\n<code>89892860863</code> · Альфа Банк · Игорь К.\n\n` +
                  `После оплаты комиссии отправьте скриншот чека кнопкой ниже.`,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [[
                    { text: "📸 Отправить скриншот оплаты", callback_data: "send_payment_proof" }
                  ]],
                },
              }),
            }).catch(() => {});
          }
        } else if (commissionValue !== prevCommission) {
          // Commission adjusted after already set: apply delta to debt
          const delta = commissionValue - prevCommission;
          const newDebt = Math.max(0, Number(m.debt) + delta);
          await db.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, o.masterId));
        }
      }
    } else {
      // No placeholder exists (legacy order) — create transaction as before
      await db.insert(transactionsTable).values({
        orderId: id,
        masterId: o.masterId,
        orderAmount: o.orderAmount,
        commission: o.commission,
        paymentStatus: "pending",
      });
      const mRows = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
      const m = mRows[0];
      if (m) {
        const newDebt = Number(m.debt) + commissionValue;
        await db.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, o.masterId));
        if (m.telegramId) {
          await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: m.telegramId,
              text:
                `✅ <b>Сумма по заказу #${id} подтверждена</b>\n\n` +
                `💰 Стоимость работ: <b>${Number(o.orderAmount).toLocaleString("ru-RU")} ₽</b>\n` +
                `🔸 Комиссия: <b>${commissionValue.toLocaleString("ru-RU")} ₽</b>\n\n` +
                `📲 Реквизиты для перевода:\n<code>89892860863</code> · Альфа Банк · Игорь К.\n\n` +
                `После оплаты комиссии отправьте скриншот чека кнопкой ниже.`,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [[
                  { text: "📸 Отправить скриншот оплаты", callback_data: "send_payment_proof" }
                ]],
              },
            }),
          }).catch(() => {});
        }
      }
    }
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

    // Notify the rejected master via Telegram
    const rejectedMasterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, rejectedMasterId));
    const rejectedMaster = rejectedMasterRows[0];
    if (rejectedMaster?.telegramId) {
      await sendTg(rejectedMaster.telegramId,
        `⚠️ <b>Запрос на отмену заказа #${id} отклонён оператором.</b>\n\n` +
        `Заказ передан другим мастерам. Ваш статус в воронке остаётся прежним — оператор переведёт вас в «Свободен» вручную.`
      );
    }

    // Delete old dispatch records so we can re-broadcast
    await db.delete(orderDispatchesTable).where(eq(orderDispatchesTable.orderId, id));

    // Re-broadcast to eligible masters in the same city (excluding the one who tried to cancel)
    const allMasters = await db.select().from(mastersTable)
      .where(and(eq(mastersTable.status, "active"), eq(mastersTable.city, o.city)));
    const withTg = allMasters.filter(m => m.telegramId && m.id !== rejectedMasterId);

    const activeOrders = await db.select().from(ordersTable)
      .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));

    const cardText = buildOrderCard(o, id);
    const replyMarkup = {
      inline_keyboard: [
        [{ text: "Откликнуться 🙋", callback_data: `respond_order_${id}` }],
        [{ text: "💬 Задать вопрос оператору", callback_data: `ask_question_${id}` }],
      ],
    };

    const overdueMasterIdsForRebroadcast = await getOverdueMasterIds();
    let sent = 0;
    for (const m of withTg) {
      if (!m.telegramId) continue;
      const myActiveCount = activeOrders.filter(ao => ao.masterId === m.id).length;
      if (!getMasterEligibility(m, myActiveCount, overdueMasterIdsForRebroadcast).canAccept) continue;
      try {
        const r = await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: m.telegramId, text: cardText, parse_mode: "HTML", reply_markup: replyMarkup }),
        });
        const j = await r.json() as any;
        const msgId = j?.result?.message_id?.toString() ?? null;
        await db.insert(orderDispatchesTable).values({
          orderId: id, masterId: m.id, telegramChatId: m.telegramId,
          telegramMessageId: msgId, status: "sent",
        });
        sent++;
      } catch {}
    }

    if (sent > 0) {
      await db.update(ordersTable)
        .set({ dispatchStatus: "dispatching", updatedAt: new Date() })
        .where(eq(ordersTable.id, id));
    }
  }

  let masterName: string | null = null;
  if (o.masterId) {
    const m = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
    masterName = m[0]?.alias ?? null;
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
      telegramChatId: master.telegramId ?? `pwa_${prevMasterId}`,
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
      telegramChatId: master.telegramId ?? `pwa_${masterId}`,
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
    telegramChatId: master.telegramId ?? `pwa_${master.id}`,
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

// DELETE /api/orders/:id — soft delete (move to trash)
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(ordersTable).set({ deletedAt: new Date() }).where(eq(ordersTable.id, id));
  res.json({ success: true });
});

export default router;
