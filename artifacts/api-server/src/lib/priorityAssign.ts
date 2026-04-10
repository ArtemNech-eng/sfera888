/**
 * Priority-based order assignment module.
 *
 * Flow:
 * 1. Order is broadcast → responseWindowCloseAt = now + 30min, dispatchWave = 1
 * 2. Masters click "Хочу взять" → dispatch.status = "responded"
 * 3. When window closes OR 5+ responses → selectAndAssignWinner()
 * 4. If 0 responses after wave 1 → rebroadcastWave2() (60 min window)
 * 5. If 0 responses after wave 2 → escalateToAdmin()
 */

import {
  db,
  mastersTable,
  ordersTable,
  orderDispatchesTable,
  transactionsTable,
  leadsTable,
  voronkaColumnsTable,
  masterMessagesTable,
} from "@workspace/db";
import { eq, inArray, and, isNull, count } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";
import { getManagerUserId } from "../managerBot.js";
import { sendPushToMaster } from "./push.js";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}`;
const WAVE1_MINUTES = 30;
const WAVE2_MINUTES = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendTg(chatId: string, text: string) {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch {}
}

async function getOnSiteColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.name === "На объекте")
    ?? cols.find(c => c.receivesOrders && c.name !== "Свободен")
    ?? cols.find(c => c.receivesOrders)
    ?? null;
}

// ─── Conversion ───────────────────────────────────────────────────────────────

async function getPaidOrdersCount(masterId: number): Promise<number> {
  const rows = await db
    .select({ cnt: count() })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.masterId, masterId), eq(transactionsTable.paymentStatus, "paid")));
  return Number(rows[0]?.cnt ?? 0);
}

/**
 * Conversion rate as percentage (0-100).
 * Default 50% if master has fewer than 5 accepted orders.
 */
function calcConversionPct(paidCount: number, acceptedOrders: number): number {
  if (acceptedOrders < 5) return 50; // default for new masters
  return Math.round((paidCount / acceptedOrders) * 100);
}

function getPriorityTier(conversionPct: number): 1 | 2 | 3 | 4 {
  if (conversionPct >= 80) return 1;
  if (conversionPct >= 60) return 2;
  if (conversionPct >= 30) return 3;
  return 4;
}

// ─── Weighted score (within same tier) ────────────────────────────────────────

function getWeightedScore(opts: {
  rating: number;
  responseSpeedMs: number; // lower = faster
  activeOrderCount: number;
  districtMatch: boolean;
}): number {
  const maxResponseMs = WAVE1_MINUTES * 60 * 1000;
  const speedScore = Math.max(0, 1 - opts.responseSpeedMs / maxResponseMs); // 0-1, higher = faster
  const loadScore = Math.max(0, (3 - opts.activeOrderCount) / 3);           // 0-1, lower load = better
  const ratingScore = Math.min(opts.rating, 5) / 5;                         // 0-1
  const districtScore = opts.districtMatch ? 1 : 0;

  return (
    ratingScore   * 0.40 +
    speedScore    * 0.30 +
    loadScore     * 0.20 +
    districtScore * 0.10
  );
}

// ─── Core: select winner and assign ───────────────────────────────────────────

export async function selectAndAssignWinner(orderId: number): Promise<"assigned" | "no_responses" | "already_assigned"> {
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order || order.status !== "waiting_master") return "already_assigned";

  // Get all "responded" dispatches
  const respondedDispatches = await db
    .select()
    .from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.status, "responded")));

  if (respondedDispatches.length === 0) return "no_responses";

  // Get active order count per master
  const activeOrders = await db.select({ masterId: ordersTable.masterId })
    .from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
  const activeCountMap = new Map<number, number>();
  for (const ao of activeOrders) {
    if (ao.masterId) activeCountMap.set(ao.masterId, (activeCountMap.get(ao.masterId) ?? 0) + 1);
  }

  // Score each responding master
  type ScoredDispatch = {
    dispatch: typeof respondedDispatches[0];
    master: typeof mastersTable.$inferSelect;
    tier: 1 | 2 | 3 | 4;
    score: number;
    conversionPct: number;
  };

  const scored: ScoredDispatch[] = [];

  for (const dispatch of respondedDispatches) {
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, dispatch.masterId));
    const master = masterRows[0];
    if (!master || master.status !== "active") continue;

    const paidCount = await getPaidOrdersCount(master.id);
    const conversionPct = calcConversionPct(paidCount, master.acceptedOrders);
    const tier = getPriorityTier(conversionPct);

    const dispatchedAt = dispatch.createdAt ? new Date(dispatch.createdAt).getTime() : Date.now();
    const respondedAt = dispatch.respondedAt ? new Date(dispatch.respondedAt).getTime() : Date.now();
    const responseSpeedMs = respondedAt - dispatchedAt;

    const score = getWeightedScore({
      rating: Number(master.rating),
      responseSpeedMs,
      activeOrderCount: activeCountMap.get(master.id) ?? 0,
      districtMatch: (master.preferredDistricts ?? []).includes(order.district),
    });

    scored.push({ dispatch, master, tier, score, conversionPct });
  }

  if (scored.length === 0) return "no_responses";

  // Sort: tier ASC (1 is best), then score DESC
  scored.sort((a, b) => a.tier !== b.tier ? a.tier - b.tier : b.score - a.score);
  const winner = scored[0];
  const losers = scored.slice(1);

  // ── Assign winner ──────────────────────────────────────────────────────────

  const onSiteCol = await getOnSiteColumn();
  const [updatedOrder] = await db.update(ordersTable)
    .set({
      masterId: winner.master.id,
      status: "master_assigned",
      assignedAt: new Date(),
      updatedAt: new Date(),
      dispatchStatus: "assigned",
    })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "waiting_master")))
    .returning();

  if (!updatedOrder) return "already_assigned"; // race condition guard

  await db.update(mastersTable).set({
    totalOrders: winner.master.totalOrders + 1,
    acceptedOrders: winner.master.acceptedOrders + 1,
    voronkaColumnId: onSiteCol?.id ?? winner.master.voronkaColumnId,
  }).where(eq(mastersTable.id, winner.master.id));

  await db.update(orderDispatchesTable)
    .set({ status: "assigned" })
    .where(eq(orderDispatchesTable.id, winner.dispatch.id));

  // Mark losers' dispatches as rejected
  const loserDispatchIds = losers.map(l => l.dispatch.id);
  if (loserDispatchIds.length > 0) {
    await db.update(orderDispatchesTable)
      .set({ status: "rejected" })
      .where(inArray(orderDispatchesTable.id, loserDispatchIds));
  }

  // Create placeholder transaction
  const existingTx = await db.select().from(transactionsTable).where(eq(transactionsTable.orderId, orderId));
  if (existingTx.length === 0) {
    await db.insert(transactionsTable).values({
      orderId,
      masterId: winner.master.id,
      orderAmount: "0",
      commission: "0",
      paymentStatus: "pending",
    });
  }

  // ── Notify winner ──────────────────────────────────────────────────────────

  const lead = order.leadId
    ? (await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId)))[0]
    : null;

  const dateStr = order.scheduledAt
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduledAt))
    : "не указана";

  const winnerText =
    `🎉 Заявка #${orderId} ваша!\n\n` +
    `🔧 ${order.serviceType}\n` +
    `📍 ${order.city}${order.district ? ", " + order.district : ""}\n` +
    `📐 ${order.area} м²\n` +
    `📅 ${dateStr}` +
    (order.comment ? `\n💬 ${order.comment}` : "") +
    (lead ? `\n\n📞 Клиент: ${lead.clientName}\n☎️ ${lead.clientPhone}` : "") +
    `\n\n⏰ Позвоните клиенту в течение 15 минут!` +
    `\n\n👉 Подробности в приложении:\nhttps://sfera-master.ru/master-pwa/orders`;

  if (winner.master.maxChatId) {
    sendMaxMessage(winner.master.maxChatId, winnerText).catch(() => {});
  }
  if (winner.master.telegramId) {
    sendTg(winner.master.telegramId, winnerText).catch(() => {});
  }
  sendPushToMaster(winner.master.id, "🎉 Заявка ваша!", `Позвоните клиенту в течение 15 минут. Заявка #${orderId}`).catch(() => {});

  // Log to CRM chat
  await db.insert(masterMessagesTable).values({
    masterId: winner.master.id,
    telegramChatId: winner.master.telegramId ?? `pwa_${winner.master.id}`,
    text: `✅ Заявка #${orderId} автоматически назначена (приоритет ${winner.tier}, конверсия ${winner.conversionPct}%)`,
    fromMaster: false,
    senderName: "system",
    isRead: true,
  }).catch(() => {});

  // ── Notify losers ──────────────────────────────────────────────────────────

  for (const loser of losers) {
    const nextTarget = loser.conversionPct < 30 ? 30 : loser.conversionPct < 60 ? 60 : 80;
    const loserText =
      `❌ Заявка #${orderId} назначена другому мастеру.\n\n` +
      `Ваша конверсия: ${loser.conversionPct}%\n` +
      `Для следующего приоритета нужно: ${nextTarget}%\n\n` +
      `Конверсия — это доля заказов, по которым клиент заплатил. ` +
      `Отправляйте сметы и доводите заказы до оплаты — это повышает ваш приоритет 📈`;

    if (loser.master.maxChatId) {
      sendMaxMessage(loser.master.maxChatId, loserText).catch(() => {});
    }
    if (loser.master.telegramId) {
      sendTg(loser.master.telegramId, loserText).catch(() => {});
    }
  }

  console.log(`[priorityAssign] Order #${orderId} assigned to master ${winner.master.alias} (tier ${winner.tier}, conv ${winner.conversionPct}%, score ${winner.score.toFixed(3)}). Losers: ${losers.length}`);
  return "assigned";
}

// ─── Wave 2: re-broadcast "still available" ────────────────────────────────

export async function rebroadcastWave2(orderId: number): Promise<void> {
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order || order.status !== "waiting_master") return;

  // Get all masters who got wave 1 dispatch
  const dispatches = await db.select().from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.status, "sent")));

  if (dispatches.length === 0) return;

  const wave2CloseAt = new Date(Date.now() + WAVE2_MINUTES * 60 * 1000);

  await db.update(ordersTable).set({
    dispatchWave: 2,
    responseWindowCloseAt: wave2CloseAt,
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, orderId));

  const dateStr = order.scheduledAt
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduledAt))
    : "не указана";

  const wave2Text =
    `⚡️ Заявка #${orderId} ещё свободна! Ваш шанс!\n\n` +
    `🔧 ${order.serviceType}\n` +
    `📍 ${order.city}${order.district ? ", " + order.district : ""}\n` +
    `📐 ${order.area} м²\n` +
    `📅 ${dateStr}` +
    (order.comment ? `\n💬 ${order.comment}` : "") +
    `\n\n👉 Откликнитесь в приложении:\nhttps://sfera-master.ru/master-pwa/orders`;

  for (const d of dispatches) {
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, d.masterId));
    const master = masterRows[0];
    if (!master) continue;
    if (master.maxChatId) sendMaxMessage(master.maxChatId, wave2Text).catch(() => {});
    if (master.telegramId) sendTg(master.telegramId, wave2Text).catch(() => {});
  }

  console.log(`[priorityAssign] Order #${orderId} wave 2 broadcast to ${dispatches.length} master(s)`);
}

// ─── Escalation ───────────────────────────────────────────────────────────────

export async function escalateToAdmin(orderId: number): Promise<void> {
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order || order.status !== "waiting_master") return;

  // Count active masters in the city
  const cityMasters = await db.select({ id: mastersTable.id }).from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), eq(mastersTable.city, order.city)));

  await db.update(ordersTable).set({
    dispatchStatus: "manual",
    updatedAt: new Date(),
  }).where(eq(ordersTable.id, orderId));

  const adminText =
    `🚨 Заявка #${orderId} — 0 откликов за ${WAVE1_MINUTES + WAVE2_MINUTES} минут.\n\n` +
    `🔧 ${order.serviceType}\n` +
    `📍 ${order.city}${order.district ? ", " + order.district : ""}\n` +
    `📐 ${order.area} м²\n\n` +
    `Мастеров в городе: ${cityMasters.length}\n` +
    `Требуется ручное назначение.`;

  const adminId = getManagerUserId();
  if (adminId) {
    sendMaxMessage(adminId, adminText).catch(() => {});
  }

  console.log(`[priorityAssign] Order #${orderId} escalated to admin. City masters: ${cityMasters.length}`);
}

// ─── Scheduler: check expired response windows ────────────────────────────────

export async function checkResponseWindows(): Promise<void> {
  const now = new Date();

  // Find all waiting orders with an expired response window
  const waitingOrders = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.status, "waiting_master"), isNull(ordersTable.deletedAt)));

  for (const order of waitingOrders) {
    const windowClose = order.responseWindowCloseAt ? new Date(order.responseWindowCloseAt) : null;
    if (!windowClose || windowClose > now) continue; // window not expired yet

    const wave = order.dispatchWave ?? 1;

    if (wave === 1) {
      // Try to assign winner
      const result = await selectAndAssignWinner(order.id).catch(e => {
        console.error(`[priorityAssign] selectAndAssignWinner error for #${order.id}:`, e);
        return "no_responses" as const;
      });

      if (result === "no_responses") {
        // No responses in wave 1 → rebroadcast
        await rebroadcastWave2(order.id).catch(e =>
          console.error(`[priorityAssign] rebroadcastWave2 error for #${order.id}:`, e)
        );
      }
    } else if (wave === 2) {
      // Wave 2 expired — check if there are any responses now
      const result = await selectAndAssignWinner(order.id).catch(e => {
        console.error(`[priorityAssign] selectAndAssignWinner wave2 error for #${order.id}:`, e);
        return "no_responses" as const;
      });

      if (result === "no_responses") {
        await escalateToAdmin(order.id).catch(e =>
          console.error(`[priorityAssign] escalateToAdmin error for #${order.id}:`, e)
        );
      }
    }
  }
}

// ─── Early trigger: call when 5+ masters have responded ──────────────────────

export async function maybeEarlyAssign(orderId: number): Promise<void> {
  const responded = await db.select({ cnt: count() })
    .from(orderDispatchesTable)
    .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.status, "responded")));

  if (Number(responded[0]?.cnt ?? 0) >= 5) {
    console.log(`[priorityAssign] Order #${orderId} has 5+ responses — triggering early assignment`);
    await selectAndAssignWinner(orderId).catch(e =>
      console.error(`[priorityAssign] early assign error for #${orderId}:`, e)
    );
  }
}
