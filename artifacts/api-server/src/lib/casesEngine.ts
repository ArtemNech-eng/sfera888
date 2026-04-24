/**
 * Cases Engine — background processor for «Центр контроля мастеров»
 *
 * Runs every 5 minutes.
 * Reads active orders + master messages → upserts chat_cases with
 * risk levels, summaries, tags and next-action recommendations.
 * No AI calls — all logic is rule-based for performance at 1000+ masters.
 */

import { db, chatCasesTable, ordersTable, mastersTable, masterMessagesTable } from "@workspace/db";
import { eq, and, inArray, desc, gte, or } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";

// ─── Keyword lists for tag detection ─────────────────────────────────────────

const BYPASS_PHRASES = [
  "напрямую", "без приложения", "без брони", "без предоплаты",
  "договоримся сами", "скинь номер", "оплата потом", "потом закрою",
  "клиент не хочет через приложение", "сделал без сметы",
  "переведу позже", "без сметы", "минуя приложение",
];

const CONFLICT_PHRASES = [
  "конфликт", "жалоба", "претензия", "недоволен", "скандал",
  "требует", "угрожает", "суд",
];

const DELAYED_ESTIMATE = [
  "завтра отправлю", "позже отправлю", "отправлю вечером",
  "не успел смету", "не успеваю смету", "смету позже",
];

const DELAYED_PAYMENT = [
  "нет денег", "переведу позже", "оплата потом",
  "клиент не платит", "клиент не перевёл", "перешлю потом",
];

const MASTER_DELAY = [
  "завтра", "позже", "не успеваю", "не успел", "задержка",
  "задержусь", "переносим", "перенесём",
];

const CLIENT_REFUSED = [
  "клиент передумал", "клиент отказался", "дорого", "не буду делать",
  "клиент молчит", "не берёт трубку",
];

const NO_MONEY = ["нет денег", "нет средств", "денег нет", "закончились деньги"];

function detectTags(messages: string[]): string[] {
  const text = messages.join(" ").toLowerCase();
  const tags = new Set<string>();

  if (BYPASS_PHRASES.some(p => text.includes(p))) tags.add("possible_bypass");
  if (CONFLICT_PHRASES.some(p => text.includes(p))) tags.add("conflict");
  if (DELAYED_ESTIMATE.some(p => text.includes(p))) tags.add("delayed_estimate");
  if (DELAYED_PAYMENT.some(p => text.includes(p))) tags.add("delayed_payment");
  if (MASTER_DELAY.some(p => text.includes(p))) tags.add("master_delay");
  if (CLIENT_REFUSED.some(p => text.includes(p))) tags.add("client_refused");
  if (NO_MONEY.some(p => text.includes(p))) tags.add("no_money");

  return Array.from(tags);
}

// ─── Stage derivation ─────────────────────────────────────────────────────────

function deriveStage(
  orderStatus: string,
  hoursWithoutContact: number,
  hoursWithoutEstimate: number,
  hoursWithoutPayment: number,
  tags: string[],
): string {
  if (orderStatus === "completed") return "completed";
  if (orderStatus === "cancelled") return "cancelled";
  if (tags.includes("possible_bypass")) return "possible_bypass";
  if (tags.includes("conflict")) return "conflict";
  if (orderStatus === "in_progress") {
    if (hoursWithoutContact > 96) return "waiting_update";
    return "in_progress";
  }
  if (hoursWithoutPayment > 0) return "waiting_payment";
  if (hoursWithoutEstimate > 0) return "waiting_estimate";
  return "assigned";
}

// ─── Risk level calculation ───────────────────────────────────────────────────

function calcRisk(
  hoursWithoutContact: number,
  hoursWithoutEstimate: number,
  hoursWithoutPayment: number,
  tags: string[],
  assignedHoursAgo: number,
): { level: string; reason: string } {
  // Auto-red conditions
  if (tags.includes("possible_bypass")) return { level: "red", reason: "Подозрение на обход системы" };
  if (tags.includes("conflict")) return { level: "red", reason: "Конфликт или жалоба" };
  if (hoursWithoutEstimate >= 48) return { level: "red", reason: `Смета не отправлена ${Math.round(hoursWithoutEstimate)}ч` };
  if (hoursWithoutPayment >= 48) return { level: "red", reason: `Предоплата не получена ${Math.round(hoursWithoutPayment)}ч` };
  if (hoursWithoutContact >= 96) return { level: "red", reason: `Нет обновлений ${Math.round(hoursWithoutContact)}ч` };
  if (assignedHoursAgo >= 14 * 24) return { level: "red", reason: "Заказ завис > 14 дней" };

  // Yellow conditions
  if (hoursWithoutContact >= 12) return { level: "yellow", reason: `Нет ответа мастера ${Math.round(hoursWithoutContact)}ч` };
  if (hoursWithoutEstimate >= 24) return { level: "yellow", reason: `Смета не отправлена ${Math.round(hoursWithoutEstimate)}ч` };
  if (hoursWithoutPayment >= 24) return { level: "yellow", reason: `Предоплата не получена ${Math.round(hoursWithoutPayment)}ч` };
  if (tags.includes("master_delay")) return { level: "yellow", reason: "Мастер переносит сроки" };
  if (tags.includes("delayed_estimate")) return { level: "yellow", reason: "Мастер откладывает смету" };
  if (tags.includes("delayed_payment")) return { level: "yellow", reason: "Задержка оплаты" };

  return { level: "green", reason: "В норме" };
}

// ─── Next action ──────────────────────────────────────────────────────────────

function calcNextAction(
  stage: string,
  hoursWithoutEstimate: number,
  hoursWithoutPayment: number,
  hoursWithoutContact: number,
): { action: string; deadline: Date | null } {
  const now = new Date();
  const inHours = (h: number) => new Date(now.getTime() + h * 3600000);

  if (stage === "waiting_estimate") {
    if (hoursWithoutEstimate >= 24) return { action: "call_master", deadline: inHours(2) };
    return { action: "remind_master_estimate", deadline: inHours(Math.max(0, 24 - hoursWithoutEstimate)) };
  }
  if (stage === "waiting_payment") {
    if (hoursWithoutPayment >= 24) return { action: "call_master", deadline: inHours(2) };
    return { action: "remind_master_payment", deadline: inHours(Math.max(0, 24 - hoursWithoutPayment)) };
  }
  if (stage === "waiting_update" || hoursWithoutContact >= 12) {
    return { action: "ask_master_status", deadline: inHours(4) };
  }
  if (stage === "possible_bypass") return { action: "review_for_cancel", deadline: inHours(1) };
  if (stage === "conflict") return { action: "call_master", deadline: inHours(1) };
  if (hoursWithoutContact >= 48) return { action: "review_for_reassign", deadline: inHours(4) };

  return { action: "no_action", deadline: null };
}

// ─── Summary generation ───────────────────────────────────────────────────────

function generateSummary(
  stage: string,
  riskLevel: string,
  riskReason: string,
  hoursWithoutContact: number,
  hoursWithoutEstimate: number,
  hoursWithoutPayment: number,
  masterName: string,
  tags: string[],
  assignedHoursAgo: number,
): string {
  const parts: string[] = [];

  if (stage === "assigned") {
    parts.push(`Мастер ${masterName} назначен ${Math.round(assignedHoursAgo)}ч назад.`);
  } else if (stage === "waiting_estimate") {
    parts.push(`Мастер назначен ${Math.round(assignedHoursAgo)}ч назад, смета ещё не отправлена.`);
    if (hoursWithoutEstimate >= 24) parts.push(`Уже ${Math.round(hoursWithoutEstimate)}ч без сметы.`);
  } else if (stage === "waiting_payment") {
    parts.push(`Смета отправлена, предоплата не поступила (${Math.round(hoursWithoutPayment)}ч).`);
  } else if (stage === "in_progress") {
    parts.push("Заказ в работе.");
    if (hoursWithoutContact > 24) parts.push(`Нет обновлений ${Math.round(hoursWithoutContact)}ч.`);
  } else if (stage === "waiting_update") {
    parts.push(`Заказ в работе, но нет обновлений ${Math.round(hoursWithoutContact)}ч.`);
  } else if (stage === "possible_bypass") {
    parts.push("⚠️ Обнаружены признаки попытки обхода системы.");
  } else if (stage === "conflict") {
    parts.push("⛔ Конфликт или жалоба по заказу.");
  }

  if (tags.includes("master_delay")) parts.push("Мастер откладывает сроки.");
  if (tags.includes("client_refused")) parts.push("Клиент выражал сомнения.");

  if (riskLevel === "red") parts.push(`Риск: критический — ${riskReason}.`);
  else if (riskLevel === "yellow") parts.push(`Риск: средний — ${riskReason}.`);

  return parts.join(" ") || "Нет данных по кейсу.";
}

// ─── Hours difference helper ──────────────────────────────────────────────────

function hoursDiff(from: Date | null | undefined, to: Date = new Date()): number {
  if (!from) return 0;
  return Math.max(0, (to.getTime() - new Date(from).getTime()) / 3600000);
}

// ─── Main processor ───────────────────────────────────────────────────────────

let isRunning = false;

export async function processCases(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    // Fetch all active orders with master assigned
    const activeOrders = await db
      .select({
        id: ordersTable.id,
        masterId: ordersTable.masterId,
        city: ordersTable.city,
        district: ordersTable.district,
        serviceType: ordersTable.serviceType,
        status: ordersTable.status,
        assignedAt: ordersTable.assignedAt,
        proposedAmount: ordersTable.proposedAmount,
        orderAmount: ordersTable.orderAmount,
        commission: ordersTable.commission,
        createdAt: ordersTable.createdAt,
        updatedAt: ordersTable.updatedAt,
        completedAt: ordersTable.completedAt,
      })
      .from(ordersTable)
      .where(
        and(
          inArray(ordersTable.status as any, ["master_assigned", "in_progress", "cancellation_requested"]),
          // masterId is not null
        )
      );

    const ordersWithMaster = activeOrders.filter(o => o.masterId != null);
    if (ordersWithMaster.length === 0) {
      isRunning = false;
      return;
    }

    const masterIds = [...new Set(ordersWithMaster.map(o => o.masterId!))];
    const masters = await db
      .select({ id: mastersTable.id, alias: mastersTable.alias, phone: mastersTable.phone, maxChatId: mastersTable.maxChatId, telegramId: mastersTable.telegramId })
      .from(mastersTable)
      .where(inArray(mastersTable.id, masterIds));
    const masterMap = new Map(masters.map(m => [m.id, m]));

    // Fetch recent messages for these masters (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000);
    const messages = await db
      .select()
      .from(masterMessagesTable)
      .where(
        and(
          inArray(masterMessagesTable.masterId, masterIds),
          gte(masterMessagesTable.createdAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(masterMessagesTable.createdAt));

    // Group messages by masterId
    const msgByMaster = new Map<number, typeof messages>();
    for (const msg of messages) {
      if (!msgByMaster.has(msg.masterId)) msgByMaster.set(msg.masterId, []);
      msgByMaster.get(msg.masterId)!.push(msg);
    }

    const now = new Date();

    for (const order of ordersWithMaster) {
      const master = masterMap.get(order.masterId!);
      if (!master) continue;

      const masterMsgs = msgByMaster.get(order.masterId!) ?? [];
      const masterIncomingMsgs = masterMsgs.filter(m => m.fromMaster);
      const masterOutgoingMsgs = masterMsgs.filter(m => !m.fromMaster);

      const lastMasterMsgAt = masterIncomingMsgs[0]?.createdAt ?? null;
      const lastAiMsgAt = masterOutgoingMsgs[0]?.createdAt ?? null;

      // Hours without contact (from master or AI to master)
      const lastContactAt = lastMasterMsgAt && lastAiMsgAt
        ? (new Date(lastMasterMsgAt) > new Date(lastAiMsgAt) ? lastMasterMsgAt : lastAiMsgAt)
        : lastMasterMsgAt ?? lastAiMsgAt;
      const hoursWithoutContact = hoursDiff(lastContactAt);

      // Hours without estimate: from assignedAt if no proposedAmount
      const hasEstimate = order.proposedAmount != null && Number(order.proposedAmount) > 0;
      const hoursWithoutEstimate = !hasEstimate && order.assignedAt
        ? hoursDiff(order.assignedAt)
        : 0;

      // Hours without payment: proposedAmount set but no orderAmount
      const hasPayment = order.orderAmount != null && Number(order.orderAmount) > 0;
      const hasPrepaymentSent = hasEstimate;
      // Estimate first sending is approximated by assignedAt + 24h
      const estimateSentApprox = hasEstimate && order.assignedAt
        ? new Date(new Date(order.assignedAt).getTime() + 24 * 3600000)
        : null;
      const hoursWithoutPayment = hasPrepaymentSent && !hasPayment && estimateSentApprox
        ? hoursDiff(estimateSentApprox)
        : 0;

      const assignedHoursAgo = hoursDiff(order.assignedAt ?? order.createdAt);

      // Detect tags from master messages text
      const masterTexts = masterIncomingMsgs.map(m => m.text);
      const tags = detectTags(masterTexts);

      // Check if master has multiple active orders → ambiguous
      const masterActiveOrders = ordersWithMaster.filter(o => o.masterId === order.masterId);
      if (masterActiveOrders.length >= 2) tags.push("ambiguous_order_link");

      const stage = deriveStage(order.status, hoursWithoutContact, hoursWithoutEstimate, hoursWithoutPayment, tags);
      const { level: riskLevel, reason: riskReason } = calcRisk(hoursWithoutContact, hoursWithoutEstimate, hoursWithoutPayment, tags, assignedHoursAgo);
      const { action: nextAction, deadline: nextActionDeadline } = calcNextAction(stage, hoursWithoutEstimate, hoursWithoutPayment, hoursWithoutContact);

      const masterAlias = master.alias ?? `Мастер #${master.id}`;
      const summary = generateSummary(stage, riskLevel, riskReason, hoursWithoutContact, hoursWithoutEstimate, hoursWithoutPayment, masterAlias, tags, assignedHoursAgo);

      const confidence = tags.includes("ambiguous_order_link") ? "low" : "high";
      const isArchived = order.status === "completed" || order.status === "cancelled";

      // Expected revenue/commission
      const expectedRevenue = order.orderAmount
        ? Number(order.orderAmount)
        : order.proposedAmount
          ? Number(order.proposedAmount)
          : null;
      const expectedCommission = order.commission
        ? Number(order.commission)
        : expectedRevenue
          ? Math.round(expectedRevenue * 0.12) // fallback: 12%
          : null;

      // Upsert the case
      const existing = await db
        .select({ id: chatCasesTable.id, isResolved: chatCasesTable.isResolved, resolvedUntil: chatCasesTable.resolvedUntil })
        .from(chatCasesTable)
        .where(eq(chatCasesTable.orderId, order.id))
        .limit(1);

      const existingCase = existing[0];

      // If resolved until time has passed, clear isResolved
      const stillResolved = existingCase?.isResolved && existingCase.resolvedUntil && new Date(existingCase.resolvedUntil) > now;

      const values = {
        orderId: order.id,
        masterId: order.masterId!,
        city: order.city,
        district: order.district,
        serviceType: order.serviceType,
        orderStatus: order.status,
        currentStage: stage,
        riskLevel,
        riskReason,
        summary,
        nextAction,
        nextActionDeadline,
        lastMasterMessageAt: lastMasterMsgAt,
        lastAiMessageAt: lastAiMsgAt,
        hoursWithoutContact: String(Math.round(hoursWithoutContact * 10) / 10),
        hoursWithoutEstimate: String(Math.round(hoursWithoutEstimate * 10) / 10),
        hoursWithoutPayment: String(Math.round(hoursWithoutPayment * 10) / 10),
        expectedRevenue: expectedRevenue != null ? String(expectedRevenue) : null,
        expectedCommission: expectedCommission != null ? String(expectedCommission) : null,
        tags,
        confidence,
        isResolved: stillResolved ?? false,
        isArchived,
        updatedAt: now,
      };

      if (existingCase) {
        await db
          .update(chatCasesTable)
          .set(values)
          .where(eq(chatCasesTable.id, existingCase.id));
      } else {
        await db.insert(chatCasesTable).values({ ...values, createdAt: now });
      }
    }

    // Archive cases for completed/cancelled orders not in activeOrders
    const activeOrderIds = ordersWithMaster.map(o => o.id);
    if (activeOrderIds.length > 0) {
      // Cases that exist but not in active list → archive them
      // (handled by isArchived flag above, no extra action needed)
    }
  } catch (err) {
    console.error("[casesEngine] Error:", err);
  } finally {
    isRunning = false;
  }
}

// ─── Daily digest for admin at 08:30 ─────────────────────────────────────────

let digestScheduled = false;

export function scheduleDigest(): void {
  if (digestScheduled) return;
  digestScheduled = true;

  async function sendDigest() {
    const adminUserId = process.env["ADMIN_MAX_USER_ID"];
    if (!adminUserId) return;

    try {
      const cases = await db.select().from(chatCasesTable).where(eq(chatCasesTable.isArchived, false));

      const total = cases.length;
      const green = cases.filter(c => c.riskLevel === "green").length;
      const yellow = cases.filter(c => c.riskLevel === "yellow").length;
      const red = cases.filter(c => c.riskLevel === "red").length;
      const bypass = cases.filter(c => (c.tags as string[]).includes("possible_bypass")).length;

      const frozenMoney = cases
        .filter(c => c.riskLevel === "yellow" || c.riskLevel === "red")
        .reduce((s, c) => s + (c.expectedCommission ? Number(c.expectedCommission) : 0), 0);

      const noEstimate = cases.filter(c => Number(c.hoursWithoutEstimate) >= 24).length;
      const noPayment = cases.filter(c => Number(c.hoursWithoutPayment) >= 48).length;
      const noContact = cases.filter(c => Number(c.hoursWithoutContact) >= 12).length;

      // Top problem masters
      const masterProblems = new Map<string, number>();
      for (const c of cases) {
        if (c.riskLevel === "yellow" || c.riskLevel === "red") {
          const key = String(c.masterId);
          masterProblems.set(key, (masterProblems.get(key) ?? 0) + 1);
        }
      }
      const topMasters = [...masterProblems.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      // Resolve master names
      const problemMasterIds = topMasters.map(([id]) => Number(id));
      let masterNames = new Map<number, string>();
      if (problemMasterIds.length > 0) {
        const ms = await db.select({ id: mastersTable.id, alias: mastersTable.alias })
          .from(mastersTable)
          .where(inArray(mastersTable.id, problemMasterIds));
        masterNames = new Map(ms.map(m => [m.id, m.alias]));
      }

      let topStr = "";
      topMasters.forEach(([id, count], i) => {
        topStr += `\n${i + 1}. ${masterNames.get(Number(id)) ?? `Мастер #${id}`} — ${count} проблемных кейса`;
      });

      const text = `🧠 Сводка по мастерам\n\nАктивных кейсов: ${total}\n🟢 Норма: ${green}\n🟡 Под наблюдением: ${yellow}\n🔴 Критичных: ${red}\n⚠️ Подозрение на обход: ${bypass}\n\nБез сметы 24+ч: ${noEstimate}\nБез оплаты 48+ч: ${noPayment}\nБез контакта 12+ч: ${noContact}\n\nПотенциально зависло денег: ${frozenMoney.toLocaleString("ru-RU")}₽${topStr ? "\n\nТоп проблемные мастера:" + topStr : ""}\n\nОткрыть CRM → Контроль мастеров`;

      await sendMaxMessage(adminUserId, text);
    } catch (e) {
      console.error("[casesEngine] Digest error:", e);
    }
  }

  function scheduleNext() {
    const now = new Date();
    const target = new Date();
    target.setHours(8, 30, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const delay = target.getTime() - now.getTime();
    setTimeout(async () => {
      await sendDigest();
      scheduleNext();
    }, delay);
  }

  scheduleNext();
}
