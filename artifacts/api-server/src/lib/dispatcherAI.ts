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
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, masterMessagesTable, dispatcherFollowupsTable, botMemoryTable, orderDispatchesTable, systemSettingsTable, walletTransactionsTable } from "@workspace/db";
import { eq, and, isNull, inArray, lte, desc, gte, ilike, sql } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";
import { sendMsg as sendManagerMsg, getManagerUserId, injectNotification } from "../managerBot.js";

const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const openaiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openaiModel = process.env.AI_INTEGRATIONS_OPENAI_MODEL || "claude-opus-4-7";

const openai = openaiApiKey
  ? new OpenAI({
      apiKey: openaiApiKey,
      baseURL: openaiBaseURL,
    })
  : null;

function requireOpenAI(): OpenAI {
  if (!openai) {
    throw new Error(
      "OpenAI is not configured. Set AI_INTEGRATIONS_OPENAI_API_KEY (and optionally AI_INTEGRATIONS_OPENAI_BASE_URL).",
    );
  }
  return openai;
}

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

/** Minimum interval (ms) between proactive bot messages to the same master — prevents duplicates */
const PROACTIVE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes — guards against restart-induced duplicates

/**
 * Returns true if the bot sent any message to this master within the last `withinMs` milliseconds.
 * Checks DB (survives server restarts) — used as a guard before sending proactive messages.
 */
async function botSentRecently(masterId: number, withinMs: number): Promise<boolean> {
  // Fast in-memory check first
  const lastSent = lastBotMessageAt.get(masterId);
  if (lastSent && (Date.now() - lastSent) < withinMs) return true;
  // DB check (survives restarts)
  const since = new Date(Date.now() - withinMs);
  const rows = await db.select({ id: masterMessagesTable.id })
    .from(masterMessagesTable)
    .where(and(
      eq(masterMessagesTable.masterId, masterId),
      eq(masterMessagesTable.fromMaster, false),
      gte(masterMessagesTable.createdAt, since),
    ))
    .limit(1);
  return rows.length > 0;
}

/**
 * In-memory send locks — prevents race conditions when the scheduler fires
 * while a previous cycle is still awaiting sendMaxMessage / saveBotReply.
 * Key format: "<type>:<masterId>:<orderId>"
 */
const sendLocks = new Set<string>();

function withSendLock(key: string, fn: () => Promise<void>): Promise<void> {
  if (sendLocks.has(key)) {
    console.log(`[dispatcherAI] Lock active for "${key}" — skipping concurrent send`);
    return Promise.resolve();
  }
  sendLocks.add(key);
  return fn().finally(() => sendLocks.delete(key));
}

/** Prevents overlapping proactive check cycles */
let proactiveChecksRunning = false;

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

/** Check if AI dispatcher is globally enabled. Defaults to true when not set. */
export async function isAiDispatcherEnabled(): Promise<boolean> {
  try {
    const rows = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "ai_dispatcher_enabled"));
    return rows[0] ? rows[0].value === "true" : true;
  } catch (e) {
    console.error("[dispatcherAI] isAiDispatcherEnabled error:", e);
    return true; // fail-open
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

// ─── Quiet hours (21:00–08:00 local time; weekends before 10:00) ─────────────
// AI dispatcher does NOT send proactive messages to masters during night hours.
// Responses to master-initiated messages are always allowed.

const QUIET_START         = 21; // 21:00 local time — begin quiet
const QUIET_END           = 8;  // 08:00 local time — end quiet
const WEEKEND_QUIET_UNTIL = 10; // 10:00 — don't bother on Sat/Sun before this hour

const CITY_UTC_OFFSETS: Record<string, number> = {
  "Калининград": 2,
  "Москва": 3, "Санкт-Петербург": 3, "Питер": 3, "СПб": 3,
  "Краснодар": 3, "Ростов-на-Дону": 3, "Ростов": 3,
  "Воронеж": 3, "Нижний Новгород": 3, "Нижний": 3,
  "Казань": 3, "Самара": 3, "Волгоград": 3, "Саратов": 3,
  "Тверь": 3, "Ярославль": 3, "Рязань": 3, "Тула": 3,
  "Брянск": 3, "Орёл": 3, "Орел": 3, "Липецк": 3,
  "Тамбов": 3, "Белгород": 3, "Курск": 3, "Смоленск": 3,
  "Владимир": 3, "Иваново": 3, "Кострома": 3,
  "Пенза": 3, "Ульяновск": 3, "Чебоксары": 3, "Саранск": 3,
  "Псков": 3, "Великий Новгород": 3, "Вологда": 3,
  "Мурманск": 3, "Петрозаводск": 3, "Архангельск": 3,
  "Сыктывкар": 3, "Ставрополь": 3, "Махачкала": 3,
  "Владикавказ": 3, "Нальчик": 3, "Черкесск": 3, "Майкоп": 3,
  "Астрахань": 3, "Элиста": 3,
  "Ижевск": 4, "Оренбург": 4,
  "Екатеринбург": 5, "Пермь": 5, "Челябинск": 5, "Тюмень": 5,
  "Уфа": 5, "Магнитогорск": 5, "Курган": 5,
  "Омск": 6,
  "Новосибирск": 7, "Красноярск": 7, "Кемерово": 7,
  "Новокузнецк": 7, "Барнаул": 7, "Томск": 7,
  "Горно-Алтайск": 7, "Абакан": 7,
  "Иркутск": 8, "Улан-Удэ": 8, "Чита": 9,
  "Якутск": 9,
  "Владивосток": 10, "Хабаровск": 10,
  "Южно-Сахалинск": 11,
  "Петропавловск-Камчатский": 12, "Анадырь": 12,
};

function getMasterOffset(city?: string | null): number {
  const c = (city ?? "").trim();
  if (!c) return 3; // default Moscow
  const key = Object.keys(CITY_UTC_OFFSETS).find(
    k => c.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(c.toLowerCase())
  );
  return key ? CITY_UTC_OFFSETS[key] : 3;
}

function getMasterLocalHour(city?: string | null): number {
  const nowLocal = new Date(Date.now() + getMasterOffset(city) * 3_600_000);
  return nowLocal.getUTCHours();
}

function getMasterLocalDate(city?: string | null): Date {
  return new Date(Date.now() + getMasterOffset(city) * 3_600_000);
}

/** Returns greeting based on local hour: Доброе утро / Добрый день / Добрый вечер */
function getTimeGreeting(city?: string | null): string {
  const h = getMasterLocalHour(city);
  if (h >= 8 && h < 12) return "Доброе утро";
  if (h >= 12 && h < 17) return "Добрый день";
  if (h >= 17 && h < 21) return "Добрый вечер";
  return "Добрый день";
}

/** Returns true if it is quiet time (21:00–08:00, or weekend before 10:00) for the master's city. */
function isQuietHours(city?: string | null): boolean {
  const h = getMasterLocalHour(city);
  if (h >= QUIET_START || h < QUIET_END) return true; // night hours

  // Weekends: don't bother before 10:00
  const localDate = getMasterLocalDate(city);
  const dayOfWeek = localDate.getUTCDay(); // 0=Sun, 6=Sat
  if ((dayOfWeek === 0 || dayOfWeek === 6) && h < WEEKEND_QUIET_UNTIL) return true;

  return false;
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
 * Returns true if the master already mentioned a topic (by keyword) in their
 * messages within the last `withinHours` hours.
 * Used to skip proactive reminders when the master already addressed the topic.
 */
async function masterAlreadyMentioned(
  masterId: number,
  keywords: string[],
  withinHours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - withinHours * 3600_000);
  for (const kw of keywords) {
    const rows = await db.select({ id: masterMessagesTable.id })
      .from(masterMessagesTable)
      .where(and(
        eq(masterMessagesTable.masterId, masterId),
        eq(masterMessagesTable.fromMaster, true),
        gte(masterMessagesTable.createdAt, since),
        ilike(masterMessagesTable.text, `%${kw}%`),
      ))
      .limit(1);
    if (rows.length > 0) return true;
  }
  return false;
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
      return `В ваших заказах по запросу «${query}» ничего не найдено. ВАЖНО: это означает только то, что в списке заказов этого мастера нет совпадений — заказ может существовать в системе, но быть назначен другому мастеру или ещё не закреплён. Не говори мастеру что "заказа нет" — предложи уточнить номер заказа или написать оператору.`;
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

// ─── Build context summary for system prompt ─────────────────────────────────

async function buildMasterContext(masterId: number): Promise<string> {
  const orders = await getMasterActiveOrders(masterId);

  // Fetch master financial data from DB — single source of truth
  const masterRow = await db.select({
    debt: mastersTable.debt,
    alias: mastersTable.alias,
  }).from(mastersTable).where(eq(mastersTable.id, masterId)).then(r => r[0]);
  const debtAmount = Number(masterRow?.debt ?? 0);

  const sections: string[] = [];

  // Financial summary (always include so AI never has to calculate/guess)
  if (debtAmount > 0) {
    sections.push(`Финансы мастера:\n  • Текущий долг по комиссии: ${debtAmount.toLocaleString("ru-RU")} ₽ (точная сумма из системы — НЕ складывай с другими числами)`);
  } else {
    sections.push(`Финансы мастера:\n  • Долг по комиссии: 0 ₽ (задолженности нет)`);
  }

  if (orders.length === 0) {
    sections.push("Активных заказов нет.");
  } else {
    const fmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

    const orderLines = await Promise.all(orders.map(async o => {
      const scheduledStr = o.scheduledAt ? fmt.format(new Date(o.scheduledAt)) : "дата не указана";
      const ageH = Math.round((Date.now() - new Date(o.assignedAt ?? o.createdAt).getTime()) / 3600000);
      const statusLabel: Record<string, string> = {
        master_assigned: "назначен", in_progress: "в работе",
      };

      // Client info from lead
      let clientInfo = "";
      if (o.leadId) {
        const lead = await db.select({ name: leadsTable.clientName, phone: leadsTable.clientPhone })
          .from(leadsTable).where(eq(leadsTable.id, o.leadId)).then(r => r[0]);
        if (lead) clientInfo = `\n    Клиент: ${lead.name || "—"}, тел: ${lead.phone || "—"}`;
      }

      // Estimate / receipt status
      const receipts = await db.select({ id: receiptsTable.id, totalAmount: receiptsTable.totalAmount })
        .from(receiptsTable).where(eq(receiptsTable.orderId, o.id));
      const estimateStr = receipts.length > 0
        ? `смета ${Number(receipts[0].totalAmount).toLocaleString("ru-RU")} ₽`
        : "смета НЕ отправлена";

      // Order notes stored in operatorNote field
      const notesStr = o.operatorNote
        ? `\n    Заметки: ${o.operatorNote.substring(0, 400)}`
        : "";

      const addr = [o.city, o.district].filter(Boolean).join(", ");
      const line = `• Заказ #${o.id} [${statusLabel[o.status] ?? o.status}]: ${o.serviceType}` +
        `\n    Адрес: ${addr}, ${o.area} м²` +
        clientInfo +
        `\n    Дата работ: ${scheduledStr} | Назначен ${ageH}ч назад | ${estimateStr}` +
        notesStr;
      return line;
    }));

    sections.push(`Активные заказы (${orders.length}):\n${orderLines.join("\n")}`);
  }

  // Pending scheduled follow-ups (so AI doesn't double-schedule)
  const pendingFollowups = await db.select().from(dispatcherFollowupsTable)
    .where(and(
      eq(dispatcherFollowupsTable.masterId, masterId),
      eq(dispatcherFollowupsTable.sent, false),
    ));
  if (pendingFollowups.length > 0) {
    const fmt2 = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
    const fLines = pendingFollowups.map(f =>
      `  • ${fmt2.format(new Date(f.followupAt))}: "${f.question}"${f.context ? ` [мастер обещал: ${f.context}]` : ""}`,
    );
    sections.push(`Уже запланированные напоминания (${pendingFollowups.length}) — НЕ дублируй их:\n${fLines.join("\n")}`);
  }

  // Recent messages from master (last 48h, outside current session — for cross-session context)
  const since48h = new Date(Date.now() - 48 * 3600_000);
  const recentMsgs = await db.select({
    text: masterMessagesTable.text,
    fromMaster: masterMessagesTable.fromMaster,
    createdAt: masterMessagesTable.createdAt,
  })
    .from(masterMessagesTable)
    .where(and(
      eq(masterMessagesTable.masterId, masterId),
      gte(masterMessagesTable.createdAt, since48h),
    ))
    .orderBy(desc(masterMessagesTable.createdAt))
    .limit(10);
  if (recentMsgs.length > 0) {
    const fmtMsg = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
    const msgLines = recentMsgs.reverse().map(m => {
      const who = m.fromMaster ? "Мастер" : "Диспетчер";
      return `  [${fmtMsg.format(new Date(m.createdAt))}] ${who}: ${m.text.replace(/^\[ИИ-диспетчер\]: /, "").substring(0, 200)}`;
    });
    sections.push(`Переписка за последние 48ч (для контекста):\n${msgLines.join("\n")}`);
  }

  // Persistent memory about this master
  const memories = await db.select().from(botMemoryTable)
    .where(eq(botMemoryTable.masterId, masterId))
    .orderBy(botMemoryTable.updatedAt);
  if (memories.length > 0) {
    const memLines = memories.map(m => `  [${m.category}] ${m.content}`);
    sections.push(`Что известно об этом мастере (из прошлых бесед):\n${memLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

// ─── GPT-4o tool definitions ─────────────────────────────────────────────────

const DISPATCHER_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "add_order_note",
      description: "Сохранить важную информацию от мастера в CRM (жалоба, срок, уточнение, статус)",
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
      name: "escalate_to_manager",
      description: "Немедленно уведомить руководителя о прямом запросе на возврат токена или техническом сбое",
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

  // Skip if AI dispatcher is globally disabled
  if (!(await isAiDispatcherEnabled())) {
    console.log(`[dispatcherAI] AI dispatcher is globally disabled — skipping message from ${masterAlias}`);
    return;
  }

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
  // Restore from DB if in-memory state was lost (server restart between send and reply)
  let pendingContact = pendingOrderContacts.get(masterId);
  if (!pendingContact) {
    const since = new Date(Date.now() - 48 * 3600_000);
    const dbSent = await db.select()
      .from(orderDispatchesTable)
      .where(and(
        eq(orderDispatchesTable.masterId, masterId),
        eq(orderDispatchesTable.status, "sent"),
        gte(orderDispatchesTable.createdAt, since),
      ))
      .orderBy(desc(orderDispatchesTable.createdAt))
      .limit(1);
    if (dbSent.length > 0) {
      const d = dbSent[0];
      const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, d.orderId));
      if (orderRows.length > 0) {
        const o = orderRows[0];
        const summary = `${o.serviceType || "работы"} в ${o.city || ""}${o.district ? ", " + o.district : ""}`;
        pendingContact = { orderId: d.orderId, orderSummary: summary, sentAt: d.createdAt.getTime() };
        pendingOrderContacts.set(masterId, pendingContact);
        console.log(`[dispatcherAI] Restored pending contact from DB for master ${masterAlias}: order #${d.orderId}`);
      }
    }
  }

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

  const systemPrompt = `Ты — ИИ-ассистент поддержки сервисной платформы «Честный Мастер».
Ты пишешь мастеру ${masterAlias} в мессенджере от лица платформы.
Сейчас: ${nowStr} (московское время).

═══ ДАННЫЕ МАСТЕРА ═══
${context}${pendingOrderSection}

═══ ГЛАВНЫЙ ПРИНЦИП ═══
Платформа работает по токеновой модели. Мастер самостоятельно покупает доступ к заявкам.
Мы — НЕ контролирующий орган. Мы — техническая поддержка.
Твоя задача: отвечать на вопросы, фиксировать информацию от мастера в заметки к заказу и направлять в приложение по всем финансовым вопросам.

═══ КРИТИЧЕСКИЕ ПРАВИЛА (НЕПРИКОСНОВЕННЫ) ═══
1. НИКОГДА не предлагай возврат токена первым.
2. НИКОГДА не упоминай слова «арбитраж», «возврат», «вернуть деньги», «компенсация», пока мастер сам ПРЯМО не спросит: «Как мне вернуть токен?» или «Верните мне деньги».
3. Если мастер жалуется на клиента, просто принимай информацию: «Понял тебя», «Информацию зафиксировал».
4. Общайся на «ты», коротко, по делу.

════════════════════════════════════
СЦЕНАРИИ ПОДДЕРЖКИ
════════════════════════════════════

[СЦ-1] Мастер ЖАЛУЕТСЯ на клиента (не берет трубку, неадекватен, отменился)
Признаки: «не отвечает», «не дозвонился», «клиент передумал», «ложный вызов».
Действия:
→ add_order_note(orderId, "Жалоба мастера: [текст жалобы]")
→ Ответ:
«Понял тебя. Информацию в систему внес. Попробуй набрать клиента еще раз позже. На связи �»

[СЦ-2] Мастер ПРЯМО спрашивает: «Как мне вернуть токен?» или требует возврат
Признаки: «верните токен», «как сделать возврат», «сделайте отмену со списанием».
Действия:
→ escalate_to_manager("Прямой запрос на возврат токена по заказу #...", orderId)
→ Ответ:
«Принял запрос. Передал на проверку администратору. О результатах сообщу здесь же или увидишь обновление в приложении.»

[СЦ-3] Мастер не договорился на замере (дорого/не сошлись)
Признаки: «съездил, клиенту дорого», «не договорились по цене», «не мой объем».
Действия:
→ add_order_note(orderId, "Замер без сделки: [причина]")
→ Ответ:
«Понял. Бывает и такое. Удачи со следующими заявками в ленте!»

[СЦ-4] Вопросы по балансу / Не может взять заказ / Минус
Признаки: «почему кнопка не жмется», «как пополнить», «какой пакет взять».
Ответ:
«Все управление балансом, покупка пакетов и лимиты находятся в приложении, в разделе 'Кошелёк'. Там всё настраивается в пару кликов.»

[СЦ-5] Напоминание об отрицательном балансе (Системное)
Действие:
→ Ответ:
«Привет! Твой баланс токенов сейчас отрицательный. Чтобы иметь приоритет в ленте и не потерять доступ к новым заказам, пополни кошелёк в приложении. Удачной работы!»

[СЦ-6] Вопросы по старым долгам (Комиссия %)
Ответ:
«По старым заказам вся информация в приложении. Там висят суммы и реквизиты для оплаты. Закрой хвосты, чтобы полностью перейти на новую систему.»

[СЦ-7] Технические сбои
Действия:
→ escalate_to_manager("Техническая ошибка у мастера", null)
→ Ответ:
«Принял. Передал технарям, уже разбираемся. Если горит — напиши номер заказа сюда текстом.»

[СЦ-8] Мастер просто информирует («Ок», «Взял», «Работаю», «Сдал»)
Действия:
→ Если есть инфа по заказу: add_order_note(orderId, "Мастер сообщил: [текст]")
→ Ответ: «Принято 👍» или «Хорошо, работаем.»

════════════════════════════════════
ПРАВИЛА ПОИСКА
════════════════════════════════════
Если мастер называет адрес или имя, которых нет в текущей переписке:
→ Сначала search_order_by_query(query).
→ Если не нашел: «В твоих активных заказах этот объект не вижу. Уточни номер заказа, посмотрю подробнее.»

════════════════════════════════════
ТЕХНИЧЕСКИЕ ПРАВИЛА
════════════════════════════════════
- Сначала инструмент → потом текстовый ответ.
- orderId: если заказ один — используй его. Если несколько — уточни ОДИН вопрос: «По какому заказу?»
- Пиши на ты, коротко, по-деловому, без лишних слов.
- hoursFromNow считай от текущего времени (${nowStr}).`;

  await ensureSessionFromDb(masterId);

  await ensureSessionFromDb(masterId);
  addToHistory(masterId, { role: "user", content: text });

  try {
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...getHistory(masterId),
    ];

    const response = await requireOpenAI().chat.completions.create({
      model: openaiModel,
      messages,
      tools: DISPATCHER_TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 900,
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
        } else if (fnName === "escalate_to_manager") {
          toolResult = await toolEscalateToManager(args.message, masterId, args.orderId);
        } else if (fnName === "search_order_by_query") {
          toolResult = await toolSearchOrdersByQuery(masterId, args.query);
        }

        addToHistory(masterId, { role: "tool", content: toolResult, tool_call_id: tc.id, name: fnName });
      }

      const followUp = await requireOpenAI().chat.completions.create({
        model: openaiModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...getHistory(masterId),
        ],
        temperature: 0.3,
        max_tokens: 600,
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

// ─── Smart proactive messaging ────────────────────────────────────────────────
//
// Instead of sending fixed templates, GPT-4o reads the full conversation
// history and decides: (a) should we even send a message? (b) what to say?
// Dedup is stored in bot_memory (category "proactive_sent") so it survives
// server restarts and doesn't rely on text-fragment matching.

async function proactiveAlreadySent(
  masterId: number,
  type: string,
  orderId: number,
  withinHours: number,
): Promise<boolean> {
  const key = `${type}:${orderId}`;
  const cutoff = new Date(Date.now() - withinHours * 3600_000);
  // Use eq (exact match) instead of ilike — ilike without wildcards can miss records
  // due to collation differences or unexpected whitespace in stored keys
  const rows = await db.select({ id: botMemoryTable.id, updatedAt: botMemoryTable.updatedAt })
    .from(botMemoryTable)
    .where(and(
      eq(botMemoryTable.masterId, masterId),
      eq(botMemoryTable.category, "proactive_sent"),
      eq(botMemoryTable.content, key),
    ))
    .limit(1);
  return rows.length > 0 && new Date(rows[0].updatedAt) > cutoff;
}

async function markProactiveSent(masterId: number, type: string, orderId: number) {
  const key = `${type}:${orderId}`;
  const existing = await db.select({ id: botMemoryTable.id })
    .from(botMemoryTable)
    .where(and(
      eq(botMemoryTable.masterId, masterId),
      eq(botMemoryTable.category, "proactive_sent"),
      eq(botMemoryTable.content, key),
    ))
    .limit(1);
  if (existing.length > 0) {
    await db.update(botMemoryTable).set({ updatedAt: new Date() }).where(eq(botMemoryTable.id, existing[0].id));
  } else {
    await db.insert(botMemoryTable).values({ masterId, category: "proactive_sent", content: key });
  }
}

// ─── Escalation helpers ───────────────────────────────────────────────────────

/** Escalate to manager when master hasn't replied to any bot message in 24h */
async function escalate24hNoResponse(
  master: { id: number; alias: string; maxChatId: string; city?: string | null },
  orderId: number,
  hoursAssigned: number,
): Promise<void> {
  try {
    const key = `escalate_24h_no_response:${orderId}`;
    const already = await db.select({ id: botMemoryTable.id })
      .from(botMemoryTable)
      .where(and(
        eq(botMemoryTable.masterId, master.id),
        eq(botMemoryTable.category, "proactive_sent"),
        ilike(botMemoryTable.content, key),
      ))
      .limit(1);
    if (already.length > 0) return; // Already escalated

    // Only fire if there was a bot message that went unanswered for 24h+
    const lastBot = lastBotMessageAt.get(master.id);
    const lastReply = lastMasterReplyAt.get(master.id);
    if (!lastBot) return; // Bot never wrote — no escalation needed

    const botMsgAgeH = (Date.now() - lastBot) / 3_600_000;
    if (botMsgAgeH < 24) return; // Last bot message was less than 24h ago

    // Master replied after last bot message — no issue
    if (lastReply && lastReply >= lastBot) return;

    const managerId = getManagerUserId();
    if (!managerId) return;

    const alert = `⚠️ Заказ #${orderId} / Мастер: ${master.alias}\n\nМастер не отвечает на сообщения диспетчера уже ${Math.round(botMsgAgeH)} часов. Назначен ${Math.round(hoursAssigned)} ч назад.\n\nРекомендуется связаться напрямую.`;
    await sendManagerMsg(managerId, alert);
    injectNotification(alert, { masterAlias: master.alias });

    // Mark as escalated
    await db.insert(botMemoryTable).values({ masterId: master.id, category: "proactive_sent", content: key });
    console.log(`[dispatcherAI] 24h no-response escalated for ${master.alias} order #${orderId}`);
  } catch (e) {
    console.error("[dispatcherAI] escalate24hNoResponse error:", e);
  }
}

/** Escalate to manager when order has been hanging for 14+ days with no completion */
async function escalateStaleLongOrder(
  master: { id: number; alias: string; maxChatId: string; city?: string | null },
  orderId: number,
  hoursAssigned: number,
): Promise<void> {
  try {
    const key = `escalate_stale_14d:${orderId}`;
    const already = await db.select({ id: botMemoryTable.id })
      .from(botMemoryTable)
      .where(and(
        eq(botMemoryTable.masterId, master.id),
        eq(botMemoryTable.category, "proactive_sent"),
        ilike(botMemoryTable.content, key),
      ))
      .limit(1);
    if (already.length > 0) return; // Already escalated

    const managerId = getManagerUserId();
    if (!managerId) return;

    const daysAssigned = Math.round(hoursAssigned / 24);
    const alert = `⚠️ Заказ #${orderId} / Мастер: ${master.alias}\n\nЗаказ висит уже ${daysAssigned} дней без завершения. Требует ручного контроля руководителя.\n\nПроверьте статус и при необходимости примите меры.`;
    await sendManagerMsg(managerId, alert);
    injectNotification(alert, { masterAlias: master.alias });

    // Mark as escalated (once per order — don't spam)
    await db.insert(botMemoryTable).values({ masterId: master.id, category: "proactive_sent", content: key });
    console.log(`[dispatcherAI] 14-day stale order escalated for ${master.alias} order #${orderId}`);
  } catch (e) {
    console.error("[dispatcherAI] escalateStaleLongOrder error:", e);
  }
}

// ─── Scheduler: run checks for all active orders ─────────────────────────────

export async function runProactiveChecks(): Promise<void> {
  if (proactiveChecksRunning) {
    console.log("[dispatcherAI] Proactive checks already running — skipping this cycle to prevent duplicates");
    return;
  }
  if (!(await isAiDispatcherEnabled())) {
    console.log("[dispatcherAI] AI dispatcher is globally disabled — skipping proactive checks");
    return;
  }
  proactiveChecksRunning = true;
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

      if (!master?.maxChatId) {
        // No Max account — mark as sent so it doesn't clog the queue
        await db.update(dispatcherFollowupsTable).set({ sent: true }).where(eq(dispatcherFollowupsTable.id, followup.id));
        console.log(`[dispatcherAI] Skipping follow-up #${followup.id} — master has no Max account`);
        continue;
      }

      // ── Quiet hours: defer until morning, don't mark as sent ──────────────
      if (isQuietHours(master.city)) {
        console.log(`[dispatcherAI] Follow-up #${followup.id} deferred — quiet hours for ${master.alias} (${master.city})`);
        continue; // will be retried next cycle
      }

      // Skip if master has already replied to the bot since this follow-up was scheduled
      const followupCreatedMs = new Date(followup.createdAt ?? followup.followupAt).getTime();
      if (await masterRepliedAfter(master.id, followupCreatedMs)) {
        await db.update(dispatcherFollowupsTable).set({ sent: true }).where(eq(dispatcherFollowupsTable.id, followup.id));
        console.log(`[dispatcherAI] Skipping follow-up #${followup.id} — master ${master.alias} already replied`);
        continue;
      }

      // Mark as sent BEFORE sending (prevents double-send if scheduler fires again)
      await db.update(dispatcherFollowupsTable).set({ sent: true }).where(eq(dispatcherFollowupsTable.id, followup.id));

      try {
        await sendMaxMessage(master.maxChatId, followup.question);
        await saveBotReply(master.id, master.maxChatId, followup.question);
        console.log(`[dispatcherAI] Sent scheduled follow-up #${followup.id} to ${master.alias}`);
      } catch (e) {
        console.error(`[dispatcherAI] Failed to send follow-up #${followup.id} to ${master.alias}:`, e);
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
        try {
          const master = await db.select().from(mastersTable)
            .where(eq(mastersTable.id, masterId))
            .then(r => r[0]);
          if (master?.maxChatId) {
            if (isQuietHours(master.city)) {
              console.log(`[dispatcherAI] Order contact reminder deferred — quiet hours for ${master.alias}`);
            } else {
              contact.remindedAt = nowMs;
              const reminder = `${master.alias}, напоминаю — по заказу #${contact.orderId} (${contact.orderSummary}) ещё ищем мастера. Сможете взять? 🙏`;
              await sendMaxMessage(master.maxChatId, reminder);
              await saveBotReply(master.id, master.maxChatId, reminder);
              console.log(`[dispatcherAI] Sent order contact reminder to ${master.alias} for order #${contact.orderId}`);
            }
          }
        } catch (e) {
          console.error(`[dispatcherAI] Reminder error for master ${masterId}:`, e);
        }
      }
    }

    // ── Balance / debt proactive notifications ────────────────────────────
    const allMaxMasters = await db.select()
      .from(mastersTable)
      .where(and(isNull(mastersTable.deletedAt), gte(mastersTable.maxChatId, "")));

    const masterIds = allMaxMasters.map(m => m.id);

    // Token balance check (negative balances)
    let negativeBalanceMap = new Map<number, number>();
    if (masterIds.length > 0) {
      try {
        const rows = await db.select({
          masterId: walletTransactionsTable.masterId,
          balance: sql<number>`SUM(${walletTransactionsTable.tokensAmount})`.as("balance"),
        })
          .from(walletTransactionsTable)
          .where(inArray(walletTransactionsTable.masterId, masterIds))
          .groupBy(walletTransactionsTable.masterId)
          .having(sql`SUM(${walletTransactionsTable.tokensAmount}) < 0`);
        for (const r of rows) negativeBalanceMap.set(r.masterId, r.balance);
      } catch (e) {
        console.error("[dispatcherAI] Token balance query error:", e);
      }
    }

    for (const master of allMaxMasters) {
      if (!master.maxChatId) continue;
      if (isQuietHours(master.city)) continue;

      // 1. Negative token balance
      if (negativeBalanceMap.has(master.id)) {
        const key = `balance_negative:${master.id}`;
        if (!(await proactiveAlreadySent(master.id, "balance_negative", master.id, 72))) {
          const msg = "Привет! Твой баланс токенов сейчас отрицательный. Чтобы иметь приоритет в ленте и не потерять доступ к новым заказам, пополни кошелёк в приложении. Удачной работы!";
          try {
            await sendMaxMessage(master.maxChatId, msg);
            await saveBotReply(master.id, master.maxChatId, msg);
            await markProactiveSent(master.id, "balance_negative", master.id);
            console.log(`[dispatcherAI] Sent negative balance reminder to ${master.alias}`);
          } catch (e) {
            console.error(`[dispatcherAI] Failed to send balance reminder to ${master.alias}:`, e);
          }
        }
      }

      // 2. Commission debt (old orders)
      const debtAmount = Number(master.debt ?? 0);
      if (debtAmount > 0) {
        if (!(await proactiveAlreadySent(master.id, "commission_debt", master.id, 72))) {
          const msg = "Напоминаю: у тебя есть незакрытые старые заказы с комиссией. Закрой хвосты в приложении, чтобы полностью перейти на новую систему.";
          try {
            await sendMaxMessage(master.maxChatId, msg);
            await saveBotReply(master.id, master.maxChatId, msg);
            await markProactiveSent(master.id, "commission_debt", master.id);
            console.log(`[dispatcherAI] Sent commission debt reminder to ${master.alias}`);
          } catch (e) {
            console.error(`[dispatcherAI] Failed to send debt reminder to ${master.alias}:`, e);
          }
        }
      }
    }

    // ── Active order escalations ──────────────────────────────────────────
    const activeOrders = await db.select().from(ordersTable)
      .where(and(
        inArray(ordersTable.status, ["master_assigned", "in_progress"]),
        isNull(ordersTable.deletedAt),
      ));

    const activeMasterIds = [...new Set(activeOrders.map(o => o.masterId).filter(Boolean))] as number[];
    const activeMasters = activeMasterIds.length > 0
      ? await db.select().from(mastersTable).where(inArray(mastersTable.id, activeMasterIds))
      : [];
    const activeMasterMap = new Map(activeMasters.map(m => [m.id, m]));

    const now = Date.now();

    for (const order of activeOrders) {
      if (!order.masterId) continue;
      const master = activeMasterMap.get(order.masterId);
      if (!master?.maxChatId) continue;

      const assignedAt = order.assignedAt ? new Date(order.assignedAt).getTime() : new Date(order.createdAt).getTime();
      const hoursAssigned = (now - assignedAt) / 3600000;

      // 1. Ghost master check — 12h+ after assignment, no reply at all
      if (hoursAssigned >= 12) {
        await detectGhostMaster(
          { id: master.id, alias: master.alias, maxChatId: master.maxChatId },
          order.id,
          hoursAssigned,
        );
      }

      // 2. 24h no-response escalation
      if (hoursAssigned >= 24) {
        await escalate24hNoResponse(
          { ...master, maxChatId: master.maxChatId! },
          order.id,
          hoursAssigned,
        );
      }

      // 3. 14-day stale order escalation
      if (hoursAssigned >= 336) {
        await escalateStaleLongOrder(
          { ...master, maxChatId: master.maxChatId! },
          order.id,
          hoursAssigned,
        );
      }
    }
  } catch (e) {
    console.error("[dispatcherAI] proactive checks error:", e);
  } finally {
    proactiveChecksRunning = false;
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

    const resp = await requireOpenAI().chat.completions.create({
      model: openaiModel,
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
