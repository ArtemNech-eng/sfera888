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
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, masterMessagesTable, dispatcherFollowupsTable, botMemoryTable, orderDispatchesTable } from "@workspace/db";
import { eq, and, isNull, inArray, lte, desc, gte, ilike, sql } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";
import { sendMsg as sendManagerMsg, getManagerUserId, injectNotification } from "../managerBot.js";

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
  tool_calls?: any[];
}

const masterSessions = new Map<number, ChatMessage[]>();
const MAX_HISTORY = 14;
const sessionDbLoaded = new Set<number>();

function getHistory(masterId: number): ChatMessage[] {
  if (!masterSessions.has(masterId)) masterSessions.set(masterId, []);
  return masterSessions.get(masterId)!;
}

function sanitizeHistory(msgs: ChatMessage[]): ChatMessage[] {
  // After trimming, the slice may start with orphaned "tool" messages whose
  // parent assistant-with-tool_calls was cut off. Remove them from the top.
  let start = 0;
  while (start < msgs.length && msgs[start].role === "tool") {
    start++;
  }
  return msgs.slice(start);
}

function addToHistory(masterId: number, msg: ChatMessage) {
  const h = getHistory(masterId);
  h.push(msg);
  if (h.length > MAX_HISTORY) {
    masterSessions.set(masterId, sanitizeHistory(h.slice(-MAX_HISTORY)));
  }
}

async function ensureSessionFromDb(masterId: number): Promise<void> {
  if (sessionDbLoaded.has(masterId)) return;
  sessionDbLoaded.add(masterId);
  try {
    const res = await db.execute(sql`
      SELECT session_data FROM bot_sessions WHERE bot_type = 'dispatcher' AND user_id = ${masterId} LIMIT 1
    `);
    if (res.rows.length > 0) {
      const data = res.rows[0].session_data as any;
      if (Array.isArray(data?.messages)) {
        masterSessions.set(masterId, data.messages);
        console.log(`[dispatcherAI] Session restored for master ${masterId} (${data.messages.length} msgs)`);
      }
    }
  } catch (e) {
    console.error("[dispatcherAI] Failed to load session:", e);
  }
}

function persistSession(masterId: number): void {
  const messages = masterSessions.get(masterId);
  if (!messages) return;
  const payload = JSON.stringify({ messages });
  db.execute(sql`
    INSERT INTO bot_sessions (bot_type, user_id, session_data, updated_at)
    VALUES ('dispatcher', ${masterId}, ${payload}::jsonb, NOW())
    ON CONFLICT (bot_type, user_id)
    DO UPDATE SET session_data = ${payload}::jsonb, updated_at = NOW()
  `).catch(e => console.error("[dispatcherAI] Failed to persist session:", e));
}

// ─── Follow-up / dormant constants ───────────────────────────────────────────
const FOLLOWUP_DELAY_H = 5;    // hours before sending follow-up
const FOLLOWUP_COOLDOWN_H = 20; // min hours between follow-ups
const DORMANT_PING_COOLDOWN_DAYS = 7;

// ─── DB-based deduplication helper ───────────────────────────────────────────
// Checks whether the bot already sent a message containing `fragment` to this
// master within the last `withinHours` hours (or ever, if withinHours omitted).
// Replaces all in-memory Sets/Maps so dedup survives server restarts.
async function alreadySentBotMessage(
  masterId: number,
  fragment: string,
  withinHours?: number,
): Promise<boolean> {
  const conditions: ReturnType<typeof eq>[] = [
    eq(masterMessagesTable.masterId, masterId),
    eq(masterMessagesTable.fromMaster, false),
    ilike(masterMessagesTable.text, `%${fragment}%`),
  ];
  if (withinHours !== undefined) {
    const since = new Date(Date.now() - withinHours * 3600_000);
    conditions.push(gte(masterMessagesTable.createdAt, since));
  }
  const rows = await db.select({ id: masterMessagesTable.id })
    .from(masterMessagesTable)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

// ─── Manager task pending notifications ───────────────────────────────────────
// When manager sends a task via send_task_to_dispatcher, track it so the manager
// gets notified when the master replies with the result.
interface PendingManagerTask {
  task: string;
  masterAlias: string;
  sentAt: number;
}
const pendingManagerTasks = new Map<number, PendingManagerTask>(); // masterId → task

// ─── Pending order contacts ────────────────────────────────────────────────────
// When dispatcher personally asks a master "can you take order #X?",
// track it so that when the master replies "yes/no", we handle it correctly.
interface PendingOrderContact {
  orderId: number;
  orderSummary: string; // short description for context injection
  sentAt: number;
  remindedAt?: number;  // timestamp when we sent the one reminder
}
const pendingOrderContacts = new Map<number, PendingOrderContact>(); // masterId → order contact

const CONTACT_REMIND_MS = 45 * 60 * 1000;  // 45 min → send reminder
const CONTACT_EXPIRE_MS = 90 * 60 * 1000;  // 90 min → give up on this master

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

  const text = `⚠️ **Проблема от ${alias}**${orderStr}:\n${message}\n\n_Требует вашего внимания._`;
  await sendManagerMsg(managerId, text);
  // Inject context so manager bot knows who/what we're discussing
  injectNotification(text, {
    masterId,
    masterAlias: alias,
    ...(orderId ? { orderId } : {}),
    description: message,
  });
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

async function toolScheduleFollowup(
  masterId: number,
  orderId: number,
  hoursFromNow: number,
  question: string,
  context?: string,
): Promise<string> {
  const followupAt = new Date(Date.now() + hoursFromNow * 3600000);
  await db.insert(dispatcherFollowupsTable).values({
    masterId,
    orderId,
    followupAt,
    question,
    context: context ?? null,
    sent: false,
  });
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  });
  console.log(`[dispatcherAI] Scheduled follow-up for master ${masterId} at ${fmt.format(followupAt)}: "${question}"`);
  return `Запланировано: ${fmt.format(followupAt)} напишу мастеру: "${question}"`;
}

/** Calculate trust score for a master: ratio of clean completions vs suspicious cancellations */
export async function getMasterTrustScore(masterId: number): Promise<{
  score: number; label: string; totalOrders: number; suspiciousCancels: number; ghostFlags: number;
}> {
  const allOrders = await db.select({
    id: ordersTable.id, status: ordersTable.status, cancelType: ordersTable.cancelType,
    assignedAt: ordersTable.assignedAt,
  }).from(ordersTable).where(and(eq(ordersTable.masterId, masterId), isNull(ordersTable.deletedAt)));

  const totalOrders = allOrders.length;
  const completed = allOrders.filter(o => o.status === "completed").length;
  const clientRefused = allOrders.filter(o => o.status === "cancelled" && o.cancelType === "client_refused").length;

  // Count ghost flags saved in memory
  const ghostMems = await db.select({ id: botMemoryTable.id }).from(botMemoryTable)
    .where(and(eq(botMemoryTable.masterId, masterId), ilike(botMemoryTable.category, "подозрительное_поведение")));
  const ghostFlags = ghostMems.length;

  const suspiciousCancels = clientRefused; // client_refused cancels after silence
  const risk = totalOrders > 0 ? Math.round(((completed) / totalOrders) * 100) : 100;

  let label = "✅ Надёжный";
  if (ghostFlags >= 2 || (clientRefused >= 2 && totalOrders <= 6)) label = "🔴 Высокий риск";
  else if (ghostFlags === 1 || clientRefused >= 2) label = "🟡 Под наблюдением";
  else if (risk < 60) label = "🟠 Требует внимания";

  return { score: risk, label, totalOrders, suspiciousCancels, ghostFlags };
}

/** Ghost master detection: assigned 12+ hours, bot messaged, master never replied → alert manager */
async function detectGhostMaster(
  master: { id: number; alias: string; maxChatId: string | null },
  orderId: number,
  hoursAssigned: number,
) {
  // Check if master has replied at all since assignment
  const assignedAt = await db.select({ assignedAt: ordersTable.assignedAt })
    .from(ordersTable).where(eq(ordersTable.id, orderId)).then(r => r[0]?.assignedAt);
  if (!assignedAt) return;

  const masterReplyAfterAssignment = await db.select({ id: masterMessagesTable.id })
    .from(masterMessagesTable)
    .where(and(
      eq(masterMessagesTable.masterId, master.id),
      eq(masterMessagesTable.fromMaster, true),
      gte(masterMessagesTable.createdAt, new Date(assignedAt)),
    ))
    .limit(1);

  if (masterReplyAfterAssignment.length > 0) return; // Master replied — not a ghost

  // Check if we already sent a ghost alert for this order (dedup by checking memory)
  const alreadyFlagged = await db.select({ id: botMemoryTable.id }).from(botMemoryTable)
    .where(and(
      eq(botMemoryTable.masterId, master.id),
      ilike(botMemoryTable.content, `%заказ #${orderId}%`),
      ilike(botMemoryTable.category, "подозрительное_поведение"),
    ))
    .limit(1);
  if (alreadyFlagged.length > 0) return;

  // Also dedup via manager notification (don't spam manager)
  if (await alreadySentBotMessage(master.id, `молчит по заказу #${orderId}`, 24)) return;

  // Save to memory
  await db.insert(botMemoryTable).values({
    masterId: master.id,
    category: "подозрительное_поведение",
    content: `Заказ #${orderId}: не ответил ни разу за ${Math.round(hoursAssigned)} часов после назначения. Все сообщения бота проигнорированы.`,
  });

  // Alert manager
  const managerId = getManagerUserId();
  if (managerId) {
    const trust = await getMasterTrustScore(master.id);
    const alert = `⚠️ **Мастер-призрак** | ${master.alias}\n\nНазначен на заказ **#${orderId}** ${Math.round(hoursAssigned)} часов назад — не ответил ни на одно сообщение бота.\n\nИстория доверия: ${trust.label} | Заказов: ${trust.totalOrders} | Подозрит. отмен: ${trust.suspiciousCancels} | Предупреждений: ${trust.ghostFlags}`;
    await sendManagerMsg(managerId, alert);
    injectNotification(alert, { masterAlias: master.alias });
  }

  console.log(`[dispatcherAI] Ghost master alert: ${master.alias} has not replied to order #${orderId} in ${Math.round(hoursAssigned)}h`);
}

/** Called from orders route when an order is cancelled — analyse if cancellation looks suspicious */
export async function analyseOrderCancellation(
  orderId: number,
  masterId: number,
  masterAlias: string,
  cancelType: string | null,
) {
  try {
    const order = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).then(r => r[0]);
    if (!order) return;

    const assignedAt = order.assignedAt;
    if (!assignedAt) return; // Never had a master

    const hoursAssigned = (Date.now() - new Date(assignedAt).getTime()) / 3600000;

    // Check if master ever replied after assignment
    const masterReplied = await db.select({ id: masterMessagesTable.id })
      .from(masterMessagesTable)
      .where(and(
        eq(masterMessagesTable.masterId, masterId),
        eq(masterMessagesTable.fromMaster, true),
        gte(masterMessagesTable.createdAt, new Date(assignedAt)),
      ))
      .limit(1);

    const wasGhost = masterReplied.length === 0;
    const clientRefused = cancelType === "client_refused";
    const suspicious = wasGhost && hoursAssigned >= 6; // Was silent AND order lasted 6+ hours

    if (!suspicious) return; // Nothing unusual

    const reason = clientRefused ? "заявил «клиент отказался»" : "заказ отменён";
    const memory = `Заказ #${orderId}: пропал на ${Math.round(hoursAssigned)} ч после назначения, не отвечал боту, затем ${reason}. ПОДОЗРИТЕЛЬНО.`;

    // Save to master memory
    await db.insert(botMemoryTable).values({
      masterId,
      category: "подозрительное_поведение",
      content: memory,
    });

    // Alert manager
    const managerId = getManagerUserId();
    if (managerId) {
      const trust = await getMasterTrustScore(masterId);
      const alert = `🚨 **Подозрительная отмена** | ${masterAlias}\n\nЗаказ **#${orderId}** отменён после ${Math.round(hoursAssigned)} ч молчания мастера.\n📋 Причина: ${order.cancelReason ?? cancelType ?? "не указана"}\n\nВ этот период мастер **не отвечал ни разу** на сообщения бота — контакт с клиентом не подтверждён.\n\n📊 Рейтинг доверия: ${trust.label} | Всего заказов: ${trust.totalOrders} | Подозрит. случаев: ${trust.ghostFlags}`;
      await sendManagerMsg(managerId, alert);
      injectNotification(alert, { masterAlias });
    }

    console.log(`[dispatcherAI] Suspicious cancellation flagged for master ${masterAlias} on order #${orderId}`);
  } catch (e) {
    console.error("[dispatcherAI] analyseOrderCancellation error:", e);
  }
}

async function toolSaveMemory(masterId: number, category: string, content: string): Promise<string> {
  // Avoid exact duplicates
  const existing = await db.select().from(botMemoryTable)
    .where(and(eq(botMemoryTable.masterId, masterId), ilike(botMemoryTable.content, content)));
  if (existing.length > 0) return "Этот факт уже сохранён в памяти.";

  await db.insert(botMemoryTable).values({
    masterId,
    category,
    content,
  });
  console.log(`[dispatcherAI] Memory saved for master ${masterId} [${category}]: ${content}`);
  return `Запомнено [${category}]: ${content}`;
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

  let result = `Активные заказы (${orders.length}):\n${lines.join("\n")}`;

  // Include pending scheduled follow-ups so AI doesn't double-schedule
  const pendingFollowups = await db.select().from(dispatcherFollowupsTable)
    .where(and(
      eq(dispatcherFollowupsTable.masterId, masterId),
      eq(dispatcherFollowupsTable.sent, false),
    ));
  if (pendingFollowups.length > 0) {
    const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
    const lines2 = pendingFollowups.map(f => `  • ${fmt.format(new Date(f.followupAt))}: "${f.question}"${f.context ? ` [обещал: ${f.context}]` : ""}`);
    result += `\n\nЗапланированные уточнения (${pendingFollowups.length}):\n${lines2.join("\n")}`;
  }

  // Persistent memory about this master — learned from past interactions
  const memories = await db.select().from(botMemoryTable)
    .where(eq(botMemoryTable.masterId, masterId))
    .orderBy(botMemoryTable.updatedAt);
  if (memories.length > 0) {
    const memLines = memories.map(m => `  [${m.category}] ${m.content}`);
    result += `\n\nЧто я знаю об этом мастере (усвоено из прошлых разговоров):\n${memLines.join("\n")}`;
  }

  return result;
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
  {
    type: "function",
    function: {
      name: "schedule_followup",
      description: "Запланировать уточняющий вопрос мастеру на конкретное время. Используй когда мастер называет срок ('закончу через 3 дня', 'сдам в пятницу', 'приеду завтра'). Бот автоматически напишет в нужный момент и уточнит, выполнено ли обещание.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "number", description: "ID заказа" },
          hoursFromNow: { type: "number", description: "Через сколько часов написать мастеру (например: 'через 3 дня' = 72, 'завтра' = 24)" },
          question: { type: "string", description: "Что спросить мастера в нужный момент (конкретно, по-русски). Например: 'Вы говорили закончить через 3 дня — готово? Клиент ждёт подтверждения.'"},
          context: { type: "string", description: "Краткий контекст — что именно обещал мастер" },
        },
        required: ["orderId", "hoursFromNow", "question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Запомнить важный факт о мастере для использования в будущих разговорах. Используй когда узнаёшь что-то устойчивое о его характере, привычках, предпочтениях, специализации или паттернах поведения. Не дублируй уже известное.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Категория факта",
            enum: ["характер", "предпочтения", "специализация", "паттерн_поведения", "подозрительное_поведение", "контакт", "прочее"],
          },
          content: {
            type: "string",
            description: "Сам факт — одно чёткое предложение. Например: 'Предпочитает созваниваться утром до 10:00', 'Всегда берёт предоплату за материалы вперёд', 'Работает только в Прикубанском районе'.",
          },
        },
        required: ["category", "content"],
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
  // Track that master replied — used by follow-up logic
  lastMasterReplyAt.set(masterId, Date.now());

  // If manager asked dispatcher to contact this master — notify manager of the reply
  const pendingTask = pendingManagerTasks.get(masterId);
  if (pendingTask) {
    pendingManagerTasks.delete(masterId);
    const managerId = getManagerUserId();
    if (managerId) {
      const elapsed = Math.round((Date.now() - pendingTask.sentAt) / 60000);
      const notifText = `📩 **${pendingTask.masterAlias}** ответил (через ${elapsed} мин):\n\n"${text}"\n\n_Задача была: ${pendingTask.task}_`;
      await sendManagerMsg(managerId, notifText);
      injectNotification(notifText, { masterAlias: pendingTask.masterAlias });
    }
  }

  const context = await buildMasterContext(masterId);

  // Inject pending order contact context if we're waiting for a yes/no on a specific order
  const pendingContact = pendingOrderContacts.get(masterId);
  const pendingOrderSection = pendingContact
    ? `\n\n⚠️ ОЖИДАЕМ ОТВЕТ ПО ЗАКАЗУ: ты уже написал этому мастеру по заказу #${pendingContact.orderId} (${pendingContact.orderSummary}) и ждёшь подтверждения.
Если мастер отвечает ДА (готов, могу, берусь, приеду, ок и т.п.) — вызови escalate_to_manager с текстом "МАСТЕР ГОТОВ ВЗЯТЬ ЗАКАЗ #${pendingContact.orderId}: ${masterAlias} подтвердил готовность."
Если мастер отвечает НЕТ (не могу, занят, не получится) — поблагодари, больше не предлагай этот заказ (запоминать через save_memory не нужно, система сама обновит статус).
Не задавай лишних вопросов — определи из ответа: согласен или нет.`
    : "";

  const systemPrompt = `Ты — AI-диспетчер ремонтного сервиса «Честный мастер». Ты общаешься с мастером ${masterAlias} от лица компании.

Текущее состояние мастера:
${context}${pendingOrderSection}

Твои задачи:
- Поддерживать дружелюбный, профессиональный диалог
- Уточнять как идут работы, когда планируют закончить
- Напоминать про смету если не отправлена
- Если мастер сообщает о начале работ — фиксировать в CRM
- Сохранять важные детали (проблемы, сроки, договорённости) через add_order_note
- При СЕРЬЁЗНЫХ проблемах (конфликт с клиентом, повреждение имущества, травма) — немедленно вызывать escalate_to_manager
- Если мастер называет КОНКРЕТНЫЙ срок ("закончу через 3 дня", "сдам в пятницу", "приеду завтра") — ВСЕГДА вызывай schedule_followup чтобы бот уточнил в нужный момент
- Если мастер сообщает о результатах звонка с клиентом (созвонились, договорились о времени, согласовали дату) — ОБЯЗАТЕЛЬНО сохрани это через add_order_note с пометкой "Созвон с клиентом: [что договорились]"
- Если из разговора становится ясно что-то УСТОЙЧИВОЕ о мастере (привычки, предпочтения, характер, паттерны) — сохрани через save_memory. Примеры: "не берёт трубку в первой половине дня", "всегда опаздывает с фото выполненных работ", "специализируется на ванных комнатах", "предпочитает объяснять ситуацию голосовыми"

Правила:
- Пиши коротко — ты в мессенджере
- Будь конкретным: называй заказ (#номер)
- Не перегружай мастера вопросами — один вопрос за раз
- Если мастер написал что-то важное — сначала сохрани через tool, потом ответь
- При schedule_followup: пиши question от имени диспетчера, конкретно, со ссылкой на обещание мастера`;

  await ensureSessionFromDb(masterId);
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
      // MUST save tool_calls with the message — otherwise tool responses become orphans
      addToHistory(masterId, { role: "assistant", content: assistantMsg.content ?? "", tool_calls: assistantMsg.tool_calls });

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
        } else if (fnName === "schedule_followup") {
          toolResult = await toolScheduleFollowup(masterId, args.orderId, args.hoursFromNow, args.question, args.context);
        } else if (fnName === "save_memory") {
          toolResult = await toolSaveMemory(masterId, args.category, args.content);
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
  } finally {
    persistSession(masterId);
  }
}

// Save bot reply to CRM chat for visibility + track timing for follow-ups
async function saveBotReply(masterId: number, chatId: string, text: string) {
  lastBotMessageAt.set(masterId, Date.now());
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
  if (await alreadySentBotMessage(masterId, `назначены на заказ #${orderId}`)) return;

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
  if (await alreadySentBotMessage(masterId, `объекте по заказу #${orderId}`)) return;

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
  // Don't re-send if already reminded in the last 48h
  if (await alreadySentBotMessage(masterId, `заказу #${orderId} смета ещё не отправлена`, 48)) return;

  const msg = `${masterAlias}, напомни — по заказу #${orderId} смета ещё не отправлена. Не забудь оформить её в приложении, чтобы клиент мог согласовать стоимость работ. 📋`;
  await sendMaxMessage(maxChatId, msg);
  await saveBotReply(masterId, maxChatId, msg);
  console.log(`[dispatcherAI] Sent estimate reminder to ${masterAlias} for order #${orderId}`);
}

/** 15-min post-assignment: did you call the client? */
export async function sendClientCallCheckin(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  if (await alreadySentBotMessage(masterId, `созвонились с клиентом по заказу #${orderId}`)) return;

  const msg = `${masterAlias}, вы уже созвонились с клиентом по заказу #${orderId}? Напишите — о чём договорились, на какое время согласовали визит. Это важно для координации работ. 📞`;
  await sendMaxMessage(maxChatId, msg);
  await saveBotReply(masterId, maxChatId, msg);
  console.log(`[dispatcherAI] Sent client call check-in to ${masterAlias} for order #${orderId}`);
}

/** Reminder the day before scheduledAt */
export async function sendPreDayReminder(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  if (await alreadySentBotMessage(masterId, `завтра выезд на объект по заказу #${orderId}`)) return;

  const msg = `${masterAlias}, завтра выезд на объект по заказу #${orderId}. Всё готово? Клиент ждёт, подтвердите что будете в срок. 🔧`;
  await sendMaxMessage(maxChatId, msg);
  await saveBotReply(masterId, maxChatId, msg);
  console.log(`[dispatcherAI] Sent pre-day reminder to ${masterAlias} for order #${orderId}`);
}

// ─── Scheduler: run checks for all active orders ─────────────────────────────

export async function runProactiveChecks(): Promise<void> {
  try {
    // ── Scheduled follow-ups (master commitments) ─────────────────────────
    const dueFollowups = await db.select().from(dispatcherFollowupsTable)
      .where(and(
        eq(dispatcherFollowupsTable.sent, false),
        lte(dispatcherFollowupsTable.followupAt, new Date()),
      ));

    for (const followup of dueFollowups) {
      const master = await db.select().from(mastersTable)
        .where(eq(mastersTable.id, followup.masterId))
        .then(r => r[0]);

      if (master?.maxChatId) {
        await sendMaxMessage(master.maxChatId, followup.question);
        await saveBotReply(master.id, master.maxChatId, followup.question);
        console.log(`[dispatcherAI] Sent scheduled follow-up #${followup.id} to ${master.alias}`);
      }

      // Mark as sent regardless (master may not have Max)
      await db.update(dispatcherFollowupsTable)
        .set({ sent: true })
        .where(eq(dispatcherFollowupsTable.id, followup.id));
    }

    // ── Handle non-responsive masters: reminder at 45min, give up at 90min ──
    const nowMs = Date.now();
    for (const [masterId, contact] of pendingOrderContacts) {
      const elapsed = nowMs - contact.sentAt;

      // 90 min passed → give up, clear the contact
      if (elapsed >= CONTACT_EXPIRE_MS) {
        pendingOrderContacts.delete(masterId);
        console.log(`[dispatcherAI] Contact for order #${contact.orderId} expired (master ${masterId}) — removed from pending`);
        continue;
      }

      // 45 min passed, no reminder sent yet → send gentle reminder
      if (elapsed >= CONTACT_REMIND_MS && !contact.remindedAt) {
        contact.remindedAt = nowMs;
        try {
          const master = await db.select().from(mastersTable)
            .where(eq(mastersTable.id, masterId))
            .then(r => r[0]);
          if (master?.maxChatId) {
            const reminder = `${master.alias}, напоминаю — по заказу #${contact.orderId} (${contact.orderSummary}) ещё ищем мастера. Сможете взять? 🙏`;
            await sendMaxMessage(master.maxChatId, reminder);
            await saveBotReply(master.id, master.maxChatId, reminder);
            console.log(`[dispatcherAI] Sent order contact reminder to ${master.alias} for order #${contact.orderId}`);
          }
        } catch (e) {
          console.error(`[dispatcherAI] Reminder error for master ${masterId}:`, e);
        }
      }
    }

    const activeOrders = await db.select().from(ordersTable)
      .where(and(
        inArray(ordersTable.status, ["master_assigned", "in_progress"]),
        isNull(ordersTable.deletedAt),
      ));

    const masterIds = [...new Set(activeOrders.map(o => o.masterId).filter(Boolean))] as number[];

    const masters = masterIds.length > 0
      ? await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds))
      : [];

    const masterMap = new Map(masters.map(m => [m.id, m]));

    const now = Date.now();

    for (const order of activeOrders) {
      if (!order.masterId) continue;
      const master = masterMap.get(order.masterId);
      if (!master?.maxChatId) continue; // Only Max-linked masters

      const assignedAt = order.assignedAt ? new Date(order.assignedAt).getTime() : new Date(order.createdAt).getTime();
      const hoursAssigned = (now - assignedAt) / 3600000;

      // 1. Assignment greeting (first 15 min only → don't pile on subsequent cycles)
      if (hoursAssigned < 0.25) {
        await sendAssignmentGreeting(master.id, master.alias, master.maxChatId, order.id);
        continue; // Too fresh — wait before next message
      }

      // Always ensure greeting was sent (in case scheduler missed the first window)
      await sendAssignmentGreeting(master.id, master.alias, master.maxChatId, order.id);

      // 1b. Client call check-in (15 min after assignment, once ever)
      await sendClientCallCheckin(master.id, master.alias, master.maxChatId, order.id);

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

      // 5. Ghost master detection: assigned 12+ hours, bot messaged, master NEVER replied
      if (hoursAssigned >= 12) {
        await detectGhostMaster(master, order.id, hoursAssigned);
      }
    }

    // ── Follow-up for ignored messages ──────────────────────────────────────
    // For each master with active orders that has been messaged but hasn't replied.
    // All timestamps come from the DB so dedup survives restarts.
    for (const master of masters) {
      if (!master.maxChatId) continue;

      // Last bot message to this master
      const lastBotRow = await db.select({ createdAt: masterMessagesTable.createdAt })
        .from(masterMessagesTable)
        .where(and(eq(masterMessagesTable.masterId, master.id), eq(masterMessagesTable.fromMaster, false)))
        .orderBy(desc(masterMessagesTable.createdAt))
        .limit(1);
      if (lastBotRow.length === 0) continue;
      const lastBot = lastBotRow[0].createdAt.getTime();

      // Last master reply
      const lastMasterRow = await db.select({ createdAt: masterMessagesTable.createdAt })
        .from(masterMessagesTable)
        .where(and(eq(masterMessagesTable.masterId, master.id), eq(masterMessagesTable.fromMaster, true)))
        .orderBy(desc(masterMessagesTable.createdAt))
        .limit(1);
      const lastMaster = lastMasterRow.length > 0 ? lastMasterRow[0].createdAt.getTime() : 0;
      if (lastMaster >= lastBot) continue; // master already replied

      const hoursSinceBot = (now - lastBot) / 3600000;
      if (hoursSinceBot < FOLLOWUP_DELAY_H) continue; // too soon

      // Skip if we already sent a follow-up recently
      if (await alreadySentBotMessage(master.id, "вы получили наше сообщение", FOLLOWUP_COOLDOWN_H)) continue;

      // Send a gentle follow-up
      const msg = `${master.alias}, вы получили наше сообщение? Пожалуйста, ответьте — это важно для координации работ. Если есть вопросы, мы готовы помочь! 🙏`;
      await sendMaxMessage(master.maxChatId, msg);
      await saveBotReply(master.id, master.maxChatId, msg);
      console.log(`[dispatcherAI] Sent follow-up to ${master.alias} (no reply for ${Math.round(hoursSinceBot)}h)`);
    }

    // ── Proactive outreach: high-rating masters with no active orders ────────
    // Find active masters with rating >= 4.0 that have no current active orders
    // and haven't been pinged in the last 7 days → send a warm check-in
    const activeMasterIds = new Set(masterIds);

    const topFreeMasters = await db.select().from(mastersTable)
      .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

    for (const m of topFreeMasters) {
      if (!m.maxChatId) continue;
      if (activeMasterIds.has(m.id)) continue; // already has active orders
      if (Number(m.rating ?? 0) < 4.0) continue; // only top-rated

      // Skip if already pinged within cooldown window (DB-based, survives restarts)
      if (await alreadySentBotMessage(m.id, "Давно не было заказов", DORMANT_PING_COOLDOWN_DAYS * 24)) continue;

      // Skip if master wrote to us recently (was active)
      const lastMasterRow = await db.select({ createdAt: masterMessagesTable.createdAt })
        .from(masterMessagesTable)
        .where(and(eq(masterMessagesTable.masterId, m.id), eq(masterMessagesTable.fromMaster, true)))
        .orderBy(desc(masterMessagesTable.createdAt))
        .limit(1);
      if (lastMasterRow.length > 0) {
        const daysSinceReply = (now - lastMasterRow[0].createdAt.getTime()) / (24 * 3600000);
        if (daysSinceReply < 7) continue; // was active recently
      }

      const greeting = `${m.alias}, добрый день! Давно не было заказов — хотим убедиться, что всё в порядке и вы готовы к работе. Если есть вопросы или пожелания — напишите нам, мы всегда на связи. 🙌`;
      await sendMaxMessage(m.maxChatId, greeting);
      await saveBotReply(m.id, m.maxChatId, greeting);
      console.log(`[dispatcherAI] Proactive ping sent to dormant top master ${m.alias} (rating ${m.rating})`);
    }
  } catch (e) {
    console.error("[dispatcherAI] proactive checks error:", e);
  }
}

// ─── Manager bot integrations ─────────────────────────────────────────────────

/** Returns a formatted conversation history with a specific master (for manager reports) */
export async function getMasterConversationReport(masterNameOrId: string): Promise<string> {
  try {
    // Find master by name or ID
    const allMasters = await db.select().from(mastersTable);
    const lower = masterNameOrId.toLowerCase();
    const master = allMasters.find(m =>
      String(m.id) === masterNameOrId ||
      m.alias.toLowerCase().includes(lower) ||
      (m.phone ?? "").includes(masterNameOrId),
    );
    if (!master) return `Мастер "${masterNameOrId}" не найден.`;

    const messages = await db.select().from(masterMessagesTable)
      .where(eq(masterMessagesTable.masterId, master.id))
      .orderBy(masterMessagesTable.createdAt);

    const last20 = messages.slice(-20);
    if (last20.length === 0) return `С мастером ${master.alias} сообщений нет.`;

    const fmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

    let report = `📋 Переписка с ${master.alias} (последние ${last20.length} сообщений):\n\n`;
    for (const msg of last20) {
      const who = msg.fromMaster ? `👷 ${master.alias}` : "🤖 Диспетчер";
      const time = fmt.format(new Date(msg.createdAt));
      report += `[${time}] ${who}:\n${msg.text}\n\n`;
    }

    const lastBot = lastBotMessageAt.get(master.id);
    const lastReply = lastMasterReplyAt.get(master.id);
    if (lastBot && !lastReply || (lastBot && lastReply && lastReply < lastBot)) {
      const h = Math.round((Date.now() - lastBot!) / 3600000);
      report += `⚠️ Мастер не ответил на последнее сообщение диспетчера (${h}ч назад).`;
    } else if (lastReply) {
      const h = Math.round((Date.now() - lastReply) / 3600000);
      report += `✅ Последний ответ мастера — ${h}ч назад.`;
    }

    return report;
  } catch (e) {
    console.error("[dispatcherAI] getMasterConversationReport error:", e);
    return "Ошибка получения переписки.";
  }
}

/** Returns a summary of all active masters and their communication status */
export async function getDispatcherActivityReport(): Promise<string> {
  try {
    const activeOrders = await db.select().from(ordersTable)
      .where(and(inArray(ordersTable.status, ["master_assigned", "in_progress"]), isNull(ordersTable.deletedAt)));

    if (activeOrders.length === 0) return "Нет активных заказов.";

    const masterIds = [...new Set(activeOrders.map(o => o.masterId).filter((id): id is number => id != null))];
    if (masterIds.length === 0) return "Активные заказы есть, но мастера не назначены.";

    const masters = await db.select().from(mastersTable)
      .where(inArray(mastersTable.id, masterIds));

    const now = Date.now();
    let report = `📊 Статус связи с мастерами (${masters.length}):\n\n`;

    for (const master of masters) {
      const orders = activeOrders.filter(o => o.masterId === master.id);
      const orderList = orders.map(o => `#${o.id} ${o.serviceType}`).join(", ");

      const lastBot = lastBotMessageAt.get(master.id);
      const lastReply = lastMasterReplyAt.get(master.id);

      let statusIcon = "⚪";
      let statusText = "сообщений не было";

      if (lastBot) {
        if (!lastReply || lastReply < lastBot) {
          const h = Math.round((now - lastBot) / 3600000);
          statusIcon = h >= FOLLOWUP_DELAY_H ? "🔴" : "🟡";
          statusText = `не отвечает ${h}ч`;
        } else {
          const h = Math.round((now - lastReply) / 3600000);
          statusIcon = "🟢";
          statusText = `ответил ${h}ч назад`;
        }
      }

      report += `${statusIcon} *${master.alias}* ${master.maxChatId ? "(Max ✓)" : "(без Max)"}\n`;
      report += `   Заказы: ${orderList}\n`;
      report += `   Связь: ${statusText}\n\n`;
    }

    return report;
  } catch (e) {
    console.error("[dispatcherAI] getDispatcherActivityReport error:", e);
    return "Ошибка получения отчёта.";
  }
}

/**
 * Proactively contacts all masters who received this order dispatch but haven't responded.
 * Sends a personal message asking "can you take this order?" via Max.
 * Called by the autonomous agent when SLA is violated and no one answered the broadcast.
 */
export async function contactMastersAboutOrder(orderId: number): Promise<string> {
  try {
    const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    const order = orderRows[0];
    if (!order) return `Заказ #${orderId} не найден.`;
    if (order.status !== "waiting_master") {
      return `Заказ #${orderId} уже в статусе ${order.status} — мастер найден или заказ закрыт.`;
    }

    // Get all dispatches with status "sent" (not responded or rejected)
    const dispatches = await db.select().from(orderDispatchesTable)
      .where(and(
        eq(orderDispatchesTable.orderId, orderId),
        eq(orderDispatchesTable.status, "sent"),
      ));

    if (dispatches.length === 0) {
      return `По заказу #${orderId} нет нерассмотренных рассылок. Возможно, все мастера уже ответили. Попробуй разослать заново (auto_broadcast_order).`;
    }

    const masterIds = dispatches.map(d => d.masterId);
    const masters = await db.select().from(mastersTable)
      .where(inArray(mastersTable.id, masterIds));

    const reachable = masters.filter(m => m.maxChatId);
    if (reachable.length === 0) {
      return `Мастера получили рассылку, но ни у кого нет Max — не могу написать лично. Попробуй связаться вручную.`;
    }

    const date = order.scheduledAt
      ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(order.scheduledAt))
      : "дата не указана";
    const orderSummary = `${order.serviceType}, ${order.city}${order.district ? ", " + order.district : ""}, ${order.area} м²`;

    let contacted = 0;
    const skippedAlready: string[] = [];

    for (const master of reachable) {
      // Dedup: don't ask the same master about the same order within 3 hours
      const fragment = `заказ #${orderId}`;
      const alreadyAsked = await alreadySentBotMessage(master.id, fragment, 3);
      if (alreadyAsked) {
        skippedAlready.push(master.alias);
        continue;
      }

      const msg = `${master.alias}, привет! 👋 По заказу #${orderId} всё ещё ищем мастера:

🔧 ${order.serviceType}
📍 ${order.city}${order.district ? ", " + order.district : ""}
📐 ${order.area} м²
📅 ${date}${order.comment ? "\n💬 " + order.comment : ""}

Сможешь взять? Ответь «да» или «не могу» 🙏`;

      await sendMaxMessage(master.maxChatId!, msg);
      await saveBotReply(master.id, master.maxChatId!, msg);

      // Track that we're waiting for a yes/no from this master about this order
      pendingOrderContacts.set(master.id, {
        orderId,
        orderSummary,
        sentAt: Date.now(),
      });

      contacted++;
    }

    const parts: string[] = [];
    if (contacted > 0) parts.push(`✅ Лично написал ${contacted} мастерам с вопросом "можете взять заказ #${orderId}?"`);
    if (skippedAlready.length > 0) parts.push(`⏭️ Пропустил (уже спрашивал недавно): ${skippedAlready.join(", ")}`);
    parts.push(`Жду ответов. Как только кто-то подтвердит — сообщу руководителю.`);

    return parts.join("\n");
  } catch (e) {
    console.error("[dispatcherAI] contactMastersAboutOrder error:", e);
    return `Ошибка при личном обращении к мастерам по заказу #${orderId}.`;
  }
}

/** Called when a master's pending order contact is resolved (yes or no) */
export function clearPendingOrderContact(masterId: number): void {
  pendingOrderContacts.delete(masterId);
}

/** Manager instructs the AI dispatcher to send a message/task to a master */
export async function sendTaskToMaster(masterNameOrId: string, task: string): Promise<string> {
  try {
    const allMasters = await db.select().from(mastersTable);
    const lower = masterNameOrId.toLowerCase();
    const master = allMasters.find(m =>
      String(m.id) === masterNameOrId ||
      m.alias.toLowerCase().includes(lower) ||
      (m.phone ?? "").includes(masterNameOrId),
    );
    if (!master) return `Мастер "${masterNameOrId}" не найден.`;
    if (!master.maxChatId) return `У мастера ${master.alias} нет подключённого Max — сообщение не отправить.`;

    // Build context and generate an appropriate message via GPT-4o
    const context = await buildMasterContext(master.id);
    const prompt = `Ты — AI-диспетчер. Менеджер поставил тебе задачу: "${task}".
Напиши сообщение мастеру ${master.alias} от лица диспетчера компании. Коротко, по делу, дружелюбно.
Контекст мастера: ${context}`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    const msg = resp.choices[0]?.message?.content?.trim();
    if (!msg) return "Не удалось сгенерировать сообщение.";

    await sendMaxMessage(master.maxChatId, msg);
    await saveBotReply(master.id, master.maxChatId, msg);

    // Track that manager is waiting for reply from this master
    pendingManagerTasks.set(master.id, { task, masterAlias: master.alias, sentAt: Date.now() });

    console.log(`[dispatcherAI] Manager task sent to ${master.alias}: ${task}`);
    return `✅ Отправлено мастеру ${master.alias}:\n\n"${msg}"\n\n⏳ Как только ${master.alias} ответит — я тебя уведомлю.`;
  } catch (e) {
    console.error("[dispatcherAI] sendTaskToMaster error:", e);
    return "Ошибка отправки сообщения.";
  }
}
