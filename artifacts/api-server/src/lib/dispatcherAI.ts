/**
 * Dispatcher AI — GPT-4o agent that communicates with masters
 * on behalf of the company dispatcher.
 *
 * Replaces the human operator in routine communications:
 *  - Responds to master messages intelligently (knows their orders)
 *  - Proactively checks on active orders
 *  - Extracts info (completion dates, problems) and saves to CRM
 *  - Escalates problems to the manager bot
 */

import OpenAI from "openai";
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, masterMessagesTable } from "@workspace/db";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";
import { sendMsg as sendManagerMsg, getManagerUserId } from "../managerBot.js";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Conversation context per master ─────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

const masterSessions = new Map<number, ChatMessage[]>();
const MAX_HISTORY = 14;

function getHistory(masterId: number): ChatMessage[] {
  if (!masterSessions.has(masterId)) masterSessions.set(masterId, []);
  return masterSessions.get(masterId)!;
}

function addToHistory(masterId: number, msg: ChatMessage) {
  const h = getHistory(masterId);
  h.push(msg);
  if (h.length > MAX_HISTORY) masterSessions.set(masterId, h.slice(-MAX_HISTORY));
}

// ─── Proactive message tracking (in-memory) ──────────────────────────────────
// Tracks which events we've already fired to avoid duplicates on restart

const greetedOrders = new Set<number>();       // assignment greeting sent
const checkinOrders = new Set<number>();        // 24h check-in sent
const estimateReminders = new Set<number>();    // estimate reminder sent
const preDayReminders = new Set<number>();      // day-before reminder sent

// ─── Tool implementations ────────────────────────────────────────────────────

async function getMasterActiveOrders(masterId: number) {
  const orders = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.masterId, masterId),
      inArray(ordersTable.status, ["master_assigned", "in_progress"]),
      isNull(ordersTable.deletedAt),
    ))
    .orderBy(desc(ordersTable.createdAt));
  return orders;
}

async function getOrderWithLead(orderId: number) {
  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return null;
  const leadRows = order.leadId
    ? await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId))
    : [];
  return { order, lead: leadRows[0] ?? null };
}

async function toolAddOrderNote(orderId: number, note: string): Promise<string> {
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!rows[0]) return `Заказ #${orderId} не найден.`;
  const existing = rows[0].operatorNote ?? "";
  const updated = existing ? `${existing}\n[ИИ]: ${note}` : `[ИИ]: ${note}`;
  await db.update(ordersTable)
    .set({ operatorNote: updated, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));
  return `Заметка к заказу #${orderId} сохранена.`;
}

async function toolSetOrderInProgress(orderId: number): Promise<string> {
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!rows[0]) return `Заказ #${orderId} не найден.`;
  if (rows[0].status === "in_progress") return `Заказ #${orderId} уже в работе.`;
  await db.update(ordersTable)
    .set({ status: "in_progress", updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));
  return `Заказ #${orderId} переведён в статус «в работе».`;
}

async function toolEscalateToManager(message: string, masterId: number, orderId?: number): Promise<string> {
  const managerId = getManagerUserId();
  if (!managerId) {
    console.warn("[dispatcherAI] escalate: no manager user ID");
    return "Эскалация зафиксирована (менеджер не онлайн).";
  }

  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  const master = masterRows[0];
  const orderStr = orderId ? ` по заказу #${orderId}` : "";
  const alias = master?.alias ?? `мастер #${masterId}`;

  await sendManagerMsg(
    managerId,
    `⚠️ **Проблема от ${alias}**${orderStr}:\n${message}\n\n_Требует вашего внимания._`
  );
  return "Эскалация отправлена руководителю.";
}

async function toolGetEstimateStatus(orderId: number): Promise<string> {
  const receipts = await db.select().from(receiptsTable)
    .where(eq(receiptsTable.orderId, orderId));
  if (receipts.length === 0) return `Смета по заказу #${orderId} ещё не создана.`;
  const r = receipts[0];
  const total = Number(r.totalAmount ?? 0);
  return `Смета создана. Итого: ${total.toLocaleString("ru-RU")} ₽${r.notes ? ". Заметки: " + r.notes : ""}.`;
}

// ─── Build context summary for system prompt ─────────────────────────────────

async function buildMasterContext(masterId: number): Promise<string> {
  const orders = await getMasterActiveOrders(masterId);
  if (orders.length === 0) return "Активных заказов нет.";

  const lines = await Promise.all(orders.map(async o => {
    const scheduledStr = o.scheduledAt
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(o.scheduledAt))
      : "дата не указана";
    const ageH = Math.round((Date.now() - new Date(o.assignedAt ?? o.createdAt).getTime()) / 3600000);

    // Check estimate
    const receipts = await db.select({ id: receiptsTable.id, totalAmount: receiptsTable.totalAmount })
      .from(receiptsTable).where(eq(receiptsTable.orderId, o.id));
    const estimateStr = receipts.length > 0
      ? `смета: ${Number(receipts[0].totalAmount).toLocaleString("ru-RU")} ₽`
      : "смета не отправлена";

    return `• Заказ #${o.id}: ${o.serviceType}, ${o.city}${o.district ? ", " + o.district : ""}, ${o.area} м², дата: ${scheduledStr}, назначен ${ageH}ч назад, ${estimateStr}`;
  }));

  return `Активные заказы (${orders.length}):\n${lines.join("\n")}`;
}

// ─── GPT-4o tool definitions ─────────────────────────────────────────────────

const DISPATCHER_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "add_order_note",
      description: "Сохранить важную информацию от мастера в CRM (проблема, срок, уточнение)",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "number", description: "ID заказа" },
          note: { type: "string", description: "Заметка (кратко и по делу)" },
        },
        required: ["orderId", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_order_in_progress",
      description: "Поставить заказ в статус 'в работе' когда мастер сообщает о начале работ",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "number" },
        },
        required: ["orderId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_estimate_status",
      description: "Проверить, отправлена ли смета по заказу",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "number" },
        },
        required: ["orderId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_manager",
      description: "Немедленно уведомить руководителя о серьёзной проблеме (конфликт, повреждение, несчастный случай, мастер не выходит на связь)",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Суть проблемы для руководителя" },
          orderId: { type: "number", description: "ID заказа (если применимо)" },
        },
        required: ["message"],
      },
    },
  },
];

// ─── Main AI response function ────────────────────────────────────────────────

export async function handleMasterMessage(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  text: string,
): Promise<void> {
  const context = await buildMasterContext(masterId);
  const systemPrompt = `Ты — AI-диспетчер ремонтного сервиса «Честный мастер». Ты общаешься с мастером ${masterAlias} от лица компании.

Текущее состояние мастера:
${context}

Твои задачи:
- Поддерживать дружелюбный, профессиональный диалог
- Уточнять как идут работы, когда планируют закончить
- Напоминать про смету если не отправлена
- Если мастер сообщает о начале работ — фиксировать в CRM
- Сохранять важные детали (проблемы, сроки, договорённости) через add_order_note
- При СЕРЬЁЗНЫХ проблемах (конфликт с клиентом, повреждение имущества, травма) — немедленно вызывать escalate_to_manager

Правила:
- Пиши коротко — ты в мессенджере
- Будь конкретным: называй заказ (#номер)
- Не перегружай мастера вопросами — один вопрос за раз
- Если мастер написал что-то важное — сначала сохрани через tool, потом ответь`;

  addToHistory(masterId, { role: "user", content: text });

  try {
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...getHistory(masterId),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: DISPATCHER_TOOLS,
      tool_choice: "auto",
      max_tokens: 500,
    });

    const choice = response.choices[0];
    const assistantMsg = choice.message;

    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      addToHistory(masterId, { role: "assistant", content: assistantMsg.content ?? "" });

      for (const tc of assistantMsg.tool_calls) {
        const fnName = tc.function.name;
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}

        let toolResult = "";
        if (fnName === "add_order_note") {
          toolResult = await toolAddOrderNote(args.orderId, args.note);
        } else if (fnName === "set_order_in_progress") {
          toolResult = await toolSetOrderInProgress(args.orderId);
        } else if (fnName === "get_estimate_status") {
          toolResult = await toolGetEstimateStatus(args.orderId);
        } else if (fnName === "escalate_to_manager") {
          toolResult = await toolEscalateToManager(args.message, masterId, args.orderId);
        }

        addToHistory(masterId, { role: "tool", content: toolResult, tool_call_id: tc.id, name: fnName });
      }

      const followUp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...getHistory(masterId),
        ],
        max_tokens: 400,
      });

      const reply = followUp.choices[0]?.message?.content ?? "";
      if (reply) {
        addToHistory(masterId, { role: "assistant", content: reply });
        await sendMaxMessage(maxChatId, reply);
        await saveBotReply(masterId, maxChatId, reply);
      }
    } else {
      const reply = assistantMsg.content ?? "";
      if (reply) {
        addToHistory(masterId, { role: "assistant", content: reply });
        await sendMaxMessage(maxChatId, reply);
        await saveBotReply(masterId, maxChatId, reply);
      }
    }
  } catch (e) {
    console.error("[dispatcherAI] AI error:", e);
    await sendMaxMessage(maxChatId, "Принял, передам оператору. Если срочно — позвоните нам.");
  }
}

// Save bot reply to CRM chat for visibility
async function saveBotReply(masterId: number, chatId: string, text: string) {
  try {
    await db.insert(masterMessagesTable).values({
      masterId,
      telegramChatId: `max_${chatId}`,
      text: `[ИИ-диспетчер]: ${text}`,
      fromMaster: false,
      senderName: "Диспетчер",
      isRead: true,
    });
  } catch {}
}

// ─── Proactive messages ──────────────────────────────────────────────────────

/** Send greeting after master is assigned to an order */
export async function sendAssignmentGreeting(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  if (greetedOrders.has(orderId)) return;
  greetedOrders.add(orderId);

  const data = await getOrderWithLead(orderId);
  if (!data) return;
  const { order, lead } = data;

  const scheduledStr = order.scheduledAt
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduledAt))
    : "уточните с клиентом";

  let msg = `👋 ${masterAlias}, вы назначены на заказ #${orderId}!\n\n`;
  msg += `🔧 ${order.serviceType}\n`;
  msg += `📍 ${order.city}${order.district ? ", " + order.district : ""}\n`;
  msg += `📐 ${order.area} м²\n`;
  msg += `📅 Дата: ${scheduledStr}`;
  if (lead) msg += `\n📞 Клиент: ${lead.clientName} · ${lead.clientPhone}`;
  msg += `\n\nВсё понятно? Подтвердите получение или задайте вопрос.`;

  await sendMaxMessage(maxChatId, msg);
  await saveBotReply(masterId, maxChatId, msg);
  console.log(`[dispatcherAI] Sent assignment greeting to ${masterAlias} for order #${orderId}`);
}

/** 24h check-in after assignment */
export async function sendDailyCheckin(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  if (checkinOrders.has(orderId)) return;
  checkinOrders.add(orderId);

  await sendMaxMessage(
    maxChatId,
    `Привет, ${masterAlias}! Как дела на объекте по заказу #${orderId}? Всё идёт по плану? 😊`
  );
  const msg = `Привет, ${masterAlias}! Как дела на объекте по заказу #${orderId}? Всё идёт по плану? 😊`;
  await saveBotReply(masterId, maxChatId, msg);
  console.log(`[dispatcherAI] Sent 24h check-in to ${masterAlias} for order #${orderId}`);
}

/** Estimate reminder */
export async function sendEstimateReminder(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  if (estimateReminders.has(orderId)) return;
  estimateReminders.add(orderId);

  const msg = `${masterAlias}, напомни — по заказу #${orderId} смета ещё не отправлена. Не забудь оформить её в приложении, чтобы клиент мог согласовать стоимость работ. 📋`;
  await sendMaxMessage(maxChatId, msg);
  await saveBotReply(masterId, maxChatId, msg);
  console.log(`[dispatcherAI] Sent estimate reminder to ${masterAlias} for order #${orderId}`);
}

/** Reminder the day before scheduledAt */
export async function sendPreDayReminder(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  if (preDayReminders.has(orderId)) return;
  preDayReminders.add(orderId);

  const msg = `${masterAlias}, завтра выезд на объект по заказу #${orderId}. Всё готово? Клиент ждёт, подтвердите что будете в срок. 🔧`;
  await sendMaxMessage(maxChatId, msg);
  await saveBotReply(masterId, maxChatId, msg);
  console.log(`[dispatcherAI] Sent pre-day reminder to ${masterAlias} for order #${orderId}`);
}

// ─── Scheduler: run checks for all active orders ─────────────────────────────

export async function runProactiveChecks(): Promise<void> {
  try {
    const activeOrders = await db.select().from(ordersTable)
      .where(and(
        inArray(ordersTable.status, ["master_assigned", "in_progress"]),
        isNull(ordersTable.deletedAt),
      ));

    if (activeOrders.length === 0) return;

    const masterIds = [...new Set(activeOrders.map(o => o.masterId).filter(Boolean))] as number[];
    if (masterIds.length === 0) return;

    const masters = await db.select().from(mastersTable)
      .where(inArray(mastersTable.id, masterIds));

    const masterMap = new Map(masters.map(m => [m.id, m]));

    const now = Date.now();

    for (const order of activeOrders) {
      if (!order.masterId) continue;
      const master = masterMap.get(order.masterId);
      if (!master?.maxChatId) continue; // Only Max-linked masters

      const assignedAt = order.assignedAt ? new Date(order.assignedAt).getTime() : new Date(order.createdAt).getTime();
      const hoursAssigned = (now - assignedAt) / 3600000;

      // 1. Assignment greeting (first 2h)
      if (hoursAssigned < 2) {
        await sendAssignmentGreeting(master.id, master.alias, master.maxChatId, order.id);
        continue; // Don't pile messages on fresh assignment
      }

      // 2. 24h check-in
      if (hoursAssigned >= 23 && hoursAssigned < 25) {
        await sendDailyCheckin(master.id, master.alias, master.maxChatId, order.id);
      }

      // 3. Estimate reminder after 48h if no receipt
      if (hoursAssigned >= 47) {
        const receipts = await db.select({ id: receiptsTable.id })
          .from(receiptsTable)
          .where(eq(receiptsTable.orderId, order.id));
        if (receipts.length === 0) {
          await sendEstimateReminder(master.id, master.alias, master.maxChatId, order.id);
        }
      }

      // 4. Day-before reminder: scheduledAt is within 20–28h from now
      if (order.scheduledAt) {
        const hoursToScheduled = (new Date(order.scheduledAt).getTime() - now) / 3600000;
        if (hoursToScheduled >= 20 && hoursToScheduled <= 28) {
          await sendPreDayReminder(master.id, master.alias, master.maxChatId, order.id);
        }
      }
    }
  } catch (e) {
    console.error("[dispatcherAI] proactive checks error:", e);
  }
}
