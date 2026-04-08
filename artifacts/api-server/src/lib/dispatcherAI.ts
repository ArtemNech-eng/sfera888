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

/** Timestamp of the last message the bot sent to each master (in-memory cooldown) */
const lastBotMessageAt = new Map<number, number>();
/** Timestamp of the last message received from each master (in-memory) */
const lastMasterReplyAt = new Map<number, number>();

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

/**
 * Returns true if the master has sent any message AFTER the given timestamp.
 * Used to skip proactive messages when master is already actively responding.
 */
async function masterRepliedAfter(masterId: number, sinceMs: number): Promise<boolean> {
  const since = new Date(sinceMs);
  const rows = await db.select({ id: masterMessagesTable.id })
    .from(masterMessagesTable)
    .where(and(
      eq(masterMessagesTable.masterId, masterId),
      eq(masterMessagesTable.fromMaster, true),
      gte(masterMessagesTable.createdAt, since),
    ))
    .limit(1);
  return rows.length > 0;
}

/**
 * Returns the timestamp of the last bot message sent to this master, or null.
 */
async function lastBotMessageTimestamp(masterId: number): Promise<number | null> {
  const rows = await db.select({ createdAt: masterMessagesTable.createdAt })
    .from(masterMessagesTable)
    .where(and(
      eq(masterMessagesTable.masterId, masterId),
      eq(masterMessagesTable.fromMaster, false),
    ))
    .orderBy(desc(masterMessagesTable.createdAt))
    .limit(1);
  return rows.length > 0 ? new Date(rows[0].createdAt).getTime() : null;
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

async function toolSearchOrdersByQuery(masterId: number, query: string): Promise<string> {
  try {
    // Search in orders for this master (any status, not deleted) by address/service/district
    const results = await db.execute(sql`
      SELECT o.id, o.status, o.service_type, o.city, o.district, o.address,
             o.scheduled_at, o.total_price, o.cancel_reason,
             l.name AS client_name, l.phone AS client_phone
      FROM orders o
      LEFT JOIN leads l ON l.id = o.lead_id
      WHERE o.master_id = ${masterId}
        AND o.deleted_at IS NULL
        AND (
          o.address ILIKE ${'%' + query + '%'}
          OR o.service_type ILIKE ${'%' + query + '%'}
          OR o.district ILIKE ${'%' + query + '%'}
          OR o.city ILIKE ${'%' + query + '%'}
          OR l.name ILIKE ${'%' + query + '%'}
          OR CAST(o.id AS text) = ${query.replace(/[^0-9]/g, '') || '0'}
        )
      ORDER BY o.created_at DESC
      LIMIT 5
    `);
    if (results.rows.length === 0) {
      return `По запросу «${query}» заказов не найдено. Уточните номер заказа или другие детали.`;
    }
    const STATUS_LABEL: Record<string, string> = {
      new: "новый", master_assigned: "назначен", in_progress: "в работе",
      completed: "завершён", cancelled: "отменён", pending_master: "поиск мастера",
    };
    const lines = (results.rows as any[]).map(r => {
      const status = STATUS_LABEL[r.status] ?? r.status;
      const client = r.client_name ? ` | клиент: ${r.client_name}${r.client_phone ? " " + r.client_phone : ""}` : "";
      const addr = [r.city, r.district, r.address].filter(Boolean).join(", ");
      const date = r.scheduled_at ? ` | дата: ${new Date(r.scheduled_at).toLocaleDateString("ru-RU")}` : "";
      const price = r.total_price ? ` | ${Number(r.total_price).toLocaleString("ru-RU")} ₽` : "";
      return `Заказ #${r.id} [${status}]: ${r.service_type}, ${addr}${client}${date}${price}`;
    });
    return `Найдено по «${query}»:\n${lines.join("\n")}`;
  } catch (e) {
    console.error("[dispatcherAI] searchOrders error:", e);
    return `Ошибка поиска по запросу «${query}».`;
  }
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
      name: "search_order_by_query",
      description: "Найти заказ(ы) мастера по адресу, названию улицы, имени клиента, типу работ или номеру. Используй ВСЕГДА когда мастер упоминает адрес, имя клиента или место, которого нет среди его активных заказов — никогда не угадывай и не делай предположений об ошибке адреса без проверки через этот инструмент.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Поисковый запрос: адрес, улица, имя клиента, тип работ или номер заказа. Например: 'Игнатова', 'Иванов', 'плитка', '42'",
          },
        },
        required: ["query"],
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
  maxChatId: string | null,
  text: string,
): Promise<void> {
  // Track that master replied — used by follow-up logic
  lastMasterReplyAt.set(masterId, Date.now());

  // Restore conversation history from DB on first contact after server restart
  await ensureSessionFromDb(masterId);

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

  // ── Pending order contact: detect YES / NO before calling GPT ──────────────
  const pendingContact = pendingOrderContacts.get(masterId);

  if (pendingContact) {
    const lower = text.toLowerCase();
    // Check rejection first — "не могу" contains "могу", so order matters
    const isNo = /не могу|не смогу|занят|не получится|далеко|не подойд|откажусь|отказываюсь|не возьму|не берусь|нет|пас/.test(lower);
    // Only consider as Yes if it's NOT also a No (prevents "не могу" triggering acceptance)
    const isYes = !isNo && /берусь|возьму|готов|могу|приеду|окей|хорошо|согласен|согласна|подтверждаю|(^|\s)ок(\s|$|,)|(^|\s)да(\s|$|,)/.test(lower);

    if (isNo) {
      // Master declined — clear pending immediately so no reminder fires
      pendingOrderContacts.delete(masterId);
      console.log(`[dispatcherAI] Master ${masterAlias} declined order #${pendingContact.orderId} — cleared pending contact`);
      // Mark dispatch as rejected in DB
      try {
        await db.update(orderDispatchesTable)
          .set({ status: "rejected", respondedAt: new Date() })
          .where(and(
            eq(orderDispatchesTable.orderId, pendingContact.orderId),
            eq(orderDispatchesTable.masterId, masterId),
          ));
      } catch (e) {
        console.error("[dispatcherAI] Failed to mark dispatch rejected:", e);
      }
    } else if (isYes && !isNo) {
      // Master accepted — the escalate_to_manager tool call will handle assignment,
      // but clear pending here too so no duplicate reminder fires if GPT doesn't call the tool
      pendingOrderContacts.delete(masterId);
      console.log(`[dispatcherAI] Master ${masterAlias} accepted order #${pendingContact.orderId} — cleared pending contact`);
    }
  }

  const stillPending = pendingOrderContacts.get(masterId); // may have been cleared above
  const pendingOrderSection = stillPending
    ? `\n\n⚠️ ОЖИДАЕМ ОТВЕТ ПО ЗАКАЗУ: ты уже написал этому мастеру по заказу #${stillPending.orderId} (${stillPending.orderSummary}) и ждёшь подтверждения.
Если мастер отвечает ДА (готов, могу, берусь, приеду, ок и т.п.) — вызови escalate_to_manager с текстом "МАСТЕР ГОТОВ ВЗЯТЬ ЗАКАЗ #${stillPending.orderId}: ${masterAlias} подтвердил готовность."
Если мастер отвечает НЕТ (не могу, занят, не получится) — поблагодари, больше не предлагай этот заказ.
Не задавай лишних вопросов — определи из ответа: согласен или нет.`
    : "";

  const nowStr = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  }).format(new Date());

  const systemPrompt = `Ты — AI-диспетчер ремонтного сервиса «Честный мастер». Ты общаешься с мастером ${masterAlias} от лица компании.
Сейчас: ${nowStr} (московское время).

Текущее состояние мастера:
${context}${pendingOrderSection}

━━━ СЦЕНАРИИ (строго следуй им) ━━━

**СЦЕНАРИЙ 1 — Мастер говорит, что созвонился с клиентом и договорился о замере/встрече:**
Признаки: мастер пишет "созвонились", "договорились", "встреча в [дата/день]", "приеду в [день]", "приедет [когда]"
→ Твой ответ: "Хорошо! Напишите нам как пройдёт замер, не забудьте составить смету через приложение — без неё следующие заказы не придут. 📋"
→ ОБЯЗАТЕЛЬНО вызови add_order_note: "Созвон с клиентом: договорились о замере [что сказал мастер]"
→ ОБЯЗАТЕЛЬНО вызови schedule_followup: запланируй вопрос "Как прошёл замер по заказу #N? Договорились об условиях?" на дату/время когда мастер едет на замер (если мастер сказал "в субботу" — вычисли сколько часов до ближайшей субботы 10:00 МСК)

**СЦЕНАРИЙ 2 — Мастер говорит, что клиент не берёт трубку / недоступен:**
Признаки: "не берёт трубку", "недоступен", "не отвечает", "не дозвонился", "сбросил", "занято"
→ Твой ответ: "Понял. Напишите нам как дозвонитесь и сообщите о результате звонка. 📞"
→ ОБЯЗАТЕЛЬНО вызови add_order_note: "Клиент не ответил на звонок, мастер перезвонит позже"

**СЦЕНАРИЙ 3 — Мастер сообщает, что замер прошёл успешно, договорились о работах:**
Признаки: "замер прошёл", "замерил", "замеры сделал", "договорились о работах", "клиент согласен", "начинаем", "берёмся"
→ Твой ответ: "Отлично! Пожалуйста, составьте смету в приложении и попросите клиента внести предоплату — это подтверждает заказ и защищает вас. Как только смета готова — дайте знать. 💰"
→ ОБЯЗАТЕЛЬНО вызови add_order_note: "Замер завершён: [что договорились]"

**СЦЕНАРИЙ 4 — Мастер сообщает о начале работ:**
Признаки: "начали работы", "приступили", "работаем", "начинаю сегодня", "начали"
→ Вызови set_order_in_progress
→ Твой ответ: "Отлично, зафиксировал! Когда завершите — не забудьте отметить в приложении и отправить смету клиенту."

**СЦЕНАРИЙ 5 — Серьёзная проблема (конфликт, травма, повреждение):**
→ Немедленно вызови escalate_to_manager

━━━ СЦЕНАРИЙ 6 — Мастер говорит «Да», «Ок», «Хорошо», «Понял», «Принял» или любое другое подтверждение:
→ Это ответ на твоё предыдущее сообщение. Если контекст ясен из истории — ответь кратко: "Отлично! Ждём новостей 👍" или "Хорошо, будем на связи." НЕ задавай «Уточните, о чём речь» — это раздражает мастера.
→ Если твоё предыдущее сообщение было про смету — ответь: "Отлично! Как отправите — дайте знать 📋"
→ Если история недоступна — ответь нейтрально: "Хорошо, ждём вестей! 👍"

━━━ ПРАВИЛО ПОИСКА ЗАКАЗОВ (КРИТИЧНО) ━━━
Если мастер упоминает адрес, улицу, имя клиента или место, которого НЕТ среди его активных заказов в контексте:
→ СНАЧАЛА вызови search_order_by_query с этим ключевым словом
→ Только ПОСЛЕ получения результатов — отвечай мастеру
→ НИКОГДА не говори мастеру «у вас возможно ошибка в адресе» без проверки
→ НИКОГДА не предполагай что мастер имеет в виду конкретный заказ без поиска

━━━ ОБЩИЕ ПРАВИЛА ━━━
- Пиши коротко — ты в мессенджере, не пиши длинные тексты
- Один вопрос за раз, не перегружай мастера
- Называй заказ по номеру (#N)
- Если мастер написал что-то важное — СНАЧАЛА сохрани через tool, ПОТОМ ответи
- Если мастер называет конкретный срок — ВСЕГДА вызывай schedule_followup
- Если узнал что-то устойчивое о мастере (паттерн поведения, предпочтение) — сохрани через save_memory
- При schedule_followup: пиши question конкретно ("Как прошёл замер по заказу #N? Договорились?"), hoursFromNow вычисляй исходя из текущего времени (${nowStr})`;

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
        } else if (fnName === "search_order_by_query") {
          toolResult = await toolSearchOrdersByQuery(masterId, args.query);
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
        if (maxChatId) await sendMaxMessage(maxChatId, reply);
        await saveBotReply(masterId, maxChatId, reply);
      }
    } else {
      const reply = assistantMsg.content ?? "";
      if (reply) {
        addToHistory(masterId, { role: "assistant", content: reply });
        if (maxChatId) await sendMaxMessage(maxChatId, reply);
        await saveBotReply(masterId, maxChatId, reply);
      }
    }
  } catch (e) {
    console.error("[dispatcherAI] AI error:", e);
    const fallback = "Принял, передам оператору. Если срочно — позвоните нам.";
    if (maxChatId) await sendMaxMessage(maxChatId, fallback);
    await saveBotReply(masterId, maxChatId, fallback);
  } finally {
    persistSession(masterId);
  }
}

// Save bot reply to CRM chat for visibility + track timing for follow-ups
async function saveBotReply(masterId: number, maxChatId: string | null, text: string) {
  lastBotMessageAt.set(masterId, Date.now());
  const telegramChatId = maxChatId ? `max_${maxChatId}` : `pwa_${masterId}`;
  // Do NOT silently swallow errors — if we can't save, the dedup guard won't work
  // on the next proactive check cycle and the message will be re-sent.
  await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId,
    text: `[ИИ-диспетчер]: ${text}`,
    fromMaster: false,
    senderName: "Диспетчер",
    isRead: true,
  }).catch((e) => {
    console.error(`[dispatcherAI] saveBotReply FAILED for master ${masterId} — message was sent but NOT recorded, guard will re-send next cycle:`, e);
    throw e; // Re-throw so the caller knows the save failed
  });
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

  try {
    await sendMaxMessage(maxChatId, msg);
    await saveBotReply(masterId, maxChatId, msg);
    console.log(`[dispatcherAI] Sent assignment greeting to ${masterAlias} for order #${orderId}`);
  } catch (e) {
    console.error(`[dispatcherAI] Failed to send/save assignment greeting for order #${orderId}:`, e);
  }
}

/** 24h check-in after assignment */
export async function sendDailyCheckin(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  if (await alreadySentBotMessage(masterId, `объекте по заказу #${orderId}`)) return;

  const msg = `Привет, ${masterAlias}! Как дела на объекте по заказу #${orderId}? Всё идёт по плану? 😊`;
  try {
    await sendMaxMessage(maxChatId, msg);
    await saveBotReply(masterId, maxChatId, msg);
    console.log(`[dispatcherAI] Sent 24h check-in to ${masterAlias} for order #${orderId}`);
  } catch (e) {
    console.error(`[dispatcherAI] Failed to send/save daily check-in for order #${orderId}:`, e);
  }
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
  try {
    await sendMaxMessage(maxChatId, msg);
    await saveBotReply(masterId, maxChatId, msg);
    console.log(`[dispatcherAI] Sent estimate reminder to ${masterAlias} for order #${orderId}`);
  } catch (e) {
    console.error(`[dispatcherAI] Failed to send/save estimate reminder for order #${orderId}:`, e);
  }
}

/** 15-min post-assignment: did you call the client? */
export async function sendClientCallCheckin(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  // Guard 1: already sent this exact question → skip
  if (await alreadySentBotMessage(masterId, `созвонились с клиентом по заказу #${orderId}`)) return;

  // Guard 2: master has already replied to a bot message → they're in active dialogue, skip
  const lastBotMs = await lastBotMessageTimestamp(masterId);
  if (lastBotMs && await masterRepliedAfter(masterId, lastBotMs)) {
    console.log(`[dispatcherAI] Skipping check-in for order #${orderId} — master ${masterAlias} already replied to bot`);
    return;
  }

  const msg = `${masterAlias}, вы уже созвонились с клиентом по заказу #${orderId}? Напишите — о чём договорились, на какое время согласовали визит. Это важно для координации работ. 📞`;
  try {
    await sendMaxMessage(maxChatId, msg);
    await saveBotReply(masterId, maxChatId, msg);
    console.log(`[dispatcherAI] Sent client call check-in to ${masterAlias} for order #${orderId}`);
  } catch (e) {
    console.error(`[dispatcherAI] Failed to send/save check-in for order #${orderId}:`, e);
  }
}

/** Ask if work is completed — sent 6h after scheduledAt if still in_progress */
export async function sendCompletionCheck(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  if (await alreadySentBotMessage(masterId, `заказу #${orderId} завершены?`, 48)) return;

  const msg = `${masterAlias}, как прошли работы по заказу #${orderId}? Всё завершено? Если да — отметьте заказ как выполненный в приложении и не забудьте попросить клиента оставить отзыв. 🏁`;
  try {
    await sendMaxMessage(maxChatId, msg);
    await saveBotReply(masterId, maxChatId, msg);
    console.log(`[dispatcherAI] Sent completion check to ${masterAlias} for order #${orderId}`);
  } catch (e) {
    console.error(`[dispatcherAI] Failed to send/save completion check for order #${orderId}:`, e);
  }
}

/** Ask master to collect client feedback after order is marked completed */
export async function sendFeedbackRequest(
  masterId: number,
  masterAlias: string,
  maxChatId: string,
  orderId: number,
) {
  if (await alreadySentBotMessage(masterId, `отзыв по заказу #${orderId}`)) return;

  const msg = `Отлично, ${masterAlias}! Заказ #${orderId} завершён. 🎉\n\nПожалуйста, попросите клиента оставить короткий отзыв — это помогает вам получать больше заказов. Можно просто сфотографировать результат и попросить написать пару слов.\n\nСпасибо за работу! 👏`;
  try {
    await sendMaxMessage(maxChatId, msg);
    await saveBotReply(masterId, maxChatId, msg);
    console.log(`[dispatcherAI] Sent feedback request to ${masterAlias} for order #${orderId}`);
  } catch (e) {
    console.error(`[dispatcherAI] Failed to send/save feedback request for order #${orderId}:`, e);
  }
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
  try {
    await sendMaxMessage(maxChatId, msg);
    await saveBotReply(masterId, maxChatId, msg);
    console.log(`[dispatcherAI] Sent pre-day reminder to ${masterAlias} for order #${orderId}`);
  } catch (e) {
    console.error(`[dispatcherAI] Failed to send/save pre-day reminder for order #${orderId}:`, e);
  }
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
      // Mark as sent FIRST (prevents race condition if scheduler fires twice before DB write)
      await db.update(dispatcherFollowupsTable)
        .set({ sent: true })
        .where(eq(dispatcherFollowupsTable.id, followup.id));

      const master = await db.select().from(mastersTable)
        .where(eq(mastersTable.id, followup.masterId))
        .then(r => r[0]);

      if (!master?.maxChatId) {
        console.log(`[dispatcherAI] Skipping follow-up #${followup.id} — master has no Max account`);
        continue;
      }

      // Skip if master has already replied to the bot since this follow-up was scheduled
      // (means they've already addressed the topic through the active dialogue)
      const followupCreatedMs = new Date(followup.createdAt ?? followup.followupAt).getTime();
      if (await masterRepliedAfter(master.id, followupCreatedMs)) {
        console.log(`[dispatcherAI] Skipping follow-up #${followup.id} — master ${master.alias} already replied since follow-up was scheduled`);
        continue;
      }

      try {
        await sendMaxMessage(master.maxChatId, followup.question);
        await saveBotReply(master.id, master.maxChatId, followup.question);
        console.log(`[dispatcherAI] Sent scheduled follow-up #${followup.id} to ${master.alias}`);
      } catch (e) {
        console.error(`[dispatcherAI] Failed to send follow-up #${followup.id} to ${master.alias}:`, e);
        // Already marked as sent — won't retry automatically. Log for manual review.
      }
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

      // 1b. Client call check-in — send 30+ min after assignment
      if (hoursAssigned >= 0.5) {
        await sendClientCallCheckin(master.id, master.alias, master.maxChatId, order.id);
      }

      // 2. Estimate reminder — 6h+ after assignment, no estimate submitted yet
      if (hoursAssigned >= 6) {
        const receipts = await db.select({ id: receiptsTable.id })
          .from(receiptsTable)
          .where(eq(receiptsTable.orderId, order.id));
        if (receipts.length === 0) {
          await sendEstimateReminder(master.id, master.alias, master.maxChatId, order.id);
        }
      }

      // 3. Pre-day reminder — 12–24h before scheduled visit
      if (order.scheduledAt) {
        const scheduledMs = new Date(order.scheduledAt).getTime();
        const hoursUntil = (scheduledMs - now) / 3600000;
        if (hoursUntil >= 12 && hoursUntil <= 24) {
          await sendPreDayReminder(master.id, master.alias, master.maxChatId, order.id);
        }
      }

      // 4. Completion check — 6h+ after scheduledAt and order still in_progress
      if (order.scheduledAt && order.status === "in_progress") {
        const scheduledMs = new Date(order.scheduledAt).getTime();
        const hoursAfterScheduled = (now - scheduledMs) / 3600000;
        if (hoursAfterScheduled >= 6) {
          await sendCompletionCheck(master.id, master.alias, master.maxChatId, order.id);
        }
      }

      // 5. Ghost master check — 12h+ after assignment, no reply at all
      if (hoursAssigned >= 12) {
        await detectGhostMaster(
          { id: master.id, alias: master.alias, maxChatId: master.maxChatId },
          order.id,
          hoursAssigned,
        );
      }
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
// Process-level lock: prevent simultaneous contactMasters calls for the same order
const _contactingOrders = new Set<number>();

export async function contactMastersAboutOrder(orderId: number): Promise<string> {
  if (_contactingOrders.has(orderId)) {
    console.log(`[dispatcherAI] contactMastersAboutOrder #${orderId} already in progress — skipping`);
    return `Заказ #${orderId} уже обрабатывается.`;
  }
  _contactingOrders.add(orderId);
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
  } finally {
    _contactingOrders.delete(orderId);
  }
}

/** Called when a master's pending order contact is resolved (yes or no) */
export function clearPendingOrderContact(masterId: number): void {
  pendingOrderContacts.delete(masterId);
}

/** Manager instructs the AI dispatcher to send a message/task to a master */
export async function sendTaskToMaster(masterNameOrId: string, task: string): Promise<string> {
  try {
    const allMasters = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt));
    const lower = masterNameOrId.toLowerCase();
    // Prefer exact ID match first, then alias, then phone
    const master =
      allMasters.find(m => String(m.id) === masterNameOrId) ??
      allMasters.find(m => m.alias.toLowerCase().includes(lower)) ??
      allMasters.find(m => (m.phone ?? "").includes(masterNameOrId));
    console.log(`[dispatcherAI] sendTaskToMaster lookup "${masterNameOrId}" → ${master ? `#${master.id} ${master.alias} maxChatId=${master.maxChatId}` : "not found"}`);
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
