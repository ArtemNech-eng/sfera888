/**
 * Manager Bot — AI assistant for the business owner.
 * Second Max bot (MANAGER_BOT_TOKEN), separate from the masters bot.
 *
 * Capabilities:
 *  - Natural language + voice → create leads
 *  - Suggest & approve masters
 *  - Broadcast orders
 *  - Daily / weekly reports
 *  - Query pending orders / today's leads
 */

import OpenAI from "openai";
import {
  db,
  leadsTable,
  ordersTable,
  mastersTable,
  orderDispatchesTable,
  receiptsTable,
  transactionsTable,
} from "@workspace/db";
import { eq, and, isNull, desc, gte, sql, inArray } from "drizzle-orm";
import { performBroadcast } from "./lib/broadcastOrder.js";

const MAX_API = "https://platform-api.max.ru";

function getToken(): string | undefined {
  return process.env.MANAGER_BOT_TOKEN;
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ─── Conversation context ─────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

interface PendingConfirmation {
  type: "create_lead" | "broadcast_order" | "assign_master";
  data: Record<string, any>;
  description: string;
}

interface Session {
  messages: Message[];
  pending: PendingConfirmation | null;
}

const sessions = new Map<number, Session>();
const MAX_HISTORY = 12;

function getSession(userId: number): Session {
  if (!sessions.has(userId)) {
    sessions.set(userId, { messages: [], pending: null });
  }
  return sessions.get(userId)!;
}

function addMessage(session: Session, msg: Message) {
  session.messages.push(msg);
  if (session.messages.length > MAX_HISTORY) {
    session.messages = session.messages.slice(-MAX_HISTORY);
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
  await maxPost("/messages", "user_id", userId, { text });
}

async function sendWithButtons(userId: number, text: string, buttons: { text: string; payload: string }[][]) {
  await maxPost("/messages", "user_id", userId, {
    text,
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
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("webm") ? "webm" : "ogg";
    const file = new File([buffer], `voice.${ext}`, { type: mimeType });
    const result = await openai.audio.transcriptions.create({ model: "whisper-1", file, language: "ru" });
    return result.text || null;
  } catch (e) {
    console.error("[managerBot] Whisper error:", e);
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

async function toolGetAvailableMasters(city: string, serviceType?: string) {
  const masters = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)))
    .orderBy(desc(mastersTable.rating));

  const cityLower = city.toLowerCase();
  const filtered = masters.filter(m => m.city?.toLowerCase() === cityLower);

  if (filtered.length === 0) return `В городе ${city} нет активных мастеров.`;

  return `Мастера в ${city} (${filtered.length}):\n` + filtered.slice(0, 8).map(m => {
    const priceStr = serviceType && m.servicePrices
      ? (() => {
          const sp = (m.servicePrices as any[]).find((p: any) =>
            p.service?.toLowerCase().includes(serviceType.toLowerCase().split(" ")[0])
          );
          return sp ? ` | цена: от ${sp.priceFrom} ₽` : "";
        })()
      : "";
    return `• #${m.id} ${m.alias} | рейтинг: ${m.rating} | заказов: ${m.totalOrders}${priceStr}`;
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

  return `📊 Отчёт ${periodLabel}:

📋 Заявки (${leadsAll.length} всего):
  • Новые: ${leadsNew}
  • В обработке: ${leadsProcessing}
  • Отправлено в работу: ${leadsSentToWork}
  • Нецелевые: ${leadsNonTarget}
  • Отказ клиента: ${leadsClientRefusal}
  • Конверсия в работу: ${leadsAll.length > 0 ? Math.round(leadsSentToWork / leadsAll.length * 100) : 0}%

📦 Заказы (${ordersAll.length} всего):
  • Ждут мастера: ${ordersWaiting}
  • Назначен мастер: ${ordersAssigned}
  • Завершены: ${ordersCompleted}
  • Отменены: ${ordersCancelled}`;
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
      description: "Получить список доступных мастеров в городе",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Город" },
          serviceType: { type: "string", description: "Тип работ (опционально)" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_report",
      description: "Сформировать отчёт за период",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["day", "week", "month"], description: "Период: day, week, month" },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_lead_creation",
      description: "Предложить создание заявки на основе сообщения. Вызывай когда руководитель хочет добавить клиента или заявку.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string", description: "Имя клиента" },
          clientPhone: { type: "string", description: "Телефон клиента" },
          city: { type: "string", description: "Город" },
          district: { type: "string", description: "Район (если указан)" },
          serviceType: { type: "string", description: "Тип работ" },
          area: { type: "number", description: "Площадь в м² (если известна)" },
          description: { type: "string", description: "Описание / комментарий" },
          scheduledAt: { type: "string", description: "Дата/время выезда ISO8601 (если указана)" },
        },
        required: ["clientName", "clientPhone", "city", "serviceType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_broadcast",
      description: "Предложить разослать заказ всем мастерам города",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "number", description: "ID заказа" },
        },
        required: ["orderId"],
      },
    },
  },
];

const SYSTEM_PROMPT = `Ты — AI-ассистент руководителя ремонтного сервиса "Честный мастер".
Ты помогаешь:
- Создавать заявки от клиентов из голосовых/текстовых сообщений
- Находить подходящих мастеров
- Рассылать заказы мастерам
- Формировать отчёты
- Отвечать на вопросы о состоянии бизнеса

Правила:
- Говори кратко и по делу. Ты в мессенджере, не в документе.
- Прежде чем создавать заявку или рассылать — всегда вызывай propose_* функцию, не создавай без подтверждения.
- Если в сообщении есть данные клиента (имя, телефон, адрес, тип работ) — сразу вызывай propose_lead_creation.
- Если что-то не указано — спроси, но только самое важное (телефон обязателен).
- Используй русский язык.`;

// ─── Main update handler ──────────────────────────────────────────────────────

export async function handleManagerUpdate(update: unknown) {
  const u = update as any;
  console.log("[managerBot] update type:", u.update_type ?? "unknown");

  // ── Callback (button press) ───────────────────────────────────────────────
  if (u.update_type === "callback" || u.callback) {
    const cb = u.callback ?? u;
    const userId: number = cb.user?.user_id ?? 0;
    const payload: string = cb.payload ?? "";
    if (!userId) return;

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
      await maxPost("/messages", "chat_id", chatId, {
        text: "👋 Привет! Я ваш AI-ассистент.\n\nМогу:\n• Создавать заявки из голосовых сообщений\n• Найти мастеров и разослать заказ\n• Показать отчёт\n\nПросто напишите или отправьте голосовое.",
      });
    }
    return;
  }

  if (u.update_type !== "message_created") return;

  const msg = u.message;
  if (!msg) return;

  const userId: number = msg.sender?.user_id ?? 0;
  if (!userId) return;

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
      max_tokens: 800,
    });

    const choice = response.choices[0];
    const assistantMsg = choice.message;

    // ── Handle tool calls ─────────────────────────────────────────────────
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      addMessage(session, { role: "assistant", content: assistantMsg.content ?? "" });

      for (const tc of assistantMsg.tool_calls) {
        const fnName = tc.function.name;
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments); } catch {}

        let toolResult = "";

        if (fnName === "get_pending_orders") {
          toolResult = await toolGetPendingOrders();
        } else if (fnName === "get_today_leads") {
          toolResult = await toolGetTodayLeads();
        } else if (fnName === "get_available_masters") {
          toolResult = await toolGetAvailableMasters(args.city, args.serviceType);
        } else if (fnName === "get_report") {
          toolResult = await toolGetReport(args.period ?? "week");
        } else if (fnName === "propose_lead_creation") {
          // Store pending confirmation
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
        } else if (fnName === "propose_broadcast") {
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

        addMessage(session, { role: "tool", content: toolResult, tool_call_id: tc.id, name: fnName });
      }

      // Second AI call with tool results
      const followUp = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...session.messages,
        ],
        max_tokens: 600,
      });

      const reply = followUp.choices[0]?.message?.content ?? "";
      if (reply) {
        addMessage(session, { role: "assistant", content: reply });
        await sendMsg(userId, reply);
      }
    } else {
      // Plain text response
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
