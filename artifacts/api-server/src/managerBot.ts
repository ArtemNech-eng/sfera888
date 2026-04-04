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
} from "@workspace/db";
import { eq, and, isNull, desc, gte, sql, inArray, lte } from "drizzle-orm";
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
  type: "create_lead" | "broadcast_order" | "set_order_status" | "approve_passport";
  data: Record<string, any>;
  description: string;
}

interface Session {
  messages: Message[];
  pending: PendingConfirmation | null;
}

const sessions = new Map<number, Session>();
const MAX_HISTORY = 16;

function getSession(userId: number): Session {
  if (!sessions.has(userId)) {
    sessions.set(userId, { messages: [], pending: null });
  }
  return sessions.get(userId)!;
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
    const svcMatch = !serviceType || o.serviceType.toLowerCase().includes(serviceType.toLowerCase().split(" ")[0]);
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
  🪪 Паспорт: ${master.passportVerified ? "✅ подтверждён" : "⏳ не подтверждён"}`;
}

async function toolSetOrderStatus(orderId: number, status: string, note?: string) {
  const validStatuses = ["waiting_master", "master_assigned", "in_progress", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    return `Неверный статус. Допустимые: ${validStatuses.join(", ")}`;
  }

  const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!rows[0]) return `Заказ #${orderId} не найден.`;

  const update: any = { status, updatedAt: new Date() };
  if (note) update.operatorNote = note;
  if (status === "completed") update.completedAt = new Date();

  await db.update(ordersTable).set(update).where(eq(ordersTable.id, orderId));

  const statusLabels: Record<string, string> = {
    waiting_master: "ожидает мастера",
    master_assigned: "мастер назначен",
    in_progress: "в работе",
    completed: "завершён",
    cancelled: "отменён",
  };

  return `✅ Заказ #${orderId} → статус «${statusLabels[status] ?? status}»${note ? `. Заметка: ${note}` : ""}.`;
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

const SYSTEM_PROMPT = `Ты — AI-ассистент руководителя ремонтного сервиса "Честный мастер".
Ты помогаешь управлять бизнесом прямо из мессенджера.

Твои возможности:
- Создавать заявки из голосовых/текстовых сообщений
- Показывать мастеров по городу (с умным ранжированием по опыту)
- Рассылать заказы мастерам
- Формировать отчёты (заявки, заказы, выручка, конверсия)
- Финансовая аналитика: выручка, долги мастеров
- Статистика по конкретному мастеру
- Менять статус заказа
- Добавлять заметки к заказам
- Подтверждать паспорта мастеров
- Запоминать предпочтения (например, какой мастер лучше для определённого типа работ)
- Просматривать переписку диспетчера с мастером (get_master_conversation)
- Сводный отчёт по активности: кто из мастеров молчит, кто ответил (get_dispatcher_activity)
- Ставить задачи AI-диспетчеру: написать мастеру конкретное сообщение (send_task_to_dispatcher)

Правила:
- Говори кратко и по делу. Ты в мессенджере, не в документе.
- Прежде чем создавать заявку, менять статус или подтверждать паспорт — всегда вызывай propose_* функцию.
- Если в сообщении есть данные клиента (имя, телефон, тип работ) — сразу вызывай propose_lead_creation.
- Используй русский язык.
- Если руководитель спрашивает "кто лучший мастер для X" — проверь предпочтения через get_preference, потом get_available_masters.`;

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

  try {
    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
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

        let toolResult = "";

        switch (fnName) {
          case "get_pending_orders":
            toolResult = await toolGetPendingOrders();
            break;
          case "get_today_leads":
            toolResult = await toolGetTodayLeads();
            break;
          case "get_available_masters":
            toolResult = await toolGetAvailableMasters(args.city, args.serviceType);
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
          case "send_task_to_dispatcher": {
            const d = await getDispatcherModule();
            toolResult = await d.sendTaskToMaster(args.masterNameOrId, args.task);
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
          { role: "system", content: SYSTEM_PROMPT },
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
  await sendMsg(
    managerUserId,
    `🆕 Новая заявка #${lead.id}${src}\n👤 ${lead.clientName} · ${lead.clientPhone}\n📍 ${lead.city} · ${lead.serviceType}`
  );
}

/** Called when a master responds to an order (from dispatch.ts) */
export async function notifyManagerMasterResponse(
  orderId: number,
  masterAlias: string,
  accepted: boolean,
) {
  if (!managerUserId) return;
  if (accepted) {
    await sendMsg(
      managerUserId,
      `🙋 **${masterAlias}** откликнулся на заказ #${orderId}\n\nНазначить мастера? Откройте CRM → Буфер заказов.`
    );
  } else {
    await sendMsg(
      managerUserId,
      `❌ **${masterAlias}** отказался от заказа #${orderId}`
    );
  }
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

    await sendMsg(
      managerUserId,
      `⚠️ Заказы ждут мастера слишком долго (${newStale.length}):\n${lines}\n\nПопробуйте повторную рассылку.`
    );
  } catch (e) {
    console.error("[managerBot] checkStaleOrders error:", e);
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
