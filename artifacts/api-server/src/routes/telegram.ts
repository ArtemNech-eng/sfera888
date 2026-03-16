import { Router } from "express";
import {
  db, telegramChatsTable, telegramMessagesTable, usersTable,
  mastersTable, ordersTable, voronkaColumnsTable, leadsTable,
  masterMessagesTable, orderDispatchesTable, transactionsTable,
} from "@workspace/db";
import { eq, desc, inArray, and, ne } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth.js";
import { createYandexPayOrder, pollYandexPayStatus, confirmPayment } from "./yandex-pay.js";

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
  | { step: "awaiting_payment_proof"; masterId: number }
  | { step: "edit_profile_photo"; masterId: number }
  | { step: "edit_profile_alias"; masterId: number }
  | { step: "edit_profile_city"; masterId: number }
  | { step: "edit_profile_phone"; masterId: number };

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
const BANNERS = {
  welcome:        DOMAIN ? `https://${DOMAIN}/api/banners/welcome.png` : null,
  new_order:      DOMAIN ? `https://${DOMAIN}/api/banners/new_order.png` : null,
  order_assigned: DOMAIN ? `https://${DOMAIN}/api/banners/order_assigned.png` : null,
};

// Track which message IDs are photo messages (to avoid double API calls in editOrSend)
const photoMessages = new Map<string, number>(); // key: `${chatId}:${messageId}`

async function sendBanner(chatId: string | number, bannerKey: keyof typeof BANNERS, caption: string, extra?: object) {
  const url = BANNERS[bannerKey];
  if (!url) return sendMessage(chatId, caption, extra);
  const result = await tgRequest("sendPhoto", { chat_id: chatId, photo: url, caption, parse_mode: "HTML", ...extra });
  if (result?.ok === false) return sendMessage(chatId, caption, extra);
  // Mark this message as a photo so editOrSend skips editMessageText
  const msgId = result?.result?.message_id;
  if (msgId) photoMessages.set(`${chatId}:${msgId}`, Date.now());
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

// ─── Contract link (static — same for all masters) ────────────────────────────

const CONTRACT_LINK = "https://desktop.doki.online/contract/6916b2861ea1593f469a6786";

function createOkidokiContract(_master: { id: number }): string {
  return CONTRACT_LINK;
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
        [{ text: "💳 Неоплаченные заказы", callback_data: "my_unpaid" }],
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
    const key = `${chatId}:${messageId}`;
    const isPhoto = photoMessages.has(key);

    if (isPhoto) {
      // Photo message — edit caption directly (no wasted editMessageText call)
      const r: any = await tgRequest("editMessageCaption", {
        chat_id: chatId, message_id: messageId, caption: text, parse_mode: "HTML", ...extra,
      });
      if (r?.ok !== false) return r;
      // Failed — delete and resend as text
      photoMessages.delete(key);
      await tgRequest("deleteMessage", { chat_id: chatId, message_id: messageId }).catch(() => {});
    } else {
      // Text message — edit normally
      const r: any = await editMessage(chatId, messageId, text, extra);
      if (r?.ok !== false) return r;
    }
  }
  return sendMessage(chatId, text, extra);
}

// ─── Show available orders ────────────────────────────────────────────────────

async function showAvailableOrders(chatId: string, master: any, messageId?: number) {
  const backBtn = [{ text: "« Меню", callback_data: "main_menu" }];

  // Block if master has not signed the contract yet
  if (master.status === "pending_contract") {
    const contractLink = createOkidokiContract(master);
    await editOrSend(chatId, messageId,
      `📝 <b>Необходимо подписать договор</b>\n\nДоступ к заказам откроется после подписания договора о сотрудничестве.`,
      { reply_markup: { inline_keyboard: [[{ text: "✍️ Подписать договор", url: contractLink }], backBtn] } }
    );
    return;
  }

  // Fetch column, active orders, and waiting orders in parallel
  const [colRows, allActiveOrders, waitingOrders] = await Promise.all([
    master.voronkaColumnId
      ? db.select().from(voronkaColumnsTable).where(eq(voronkaColumnsTable.id, master.voronkaColumnId))
      : Promise.resolve([] as any[]),
    db.select({ masterId: ordersTable.masterId }).from(ordersTable)
      .where(inArray(ordersTable.status, ["master_assigned", "in_progress"])),
    db.select().from(ordersTable).where(eq(ordersTable.status, "waiting_master")),
  ]);

  // Column check
  if (colRows[0] && !colRows[0].receivesOrders) {
    await editOrSend(chatId, messageId, `⛔ <b>Вы не можете принимать заказы.</b>\n\nВаш статус: <b>${colRows[0].name}</b>\n\nОбратитесь к оператору для изменения статуса.`, { reply_markup: { inline_keyboard: [backBtn] } });
    return;
  }

  // Active order limit check
  const masterDebt = Number(master.debt);
  const hasDebt = masterDebt > 0;
  const myActiveCount = allActiveOrders.filter((o: any) => o.masterId === master.id).length;
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

  // Filter by master's specializations
  const masterSpecs: string[] = (master.specializations ?? []).map((s: string) => s.toLowerCase().trim());
  const matchingOrders = masterSpecs.length > 0
    ? waitingOrders.filter((o: any) => {
        const orderTypes = (o.serviceType ?? "").split(/,\s*/).map((t: string) => t.toLowerCase().trim());
        return orderTypes.some((t: string) => masterSpecs.includes(t));
      })
    : waitingOrders;

  if (matchingOrders.length === 0) {
    const msg = waitingOrders.length > 0
      ? "📭 <b>Нет подходящих заказов</b>\n\nЗаказы есть, но ни один не соответствует вашим специальностям.\n\nЧтобы видеть больше заказов — обновите специальности в профиле."
      : "📭 <b>Нет доступных заказов</b>\n\nПока заказов нет. Вы получите уведомление, когда появится новый заказ.";
    await editOrSend(chatId, messageId, msg, { reply_markup: { inline_keyboard: [backBtn] } });
    return;
  }

  // Fetch lead info in parallel with nothing else needed
  const leadIds = [...new Set(matchingOrders.map((o: any) => o.leadId).filter(Boolean))];
  const leads = leadIds.length > 0
    ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds as number[]))
    : [];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  let text = `📋 <b>Доступные заказы (${matchingOrders.length})</b>\n\nВыберите заказ, который хотите взять:\n\n`;

  const buttons = matchingOrders.slice(0, 8).map((o: any, i: number) => {
    const area = o.area ? `${Number(o.area)} м²` : "";
    text += `<b>${i + 1}. ${o.serviceType}</b>\n📍 ${o.city}, ${o.district}${area ? ` · ${area}` : ""}\n${o.comment ? `💬 ${o.comment}\n` : ""}\n`;
    return [{ text: `✅ Взять заказ #${o.id}: ${o.serviceType} (${o.city})`, callback_data: `take_order_${o.id}` }];
  });

  await editOrSend(chatId, messageId, text, { reply_markup: { inline_keyboard: [...buttons, backBtn] } });
}

// ─── Show master's active orders ──────────────────────────────────────────────

async function showMyOrders(chatId: string, master: any, messageId?: number) {
  const backBtn = [{ text: "« Меню", callback_data: "main_menu" }];

  const [myOrders, allPendingTxs] = await Promise.all([
    db.select().from(ordersTable).where(and(
      eq(ordersTable.masterId, master.id),
      inArray(ordersTable.status, ["master_assigned", "in_progress", "cancellation_requested"])
    )),
    db.select().from(transactionsTable).where(and(
      eq(transactionsTable.masterId, master.id),
      eq(transactionsTable.paymentStatus, "pending")
    )),
  ]);

  // Active order IDs — don't show these in "awaiting payment" section
  const activeOrderIds = new Set(myOrders.map(o => o.id));
  // Real unpaid txs = commission confirmed (>0) and order no longer active
  const unpaidTxs = allPendingTxs.filter(t => Number(t.commission) > 0 && !activeOrderIds.has(t.orderId));
  // Placeholder txs for active orders (commission unknown yet)
  const placeholderByOrder = new Map(
    allPendingTxs.filter(t => Number(t.commission) === 0).map(t => [t.orderId, t])
  );

  // Fetch completed orders referenced by real pending transactions
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
      const hasPlaceholder = placeholderByOrder.has(o.id);
      text += `<b>Заказ #${o.id}: ${o.serviceType}</b>\n`;
      text += `📍 ${o.city}, ${o.district}\n`;
      if (lead?.clientName) text += `👤 Клиент: ${lead.clientName}\n`;
      if (lead?.clientPhone) text += `📞 Телефон: ${lead.clientPhone}\n`;
      if (hasPlaceholder) text += `🔸 <i>Комиссия: сумма будет известна после завершения</i>\n`;
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

// ─── Show unpaid orders ───────────────────────────────────────────────────────

async function showUnpaidOrders(chatId: string, master: any, messageId?: number) {
  const backBtn = [{ text: "« Меню", callback_data: "main_menu" }];

  const allPendingTxs = await db.select().from(transactionsTable).where(and(
    eq(transactionsTable.masterId, master.id),
    eq(transactionsTable.paymentStatus, "pending")
  ));
  // Only show confirmed amounts (commission > 0); placeholders are shown in active orders
  const unpaidTxs = allPendingTxs.filter(t => Number(t.commission) > 0);

  if (unpaidTxs.length === 0) {
    await editOrSend(chatId, messageId, "✅ <b>Нет неоплаченных заказов</b>\n\nВсе комиссии оплачены.", { reply_markup: { inline_keyboard: [backBtn] } });
    return;
  }

  const unpaidOrderIds = unpaidTxs.map(t => t.orderId);
  const unpaidOrders = await db.select().from(ordersTable).where(inArray(ordersTable.id, unpaidOrderIds));
  const txByOrder = new Map(unpaidTxs.map(t => [t.orderId, t]));

  let text = `💳 <b>Неоплаченные комиссии (${unpaidTxs.length})</b>\n\n`;
  const buttons: any[][] = [];

  for (const o of unpaidOrders) {
    const tx = txByOrder.get(o.id);
    if (!tx) continue;
    const commission = Number(tx.commission);
    text += `<b>Заказ #${o.id}: ${o.serviceType}</b>\n`;
    text += `📍 ${o.city}, ${o.district}\n`;
    text += `💰 Стоимость работ: <b>${Number(tx.orderAmount).toLocaleString("ru-RU")} ₽</b>\n`;
    text += `🔸 Комиссия: <b>${commission.toLocaleString("ru-RU")} ₽</b>\n\n`;
    buttons.push([{ text: `💳 Оплатить ${commission.toLocaleString("ru-RU")} ₽ онлайн`, callback_data: `pay_online_${tx.id}` }]);
  }

  text += `📲 Или переведите вручную: <code>89892860863</code> · Альфа Банк · Игорь К.`;

  buttons.push([{ text: "📸 Отправить скриншот оплаты", callback_data: "send_payment_proof" }]);
  buttons.push(backBtn);

  await editOrSend(chatId, messageId, text, { reply_markup: { inline_keyboard: buttons } });
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
        [{ text: "🤳 Изменить фото", callback_data: "edit_photo" }],
        [{ text: "✏️ Изменить имя", callback_data: "edit_alias" }, { text: "🏙️ Изменить город", callback_data: "edit_city" }],
        [{ text: "📱 Изменить телефон", callback_data: "edit_phone" }],
        [{ text: "🔧 Изменить специальности", callback_data: "edit_specs" }],
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
    `<b>Шаг 1 из 5</b> 📝\n\n` +
    `Как вас зовут? Введите имя или псевдоним.\n` +
    `<i>Например: Иван или Иван Краснодар</i>\n\n` +
    `⬇️ <b>Напишите имя прямо сейчас:</b>`
  );
}

async function askCity(chatId: string, masterId: number, isResume = false) {
  pendingState.set(chatId, { step: "awaiting_city", masterId });
  const prefix = isResume
    ? `👋 Продолжаем регистрацию!\n\n`
    : `✅ Имя сохранено!\n\n`;
  await sendMessage(chatId,
    `${prefix}<b>Шаг 2 из 5</b> 🏙️\n\nВ каком городе вы работаете?\n<i>Например: Краснодар</i>\n\n⬇️ <b>Напишите город:</b>`
  );
}

async function askSpecs(chatId: string, masterId: number, isResume = false) {
  pendingState.set(chatId, { step: "selecting_specs", masterId, selected: [] });
  const prefix = isResume
    ? `👋 Продолжаем регистрацию!\n\n`
    : `✅ Город сохранён!\n\n`;
  await sendMessage(chatId, `${prefix}<b>Шаг 3 из 5</b> 🔧\n\nВыберите ваши специальности.\n<i>Отметьте все виды работ, которые вы выполняете, затем нажмите «Подтвердить»:</i>`);
  await sendSpecPicker(chatId, []);
}

async function askPhone(chatId: string, masterId: number, isResume = false) {
  pendingState.set(chatId, { step: "awaiting_phone", masterId });
  const prefix = isResume
    ? `👋 Продолжаем регистрацию!\n\n`
    : `✅ Специальности сохранены!\n\n`;
  await sendMessage(chatId,
    `${prefix}<b>Шаг 4 из 5</b> 📱\n\nВведите ваш номер телефона.\nОператоры используют его для связи с вами.\n\n<i>Пример: +79001234567</i>\n\n⬇️ <b>Напишите номер:</b>`
  );
}

async function askPhoto(chatId: string, masterId: number, isResume = false) {
  pendingState.set(chatId, { step: "awaiting_photo", masterId });
  const prefix = isResume
    ? `👋 Продолжаем регистрацию!\n\n`
    : `✅ Телефон сохранён!\n\n`;
  await sendMessage(chatId,
    `${prefix}<b>Шаг 5 из 5</b> 🤳\n\nОтправьте ваше фото профиля.\nОно будет отображаться в CRM рядом с вашим именем.\n\n` +
    `<i>Как отправить фото:\n• Нажмите скрепку 📎 рядом с полем ввода\n• Выберите «Фото или видео» из галереи\n• Выберите фото и отправьте</i>\n\n` +
    `⬇️ <b>Отправьте фото:</b>`
  );
}

// ─── Resume incomplete registration from correct step ─────────────────────────
async function resumeRegistration(chatId: string, master: any) {
  if (!master.city || master.city === "Не указан") {
    await askCity(chatId, master.id, true);
    return;
  }
  if (!master.specializations || master.specializations.length === 0) {
    await askSpecs(chatId, master.id, true);
    return;
  }
  if (!master.phone) {
    await askPhone(chatId, master.id, true);
    return;
  }
  if (master.status !== "pending_contract" && master.status !== "active") {
    await askPhoto(chatId, master.id, true);
    return;
  }
}

async function completeRegistration(chatId: string, master: { id: number; alias: string; city: string; phone: string | null }) {
  const contractLink = createOkidokiContract(master);

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
  const isIncomplete = !master.city || master.city === "Не указан"
    || !master.specializations || master.specializations.length === 0
    || !master.phone
    || (master.status !== "pending_contract" && master.status !== "active" && master.status !== "suspended");

  if (isIncomplete) {
    await resumeRegistration(chatId, master);
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

  // Answer callback & find master in parallel — spinner clears immediately
  const [, masterRows] = await Promise.all([
    answerCallback(cbId),
    db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id))),
  ]);
  const master = masterRows[0];

  if (!master) {
    await tgRequest("sendMessage", { chat_id: chatId, text: "⛔ Вы не зарегистрированы. Отправьте /start" });
    return;
  }

  if (data === "main_menu") {
    await editMessage(chatId, messageId,
      `✅ <b>${master.alias}</b> — главное меню`,
      mainMenuKeyboard()
    );
    return;
  }

  if (data === "show_orders") {
    await showAvailableOrders(chatId, master, messageId);
    return;
  }

  if (data === "my_orders") {
    await showMyOrders(chatId, master, messageId);
    return;
  }

  if (data === "my_unpaid") {
    await showUnpaidOrders(chatId, master, messageId);
    return;
  }

  if (data.startsWith("pay_online_")) {
    const txId = parseInt(data.replace("pay_online_", ""));
    const txRows = await db.select().from(transactionsTable).where(
      and(eq(transactionsTable.id, txId), eq(transactionsTable.masterId, master.id))
    );
    const tx = txRows[0];
    if (!tx) {
      await editOrSend(chatId, messageId, "⚠️ Транзакция не найдена.", { reply_markup: { inline_keyboard: [[{ text: "« Назад", callback_data: "my_unpaid" }]] } });
      return;
    }
    if (tx.paymentStatus === "paid") {
      await editOrSend(chatId, messageId, "✅ Эта комиссия уже оплачена.", { reply_markup: { inline_keyboard: [[{ text: "« Назад", callback_data: "my_unpaid" }]] } });
      return;
    }
    try {
      const commission = Number(tx.commission);
      const paymentUrl = await createYandexPayOrder(
        tx.id,
        commission,
        `Комиссия по заказу #${tx.orderId}`
      );
      await editOrSend(chatId, messageId,
        `💳 <b>Оплата комиссии ${commission.toLocaleString("ru-RU")} ₽</b>\n\n` +
        `Нажмите кнопку ниже для оплаты через Яндекс Пэй.\n\n` +
        `После оплаты нажмите <b>«Я оплатил — проверить»</b>.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: `💳 Оплатить ${commission.toLocaleString("ru-RU")} ₽`, url: paymentUrl }],
              [{ text: "✅ Я оплатил — проверить", callback_data: `check_payment_${tx.id}` }],
              [{ text: "« Назад", callback_data: "my_unpaid" }],
            ],
          },
        }
      );
    } catch (e: any) {
      console.error("[pay_online]", e);
      await editOrSend(chatId, messageId,
        `⚠️ <b>Не удалось создать ссылку на оплату</b>\n\nПопробуйте позже или оплатите вручную:\n<code>89892860863</code> · Альфа Банк · Игорь К.`,
        { reply_markup: { inline_keyboard: [[{ text: "« Назад", callback_data: "my_unpaid" }]] } }
      );
    }
    return;
  }

  // ─── Check payment status (manual polling after paying) ──────────────────

  if (data.startsWith("check_payment_")) {
    const txId = parseInt(data.replace("check_payment_", ""));

    const txRows = await db.select().from(transactionsTable).where(
      and(eq(transactionsTable.id, txId), eq(transactionsTable.masterId, master.id))
    );
    const tx = txRows[0];
    if (!tx) {
      await editOrSend(chatId, messageId, "⚠️ Транзакция не найдена.", { reply_markup: { inline_keyboard: [[{ text: "« Назад", callback_data: "my_unpaid" }]] } });
      return;
    }

    if (tx.paymentStatus === "paid") {
      await editOrSend(chatId, messageId,
        `✅ <b>Оплата уже подтверждена!</b>\n\nКомиссия по заказу #${tx.orderId} оплачена. Спасибо!`,
        { reply_markup: { inline_keyboard: [[{ text: "« В меню", callback_data: "main_menu" }]] } }
      );
      return;
    }

    // Poll Yandex Pay API
    const isPaid = await pollYandexPayStatus(txId);

    if (isPaid) {
      const result = await confirmPayment(txId);
      if (result === "confirmed") {
        const newDebt = Math.max(0, Number(master.debt) - Number(tx.commission));
        await editOrSend(chatId, messageId,
          `✅ <b>Оплата подтверждена!</b>\n\nКомиссия по заказу #${tx.orderId} в размере <b>${Number(tx.commission).toLocaleString("ru-RU")} ₽</b> оплачена. Спасибо!\n\n` +
          (newDebt > 0 ? `Оставшийся долг: <b>${newDebt.toLocaleString("ru-RU")} ₽</b>` : `Все задолженности погашены 🎉`),
          { reply_markup: { inline_keyboard: [[{ text: "« В меню", callback_data: "main_menu" }]] } }
        );
      } else {
        await editOrSend(chatId, messageId,
          `✅ <b>Оплата уже была подтверждена ранее.</b>`,
          { reply_markup: { inline_keyboard: [[{ text: "« В меню", callback_data: "main_menu" }]] } }
        );
      }
    } else {
      // Payment not confirmed yet — show retry button
      await editOrSend(chatId, messageId,
        `⏳ <b>Оплата ещё не подтверждена.</b>\n\nЕсли вы уже оплатили, подождите пару секунд и нажмите снова.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔄 Проверить ещё раз", callback_data: `check_payment_${txId}` }],
              [{ text: "« Назад", callback_data: "my_unpaid" }],
            ],
          },
        }
      );
    }
    return;
  }

  if (data === "my_profile") {
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
    await editMessage(chatId, messageId,
      `🔧 <b>Изменить специальности</b>\n\nОтметьте все виды работ, которые вы выполняете:`,
      buildSpecKeyboard(currentSpecs)
    );
    return;
  }

  if (data === "edit_photo") {
    pendingState.set(chatId, { step: "edit_profile_photo", masterId: master.id });
    await editMessage(chatId, messageId,
      `🤳 <b>Изменить фото профиля</b>\n\nОтправьте новое фото следующим сообщением.\nОно будет отображаться в CRM рядом с вашим именем.`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_profile_edit" }]] } }
    );
    return;
  }

  if (data === "edit_alias") {
    pendingState.set(chatId, { step: "edit_profile_alias", masterId: master.id });
    await editMessage(chatId, messageId,
      `✏️ <b>Изменить имя</b>\n\nТекущее имя: <b>${master.alias}</b>\n\nВведите новое имя или псевдоним:`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_profile_edit" }]] } }
    );
    return;
  }

  if (data === "edit_city") {
    pendingState.set(chatId, { step: "edit_profile_city", masterId: master.id });
    await editMessage(chatId, messageId,
      `🏙️ <b>Изменить город</b>\n\nТекущий город: <b>${master.city}</b>\n\nВведите новый город:`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_profile_edit" }]] } }
    );
    return;
  }

  if (data === "edit_phone") {
    pendingState.set(chatId, { step: "edit_profile_phone", masterId: master.id });
    await editMessage(chatId, messageId,
      `📱 <b>Изменить телефон</b>\n\nТекущий телефон: <b>${master.phone ?? "не указан"}</b>\n\nВведите новый номер телефона:\n<i>Пример: +79001234567</i>`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_profile_edit" }]] } }
    );
    return;
  }

  if (data === "cancel_profile_edit") {
    pendingState.delete(chatId);
    await showProfile(chatId, master, messageId);
    return;
  }

  // ─── Operator message callbacks ────────────────────────────────────────────

  if (data === "message_operator") {
    pendingState.set(chatId, { step: "awaiting_message", masterId: master.id });
    await editMessage(chatId, messageId,
      `✉️ <b>Написать оператору</b>\n\nНапишите ваш вопрос или сообщение следующим сообщением.\nОператор ответит вам в этом чате.`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_message" }]] } }
    );
    return;
  }

  if (data === "cancel_message") {
    pendingState.delete(chatId);
    await editMessage(chatId, messageId,
      `✅ <b>${master.alias}</b> — главное меню`,
      mainMenuKeyboard()
    );
    return;
  }

  if (data === "send_payment_proof") {
    pendingState.set(chatId, { step: "awaiting_payment_proof", masterId: master.id });
    await sendMessage(chatId,
      `📸 <b>Отправьте скриншот оплаты</b>\n\nПришлите фото чека или скриншот перевода — оператор проверит и подтвердит оплату.`,
      { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_payment_proof" }]] } }
    );
    return;
  }

  if (data === "cancel_payment_proof") {
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

    // Check specialty match
    const takeSpecs: string[] = (master.specializations ?? []).map((s: string) => s.toLowerCase().trim());
    if (takeSpecs.length > 0) {
      const orderTypes = (order.serviceType ?? "").split(/,\s*/).map((t: string) => t.toLowerCase().trim());
      const hasMatch = orderTypes.some((t: string) => takeSpecs.includes(t));
      if (!hasMatch) {
        await sendMessage(chatId, `⛔ <b>Не подходит по специальности</b>\n\nЗаказ требует: <b>${order.serviceType}</b>\nВаши специальности не совпадают.\n\nОбновите специальности в профиле, если вы умеете выполнять эту работу.`);
        return;
      }
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
    const senderName = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Мастер";
    const now = new Date();

    // Fetch chat record and master in parallel
    const [existing, masterRows] = await Promise.all([
      db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, chatId)),
      db.select().from(mastersTable).where(eq(mastersTable.telegramId, String(from.id))),
    ]);
    const master = masterRows[0];

    // Upsert chat record and save message in parallel (fire-and-forget for speed)
    const chatOps: Promise<any>[] = [];
    if (!existing[0]) {
      chatOps.push(db.insert(telegramChatsTable).values({
        telegramChatId: chatId,
        username: from.username ?? null,
        firstName: from.first_name ?? null,
        lastName: from.last_name ?? null,
        stage: "new",
        lastMessage: text,
        lastMessageAt: now,
        unreadCount: 1,
      }));
    } else {
      chatOps.push(db.update(telegramChatsTable).set({
        lastMessage: text,
        lastMessageAt: now,
        unreadCount: (existing[0].unreadCount || 0) + 1,
        updatedAt: now,
      }).where(eq(telegramChatsTable.telegramChatId, chatId)));
    }
    if (text) {
      chatOps.push(db.insert(telegramMessagesTable).values({
        chatId,
        telegramMessageId: message.message_id,
        text,
        fromBot: false,
        senderName,
      }));
    }
    // Run DB writes without blocking command handling
    Promise.all(chatOps).catch(e => console.error("[msg-db]", e));

    // Handle commands
    if (text === "/start" || text.startsWith("/start ")) {
      await handleStart(from, chatId);
      return;
    }

    const notRegistered = () => sendMessage(chatId, "⛔ Вы не зарегистрированы. Отправьте /start для регистрации.");

    if (text === "/orders") {
      if (!master) { await notRegistered(); return; }
      await showAvailableOrders(chatId, master);
      return;
    }

    if (text === "/myorders") {
      if (!master) { await notRegistered(); return; }
      await showMyOrders(chatId, master);
      return;
    }

    if (text === "/profile") {
      if (!master) { await notRegistered(); return; }
      await showProfile(chatId, master);
      return;
    }

    if (text === "/menu") {
      if (!master) { await notRegistered(); return; }
      await sendMessage(chatId, `✅ <b>${master.alias}</b> — главное меню`, mainMenuKeyboard());
      return;
    }

    // Handle shared contact (phone number)
    const contact = (update.message as any)?.contact;
    if (contact && contact.phone_number) {
      if (master) {
        await db.update(mastersTable).set({ phone: contact.phone_number }).where(eq(mastersTable.id, master.id));
        pendingState.delete(chatId);
        await tgRequest("sendMessage", {
          chat_id: chatId,
          text: `📱 Телефон <b>${contact.phone_number}</b> сохранён.`,
          parse_mode: "HTML",
          reply_markup: { remove_keyboard: true },
        });
        await askPhoto(chatId, master.id);
      }
      return;
    }

    // Check pending state
    const state = pendingState.get(chatId);

    // ── Profile edit: photo ───────────────────────────────────────────────────
    if (state?.step === "edit_profile_photo") {
      const photoArr = (update.message as any)?.photo as { file_id: string }[] | undefined;
      if (!photoArr || photoArr.length === 0) {
        await sendMessage(chatId, `📸 Нужно отправить именно фотографию. Попробуйте ещё раз или нажмите «Отмена».`,
          { reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_profile_edit" }]] } });
        return;
      }
      const fileId = photoArr[photoArr.length - 1].file_id;
      const newAvatarUrl = `/api/tg-file/${fileId}`;
      await db.update(mastersTable).set({ customAvatarUrl: newAvatarUrl }).where(eq(mastersTable.id, state.masterId));
      const tgEx = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, chatId));
      if (tgEx[0]) await db.update(telegramChatsTable).set({ avatarUrl: newAvatarUrl }).where(eq(telegramChatsTable.telegramChatId, chatId));
      pendingState.delete(chatId);
      const freshMaster = (await db.select().from(mastersTable).where(eq(mastersTable.id, state.masterId)))[0];
      await sendMessage(chatId, `✅ Фото профиля обновлено!`);
      await showProfile(chatId, freshMaster);
      return;
    }

    // ── Profile edit: alias ───────────────────────────────────────────────────
    if (state?.step === "edit_profile_alias" && text) {
      const alias = text.slice(0, 80).trim();
      await db.update(mastersTable).set({ alias }).where(eq(mastersTable.id, state.masterId));
      pendingState.delete(chatId);
      const freshMaster = (await db.select().from(mastersTable).where(eq(mastersTable.id, state.masterId)))[0];
      await sendMessage(chatId, `✅ Имя изменено на <b>${alias}</b>`);
      await showProfile(chatId, freshMaster);
      return;
    }

    // ── Profile edit: city ────────────────────────────────────────────────────
    if (state?.step === "edit_profile_city" && text) {
      const city = text.slice(0, 100).trim();
      await db.update(mastersTable).set({ city }).where(eq(mastersTable.id, state.masterId));
      pendingState.delete(chatId);
      const freshMaster = (await db.select().from(mastersTable).where(eq(mastersTable.id, state.masterId)))[0];
      await sendMessage(chatId, `✅ Город изменён на <b>${city}</b>`);
      await showProfile(chatId, freshMaster);
      return;
    }

    // ── Profile edit: phone ───────────────────────────────────────────────────
    if (state?.step === "edit_profile_phone" && text) {
      const phone = text.trim();
      await db.update(mastersTable).set({ phone }).where(eq(mastersTable.id, state.masterId));
      pendingState.delete(chatId);
      const freshMaster = (await db.select().from(mastersTable).where(eq(mastersTable.id, state.masterId)))[0];
      await sendMessage(chatId, `✅ Телефон изменён на <b>${phone}</b>`);
      await showProfile(chatId, freshMaster);
      return;
    }

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
      const photoUrl = fileId ? `/api/tg-file/${fileId}` : null;

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
        const photoUrl = fileId ? `/api/tg-file/${fileId}` : null;

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

      // Text received instead of photo — prompt again with clear instructions
      await sendMessage(chatId,
        `📸 <b>Нужно отправить фотографию, а не текст.</b>\n\n` +
        `Как это сделать:\n` +
        `1️⃣ Нажмите на скрепку 📎 рядом с полем ввода\n` +
        `2️⃣ Выберите <b>«Фото или видео»</b>\n` +
        `3️⃣ Выберите фото из галереи и нажмите «Отправить»\n\n` +
        `<i>Без фото регистрация не завершится — этот шаг обязателен.</i>`
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
          if (fileId) photoUrl = `/api/tg-file/${fileId}`;
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

    // If master has incomplete registration — resume it automatically
    if (master) {
      const regIncomplete = !master.city || master.city === "Не указан"
        || !master.specializations || master.specializations.length === 0
        || !master.phone
        || (master.status !== "pending_contract" && master.status !== "active" && master.status !== "suspended");
      if (regIncomplete) {
        await resumeRegistration(chatId, master);
        return;
      }
    }

    // For non-command messages from registered masters:
    // if a conversation already exists (operator wrote first), treat as a free reply
    const masterFallback = master;
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
          if (fileId) photoUrl2 = `/api/tg-file/${fileId}`;
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

  const orderServiceTypes = (order.serviceType ?? "").split(/,\s*/).map((t: string) => t.toLowerCase().trim());

  const mastersWithTelegram = masters.filter(m => {
    if (!m.telegramId) return false;
    const specs: string[] = (m.specializations ?? []).map((s: string) => s.toLowerCase().trim());
    // If master has no specializations set, notify them anyway (legacy accounts)
    if (specs.length === 0) return true;
    return orderServiceTypes.some((t: string) => specs.includes(t));
  });
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
