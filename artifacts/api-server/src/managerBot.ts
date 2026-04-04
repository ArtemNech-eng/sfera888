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

async function toolSearchOrders(query: string, statusFilter?: string) {
  const allOrders = await db.select().from(ordersTable)
    .where(isNull(ordersTable.deletedAt))
    .orderBy(desc(ordersTable.createdAt))
    .limit(200);

  const allLeads = await db.select().from(leadsTable).where(isNull(leadsTable.deletedAt));
  const leadMap = new Map(allLeads.map(l => [l.id, l]));

  const q = query.toLowerCase().trim();
  const matches = allOrders.filter(o => {
    const lead = leadMap.get(o.leadId);
    if (statusFilter && o.status !== statusFilter) return false;
    return (
      String(o.id) === q ||
      o.serviceType.toLowerCase().includes(q) ||
      o.city.toLowerCase().includes(q) ||
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

═══════════════════════════════════════
📐 ПРАВИЛА РАБОТЫ
═══════════════════════════════════════
— Пиши кратко и по делу — ты в мессенджере
— Прежде чем создавать заявку/менять статус/подтверждать паспорт — ВСЕГДА вызывай propose_* функцию
— Если в сообщении есть данные клиента (имя, телефон, тип работ) — сразу вызывай propose_lead_creation
— Если руководитель спрашивает "кто лучший мастер для X" — сначала get_preference, потом get_available_masters
— Когда спрашивают о конкретном клиенте или заказе — используй search_orders
— При анализе данных всегда сравнивай с целью: "движемся ли мы к миллиарду?"
— Используй только русский язык`;

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
    await sendMsg(
      managerUserId,
      `💰 Клиент оплатил бронь!\n\nСмета #${receipt.id}\n👤 ${receipt.clientName} (${receipt.clientPhone})\n${cityStr}${serviceStr}${masterStr}\n💵 Сумма брони: **${amount} ₽**\n\n_Проверьте скриншот в CRM → Оплаты._`
    );
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
    await sendMsg(
      managerUserId,
      `🆕 Новый мастер зарегистрировался!\n\n👷 **${master.alias}**${phoneStr}\n📍 ${master.city} · ${master.specialization}\n\n_Требует проверки паспорта и подписания договора._\nCRM → Мастера → #${master.id}`
    );
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
