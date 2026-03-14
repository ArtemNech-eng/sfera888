import { Router } from "express";
import { db, ordersTable, mastersTable, transactionsTable, voronkaColumnsTable, orderDispatchesTable, leadsTable } from "@workspace/db";
import { eq, inArray, and, ne, isNull } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { calculateCommission, getCommissionSettings } from "../lib/commission.js";

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
  const nonReceiving = cols.filter(c => !c.receivesOrders);
  return nonReceiving.find(c => c.position > 1) ?? nonReceiving[0] ?? null;
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
  let orders;
  const conditions: any[] = [];
  if (status) conditions.push(eq(ordersTable.status, status as any));
  if (masterId) conditions.push(eq(ordersTable.masterId, parseInt(masterId as string)));
  conditions.push(isNull(ordersTable.deletedAt));
  orders = await db.select().from(ordersTable).where(and(...conditions)).orderBy(ordersTable.createdAt);

  const masters = await db.select().from(mastersTable);
  const masterMap = new Map(masters.map(m => [m.id, m]));

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
    proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null,
    orderAmount: o.orderAmount ? Number(o.orderAmount) : null,
    commission: o.commission ? Number(o.commission) : null,
    clientRating: o.clientRating ?? null,
    cancelReason: o.cancelReason ?? null,
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
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  });
});

router.patch("/:id", allOrderRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, orderAmount, commission, clientRating, proposedAmount, acceptProposed, approveCancellation, rejectCancellation } = req.body;

  // Fetch current order to get masterId before update
  const currentRows = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!currentRows[0]) return res.status(404).json({ error: "Order not found" });
  const current = currentRows[0];

  const updates: any = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (proposedAmount !== undefined) updates.proposedAmount = proposedAmount !== null ? String(proposedAmount) : null;

  // Approve cancellation → set status cancelled
  if (approveCancellation) {
    updates.status = "cancelled";
  }
  // Reject cancellation → detach master, reset order for re-broadcast, clear reason
  if (rejectCancellation) {
    updates.status = "waiting_master";
    updates.masterId = null;
    updates.cancelReason = null;
    updates.dispatchStatus = "none";
  }

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

  // ── Create transaction when commission is confirmed (acceptProposed or orderAmount set) ──
  const commissionConfirmed = (acceptProposed && current.proposedAmount) ||
    (orderAmount !== undefined && orderAmount !== null);
  if (commissionConfirmed && o.masterId && o.orderAmount && o.commission) {
    // Only create if no transaction exists yet for this order
    const existingTx = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, id));
    if (existingTx.length === 0) {
      await db.insert(transactionsTable).values({
        orderId: id,
        masterId: o.masterId,
        orderAmount: o.orderAmount,
        commission: o.commission,
        paymentStatus: "pending",
      });
      // Add commission to master's debt
      const mRows = await db.select().from(mastersTable).where(eq(mastersTable.id, o.masterId));
      const m = mRows[0];
      if (m) {
        const newDebt = Number(m.debt) + Number(o.commission);
        await db.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, o.masterId));
        // Notify master in Telegram
        if (m.telegramId) {
          await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: m.telegramId,
              text:
                `✅ <b>Сумма по заказу #${id} подтверждена</b>\n\n` +
                `💰 Стоимость работ: <b>${Number(o.orderAmount).toLocaleString("ru-RU")} ₽</b>\n` +
                `🔸 Комиссия: <b>${Number(o.commission).toLocaleString("ru-RU")} ₽</b>\n\n` +
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

  // Auto-move master between voronka columns based on status change
  if (status !== undefined && current.masterId) {
    const masterId = current.masterId;
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
    const master = masterRows[0];
    if (master) {
      if (status === "master_assigned" || status === "in_progress") {
        // Move to "На объекте"
        const onSiteCol = await getOnSiteColumn();
        if (onSiteCol) {
          await db.update(mastersTable).set({ voronkaColumnId: onSiteCol.id }).where(eq(mastersTable.id, masterId));
        }
      } else if (status === "completed") {
        // Move to "Ожидает оплаты" — free only after commission paid
        const awaitingCol = await getAwaitingPaymentColumn();
        if (awaitingCol) {
          await db.update(mastersTable).set({ voronkaColumnId: awaitingCol.id }).where(eq(mastersTable.id, masterId));
        }
      } else if (status === "cancelled" || approveCancellation) {
        // Move back to "Свободен"
        const freeCol = await getFreeColumn();
        if (freeCol) {
          await db.update(mastersTable).set({ voronkaColumnId: freeCol.id }).where(eq(mastersTable.id, masterId));
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

    let sent = 0;
    for (const m of withTg) {
      if (!m.telegramId) continue;
      const myActiveCount = activeOrders.filter(ao => ao.masterId === m.id).length;
      const limit = m.isTestMaster ? 1 : 2;
      if (myActiveCount >= limit) continue;
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

  // Check active order count limits (debt-aware)
  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
  const masterActiveCount = activeOrders.filter(o => o.masterId === masterId).length;
  const masterDebt = Number(master.debt);
  const hasDebt = masterDebt > 0;

  const limit = master.isTestMaster ? 1 : 2;
  if (masterActiveCount >= limit) {
    if (hasDebt) {
      return res.status(400).json({
        error: master.isTestMaster
          ? `Мастер является должником (${masterDebt.toLocaleString("ru")} ₽). В тестовый период лимит — 1 заказ. Сначала необходимо погасить долг.`
          : `Мастер является должником (${masterDebt.toLocaleString("ru")} ₽). Лимит — 2 заказа при наличии долга. Необходимо погасить задолженность для снятия ограничений.`
      });
    }
    return res.status(400).json({
      error: master.isTestMaster
        ? "Тестовый период: мастер может иметь только 1 активный заказ."
        : "Максимум 2 активных заказа на мастера."
    });
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

// DELETE /api/orders/:id — soft delete (move to trash)
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(ordersTable).set({ deletedAt: new Date() }).where(eq(ordersTable.id, id));
  res.json({ success: true });
});

export default router;
