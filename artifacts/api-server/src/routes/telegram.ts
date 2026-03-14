import { Router } from "express";
import {
  db, telegramChatsTable, telegramMessagesTable, usersTable,
  mastersTable, ordersTable, voronkaColumnsTable, leadsTable,
  masterMessagesTable, orderDispatchesTable, transactionsTable,
} from "@workspace/db";
import { eq, desc, inArray, and, ne } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";

// ─── Available specializations (synced with service_types) ────────────────────

const SPECIALIZATIONS = [
  "Укладка плитки",
  "Поклейка обоев",
  "Покраска стен",
  "Монтаж ламината",
  "Штукатурка стен",
  "Электромонтаж",
  "Сантехника",
  "Натяжные потолки",
  "Комплексный ремонт",
];

// ─── In-memory bot state machine ─────────────────────────────────────────────

type BotState =
  | { step: "awaiting_alias"; masterId: number }
  | { step: "awaiting_city"; masterId: number }
  | { step: "selecting_specs"; masterId: number; selected: string[]; pickerMessageId?: number }
  | { step: "awaiting_message"; masterId: number }
  | { step: "awaiting_phone"; masterId: number }
  | { step: "confirming_phone"; masterId: number; phone: string }
  | { step: "awaiting_photo"; masterId: number }
  | { step: "awaiting_amount"; masterId: number; orderId: number }
  | { step: "awaiting_cancel_reason"; masterId: number; orderId: number }
  | { step: "awaiting_question"; masterId: number; orderId: number }
  | { step: "awaiting_payment_proof"; masterId: number };

const pendingState = new Map<string, BotState>();

const router = Router();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Telegram API helper ──────────────────────────────────────────────────────

async function tgRequest(method: string, body: object) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId: string | number, text: string, extra?: object) {
  return tgRequest("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

async function editMessage(chatId: string | number, messageId: number, text: string, extra?: object) {
  return tgRequest("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", ...extra });
}

async function answerCallback(callbackQueryId: string, text?: string) {
  return tgRequest("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

// ─── Banners ──────────────────────────────────────────────────────────────────
const DOMAIN = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
console.log(`[banners] DOMAIN="${DOMAIN}" welcome=${DOMAIN ? `https://${DOMAIN}/api/banners/welcome.png` : "none"}`);
const BANNERS = {
  welcome:        DOMAIN ? `https://${DOMAIN}/api/banners/welcome.png` : null,
  new_order:      DOMAIN ? `https://${DOMAIN}/api/banners/new_order.png` : null,
  order_assigned: DOMAIN ? `https://${DOMAIN}/api/banners/order_assigned.png` : null,
};

async function sendBanner(chatId: string | number, bannerKey: keyof typeof BANNERS, caption: string, extra?: object) {
  const url = BANNERS[bannerKey];
  if (!url) {
    console.warn(`[banner] DOMAIN not set, falling back to text for ${bannerKey}`);
    return sendMessage(chatId, caption, extra);
  }
  const result = await tgRequest("sendPhoto", { chat_id: chatId, photo: url, caption, parse_mode: "HTML", ...extra });
  if (result?.ok === false) {
    console.warn(`[banner] sendPhoto failed (${bannerKey}): ${result?.description} — falling back to text`);
    return sendMessage(chatId, caption, extra);
  }
  return result;
}

// ─── Column helpers ───────────────────────────────────────────────────────────

async function getFirstColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols[0] ?? null;
}

async function getFreeColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.receivesOrders) ?? null;
}

async function getOnSiteColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  // Column 3 by position (not receivesOrders, not first)
  const nonReceiving = cols.filter(c => !c.receivesOrders);
  return nonReceiving.find(c => c.position > 1) ?? nonReceiving[0] ?? null;
}

async function getAwaitingPaymentColumn() {
  const cols = await db.select().from(voronkaColumnsTable).orderBy(voronkaColumnsTable.position);
  return cols.find(c => c.name === "Ожидает оплаты") ?? null;
}

// ─── OkiDoki contract creation ────────────────────────────────────────────────

const OKIDOKI_API_URL = "https://api.doki.online";

async function createOkidokiContract(master: { id: number; alias: string; phone: string | null }): Promise<string | null> {
  const apiKey = process.env.OKIDOKI_API_KEY;
  const templateIdRaw = process.env.OKIDOKI_TEMPLATE_ID;
  if (!apiKey || !templateIdRaw) {
    console.warn("[OkiDoki] Missing OKIDOKI_API_KEY or OKIDOKI_TEMPLATE_ID");
    return null;
  }
  // If the env var contains a full URL, extract just the ID (last path segment)
  const templateId = templateIdRaw.startsWith("http")
    ? templateIdRaw.split("/").filter(Boolean).pop()!
    : templateIdRaw;

  const callbackUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/okidoki/webhook`
    : process.env.APP_URL
      ? `${process.env.APP_URL}/api/okidoki/webhook`
      : null;

  const nameParts = master.alias.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts[1] ?? "";

  const systemEntities: { keyword: string; value: string }[] = [
    { keyword: "client_first_name", value: firstName },
  ];
  if (lastName) systemEntities.push({ keyword: "client_last_name", value: lastName });
  if (master.phone) systemEntities.push({ keyword: "client_phone_number", value: master.phone });

  const body: Record<string, any> = {
    api_key: apiKey,
    template_id: templateId,
    external_id: String(master.id),
    source: "RepairCRM",
    system_entities: systemEntities,
    entities: [],
  };
  if (callbackUrl) body.callback_url = callbackUrl;

  try {
    const resp = await fetch(`${OKIDOKI_API_URL}/external/contract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const rawText = await resp.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("[OkiDoki] Non-JSON response:", rawText);
      return null;
    }
    if (!resp.ok || !data?.link) {
      console.error("[OkiDoki] API error:", JSON.stringify(data));
      return null;
    }
    console.log("[OkiDoki] Contract created, link:", data.link);
    return data.link;
  } catch (err) {
    console.error("[OkiDoki] Error creating contract:", err);
    return null;
  }
}

// ─── CRM chat logger — saves registration events as system messages ───────────

async function logToChat(masterId: number, chatId: string, text: string) {
  try {
    await db.insert(masterMessagesTable).values({
      masterId,
      telegramChatId: chatId,
      text,
      fromMaster: false,
      senderName: "system",
      isRead: true,
    });
  } catch {
    // non-critical, ignore errors
  }
}

// ─── Master helpers ───────────────────────────────────────────────────────────

async function findOrCreateMaster(from: any, chatId: string) {
  const telegramId = String(from.id);
  const existing = await db.select().from(mastersTable).where(eq(mastersTable.telegramId, telegramId));
  if (existing[0]) return { master: existing[0], isNew: false };

  // Get the first column
  const firstCol = await getFirstColumn();
  const alias = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || `Мастер_${from.id}`;

  const inserted = await db.insert(mastersTable).values({
    alias,
    city: "Не указан",
    specialization: "Не указана",
    telegramId,
    voronkaColumnId: firstCol?.id ?? null,
    isTestMaster: true,
  }).returning();

  return { master: inserted[0], isNew: true };
}

// ─── Main menu keyboard ───────────────────────────────────────────────────────

function mainMenuKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📋 Доступные заказы", callback_data: "show_orders" }],
        [{ text: "📊 Мои активные заказы", callback_data: "my_orders" }],
        [{ text: "👤 Мой профиль", callback_data: "my_profile" }],
        [{ text: "✉️ Написать оператору", callback_data: "message_operator" }],
      ],
    },
  };
}

// ─── Specialization picker ────────────────────────────────────────────────────

function buildSpecKeyboard(selected: string[]) {
  const selectedSet = new Set(selected);
  const rows: any[][] = [];

  for (let i = 0; i < SPECIALIZATIONS.length; i += 2) {
    const row = [SPECIALIZATIONS[i], SPECIALIZATIONS[i + 1]].filter(Boolean).map(s => ({
      text: (selectedSet.has(s) ? "✅ " : "☐ ") + s,
      callback_data: `spec_toggle_${s}`,
    }));
    rows.push(row);
  }

  const count = selected.length;
  rows.push([{
    text: count > 0
      ? `✅ Подтвердить (${count} ${count === 1 ? "специальность" : count < 5 ? "специальности" : "специальностей"})`
      : "⚠️ Выберите хотя бы одну",
    callback_data: count > 0 ? "spec_confirm" : "spec_noop",
  }]);

  return { reply_markup: { inline_keyboard: rows } };
}

async function sendSpecPicker(chatId: string, selected: string[], messageId?: number) {
  const text = `🔧 <b>Выберите ваши специальности</b>\n\nОтметьте все виды работ, которые вы выполняете.\nМожно выбрать несколько:`;
  const kb = buildSpecKeyboard(selected);
  if (messageId) {
    const r: any = await editMessage(chatId, messageId, text, kb);
    if (r?.ok !== false) return r;
  }
  return sendMessage(chatId, text, kb);
}

// ─── Helper: edit or fallback to send ────────────────────────────────────────

async function editOrSend(chatId: string, messageId: number | undefined, text: string, extra?: object) {
  if (messageId) {
    // Try editing as text message first
    const r: any = await editMessage(chatId, messageId, text, extra);
    if (r?.ok !== false) return r;

    // If that failed the message might be a photo — try editing caption
    const r2: any = await tgRequest("editMessageCaption", {
      chat_id: chatId, message_id: messageId, caption: text, parse_mode: "HTML", ...extra,
    });
    if (r2?.ok !== false) return r2;

    // Both failed — delete old message and send new one to avoid duplication
    await tgRequest("deleteMessage", { chat_id: chatId, message_id: messageId }).catch(() => {});
  }
  return sendMessage(chatId, text, extra);
}

// ─── Show available orders ────────────────────────────────────────────────────

async function showAvailableOrders(chatId: string, master: any, messageId?: number) {
  const backBtn = [{ text: "« Меню", callback_data: "main_menu" }];

  // Block if master has not signed the contract yet
  if (master.status === "pending_contract") {
    const contractLink = await createOkidokiContract(master);
    if (contractLink) {
      await editOrSend(chatId, messageId,
        `📝 <b>Необходимо подписать договор</b>\n\nДоступ к заказам откроется после подписания договора о сотрудничестве.`,
        { reply_markup: { inline_keyboard: [[{ text: "✍️ Подписать договор", url: contractLink }], backBtn] } }
      );
    } else {
      await editOrSend(chatId, messageId,
        `⏳ <b>Ваша заявка рассматривается.</b>\n\nМы сообщим вам, когда аккаунт будет активирован.`,
        { reply_markup: { inline_keyboard: [backBtn] } }
      );
    }
    return;
  }

  // Check if master's column allows receiving orders
  if (master.voronkaColumnId) {
    const col = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId));
    if (col[0] && !col[0].receivesOrders) {
      const colName = col[0].name;
      await editOrSend(chatId, messageId, `⛔ <b>Вы не можете принимать заказы.</b>\n\nВаш статус: <b>${colName}</b>\n\nОбратитесь к оператору для изменения статуса.`, { reply_markup: { inline_keyboard: [backBtn] } });
      return;
    }
  }

  // Check debt
  const masterDebt = Number(master.debt);
  const hasDebt = masterDebt > 0;

  // Check active order limit (debt-aware)
  const activeOrders = await db.select().from(ordersTable)
    .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
  const myActiveCount = activeOrders.filter(o => o.masterId === master.id).length;
  const limit = master.isTestMaster ? 1 : 2;

  if (myActiveCount >= limit) {
    let limitText: string;
    if (hasDebt) {
      limitText = master.isTestMaster
        ? `У вас долг по комиссии: <b>${masterDebt.toLocaleString("ru")} ₽</b>.\n\nВ тестовый период лимит — 1 заказ. Сначала погасите долг, чтобы продолжить работу.`
        : `У вас долг по комиссии: <b>${masterDebt.toLocaleString("ru")} ₽</b>.\n\nПри наличии долга лимит — 2 заказа одновременно. Погасите задолженность для снятия ограничений.`;
    } else {
      limitText = master.isTestMaster
        ? "У вас уже есть активный заказ. В тестовый период нельзя брать более 1 заказа.\n\nПосле завершения и оплаты комиссии лимит будет увеличен до 2."
        : "У вас уже 2 активных заказа. Завершите один из них, чтобы взять новый.";
    }
    await editOrSend(chatId, messageId, `⛔ <b>Лимит заказов</b>\n\n${limitText}`, { reply_markup: { inline_keyboard: [backBtn] } });
    return;
  }

  // Get waiting orders
  const waitingOrders = await db.select().from(ordersTable)
    .where(eq(ordersTable.status, "waiting_master"));

  if (waitingOrders.length === 0) {
    await editOrSend(chatId, messageId, "📭 <b>Нет доступных заказов</b>\n\nПока заказов нет. Вы получите уведомление, когда появится новый заказ.", { reply_markup: { inline_keyboard: [backBtn] } });
    return;
  }

  // Get lead info for orders
  const leadIds = [...new Set(waitingOrders.map(o => o.leadId))];
  const leads = await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds));
  const leadMap = new Map(leads.map(l => [l.id, l]));

  let text = `📋 <b>Доступные заказы (${waitingOrders.length})</b>\n\nВыберите заказ, который хотите взять:\n\n`;

  const buttons = waitingOrders.slice(0, 8).map((o, i) => {
    const area = o.area ? `${Number(o.area)} м²` : "";
    text += `<b>${i + 1}. ${o.serviceType}</b>\n📍 ${o.city}, ${o.district}${area ? ` · ${area}` : ""}\n${o.comment ? `💬 ${o.comment}\n` : ""}\n`;
    return [{ text: `✅ Взять заказ #${o.id}: ${o.serviceType} (${o.city})`, callback_data: `take_order_${o.id}` }];
  });

  await editOrSend(chatId, messageId, text, { reply_markup: { inline_keyboard: [...buttons, backBtn] } });
}

// ─── Show master's active orders ──────────────────────────────────────────────

async function showMyOrders(chatId: string, master: any, messageId?: number) {
  const backBtn = [{ text: "« Меню", callback_data: "main_menu" }];

  const [myOrders, unpaidTxs] = await Promise.all([
    db.select().from(ordersTable).where(and(
      eq(ordersTable.masterId, master.id),
      inArray(ordersTable.status, ["master_assigned", "in_progress", "cancellation_requested"])
    )),
    db.select().from(transactionsTable).where(and(
      eq(transactionsTable.masterId, master.id),
      eq(transactionsTable.paymentStatus, "pending")
    )),
  ]);

  // Fetch completed orders referenced by pending transactions
  let unpaidOrders: any[] = [];
  if (unpaidTxs.length > 0) {
    const unpaidOrderIds = unpaidTxs.map(t => t.orderId);
    unpaidOrders = await db.select().from(ordersTable).where(inArray(ordersTable.id, unpaidOrderIds));
  }

  if (myOrders.length === 0 && unpaidOrders.length === 0) {
    await editOrSend(chatId, messageId, "📭 <b>У вас нет активных заказов.</b>\n\nВозьмите новый заказ через меню.", mainMenuKeyboard());
    return;
  }

  const allLeadIds = [...new Set([...myOrders, ...unpaidOrders].map(o => o.leadId))];
  const leads = await db.select().from(leadsTable).where(inArray(leadsTable.id, allLeadIds));
  const leadMap = new Map(leads.map(l => [l.id, l]));
  const txByOrder = new Map(unpaidTxs.map(t => [t.orderId, t]));

  let text = "";
  const buttons: any[][] = [];

  if (myOrders.length > 0) {
    text += `📊 <b>Активные заказы (${myOrders.length})</b>\n\n`;
    for (const o of myOrders) {
      const lead = leadMap.get(o.leadId);
      const isCancelPending = o.status === "cancellation_requested";
      text += `<b>Заказ #${o.id}: ${o.serviceType}</b>\n`;
      text += `📍 ${o.city}, ${o.district}\n`;
      if (lead?.clientName) text += `👤 Клиент: ${lead.clientName}\n`;
      if (lead?.clientPhone) text += `📞 Телефон: ${lead.clientPhone}\n`;
      if (isCancelPending) text += `⏳ <i>Запрос на отмену рассматривается оператором</i>\n`;
      text += `\n`;
      if (!isCancelPending) {
        buttons.push([
          { text: `✅ Завершить заказ #${o.id}`, callback_data: `complete_order_${o.id}` },
          { text: `❌ Отменить #${o.id}`, callback_data: `cancel_order_${o.id}` },
        ]);
      }
    }
  }

  if (unpaidOrders.length > 0) {
    if (text) text += `─────────────────\n`;
    text += `💳 <b>Ожидают оплаты комиссии (${unpaidOrders.length})</b>\n\n`;
    for (const o of unpaidOrders) {
      const tx = txByOrder.get(o.id);
      text += `<b>Заказ #${o.id}: ${o.serviceType}</b>\n`;
      text += `📍 ${o.city}, ${o.district}\n`;
      if (tx) {
        text += `💰 Стоимость работ: <b>${Number(tx.orderAmount).toLocaleString("ru-RU")} ₽</b>\n`;
        text += `🔸 Комиссия: <b>${Number(tx.commission).toLocaleString("ru-RU")} ₽</b>\n`;
        text += `📲 Реквизиты: <code>89892860863</code> · Альфа Банк · Игорь К.\n`;
      }
      text += `\n`;
    }
    buttons.push([{ text: "📸 Отправить скриншот оплаты", callback_data: "send_payment_proof" }]);
  }

  await editOrSend(chatId, messageId, text.trimEnd(), { reply_markup: { inline_keyboard: [...buttons, backBtn] } });
}

// ─── Show master profile ──────────────────────────────────────────────────────

async function showProfile(chatId: string, master: any, messageId?: number) {
  let colName = "Не в воронке";
  if (master.voronkaColumnId) {
    const col = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId));
    if (col[0]) colName = col[0].name;
  }

  const debt = Number(master.debt);
  const rating = Number(master.rating);
  const stars = "⭐".repeat(Math.round(rating));

  let text = `👤 <b>Ваш профиль</b>\n\n`;
  text += `🏷️ Псевдоним: <b>${master.alias}</b>\n`;
  text += `🏙️ Город: <b>${master.city}</b>\n`;
  const specs = master.specializations && master.specializations.length > 0
    ? master.specializations.join(", ")
    : master.specialization || "Не указана";
  text += `🔧 Специальности: <b>${specs}</b>\n`;
  text += `📍 Статус: <b>${colName}</b>\n`;
  text += `${stars} Рейтинг: <b>${rating.toFixed(1)}</b>\n`;
  text += `📦 Всего заказов: <b>${master.totalOrders}</b>\n`;
  if (debt > 0) text += `⚠️ Долг по комиссии: <b>${debt.toLocaleString("ru")} ₽</b>\n`;
  if (master.isTestMaster) text += `\n🔰 <i>Тестовый период: лимит 1 заказ одновременно</i>`;

  await editOrSend(chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ Изменить специальности", callback_data: "edit_specs" }],
        [{ text: "« Меню", callback_data: "main_menu" }],
      ],
    },
  });
}

// ─── Registration step helpers ────────────────────────────────────────────────

async function askAlias(chatId: string, masterId: number) {
  pendingState.set(chatId, { step: "awaiting_alias", masterId });
  await sendBanner(chatId, "welcome",
    `👋 <b>Добро пожаловать в систему заказов!</b>\n\n` +
    `Пройдите короткую регистрацию — это займёт меньше минуты.\n\n` +
    `<b>Шаг 1 из 5</b> 📝\n\nКак вас зовут? Введите имя или псевдоним, который будет виден операторам:`
  );
}

async function askCity(chatId: string, masterId: number) {
  pendingState.set(chatId, { step: "awaiting_city", masterId });
  await sendMessage(chatId,
    `✅ Имя сохранено!\n\n<b>Шаг 2 из 5</b> 🏙️\n\nВ каком городе вы работаете? Напишите название города:`
  );
}

async function askSpecs(chatId: string, masterId: number) {
  pendingState.set(chatId, { step: "selecting_specs", masterId, selected: [] });
  await sendMessage(chatId, `✅ Город сохранён!\n\n<b>Шаг 3 из 5</b> 🔧`);
  await sendSpecPicker(chatId, []);
}

async function askPhone(chatId: string, masterId: number) {
  pendingState.set(chatId, { step: "awaiting_phone", masterId });
  await sendMessage(chatId,
    `✅ Специальности сохранены!\n\n<b>Шаг 4 из 5</b> 📱\n\nВведите ваш номер телефона вручную.\nОператоры будут использовать его для связи с вами.\n\n<i>Пример: +79001234567</i>`
  );
}

async function askPhoto(chatId: string, masterId: number) {
  pendingState.set(chatId, { step: "awaiting_photo", masterId });
  await sendMessage(chatId,
    `✅ Телефон сохранён!\n\n<b>Шаг 5 из 5</b> 🤳\n\nОтправьте ваше фото — оно будет отображаться в CRM системе рядом с вашим именем.\n\n<i>Загрузите фото из галереи или сделайте снимок прямо сейчас.</i>`
  );
}

async function completeRegistration(chatId: string, master: { id: number; alias: string; city: string; phone: string | null }) {
  // Create OkiDoki contract and put master in pending_contract status
  const contractLink = await createOkidokiContract(master);

  if (contractLink) {
    await db.update(mastersTable).set({ status: "pending_contract" }).where(eq(mastersTable.id, master.id));
    await logToChat(master.id, chatId, `📝 Договор отправлен на подписание`);
    await sendBanner(chatId, "welcome",
      `📝 <b>Осталось подписать договор!</b>\n\n` +
      `👤 Имя: <b>${master.alias}</b>\n` +
      `🏙️ Город: <b>${master.city}</b>\n` +
      `📱 Телефон: <b>${master.phone ?? "не указан"}</b>\n\n` +
      `Для активации аккаунта необходимо подписать договор о сотрудничестве.\n\n` +
      `✍️ <b><a href="${contractLink}">Подписать договор</a></b>\n\n` +
      `После подписания вы получите доступ к заказам. Если ссылка не открывается, нажмите кнопку ниже.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✍️ Подписать договор", url: contractLink }],
          ],
        },
      }
    );
  } else {
    // OkiDoki unavailable — set pending, wait for admin to activate manually
    await db.update(mastersTable).set({ status: "pending_contract" }).where(eq(mastersTable.id, master.id));
    await logToChat(master.id, chatId, `📋 Заявка передана администратору на проверку`);
    await sendBanner(chatId, "welcome",
      `✅ <b>Заявка принята!</b>\n\n` +
      `👤 Имя: <b>${master.alias}</b>\n` +
      `🏙️ Город: <b>${master.city}</b>\n` +
      `📱 Телефон: <b>${master.phone ?? "не указан"}</b>\n\n` +
      `Ваша анкета передана администратору на проверку. После подтверждения вы получите уведомление и доступ к заказам.`
    );
  }
}

// ─── Handle /start ────────────────────────────────────────────────────────────

async function handleStart(from: any, chatId: string) {
  const { master, isNew } = await findOrCreateMaster(from, chatId);

  if (isNew) {
    // New master — start registration from step 1
    await logToChat(master.id, chatId, "🆕 Начало регистрации через Telegram-бот");
    await askAlias(chatId, master.id);
    return;
  }

  // Blocked master (suspended) — refuse access
  if (master.status === "suspended") {
    await sendMessage(chatId, `⛔ <b>Ваш аккаунт заблокирован.</b>\n\nОбратитесь к администратору.`);
    return;
  }

  // Master waiting to sign contract or admin activation
  if (master.status === "pending_contract") {
    await sendMessage(chatId, `⏳ <b>Ваша заявка на рассмотрении.</b>\n\nМы сообщим вам, как только аккаунт будет активирован. Если у вас есть вопросы — обратитесь к администратору.`);
    return;
  }

  // Returning master — check what's missing and resume from there
  if (!master.city || master.city === "Не указан") {
    await sendMessage(chatId, `👋 <b>Добро пожаловать, ${master.alias}!</b>\n\nДавайте завершим регистрацию.`);
    await askCity(chatId, master.id);
    return;
  }

  if (!master.specializations || master.specializations.length === 0) {
    await sendMessage(chatId, `👋 <b>Добро пожаловать, ${master.alias}!</b>\n\nПожалуйста, укажите ваши специальности:`);
    await askSpecs(chatId, master.id);
    return;
  }

  if (!master.phone) {
    await sendMessage(chatId, `👋 <b>Добро пожаловать, ${master.alias}!</b>\n\nОстался последний шаг:`);
    await askPhone(chatId, master.id);
    return;
  }

  // Fully registered — show main menu
  let colName = "Не в воронке";
  if (master.voronkaColumnId) {
    const col = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId));
    if (col[0]) colName = col[0].name;
  }

  await sendBanner(
    chatId,
    "welcome",
    `✅ <b>Добро пожаловать обратно, ${master.alias}!</b>\n\n` +
    `🏙️ Город: <b>${master.city}</b>\n` +
    `📍 Статус: <b>${colName}</b>\n` +
    `🔧 Специальности: <b>${master.specializations.join(", ")}</b>\n` +
    `📦 Заказов: <b>${master.totalOrders}</b>\n` +
    `⭐ Рейтинг: <b>${Number(master.rating).toFixed(1)}</b>`,
    mainMenuKeyboard()
  );
}

// ─── Handle callback_query ────────────────────────────────────────────────────

async function handleCallback(callbackQuery: any) {
  const data = callbackQuery.data as string;
  const from = callbackQuery.from;
  const chatId = String(callbackQuery.message.chat.id);
  const messageId = callbackQuery.message.message_id;
  const cbId = callbackQuery.id;

  // Find master
  const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id)));
  const master = masterRows[0];

  if (!master) {
    await answerCallback(cbId, "⛔ Вы не зарегистрированы. Отправьте /start");
    return;
  }

  if (data === "main_menu") {
    await answerCallback(cbId);
    await editMessage(chatId, messageId,
      `✅ <b>${master.alias}</b> — главное меню`,
      mainMenuKeyboard()
    );
    return;
  }

  if (data === "show_orders") {
    await answerCallback(cbId);
    await showAvailableOrders(chatId, master, messageId);
    return;
  }

  if (data === "my_orders") {
    await answerCallback(cbId);
    await showMyOrders(chatId, master, messageId);
    return;
  }

  if (data === "my_profile") {
    await answerCallback(cbId);
    await showProfile(chatId, master, messageId);
    return;
  }

  // ─── Specialization picker callbacks ───────────────────────────────────────

  if (data.startsWith("spec_toggle_")) {
    const spec = data.replace("spec_toggle_", "");
    let state = pendingState.get(chatId);

    if (!state || state.step !== "selecting_specs") {
      // No active state — start fresh (master updating their specs)
      state = { step: "selecting_specs", masterId: master.id, selected: master.specializations ?? [] };
      pendingState.set(chatId, state);
    }

    const idx = state.selected.indexOf(spec);
    if (idx >= 0) state.selected.splice(idx, 1);
    else state.selected.push(spec);

    await answerCallback(cbId);
    await editMessage(chatId, messageId,
      `🔧 <b>Выберите ваши специальности</b>\n\nОтметьте все виды работ, которые вы выполняете.\nМожно выбрать несколько:`,
      buildSpecKeyboard(state.selected)
    );
    return;
  }

  if (data === "spec_noop") {
    await answerCallback(cbId, "⚠️ Выберите хотя бы одну специальность");
    return;
  }

  if (data === "spec_confirm") {
    const state = pendingState.get(chatId);
    if (!state || state.step !== "selecting_specs" || state.selected.length === 0) {
      await answerCallback(cbId, "⚠️ Выберите хотя бы одну специальность");
      return;
    }
    await answerCallback(cbId, "✅ Сохранено!");

    const specs = state.selected;
    const specText = specs.join(", ");

    await db.update(mastersTable).set({
      specializations: specs,
      specialization: specText,
    }).where(eq(mastersTable.id, master.id));
    await logToChat(master.id, chatId, `🔧 Специальности: ${specText}`);

    // Re-fetch master to get latest phone value after possible update
    const freshMasterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, master.id));
    const freshMaster = freshMasterRows[0];

    if (freshMaster?.phone) {
      pendingState.delete(chatId);
      await editMessage(chatId, messageId,
        `✅ <b>Специальности сохранены!</b>\n\n🔧 ${specText}\n\nТеперь вы можете пользоваться всеми функциями бота:`,
        mainMenuKeyboard()
      );
    } else {
      await askPhone(chatId, master.id);
    }
    return;
  }

  if (data === "edit_specs") {
    // Allow master to update specializations from profile
    const currentSpecs = master.specializations ?? [];
    pendingState.set(chatId, { step: "selecting_specs", masterId: master.id, selected: [...currentSpecs] });
    await answerCallback(cbId);
    await editMessage(chatId, messageId,
      `🔧 <b>Изменить специальности</b>\n\nОтметьте все виды работ, которые вы выполняете:`,
      buildSpecKeyboard(currentSpecs)
    );
    return;
  }

  // ─── Operator message callbacks ────────────────────────────────────────────

  if (data === "message_operator") {
    await answerCallback(cbId);
    pendingState.set(chatId, { step: "awaiting_message", masterId: master.id });
    await editMessage(chatId, messageId,
      `✉️ <b>Написать оператору</b>\n\nНапишите ваш вопрос или сообщение следующим сообщением.\nОператор ответит вам в этом чате.`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_message" }]] } }
    );
    return;
  }

  if (data === "cancel_message") {
    await answerCallback(cbId);
    pendingState.delete(chatId);
    await editMessage(chatId, messageId,
      `✅ <b>${master.alias}</b> — главное меню`,
      mainMenuKeyboard()
    );
    return;
  }

  if (data === "send_payment_proof") {
    await answerCallback(cbId);
    pendingState.set(chatId, { step: "awaiting_payment_proof", masterId: master.id });
    await sendMessage(chatId,
      `📸 <b>Отправьте скриншот оплаты</b>\n\nПришлите фото чека или скриншот перевода — оператор проверит и подтвердит оплату.`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_payment_proof" }]] } }
    );
    return;
  }

  if (data === "cancel_payment_proof") {
    await answerCallback(cbId);
    pendingState.delete(chatId);
    await sendMessage(chatId, `✅ Отмена. Чтобы отправить скриншот позже, нажмите кнопку в сообщении с реквизитами.`);
    return;
  }

  // ─── Phone confirmation callbacks ──────────────────────────────────────────

  if (data === "confirm_phone") {
    const state = pendingState.get(chatId);
    if (!state || state.step !== "confirming_phone") {
      await answerCallback(cbId, "⚠️ Ошибка, начните заново");
      return;
    }
    const phone = state.phone;
    const masterId = state.masterId;

    // Duplicate phone check — block if another master with this phone is suspended
    const duplicates = await db.select().from(mastersTable).where(
      and(eq(mastersTable.phone, phone), ne(mastersTable.id, masterId))
    );
    const suspendedDuplicate = duplicates.find(m => m.status === "suspended");
    if (suspendedDuplicate) {
      await answerCallback(cbId, "⛔ Регистрация заблокирована");
      await editMessage(chatId, messageId,
        `⛔ <b>Регистрация заблокирована</b>\n\nНомер <b>${phone}</b> уже был использован ранее и заблокирован.\n\nОбратитесь к администратору.`
      );
      pendingState.delete(chatId);
      return;
    }

    await answerCallback(cbId, "✅ Номер сохранён!");
    pendingState.delete(chatId);

    await db.update(mastersTable).set({ phone }).where(eq(mastersTable.id, masterId));
    await logToChat(masterId, chatId, `📱 Телефон: ${phone}`);
    await editMessage(chatId, messageId, `📱 Телефон <b>${phone}</b> сохранён.`);
    await askPhoto(chatId, masterId);
    return;
  }

  if (data === "reenter_phone") {
    const state = pendingState.get(chatId);
    const masterId = state?.masterId ?? master.id;
    pendingState.set(chatId, { step: "awaiting_phone", masterId });
    await answerCallback(cbId);
    await editMessage(chatId, messageId,
      `📱 Введите номер телефона заново:\n\n<i>Пример: +79001234567</i>`
    );
    return;
  }

  // ─── Respond to dispatched order ───────────────────────────────────────────
  if (data.startsWith("respond_order_")) {
    const orderId = parseInt(data.replace("respond_order_", ""));

    const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    const order = orderRows[0];

    // Order already assigned to someone else
    if (!order || order.dispatchStatus === "assigned") {
      await answerCallback(cbId, "⛔ Заказ уже назначен другому мастеру");
      const takenText =
        `📋 <b>Заявка #${orderId}</b>\n\n` +
        (order ? `🔧 Услуга: ${order.serviceType}\n📍 Район: ${order.city}${order.district ? ", " + order.district : ""}\n\n` : "") +
        `⛔ <b>Заявка уже назначена другому мастеру.</b>`;
      await editMessage(chatId, messageId, takenText, { reply_markup: { inline_keyboard: [] } });
      return;
    }

    // Check this master's dispatch record
    const dispatchRows = await db.select().from(orderDispatchesTable)
      .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.masterId, master.id)));
    const dispatch = dispatchRows[0];

    if (!dispatch) {
      await answerCallback(cbId, "⚠️ Заявка не найдена");
      return;
    }

    if (dispatch.status === "responded") {
      await answerCallback(cbId, "✅ Вы уже откликнулись — ожидайте оператора");
      return;
    }

    // Check active order limit — master may have taken another order since broadcast
    const activeOrders = await db.select().from(ordersTable)
      .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
    const myActiveCount = activeOrders.filter(o => o.masterId === master.id).length;
    const limit = master.isTestMaster ? 1 : 2;
    if (myActiveCount >= limit) {
      await answerCallback(cbId, `⛔ У вас уже ${myActiveCount} из ${limit} активных заказов`);
      const busyCard =
        `📋 <b>Заявка #${orderId}</b>\n\n` +
        `🔧 Услуга: ${order.serviceType}\n📍 Район: ${order.city}${order.district ? ", " + order.district : ""}\n\n` +
        `⛔ <b>Вы достигли лимита активных заказов (${myActiveCount}/${limit}).</b>\n` +
        `<i>После оплаты комиссии и завершения заказов вы сможете брать новые.</i>`;
      await editMessage(chatId, messageId, busyCard, { reply_markup: { inline_keyboard: [] } });
      return;
    }

    // Mark responded
    await db.update(orderDispatchesTable).set({
      status: "responded",
      respondedAt: new Date(),
    }).where(eq(orderDispatchesTable.id, dispatch.id));

    await answerCallback(cbId, "✅ Отклик отправлен!");

    // Update bot message
    const respondedCard =
      `📋 <b>Заявка #${orderId}</b>\n\n` +
      `🔧 Услуга: <b>${order.serviceType}</b>\n` +
      `📍 Район: <b>${order.city}${order.district ? ", " + order.district : ""}</b>\n` +
      `📐 Объём: <b>${order.area} м²</b>\n\n` +
      `✅ <b>Вы откликнулись!</b> Ожидайте подтверждения оператора.\n` +
      `<i>После подтверждения вы получите контакт клиента.</i>`;

    await editMessage(chatId, messageId, respondedCard, { reply_markup: { inline_keyboard: [] } });

    // Log to CRM chat as system message
    await logToChat(master.id, chatId, `🙋 Откликнулся на заявку #${orderId}`);

    return;
  }

  // ── Ask operator a question about an order ──────────────────────────────────
  if (data.startsWith("ask_question_")) {
    const orderId = parseInt(data.replace("ask_question_", ""));
    if (!master) { await answerCallback(cbId, "⚠️ Профиль не найден"); return; }

    pendingState.set(chatId, { step: "awaiting_question", masterId: master.id, orderId });
    await answerCallback(cbId, "✍️ Напишите ваш вопрос");
    await sendMessage(chatId,
      `💬 <b>Задать вопрос по заявке #${orderId}</b>\n\n` +
      `Напишите ваш вопрос оператору — он получит его в чат и ответит вам здесь.\n\n` +
      `<i>Чтобы отменить, нажмите кнопку ниже.</i>`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_question" }]] } }
    );
    return;
  }

  if (data === "cancel_question") {
    pendingState.delete(chatId);
    await answerCallback(cbId, "Отменено");
    await sendMessage(chatId, "↩️ Вопрос отменён.", mainMenuKeyboard());
    return;
  }

  if (data.startsWith("take_order_")) {
    const orderId = parseInt(data.replace("take_order_", ""));
    await answerCallback(cbId, "⏳ Обрабатываем...");

    // Check column
    if (master.voronkaColumnId) {
      const col = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId));
      if (col[0] && !col[0].receivesOrders) {
        await sendMessage(chatId, `⛔ Вы не можете принимать заказы в статусе «${col[0].name}»`);
        return;
      }
    }

    // Check order limit (debt-aware)
    const activeOrders = await db.select().from(ordersTable)
      .where(inArray(ordersTable.status, ["master_assigned", "in_progress"]));
    const myActiveCount = activeOrders.filter(o => o.masterId === master.id).length;
    const limit = master.isTestMaster ? 1 : 2;
    const takeDebt = Number(master.debt);

    if (myActiveCount >= limit) {
      const debtNote = takeDebt > 0 ? `\n\n💳 У вас долг по комиссии: <b>${takeDebt.toLocaleString("ru")} ₽</b>. Погасите задолженность для снятия ограничений.` : "";
      await sendMessage(chatId, `⛔ <b>Лимит заказов</b>\n\nУ вас уже ${myActiveCount} из ${limit} активных заказов.${debtNote}`);
      return;
    }

    // Get order
    const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    const order = orderRows[0];

    if (!order || order.status !== "waiting_master") {
      await sendMessage(chatId, "❌ Заказ уже занят или не найден.");
      return;
    }

    // Get lead
    const leadRows = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId));
    const lead = leadRows[0];

    // Assign order
    await db.update(ordersTable).set({
      masterId: master.id,
      status: "in_progress",
      updatedAt: new Date(),
    }).where(eq(ordersTable.id, orderId));

    // Update master stats + move to "На объекте" column
    const onSiteCol = await getOnSiteColumn();
    await db.update(mastersTable).set({
      totalOrders: master.totalOrders + 1,
      acceptedOrders: master.acceptedOrders + 1,
      voronkaColumnId: onSiteCol?.id ?? master.voronkaColumnId,
    }).where(eq(mastersTable.id, master.id));

    let text = `🎉 <b>Заказ #${orderId} взят!</b>\n\n`;
    text += `🔧 <b>${order.serviceType}</b>\n`;
    text += `📍 ${order.city}, ${order.district}\n`;
    if (lead?.clientName) text += `👤 Клиент: <b>${lead.clientName}</b>\n`;
    if (lead?.clientPhone) text += `📞 Телефон: <b>${lead.clientPhone}</b>\n`;
    if (order.comment) text += `💬 ${order.comment}\n`;
    text += `\nУдачи! Свяжитесь с клиентом и приступайте к работе.`;

    await editMessage(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: `✅ Завершить заказ #${orderId}`, callback_data: `complete_order_${orderId}` }],
          [{ text: "« Меню", callback_data: "main_menu" }],
        ],
      },
    });
    return;
  }

  if (data.startsWith("complete_order_")) {
    const orderId = parseInt(data.replace("complete_order_", ""));

    const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    const order = orderRows[0];

    if (!order || order.masterId !== master.id) {
      await answerCallback(cbId, "❌ Заказ не найден или не ваш");
      return;
    }

    // Ask master to enter the final work amount
    await answerCallback(cbId);
    pendingState.set(chatId, { step: "awaiting_amount", masterId: master.id, orderId });
    await editMessage(chatId, messageId,
      `💰 <b>Завершение заказа #${orderId}</b>\n\n` +
      `🔧 ${order.serviceType} — ${order.city}${order.district ? ", " + order.district : ""}\n\n` +
      `Введите итоговую стоимость выполненных работ в рублях.\n` +
      `<i>Пример: 35000</i>\n\n` +
      `<b>Только цифры, без пробелов и знаков.</b>`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: `cancel_amount_${orderId}` }]] } }
    );
    return;
  }

  if (data.startsWith("cancel_amount_")) {
    const orderId = parseInt(data.replace("cancel_amount_", ""));
    pendingState.delete(chatId);
    await answerCallback(cbId);
    await showMyOrders(chatId, master, messageId);
    return;
  }

  // ── Request order cancellation ────────────────────────────────────────────
  if (data.startsWith("cancel_order_")) {
    const orderId = parseInt(data.replace("cancel_order_", ""));

    const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    const order = orderRows[0];

    if (!order || order.masterId !== master.id) {
      await answerCallback(cbId, "❌ Заказ не найден или не ваш");
      return;
    }

    await answerCallback(cbId);
    pendingState.set(chatId, { step: "awaiting_cancel_reason", masterId: master.id, orderId });
    await editMessage(chatId, messageId,
      `❌ <b>Отмена заказа #${orderId}</b>\n\n` +
      `🔧 ${order.serviceType} — ${order.city}${order.district ? ", " + order.district : ""}\n\n` +
      `Укажите причину отмены — оператор её рассмотрит и примет решение.\n\n` +
      `<i>Например: клиент отменил, не смог выехать, изменились обстоятельства...</i>`,
      { reply_markup: { inline_keyboard: [[{ text: "« Назад", callback_data: `abort_cancel_${orderId}` }]] } }
    );
    return;
  }

  if (data.startsWith("abort_cancel_")) {
    pendingState.delete(chatId);
    await answerCallback(cbId);
    await showMyOrders(chatId, master, messageId);
    return;
  }
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

router.post("/webhook", async (req, res) => {
  res.sendStatus(200); // always respond immediately

  const update = req.body;

  try {
    // Handle callback queries (button presses)
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return;
    }

    const message = update.message || update.edited_message;
    if (!message) return;

    const from = message.from;
    const chatId = String(message.chat.id);
    const text = (message.text ?? "").trim();

    // Register/update telegram chat record
    const existing = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, chatId));
    if (!existing[0]) {
      await db.insert(telegramChatsTable).values({
        telegramChatId: chatId,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        stage: "new",
        lastMessage: text,
        lastMessageAt: new Date(),
        unreadCount: 1,
      });
    } else {
      await db.update(telegramChatsTable).set({
        lastMessage: text,
        lastMessageAt: new Date(),
        unreadCount: (existing[0].unreadCount || 0) + 1,
        updatedAt: new Date(),
      }).where(eq(telegramChatsTable.telegramChatId, chatId));
    }

    // Save message
    if (text) {
      await db.insert(telegramMessagesTable).values({
        chatId,
        telegramMessageId: message.message_id,
        text,
        fromBot: false,
        senderName: [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Мастер",
      });
    }

    // Handle commands
    if (text === "/start" || text.startsWith("/start ")) {
      await handleStart(from, chatId);
      return;
    }

    if (text === "/orders") {
      const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id)));
      if (!masterRows[0]) {
        await sendMessage(chatId, "⛔ Вы не зарегистрированы. Отправьте /start для регистрации.");
        return;
      }
      await showAvailableOrders(chatId, masterRows[0]);
      return;
    }

    if (text === "/myorders") {
      const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id)));
      if (!masterRows[0]) {
        await sendMessage(chatId, "⛔ Вы не зарегистрированы. Отправьте /start для регистрации.");
        return;
      }
      await showMyOrders(chatId, masterRows[0]);
      return;
    }

    if (text === "/profile") {
      const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id)));
      if (!masterRows[0]) {
        await sendMessage(chatId, "⛔ Вы не зарегистрированы. Отправьте /start для регистрации.");
        return;
      }
      await showProfile(chatId, masterRows[0]);
      return;
    }

    if (text === "/menu") {
      const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id)));
      if (!masterRows[0]) {
        await sendMessage(chatId, "⛔ Вы не зарегистрированы. Отправьте /start для регистрации.");
        return;
      }
      const master = masterRows[0];
      await sendMessage(chatId,
        `✅ <b>${master.alias}</b> — главное меню`,
        mainMenuKeyboard()
      );
      return;
    }

    // Handle shared contact (phone number)
    const contact = (update.message as any)?.contact;
    if (contact && contact.phone_number) {
      const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id)));
      const contactMaster = masterRows[0];
      if (contactMaster) {
        await db.update(mastersTable).set({ phone: contact.phone_number }).where(eq(mastersTable.id, contactMaster.id));
        pendingState.delete(chatId);
        await tgRequest("sendMessage", {
          chat_id: chatId,
          text: `📱 Телефон <b>${contact.phone_number}</b> сохранён.`,
          parse_mode: "HTML",
          reply_markup: { remove_keyboard: true },
        });
        await askPhoto(chatId, contactMaster.id);
      }
      return;
    }

    // Check pending state
    const state = pendingState.get(chatId);

    // ── Step 1: awaiting alias ────────────────────────────────────────────────
    if (state?.step === "awaiting_alias" && text) {
      const alias = text.slice(0, 80).trim();
      await db.update(mastersTable).set({ alias }).where(eq(mastersTable.id, state.masterId));
      await logToChat(state.masterId, chatId, `✏️ Имя: ${alias}`);
      await askCity(chatId, state.masterId);
      return;
    }

    // ── Step 2: awaiting city ─────────────────────────────────────────────────
    if (state?.step === "awaiting_city" && text) {
      const city = text.slice(0, 100).trim();
      await db.update(mastersTable).set({ city }).where(eq(mastersTable.id, state.masterId));
      await logToChat(state.masterId, chatId, `🏙️ Город: ${city}`);
      await askSpecs(chatId, state.masterId);
      return;
    }

    // ── Payment proof photo ────────────────────────────────────────────────────
    if (state?.step === "awaiting_payment_proof") {
      const photoArr = (update.message as any)?.photo as { file_id: string }[] | undefined;
      const hasPhoto = photoArr && photoArr.length > 0;

      if (!hasPhoto) {
        await sendMessage(chatId, `📸 Нужно отправить именно фотографию (скриншот). Попробуйте ещё раз.`);
        return;
      }

      const fileId = photoArr[photoArr.length - 1].file_id;
      const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
      const fileData = await fileResp.json() as any;
      const filePath = fileData?.result?.file_path;
      const photoUrl = filePath ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}` : null;

      if (!photoUrl) {
        await sendMessage(chatId, `⚠️ Не удалось загрузить фото. Попробуйте ещё раз.`);
        return;
      }

      const proofMasterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, state.masterId));
      const proofAlias = proofMasterRows[0]?.alias ?? "Мастер";

      await db.insert(masterMessagesTable).values({
        masterId: state.masterId,
        telegramChatId: chatId,
        text: `📸 Скриншот оплаты комиссии`,
        fromMaster: true,
        senderName: proofAlias,
        isRead: false,
        photoUrl,
      });

      pendingState.delete(chatId);
      await sendMessage(chatId, `✅ Скриншот получен! Оператор проверит оплату и переведёт вас в статус «Свободен».`);
      return;
    }

    // ── Step 5: awaiting photo ─────────────────────────────────────────────────
    if (state?.step === "awaiting_photo") {
      const photoArr = (update.message as any)?.photo as { file_id: string; width: number; height: number }[] | undefined;
      const hasPhoto = photoArr && photoArr.length > 0;

      if (hasPhoto) {
        // Download the largest photo and save URL
        const fileId = photoArr[photoArr.length - 1].file_id;
        const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
        const fileData = await fileResp.json() as any;
        const filePath = fileData?.result?.file_path;
        const photoUrl = filePath ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}` : null;

        if (photoUrl) {
          // Save to telegram_chats.avatar_url
          const tgExisting = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, chatId));
          if (tgExisting[0]) {
            await db.update(telegramChatsTable).set({ avatarUrl: photoUrl }).where(eq(telegramChatsTable.telegramChatId, chatId));
          } else {
            await db.insert(telegramChatsTable).values({
              telegramChatId: chatId,
              avatarUrl: photoUrl,
              lastMessage: "",
              lastMessageAt: new Date(),
            });
          }
          // Also save to masters.customAvatarUrl as backup
          await db.update(mastersTable).set({ customAvatarUrl: photoUrl }).where(eq(mastersTable.id, state.masterId));
        }

        pendingState.delete(chatId);
        const freshRows = await db.select().from(mastersTable).where(eq(mastersTable.id, state.masterId));
        const fresh = freshRows[0];
        await logToChat(state.masterId, chatId, `📸 Фото профиля загружено`);
        await sendMessage(chatId, `📸 Фото сохранено!`);
        await completeRegistration(chatId, { id: state.masterId, alias: fresh?.alias ?? "", city: fresh?.city ?? "", phone: fresh?.phone ?? null });
        return;
      }

      // Text received instead of photo — prompt again
      await sendMessage(chatId,
        `📸 Необходимо отправить фотографию.\n\nЗагрузите фото из галереи или сделайте снимок — без фото регистрация не завершится.`
      );
      return;
    }

    // ── Step 4: awaiting phone (manual text input) ────────────────────────────
    if (state?.step === "awaiting_phone" && text) {
      const rawPhone = text.trim().replace(/\s+/g, "");
      // Basic validation: must have at least 10 digits
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length < 10) {
        await sendMessage(chatId,
          `⚠️ Похоже, это не номер телефона.\n\nВведите корректный номер, например: <b>+79001234567</b>`
        );
        return;
      }
      // Store in confirming_phone state
      pendingState.set(chatId, { step: "confirming_phone", masterId: state.masterId, phone: rawPhone });
      await sendMessage(chatId,
        `📱 Вы ввели номер: <b>${rawPhone}</b>\n\nВсё верно?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Да, верно", callback_data: "confirm_phone" },
                { text: "✏️ Изменить", callback_data: "reenter_phone" },
              ],
            ],
          },
        }
      );
      return;
    }

    // ── Awaiting order amount from master ────────────────────────────────────
    if (state?.step === "awaiting_amount") {
      const amount = parseFloat(text.replace(/\s+/g, "").replace(",", "."));
      if (isNaN(amount) || amount <= 0 || amount > 100_000_000) {
        await sendMessage(chatId,
          `⚠️ Некорректная сумма. Введите только цифры, без пробелов и знаков.\n\n<i>Пример: 35000</i>`
        );
        return;
      }

      const { masterId: amountMasterId, orderId } = state;
      const amountMasterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, amountMasterId));
      const amountMaster = amountMasterRows[0];
      if (!amountMaster) {
        await sendMessage(chatId, "❌ Мастер не найден.");
        pendingState.delete(chatId);
        return;
      }

      const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
      const order = orderRows[0];

      if (!order || order.masterId !== amountMaster.id) {
        await sendMessage(chatId, "❌ Заказ не найден или не ваш.");
        pendingState.delete(chatId);
        return;
      }

      // Save proposed amount and mark order completed
      const { calculateCommission, getCommissionSettings } = await import("../lib/commission.js");
      const commSettings = await getCommissionSettings();
      const autoCommission = calculateCommission(amount, commSettings);

      await db.update(ordersTable).set({
        proposedAmount: String(amount),
        status: "completed",
        updatedAt: new Date(),
      }).where(eq(ordersTable.id, orderId));

      // Move master to "Ожидает оплаты" — NOT to free column
      const awaitingCol = await getAwaitingPaymentColumn();
      if (awaitingCol) {
        await db.update(mastersTable).set({
          voronkaColumnId: awaitingCol.id,
        }).where(eq(mastersTable.id, amountMaster.id));
      }
      // If column doesn't exist — leave master in current column (don't move to free)

      pendingState.delete(chatId);

      // Log to CRM chat
      await logToChat(amountMaster.id, chatId,
        `💰 Завершил заказ #${orderId}. Предложенная сумма: ${amount.toLocaleString("ru-RU")} ₽`
      );

      await sendMessage(chatId,
        `✅ <b>Заказ #${orderId} завершён!</b>\n\n` +
        `💰 Указанная сумма: <b>${amount.toLocaleString("ru-RU")} ₽</b>\n` +
        `🔸 Предварительная комиссия: <b>${autoCommission.toLocaleString("ru-RU")} ₽</b>\n\n` +
        `⏳ <b>Сумма отправлена на модерацию.</b>\n` +
        `Оператор проверит и подтвердит её — после этого будет начислена комиссия.\n\n` +
        `💳 Ваш статус: <b>Ожидает оплаты комиссии</b>\n` +
        `После оплаты комиссии вы сможете брать новые заказы.`,
        mainMenuKeyboard()
      );
      return;
    }

    // ── Awaiting cancel reason ───────────────────────────────────────────────
    if (state?.step === "awaiting_cancel_reason" && text) {
      const { masterId, orderId } = state;
      const reason = text.trim();
      if (!reason) {
        await sendMessage(chatId, "⚠️ Пожалуйста, введите причину отмены текстом.");
        return;
      }

      await db.update(ordersTable).set({
        status: "cancellation_requested",
        cancelReason: reason,
        updatedAt: new Date(),
      }).where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId)));

      pendingState.delete(chatId);

      await logToChat(masterId, chatId,
        `❌ Запросил отмену заказа #${orderId}. Причина: ${reason}`
      );

      await sendMessage(chatId,
        `📋 <b>Запрос на отмену отправлен</b>\n\n` +
        `Заказ #${orderId} — <b>ожидает решения оператора.</b>\n\n` +
        `Указанная причина: <i>${reason}</i>\n\n` +
        `Оператор рассмотрит запрос и подтвердит или отклонит отмену.`,
        mainMenuKeyboard()
      );
      return;
    }

    // ── Awaiting question for operator ──────────────────────────────────────
    if (state?.step === "awaiting_question" && text) {
      const { masterId, orderId } = state;
      const question = text.trim();
      if (!question) {
        await sendMessage(chatId, "⚠️ Пожалуйста, напишите вопрос текстом.");
        return;
      }

      pendingState.delete(chatId);

      const qMasterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
      const qAlias = qMasterRows[0]?.alias ?? "Мастер";

      // Save as a regular master message (visible in CRM chat)
      await db.insert(masterMessagesTable).values({
        masterId,
        telegramChatId: chatId,
        text: `❓ Вопрос по заявке #${orderId}: ${question}`,
        fromMaster: true,
        senderName: qAlias,
        isRead: false,
        photoUrl: null,
      });

      // Mark dispatch as "responded" so operator sees the "Назначить" button in CRM chat
      const dispatchRows = await db.select().from(orderDispatchesTable)
        .where(and(eq(orderDispatchesTable.orderId, orderId), eq(orderDispatchesTable.masterId, masterId)));
      const dispatch = dispatchRows[0];
      if (dispatch && dispatch.status === "sent") {
        await db.update(orderDispatchesTable).set({
          status: "responded",
          respondedAt: new Date(),
        }).where(eq(orderDispatchesTable.id, dispatch.id));
      }

      // Confirm question sent
      await sendMessage(chatId,
        `✅ <b>Вопрос отправлен оператору</b>\n\n` +
        `<i>${question}</i>\n\n` +
        `Оператор увидит его в чате и ответит вам здесь.`
      );

      // Re-send the order card with "Откликнуться" button so master can still respond
      const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
      const order = orderRows[0];
      if (order && order.dispatchStatus === "dispatching") {
        let servicesBlock = "";
        try {
          const srvs = order.services ? JSON.parse(order.services) : null;
          if (Array.isArray(srvs) && srvs.length > 0) {
            servicesBlock = "\n🔧 Услуги:\n" + srvs.map((s: any, i: number) =>
              `   ${i + 1}. <b>${s.type}</b> — ${s.area} м²${s.pricePerM2 ? ` × ${s.pricePerM2.toLocaleString("ru-RU")} ₽/м²` : ""}`
            ).join("\n") + "\n";
          }
        } catch {}
        if (!servicesBlock) servicesBlock = `\n🔧 Услуга: <b>${order.serviceType}</b>\n📐 Объём: <b>${order.area} м²</b>\n`;
        const cardText =
          `📋 <b>Заявка #${orderId}</b>\n` + servicesBlock +
          `📍 Район: <b>${order.city}${order.district ? ", " + order.district : ""}</b>` +
          (order.comment ? `\n💬 Комментарий: ${order.comment}` : "") +
          `\n\n<i>Нажмите кнопку, чтобы откликнуться.</i>`;
        await sendMessage(chatId, cardText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Откликнуться 🙋", callback_data: `respond_order_${orderId}` }],
              [{ text: "💬 Задать вопрос оператору", callback_data: `ask_question_${orderId}` }],
            ],
          },
        });
      } else {
        await sendMessage(chatId, "Используйте кнопки меню ниже 👇", mainMenuKeyboard());
      }
      return;
    }

    if (state?.step === "awaiting_message") {
      const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id)));
      const master = masterRows[0];
      const photoArr = (update.message as any)?.photo as { file_id: string; width: number; height: number }[] | undefined;
      const hasPhoto = photoArr && photoArr.length > 0;
      if (master && (text || hasPhoto)) {
        pendingState.delete(chatId);
        let photoUrl: string | null = null;
        if (hasPhoto) {
          const fileId = photoArr[photoArr.length - 1].file_id;
          const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
          const fileData = await fileResp.json() as any;
          const filePath = fileData?.result?.file_path;
          if (filePath) photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        }

        await db.insert(masterMessagesTable).values({
          masterId: master.id,
          telegramChatId: chatId,
          text: text ?? "",
          fromMaster: true,
          senderName: master.alias,
          isRead: false,
          photoUrl,
        });

        const previewText = hasPhoto ? "📷 Фото" : `<i>«${text}»</i>`;
        await sendMessage(
          chatId,
          `✅ <b>Сообщение отправлено оператору!</b>\n\n${previewText}\n\nОтвет придёт сюда же. Обычно отвечаем в течение нескольких часов.`,
          mainMenuKeyboard()
        );
      }
      return;
    }

    // For non-command messages from registered masters:
    // if a conversation already exists (operator wrote first), treat as a free reply
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id)));
    const masterFallback = masterRows[0];
    if (masterFallback && (text || (update.message as any)?.photo)) {
      const photoArr2 = (update.message as any)?.photo as { file_id: string }[] | undefined;
      const hasPhoto2 = photoArr2 && photoArr2.length > 0;

      // Check if there's an existing conversation thread with this master
      const existingMsgs = await db.select().from(masterMessagesTable)
        .where(eq(masterMessagesTable.masterId, masterFallback.id))
        .orderBy(desc(masterMessagesTable.createdAt))
        .limit(1);

      if (existingMsgs.length > 0) {
        // Conversation exists — save this as a direct reply
        let photoUrl2: string | null = null;
        if (hasPhoto2) {
          const fileId = photoArr2[photoArr2.length - 1].file_id;
          const fileResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
          const fileData = await fileResp.json() as any;
          const filePath = fileData?.result?.file_path;
          if (filePath) photoUrl2 = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        }

        await db.insert(masterMessagesTable).values({
          masterId: masterFallback.id,
          telegramChatId: chatId,
          text: text ?? "",
          fromMaster: true,
          senderName: masterFallback.alias,
          isRead: false,
          photoUrl: photoUrl2,
        });

        const previewText2 = hasPhoto2 ? "📷 Фото" : `<i>«${text}»</i>`;
        await sendMessage(
          chatId,
          `✅ <b>Сообщение отправлено оператору!</b>\n\n${previewText2}\n\nОтвет придёт сюда же.`,
          mainMenuKeyboard()
        );
      } else {
        // No conversation — show menu hint
        await sendMessage(chatId, "Используйте кнопки меню ниже 👇", mainMenuKeyboard());
      }
    }

  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// ─── Notify master of new order (called when order created in CRM) ────────────

router.post("/notify-new-order", requireRole("admin", "master_operator"), async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  const orderRows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: "Order not found" });

  const leadRows = await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId));
  const lead = leadRows[0];

  // Find all masters in "free" (receivesOrders=true) columns with telegram
  const freeCols = await db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.receivesOrders, true));
  const freeColIds = freeCols.map(c => c.id);

  const masters = freeColIds.length > 0
    ? await db.select().from(mastersTable).where(inArray(mastersTable.voronkaColumnId, freeColIds))
    : [];

  const mastersWithTelegram = masters.filter(m => m.telegramId);
  let notified = 0;

  for (const master of mastersWithTelegram) {
    try {
      await sendMessage(
        master.telegramId!,
        `🆕 <b>Новый заказ #${order.id}!</b>\n\n` +
        `🔧 ${order.serviceType}\n` +
        `📍 ${order.city}, ${order.district}\n` +
        `${order.comment ? `💬 ${order.comment}\n` : ""}`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: "✅ Взять заказ", callback_data: `take_order_${order.id}` }]],
          },
        }
      );
      notified++;
    } catch {}
  }

  res.json({ success: true, notified });
});

// ─── Setup webhook ────────────────────────────────────────────────────────────

router.post("/setup-webhook", requireRole("admin"), async (req, res) => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) return res.status(500).json({ error: "REPLIT_DOMAINS not set" });
  const webhookUrl = `https://${domain}/api/telegram/webhook`;
  const result = await tgRequest("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
  });
  res.json({ ...result, webhookUrl });
});

router.get("/webhook-info", requireRole("admin"), async (req, res) => {
  const result = await fetch(`${TELEGRAM_API}/getWebhookInfo`).then(r => r.json());
  res.json(result);
});

// ─── CRM chat management (kept for operator UI) ───────────────────────────────

router.get("/chats", requireAuth, async (_req, res) => {
  const chats = await db.select().from(telegramChatsTable).orderBy(desc(telegramChatsTable.lastMessageAt));
  const operators = await db.select().from(usersTable);
  const operatorMap = new Map(operators.map(u => [u.id, u.name]));
  res.json(chats.map(c => ({
    id: c.id, telegramChatId: c.telegramChatId, username: c.username ?? null,
    firstName: c.firstName ?? null, lastName: c.lastName ?? null,
    avatarUrl: c.avatarUrl ?? null, stage: c.stage,
    assignedOperatorId: c.assignedOperatorId ?? null,
    assignedOperatorName: c.assignedOperatorId ? (operatorMap.get(c.assignedOperatorId) ?? null) : null,
    lastMessage: c.lastMessage ?? null, lastMessageAt: c.lastMessageAt ?? null,
    unreadCount: c.unreadCount, createdAt: c.createdAt,
  })));
});

router.patch("/chats/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { stage, assignedOperatorId } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (stage !== undefined) updates.stage = stage;
  if (assignedOperatorId !== undefined) updates.assignedOperatorId = assignedOperatorId;
  const result = await db.update(telegramChatsTable).set(updates).where(eq(telegramChatsTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Chat not found" });
  res.json(result[0]);
});

router.get("/chats/:chatId/messages", requireAuth, async (req, res) => {
  const chatId = req.params.chatId;
  const messages = await db.select().from(telegramMessagesTable)
    .where(eq(telegramMessagesTable.chatId, chatId)).orderBy(telegramMessagesTable.createdAt);
  await db.update(telegramChatsTable).set({ unreadCount: 0 }).where(eq(telegramChatsTable.telegramChatId, chatId));
  res.json(messages.map(m => ({
    id: m.id, chatId: m.chatId, text: m.text, fromBot: m.fromBot,
    senderName: m.senderName ?? null, createdAt: m.createdAt,
  })));
});

router.post("/chats/:chatId/send", requireAuth, async (req, res) => {
  const chatId = req.params.chatId;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  const tgResult = await tgRequest("sendMessage", { chat_id: chatId, text });
  if (!tgResult.ok) return res.status(500).json({ error: "Failed to send", details: tgResult });
  const message = await db.insert(telegramMessagesTable).values({
    chatId, telegramMessageId: tgResult.result?.message_id ?? null,
    text, fromBot: true, senderName: "Оператор",
  }).returning();
  await db.update(telegramChatsTable).set({
    lastMessage: text, lastMessageAt: new Date(), updatedAt: new Date(),
  }).where(eq(telegramChatsTable.telegramChatId, chatId));
  res.json(message[0]);
});

export default router;
