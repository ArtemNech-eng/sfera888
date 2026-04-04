/**
 * Manager Bot — AI assistant for the business owner.
 * Second Max bot (MANAGER_BOT_TOKEN), separate from the masters bot.
 *
 * Capabilities:
 *  - Natural language + voice → create leads
 *  - Suggest & approve masters (smart ranking by history)
 *  - Broadcast orders
 *  - Daily / weekly reports
 *  - Revenue & debt analytics
 *  - Master performance stats
 *  - Change order status / add notes
 *  - Approve master passports
 *  - Memory / preferences
 *  - Proactive: morning briefing, new lead alerts, stale order alerts, master response alerts
 */

import OpenAI from "openai";
import {
  db,
  leadsTable,
  ordersTable,
  mastersTable,
  orderDispatchesTable,
  transactionsTable,
  receiptsTable,
  masterReviewsTable,
  orderStatusLogsTable,
  masterCheckinsTable,
  masterMessagesTable,
} from "@workspace/db";
import { eq, and, isNull, desc, gte, sql, inArray, lte, or } from "drizzle-orm";
import { performBroadcast } from "./lib/broadcastOrder.js";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Convert OGG/Opus (sent by Max bot) → WAV (required by gpt-4o-mini-transcribe)
async function convertOggToWav(buffer: Buffer): Promise<Buffer> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const inPath = `${tmpdir()}/voice_in_${id}.ogg`;
  const outPath = `${tmpdir()}/voice_out_${id}.wav`;
  try {
    await writeFile(inPath, buffer);
    await execFileAsync("ffmpeg", ["-y", "-i", inPath, "-ar", "16000", "-ac", "1", "-f", "wav", outPath]);
    return await readFile(outPath);
  } finally {
    unlink(inPath).catch(() => {});
    unlink(outPath).catch(() => {});
  }
}

// dispatcherAI is dynamically imported to avoid circular dependency
// (dispatcherAI imports sendMsg/getManagerUserId from this file)
async function getDispatcherModule() {
  return import("./lib/dispatcherAI.js");
}

const MAX_API = "https://platform-api.max.ru";

function getToken(): string | undefined {
  return process.env.MANAGER_BOT_TOKEN;
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Manager user tracking ─────────────────────────────────────────────────────
// Auto-detected from first/last person who writes to the bot

let managerUserId: number | null = null;

// ─── Task Dedup Store ─────────────────────────────────────────────────────────
// Prevents the same task from being sent to the same master multiple times
// within a 6h window. Both interactive bot and autonomous agent share this map.
const TASK_DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

interface DedupEntry {
  task: string;
  sentAt: Date;
  masterAlias: string;
}

const taskDedup = new Map<number, DedupEntry>(); // key = masterId

function checkTaskDedup(masterId: number): DedupEntry | null {
  const entry = taskDedup.get(masterId);
  if (!entry) return null;
  if (Date.now() - entry.sentAt.getTime() > TASK_DEDUP_WINDOW_MS) {
    taskDedup.delete(masterId);
    return null;
  }
  return entry;
}

function recordTaskDedup(masterId: number, masterAlias: string, task: string) {
  taskDedup.set(masterId, { task, sentAt: new Date(), masterAlias });
}

/** Resolve master by id or name string. Returns master row or null. */
async function resolveMasterByNameOrId(nameOrId: string) {
  const all = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt));
  const lower = nameOrId.toLowerCase().trim();
  return all.find(m =>
    String(m.id) === nameOrId ||
    m.alias.toLowerCase().includes(lower) ||
    (m.phone ?? "").includes(nameOrId),
  ) ?? null;
}
// ─── City Timezone Map ────────────────────────────────────────────────────────
// UTC offsets for Russian cities. Default: UTC+3 (Moscow).
const CITY_UTC_OFFSETS: Record<string, number> = {
  // UTC+2
  "Калининград": 2,
  // UTC+3 (Moscow standard)
  "Москва": 3, "Санкт-Петербург": 3, "Питер": 3, "СПб": 3,
  "Краснодар": 3, "Ростов-на-Дону": 3, "Ростов": 3,
  "Воронеж": 3, "Нижний Новгород": 3, "Нижний": 3,
  "Казань": 3, "Самара": 3, "Волгоград": 3,
  "Саратов": 3, "Тверь": 3, "Ярославль": 3,
  "Рязань": 3, "Тула": 3, "Брянск": 3, "Орёл": 3, "Орел": 3,
  "Липецк": 3, "Тамбов": 3, "Белгород": 3, "Курск": 3,
  "Смоленск": 3, "Владимир": 3, "Иваново": 3, "Кострома": 3,
  "Пенза": 3, "Ульяновск": 3, "Чебоксары": 3, "Саранск": 3,
  "Псков": 3, "Великий Новгород": 3, "Вологда": 3,
  "Мурманск": 3, "Петрозаводск": 3, "Архангельск": 3,
  "Сыктывкар": 3, "Ставрополь": 3, "Махачкала": 3,
  "Владикавказ": 3, "Нальчик": 3, "Черкесск": 3, "Майкоп": 3,
  "Астрахань": 3, "Элиста": 3,
  // UTC+4
  "Ижевск": 4, "Оренбург": 4,
  // UTC+5
  "Екатеринбург": 5, "Пермь": 5, "Челябинск": 5, "Тюмень": 5,
  "Уфа": 5, "Магнитогорск": 5, "Курган": 5,
  // UTC+6
  "Омск": 6,
  // UTC+7
  "Новосибирск": 7, "Красноярск": 7, "Кемерово": 7,
  "Новокузнецк": 7, "Барнаул": 7, "Томск": 7, "Горно-Алтайск": 7,
  "Абакан": 7,
  // UTC+8
  "Иркутск": 8, "Улан-Удэ": 8, "Чита": 9,
  // UTC+9
  "Якутск": 9,
  // UTC+10
  "Владивосток": 10, "Хабаровск": 10, "Южно-Сахалинск": 11,
  "Петропавловск-Камчатский": 12, "Анадырь": 12,
};

/**
 * Returns the UTC offset for a city (defaults to UTC+3 = Moscow if unknown).
 */
function getCityUtcOffset(city?: string | null): number {
  if (!city) return 3;
  const c = city.trim();
  // Exact match first
  if (CITY_UTC_OFFSETS[c] !== undefined) return CITY_UTC_OFFSETS[c];
  // Partial match
  const key = Object.keys(CITY_UTC_OFFSETS).find(k => c.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(c.toLowerCase()));
  return key ? CITY_UTC_OFFSETS[key] : 3;
}

const QUIET_HOURS_START = 22; // 22:00 local → do not send
const QUIET_HOURS_END = 8;    // 08:00 local → ok to send

/**
 * Returns whether the master's local time is in quiet hours (22:00–08:00).
 * Also returns a human-readable local time string for messages.
 */
function getMasterQuietStatus(city?: string | null): { quiet: boolean; localTimeStr: string } {
  const offset = getCityUtcOffset(city);
  const nowLocal = new Date(Date.now() + offset * 3600000);
  const hour = nowLocal.getUTCHours();
  const min = nowLocal.getUTCMinutes().toString().padStart(2, "0");
  const localTimeStr = `${hour}:${min} (UTC+${offset}${city ? `, ${city}` : ""})`;
  const quiet = hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
  return { quiet, localTimeStr };
}

const staleAlertedOrders = new Set<number>(); // track which orders we've already alerted about

export function getManagerUserId(): number | null { return managerUserId; }

// ─── In-memory preferences ────────────────────────────────────────────────────
// Preferences survive per-session; for true persistence use DB-backed store

const preferences = new Map<string, string>();

// ─── Conversation context ─────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
}

interface PendingConfirmation {
  type: "create_lead" | "broadcast_order" | "set_order_status" | "approve_passport" | "send_task_force";
  data: Record<string, any>;
  description: string;
}

interface ActiveContext {
  orderId?: number;
  leadId?: number;
  masterId?: number;
  masterAlias?: string;
  clientName?: string;
  clientPhone?: string;
  city?: string;
  serviceType?: string;
  description?: string;
}

interface Session {
  messages: Message[];
  pending: PendingConfirmation | null;
  ctx: ActiveContext;
}

const sessions = new Map<number, Session>();
const MAX_HISTORY = 20;

function getSession(userId: number): Session {
  if (!sessions.has(userId)) {
    sessions.set(userId, { messages: [], pending: null, ctx: {} });
  }
  return sessions.get(userId)!;
}

/** Inject context into session: record proactive message as assistant turn + update ctx */
export function injectNotification(text: string, ctx: ActiveContext) {
  if (!managerUserId) return;
  const session = getSession(managerUserId);
  session.ctx = { ...session.ctx, ...ctx };
  addMessage(session, { role: "assistant", content: text });
}

function sanitizeHistory(msgs: Message[]): Message[] {
  // After trimming, the slice may start with orphaned "tool" messages whose
  // parent assistant-with-tool_calls was cut off. Remove them from the top.
  let start = 0;
  while (start < msgs.length && msgs[start].role === "tool") {
    start++;
  }
  return msgs.slice(start);
}

function addMessage(session: Session, msg: Message) {
  session.messages.push(msg);
  if (session.messages.length > MAX_HISTORY) {
    session.messages = sanitizeHistory(session.messages.slice(-MAX_HISTORY));
  }
}

// ─── Max API helpers ──────────────────────────────────────────────────────────

async function maxPost(path: string, recipientType: "user_id" | "chat_id", recipientId: number, body: object) {
  const token = getToken();
  if (!token) return;
  try {
    await fetch(`${MAX_API}${path}?${recipientType}=${recipientId}`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[managerBot] maxPost error:", e);
  }
}

export async function sendMsg(userId: number, text: string) {
  await maxPost("/messages", "user_id", userId, { text, format: "markdown" });
}

async function sendWithButtons(userId: number, text: string, buttons: { text: string; payload: string }[][]) {
  await maxPost("/messages", "user_id", userId, {
    text,
    format: "markdown",
    attachments: [{
      type: "inline_keyboard",
      payload: { buttons: buttons.map(row => row.map(b => ({ type: "callback", text: b.text, payload: b.payload }))) },
    }],
  });
}

async function downloadAudio(url: string): Promise<Buffer | null> {
  try {
    const token = getToken();
    const res = await fetch(url, token ? { headers: { Authorization: token } } : {});
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

async function transcribeAudio(buffer: Buffer, mimeType = "audio/ogg"): Promise<string | null> {
  try {
    let audioBuffer = buffer;
    let fileName = "voice.wav";
    let fileType = "audio/wav";

    // gpt-4o-mini-transcribe supports: mp3, mp4, mpeg, mpga, m4a, wav, webm
    // OGG/Opus (sent by Max bot) is NOT supported — convert to WAV via ffmpeg
    if (mimeType.includes("ogg") || mimeType.includes("opus")) {
      audioBuffer = await convertOggToWav(buffer);
      console.log(`[managerBot] Converted OGG to WAV (${buffer.length} → ${audioBuffer.length} bytes)`);
    } else if (mimeType.includes("webm")) {
      fileName = "voice.webm"; fileType = "audio/webm";
    } else if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
      fileName = "voice.mp4"; fileType = "audio/mp4";
    } else if (mimeType.includes("mp3")) {
      fileName = "voice.mp3"; fileType = "audio/mp3";
    }

    const file = new File([audioBuffer], fileName, { type: fileType });
    const result = await openai.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file,
      language: "ru",
      response_format: "json",
    });
    return result.text || null;
  } catch (e) {
    console.error("[managerBot] Transcription error:", e);
    return null;
  }
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function toolGetPendingOrders() {
  const orders = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.status, "waiting_master"), isNull(ordersTable.deletedAt)))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);

  if (orders.length === 0) return "Нет заказов, ожидающих мастера.";

  return orders.map(o => {
    const age = Math.round((Date.now() - new Date(o.createdAt).getTime()) / 3600000);
    return `• Заказ #${o.id}: ${o.serviceType}, ${o.city}${o.district ? ` (${o.district})` : ""}, ${o.area} м² — ждёт ${age} ч, рассылка: ${o.dispatchStatus}`;
  }).join("\n");
}

async function toolGetTodayLeads() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leads = await db.select().from(leadsTable)
    .where(and(isNull(leadsTable.deletedAt), gte(leadsTable.createdAt, today)))
    .orderBy(desc(leadsTable.createdAt));

  if (leads.length === 0) return "Сегодня новых заявок нет.";

  return `Сегодня ${leads.length} заявок:\n` + leads.map(l =>
    `• #${l.id} ${l.clientName} (${l.clientPhone}), ${l.serviceType}, ${l.city} — статус: ${l.status}`
  ).join("\n");
}

/** Smart master suggestion: ranks by historical assignment count for this city+service */
async function toolGetAvailableMasters(city: string, serviceType?: string) {
  if (!city) return "Укажите город для поиска мастеров.";

  const masters = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)))
    .orderBy(desc(mastersTable.rating));

  const cityLower = city.toLowerCase();
  const filtered = masters.filter(m => m.city?.toLowerCase() === cityLower);

  if (filtered.length === 0) return `В городе ${city} нет активных мастеров.`;

  // Count historical assignments for this city+serviceType combo
  const assignedOrders = await db.select({ masterId: ordersTable.masterId, serviceType: ordersTable.serviceType })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.city, city),
      eq(ordersTable.status, "completed"),
      isNull(ordersTable.deletedAt),
    ));

  const assignmentCounts = new Map<number, number>();
  for (const o of assignedOrders) {
    if (!o.masterId) continue;
    const svcMatch = !serviceType || (o.serviceType ?? "").toLowerCase().includes(serviceType.toLowerCase().split(" ")[0]);
    if (svcMatch) assignmentCounts.set(o.masterId, (assignmentCounts.get(o.masterId) ?? 0) + 1);
  }

  // Sort: most assigned first, then by rating
  const sorted = [...filtered].sort((a, b) => {
    const aCount = assignmentCounts.get(a.id) ?? 0;
    const bCount = assignmentCounts.get(b.id) ?? 0;
    if (bCount !== aCount) return bCount - aCount;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });

  return `Мастера в ${city} (${sorted.length}), по опыту:\n` + sorted.slice(0, 8).map((m, i) => {
    const count = assignmentCounts.get(m.id) ?? 0;
    const priceStr = serviceType && m.servicePrices
      ? (() => {
          const sp = (m.servicePrices as any[]).find((p: any) =>
            p.service?.toLowerCase().includes(serviceType.toLowerCase().split(" ")[0])
          );
          return sp ? ` | цена: от ${sp.priceFrom} ₽` : "";
        })()
      : "";
    const star = count > 0 ? ` ⭐×${count}` : "";
    return `${i + 1}. #${m.id} ${m.alias} | рейтинг: ${m.rating}${star}${priceStr}`;
  }).join("\n");
}

async function toolGetReport(period: "day" | "week" | "month") {
  const now = new Date();
  const from = new Date(now);
  if (period === "day") from.setHours(0, 0, 0, 0);
  else if (period === "week") from.setDate(now.getDate() - 7);
  else from.setMonth(now.getMonth() - 1);

  const [leadsAll, ordersAll] = await Promise.all([
    db.select().from(leadsTable).where(and(isNull(leadsTable.deletedAt), gte(leadsTable.createdAt, from))),
    db.select().from(ordersTable).where(and(isNull(ordersTable.deletedAt), gte(ordersTable.createdAt, from))),
  ]);

  const periodLabel = period === "day" ? "за сегодня" : period === "week" ? "за 7 дней" : "за 30 дней";

  const leadsNew = leadsAll.filter(l => l.status === "new").length;
  const leadsProcessing = leadsAll.filter(l => l.status === "processing").length;
  const leadsSentToWork = leadsAll.filter(l => l.status === "sent_to_work").length;
  const leadsNonTarget = leadsAll.filter(l => l.status === "non_target").length;
  const leadsClientRefusal = leadsAll.filter(l => l.status === "client_refusal").length;

  const ordersWaiting = ordersAll.filter(o => o.status === "waiting_master").length;
  const ordersAssigned = ordersAll.filter(o => o.status === "master_assigned").length;
  const ordersCompleted = ordersAll.filter(o => o.status === "completed").length;
  const ordersCancelled = ordersAll.filter(o => o.status === "cancelled").length;

  // Revenue from transactions
  let revenueText = "";
  try {
    const txRows = await db.select().from(transactionsTable)
      .where(and(
        gte(transactionsTable.createdAt, from),
        eq(transactionsTable.status, "paid"),
      ));
    const total = txRows.reduce((s, t) => s + Number(t.amount ?? 0), 0);
    revenueText = `\n💰 Выручка: **${total.toLocaleString("ru-RU")} ₽** (${txRows.length} транзакций)`;
  } catch {}

  return `📊 Отчёт ${periodLabel}:

📋 Заявки (${leadsAll.length} всего):
  • Новые: ${leadsNew}
  • В обработке: ${leadsProcessing}
  • Отправлено в работу: ${leadsSentToWork}
  • Нецелевые: ${leadsNonTarget}
  • Отказ клиента: ${leadsClientRefusal}
  • Конверсия: ${leadsAll.length > 0 ? Math.round(leadsSentToWork / leadsAll.length * 100) : 0}%

📦 Заказы (${ordersAll.length} всего):
  • Ждут мастера: ${ordersWaiting}
  • Назначен мастер: ${ordersAssigned}
  • Завершены: ${ordersCompleted}
  • Отменены: ${ordersCancelled}${revenueText}`;
}

async function toolGetRevenueStats(period: "day" | "week" | "month") {
  const now = new Date();
  const from = new Date(now);
  if (period === "day") from.setHours(0, 0, 0, 0);
  else if (period === "week") from.setDate(now.getDate() - 7);
  else from.setMonth(now.getMonth() - 1);

  try {
    const txRows = await db.select().from(transactionsTable)
      .where(gte(transactionsTable.createdAt, from));

    const paid = txRows.filter(t => t.status === "paid");
    const pending = txRows.filter(t => t.status === "pending");
    const overdue = txRows.filter(t => t.status === "overdue");

    const totalPaid = paid.reduce((s, t) => s + Number(t.amount ?? 0), 0);
    const totalPending = pending.reduce((s, t) => s + Number(t.amount ?? 0), 0);
    const totalOverdue = overdue.reduce((s, t) => s + Number(t.amount ?? 0), 0);

    const periodLabel = period === "day" ? "сегодня" : period === "week" ? "за 7 дней" : "за 30 дней";

    return `💰 Финансы (${periodLabel}):
  ✅ Оплачено: ${totalPaid.toLocaleString("ru-RU")} ₽ (${paid.length} шт.)
  ⏳ Ожидают оплаты: ${totalPending.toLocaleString("ru-RU")} ₽ (${pending.length} шт.)
  🔴 Просроченные: ${totalOverdue.toLocaleString("ru-RU")} ₽ (${overdue.length} шт.)`;
  } catch (e) {
    return "Не удалось получить финансовые данные.";
  }
}

async function toolGetDebtSummary() {
  const masters = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

  const withDebt = masters.filter(m => Number(m.debt ?? 0) > 0)
    .sort((a, b) => Number(b.debt ?? 0) - Number(a.debt ?? 0));

  if (withDebt.length === 0) return "✅ Нет задолженностей у мастеров.";

  const total = withDebt.reduce((s, m) => s + Number(m.debt ?? 0), 0);
  return `💸 Долги мастеров (${withDebt.length} чел., итого ${total.toLocaleString("ru-RU")} ₽):\n` +
    withDebt.map(m => `• ${m.alias}: ${Number(m.debt ?? 0).toLocaleString("ru-RU")} ₽`).join("\n");
}

async function toolGetMasterStats(masterIdOrName: string) {
  const id = parseInt(masterIdOrName);
  let master;

  if (!isNaN(id)) {
    const rows = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
    master = rows[0];
  } else {
    const all = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt));
    master = all.find(m => m.alias.toLowerCase().includes(masterIdOrName.toLowerCase()));
  }

  if (!master) return `Мастер "${masterIdOrName}" не найден.`;

  const orders = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.masterId, master.id), isNull(ordersTable.deletedAt)));

  const completed = orders.filter(o => o.status === "completed").length;
  const active = orders.filter(o => ["master_assigned", "in_progress"].includes(o.status)).length;
  const cancelled = orders.filter(o => o.status === "cancelled").length;

  // Last 30 days
  const month = new Date();
  month.setDate(month.getDate() - 30);
  const recent = orders.filter(o => new Date(o.createdAt) >= month);

  // Receipts (сметы)
  const receipts = await db.select().from(receiptsTable)
    .where(eq(receiptsTable.masterId, master.id))
    .orderBy(desc(receiptsTable.createdAt));

  const pendingReceipts = receipts.filter(r => r.prepaymentSubmittedAt && !r.prepaymentSeenAt);
  const confirmedReceipts = receipts.filter(r => r.prepaymentSeenAt);

  let receiptsInfo = `\n📄 Сметы: всего ${receipts.length}`;
  if (pendingReceipts.length > 0) {
    receiptsInfo += `\n  ⏳ Ожидают подтверждения (${pendingReceipts.length}):`;
    for (const r of pendingReceipts) {
      const total = Number(r.totalAmount).toLocaleString("ru-RU");
      const prep = Number(r.prepaymentAmount).toLocaleString("ru-RU");
      receiptsInfo += `\n    • Смета #${r.id} / Заказ #${r.orderId}: ${r.serviceType}, предоплата ${prep} ₽ (итого ${total} ₽)`;
    }
  }
  if (confirmedReceipts.length > 0) {
    receiptsInfo += `\n  ✅ Подтверждено: ${confirmedReceipts.length}`;
  }

  return `👷 Мастер **${master.alias}** (#${master.id}):
  📍 Город: ${master.city ?? "не указан"}
  ⭐ Рейтинг: ${master.rating ?? 0}
  📋 Всего заказов: ${master.totalOrders ?? 0}
  ✅ Завершено: ${completed}
  🔧 Активных: ${active}
  ❌ Отмен: ${cancelled}
  📅 За 30 дней: ${recent.length} заказов
  💸 Долг: ${Number(master.debt ?? 0).toLocaleString("ru-RU")} ₽
  📱 Max: ${master.maxChatId ? "привязан" : "не привязан"}
  🪪 Паспорт: ${master.passportVerified ? "✅ подтверждён" : "⏳ не подтверждён"}${receiptsInfo}`;
}

async function toolGetPendingReceipts() {
  const receipts = await db.select().from(receiptsTable)
    .orderBy(desc(receiptsTable.createdAt));

  const pending = receipts.filter(r => r.prepaymentSubmittedAt && !r.prepaymentSeenAt);

  if (pending.length === 0) return "✅ Смет, ожидающих подтверждения, нет.";

  const masterIds = [...new Set(pending.map(r => r.masterId))];
  const masters = await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds));
  const masterMap = new Map(masters.map(m => [m.id, m.alias]));

  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });

  let result = `📋 Сметы, ожидающие подтверждения (${pending.length}):\n\n`;
  for (const r of pending) {
    const masterName = masterMap.get(r.masterId) ?? `#${r.masterId}`;
    const total = Number(r.totalAmount).toLocaleString("ru-RU");
    const prep = Number(r.prepaymentAmount).toLocaleString("ru-RU");
    const submitted = r.prepaymentSubmittedAt ? fmt.format(new Date(r.prepaymentSubmittedAt)) : "—";
    result += `• Смета **#${r.id}** — Мастер: ${masterName}, Заказ #${r.orderId}\n`;
    result += `  Услуга: ${r.serviceType}\n`;
    result += `  Клиент: ${r.clientName} (${r.clientPhone})\n`;
    result += `  Предоплата: **${prep} ₽** (итого ${total} ₽)\n`;
    result += `  Оплачено: ${submitted}\n\n`;
  }
  return result.trim();
}

async function toolConfirmReceipt(receiptId: number) {
  const rows = await db.select().from(receiptsTable).where(eq(receiptsTable.id, receiptId));
  const receipt = rows[0];
  if (!receipt) return `Смета #${receiptId} не найдена.`;
  if (receipt.prepaymentSeenAt) return `✅ Смета #${receiptId} уже была подтверждена ранее.`;
  if (!receipt.prepaymentSubmittedAt) return `⚠️ По смете #${receiptId} ещё не поступила предоплата от клиента.`;

  await db.update(receiptsTable)
    .set({ prepaymentSeenAt: new Date() })
    .where(eq(receiptsTable.id, receiptId));

  const masters = await db.select().from(mastersTable).where(eq(mastersTable.id, receipt.masterId));
  const masterName = masters[0]?.alias ?? `#${receipt.masterId}`;
  const prep = Number(receipt.prepaymentAmount).toLocaleString("ru-RU");

  return `✅ Смета #${receiptId} подтверждена. Мастер: ${masterName}, предоплата ${prep} ₽ по заказу #${receipt.orderId}.`;
}

async function toolGetCommissionSummary(): Promise<string> {
  const all = await db.select().from(transactionsTable)
    .where(or(
      eq(transactionsTable.paymentStatus, "pending"),
      eq(transactionsTable.paymentStatus, "overdue"),
    ));

  if (all.length === 0) return "✅ Нет неоплаченных комиссий.";

  const masterIds = [...new Set(all.map(t => t.masterId))];
  const masters = await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds));
  const masterMap = new Map(masters.map(m => [m.id, m.alias]));

  const byMaster = new Map<number, { pending: number; overdue: number; total: number }>();
  for (const t of all) {
    const commission = Number(t.commission ?? 0);
    const entry = byMaster.get(t.masterId) ?? { pending: 0, overdue: 0, total: 0 };
    if (t.paymentStatus === "overdue") entry.overdue += commission;
    else entry.pending += commission;
    entry.total += commission;
    byMaster.set(t.masterId, entry);
  }

  const sorted = [...byMaster.entries()].sort((a, b) => b[1].overdue - a[1].overdue);
  const totalAll = sorted.reduce((s, [, v]) => s + v.total, 0);
  const overdueAll = sorted.reduce((s, [, v]) => s + v.overdue, 0);

  let result = `💼 Остатки комиссий (всего: ${totalAll.toLocaleString("ru-RU")} ₽, просрочено: ${overdueAll.toLocaleString("ru-RU")} ₽):\n\n`;
  for (const [masterId, data] of sorted) {
    const alias = masterMap.get(masterId) ?? `#${masterId}`;
    const overdueStr = data.overdue > 0 ? ` ⚠️просрочено: ${data.overdue.toLocaleString("ru-RU")} ₽` : "";
    const pendingStr = data.pending > 0 ? ` ожидает: ${data.pending.toLocaleString("ru-RU")} ₽` : "";
    result += `• ${alias}: всего ${data.total.toLocaleString("ru-RU")} ₽${overdueStr}${pendingStr}\n`;
  }
  return result.trim();
}

/** Autonomous: ping each master with an active order via dispatcher */
async function toolPingMastersWithActiveOrders(): Promise<string> {
  const activeOrders = await db.select().from(ordersTable)
    .where(and(
      inArray(ordersTable.status, ["master_assigned", "in_progress"]),
      isNull(ordersTable.deletedAt),
    ));

  if (activeOrders.length === 0) return "Нет активных заказов для проверки.";

  const masterIds = [...new Set(activeOrders.map(o => o.masterId).filter(Boolean) as number[])];
  if (masterIds.length === 0) return "Нет мастеров на активных заказах.";

  const masters = await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds));
  const d = await getDispatcherModule();

  let pinged = 0;
  const results: string[] = [];

  for (const master of masters) {
    const masterOrders = activeOrders.filter(o => o.masterId === master.id);
    const orderList = masterOrders.map(o => `заказ #${o.id} (${o.serviceType}, ${o.city})`).join(", ");
    const hoursOld = masterOrders.map(o => Math.round((Date.now() - new Date(o.updatedAt).getTime()) / 3600000));
    const maxHours = Math.max(...hoursOld);

    // Skip if quiet hours in master's city
    const quietCheck = getMasterQuietStatus(master.city);
    if (quietCheck.quiet) {
      results.push(`${master.alias}: пропущен — тихие часы (${quietCheck.localTimeStr})`);
      continue;
    }

    // Skip if recently pinged via dedup
    const dupEntry = checkTaskDedup(master.id);
    if (dupEntry) {
      const minsAgo = Math.round((Date.now() - dupEntry.sentAt.getTime()) / 60000);
      results.push(`${master.alias}: пропущен (уже уведомлён ${minsAgo} мин назад)`);
      continue;
    }

    // Also skip if order was recently updated < 6h ago
    if (maxHours < 6) {
      results.push(`${master.alias}: пропущен (активность ${maxHours}ч назад)`);
      continue;
    }

    const task = `Уточни статус по ${orderList}. Как идут работы? Есть ли проблемы? Когда планируется завершение?`;
    try {
      await d.sendTaskToMaster(String(master.id), task);
      recordTaskDedup(master.id, master.alias, task);
      pinged++;
      results.push(`${master.alias}: ✅ уведомлён (заказов: ${masterOrders.length})`);
    } catch (e) {
      results.push(`${master.alias}: ⚠️ ошибка`);
    }
  }

  return `Проверка мастеров с активными заказами:\n${results.join("\n")}\n\nУведомлено: ${pinged} из ${masters.length}`;
}

/** Autonomous: send submitted receipts to manager with confirmation buttons */
async function toolAlertSubmittedReceipts(): Promise<string> {
  if (!managerUserId) return "Менеджер не онлайн.";

  const receipts = await db.select().from(receiptsTable)
    .where(and(
      sql`prepayment_submitted_at IS NOT NULL`,
      sql`prepayment_seen_at IS NULL`,
    ))
    .orderBy(receiptsTable.createdAt);

  if (receipts.length === 0) return "Нет смет, ожидающих подтверждения.";

  const masterIds = [...new Set(receipts.map(r => r.masterId))];
  const masters = await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds));
  const masterMap = new Map(masters.map(m => [m.id, m.alias]));

  for (const r of receipts) {
    const masterName = masterMap.get(r.masterId) ?? `#${r.masterId}`;
    const prep = Number(r.prepaymentAmount).toLocaleString("ru-RU");
    const total = Number(r.totalAmount).toLocaleString("ru-RU");
    const text = `💰 Клиент оплатил бронь — требуется подтверждение!\n\nСмета **#${r.id}**\n👤 ${r.clientName} (${r.clientPhone})\n🔧 ${r.serviceType}, ${r.city}\n👷 Мастер: ${masterName}\n💵 Предоплата: **${prep} ₽** (итого ${total} ₽)`;
    await sendWithButtons(managerUserId, text, [[
      { text: "✅ Подтвердить оплату", payload: `confirm_receipt:${r.id}` },
      { text: "🔎 Проверить позже", payload: "receipt:skip" },
    ]]);
    // Track in session for context
    injectNotification(text, { description: `Смета #${r.id}, мастер ${masterName}` });
  }

  return `Отправлены уведомления о ${receipts.length} смете(ах). Ждём решения руководителя.`;
}

// ─── Extended autonomous tools ────────────────────────────────────────────────

/** Orders stuck in master_assigned >48h without moving to in_progress */
async function toolGetStuckOrders(): Promise<string> {
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const stuck = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.status, "master_assigned"),
      lte(ordersTable.updatedAt, cutoff48h),
      isNull(ordersTable.deletedAt),
    ));

  if (stuck.length === 0) return "✅ Нет зависших заказов (master_assigned >48ч).";

  const masterIds = [...new Set(stuck.map(o => o.masterId).filter(Boolean) as number[])];
  const masters = masterIds.length > 0 ? await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds)) : [];
  const masterMap = new Map(masters.map(m => [m.id, m.alias]));

  const now = Date.now();
  const lines = stuck.map(o => {
    const hoursStuck = Math.round((now - new Date(o.updatedAt).getTime()) / 3600000);
    const masterName = masterMap.get(o.masterId!) ?? `#${o.masterId}`;
    return `• #${o.id} — ${o.serviceType}, ${o.city} | мастер: ${masterName} | зависло ${hoursStuck}ч`;
  });

  return `⚠️ Зависших заказов (master_assigned >48ч): ${stuck.length}\n${lines.join("\n")}`;
}

/** SLA: orders in "waiting_master" status >30 min (not yet dispatched to masters) */
async function toolGetSlaBreaches(): Promise<string> {
  const cutoff30m = new Date(Date.now() - 30 * 60 * 1000);
  const breaches = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.status, "waiting_master"),
      lte(ordersTable.createdAt, cutoff30m),
      isNull(ordersTable.deletedAt),
    ));

  if (breaches.length === 0) return "✅ Нет нарушений SLA (заказы рассылаются в норме).";

  const now = Date.now();
  const lines = breaches.map(o => {
    const minsWaiting = Math.round((now - new Date(o.createdAt).getTime()) / 60000);
    return `• #${o.id} — ${o.serviceType}, ${o.city} | ждёт ${minsWaiting} мин`;
  });

  return `🚨 SLA нарушен (заказ >30 мин без рассылки): ${breaches.length}\n${lines.join("\n")}`;
}

/** Daily revenue: today vs yesterday vs same weekday last week */
async function toolGetDailyRevenue(): Promise<string> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekAgoStart = new Date(todayStart.getTime() - 7 * 86400000);
  const weekAgoEnd = new Date(weekAgoStart.getTime() + 86400000);

  const allPaid = await db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.paymentStatus, "paid"),
      gte(transactionsTable.createdAt, weekAgoStart),
    ));

  const todayRev = allPaid.filter(t => new Date(t.createdAt) >= todayStart)
    .reduce((s, t) => s + Number(t.commission), 0);
  const yesterdayRev = allPaid.filter(t => new Date(t.createdAt) >= yesterdayStart && new Date(t.createdAt) < todayStart)
    .reduce((s, t) => s + Number(t.commission), 0);
  const weekAgoRev = allPaid.filter(t => new Date(t.createdAt) >= weekAgoStart && new Date(t.createdAt) < weekAgoEnd)
    .reduce((s, t) => s + Number(t.commission), 0);

  const pct = (a: number, b: number) => b > 0 ? ` (${a > b ? "▲" : "▼"}${Math.abs(Math.round((a - b) / b * 100))}%)` : "";
  const fmt = (n: number) => n.toLocaleString("ru-RU");

  return `💰 Выручка по комиссиям:\n• Сегодня: ${fmt(todayRev)} ₽\n• Вчера: ${fmt(yesterdayRev)} ₽${pct(todayRev, yesterdayRev)}\n• Тот же день неделю назад: ${fmt(weekAgoRev)} ₽${pct(todayRev, weekAgoRev)}`;
}

/** Top-5 masters by commissions this week */
async function toolGetTopMasters(): Promise<string> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const paid = await db.select().from(transactionsTable)
    .where(and(eq(transactionsTable.paymentStatus, "paid"), gte(transactionsTable.createdAt, weekAgo)));

  if (paid.length === 0) return "Нет оплаченных комиссий за эту неделю.";

  const byMaster = new Map<number, number>();
  for (const t of paid) byMaster.set(t.masterId, (byMaster.get(t.masterId) ?? 0) + Number(t.commission));

  const sorted = [...byMaster.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const masterIds = sorted.map(([id]) => id);
  const masters = await db.select().from(mastersTable).where(inArray(mastersTable.id, masterIds));
  const masterMap = new Map(masters.map(m => [m.id, m.alias]));

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const lines = sorted.map(([id, amount], i) =>
    `${medals[i]} ${masterMap.get(id) ?? `#${id}`}: ${amount.toLocaleString("ru-RU")} ₽`
  );
  return `🏆 Топ мастеров за неделю:\n${lines.join("\n")}`;
}

/** City analysis: master count vs lead demand */
async function toolGetCityAnalysis(): Promise<string> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [activeMasters, recentLeads] = await Promise.all([
    db.select().from(mastersTable).where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt))),
    db.select().from(leadsTable).where(and(gte(leadsTable.createdAt, weekAgo), isNull(leadsTable.deletedAt))),
  ]);

  const mastersByCity = new Map<string, number>();
  for (const m of activeMasters) {
    if (m.city) mastersByCity.set(m.city, (mastersByCity.get(m.city) ?? 0) + 1);
  }

  const leadsByCity = new Map<string, number>();
  for (const l of recentLeads) {
    if (l.city) leadsByCity.set(l.city, (leadsByCity.get(l.city) ?? 0) + 1);
  }

  const allCities = new Set([...mastersByCity.keys(), ...leadsByCity.keys()]);
  const cityData = [...allCities].map(city => ({
    city,
    masters: mastersByCity.get(city) ?? 0,
    leads: leadsByCity.get(city) ?? 0,
    ratio: (leadsByCity.get(city) ?? 0) / Math.max(mastersByCity.get(city) ?? 0, 1),
  })).sort((a, b) => b.ratio - a.ratio);

  if (cityData.length === 0) return "Нет данных по городам.";

  const critical: string[] = [];
  const warn: string[] = [];
  const ok: string[] = [];

  for (const c of cityData) {
    const line = `${c.city}: ${c.leads} заявок / ${c.masters} мастеров`;
    if (c.leads > 0 && c.masters === 0) critical.push(`🚨 ${line} — НЕТ МАСТЕРОВ`);
    else if (c.ratio > 3) warn.push(`⚠️ ${line} — дефицит`);
    else ok.push(`✅ ${line}`);
  }

  return `🗺 Анализ по городам (7 дней):\n\n${[...critical, ...warn, ...ok].join("\n")}`;
}

/** Top services this week */
async function toolGetTopServices(): Promise<string> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = await db.select().from(ordersTable)
    .where(and(gte(ordersTable.createdAt, weekAgo), isNull(ordersTable.deletedAt)));

  if (recent.length === 0) return "Нет заказов за эту неделю.";

  const byService = new Map<string, number>();
  for (const o of recent) byService.set(o.serviceType, (byService.get(o.serviceType) ?? 0) + 1);

  const sorted = [...byService.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const lines = sorted.map(([service, count], i) => `${i + 1}. ${service}: ${count}`);

  return `🔧 Топ услуг за неделю:\n${lines.join("\n")}`;
}

/** Cancellation rate today and for the week */
async function toolGetCancellationRate(): Promise<string> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [todayOrders, weekOrders] = await Promise.all([
    db.select().from(ordersTable).where(and(gte(ordersTable.createdAt, todayStart), isNull(ordersTable.deletedAt))),
    db.select().from(ordersTable).where(and(gte(ordersTable.createdAt, weekAgo), isNull(ordersTable.deletedAt))),
  ]);

  const todayCancelled = todayOrders.filter(o => o.status === "cancelled").length;
  const todayRate = todayOrders.length > 0 ? Math.round(todayCancelled / todayOrders.length * 100) : 0;
  const weekCancelled = weekOrders.filter(o => o.status === "cancelled").length;
  const weekRate = weekOrders.length > 0 ? Math.round(weekCancelled / weekOrders.length * 100) : 0;

  let result = `📊 Отмены:\n• Сегодня: ${todayCancelled}/${todayOrders.length} (${todayRate}%)\n• За неделю: ${weekCancelled}/${weekOrders.length} (${weekRate}%)`;
  if (todayRate > 20) result += `\n\n🚨 АНОМАЛИЯ: уровень отмен сегодня превышает 20%!`;

  return result;
}

/** New masters who haven't taken their first order in 3+ days */
async function toolGetNewMastersWithoutOrders(): Promise<string> {
  const cutoff3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const newMasters = await db.select().from(mastersTable)
    .where(and(
      eq(mastersTable.status, "active"),
      isNull(mastersTable.deletedAt),
      lte(mastersTable.createdAt, cutoff3d),
    ));

  const withoutOrders = newMasters.filter(m => (m.totalOrders ?? 0) === 0);
  if (withoutOrders.length === 0) return "✅ Все новые мастера уже взяли первый заказ.";

  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });
  const lines = withoutOrders.map(m => {
    const daysAgo = Math.floor((Date.now() - new Date(m.createdAt).getTime()) / 86400000);
    return `• ${m.alias} — регистрация ${fmt.format(new Date(m.createdAt))} (${daysAgo} дн. назад)`;
  });

  return `👤 Новые мастера без первого заказа (${withoutOrders.length}):\n${lines.join("\n")}`;
}

/** Masters who haven't worked in 7+ days */
async function toolGetInactiveMasters(): Promise<string> {
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const activeMasters = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

  const recentOrders = await db.select({ masterId: ordersTable.masterId })
    .from(ordersTable)
    .where(and(gte(ordersTable.updatedAt, cutoff7d), isNull(ordersTable.deletedAt)));

  const recentMasterIds = new Set(recentOrders.map(o => o.masterId).filter(Boolean));
  const inactive = activeMasters.filter(m => !recentMasterIds.has(m.id));

  if (inactive.length === 0) return "✅ Все активные мастера работали последние 7 дней.";

  const lines = inactive.map(m => {
    const daysSince = Math.floor((Date.now() - new Date(m.createdAt).getTime()) / 86400000);
    return `• ${m.alias} — заказов всего: ${m.totalOrders ?? 0}, долг: ${Number(m.debt ?? 0).toLocaleString("ru-RU")} ₽`;
  });

  return `😴 Неактивные мастера >7 дней (${inactive.length}):\n${lines.join("\n")}`;
}

/** Masters without passport verification or Max bot linked */
async function toolGetUncompletedMasters(): Promise<string> {
  const all = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

  const noPassport = all.filter(m => !m.passportVerified);
  const noMax = all.filter(m => !m.maxChatId);

  let result = "";
  if (noPassport.length > 0) {
    result += `📋 Без верификации паспорта (${noPassport.length}):\n`;
    result += noPassport.map(m => `• ${m.alias}`).join("\n") + "\n\n";
  }
  if (noMax.length > 0) {
    result += `📱 Без привязки Max-бота (${noMax.length}):\n`;
    result += noMax.map(m => `• ${m.alias}`).join("\n");
  }

  return result.trim() || "✅ Все мастера верифицированы и привязали Max-бот.";
}

/** Data quality: duplicate lead phones this week */
async function toolGetDataQualityIssues(): Promise<string> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentLeads = await db.select().from(leadsTable)
    .where(and(isNull(leadsTable.deletedAt), gte(leadsTable.createdAt, weekAgo)));

  const phoneCount = new Map<string, number>();
  for (const l of recentLeads) {
    if (l.phone) phoneCount.set(l.phone, (phoneCount.get(l.phone) ?? 0) + 1);
  }
  const duplicates = [...phoneCount.entries()].filter(([, count]) => count > 1);

  const noLeadsIn3h = await (async () => {
    const cutoff3h = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const recent = recentLeads.filter(l => new Date(l.createdAt) >= cutoff3h);
    return recent.length === 0;
  })();

  const issues: string[] = [];

  if (noLeadsIn3h) {
    issues.push(`🚨 Нет ни одной заявки за последние 3 часа — возможна поломка формы на сайте!`);
  }

  if (duplicates.length > 0) {
    issues.push(`⚠️ Дублирующиеся телефоны в заявках за 7 дней (${duplicates.length}):\n` +
      duplicates.slice(0, 5).map(([phone, count]) => `  • ${phone}: ${count} раза`).join("\n"));
  }

  return issues.length > 0 ? issues.join("\n\n") : "✅ Проблем с качеством данных не обнаружено.";
}

async function toolSearchOrders(query: string, statusFilter?: string) {
  const allOrders = await db.select().from(ordersTable)
    .where(isNull(ordersTable.deletedAt))
    .orderBy(desc(ordersTable.createdAt))
    .limit(200);

  const allLeads = await db.select().from(leadsTable).where(isNull(leadsTable.deletedAt));
  const leadMap = new Map(allLeads.map(l => [l.id, l]));

  const q = (query ?? "").toLowerCase().trim();
  const matches = allOrders.filter(o => {
    const lead = leadMap.get(o.leadId);
    if (statusFilter && o.status !== statusFilter) return false;
    return (
      String(o.id) === q ||
      (o.serviceType ?? "").toLowerCase().includes(q) ||
      (o.city ?? "").toLowerCase().includes(q) ||
      (o.district ?? "").toLowerCase().includes(q) ||
      (o.operatorNote ?? "").toLowerCase().includes(q) ||
      (lead?.clientName ?? "").toLowerCase().includes(q) ||
      (lead?.clientPhone ?? "").includes(q)
    );
  });

  if (matches.length === 0) return `По запросу "${query}" заказов не найдено.`;

  const statusLabels: Record<string, string> = {
    waiting_master: "ждёт мастера", master_assigned: "мастер назначен",
    in_progress: "в работе", completed: "завершён", cancelled: "отменён",
  };

  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" });

  return `🔍 Найдено заказов: ${matches.length}\n\n` + matches.slice(0, 15).map(o => {
    const lead = leadMap.get(o.leadId);
    const client = lead ? `${lead.clientName}, ${lead.clientPhone}` : "—";
    const amount = o.orderAmount ? `${Number(o.orderAmount).toLocaleString("ru-RU")} ₽` : "цена не указана";
    return `• Заказ **#${o.id}** [${fmt.format(new Date(o.createdAt))}] — ${statusLabels[o.status] ?? o.status}\n  ${o.serviceType}, ${o.city}${o.district ? ` (${o.district})` : ""}, ${o.area} м²\n  Клиент: ${client} | ${amount}`;
  }).join("\n\n");
}

async function toolGetOrderDetails(orderId: number) {
  const orders = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orders[0];
  if (!order) return `Заказ #${orderId} не найден.`;

  const leads = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId));
  const lead = leads[0];

  let masterInfo = "не назначен";
  if (order.masterId) {
    const masters = await db.select().from(mastersTable).where(eq(mastersTable.id, order.masterId));
    if (masters[0]) masterInfo = `${masters[0].alias} (#${masters[0].id}), тел: ${masters[0].phone ?? "нет"}`;
  }

  const logs = await db.select().from(orderStatusLogsTable)
    .where(eq(orderStatusLogsTable.orderId, orderId))
    .orderBy(desc(orderStatusLogsTable.createdAt))
    .limit(10);

  const receipts = await db.select().from(receiptsTable).where(eq(receiptsTable.orderId, orderId));

  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
  const statusLabels: Record<string, string> = {
    waiting_master: "ждёт мастера", master_assigned: "мастер назначен",
    in_progress: "в работе", completed: "завершён", cancelled: "отменён",
  };

  let result = `📦 **Заказ #${orderId}**\n`;
  result += `Статус: ${statusLabels[order.status] ?? order.status}\n`;
  result += `Услуга: ${order.serviceType}, ${order.city}${order.district ? ` (${order.district})` : ""}, ${order.area} м²\n`;
  if (lead) result += `Клиент: ${lead.clientName}, ${lead.clientPhone}\n`;
  result += `Мастер: ${masterInfo}\n`;
  if (order.scheduledAt) result += `Запланировано: ${fmt.format(new Date(order.scheduledAt))}\n`;
  if (order.orderAmount) result += `Стоимость: ${Number(order.orderAmount).toLocaleString("ru-RU")} ₽\n`;
  if (order.commission) result += `Комиссия: ${Number(order.commission).toLocaleString("ru-RU")} ₽\n`;
  if (order.comment) result += `Комментарий: ${order.comment}\n`;
  if (order.operatorNote) result += `Заметка оператора: ${order.operatorNote}\n`;
  if (order.cancelReason) result += `Причина отмены: ${order.cancelReason}\n`;
  result += `Создан: ${fmt.format(new Date(order.createdAt))}\n`;

  if (receipts.length > 0) {
    result += `\n📄 Смет: ${receipts.length}`;
    for (const r of receipts) {
      const status = r.prepaymentSeenAt ? "✅ подтверждена" : r.prepaymentSubmittedAt ? "⏳ ожидает подтверждения" : "📝 оплата не поступала";
      result += `\n  • Смета #${r.id}: ${Number(r.totalAmount).toLocaleString("ru-RU")} ₽ — ${status}`;
    }
  }

  if (logs.length > 0) {
    result += `\n\n📋 История статусов (${logs.length}):\n`;
    for (const log of logs.slice(0, 5)) {
      result += `  ${fmt.format(new Date(log.createdAt))}: ${log.oldStatus ?? "—"} → ${log.newStatus}`;
      if (log.note) result += ` (${log.note})`;
      result += "\n";
    }
  }

  return result.trim();
}

async function toolGetMasterReviews(masterIdOrName: string) {
  const id = parseInt(masterIdOrName);
  let master;
  if (!isNaN(id)) {
    const rows = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
    master = rows[0];
  } else {
    const all = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt));
    master = all.find(m => m.alias.toLowerCase().includes(masterIdOrName.toLowerCase()));
  }
  if (!master) return `Мастер "${masterIdOrName}" не найден.`;

  const reviews = await db.select().from(masterReviewsTable)
    .where(eq(masterReviewsTable.masterId, master.id))
    .orderBy(desc(masterReviewsTable.createdAt))
    .limit(20);

  if (reviews.length === 0) return `Отзывов о мастере ${master.alias} пока нет.`;

  const positive = reviews.filter(r => r.sentiment === "positive").length;
  const negative = reviews.filter(r => r.sentiment === "negative").length;
  const neutral = reviews.filter(r => r.sentiment === "neutral").length;

  const fmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" });
  const sentimentIcon: Record<string, string> = { positive: "✅", negative: "❌", neutral: "⚪" };

  let result = `⭐ Отзывы о мастере **${master.alias}** (${reviews.length} всего):\n`;
  result += `✅ ${positive} положительных | ❌ ${negative} отрицательных | ⚪ ${neutral} нейтральных\n\n`;

  for (const r of reviews.slice(0, 10)) {
    result += `${sentimentIcon[r.sentiment] ?? "⚪"} [${fmt.format(new Date(r.createdAt))}] ${r.text}\n\n`;
  }
  return result.trim();
}

async function toolGetBusinessInsights() {
  const now = new Date();
  const month = new Date(now); month.setMonth(now.getMonth() - 1);
  const week = new Date(now); week.setDate(now.getDate() - 7);

  const [allOrders, allMasters, allLeads, allReceipts, allTransactions] = await Promise.all([
    db.select().from(ordersTable).where(isNull(ordersTable.deletedAt)),
    db.select().from(mastersTable).where(isNull(mastersTable.deletedAt)),
    db.select().from(leadsTable).where(isNull(leadsTable.deletedAt)),
    db.select().from(receiptsTable),
    db.select().from(transactionsTable),
  ]);

  // Conversion
  const totalLeads = allLeads.length;
  const convertedLeads = allLeads.filter(l => l.status === "sent_to_work").length;
  const conversionRate = totalLeads > 0 ? Math.round(convertedLeads / totalLeads * 100) : 0;

  // Revenue
  const totalRevenue = allTransactions.filter(t => t.status === "paid")
    .reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const monthRevenue = allTransactions.filter(t => t.status === "paid" && new Date(t.createdAt) >= month)
    .reduce((s, t) => s + Number(t.amount ?? 0), 0);

  // Cities
  const cityCount = new Map<string, number>();
  allOrders.forEach(o => cityCount.set(o.city, (cityCount.get(o.city) ?? 0) + 1));
  const topCities = [...cityCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Masters
  const activeMasters = allMasters.filter(m => m.status === "active").length;
  const mastersWithMax = allMasters.filter(m => m.maxChatId).length;
  const mastersNoPassport = allMasters.filter(m => !m.passportVerified && m.status === "active").length;

  // Orders
  const activeOrders = allOrders.filter(o => ["master_assigned", "in_progress"].includes(o.status)).length;
  const waitingOrders = allOrders.filter(o => o.status === "waiting_master").length;
  const completedOrders = allOrders.filter(o => o.status === "completed").length;

  // Receipts
  const pendingReceipts = allReceipts.filter(r => r.prepaymentSubmittedAt && !r.prepaymentSeenAt);
  const pendingReceiptsSum = pendingReceipts.reduce((s, r) => s + Number(r.prepaymentAmount), 0);

  return `📊 **Бизнес-аналитика «Честный мастер»**\n
🎯 Конверсия лидов: **${conversionRate}%** (${convertedLeads} из ${totalLeads})
💰 Выручка всего: **${totalRevenue.toLocaleString("ru-RU")} ₽** | За 30 дней: ${monthRevenue.toLocaleString("ru-RU")} ₽
👷 Мастера: ${activeMasters} активных | ${mastersWithMax} в Max | ${mastersNoPassport} без паспорта
📦 Заказы: ${activeOrders} в работе | ${waitingOrders} ждут мастера | ${completedOrders} завершено
⏳ Сметы к подтверждению: ${pendingReceipts.length} шт, ${pendingReceiptsSum.toLocaleString("ru-RU")} ₽

🏙️ Топ городов по заказам:
${topCities.map((c, i) => `  ${i + 1}. ${c[0]}: ${c[1]} заказов`).join("\n")}`;
}

async function toolSetOrderStatus(orderId: number, status: string, note?: string) {
  const validStatuses = ["waiting_master", "master_assigned", "in_progress", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    return `Неверный статус. Допустимые: ${validStatuses.join(", ")}`;
  }

  // Search by order ID first, then by leadId (manager often says "заявка #N" which is a lead ID)
  let rows = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.deletedAt)));
  if (!rows[0]) {
    rows = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.leadId, orderId), isNull(ordersTable.deletedAt)));
  }
  if (!rows[0]) return `Заказ/заявка #${orderId} не найдена.`;

  const order = rows[0];
  const update: any = { status, updatedAt: new Date() };
  if (note) update.operatorNote = note;
  if (status === "completed") update.completedAt = new Date();

  await db.update(ordersTable).set(update).where(eq(ordersTable.id, order.id));

  const statusLabels: Record<string, string> = {
    waiting_master: "ожидает мастера",
    master_assigned: "мастер назначен",
    in_progress: "в работе",
    completed: "завершён",
    cancelled: "отменён",
  };

  const displayNum = order.leadId ?? order.id;
  return `✅ Заявка #${displayNum} → статус «${statusLabels[status] ?? status}»${note ? `. Заметка: ${note}` : ""}.`;
}

async function toolAddOrderNote(orderId: number, note: string) {
  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!rows[0]) return `Заказ #${orderId} не найден.`;

  await db.update(ordersTable)
    .set({ operatorNote: note, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  return `✅ Заметка добавлена к заказу #${orderId}: "${note}"`;
}

async function toolApproveMasterPassport(masterIdOrName: string) {
  const id = parseInt(masterIdOrName);
  let master;

  if (!isNaN(id)) {
    const rows = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
    master = rows[0];
  } else {
    const all = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt));
    master = all.find(m => m.alias.toLowerCase().includes(masterIdOrName.toLowerCase()));
  }

  if (!master) return `Мастер "${masterIdOrName}" не найден.`;
  if (master.passportVerified) return `✅ Паспорт мастера ${master.alias} уже подтверждён.`;

  await db.update(mastersTable)
    .set({ passportVerified: true })
    .where(eq(mastersTable.id, master.id));

  return `✅ Паспорт мастера **${master.alias}** подтверждён.`;
}

async function toolGetPendingPassports() {
  const masters = await db.select().from(mastersTable)
    .where(and(isNull(mastersTable.deletedAt), eq(mastersTable.passportVerified, false)));

  const withPhoto = masters.filter(m => (m as any).passportPhotoUrl);
  if (withPhoto.length === 0) return "Нет мастеров, ожидающих проверки паспорта.";

  return `🪪 Ожидают проверки паспорта (${withPhoto.length}):\n` +
    withPhoto.map(m => `• #${m.id} ${m.alias} (${m.city ?? "?"}) — телефон: ${m.phone ?? "не указан"}`).join("\n");
}

async function toolSavePreference(key: string, value: string) {
  preferences.set(key.toLowerCase(), value);
  return `✅ Запомнил: "${key}" = "${value}"`;
}

async function toolGetPreference(key: string) {
  const val = preferences.get(key.toLowerCase());
  if (!val) return `Предпочтение "${key}" не задано.`;
  return `${key}: ${val}`;
}

async function toolListPreferences() {
  if (preferences.size === 0) return "Нет сохранённых предпочтений.";
  const lines = Array.from(preferences.entries()).map(([k, v]) => `• ${k}: ${v}`);
  return `📝 Сохранённые предпочтения:\n${lines.join("\n")}`;
}

async function toolCreateLeadAndOrder(args: {
  clientName: string;
  clientPhone: string;
  city: string;
  district?: string;
  serviceType: string;
  area?: number;
  description?: string;
  scheduledAt?: string;
}) {
  const [lead] = await db.insert(leadsTable).values({
    clientName: args.clientName,
    clientPhone: args.clientPhone,
    city: args.city,
    district: args.district ?? null,
    serviceType: args.serviceType,
    area: String(args.area ?? 0),
    comment: args.description ?? null,
    source: "manager_bot",
    status: "sent_to_work",
    scheduledAt: args.scheduledAt ? new Date(args.scheduledAt) : null,
  }).returning();

  const [order] = await db.insert(ordersTable).values({
    leadId: lead.id,
    city: args.city,
    district: args.district ?? null,
    serviceType: args.serviceType,
    area: String(args.area ?? 0),
    status: "waiting_master",
    dispatchStatus: "none",
    scheduledAt: args.scheduledAt ? new Date(args.scheduledAt) : null,
  }).returning();

  await db.update(leadsTable).set({ status: "sent_to_work" }).where(eq(leadsTable.id, lead.id));

  return { leadId: lead.id, orderId: order.id };
}

async function toolBroadcastOrder(orderId: number) {
  const result = await performBroadcast(orderId);
  if (result.ok) {
    return `Рассылка отправлена ${result.sent} мастерам.`;
  }
  return `Ошибка рассылки: ${result.error ?? "неизвестная ошибка"}`;
}

// ─── GPT-4o tool definitions ──────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_pending_orders",
      description: "Получить список заказов, ожидающих назначения мастера",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_today_leads",
      description: "Получить список заявок за сегодня",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_available_masters",
      description: "Получить список мастеров в городе. Автоматически ранжирует по историческому опыту работ.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Город" },
          serviceType: { type: "string", description: "Тип работ (опционально, уточняет ранжирование)" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_report",
      description: "Сформировать сводный отчёт за период (заявки, заказы, конверсия, выручка)",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["day", "week", "month"], description: "Период" },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_stats",
      description: "Получить детальную финансовую статистику: оплачено, ожидает, просрочено",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["day", "week", "month"] },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_debt_summary",
      description: "Получить список мастеров с задолженностями",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_master_stats",
      description: "Получить подробную статистику по конкретному мастеру: заказы, рейтинг, долг, паспорт",
      parameters: {
        type: "object",
        properties: {
          masterIdOrName: { type: "string", description: "ID или имя/фамилия мастера" },
        },
        required: ["masterIdOrName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_passports",
      description: "Получить список мастеров, ожидающих проверки паспорта",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_receipts",
      description: "Получить список смет, ожидающих подтверждения предоплаты. Используй когда спрашивают про сметы, оплату, предоплату мастеров.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_orders",
      description: "Поиск заказов по имени клиента, телефону, городу, типу услуги, ID заказа или ключевому слову. Используй когда спрашивают о конкретном клиенте или заказе.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Поисковый запрос: имя, телефон, город, услуга, ID" },
          statusFilter: { type: "string", enum: ["waiting_master", "master_assigned", "in_progress", "completed", "cancelled"], description: "Опционально: фильтр по статусу" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_details",
      description: "Получить полную информацию о заказе: клиент, мастер, стоимость, история статусов, сметы, заметки. Используй когда спрашивают о конкретном заказе по номеру.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "number", description: "Номер заказа" },
        },
        required: ["orderId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_master_reviews",
      description: "Получить отзывы клиентов о конкретном мастере. Используй когда спрашивают о репутации или качестве работы мастера.",
      parameters: {
        type: "object",
        properties: {
          masterIdOrName: { type: "string", description: "ID или имя мастера" },
        },
        required: ["masterIdOrName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_business_insights",
      description: "Получить ключевые бизнес-метрики: конверсия, выручка, топ городов, активность мастеров, незакрытые задачи. Используй для стратегического анализа.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_receipt",
      description: "Подтвердить предоплату по смете (отметить как проверенную). Используй когда руководитель говорит 'подтвердить смету', 'принял оплату', 'вижу платёж'.",
      parameters: {
        type: "object",
        properties: {
          receiptId: { type: "number", description: "ID сметы" },
        },
        required: ["receiptId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_lead_creation",
      description: "Предложить создание заявки. Вызывай когда в сообщении есть данные клиента (имя, телефон, тип работ).",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          city: { type: "string" },
          district: { type: "string" },
          serviceType: { type: "string" },
          area: { type: "number" },
          description: { type: "string" },
          scheduledAt: { type: "string", description: "ISO8601" },
        },
        required: ["clientName", "clientPhone", "city", "serviceType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_broadcast",
      description: "Предложить разослать заказ мастерам города",
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
      name: "propose_set_order_status",
      description: "Предложить изменить статус заказа",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "number" },
          status: { type: "string", enum: ["waiting_master", "master_assigned", "in_progress", "completed", "cancelled"] },
          note: { type: "string", description: "Заметка оператора (необязательно)" },
        },
        required: ["orderId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_order_note",
      description: "Добавить заметку к заказу",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "number" },
          note: { type: "string" },
        },
        required: ["orderId", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_approve_passport",
      description: "Предложить подтвердить паспорт мастера",
      parameters: {
        type: "object",
        properties: {
          masterIdOrName: { type: "string" },
        },
        required: ["masterIdOrName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_preference",
      description: "Запомнить предпочтение руководителя (например: 'укладка плитки Краснодар → Родион')",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Ключ (что запомнить)" },
          value: { type: "string", description: "Значение" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_preference",
      description: "Вспомнить сохранённое предпочтение",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string" },
        },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_preferences",
      description: "Показать все сохранённые предпочтения",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_master_conversation",
      description: "Показать переписку диспетчера с конкретным мастером — последние сообщения и статус ответа",
      parameters: {
        type: "object",
        properties: {
          masterNameOrId: { type: "string", description: "Имя мастера, часть имени или ID" },
        },
        required: ["masterNameOrId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dispatcher_activity",
      description: "Сводный отчёт по всем мастерам с активными заказами: когда последний раз писали, ответили ли, кто молчит",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "run_autonomous_check",
      description: "Запустить полную автономную проверку системы прямо сейчас — агент сам посмотрит все заказы, выполнит нужные действия и пришлёт отчёт. Используй когда руководитель говорит 'запусти проверку', 'что происходит', 'посмотри что там', 'проверь систему'.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "send_task_to_dispatcher",
      description: "Поставить задачу AI-диспетчеру — отправить конкретное сообщение или напоминание мастеру",
      parameters: {
        type: "object",
        properties: {
          masterNameOrId: { type: "string", description: "Имя мастера или его ID" },
          task: { type: "string", description: "Что нужно сообщить мастеру (например: 'напомнить отправить смету по заказу #47')" },
        },
        required: ["masterNameOrId", "task"],
      },
    },
  },
];

const SYSTEM_PROMPT = `Ты — AI-ассистент и стратегический советник руководителя ремонтного сервиса "Честный мастер".

═══════════════════════════════════════
🎯 МИССИЯ КОМПАНИИ
═══════════════════════════════════════
Выйти на оборот 1 МИЛЛИАРД рублей и охватить ВСЕ ГОРОДА России.
Ты — лучший сотрудник компании. Ты не просто отвечаешь на вопросы — ты думаешь как партнёр, замечаешь возможности, предлагаешь идеи и помогаешь двигаться к цели.

═══════════════════════════════════════
🏗️ КАК УСТРОЕНА СИСТЕМА (знай наизусть!)
═══════════════════════════════════════
"Честный мастер" — это полностью автоматизированная CRM-платформа со следующими компонентами:

▸ CRM (crm.sfera-project.digital) — веб-интерфейс для операторов. Управление заявками, заказами, мастерами, финансами, воронкой продаж.

▸ Клиентское PWA (sfera-project.digital/client/) — приложение для заказчиков. Клиент оставляет заявку, видит статус заказа, может чатиться с мастером и оставить отзыв.

▸ Мастер-PWA (sfera-project.digital/master-pwa/) — приложение для исполнителей. Мастер принимает/отклоняет заказы, отправляет смету, фото "до/после", акт выполненных работ.

▸ Max-бот (диспетчер) — AI-бот в мессенджере Max для общения с мастерами. Принимает отчёты голосом/текстом, разбирает ситуации, ставит задачи. Всегда вежлив, поддерживает мастеров. Понимает голосовые сообщения.

▸ Менеджер-бот (это ТЫ!) — AI-ассистент для руководителя в мессенджере Max. Ты — правая рука руководителя. Принимаешь решения, управляешь командой через диспетчера.

▸ Автономный агент — встроенная система, которая работает в фоне 24/7 и выполняет проверки по расписанию (см. ниже).

═══════════════════════════════════════
🔄 КАК РАБОТАЕТ ЖИЗНЕННЫЙ ЦИКЛ ЗАКАЗА
═══════════════════════════════════════
1. Клиент оставляет заявку (через PWA или оператор вводит вручную) → создаётся Лид
2. Из лида создаётся Заказ со статусом waiting_master
3. Система рассылает заказ подходящим мастерам через Max-бота
4. Мастер принимает → статус master_assigned
5. Мастер начинает работу → статус in_progress
6. Мастер отправляет смету с предоплатой → клиент оплачивает
7. Смета поступает тебе на подтверждение (ты видишь кнопку "Подтвердить оплату")
8. После подтверждения → мастер завершает работу → фото + акт
9. Статус completed → клиент оставляет отзыв
10. Комиссия списывается с мастера

СТАТУСЫ ЗАКАЗА: waiting_master → master_assigned → in_progress → completed / cancelled / cancellation_requested

═══════════════════════════════════════
⏰ РАСПИСАНИЕ АВТОМАТИЧЕСКИХ ПРОВЕРОК
═══════════════════════════════════════
Система работает автоматически — НЕ нужно это настраивать, ЭТО УЖЕ РАБОТАЕТ:

🌅 09:00 МСК — Утренний брифинг + полный цикл проверки:
   • Заказы без мастера → автоматическая рассылка
   • Долги мастеров → напоминания через диспетчера
   • Неактивные мастера → пинг
   • Незавершённые профили → запрос верификации
   • Аналитика дня (выручка, конверсия, топ мастеров)
   • Отчёт приходит тебе в чат

🕛 12:00, 15:00, 19:00 МСК — Дневные проверки (каждый):
   • Нераспределённые заказы → рассылка
   • SLA-нарушения (заказ >30 мин без рассылки)
   • Активные заказы → пинг мастеров через диспетчера
   • Краткий отчёт тебе

📅 Каждую пятницу 18:00 МСК — Еженедельный отчёт:
   • Выручка недели vs предыдущая
   • Топ-5 мастеров
   • Проблемные заказы
   • Тренды по городам и услугам

📆 1-е число месяца 10:00 МСК — Месячный отчёт:
   • Все ключевые метрики
   • Сравнение с прошлым месяцем
   • Идеи для роста

⏱️ Каждые 30 минут — Быстрая проверка:
   • Новые нераспределённые заказы → немедленная рассылка
   • SLA: если заказ >30 мин без мастера → тебе алерт
   • Нет заявок >3 часов → алерт о возможной поломке

🔄 Каждые 2 часа — Дополнительный цикл проверки (как дневной)

═══════════════════════════════════════
🤖 ЗАЩИТЫ И ПРАВИЛА АВТОМАТИКИ
═══════════════════════════════════════
▸ Дедупликация задач: одному мастеру одна задача не отправляется дважды в течение 6 часов. Это предотвращает спам.

▸ Тихие часы: мастерам НЕ пишут с 22:00 до 08:00 по местному времени их города. Система знает часовые пояса всех городов России (UTC+2 Калининград → UTC+12 Анадырь).

▸ Подтверждение оплат: ТОЛЬКО руководитель подтверждает смету. Автоматика только присылает тебе уведомление с кнопкой.

▸ Отмена заказов: ТОЛЬКО руководитель. Автоматика не отменяет заказы.

═══════════════════════════════════════
📊 ДОСТУП К ДАННЫМ CRM
═══════════════════════════════════════
У тебя полный доступ ко всей системе:
• Заявки (лиды) — все входящие обращения
• Заказы — статусы, стоимость, мастера, история изменений
• Мастера — рейтинг, долги, специализации, цены, паспорта, доступность, отзывы
• Сметы — предоплата, подтверждение, суммы
• Финансы — транзакции, выручка, долги
• Переписка с мастерами через AI-диспетчера
• Бизнес-аналитика: конверсия, топ городов, ключевые метрики

═══════════════════════════════════════
🛠️ ЧТО УМЕЕШЬ ДЕЛАТЬ
═══════════════════════════════════════
— Создавать заявки из голосовых/текстовых сообщений
— Искать заказы: по клиенту, телефону, городу, типу услуги (search_orders)
— Просматривать полные детали любого заказа (get_order_details)
— Видеть мастеров с рейтингом, опытом, ценами (get_available_masters)
— Статистика мастера включая сметы и отзывы (get_master_stats, get_master_reviews)
— Рассылать заказы мастерам (propose_broadcast)
— Менять статусы заказов (propose_set_order_status)
— Добавлять заметки к заказам (add_order_note)
— Финансовые отчёты: выручка, долги, конверсия (get_report, get_revenue_stats, get_debt_summary)
— Бизнес-аналитика с идеями для роста (get_business_insights)
— Сметы: просмотр и подтверждение (get_pending_receipts, confirm_receipt)
— Паспорта мастеров (get_pending_passports, approve_master_passport)
— Переписка с мастерами через диспетчера (get_master_conversation, get_dispatcher_activity)
— Постановка задач диспетчеру (send_task_to_dispatcher)
— Запустить внеплановую полную проверку системы (run_autonomous_check)
— Запоминать предпочтения по мастерам (save_preference, get_preference)

═══════════════════════════════════════
💡 ПРАВИЛО ИДЕЙ — ОЧЕНЬ ВАЖНО
═══════════════════════════════════════
После любого отчёта или аналитики — ВСЕГДА добавляй 1-2 конкретных идеи для роста.
Примеры:
• "Конверсия 32% — ниже среднего. Идея: настрой автоответ на заявки в течение 5 минут — это может поднять её до 50%+"
• "В Краснодаре 15 заказов, а мастеров только 2. Идея: запустить набор мастеров в Краснодаре — потенциал явно не использован"
• "3 мастера без паспортов — риск. Идея: поставь дедлайн 3 дня и автоматически заблокируй тех, кто не пришлёт"
Идеи должны быть: конкретными, с числами, практичными, ориентированными на масштаб.

ВАЖНО: НЕ предлагай настроить то, что уже настроено! Если речь о регулярных проверках, мониторинге, оповещениях мастеров — это УЖЕ РАБОТАЕТ (см. расписание выше).

═══════════════════════════════════════
📐 ПРАВИЛА РАБОТЫ
═══════════════════════════════════════
— Пиши кратко и по делу — ты в мессенджере
— Прежде чем создавать заявку/менять статус/подтверждать паспорт — ВСЕГДА вызывай propose_* функцию
— Если в сообщении есть данные клиента (имя, телефон, тип работ) — сразу вызывай propose_lead_creation
— Если руководитель спрашивает "кто лучший мастер для X" — сначала get_preference, потом get_available_masters
— Когда спрашивают о конкретном клиенте или заказе — используй search_orders, потом get_order_details
— При анализе данных всегда сравнивай с целью: "движемся ли мы к миллиарду?"
— Используй только русский язык

═══════════════════════════════════════
⚠️ КРИТИЧЕСКИЕ ПРАВИЛА (НЕ НАРУШАТЬ)
═══════════════════════════════════════
ОТМЕНА/ЗАКРЫТИЕ ЗАЯВКИ/ЗАКАЗА:
  "закрыть заявку", "отменить заявку", "закрыть заказ", "отменить заказ", "закрой", "отмени" →
  ВСЕГДА propose_set_order_status(orderId=..., status="cancelled")
  НЕ ИСПОЛЬЗУЙ propose_broadcast для закрытия!

РАССЫЛКА МАСТЕРАМ:
  propose_broadcast — ТОЛЬКО когда нужно разослать заявку мастерам для поиска исполнителя.
  НЕ путать с закрытием/отменой заказа!

ПОИСК ЗАКАЗА ПО НОМЕРУ ЗАЯВКИ:
  Если менеджер называет "заявка #N" — сначала search_orders с запросом по этому номеру,
  получи orderId из результата, затем используй этот orderId для действий.
  Если orderId не найден — сообщи, что заявка не найдена.`;

// ─── Main update handler ──────────────────────────────────────────────────────

export async function handleManagerUpdate(update: unknown) {
  const u = update as any;
  console.log("[managerBot] update type:", u.update_type ?? "unknown");

  // ── Callback (button press) ───────────────────────────────────────────────
  if (u.update_type === "message_callback" || u.callback) {
    const cb = u.callback ?? u;
    const userId: number = cb.user?.user_id ?? 0;
    const payload: string = cb.payload ?? "";
    if (!userId) return;

    if (userId) managerUserId = userId;

    const session = getSession(userId);

    if (payload === "confirm:yes" && session.pending) {
      const { type, data } = session.pending;
      session.pending = null;

      if (type === "create_lead") {
        await sendMsg(userId, "⏳ Создаю заявку...");
        try {
          const { leadId, orderId } = await toolCreateLeadAndOrder(data);
          await sendWithButtons(
            userId,
            `✅ Заявка #${leadId} создана → Заказ #${orderId}\n\nРазослать мастерам сейчас?`,
            [[
              { text: "📢 Разослать мастерам", payload: `broadcast:${orderId}` },
              { text: "⏸ Позже", payload: "broadcast:skip" },
            ]]
          );
        } catch (e) {
          console.error("[managerBot] create lead error:", e);
          await sendMsg(userId, "❌ Ошибка при создании заявки. Попробуйте снова.");
        }
      } else if (type === "broadcast_order") {
        await sendMsg(userId, "⏳ Отправляю рассылку...");
        const result = await toolBroadcastOrder(data.orderId);
        await sendMsg(userId, `📢 ${result}`);
      } else if (type === "set_order_status") {
        const result = await toolSetOrderStatus(data.orderId, data.status, data.note);
        await sendMsg(userId, result);
      } else if (type === "approve_passport") {
        const result = await toolApproveMasterPassport(data.masterIdOrName);
        await sendMsg(userId, result);
      } else if (type === "send_task_force") {
        await sendMsg(userId, "⏳ Отправляю задачу...");
        const d = await getDispatcherModule();
        const result = await d.sendTaskToMaster(data.masterNameOrId, data.task);
        recordTaskDedup(data.masterId, data.masterAlias, data.task);
        await sendMsg(userId, result);
      }
      return;
    }

    if (payload === "confirm:no") {
      session.pending = null;
      await sendMsg(userId, "❌ Отменено. Что-то ещё?");
      return;
    }

    if (payload.startsWith("broadcast:")) {
      const orderId = parseInt(payload.replace("broadcast:", ""));
      if (isNaN(orderId)) {
        await sendMsg(userId, "Хорошо, отправите позже из CRM.");
        return;
      }
      await sendMsg(userId, "⏳ Рассылаю...");
      const result = await toolBroadcastOrder(orderId);
      await sendMsg(userId, `📢 ${result}`);
      return;
    }

    if (payload.startsWith("confirm_receipt:")) {
      const receiptId = parseInt(payload.replace("confirm_receipt:", ""));
      if (isNaN(receiptId)) {
        await sendMsg(userId, "❌ Неверный ID сметы.");
        return;
      }
      await sendMsg(userId, "⏳ Подтверждаю оплату...");
      const result = await toolConfirmReceipt(receiptId);
      await sendMsg(userId, result);
      return;
    }

    if (payload === "receipt:skip") {
      await sendMsg(userId, "🔎 Хорошо, проверите позже.");
      return;
    }

    return;
  }

  if (u.update_type === "bot_started") {
    const chatId = u.chat_id ?? u.user?.user_id ?? 0;
    if (chatId) {
      managerUserId = chatId;
      await maxPost("/messages", "chat_id", chatId, {
        text: "👋 Привет! Я ваш AI-ассистент.\n\nМогу:\n• Создавать заявки из голоса или текста\n• Показать отчёт за день/неделю/месяц\n• Найти мастеров по городу\n• Управлять заказами\n• Следить за финансами и долгами\n\nПросто напишите или отправьте голосовое.",
        format: "markdown",
      });
    }
    return;
  }

  if (u.update_type !== "message_created") return;

  const msg = u.message;
  if (!msg) return;

  const userId: number = msg.sender?.user_id ?? 0;
  if (!userId) return;

  // Track manager user ID
  managerUserId = userId;

  const session = getSession(userId);

  // ── Voice message ─────────────────────────────────────────────────────────
  let userText: string = (msg.body?.text ?? "").trim();

  const attachments: any[] = msg.body?.attachments ?? [];
  const audioAttachment = attachments.find((a: any) =>
    a.type === "audio" || a.type === "voice" || a.payload?.mimeType?.startsWith("audio")
  );

  if (!userText && audioAttachment) {
    const audioUrl = audioAttachment.payload?.url;
    if (audioUrl) {
      await sendMsg(userId, "🎙 Транскрибирую голосовое...");
      const buffer = await downloadAudio(audioUrl);
      if (buffer) {
        const mime = audioAttachment.payload?.mimeType ?? "audio/ogg";
        const transcript = await transcribeAudio(buffer, mime);
        if (transcript) {
          userText = transcript;
          await sendMsg(userId, `📝 Распознал: _${transcript}_`);
        } else {
          await sendMsg(userId, "❌ Не удалось распознать голосовое. Напишите текстом.");
          return;
        }
      }
    }
  }

  if (!userText) return;

  // ── Run AI ────────────────────────────────────────────────────────────────
  addMessage(session, { role: "user", content: userText });

  // Build dynamic context note from last known context
  function buildContextNote(ctx: ActiveContext): string {
    const parts: string[] = [];
    if (ctx.orderId) parts.push(`orderId=${ctx.orderId}`);
    if (ctx.leadId) parts.push(`leadId=${ctx.leadId}`);
    if (ctx.masterAlias) parts.push(`мастер="${ctx.masterAlias}"`);
    if (ctx.masterId) parts.push(`masterId=${ctx.masterId}`);
    if (ctx.clientName) parts.push(`клиент="${ctx.clientName}"`);
    if (ctx.clientPhone) parts.push(`телефон=${ctx.clientPhone}`);
    if (ctx.city) parts.push(`город=${ctx.city}`);
    if (ctx.serviceType) parts.push(`услуга=${ctx.serviceType}`);
    if (ctx.description) parts.push(`суть="${ctx.description}"`);
    if (parts.length === 0) return "";
    return `\n\n[АКТИВНЫЙ КОНТЕКСТ ДИАЛОГА: ${parts.join(", ")}]\nЕсли руководитель использует местоимения ("ему", "его", "эту", "этого", "закрой", "отмени") — они относятся к этому контексту. Используй orderId/leadId/masterAlias напрямую без лишних вопросов.`;
  }

  try {
    const ctxNote = buildContextNote(session.ctx);
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT + ctxNote },
      ...session.messages,
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: 1000,
    });

    const choice = response.choices[0];
    const assistantMsg = choice.message;

    // ── Handle tool calls ─────────────────────────────────────────────────
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      // MUST save tool_calls with the message — otherwise tool responses become orphans
      addMessage(session, { role: "assistant", content: assistantMsg.content ?? "", tool_calls: assistantMsg.tool_calls });

      for (const tc of assistantMsg.tool_calls) {
        const fnName = tc.function.name;
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}

        console.log(`[managerBot] tool call: ${fnName}`, JSON.stringify(args));
        let toolResult = "";

        switch (fnName) {
          case "get_pending_orders":
            toolResult = await toolGetPendingOrders();
            break;
          case "get_today_leads":
            toolResult = await toolGetTodayLeads();
            break;
          case "get_available_masters":
            toolResult = await toolGetAvailableMasters(args.city ?? "", args.serviceType);
            break;
          case "get_report":
            toolResult = await toolGetReport(args.period ?? "week");
            break;
          case "get_revenue_stats":
            toolResult = await toolGetRevenueStats(args.period ?? "week");
            break;
          case "get_debt_summary":
            toolResult = await toolGetDebtSummary();
            break;
          case "get_master_stats":
            toolResult = await toolGetMasterStats(args.masterIdOrName);
            break;
          case "get_pending_passports":
            toolResult = await toolGetPendingPassports();
            break;
          case "get_pending_receipts":
            toolResult = await toolGetPendingReceipts();
            break;
          case "confirm_receipt":
            toolResult = await toolConfirmReceipt(Number(args.receiptId));
            break;
          case "search_orders":
            toolResult = await toolSearchOrders(args.query, args.statusFilter);
            break;
          case "get_order_details":
            toolResult = await toolGetOrderDetails(Number(args.orderId));
            break;
          case "get_master_reviews":
            toolResult = await toolGetMasterReviews(args.masterIdOrName);
            break;
          case "get_business_insights":
            toolResult = await toolGetBusinessInsights();
            break;
          case "save_preference":
            toolResult = await toolSavePreference(args.key, args.value);
            break;
          case "get_preference":
            toolResult = await toolGetPreference(args.key);
            break;
          case "list_preferences":
            toolResult = await toolListPreferences();
            break;
          case "get_master_conversation": {
            const d = await getDispatcherModule();
            toolResult = await d.getMasterConversationReport(args.masterNameOrId);
            break;
          }
          case "get_dispatcher_activity": {
            const d = await getDispatcherModule();
            toolResult = await d.getDispatcherActivityReport();
            break;
          }
          case "run_autonomous_check": {
            // Fire autonomous cycle in background, don't await (it's long-running)
            setTimeout(() => runAutonomousCycle("запрос руководителя вручную").catch(console.error), 100);
            toolResult = "Запускаю полную проверку системы. Отчёт придёт отдельным сообщением через ~30 секунд.";
            break;
          }
          case "send_task_to_dispatcher": {
            const master = await resolveMasterByNameOrId(args.masterNameOrId);
            if (!master) {
              toolResult = `Мастер "${args.masterNameOrId}" не найден.`;
              break;
            }
            const pendingData = { masterNameOrId: String(master.id), task: args.task, masterAlias: master.alias, masterId: master.id };

            // 1. Check quiet hours first
            const { quiet, localTimeStr } = getMasterQuietStatus(master.city);
            if (quiet) {
              const nightText = `🌙 Сейчас ночное время у мастера **${master.alias}** — ${localTimeStr}.\n\nОтправка в ночное время может разбудить мастера. Всё равно отправить?`;
              session.pending = { type: "send_task_force", data: pendingData, description: nightText };
              addMessage(session, { role: "tool", content: "pending_quiet_hours_confirmation", tool_call_id: tc.id, name: fnName });
              await sendWithButtons(userId, nightText, [[
                { text: "🌙 Да, отправить", payload: "confirm:yes" },
                { text: "⏰ Утром", payload: "confirm:no" },
              ]]);
              return;
            }

            // 2. Check dedup
            const dupEntry = checkTaskDedup(master.id);
            if (dupEntry) {
              const minsAgo = Math.round((Date.now() - dupEntry.sentAt.getTime()) / 60000);
              const hoursAgo = minsAgo >= 60 ? `${Math.round(minsAgo / 60)}ч` : `${minsAgo} мин`;
              const dupText = `⚠️ Дубль задачи!\n\nМастеру **${master.alias}** уже отправлялась задача ${hoursAgo} назад:\n_"${dupEntry.task}"_\n\nОтправить снова?`;
              session.pending = { type: "send_task_force", data: pendingData, description: dupText };
              addMessage(session, { role: "tool", content: "pending_duplicate_confirmation", tool_call_id: tc.id, name: fnName });
              await sendWithButtons(userId, dupText, [[
                { text: "✅ Да, отправить", payload: "confirm:yes" },
                { text: "❌ Не надо", payload: "confirm:no" },
              ]]);
              return;
            }

            // 3. All clear — send
            const d = await getDispatcherModule();
            toolResult = await d.sendTaskToMaster(String(master.id), args.task);
            recordTaskDedup(master.id, master.alias, args.task);
            break;
          }
          case "add_order_note":
            toolResult = await toolAddOrderNote(args.orderId, args.note);
            break;
          case "propose_lead_creation": {
            const parts = [
              `👤 Клиент: **${args.clientName}**`,
              `📞 Телефон: ${args.clientPhone}`,
              `📍 Город: ${args.city}${args.district ? `, ${args.district}` : ""}`,
              `🔧 Услуга: ${args.serviceType}`,
              args.area ? `📐 Площадь: ${args.area} м²` : "",
              args.description ? `💬 Описание: ${args.description}` : "",
              args.scheduledAt ? `📅 Дата: ${new Date(args.scheduledAt).toLocaleDateString("ru-RU")}` : "",
            ].filter(Boolean).join("\n");

            session.pending = { type: "create_lead", data: args, description: parts };
            // Close the tool call in history so OpenAI doesn't error on next message
            addMessage(session, { role: "tool", content: "pending_confirmation", tool_call_id: tc.id, name: fnName });
            await sendWithButtons(
              userId,
              `Создать заявку?\n\n${parts}`,
              [[
                { text: "✅ Создать", payload: "confirm:yes" },
                { text: "❌ Отмена", payload: "confirm:no" },
              ]]
            );
            return;
          }
          case "propose_broadcast": {
            session.pending = { type: "broadcast_order", data: { orderId: args.orderId }, description: `Заказ #${args.orderId}` };
            // Close the tool call in history so OpenAI doesn't error on next message
            addMessage(session, { role: "tool", content: "pending_confirmation", tool_call_id: tc.id, name: fnName });
            await sendWithButtons(
              userId,
              `Разослать заказ #${args.orderId} всем мастерам города?`,
              [[
                { text: "📢 Разослать", payload: "confirm:yes" },
                { text: "❌ Отмена", payload: "confirm:no" },
              ]]
            );
            return;
          }
          case "propose_set_order_status": {
            const statusLabels: Record<string, string> = {
              waiting_master: "ожидает мастера",
              master_assigned: "мастер назначен",
              in_progress: "в работе",
              completed: "завершён",
              cancelled: "отменён",
            };
            session.pending = { type: "set_order_status", data: args, description: `Заказ #${args.orderId} → ${statusLabels[args.status] ?? args.status}` };
            // Close the tool call in history so OpenAI doesn't error on next message
            addMessage(session, { role: "tool", content: "pending_confirmation", tool_call_id: tc.id, name: fnName });
            await sendWithButtons(
              userId,
              `Изменить статус заказа #${args.orderId} на «${statusLabels[args.status] ?? args.status}»?${args.note ? `\nЗаметка: ${args.note}` : ""}`,
              [[
                { text: "✅ Изменить", payload: "confirm:yes" },
                { text: "❌ Отмена", payload: "confirm:no" },
              ]]
            );
            return;
          }
          case "propose_approve_passport": {
            session.pending = { type: "approve_passport", data: args, description: `Паспорт мастера ${args.masterIdOrName}` };
            // Close the tool call in history so OpenAI doesn't error on next message
            addMessage(session, { role: "tool", content: "pending_confirmation", tool_call_id: tc.id, name: fnName });
            await sendWithButtons(
              userId,
              `Подтвердить паспорт мастера "${args.masterIdOrName}"?`,
              [[
                { text: "✅ Подтвердить", payload: "confirm:yes" },
                { text: "❌ Отмена", payload: "confirm:no" },
              ]]
            );
            return;
          }
          default:
            toolResult = "Функция не найдена.";
        }

        addMessage(session, { role: "tool", content: toolResult, tool_call_id: tc.id, name: fnName });
      }

      // Second AI call with tool results
      const followUp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + ctxNote },
          ...session.messages,
        ],
        max_tokens: 700,
      });

      const reply = followUp.choices[0]?.message?.content ?? "";
      if (reply) {
        addMessage(session, { role: "assistant", content: reply });
        await sendMsg(userId, reply);
      }
    } else {
      const reply = assistantMsg.content ?? "";
      if (reply) {
        addMessage(session, { role: "assistant", content: reply });
        await sendMsg(userId, reply);
      }
    }
  } catch (e) {
    console.error("[managerBot] AI error:", e);
    await sendMsg(userId, "⚠️ Ошибка при обработке запроса. Попробуйте ещё раз.");
  }
}

// ─── Proactive notifications ──────────────────────────────────────────────────

/** Called when a new lead is created (from leads.ts route) */
export async function notifyManagerNewLead(lead: {
  id: number;
  clientName: string;
  clientPhone: string;
  city: string;
  serviceType: string;
  source?: string | null;
}) {
  if (!managerUserId) return;
  const src = lead.source ? ` (${lead.source})` : "";
  const text = `🆕 Новая заявка #${lead.id}${src}\n👤 ${lead.clientName} · ${lead.clientPhone}\n📍 ${lead.city} · ${lead.serviceType}`;
  await sendMsg(managerUserId, text);
  injectNotification(text, { leadId: lead.id, clientName: lead.clientName, clientPhone: lead.clientPhone, city: lead.city, serviceType: lead.serviceType });
}

/** Called when a master responds to an order (from dispatch.ts) */
export async function notifyManagerMasterResponse(
  orderId: number,
  masterAlias: string,
  accepted: boolean,
) {
  if (!managerUserId) return;
  const text = accepted
    ? `🙋 **${masterAlias}** откликнулся на заказ #${orderId}\n\nНазначить мастера? Откройте CRM → Буфер заказов.`
    : `❌ **${masterAlias}** отказался от заказа #${orderId}`;
  await sendMsg(managerUserId, text);
  injectNotification(text, { orderId, masterAlias });
}

/** Morning briefing — called daily at 9:00 MSK */
export async function sendMorningBriefing() {
  if (!managerUserId) {
    console.log("[managerBot] morning briefing: no manager user ID set, skipping");
    return;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayLeads, pendingOrders, activeMasters] = await Promise.all([
      db.select().from(leadsTable)
        .where(and(isNull(leadsTable.deletedAt), gte(leadsTable.createdAt, today))),
      db.select().from(ordersTable)
        .where(and(eq(ordersTable.status, "waiting_master"), isNull(ordersTable.deletedAt))),
      db.select().from(mastersTable)
        .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt))),
    ]);

    const newLeads = todayLeads.filter(l => l.status === "new").length;
    const longWaiting = pendingOrders.filter(o => {
      const age = Date.now() - new Date(o.createdAt).getTime();
      return age > 2 * 60 * 60 * 1000;
    });

    const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const dateStr = nowMsk.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

    let msg = `☀️ Доброе утро! **${dateStr}**\n\n`;
    msg += `📋 Новых заявок сегодня: **${newLeads}**\n`;
    msg += `📦 Заказов без мастера: **${pendingOrders.length}**\n`;
    msg += `👷 Активных мастеров: **${activeMasters.length}**\n`;

    if (longWaiting.length > 0) {
      msg += `\n⚠️ Долго ждут мастера (${longWaiting.length}):\n`;
      msg += longWaiting.slice(0, 3).map(o => {
        const age = Math.round((Date.now() - new Date(o.createdAt).getTime()) / 3600000);
        return `• Заказ #${o.id}: ${o.serviceType}, ${o.city} — ${age} ч`;
      }).join("\n");
    }

    if (pendingOrders.length > 0) {
      msg += `\n\nНапишите "ожидающие заказы" чтобы увидеть полный список.`;
    }

    await sendMsg(managerUserId, msg);
    console.log("[managerBot] morning briefing sent to manager:", managerUserId);
  } catch (e) {
    console.error("[managerBot] morning briefing error:", e);
  }
}

/** Check for orders waiting > 2h without a master — alert manager */
export async function checkStaleOrders() {
  if (!managerUserId) return;

  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const staleOrders = await db.select().from(ordersTable)
      .where(and(
        eq(ordersTable.status, "waiting_master"),
        isNull(ordersTable.deletedAt),
        lte(ordersTable.createdAt, cutoff),
      ));

    const newStale = staleOrders.filter(o => !staleAlertedOrders.has(o.id));
    if (newStale.length === 0) return;

    for (const o of newStale) {
      staleAlertedOrders.add(o.id);
    }

    const lines = newStale.slice(0, 5).map(o => {
      const age = Math.round((Date.now() - new Date(o.createdAt).getTime()) / 3600000);
      return `• Заказ #${o.id}: ${o.serviceType}, ${o.city} — **${age} ч**`;
    }).join("\n");

    const staleText = `⚠️ Заказы ждут мастера слишком долго (${newStale.length}):\n${lines}\n\nПопробуйте повторную рассылку.`;
    await sendMsg(managerUserId, staleText);
    // Inject context for the most urgent stale order
    if (newStale[0]) {
      injectNotification(staleText, { orderId: newStale[0].id, city: newStale[0].city ?? undefined, serviceType: newStale[0].serviceType ?? undefined });
    }
  } catch (e) {
    console.error("[managerBot] checkStaleOrders error:", e);
  }
}

// ─── Notification: client paid receipt ───────────────────────────────────────

export async function notifyManagerReceiptPaid(receipt: {
  id: number;
  clientName: string;
  clientPhone: string;
  prepaymentAmount: number;
  masterAlias?: string;
  city?: string;
  serviceType?: string;
}) {
  if (!managerUserId) return;
  try {
    const amount = receipt.prepaymentAmount.toLocaleString("ru-RU");
    const masterStr = receipt.masterAlias ? ` · мастер: ${receipt.masterAlias}` : "";
    const cityStr = receipt.city ? `📍 ${receipt.city}` : "";
    const serviceStr = receipt.serviceType ? ` · ${receipt.serviceType}` : "";
    const text = `💰 Клиент оплатил бронь!\n\nСмета #${receipt.id}\n👤 ${receipt.clientName} (${receipt.clientPhone})\n${cityStr}${serviceStr}${masterStr}\n💵 Сумма брони: **${amount} ₽**\n\n_Проверьте скриншот в CRM → Оплаты._`;
    await sendMsg(managerUserId, text);
    injectNotification(text, { clientName: receipt.clientName, clientPhone: receipt.clientPhone, masterAlias: receipt.masterAlias, city: receipt.city, serviceType: receipt.serviceType, description: `Смета #${receipt.id}` });
  } catch (e) {
    console.error("[managerBot] notifyManagerReceiptPaid error:", e);
  }
}

// ─── Notification: new master registered ─────────────────────────────────────

export async function notifyManagerNewMaster(master: {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  phone?: string | null;
}) {
  if (!managerUserId) return;
  try {
    const phoneStr = master.phone ? ` · ${master.phone}` : "";
    const text = `🆕 Новый мастер зарегистрировался!\n\n👷 **${master.alias}**${phoneStr}\n📍 ${master.city} · ${master.specialization}\n\n_Требует проверки паспорта и подписания договора._\nCRM → Мастера → #${master.id}`;
    await sendMsg(managerUserId, text);
    injectNotification(text, { masterId: master.id, masterAlias: master.alias, city: master.city, serviceType: master.specialization });
  } catch (e) {
    console.error("[managerBot] notifyManagerNewMaster error:", e);
  }
}

// ─── Weekly report (sent every Monday at 09:00 MSK) ──────────────────────────

export async function sendWeeklyReport() {
  if (!managerUserId) {
    console.log("[managerBot] weekly report: no manager user ID, skipping");
    return;
  }

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [allLeads, allOrders, allMasters, allReceipts] = await Promise.all([
      db.select().from(leadsTable).where(isNull(leadsTable.deletedAt)),
      db.select().from(ordersTable).where(isNull(ordersTable.deletedAt)),
      db.select().from(mastersTable).where(isNull(mastersTable.deletedAt)),
      db.select({
        id: receiptsTable.id,
        prepaymentAmount: receiptsTable.prepaymentAmount,
        prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
      }).from(receiptsTable),
    ]);

    // This week stats
    const weekLeads = allLeads.filter(l => new Date(l.createdAt) >= weekAgo);
    const weekOrders = allOrders.filter(o => new Date(o.createdAt) >= weekAgo);
    const completedThisWeek = allOrders.filter(o => o.completedAt && new Date(o.completedAt) >= weekAgo);
    const paidThisWeek = allReceipts.filter(r => r.prepaymentSubmittedAt && new Date(r.prepaymentSubmittedAt) >= weekAgo);
    const weekRevenue = paidThisWeek.reduce((s, r) => s + Number(r.prepaymentAmount ?? 0), 0);

    // Prev week stats (for delta)
    const prevLeads = allLeads.filter(l => new Date(l.createdAt) >= twoWeeksAgo && new Date(l.createdAt) < weekAgo);
    const prevRevenue = allReceipts
      .filter(r => r.prepaymentSubmittedAt && new Date(r.prepaymentSubmittedAt) >= twoWeeksAgo && new Date(r.prepaymentSubmittedAt) < weekAgo)
      .reduce((s, r) => s + Number(r.prepaymentAmount ?? 0), 0);

    const activeMasters = allMasters.filter(m => m.status === "active").length;
    const pendingMasters = allMasters.filter(m => m.status === "pending_contract").length;

    const delta = (a: number, b: number) => {
      if (b === 0) return "";
      const pct = Math.round(((a - b) / b) * 100);
      return pct > 0 ? ` ▲${pct}%` : pct < 0 ? ` ▼${Math.abs(pct)}%` : " →0%";
    };

    const conversionRate = weekLeads.length > 0
      ? Math.round((weekOrders.length / weekLeads.length) * 100)
      : 0;

    const weekNum = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));

    let report = `📊 **Еженедельный отчёт — неделя ${weekNum}**\n\n`;
    report += `**Заявки:** ${weekLeads.length}${delta(weekLeads.length, prevLeads.length)}\n`;
    report += `**Новые заказы:** ${weekOrders.length}\n`;
    report += `**Завершено:** ${completedThisWeek.length}\n`;
    report += `**Оплат получено:** ${paidThisWeek.length} на сумму **${weekRevenue.toLocaleString("ru-RU")} ₽**${delta(weekRevenue, prevRevenue)}\n`;
    report += `**Конверсия лид→заказ:** ${conversionRate}%\n\n`;
    report += `**Мастеров активных:** ${activeMasters}`;
    if (pendingMasters > 0) report += ` (ждут проверки: ${pendingMasters})`;
    report += `\n\n`;

    // Idea of the week
    if (conversionRate < 40) {
      report += `💡 **Идея:** Конверсия ${conversionRate}% — ниже нормы. Автоответ клиентам в первые 5 минут поднимет её до 50%+.\n`;
    } else if (weekRevenue < 50000) {
      report += `💡 **Идея:** Выручка за неделю ${weekRevenue.toLocaleString("ru-RU")} ₽ — можно поднять акцией "Бесплатный выезд мастера до пятницы".\n`;
    } else {
      report += `💡 **Идея:** Хорошая неделя! Попробуйте запустить 1 новый город — возьмите самый частый запрос вне зоны покрытия и наберите там мастера.\n`;
    }

    await sendMsg(managerUserId, report);
    console.log("[managerBot] Weekly report sent");
  } catch (e) {
    console.error("[managerBot] sendWeeklyReport error:", e);
  }
}

// ─── Market detector: cities with 3+ orders but no active masters ─────────────

export async function checkNewMarkets() {
  if (!managerUserId) return;

  try {
    const [allOrders, allMasters] = await Promise.all([
      db.select({ city: ordersTable.city }).from(ordersTable).where(isNull(ordersTable.deletedAt)),
      db.select({ city: mastersTable.city, status: mastersTable.status }).from(mastersTable).where(isNull(mastersTable.deletedAt)),
    ]);

    const activeMasterCities = new Set(
      allMasters.filter(m => m.status === "active").map(m => (m.city ?? "").toLowerCase().trim())
    );

    const ordersByCityMap = new Map<string, number>();
    for (const o of allOrders) {
      const city = (o.city ?? "").trim();
      if (!city) continue;
      ordersByCityMap.set(city, (ordersByCityMap.get(city) ?? 0) + 1);
    }

    const newMarkets: { city: string; count: number }[] = [];
    for (const [city, count] of ordersByCityMap.entries()) {
      if (count >= 3 && !activeMasterCities.has(city.toLowerCase())) {
        newMarkets.push({ city, count });
      }
    }

    if (newMarkets.length === 0) return;

    // Only alert about markets we haven't already alerted about
    const alreadyAlerted = newMarkets.filter(m => alertedMarkets.has(m.city));
    const toAlert = newMarkets.filter(m => !alertedMarkets.has(m.city));

    for (const m of toAlert) alertedMarkets.add(m.city);
    if (toAlert.length === 0) return;

    const lines = toAlert
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(m => `• **${m.city}** — ${m.count} заявок, мастеров нет`)
      .join("\n");

    await sendMsg(
      managerUserId,
      `🗺️ **Обнаружены новые рынки!**\n\n${lines}\n\n💡 Это неохваченный спрос. Наберите мастеров в этих городах — каждая заявка сейчас теряется.`
    );
    console.log(`[managerBot] New markets alert: ${toAlert.map(m => m.city).join(", ")}`);
  } catch (e) {
    console.error("[managerBot] checkNewMarkets error:", e);
  }
}

const alertedMarkets = new Set<string>();

// ─── Autonomous AI Agent ──────────────────────────────────────────────────────

const AUTONOMOUS_SYSTEM_PROMPT = `Ты — автономный AI-операционист ремонтного сервиса "Честный мастер".
Ты работаешь как самостоятельный старший операционист: проверяешь всю систему и СРАЗУ ВЫПОЛНЯЕШЬ нужные действия без ожидания команд.

═══ ПОЛНЫЙ СПИСОК ОБЯЗАННОСТЕЙ (выполняй ВСЁ за один цикл) ═══

📦 ЗАКАЗЫ:
1. Заказы без мастера (get_pending_orders) → разошли каждый (auto_broadcast_order)
2. Нарушения SLA (get_sla_breaches) → заказ >30 мин без рассылки → срочно разошли
3. Зависшие заказы (get_stuck_orders) → master_assigned >48ч → поставь задачу диспетчеру
4. Статус активных заказов (get_active_orders_status) + проверь мастеров (ping_masters_with_active_orders)
5. Уровень отмен (get_cancellation_rate) → если >20% — включи в отчёт как аномалию

💸 ФИНАНСЫ:
6. Долги мастеров (get_debt_summary) → каждому должнику — задачу диспетчеру напомнить
7. Остатки комиссий (get_commission_summary) → просроченные — в отчёт + задача диспетчеру
8. Оплаченные сметы (alert_submitted_receipts) → ОТПРАВЬ уведомление руководителю (сам не подтверждай!)
9. Выручка дня (get_daily_revenue) → динамика vs вчера и прошлая неделя

👷 МАСТЕРА:
10. Новые без первого заказа (get_new_masters_without_orders) → диспетчер уточняет барьеры
11. Неактивные >7 дней (get_inactive_masters) → диспетчер напоминает о работе
12. Незавершённый профиль (get_uncompleted_masters) → диспетчер просит верифицировать / привязать бот

📊 АНАЛИТИКА:
13. Анализ по городам (get_city_analysis) → дефицит мастеров, города без покрытия
14. Топ услуг (get_top_services) + Топ мастеров (get_top_masters) → тренды недели
15. Качество данных (get_data_quality_issues) → дубли, нет заявок 3ч (поломка?)
16. Бизнес-инсайты (get_business_insights) → общая аналитика

═══ СТИЛЬ РАБОТЫ ═══
— СНАЧАЛА вызови инструменты сбора данных (все нужные — приоритет: SLA, заказы, финансы, мастера, аналитика)
— ЗАТЕМ выполни ВСЕ действия: рассылки, задачи диспетчеру, уведомления об оплатах
— В КОНЦЕ вызови finish_cycle: краткий отчёт — что сделал ✅, что нашёл ⚠️, что требует руководителя 🚨
— Будь конкретным: числа, суммы ₽, ID заказов, имена мастеров

═══ КРИТИЧЕСКИЕ ПРАВИЛА ═══
— НЕ подтверждай оплату смет — только вызови alert_submitted_receipts
— НЕ отменяй заказы (только руководитель)
— НЕ создавай заявки автоматически
— ВСЁ остальное — делай сам без вопросов
— Только русский язык
— Максимум 16 раундов — используй эффективно, группируй действия`;

const AUTONOMOUS_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  { type: "function", function: { name: "get_pending_orders", description: "Заказы без мастера", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_today_leads", description: "Заявки за сегодня", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_debt_summary", description: "Долги мастеров", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_commission_summary", description: "Остатки комиссий мастеров (pending/overdue)", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_business_insights", description: "Бизнес-аналитика", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_pending_receipts", description: "Сметы на проверке (полный список)", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_active_orders_status", description: "Статус активных заказов (назначен мастер / в работе)", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "ping_masters_with_active_orders", description: "Проверить каждого мастера с активным заказом через диспетчера — уточнить статус, прогресс, проблемы", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "alert_submitted_receipts", description: "Найти сметы, по которым клиент уже оплатил, и отправить руководителю уведомление с кнопкой подтверждения", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_stuck_orders", description: "Заказы в статусе master_assigned более 48ч без движения", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_sla_breaches", description: "Заказы в статусе new более 30 минут без рассылки мастерам", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_daily_revenue", description: "Выручка сегодня vs вчера vs тот же день прошлой недели", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_top_masters", description: "Топ-5 мастеров по заработанным комиссиям за неделю", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_city_analysis", description: "Анализ по городам: соотношение заявок и мастеров, дефицит", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_top_services", description: "Топ услуг по количеству заказов за неделю", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_cancellation_rate", description: "Уровень отмен заказов сегодня и за неделю, аномалии", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_new_masters_without_orders", description: "Новые мастера (3+ дня), ещё не взявшие ни одного заказа", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_inactive_masters", description: "Мастера без активности более 7 дней", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_uncompleted_masters", description: "Мастера без верификации паспорта или без привязки Max-бота", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_data_quality_issues", description: "Проблемы с данными: дублирующиеся телефоны, отсутствие заявок 3ч (возможная поломка)", parameters: { type: "object", properties: {} } } },
  {
    type: "function",
    function: {
      name: "auto_broadcast_order",
      description: "Разослать заказ мастерам автоматически (без подтверждения)",
      parameters: {
        type: "object",
        properties: { orderId: { type: "number" } },
        required: ["orderId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_task_to_dispatcher",
      description: "Поставить задачу AI-диспетчеру: уточнить у мастера статус, напомнить о долге, проверить готовность",
      parameters: {
        type: "object",
        properties: {
          masterNameOrId: { type: "string" },
          task: { type: "string" },
        },
        required: ["masterNameOrId", "task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_order_note",
      description: "Добавить заметку к заказу",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "number" },
          note: { type: "string" },
        },
        required: ["orderId", "note"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish_cycle",
      description: "Завершить цикл проверки и отправить итоговый отчёт руководителю",
      parameters: {
        type: "object",
        properties: {
          report: { type: "string", description: "Краткий отчёт: что проверил, что сделал, что требует внимания" },
          hasUrgentIssues: { type: "boolean", description: "true если есть срочные проблемы требующие внимания руководителя" },
        },
        required: ["report", "hasUrgentIssues"],
      },
    },
  },
];

async function toolGetActiveOrdersStatus(): Promise<string> {
  const activeOrders = await db.select().from(ordersTable)
    .where(and(
      inArray(ordersTable.status, ["master_assigned", "in_progress"]),
      isNull(ordersTable.deletedAt),
    ))
    .orderBy(desc(ordersTable.updatedAt))
    .limit(20);

  if (activeOrders.length === 0) return "Нет активных заказов.";

  const now = Date.now();
  const lines = activeOrders.map(o => {
    const hoursAgo = Math.round((now - new Date(o.updatedAt).getTime()) / 3600000);
    const stale = hoursAgo > 24 ? " ⚠️ нет активности >24ч" : "";
    return `#${o.id} | ${o.serviceType} | ${o.city} | мастер_id:${o.masterId ?? "–"} | обновлён ${hoursAgo}ч назад${stale}`;
  });
  return lines.join("\n");
}

let autonomousCycleRunning = false;
let lastAutonomousCycleAt: Date | null = null;

export async function runAutonomousCycle(triggerReason = "scheduled") {
  if (!managerUserId) return;
  if (autonomousCycleRunning) {
    console.log("[autonomousAgent] Cycle already running, skipping");
    return;
  }

  autonomousCycleRunning = true;
  lastAutonomousCycleAt = new Date();
  console.log(`[autonomousAgent] Starting cycle (reason: ${triggerReason})`);

  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: AUTONOMOUS_SYSTEM_PROMPT },
      { role: "user", content: `Выполни плановую проверку системы. Причина запуска: ${triggerReason}. Сейчас: ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК.` },
    ];

    // Multi-step agentic loop (max 8 rounds to avoid infinite loops)
    let round = 0;
    const MAX_ROUNDS = 16;
    let finished = false;

    while (round < MAX_ROUNDS && !finished) {
      round++;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools: AUTONOMOUS_TOOLS,
        tool_choice: "auto",
        max_tokens: 1500,
      });

      const choice = response.choices[0];
      const assistantMsg = choice.message;
      messages.push({ role: "assistant", content: assistantMsg.content ?? "", tool_calls: assistantMsg.tool_calls });

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        // No tool calls — just a text reply, treat as done
        if (assistantMsg.content) {
          await sendMsg(managerUserId, `🤖 _Автономная проверка завершена:_\n\n${assistantMsg.content}`);
        }
        finished = true;
        break;
      }

      // Execute each tool call
      for (const tc of assistantMsg.tool_calls) {
        const fnName = tc.function.name;
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}

        let toolResult = "";

        switch (fnName) {
          case "get_pending_orders":
            toolResult = await toolGetPendingOrders();
            break;
          case "get_today_leads":
            toolResult = await toolGetTodayLeads();
            break;
          case "get_debt_summary":
            toolResult = await toolGetDebtSummary();
            break;
          case "get_business_insights":
            toolResult = await toolGetBusinessInsights();
            break;
          case "get_pending_receipts":
            toolResult = await toolGetPendingReceipts();
            break;
          case "get_commission_summary":
            toolResult = await toolGetCommissionSummary();
            break;
          case "get_active_orders_status":
            toolResult = await toolGetActiveOrdersStatus();
            break;
          case "ping_masters_with_active_orders":
            toolResult = await toolPingMastersWithActiveOrders();
            break;
          case "alert_submitted_receipts":
            toolResult = await toolAlertSubmittedReceipts();
            break;
          case "get_stuck_orders":
            toolResult = await toolGetStuckOrders();
            break;
          case "get_sla_breaches":
            toolResult = await toolGetSlaBreaches();
            break;
          case "get_daily_revenue":
            toolResult = await toolGetDailyRevenue();
            break;
          case "get_top_masters":
            toolResult = await toolGetTopMasters();
            break;
          case "get_city_analysis":
            toolResult = await toolGetCityAnalysis();
            break;
          case "get_top_services":
            toolResult = await toolGetTopServices();
            break;
          case "get_cancellation_rate":
            toolResult = await toolGetCancellationRate();
            break;
          case "get_new_masters_without_orders":
            toolResult = await toolGetNewMastersWithoutOrders();
            break;
          case "get_inactive_masters":
            toolResult = await toolGetInactiveMasters();
            break;
          case "get_uncompleted_masters":
            toolResult = await toolGetUncompletedMasters();
            break;
          case "get_data_quality_issues":
            toolResult = await toolGetDataQualityIssues();
            break;
          case "auto_broadcast_order": {
            try {
              const { performBroadcast } = await import("./lib/broadcastOrder.js");
              const result = await performBroadcast(args.orderId);
              if (result.ok) {
                toolResult = `✅ Заказ #${args.orderId} разослан ${result.sent} мастерам.`;
                console.log(`[autonomousAgent] Broadcast order #${args.orderId} → ${result.sent} masters`);
              } else {
                toolResult = `⚠️ Рассылка заказа #${args.orderId}: ${result.error ?? "нет мастеров"}`;
              }
            } catch (e) {
              toolResult = `Ошибка рассылки: ${String(e)}`;
            }
            break;
          }
          case "send_task_to_dispatcher": {
            try {
              const master = await resolveMasterByNameOrId(args.masterNameOrId);
              if (!master) {
                toolResult = `Мастер "${args.masterNameOrId}" не найден — пропускаю.`;
                break;
              }
              // 1. Check quiet hours (don't wake masters at night)
              const { quiet: isQuiet, localTimeStr } = getMasterQuietStatus(master.city);
              if (isQuiet) {
                toolResult = `ТИХИЕ ЧАСЫ: у мастера ${master.alias} сейчас ночь (${localTimeStr}). Пропускаю — напишу утром.`;
                console.log(`[autonomousAgent] Quiet hours skip: ${master.alias} (${localTimeStr})`);
                break;
              }
              // 2. Check dedup
              const dup = checkTaskDedup(master.id);
              if (dup) {
                const minsAgo = Math.round((Date.now() - dup.sentAt.getTime()) / 60000);
                const hoursAgo = minsAgo >= 60 ? `${Math.round(minsAgo / 60)}ч` : `${minsAgo} мин`;
                toolResult = `ДУБЛЬ: мастеру ${master.alias} уже отправляли задачу ${hoursAgo} назад ("${dup.task}"). Пропускаю.`;
                console.log(`[autonomousAgent] Dedup skip: ${master.alias} (sent ${hoursAgo} ago)`);
                break;
              }
              // 3. All clear — send
              const d = await getDispatcherModule();
              toolResult = await d.sendTaskToMaster(String(master.id), args.task);
              recordTaskDedup(master.id, master.alias, args.task);
            } catch (e) {
              toolResult = `Ошибка: ${String(e)}`;
            }
            break;
          }
          case "add_order_note":
            toolResult = await toolAddOrderNote(args.orderId, args.note);
            break;
          case "finish_cycle": {
            const icon = args.hasUrgentIssues ? "🚨" : "✅";
            const prefix = args.hasUrgentIssues
              ? `${icon} _Автономная проверка — требуется ваше внимание:_\n\n`
              : `${icon} _Автономная проверка завершена:_\n\n`;
            await sendMsg(managerUserId, prefix + args.report);
            // Inject into session so manager can ask follow-up
            injectNotification(prefix + args.report, {});
            toolResult = "Отчёт отправлен руководителю.";
            finished = true;
            break;
          }
          default:
            toolResult = "Функция не найдена.";
        }

        messages.push({ role: "tool", content: toolResult, tool_call_id: tc.id } as any);
      }
    }

    if (!finished) {
      console.log("[autonomousAgent] Max rounds reached without finish_cycle");
    }

  } catch (e) {
    console.error("[autonomousAgent] Cycle error:", e);
  } finally {
    autonomousCycleRunning = false;
  }
}

/** Quick check every 30 min: time-sensitive only (new orders without dispatch) */
export async function runQuickAutonomousCheck() {
  if (!managerUserId) return;
  try {
    const now = Date.now();

    // 1. Orders waiting for master > 1h with no dispatch attempt yet → auto-broadcast
    const cutoff1h = new Date(now - 60 * 60 * 1000);
    const undispatched = await db.select().from(ordersTable)
      .where(and(
        eq(ordersTable.status, "waiting_master"),
        eq(ordersTable.dispatchStatus, "none"),
        isNull(ordersTable.deletedAt),
        lte(ordersTable.createdAt, cutoff1h),
      ));

    for (const order of undispatched) {
      try {
        const { performBroadcast } = await import("./lib/broadcastOrder.js");
        const result = await performBroadcast(order.id);
        if (result.ok && result.sent > 0) {
          const text = `📢 _Автоматически разослал заказ #${order.id} (${order.serviceType}, ${order.city}) ${result.sent} мастерам — ждал более 1 часа без рассылки._`;
          await sendMsg(managerUserId, text);
          injectNotification(text, { orderId: order.id, city: order.city ?? undefined, serviceType: order.serviceType ?? undefined });
          console.log(`[autonomousAgent] Quick check: auto-broadcast order #${order.id}`);
        }
      } catch (e) {
        console.error(`[autonomousAgent] Quick broadcast error for order #${order.id}:`, e);
      }
    }

    // 2. SLA alert: orders in "waiting_master" status >30 min without dispatch
    const cutoff30m = new Date(now - 30 * 60 * 1000);
    const slaBreaches = await db.select().from(ordersTable)
      .where(and(
        eq(ordersTable.status, "waiting_master"),
        lte(ordersTable.createdAt, cutoff30m),
        isNull(ordersTable.deletedAt),
      ));

    if (slaBreaches.length > 0) {
      const lines = slaBreaches.map(o => {
        const mins = Math.round((now - new Date(o.createdAt).getTime()) / 60000);
        return `• #${o.id} — ${o.serviceType}, ${o.city} (${mins} мин)`;
      });
      const text = `🚨 _SLA нарушен! ${slaBreaches.length} заказ(а) ждут рассылки >30 мин:_\n${lines.join("\n")}`;
      await sendMsg(managerUserId, text);
      injectNotification(text, {});
      console.log(`[quickCheck] SLA breach: ${slaBreaches.length} orders waiting >30min`);
    }

    // 3. No new leads in 3h → possible site form broken
    const cutoff3h = new Date(now - 3 * 60 * 60 * 1000);
    const recentLeads = await db.select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(gte(leadsTable.createdAt, cutoff3h), isNull(leadsTable.deletedAt)));

    if (recentLeads.length === 0) {
      // Only alert once every 3h by checking last 6h
      const cutoff6h = new Date(now - 6 * 60 * 60 * 1000);
      const prevLeads = await db.select({ id: leadsTable.id })
        .from(leadsTable)
        .where(and(gte(leadsTable.createdAt, cutoff6h), lte(leadsTable.createdAt, cutoff3h), isNull(leadsTable.deletedAt)));

      if (prevLeads.length > 0) {
        // Were leads 3-6h ago but nothing in last 3h → alert
        const text = `🚨 _Внимание! За последние 3 часа не поступило ни одной заявки. Возможна поломка формы на сайте или рекламы._`;
        await sendMsg(managerUserId, text);
        injectNotification(text, {});
        console.log(`[quickCheck] No leads in 3h alert sent`);
      }
    }

  } catch (e) {
    console.error("[autonomousAgent] Quick check error:", e);
  }
}

// ─── Webhook registration ─────────────────────────────────────────────────────

export async function registerManagerWebhook() {
  const token = getToken();
  if (!token) {
    console.log("[managerBot] MANAGER_BOT_TOKEN not set — skipping webhook registration");
    return;
  }

  const host = process.env.PUBLIC_HOST ?? "sfera-project.digital";
  const webhookUrl = `https://${host}/api/manager-webhook`;

  try {
    const res = await fetch(`${MAX_API}/subscriptions`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        update_types: ["message_created", "bot_started", "message_callback"],
      }),
    });
    if (res.ok) {
      console.log("[managerBot] webhook registered:", webhookUrl);
    } else {
      const text = await res.text();
      console.warn("[managerBot] webhook registration failed:", res.status, text);
    }
  } catch (e) {
    console.error("[managerBot] webhook registration error:", e);
  }
}
